import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { NAMESPACE } from "../src/measure/visit";

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
 * `flaky` makes the first calls on a key go as the network does: "hang" never answers (the read times out), "drop"
 * closes the connection unanswered, "slow" answers after SLOW_MS. `hangAll` makes every call hang.
 */
type Fault = "hang" | "drop" | "slow";
interface FakeOptions {
  failKey?: string;
  unlimited?: boolean;
  flaky?: Record<string, Fault[]>;
  hangAll?: boolean;
}
/** A slow but healthy live read: 4 s is about the p90 measured live on 2026-11-05. */
const SLOW_MS = 4000;
function fakeAbacus(counts: Record<string, number>, opts: FakeOptions = {}) {
  const seen: { path: string; at: number; status: number | Fault }[] = [];
  const calls: Record<string, number> = {};
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
    const m = /^\/get\/lights-daily-plays\/([\w-]+)$/.exec(req.url!);
    if (!m || req.method !== "GET") return answer(400, '{"error":"bad route"}');
    const fault = opts.hangAll ? "hang" : opts.flaky?.[m[1]]?.[(calls[m[1]] = (calls[m[1]] ?? 0) + 1) - 1];
    if (fault === "slow") return void setTimeout(() => respond(m[1], answer), SLOW_MS);
    if (fault) {
      seen.push({ path: req.url!, at: Date.now(), status: fault });
      if (fault === "drop") req.socket.destroy();
      return;
    }
    respond(m[1], answer);
  });
  function respond(key: string, answer: (status: number, body: string) => void) {
    if (key === opts.failKey) return answer(500, '{"error":"boom"}');
    if (!(key in counts)) return answer(404, '{"error":"Key not found"}');
    answer(200, JSON.stringify({ value: counts[key] }));
  }
  return { server, seen };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

let server: Server | undefined;
afterEach(() => {
  server?.closeAllConnections();
  server?.close();
});

/** Runs the script as the `script` plugin does: the code after its first line, `node -e`, no host environment. */
async function pull(
  counts: Record<string, number>,
  opts: Omit<FakeOptions, "unlimited"> & { quietMs?: number; budgetMs?: number } = {},
) {
  const { quietMs, budgetMs, ...fake } = opts;
  const abacus = fakeAbacus(counts, { ...fake, unlimited: quietMs === 0 || fake.hangAll });
  server = abacus.server;
  const [runtime, ...code] = SCRIPT.split("\n");
  expect(runtime).toBe("#!node");
  const env: Record<string, string> = { PATH: process.env.PATH!, ABACUS_URL: await listen(abacus.server) };
  if (quietMs !== undefined) env.ABACUS_QUIET_MS = String(quietMs);
  if (budgetMs !== undefined) env.SCRIPT_BUDGET_MS = String(budgetMs);
  const started = Date.now();
  const stdout = await new Promise<string>((resolve, reject) =>
    execFile("node", ["-e", code.join("\n")], { env }, (err, out) => (err ? reject(err) : resolve(out))),
  );
  const lines = stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
  return { lines, seen: abacus.seen, ms: Date.now() - started };
}

