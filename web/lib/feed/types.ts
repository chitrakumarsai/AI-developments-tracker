/**
 * Pure feed value types shared by the server query (`queries.ts`, which is
 * `server-only`) and the client-safe URL helpers (`filterHref.ts`) + UI. Kept
 * in its own module so client components can import these without dragging the
 * `server-only` query module into the browser bundle.
 */

/**
 * Feed sort order.
 * - `relevant` (default) = recency + per-source-normalized popularity (§1.4).
 * - `recent` = newest first.
 * - `metric` = most stars/likes first (Repos/Models override).
 */
export type FeedSort = "relevant" | "recent" | "metric";

/** Recency window the reader can pick; scopes and shapes ranking (app-feedback-v2). */
export type FeedWindow = "today" | "week" | "month" | "all";

/** Default window: one month of history, per the user's follow-the-field cadence. */
export const DEFAULT_WINDOW: FeedWindow = "month";
