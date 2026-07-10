import Link from "next/link";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { signInAction } from "./actions";

export const dynamic = "force-dynamic";

const ERROR_COPY: Record<string, string> = {
  oauth: "Couldn’t start that sign-in. Try again.",
  email: "That doesn’t look like a valid email.",
  magic: "Couldn’t send the magic link. Try again.",
  callback: "Sign-in didn’t complete. Try again.",
  unknown: "Something went wrong. Try again.",
};

type SignInPageProps = {
  searchParams: Promise<{ error?: string; sent?: string; next?: string }>;
};

const PROVIDER_BUTTON =
  "flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-rule px-4 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent";

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);

  // Already signed in? Nothing to do here — send them where they were headed.
  const user = await getSessionUser();
  if (user) redirect(next);

  // `params.error` is attacker-controlled — look it up as an own-property only,
  // so `?error=__proto__` can't resolve to an inherited member and crash render.
  const errorMessage = params.error
    ? Object.hasOwn(ERROR_COPY, params.error)
      ? ERROR_COPY[params.error]
      : ERROR_COPY.unknown
    : null;
  const linkSent = params.sent === "1";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-1 flex-col justify-center px-[var(--space-gutter)] py-16">
      <div className="mb-8 text-center">
        <Link
          href="/"
          className="font-display text-2xl font-semibold tracking-tight text-ink"
        >
          <span className="text-accent">✦</span> The AI Chronicles
        </Link>
        <p className="mt-2 text-sm text-muted">
          Sign in or create an account to unlock the full radar — the top-rated,
          personalized feed, filters, likes, and saved views.
        </p>
      </div>

      {errorMessage ? (
        <p
          role="alert"
          className="mb-4 rounded-[var(--radius-sm)] border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {errorMessage}
        </p>
      ) : null}

      {linkSent ? (
        <p
          role="status"
          className="mb-4 rounded-[var(--radius-sm)] border border-accent bg-accent-soft px-3 py-2 text-sm text-ink"
        >
          Check your inbox — we sent you a magic link to finish signing in.
        </p>
      ) : null}

      <form action={signInAction} className="flex flex-col gap-3">
        <input type="hidden" name="redirectTo" value={next} />

        <button type="submit" name="intent" value="google" className={PROVIDER_BUTTON}>
          Continue with Google
        </button>
        <button type="submit" name="intent" value="github" className={PROVIDER_BUTTON}>
          Continue with GitHub
        </button>

        <div className="my-1 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-faint">
          <span className="h-px flex-1 bg-rule" />
          or
          <span className="h-px flex-1 bg-rule" />
        </div>

        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          className="min-h-[48px] rounded-[var(--radius-sm)] border border-rule bg-paper px-4 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-accent"
        />
        <button
          type="submit"
          name="intent"
          value="magic"
          className="min-h-[48px] rounded-[var(--radius-md)] bg-accent px-4 text-sm font-medium text-accent-ink shadow-card transition-opacity hover:opacity-90"
        >
          Send magic link
        </button>
      </form>

      <p className="mt-8 text-center text-xs text-faint">
        <Link href="/" className="transition-colors hover:text-muted">
          ← Back to home
        </Link>
      </p>
    </main>
  );
}
