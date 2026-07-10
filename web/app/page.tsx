import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";

import { TeaserList } from "@/components/landing/TeaserList";
import { getTeaserItems, TEASER_LIMIT } from "@/lib/seo/teaser";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { redirect } from "next/navigation";
import {
  siteUrl,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
} from "@/lib/seo/site";
import type { ItemRow } from "@/lib/supabase/types";

// The teaser reflects live database state, so render per-request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // The landing is the canonical root.
  alternates: { canonical: "/" },
};

const VALUE_PROPS: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: "One radar, every source",
    body: "Papers, repos, models, company labs, and the social noise — watched for you, in one place.",
  },
  {
    title: "Signal, not scroll",
    body: "It surfaces the one thing worth reading right now, so you never open a feed just to get lost in it.",
  },
  {
    title: "Read at the source",
    body: "Every item links straight to the original. The Chronicles is the filter and the index — not another wall to scroll.",
  },
];

// Static editorial index for the hero right rail — real product scope (§3),
// non-interactive: it fills the width without adding anything clickable.
const WATCHES: ReadonlyArray<string> = [
  "Research papers & preprints",
  "GitHub repositories",
  "New models & benchmarks",
  "Company & lab releases",
  "People worth following",
  "Products & tools",
  "Newsletters & blogs",
  "Video & podcasts",
];

const CTA_PRIMARY =
  "inline-flex min-h-[48px] items-center justify-center rounded-[var(--radius-md)] bg-accent px-6 text-sm font-medium text-accent-ink shadow-card transition-opacity hover:opacity-90";
const CTA_SECONDARY =
  "inline-flex min-h-[48px] items-center justify-center rounded-[var(--radius-sm)] border border-rule px-6 text-sm font-medium text-ink transition-colors hover:border-accent hover:text-accent";

// One wide editorial measure for every band; sections go full-bleed, content
// is held to this container so rules and grids line up across the page.
const CONTAINER = "mx-auto w-full max-w-6xl px-[var(--space-gutter)]";

export default async function Landing() {
  // One request-scoped client, reused for the auth check + teaser fetch.
  const client = await createServerSupabaseClient();

  // Signed-in visitors don't need the marketing surface — send them to the app.
  // `getUser()` re-validates the token; `redirect()` throws, so it must stay out
  // of the teaser try/catch below (a catch-all would swallow the redirect).
  const {
    data: { user },
  } = await client.auth.getUser();
  if (user) redirect("/feed");

  // Anonymous teaser: served via the service-role client (anon can no longer read
  // items/sources after 2.4's RLS tightening). Never let a DB hiccup break the
  // (indexable) landing.
  let teaser: ItemRow[] = [];
  try {
    teaser = await getTeaserItems();
  } catch {
    teaser = [];
  }

  // JSON-LD is built only from trusted brand strings (no ingested content).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: siteUrl(),
    description: SITE_DESCRIPTION,
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: siteUrl(),
    },
  };

  return (
    <div className="flex w-full flex-1 flex-col">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <header className="border-b border-rule">
        <div className={`${CONTAINER} flex items-center justify-between py-6`}>
          <p className="font-display text-lg font-semibold tracking-tight text-ink">
            <span className="text-accent">✦</span> {SITE_NAME}
          </p>
          <Link
            href="/sign-in"
            className="text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section aria-labelledby="hero-heading" className="border-b border-rule">
          <div
            className={`${CONTAINER} grid gap-12 py-[clamp(3rem,7vw,7rem)] lg:grid-cols-12`}
          >
            <div className="lg:col-span-7">
              <p className="text-xs uppercase tracking-[0.24em] text-accent">
                {SITE_TAGLINE}
              </p>
              <h1
                id="hero-heading"
                className="mt-4 font-display text-[clamp(2.5rem,6vw,5rem)] font-semibold leading-[1.02] tracking-tight text-ink"
              >
                The one thing in AI worth reading right now.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
                {SITE_NAME}{" "}watches papers, repositories, models, and the feeds
                so you don&rsquo;t have to — then points you straight to what
                matters.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/sign-in" className={CTA_PRIMARY}>
                  Get started — it&rsquo;s free
                </Link>
                <Link href="/sign-in" className={CTA_SECONDARY}>
                  Sign in
                </Link>
              </div>
              <p className="mt-4 text-sm text-faint">
                Sign in or create an account to unlock the top-rated, personalized
                feed.
              </p>
            </div>

            <aside
              aria-label="What the radar covers"
              className="lg:col-span-5 lg:border-l lg:border-rule lg:pl-10"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-faint">
                The radar covers
              </p>
              <ul className="mt-4">
                {WATCHES.map((label, index) => (
                  <li
                    key={label}
                    className="flex items-baseline gap-3 border-t border-rule py-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="font-display text-xs tabular-nums text-faint"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm text-ink">{label}</span>
                  </li>
                ))}
              </ul>
            </aside>
          </div>
        </section>

        <section aria-label="What it does" className="border-b border-rule">
          <div
            className={`${CONTAINER} grid gap-8 py-[clamp(2.5rem,5vw,4rem)] md:grid-cols-3`}
          >
            {VALUE_PROPS.map((prop) => (
              <div key={prop.title}>
                <h2 className="font-display text-lg font-medium text-ink">
                  {prop.title}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {prop.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="teaser-heading">
          <div className={`${CONTAINER} py-[clamp(2.5rem,5vw,4rem)]`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2
                id="teaser-heading"
                className="font-display text-xl font-semibold text-ink"
              >
                A glimpse of the signal
              </h2>
              <p className="text-xs uppercase tracking-[0.14em] text-faint">
                Latest {TEASER_LIMIT} · preview
              </p>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
              A small taste of what&rsquo;s surfacing. Sign in to unlock the full,
              top-rated feed — filter it, rate it, and shape what it shows you.
            </p>

            <div className="mt-6">
              <TeaserList items={teaser} />
            </div>

            <div className="mt-10 rounded-[var(--radius-md)] border border-rule bg-sunken p-8 text-center">
              <p className="font-display text-xl text-ink">
                Want the top-rated, personalized feed?
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Sign up free to unlock every source, filters, likes, and saved
                views — tuned to what you care about.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Link href="/sign-in" className={CTA_PRIMARY}>
                  Create free account
                </Link>
                <Link href="/sign-in" className={CTA_SECONDARY}>
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule">
        <div className={`${CONTAINER} py-5 text-xs text-faint`}>
          {SITE_NAME} · {SITE_TAGLINE}
        </div>
      </footer>
    </div>
  );
}
