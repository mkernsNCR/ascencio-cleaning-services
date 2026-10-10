-- Foundation schema for durable bookings, reservations, integrations, and notifications.
-- Hand-written because range exclusion constraints and CHECKs are not expressible in drizzle-kit.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Staff accounts (replace the unused legacy "users" table).
CREATE TABLE staff_users (
  id            serial PRIMARY KEY,
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  role          text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  disabled_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- connect-pg-simple session store.
CREATE TABLE session (
  sid    varchar NOT NULL PRIMARY KEY,
  sess   json NOT NULL,
  expire timestamp(6) NOT NULL
);
CREATE INDEX session_expire_idx ON session (expire);

-- Single-row business configuration. Values are proposals until "approved_at" is set by the owner.
CREATE TABLE business_settings (
  id          integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings    jsonb NOT NULL,
  version     integer NOT NULL DEFAULT 1,
  approved_at timestamptz,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  integer REFERENCES staff_users (id)
);

-- Versioned pricing/duration rules. Bookings store the version they were estimated with.
CREATE TABLE pricing_versions (
  id          serial PRIMARY KEY,
  label       text NOT NULL,
  rules       jsonb NOT NULL,
  approved_at timestamptz,
  active      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  integer REFERENCES staff_users (id)
);
CREATE UNIQUE INDEX pricing_versions_one_active ON pricing_versions (active) WHERE active;

-- Schedulable crews. Each has its own calendar mapping and reservation constraints.
CREATE TABLE resources (
  id                    serial PRIMARY KEY,
  name                  text NOT NULL,
  active                boolean NOT NULL DEFAULT true,
  sort_order            integer NOT NULL DEFAULT 0,
  destination_calendar  text,
  busy_calendars        text[] NOT NULL DEFAULT '{}',
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id                  uuid PRIMARY KEY,
  reference           text NOT NULL UNIQUE,
  legacy_id           integer UNIQUE,
  locale              text NOT NULL CHECK (locale IN ('en', 'es')),
  service_id          text NOT NULL,
  property            jsonb NOT NULL,
  postal_code         text NOT NULL,
  first_name          text NOT NULL,
  last_name           text NOT NULL,
  email               text NOT NULL,
  phone               text NOT NULL,
  address             text NOT NULL,
  notes               text,
  policy_ack_at       timestamptz NOT NULL,
  marketing_opt_in    boolean NOT NULL DEFAULT false,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  timezone            text NOT NULL,
  duration_minutes    integer NOT NULL CHECK (duration_minutes > 0),
  estimate_cents      integer NOT NULL CHECK (estimate_cents >= 0),
  currency            text NOT NULL DEFAULT 'USD',
  pricing_version_id  integer NOT NULL REFERENCES pricing_versions (id),
  resource_id         integer NOT NULL REFERENCES resources (id),
  status              text NOT NULL DEFAULT 'pending_approval'
                      CHECK (status IN ('pending_approval', 'confirmed', 'rejected', 'cancelled', 'expired', 'completed')),
  version             integer NOT NULL DEFAULT 1,
  calendar_status     text NOT NULL DEFAULT 'not_created'
                      CHECK (calendar_status IN ('not_created', 'creating', 'synced', 'retrying', 'conflict', 'disconnected', 'delete_pending')),
  calendar_id         text,
  calendar_event_id   text,
  pending_change      jsonb,
  decision_reason     text,
  idempotency_key     text NOT NULL UNIQUE,
  request_hash        text NOT NULL,
  expires_at          timestamptz,
  decided_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX bookings_status_start_idx ON bookings (status, start_at);
CREATE UNIQUE INDEX bookings_calendar_event_idx ON bookings (calendar_event_id) WHERE calendar_event_id IS NOT NULL;

-- Buffered reservation intervals. Active rows (released_at IS NULL) of different bookings may never
-- overlap per resource, including across processes. Pending requests reserve too. A booking's own
-- reschedule target may overlap its current reservation until the move is finalized.
CREATE TABLE reservations (
  id             serial PRIMARY KEY,
  booking_id     uuid NOT NULL REFERENCES bookings (id),
  resource_id    integer NOT NULL REFERENCES resources (id),
  kind           text NOT NULL CHECK (kind IN ('booking', 'reschedule_target')),
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  period         tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED,
  released_at    timestamptz,
  release_reason text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CONSTRAINT reservations_no_overlap EXCLUDE USING gist (resource_id WITH =, booking_id WITH <>, period WITH &&) WHERE (released_at IS NULL)
);
CREATE INDEX reservations_booking_idx ON reservations (booking_id);

-- Allowed lifecycle transitions enforced in the database as a backstop to domain rules.
CREATE FUNCTION bookings_enforce_transition() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'pending_approval' AND NEW.status IN ('confirmed', 'rejected', 'cancelled', 'expired'))
    OR (OLD.status = 'confirmed' AND NEW.status IN ('cancelled', 'completed'))
  ) THEN
    RAISE EXCEPTION 'invalid booking transition % -> %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.version < OLD.version THEN
    RAISE EXCEPTION 'booking version cannot decrease' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bookings_transition BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION bookings_enforce_transition();

