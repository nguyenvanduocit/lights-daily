import { defineConfig, devices } from "@playwright/test";

const PORT = 4791;

// Drives the built page (dist/) served by `vite preview`; `npm run e2e` builds first.
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts", // not *.spec.ts, which vitest would also pick up
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}/`,
    permissions: ["clipboard-read", "clipboard-write"],
    // The real play counter is unreachable from tests (a keepalive request sent on pagehide escapes page.route).
    launchOptions: { args: ["--host-resolver-rules=MAP abacus.jasoncameron.dev ~NOTFOUND"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
  },
});
