import type { FrameScope } from "./types.js";
import { readEventStream } from "../event-stream.js";

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
        await readEventStream(response.body, {
          message: (data, name) => this.emit(new MessageEvent(name, { data, lastEventId: this.lastId, origin })),
          id: id => { this.lastId = id; },
          retry: delay => { this.delay = delay; },
        });
      } catch { /* Disconnection is reported below; closing intentionally does not reconnect. */ }
      if (this.readyState === this.CLOSED || !scope.alive) return;
      this.readyState = this.CONNECTING; this.emit(new Event("error"));
      this.retry = setTimeout(() => { void this.connect(); }, this.delay);
    }
  };
}
