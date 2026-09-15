import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { MolisWorkPtyHost, type PtySpawnRequest } from "@molis-ai/molis-work-service-runtime-host";

type ClientMessage =
  | { type: "auth"; token: string }
  | (PtySpawnRequest & { type: "spawn" })
  | { type: "write"; panelId: string; data: string }
  | { type: "resize"; panelId: string; cols: number; rows: number }
  | { type: "kill"; panelId: string };

export interface MolisWorkPtySocketHandlers {
  onData?: (panelId: string, sessionId: string, data: string) => void;
  onExit?: (panelId: string, sessionId: string, exit: { exitCode: number; signal: number }) => void;
}

function localHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function requestHost(request: IncomingMessage): string | null {
  const value = request.headers.host?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(`http://${value}`);
    return localHostname(parsed.hostname) ? parsed.host : null;
  } catch {
    return null;
  }
}

function tokenMatches(expected: string, actual: string | null | undefined): boolean {
  if (!actual) return false;
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

export function attachMolisWorkPtySocket(
  server: http.Server,
  controlToken: string,
  handlers: MolisWorkPtySocketHandlers = {},
): MolisWorkPtyHost {
  const sockets = new Set<WebSocket>();
  const panelSessionIds = new Map<string, string>();
  const host = new MolisWorkPtyHost({
    onData: (panelId, data) => {
      const sessionId = panelSessionIds.get(panelId);
      if (sessionId) handlers.onData?.(panelId, sessionId, data);
      for (const socket of sockets) send(socket, { type: "data", panelId, data });
    },
    onExit: (panelId, exit) => {
      const sessionId = panelSessionIds.get(panelId);
      if (sessionId) handlers.onExit?.(panelId, sessionId, exit);
      for (const socket of sockets) {
        send(socket, { type: "exit", panelId, exitCode: exit.exitCode, signal: exit.signal });
      }
    },
  });
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname = "";
    try {
      pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    } catch {
      rejectUpgrade(socket);
      return;
    }
    if (pathname !== "/pty") return;
    const httpHost = requestHost(request);
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
  });

  wss.on("connection", (ws) => {
    let authed = false;
    ws.on("close", () => sockets.delete(ws));
    ws.on("message", (raw) => {
      try {
        const message = parseMessage(raw);
        if (!authed) {
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
        if (message.type === "spawn") {
          if (!message.panelId) throw new Error("缺少面板标识");
          if (!message.attachOnly && !message.command?.trim()) throw new Error("缺少启动命令");
          try {
            const sessionId = typeof message.sessionId === "string" ? message.sessionId.trim() : "";
            if (sessionId) panelSessionIds.set(message.panelId, sessionId);
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
          panelSessionIds.delete(message.panelId);
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
    });
  });

  server.on("close", () => {
    host.killAll();
    panelSessionIds.clear();
  });
  return host;
}
