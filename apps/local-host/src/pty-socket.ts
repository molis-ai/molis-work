import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { loopbackHost } from "@molis-ai/molis-work-contracts/platform/loopback";
import { MolisWorkPtyHost, type PtySpawnRequest } from "@molis-ai/molis-work-service-runtime-host";
import { pageTerminalOwnership, type PageTerminalAccess } from "./pty-page-access.js";

type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "page-auth"; pageId: string }
  | (PtySpawnRequest & { type: "spawn" })
  | { type: "write"; panelId: string; data: string }
  | { type: "resize"; panelId: string; cols: number; rows: number }
  | { type: "kill"; panelId: string };

function tokenMatches(expected: string, actual: unknown): boolean {
  // The message is JSON from the page: anything but a string (a number, an object Buffer.from would accept) is a failed login.
  if (typeof actual !== "string" || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

function send(socket: WebSocket, value: unknown): void {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(value));
}

function rawToString(raw: RawData): string {
  if (typeof raw === "string") return raw;
  if (Buffer.isBuffer(raw)) return raw.toString("utf8");
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  return Buffer.from(new Uint8Array(raw)).toString("utf8");
}

function parseMessage(raw: RawData): ClientMessage {
  const value = JSON.parse(rawToString(raw)) as ClientMessage;
  if (!value || typeof value !== "object" || typeof value.type !== "string") {
    throw new Error("invalid pty message");
  }
  return value;
}

function rejectUpgrade(socket: Duplex): void {
  socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
  socket.destroy();
}

function upgradeTerminal(wss: WebSocketServer, request: IncomingMessage, socket: Duplex, head: Buffer): void {
    let pathname = "";
    try {
      pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      rejectUpgrade(socket);
      return;
    }
    if (pathname !== "/pty") return;
    const httpHost = loopbackHost(request.headers.host);
    if (!httpHost) {
      rejectUpgrade(socket);
      return;
    }
    const originValue = request.headers.origin;
    if (typeof originValue === "string") {
      try {
        const origin = new URL(originValue);
        if (origin.protocol !== "http:" || origin.host !== httpHost) {
          rejectUpgrade(socket);
          return;
        }
      } catch {
        rejectUpgrade(socket);
        return;
      }
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
}

export function attachMolisWorkPtySocket(
  server: http.Server,
  controlToken: string,
  homeDirectory?: string,
): MolisWorkPtyHost {
  const sockets = new Set<WebSocket>();
  const pageSockets = new Map<WebSocket, { access: PageTerminalAccess; panels: Set<string>; sending: Promise<void> }>();
  const ownership = pageTerminalOwnership(homeDirectory);
  const broadcast = (panelId: string, value: unknown) => {
    for (const socket of sockets) send(socket, value);
    for (const [socket, page] of pageSockets) if (page.panels.has(panelId)) {
      page.sending = page.sending.then(async () => { await page.access.assertPanel(panelId); send(socket, value); })
        .catch(() => { pageSockets.delete(socket); socket.close(); });
    }
  };
  class RecordedPtyHost extends MolisWorkPtyHost {
    override spawn(request: PtySpawnRequest) {
      ownership.record(request.panelId, request.attachOnly === true, this.alive(request.panelId));
      return super.spawn(request);
    }
    override kill(panelId: string) {
      const wasAlive = this.alive(panelId);
      super.kill(panelId);
      // Runtime Host suppresses the later process exit after an explicit kill.
      if (wasAlive) broadcast(panelId, { type: "exit", panelId, exitCode: -1, signal: 15 });
    }
  }
  const host = new RecordedPtyHost({
    onData: (panelId, data) => broadcast(panelId, { type: "data", panelId, data }),
    onExit: (panelId, exit) => broadcast(panelId, { type: "exit", panelId, exitCode: exit.exitCode, signal: exit.signal }),
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => upgradeTerminal(wss, request, socket, head));

  wss.on("connection", (ws) => {
    let authed = false;
    let pageAccess: PageTerminalAccess | undefined;
    let receiving = Promise.resolve();
    ws.on("close", () => { sockets.delete(ws); pageSockets.delete(ws); });
    const receive = async (raw: RawData) => {
      try {
        const message = parseMessage(raw);
        if (!authed) {
          if (message.type === "page-auth" && typeof message.pageId === "string") {
            pageAccess = ownership.connect(message.pageId);
            pageSockets.set(ws, { access: pageAccess, panels: new Set(), sending: Promise.resolve() });
            authed = true; send(ws, { type: "ready" }); return;
          }
          if (message.type !== "auth" || !tokenMatches(controlToken, message.token)) {
            send(ws, { type: "error", message: "本地终端通道校验失败" });
            ws.close();
            return;
          }
          authed = true;
          sockets.add(ws);
          send(ws, { type: "ready" });
          return;
        }
        if (pageAccess) {
          if (!("panelId" in message) || typeof message.panelId !== "string") throw new Error("终端请求无效");
          if (message.type === "spawn" && (message.attachOnly !== true || Object.keys(message).some(key => !["type", "panelId", "attachOnly", "cols", "rows"].includes(key))))
            throw new Error("插件页面只能连接已经创建的终端");
          if (message.type === "write" && (typeof message.data !== "string" || message.data.length > 65536)) throw new Error("终端输入无效");
          if ((message.type === "resize" || message.type === "spawn") && [message.cols, message.rows].some(value => value !== undefined && (!Number.isInteger(value) || value < 1 || value > 1000))) throw new Error("终端尺寸无效");
          await pageAccess.assertPanel(message.panelId);
          pageSockets.get(ws)?.panels.add(message.panelId);
        }
        if (message.type === "spawn") {
          if (!message.panelId) throw new Error("缺少面板标识");
          if (!message.attachOnly && !message.command?.trim()) throw new Error("缺少启动命令");
          try {
            const result = host.spawn(message);
            send(ws, {
              type: "spawned",
              panelId: message.panelId,
              attached: result.attached,
              started: result.started,
              replay: result.replay,
            });
          } catch (error) {
            send(ws, {
              type: "error",
              panelId: message.panelId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        if (message.type === "write") {
          try {
            host.write(message.panelId, message.data ?? "");
          } catch (error) {
            send(ws, {
              type: "error",
              panelId: message.panelId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          return;
        }
        if (message.type === "resize") {
          host.resize(message.panelId, message.cols, message.rows);
          return;
        }
        if (message.type === "kill") {
          host.kill(message.panelId);
        }
      } catch (error) {
        send(ws, {
          type: "error",
          panelId: typeof (error as { panelId?: unknown })?.panelId === "string"
            ? (error as { panelId: string }).panelId
            : undefined,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };
    ws.on("message", raw => { receiving = receiving.then(() => receive(raw)); });
  });

  server.on("close", () => {
    host.killAll();
    ownership.clear();
    for (const socket of pageSockets.keys()) socket.close();
    pageSockets.clear();
  });
  return host;
}
