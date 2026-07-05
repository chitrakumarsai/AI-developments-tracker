import { describe, expect, it } from "vitest";

import { parseDigest } from "./parse";

describe("parseDigest", () => {
  it("returns an empty array for empty or whitespace content", () => {
    expect(parseDigest("")).toEqual([]);
    expect(parseDigest("   \n\n ")).toEqual([]);
  });

  it("groups bullets under a bold-wrapped heading and strips the ** markers", () => {
    const raw = "**Models**\n- Launch of BamiBERT\n- Introduction of TUDUM";

    const blocks = parseDigest(raw);

    expect(blocks).toEqual([
      { heading: "Models", items: ["Launch of BamiBERT", "Introduction of TUDUM"] },
    ]);
  });

  it("treats a colon-terminated line as a heading", () => {
    const raw = "Research:\n* A paper on multilingual TTS";

    expect(parseDigest(raw)).toEqual([
      { heading: "Research", items: ["A paper on multilingual TTS"] },
    ]);
  });

  it("splits multiple themed sections", () => {
    const raw = ["**Models**", "- BamiBERT", "**Tools**", "- HaloGuard 1.0"].join("\n");

    expect(parseDigest(raw)).toEqual([
      { heading: "Models", items: ["BamiBERT"] },
      { heading: "Tools", items: ["HaloGuard 1.0"] },
    ]);
  });

  it("keeps bullets that appear before any heading in a headingless block", () => {
    const raw = "- First point\n- Second point";

    expect(parseDigest(raw)).toEqual([
      { heading: null, items: ["First point", "Second point"] },
    ]);
  });

  it("strips inline bold, italic, and code markers from bullet text", () => {
    const raw = "**Discussion**\n- **BamiBERT** is a *new* `BERT` model";

    expect(parseDigest(raw)).toEqual([
      { heading: "Discussion", items: ["BamiBERT is a new BERT model"] },
    ]);
  });

  it("drops empty bullets and headings with no leftover text", () => {
    const raw = "**Models**\n-\n- Real point\n**  **\n";

    expect(parseDigest(raw)).toEqual([
      { heading: "Models", items: ["Real point"] },
    ]);
  });

  it("handles various bullet markers (-, *, •, numbered)", () => {
    const raw = "- dash\n* star\n• dot\n1. numbered";

    expect(parseDigest(raw)).toEqual([
      { heading: null, items: ["dash", "star", "dot", "numbered"] },
    ]);
  });
});
