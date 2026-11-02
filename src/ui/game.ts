import { SIZE, toggle, isSolved, type Board } from "../core/index";

/** Everything the page shows, derived from presses on today's board. */
export interface Game {
  readonly board: Board;
  readonly moves: number;
}

/** Press (row, col). A solved game ignores presses. */
export function press(game: Game, row: number, col: number): Game {
  if (isSolved(game.board)) return game;
  return { board: toggle(game.board, row, col), moves: game.moves + 1 };
}

const STEPS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * Cell index focus moves to from `index` for an arrow `key` (clamped at the
 * edges), or null when `key` is not an arrow key.
 */
export function arrowTarget(index: number, key: string): number | null {
  const step = STEPS[key];
  if (!step) return null;
  const clamp = (v: number) => Math.min(SIZE - 1, Math.max(0, v));
  const row = clamp(Math.floor(index / SIZE) + step[0]);
  const col = clamp((index % SIZE) + step[1]);
  return row * SIZE + col;
}
