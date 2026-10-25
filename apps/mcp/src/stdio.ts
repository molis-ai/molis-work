import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";

/** Serial dispatch with live EOF/cancellation observation while a request is awaiting IO. */
export async function serveMcpStdio(options: {
  handleMessage(message: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown> | null>;
  input?: Readable;
  output?: Writable;
}): Promise<void> {
  const input = options.input ?? process.stdin, output = options.output ?? process.stdout;
  const lines = createInterface({ input, crlfDelay: Infinity });
  type Pending = { message: Record<string, unknown>; controller: AbortController; wireError?: Record<string, unknown> };
  const queue: Pending[] = [];
  let active: Pending | undefined, running = false, ended = false;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      lines.removeListener("line", onLine); lines.removeListener("close", onClose);
      input.removeListener("error", fail); output.removeListener("error", fail); lines.close();
    };
    const stop = () => { ended = true; active?.controller.abort(new Error("MCP input closed")); queue.length = 0; };
    const fail = (error: unknown) => { stop(); cleanup(); reject(error); };
    const onClose = () => { stop(); if (!running) { cleanup(); resolve(); } };
    const write = (message: Record<string, unknown>) => new Promise<void>((done, failed) => {
      output.write(JSON.stringify(message) + "\n", error => error ? failed(error) : done());
    });
    async function drain() {
      if (running) return;
      running = true;
      try {
        while (!ended && queue.length) {
          active = queue.shift()!;
          if (active.controller.signal.aborted) continue;
          try {
            const response = active.wireError ?? await options.handleMessage(active.message, active.controller.signal);
            if (!ended && !active.controller.signal.aborted && response && (active.wireError || Object.hasOwn(active.message, "id"))) await write(response);
          } catch (error) { if (!active.controller.signal.aborted) throw error; }
          finally { active = undefined; }
        }
      } finally { running = false; if (ended) { cleanup(); resolve(); } }
    }
    function onLine(line: string) {
      if (ended || !line.trim()) return;
      let parsed: unknown, wireError: Record<string, unknown> | undefined;
      try { parsed = JSON.parse(line); }
      catch { wireError = { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }; }
      if (!wireError && (!parsed || typeof parsed !== "object" || Array.isArray(parsed))) {
        wireError = { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
      }
      if (!wireError && parsed && typeof parsed === "object"
        && (!("jsonrpc" in parsed) || parsed.jsonrpc !== "2.0" || !("method" in parsed) || typeof parsed.method !== "string"
          || ("id" in parsed && typeof parsed.id !== "string" && typeof parsed.id !== "number"))) {
        wireError = { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } };
      }
      const message = wireError ? {} : parsed as Record<string, unknown>;
      if (!wireError && !Object.hasOwn(message, "id") && (typeof message.method !== "string" || !message.method.startsWith("notifications/"))) return;
      if (message.method === "notifications/cancelled" && !Object.hasOwn(message, "id")) {
        const params = message.params;
        const id = params && typeof params === "object" && "requestId" in params ? params.requestId : undefined;
        if (typeof id === "string" || typeof id === "number") {
          for (const request of active ? [active, ...queue] : queue) {
            if (request.message.id === id) request.controller.abort(new Error("MCP request cancelled"));
          }
        }
        return;
      }
      if (queue.length >= 32) { fail(new Error("MCP pending request limit exceeded")); return; }
      queue.push({ message, wireError, controller: new AbortController() });
      void drain().catch(error => { if (!ended) fail(error); });
    }
    lines.on("line", onLine); lines.once("close", onClose);
    input.once("error", fail); output.once("error", fail);
  });
}
