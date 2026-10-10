// Minimal RFC 5545 calendar file for customer "add to calendar". Uses the service interval only
// (no buffers). The UID is stable per booking and SEQUENCE follows the booking version, so
// calendar apps update the same entry after a reschedule or cancellation.

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds content lines at 75 octets as required by RFC 5545. */
function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, "utf8");
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + len > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += ch;
    currentBytes += len;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(params: {
  bookingId: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description: string;
  location: string;
  cancelled?: boolean;
  now?: Date;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ascencio Cleaning Services//Booking//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${params.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${params.bookingId}@ascencio-cleaning-services`,
    `SEQUENCE:${params.sequence}`,
    `DTSTAMP:${formatUtc(params.now ?? new Date())}`,
    `DTSTART:${formatUtc(params.start)}`,
    `DTEND:${formatUtc(params.end)}`,
    `SUMMARY:${escapeText(params.summary)}`,
    `DESCRIPTION:${escapeText(params.description)}`,
    `LOCATION:${escapeText(params.location)}`,
    `STATUS:${params.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
