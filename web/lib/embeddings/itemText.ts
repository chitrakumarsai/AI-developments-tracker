/**
 * The text we embed for an item: its title plus summary. Both are sanitized at
 * ingest (§12.7), so this is a pure shaping step — join, collapse whitespace,
 * and cap length so one very long item can't blow the embedding token budget.
 * A single embedding input; empty only if the item has neither field.
 */

/** Roughly ~2k tokens of characters — plenty for a title + summary. */
const MAX_EMBED_CHARS = 8000;

type EmbeddableItem = {
  title?: string | null;
  summary?: string | null;
};

export function itemEmbedInput(item: EmbeddableItem): string {
  const parts = [item.title ?? "", item.summary ?? ""]
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.join("\n\n").replace(/\s+/g, " ").trim().slice(0, MAX_EMBED_CHARS);
}
