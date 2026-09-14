import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Node environment only: these suites cover pure logic and database
    // queries, not React rendering. A DOM environment would add cost without
    // testing anything the app actually relies on today.
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Integration tests share one Postgres database, so parallel files would
    // race on the same rows.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a React Server Component. It is
      // a build-time guard for the app, not a runtime dependency, so tests
      // stub it out to exercise the modules it protects.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
});
