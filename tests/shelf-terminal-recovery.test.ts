import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { buildSync } from "esbuild";
import type { UiTerminalEvent, UiTerminalCommand, UiTerminalMountOptions } from "@molis-ai/molis-work-contracts/platform/ui";
import { SHELF_MESSAGES } from "@molis-ai/molis-work-plugin-shelf";

// RAC-717: the terminal well is Shelf's own browser code (src/browser/terminal.ts); the platform's entry no longer carries it.
const compiled = buildSync({ entryPoints: [fileURLToPath(new URL("../plugins/native/shelf/src/browser/terminal.ts", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "browser", target: "es2022" }).outputFiles[0]!.text;
type Recovery = { texts: string[]; message: string };
type Bridge = { open(): void; send(text: string): boolean; isLive(): boolean };
const panelId = "installation-owned-terminal";
const flush = async () => { await new Promise(resolve => setImmediate(resolve)); };

// Production queue controller; the common terminal API is the boundary being simulated here.
// Real backend authorization and browser keyboard/replay run in security-invariants-plugin-terminals*.
/** The page's translator, as the Host gives it: the stable key in the page's language (RAC-1321). */
const shelfWords = (english: boolean) => (key: string) => {
  const text = SHELF_MESSAGES[key as keyof typeof SHELF_MESSAGES];
  assert.ok(text, key);
  return english ? text.en : text.zh;
};

function fixture(options: { english?: boolean } = {}) {
  const window = new EventTarget(), recovered: Recovery[] = [], requests: string[] = [], writes: UiTerminalCommand[] = [];
  let mounted: UiTerminalMountOptions | undefined, unavailable = false, failedWrite = false, disposed = 0;
  window.addEventListener("molis-shelf-tui-unsent", event => recovered.push(structuredClone((event as CustomEvent<Recovery>).detail)));
  const screen = { dataset: {} };
  const context = {
    module: { exports: {} as { installTerminal(page: unknown): void } }, window, CustomEvent,
    molisWorkShelfTui: undefined as Bridge | undefined,
    async molisWorkRequest(path: string, options: { body: Record<string, unknown> }) {
      requests.push(path); assert.equal(JSON.stringify(options.body), "{}", "the page cannot choose a command or working directory");
      if (unavailable) throw new Error("安装权限已失效");
      return { panelId };
    },
    molisPageTerminal: {
      async mount(_screen: unknown, options: UiTerminalMountOptions) {
        mounted = options; return { fit() {}, focus() {}, dispose() { disposed++; } };
      },
      async send(command: UiTerminalCommand) { if (failedWrite) throw new Error("连接已断开"); writes.push(structuredClone(command)); },
    },
  };
  const page = { bench: { querySelector: () => screen }, api: "/projects/fixture/api/plugins/io.molis.work.shelf",
    lifetime: { signal: new AbortController().signal }, L: shelfWords(options.english === true) };
  runInNewContext(compiled, context, { filename: "shelf-terminal.js" }); context.module.exports.installTerminal(page);
  assert.ok(context.molisWorkShelfTui); const bridge = context.molisWorkShelfTui;
  return { bridge, recovered, requests, writes, get disposed() { return disposed; },
    event(event: UiTerminalEvent) { assert.ok(mounted); mounted.onEvent?.(event); },
    failOpen() { unavailable = true; }, failWrite() { failedWrite = true; },
    async open() { bridge.open(); await flush(); assert.ok(mounted); },
    spawned() { assert.ok(mounted); mounted.onEvent?.({ type: "spawned", panelId, attached: true, started: false, replay: "" }); },
  };
}

test("SYS-15 Shelf startup rejection restores queued input once and does not replay it", async () => {
  const f = fixture(); f.failOpen(); f.bridge.open(); assert.equal(f.bridge.send("待发送的文字"), true); await flush();
  assert.equal(f.recovered.length, 1); assert.deepEqual(f.recovered[0]!.texts, ["待发送的文字"]);
  assert.match(f.recovered[0]!.message, /权限/); assert.deepEqual(f.writes, []); assert.equal(f.bridge.isLive(), false);
  assert.equal(f.bridge.send("保留在输入框"), false);
});

test("SYS-15 Shelf opens only its backend terminal and flushes queued input after attach", async () => {
  const f = fixture(); assert.equal(f.bridge.send("未打开"), false);
  f.bridge.open(); f.bridge.open(); f.bridge.send("启动期间输入"); await flush();
  assert.deepEqual(f.requests, ["/projects/fixture/api/plugins/io.molis.work.shelf/terminal"]); assert.deepEqual(f.writes, []);
  f.spawned(); assert.equal(f.bridge.isLive(), true);
  assert.deepEqual(f.writes, [{ type: "write", panelId, data: "启动期间输入\r" }]);
  f.spawned(); assert.equal(f.writes.length, 1, "another attach acknowledgement must not repeat input");
});

test("RAC-1322 SYS-15 Shelf disconnect restores pending input; reattach does not resend it", async () => {
  const f = fixture(); await f.open(); f.bridge.send("尚未发送"); f.event({ type: "disconnected" });
  assert.equal(f.recovered[0]!.message, "终端连接已断开，未发送的输入已恢复。");
  assert.deepEqual(f.recovered[0]!.texts, ["尚未发送"]); f.spawned(); assert.deepEqual(f.writes, []);
  assert.equal(f.bridge.send(f.recovered[0]!.texts[0]!), true); await flush();
  assert.deepEqual(f.writes, [{ type: "write", panelId, data: "尚未发送\r" }]);
});

test("SYS-15 Shelf exit releases the view and another open never repeats delivered input", async () => {
  const f = fixture(); await f.open(); f.spawned(); f.bridge.send("第一轮"); await flush();
  f.event({ type: "exit", panelId, exitCode: 0, signal: 0 }); assert.equal(f.bridge.isLive(), false); assert.equal(f.disposed, 1);
  assert.deepEqual(f.recovered, []); f.bridge.open(); f.bridge.open(); f.bridge.send("第二轮"); await flush();
  assert.equal(f.requests.length, 2); f.spawned(); await flush();
  assert.deepEqual(f.writes.map(command => command.type === "write" ? command.data : ""), ["第一轮\r", "第二轮\r"]);
});

test("RAC-1322 SYS-15 Shelf exit before attach returns pending input for explicit retry", async () => {
  const f = fixture(); await f.open(); f.bridge.send("启动期间退出"); f.event({ type: "exit", panelId, exitCode: 1, signal: 0 });
  assert.deepEqual(f.recovered[0]!.texts, ["启动期间退出"]); assert.match(f.recovered[0]!.message, /会话已结束/);
  await f.open(); f.spawned(); assert.deepEqual(f.writes, []); f.bridge.send(f.recovered[0]!.texts[0]!); await flush(); assert.equal(f.writes.length, 1);
});

test("SYS-15 Shelf failed transport write returns the input without automatic replay", async () => {
  const f = fixture(); await f.open(); f.spawned(); f.failWrite(); f.bridge.send("断开时输入"); await flush();
  assert.deepEqual(f.recovered[0]!.texts, ["断开时输入"]); f.spawned(); assert.deepEqual(f.writes, []);
});

test("RAC-1321 the terminal well's recovery sentences are English on an English page", async () => {
  const ended = fixture({ english: true }); await ended.open(); ended.bridge.send("unsent");
  ended.event({ type: "exit", panelId, exitCode: 1, signal: 0 });
  assert.equal(ended.recovered[0]!.message, "The terminal session ended. Your unsent input was restored.");
  assert.doesNotMatch(ended.recovered[0]!.message, /[一-鿿]/u);
  const dropped = fixture({ english: true }); await dropped.open(); dropped.bridge.send("unsent");
  dropped.event({ type: "disconnected" });
  assert.equal(dropped.recovered[0]!.message, "The terminal connection dropped. Your unsent input was restored.");
  assert.doesNotMatch(dropped.recovered[0]!.message, /[一-鿿]/u);
});
