import { NextResponse } from "next/server";

import { deleteProduct } from "@/lib/products/persist";
import { getSessionUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";

function fail(status: number, error: string) {
  return NextResponse.json({ success: false, data: null, error }, { status });
}

/**
 * DELETE /api/products/[id] — remove one of the signed-in user's saved views.
 * Per-user via the auth-aware client + owner-scoped delete (RLS + `user_id`).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail(401, "Sign in required.");
  const { id } = await params;

  try {
    const client = await createServerSupabaseClient();
    await deleteProduct(id, user.id, client);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : "Could not delete the view.");
  }
}
