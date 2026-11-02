import { SIZE, type Board } from "./board";

const N = SIZE * SIZE;

/**
 * Test-only GF(2) solver, written from the Lights Out rules alone (does not
 * import toggle or the generator). Returns the cell indices to press, or null.
 */
export function solve(board: Board): number[] | null {
  // Column p of the press matrix = cells flipped by pressing p. Row i of the
  // augmented system: sum_p A[i][p] x_p = board[i].
  const rows: number[][] = [];
  for (let i = 0; i < N; i++) {
    const r = Math.floor(i / SIZE), c = i % SIZE;
    const row = new Array<number>(N + 1).fill(0);
    for (let p = 0; p < N; p++) {
      const pr = Math.floor(p / SIZE), pc = p % SIZE;
      if (Math.abs(pr - r) + Math.abs(pc - c) <= 1) row[p] = 1;
    }
    row[N] = board[i] ? 1 : 0;
    rows.push(row);
  }
  const pivotCol: number[] = [];
  let rank = 0;
  for (let col = 0; col < N && rank < N; col++) {
    const pivot = rows.findIndex((row, i) => i >= rank && row[col] === 1);
    if (pivot < 0) continue;
    [rows[rank], rows[pivot]] = [rows[pivot], rows[rank]];
    for (let i = 0; i < N; i++) {
      if (i !== rank && rows[i][col] === 1) for (let k = 0; k <= N; k++) rows[i][k] ^= rows[rank][k];
    }
    pivotCol.push(col);
    rank++;
  }
  for (let i = rank; i < N; i++) if (rows[i][N] === 1) return null; // inconsistent
  const presses: number[] = [];
  pivotCol.forEach((col, i) => {
    if (rows[i][N] === 1) presses.push(col); // free variables = 0
  });
  return presses;
}
