import assert from "node:assert/strict";
import test from "node:test";
import https from "node:https";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import dns from "node:dns/promises";
import { syncBuiltinESMExports } from "node:module";
import { scriptAnysearchNetwork } from "./fixtures/source-network.js";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEvidenceContentStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SecretStore,
} from "@molis-ai/molis-work-storage";
import { createAnySearchTransport, createSourcePullRuntime, type IntelligenceCollectRequest } from "@molis-ai/molis-work-app-local-host";
import { ADDRESSES_NEVER_PUBLIC, ADDRESSES_PUBLIC } from "./fixtures/public-address-policy.js";

// One owner for "how Molis Work reaches AnySearch" (W2-18 decision 15): every web search goes through
// apps/local-host/src/anysearch-transport.ts, so a fake-IP proxy setup that works for one works for all.

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
    backend: () => ({ kind: "aes-gcm-file", label: "explicit test memory", masterKeyExternal: false, formatVersion: 1 }),
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


test("Feed web search reaches AnySearch on an ordinary network and never asks public DNS", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const seen = scriptAnysearchNetwork(t, { system: "1.1.1.1", proxy: false });
  const runtime = createSourcePullRuntime({ db: f.storage.db, secretStore: f.secrets, content: f.content });
  try {
    const result = await runtime.intelligenceCollect.executeExact(webQuery());
    assert.equal(result.materials[0]?.canonicalUrl, "https://research.example/interviews");
    assert.deepEqual(seen.calls, ["search", "extract"]);
    assert.equal(seen.publicDnsQueries, 0);
  } finally { await runtime.shutdown(); }
});

test("Feed web search works behind a fake-IP proxy: the AnySearch host name is checked over public DNS", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const seen = scriptAnysearchNetwork(t, { system: "198.18.0.12", publicDns: "1.1.1.1", proxy: true });
  const runtime = createSourcePullRuntime({ db: f.storage.db, secretStore: f.secrets, content: f.content });
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
  const seen = scriptAnysearchNetwork(t, { system: "198.18.0.12", publicDns: "1.1.1.1", proxy: false });
  const runtime = createSourcePullRuntime({ db: f.storage.db, secretStore: f.secrets, content: f.content });
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

// S-10: the one transport refuses an address of the shared table before it opens a connection (moved here from the old Alchemist's host test in 44B).
test("the AnySearch transport opens no connection to an address of the shared table that is not public, alone or among public answers", { timeout: 30_000 }, async t => {
  let requests = 0, answers: Array<{ address: string; family: number }> = [];
  t.mock.method(dns, "lookup", async () => answers);
  t.mock.method(https, "request", () => { requests++; throw new Error("no connection may be opened"); });
  syncBuiltinESMExports();
  const transport = createAnySearchTransport();
  const call = { appId: "molis-work", binding: { providerId: "anysearch", providerVersion: "mcp-v1_1", bindingRevision: 1,
    transportProfileId: "anysearch-mcp-v1", transportProfileFingerprint: "sha256:explicit-test-binding" },
    request: { providerId: "anysearch", operation: "search" as const, body: { query: "public evidence" } }, signal: new AbortController().signal };
  const family = (address: string) => address.includes(":") ? 6 : 4;
  try {
    for (const address of ADDRESSES_NEVER_PUBLIC) {
      answers = [{ address, family: family(address) }];
      await assert.rejects(transport.execute(call), /provider_unavailable/, address);
      answers = [{ address: ADDRESSES_PUBLIC[0]!, family: 4 }, { address, family: family(address) }];
      await assert.rejects(transport.execute(call), /provider_unavailable/, `${address} among a public answer`);
    }
    assert.equal(requests, 0);
  } finally { await transport.shutdown!(); t.mock.restoreAll(); syncBuiltinESMExports(); }
});

const anysearchCall = (signal: AbortSignal, query = "public evidence") => ({ appId: "molis-work", binding: { providerId: "anysearch", providerVersion: "mcp-v1_1", bindingRevision: 1,
  transportProfileId: "anysearch-mcp-v1", transportProfileFingerprint: "sha256:explicit-test-binding" },
  request: { providerId: "anysearch", operation: "search" as const, body: { query } }, signal });

/** A scripted TLS connection to AnySearch: only DNS and socket I/O are fakes, the Host transport itself runs. */
function scriptedAnysearch(t: test.TestContext) {
  const state = { addresses: [{ address: "1.1.1.1", family: 4 }], peer: "1.1.1.1", mode: "success" as "success" | "redirect" | "oversized",
    connections: 0, bodies: 0, dnsRequests: 0, holdSecureConnect: null as null | Promise<void> };
  t.mock.method(dns, "lookup", async () => state.addresses);
  t.mock.method(globalThis, "fetch", async (input: string | URL) => {
    const url = new URL(input);
    assert.ok(["dns.google", "dns.alidns.com"].includes(url.hostname));
    assert.equal(url.searchParams.get("name"), "api.anysearch.com");
    state.dnsRequests++;
    return Response.json({ Status: 0, Answer: url.searchParams.get("type") === "1" ? [{ type: 1, data: "1.1.1.1" }] : [] });
  });
  t.mock.method(https, "request", (options: https.RequestOptions) => {
    assert.equal(options.hostname, "api.anysearch.com");
    assert.equal(options.servername, "api.anysearch.com");
    assert.equal(options.path, "/mcp"); assert.equal(options.method, "POST");
    assert.equal(options.rejectUnauthorized, true); assert.equal(options.agent, false);
    const lookup = options.lookup as Function;
    lookup("api.anysearch.com", {}, (error: unknown, address: string) => { assert.equal(error, null); assert.equal(address, "1.1.1.1"); });
    lookup("other.example", {}, (error: unknown) => { assert.ok(error); });
    assert.ok(options.checkServerIdentity?.("other.example", {} as never), "a certificate for another host is refused");
    state.connections++;
    const request = new EventEmitter() as EventEmitter & { end(body: Uint8Array): void; destroy(): void };
    request.destroy = () => { queueMicrotask(() => request.emit("close")); };
    request.end = body => {
      state.bodies++;
      const rpc = JSON.parse(Buffer.from(body).toString("utf8"));
      const bytes = Buffer.from(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: "{\"results\":[]}" }] },
        ...(state.mode === "oversized" ? { padding: "x".repeat(1_048_576) } : {}) }));
      const response = Object.assign(Readable.from([bytes]), { statusCode: state.mode === "redirect" ? 302 : 200, complete: true, rawHeaders: [],
        headers: state.mode === "oversized" ? {} : { "content-length": String(bytes.length), ...(state.mode === "redirect" ? { location: "https://api.anysearch.com/other" } : {}) } });
      response.once("end", () => setImmediate(() => request.emit("close")));
      request.emit("response", response);
    };
    queueMicrotask(async () => {
      const socket = Object.assign(new EventEmitter(), { remoteAddress: state.peer, authorized: true });
      request.emit("socket", socket);
      if (state.holdSecureConnect) await state.holdSecureConnect;
      socket.emit("secureConnect");
    });
    return request as never;
  });
  syncBuiltinESMExports();
  return state;
}

