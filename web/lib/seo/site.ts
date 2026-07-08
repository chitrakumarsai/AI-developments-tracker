/**
 * Canonical site origin + absolute-URL helper (2.4 SEO).
 *
 * SEO metadata, robots, sitemap, and share cards all need the production origin
 * — never a request Host header (attacker-controlled) and never a trailing
 * slash. We read `NEXT_PUBLIC_SITE_URL` (set in Vercel prod/preview) and fall
 * back to the known production apex so a missing env in a preview build still
 * yields valid, absolute URLs rather than broken relative ones.
 */
const FALLBACK_SITE_URL = "https://theaichronicles.ai";

/** Brand strings, kept in one place so metadata + OG image + JSON-LD agree. */
export const SITE_NAME = "The AI Chronicles";
export const SITE_TAGLINE = "Find the signal in AI";
export const SITE_DESCRIPTION =
  "A personal AI radar. The AI Chronicles surfaces the one thing worth reading across papers, repos, models, and the noise — and links you straight to it.";

/** Strip any trailing slashes so we can safely concatenate a leading-slash path. */
function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/**
 * The canonical origin (scheme + host, no trailing slash). Uses
 * `NEXT_PUBLIC_SITE_URL` when set and well-formed, else the production apex.
 */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return FALLBACK_SITE_URL;
  try {
    // Validate: a malformed env must not poison every canonical/OG URL.
    const parsed = new URL(raw);
    return stripTrailingSlash(parsed.origin);
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/** Build an absolute URL for a same-origin path (path should start with "/"). */
export function absoluteUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${siteUrl()}${normalized === "/" ? "" : stripTrailingSlash(normalized)}` || siteUrl();
}
