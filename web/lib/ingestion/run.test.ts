import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { runIngestion } from "./run";
import type { IngestionResult } from "./types";
import type { PersistOutcome } from "./persist";
import type { Connector } from "./types";
import type { SourceRow } from "../supabase/types";

/** Build a SourceRow with sensible defaults; override only what a test cares about. */
function src(partial: Partial<SourceRow>): SourceRow {
  return {
    id: "src",
    name: "Source",
    category: "Research Papers",
    url: "https://example.com/feed",
    ingestion_type: "rss",
    status: "active",
    priority: 1,
    tags: [],
    notes: null,
    added_on: "2026-01-01T00:00:00Z",
    last_fetched: null,
    refresh_interval: "1 day",
    ...partial,
  };
}

/** Fake Supabase client whose `sources` query resolves to the given rows. */
function makeClient(sources: SourceRow[], queryError?: string): SupabaseClient {
  const filters: Record<string, string> = {};
  const builder = {
    select() {
      return builder;
    },
    eq(col: string, val: string) {
      filters[col] = val;
      return builder;
    },
    then(resolve: (r: { data: SourceRow[] | null; error: { message: string } | null }) => void) {
      if (queryError) return resolve({ data: null, error: { message: queryError } });
      let rows = sources;
      if (filters.status) rows = rows.filter((s) => s.status === filters.status);
      if (filters.id) rows = rows.filter((s) => s.id === filters.id);
      return resolve({ data: rows, error: null });
    },
  };
  return { from: () => builder } as unknown as SupabaseClient;
}

/** Connector that throws for a "boom" source and otherwise returns N items. */
const connector: Connector = async (source): Promise<IngestionResult> => {
  if (source.id === "boom") throw new Error("connector exploded");
  const count = source.id === "two" ? 2 : 3;
  return {
    sourceId: source.id,
    warnings: [],
    items: Array.from({ length: count }, (_, i) => ({
      title: `Item ${i}`,
      url: `${source.url}#${i}`,
      category: source.category,
    })),
  };
};

const resolveConnector = () => connector;
const persist = async (_c: SupabaseClient, r: IngestionResult): Promise<PersistOutcome> => ({
  added: r.items.length,
  skipped: 0,
  warnings: r.warnings,
});

const deps = { resolveConnector, persist };

describe("runIngestion", () => {
  it("does not let a throwing connector abort the run; records its error and continues", async () => {
    const client = makeClient([src({ id: "boom", name: "Boom" }), src({ id: "ok", name: "OK" })]);

    const summary = await runIngestion(client, deps);

    const boom = summary.perSource.find((r) => r.source === "Boom");
    const ok = summary.perSource.find((r) => r.source === "OK");
    expect(boom?.error).toMatch(/exploded/);
    expect(boom?.added).toBe(0);
    expect(ok?.added).toBe(3);
    expect(summary.added).toBe(3); // only OK contributed
    expect(summary.sources).toBe(2);
  });

  it("aggregates added counts across sources", async () => {
    const client = makeClient([src({ id: "two", name: "Two" }), src({ id: "three", name: "Three" })]);

    const summary = await runIngestion(client, deps);

    expect(summary.added).toBe(5); // 2 + 3
    expect(summary.sources).toBe(2);
  });

  it("with dueOnly, skips sources that are not yet due", async () => {
    const now = new Date("2026-07-03T12:00:00Z");
    const notDue = src({
      id: "fresh",
      name: "Fresh",
      last_fetched: "2026-07-03T11:00:00Z", // 1h ago, interval 1 day → not due
      refresh_interval: "1 day",
    });
    const due = src({ id: "stale", name: "Stale", last_fetched: null }); // never fetched → due
    const client = makeClient([notDue, due]);

    const summary = await runIngestion(client, { ...deps, dueOnly: true, now });

    expect(summary.perSource.map((r) => r.source)).toEqual(["Stale"]);
    expect(summary.sources).toBe(1);
  });

  it("runs everything when dueOnly is false", async () => {
    const now = new Date("2026-07-03T12:00:00Z");
    const fresh = src({ id: "fresh", name: "Fresh", last_fetched: "2026-07-03T11:00:00Z" });
    const client = makeClient([fresh]);

    const summary = await runIngestion(client, { ...deps, now });

    expect(summary.sources).toBe(1);
  });

  it("excludes non-active sources (status filter)", async () => {
    const client = makeClient([
      src({ id: "a", name: "Active" }),
      src({ id: "p", name: "Paused", status: "paused" }),
    ]);

    const summary = await runIngestion(client, deps);

    expect(summary.perSource.map((r) => r.source)).toEqual(["Active"]);
  });

  it("filters to a single source id", async () => {
    const client = makeClient([src({ id: "a", name: "A" }), src({ id: "b", name: "B" })]);

    const summary = await runIngestion(client, { ...deps, sourceId: "b" });

    expect(summary.perSource.map((r) => r.source)).toEqual(["B"]);
  });

  it("warns (does not throw) for a source whose ingestion_type has no connector", async () => {
    const client = makeClient([src({ id: "s", name: "Scraper", ingestion_type: "scrape" })]);

    const summary = await runIngestion(client, {
      ...deps,
      resolveConnector: () => null,
    });

    expect(summary.perSource[0].warnings[0]).toMatch(/No connector for ingestion_type 'scrape'/);
    expect(summary.added).toBe(0);
  });

  it("throws when the sources query errors", async () => {
    const client = makeClient([], "db unreachable");
    await expect(runIngestion(client, deps)).rejects.toThrow(/db unreachable/);
  });
});
