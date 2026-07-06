import { describe, expect, it } from "vitest";

import { applyStateFilter } from "./queries";
import type { ItemRow } from "../supabase/types";
import type { FeedbackValue } from "../supabase/types";

/** Minimal annotated row; only the fields the state filter reads matter here. */
function item(id: string, vote: FeedbackValue | null, read: boolean): ItemRow {
  return { id, feedback_value: vote, read_state: read } as unknown as ItemRow;
}

const rows: ItemRow[] = [
  item("unread-novote", null, false),
  item("read-up", "up", true),
  item("unread-down", "down", false),
];

describe("applyStateFilter (per-user, 2.2)", () => {
  it("returns everything when no state filter is set", () => {
    expect(applyStateFilter(rows, null)).toHaveLength(3);
    expect(applyStateFilter(rows, undefined)).toHaveLength(3);
  });

  it("'unread' keeps only items this user has not opened", () => {
    const out = applyStateFilter(rows, "unread");
    expect(out.map((r) => r.id)).toEqual(["unread-novote", "unread-down"]);
  });

  it("'liked' keeps only this user's thumbs-up", () => {
    const out = applyStateFilter(rows, "liked");
    expect(out.map((r) => r.id)).toEqual(["read-up"]);
  });

  it("'hide-down' drops only this user's thumbs-down", () => {
    const out = applyStateFilter(rows, "hide-down");
    expect(out.map((r) => r.id)).toEqual(["unread-novote", "read-up"]);
  });
});
