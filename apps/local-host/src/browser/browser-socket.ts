import { timingSafeEqual } from "node:crypto";
import type http from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { BROWSER_SOCKET_PATH, type BrowserClientMessage, type BrowserServerMessage } from "@molis-ai/molis-work-contracts/services/browser";
import type { BrowserHost, BrowserListener, BrowserPage } from "./browser-host.js";

/**
 * The side panel's browser channel: screencast frames down, the person's input up. Authenticated like the terminal
 * channel — same-host origin, then the control token as the first message — and bound to one project's page.
 */
export interface BrowserSocketOptions {
  readonly projectExists: (projectId: string) => boolean | Promise<boolean>;
  /** The person started using the page while the assistant drove it (spec D09): the assistant pauses first. */
  readonly onTakeover?: (page: BrowserPage) => void | Promise<void>;
}

const local = (hostname: string) => hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";

function requestHost(request: IncomingMessage): string | null {
  const value = request.headers.host?.trim();
  if (!value) return null;
  try { const parsed = new URL(`http://${value}`); return local(parsed.hostname) ? parsed.host : null; } catch { return null; }
}

function tokenMatches(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") return false;
  const a = Buffer.from(expected), b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

const send = (ws: WebSocket, message: BrowserServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); };

export function attachMolisWorkBrowserSocket(server: http.Server, controlToken: string, browsers: () => BrowserHost, options: BrowserSocketOptions): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname = "";
    try { pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname; } catch { return; }
    if (pathname !== BROWSER_SOCKET_PATH) return;
    const httpHost = requestHost(request);
    const origin = request.headers.origin;
    let sameHost = !!httpHost;
    if (sameHost && typeof origin === "string") {
      try { const parsed = new URL(origin); sameHost = parsed.protocol === "http:" && parsed.host === httpHost; } catch { sameHost = false; }
    }
    if (!sameHost) { socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, ws => wss.emit("connection", ws, request));
  });

  wss.on("connection", (ws: WebSocket) => {
    let authed = false;
    let page: BrowserPage | null = null;
    let detach: (() => void) | null = null;
    // A slow link must not queue frames without end: a frame waits only while fewer than two are in flight.
    let inFlight = 0;
    const listener: BrowserListener = {
      state: state => send(ws, { type: "state", state }),
      frame: jpeg => {
        if (ws.readyState !== ws.OPEN || inFlight > 1) return;
        inFlight++;
        ws.send(jpeg, { binary: true }, () => { inFlight--; });
      },
      copied: text => send(ws, { type: "copied", text }),
    };
    ws.on("close", () => { detach?.(); detach = null; });
    ws.on("message", async (raw: RawData, binary: boolean) => {
      if (binary) return;
      let message: BrowserClientMessage;
      try { message = JSON.parse(String(raw)) as BrowserClientMessage; } catch { return; }
      try {
        if (!authed) {
          if (message.type !== "auth" || !tokenMatches(controlToken, message.token)) { send(ws, { type: "error", message: "本地浏览器通道校验失败" }); ws.close(); return; }
          authed = true; send(ws, { type: "ready" }); return;
        }
        if (message.type === "attach") {
          if (typeof message.project_id !== "string" || !await options.projectExists(message.project_id)) { send(ws, { type: "error", message: "项目不存在" }); return; }
          detach?.();
          page = browsers().page(message.project_id);
          detach = page.attach(listener, message.viewport);
          return;
        }
        if (!page) return;
        switch (message.type) {
          case "visible": page.setVisible(listener, !!message.visible); return;
          case "resize": await page.resize(message.viewport); return;
          case "navigate": await takeoverFirst(page); await page.navigate(String(message.input ?? "")); return;
          case "history": await takeoverFirst(page); await page.history(message.delta === 1 ? 1 : -1); return;
          case "reload": await takeoverFirst(page); await page.reload(); return;
          case "stop": await page.stop(); return;
          case "restart": await browsers().restart(); return;
          case "popup-close": await page.closePopup(); return;
          case "mouse": case "key": case "text": case "compose":
            if (message.type === "mouse" && message.event === "move" && page.controlMode === "assistant") return;
            await takeoverFirst(page); await page.input(message); return;
          case "copy": listener.copied?.(await page.selectedText()); return;
          case "dialog": await page.answerDialog(String(message.id), !!message.accept, message.prompt_text); return;
          case "file-chooser-cancel": page.cancelFileChooser(String(message.id)); return;
          default: return;
        }
      } catch (error) {
        send(ws, { type: "error", message: error instanceof Error ? error.message : String(error) });
      }
    });
  });

  const takeoverFirst = async (page: BrowserPage) => {
    if (page.controlMode === "assistant") await options.onTakeover?.(page);
  };
}
