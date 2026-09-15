import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createTerminalAutofill, createTerminalConnection, createTerminalPanels, type PanelRecord, type TerminalAutofillOptions, type TerminalPanelsOptions } from "@molis-ai/molis-work-plugin-work/terminal";

function installGlobals(t: TestContext, values: Record<string, unknown>) {
  for (const [key, value] of Object.entries(values)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
}

// Browser ports, not a browser E2E: assertions exercise the exported production controller.
function autofillFixture(t: TestContext) {
  const storage = new Map<string, string>();
  const posts: unknown[] = [];
  const browser = Object.assign(new EventTarget(), {
    parent: { postMessage: (message: unknown) => posts.push(message) },
    setTimeout,
  });
  installGlobals(t, {
    window: browser,
    location: { origin: "http://localhost", search: "?onboarding-embed=1" },
    document: { querySelector: () => ({ click() {} }) },
    matchMedia: () => ({ matches: false }),
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
  });
  const writes: unknown[][] = [];
  const opened: unknown[] = [];
  const statuses: Array<[string, string | undefined]> = [];
  const menus: boolean[] = [];
  const state = { panel: null as { panel_id: string } | null, output: "Ask Codex to do anything", readOnly: false };
  const options: TerminalAutofillOptions = {
    goalId: () => "goal-a", parentReadOnly: () => state.readOnly,
    text: (text) => text, errorText: (error) => String(error),
    terminal: {
      current: () => state.panel,
      isAlive: (id) => state.panel?.panel_id === id,
      output: () => ({ hasOutput: true, lastOutputAt: Date.now() - 10_000 }),
      visibleOutput: () => state.output,
      open: async (body) => { opened.push(body); state.panel = { panel_id: "panel-a" }; },
      writePrompt: async (...args) => { writes.push(args); },
    },
    setStatus: (text, status) => statuses.push([text, status]),
    setMenuOpen: (open) => menus.push(open), showToast() {},
  };
  return { storage, posts, browser, state, options, writes, opened, statuses, menus };
}

test("Feed context waits for a live panel, fills once without sending, and consumes its pending record", async (t) => {
  const f = autofillFixture(t);
  const key = "molis-work-feed-runtime-autofill:goal-a";
  f.storage.set(key, JSON.stringify({ itemId: "item-a", at: Date.now() }));
  let completeWrite!: () => void;
  f.options.terminal.writePrompt = async (...args) => {
    f.writes.push(args);
    await new Promise<void>((resolve) => { completeWrite = resolve; });
  };
  const controller = createTerminalAutofill(f.options);
  await controller.fillPendingFeedContext();
  assert.deepEqual(f.menus, [true]);
  assert.equal(f.storage.has(key), true);
  assert.deepEqual(f.writes, []);
  f.state.panel = { panel_id: "panel-a" };
  const first = controller.fillPendingFeedContext();
  await Promise.resolve();
  await controller.fillPendingFeedContext();
  assert.deepEqual(f.writes, [[false, "item-a"]]);
  completeWrite();
  await first;
  assert.equal(f.storage.has(key), false);
  assert.deepEqual(f.statuses.at(-1), ["Item 上下文已填入，检查后再发送。", "live"]);
});

test("Failed context fill preserves the pending item for a later retry", async (t) => {
  const f = autofillFixture(t);
  const key = "molis-work-feed-runtime-autofill:goal-a";
  f.storage.set(key, JSON.stringify({ itemId: "item-a" }));
  f.state.panel = { panel_id: "panel-a" };
  let fail = true;
  f.options.terminal.writePrompt = async (...args) => {
    if (fail) throw new Error("channel disconnected");
    f.writes.push(args);
  };
  const controller = createTerminalAutofill(f.options);
  await controller.fillPendingFeedContext();
  assert.equal(f.storage.has(key), true);
  assert.equal(f.statuses.at(-1)?.[1], "error");
  fail = false;
  await controller.fillPendingFeedContext();
  assert.equal(f.storage.has(key), false);
  assert.deepEqual(f.writes, [[false, "item-a"]]);
});

test("Onboarding opens one panel and waits for human startup confirmation before filling", async (t) => {
  const f = autofillFixture(t);
  const key = "molis-work-onboarding-runtime-autofill:goal-a";
  f.storage.set(key, JSON.stringify({ runtimeKind: "codex", workspacePath: "/project", at: Date.now() - 10_000 }));
  f.state.output = "Do you trust the contents of this directory? Press Enter to confirm";
  const controller = createTerminalAutofill(f.options);
  await controller.fillPendingOnboardingContext();
  assert.deepEqual(f.opened, [{ runtime_kind: "codex", cwd: "/project" }]);
  assert.deepEqual(f.writes, []);
  assert.equal(f.storage.has(key), true);
  assert.deepEqual(f.posts.at(-1), { type: "molis-work:onboarding-runtime-waiting", goalId: "goal-a", message: undefined });
  f.state.output = "Ask Codex to do anything";
  await controller.fillPendingOnboardingContext();
  assert.equal(f.opened.length, 1);
  assert.deepEqual(f.writes, [[false, undefined, true]]);
  assert.equal(f.storage.has(key), false);
  assert.deepEqual(f.posts.at(-1), { type: "molis-work:onboarding-runtime-ready", goalId: "goal-a", message: undefined });
});

test("Onboarding ignores foreign messages and does not open terminals for read-only parents", async (t) => {
  const f = autofillFixture(t);
  f.state.readOnly = true;
  const controller = createTerminalAutofill(f.options);
  const data = { type: "molis-work:onboarding-runtime-bootstrap", goalId: "goal-a", runtimeKind: "codex", workspacePath: "/project" };
  for (const fields of [
    { origin: "https://foreign.test", source: f.browser.parent, data },
    { origin: "http://localhost", source: {}, data },
    { origin: "http://localhost", source: f.browser.parent, data: { ...data, goalId: "goal-b" } },
  ]) {
    f.browser.dispatchEvent(Object.assign(new Event("message"), fields));
  }
  assert.equal(f.storage.size, 0);
  f.browser.dispatchEvent(Object.assign(new Event("message"), { origin: "http://localhost", source: f.browser.parent, data }));
  await controller.fillPendingOnboardingContext();
  assert.equal(f.storage.size, 1);
  assert.deepEqual(f.opened, []);
  assert.deepEqual(f.writes, []);
});

class BrowserSocket extends EventTarget {
  static OPEN = 1;
  static instances: BrowserSocket[] = [];
  readyState = 0;
  readonly sent: unknown[] = [];
  constructor(readonly url: string) { super(); BrowserSocket.instances.push(this); }
  onSend?: (message: Record<string, unknown>) => void;
  send(text: string) { const message = JSON.parse(text); this.sent.push(message); this.onSend?.(message); }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  message(data: unknown) { this.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify(data) })); }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
}

