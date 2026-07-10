"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AppSettings } from "@/lib/settings/types";
import { MAX_TOP_PER_SOURCE_DAY } from "@/lib/settings/types";

/** Slider ceiling for the metric floor — covers most upvote/star thresholds. */
const MIN_METRIC_SLIDER_MAX = 5_000;
const MIN_METRIC_SLIDER_STEP = 50;

/** "agents, rl" ⇄ ["agents","rl"] for the comma-separated keyword inputs. */
function parseKeywords(raw: string): string[] {
  return raw
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Edit the feed settings. Slice B exposes the per-source daily cap — the single
 * biggest "don't overwhelm me" lever. The form keeps the full settings object in
 * state and saves it whole, so later controls (keywords, metric floor) slot in
 * without changing the save path.
 */
export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  // Empty input = "unlimited" (null cap).
  const capValue = settings.topPerSourceDay ?? "";

  function setCap(raw: string) {
    const n = Number.parseInt(raw, 10);
    setSettings((s) => ({
      ...s,
      topPerSourceDay: Number.isNaN(n) ? null : Math.min(Math.max(n, 1), MAX_TOP_PER_SOURCE_DAY),
    }));
    setSaved(false);
  }

  function setMinMetric(raw: string) {
    const n = Number.parseInt(raw, 10);
    // 0 on the slider means "no floor" (null).
    setSettings((s) => ({ ...s, minMetric: !n || n <= 0 ? null : n }));
    setSaved(false);
  }

  function setKeywords(field: "includeKeywords" | "excludeKeywords", raw: string) {
    setSettings((s) => ({ ...s, [field]: parseKeywords(raw) }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setSaved(true);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 border border-rule rounded-[var(--radius-md)] p-4">
        <label htmlFor="cap" className="text-sm font-medium text-ink">
          Top items per source, per day
        </label>
        <p className="text-xs text-muted">
          Caps how many items any single source (arXiv, a subreddit, a blog) can add to
          the feed each day, so no one source floods it. Leave blank for unlimited.
        </p>
        <input
          id="cap"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_TOP_PER_SOURCE_DAY}
          value={capValue}
          onChange={(e) => setCap(e.target.value)}
          placeholder="Unlimited"
          className="min-h-[44px] w-28 rounded-[var(--radius-md)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-2 border border-rule rounded-[var(--radius-md)] p-4">
        <label htmlFor="include" className="text-sm font-medium text-ink">
          Include keywords
        </label>
        <p className="text-xs text-muted">
          Comma-separated. When set, only items mentioning one of these (in the title,
          summary, or tags) are shown. Leave blank to show everything.
        </p>
        <input
          id="include"
          type="text"
          value={settings.includeKeywords.join(", ")}
          onChange={(e) => setKeywords("includeKeywords", e.target.value)}
          placeholder="agents, rl, vision"
          className="min-h-[44px] rounded-[var(--radius-md)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-2 border border-rule rounded-[var(--radius-md)] p-4">
        <label htmlFor="exclude" className="text-sm font-medium text-ink">
          Exclude keywords
        </label>
        <p className="text-xs text-muted">
          Comma-separated. Items mentioning any of these are hidden from the feed.
        </p>
        <input
          id="exclude"
          type="text"
          value={settings.excludeKeywords.join(", ")}
          onChange={(e) => setKeywords("excludeKeywords", e.target.value)}
          placeholder="crypto, nft"
          className="min-h-[44px] rounded-[var(--radius-md)] border border-rule bg-transparent px-3 text-sm text-ink placeholder:text-faint focus:border-accent"
        />
      </div>

      <div className="flex flex-col gap-2 border border-rule rounded-[var(--radius-md)] p-4">
        <label htmlFor="min-metric" className="text-sm font-medium text-ink">
          Minimum stars / upvotes
          <span className="ml-2 font-normal text-muted">
            {settings.minMetric ?? "off"}
          </span>
        </label>
        <p className="text-xs text-muted">
          Hide low-traction repos, models, and discussion posts below this number. Papers
          and blogs (which have no such metric) are always kept.
        </p>
        <input
          id="min-metric"
          type="range"
          min={0}
          max={MIN_METRIC_SLIDER_MAX}
          step={MIN_METRIC_SLIDER_STEP}
          value={settings.minMetric ?? 0}
          onChange={(e) => setMinMetric(e.target.value)}
          className="accent-[var(--color-accent)]"
          aria-valuetext={settings.minMetric ? `${settings.minMetric}` : "off"}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex min-h-[44px] items-center rounded-[var(--radius-md)] bg-accent px-5 text-sm font-medium text-accent-ink shadow-card transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Save settings
        </button>
        {saved ? (
          <span role="status" className="text-xs text-muted">
            Saved · feed updated
          </span>
        ) : null}
        {error ? (
          <span role="alert" className="text-xs text-red-600">
            Couldn’t save — try again
          </span>
        ) : null}
      </div>
    </form>
  );
}
