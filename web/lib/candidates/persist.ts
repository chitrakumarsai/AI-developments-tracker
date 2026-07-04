import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import type { IngestionType } from "../supabase/types";
import { sanitizeText } from "../ingestion/sanitize";

/** A discovered-but-not-yet-promoted source in the rating queue. */
export type SourceCandidate = {
  id: string;
  platform: string;
  handle_or_url: string;
  why_suggested: string | null;
  rating: number | null;
  state: "suggested" | "promoted" | "rejected";
};

export type NewCandidate = {
  platform: string;
  handleOrUrl: string;
  whySuggested?: string;
};

/**
 * Add a candidate to the rating queue. All fields are sanitized (untrusted user
 * input, §12.7); the URL is validated for real only at promote time. Injectable
 * client for unit testing. Throws on DB error.
 */
export async function createCandidate(
  { platform, handleOrUrl, whySuggested }: NewCandidate,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error } = await client.from("source_candidates").insert({
    platform: sanitizeText(platform),
    handle_or_url: sanitizeText(handleOrUrl),
    why_suggested: whySuggested ? sanitizeText(whySuggested) : null,
    state: "suggested",
  });
  if (error) {
    throw new Error(`Failed to add candidate: ${error.message}`);
  }
}

/** The rating queue: candidates still awaiting a decision, newest first. */
export async function listSuggested(
  client: SupabaseClient = getServerClient(),
): Promise<SourceCandidate[]> {
  const { data, error } = await client
    .from("source_candidates")
    .select("id, platform, handle_or_url, why_suggested, rating, state")
    .eq("state", "suggested")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Failed to load candidates: ${error.message}`);
  }
  return (data ?? []) as unknown as SourceCandidate[];
}

/** Fetch a single candidate (the route needs its URL to validate before promoting). */
export async function getCandidate(
  id: string,
  client: SupabaseClient = getServerClient(),
): Promise<SourceCandidate | null> {
  const { data, error } = await client
    .from("source_candidates")
    .select("id, platform, handle_or_url, why_suggested, rating, state")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Failed to load candidate: ${error.message}`);
  }
  return (data ?? null) as unknown as SourceCandidate | null;
}

export type ReviewInput =
  | { action: "rate"; rating: number }
  | { action: "skip"; rating?: undefined };

/** Rate a candidate (keep/⭐) or skip it (→ rejected, leaves the queue). */
export async function reviewCandidate(
  id: string,
  review: ReviewInput,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const patch =
    review.action === "skip" ? { state: "rejected" } : { rating: review.rating };
  const { error } = await client.from("source_candidates").update(patch).eq("id", id);
  if (error) {
    throw new Error(`Failed to review candidate: ${error.message}`);
  }
}

export type PromoteInput = {
  name: string;
  category: string;
  url: string;
  ingestionType: IngestionType;
  tags: string[];
};

/**
 * Promote a candidate into the live catalog: insert an active `sources` row and
 * mark the candidate `promoted`. Feed validation happens in the route BEFORE
 * this call, so this stays a pure two-step DB write. Throws on DB error.
 */
export async function promoteCandidate(
  id: string,
  { name, category, url, ingestionType, tags }: PromoteInput,
  client: SupabaseClient = getServerClient(),
): Promise<void> {
  const { error: insertError } = await client.from("sources").insert({
    name: sanitizeText(name),
    category: sanitizeText(category),
    url,
    ingestion_type: ingestionType,
    status: "active",
    tags,
  });
  if (insertError) {
    throw new Error(`Failed to create source: ${insertError.message}`);
  }

  const { error: updateError } = await client
    .from("source_candidates")
    .update({ state: "promoted" })
    .eq("id", id);
  if (updateError) {
    throw new Error(`Failed to mark candidate promoted: ${updateError.message}`);
  }
}
