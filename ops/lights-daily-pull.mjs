#!node
// Lights Daily play counts for Mindchains' `script` pull (ADR-0044), which runs the code below this first line as
// `node -e` and reads each JSON line it prints. Reads only (GET /get) the game's public Abacus counters: one per local
// date and step (v viewed, s solved, sc + copied, sf + feedback clicked, scf all), for today and the 6 days before.
// Prints one item whose id carries the counts, so each change is a new item; a missing counter (404) is 0, any other
// failure an error line. ABACUS_URL and ABACUS_QUIET_MS exist for the test against a local fake Abacus.
const NS = "lights-daily-nvd";
const BASE = process.env.ABACUS_URL ?? "https://abacus.jasoncameron.dev";
// Abacus limits each IP to 30 requests, and its count resets only after 10 s without one (gin-rate-limit's Redis store
// keeps the time of the last hit, in whole seconds). So the 35 GETs go in bursts of at most 25, with 11 s of quiet between
// them: about 13 s in all, inside the poll's 27 s (the 30 s gate call less the plugin's 3 s margin).
const BURST = 25;
const QUIET_MS = Number(process.env.ABACUS_QUIET_MS ?? 11_000);
const TIMEOUT_MS = 5000;
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

async function read(key) {
  const res = await fetch(`${BASE}/get/${NS}/${key}`, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch((e) => {
    throw new ReadError(`abacus unreachable: ${e.cause?.code ?? e.name}`, key);
  });
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
  const dates = Array.from({ length: DAYS }, (_, i) => dateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  const keys = dates.flatMap((date) => STEPS.map((step) => `${date}-${step}`));
  const values = [];
  for (let i = 0; i < keys.length; i += BURST) {
    if (i > 0) await sleep(QUIET_MS);
    values.push(...(await Promise.all(keys.slice(i, i + BURST).map(read))));
  }
  const byKey = Object.fromEntries(keys.map((key, i) => [key, values[i]]));
  const days = dates.map((date) => tally(Object.fromEntries(STEPS.map((step) => [step, byKey[`${date}-${step}`]]))));
  const week = days.reduce((a, d) => ({
    views: a.views + d.views, solved: a.solved + d.solved, copies: a.copies + d.copies, feedback: a.feedback + d.feedback,
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
})().catch((e) => console.log(JSON.stringify(e instanceof ReadError ? { error: e.message, target: e.target } : { error: String(e) })));
