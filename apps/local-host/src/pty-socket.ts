import { bindWebSocketAuthority } from "./socket-authority.js";
import type { IncomingMessage } from "node:http";
import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { loopbackHost } from "@molis-ai/molis-work-contracts/platform/loopback";
import { MolisWorkPtyHost, type PtySpawnRequest } from "@molis-ai/molis-work-service-runtime-host";
import { resolveConfiguredHome } from "./product-home.js";
import { pageTerminalOwnership, type PageTerminalAccess } from "./pty-page-access.js";
import { localizeWebErrorMessage, type CommonErrorKey } from "./ui-error-words.js";
import { resolveWebLocale } from "./web-locale.js";

type ClientMessage =
  | { type: "auth"; token: string }
  | { type: "page-auth"; pageId: string }
  /** Attach only (S-103 ⑦): a terminal is started by the Host, never by a message on this channel. */
  | { type: "spawn"; panelId: string; attachOnly: true; cols?: number; rows?: number }
  | { type: "write"; panelId: string; data: string }
  | { type: "resize"; panelId: string; cols: number; rows: number }
  | { type: "kill"; panelId: string };

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
  let value: ClientMessage;
  try {
    value = JSON.parse(rawToString(raw)) as ClientMessage;
  } catch {
    throw new ActionError("actions.input_invalid", "终端请求无效");
  }
  if (!value || typeof value !== "object" || typeof value.type !== "string") {
    throw new ActionError("actions.input_invalid", "终端请求无效");
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

const ptyActiveCounters = new WeakMap<MolisWorkPtyHost, () => number>();

/** O(1) count of live PTY panels owned by this Host, used by `/health` for desktop quit checks. */
export function activePtyCount(host: MolisWorkPtyHost | null | undefined): number {
  return host ? (ptyActiveCounters.get(host)?.() ?? 0) : 0;
}

export function attachMolisWorkPtySocket(
  server: http.Server,
  controlToken: string,
  homeDirectory?: string,
): MolisWorkPtyHost {
  const sockets = new Set<WebSocket>();
  const activePanels = new Set<string>();
  const pageSockets = new Map<WebSocket, { access: PageTerminalAccess; panels: Set<string>; sending: Promise<void> }>();
  const ownership = pageTerminalOwnership(homeDirectory);
  const spawnHome = resolveConfiguredHome(homeDirectory);
  const broadcast = (panelId: string, value: unknown, exit = false): Promise<void>[] => {
    for (const socket of sockets) send(socket, value);
    const deliveries: Promise<void>[] = [];
    for (const [socket, page] of pageSockets) if (page.panels.has(panelId)) {
      const next = page.sending.then(async () => {
        await page.access.assertPanel(panelId);
        send(socket, value);
        if (exit) page.panels.delete(panelId);
      }).catch(() => { pageSockets.delete(socket); socket.close(); });
      page.sending = next;
      deliveries.push(next);
    }
    return deliveries;
  };
  const releaseExitedOwner = (panelId: string, owner: ReturnType<typeof ownership.ownerOf>, deliveries: readonly Promise<void>[]) => {
    const finish = () => { if (!host.alive(panelId)) ownership.release(panelId, owner); };
    if (deliveries.length === 0) finish();
    else void Promise.allSettled(deliveries).then(finish);
  };
  class RecordedPtyHost extends MolisWorkPtyHost {
    override spawn(request: PtySpawnRequest) {
      ownership.record(request.panelId, request.attachOnly === true, this.alive(request.panelId));
      const result = super.spawn({ ...request, env: { ...request.env, MOLIS_WORK_HOME: spawnHome } });
      if (this.alive(request.panelId)) activePanels.add(request.panelId);
      return result;
    }
    override kill(panelId: string) {
      const wasAlive = this.alive(panelId);
      const ending = ownership.ownerOf(panelId);
      activePanels.delete(panelId);
      super.kill(panelId);
      // Runtime Host suppresses the later process exit after an explicit kill.
      const deliveries = wasAlive ? broadcast(panelId, { type: "exit", panelId, exitCode: -1, signal: 15 }, true) : [];
      releaseExitedOwner(panelId, ending, deliveries);
    }
    override killAll() {
      activePanels.clear();
      ownership.clear();
      super.killAll();
    }
  }
  const host = new RecordedPtyHost({
    onData: (panelId, data) => { void broadcast(panelId, { type: "data", panelId, data }); },
    onExit: (panelId, exit) => {
      const ending = ownership.ownerOf(panelId);
      activePanels.delete(panelId);
      const deliveries = broadcast(panelId, { type: "exit", panelId, exitCode: exit.exitCode, signal: exit.signal }, true);
      releaseExitedOwner(panelId, ending, deliveries);
    },
  });
  ptyActiveCounters.set(host, () => activePanels.size);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => upgradeTerminal(wss, request, socket, head));

  wss.on("connection", (ws, request) => {
    const socketLocale = resolveWebLocale(request.headers.cookie, request.headers["accept-language"]);
    const sendError = (error: unknown, fallbackKey: CommonErrorKey = "common.error.internal", panelId?: string) => {
      send(ws, {
        type: "error",
        ...(panelId === undefined ? {} : { panelId }),
        message: localizeWebErrorMessage(error, fallbackKey, socketLocale),
      });
    };
    let authed = false;
    let authority: ReturnType<typeof bindWebSocketAuthority>;
    const bindAuthority = (proof: unknown) => {
      authority = bindWebSocketAuthority(request, controlToken, proof, ws);
      return authority !== null && authority.valid();
    };
    let pageAccess: PageTerminalAccess | undefined;
    let receiving = Promise.resolve();
    ws.on("close", () => { sockets.delete(ws); pageSockets.delete(ws); });
    const receive = async (raw: RawData) => {
      try {
        if (authority && !authority.valid()) { ws.close(); return; }
        const message = parseMessage(raw);
        if (!authed) {
          if (message.type === "page-auth" && typeof message.pageId === "string") {
            pageAccess = ownership.connect(message.pageId);
            pageSockets.set(ws, { access: pageAccess, panels: new Set(), sending: Promise.resolve() });
            authed = true; send(ws, { type: "ready" }); return;
          }
          if (message.type !== "auth" || !bindAuthority(message.token)) {
            sendError(new ActionError("actions.forbidden", "本地终端通道校验失败"), "common.error.forbidden");
            ws.close(1008, "Authentication failed");
            return;
          }
          authed = true;
          sockets.add(ws);
          send(ws, { type: "ready" });
          return;
        }
        // Every connection, the control token's included, only attaches to, writes to, resizes and ends what the Host started.
        if (!("panelId" in message) || typeof message.panelId !== "string" || !message.panelId) {
          throw new ActionError("actions.input_invalid", "终端请求无效");
        }
        // A refusal names its panel, so the page can tell which terminal it was about.
        const refuse = (text: string) => Object.assign(new ActionError("actions.input_invalid", text), { panelId: message.panelId });
        if (message.type === "spawn" && (message.attachOnly !== true || Object.keys(message).some(key => !["type", "panelId", "attachOnly", "cols", "rows"].includes(key))))
          throw refuse("只能连接已经创建的终端");
        if (message.type === "write" && (typeof message.data !== "string" || message.data.length > 65536)) throw refuse("终端输入无效");
        if (message.type === "spawn" && [message.cols, message.rows].some(value => value !== undefined && (!Number.isInteger(value) || value < 1 || value > 1000))) throw refuse("终端尺寸无效");
        if (message.type === "resize" && [message.cols, message.rows].some(value => !Number.isInteger(value) || value < 1 || value > 1000)) throw refuse("终端尺寸无效");
        if (pageAccess) {
          await pageAccess.assertPanel(message.panelId);
          if (authority && !authority.valid()) { ws.close(); return; }
          pageSockets.get(ws)?.panels.add(message.panelId);
        }
        if (message.type === "spawn") {
          try {
            const result = host.spawn({ panelId: message.panelId, attachOnly: true, ...(message.cols === undefined ? {} : { cols: message.cols }),
              ...(message.rows === undefined ? {} : { rows: message.rows }) });
            send(ws, {
              type: "spawned",
              panelId: message.panelId,
              attached: result.attached,
              started: result.started,
              replay: result.replay,
            });
          } catch (error) {
            sendError(error, "common.error.internal", message.panelId);
          }
          return;
        }
        if (message.type === "write") {
          try {
            host.write(message.panelId, message.data ?? "");
          } catch (error) {
            sendError(error, "common.error.internal", message.panelId);
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
        const panelId = typeof (error as { panelId?: unknown })?.panelId === "string"
          ? (error as { panelId: string }).panelId
          : undefined;
        sendError(error, authed ? "common.error.internal" : "common.error.forbidden", panelId);
        if (!authed) ws.close(1008, "Authentication failed");
      }
    };
    ws.on("message", raw => { receiving = receiving.then(() => receive(raw)); });
  });

  server.on("close", () => {
    host.killAll();
    ownership.clear();
    for (const socket of sockets) socket.close();
    sockets.clear();
    for (const socket of pageSockets.keys()) socket.close();
    pageSockets.clear();
    wss.close();
  });
  return host;
}
