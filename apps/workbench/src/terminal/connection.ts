export type PtyServerMessage =
  | { type: "ready" }
  | { type: "spawned"; panelId?: string; attached?: boolean; started?: boolean; replay?: string }
  | { type: "data"; panelId?: string; data?: string }
  | { type: "exit"; panelId?: string; exitCode?: number; signal?: number }
  | { type: "error"; panelId?: string; message?: string };


export interface TerminalConnectionOptions {
  controlToken(): string;
  url(): string;
  text(value: string): string;
  onMessage(value: PtyServerMessage): void;
  onDisconnected(error: Error): void;
  reconnect(): Promise<void>;
}

/** Own the authenticated browser channel and reconnect timer, never Session/Goal state. */
export function createTerminalConnection(options: TerminalConnectionOptions) {
  const L = options.text;
  let socket: WebSocket | null = null;
  let socketReady: Promise<WebSocket> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let reconnectAttempt = 0;
  let reconnectStopped = false;
  const connectPty = (): Promise<WebSocket> => {
    if (socket && socket.readyState === WebSocket.OPEN) return Promise.resolve(socket);
    if (socketReady) return socketReady;
    socketReady = new Promise((resolve, reject) => {
      const token = options.controlToken();
      if (!token) {
        socketReady = null;
        reject(new Error(L("终端通道连接失败")));
        return;
      }
      const ws = new WebSocket(options.url());
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        if (socket === ws) socket = null;
        socketReady = null;
        reject(error);
      };
      ws.addEventListener("open", () => {
        ws.send(JSON.stringify({ type: "auth", token }));
      });
      ws.addEventListener("message", (event) => {
        let value: PtyServerMessage;
        try {
          value = JSON.parse(String(event.data)) as PtyServerMessage;
        } catch {
          return;
        }
        if (value.type === "ready") {
          if (settled) return;
          settled = true;
          socket = ws;
          resolve(ws);
          return;
        }
        options.onMessage(value);
      });
      ws.addEventListener("error", () => fail(new Error(L("终端通道连接失败"))));
      ws.addEventListener("close", () => {
        if (socket === ws) socket = null;
        socketReady = null;
        if (!settled) {
          fail(new Error(L("终端通道已断开")));
          return;
        }
        options.onDisconnected(new Error(L("终端通道已断开")));
        scheduleReconnect();
      });
    });
    return socketReady;
  };

  const sendPty = async (message: Record<string, unknown>) => {
    const ws = await connectPty();
    ws.send(JSON.stringify(message));
  };

  const scheduleReconnect = () => {
    if (reconnectStopped) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(8_000, 400 * (2 ** Math.min(reconnectAttempt, 4)));
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => {
      void options.reconnect();
    }, delay);
  };


  return {
    connect: connectPty,
    send: sendPty,
    scheduleReconnect,
    resetReconnect: () => { reconnectAttempt = 0; },
    isStopped: () => reconnectStopped,
    stop: () => { reconnectStopped = true; clearTimeout(reconnectTimer); },
  };
}
