import { dateKey } from "../core/index";

/** Abacus namespace of the game's counters: one counter per local date and step. */
const HIT = "https://abacus.jasoncameron.dev/hit/lights-daily-nvd";

/** What one page load did, as far as it got. */
export interface Visit {
  solved: boolean;
  copied: boolean;
  feedback: boolean;
}

/** The visit's furthest step: v viewed, s solved, then c copied and f feedback clicked, once solved. */
export type Step = "v" | "s" | "sc" | "sf" | "scf";

export function step(visit: Visit): Step {
  if (!visit.solved) return "v";
  return `s${visit.copied ? "c" : ""}${visit.feedback ? "f" : ""}` as Step;
}

/** The counter to raise for a visit on `date` (its local {@link dateKey}, as the daily board uses it). */
export function hitUrl(date: Date, visit: Visit): string {
  return `${HIT}/${dateKey(date)}-${step(visit)}`;
}