describe("lights-daily-pull.mjs", () => {
  it("reads the namespace the game writes to (the script stays self-contained, so it holds its own copy)", () => {
    expect(/^const NS = "([^"]+)";$/m.exec(SCRIPT)?.[1]).toBe(NAMESPACE);
  });

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
    const expected = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => STEPS.map((s) => `/get/lights-daily-plays/${day(d)}-${s}`));
    expect(seen.map((s) => s.path).sort()).toEqual(expected.sort());
  });

  it("every key missing gives all zeros, and a 404 is not read again", async () => {
    const { lines, seen } = await pull({}, { quietMs: 0 });
    expect(seen).toHaveLength(35);
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe(`counts:${day(0)}:0-0-0-0-0-0-0-0`);
    expect(Object.values(lines[0].body).slice(1)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("an error other than 404 prints an error line naming the key, and no item", async () => {
    const { lines, seen } = await pull({}, { failKey: `${day(2)}-sc`, quietMs: 0 });
    expect(lines).toEqual([{ error: "abacus answered HTTP 500", target: `${day(2)}-sc` }]);
    expect(seen.filter((s) => s.path.endsWith(`/${day(2)}-sc`))).toHaveLength(1);
  });

  it("a read that answers in 4 s, as a live p90 read does, is a success and is not tried again", async () => {
    const counts = { [`${day(0)}-s`]: 3, [`${day(6)}-scf`]: 2 };
    const { lines, seen } = await pull(counts, { quietMs: 0, flaky: { [`${day(0)}-s`]: ["slow"], [`${day(6)}-scf`]: ["slow"] } });
    expect(lines).toHaveLength(1);
    expect(lines[0].id).toBe(`counts:${day(0)}:3-3-0-0-5-5-2-2`);
    expect(seen).toHaveLength(35);
  }, 30_000);

  it("a read that times out or loses its connection is tried once more, and the pull still prints the counts", async () => {
    const counts = { [`${day(0)}-s`]: 3, [`${day(1)}-v`]: 4, [`${day(6)}-scf`]: 2 };
    const flaky: Record<string, Fault[]> = {
      [`${day(0)}-s`]: ["drop"],
      [`${day(1)}-v`]: ["hang"],
      [`${day(6)}-scf`]: ["hang"],
    };
    const { lines, seen, ms } = await pull(counts, { flaky });
    console.log(`flaky pull: ${seen.length} GETs in ${ms} ms, statuses ${[...new Set(seen.map((s) => s.status))]}`);
    expect(lines).toEqual([{
      id: `counts:${day(0)}:3-3-0-0-9-5-2-2`,
      body: {
        date: day(0),
        views_today: 3, sessions_solved_today: 3, share_copies_today: 0, feedback_clicks_today: 0,
        views_7d: 9, sessions_solved_7d: 5, share_copies_7d: 2, feedback_clicks_7d: 2,
      },
    }]);
    const callsOn = (key: string) => seen.filter((s) => s.path.endsWith(`/${key}`)).length;
    expect([callsOn(`${day(0)}-s`), callsOn(`${day(1)}-v`), callsOn(`${day(6)}-scf`)]).toEqual([2, 2, 2]);
    expect(seen.filter((s) => s.status === 429)).toEqual([]);
    expect(ms).toBeLessThan(27_000);
  }, 30_000);

  it("worst case, a read in each burst times out and the last one twice: the error line still comes inside 27 s", async () => {
    // Keys are read today first, 18 to a burst: today's -v is in the first, the oldest day's -scf in the second.
    // The first burst's retry is its last request, so the second burst starts 11 s after it.
    const flaky: Record<string, Fault[]> = { [`${day(0)}-v`]: ["hang"], [`${day(6)}-scf`]: ["hang", "hang"] };
    const { lines, seen, ms } = await pull({}, { flaky });
    console.log(`worst case: ${seen.length} GETs, error line after ${ms} ms`);
    expect(lines).toEqual([{ error: "abacus unreachable: TimeoutError", target: `${day(6)}-scf` }]);
    expect(seen.filter((s) => s.path.endsWith(`/${day(6)}-scf`))).toHaveLength(2);
    expect(seen.filter((s) => s.status === 429)).toEqual([]);
    expect(ms).toBeLessThan(27_000);
  }, 40_000);

  it("an Abacus that never answers gives an error line, after 2 tries of a read, inside the poll's 27 s", async () => {
    const { lines, seen, ms } = await pull({}, { hangAll: true });
    console.log(`hanging Abacus: ${seen.length} GETs, error line after ${ms} ms`);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      error: "abacus unreachable: TimeoutError",
      target: expect.stringMatching(/^\d{4}-\d\d-\d\d-(v|s|sc|sf|scf)$/),
    });
    expect(seen.filter((s) => s.path.endsWith(`/${lines[0].target}`))).toHaveLength(2);
    expect(ms).toBeLessThan(27_000);
  }, 40_000);

  it("a shorter budget from the plugin (SCRIPT_BUDGET_MS) cuts the retry short, so the error line still comes in time", async () => {
    const { lines, ms } = await pull({}, { hangAll: true, budgetMs: 9000 });
    console.log(`hanging Abacus, 9 s budget: error line after ${ms} ms`);
    expect(lines).toHaveLength(1);
    expect(lines[0].error).toBe("abacus unreachable: TimeoutError");
    expect(ms).toBeLessThan(9000);
  }, 20_000);

  it("the fake limits as Abacus does: 30 hits back to back, then 429", async () => {
    const abacus = fakeAbacus({});
    server = abacus.server;
    const base = await listen(abacus.server);
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await fetch(`${base}/get/lights-daily-plays/xxx`)).status);
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
