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
