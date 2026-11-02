import type http from "node:http";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { COMPUTER_SOCKET_PATH, type ComputerClientMessage, type ComputerServerMessage } from "@molis-ai/molis-work-contracts/services/computer";
import { loopbackHost } from "@molis-ai/molis-work-contracts/platform/loopback";
import { controlTokenMatches } from "../web-control-token.js";
import type { ComputerDesk } from "./computer-desk.js";

/**
 * The computer tab's channel (specs/computer-use): the desk's state and the target app's pictures down, the person's
 * stop / pause / take over / hand back up. Authenticated like the browser channel — same-host origin, then the control
 * token as the first message. The pictures are PNGs of only the app the Assistant is looking at, password fields covered.
 */
const send = (ws: WebSocket, message: ComputerServerMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message)); };

export function attachMolisWorkComputerSocket(server: http.Server, controlToken: string, desk: () => ComputerDesk | null): void {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    let pathname = "";
    try { pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname; } catch { return; }
    if (pathname !== COMPUTER_SOCKET_PATH) return;
    const httpHost = loopbackHost(request.headers.host);
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
    let visible = true;
    let offState: (() => void) | null = null;
    let offFrame: (() => void) | null = null;
    let inFlight = 0;

    const detach = () => { offState?.(); offFrame?.(); offState = offFrame = null; };

    ws.on("message", (raw: Buffer) => {
      let message: ComputerClientMessage;
      try { message = JSON.parse(raw.toString("utf8")) as ComputerClientMessage; } catch { return; }
      if (!authed) {
        if (message.type !== "auth" || !controlTokenMatches(controlToken, message.token)) { send(ws, { type: "error", message: "电脑通道校验失败" }); ws.close(); return; }
        authed = true;
        const current = desk();
        if (!current) { send(ws, { type: "error", message: "这个进程没有电脑助手" }); ws.close(); return; }
        send(ws, { type: "ready" });
        send(ws, { type: "state", state: current.state() });
        offState = current.onState(state => send(ws, { type: "state", state }));
        offFrame = current.onFrame(png => {
          // A slow link must not queue frames without end; and nothing is streamed while the tab is hidden.
          if (!visible || ws.readyState !== ws.OPEN || inFlight > 1) return;
          inFlight += 1;
          ws.send(png, () => { inFlight -= 1; });
        });
        return;
      }
      const current = desk();
      if (!current) return;
      switch (message.type) {
        case "visible": visible = message.visible; break;
        case "pause": current.pause(); break;
        case "takeover": current.takeOver(); break;
        case "handback": current.handBack(); break;
        // Stop ends the Assistant's round, which the client does over the work-control endpoint; here it also pauses the
        // desk at once so nothing else happens on screen while that request is in flight.
        case "stop": current.pause(); break;
      }
    });
    ws.on("close", detach);
    ws.on("error", detach);
  });
}
