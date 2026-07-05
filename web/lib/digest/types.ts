/** Windows a digest can summarize (client-safe, off the server-only module). */
export type DigestPeriod = "week" | "month";

/**
 * A themed section of a rendered digest: an optional heading (e.g. "Models")
 * and the bullet lines under it. Produced by parseDigest from the LLM's raw,
 * lightly-markdown text.
 */
export type DigestBlock = {
  heading: string | null;
  items: string[];
};
