import { unsafeUrlReason } from "../ingestion/net";

/**
 * Outbound-link extraction for automated source discovery (2.4.3).
 *
 * Pulls the external hosts an HTML page links to, so the discoverer can tally
 * which outlets your trusted sources keep referencing (CLAUDE.md §5). We never
 * render or store the HTML — only read `href` values and reduce them to safe,
 * normalized hostnames — so a targeted regex (not a full DOM parse) is adequate
 * and dependency-free. Every extracted URL is passed through the same SSRF guard
 * the ingestion layer uses (§12.7): private/loopback/metadata + non-http links
 * are dropped before a host is ever emitted.
 */

/** Cap hrefs scanned per page so a hostile page emitting 100k links can't spin. */
const MAX_LINKS_PER_PAGE = 2_000;

/**
 * Ubiquitous non-source hosts that add noise rather than signal — analytics,
 * fonts, share widgets, spec/boilerplate links. Matched on the normalized host.
 */
const STOP_HOSTS = new Set([
  "w3.org",
  "schema.org",
  "gmpg.org",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "gravatar.com",
  "googletagmanager.com",
  "google-analytics.com",
  "doubleclick.net",
  "facebook.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
]);

/** Match `href="…"`, `href='…'`, or bare `href=…` (value in one of three groups). */
const HREF_RE = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi;

/** Lowercase the host and drop a leading `www.` so `www.x.com` == `x.com`. */
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** True when two hosts share a registrable-ish identity (equal or sub/parent). */
function sameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * Return the distinct external hosts `html` links to, resolved against `fromUrl`.
 * Excludes: links back to the page's own site, non-http(s) schemes, private/
 * loopback/metadata hosts (SSRF guard), and known-noise hosts. Deduped per page
 * (a host linked 50 times counts once), so the caller measures *page/source
 * spread*, not raw link volume.
 */
export function extractOutboundHosts(html: string, fromUrl: string): string[] {
  let fromHost: string;
  try {
    fromHost = normalizeHost(new URL(fromUrl).hostname);
  } catch {
    return [];
  }

  const hosts = new Set<string>();
  let scanned = 0;
  for (const match of html.matchAll(HREF_RE)) {
    if (scanned >= MAX_LINKS_PER_PAGE) break;
    scanned += 1;

    const raw = match[1] ?? match[2] ?? match[3] ?? "";
    if (!raw) continue;

    let abs: string;
    try {
      abs = new URL(raw, fromUrl).href; // resolve relative links against the page
    } catch {
      continue;
    }
    if (unsafeUrlReason(abs)) continue; // non-http(s) or private/loopback/metadata

    const host = normalizeHost(new URL(abs).hostname);
    if (!host || host === fromHost || sameSite(host, fromHost)) continue;
    if (STOP_HOSTS.has(host)) continue;

    hosts.add(host);
  }

  return [...hosts];
}
