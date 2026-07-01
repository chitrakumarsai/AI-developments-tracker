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

/**
 * Server component: loads recent items and renders the editorial feed.
 * Resilient — a Supabase failure shows a notice instead of crashing the route.
 */
export async function FeedList() {
  let items: ItemRow[] = [];
  try {
    items = await getRecentItems();
  } catch {
    return (
      <Notice
        title="Feed unavailable"
        body="Could not reach the database. Make sure the local Supabase stack is running (supabase start)."
      />
    );
  }

  if (items.length === 0) {
    return (
      <Notice
        title="No signal yet."
        body="The feed is wired and waiting. Run an arXiv ingest (POST /api/ingest/run) and items will appear here."
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
