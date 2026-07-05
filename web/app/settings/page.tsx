import Link from "next/link";

import { getSettings } from "@/lib/settings/persist";
import { DEFAULT_SETTINGS } from "@/lib/settings/types";
import { SettingsForm } from "@/components/settings/SettingsForm";

// Reflects live settings; render per-request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  let settings = DEFAULT_SETTINGS;
  let failed = false;
  try {
    settings = await getSettings();
  } catch {
    failed = true;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-[var(--space-gutter)]">
      <header className="border-b border-rule py-6">
        <div className="flex items-baseline justify-between">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Settings
          </h1>
          <Link
            href="/"
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