test("Terminal channel authenticates once, shares in-flight connect, routes data, and reconnects after close", async (t) => {
  BrowserSocket.instances = [];
  installGlobals(t, { WebSocket: BrowserSocket });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const messages: unknown[] = [];
  const disconnected: string[] = [];
  let reconnects = 0;
  const connection = createTerminalConnection({
    controlToken: () => "control-token", url: () => "ws://localhost/pty", text: (s) => s,
    onMessage: (m) => messages.push(m), onDisconnected: (e) => disconnected.push(e.message),
    reconnect: async () => { reconnects += 1; },
  });
  const pending = connection.connect();
  assert.equal(connection.connect(), pending);
  assert.equal(BrowserSocket.instances.length, 1);
  const ws = BrowserSocket.instances[0]!;
  ws.open();
  assert.deepEqual(ws.sent, [{ type: "auth", token: "control-token" }]);
  ws.message({ type: "ready" });
  await pending;
  await connection.send({ type: "write", panelId: "panel-a", data: "hello" });
  assert.deepEqual(ws.sent.at(-1), { type: "write", panelId: "panel-a", data: "hello" });
  ws.message({ type: "data", panelId: "panel-a", data: "output" });
  assert.deepEqual(messages, [{ type: "data", panelId: "panel-a", data: "output" }]);
  ws.close();
  assert.deepEqual(disconnected, ["终端通道已断开"]);
  t.mock.timers.tick(399);
  assert.equal(reconnects, 0);
  t.mock.timers.tick(1);
  assert.equal(reconnects, 1);
  connection.scheduleReconnect();
  connection.stop();
  t.mock.timers.tick(8_000);
  assert.equal(reconnects, 1);
});

