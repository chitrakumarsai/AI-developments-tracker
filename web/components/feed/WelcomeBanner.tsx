"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";

/** Bump the suffix to re-show the intro if the copy meaningfully changes. */
const DISMISS_KEY = "aic.welcome.dismissed.v1";

/** Subscribe to cross-tab dismissals; no local event needed (we use `hidden`). */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** Client snapshot: has the intro been dismissed? Treat errors as dismissed. */
function getDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return true;
  }
}

/** Server snapshot: render nothing during SSR (no localStorage), no flash. */
function getServerDismissed(): boolean {
  return true;
}

/**
 * First-run intro for the feed (2.4.4). A new reader's feed already has the
 * shared catalog, so instead of a hollow empty state this welcomes them and
 * points at the two actions that make the radar *theirs*: rate items to tune
 * ranking, and browse Sources. Dismissed permanently via localStorage, read
 * through `useSyncExternalStore` so it's SSR-safe (renders nothing on the
 * server, then reveals on the client only for readers who haven't dismissed it).
 */
export function WelcomeBanner() {
  const dismissed = useSyncExternalStore(subscribe, getDismissed, getServerDismissed);
  const [hidden, setHidden] = useState(false);

  if (dismissed || hidden) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* best-effort */
    }
    setHidden(true);
  }

  return (
    <aside
      aria-label="Welcome"
      className="mt-4 rounded-[var(--radius-md)] border border-rule bg-surface/40 p-4"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-base font-medium text-ink">
            Welcome — your radar is live.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            This is the signal, not the scroll. Two things tune it to you:
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-muted">
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-accent">
                ↑↓
              </span>
              <span>
                Thumbs items up or down — the feed learns what you want to see.
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="text-accent">
                ✦
              </span>
              <span>
                Curate what it watches on{" "}
                <Link href="/sources" className="text-ink underline hover:text-accent">
                  Sources
                </Link>
                .
              </span>
            </li>
          </ul>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome message"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] text-muted transition-colors hover:text-ink"
        >
          <span aria-hidden="true" className="text-lg">
            ×
          </span>
        </button>
      </div>
    </aside>
  );
}
