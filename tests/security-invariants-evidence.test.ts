import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createCipheriv, createHash, scryptSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SearchHostTransportPort } from "@adeptify/search-evidence-layer/host/node";
import { createSearchEvidenceRuntime, type IntelligenceCollectRequest } from "@molis-ai/molis-work-app-local-host";
import {
  createEvidenceContentStore, createFileSecretStore, createLazyFileSecretStore, inspectSealedSecretsSnapshot,
  LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL, resetSecretStoreCache, runWithMolisWorkHome,
} from "@molis-ai/molis-work-storage";
import { homeStorageTree } from "./fixtures/home-storage-files.js";

function secretEnvironment(t: TestContext, backend: "file" | "env") {
  const old = { MOLIS_WORK_SECRET_BACKEND: process.env.MOLIS_WORK_SECRET_BACKEND, MOLIS_WORK_ENCRYPTION_KEY: process.env.MOLIS_WORK_ENCRYPTION_KEY };
  process.env.MOLIS_WORK_SECRET_BACKEND = backend;
  process.env.MOLIS_WORK_ENCRYPTION_KEY = "";
  resetSecretStoreCache();
  t.after(() => {
    resetSecretStoreCache();
    for (const [name, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });
}

test("S-12 N36: missing, invalid or wrong evidence keys and damaged ciphertext refuse without a replacement key or copy", async t => {
  secretEnvironment(t, "file");
  for (const fault of ["missing-key", "invalid-key", "wrong-key", "damaged-ciphertext"] as const) await t.test(fault, () => {
    const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-content-refusal-"));
    try {
      const home = join(directory, "home"), secrets = createLazyFileSecretStore(home);
      const content = createEvidenceContentStore({ secretStore: secrets, rootDirectory: join(home, "feed", "evidence") });
      const markdown = "# Original evidence\n\nA refusal must keep the original evidence.";
      const written = content.write(markdown), originalKey = secrets.get("system:feed:evidence-content-key:v1")!;
      const digest = written.contentRef.split("/").at(-1)!;
      const file = join(home, "feed", "evidence", "blobs", digest.slice(0, 2), digest + ".blob");
      const ciphertext = readFileSync(file);
      if (fault === "missing-key") secrets.deleteIfPresent("system:feed:evidence-content-key:v1");
      if (fault === "invalid-key") secrets.put("system:feed:evidence-content-key:v1", "invalid-content-key");
      if (fault === "wrong-key") secrets.put("system:feed:evidence-content-key:v1", Buffer.alloc(32, 17).toString("base64"));
      if (fault === "damaged-ciphertext") writeFileSync(file, "damaged original ciphertext");
      const before = homeStorageTree(home);
      const reopened = createEvidenceContentStore({ secretStore: secrets, rootDirectory: join(home, "feed", "evidence") });
      const failure = fault === "missing-key" || fault === "invalid-key" ? /key unavailable/u : /integrity validation/u;
      assert.throws(() => reopened.read(written.contentRef), failure);
      assert.throws(() => reopened.write(markdown), failure);
      if (fault === "missing-key" || fault === "invalid-key") assert.throws(() => reopened.write("A different body"), /key unavailable/u);
      assert.equal(reopened.has(written.contentRef), false);
      assert.deepEqual(reopened.inspect([written.contentRef]), { referenced: 1, available: 0, missing: 1, keyAvailable: fault === "wrong-key" || fault === "damaged-ciphertext" });
      assert.deepEqual(homeStorageTree(home), before, "the refused read and write change no directory, ciphertext or key");
      secrets.put("system:feed:evidence-content-key:v1", originalKey);
      writeFileSync(file, ciphertext);
      assert.equal(reopened.read(written.contentRef), markdown, "only restoring the original key and ciphertext restores the body");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

test("S-12 N30: passphrase vaults use the current salt and refuse earlier-salt ciphertext without rewriting it", t => {
  secretEnvironment(t, "env");
  const home = mkdtempSync(join(tmpdir(), "molis-secret-current-salt-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const passphrase = "molis-test-passphrase-N30";
  process.env.MOLIS_WORK_ENCRYPTION_KEY = passphrase;
  const original = "test-only-current-passphrase-value", ref = "fixture:passphrase";
  createLazyFileSecretStore(home).put(ref, original);
  const file = join(home, "feed", "secrets.json"), ciphertext = readFileSync(file, "utf8");
  const expectedKey = scryptSync(passphrase, "molis-work-secretstore-v1", 32);
  assert.equal(inspectSealedSecretsSnapshot(home, ciphertext).key_reference?.sha256, createHash("sha256").update(expectedKey).digest("hex"));
  resetSecretStoreCache();
  assert.equal(createLazyFileSecretStore(home).get(ref), original);
  assert.equal(readFileSync(file, "utf8"), ciphertext);

  const oldKey = scryptSync(passphrase, "goalboard-feed-secretstore-v1", 32), iv = Buffer.alloc(12, 29);
  const cipher = createCipheriv("aes-256-gcm", oldKey, iv);
  const ct = Buffer.concat([cipher.update(original, "utf8"), cipher.final()]);
  const sealed = Buffer.from(JSON.stringify({ v: 2, alg: "aes-256-gcm", iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") })).toString("base64");
  writeFileSync(file, JSON.stringify({ version: 1, backend: "env-key+aes-gcm", entries: { [ref]: sealed } }));
  resetSecretStoreCache();
  const reopened = runWithMolisWorkHome(home, createFileSecretStore), before = homeStorageTree(home);
  assert.equal(reopened.get(ref), null, "earlier-salt ciphertext cannot become plaintext through a second derivation");
  assert.throws(() => inspectSealedSecretsSnapshot(home, readFileSync(file, "utf8")), { code: "storage.secrets_snapshot.integrity_failed" });
  assert.deepEqual(homeStorageTree(home), before);
});

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

test("S-12 N37: one search intent namespace reopens and replays; its missing key refuses without another ledger or key", { timeout: 15_000 }, async t => {
  secretEnvironment(t, "file");
  const directory = mkdtempSync(join(tmpdir(), "molis-intent-current-")), dbPath = join(directory, "search.sqlite");
  let storage = new LocalSqliteStorage(dbPath);
  storage.db.exec(LOCAL_OPAQUE_BLOB_SCHEMA_SQL);
  const secrets = createLazyFileSecretStore(directory);
  const content = createEvidenceContentStore({ secretStore: secrets, rootDirectory: join(directory, "feed", "evidence") });
  let calls = 0;
  const transport: SearchHostTransportPort = { async execute(call) {
    calls++;
    const rpc = call.request.body as { id: string; params: { name: string } };
    const data = rpc.params.name === "extract" ? { markdown: "# Retained public evidence" }
      : { results: [{ url: "https://research.example/current", title: "Current evidence", snippet: "Original source" }] };
    return { status: 200, body: { jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(data) }] } } };
  } };
  const open = () => createSearchEvidenceRuntime({ db: storage.db, secretStore: secrets, content, queryTransport: transport });
  let runtime = open();
  t.after(async () => { await runtime.shutdown(); storage.close(); resetSecretStoreCache(); rmSync(directory, { recursive: true, force: true }); });
  const input = request(), original = await runtime.intelligenceCollect.executeExact(input);
  assert.equal(original.materials.length, 1);
  assert.equal(calls, 2);
  const namespaces = () => (storage.db.prepare("SELECT DISTINCT namespace FROM feed_runtime_blobs ORDER BY namespace").all() as Array<{ namespace: string }>).map(row => row.namespace);
  const storedNamespaces = namespaces();
  assert.ok(storedNamespaces.includes("search-evidence-layer/molis-work/feed-intent-v1/control/v1"));
  assert.ok(storedNamespaces.includes("search-evidence-layer/molis-work/feed-intent-v1/data/operation/v1"));
  assert.ok(storedNamespaces.every(namespace => namespace.startsWith("search-evidence-layer/molis-work/feed-intent-v1/")));
  await runtime.shutdown(); storage.close(); resetSecretStoreCache();
  storage = new LocalSqliteStorage(dbPath); runtime = open();
  assert.deepEqual((await runtime.intelligenceCollect.executeExact(input)).materials, original.materials);
  assert.equal(calls, 2, "a reopened intent returns the same stored evidence without provider I/O");
  await runtime.shutdown();

  const controlRef = "search-evidence-layer/molis-work/feed-intent-v1/control-key/v1", key = secrets.get(controlRef);
  assert.ok(key);
  assert.equal(secrets.deleteIfPresent(controlRef), true);
  const rows = () => storage.db.prepare("SELECT * FROM feed_runtime_blobs ORDER BY namespace, key").all();
  const beforeRows = rows(), beforeFiles = homeStorageTree(join(directory, "feed"));
  runtime = open();
  await assert.rejects(runtime.intelligenceCollect.executeExact(input), { code: "persistence_failed" });
  await assert.rejects(runtime.intelligenceCollect.executeExact(request()), { code: "persistence_failed" });
  assert.equal(calls, 2);
  assert.deepEqual(rows(), beforeRows);
  assert.deepEqual(homeStorageTree(join(directory, "feed")), beforeFiles);
  const vault = JSON.parse(readFileSync(join(directory, "feed", "secrets.json"), "utf8"));
  assert.deepEqual(Object.keys(vault.entries), ["system:feed:evidence-content-key:v1"], "no alternate control key is generated");
  secrets.put(controlRef, key);
  assert.deepEqual((await runtime.intelligenceCollect.executeExact(input)).materials, original.materials);
  assert.equal(calls, 2, "restoring the original key makes the existing ledger readable again");
});
