import { describe, expect, it } from "vitest";
import { shareString } from "../core/index";
import { FEEDBACK_PROMPTS, feedbackUrl } from "./feedback";

const PAGE = "https://nguyenvanduocit.github.io/lights-daily/";

describe("feedbackUrl", () => {
  const share = shareString(new Date(2026, 10, 3), 7, PAGE);
  const url = new URL(feedbackUrl(1, share));

  it("opens a new issue on the repo with only title and body", () => {
    expect(url.origin + url.pathname).toBe("https://github.com/nguyenvanduocit/lights-daily/issues/new");
    expect([...url.searchParams.keys()]).toEqual(["title", "body"]);
    expect(url.hash).toBe("");
  });

  it("titles the issue with the puzzle number", () => {
    expect(url.searchParams.get("title")).toBe("Lights Daily #1 feedback");
  });

  it("puts the share string first, then the three prompts", () => {
    const body = url.searchParams.get("body")!;
    expect(body.startsWith(share)).toBe(true);
    expect(FEEDBACK_PROMPTS).toEqual([
      "Did the first board feel fair?",
      "What confused you?",
      "Would you play tomorrow?",
    ]);
    for (const prompt of FEEDBACK_PROMPTS) expect(body).toContain(prompt);
  });

  it("stays under 1000 characters for a far-future puzzle with many moves", () => {
    const worst = shareString(new Date(2999, 11, 31), 999_999, PAGE);
    expect(feedbackUrl(99_999, worst).length).toBeLessThan(1000);
  });
});
