import { describe, expect, it } from "vitest";
import { SIZE } from "../core/index";
import { arrowTarget, press } from "./game";

const off = Array<boolean>(SIZE * SIZE).fill(false);

describe("press", () => {
  it("flips the cell and its neighbours and counts the move", () => {
    const lit = off.map((_, i) => i === 0);
    const game = press({ board: lit, moves: 0 }, 1, 0);
    expect(game.moves).toBe(1);
    expect(game.board.flatMap((on, i) => (on ? [i] : []))).toEqual([5, 6, 10]);
  });

  it("ignores presses once every light is off", () => {
    const solved = { board: off, moves: 7 };
    expect(press(solved, 2, 2)).toBe(solved);
  });
});

describe("arrowTarget", () => {
  it("moves one cell in the arrow's direction", () => {
    expect(arrowTarget(12, "ArrowUp")).toBe(7);
    expect(arrowTarget(12, "ArrowDown")).toBe(17);
    expect(arrowTarget(12, "ArrowLeft")).toBe(11);
    expect(arrowTarget(12, "ArrowRight")).toBe(13);
  });

  it("stays put at the edges", () => {
    expect(arrowTarget(0, "ArrowUp")).toBe(0);
    expect(arrowTarget(0, "ArrowLeft")).toBe(0);
    expect(arrowTarget(24, "ArrowDown")).toBe(24);
    expect(arrowTarget(24, "ArrowRight")).toBe(24);
  });

  it("ignores other keys", () => {
    expect(arrowTarget(12, "Enter")).toBeNull();
  });
});
