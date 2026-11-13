import { once } from "node:events";
import type { ChildProcess } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestContext } from "node:test";
import { WebSocketServer, type WebSocket } from "ws";
import { BrowserHost, HelperConnection } from "@molis-ai/molis-work-app-local-host";

const latch = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

/** Real Unix transport; the peer speaks the native helper protocol but never posts OS input. */
export async function helperTransport(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "surface-helper-fence-"));
  const app = join(home, "fixture.app"); await writeFile(app, "protocol fixture");
  const connected = latch(), frames: Array<{ id: number; op: string; params: Record<string, unknown> }> = [];
  let peer: Socket | undefined, hello: (() => void) | undefined;
  let nextConnected = latch();
  let resultFor: ((op: string, params: Record<string, unknown>) => unknown) | undefined;
  let hold: { op: string; reached: ReturnType<typeof latch>; respond?: (result?: unknown, error?: { code: string; message: string; partial?: boolean }) => void } | undefined;
  const helper = new HelperConnection({ appPath: app, platform: { os: "darwin", darwinMajor: 23 }, requestTimeoutMs: 1_357_911,
    launch: (_app, args) => {
      const socket = connect(args[args.indexOf("--socket") + 1]!); peer = socket;
      let buffer = "";
      socket.on("data", data => {
        buffer += data.toString();
        for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
          const frame = JSON.parse(buffer.slice(0, at)) as (typeof frames)[number]; buffer = buffer.slice(at + 1);
          frames.push(frame);
          const respond = (result?: unknown, error?: { code: string; message: string; partial?: boolean }) => socket.write(JSON.stringify({ id: frame.id,
            ...(error ? { ok: false, error } : { ok: true, result: result ?? resultFor?.(frame.op, frame.params) ?? { accepted: true } }) }) + "\n");
          if (hold?.op === frame.op) { const captured = hold; hold = undefined; captured.respond = respond; captured.reached.release(); } else respond();
        }
      });
      socket.once("connect", () => {
        hello = () => socket.write(JSON.stringify({ event: "hello", token: args[args.indexOf("--token") + 1], status: {
          version: "fixture", pid: process.pid, bundle_id: "fixture", permissions: { accessibility: true, screen_recording: true, input_monitoring: true },
          presence: { locked: false, screensaver: false, displays_asleep: false, on_console: true, idle_seconds: 0 }, watching: false, last_synthetic: 0,
        } }) + "\n");
        connected.release(); nextConnected.release(); nextConnected = latch();
      });
    },
  });
  t.after(async () => { peer?.destroy(); await helper.close(); await rm(home, { recursive: true, force: true }); });
  return { helper, frames, home, connected: connected.promise, hello: () => { if (!hello) throw new Error("peer not connected"); hello(); },
    nextConnection: () => nextConnected.promise,
    async disconnect() {
      const closed = new Promise<void>(resolve => { const off = helper.on(event => { if (event.event === "closed") { off(); resolve(); } }); });
      peer?.destroy(); await closed;
    },
    respondWith(response: (op: string, params: Record<string, unknown>) => unknown) { resultFor = response; },
    event(event: Record<string, unknown>) { if (!peer) throw new Error("helper not connected"); peer.write(JSON.stringify(event) + "\n"); },
    holdNext(op: string) {
      const captured = { op, reached: latch(), respond: undefined as ((result?: unknown, error?: { code: string; message: string; partial?: boolean }) => void) | undefined }; hold = captured;
      return { reached: captured.reached.promise,
        release(result?: unknown) { if (!captured.respond) throw new Error("barrier not reached"); captured.respond(result); },
        reject(code: string, message: string, partial?: boolean) { if (!captured.respond) throw new Error("barrier not reached"); captured.respond(undefined, { code, message, ...(partial === undefined ? {} : { partial }) }); },
      };
    },
  };
}

interface CdpFrame { id: number; method: string; params: Record<string, unknown>; sessionId?: string }

/** Real Host child/process and CDP websocket, with a protocol peer instead of Chrome or a person's browser. */
export async function browserTransport(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "surface-browser-fence-"));
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 }); await once(server, "listening");
  const address = server.address(); if (!address || typeof address === "string") throw new Error("missing fixture port");
  const executable = join(home, "protocol-browser");
  await writeFile(executable, `#!${process.execPath}\nprocess.stderr.write(${JSON.stringify(`DevTools listening on ws://127.0.0.1:${address.port}\n`)});\nsetInterval(() => {}, 60000);\n`, { mode: 0o700 });
  const frames: CdpFrame[] = [];
  let peer: WebSocket | undefined, processChild: ChildProcess | undefined, nextTarget = 0, currentSession = "";
  let resultFor: ((frame: CdpFrame) => Record<string, unknown> | undefined) | undefined;
  let hold: { method: string; matches: (frame: CdpFrame) => boolean; reached: ReturnType<typeof latch>; respond?: (result?: Record<string, unknown>) => void } | undefined;
  server.on("connection", socket => {
    peer = socket;
    socket.on("message", bytes => {
      const frame = JSON.parse(bytes.toString()) as CdpFrame; frames.push(frame);
      const respond = (override?: Record<string, unknown>) => {
        let result: Record<string, unknown> = {};
        if (frame.method === "Target.createTarget") result = { targetId: `target-${++nextTarget}` };
        if (frame.method === "Target.attachToTarget") { currentSession = `session-${String(frame.params.targetId)}`; result = { sessionId: currentSession }; }
        socket.send(JSON.stringify({ id: frame.id, result: override ?? resultFor?.(frame) ?? result }));
        if (frame.method === "Browser.close") processChild?.kill("SIGTERM");
      };
      if (hold?.method === frame.method && hold.matches(frame)) { const captured = hold; hold = undefined; captured.respond = respond; captured.reached.release(); } else respond();
    });
  });
  const host = new BrowserHost({ homeDirectory: home, locate: () => ({ path: executable, name: "Protocol fixture" }) });
  const start = host.browser.bind(host);
  t.mock.method(host, "browser", async () => { const running = await start(); processChild = running.child; return running; });
  t.after(async () => { await host.close(); for (const socket of server.clients) socket.terminate(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  return { host, frames, page: host.page("project"),
    respondWith(response: (frame: CdpFrame) => Record<string, unknown> | undefined) { resultFor = response; },
    event(method: string, params: Record<string, unknown>, sessionId = currentSession) { if (!peer) throw new Error("CDP not connected"); peer.send(JSON.stringify({ method, params, sessionId })); },
    holdNext(method: string, matches: (frame: CdpFrame) => boolean = () => true) {
      const captured = { method, matches, reached: latch(), respond: undefined as ((result?: Record<string, unknown>) => void) | undefined }; hold = captured;
      return { reached: captured.reached.promise, release(result?: Record<string, unknown>) { if (!captured.respond) throw new Error("barrier not reached"); captured.respond(result); } };
    },
    chooser() { if (!peer) throw new Error("CDP not connected"); peer.send(JSON.stringify({ method: "Page.fileChooserOpened", sessionId: currentSession, params: { backendNodeId: 9, mode: "selectSingle" } })); },
  };
}
