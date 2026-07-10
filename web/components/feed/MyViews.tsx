import Link from "next/link";

import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import {
  getProductWithItems,
  listProducts,
  type ProductSummary,
  type ProductWithItems,
} from "@/lib/products/persist";
import { AiBadge } from "@/components/ui/AiBadge";
import { ASK_SECTION_SLUG } from "@/lib/feed/categories";
import { feedHref } from "@/lib/feed/filterHref";
import { ItemCard } from "./ItemCard";
import { CreateViewForm } from "./CreateViewForm";
import { ViewActions } from "./ViewActions";

const MY_VIEWS_BASE = feedHref({ section: ASK_SECTION_SLUG });

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-[var(--space-section)] text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/**
 * "My views" sub-view of the Products tab (v4 Slice B): the reader's saved
 * prompt-views. Without `productId` it's the list + create form; with one it's
 * that view's detail (its snapshot rendered as feed cards, plus refresh/delete).
 * Resilient — a DB hiccup shows a notice rather than crashing the feed.
 */
export async function MyViews({ productId }: { productId?: string }) {
  const client = await createServerSupabaseClient();
  const user = await getSessionUser();

  if (productId) {
    let product: ProductWithItems | null = null;
    let failed = false;
    try {
      if (user) product = await getProductWithItems(productId, user.id, client);
    } catch {
      failed = true;
    }
    if (failed) {
      return <Notice title="View unavailable" body="Could not load this view. Please try again." />;
    }
    if (!product) {
      return (
        <Notice title="View not found." body="This saved view no longer exists or isn't yours." />
      );
    }
    return (
      <section aria-label={product.title} className="flex flex-1 flex-col pt-4">
        <Link
          href={MY_VIEWS_BASE}
          className="text-xs text-muted transition-colors hover:text-ink"
        >
          ← All views
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-ink">{product.title}</h2>
            <p className="mt-1 text-sm text-muted">{product.prompt}</p>
            {/* These items were retrieved by embedding similarity and ordered
                by a gpt-4o-mini reranker — the badge says so. */}
            <p className="mt-2 flex items-center gap-2 text-xs text-faint">
              <AiBadge label="AI-ranked" />
              matched against everything you&rsquo;ve ingested
            </p>
          </div>
          <ViewActions productId={product.id} />
        </div>
        {product.items.length === 0 ? (
          <Notice
            title="No matches yet."
            body="Nothing in the corpus matched this prompt. Try Refresh after more items are ingested, or refine the prompt in a new view."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-2 2xl:grid-cols-3">
            {product.items.map((item) => (
              <li key={item.id}>
                {/*
                  No `context`: an item's source/tag links must resolve to the
                  main feed, not back to Ask. Ask is a prompt surface and can't
                  render a filtered item list, so `section=ask&source=…` would
                  dead-end on this same page with the filter silently dropped.
                */}
                <ItemCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  let products: ProductSummary[] = [];
  let failed = false;
  try {
    if (user) products = await listProducts(user.id, client);
  } catch {
    failed = true;
  }

  return (
    <section aria-label="Ask" className="flex flex-1 flex-col pt-4">
      <div className="border-b border-rule pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg font-semibold text-ink">
            Ask for what you want to track
          </h2>
          <AiBadge />
        </div>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-muted">
          Describe a topic in plain English. We search everything you&rsquo;ve ingested —
          papers, repos, models, posts — and save the matches as a view you can reopen
          and refresh.
        </p>
        <div className="mt-3">
          <CreateViewForm />
        </div>
      </div>

      {failed ? (
        <Notice title="Views unavailable" body="Could not load your saved views. Please try again." />
      ) : products.length === 0 ? (
        <Notice
          title="No saved views yet."
          body="Try something like “efficient inference on consumer GPUs” or “vision transformers this month”. Your view is saved here, so you can come back and refresh it as new items arrive."
        />
      ) : (
        <ul className="divide-y divide-rule">
          {products.map((product) => (
            <li key={product.id}>
              <Link
                href={`${MY_VIEWS_BASE}&id=${product.id}`}
                className="group flex items-baseline justify-between gap-4 py-4"
              >
                <div className="min-w-0">
                  <h3 className="font-display text-base font-medium text-ink transition-colors group-hover:text-accent">
                    {product.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{product.prompt}</p>
                </div>
                <span className="shrink-0 text-xs text-faint">
                  {product.itemCount} {product.itemCount === 1 ? "item" : "items"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
