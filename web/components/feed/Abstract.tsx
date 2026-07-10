"use client";

import { useState } from "react";

type AbstractProps = {
  text: string;
};

/**
 * Expandable abstract — collapsed to three lines by default, toggled inline.
 * Renders as plain text (sanitized upstream); no raw HTML. Only opacity/height
 * via line-clamp toggle — no layout-thrash animation (reduced-motion safe).
 */
export function Abstract({ text }: AbstractProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mt-2">
      <p
        className={
          isExpanded
            ? "[overflow-wrap:anywhere] text-sm leading-relaxed text-muted"
            : "line-clamp-3 [overflow-wrap:anywhere] text-sm leading-relaxed text-muted"
        }
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setIsExpanded((value) => !value)}
        aria-expanded={isExpanded}
        className="mt-1 inline-flex min-h-[44px] items-center text-xs text-faint transition-colors hover:text-ink"
      >
        {isExpanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
