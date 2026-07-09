import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `lib/` holds the tested logic; route handlers (thin orchestration over
    // that logic) are covered under `app/` in the same node env — they use web
    // Request/Response + mocked deps, no DOM. Visual components are verified via
    // typecheck + E2E, not jsdom units (repo convention).
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    alias: {
      // Mirror the `@/*` → project-root path alias from tsconfig so route tests
      // can import via `@/lib/...` exactly like the app does.
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `server-only`/`client-only` are Next build shims with no node module;
      // stub them so server files can be imported in unit tests.
      "server-only": fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url)),
      "client-only": fileURLToPath(new URL("./test/stubs/empty.ts", import.meta.url)),
    },
    coverage: {
      provider: "v8",
      include: ["lib/ingestion/**/*.ts"],
      exclude: ["lib/**/*.test.ts", "lib/**/__fixtures__/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
