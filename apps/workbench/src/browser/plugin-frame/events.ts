import type { FrameScope } from "./types.js";

/** EventSource over the same restricted fetch channel; the child never opens a network connection. */
export function pageEventSource(scope: FrameScope, origin: string): typeof EventSource {
  return class PageEventSource extends EventTarget implements EventSource {
    static readonly CONNECTING = 0; static readonly OPEN = 1; static readonly CLOSED = 2;
    readonly CONNECTING = 0; readonly OPEN = 1; readonly CLOSED = 2;
    readonly url: string; readonly withCredentials = false;
    readyState: number = 0;
    onopen: EventSource["onopen"] = null; onerror: EventSource["onerror"] = null; onmessage: EventSource["onmessage"] = null;
    override addEventListener: EventSource["addEventListener"] = super.addEventListener.bind(this) as EventSource["addEventListener"];
    override removeEventListener: EventSource["removeEventListener"] = super.removeEventListener.bind(this) as EventSource["removeEventListener"];
    private controller?: AbortController;
    private retry?: ReturnType<typeof setTimeout>;
    private delay = 1000;
    private lastId = "";
    constructor(url: string | URL) {
      super(); this.url = new URL(String(url), origin).href;
      scope.own(() => this.close()); void this.connect();
    }
    close(): void { this.readyState = this.CLOSED; clearTimeout(this.retry); this.controller?.abort(); }
    private emit(event: Event) {
      this.dispatchEvent(event);
      if (event.type === "open") this.onopen?.call(this, event);
      else if (event.type === "error") this.onerror?.call(this, event);
      else if (event.type === "message") this.onmessage?.call(this, event as MessageEvent);
    }
    private async connect() {
      this.controller = new AbortController();
      try {
        const response = await fetch(this.url, { signal: this.controller.signal, headers: { accept: "text/event-stream", ...(this.lastId ? { "last-event-id": this.lastId } : {}) } });
        if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
          this.close(); this.emit(new Event("error")); return;
        }
        this.readyState = this.OPEN; this.emit(new Event("open"));
        const reader = response.body.getReader(), decoder = new TextDecoder();
        let buffer = "", data: string[] = [], eventName = "message";
        try {
          for (;;) {
            const part = await reader.read(); if (part.done) break;
            buffer += decoder.decode(part.value, { stream: true });
            let end: number;
            while ((end = buffer.indexOf("\n")) >= 0) {
              const line = buffer.slice(0, end).replace(/\r$/u, ""); buffer = buffer.slice(end + 1);
              if (!line) {
                if (data.length) this.emit(new MessageEvent(eventName, { data: data.join("\n"), lastEventId: this.lastId, origin }));
                data = []; eventName = "message"; continue;
              }
              const colon = line.indexOf(":"), field = colon < 0 ? line : line.slice(0, colon), value = colon < 0 ? "" : line.slice(colon + 1).replace(/^ /u, "");
              if (field === "data") data.push(value);
              else if (field === "event") eventName = value || "message";
              else if (field === "id" && !value.includes("\0")) this.lastId = value;
              else if (field === "retry" && /^\d+$/u.test(value)) this.delay = Math.min(30_000, Math.max(250, Number(value)));
            }
          }
        } finally { await reader.cancel(); }
      } catch { /* Disconnection is reported below; closing intentionally does not reconnect. */ }
      if (this.readyState === this.CLOSED || !scope.alive) return;
      this.readyState = this.CONNECTING; this.emit(new Event("error"));
      this.retry = setTimeout(() => { void this.connect(); }, this.delay);
    }
  };
}
