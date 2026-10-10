import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AvailabilityResponse, BookingReceipt, EstimateResponse } from "@shared/api";
import { getService } from "@shared/domain";
import { Button } from "@/components/ui/button";
import { LiveRegion } from "@/components/forms/field";
import { useLocale, useMessages } from "@/i18n";
import { commonMessages } from "@/i18n/common";
import { api, ApiError } from "@/lib/api";
import { track } from "@/lib/analytics";
import { usePageMeta } from "@/lib/seo";
import { formatLocalDate, formatTime, propertyLabel, timeZoneLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { bookingMessages } from "./messages";
import { STEP_ORDER, useBookingDraft, type Step } from "./draft";
import { TimePicker } from "./time-picker";
import { ServiceStep } from "./service-step";
import { DetailsStep, validateContact } from "./details-step";
import { BookingSummary } from "./booking-summary";
import { FallbackContact } from "./fallback-contact";
import { Receipt } from "./receipt";

export default function BookingPage() {
  const { locale } = useLocale();
  const t = useMessages(bookingMessages);
  const common = useMessages(commonMessages);
  usePageMeta({ title: t.meta.title, description: t.meta.description, path: "/booking" });
  const queryClient = useQueryClient();
  const { draft, update, reset } = useBookingDraft();
  const [step, setStepState] = useState<Step>("service");
  const [receipt, setReceipt] = useState<BookingReceipt | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [timezone, setTimezone] = useState("America/New_York");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const viewedAvailability = useRef(false);

  // --- Step navigation with browser history support ------------------------------------------
  const setStep = useCallback((next: Step, opts: { push?: boolean } = { push: true }) => {
    setStepState(next);
    if (opts.push && typeof window !== "undefined" && next !== "done") {
      window.history.pushState({ bookingStep: next }, "");
    }
    requestAnimationFrame(() => headingRef.current?.focus());
  }, []);

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), bookingStep: "service" }, "");
    const onPop = (e: PopStateEvent) => {
      const target = e.state?.bookingStep as Step | undefined;
      if (target && STEP_ORDER.includes(target)) {
        setStepState(target);
        requestAnimationFrame(() => headingRef.current?.focus());
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // --- Authoritative estimate ------------------------------------------------------------------
  const estimateQuery = useQuery({
    queryKey: ["estimate", draft.serviceId, draft.bedrooms, draft.bathrooms],
    queryFn: () => api<EstimateResponse>("/api/booking-estimates", { body: { serviceId: draft.serviceId, property: { bedrooms: draft.bedrooms, bathrooms: draft.bathrooms } } }),
    enabled: !!draft.serviceId,
    staleTime: 5 * 60_000,
  });
  const estimate = draft.serviceId ? estimateQuery.data : undefined;

  useEffect(() => {
    if (draft.serviceId) track("service_selected", { locale, serviceId: draft.serviceId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.serviceId]);

  // Guard deep links / back navigation into later steps without the required inputs.
  useEffect(() => {
    if (step === "time" && (!draft.serviceId || !/^\d{5}$/.test(draft.postalCode.trim()))) setStepState("service");
    if ((step === "details" || step === "review") && !draft.selection) setStepState(draft.serviceId ? "time" : "service");
  }, [step, draft.serviceId, draft.postalCode, draft.selection]);

  const postal = draft.postalCode.trim();
  const availabilityKey = ["booking", draft.serviceId, draft.bedrooms, draft.bathrooms, postal];
  const fetchAvailability = useCallback(
    async (from: string, to: string) => {
      const params = new URLSearchParams({
        serviceId: draft.serviceId ?? "", bedrooms: String(draft.bedrooms), bathrooms: String(draft.bathrooms), postalCode: postal, from, to,
      });
      const res = await api<AvailabilityResponse>(`/api/availability?${params}`);
      setTimezone(res.timezone);
      if (res.status === "ok" && !viewedAvailability.current) {
        viewedAvailability.current = true;
        track("availability_viewed", { locale, serviceId: draft.serviceId ?? undefined });
      }
      return res;
    },
    [draft.serviceId, draft.bedrooms, draft.bathrooms, postal, locale],
  );

  const onAvailabilityStatus = (res: AvailabilityResponse) => {
    const map: Record<string, string> = {
      not_covered: t.time.notCovered,
      quote_required: t.time.quoteRequired,
      calendar_unavailable: t.time.calendarUnavailable,
      booking_disabled: t.time.bookingDisabled,
    };
    setFallbackReason(map[res.status] ?? t.time.calendarUnavailable);
  };

  useEffect(() => setFallbackReason(null), [draft.serviceId, draft.bedrooms, draft.bathrooms, postal]);

  // --- Submission ------------------------------------------------------------------------------
  const submit = async () => {
    if (!draft.selection || !draft.serviceId) return;
    const contactErrors = validateContact(draft, common.errors, t.details.policyError);
    if (Object.keys(contactErrors).length) {
      setServerFieldErrors(contactErrors);
      setStep("details");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await api<BookingReceipt>("/api/bookings", {
        body: {
          idempotencyKey: draft.idempotencyKey,
          locale,
          serviceId: draft.serviceId,
          property: { bedrooms: draft.bedrooms, bathrooms: draft.bathrooms },
          postalCode: postal,
          start: draft.selection.slot.start,
          firstName: draft.contact.firstName,
          lastName: draft.contact.lastName,
          email: draft.contact.email,
          phone: draft.contact.phone,
          address: draft.contact.address,
          notes: draft.contact.notes || undefined,
          policyAccepted: true,
        },
      });
      track("request_submitted", { locale, serviceId: draft.serviceId });
      setReceipt(result);
      reset();
      setStepState("done");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "slot_unavailable" || error.code === "idempotency_conflict") {
          update({ selection: null });
          await queryClient.invalidateQueries({ queryKey: ["booking"] });
          setNotice(t.time.stale);
          setStep("time");
        } else if (error.code === "validation_error" && error.fields) {
          const mapped: Record<string, string> = {};
          for (const [k, code] of Object.entries(error.fields)) mapped[k] = (common.errors as Record<string, string>)[code] ?? common.errors.required;
          setServerFieldErrors(mapped);
          setStep("details");
        } else if (error.code === "calendar_unavailable" || error.code === "booking_disabled") {
          setSubmitError(t.review.unavailable);
          setFallbackReason(t.time.calendarUnavailable);
        } else if (error.code === "not_covered") {
          setFallbackReason(t.time.notCovered);
          setStep("time");
        } else if (error.code === "rate_limited") {
          setSubmitError(common.errors.rateLimited);
        } else if (error.isNetwork) {
          setSubmitError(t.review.networkError);
        } else {
          setSubmitError(common.errors.generic);
        }
      } else {
        setSubmitError(common.errors.generic);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // --- Render ----------------------------------------------------------------------------------
  if (step === "done" && receipt) {
    return (
      <div className="container-page py-12 sm:py-16">
        <h1 className="sr-only">{t.heading}</h1>
        <Receipt receipt={receipt} onAnother={() => { setReceipt(null); setStep("service"); }} />
      </div>
    );
  }

  const stepIndex = Math.max(0, STEP_ORDER.indexOf(step));
  const stepTitles: Record<Step, string> = {
    service: t.service.heading, time: t.time.heading, details: t.details.heading, review: t.review.heading, done: t.receipt.heading,
  };
  const service = draft.serviceId ? getService(draft.serviceId) : undefined;

  return (
    <div className="container-page py-10 sm:py-14">
      <header className="max-w-3xl">
        <h1 className="text-display-lg">{t.heading}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t.intro}</p>
      </header>

      <nav aria-label={t.progressLabel} className="mt-8">
        <p className="mb-2 text-sm font-semibold text-muted-foreground">{t.stepOf(stepIndex + 1, STEP_ORDER.length)}</p>
        <ol className="grid grid-cols-4 gap-2">
          {STEP_ORDER.map((s, i) => (
            <li key={s} aria-current={s === step ? "step" : undefined} className="flex flex-col gap-1.5">
              <span aria-hidden="true" className={cn("h-1.5 rounded-full", i <= stepIndex ? "bg-primary" : "bg-border")} />
              <span className={cn("text-xs sm:text-sm", s === step ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {t.steps[s as keyof typeof t.steps]}
                {i < stepIndex && <span className="sr-only"> ✓</span>}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <div className="lg:hidden">
            <BookingSummary variant="mobile" draft={draft} estimate={estimate} timezone={timezone} />
          </div>
          <h2 ref={headingRef} tabIndex={-1} className="text-display-md focus:outline-none">{stepTitles[step]}</h2>

          {notice && (
            <LiveRegion assertive className="rounded-lg border border-warning/40 bg-warning-soft p-3 font-medium text-warning">
              {notice}
            </LiveRegion>
          )}

          {step === "service" && (
            <ServiceStep
              draft={draft}
              update={update}
              estimate={estimate}
              estimateLoading={estimateQuery.isFetching}
              postalError={null}
              onContinue={() => { setNotice(null); setStep("time"); }}
            />
          )}

          {step === "time" && draft.serviceId && (
            <div className="space-y-6">
              {fallbackReason ? (
                <FallbackContact reason={fallbackReason} contact={draft.contact} serviceId={draft.serviceId} postalCode={postal} />
              ) : (
                <TimePicker
                  queryKey={availabilityKey}
                  fetchAvailability={fetchAvailability}
                  selected={draft.selection}
                  onSelect={(selection) => { update({ selection }); if (selection) setNotice(null); }}
                  onStatus={onAvailabilityStatus}
                  onStale={() => setNotice(t.time.stale)}
                />
              )}
              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" onClick={() => setStep("service")}>{t.back}</Button>
                {!fallbackReason && (
                  <Button size="lg" disabled={!draft.selection} onClick={() => setStep("details")}>{t.continue}</Button>
                )}
              </div>
            </div>
          )}

          {step === "details" && (
            <DetailsStep
              key={JSON.stringify(serverFieldErrors)}
              draft={draft}
              update={update}
              serverErrors={serverFieldErrors}
              onBack={() => setStep("time")}
              onContinue={() => { setServerFieldErrors({}); setStep("review"); }}
            />
          )}

          {step === "review" && draft.selection && service && (
            <div className="space-y-6">
              <div className="divide-y divide-border rounded-xl border border-border bg-surface">
                <ReviewRow label={t.summary.service} onEdit={() => setStep("service")} editLabel={`${t.edit}: ${t.summary.service}`}>
                  <p className="font-semibold">{service.name[locale]}</p>
                  <p className="text-sm text-muted-foreground">{propertyLabel(draft, locale)} · {postal}</p>
                </ReviewRow>
                <ReviewRow label={t.steps.time} onEdit={() => setStep("time")} editLabel={`${t.edit}: ${t.steps.time}`}>
                  <p className="font-semibold">{formatLocalDate(draft.selection.date, locale)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatTime(draft.selection.slot.start, timezone, locale)}–{formatTime(draft.selection.slot.end, timezone, locale)} ({timeZoneLabel(timezone, locale)})
                  </p>
                </ReviewRow>
                <ReviewRow label={t.review.contactHeading} onEdit={() => setStep("details")} editLabel={`${t.edit}: ${t.review.contactHeading}`}>
                  <p className="font-semibold">{draft.contact.firstName} {draft.contact.lastName}</p>
                  <p className="text-sm text-muted-foreground break-words">{draft.contact.email} · {draft.contact.phone}</p>
                  <p className="text-sm text-muted-foreground break-words">{draft.contact.address}</p>
                  {draft.contact.notes && <p className="mt-1 text-sm break-words">{draft.contact.notes}</p>}
                </ReviewRow>
              </div>
              <p className="rounded-lg bg-primary-soft p-4">{t.review.approvalNote}</p>
              {submitError && (
                <LiveRegion assertive className="rounded-lg bg-destructive-soft p-3 font-medium text-destructive">{submitError}</LiveRegion>
              )}
              {fallbackReason && submitError && (
                <FallbackContact reason={fallbackReason} contact={draft.contact} serviceId={draft.serviceId} postalCode={postal} />
              )}
              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" onClick={() => setStep("details")}>{t.back}</Button>
                <Button size="lg" onClick={submit} disabled={submitting} aria-disabled={submitting}>
                  {submitting ? t.review.submitting : t.review.submit}
                </Button>
              </div>
              <LiveRegion className="sr-only">{submitting ? t.review.submitting : ""}</LiveRegion>
            </div>
          )}
        </div>

        <div className="hidden lg:block">
          <BookingSummary variant="desktop" draft={draft} estimate={estimate} timezone={timezone} />
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, children, onEdit, editLabel }: { label: string; children: React.ReactNode; onEdit: () => void; editLabel: string }) {
  const t = useMessages(bookingMessages);
  return (
    <div className="flex items-start justify-between gap-4 p-4 sm:p-5">
      <div className="min-w-0">
        <h3 className="mb-1 font-sans text-sm font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
        {children}
      </div>
      <Button variant="link" size="sm" onClick={onEdit} aria-label={editLabel}>{t.edit}</Button>
    </div>
  );
}
