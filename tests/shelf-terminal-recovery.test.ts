import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../plugins/native/shelf/src/terminal-client.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const options = { command: "/fixture/agent", cwd: "/fixture/shelf", title: "Fixture Agent" };
type OpenOptions = typeof options;
const panelId = "molis-shelf-tui";
type Message = { type: string; data?: string; token?: string; panelId?: string; command?: string };
type Recovery = { texts: string[]; message: string };
type Bridge = { open(options: OpenOptions): void; send(text: string): boolean; isLive(): boolean };

// This runs the current production controller. Only DOM, xterm and the wire
// transport are fake; no process or actual terminal agent is launched.
function fixture(token = "fixture-control-token") {
  const sockets: Socket[] = [];
  class Socket extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = Socket.CONNECTING;
    sent: Message[] = [];
    constructor(readonly url: string) { super(); sockets.push(this); }
    send(text: string) {
      assert.equal(this.readyState, Socket.OPEN, "writes require an open transport");
      this.sent.push(JSON.parse(text));
    }
    open() { this.readyState = Socket.OPEN; this.dispatchEvent(new Event("open")); }
    message(message: unknown) {
      this.dispatchEvent(Object.assign(new Event("message"), { data: JSON.stringify(message) }));
    }
    close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  }
  class Terminal {
    cols = 100;
    rows = 30;
    constructor(public options: Record<string, unknown>) {}
    loadAddon() {}
    open() {}
    onData() {}
    write() {}
    writeln() {}
  }
  const host = { dataset: {} as Record<string, string>, isConnected: true, clientWidth: 640 };
  const window = new EventTarget();
  const recovered: Recovery[] = [];
  const notices: string[] = [];
  window.addEventListener("molis-shelf-tui-unsent", (event) => {
    recovered.push(JSON.parse(JSON.stringify((event as CustomEvent<Recovery>).detail)));
  });
  window.addEventListener("molis-shelf-notice", (event) => {
    notices.push((event as CustomEvent<{ message: string }>).detail.message);
  });
  const context = {
    exports: {} as { startShelfTerminalClient?: () => void },
    molisWorkShelfTui: undefined as Bridge | undefined,
    require(name: string) {
      if (name === "@xterm/xterm") return { Terminal };
      if (name === "@xterm/addon-fit") return { FitAddon: class { fit() {} } };
      if (name === "@xterm/xterm/css/xterm.css") return { default: "" };
      throw new Error(`Unexpected dependency: ${name}`);
    },
    WebSocket: Socket, window, CustomEvent,
    location: { protocol: "http:", host: "localhost" },
    ResizeObserver: class { observe() {} },
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    document: {
      documentElement: { dataset: { resolvedTheme: "light" } },
      querySelector(selector: string) {
        if (selector === "[data-shelf-tty-screen]") return host;
        if (selector === 'meta[name="molis-work-control-token"]') return { getAttribute: () => token };
        return null;
      },
      getElementById: () => null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild() {} },
    },
  };
  runInNewContext(compiled, context, { filename: "shelf-terminal-client.js" });
  context.exports.startShelfTerminalClient!();
  assert.ok(context.molisWorkShelfTui);
  const bridge = context.molisWorkShelfTui;
  const connect = () => {
    bridge.open(options);
    const socket = sockets.at(-1)!;
    socket.open();
    assert.deepEqual(socket.sent[0], { type: "auth", token });
    socket.message({ type: "ready" });
    return socket;
  };
  const writes = (socket: Socket) => socket.sent.filter(message => message.type === "write").map(message => message.data);
  return { bridge, sockets, recovered, notices, connect, writes };
}