test("the AnySearch transport pins the checked address over verified TLS, and refuses a different peer, a redirect, an oversized answer and a placeholder mixed with a private address", { timeout: 15_000 }, async t => {
  const oldProxy = process.env.HTTPS_PROXY;
  process.env.HTTPS_PROXY = "http://explicit-test-proxy.invalid";
  const net = scriptedAnysearch(t);
  const transport = createAnySearchTransport();
  const run = (query: string) => transport.execute(anysearchCall(new AbortController().signal, query));
  try {
    assert.equal((await run("ordinary")).status, 200);
    net.addresses = [{ address: "198.18.0.12", family: 4 }];
    assert.equal((await run("placeholder address under a proxy")).status, 200);
    assert.ok(net.dnsRequests >= 1, "placeholder addresses go through the public DNS resolver");
    const opened = net.connections, sent = net.bodies;
    net.addresses = [{ address: "198.18.0.12", family: 4 }, { address: "10.0.0.1", family: 4 }];
    await assert.rejects(run("placeholder beside a private answer"), /provider_unavailable/);
    assert.equal(net.connections, opened);
    net.addresses = [{ address: "1.1.1.1", family: 4 }]; net.peer = "8.8.8.8";
    await assert.rejects(run("the socket reached another address"), /provider_unavailable/);
    assert.equal(net.bodies, sent, "a mismatched TLS peer never receives the request body");
    net.peer = "1.1.1.1"; net.mode = "redirect";
    const beforeRedirect = net.connections;
    await assert.rejects(run("a redirect is not followed"), /provider_unavailable/);
    assert.equal(net.connections, beforeRedirect + 1, "a redirect opens no second request");
    net.mode = "oversized";
    await assert.rejects(run("an oversized answer without content-length"), /content_too_large/);
  } finally {
    await transport.shutdown!(); t.mock.restoreAll(); syncBuiltinESMExports();
    if (oldProxy === undefined) delete process.env.HTTPS_PROXY; else process.env.HTTPS_PROXY = oldProxy;
  }
});

