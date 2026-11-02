import { describe, expect, it } from "vitest";
import { SIZE, toggle, isSolved, generate, dateKey, seedFromDate, dailyBoard, puzzleNumber, shareString, type Board } from "./index";
import { generateWithPresses } from "./generate";
import { solve } from "./solver.test-helper";

const empty: Board = new Array<boolean>(SIZE * SIZE).fill(false);
const lit = (b: Board) => b.flatMap((on, i) => (on ? [i] : []));

describe("toggle", () => {
  it("flips 3 cells for a corner, 4 for an edge, 5 for the centre", () => {
    expect(lit(toggle(empty, 0, 0))).toEqual([0, 1, 5]);
    expect(lit(toggle(empty, 0, 2))).toEqual([1, 2, 3, 7]);
    expect(lit(toggle(empty, 2, 2))).toEqual([7, 11, 12, 13, 17]);
    expect(lit(toggle(empty, 4, 4))).toEqual([19, 23, 24]);
  });
  it("restores the board when applied twice", () => {
    const b = generate("x");
    expect(toggle(toggle(b, 1, 3), 1, 3)).toEqual(b);
  });
  it("does not mutate its input", () => {
    const b = [...empty];
    toggle(b, 2, 2);
    expect(b).toEqual(empty);
  });
  it("rejects cells outside the board", () => {
    expect(() => toggle(empty, 5, 0)).toThrow(RangeError);
  });
});

describe("isSolved", () => {
  it("is true only when all lights are off", () => {
    expect(isSolved(empty)).toBe(true);
    expect(isSolved(toggle(empty, 1, 1))).toBe(false);
  });
});

describe("solver (test helper)", () => {
  it("solves a hand-computed board without trusting toggle", () => {
    // Pressing the corner (0,0) lights exactly cells 0, 1 and 5.
    const board = empty.map((_, i) => i === 0 || i === 1 || i === 5);
    const presses = solve(board)!;
    expect(presses).not.toBeNull();
    // Verify with plain index arithmetic: XOR the neighbourhood of every press.
    const out = board.slice();
    for (const p of presses) {
      const pr = Math.floor(p / 5), pc = p % 5;
      for (let i = 0; i < 25; i++) {
        if (Math.abs(Math.floor(i / 5) - pr) + Math.abs((i % 5) - pc) <= 1) out[i] = !out[i];
      }
    }
    expect(out.every((x) => !x)).toBe(true);
  });
});

describe("daily puzzle", () => {
  it("every date 2026-01-01..2028-12-31 (1096 boards) is unsolved and solvable by the independent GF(2) solver", () => {
    let count = 0;
    for (let d = new Date(2026, 0, 1); d <= new Date(2028, 11, 31); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      count++;
      const board = dailyBoard(d);
      expect(board).toHaveLength(25);
      expect(isSolved(board), dateKey(d)).toBe(false);
      const presses = solve(board);
      expect(presses, dateKey(d)).not.toBeNull();
      let b = board;
      for (const p of presses!) b = toggle(b, Math.floor(p / SIZE), p % SIZE);
      expect(isSolved(b), dateKey(d)).toBe(true);
    }
    expect(count).toBe(1096);
  });

  it("always yields the identical board for one date (snapshot 2026-11-03)", () => {
    const rows = (b: Board) => [0, 1, 2, 3, 4].map((r) => b.slice(r * 5, r * 5 + 5).map((x) => (x ? "#" : ".")).join(""));
    const first = dailyBoard(new Date(2026, 10, 3));
    expect(rows(first)).toEqual(SNAPSHOT);
    expect(dailyBoard(new Date(2026, 10, 3, 23, 59, 59))).toEqual(first);
    expect(dailyBoard(new Date(2026, 10, 3, 0, 0, 1))).toEqual(first);
    expect(dailyBoard(new Date(2026, 10, 3))).toEqual(first);
  });

  it("gives different boards on different dates", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) keys.add(dailyBoard(new Date(2026, 10, 3 + i)).join());
    expect(keys.size).toBeGreaterThan(95);
  });
});

describe("generate", () => {
  it("uses 8-15 distinct presses and never returns a solved board", () => {
    for (let seed = 0; seed < 2000; seed++) {
      const { board, presses } = generateWithPresses(seed);
      expect(presses.length).toBeGreaterThanOrEqual(8);
      expect(presses.length).toBeLessThanOrEqual(15);
      expect(new Set(presses).size).toBe(presses.length);
      expect(isSolved(board)).toBe(false);
    }
  });
  it("is deterministic per seed", () => {
    expect(generate("abc")).toEqual(generate("abc"));
    expect(generate(7)).toEqual(generate("7"));
  });
});

describe("puzzleNumber / dateKey / shareString", () => {
  it("numbers 2026-11-03 as #1 and counts one per day", () => {
    expect(puzzleNumber(new Date(2026, 10, 3))).toBe(1);
    expect(puzzleNumber(new Date(2026, 10, 3, 23, 59))).toBe(1);
    expect(puzzleNumber(new Date(2026, 10, 4))).toBe(2);
  });
  it("is not skewed by DST changes", () => {
    for (const [y, m, d] of [[2027, 2, 14], [2027, 10, 7], [2026, 2, 8], [2026, 9, 25]]) {
      expect(puzzleNumber(new Date(y, m, d + 1)) - puzzleNumber(new Date(y, m, d))).toBe(1);
    }
    expect(puzzleNumber(new Date(2027, 10, 3))).toBe(366);
  });
  it("formats the local date key and seed", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(seedFromDate(new Date(2026, 0, 5))).toContain("2026-01-05");
  });
  it("builds the exact share text", () => {
    expect(shareString(new Date(2026, 10, 3), 12, "https://example.com/")).toBe(
      "Lights Daily #1 2026-11-03 — solved in 12 moves\nhttps://example.com/",
    );
  });
});

const SNAPSHOT = ["##...", ".#..#", "##...", "###.#", ".#..#"];
