// Sends one test message through the configured transport: npm run mail:test -- you@example.com
import { loadConfig } from "../config";
import { createMailer } from "../notifications/mailer";
import { createLogger } from "../lib/logger";

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npm run mail:test -- <recipient>");
    process.exit(1);
  }
  const config = loadConfig();
  const mailer = createMailer(config, createLogger());
  await mailer.send({
    to,
    subject: "Ascencio booking system: test email",
    text: "If you received this, outgoing mail is configured correctly.",
    html: "<p>If you received this, outgoing mail is configured correctly.</p>",
    attachments: [],
    messageKey: `test:${Date.now()}`,
  });
  console.log(`Sent via ${mailer.kind} transport.`);
}

main().catch((error) => {
  console.error("Send failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
