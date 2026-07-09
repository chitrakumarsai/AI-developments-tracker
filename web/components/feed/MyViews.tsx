import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { listProducts, type ProductSummary } from "@/lib/products/persist";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-[var(--space-section)] text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

/**
 * "My views" sub-view of the Products tab (v4 Slice B shell): the reader's saved
 * prompt-views. Each is a titled prompt whose matched items are a materialized
 * snapshot. Creation + semantic search land once the embedding path is live
 * (OpenAI quota); this shell lists what exists and states what's coming, so the
 * surface is real and reviewable now. Resilient — a DB hiccup shows a notice.
 */
export async function MyViews() {
  const client = await createServerSupabaseClient();
  const user = await getSessionUser();

  let products: ProductSummary[] = [];
  let failed = false;
  try {
    if (user) products = await listProducts(user.id, client);
  } catch {
    failed = true;
  }

  if (failed) {
    return (
      <Notice
        title="Views unavailable"
        body="Could not load your saved views. Please try again in a moment."
      />
    );
  }

  return (
    <section aria-label="My views" className="flex flex-1 flex-col pt-4">
      <div className="flex items-baseline justify-between border-b border-rule pb-3">
        <h2 className="font-display text-lg font-semibold text-ink">My views</h2>
        <span
          className="rounded-[var(--radius-sm)] border border-dashed border-rule px-2.5 py-1 text-[0.7rem] uppercase tracking-[0.14em] text-faint"
          title="Prompt-to-view search arrives once embeddings are enabled."
        >
          New from a prompt · soon
        </span>
      </div>

      {products.length === 0 ? (
        <Notice
          title="No saved views yet."
          body="Soon you'll be able to describe what you're after in plain language — “vision transformers this month”, “local-LLM inference tricks” — save it as a titled view, and reopen it here to see the matching papers, models, and posts."
        />
      ) : (
        <ul className="divide-y divide-rule">
          {products.map((product) => (
            <li key={product.id} className="py-4">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="font-display text-base font-medium text-ink">
                  {product.title}
                </h3>
                <span className="shrink-0 text-xs text-faint">
                  {product.itemCount} {product.itemCount === 1 ? "item" : "items"}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{product.prompt}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
