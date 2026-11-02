const NEW_ISSUE = "https://github.com/nguyenvanduocit/lights-daily/issues/new";

/** Questions the feedback issue asks, after the player's share string. */
export const FEEDBACK_PROMPTS = [
  "Did the first board feel fair?",
  "What confused you?",
  "Would you play tomorrow?",
] as const;

/**
 * Link to a prefilled new GitHub issue for puzzle `number`: only `title` and
 * `body` are set, so nothing is sent until the player submits it on GitHub.
 */
export function feedbackUrl(number: number, share: string): string {
  const body = [share, ...FEEDBACK_PROMPTS].join("\n\n") + "\n";
  const query = new URLSearchParams({ title: `Lights Daily #${number} feedback`, body });
  return `${NEW_ISSUE}?${query}`;
}
