/**
 * Open-redirect guard (2.1). OAuth and magic-link flows carry a "where to go
 * after sign-in" path; an attacker who controls it could bounce the user to an
 * external phishing origin. We only ever honor a *same-origin absolute path* and
 * fall back to "/" for anything else — protocol-relative (`//evil.com`),
 * absolute URLs, backslash tricks, and control characters are all rejected.
 */
// Post-auth default target. The gated app lives at /feed (2.4 — `/` is the
// public landing, which would just bounce a signed-in user to /feed anyway), so
// send authenticated users straight there.
export const DEFAULT_REDIRECT = "/feed";

/** True if the string contains any C0 control char (0x00–0x1F) or DEL (0x7F). */
function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_REDIRECT;

  // Must be an absolute path on our own origin: exactly one leading slash.
  if (!raw.startsWith("/")) return DEFAULT_REDIRECT;
  if (raw.startsWith("//")) return DEFAULT_REDIRECT;

  // Backslashes are normalized to slashes by some browsers → `/\evil.com`.
  if (raw.includes("\\")) return DEFAULT_REDIRECT;

  if (hasControlChar(raw)) return DEFAULT_REDIRECT;

  return raw;
}

/**
 * Build the sign-in URL that returns the user to `nextPath` after authenticating
 * (2.4 gate). `nextPath` passes through the open-redirect guard above so a gate
 * can never bounce a user off-origin, and the value is percent-encoded.
 */
export function signInPath(nextPath: string): string {
  return `/sign-in?next=${encodeURIComponent(safeRedirectPath(nextPath))}`;
}
