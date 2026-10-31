import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { LocalProjectDatabase, createSourcePullRuntime, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import {
  LOCAL_OPAQUE_BLOB_SCHEMA_SQL, LocalSqliteStorage, createEvidenceContentStore, createSearchOpaqueBlobStore, runWithMolisWorkHome, type SecretStore,
} from "@molis-ai/molis-work-storage";

// The stores a source's local history is given back through. Deleting the history itself was the Host's (a scan of every project of the
// Home) until FI-6 deleted it; it is the Runtime Feed's now, through the Home's reference ledger, and proven there:
// tests/feed-runtime-plugin.test.ts (RAC-518: deleting with the history gives back the bodies and the search records of its pulls and records
// it; keeping the history keeps both; FI-C-06: a release the ledger fails) and tests/feed-content-ledger.test.ts (a body another source or
// another project holds stays; the holds a failed pull left go; a ledger that cannot tell keeps every body and says so).

function memorySecrets(): SecretStore {
  const keys = new Map<string, string>();
  return {
    get: (key) => keys.get(key) ?? null, put: (key, value) => { keys.set(key, value); }, delete: (key) => { keys.delete(key); },
    createIfAbsent(key, value) { if (keys.has(key)) return false; keys.set(key, value); return true; }, deleteIfPresent: (key) => keys.delete(key),
    backend: () => ({ kind: "aes-gcm-file", label: "explicit test memory", masterKeyExternal: false, formatVersion: 1 }),
  };
}

/** The Home's evidence store, as the Feed runtime and the deletion see it (the test runner gives each run its own Home). */
const homeStore = () => createEvidenceContentStore();

/** One project database and one Home per test, so bodies left by a test never count in another. */
async function withProject(prefix: string, run: (store: LocalProjectDatabase) => void | Promise<void>): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  try {
    await runWithMolisWorkHome(join(directory, "home"), async () => {
      const databasePath = join(directory, "molis-work.sqlite");
      seedDemoBoard(databasePath);
      const store = new LocalProjectDatabase(databasePath);
      try { await run(store); } finally { store.close(); }
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("the evidence store deletes only the unreferenced bodies it is asked about", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-evidence-collect-"));
  try {
    const store = createEvidenceContentStore({ secretStore: memorySecrets(), rootDirectory: directory });
    const kept = store.write("# Kept\n\nAnother source still holds this.").contentRef;
    const gone = store.write("# Gone\n\nNothing holds this.").contentRef;
    const untouched = store.write("# Untouched\n\nNot a candidate.").contentRef;
    const result = store.collect({ candidates: [kept, gone, gone, "research:pkg", "not a reference"], isReferenced: (contentRef) => contentRef === kept });
    assert.deepEqual(result, { deleted: [gone], kept: [kept] });
    assert.equal(store.has(gone), false);
    assert.throws(() => store.read(gone));
    assert.match(store.read(kept), /Another source/);
    assert.match(store.read(untouched), /Not a candidate/);
    assert.equal(store.delete(gone), false, "an absent body is not an error");
    assert.equal(store.delete(untouched), true);
    assert.equal(store.has(untouched), false);
    // The store stays usable and writes the same body again.
    assert.equal(store.write("# Gone\n\nNothing holds this.").contentRef, gone);
    assert.match(store.read(gone), /Nothing holds this/);
    assert.throws(() => store.delete("research:pkg"), /reference rejected/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the search operation store forgets only the entries of its namespace that the caller names", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-sel-collect-"));
  try {
    const storage = new LocalSqliteStorage(join(directory, "search.sqlite"));
    try {
      storage.db.exec(LOCAL_OPAQUE_BLOB_SCHEMA_SQL);
      const put = storage.db.prepare("INSERT INTO feed_runtime_blobs (namespace, key, opaque, cas_token) VALUES (?, ?, 'sealed', 'cas')");
      for (const [namespace, key] of [["a", "k1"], ["a", "k2"], ["a", "k3"], ["b", "k1"]]) put.run(namespace, key);
      const blobs = createSearchOpaqueBlobStore(storage.db);
      assert.equal(blobs.collect({ namespace: "a", discard: (key) => key !== "k2" }), 2);
      assert.deepEqual(storage.db.prepare("SELECT namespace, key FROM feed_runtime_blobs ORDER BY namespace, key").all(), [
        { namespace: "a", key: "k2" }, { namespace: "b", key: "k1" },
      ]);
      assert.equal(blobs.collect({ namespace: "missing", discard: () => true }), 0);
    } finally {
      storage.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a Feed source runtime reports the bodies it wrote, whether or not the pull ever reaches a result", async () => {
  await withProject("molis-work-feed-history-written-", async (store) => {
    const runtime = createSourcePullRuntime({ db: store.db });
    try {
      assert.deepEqual(runtime.writtenContentRefs?.(), []);
      const first = runtime.content.write("# First\n\nWritten by the pull.").contentRef;
      const again = runtime.content.write("# First\n\nWritten by the pull.").contentRef;
      const second = runtime.content.write("# Second\n\nWritten by the pull.").contentRef;
      assert.equal(again, first);
      assert.deepEqual(runtime.writtenContentRefs?.().sort(), [first, second].sort());
      assert.equal(homeStore().has(first), true, "the wrapper writes through to the Home's store");
    } finally {
      await runtime.shutdown();
    }
  });
});
