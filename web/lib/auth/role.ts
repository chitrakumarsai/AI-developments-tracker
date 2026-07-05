/**
 * Owner-role derivation (2.1). The owner is designated by an `OWNER_EMAIL`
 * allowlist (comma-separated to allow more than one), matched case-insensitively
 * against the *verified* session email. This is a pure function so it can be unit
 * tested; the caller reads `process.env.OWNER_EMAIL` server-side and passes it in.
 * The role is NEVER derived from client input (CLAUDE.md §21).
 */
export type UserRole = "owner" | "member";

export function roleForEmail(
  email: string | null | undefined,
  ownerAllowlist: string | null | undefined,
): UserRole {
  if (!email || !ownerAllowlist) return "member";

  const normalized = email.trim().toLowerCase();
  if (!normalized) return "member";

  const owners = ownerAllowlist
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return owners.includes(normalized) ? "owner" : "member";
}