test("Closed authentication handshake rejects pending connect and allows a fresh connection", async (t) => {
  BrowserSocket.instances = [];
  installGlobals(t, { WebSocket: BrowserSocket });
  const connection = createTerminalConnection({
    controlToken: () => "token", url: () => "ws://localhost/pty", text: (s) => s,
    onMessage() {}, onDisconnected() {}, reconnect: async () => {},
  });
  const first = connection.connect();
  BrowserSocket.instances[0]!.close();
  await assert.rejects(first, /终端通道已断开/);
  const next = connection.connect();
  assert.equal(BrowserSocket.instances.length, 2);
  BrowserSocket.instances[1]!.open();
  BrowserSocket.instances[1]!.message({ type: "ready" });
  await next;
  connection.stop();
});

function panelRecord(goalId: string, status: "open" | "exited" = "open"): PanelRecord {
  return { panel_id: `panel-${goalId}`, goal_id: goalId, runtime_kind: "generic", launch_command: "cat",
    launch_args: [], cwd: "/project", work_context_id: `context-${goalId}`, title: "Terminal", status };
}

function panelsFixture(t: TestContext) {
  BrowserSocket.instances = [];
  const state = { goal: "goal-a", parent: false };
  const sessions = new Map<string, { hasOutput: boolean; recentOutput: string; lastOutputAt: number;
    term: { write(text: string): void; reset(): void; focus(): void };
    fit: { fit(): void; proposeDimensions(): { cols: number; rows: number } } }>();
  const written: string[] = [];
  let resets = 0;
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const screen = {
    get: (id: string) => sessions.get(id), has: (id: string) => sessions.has(id),
    ensure: (id: string) => {
      if (!sessions.has(id)) sessions.set(id, { hasOutput: false, recentOutput: "", lastOutputAt: 0,
        term: { write: (text) => written.push(text), reset: () => { resets += 1; }, focus() {} },
        fit: { fit() {}, proposeDimensions: () => ({ cols: 100, rows: 30 }) } });
      return sessions.get(id)!;
    },
    remove: (id: string) => sessions.delete(id),
  };
  const io = {
    respond: async (_url: string, _init: RequestInit): Promise<Response> => Response.json({ panels: [] }),
  };
  installGlobals(t, {
    WebSocket: BrowserSocket,
    location: { protocol: "http:", host: "localhost" },
    requestAnimationFrame: (callback: () => void) => { callback(); return 1; },
    fetch: async (url: string, init: RequestInit = {}) => {
      requests.push({ url, method: init.method ?? "GET", body: init.body as string | undefined });
      return io.respond(url, init);
    },
  });
  const shown: Array<string | null> = [];
  const options: TerminalPanelsOptions = {
    screens: screen as unknown as TerminalPanelsOptions["screens"],
    goalId: () => state.goal, parentReadOnly: () => state.parent, parentReadOnlyMessage: () => "parent read-only",
    canControlPanel: (panel): panel is PanelRecord => Boolean(panel && !state.parent && panel.goal_id === state.goal),
    text: (text) => text, errorText: (error) => String(error), route: (path) => "/projects/project-a" + path,
    headers: () => ({ "x-molis-work-control-token": "token" }), desktopHeaders: () => ({ "x-molis-work-desktop": "1" }),
    controlToken: () => "token", setStatus() {}, setMenuOpen() {}, renderTabs() {},
    showTerminal: (id) => shown.push(id), onOutput() {}, afterOpened: async () => {},
  };
  return { controller: createTerminalPanels(options), io, state, requests, sessions, shown, written, resets: () => resets };
}

