import { WebSocket } from "ws";

/**
 * One DevTools connection to the browser, with page sessions multiplexed over it (`Target.attachToTarget` with
 * `flatten`). Only CDP, no automation library: the same stance as Prologue's reference driver, and the protocol the
 * side panel's screencast, input and the assistant's driver all share.
 */
export type CdpParams = Record<string, unknown>;
export type CdpResult = Record<string, unknown>;
export type CdpEventHandler = (params: CdpParams, sessionId: string | undefined) => void;

export class CdpError extends Error {
  constructor(readonly method: string, message: string) { super(message); this.name = "CdpError"; }
}

export class CdpConnection {
  private nextId = 0;
  private readonly waiting = new Map<number, { resolve(value: CdpResult): void; reject(error: Error): void; method: string }>();
  private readonly handlers = new Map<string, Set<CdpEventHandler>>();
  private closedReason: string | null = null;
  private readonly closeHandlers = new Set<(reason: string) => void>();

  private constructor(private readonly socket: WebSocket) {
    socket.on("message", raw => this.receive(String(raw)));
    socket.on("close", () => this.fail("浏览器连接已断开"));
    socket.on("error", () => this.fail("浏览器连接出错"));
  }

  static open(url: string, timeoutMs = 10_000): Promise<CdpConnection> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
      const timer = setTimeout(() => { socket.terminate(); reject(new Error("连不上浏览器的调试接口")); }, timeoutMs);
      socket.once("open", () => { clearTimeout(timer); resolve(new CdpConnection(socket)); });
      socket.once("error", error => { clearTimeout(timer); reject(error); });
    });
  }

  get closed(): boolean { return this.closedReason !== null; }

  send(method: string, params: CdpParams = {}, sessionId?: string, timeoutMs = 30_000): Promise<CdpResult> {
    if (this.closedReason !== null) return Promise.reject(new CdpError(method, this.closedReason));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.waiting.delete(id)) return;
        reject(new CdpError(method, `浏览器没有在 ${Math.round(timeoutMs / 1000)} 秒内回应`));
      }, timeoutMs);
      this.waiting.set(id, {
        method,
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }), error => {
        if (!error) return;
        const held = this.waiting.get(id);
        this.waiting.delete(id);
        held?.reject(new CdpError(method, "发不到浏览器"));
      });
    });
  }

  on(method: string, handler: CdpEventHandler): () => void {
    let set = this.handlers.get(method);
    if (!set) this.handlers.set(method, set = new Set());
    set.add(handler);
    return () => { set!.delete(handler); };
  }

  onClose(handler: (reason: string) => void): () => void {
    if (this.closedReason !== null) { handler(this.closedReason); return () => undefined; }
    this.closeHandlers.add(handler);
    return () => { this.closeHandlers.delete(handler); };
  }

  close(): void {
    try { this.socket.close(); } catch { /* already gone */ }
    this.fail("浏览器连接已关闭");
  }

  private receive(text: string): void {
    let frame: { id?: number; method?: string; params?: CdpParams; result?: CdpResult; error?: { message?: string }; sessionId?: string };
    try { frame = JSON.parse(text); } catch { return; }
    if (typeof frame.id === "number") {
      const held = this.waiting.get(frame.id);
      if (!held) return;
      this.waiting.delete(frame.id);
      if (frame.error) held.reject(new CdpError(held.method, frame.error.message ?? "浏览器拒绝了这次请求"));
      else held.resolve(frame.result ?? {});
      return;
    }
    if (typeof frame.method !== "string") return;
    for (const handler of this.handlers.get(frame.method) ?? []) {
      try { handler(frame.params ?? {}, frame.sessionId); } catch (error) { console.warn(`[browser] ${frame.method} 处理出错`, error); }
    }
  }

  private fail(reason: string): void {
    if (this.closedReason !== null) return;
    this.closedReason = reason;
    for (const held of this.waiting.values()) held.reject(new CdpError(held.method, reason));
    this.waiting.clear();
    for (const handler of this.closeHandlers) handler(reason);
    this.closeHandlers.clear();
  }
}
