import "server-only";

import { redirect } from "next/navigation";

import { getSessionUser, type SessionUser } from "./session";
import { signInPath } from "./redirect";

/**
 * Server-side auth gate for the app routes (2.4). Anonymous visitors are
 * redirected to /sign-in (carrying where they were headed); signed-in users are
 * returned. This enforces the gate on the server — the public landing is the
 * only unauthenticated surface — so gating never depends on client rendering.
 */
export async function requireSession(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(signInPath(nextPath));
  return user;
}
