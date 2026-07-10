import type { Metadata } from "next";
import Link from "next/link";

import { getSettings } from "@/lib/settings/persist";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { requireSession } from "@/lib/auth/gate";
import { createServerSupabaseClient } from "@/lib/supabase/ssr";
import { SettingsForm } from "@/components/settings/SettingsForm";

// Reflects live settings; render per-request.
export const dynamic = "force-dynamic";

// Gated app route (2.4): never index.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function SettingsPage() {
  // Gated app route (2.4): require a session before any per-user settings load.
  const user = await requireSession("/settings");

  let settings = DEFAULT_SETTINGS;
  let failed = false;
  try {
    const client = await createServerSupabaseClient();
    settings = await getSettings(user.id, client);
  } catch {
    failed = true;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)] lg:max-w-none lg:px-[clamp(2rem,4vw,4rem)]">
      <header className="border-b border-rule py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Settings
          </h1>
          <Link
            href="/feed"
            className="inline-flex min-h-[36px] items-center rounded-[var(--radius-md)] border border-rule bg-surface px-3 text-sm text-muted shadow-card transition-colors hover:border-muted hover:text-ink"
          >
            ← Feed
          </Link>
        </div>
        <p className="mt-2 text-sm text-muted">
          Tune how much reaches your feed. Changes apply the next time the feed loads.
        </p>
      </header>

      <main className="flex flex-1 flex-col py-6">
        {failed ? (
          <p className="py-[var(--space-section)] text-center text-sm text-muted">
            Could not reach the database. Make sure Supabase is configured.
          </p>
        ) : (
          <div className="rounded-[var(--radius-lg)] border border-rule bg-surface p-[var(--space-card)] shadow-card">
            <SettingsForm initial={settings} />
          </div>
        )}
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        AI Chronicles · Settings · Phase 1
      </footer>
    </div>
  );
}
