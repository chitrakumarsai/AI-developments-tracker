import "server-only";

/**
 * Minimal OpenAI Chat Completions client via `fetch` — no SDK dependency, and
 * the single call site (`complete`) is easy to inject a fake for in tests.
 * Budget-aware: bulk model (gpt-4o-mini) + a tight token cap.
 */

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const MAX_TOKENS = 400;
const TEMPERATURE = 0.3;
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_EMBED_MODEL = "text-embedding-3-small";

/** Embeds a batch of texts into vectors; injectable so search is testable. */
export type Embed = (inputs: string[]) => Promise<number[][]>;

export type ChatMessage = { role: "system" | "user"; content: string };

/** The one text-completion primitive; injectable so the digest is testable. */
export type Complete = (messages: ChatMessage[]) => Promise<string>;

/**
 * Send messages to OpenAI and return the assistant text. Throws on missing key
 * or any non-OK response — callers on user-facing paths (the digest) catch and
 * fail soft.
 */
export async function chatComplete(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const model = process.env.OPENAI_MODEL_BULK || DEFAULT_MODEL;

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("OpenAI returned no content");
  return text.trim();
}

/**
 * Embed a batch of texts into vectors (one call, order preserved). Empty input
 * short-circuits to `[]`. Throws on missing key or any non-OK response; callers
 * on user-facing paths catch and fail soft. `text-embedding-3-small` → 1536-dim
 * vectors matching `items.embedding` / `products.embedding`.
 */
export async function embed(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const model = process.env.OPENAI_MODEL_EMBED || DEFAULT_EMBED_MODEL;

  const res = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: inputs }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);

  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[]; index?: number }>;
  };
  const rows = json.data;
  if (!Array.isArray(rows) || rows.length !== inputs.length) {
    throw new Error("OpenAI returned an unexpected embeddings shape");
  }
  // Order by `index` defensively — the API returns them in order, but don't
  // assume it, since a mis-alignment would attach the wrong vector to an item.
  const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return ordered.map((row) => {
    if (!Array.isArray(row.embedding)) {
      throw new Error("OpenAI returned no embedding for an input");
    }
    return row.embedding;
  });
}
