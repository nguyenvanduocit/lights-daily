/** Side length of the (square) board. */
export const SIZE = 5;

/** Immutable board, row-major, length SIZE*SIZE. `true` = light on. */
export type Board = readonly boolean[];

/** Index of the cell at (row, col) in a {@link Board}. */
function index(row: number, col: number): number {
  return row * SIZE + col;
}

/**
 * Press the cell at (row, col): flips it and its orthogonal neighbours
 * (edges are not wrapped). Returns a new board; the input is not modified.
 */
export function toggle(board: Board, row: number, col: number): Board {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= SIZE || col < 0 || col >= SIZE) {
    throw new RangeError(`cell (${row}, ${col}) is outside the ${SIZE}x${SIZE} board`);
  }
  const next = board.slice();
  for (const [r, c] of [[row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
    if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) next[index(r, c)] = !next[index(r, c)];
  }
  return next;
}

/** True when every light is off. */
export function isSolved(board: Board): boolean {
  return board.every((on) => !on);
}
