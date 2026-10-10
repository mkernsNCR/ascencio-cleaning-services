import { useCallback, useEffect, useRef, useState } from "react";
import { SERVICE_IDS, type ServiceId } from "@shared/domain";
import type { SelectedSlot } from "./time-picker";

export type Step = "service" | "time" | "details" | "review" | "done";
export const STEP_ORDER: Step[] = ["service", "time", "details", "review"];

export interface ContactDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

export interface BookingDraft {
  serviceId: ServiceId | null;
  bedrooms: number;
  bathrooms: number;
  postalCode: string;
  selection: SelectedSlot | null;
  contact: ContactDetails;
  policyAccepted: boolean;
  /** Reused across retries so a repeated submission returns the original result. */
  idempotencyKey: string;
}

const STORAGE_KEY = "acs.booking-draft.v1";

function newKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

export function emptyDraft(): BookingDraft {
  return {
    serviceId: null,
    bedrooms: 1,
    bathrooms: 1,
    postalCode: "",
    selection: null,
    contact: { firstName: "", lastName: "", email: "", phone: "", address: "", notes: "" },
    policyAccepted: false,
    idempotencyKey: "",
  };
}

/**
 * Booking draft kept in sessionStorage (this tab only) so details survive reloads, language
 * switches, and recoverable errors. Cleared after a successful request.
 */
export function useBookingDraft() {
  const [draft, setDraft] = useState<BookingDraft>(emptyDraft);
  const loaded = useRef(false);

  useEffect(() => {
    let initial = emptyDraft();
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) initial = { ...initial, ...JSON.parse(raw) };
    } catch {
      // ignore corrupt or unavailable storage
    }
    const preset = new URLSearchParams(window.location.search).get("service");
    if (preset && (SERVICE_IDS as readonly string[]).includes(preset) && preset !== initial.serviceId) {
      initial = { ...initial, serviceId: preset as ServiceId, selection: null };
    }
    if (!initial.idempotencyKey) initial.idempotencyKey = newKey();
    setDraft(initial);
    loaded.current = true;
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [draft]);

  const update = useCallback((patch: Partial<BookingDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      // Inputs that change duration or coverage invalidate the chosen time.
      if (
        ("serviceId" in patch && patch.serviceId !== prev.serviceId) ||
        ("bedrooms" in patch && patch.bedrooms !== prev.bedrooms) ||
        ("bathrooms" in patch && patch.bathrooms !== prev.bathrooms) ||
        ("postalCode" in patch && patch.postalCode !== prev.postalCode)
      ) {
        if (!("selection" in patch)) next.selection = null;
      }
      // A changed request must not reuse the previous idempotency key.
      if (next.selection?.slot.start !== prev.selection?.slot.start || JSON.stringify(next.contact) !== JSON.stringify(prev.contact) || next.serviceId !== prev.serviceId || next.bedrooms !== prev.bedrooms || next.bathrooms !== prev.bathrooms || next.postalCode !== prev.postalCode) {
        next.idempotencyKey = newKey();
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setDraft({ ...emptyDraft(), idempotencyKey: newKey() });
  }, []);

  return { draft, update, reset };
}
