import { describe, expect, it } from "vitest";

import { itemEmbedInput } from "./itemText";

describe("itemEmbedInput", () => {
  it("joins title and summary, collapsing whitespace", () => {
    expect(
      itemEmbedInput({ title: "  vLLM   serving ", summary: "Paged\n\nattention" }),
    ).toBe("vLLM serving Paged attention");
  });

  it("uses title alone when there is no summary", () => {
    expect(itemEmbedInput({ title: "Mixtral 8x7B", summary: null })).toBe("Mixtral 8x7B");
  });

  it("returns empty string when neither field is present", () => {
    expect(itemEmbedInput({ title: "", summary: null })).toBe("");
  });

  it("caps very long text", () => {
    const long = "x".repeat(10_000);
    expect(itemEmbedInput({ title: long }).length).toBe(8000);
  });
});
