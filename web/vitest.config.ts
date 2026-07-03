import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    alias: {
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
