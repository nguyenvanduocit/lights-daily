import { test, expect, type Page } from "@playwright/test";

const SIZE = 5;
const SCREENSHOTS = "e2e/screenshots";

/** Lights state read from the page: true = on, row-major. */
async function readBoard(page: Page): Promise<boolean[]> {
  const cells = page.getByRole("group", { name: "Board" }).getByRole("button");
  await expect(cells).toHaveCount(SIZE * SIZE);
  const names = await cells.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return names.map((name) => name.endsWith(", on"));
}

/**
 * Cells to press to turn every light off, solved over GF(2) from the Lights Out
 * rules alone (independent of the app's code). Indices are row-major.
 */
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

/** Expected share text, built from the spec rather than from the app's code. */
function expectedShare(moves: number, url: string): string {
  const now = new Date();
  const pad = (v: number) => String(v).padStart(2, "0");
  const key = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const number = Math.round(
    (Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(2026, 10, 3)) / 86_400_000,
  ) + 1;
  return `Lights Daily #${number} ${key} — solved in ${moves} moves\n${url}`;
}

/** Fails the test if the page requested anything outside its own origin. */
function trackRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  return urls;
}

function expectSameOrigin(urls: string[], baseURL: string) {
  const origin = new URL(baseURL).origin;
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((url) => new URL(url).origin !== origin)).toEqual([]);
}

const moveCounter = (page: Page) => page.getByTestId("moves");
const cell = (page: Page, index: number) =>
  page.getByRole("button", { name: new RegExp(`^Row ${Math.floor(index / SIZE) + 1}, column ${(index % SIZE) + 1}, (on|off)$`) });

test("mouse: solve today's puzzle and copy the share string", async ({ page, baseURL }) => {
  const requests = trackRequests(page);
  await page.goto("/");

  const solution = solve(await readBoard(page));
  expect(solution.length).toBeGreaterThan(0);
  await expect(moveCounter(page)).toHaveText("0");
  await page.screenshot({ path: `${SCREENSHOTS}/start.png`, fullPage: true });

  for (const [i, index] of solution.entries()) {
    await cell(page, index).click();
    await expect(moveCounter(page)).toHaveText(String(i + 1));
    if (i === 0) {
      // Mid-game: one move made, board not solved yet. Fails if today's board is a one-move solve.
      await expect(page.getByRole("status")).toHaveText("");
      await page.screenshot({ path: `${SCREENSHOTS}/mid.png`, fullPage: true });
    }
  }

  expect(await readBoard(page)).toEqual(Array(SIZE * SIZE).fill(false));
  await expect(page.getByRole("status")).toContainText(`Solved in ${solution.length} moves`);

  // The solved board is marked disabled and ignores further clicks.
  await expect(cell(page, 0)).toBeDisabled();
  await cell(page, 0).click({ force: true });
  await expect(moveCounter(page)).toHaveText(String(solution.length));
  expect(await readBoard(page)).toEqual(Array(SIZE * SIZE).fill(false));

  await page.getByRole("button", { name: "Copy result" }).click();
  await expect(page.getByRole("status")).toHaveText(`Solved in ${solution.length} moves! Copied to clipboard.`);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(expectedShare(solution.length, page.url()));
  await page.screenshot({ path: `${SCREENSHOTS}/win.png`, fullPage: true });

  expectSameOrigin(requests, baseURL!);
});

test("keyboard only: solve today's puzzle and copy the share string", async ({ page, baseURL }) => {
  const requests = trackRequests(page);
  await page.goto("/");
  const solution = solve(await readBoard(page));

  // Tab lands on the grid's single tab stop: the top-left cell.
  await page.keyboard.press("Tab");
  await expect(cell(page, 0)).toBeFocused();

  let at = 0;
  for (const [i, index] of solution.entries()) {
    const rowStep = Math.floor(index / SIZE) - Math.floor(at / SIZE);
    const colStep = (index % SIZE) - (at % SIZE);
    for (let s = 0; s < Math.abs(rowStep); s++) await page.keyboard.press(rowStep > 0 ? "ArrowDown" : "ArrowUp");
    for (let s = 0; s < Math.abs(colStep); s++) await page.keyboard.press(colStep > 0 ? "ArrowRight" : "ArrowLeft");
    at = index;
    await expect(cell(page, index)).toBeFocused();
    await page.keyboard.press(i % 2 === 0 ? "Enter" : "Space");
    await expect(moveCounter(page)).toHaveText(String(i + 1));
  }

  await expect(page.getByRole("status")).toContainText(`Solved in ${solution.length} moves`);

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Copy result" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText(`Solved in ${solution.length} moves! Copied to clipboard.`);
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(expectedShare(solution.length, page.url()));

  expectSameOrigin(requests, baseURL!);
});
