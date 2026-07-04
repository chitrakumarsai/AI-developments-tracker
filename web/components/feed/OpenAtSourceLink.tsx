"use client";

import type { ReactNode } from "react";

type OpenAtSourceLinkProps = {
  itemId: string;
  /** The original article URL — the primary payload (link-first, §7). */
  url: string;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

/**
 * External link to the source that marks the item read on open. Uses
 * `navigator.sendBeacon` so the POST survives the page unload/navigation; it's
 * best-effort (a failed beacon must not block the reader from leaving).
 * Always `rel="noopener noreferrer"` on a `target="_blank"` link (security).
 */
export function OpenAtSourceLink({
  itemId,
  url,
  className,
  "aria-label": ariaLabel,
  children,
}: OpenAtSourceLinkProps) {
  function markRead() {
    try {
      const blob = new Blob([JSON.stringify({ itemId })], {
        type: "application/json",
      });
      navigator.sendBeacon("/api/items/read", blob);
    } catch {
      // Best-effort: never let read-tracking get in the way of opening the link.
    }
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={markRead}
      onAuxClick={markRead}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </a>
  );
}
