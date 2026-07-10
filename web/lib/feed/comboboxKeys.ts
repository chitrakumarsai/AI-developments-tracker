/**
 * The keyboard state machine of the source-picker combobox, as a pure function.
 *
 * It lives outside the component so the WAI-ARIA behaviour — wrap-around,
 * empty-list guards, two-stage Escape, Tab-must-not-preventDefault — can be
 * tested directly. The component owns focus, navigation and rendering; this
 * owns only "given this key and this state, what should happen?".
 *
 * Returning `null` means "not our key": the event is left alone so ordinary
 * typing, caret movement and form submission still work.
 */

export type ComboboxState = {
  readonly isOpen: boolean;
  /** Index of the active option. Meaningless when `optionCount` is 0. */
  readonly highlight: number;
  readonly optionCount: number;
};

export type ComboboxAction =
  | { type: "open"; preventDefault: boolean }
  | { type: "close"; preventDefault: boolean }
  | { type: "blur"; preventDefault: boolean }
  | { type: "highlight"; index: number; preventDefault: boolean }
  | { type: "choose"; index: number; preventDefault: boolean }
  /** Our key, but nothing to do (e.g. the filtered list is empty). */
  | { type: "none"; preventDefault: boolean };

/** Wrap an index into `[0, count)`. Never called with `count === 0`. */
function wrap(index: number, count: number): number {
  return ((index % count) + count) % count;
}

export function comboboxKey(key: string, state: ComboboxState): ComboboxAction | null {
  const { isOpen, highlight, optionCount } = state;
  const isEmpty = optionCount === 0;

  switch (key) {
    case "ArrowDown":
      if (!isOpen) return { type: "open", preventDefault: true };
      if (isEmpty) return { type: "none", preventDefault: true };
      return { type: "highlight", index: wrap(highlight + 1, optionCount), preventDefault: true };

    case "ArrowUp":
      if (!isOpen) return { type: "open", preventDefault: true };
      if (isEmpty) return { type: "none", preventDefault: true };
      return { type: "highlight", index: wrap(highlight - 1, optionCount), preventDefault: true };

    case "Home":
      if (!isOpen) return null; // let the caret jump to the start of the text
      if (isEmpty) return { type: "none", preventDefault: true };
      return { type: "highlight", index: 0, preventDefault: true };

    case "End":
      if (!isOpen) return null;
      if (isEmpty) return { type: "none", preventDefault: true };
      return { type: "highlight", index: optionCount - 1, preventDefault: true };

    case "Enter":
      if (!isOpen) return null; // let an enclosing form submit
      if (isEmpty) return { type: "none", preventDefault: true };
      return { type: "choose", index: highlight, preventDefault: true };

    case "Escape":
      // First Escape closes the list; a second hands the input back to the page.
      return isOpen
        ? { type: "close", preventDefault: true }
        : { type: "blur", preventDefault: false };

    case "Tab":
      // Close, but NEVER preventDefault — focus has to move on.
      return isOpen ? { type: "close", preventDefault: false } : null;

    default:
      return null;
  }
}
