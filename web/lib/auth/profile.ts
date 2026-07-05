import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getServerClient } from "../supabase/server";
import { roleForEmail, type UserRole } from "./role";

/** The minimal identity we upsert into `profiles`, from a verified session. */
export type ProfileIdentity = {
  id: string;
  email: string | null;
};

/** The profile row shape written on sign-in. */
export type ProfileRow = {
  id: string;
  email: string | null;
  role: UserRole;
};

/**
 * Build the `profiles` row for a signed-in user. Pure so the owner-derivation is
 * unit-testable: the role comes from the verified email against `OWNER_EMAIL` and
 * NEVER from anything the client can set. `email` is normalized to lowercase to
 * match how the owner allowlist is compared.
 */
export function buildProfileRow(
  user: ProfileIdentity,
  ownerAllowlist: string | null | undefined,
): ProfileRow {
  return {
    id: user.id,
    email: user.email ? user.email.trim().toLowerCase() : null,
    role: roleForEmail(user.email, ownerAllowlist),
  };
}

/**
 * Upsert the user's profile on sign-in and, for the owner, run the one-time
 * Phase-1 data backfill. Uses the SERVICE-ROLE client because:
 *   • profile role assignment must not be client-controllable (no self-elevation),
 *   • the owner-claim reads/writes rows that RLS hides from a normal session
 *     (NULL-owner Phase-1 rows are invisible to every authenticated user).
 * Idempotent: the upsert re-derives role from `OWNER_EMAIL` (self-healing) and the
 * claim function is a no-op on re-run. Never throws into the auth flow — a backfill
 * hiccup must not block sign-in; it self-heals on the next sign-in. Returns the
 * resolved role so callers can log/branch if needed.
 */
export async function syncProfileOnSignIn(
  user: ProfileIdentity,
  serviceClient: SupabaseClient = getServerClient(),
): Promise<UserRole> {
  const row = buildProfileRow(user, process.env.OWNER_EMAIL);

  const { error: upsertError } = await serviceClient
    .from("profiles")
    .upsert(row, { onConflict: "id" });
  if (upsertError) {
    // Log-and-continue: sign-in must succeed even if the profile write hiccups.
    console.error(`Profile upsert failed for ${user.id}: ${upsertError.message}`);
    return row.role;
  }

  if (row.role === "owner") {
    const { error: claimError } = await serviceClient.rpc("claim_owner_data", {
      p_owner: user.id,
    });
    if (claimError) {
      console.error(`Owner backfill failed for ${user.id}: ${claimError.message}`);
    }
  }

  return row.role;
}
