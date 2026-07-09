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
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Settings
          </h1>
          <Link
            href="/feed"
            className="text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
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
          <SettingsForm initial={settings} />
        )}
      </main>

      <footer className="border-t border-rule py-5 text-xs text-faint">
        AI Chronicles · Settings · Phase 1
      </footer>
    </div>
  );
}
