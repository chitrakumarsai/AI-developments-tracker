/**
 * Platform identity for a feed item, derived purely from its URL host.
 *
 * The feed mixes aggregator platforms (GitHub, Hugging Face, Reddit, Hacker
 * News, arXiv) with company/lab blogs. `items.category` says *what kind* of
 * thing it is, but not *where* it lives — a model could be Hugging Face, a
 * discussion could be Reddit or HN. This maps the URL host to a short, human
 * label so the card can show that distinction. No DB change: it reads the
 * existing `url`, so it works on every row immediately.
 */

export type Platform = {
  /** Short human label, e.g. "GitHub", "Hugging Face". */
  readonly label: string;
  /** Stable slug for styling/keys, e.g. "github", "hugging-face". */
  readonly slug: string;
};

/** Lowercase kebab slug from a label, e.g. "Hugging Face" → "hugging-face". */
function toSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Curated host → platform, longest-suffix wins (so `www.` and subdomains match). */
const HOST_MAP: ReadonlyArray<readonly [suffix: string, label: string, slug: string]> = [
  ["github.com", "GitHub", "github"],
  ["huggingface.co", "Hugging Face", "hugging-face"],
  ["reddit.com", "Reddit", "reddit"],
  ["news.ycombinator.com", "Hacker News", "hacker-news"],
  ["arxiv.org", "arXiv", "arxiv"],
];

/**
 * Which recognised platforms get a chip in the feed's platform picker.
 *
 * Display and validity are deliberately separate concerns. Reddit is a
 * recognised platform — `?platform=reddit` still filters, and saved views that
 * stored it keep working — it just isn't *offered* as a chip (v5): each
 * subreddit is its own catalogued source, so the source filter already covers
 * it at finer grain and a Reddit chip would only duplicate it.
 */
const PICKER_SLUGS: ReadonlySet<string> = new Set([
  "github",
  "hugging-face",
  "hacker-news",
  "arxiv",
]);

/**
 * The platforms offered in the picker, derived from `HOST_MAP` so a chip's
 * label and slug can never drift from the ones `platformForItem` resolves.
 */
export const CURATED_PLATFORMS: ReadonlyArray<Platform> = HOST_MAP.filter(
  ([, , slug]) => PICKER_SLUGS.has(slug),
).map(([, label, slug]) => ({ label, slug }));

const KNOWN_SLUGS: ReadonlySet<string> = new Set(HOST_MAP.map(([, , slug]) => slug));

/**
 * True when a slug names a platform this app can resolve — the guard for
 * untrusted `?platform=` input and for `saved_views.filters.platform`.
 *
 * Intentionally broader than `CURATED_PLATFORMS`: a platform that has left the
 * picker (Reddit) must still validate, or a saved view or shared link that
 * stored it would silently lose its filter.
 */
export function isKnownPlatform(slug: string): boolean {
  return KNOWN_SLUGS.has(slug);
}

/** Title-case a bare domain label, e.g. "nvidia" → "Nvidia", "openai" → "Openai". */
function titleCase(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1);
}

const UNKNOWN: Platform = { label: "Web", slug: "web" };

/**
 * Resolve the platform for an item URL. Curated aggregator hosts get a proper
 * label; anything else (company blogs) falls back to the registrable domain
 * name (e.g. `research.google.com` → "Google", `netflixtechblog.com` →
 * "Netflixtechblog"). Malformed URLs return a neutral "Web".
 */
export function platformForUrl(url: string): Platform {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return UNKNOWN;
  }
  if (!host) return UNKNOWN;

  for (const [suffix, label, slug] of HOST_MAP) {
    if (host === suffix || host.endsWith(`.${suffix}`)) {
      return { label, slug };
    }
  }

  // Fallback: second-level label of the registrable domain (drops subdomains
  // and TLD), title-cased. Keeps blog sources legible without a curated entry.
  const parts = host.split(".").filter(Boolean);
  const registrable = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  const label = titleCase(registrable ?? "");
  return label ? { label, slug: registrable } : UNKNOWN;
}

/**
 * Platform from a curated source name. Source names follow a
 * `"<Platform> — <detail>"` convention (e.g. "Hacker News — AI stories",
 * "GitHub — Notable AI repos"), so the segment before the em/en-dash/hyphen
 * separator is the platform. This is the *accurate* signal — it names the
 * source that surfaced the item, not where its outbound link points (an HN
 * story links to GitHub, but the platform is Hacker News). Names without a
 * separator (e.g. "Amazon Science") are used whole. Returns null when blank.
 */
export function platformFromSourceName(name: string | null | undefined): Platform | null {
  if (!name) return null;
  // Split only on a spaced separator so hyphenated detail words stay intact.
  const prefix = name.split(/\s[—–-]\s/)[0]?.trim();
  const label = prefix || name.trim();
  return label ? { label, slug: toSlug(label) } : null;
}

/** The shape ItemCard needs to resolve a platform (subset of ItemRow). */
type PlatformItem = {
  url: string;
  source?: { name: string | null } | null;
};

/**
 * Resolve an item's platform: prefer the curated source name (accurate), and
 * fall back to the URL host only when the source join is unavailable.
 */
export function platformForItem(item: PlatformItem): Platform {
  return platformFromSourceName(item.source?.name) ?? platformForUrl(item.url);
}
