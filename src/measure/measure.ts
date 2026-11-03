import { hitUrl, type Visit } from "./visit";

/** localStorage key a team device sets (by opening the page with ?team=1) so its plays are never counted. */
const TEAM = "ld-team";

/** The one request: no cookies, no referrer, no headers, and it outlives the page. */
const REQUEST: RequestInit = { keepalive: true, credentials: "omit", referrerPolicy: "no-referrer", mode: "cors" };

/** The parts of `window` the measure touches, so a test can hand it a fake page. */
export interface Host {
  document: { visibilityState: DocumentVisibilityState; addEventListener(type: "visibilitychange", listener: () => void): void };
  navigator: { webdriver: boolean };
  location: { href: string };
  history: { replaceState(data: unknown, unused: string, url?: string | URL | null): void };
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
  fetch(input: string, init?: RequestInit): Promise<Response>;
  addEventListener(type: "pagehide", listener: () => void): void;
}

/** What the game tells the measure as the player goes. */
export interface Measure {
  solved(): void;
  copied(): void;
  feedback(): void;
}

const IGNORED: Measure = { solved() {}, copied() {}, feedback() {} };

/**
 * Counts this page load once: when the page is first hidden or left, one GET raises the counter of
 * today's furthest step. Agents (navigator.webdriver) and team devices send nothing; failures are silent.
 */
export function startMeasure(host: Host, today: Date): Measure {
  if (isTeam(host) || host.navigator.webdriver) return IGNORED;

  const visit: Visit = { solved: false, copied: false, feedback: false };
  let sent = false;
  const send = () => {
    if (sent) return;
    sent = true;
    host.fetch(hitUrl(today, visit), REQUEST).catch(() => {});
  };
  host.document.addEventListener("visibilitychange", () => {
    if (host.document.visibilityState === "hidden") send();
  });
  host.addEventListener("pagehide", send);

  return {
    solved: () => void (visit.solved = true),
    copied: () => void (visit.copied = true),
    feedback: () => void (visit.feedback = true),
  };
}

/** Whether this device is the team's. ?team=1 marks it once and is removed from the address. */
function isTeam(host: Host): boolean {
  const url = new URL(host.location.href);
  if (url.searchParams.get("team") === "1") {
    url.searchParams.delete("team");
    host.history.replaceState(null, "", url.href);
    try {
      host.localStorage.setItem(TEAM, "1");
    } catch {
      // Storage blocked: this load is still the team's.
    }
    return true;
  }
  try {
    return host.localStorage.getItem(TEAM) === "1";
  } catch {
    return false;
  }
}
