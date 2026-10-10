import { describe, expect, it } from "vitest";
import { customerTemplates, ownerTemplates, type BookingView } from "../../server/notifications/templates";
import { buildIcs } from "../../server/notifications/ics";
import { escapeHtml } from "../../server/lib/html";
import { redact } from "../../server/lib/logger";
import { decryptSecret, encryptSecret } from "../../server/lib/crypto";
import { eventIdForBooking } from "../../server/integrations/google-calendar/types";

const view: BookingView = {
  id: "1b4e28ba-2fa1-11d2-883f-0016d3cca427",
  reference: "AC-TEST12",
  locale: "en",
  serviceId: "standard",
  property: { bedrooms: 2, bathrooms: 1 },
  firstName: "<script>alert(1)</script>",
  lastName: "O'Brien",
  email: "a@example.test",
  phone: "+12405550134",
  address: '1 "Main" St <b>',
  postalCode: "20001",
  notes: "<img src=x onerror=alert(1)>",
  start: new Date("2026-10-14T12:00:00Z"),
  end: new Date("2026-10-14T15:00:00Z"),
  timezone: "America/New_York",
  durationMinutes: 180,
  estimateCents: 12000,
  pricesApproved: false,
};

describe("email templates", () => {
  it("escapes all customer-provided values in HTML", () => {
    const owner = ownerTemplates.bookingRequest(view, "https://example.test/action#t=abc", null);
    expect(owner.html).not.toContain("<script>");
    expect(owner.html).not.toContain("<img src=x");
    expect(owner.html).toContain("&lt;script&gt;");
    const customer = customerTemplates.requestReceived(view, "https://example.test/booking/manage#t=x", null);
    expect(customer.html).not.toContain("<script>");
    expect(customer.html).toContain("&quot;Main&quot;");
  });

  it("says pending, not confirmed, on the request receipt", () => {
    const mail = customerTemplates.requestReceived({ ...view, firstName: "Ana" }, "https://x/m", null);
    expect(mail.subject).toMatch(/received/i);
    expect(mail.text).toMatch(/not confirmed yet/i);
    expect(mail.text).not.toMatch(/\$120/); // unapproved price list is not published
  });

  it("uses the customer's locale", () => {
    const mail = customerTemplates.confirmed({ ...view, locale: "es", firstName: "Ana" }, "https://x/m");
    expect(mail.subject).toMatch(/^Confirmada/);
    expect(mail.html).toContain('lang="es"');
    expect(mail.text).toContain("Hola Ana");
  });

  it("includes a plain-text alternative", () => {
    const mail = customerTemplates.reminder({ ...view, firstName: "Ana", address: "1 Main St" }, "https://x/m");
    expect(mail.text.length).toBeGreaterThan(50);
    expect(mail.text).not.toMatch(/<\/?(p|table|td|a|div)\b/);
    expect(mail.text).not.toMatch(/\n{3,}/);
  });
});

describe("ICS", () => {
  it("uses the service interval, a stable UID, and the booking version as SEQUENCE", () => {
    const ics = buildIcs({ bookingId: view.id, sequence: 3, start: view.start, end: view.end, summary: "Clean, home; test", description: "x", location: "1 Main St, DC", now: new Date("2026-10-01T00:00:00Z") });
    expect(ics).toContain("DTSTART:20261014T120000Z");
    expect(ics).toContain("DTEND:20261014T150000Z");
    expect(ics).toContain(`UID:${view.id}@ascencio-cleaning-services`);
    expect(ics).toContain("SEQUENCE:3");
    expect(ics).toContain("SUMMARY:Clean\\, home\\; test");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });
});

describe("security helpers", () => {
  it("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });

  it("redacts sensitive keys in log metadata", () => {
    expect(redact({ email: "a@b.c", nested: { refreshToken: "x", ok: 1 } })).toEqual({ email: "[redacted]", nested: { refreshToken: "[redacted]", ok: 1 } });
  });

  it("round-trips encrypted refresh tokens and rejects tampering", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const sealed = encryptSecret("1//refresh-token", key);
    expect(sealed).not.toContain("refresh");
    expect(decryptSecret(sealed, key)).toBe("1//refresh-token");
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it("derives a valid deterministic Google event ID", () => {
    const id = eventIdForBooking(view.id);
    expect(id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(eventIdForBooking(view.id)).toBe(id);
  });
});
