import Link from "next/link";

import { getSessionUser } from "@/lib/auth/session";

const LINK = "text-muted transition-colors hover:text-ink";

/**
 * Masthead identity affordance. Anonymous → a "Sign in" link (the feed itself
 * stays public). Signed-in → the account email (with an "owner" marker) and a
 * POST sign-out. Server component: reads the verified session directly.
 */
export async function AuthStatus() {
  const user = await getSessionUser();

  if (!user) {
    return (
      <Link href="/sign-in" className={LINK}>
        Sign in
      </Link>
    );
  }

  const label = user.email ?? "Account";

  return (
    <span className="flex items-center gap-2 normal-case tracking-normal">
      <span className="hidden text-faint sm:inline" title={user.role === "owner" ? "Owner" : "Member"}>
        {label}
        {user.role === "owner" ? " · owner" : ""}
      </span>
      <form action="/auth/signout" method="post">
        <button type="submit" className={LINK}>
          Sign out
        </button>
      </form>
    </span>
  );
}
