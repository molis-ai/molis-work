import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { CAPSULE_CLIENT_SCRIPT } from "@molis-ai/molis-work-app-desktop";

// N54 (specs/post-anticorruption-roadmap/reference/batches/07.md, 07-2a): the capsule window is hidden almost all of the time, so
// what it asks the Host follows what the window shows. The shipped script runs here against a small DOM port and a fake clock, so
// the requests per minute can be counted exactly; the shell's own window hiding is Rust (adapters/tauri/src/main.rs `hide_capsule_window`,
// tao's `orderOut`), and `document.hidden` following it was measured on a WKWebView window set up like the capsule's.

const flush = () => new Promise<void>(resolve => setImmediate(resolve));

class Part {
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly style = { setProperty: () => undefined };
  children: Part[] = [];
  textContent = "";
  className = "";
  id = "";
  title = "";
  type = "";
  value = "";
  tabIndex = 0;
  append(...nodes: Part[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: Part[]) { this.children = nodes; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  addEventListener(_type?: string, _listener?: () => void) { /* the shipped script's own listeners are not exercised through its elements */ }
  contains() { return false; }
  closest(_selector?: string): Part | null { return null; }
  focus() { /* nothing to focus in the port */ }
  getBoundingClientRect() { return { height: 0 }; }
}

type Timer = { fn: () => void; ms: number; at: number };

class Clock {
  now = 0;
  private next = 1;
  readonly timers = new Map<number, Timer>();
  readonly setInterval = (fn: () => void, ms: number) => { const id = this.next++; this.timers.set(id, { fn, ms, at: this.now + ms }); return id; };
  readonly clearInterval = (id: number) => { this.timers.delete(id); };
  get cadences() { return [...this.timers.values()].map(timer => timer.ms).sort((a, b) => a - b); }
  /** Runs every timer that falls due in the next `ms`, letting each read finish before the next tick, the way a real page is idle between ticks. */
  async advance(ms: number) {
    const end = this.now + ms;
    for (;;) {
      const due = [...this.timers.values()].filter(timer => timer.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.now = due.at;
      due.at += due.ms;
      due.fn();
      await flush();
    }
    this.now = end;
  }
}

const FIRST = { project_id: "project-capsule", display_name: "胶囊测试" };
const SECOND = { project_id: "project-second", display_name: "第二个项目" };
const snapshotOf = (project: typeof FIRST) => ({
  project,
  state: { kind: "empty", menu_bar_title: "没有待办", menu_bar_tooltip: "当前没有需要处理的 Goal", action_path: `/projects/${project.project_id}` },
  tabs: [],
  default_tab: null,
});

/** `status` 0 is a request that never reached the Host (nothing listening, no network). */
type Reply = { status: number };

class CapsulePage {
  readonly clock = new Clock();
  readonly root = new Part();
  readonly statusText = new Part();
  readonly errorDetail = new Part();
  readonly select = new Part();
  readonly fetches: string[] = [];
  readonly pageReads: string[] = [];
  readonly invokes: Array<{ command: string; args: Record<string, unknown> | undefined }> = [];
  readonly held: Array<(status: number) => void> = [];
  elapsedReads = 0;
  reloads = 0;
  hidden: boolean;
  reply: Reply;
  /** What the Host answers when the page itself is fetched, the probe before a reload. */
  pageReply: Reply = { status: 200 };
  /** The next read of the capsule snapshot waits until `release` answers it, so an answer can arrive after the user moved on. */
  holdNext = false;
  private changed: (() => void) | undefined;
  private readonly documentListeners = new Map<string, Array<(event: unknown) => void>>();
  private readonly windowListeners = new Map<string, Array<(event: unknown) => void>>();

  /** `reply` is what the Host answers from the first read on: the script reads once as it starts, before the case can set anything. */
  constructor({ hidden, reply }: { hidden: boolean; reply: Reply }) {
    this.hidden = hidden;
    this.reply = reply;
    const tabs = new Part();
    const list = new Part();
    const page = this;
    const listen = (registry: Map<string, Array<(event: unknown) => void>>) =>
      (type: string, fn: (event: unknown) => void) => { registry.set(type, [...(registry.get(type) ?? []), fn]); };
    this.select.addEventListener = (type?: string, listener?: () => void) => { if (type === "change") this.changed = listener; };
    const selected = (selector: string): Part[] => {
      if (selector === "[data-capsule-status-text]") return [this.statusText];
      if (selector === "[data-capsule-error-detail]") return [this.errorDetail];
      if (selector === "[data-capsule-project]") return [this.select];
      if (selector === "[data-status-since]") this.elapsedReads += 1;
      return [];
    };
    const document = {
      get hidden() { return page.hidden; },
      documentElement: { lang: "zh-CN", style: { setProperty: () => undefined } },
      activeElement: null,
      querySelector: (selector: string) => selector === "[data-capsule]" ? this.root : selector === "[data-capsule-tabs]" ? tabs : selector === "[data-capsule-list]" ? list : null,
      querySelectorAll: selected,
      getElementById: (id: string) => id === "capsule-projects" ? { textContent: JSON.stringify([FIRST, SECOND]) } : null,
      createElement: () => new Part(),
      createTextNode: (text: string) => Object.assign(new Part(), { textContent: text }),
      addEventListener: listen(this.documentListeners),
    };
    const window = {
      setInterval: this.clock.setInterval,
      clearInterval: this.clock.clearInterval,
      requestAnimationFrame: () => 0,
      addEventListener: listen(this.windowListeners),
      __TAURI__: { core: { invoke: (command: string, args?: Record<string, unknown>) => { this.invokes.push({ command, args }); return Promise.resolve(); } } },
    };
    const answer = (url: string, status: number) => {
      if (status === 0) return Promise.reject(new TypeError("fetch failed"));
      const project = url.includes(SECOND.project_id) ? SECOND : FIRST;
      return Promise.resolve({ status, ok: status >= 200 && status < 300, json: () => Promise.resolve(status === 200 ? snapshotOf(project) : { error: "not found" }) });
    };
    const fetch = (url: string) => {
      if (!url.includes("/api/capsule")) { this.pageReads.push(url); return answer(url, this.pageReply.status); }
      this.fetches.push(url);
      if (!this.holdNext) return answer(url, this.reply.status);
      this.holdNext = false;
      return new Promise(resolve => { this.held.push(status => resolve(answer(url, status))); });
    };
    const location = { search: "", href: "http://127.0.0.1:4173/desktop/capsule?desktop=1&locale=zh", reload: () => { this.reloads += 1; } };
    vm.runInNewContext(CAPSULE_CLIENT_SCRIPT, {
      window, document, fetch, location, Element: Part, AbortController, URLSearchParams, CSS: { escape: (value: string) => value },
      localStorage: { getItem: () => null, setItem: () => undefined },
      L: (message: string) => message,
    });
  }

  fire(registry: "document" | "window", type: string, event: unknown = {}) {
    for (const fn of (registry === "document" ? this.documentListeners : this.windowListeners).get(type) ?? []) fn(event);
  }
  async setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.fire("document", "visibilitychange");
    await flush();
  }
  /** The user picks another project in the capsule's project menu. */
  async chooseProject(projectId: string) {
    this.select.value = projectId;
    this.changed?.();
    await flush();
  }
  async release(index: number, status: number) {
    this.held[index]?.(status);
    await flush();
  }
  menuBarUpdates() { return this.invokes.filter(call => call.command === "capsule_update_menu_bar"); }
}

async function open(hidden: boolean, reply: Reply = { status: 200 }) {
  const page = new CapsulePage({ hidden, reply });
  await flush();
  return page;
}

test("N54 a visible capsule reads every 2.5 s and updates its elapsed text every second: 25 reads in the first minute", async () => {
  const page = await open(false);
  assert.equal(page.fetches.length, 1, "the first read is made on open");
  assert.deepEqual(page.clock.cadences, [1000, 2500]);
  const readsBefore = page.elapsedReads;
  await page.clock.advance(60_000);
  assert.equal(page.fetches.length, 1 + 24);
  assert.equal(page.elapsedReads - readsBefore, 60);
});

test("D0044 N54 a hidden capsule reads only the menu projection twice a minute and never updates elapsed text", async () => {
  const page = await open(true);
  assert.equal(page.fetches.length, 1, "a window created hidden still reads once on open, so the menu bar has a status");
  assert.deepEqual(page.clock.cadences, [30_000]);
  const readsBefore = page.elapsedReads;
  await page.clock.advance(60_000);
  assert.equal(page.fetches.length, 1 + 2);
  assert.ok(page.fetches.every(url => String(url).includes("view=menu")), "hidden polling asks for menu data only");
  assert.equal(page.elapsedReads - readsBefore, 0, "nobody sees the elapsed text, so nothing updates it");
  assert.equal(page.menuBarUpdates().length, page.fetches.length, "each read, hidden or not, sets the menu-bar title and tooltip");
});

test("N54 hiding the capsule drops to the slow cadence, and showing it reads once at once and goes back to the fast one", async () => {
  const page = await open(false);
  await page.clock.advance(10_000);
  assert.equal(page.fetches.length, 1 + 4);
  await page.setHidden(true);
  assert.deepEqual(page.clock.cadences, [30_000], "the fast read and the elapsed timer were taken down");
  await page.setHidden(true);
  assert.deepEqual(page.clock.cadences, [30_000], "the same state announced twice does not stack a second timer");
  const afterHide = page.fetches.length;
  await page.clock.advance(60_000);
  assert.equal(page.fetches.length - afterHide, 2);
  const beforeShow = page.fetches.length;
  await page.setHidden(false);
  assert.equal(page.fetches.length - beforeShow, 1, "it reads once as soon as the window is back, before the next tick");
  await page.setHidden(false);
  assert.deepEqual(page.clock.cadences, [1000, 2500], "and twice announced is still one pair of timers");
  const afterShow = page.fetches.length;
  await page.clock.advance(5000);
  assert.equal(page.fetches.length - afterShow, 2, "two reads in five seconds, not four");
});

test("N54 a 404 stops the polling for good: no more reads and no timers, however long the window stays open", async () => {
  const page = await open(false);
  await page.clock.advance(5000);
  page.reply = { status: 404 };
  await page.clock.advance(2500);
  const atStop = page.fetches.length;
  assert.deepEqual(page.clock.cadences, [], "both timers were taken down");
  assert.equal(page.root.dataset.error, "true");
  assert.match(page.errorDetail.textContent, /已不在/);
  const last = page.menuBarUpdates().at(-1);
  assert.equal(last?.args?.title, "项目已不在", "the menu bar says why, in words that are not the Host-is-down ones");
  assert.equal(last?.args?.path, "/projects/", "and its 'open' item brings the main window forward instead of opening the project that is gone");
  await page.clock.advance(300_000);
  assert.equal(page.fetches.length, atStop, "five more minutes: not one more request");
});

test("N54 a project that is already gone on open is read once, not polled", async () => {
  const page = await open(false, { status: 404 });
  assert.equal(page.fetches.length, 1);
  assert.deepEqual(page.clock.cadences, []);
  await page.clock.advance(60_000);
  assert.equal(page.fetches.length, 1);
});

test("N54 a 404 that comes back for a project the user has since left does not stop the polling", async () => {
  const page = await open(false);
  page.holdNext = true;
  await page.clock.advance(2500);
  assert.equal(page.held.length, 1, "a read of the first project is in flight");
  await page.chooseProject(SECOND.project_id);
  await page.release(0, 404);
  assert.deepEqual(page.clock.cadences, [1000, 2500], "the answer belongs to a project that is no longer on screen");
  assert.equal(page.root.dataset.error, "false");
  assert.ok(page.fetches.at(-1)?.includes(SECOND.project_id), "the second project was read");
});

test("N54 after a 404 the capsule reads its page again when it is shown or retried, but only once the Host serves the page", async () => {
  const page = await open(false, { status: 404 });
  await page.setHidden(true);
  assert.equal(page.reloads, 0, "hiding it does nothing");
  await page.setHidden(false);
  assert.equal(page.pageReads.length, 1);
  assert.equal(page.reloads, 1, "showing it reads the page again, which brings the current project list");
  const retry: Part = Object.assign(new Part(), { closest: (selector: string) => selector === "[data-capsule-retry]" ? retry : null });
  page.fire("document", "click", { target: retry });
  await flush();
  assert.equal(page.reloads, 2, "Retry reads the page again, not only the project that is gone");
  assert.equal(page.fetches.length, 1, "neither asked the Host for the dead project again");
  page.pageReply = { status: 0 };
  await page.setHidden(true);
  await page.setHidden(false);
  assert.equal(page.pageReads.length, 3, "it asked whether the Host serves the page");
  assert.equal(page.reloads, 2, "and a Host that is restarting is not turned into an error page by a reload");
});

test("N54 after a 404 an 'online' read that succeeds brings the polling back, and one that fails goes back to ordinary reconnecting", async () => {
  const page = await open(false, { status: 404 });
  assert.deepEqual(page.clock.cadences, []);
  page.reply = { status: 0 };
  page.fire("window", "online");
  await flush();
  assert.deepEqual(page.clock.cadences, [1000, 2500], "a network failure is the ordinary kind: it reads again on the usual cadence");
  assert.match(page.errorDetail.textContent, /自动重新连接/, "and the panel's words are true again, because something is reconnecting");
  page.reply = { status: 404 };
  await page.clock.advance(2500);
  assert.deepEqual(page.clock.cadences, [], "it is told once more that the project is gone, and stops");
  page.reply = { status: 200 };
  page.fire("window", "online");
  await flush();
  assert.deepEqual(page.clock.cadences, [1000, 2500], "a successful read brings the polling back");
});
