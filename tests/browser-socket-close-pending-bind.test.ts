import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { WebSocket, WebSocketServer } from "ws";

import { attachMolisWorkBrowserSocket, BrowserHost } from "@molis-ai/molis-work-app-local-host";
import { BROWSER_SOCKET_PATH, type BrowserClientMessage, type BrowserServerMessage } from "@molis-ai/molis-work-contracts/services/browser";

/*
 * BL-browser-socket-close-pending-bind: the side panel's browser socket binds its page (watch, attach) only after the
 * project check. When the panel closes while that check is still running, the binding that finishes afterwards must not
 * hang a listener on the page. The check is a promise the test completes by hand, after the server has handled the close.
 */

const TOKEN = "browser-socket-close-pending-bind-token";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

type BrowserPage = ReturnType<BrowserHost["page"]>;
type BrowserListener = Parameters<BrowserPage["watch"]>[0];

/** What the socket hung on one project's page, in order. */
interface Recorded { readonly listeners: Set<BrowserListener>; readonly calls: string[] }

interface Harness {
  readonly host: BrowserHost;
  readonly pages: Map<string, Recorded>;
  readonly checks: Map<string, ReturnType<typeof deferred<boolean>>>;
  readonly checked: (projectId: string) => Promise<void>;
  /** Resolves once the server-side socket of the next connection has emitted `close` (its close handler has run). */
  readonly serverClosed: () => Promise<void>;
  readonly connect: () => Promise<{ ws: WebSocket; messages: BrowserServerMessage[] }>;
}

