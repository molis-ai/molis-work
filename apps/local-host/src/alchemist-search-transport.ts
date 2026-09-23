import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { checkServerIdentity, type TLSSocket } from "node:tls";
import { SearchError, type SearchProviderExecutionResponse } from "@adeptify/search-evidence-layer";
import type { SearchHostTransportCall, SearchHostTransportPort } from "@adeptify/search-evidence-layer/host/node";
import { resolveModelHostname } from "@molis-ai/molis-work-service-agent-host";

const HOST = "api.anysearch.com";
const MAX_REQUEST = 65_536, MAX_RESPONSE = 1_048_576;
// Match SEL's public-address boundary. IPv4-mapped IPv6 is rejected rather
// than relying on string normalization; ordinary A/AAAA records need no mapping.
const denied = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) {
  denied.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [["2001::", 32], ["2001:2::", 48], ["2001:10::", 28], ["2001:20::", 28],
  ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]] as const) denied.addSubnet(network, prefix, "ipv6");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::", 3, "ipv6");

function unavailable(): SearchError {
  return new SearchError({ code: "provider_unavailable", retryable: false, sideEffectState: "none", recoveryAction: "none" });
}
function tooLarge(): SearchError {
  return new SearchError({ code: "content_too_large", retryable: false, sideEffectState: "none", recoveryAction: "none" });
}

/** Public SEL Host port, restricted to one anonymous AnySearch HTTPS endpoint. */
export function createAlchemistSearchTransport(): SearchHostTransportPort {
  const shutdown = new AbortController();
  const active = new Set<Promise<unknown>>();
  const sockets = new Set<Promise<void>>();
  let closing: Promise<void> | undefined;
  return {
    execute(call) {
      const signal = AbortSignal.any([call.signal, shutdown.signal]);
      const task = execute(call, signal, sockets).finally(() => active.delete(task));
      active.add(task);
      return task;
    },
    shutdown() {
      shutdown.abort();
      return closing ??= Promise.allSettled([...active, ...sockets]).then(() => undefined);
    },
  };
}

async function execute(call: SearchHostTransportCall, signal: AbortSignal, sockets: Set<Promise<void>>): Promise<SearchProviderExecutionResponse> {
  signal.throwIfAborted();
  if (call.appId !== "molis-work" || call.binding.providerId !== "anysearch" || call.request.providerId !== "anysearch"
    || call.binding.transportProfileId !== "anysearch-mcp-v1" || call.binding.credentialRef !== undefined
    || !["doctor", "search", "batch_search", "extract"].includes(call.request.operation)) throw unavailable();
  const body = Buffer.from(JSON.stringify(call.request.body), "utf8");
  if (body.byteLength > MAX_REQUEST) throw tooLarge();
  const addresses = await resolveModelHostname(HOST);
  signal.throwIfAborted();
  if (!addresses.length) throw unavailable();
  for (const address of addresses) {
    const family = isIP(address);
    if (family === 0 || address.includes("%") || (family === 6 && !globalV6.check(address, "ipv6"))
      || denied.check(address, family === 4 ? "ipv4" : "ipv6")) throw unavailable();
  }
  const pinned = addresses[0]!;
  const family = isIP(pinned) as 4 | 6;
  const peer = new BlockList(); peer.addAddress(pinned, family === 4 ? "ipv4" : "ipv6");
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown, response?: SearchProviderExecutionResponse) => {
      if (settled) return;
      settled = true; signal.removeEventListener("abort", abort);
      if (error) { req.destroy(); reject(error); } else resolve(response!);
    };
    const abort = () => finish(signal.reason ?? unavailable());
    const req = request({
      protocol: "https:", hostname: HOST, port: 443, path: "/mcp", method: "POST", family,
      lookup(hostname, lookupOptions, callback) {
        if (hostname !== HOST) { callback(unavailable(), "", family); return; }
        if (lookupOptions.all) callback(null, [{ address: pinned, family }]);
        else callback(null, pinned, family);
      },
      servername: HOST, rejectUnauthorized: true, agent: false, maxHeaderSize: 16_384,
      checkServerIdentity: (hostname, certificate) => hostname === HOST ? checkServerIdentity(HOST, certificate) : unavailable(),
      headers: { Accept: "application/json", "Content-Type": "application/json", "Accept-Encoding": "identity",
        "Content-Length": String(body.byteLength), "X-Anysearch-Client": "skill/3.0.1" },
    });
    let closed!: Promise<void>;
    closed = new Promise<void>(resolveClose => req.once("close", () => {
      sockets.delete(closed); resolveClose();
      if (!settled) finish(unavailable());
    }));
    sockets.add(closed);
    req.once("error", error => finish(error));
    req.once("socket", socket => (socket as TLSSocket).once("secureConnect", () => {
      const tls = socket as TLSSocket;
      if (settled) return;
      if (signal.aborted) { abort(); return; }
      if (!tls.authorized || !tls.remoteAddress || !peer.check(tls.remoteAddress, family === 4 ? "ipv4" : "ipv6")) {
        finish(unavailable()); return;
      }
      req.end(body);
    }));
    req.once("response", response => {
      const status = response.statusCode ?? 0;
      if ((status >= 300 && status < 400) || response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
        finish(unavailable()); return;
      }
      if (Number(response.headers["content-length"]) > MAX_RESPONSE) { finish(tooLarge()); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        if (settled) return;
        bytes += chunk.byteLength;
        if (bytes > MAX_RESPONSE) { finish(tooLarge()); return; }
        chunks.push(chunk);
      });
      response.once("error", error => finish(error));
      response.once("aborted", () => finish(unavailable()));
      response.once("end", () => {
        if (settled) return;
        try {
          if (!response.complete) throw unavailable();
          const payload = status >= 200 && status < 300 ? JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))) : null;
          finish(undefined, { status, body: payload });
        } catch (error) { finish(error); }
      });
    });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
