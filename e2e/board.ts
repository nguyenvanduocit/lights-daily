import { expect, type Page } from "@playwright/test";

export const SIZE = 5;

/** Lights state read from the page: true = on, row-major. */
export async function readBoard(page: Page): Promise<boolean[]> {
  const cells = page.getByRole("group", { name: "Board" }).getByRole("button");
  await expect(cells).toHaveCount(SIZE * SIZE);
  const names = await cells.evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  return names.map((name) => name.endsWith(", on"));
}

/**
 * Cells to press to turn every light off, solved over GF(2) from the Lights Out
 * rules alone (independent of the app's code). Indices are row-major.
 */
export function solve(board: boolean[]): number[] {
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

export const cell = (page: Page, index: number) =>
  page.getByRole("button", { name: new RegExp(`^Row ${Math.floor(index / SIZE) + 1}, column ${(index % SIZE) + 1}, (on|off)$`) });
