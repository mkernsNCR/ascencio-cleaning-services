# Ascencio Cleaning Services — website and booking system

## Overview

Bilingual (English/Spanish) marketing site and appointment-request system for Ascencio Cleaning
Services LLC (DC, Maryland, Virginia). Customers choose a service, see real availability, and
request an appointment. The owner approves or declines each request; approval creates a Google
Calendar event and only then confirms the customer. Customers can cancel or reschedule through a
private link. Staff use an authenticated dashboard at `/admin`.

## Architecture

- **Frontend**: React 18, TypeScript, Vite, Tailwind, Radix/shadcn primitives, React Query, Wouter.
  Marketing routes are prerendered to static HTML at build time (`scripts/prerender.ts`) and
  hydrated in the browser. `/booking/manage`, `/action`, and `/admin` are client-only.
- **Backend**: Express + Zod + Drizzle on **PostgreSQL** (via `pg`). All data is durable; nothing is
  kept in process memory except short display caches.
- **Background worker**: durable job queue (`jobs` table) for Calendar operations, expiry, sync,
  and maintenance, plus a transactional mail outbox (`outbox` table). Rows are claimed with
  `FOR UPDATE SKIP LOCKED`, so several processes can run safely.

```
client/src/
  components/layout/   shared header/footer/navigation
  features/marketing/  public pages and sections
  features/booking/    booking steps, time picker, summary, receipt, management page
  features/actions/    owner review screen opened from email links
  features/admin/      staff dashboard
  i18n/                locale provider and shared EN/ES strings
shared/                domain IDs, service catalog, request/response schemas, timezone helpers
server/
  db/                  pool, schema mirror, migration runner
  modules/booking/     estimate, availability, lifecycle commands, calendar orchestration
  modules/settings/    business settings, pricing versions, crews
  integrations/google-calendar/  OAuth, REST gateway, fake gateway, sync/watch
  notifications/       templates, SMTP adapter, outbox, ICS
  jobs/                queue and worker
  http/                Express app, middleware, routes
migrations/            hand-written SQL migrations (source of truth for constraints)
tests/                 Vitest unit + PostgreSQL integration tests
```

## Data and consistency

- Bookings store UTC instants plus the business IANA timezone; business hours are local wall-clock
  rules (default `America/New_York`). DST gaps are skipped and repeated times are labelled.
- Every request (including pending ones) holds a **reservation** for its service time plus the
  trailing travel buffer. A PostgreSQL range exclusion constraint prevents overlapping active
  reservations for the same crew across all processes.
- Lifecycle: `pending_approval → confirmed | rejected | cancelled | expired`, `confirmed → cancelled
  | completed` (enforced by a database trigger as well as in code). Calendar state and mail state are
  tracked separately.
- Prices and durations are computed on the server from the active **pricing version**; client
  values are ignored. Unapproved prices are never shown to customers.
- Email links carry random, hashed, expiring, single-use credentials in the URL fragment. Opening a
  link never changes anything; actions require an explicit POST.

## Database schema management (important)

The schema is defined by the SQL files in `migrations/`, applied automatically on startup. **Never run
`drizzle-kit push`** (or let a tool sync the database from `server/db/schema.ts`): Drizzle cannot
represent the reservation overlap constraint, its generated range column, the booking status trigger,
several foreign keys and indexes, or the `session` and `schema_migrations` tables, so a push silently
drops them. `drizzle.config.ts` refuses `push`/`generate`/`migrate` for this reason.

As a safety net, every startup and the worker's 15-minute maintenance job check these safeguards and
restore any that are missing (logged as "restored missing database safeguards"). If one cannot be
restored (for example, overlapping bookings were created while protection was missing), online
booking pauses and shows the contact form, staff get an alert, and the dashboard Overview lists what
is missing. `npm run db:migrate` runs the same repair and exits non-zero if anything is still missing.

To check a database directly:

```sql
SELECT conname FROM pg_constraint WHERE conname = 'reservations_no_overlap';  -- expect 1 row
SELECT tgname FROM pg_trigger WHERE tgname = 'bookings_transition';           -- expect 1 row
```

