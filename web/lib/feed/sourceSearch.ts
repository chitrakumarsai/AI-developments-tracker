/** The `{ id, name }` shape the picker filters over (subset of `SourceOption`). */
export type SearchableSource = {
  readonly id: string;
  readonly name: string;
};

/**
 * Fold a string to lowercase words separated by single spaces, dropping all
 * punctuation. Source names are heavily punctuated — "arXiv — cs.CL",
 * "Reddit — r/ArtificialInteligence" — so this is what lets a user type
 * "arxiv cl" or "reddit artificial" and still get a hit.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Filter the source list by a free-text query, for the picker's type-to-search.
 *
 * Every whitespace-separated token in the query must appear somewhere in the
 * normalized name (AND, order-independent), so "cl arxiv" and "arxiv cl" both
 * find "arXiv — cs.CL" while "arxiv deepmind" finds nothing. Matching is plain
 * substring containment — never a constructed RegExp — so a query full of
 * metacharacters is literal text, not a pattern (and cannot backtrack).
 *
 * The incoming order is preserved (the catalog is alphabetized upstream).
 * An empty query returns every source.
 */
export function filterSources<T extends SearchableSource>(
  sources: readonly T[],
  query: string,
): T[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return [...sources];

  return sources.filter((source) => {
    const haystack = normalize(source.name);
    return tokens.every((token) => haystack.includes(token));
  });
}

/** The sentinel option that clears the source filter. An empty id = "no filter". */
export const ALL_SOURCES: SearchableSource = { id: "", name: "All sources" };

/**
 * The options the picker should show for a given query.
 *
 * "All sources" is a *clear-the-filter* action, not a search result, so it
 * leads the list only while the query is empty. Once the user types, it drops
 * out — otherwise it would sit at the top as the highlighted option and Enter
 * would clear the filter instead of choosing the first match.
 */
export function pickerOptions<T extends SearchableSource>(
  sources: readonly T[],
  query: string,
): SearchableSource[] {
  const matches = filterSources(sources, query);
  return normalize(query) ? matches : [ALL_SOURCES, ...matches];
}