test("Switching Goals invalidates an in-flight panel response without adopting the old Goal's terminals", async (t) => {
  const f = panelsFixture(t);
  let finishOld!: (response: Response) => void;
  f.io.respond = async (url) => url.includes("/goals/goal-a/")
    ? new Promise<Response>((resolve) => { finishOld = resolve; })
    : Response.json({ panels: [panelRecord("goal-b", "exited")] });
  const oldLoad = f.controller.loadPanels();
  f.state.goal = "goal-b";
  f.controller.resetGoal();
  assert.deepEqual(f.controller.panels, []);
  assert.equal(f.controller.activeId, null);
  await f.controller.loadPanels();
  finishOld(Response.json({ panels: [panelRecord("goal-a", "exited")] }));
  await oldLoad;
  assert.deepEqual(f.controller.panels.map((p) => p.goal_id), ["goal-b"]);
  assert.equal(f.controller.activeId, "panel-goal-b");
  assert.equal(f.shown.at(-1), "panel-goal-b");
  assert.equal(BrowserSocket.instances.length, 0);
});

test("Panel loading attaches without starting and explicit reopen restarts the same panel", async (t) => {
  const f = panelsFixture(t);
  const panel = panelRecord("goal-a");
  f.io.respond = async (url) => url.endsWith("/reopen") ? Response.json({ panel }) : Response.json({ panels: [panel] });
  const connected = f.controller.connect();
  const ws = BrowserSocket.instances[0]!;
  ws.open(); ws.message({ type: "ready" }); await connected;
  ws.onSend = (message) => {
    if (message.type === "spawn") ws.message({ type: "spawned", panelId: message.panelId,
      attached: false, started: message.attachOnly ? false : true });
  };
  await f.controller.loadPanels();
  const attach = ws.sent.find((m) => (m as { type: string }).type === "spawn") as Record<string, unknown>;
  assert.equal(attach.attachOnly, true);
  assert.equal(attach.panelId, panel.panel_id);
  assert.equal(f.controller.isAlive(panel.panel_id), false);
  assert.equal(f.controller.panels[0]?.status, "exited");
  assert.equal(f.requests.some((r) => r.method === "POST" && r.url.endsWith("/exited")), true);
  await f.controller.reopenPanel();
  const reopen = ws.sent.at(-1) as Record<string, unknown>;
  assert.equal(reopen.attachOnly, false);
  assert.equal(reopen.panelId, panel.panel_id);
  assert.equal(f.controller.isAlive(panel.panel_id), true);
  assert.equal(f.controller.panels[0]?.status, "open");
  assert.equal(f.resets(), 1);
  f.state.parent = true;
  const previousRequestCount = f.requests.length;
  await f.controller.reopenPanel();
  assert.equal(f.requests.length, previousRequestCount);
  f.controller.stop();
});

test("Channel reconnect reattaches the live process and restores replay without relaunching it", async (t) => {
  const f = panelsFixture(t);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const panel = panelRecord("goal-a");
  f.io.respond = async () => Response.json({ panels: [panel] });
  const connected = f.controller.connect();
  const first = BrowserSocket.instances[0]!;
  first.open(); first.message({ type: "ready" }); await connected;
  first.onSend = (message) => {
    if (message.type === "spawn") first.message({ type: "spawned", panelId: panel.panel_id, attached: true, replay: "initial output" });
  };
  await f.controller.loadPanels();
  assert.equal(f.controller.isAlive(panel.panel_id), true);
  first.close();
  t.mock.timers.tick(400);
  const second = BrowserSocket.instances[1]!;
  let restored!: () => void;
  const restore = new Promise<void>((resolve) => { restored = resolve; });
  second.onSend = (message) => {
    if (message.type === "spawn") {
      assert.equal(message.attachOnly, true);
      assert.equal(message.panelId, panel.panel_id);
      second.message({ type: "spawned", panelId: panel.panel_id, attached: true, replay: "restored output" });
      restored();
    }
  };
  second.open(); second.message({ type: "ready" });
  await restore;
  // The spawn handler resolves the in-flight request before its continuation applies replay.
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.resets(), 1);
  assert.equal(f.written.at(-1), "restored output");
  assert.equal(f.controller.isAlive(panel.panel_id), true);
  assert.equal(f.requests.filter((r) => r.method === "POST").length, 0);
  f.controller.stop();
});
