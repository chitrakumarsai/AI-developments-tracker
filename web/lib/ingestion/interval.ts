/**
 * Parse a PostgreSQL `interval` (as PostgREST returns it — plain text, not
 * ISO-8601) into seconds, and decide whether a source is due for refresh.
 *
 * Scheduled refresh (subphase 1.3) runs a source only when
 * `now − last_fetched ≥ refresh_interval`. The `refresh_interval` column comes
 * back as Postgres text like `"1 day"`, `"2 days"`, `"24:00:00"`, or
 * `"1 day 02:00:00"`. We only need to understand the formats we actually seed;
 * anything unrecognized returns null and the caller fails safe to "due" (refresh
 * rather than silently skip a source forever).
 */

const UNIT_SECONDS: Record<string, number> = {
  year: 31_536_000,
  mon: 2_592_000,
  month: 2_592_000,
  week: 604_800,
  day: 86_400,
  hour: 3_600,
  minute: 60,
  second: 1,
};

// Longest alternatives first so "month" fully matches before "mon".
const UNIT_RE = /(-?\d+(?:\.\d+)?)\s*(years?|months?|mons?|weeks?|days?|hours?|minutes?|seconds?)/gi;
const TIME_RE = /(^|\s)(-?)(\d+):(\d{2}):(\d{2}(?:\.\d+)?)(?=\s|$)/;

/** Seconds for a unit token, singular or plural (`day`/`days`, `mon`/`mons`). */
function unitSeconds(unit: string): number {
  const singular = unit.toLowerCase().replace(/s$/, "");
  const key = singular === "month" ? "mon" : singular;
  return UNIT_SECONDS[key] ?? 0;
}

/**
 * Convert a Postgres interval string to seconds. Returns null when the input is
 * absent or in a format we do not recognize.
 */
export function parsePostgresInterval(text: string | null | undefined): number | null {
  if (text == null) return null;
  const trimmed = text.trim();
  if (trimmed === "") return null;

  let total = 0;
  let matched = false;

  for (const match of trimmed.matchAll(UNIT_RE)) {
    matched = true;
    total += parseFloat(match[1]) * unitSeconds(match[2]);
  }

  const time = trimmed.match(TIME_RE);
  if (time) {
    matched = true;
    const sign = time[2] === "-" ? -1 : 1;
    const hours = parseInt(time[3], 10);
    const minutes = parseInt(time[4], 10);
    const seconds = parseFloat(time[5]);
    total += sign * (hours * 3_600 + minutes * 60 + seconds);
  }

  return matched ? total : null;
}

/**
 * Whether a source is due for refresh. Fail-safe: an absent/invalid
 * `last_fetched` or an unparseable `refresh_interval` returns true, so a source
 * is refreshed rather than skipped indefinitely.
 */
export function isDue(
  lastFetched: string | null | undefined,
  refreshInterval: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (lastFetched == null) return true;

  const last = new Date(lastFetched).getTime();
  if (Number.isNaN(last)) return true;

  const intervalSeconds = parsePostgresInterval(refreshInterval);
  if (intervalSeconds == null || intervalSeconds <= 0) return true;

  const elapsedSeconds = (now.getTime() - last) / 1000;
  return elapsedSeconds >= intervalSeconds;
}
