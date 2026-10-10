import { sql } from "drizzle-orm";
import { outbox, type MailAttachment, type SendCondition } from "../db/schema";
import type { Executor } from "../db";

export interface EnqueueMail {
  messageKey: string;
  bookingId?: string | null;
  type: string;
  recipient: string;
  locale: string;
  subject: string;
  html: string;
  text: string;
  attachments?: MailAttachment[];
  /** Rechecked at dispatch; the message is suppressed if the booking moved on. */
  sendCondition?: SendCondition | null;
  sendAt?: Date;
}

/**
 * Adds a message to the outbox inside the caller's transaction, so mail is committed together
 * with the lifecycle change that caused it. Duplicate message keys are ignored.
 */
export async function enqueueMail(db: Executor, mail: EnqueueMail): Promise<void> {
  await db
    .insert(outbox)
    .values({
      messageKey: mail.messageKey,
      bookingId: mail.bookingId ?? null,
      type: mail.type,
      recipient: mail.recipient,
      locale: mail.locale,
      subject: mail.subject,
      html: mail.html,
      textBody: mail.text,
      attachments: mail.attachments ?? [],
      sendCondition: mail.sendCondition ?? null,
      nextAttemptAt: mail.sendAt ?? sql`now()`,
    })
    .onConflictDoNothing({ target: outbox.messageKey });
}

export function messageKey(parts: { bookingId?: string | null; version?: number | null; type: string; recipient: string }) {
  return [parts.bookingId ?? "none", parts.version ?? 0, parts.type, parts.recipient.toLowerCase()].join(":");
}
