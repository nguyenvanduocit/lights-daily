import { SIZE, toggle, isSolved, type Board } from "./board";

const CELLS = SIZE * SIZE;
const MIN_PRESSES = 8;
const MAX_PRESSES = 15;

/** 32-bit FNV-1a hash of a string. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 PRNG: returns a function yielding floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Internal (not re-exported from the package index): the board plus the
 * distinct press cell indices (row-major) that produced it.
 */
export function generateWithPresses(seed: string | number): { board: Board; presses: number[] } {
  const next = mulberry32(hashString(String(seed)));
  for (;;) {
    const count = MIN_PRESSES + Math.floor(next() * (MAX_PRESSES - MIN_PRESSES + 1));
    // Partial Fisher-Yates: the first `count` entries are distinct cells.
    const cells = Array.from({ length: CELLS }, (_, i) => i);
    for (let i = 0; i < count; i++) {
      const j = i + Math.floor(next() * (CELLS - i));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const presses = cells.slice(0, count);
    let board: Board = new Array<boolean>(CELLS).fill(false);
    for (const p of presses) board = toggle(board, Math.floor(p / SIZE), p % SIZE);
    // Some press sets cancel out; draw again from the same stream.
    if (!isSolved(board)) return { board, presses };
  }
}

/**
 * Deterministic, always-solvable, never-already-solved board for a seed.
 * Built by applying 8-15 distinct random presses to an all-off board.
 * The same seed always yields the identical board.
 */
export function generate(seed: string | number): Board {
  return generateWithPresses(seed).board;
}
