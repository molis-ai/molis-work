import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import type http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import type { SecretStore } from "@molis-ai/molis-work-storage";

type Request = EventEmitter & { end(body: Uint8Array): void; destroy(): void };
function isClientRequest(value: Request): value is Request & http.ClientRequest {
  return typeof value.end === "function" && typeof value.destroy === "function";
}

/** Script only network waits; the production transport, SEL and persistence execute unchanged. */
export function holdSearchNetwork(t: TestContext, stage: "dns" | "tls" | "response" | "extract") {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const seen = { connections: 0, bodies: [] as string[] };
  let lookups = 0;
  const hold = async () => { entered.resolve(); await release.promise; };
  t.mock.method(dns, "lookup", async (hostname: string) => {
    assert.equal(hostname, "api.anysearch.com");
    lookups++;
    if (stage === "dns" || stage === "extract" && lookups === 2) await hold();
    return [{ address: "1.1.1.1", family: 4 }];
  });
  t.mock.method(https, "request", (options: https.RequestOptions) => {
    assert.equal(options.hostname, "api.anysearch.com"); seen.connections++;
    const request: Request = Object.assign(new EventEmitter(), {
      destroy() { queueMicrotask(() => request.emit("close")); },
      end(body: Uint8Array) {
        const rpc = JSON.parse(Buffer.from(body).toString("utf8")); seen.bodies.push(rpc.params.name);
        const send = () => {
          const payload = rpc.params.name === "extract" ? { markdown: "# Evidence\n\nUsers retain original interviews for reviewing product decisions and conclusions." }
            : { results: [{ url: "https://research.example/interviews", title: "Interviews", snippet: "Original evidence" }] };
          const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } }));
          const response = Object.assign(Readable.from([bytes]), { statusCode: 200, complete: true, rawHeaders: [], headers: { "content-length": String(bytes.length) } });
          response.once("end", () => setImmediate(() => request.emit("close"))); request.emit("response", response);
        };
        if (stage === "response" && rpc.params.name === "extract") void hold().then(send); else send();
      },
    });
    queueMicrotask(() => {
      const socket = Object.assign(new EventEmitter(), { remoteAddress: "1.1.1.1", authorized: true }); request.emit("socket", socket);
      if (stage === "tls") void hold().then(() => socket.emit("secureConnect")); else socket.emit("secureConnect");
    });
    if (!isClientRequest(request)) throw new Error("Scripted request is invalid"); return request;
  });
  syncBuiltinESMExports();
  t.after(() => { release.resolve(); t.mock.restoreAll(); syncBuiltinESMExports(); });
  return { entered: entered.promise, release: release.resolve, seen };
}

export function searchMemorySecrets(): SecretStore {
  const keys = new Map<string, string>();
  return {
    get: ref => keys.get(ref) ?? null, put: (ref, value) => { keys.set(ref, value); }, delete: ref => { keys.delete(ref); },
    createIfAbsent(ref, value) { if (keys.has(ref)) return false; keys.set(ref, value); return true; },
    deleteIfPresent: ref => keys.delete(ref),
    backend: () => ({ kind: "aes-gcm-file", label: "test memory", masterKeyExternal: false, formatVersion: 1 }),
  };
}
