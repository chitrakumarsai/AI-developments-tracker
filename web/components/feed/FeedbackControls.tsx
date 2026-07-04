"use client";

import { useState } from "react";

import type { FeedbackValue } from "@/lib/supabase/types";

type FeedbackControlsProps = {
  itemId: string;
  /** The item's current vote, so the control reflects prior feedback on load. */
  initialValue: FeedbackValue | null;
};

const BUTTON =
  "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-sm)] text-base transition-colors";

/**
 * Thumbs up/down on an item. Optimistic: the vote flips immediately, then POSTs
 * to /api/feedback and rolls back with a visible error if the write fails.
 * Clicking the active vote again clears it (toggle-off).
 */
export function FeedbackControls({ itemId, initialValue }: FeedbackControlsProps) {
  const [value, setValue] = useState<FeedbackValue | null>(initialValue);
  const [failed, setFailed] = useState(false);

  async function vote(next: FeedbackValue) {
    const target = value === next ? null : next; // re-tapping the active vote clears it
    const previous = value;
    setValue(target); // optimistic
    setFailed(false);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, value: target }),
      });
      if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
    } catch {
      setValue(previous); // rollback
      setFailed(true);
    }
  }

  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Rate this item">
      <button
        type="button"
        onClick={() => vote("up")}
        aria-pressed={value === "up"}
        aria-label={value === "up" ? "Remove thumbs up" : "Thumbs up"}
        className={`${BUTTON} ${
          value === "up"
            ? "bg-accent/15 text-accent"
            : "text-faint hover:bg-rule/40 hover:text-ink"
        }`}
      >
        <span aria-hidden="true">👍</span>
      </button>
      <button
        type="button"
        onClick={() => vote("down")}
        aria-pressed={value === "down"}
        aria-label={value === "down" ? "Remove thumbs down" : "Thumbs down"}
        className={`${BUTTON} ${
          value === "down"
            ? "bg-rule/70 text-ink"
            : "text-faint hover:bg-rule/40 hover:text-ink"
        }`}
      >
        <span aria-hidden="true">👎</span>
      </button>
      {failed ? (
        <span role="alert" className="ml-1 text-xs text-red-600">
          Couldn’t save
        </span>
      ) : null}
    </div>
  );
}
