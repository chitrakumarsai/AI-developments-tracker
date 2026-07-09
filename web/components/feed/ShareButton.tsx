"use client";

import { useState } from "react";

type ShareButtonProps = {
  /** The original source URL — the thing worth sharing (link-first, §7). */
  url: string;
  title: string;
  className?: string;
};

/** How long the "Copied!" confirmation stays up after a clipboard fallback. */
const COPIED_MS = 1500;

/**
 * Share an item by its ORIGINAL source link (2.4.4). Prefers the native share
 * sheet (Web Share API — great on mobile); falls back to copying the link with a
 * brief "Copied!" confirmation. Never exposes anything the reader couldn't
 * already open — it shares the same external URL the "Read" link points to, so
 * there's no new surface or privacy change.
 */
export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  async function share() {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
        return;
      } catch (err) {
        // A user-cancelled share is not a failure — don't fall back to copy.
        if (err instanceof Error && err.name === "AbortError") return;
        // Any other share failure falls through to the clipboard path.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      // Clipboard blocked (e.g. insecure context) — nothing more to do quietly.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      aria-label={`Share “${title}”`}
      className={className}
    >
      {copied ? "Copied!" : "Share"}
    </button>
  );
}
