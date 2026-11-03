import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

const SCRIPT = readFileSync(new URL("./lights-daily-pull.mjs", import.meta.url), "utf8");
const STEPS = ["v", "s", "sc", "sf", "scf"];

/** Local 'YYYY-MM-DD', `daysAgo` days before now. */
function day(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A local Abacus: `/get/<ns>/<key>` answers a stored count or 404; anything else is recorded and refused. Its rate limit
 * is Abacus's own (gin-rate-limit's Redis store, 30 hits, rate 10 s): the count resets only once 10 whole seconds have
 * passed since the last allowed hit, and a refused hit does not move that time. `unlimited` turns it off.
 */
function fakeAbacus(counts: Record<string, number>, opts: { failKey?: string; unlimited?: boolean } = {}) {
  const seen: { path: string; at: number; status: number }[] = [];
  let last = 0;
  let hits = 0;
  const server = createServer((req, res) => {
    const now = Math.floor(Date.now() / 1000);
    if (last + 10 <= now) hits = 0;
    const answer = (status: number, body: string) => {
      seen.push({ path: req.url!, at: Date.now(), status });
      res.writeHead(status, { "content-type": "application/json" }).end(body);
    };
    if (hits >= 30 && !opts.unlimited) return answer(429, '{"error":"Too many requests."}');
    hits++;
    last = now;
    const m = /^\/get\/lights-daily-nvd\/([\w-]+)$/.exec(req.url!);
    if (!m || req.method !== "GET") return answer(400, '{"error":"bad route"}');
    if (m[1] === opts.failKey) return answer(500, '{"error":"boom"}');
    if (!(m[1] in counts)) return answer(404, '{"error":"Key not found"}');
    answer(200, JSON.stringify({ value: counts[m[1]] }));
  });
  return { server, seen };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

let server: Server | undefined;
afterEach(() => void server?.close());

/** Runs the script as the `script` plugin does: the code after its first line, `node -e`, no host environment. */
async function pull(counts: Record<string, number>, opts: { failKey?: string; quietMs?: number } = {}) {
  const abacus = fakeAbacus(counts, { failKey: opts.failKey, unlimited: opts.quietMs === 0 });
  server = abacus.server;
  const [runtime, ...code] = SCRIPT.split("\n");
  expect(runtime).toBe("#!node");
  const env: Record<string, string> = { PATH: process.env.PATH!, ABACUS_URL: await listen(abacus.server) };
  if (opts.quietMs !== undefined) env.ABACUS_QUIET_MS = String(opts.quietMs);
  const started = Date.now();
  const stdout = await new Promise<string>((resolve, reject) =>
    execFile("node", ["-e", code.join("\n")], { env }, (err, out) => (err ? reject(err) : resolve(out))),
  );
  const lines = stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
  return { lines, seen: abacus.seen, ms: Date.now() - started };
}

describe("lights-daily-pull.mjs", () => {
  it("prints one item with today's and the 7-day counts; a missing key is 0", async () => {
    const counts = {
      [`${day(0)}-v`]: 5, [`${day(0)}-s`]: 3, [`${day(0)}-sc`]: 2, [`${day(0)}-sf`]: 1, [`${day(0)}-scf`]: 4,
      [`${day(3)}-v`]: 10, [`${day(3)}-scf`]: 1,
      [`${day(6)}-sc`]: 7,
      [`${day(7)}-v`]: 1000, // outside the 7 days
    };
    const { lines, seen } = await pull(counts, { quietMs: 0 });
    expect(lines).toEqual([
      {
        id: `counts:${day(0)}:15-10-6-5-33-18-14-6`,
        body: {
          date: day(0),
          views_today: 15, sessions_solved_today: 10, share_copies_today: 6, feedback_clicks_today: 5,
          views_7d: 33, sessions_solved_7d: 18, share_copies_7d: 14, feedback_clicks_7d: 6,
        },
      },
    ]);
    // Reads only: 7 days x 5 steps, every one a /get.
    const expected = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => STEPS.map((s) => `/get/lights-daily-nvd/${day(d)}-${s}`));
    expect(seen.map((s) => s.path).sort()).toEqual(expected.sort());
  });

  it("every key missing gives all zeros", async () => {
    const { lines } = await pull({}, { quietMs: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe(`counts:${day(0)}:0-0-0-0-0-0-0-0`);
    expect(Object.values(lines[0].body).slice(1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("an error other than 404 prints an error line naming the key, and no item", async () => {
    const { lines } = await pull({}, { failKey: `${day(2)}-sc`, quietMs: 0 });
    expect(lines).toEqual([{ error: "abacus answered HTTP 500", target: `${day(2)}-sc` }]);
  });

  it("the fake limits as Abacus does: 30 hits back to back, then 429", async () => {
    const abacus = fakeAbacus({});
    server = abacus.server;
    const base = await listen(abacus.server);
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await fetch(`${base}/get/lights-daily-nvd/xxx`)).status);
    expect(statuses).toEqual([...Array(30).fill(404), 429]);
  });

  it("with its default pacing it is never refused by Abacus's limit and ends inside the poll's 27 s", async () => {
    const { lines, seen, ms } = await pull({});
    console.log(`35 GETs in ${ms} ms, statuses ${[...new Set(seen.map((s) => s.status))]}`);
    expect(lines).toHaveLength(1);
    expect(seen).toHaveLength(35);
    expect(seen.filter((s) => s.status === 429)).toEqual([]);
    expect(ms).toBeLessThan(27_000);
  }, 30_000);
});
