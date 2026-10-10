import nodemailer from "nodemailer";
import type { AppConfig } from "../config";
import type { MailAttachment } from "../db/schema";
import type { Logger } from "../lib/logger";

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
  attachments: MailAttachment[];
  messageKey: string;
}

export interface Mailer {
  readonly kind: "smtp" | "log";
  send(mail: OutgoingMail): Promise<{ messageId: string }>;
}

/** SMTP adapter (Gmail by default). Acceptance by SMTP does not prove inbox delivery. */
export class SmtpMailer implements Mailer {
  readonly kind = "smtp" as const;
  private transporter: nodemailer.Transporter;

  constructor(private config: AppConfig["mail"]) {
    if (!config.user || !config.password) {
      throw new Error("SMTP_USER and SMTP_PASSWORD are required when MAIL_TRANSPORT=smtp");
    }
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      connectionTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }

  async send(mail: OutgoingMail) {
    const info = await this.transporter.sendMail({
      from: this.config.from,
      to: mail.to,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      // Lets downstream systems and humans spot duplicates after an ambiguous retry.
      headers: { "X-Ascencio-Message-Key": mail.messageKey },
      attachments: mail.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content })),
    });
    return { messageId: info.messageId };
  }
}

/** Development/test mail sink: records messages in memory and logs only the subject. */
export class LogMailer implements Mailer {
  readonly kind = "log" as const;
  readonly sent: OutgoingMail[] = [];
  /** Test hook: number of upcoming sends that should fail. */
  failNext = 0;

  constructor(private log?: Logger) {}

  async send(mail: OutgoingMail) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("Simulated SMTP failure");
    }
    this.sent.push(mail);
    this.log?.info("mail recorded (log transport)", { subjectLine: mail.subject.slice(0, 60) });
    return { messageId: `log-${this.sent.length}` };
  }
}

export function createMailer(config: AppConfig, log: Logger): Mailer {
  return config.mail.transport === "smtp" ? new SmtpMailer(config.mail) : new LogMailer(log);
}