async function harness(
  t: TestContext,
  immediate: Record<string, boolean> = {},
  extra: { onTakeover?: (page: BrowserPage) => Promise<void> | void } = {},
): Promise<Harness> {
  // A real host and real pages that never start Chrome: binding is recorded instead of reaching a browser.
  const home = await mkdtemp(join(tmpdir(), "browser-socket-close-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const host = new BrowserHost({ homeDirectory: home, locate: () => null });
  const pages = new Map<string, Recorded>();
  const record = (projectId: string) => { let found = pages.get(projectId); if (!found) pages.set(projectId, found = { listeners: new Set(), calls: [] }); return found; };
  const hang = (projectId: string, kind: string) => (listener: BrowserListener) => {
    const page = record(projectId); page.calls.push(kind); page.listeners.add(listener);
    return () => { page.calls.push("detach"); page.listeners.delete(listener); };
  };
  // Each page the socket asks for records its bindings; pages the socket never asks for are never created.
  const create = host.page.bind(host);
  t.mock.method(host, "page", (projectId: string) => {
    const known = host.existingPage(projectId);
    if (known) return known;
    const page = create(projectId);
    t.mock.method(page, "watch", hang(projectId, "watch"));
    t.mock.method(page, "attach", hang(projectId, "attach"));
    t.mock.method(page, "setVisible", (_listener: BrowserListener, visible: boolean) => { record(projectId).calls.push(`visible:${visible}`); });
    return page;
  });
  const checks = new Map<string, ReturnType<typeof deferred<boolean>>>();
  const asked = new Map<string, ReturnType<typeof deferred<void>>>();
  const askedFor = (projectId: string) => { let found = asked.get(projectId); if (!found) asked.set(projectId, found = deferred<void>()); return found; };
  const projectExists = (projectId: string) => {
    askedFor(projectId).resolve();
    if (projectId in immediate) return immediate[projectId]!;
    const check = deferred<boolean>(); checks.set(projectId, check); return check.promise;
  };
  // The server-side socket is the module's own: watch its `close` from the `connection` it emits.
  let closed = deferred<void>();
  const emit = WebSocketServer.prototype.emit;
  let sawConnection = false;
  t.mock.method(WebSocketServer.prototype, "emit", function (this: WebSocketServer, event: string | symbol, ...rest: unknown[]) {
    if (event === "connection") { sawConnection = true; const current = closed; (rest[0] as WebSocket).once("close", () => current.resolve()); }
    return emit.call(this, event, ...rest);
  });
  const server: Server = createServer((_request, response) => { response.writeHead(404); response.end(); });
  attachMolisWorkBrowserSocket(server, TOKEN, () => host, { projectExists, ...(extra.onTakeover ? { onTakeover: extra.onTakeover } : {}) });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  // Upgraded sockets are no longer the HTTP server's connections: end the clients first, or `close` waits on them.
  const clients = new Set<WebSocket>();
  t.after(() => new Promise<void>(resolve => { for (const client of clients) client.terminate(); server.closeAllConnections(); server.close(() => resolve()); }));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    host, pages, checks,
    checked: projectId => askedFor(projectId).promise,
    serverClosed: async () => { assert.ok(sawConnection, "the browser socket's server connection was observed"); await closed.promise; closed = deferred<void>(); },
    connect: async () => {
      const ws = new WebSocket(origin.replace(/^http/u, "ws") + BROWSER_SOCKET_PATH, { headers: { Origin: origin } });
      const messages: BrowserServerMessage[] = [];
      ws.on("message", (raw, binary) => { if (!binary) messages.push(JSON.parse(String(raw)) as BrowserServerMessage); });
      await new Promise<void>((resolve, reject) => { ws.once("open", () => resolve()); ws.once("error", reject); });
      ws.send(JSON.stringify({ type: "auth", token: TOKEN } satisfies BrowserClientMessage));
      await until(() => messages.some(message => message.type === "ready"), "the socket to accept the control token");
      clients.add(ws);
      return { ws, messages };
    },
  };
}

async function until(done: () => boolean, what: string, ms = 5_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!done()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

const sendTo = (ws: WebSocket, message: BrowserClientMessage) => ws.send(JSON.stringify(message));
const closeAndWait = async (h: Harness, ws: WebSocket) => { const server = h.serverClosed(); ws.close(); await server; };
const settle = () => new Promise(resolve => setImmediate(resolve));

test("BL-browser-socket-close-pending-bind: a watch whose project check finishes after the panel closed hangs no listener", async t => {
  const h = await harness(t);
  const { ws } = await h.connect();
  sendTo(ws, { type: "watch", project_id: "p1" });
  sendTo(ws, { type: "visible", visible: true });
  await h.checked("p1");
  await closeAndWait(h, ws);
  h.checks.get("p1")!.resolve(true);
  await settle(); await settle();
  assert.deepEqual(h.pages.get("p1")?.calls ?? [], [], "the late watch binding hangs nothing and the queued message finds no page");
  assert.equal(h.pages.get("p1")?.listeners.size ?? 0, 0);
});

test("BL-browser-socket-close-pending-bind: closing releases the listener already held, and a later attach finishing after it hangs none", async t => {
  const h = await harness(t, { held: true });
  const { ws } = await h.connect();
  sendTo(ws, { type: "attach", project_id: "held", viewport: { width: 800, height: 600 } } as BrowserClientMessage);
  await until(() => h.pages.get("held")?.listeners.size === 1, "the first page to be attached");
  sendTo(ws, { type: "attach", project_id: "late", viewport: { width: 800, height: 600 } } as BrowserClientMessage);
  await h.checked("late");
  await closeAndWait(h, ws);
  assert.deepEqual(h.pages.get("held")!.calls, ["attach", "detach"], "the listener held when the panel closed is released");
  h.checks.get("late")!.resolve(true);
  await settle(); await settle();
  assert.equal(h.pages.get("late"), undefined, "the late attach never reaches the page");
  assert.equal(h.host.existingPage("late"), undefined);
  assert.equal(h.pages.get("held")!.listeners.size, 0);
});

test("BL-browser-socket-close-pending-bind: an open panel still binds after the check, in order, receives messages, and releases on close", async t => {
  const h = await harness(t);
  const { ws, messages } = await h.connect();
  sendTo(ws, { type: "watch", project_id: "p1" });
  sendTo(ws, { type: "visible", visible: true });
  await h.checked("p1");
  h.checks.get("p1")!.resolve(true);
  await until(() => h.pages.get("p1")?.calls.length === 2, "the binding and the queued message");
  const page = h.pages.get("p1")!;
  assert.deepEqual(page.calls, ["watch", "visible:true"], "the message sent behind the binding waits for it");
  const [listener] = page.listeners;
  listener!.state(h.host.page("p1").snapshot());
  await until(() => messages.some(message => message.type === "state"), "the page's state to reach the live panel");
  await closeAndWait(h, ws);
  assert.deepEqual(page.calls, ["watch", "visible:true", "detach"]);
  assert.equal(page.listeners.size, 0);
});

test("BL-browser-socket-close-pending-bind: a refused project check still answers with an error and binds nothing", async t => {
  const h = await harness(t, { missing: false });
  const { ws, messages } = await h.connect();
  sendTo(ws, { type: "watch", project_id: "missing" });
  sendTo(ws, { type: "visible", visible: true });
  await until(() => messages.some(message => message.type === "error"), "the refusal");
  assert.deepEqual(messages.filter(message => message.type === "error"), [{ type: "error", message: "项目不存在" }]);
  await settle();
  assert.equal(h.pages.get("missing"), undefined, "a refused binding drops what follows (S-04)");
  assert.equal(h.host.existingPage("missing"), undefined);
});

test("P1-F1: closing while a queued attach(late) and navigate/takeover are pending clears page and never touches the old held page", async t => {
  const h = await harness(t, { held: true });
  const { ws } = await h.connect();
  sendTo(ws, { type: "attach", project_id: "held", viewport: { width: 800, height: 600 } } as BrowserClientMessage);
  await until(() => h.pages.get("held")?.listeners.size === 1, "the first page to be attached");

  const heldPage = h.host.existingPage("held")!;
  t.mock.method(heldPage, "navigate", async (input: string) => {
    h.pages.get("held")!.calls.push(`navigate:${input}`);
  });
  t.mock.method(heldPage, "setControl", (control: { mode: string }) => {
    h.pages.get("held")!.calls.push(`control:${control.mode}`);
  });

  sendTo(ws, { type: "attach", project_id: "late", viewport: { width: 800, height: 600 } } as BrowserClientMessage);
  sendTo(ws, { type: "navigate", input: "https://example.com" });
  sendTo(ws, { type: "takeover" });
  await h.checked("late");
  await closeAndWait(h, ws);
  h.checks.get("late")!.resolve(true);
  await settle();
  await settle();
  assert.deepEqual(h.pages.get("held")!.calls, ["attach", "detach"], "old held page is never navigated or taken over after close");
  assert.equal(h.pages.get("late"), undefined);
  assert.equal(h.host.existingPage("late"), undefined);
});

test("P1-F1: closing during takeoverFirst prevents navigate from running on the detached page", async t => {
  const entered = deferred<void>();
  const release = deferred<void>();
  const h = await harness(t, { held: true }, {
    onTakeover: async () => {
      entered.resolve();
      await release.promise;
    },
  });
  const { ws } = await h.connect();
  sendTo(ws, { type: "attach", project_id: "held", viewport: { width: 800, height: 600 } } as BrowserClientMessage);
  await until(() => h.pages.get("held")?.listeners.size === 1, "the held page to attach");

  const heldPage = h.host.existingPage("held")!;
  heldPage.setControl({ mode: "assistant", work_id: "work-1", activity: null });
  t.mock.method(heldPage, "navigate", async (input: string) => {
    h.pages.get("held")!.calls.push(`navigate:${input}`);
  });

  sendTo(ws, { type: "navigate", input: "https://example.com/after-close" });
  await entered.promise;
  await closeAndWait(h, ws);
  release.resolve();
  await settle();
  await settle();
  assert.equal(h.pages.get("held")!.calls.some(entry => entry.startsWith("navigate:")), false, "navigate does not run after close during takeover");
});