test("Shelf spawn failure returns all pending input once and retry does not resend the old queue", () => {
  const f = fixture(), socket = f.connect();
  assert.equal(f.bridge.send("第一行\n保留换行"), true);
  assert.equal(f.bridge.send("https://example.com/中文"), true);
  assert.deepEqual(f.writes(socket), []);
  socket.message({ type: "error", panelId, message: "fixture spawn failed" });
  assert.equal(f.bridge.isLive(), false);
  assert.deepEqual(f.recovered, [{ texts: ["第一行\n保留换行", "https://example.com/中文"], message: "fixture spawn failed" }]);
  assert.deepEqual(f.notices, ["fixture spawn failed"]);
  socket.message({ type: "error", panelId, message: "second notice" });
  assert.equal(f.recovered.length, 1, "recovery consumes the failed queue");
  f.bridge.open(options);
  assert.equal(socket.sent.filter(message => message.type === "spawn").length, 2);
  for (const text of f.recovered[0]!.texts) assert.equal(f.bridge.send(text), true);
  socket.message({ type: "spawned", panelId });
  assert.equal(f.bridge.isLive(), true);
  assert.deepEqual(f.writes(socket), ["第一行\n保留换行\r", "https://example.com/中文\r"]);
});

test("Shelf disconnect restores input queued during authentication and reconnect ignores old socket messages", () => {
  const f = fixture();
  f.bridge.open(options);
  const first = f.sockets[0]!;
  assert.equal(f.bridge.send("断线时尚未发送"), true);
  first.close();
  assert.equal(f.bridge.isLive(), false);
  assert.equal(f.bridge.send("没有连接"), false);
  assert.deepEqual(f.recovered[0]?.texts, ["断线时尚未发送"]);
  assert.match(f.recovered[0]?.message ?? "", /连接已断开/);
  const second = f.connect();
  assert.notEqual(second, first);
  first.message({ type: "spawned", panelId });
  assert.equal(f.bridge.isLive(), false, "stale socket cannot mark the new session live");
  assert.equal(f.bridge.send(f.recovered[0]!.texts[0]!), true);
  second.message({ type: "spawned", panelId });
  assert.deepEqual(f.writes(first), []);
  assert.deepEqual(f.writes(second), ["断线时尚未发送\r"]);
  assert.equal(f.recovered.length, 1);
});

test("Shelf exit marks the session dead and a new open spawns again without repeating delivered input", () => {
  const f = fixture(), socket = f.connect();
  socket.message({ type: "spawned", panelId });
  assert.equal(f.bridge.isLive(), true);
  assert.equal(f.bridge.send("已送达第一轮"), true);
  socket.message({ type: "exit", panelId });
  assert.equal(f.bridge.isLive(), false);
  assert.deepEqual(f.recovered, [], "delivered input must not return to the composer");
  f.bridge.open(options);
  f.bridge.open(options);
  assert.equal(socket.sent.filter(message => message.type === "spawn").length, 2, "repeated open shares a pending spawn");
  assert.equal(f.bridge.send("第二轮"), true);
  assert.deepEqual(f.writes(socket), ["已送达第一轮\r"]);
  socket.message({ type: "spawned", panelId });
  assert.deepEqual(f.writes(socket), ["已送达第一轮\r", "第二轮\r"]);
});

test("Shelf exit before spawn acknowledgement returns pending input for explicit retry", () => {
  const f = fixture(), socket = f.connect();
  f.bridge.send("启动期间退出");
  socket.message({ type: "exit", panelId });
  assert.deepEqual(f.recovered[0]?.texts, ["启动期间退出"]);
  assert.match(f.recovered[0]?.message ?? "", /会话已结束/);
  f.bridge.open(options);
  f.bridge.send(f.recovered[0]!.texts[0]!);
  socket.message({ type: "spawned", panelId });
  assert.deepEqual(f.writes(socket), ["启动期间退出\r"]);
});

test("Shelf send returns false before open and when a missing control token prevents connection", () => {
  const f = fixture("");
  assert.equal(f.bridge.send("未打开"), false);
  f.bridge.open(options);
  assert.equal(f.sockets.length, 0);
  assert.equal(f.bridge.send("令牌缺失，保留输入"), false);
  assert.equal(f.bridge.isLive(), false);
  assert.deepEqual(f.recovered, []);
});
