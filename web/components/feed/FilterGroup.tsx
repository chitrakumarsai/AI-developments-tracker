import Link from "next/link";

/**
 * A labelled segmented control for one feed filter dimension (Window, Sort,
 * Feedback state).
 *
 * The feed's filter controls were previously bare pills with `text-faint`
 * labels, so neither the group's purpose nor its active option read clearly
 * (v5 feedback). Here the label is legible, the group is enclosed in a single
 * track, and the selected option is filled — so "which window am I on?" is
 * answerable at a glance.
 *
 * Options are links, not buttons: every filter is shareable URL state.
 */

export type FilterOption = {
  /** Stable key for React and for comparing against the active value. */
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly isActive: boolean;
};

type FilterGroupProps = {
  /** Visible group label, e.g. "Window". Also names the group for a11y. */
  label: string;
  options: readonly FilterOption[];
};

export function FilterGroup({ label, options }: FilterGroupProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </span>
      <ul
        aria-label={label}
        className="flex items-center gap-0.5 rounded-[var(--radius-md)] border border-rule bg-surface p-0.5"
      >
        {options.map((option) => (
          <li key={option.key}>
            <Link
              href={option.href}
              aria-current={option.isActive ? "true" : undefined}
              className={`inline-flex min-h-[34px] items-center whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 text-xs font-medium transition-colors ${
                option.isActive
                  ? "bg-ink text-surface"
                  : "text-muted hover:bg-rule/40 hover:text-ink"
              }`}
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
