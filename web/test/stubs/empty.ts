// Test stub for Next's `server-only` / `client-only` marker packages, which are
// build-time shims with no node-resolvable module. Aliased in vitest.config.ts
// so server modules (e.g. lib/feed/queries.ts) can be imported in unit tests.
export {};
