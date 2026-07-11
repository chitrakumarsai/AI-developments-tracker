import { NextResponse } from "next/server";
import { z } from "zod";

import {
  deleteSource,
  setSourceStatus,
  setSourcePriority,
  updateSourceMeta,
} from "@/lib/sources/persist";
import { requireOwner } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit/limiter";

/**
 * Untrusted partial-update body. `.strict()` rejects unknown keys — notably
 * `url`, which is intentionally NOT editable here (changing it would require
 * re-running the SSRF/feed validation). At least one field must be present.
 */
const bodySchema = z
  .object({
    status: z.enum(["active", "paused", "archived"]).optional(),
    priority: z.number().int().min(0).max(100).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    category: z.string().trim().min(1).max(80).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), {
    message: "At least one field is required.",
  });

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * PATCH /api/sources/[id] — owner-only: mutate a source's lifecycle/ranking/
 * metadata (2.4.2). Handles pause/resume + archive/restore (`status`), re-weight
 * (`priority`, clamped in the persist layer), and metadata edits (`name`,
 * `category`, `tags`, sanitized). `url` is immutable (see schema).
 *
 * Writes via the service-role client, so `requireOwner` is the sole authorization
 * boundary — matching the owner-only RLS on `sources`.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner();
  if (!guard.ok) return fail(guard.status, guard.error);

  const limited = await enforceRateLimit("candidates", `user:${guard.user.id}`);
  if (limited) return limited;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail(400, "Invalid source id.");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return fail(400, "Body must be JSON.");
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(400, "Invalid update payload.");

  const { status, priority, name, category, tags } = parsed.data;
  const hasMeta = name !== undefined || category !== undefined || tags !== undefined;
  if (hasMeta && (name === undefined || category === undefined || tags === undefined)) {
    return fail(400, "Editing metadata requires name, category, and tags.");
  }

  try {
    if (status !== undefined) await setSourceStatus(id, status);
    if (priority !== undefined) await setSourcePriority(id, priority);
    // The partial-meta 400 guard above guarantees all three are present together.
    if (name !== undefined && category !== undefined && tags !== undefined) {
      await updateSourceMeta(id, { name, category, tags });
    }
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error(`[sources] update failed: ${detail}`);
    const message = process.env.NODE_ENV === "production" ? "Could not update source." : detail;
    return fail(500, message);
  }
}

/**
 * DELETE /api/sources/[id] — owner-only: permanently remove a source (2.4.3).
 * This is an irreversible hard delete, distinct from the soft `archived` state.
 * The persist layer guards the delete to `archived` rows only (`.eq("status",
 * "archived")`), so an active/paused source can never be purged even if the UI
 * gate is bypassed. Owner-gated + rate-limited, matching PATCH.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireOwner();
  if (!guard.ok) return fail(guard.status, guard.error);

  const limited = await enforceRateLimit("candidates", `user:${guard.user.id}`);
  if (limited) return limited;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail(400, "Invalid source id.");
  }

  try {
    await deleteSource(id);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error(`[sources] delete failed: ${detail}`);
    const message = process.env.NODE_ENV === "production" ? "Could not delete source." : detail;
    return fail(500, message);
  }
}
