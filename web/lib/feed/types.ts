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

/**
 * Feedback/read-state filter (§8.3).
 * - `unread` = items not yet opened.
 * - `liked` = items thumbed up.
 * - `hide-down` = everything except items thumbed down.
 */
export type FeedState = "unread" | "liked" | "hide-down";

/** The valid feedback-state tokens, for validating an untrusted URL param. */
export const FEED_STATES: readonly FeedState[] = ["unread", "liked", "hide-down"];
