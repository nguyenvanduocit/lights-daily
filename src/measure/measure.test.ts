import { describe, expect, it } from "vitest";
import { startMeasure, type Host, type Measure } from "./index";

const TODAY = new Date(2026, 10, 3, 9, 30);
const HIT = "https://abacus.jasoncameron.dev/hit/lights-daily-nvd/2026-11-03";

type Listener = () => void;

/** A page as the measure sees it: events are fired by hand, requests and storage are recorded. */
function fakePage(opts: { href?: string; webdriver?: boolean; storage?: Record<string, string>; force?: boolean } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const on = (type: string, fn: Listener) => (listeners[type] ??= []).push(fn);
  const fire = (type: string) => (listeners[type] ?? []).forEach((fn) => fn());
  const requests: { url: string; init: RequestInit }[] = [];
  const storage: Record<string, string> = { ...opts.storage };
  const replaced: string[] = [];
  const document = { visibilityState: "visible" as DocumentVisibilityState, addEventListener: on };
  const host: Host = {
    document,
    navigator: { webdriver: opts.webdriver ?? false },
    location: { href: opts.href ?? "https://nguyenvanduocit.github.io/lights-daily/" },
    history: { replaceState: (_data, _unused, url) => void replaced.push(String(url)) },
    localStorage: {
      getItem: (key) => storage[key] ?? null,
      setItem: (key, value) => void (storage[key] = value),
    },
    fetch: (url, init) => {
      requests.push({ url: String(url), init: init ?? {} });
      return Promise.resolve(new Response("{}"));
    },
    addEventListener: on,
    __ldMeasureForce: opts.force,
  };
  const hide = () => {
    document.visibilityState = "hidden";
    fire("visibilitychange");
  };
  return { host, requests, storage, replaced, hide, fire };
}

describe("startMeasure", () => {
  it("sends nothing until the page is hidden", () => {
    const page = fakePage();
    startMeasure(page.host, TODAY).solved();
    expect(page.requests).toEqual([]);
  });

  it("a solve then hide sends exactly one GET to <date>-s", () => {
    const page = fakePage();
    startMeasure(page.host, TODAY).solved();
    page.hide();
    expect(page.requests.map((r) => r.url)).toEqual([`${HIT}-s`]);
  });

  it("viewing only gives -v", () => {
    const page = fakePage();
    startMeasure(page.host, TODAY);
    page.hide();
    expect(page.requests.map((r) => r.url)).toEqual([`${HIT}-v`]);
  });

  it("copy plus feedback gives -scf; copy alone -sc; feedback alone -sf", () => {
    const cases: [(m: Measure) => void, string][] = [
      [(m) => (m.solved(), m.copied(), m.feedback()), "scf"],
      [(m) => (m.solved(), m.copied()), "sc"],
      [(m) => (m.solved(), m.feedback()), "sf"],
    ];
    for (const [act, step] of cases) {
      const page = fakePage();
      act(startMeasure(page.host, TODAY));
      page.fire("pagehide");
      expect(page.requests.map((r) => r.url)).toEqual([`${HIT}-${step}`]);
    }
  });

  it("pagehide after visibilitychange still sends once, and a later hide sends nothing more", () => {
    const page = fakePage();
    const measure = startMeasure(page.host, TODAY);
    page.hide();
    measure.solved();
    page.fire("pagehide");
    page.hide();
    expect(page.requests.map((r) => r.url)).toEqual([`${HIT}-v`]);
  });

  it("visibilitychange back to visible sends nothing", () => {
    const page = fakePage();
    startMeasure(page.host, TODAY);
    page.fire("visibilitychange");
    expect(page.requests).toEqual([]);
  });

  it("the request is a cors GET with credentials omitted, no referrer, keepalive, and no headers", () => {
    const page = fakePage();
    startMeasure(page.host, TODAY);
    page.hide();
    expect(page.requests).toHaveLength(1);
    expect(page.requests[0].init).toEqual({ keepalive: true, credentials: "omit", referrerPolicy: "no-referrer", mode: "cors" });
    // No method means GET; no headers means no cookie header.
    expect(page.requests[0].init.method).toBeUndefined();
    expect(page.requests[0].init.headers).toBeUndefined();
  });

  it("the key is the local date, as the daily board uses it", () => {
    const page = fakePage();
    startMeasure(page.host, new Date(2026, 0, 9, 23, 59));
    page.hide();
    expect(page.requests[0].url).toBe("https://abacus.jasoncameron.dev/hit/lights-daily-nvd/2026-01-09-v");
  });

  it("webdriver sends nothing", () => {
    const page = fakePage({ webdriver: true });
    startMeasure(page.host, TODAY).solved();
    page.hide();
    page.fire("pagehide");
    expect(page.requests).toEqual([]);
  });

  it("webdriver with the __ldMeasureForce hook sends as a player does", () => {
    const page = fakePage({ webdriver: true, force: true });
    startMeasure(page.host, TODAY).solved();
    page.hide();
    expect(page.requests.map((r) => r.url)).toEqual([`${HIT}-s`]);
  });

  it("the ld-team flag sends nothing", () => {
    const page = fakePage({ storage: { "ld-team": "1" } });
    startMeasure(page.host, TODAY).solved();
    page.hide();
    page.fire("pagehide");
    expect(page.requests).toEqual([]);
  });

  it("?team=1 sets the flag, cleans the URL and sends nothing", () => {
    const page = fakePage({ href: "https://nguyenvanduocit.github.io/lights-daily/?team=1#x" });
    startMeasure(page.host, TODAY);
    page.hide();
    expect(page.storage).toEqual({ "ld-team": "1" });
    expect(page.replaced).toEqual(["https://nguyenvanduocit.github.io/lights-daily/#x"]);
    expect(page.requests).toEqual([]);
  });

  it("a player's visit writes nothing to storage and leaves the URL alone", () => {
    const page = fakePage();
    startMeasure(page.host, TODAY).solved();
    page.hide();
    expect(page.storage).toEqual({});
    expect(page.replaced).toEqual([]);
  });

  it("storage that throws counts the visit; a failed request is silent and not retried", async () => {
    const page = fakePage();
    page.host.localStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    let calls = 0;
    page.host.fetch = () => (calls++, Promise.reject(new TypeError("offline")));
    startMeasure(page.host, TODAY);
    page.hide();
    page.fire("pagehide");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toBe(1);
  });
});