test("the AnySearch transport refuses an oversized request or a wrong binding before any network call; a cancel before TLS completes sends no body and shutdown waits for the socket to close", { timeout: 15_000 }, async t => {
  const controller = new AbortController();
  const connected = Promise.withResolvers<void>(), destroyed = Promise.withResolvers<void>(), releaseClose = Promise.withResolvers<void>();
  const socket = Object.assign(new EventEmitter(), { remoteAddress: "1.1.1.1", authorized: true });
  let requests = 0, sent = 0;
  t.mock.method(dns, "lookup", async () => [{ address: "1.1.1.1", family: 4 }]);
  t.mock.method(https, "request", () => {
    requests++;
    const request = new EventEmitter() as EventEmitter & { end(): void; destroy(): void };
    request.end = () => { sent++; };
    request.destroy = () => { destroyed.resolve(); void releaseClose.promise.then(() => request.emit("close")); };
    queueMicrotask(() => { request.emit("socket", socket); connected.resolve(); });
    return request as never;
  });
  syncBuiltinESMExports();
  const transport = createAnySearchTransport();
  const call = anysearchCall(controller.signal);
  try {
    await assert.rejects(transport.execute({ ...call, request: { ...call.request, body: { query: "x".repeat(65_536) } } }), error =>
      (error as { code?: string }).code === "content_too_large");
    await assert.rejects(transport.execute({ ...call, binding: { ...call.binding, providerId: "other" } }));
    assert.equal(requests, 0, "invalid binding and oversized request must fail before network I/O");
    const result = transport.execute(call);
    const failed = assert.rejects(result, /用户取消搜索/);
    await connected.promise;
    controller.abort(new Error("用户取消搜索"));
    await failed; await destroyed.promise;
    let closed = false;
    const closing = transport.shutdown!().then(() => { closed = true; });
    await Promise.resolve(); assert.equal(closed, false, "shutdown owns the socket close barrier");
    socket.emit("secureConnect"); assert.equal(sent, 0, "late TLS completion cannot dispatch after cancellation");
    releaseClose.resolve(); await closing;
    assert.equal(closed, true);
    await assert.rejects(transport.execute({ ...call, signal: new AbortController().signal }));
    assert.equal(requests, 1);
  } finally {
    releaseClose.resolve(); await transport.shutdown!(); t.mock.restoreAll(); syncBuiltinESMExports();
  }
});

// S-18: a call whose authority is withdrawn while it waits for DNS, or after the socket is open but before TLS completes, sends nothing.
test("S-18 a search withdrawn after DNS or before the TLS body sends no request body", { timeout: 15_000 }, async t => {
  const net = scriptedAnysearch(t);
  let current = true;
  const revoked = () => Object.assign(new Error("withdrawn"), { code: "actions.revoked" });
  const heldDns = Promise.withResolvers<void>(), reachedDns = Promise.withResolvers<void>();
  const transport = createAnySearchTransport({
    beforeDispatch: async () => { reachedDns.resolve(); await heldDns.promise; },
    assertCurrent: () => { if (!current) throw revoked(); },
  });
  try {
    const afterDns = transport.execute(anysearchCall(new AbortController().signal));
    await reachedDns.promise; current = false; heldDns.resolve();
    await assert.rejects(afterDns, /withdrawn/);
    assert.equal(net.connections, 0, "withdrawn after DNS: no connection is opened");

    current = true;
    const tlsGate = Promise.withResolvers<void>(); net.holdSecureConnect = tlsGate.promise;
    const beforeBody = transport.execute(anysearchCall(new AbortController().signal));
    while (net.connections === 0) await new Promise(resolve => setImmediate(resolve));
    current = false; tlsGate.resolve();
    await assert.rejects(beforeBody, /withdrawn/);
    assert.equal(net.connections, 1);
    assert.equal(net.bodies, 0, "withdrawn before TLS completes: the body is never sent");
  } finally { await transport.shutdown!(); t.mock.restoreAll(); syncBuiltinESMExports(); }
});
