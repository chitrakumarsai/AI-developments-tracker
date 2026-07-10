"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { sourceFilterHref, type FeedHrefParams } from "@/lib/feed/filterHref";
import { filterSources } from "@/lib/feed/sourceSearch";

/** A `{ id, name }` option — mirrors `SourceOption` without the server-only import. */
export type SourcePickerOption = { id: string; name: string };

type SourcePickerProps = {
  /** Active sources to choose from (alphabetized upstream). */
  sources: readonly SourcePickerOption[];
  /** Current feed filter context — preserved when the source changes. */
  current: FeedHrefParams;
  /** The currently-selected source id, if the feed is source-filtered. */
  activeSource?: string | null;
};

/** The sentinel option that clears the source filter. Empty id = "no filter". */
const ALL_SOURCES: SourcePickerOption = { id: "", name: "All sources" };

/**
 * Feed source-picker (v4 findability; searchable in v5): jump straight to a
 * source's items — especially a just-ingested feed — without scrolling or
 * visiting /sources. Type to narrow the catalog (24+ sources and growing),
 * then Enter or click to navigate. "All sources" clears the filter.
 *
 * A WAI-ARIA combobox rather than a native <select>, so the list is filterable:
 * an `input[role=combobox]` owns a `ul[role=listbox]`, the active option is
 * tracked with `aria-activedescendant` (focus never leaves the input), and
 * ↑/↓/Enter/Escape all behave as a screen-reader user expects. One code path at
 * every breakpoint; options are 44px tall so they stay thumb-friendly.
 *
 * Navigation logic lives in `sourceFilterHref` and matching in `filterSources`
 * — both unit-tested. This component is the control that wires them together.
 */
export function SourcePicker({ sources, current, activeSource }: SourcePickerProps) {
  const router = useRouter();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  /** `null` = not searching: the input displays the selected source's name. */
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const activeName =
    sources.find((source) => source.id === activeSource)?.name ?? ALL_SOURCES.name;

  const options = useMemo(
    () => [ALL_SOURCES, ...filterSources(sources, query ?? "")],
    [sources, query],
  );

  // Close when focus or a pointer lands outside the widget. `pointerdown` fires
  // before the option's click, so re-check the target rather than closing blind.
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isOpen]);

  // Keep the highlighted option scrolled into view as the user arrows through.
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.children[highlight] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlight, isOpen]);

  if (sources.length === 0) return null;

  const isActive = Boolean(activeSource);

  function open() {
    setIsOpen(true);
    setQuery("");
    setHighlight(0);
  }

  function close() {
    setIsOpen(false);
    setQuery(null);
  }

  function choose(option: SourcePickerOption | undefined) {
    if (!option) return;
    close();
    router.push(sourceFilterHref(current, option.id));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!isOpen) return open();
        if (options.length === 0) return;
        return setHighlight((i) => (i + 1) % options.length);
      case "ArrowUp":
        event.preventDefault();
        if (!isOpen) return open();
        if (options.length === 0) return;
        return setHighlight((i) => (i - 1 + options.length) % options.length);
      case "Home":
        if (!isOpen) return;
        event.preventDefault();
        return setHighlight(0);
      case "End":
        if (!isOpen || options.length === 0) return;
        event.preventDefault();
        return setHighlight(options.length - 1);
      case "Enter":
        if (!isOpen) return;
        event.preventDefault();
        return choose(options[highlight]);
      case "Escape":
        // First Escape closes the list; a second gives the input back to the page.
        if (isOpen) {
          event.preventDefault();
          return close();
        }
        return inputRef.current?.blur();
      case "Tab":
        if (isOpen) close();
        return;
      default:
        return;
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        id={`${baseId}-label`}
        className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted"
      >
        Source
      </span>
      <div ref={rootRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-labelledby={`${baseId}-label`}
          aria-autocomplete="list"
          aria-activedescendant={
            isOpen && options.length > 0 ? `${baseId}-option-${highlight}` : undefined
          }
          autoComplete="off"
          placeholder="Search sources…"
          value={query ?? activeName}
          onChange={(event) => {
            setQuery(event.target.value);
            setHighlight(0);
            setIsOpen(true);
          }}
          onFocus={open}
          onKeyDown={onKeyDown}
          className={`min-h-[38px] w-[12rem] cursor-pointer truncate rounded-[var(--radius-md)] border pl-2.5 pr-7 text-xs font-medium transition-colors placeholder:font-normal placeholder:text-faint focus:outline-none ${
            isActive && !isOpen
              ? "border-ink bg-ink text-surface placeholder:text-surface/60"
              : "border-rule bg-surface text-ink hover:border-ink"
          }`}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[0.65rem] ${
            isActive && !isOpen ? "text-surface" : "text-muted"
          }`}
        >
          ▾
        </span>

        {isOpen ? (
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Sources"
            className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-72 w-[16rem] overflow-y-auto rounded-[var(--radius-md)] border border-rule bg-surface py-1 shadow-lg"
          >
            {options.length === 0 ? (
              <li className="px-3 py-2 text-xs text-muted">No sources match.</li>
            ) : (
              options.map((option, index) => {
                const isHighlighted = index === highlight;
                const isSelected = option.id === (activeSource ?? "");
                return (
                  <li
                    key={option.id || "all"}
                    id={`${baseId}-option-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    // Keep focus on the input: pointerdown would blur it first.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    onMouseEnter={() => setHighlight(index)}
                    className={`flex min-h-[44px] cursor-pointer items-center px-3 text-xs transition-colors ${
                      isHighlighted ? "bg-rule/50 text-ink" : "text-muted"
                    } ${isSelected ? "font-semibold text-ink" : ""}`}
                  >
                    {option.name}
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
