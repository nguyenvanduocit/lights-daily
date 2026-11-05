#!node
// Lights Daily play counts for Mindchains' `script` pull (ADR-0044), which runs the code below this first line as
// `node -e` and reads each JSON line it prints. Reads only (GET /get) the game's public Abacus counters: one per local
// date and step (v viewed, s solved, sc + copied, sf + feedback clicked, scf all), for today and the 6 days before.
// Prints one item whose id carries the counts, so each change is a new item; a missing counter (404) is 0. A read that
// times out or cannot connect is tried once more; any other failure, or a second failed try, is an error line.
// ABACUS_URL and ABACUS_QUIET_MS exist for the test against a local fake Abacus.
const NS = "lights-daily-plays";
const BASE = process.env.ABACUS_URL ?? "https://abacus.jasoncameron.dev";
// Abacus limits each IP to 30 requests, and its count resets only after 10 s without one (gin-rate-limit's Redis store
// keeps the time of the last hit, in whole seconds). So the 35 GETs go in two bursts of at most 18, leaving 12 requests
// of each window for retries, and the second burst starts 11 s after the first one's last request.
// Live reads are slow and uneven (2026-11-05, 120 GETs): 80 in bursts of 20 as here took p50 3.0 s, p90 4.0 s,
// p99 and max 5.3 s; 20 one at a time took p50 1.0 s, p90 3.6 s, max 6.7 s; 20 in bursts of 5 took at most 0.8 s.
// In production (2026-11-05/06) 5 of 7 polls failed on one read each: 4 TimeoutError under a 5 s limit, 1 ENOTFOUND.
// The poll gives the script SCRIPT_BUDGET_MS, at most 27 s (the 30 s gate call less the plugin's 3 s margin), and the
// 11 s of quiet leaves about 15 s for two bursts. Two long tries beat three short ones there: a first try of 5.5 s
// covers the measured p99, and the retry gets 5.5 s or what is left before the deadline (3.5 s in the worst case, a
// read in each burst timing out: 5.5 + 0.25 + 11 + 5.5 + 0.25 + 3.5 = 26 s). Three tries would get under 4 s each,
// below the burst p90.
const BURST = 18;
const QUIET_MS = Number(process.env.ABACUS_QUIET_MS ?? 11_000);
const TRY_MS = 5500;
const BACKOFF_MS = 250;
// The script ends 1 s before its budget, so the error line is printed before the plugin stops it.
const DEADLINE = Date.now() + Number(process.env.SCRIPT_BUDGET_MS ?? 27_000) - 1000;
// A retry with less time than this left is not made.
const MIN_TRY_MS = 500;
const STEPS = ["v", "s", "sc", "sf", "scf"];
const DAYS = 7;

const pad = (n) => String(n).padStart(2, "0");
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class ReadError extends Error {
  constructor(message, target) {
    super(message);
    this.target = target;
  }
}

// When the last request left: the next burst waits QUIET_MS from it.
let lastSent = 0;

/** One try of GET /get of `key`, ended at TRY_MS or the deadline, whichever comes first. */
function tryGet(key) {
  lastSent = Date.now();
  return fetch(`${BASE}/get/${NS}/${key}`, { signal: AbortSignal.timeout(Math.min(TRY_MS, DEADLINE - lastSent)) });
}

/** The response to GET /get of `key`; a try that times out or fails to connect is made once more if time is left. */
async function get(key) {
  try {
    return await tryGet(key);
  } catch (e) {
    await sleep(BACKOFF_MS);
    if (DEADLINE - Date.now() < MIN_TRY_MS) throw new ReadError(`abacus unreachable: ${e.cause?.code ?? e.name}`, key);
    return await tryGet(key).catch((e) => {
      throw new ReadError(`abacus unreachable: ${e.cause?.code ?? e.name}`, key);
    });
  }
}

async function read(key) {
  const res = await get(key);
  if (res.status === 404) return 0;
  if (!res.ok) throw new ReadError(`abacus answered HTTP ${res.status}`, key);
  const { value } = await res.json();
  if (!Number.isInteger(value)) throw new ReadError("abacus answered no integer value", key);
  return value;
}

/** Counts of one date's steps, as views, solved, copies and feedback clicks. */
function tally(c) {
  return {
    views: c.v + c.s + c.sc + c.sf + c.scf,
    solved: c.s + c.sc + c.sf + c.scf,
    copies: c.sc + c.scf,
    feedback: c.sf + c.scf,
  };
}

(async () => {
  const now = new Date();
  const dates = Array.from({ length: DAYS }, (_, i) =>
    dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)),
  );
  const keys = dates.flatMap((date) => STEPS.map((step) => `${date}-${step}`));
  const values = [];
  for (let i = 0; i < keys.length; i += BURST) {
    if (i > 0) await sleep(lastSent + QUIET_MS - Date.now());
    values.push(...(await Promise.all(keys.slice(i, i + BURST).map(read))));
  }
  const byKey = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  const days = dates.map((date) => tally(Object.fromEntries(STEPS.map((step) => [step, byKey[`${date}-${step}`]]))));
  const week = days.reduce((a, d) => ({
    views: a.views + d.views,
    solved: a.solved + d.solved,
    copies: a.copies + d.copies,
    feedback: a.feedback + d.feedback,
  }));
  const [today] = days;
  const body = {
    date: dates[0],
    views_today: today.views,
    sessions_solved_today: today.solved,
    share_copies_today: today.copies,
    feedback_clicks_today: today.feedback,
    views_7d: week.views,
    sessions_solved_7d: week.solved,
    share_copies_7d: week.copies,
    feedback_clicks_7d: week.feedback,
  };
  const { date, ...counts } = body;
  console.log(JSON.stringify({ id: `counts:${date}:${Object.values(counts).join("-")}`, body }));
})().catch((e) =>
  console.log(JSON.stringify(e instanceof ReadError ? { error: e.message, target: e.target } : { error: String(e) })),
);
