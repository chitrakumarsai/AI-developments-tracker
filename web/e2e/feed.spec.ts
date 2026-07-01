import { expect, test } from "@playwright/test";

/**
 * Feed E2E (mobile viewport). Requires the local Supabase stack running, the
 * migration applied, the seed loaded, and at least one ingest run completed
 * (POST /api/ingest/run) so `items` is populated.
 */
test("renders arXiv items on mobile and links to the source", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI Chronicles");

  const firstItem = page.locator("article").first();
  await expect(firstItem).toBeVisible();

  const showMore = firstItem.getByRole("button", { name: /show more/i });
  if (await showMore.count()) {
    await showMore.click();
    await expect(
      firstItem.getByRole("button", { name: /show less/i }),
    ).toBeVisible();
  }

  const readLink = firstItem.getByRole("link", { name: /open .* at the source/i });
  await expect(readLink).toHaveAttribute("href", /arxiv\.org/);
  await expect(readLink).toHaveAttribute("rel", /noopener/);
});
