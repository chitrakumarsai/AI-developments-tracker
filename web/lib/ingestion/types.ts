/**
 * Ingestion connector contract (AI Chronicles).
 *
 * Every source connector — RSS, API, scrape, or manual — conforms to this
 * shape. The contract is LINK-FIRST: a connector returns metadata plus a link,
 * never full scraped article bodies (see CLAUDE.md §7).
 *
 * The arXiv RSS connector (subphase 1.1) is the reference implementation; later
 * connectors copy this template.
 */

/** A source record as stored in the `sources` table (subset the connector needs). */
export type SourceRef = {
  id: string;
  name: string;
  category: string;
  url: string;
  tags: readonly string[];
};

/**
 * A normalized item produced by a connector, ready to upsert into `items`.
 * `url` is the primary payload and the dedupe key.
 */
export type NormalizedItem = {
  title: string;
  url: string;
  category: string;
  author?: string;
  summary?: string;
  tags?: readonly string[];
  publishedAt?: string; // ISO 8601
  /** Popularity number (GitHub stars, HF likes). Omitted when the source has none. */
  metric?: number;
  /** GitHub forks — a second, additive popularity signal. Omitted otherwise. */
  forks?: number;
};

/** Result of one ingestion run for a single source. */
export type IngestionResult = {
  sourceId: string;
  items: NormalizedItem[];
  /** Non-fatal issues (a failing source must not abort the whole run — §12.7). */
  warnings: string[];
};

/**
 * A connector fetches from one source and returns normalized items.
 * Implementations MUST sanitize all fields — feed/page content is untrusted
 * input (CLAUDE.md §12.7).
 */
export type Connector = (source: SourceRef) => Promise<IngestionResult>;
