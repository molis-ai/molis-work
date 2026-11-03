import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { UiTerminalCommand, UiTerminalEvent } from "@molis-ai/molis-work-contracts/platform/ui";
import { createPageTerminal } from "@molis-ai/molis-work-app-workbench/terminal";

// PG-053 (specs/repository-anti-corruption/slices/pg053-plugin-terminals.md): the terminal the shell gives a page it draws itself, and the
// rule that the workbench's terminal entry names no plugin. The Shelf and Characters clients that use it have their own tests.

const ROOT = fileURLToPath(new URL("..", import.meta.url));

class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: Array<Record<string, unknown>> = [];
  private readonly listeners = new Map<string, Array<(event: { data?: string }) => void>>();
  constructor(readonly url: string) { FakeSocket.all.push(this); queueMicrotask(() => this.fire("open", {})); }
  addEventListener(name: string, listener: (event: { data?: string }) => void) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]); }
  send(text: string) {
    const message = JSON.parse(text) as Record<string, unknown>;
    this.sent.push(message);
    if (message.type === "auth") { this.readyState = FakeSocket.OPEN; queueMicrotask(() => this.fire("message", { data: JSON.stringify({ type: "ready" }) })); }
  }
  say(message: Record<string, unknown>) { this.fire("message", { data: JSON.stringify(message) }); }
  drop() { this.readyState = 3; this.fire("close", {}); }
  private fire(name: string, event: { data?: string }) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
}

function page(t: TestContext) {
  FakeSocket.all = [];
  const install = (key: string, value: unknown) => {
    const before = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => { if (before) Object.defineProperty(globalThis, key, before); else Reflect.deleteProperty(globalThis, key); });
  };
  install("WebSocket", FakeSocket);
  install("location", { protocol: "http:", host: "127.0.0.1:4207" });
  install("document", { querySelector: () => ({ getAttribute: () => "control-token" }) });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rendered: Array<{ panelId: string }> = [];
  const terminal = createPageTerminal(async (_element, options) => { rendered.push({ panelId: options.panelId }); return { focus() {}, fit() {}, dispose() {} }; });
  const events: UiTerminalEvent[] = [];
  terminal.listen(event => events.push(event));
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  return { terminal, events, rendered, flush, socket: () => FakeSocket.all.at(-1)! };
}

test("RAC-900 the page terminal opens the shell's /pty channel with the control token and attaches to a panel without starting it", async t => {
  const f = page(t);
  const sent = f.terminal.send({ type: "attach", panelId: "character-run-1", cols: 100, rows: 30 });
  await f.flush(); await sent;
  assert.equal(f.socket().url, "ws://127.0.0.1:4207/pty");
  assert.deepEqual(f.socket().sent, [{ type: "auth", token: "control-token" }, { type: "spawn", panelId: "character-run-1", cols: 100, rows: 30, attachOnly: true }]);
  await f.terminal.mount({} as HTMLElement, { panelId: "character-run-1" });
  assert.deepEqual(f.rendered, [{ panelId: "character-run-1" }], "the renderer draws the screen, and is given the page terminal to write through");
});

test("RAC-900 what the server says about a panel reaches listeners in a page's words; the channel's own ready does not", async t => {
  const f = page(t);
  const sent = f.terminal.send({ type: "attach", panelId: "p1" });
  await f.flush(); await sent;
  const socket = f.socket();
  socket.say({ type: "spawned", panelId: "p1", attached: true, started: false, replay: "hello" });
  socket.say({ type: "data", panelId: "p1", data: "x" });
  socket.say({ type: "exit", panelId: "p1", exitCode: 3, signal: 0 });
  socket.say({ type: "error", message: "boom" });
  assert.deepEqual(f.events, [
    { type: "spawned", panelId: "p1", attached: true, started: false, replay: "hello" },
    { type: "data", panelId: "p1", data: "x" },
    { type: "exit", panelId: "p1", exitCode: 3, signal: 0 },
    { type: "error", message: "boom" },
  ]);
});

