import { generate } from "./generate";
import type { Board } from "./board";

/** Puzzle #1 is on this local date. */
const EPOCH = { year: 2026, month: 11, day: 3 };
const MS_PER_DAY = 86_400_000;

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** 'YYYY-MM-DD' from the LOCAL date components of `date`. */
export function dateKey(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1, 2)}-${pad(date.getDate(), 2)}`;
}

/** Seed string for the daily puzzle of `date` (its local {@link dateKey}). */
export function seedFromDate(date: Date): string {
  return `lights-daily:${dateKey(date)}`;
}

/** The daily board: identical for everyone with the same local date. */
export function dailyBoard(date: Date): Board {
  return generate(seedFromDate(date));
}

/**
 * Puzzle number of the local date: 2026-11-03 is #1, +1 per calendar day
 * (earlier dates give 0 or negative numbers). Uses Date.UTC on the Y/M/D
 * components so DST changes cannot skew it.
 */
export function puzzleNumber(date: Date): number {
  const day = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const epoch = Date.UTC(EPOCH.year, EPOCH.month - 1, EPOCH.day);
  return Math.round((day - epoch) / MS_PER_DAY) + 1;
}

/**
 * Spoiler-free share text:
 * `Lights Daily #<n> <YYYY-MM-DD> — solved in <moves> moves`, a newline, then `url`.
 */
export function shareString(date: Date, moves: number, url: string): string {
  return `Lights Daily #${puzzleNumber(date)} ${dateKey(date)} — solved in ${moves} moves\n${url}`;
}
