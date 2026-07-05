import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { roleForEmail, type UserRole } from "./role";

/** The current signed-in user as the app cares about it. */
export type SessionUser = {
  id: string;
  email: string | null;
  role: UserRole;
};

/**
 * Resolve the current user from the request's session cookie, or null when
 * anonymous. `getUser()` re-validates the token against Supabase (unlike reading
 * the session blob), so the identity here is trustworthy. The owner role is
 * derived server-side from the verified email against `OWNER_EMAIL` — never from
 * anything the client can set.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return {
    id: user.id,
    email: user.email ?? null,
    role: roleForEmail(user.email, process.env.OWNER_EMAIL),
  };
}

/** Result of an owner-only gate: the user, or the status + message to return. */
export type OwnerGuard =
  | { ok: true; user: SessionUser }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Gate an owner-only action (source-catalog writes). Returns the verified owner
 * or the exact HTTP status/message the route should return: 401 for anonymous,
 * 403 for a signed-in non-owner. The role is derived server-side from the
 * verified session (never client input), so this is the trustworthy authorization
 * boundary in front of the source/candidate write routes — matching the owner-only
 * RLS on those tables (defense in depth).
 */
export async function requireOwner(): Promise<OwnerGuard> {
  const user = await getSessionUser();
  if (!user) return { ok: false, status: 401, error: "Sign in required." };
  if (user.role !== "owner") {
    return { ok: false, status: 403, error: "Owner access required." };
  }
  return { ok: true, user };
}