CREATE TABLE booking_audit (
  id          bigserial PRIMARY KEY,
  booking_id  uuid NOT NULL REFERENCES bookings (id),
  actor       text NOT NULL,
  action      text NOT NULL,
  from_status text,
  to_status   text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_audit_booking_idx ON booking_audit (booking_id, created_at);

-- Random scoped credentials, stored hashed. GET never consumes; POST consumes atomically.
CREATE TABLE action_tokens (
  id              bigserial PRIMARY KEY,
  token_hash      text NOT NULL UNIQUE,
  scope           text NOT NULL CHECK (scope IN ('booking.decide', 'booking.manage', 'review.moderate')),
  subject_id      text NOT NULL,
  subject_version integer,
  expires_at      timestamptz NOT NULL,
  consumed_at     timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX action_tokens_subject_idx ON action_tokens (scope, subject_id);

-- Google OAuth connection. Refresh token encrypted with an externally managed key.
CREATE TABLE calendar_connections (
  id                       integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  account_email            text,
  encrypted_refresh_token  text,
  scopes                   text[] NOT NULL DEFAULT '{}',
  status                   text NOT NULL CHECK (status IN ('connected', 'revoked', 'error', 'disconnected')),
  last_error               text,
  connected_at             timestamptz,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calendar_sync_state (
  calendar_id      text PRIMARY KEY,
  sync_token       text,
  channel_id       text UNIQUE,
  channel_resource text,
  channel_token_hash text,
  channel_expires_at timestamptz,
  last_sync_at     timestamptz,
  last_error       text,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE calendar_discrepancies (
  id          bigserial PRIMARY KEY,
  booking_id  uuid REFERENCES bookings (id),
  kind        text NOT NULL CHECK (kind IN ('event_moved', 'event_deleted', 'event_collision', 'approval_conflict', 'reschedule_conflict', 'unmapped_event')),
  details     jsonb NOT NULL DEFAULT '{}',
  dedupe_key  text UNIQUE,
  resolved_at timestamptz,
  resolved_by integer REFERENCES staff_users (id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Durable background jobs (calendar operations, expiry, sync). Separate from mail.
CREATE TABLE jobs (
  id           bigserial PRIMARY KEY,
  type         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  unique_key   text UNIQUE,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead')),
  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 8,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs (run_at) WHERE status IN ('queued', 'failed');

-- Transactional mail outbox. The unique message key suppresses known duplicates.
CREATE TABLE outbox (
  id              bigserial PRIMARY KEY,
  message_key     text NOT NULL UNIQUE,
  booking_id      uuid REFERENCES bookings (id),
  type            text NOT NULL,
  recipient       text NOT NULL,
  locale          text NOT NULL DEFAULT 'en',
  subject         text NOT NULL,
  html            text NOT NULL,
  text_body       text NOT NULL,
  attachments     jsonb NOT NULL DEFAULT '[]',
  send_condition  jsonb,
  status          text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'failed', 'dead', 'suppressed')),
  attempts        integer NOT NULL DEFAULT 0,
  max_attempts    integer NOT NULL DEFAULT 6,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at       timestamptz,
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_ready_idx ON outbox (next_attempt_at) WHERE status IN ('queued', 'failed');

CREATE TABLE contact_requests (
  id             serial PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('contact', 'commercial_quote', 'booking_fallback')),
  locale         text NOT NULL DEFAULT 'en',
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  email          text NOT NULL,
  phone          text NOT NULL,
  company        text,
  business_type  text,
  square_feet    integer,
  frequency      text,
  contact_window text,
  service_id     text,
  postal_code    text,
  message        text,
  status         text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'handled')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  email        text NOT NULL,
  rating       integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body         text NOT NULL,
  locale       text NOT NULL DEFAULT 'en',
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  is_demo      boolean NOT NULL DEFAULT false,
  moderated_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Anonymous funnel analytics. No names, emails, addresses, notes, or tokens.
CREATE TABLE analytics_events (
  id         bigserial PRIMARY KEY,
  name       text NOT NULL,
  path       text,
  locale     text,
  service_id text,
  source     text,
  medium     text,
  campaign   text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analytics_events_name_idx ON analytics_events (name, created_at);
