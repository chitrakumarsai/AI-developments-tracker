import { describe, expect, it } from "vitest";

import { comboboxKey, type ComboboxState } from "./comboboxKeys";

const open = (highlight = 0, count = 4): ComboboxState => ({
  isOpen: true,
  highlight,
  optionCount: count,
});
const closed: ComboboxState = { isOpen: false, highlight: 0, optionCount: 4 };

describe("comboboxKey", () => {
  it("ignores keys it does not own, so typing still reaches the input", () => {
    expect(comboboxKey("a", open())).toBeNull();
    expect(comboboxKey("Backspace", open())).toBeNull();
    expect(comboboxKey(" ", open())).toBeNull();
  });

  describe("ArrowDown", () => {
    it("opens a closed list without moving the highlight", () => {
      expect(comboboxKey("ArrowDown", closed)).toEqual({ type: "open", preventDefault: true });
    });

    it("moves down through the options", () => {
      expect(comboboxKey("ArrowDown", open(0))).toEqual({
        type: "highlight",
        index: 1,
        preventDefault: true,
      });
    });

    it("wraps from the last option back to the first", () => {
      expect(comboboxKey("ArrowDown", open(3))).toMatchObject({ index: 0 });
    });

    it("does nothing when the list is empty (no modulo by zero)", () => {
      expect(comboboxKey("ArrowDown", open(0, 0))).toEqual({ type: "none", preventDefault: true });
    });
  });

  describe("ArrowUp", () => {
    it("opens a closed list", () => {
      expect(comboboxKey("ArrowUp", closed)).toEqual({ type: "open", preventDefault: true });
    });

    it("moves up through the options", () => {
      expect(comboboxKey("ArrowUp", open(2))).toMatchObject({ index: 1 });
    });

    it("wraps from the first option round to the last", () => {
      expect(comboboxKey("ArrowUp", open(0))).toMatchObject({ index: 3 });
    });

    it("does nothing when the list is empty", () => {
      expect(comboboxKey("ArrowUp", open(0, 0))).toEqual({ type: "none", preventDefault: true });
    });
  });

  describe("Home / End", () => {
    it("jump to the first and last option", () => {
      expect(comboboxKey("Home", open(2))).toMatchObject({ index: 0 });
      expect(comboboxKey("End", open(0))).toMatchObject({ index: 3 });
    });

    it("are inert while the list is closed, so the caret still moves", () => {
      expect(comboboxKey("Home", closed)).toBeNull();
      expect(comboboxKey("End", closed)).toBeNull();
    });

    it("End does nothing on an empty list", () => {
      expect(comboboxKey("End", open(0, 0))).toEqual({ type: "none", preventDefault: true });
    });
  });

  describe("Enter", () => {
    it("chooses the highlighted option", () => {
      expect(comboboxKey("Enter", open(2))).toEqual({
        type: "choose",
        index: 2,
        preventDefault: true,
      });
    });

    it("is inert while closed, so the form can submit", () => {
      expect(comboboxKey("Enter", closed)).toBeNull();
    });

    it("chooses nothing when the list is empty", () => {
      expect(comboboxKey("Enter", open(0, 0))).toEqual({ type: "none", preventDefault: true });
    });
  });

  describe("Escape", () => {
    it("closes an open list", () => {
      expect(comboboxKey("Escape", open())).toEqual({ type: "close", preventDefault: true });
    });

    it("blurs the input when the list is already closed (second Escape)", () => {
      expect(comboboxKey("Escape", closed)).toEqual({ type: "blur", preventDefault: false });
    });
  });

  describe("Tab", () => {
    it("closes an open list but never preventsDefault — focus must move on", () => {
      expect(comboboxKey("Tab", open())).toEqual({ type: "close", preventDefault: false });
    });

    it("is inert while closed", () => {
      expect(comboboxKey("Tab", closed)).toBeNull();
    });
  });

  it("never returns an index outside the option range", () => {
    for (let count = 1; count <= 5; count++) {
      for (let highlight = 0; highlight < count; highlight++) {
        for (const key of ["ArrowDown", "ArrowUp", "Home", "End", "Enter"]) {
          const action = comboboxKey(key, { isOpen: true, highlight, optionCount: count });
          if (action && "index" in action) {
            expect(action.index, `${key} @ ${highlight}/${count}`).toBeGreaterThanOrEqual(0);
            expect(action.index, `${key} @ ${highlight}/${count}`).toBeLessThan(count);
          }
        }
      }
    }
  });
});
