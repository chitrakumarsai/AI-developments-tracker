import { expect, test } from "@playwright/test";

/**
 * Feed E2E. Runs signed-in via the owner storage state (see auth.setup.ts).
 * Requires the DB to hold at least one ingested item.
 *
 * The feed moved from `/` to `/feed` when `/` became the public landing (2.4),
 * and the first card is no longer guaranteed to be arXiv now that many sources
 * are ingested — so this asserts the link-first contract, not a specific host.
 */
test("renders items and links out to the source", async ({ page, browserName }) => {
  // WebKit cannot hydrate here: the production CSP sends `upgrade-insecure-requests`
  // and WebKit honours it on http://127.0.0.1, so script loads fail. Chromium
  // exempts loopback. Real production is https, so this is harness-only.
  const canInteract = browserName !== "webkit";
  await page.goto("/feed");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Chronicles");

  const firstItem = page.locator("article").first();
  await expect(firstItem).toBeVisible();

  const showMore = firstItem.getByRole("button", { name: /show more/i });
  if (canInteract && (await showMore.count())) {
    await showMore.click();
    await expect(
      firstItem.getByRole("button", { name: /show less/i }),
    ).toBeVisible();
  }

  const readLink = firstItem.getByRole("link", { name: /open .* at the source/i });
  // Link-first (§7): the card links OUT to the original, never to an in-app copy.
  await expect(readLink).toHaveAttribute("href", /^https?:\/\//);
  await expect(readLink).toHaveAttribute("rel", /noopener/);
});
