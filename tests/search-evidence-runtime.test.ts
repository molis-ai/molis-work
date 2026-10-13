import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SearchHostTransportPort } from "@adeptify/search-evidence-layer/host/node";
import {
  createEvidenceContentStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SecretStore,
} from "@molis-ai/molis-work-storage";
import { createSearchEvidenceRuntime } from "../apps/local-host/src/search-evidence-runtime.js";
import type { IntelligenceCollectRequest } from "../apps/local-host/src/search-intelligence-client.js";

function fixture(t: test.TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "shared-search-"));
  const dbPath = join(directory, "search.sqlite");
  const storage = new LocalSqliteStorage(dbPath);
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
function request(): IntelligenceCollectRequest {
  const selectors = [{ kind: "provider" as const, value: "anysearch" }, { kind: "channel" as const, value: "web" as const },
    { kind: "source_definition" as const, namespace: "app" as const, value: "anysearch" }];
  return {
    schema: "search-intent-v1", operationId: crypto.randomUUID(), goal: "Collect public evidence", taskProfile: "market_opportunity_research",
    mode: "exact", input: { kind: "query", query: "interview evidence" }, sourcePolicy: { required: selectors, allowed: selectors },
    budget: { maxProviderCalls: 1, maxFetchExtractCalls: 1, maxModelInputTokens: 0, maxModelOutputTokens: 0, maxMaterials: 1, maxBytes: 1_048_576, maxConcurrency: 1, deadlineMs: 30_000 },
    partialPolicy: "allow_partial", resultProfile: "materials_v1",
  };
}

test("public search executes and replays persisted SEL evidence without Feed source composition", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const calls: string[] = [];
  const transport: SearchHostTransportPort = {
    async execute(call) {
      const rpc = call.request.body as { id: string; params: { name: string } };
      calls.push(rpc.params.name);
      const data = rpc.params.name === "extract" ? { markdown: "# Research source\n\nUsers review interviews by linking each conclusion to the original words." }
        : { results: [{ url: "https://research.example/interviews", title: "Interview research", snippet: "Original evidence" }] };
      return { status: 200, body: { jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(data) }] } } };
    },
  };
  const options = { db: f.storage.db, secretStore: f.secrets, content: f.content, queryTransport: transport };
  let runtime = createSearchEvidenceRuntime(options);
  try {
    const input = request();
    const result = await runtime.intelligenceCollect.executeExact(input);
    assert.equal(result.materials[0]?.canonicalUrl, "https://research.example/interviews");
    assert.match(f.content.read(result.materials[0]!.contentRef), /linking each conclusion/);
    assert.deepEqual(calls, ["search", "extract"]);
    await runtime.shutdown();
    runtime = createSearchEvidenceRuntime(options);
    const replay = await runtime.intelligenceCollect.executeExact(input);
    assert.deepEqual(replay.materials, result.materials);
    assert.equal(calls.length, 2, "terminal intent is replayed from the same persistent ledger");
    await assert.rejects(runtime.intelligenceCollect.executeExact({ ...request(), principalRef: "another-user" } as never), /must not include principalRef/);
    const denied = await runtime.intelligenceCollect.executeExact({ ...request(), sourcePolicy: { required: [], allowed: [] } });
    assert.equal(denied.materials.length, 0);
    assert.equal(calls.length, 2, "an unpinned query cannot perform provider I/O");
  } finally { await runtime.shutdown(); }
});

test("shared search shutdown aborts in-flight work and waits for transport cleanup before releasing storage", { timeout: 15_000 }, async t => {
  const f = fixture(t);
  const entered = Promise.withResolvers<void>(), aborted = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let requests = 0, transportStopped = false, closed = false;
  const runtime = createSearchEvidenceRuntime({ db: f.storage.db, secretStore: f.secrets, content: f.content, queryTransport: {
    async execute(call) {
      requests++; entered.resolve();
      call.signal.addEventListener("abort", () => aborted.resolve(), { once: true });
      if (call.signal.aborted) aborted.resolve();
      await release.promise;
      call.signal.throwIfAborted();
      throw new Error("shutdown must cancel the provider call");
    },
    async shutdown() { await release.promise; transportStopped = true; },
  } });
  const result = runtime.intelligenceCollect.executeExact(request());
  const rejected = assert.rejects(result, /Search service stopped/);
  try {
    await entered.promise;
    const closing = runtime.shutdown().then(() => { closed = true; });
    await aborted.promise;
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(closed, false, "storage owner cannot close until pending transport cleanup finishes");
    assert.equal(transportStopped, false);
    assert.ok(f.storage.db.prepare("SELECT COUNT(*) AS count FROM feed_runtime_blobs").get());
    await assert.rejects(runtime.intelligenceCollect.executeExact(request()), /Search service stopped/);
    assert.equal(requests, 1);
    release.resolve(); await closing; await rejected;
    assert.equal(transportStopped, true);
    assert.equal(closed, true);
  } finally { release.resolve(); await runtime.shutdown(); await rejected; }
});
