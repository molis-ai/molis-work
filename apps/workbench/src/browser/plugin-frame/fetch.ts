import type { FrameAnswer, FrameFetch, FrameRequest, FrameScope } from "./types.js";

interface Pending {
  resolve(response: Response): void; reject(error: Error): void; signal: AbortSignal; abort(): void;
  stream?: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>;
}
/** A fetch-shaped IPC client. Network access is disabled by the child document's CSP. */
export function createFrameFetch(port: MessagePort, origin: string): typeof fetch {
  const pending = new Map<number, Pending>(); let sequence = 0;
  const finish = (id: number, error?: Error) => {
    const entry = pending.get(id); if (!entry) return;
    pending.delete(id); entry.signal.removeEventListener("abort", entry.abort);
    if (error) { entry.reject(error); entry.stream?.error(error); } else entry.stream?.close();
  };
  port.addEventListener("message", (event: MessageEvent<FrameAnswer>) => {
    const message = event.data, entry = pending.get(message.id); if (!entry) return;
    if (message.type === "response") {
      const body = [204, 205, 304].includes(message.status) ? null : new ReadableStream<Uint8Array<ArrayBuffer>>({
        start(controller) { entry.stream = controller; },
        pull() { port.postMessage({ type: "pull", id: message.id }); },
        cancel() { entry.abort(); },
      });
      entry.resolve(new Response(body, { status: message.status, statusText: message.statusText, headers: message.headers }));
      if (!body) finish(message.id);
    } else if (message.type === "chunk") entry.stream?.enqueue(new Uint8Array(message.bytes));
    else if (message.type === "end") finish(message.id);
    else if (message.type === "fetch-error") finish(message.id, new Error(message.message));
  });
  port.start();
  addEventListener("pagehide", () => { for (const entry of pending.values()) entry.abort(); });
  return async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(String(input), origin), init);
    request.signal.throwIfAborted();
    const body = ["GET", "HEAD"].includes(request.method) ? null : await request.arrayBuffer();
    request.signal.throwIfAborted();
    return new Promise<Response>((resolve, reject) => {
      const id = ++sequence, abort = () => { port.postMessage({ type: "abort", id }); finish(id, request.signal.reason || new DOMException("Cancelled", "AbortError")); };
      pending.set(id, { resolve, reject, signal: request.signal, abort });
      request.signal.addEventListener("abort", abort, { once: true });
      port.postMessage({ type: "fetch", id, url: request.url, method: request.method, headers: [...request.headers], body } satisfies FrameFetch, body ? [body] : []);
    });
  };
}

interface Active { controller: AbortController; reader?: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>; reading: boolean }
/** The owner uses its existing request helper; the child's idempotency keys are namespaced to this page. */
export function frameRequests(port: MessagePort, pageId: string, scope: FrameScope) {
  const active = new Map<number, Active>();
  const send = (message: FrameAnswer, transfer: Transferable[] = []) => port.postMessage(message, transfer);
  const fail = (id: number, error: unknown) => { active.delete(id); send({ type: "fetch-error", id, message: error instanceof Error ? error.message : "Request failed" }); };
  const stop = (id: number) => {
    const entry = active.get(id); active.delete(id); entry?.controller.abort();
    void entry?.reader?.cancel().catch(() => { /* The request was already cancelled. */ });
  };
  scope.own(() => { for (const id of active.keys()) stop(id); });
  return async (message: FrameRequest): Promise<void> => {
    if (message.type === "abort") { stop(message.id); return; }
    if (message.type === "pull") {
      const entry = active.get(message.id); if (!entry?.reader || entry.reading) return;
      entry.reading = true;
      try {
        const chunk = await entry.reader.read();
        if (!active.has(message.id)) return;
        if (chunk.done) { active.delete(message.id); send({ type: "end", id: message.id }); }
        else { const bytes = chunk.value.slice().buffer; send({ type: "chunk", id: message.id, bytes }, [bytes]); }
      } catch (error) { fail(message.id, error); }
      finally { entry.reading = false; }
      return;
    }
    if (message.type !== "fetch") return;
    const id = message.id;
    if (!Number.isSafeInteger(id) || active.has(id)) return;
    try {
      const url = new URL(message.url), method = message.method;
      if (url.origin !== location.origin || url.username || url.password || !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) throw new Error("Request refused");
      const headers: Record<string, string> = { "x-molis-plugin-page": pageId };
      let key: string | undefined;
      for (const [name, value] of message.headers || []) {
        if (name.toLowerCase() === "accept" || name.toLowerCase() === "last-event-id" && value.length <= 1024) headers[name] = value;
        if (name.toLowerCase() === "x-molis-work-idempotency-key" && value.length <= 128) key = pageId + ":" + value;
      }
      const entry: Active = { controller: new AbortController(), reading: false }; active.set(id, entry);
      const body: unknown = message.body?.byteLength ? JSON.parse(new TextDecoder().decode(message.body)) : undefined;
      const response = await molisWorkRequest<Response>(url.href, { method: method as "GET" | "POST" | "PUT" | "PATCH" | "DELETE", headers,
        body, key, as: "response", signal: AbortSignal.any([scope.signal, entry.controller.signal]) });
      if (!active.has(id)) return;
      entry.reader = response.body?.getReader();
      send({ type: "response", id, status: response.status, statusText: response.statusText, headers: [...response.headers] });
      if (!entry.reader) { active.delete(id); send({ type: "end", id }); }
    } catch (error) { fail(id, error); }
  };
}
