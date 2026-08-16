import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("renders the truthful landing surface and evidence rail", async ({ page }, testInfo) => {
  const browserProblems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      browserProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => browserProblems.push(`pageerror: ${error.message}`));

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle("ProofRail");
  await expect(
    page.getByRole("heading", { level: 1, name: "Public company evidence you can replay." })
  ).toBeVisible();
  await expect(page.getByText("REFERENCE INPUT · NOT PUBLISHED")).toBeVisible();
  await expect(page.getByText("MAINNET RECEIPT UNAVAILABLE")).toBeVisible();
  await expect(page.locator("nextjs-portal")).toHaveCount(0);

  const primaryAction = page.getByRole("link", { name: "Build evidence" }).first();
  await expect(primaryAction).toBeVisible();
  await expect(primaryAction).toHaveAttribute("href", "/build");

  await page.getByRole("link", { name: "How it works" }).first().click();
  await expect(page).toHaveURL(/#how-it-works$/u);
  await expect(page.getByRole("heading", { name: "How ProofRail works" })).toBeAttached();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
  expect(browserProblems).toEqual([]);

  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: `/tmp/proofrail-landing-${testInfo.project.name}.png`
  });
});

test("exposes a visible keyboard focus treatment", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "ProofRail home" }).first()).toBeFocused();
});
