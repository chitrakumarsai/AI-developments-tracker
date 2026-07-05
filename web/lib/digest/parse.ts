import type { DigestBlock } from "./types";

/** Leading bullet marker on a real bullet line: -, *, •, or "1." / "2)" + text. */
const BULLET_MARKER = /^\s*(?:[-*•]|\d+[.)])\s+/;
/** Strips the marker for text extraction, tolerating a bare "-" with no text. */
const BULLET_MARKER_LOOSE = /^\s*(?:[-*•]|\d+[.)])\s*/;
/** A bold-wrapped, heading-only line such as "**Models**" or "**Models**:". */
const BOLD_HEADING = /^\s*\*\*(.+?)\*\*:?\s*$/;

/** Remove inline markdown emphasis (**bold**, *italic*, `code`) and stray asterisks. */
function stripInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\*+/g, "")
    .trim();
}

/**
 * Turn the LLM's lightly-markdown digest into themed blocks for rendering.
 *
 * The model emits bold section labels ("**Models**") and bulleted lines; naive
 * line-splitting leaks "Models**" fragments into the feed. This parser lifts
 * headings out, strips every markdown marker, and groups bullets beneath their
 * heading. Bullets seen before any heading land in a single headingless block.
 */
export function parseDigest(content: string): DigestBlock[] {
  const blocks: DigestBlock[] = [];
  let current: DigestBlock | null = null;

  const pushCurrent = () => {
    if (current && current.items.length > 0) blocks.push(current);
    current = null;
  };

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const isBullet = BULLET_MARKER.test(line);
    const boldHeading = !isBullet ? line.match(BOLD_HEADING) : null;
    const isColonHeading = !isBullet && !boldHeading && line.endsWith(":");

    if (boldHeading || isColonHeading) {
      const headingText = stripInline(
        boldHeading ? boldHeading[1] : line.slice(0, -1),
      );
      if (!headingText) continue; // e.g. "** **" — nothing to show
      pushCurrent();
      current = { heading: headingText, items: [] };
      continue;
    }

    const itemText = stripInline(line.replace(BULLET_MARKER_LOOSE, ""));
    if (!itemText) continue;
    if (!current) current = { heading: null, items: [] };
    current.items.push(itemText);
  }

  pushCurrent();
  return blocks;
}
