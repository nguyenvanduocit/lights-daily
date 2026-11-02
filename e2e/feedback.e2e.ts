import { test, expect, type Page } from "@playwright/test";

const SIZE = 5;
const NEW_ISSUE = "https://github.com/nguyenvanduocit/lights-daily/issues/new";
const PROMPTS = ["Did the first board feel fair?", "What confused you?", "Would you play tomorrow?"];

/** Lights state read from the page: true = on, row-major. */
async function readBoard(page: Page): Promise<boolean[]> {
  const cells = page.getByRole("group", { name: "Board" }).getByRole("button");
  await expect(cells).toHaveCount(SIZE * SIZE);
  const names = await cells.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return names.map((name) => name.endsWith(", on"));
}

/** Cells to press to turn every light off, solved over GF(2) from the Lights Out rules alone. */
function solve(board: boolean[]): number[] {
  const n = SIZE * SIZE;
  const rows = board.map((on, i) => {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    const row = Array.from({ length: n }, (_, p) =>
      Math.abs(Math.floor(p / SIZE) - r) + Math.abs((p % SIZE) - c) <= 1 ? 1 : 0,
    );
    return [...row, on ? 1 : 0];
  });
  const pivots: number[] = [];
  let rank = 0;
  for (let col = 0; col < n; col++) {
    const pivot = rows.findIndex((row, i) => i >= rank && row[col] === 1);
    if (pivot < 0) continue;
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let i = 0; i < n; i++) {
      if (i !== rank && rows[i][col] === 1) rows[i] = rows[i].map((v, k) => v ^ rows[rank][k]);
    }
    pivots.push(col);
    rank++;
  }
  if (rows.slice(rank).some((row) => row[n] === 1)) throw new Error("board has no solution");
  return pivots.filter((col, i) => rows[i][n] === 1);
}

const cell = (page: Page, index: number) =>
  page.getByRole("button", { name: new RegExp(`^Row ${Math.floor(index / SIZE) + 1}, column ${(index % SIZE) + 1}, (on|off)$`) });

test("after the solve, one link opens a prefilled GitHub issue; no requests leave the page, nothing is stored", async ({ page, context, baseURL }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");

  const feedback = page.getByRole("link", { name: "Tell us what you thought" });
  const solution = solve(await readBoard(page));
  await expect(page.locator("a")).toHaveCount(0);
  for (const [i, index] of solution.entries()) {
    await cell(page, index).click();
    if (i < solution.length - 1) await expect(feedback).toHaveCount(0);
  }
  await expect(page.getByRole("status")).toContainText(`Solved in ${solution.length} moves`);

  // Exactly one link on the page, and it is this one. Read its href without following it.
  await expect(page.locator("a")).toHaveCount(1);
  await expect(feedback).toHaveCount(1);
  await expect(feedback).toHaveAttribute("target", "_blank");
  await expect(feedback).toHaveAttribute("rel", "noopener noreferrer");
  const href = (await feedback.getAttribute("href"))!;

  // The page's share string, as the Copy button puts it on the clipboard.
  await page.getByRole("button", { name: "Copy result" }).click();
  await expect(page.getByRole("status")).toContainText("Copied to clipboard.");
  const share = await page.evaluate(() => navigator.clipboard.readText());
  const number = Number(/^Lights Daily #(\d+) /.exec(share)![1]);

  const url = new URL(href);
  const title = url.searchParams.get("title");
  const body = url.searchParams.get("body")!;
  console.log(`href (${href.length} chars):\n${href}`);
  console.log(`decoded:\n  base:  ${url.origin}${url.pathname}\n  keys:  ${JSON.stringify([...url.searchParams.keys()])}\n  title: ${title}\n  body:\n${body.replace(/^/gm, "    | ")}`);

  expect(url.origin + url.pathname).toBe(NEW_ISSUE);
  expect([...url.searchParams.keys()]).toEqual(["title", "body"]);
  expect(url.hash).toBe("");
  expect(title).toBe(`Lights Daily #${number} feedback`);
  expect(body).toContain(share);
  for (const prompt of PROMPTS) expect(body).toContain(prompt);
  expect(href.length).toBeLessThan(1000);

  const storage = {
    localStorage: await page.evaluate(() => ({ ...localStorage })),
    sessionStorage: await page.evaluate(() => ({ ...sessionStorage })),
    cookies: await context.cookies(),
    indexedDB: await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name)),
  };
  console.log(`storage dump: ${JSON.stringify(storage)}`);
  expect(storage).toEqual({ localStorage: {}, sessionStorage: {}, cookies: [], indexedDB: [] });

  const origin = new URL(baseURL!).origin;
  console.log(`requests (${requests.length}):\n${requests.map((r) => `  ${r}`).join("\n")}`);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((r) => new URL(r).origin !== origin)).toEqual([]);
});
