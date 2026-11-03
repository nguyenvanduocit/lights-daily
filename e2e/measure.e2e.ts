import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { cell, readBoard, solve } from "./board";

const ABACUS = "https://abacus.jasoncameron.dev";
const FAKE_PORT = 4792;

/**
 * Abacus as the browser reaches it: the game's real URL, resolved to a local HTTPS server. A keepalive request sent on
 * pagehide leaves after its page is gone, where Playwright's request events and routes no longer see it, so the test
 * reads it where it lands. The real Abacus is never reached.
 */
test.use({
  launchOptions: {
    args: [`--host-resolver-rules=MAP abacus.jasoncameron.dev:443 127.0.0.1:${FAKE_PORT}`, "--ignore-certificate-errors"],
  },
});

/** What the fake Abacus received: method, path and headers of every request. */
const received: { method: string; url: string; headers: Record<string, unknown> }[] = [];
let server: Server;

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "fake-abacus-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=abacus.jasoncameron.dev",
    "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  server = createServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (req, res) => {
    received.push({ method: req.method!, url: ABACUS + req.url, headers: req.headers });
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" }).end('{"value":1}');
  });
  await new Promise<void>((resolve) => server.listen(FAKE_PORT, "127.0.0.1", resolve));
});
test.afterAll(() => void server.close());
test.beforeEach(() => void (received.length = 0));

/** Today's local 'YYYY-MM-DD', built from the spec rather than from the app's code. */
function today(): string {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Hides the game by leaving it, which fires pagehide, then lets the keepalive request land. Headless Chromium keeps
 * every page "visible" (another tab brought to the front, Target.activateTarget and a window.open popup all leave it
 * visible), so the visibilitychange path is covered by the unit tests in src/measure.
 */
async function leave(page: Page): Promise<void> {
  await page.goto("about:blank");
  await page.waitForTimeout(1000); // a missing request has no event to wait for; one second is ample on loopback
}

/**
 * Playwright sets navigator.webdriver, which the game counts as an agent and never measures. Reading it as false
 * makes the page look like a player's browser, so the shipped bundle measures as it does for a player.
 */
const asPlayer = (page: Page) =>
  page.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));

test("a real-UI solve sends exactly one request, to <date>-s, and only when the page is hidden", async ({ page }) => {
  await asPlayer(page);
  await page.goto("/");

  for (const index of solve(await readBoard(page))) await cell(page, index).click();
  await expect(page.getByRole("status")).toContainText("Solved in");
  await page.waitForTimeout(500);
  expect(received).toEqual([]);

  await leave(page);
  expect(received.map((r) => `${r.method} ${r.url}`)).toEqual([`GET ${ABACUS}/hit/lights-daily-plays/${today()}-s`]);
  const [{ headers }] = received;
  console.log(`analytics request as Abacus receives it: ${received[0].method} ${received[0].url}\n  headers: ${JSON.stringify(headers)}`);
  expect(headers).not.toHaveProperty("cookie");
  expect(headers).not.toHaveProperty("referer");
});

test("a fresh visit: every request listed, none to the counter before hide, one -v after leaving", async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  context.on("request", (request) => requests.push(`${request.method()} ${request.url()}`));
  await asPlayer(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  console.log(`requests on load (${requests.length}):\n${requests.map((r) => `  ${r}`).join("\n")}`);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((r) => new URL(r.split(" ")[1]).origin !== new URL(baseURL!).origin)).toEqual([]);
  expect(received).toEqual([]);

  await leave(page);
  const atAbacus = received.map((r) => `${r.method} ${r.url}`);
  console.log(`requests Abacus received after leaving (${atAbacus.length}):\n${atAbacus.map((r) => `  ${r}`).join("\n")}`);
  expect(atAbacus).toEqual([`GET ${ABACUS}/hit/lights-daily-plays/${today()}-v`]);
});

test("under webdriver, leaving sends nothing", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => navigator.webdriver)).toBe(true);

  await leave(page);
  expect(received).toEqual([]);
});