test("RAC-901 the page terminal sends attach, write, resize and kill and nothing else: no page can start a process or add fields through it", async t => {
  const f = page(t);
  const sent = f.terminal.send({ type: "attach", panelId: "p1" });
  await f.flush(); await sent;
  const refused = async (command: unknown) => assert.rejects(f.terminal.send(command as UiTerminalCommand), /refused/u);
  await refused({ type: "spawn", panelId: "p1", command: "/bin/sh", cwd: "/" });
  await refused({ type: "auth", token: "x" });
  await refused({ type: "write" });
  await refused(null);
  await f.terminal.send({ type: "write", panelId: "p1", data: "ls\r", cwd: "/etc" } as UiTerminalCommand);
  await f.terminal.send({ type: "resize", panelId: "p1", cols: 90, rows: 20 });
  await f.terminal.send({ type: "kill", panelId: "p1", signal: 9 } as UiTerminalCommand);
  assert.deepEqual(f.socket().sent.slice(2), [
    { type: "write", panelId: "p1", data: "ls\r" }, { type: "resize", panelId: "p1", cols: 90, rows: 20 }, { type: "kill", panelId: "p1" },
  ]);
});

test("RAC-900 a dropped channel is reported and, once back, the panels the page had attached are attached again without being started", async t => {
  const f = page(t);
  const sent = f.terminal.send({ type: "attach", panelId: "p1", cols: 80, rows: 24 });
  await f.flush(); await sent;
  await f.terminal.send({ type: "attach", panelId: "p2" });
  await f.terminal.send({ type: "kill", panelId: "p2" });
  f.socket().drop();
  assert.deepEqual(f.events, [{ type: "disconnected" }]);
  t.mock.timers.tick(400);
  await f.flush();
  assert.equal(FakeSocket.all.length, 2);
  assert.deepEqual(f.socket().sent, [{ type: "auth", token: "control-token" }, { type: "spawn", panelId: "p1", cols: 80, rows: 24, attachOnly: true }],
    "p2 was stopped and is not attached again");
});

const sources = (directory: string): string[] => readdirSync(directory).flatMap(name => {
  const path = join(directory, name);
  return statSync(path).isDirectory() ? sources(path) : /\.ts$/u.test(name) ? [path] : [];
});

test("RAC-902 the workbench's terminal entry and platform terminal import no plugin package and name no plugin", () => {
  const files = [join(ROOT, "apps/workbench/src/terminal-client.ts"), join(ROOT, "apps/workbench/src/terminal-view.ts"), ...sources(join(ROOT, "apps/workbench/src/terminal"))];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /molis-work-plugin-(?!sdk)|io\.molis\.work\.(?!platform)/u, `${file} names a plugin`);
  }
  const entry = readFileSync(join(ROOT, "apps/workbench/src/terminal-client.ts"), "utf8");
  assert.match(entry, /molisTerminalRenderer/u);
  assert.match(entry, /molisPageTerminal/u);
  assert.doesNotMatch(entry, /Shelf|Character|Goal/iu, "the entry lists no client of any plugin or Host surface");
});

test("RAC-2566 the workbench's terminal client only attaches: no spawn carries a program, folder or environment, and no Host panel route is named", () => {
  const files = [join(ROOT, "apps/workbench/src/terminal-client.ts"), ...sources(join(ROOT, "apps/workbench/src/terminal"))];
  let attaches = 0;
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // Every message that names `spawn`, up to the object's end: only `panelId`, size and `attachOnly: true`, never a program to start.
    for (const [message] of text.matchAll(/type: "spawn",?[^}]*\}/gu)) {
      attaches++;
      assert.match(message, /attachOnly: true/u, `${file}: ${message}`);
      assert.doesNotMatch(message, /\b(command|args|cwd|env)\b/u, `${file}: ${message}`);
    }
    assert.doesNotMatch(text, /\/api\/panels|\/api\/goals\//u, `${file} names a Host panel route`);
  }
  assert.ok(attaches >= 2, "the page terminal and the work terminal both attach");
});

test("RAC-902 a surface's terminal client rides in that surface's own bundle and reaches the terminal only through the platform's", () => {
  const shelf = join(ROOT, "plugins/native/shelf");
  assert.match(readFileSync(join(shelf, "src/browser/client.ts"), "utf8"), /installTerminal\(page\)/u, "Shelf's client bundle installs its own terminal well");
  assert.equal(JSON.parse(readFileSync(join(shelf, "package.json"), "utf8")).exports["./terminal-client"], undefined, "no workbench imports Shelf's terminal");
  const characters = readFileSync(join(ROOT, "apps/workbench/src/browser/characters/terminal.ts"), "utf8");
  assert.doesNotMatch(characters, /from "(?:\.\.\/)+terminal\//u, "Characters does not reuse the work terminal's modules");
  assert.match(characters, /molisPageTerminal/u);
  assert.match(readFileSync(join(ROOT, "apps/workbench/src/plugin-workbench.ts"), "utf8"), /id: "characters", bundle: "characters", assets: \["\/desktop\/pty-client\.js"\]/u,
    "the Characters bundle is preceded by the terminal bundle");
});
