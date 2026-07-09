import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { embed, chatComplete } from "../llm/openai";
import { buildSnapshot } from "./search";
import {
  createProduct,
  getProductPrompt,
  replaceSnapshot,
  type CreateProductInput,
} from "./persist";

/**
 * Create a saved prompt-view end to end: build the semantic snapshot (embed →
 * retrieve → rerank), insert the product with its prompt embedding, then write
 * the item snapshot. Uses the caller's auth-aware client so RLS scopes every
 * write to the user. Throws through on embedding/LLM/DB failure.
 */
export async function createPromptView(
  input: Pick<CreateProductInput, "title" | "prompt">,
  userId: string,
  client: SupabaseClient,
): Promise<{ id: string }> {
  const snapshot = await buildSnapshot(input.prompt, {
    embed,
    complete: chatComplete,
    client,
  });
  const { id } = await createProduct(
    { title: input.title, prompt: input.prompt, embedding: snapshot.embedding },
    userId,
    client,
  );
  await replaceSnapshot(id, snapshot.items, client);
  return { id };
}

/**
 * Re-run a view's search against the current corpus and replace its snapshot
 * (and refresh the stored embedding + `updated_at`). Returns false when the view
 * isn't the user's (so the route can 404). Throws through on other failures.
 */
export async function refreshPromptView(
  id: string,
  userId: string,
  client: SupabaseClient,
): Promise<boolean> {
  const product = await getProductPrompt(id, userId, client);
  if (!product) return false;

  const snapshot = await buildSnapshot(product.prompt, {
    embed,
    complete: chatComplete,
    client,
  });
  const { error } = await client
    .from("products")
    .update({
      embedding: JSON.stringify(snapshot.embedding),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to update product: ${error.message}`);

  await replaceSnapshot(id, snapshot.items, client);
  return true;
}
