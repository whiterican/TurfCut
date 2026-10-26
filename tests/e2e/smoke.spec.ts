import { expect, test } from "@playwright/test";

// Signed-out smoke flows: each page renders, its main path works, and the
// browser console stays free of errors (a hydration error fails the test).
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  (page as unknown as { __errors: string[] }).__errors = errors;
});
test.afterEach(async ({ page }) => {
  // Network failures to the dummy Supabase host are expected offline noise.
  const errors = (page as unknown as { __errors: string[] }).__errors.filter((e) => !/supabase|Failed to load resource/i.test(e));
  expect(errors, "browser console errors").toEqual([]);
});

test("landing page leads to sign-up and log-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("real labor market");
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/signup/);
  await expect(page.getByRole("heading", { name: "Join Turfcut" })).toBeVisible();
  await page.goto("/");
  await page.getByRole("link", { name: "Log in" }).first().click();
  await expect(page).toHaveURL(/\/login/);
});

test("log-in form needs an email before it submits", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  const email = page.getByLabel("Email");
  await page.getByRole("button", { name: "Log in" }).click();
  // The browser's own required-field check keeps us on the page.
  await expect(page).toHaveURL(/\/login/);
  expect(await email.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", /\/signup/);
});

test("sign-up offers both account types and required fields", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  expect(await page.locator("input[required]").count()).toBeGreaterThanOrEqual(3);
  expect(await page.locator("label.option-card").count()).toBe(2);
});

test("signed-in pages send a visitor to log in", async ({ page }) => {
  for (const path of ["/dashboard", "/shifts", "/pay", "/messages"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});

test("APIs refuse a signed-out caller with JSON", async ({ request }) => {
  const r = await request.get("/api/shifts");
  expect(r.status()).toBe(401);
  expect(await r.json()).toEqual({ error: "Sign in required." });
  const list = await request.get("/api/campaigns");
  expect(list.status()).toBe(200);
  expect(await list.json()).toMatchObject({ campaigns: expect.any(Array) });
});

test("an unknown campaign page is a 404, and every page refuses framing", async ({ page }) => {
  const res = await page.goto("/c/no-such-campaign-e2e");
  expect(res?.status()).toBe(404);
  const home = await page.goto("/");
  expect(home?.headers()["x-frame-options"]).toBe("DENY");
  expect(home?.headers()["x-content-type-options"]).toBe("nosniff");
});
