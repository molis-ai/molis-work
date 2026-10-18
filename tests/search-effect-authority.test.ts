import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSearchOpaqueBlobStore, createSearchSecretStore, LocalSqliteStorage, LOCAL_OPAQUE_BLOB_SCHEMA_SQL } from "@molis-ai/molis-work-storage";
import { searchMemorySecrets } from "./fixtures/alchemist-search-network.js";

test("W5-01-ALC-RES03: each opaque storage mutation checks current authority at its SQL effect", async t => {
  const home = mkdtempSync(join(tmpdir(), "search-effects-")), storage = new LocalSqliteStorage(join(home, "search.sqlite"));
  t.after(() => { storage.close(); rmSync(home, { recursive: true, force: true }); });
  storage.db.exec(LOCAL_OPAQUE_BLOB_SCHEMA_SQL);
  let authorized = true;
  const store = createSearchOpaqueBlobStore(storage.db, () => { if (!authorized) throw new Error("revoked"); });
  const key = { namespace: "test", key: "operation" };
  const created = await store.createIfAbsent({ ...key, opaque: "original" }); assert.ok(created.created);
  const before = storage.db.prepare("SELECT * FROM feed_runtime_blobs").all();
  authorized = false;
  const expectedCasToken = created.casToken;
  await assert.rejects(store.createIfAbsent({ ...key, key: "new", opaque: "new" }), /revoked/);
  await assert.rejects(store.compareAndSet({ ...key, opaque: "changed", expectedCasToken }), /revoked/);
  await assert.rejects(store.compareAndSetBefore({ ...key, opaque: "changed", expectedCasToken, deadlineUnixMs: Date.now() + 60_000 }), /revoked/);
  await assert.rejects(store.delete({ ...key, expectedCasToken }), /revoked/);
  assert.throws(() => store.collect({ namespace: key.namespace, discard: () => true }), /revoked/);
  assert.deepEqual(storage.db.prepare("SELECT * FROM feed_runtime_blobs").all(), before);
  assert.equal((await store.read(key))?.opaque, "original", "read-only inspection remains available");
  authorized = true;
  // A caller-supplied predicate can revoke synchronously; check after it, immediately before DELETE.
  assert.throws(() => store.collect({ namespace: key.namespace, discard: () => { authorized = false; return true; } }), /revoked/);
  assert.deepEqual(storage.db.prepare("SELECT * FROM feed_runtime_blobs").all(), before);
});

test("W5-01-ALC-RES03: search bootstrap secrets reject create and delete after authority is withdrawn", async () => {
  let authorized = true;
  const backend = searchMemorySecrets(), secrets = createSearchSecretStore(backend, () => { if (!authorized) throw new Error("revoked"); });
  assert.equal(await secrets.createIfAbsent("test-key", "old-value"), true);
  authorized = false;
  await assert.rejects(secrets.createIfAbsent("new-key", "new-value"), /revoked/);
  await assert.rejects(secrets.delete("test-key"), /revoked/);
  assert.equal(backend.get("test-key"), "old-value"); assert.equal(backend.get("new-key"), null);
});
