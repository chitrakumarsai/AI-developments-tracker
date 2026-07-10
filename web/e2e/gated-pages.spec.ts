import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * The gated app surfaces (/feed, /sources, /settings) behind the auth gate.
 *
 * Until the owner storage-state fixture existed these were unreachable to
 * automation, so the whole v5 design system shipped verified only by build,
 * types and a human's eyes. These tests close that gap: they prove each page
 * renders signed-in, and that none of them overflow horizontally at any
 * breakpoint — the failure mode a filter bar or a wide table causes on a phone.
 */

const SHOTS = "e2e/__screenshots__";
mkdirSync(SHOTS, { recursive: true });

const BREAKPOINTS = [
  { name: "320", width: 320, height: 720 },
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1440", width: 1440, height: 900 },
] as const;

const PAGES = [
  { path: "/feed", heading: "AI Chronicles" },
  { path: "/sources", heading: "Sources" },
  { path: "/settings", heading: "Settings" },
] as const;

/**
 * Pixels by which the document exceeds the viewport (a real mobile bug).
 *
 * Waits for the streamed feed and for web fonts before measuring: `networkidle`
 * fires before a Suspense boundary resolves and before Fraunces/Inter swap in,
 * and either can shift layout after the fact — which made this measurement flaky.
 */
async function horizontalOverflow(page: import("@playwright/test").Page) {
  await page.locator("main").first().waitFor({ state: "visible" });
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
}

test.describe("gated pages render for a signed-in owner", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} loads without bouncing to sign-in`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should not error`).toBeLessThan(400);
      await expect(page).toHaveURL(new RegExp(`${path}(\\?|$)`));
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });
  }
});

test.describe("no horizontal overflow at any breakpoint", () => {
  // Desktop only. A device-emulated (isMobile) context does not reliably adopt
  // `setViewportSize` as its *layout* viewport, so widths measured there are
  // meaningless — an emulated iPhone reported 47px of overflow where a real
  // 320px WebKit viewport reported 5px. Mobile WebKit is covered below at its
  // own native viewport instead.
  test.skip(({ isMobile }) => Boolean(isMobile), "device emulation distorts layout-viewport width");

  for (const { path } of PAGES) {
    for (const bp of BREAKPOINTS) {
      test(`${path} @ ${bp.name}px`, async ({ page }) => {
        await page.setViewportSize({ width: bp.width, height: bp.height });
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const overflow = await horizontalOverflow(page);
        await page.screenshot({
          path: `${SHOTS}/${path.replace(/\//g, "")}-${bp.name}.png`,
          fullPage: false,
        });
        expect(overflow, `${path} overflows by ${overflow}px at ${bp.name}`).toBeLessThanOrEqual(1);
      });
    }
  }
});

test.describe("v5 structure", () => {
  test("Ask is a tab and opens the prompt surface, not a category feed", async ({ page }) => {
    await page.goto("/feed");
    const ask = page.getByRole("link", { name: "Ask" }).first();
    await expect(ask).toBeVisible();
    // Navigate by href rather than by click: under the production CSP
    // (`upgrade-insecure-requests`) WebKit refuses to load scripts over plain
    // http://127.0.0.1, so nothing hydrates and a click does nothing. That is a
    // harness limitation, not a product bug — real production is https.
    await expect(ask).toHaveAttribute("href", /section=ask/);
    await page.goto("/feed?section=ask");
    // The Ask surface renders server-side; wait for its heading before asserting
    // on the form, so a slow paint doesn't read as a missing control.
    await expect(page.getByRole("heading", { name: /Ask for what you want to track/i })).toBeVisible();
    await expect(page.getByPlaceholder(/Describe what you want to track/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Search titles/i)).toHaveCount(0);
  });

  test("Reddit is not offered in the Platform filter", async ({ page }) => {
    await page.goto("/feed");
    const platform = page.getByRole("list", { name: "Platform" });
    await expect(platform).toBeVisible();
    await expect(platform.getByRole("link", { name: "Reddit" })).toHaveCount(0);
    await expect(platform.getByRole("link", { name: "GitHub" })).toBeVisible();
  });

  test("the legacy ?section=products link still resolves to More", async ({ page }) => {
    // Persisted in saved_views.filters.section and in shared URLs.
    await page.goto("/feed?section=products");
    await expect(page.getByRole("link", { name: "More" })).toHaveAttribute("aria-current", "page");
  });
});

test.describe("mobile WebKit, native viewport", () => {
  test.skip(({ isMobile }) => !isMobile, "mobile projects only");

  for (const { path } of PAGES) {
    test(`${path} does not overflow`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await horizontalOverflow(page);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});
