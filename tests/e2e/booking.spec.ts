import { expect, test, type Page } from "@playwright/test";
import pg from "pg";

const DB = process.env.E2E_DATABASE_URL ?? "postgres://localhost/ascencio_e2e";

async function latestToken(type: string, kind: "action" | "manage") {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT text_body FROM outbox WHERE type = $1 ORDER BY id DESC LIMIT 1", [type]);
    const pattern = kind === "action" ? /\/action#t=([A-Za-z0-9_-]+)/ : /\/booking\/manage#t=([A-Za-z0-9_-]+)/;
    const match = pattern.exec(rows[0]?.text_body ?? "");
    if (!match) throw new Error(`no ${kind} token for ${type}`);
    return match[1];
  } finally {
    await client.end();
  }
}

async function chooseServiceAndZip(page: Page) {
  await page.getByRole("radio", { name: /Standard home cleaning/ }).check();
  await page.getByLabel("Bedrooms", { exact: true }).selectOption("2");
  await page.getByLabel("ZIP code of the home", { exact: true }).fill("20001");
  await expect(page.getByRole("region", { name: "Your estimate" })).toContainText(/hour/);
  await page.getByRole("button", { name: "Continue" }).click();
}

async function pickFirstSlot(page: Page) {
  await expect(page.getByRole("heading", { name: "Choose a date and time" })).toBeFocused();
  const firstDay = page.locator("button[aria-pressed]").first();
  await expect(firstDay).toBeVisible({ timeout: 15_000 });
  await firstDay.click();
  const firstSlot = page.getByRole("radio").first();
  await firstSlot.check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
}

async function fillDetails(page: Page) {
  await page.getByLabel("First name", { exact: true }).fill("Ana");
  await page.getByLabel("Last name", { exact: true }).fill("López");
  await page.getByLabel("Email", { exact: true }).fill("ana@example.test");
  await page.getByLabel("Phone", { exact: true }).fill("(240) 555-0134");
  await page.getByLabel(/Street address/).fill("123 Main St, Washington, DC");
}

test("customer requests an appointment and the owner confirms it", async ({ page }) => {
  await page.goto("/booking");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Request a cleaning appointment");
  await chooseServiceAndZip(page);
  await pickFirstSlot(page);
  await fillDetails(page);

  // Policy acknowledgement is required.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Please confirm you understand how requests work.")).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("heading", { name: "Review your request" })).toBeVisible();
  await expect(page.getByText(/not confirmed until the owner approves/)).toBeVisible();
  await page.getByRole("button", { name: "Request appointment" }).click();

  await expect(page.getByRole("heading", { name: "Request received" })).toBeVisible();
  await expect(page.getByText("Pending approval")).toBeVisible();
  await expect(page.getByText(/AC-[A-Z0-9]{6}/)).toBeVisible();

  // Customer management link shows pending.
  await page.getByRole("link", { name: "View or manage your request" }).click();
  await expect(page.getByText("Pending approval")).toBeVisible();

  // Owner opens the email link: viewing changes nothing, approving confirms.
  const action = await latestToken("owner.booking_request", "action");
  await page.goto(`/action#t=${action}`);
  await expect(page.getByRole("heading", { name: /Booking request AC-/ })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Approve appointment" }).click();
  await expect(page.getByText(/Approved\. The appointment is on your Google Calendar/)).toBeVisible();

  const manage = await latestToken("customer.confirmed", "manage");
  await page.goto(`/booking/manage#t=${manage}`);
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
});

test("switching language keeps the booking in progress", async ({ page }) => {
  await page.goto("/booking");
  await chooseServiceAndZip(page);
  await expect(page.getByRole("heading", { name: "Choose a date and time" })).toBeVisible();
  await page.getByRole("button", { name: "Cambiar a español" }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { name: "Elija fecha y hora" })).toBeVisible();
  await page.getByRole("button", { name: "Atrás" }).click();
  await expect(page.getByLabel("Código postal de la vivienda", { exact: true })).toHaveValue("20001");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("radio", { name: /Limpieza estándar/ })).toBeChecked();
});

test("an uncovered ZIP code offers a contact request instead of slots", async ({ page }) => {
  await page.goto("/booking");
  await page.getByRole("radio", { name: /Deep cleaning/ }).check();
  await page.getByLabel("ZIP code of the home", { exact: true }).fill("10001");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText(/don't currently serve that ZIP code/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Send a scheduling request" })).toBeVisible();
  await expect(page.locator("button[aria-pressed]")).toHaveCount(0);
});

test("a time taken by someone else is reported as stale", async ({ page, browser }) => {
  await page.goto("/booking");
  await chooseServiceAndZip(page);
  await pickFirstSlot(page);
  await fillDetails(page);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Another visitor books the same first slot first.
  const other = await browser.newPage();
  await other.goto("/booking");
  await chooseServiceAndZip(other);
  await pickFirstSlot(other);
  await fillDetails(other);
  await other.getByLabel("Email", { exact: true }).fill("someone@example.test");
  await other.getByRole("checkbox").check();
  await other.getByRole("button", { name: "Continue" }).click();
  await other.getByRole("button", { name: "Request appointment" }).click();
  await expect(other.getByRole("heading", { name: "Request received" })).toBeVisible();
  await other.close();

  await page.getByRole("button", { name: "Request appointment" }).click();
  await expect(page.getByText("The time you picked is no longer available. Please choose another.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a date and time" })).toBeVisible();
  await expect(page.getByLabel("ZIP code of the home", { exact: true })).toHaveCount(0);
});

test("customer cancels a pending request from the management link", async ({ page }) => {
  await page.goto("/booking");
  await chooseServiceAndZip(page);
  await pickFirstSlot(page);
  await fillDetails(page);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Request appointment" }).click();
  await page.getByRole("link", { name: "View or manage your request" }).click();
  await page.getByRole("button", { name: "Cancel appointment" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Yes, cancel" }).click();
  await expect(page.getByText("Your appointment has been cancelled.")).toBeVisible();
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
});

test("expired or invalid management links explain what to do", async ({ page }) => {
  await page.goto("/booking/manage#t=not-a-valid-token-value-123456");
  await expect(page.getByText(/This link isn't valid/)).toBeVisible();
  await page.goto("/booking/manage");
  await expect(page.getByText(/needs the link from your email/)).toBeVisible();
});
