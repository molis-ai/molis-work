import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { syncBuiltinESMExports } from "node:module";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEvidenceContentStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SecretStore,
} from "@molis-ai/molis-work-storage";
import { createFeedSourceRuntime, type IntelligenceCollectRequest } from "@molis-ai/molis-work-app-local-host";

// One owner for "how Molis Work reaches AnySearch" (W2-18 decision 15): Feed's web search and Alchemist's research
// both go through apps/local-host/src/anysearch-transport.ts, so a fake-IP proxy setup that works for one works for both.

function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "anysearch-owner-"));
  const storage = new LocalSqliteStorage(join(directory, "feed.sqlite"));
  storage.db.exec(LOCAL_OPAQUE_BLOB_SCHEMA_SQL);
  const keys = new Map<string, string>();
  const secrets: SecretStore = {
    get: ref => keys.get(ref) ?? null,
    put: (ref, value) => { keys.set(ref, value); },
    delete: ref => { keys.delete(ref); },
    createIfAbsent(ref, value) { if (keys.has(ref)) return false; keys.set(ref, value); return true; },
    deleteIfPresent: ref => keys.delete(ref),
    backend: () => ({ kind: "aes-gcm-file", label: "explicit test memory", masterKeyExternal: false, formatVersion: 2 }),
  };
  const content = createEvidenceContentStore({ secretStore: secrets, rootDirectory: join(directory, "content") });
  t.after(() => { storage.close(); rmSync(directory, { recursive: true, force: true }); });
  return { storage, secrets, content };
}

function webQuery(): IntelligenceCollectRequest {
  const selectors = [{ kind: "provider" as const, value: "anysearch" }, { kind: "channel" as const, value: "web" as const },
    { kind: "source_definition" as const, namespace: "app" as const, value: "anysearch" }];
  return {
    schema: "search-intent-v1", operationId: crypto.randomUUID(), goal: "Collect public evidence", taskProfile: "market_opportunity_research",
    mode: "exact", input: { kind: "query", query: "interview evidence" }, sourcePolicy: { required: selectors, allowed: selectors },
    budget: { maxProviderCalls: 1, maxFetchExtractCalls: 1, maxModelInputTokens: 0, maxModelOutputTokens: 0, maxMaterials: 1, maxBytes: 1_048_576, maxConcurrency: 1, deadlineMs: 30_000 },
    partialPolicy: "allow_partial", resultProfile: "materials_v1",
  };
}

type FakeRequest = EventEmitter & { end(body: Uint8Array): void; destroy(): void };
/** The scripted request has the two members the transport uses; this narrows it to the type `https.request` returns. */
function isClientRequest(value: FakeRequest): value is FakeRequest & http.ClientRequest {
  return typeof value.end === "function" && typeof value.destroy === "function";
}

/** The proxy variables `resolveModelHostname` consults (`hasProxy` in node-model-dns.ts). */
const PROXY_VARIABLES = ["https_proxy", "HTTPS_PROXY", "all_proxy", "ALL_PROXY"] as const;

/** Script only DNS and the TLS socket; the real Host transport, AnySearch protocol and SEL execution run. */
function scriptNetwork(t: test.TestContext, input: { system: string; publicDns?: string; proxy: boolean }) {
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

test("Feed web search reaches AnySearch on an ordinary network and never asks public DNS", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const seen = scriptNetwork(t, { system: "1.1.1.1", proxy: false });
  const runtime = createFeedSourceRuntime({ db: f.storage.db, secretStore: f.secrets, content: f.content });
  try {
    const result = await runtime.intelligenceCollect.executeExact(webQuery());
    assert.equal(result.materials[0]?.canonicalUrl, "https://research.example/interviews");
    assert.deepEqual(seen.calls, ["search", "extract"]);
    assert.equal(seen.publicDnsQueries, 0);
  } finally { await runtime.shutdown(); }
});

test("Feed web search works behind a fake-IP proxy, like Alchemist research: the AnySearch host name is checked over public DNS", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const seen = scriptNetwork(t, { system: "198.18.0.12", publicDns: "1.1.1.1", proxy: true });
  const runtime = createFeedSourceRuntime({ db: f.storage.db, secretStore: f.secrets, content: f.content });
  try {
    const result = await runtime.intelligenceCollect.executeExact(webQuery());
    assert.equal(result.materials[0]?.canonicalUrl, "https://research.example/interviews", "a fake-IP answer must not make the Feed source unavailable");
    assert.deepEqual(seen.calls, ["search", "extract"]);
    assert.ok(seen.publicDnsQueries >= 2, "the synthetic answer is replaced by the public resolver's answer (A and AAAA)");
    assert.equal(seen.systemLookups >= 1, true);
  } finally { await runtime.shutdown(); }
});

test("a fake-IP answer without a configured proxy is still refused before any connection", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const seen = scriptNetwork(t, { system: "198.18.0.12", publicDns: "1.1.1.1", proxy: false });
  const runtime = createFeedSourceRuntime({ db: f.storage.db, secretStore: f.secrets, content: f.content });
  try {
    const result = await runtime.intelligenceCollect.executeExact(webQuery());
    assert.equal(result.materials.length, 0);
    assert.equal(seen.connections, 0, "the public-address gate rejects the synthetic address before connecting");
    assert.equal(seen.publicDnsQueries, 0, "public DNS is only consulted when a proxy is configured");
  } finally { await runtime.shutdown(); }
});

test("only anysearch-transport.ts knows how to reach AnySearch", () => {
  const sources: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path); else if (/\.(ts|mts)$/u.test(entry.name) && !entry.name.endsWith(".d.ts")) sources.push(path);
    }
  };
  walk(join(import.meta.dirname, "..", "apps", "local-host", "src"));
  const owners = sources.filter(file => /api\.anysearch\.com/u.test(readFileSync(file, "utf8")));
  assert.deepEqual(owners.map(file => file.split("/").at(-1)), ["anysearch-transport.ts"],
    "the host name, path and limits of AnySearch are written once");
  const second = sources.filter(file => /createNodePinnedSearchHost/u.test(readFileSync(file, "utf8")));
  assert.deepEqual(second, [], "SEL's own pinned HTTPS host is a second way to reach AnySearch and is not used");
});
