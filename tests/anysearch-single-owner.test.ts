import assert from "node:assert/strict";
import test from "node:test";
import { scriptAnysearchNetwork } from "./fixtures/source-network.js";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createEvidenceContentStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, type SecretStore,
} from "@molis-ai/molis-work-storage";
import { createSourcePullRuntime, type IntelligenceCollectRequest } from "@molis-ai/molis-work-app-local-host";

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

test("Feed web search works behind a fake-IP proxy, like Alchemist research: the AnySearch host name is checked over public DNS", { timeout: 15_000 }, async t => {
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
