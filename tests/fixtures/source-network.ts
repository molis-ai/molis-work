import assert from "node:assert/strict";
import type test from "node:test";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { syncBuiltinESMExports } from "node:module";

type FakeRequest = EventEmitter & { end(body: Uint8Array): void; destroy(): void };
/** The scripted request has the two members the transport uses; this narrows it to the type `https.request` returns. */
function isClientRequest(value: FakeRequest): value is FakeRequest & http.ClientRequest {
  return typeof value.end === "function" && typeof value.destroy === "function";
}

/** The proxy variables `resolveModelHostname` consults (`hasProxy` in node-model-dns.ts). */
const PROXY_VARIABLES = ["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"] as const;

/** Script only DNS and the TLS socket; the real Host transport, AnySearch protocol and SEL execution run. */
export function scriptAnysearchNetwork(t: test.TestContext, input: { system: string; publicDns?: string; proxy: boolean }) {
  const seen = { connections: 0, calls: [] as string[], publicDnsQueries: 0, systemLookups: 0 };
  // The resolver reads all four names (a shell behind a fake-IP proxy often exports only the lowercase ones), so all four are set here.
  const previous = Object.fromEntries(PROXY_VARIABLES.map(name => [name, process.env[name]]));
  for (const name of PROXY_VARIABLES) delete process.env[name];
  if (input.proxy) process.env.HTTPS_PROXY = "http://explicit-test-proxy.invalid";
  t.mock.method(dns, "lookup", async (host: string) => {
    assert.equal(host, "api.anysearch.com");
    seen.systemLookups++;
    return [{ address: input.system, family: 4 }];
  });
  t.mock.method(globalThis, "fetch", async (target: string | URL) => {
    const url = new URL(String(target));
    assert.ok(["dns.google", "dns.alidns.com"].includes(url.hostname), "only the public DNS resolvers may be asked");
    assert.equal(url.searchParams.get("name"), "api.anysearch.com", "only the AnySearch host name goes to public DNS");
    seen.publicDnsQueries++;
    return Response.json({ Status: 0, Answer: url.searchParams.get("type") === "1" && input.publicDns ? [{ type: 1, data: input.publicDns }] : [] });
  });
  t.mock.method(https, "request", (options: https.RequestOptions) => {
    assert.equal(options.hostname, "api.anysearch.com");
    seen.connections++;
    const request: FakeRequest = Object.assign(new EventEmitter(), { end(_body: Uint8Array) { /* replaced below */ }, destroy() { /* replaced below */ } });
    request.destroy = () => { queueMicrotask(() => request.emit("close")); };
    request.end = body => {
      const rpc = JSON.parse(Buffer.from(body).toString("utf8"));
      seen.calls.push(rpc.params.name);
      const payload = rpc.params.name === "extract"
        ? { markdown: "# Research source\n\nUsers review interviews by linking each conclusion to the original words." }
        : { results: [{ url: "https://research.example/interviews", title: "Interview research", snippet: "Original evidence" }] };
      const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } }));
      const response = Object.assign(Readable.from([bytes]), { statusCode: 200, complete: true, rawHeaders: [],
        headers: { "content-length": String(bytes.length) } });
      response.once("end", () => setImmediate(() => request.emit("close")));
      request.emit("response", response);
    };
    queueMicrotask(() => {
      // The socket's real peer is the address the transport pinned.
      const socket = Object.assign(new EventEmitter(), { remoteAddress: input.publicDns ?? input.system, authorized: true });
      request.emit("socket", socket); socket.emit("secureConnect");
    });
    if (!isClientRequest(request)) throw new Error("the scripted request must stand in for a ClientRequest");
    return request;
  });
  syncBuiltinESMExports();
  t.after(() => {
    t.mock.restoreAll(); syncBuiltinESMExports();
    for (const [name, value] of Object.entries(previous)) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });
  return seen;
}


/** Script custom RSS at the DNS/HTTPS boundary; the production pinned request, parser, plan and persistence still run. */
export function scriptRssNetwork(t: test.TestContext, bodies: ReadonlyMap<string, string>, fetched: string[]): void {
  t.mock.method(dns, "lookup", async (host: string) => {
    assert.equal(host, "example.com");
    return [{ address: "1.1.1.1", family: 4 }];
  });
  t.mock.method(https, "request", (options: https.RequestOptions, receive: (response: http.IncomingMessage) => void) => {
    assert.equal(options.hostname, "example.com");
    assert.equal(options.rejectUnauthorized, true);
    const url = "https://" + options.hostname + options.path;
    const request: FakeRequest = Object.assign(new EventEmitter(), { end() {
      fetched.push(url);
      const body = bodies.get(url), bytes = Buffer.from(body ?? "missing");
      const response = Object.assign(Readable.from([bytes]), { statusCode: body ? 200 : 404, headers: {
        "content-type": "application/rss+xml", "content-length": String(bytes.length),
      } });
      queueMicrotask(() => receive(response as http.IncomingMessage));
    }, destroy() { queueMicrotask(() => request.emit("close")); } });
    if (!isClientRequest(request)) throw new Error("the scripted request must stand in for a ClientRequest");
    return request;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
}
