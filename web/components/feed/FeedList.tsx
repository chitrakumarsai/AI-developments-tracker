import { getRecentItems } from "@/lib/feed/queries";
import type { ItemRow } from "@/lib/supabase/types";
import { ItemCard } from "./ItemCard";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="py-[var(--space-section)] text-center">
      <p className="font-display text-xl text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
        {body}
      </p>
    </div>
  );
}

type FeedListProps = {
  /** DB category to filter to; null/undefined shows all categories. */
  category?: string | null;
  /** Section label, used only for the empty-state copy. */
  sectionLabel?: string;
};

/**
 * Server component: loads recent items (optionally filtered to one category)
 * and renders the editorial feed. Resilient — a Supabase failure shows a notice
 * instead of crashing the route.
 */
export async function FeedList({ category, sectionLabel }: FeedListProps = {}) {
  let items: ItemRow[] = [];
  try {
    items = await getRecentItems(undefined, category);
  } catch {
    return (
      <Notice
        title="Feed unavailable"
        body="Could not reach the database. Make sure the local Supabase stack is running (supabase start)."
      />
    );
  }

  if (items.length === 0) {
    const scope = category ? `${sectionLabel ?? "this section"}` : "the feed";
    return (
      <Notice
        title="No signal yet."
        body={`Nothing in ${scope} yet. Once a matching source is ingested, items will appear here.`}
      />
    );
  }

  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.id}>
          <ItemCard item={item} />
        </li>
      ))}
    </ul>
  );
}