## Running locally

```bash
createdb ascencio_dev                        # PostgreSQL 14+ with btree_gist available
cp .env.example .env                         # then export the variables or use your shell's dotenv
DATABASE_URL=postgres://localhost/ascencio_dev npm run dev
DATABASE_URL=postgres://localhost/ascencio_dev npm run staff:create -- owner@example.com "Owner Name"
```

Migrations run automatically on development/test startup (`npm run db:migrate` runs them manually
against development). Production startup does not run SQL migrations: Replit Publish applies the
managed production schema before the server starts. Do not run `db:migrate` against production.
In development
the calendar defaults to an in-memory **fake** and email to the **log** transport — nothing real is
booked or sent. `npm run seed:demo` adds clearly flagged demo reviews (never shown in production).

Tests need a separate database: `createdb ascencio_test && npm test`
(override with `TEST_DATABASE_URL`).

## Production configuration

Required: `DATABASE_URL`, `PUBLIC_BASE_URL` (https), `SESSION_SECRET`, `MAIL_TRANSPORT=smtp` with
`SMTP_USER`/`SMTP_PASSWORD` (Gmail App Password), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`TOKEN_ENCRYPTION_KEY`, and `TRUST_PROXY=true` behind a TLS-terminating proxy. See `.env.example`.

- **Build**: `npm run build` (client, SSR prerender, sitemap/robots, server and worker bundles).
  Set `PUBLIC_BASE_URL` at build time so canonical URLs and the sitemap use the real domain.
- **Start**: `npm run start` (applies migrations, serves the site, runs the worker in-process).
- **Separate worker** (recommended with autoscaling): set `RUN_WORKER=false` on web instances and
  run one or more `npm run worker` processes. At least one worker must always be running or
  confirmations, reminders, and expiries will stall.
- **Google Cloud**: create an OAuth client (web application) with redirect URI
  `${PUBLIC_BASE_URL}/api/admin/google/callback`. Scopes: `calendar.events.freebusy`,
  `calendar.events.owned`, `calendar.calendarlist.readonly` (picker only), `openid`, `email`.
  Confirm consent-screen verification requirements for these scopes before launch. Connect from
  `/admin` → Integrations, then map each crew to a destination calendar and any busy calendars.
- **Push notifications** (optional): `GOOGLE_WEBHOOK_ENABLED=true` with a public https domain.
  Periodic reconciliation (every 15 minutes) recovers missed notifications either way.

## Launch checklist (business decisions)

The dashboard's Overview shows the live status of these items.

1. Approve business settings (hours, holidays, lead time, horizon, buffer, expiry, reminder and
   cancellation/reschedule cutoffs, ZIP coverage, response promise). Defaults are proposals.
2. Approve a pricing version. The seeded version reuses the original site's numbers and is not
   approved, so customers see "price confirmed by our team" until it is.
3. Supply verified photos, credentials, testimonials, logo, and reviewed Spanish copy
   (`client/src/content/site.ts`), and approve the draft privacy and terms pages.
4. Connect Google Calendar and confirm crew calendar mappings.
5. Configure SMTP and send a test with `npm run mail:test -- you@example.com`.

## Cutover from the original site

The original server kept bookings, inquiries, and reviews in process memory, so they cannot be
migrated after a restart. Before switching: export or note any pending requests from the live
instance's owner emails, re-enter them manually (or ask customers to rebook), then deploy. The
old predictable approve/reject GET links now return "no longer valid" and change nothing; resend
fresh links from the dashboard if needed.

## Rollback

Set `BOOKING_ENABLED=false` to stop new interactive requests; availability shows the contact
fallback while existing bookings, the worker, customer management links, and the dashboard keep
working. Never roll back to the in-memory version: it would lose all records. Unresolved calendar
jobs are listed in the dashboard (Attention → Jobs) for staff follow-up.

## User Preferences

Preferred communication style: Simple, everyday language.
