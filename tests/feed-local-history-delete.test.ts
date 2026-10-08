import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createCompletedIntentResultFixtureV1 } from "@adeptify/intelligence-client/testing";

import {
  DEMO_PROJECT_ID, LocalProjectDatabase, createFeedSourceRuntime, createLocalFeedApplication, createLocalFeedSourceService, listFeedSourceCatalog,
  seedDemoBoard, type FeedSourceRuntime, type IntelligenceCollectRequest, type IntelligenceCollectResult,
} from "@molis-ai/molis-work-app-local-host";
import {
  LOCAL_OPAQUE_BLOB_SCHEMA_SQL, LocalSqliteStorage, createEvidenceContentStore, createSearchOpaqueBlobStore, resolveFeedSecurityDirectory,
  resolveMolisWorkHome, runWithMolisWorkHome, type SecretStore,
} from "@molis-ai/molis-work-storage";

const ref = (markdown: string) => `molis-work-feed/sha256/${createHash("sha256").update(markdown).digest("hex")}`;

function memorySecrets(): SecretStore {
  const keys = new Map<string, string>();
  return {
    get: (key) => keys.get(key) ?? null, put: (key, value) => { keys.set(key, value); }, delete: (key) => { keys.delete(key); },
    createIfAbsent(key, value) { if (keys.has(key)) return false; keys.set(key, value); return true; }, deleteIfPresent: (key) => keys.delete(key),
    backend: () => ({ kind: "aes-gcm-file", label: "explicit test memory", masterKeyExternal: false, formatVersion: 2 }),
  };
}

/** The Home's evidence store, as the Feed runtime and the deletion see it (the test runner gives each run its own Home). */
const homeStore = () => createEvidenceContentStore();
const bodyFiles = () => {
  const blobs = join(resolveFeedSecurityDirectory(), "evidence", "blobs");
  return existsSync(blobs) ? readdirSync(blobs, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".blob")).sort() : [];
};

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

const rss = (title: string, entries: Array<{ id: string; title: string; text: string }>) => `<?xml version="1.0"?><rss version="2.0"><channel>
  <title>${title}</title><link>https://example.com/</link>${entries.map((entry) => `
  <item><guid>https://example.com/posts/${entry.id}</guid><title>${entry.title}</title><link>https://example.com/posts/${entry.id}</link>
  <description>${entry.text}</description><pubDate>Sat, 30 Aug 2026 08:00:00 GMT</pubDate></item>`).join("")}
</channel></rss>`;

const operationKeys = (store: LocalProjectDatabase) => (store.db.prepare("SELECT key FROM feed_runtime_blobs WHERE namespace LIKE '%/data/operation/v1' ORDER BY key").all() as Array<{ key: string }>).map((row) => row.key);
/** SEL's sealed run of a pull lives at `intent-run/<scope>/<sha256 of the operation id>`. */
const operationKeysOf = (store: LocalProjectDatabase, operationIds: string[]) => operationKeys(store)
  .filter((key) => operationIds.some((id) => key.endsWith(`/${createHash("sha256").update(id, "utf8").digest("hex")}`)));

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

test("deleting a source with its local history removes its cached bodies and search records, and keeps what another source still holds", { timeout: 60_000 }, async () => {
  await withProject("molis-work-feed-history-shared-", async (store) => {
    const feeds = new Map<string, string>();
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, (db, source) => createFeedSourceRuntime({
      db, sourceCursor: source?.cursor,
      async fetch(input) {
        const body = feeds.get(String(input));
        return body ? new Response(body, { status: 200, headers: { "content-type": "application/rss+xml" } }) : new Response("missing", { status: 404 });
      },
    }));
    const shared = { id: "shared", title: "Shared article", text: "Both feeds carry this article." };
    const [catalogA, catalogB] = listFeedSourceCatalog();
    const a = service.register({ kind: "rss", definition_id: catalogA!.id }).source;
    const b = service.register({ kind: "rss", definition_id: catalogB!.id }).source;
    feeds.set(catalogA!.feed_url, rss("Feed A", [shared, { id: "only-a", title: "Only in A", text: "Just A." }]));
    feeds.set(catalogB!.feed_url, rss("Feed B", [shared, { id: "only-b", title: "Only in B", text: "Just B." }]));
    const syncedA = await service.sync(a.source_id, { idempotencyKey: "history-delete-sync-a" });
    const syncedB = await service.sync(b.source_id, { idempotencyKey: "history-delete-sync-b" });
    assert.equal(syncedA.created, 2);
    assert.equal(syncedB.created, 2);

    const refsOf = (sourceId: string) => Object.fromEntries(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.filter((item) => item.source_id === sourceId)
      .map((item) => [item.title, item.materials[0]!.content_ref!]));
    const refsA = refsOf(a.source_id), refsB = refsOf(b.source_id);
    assert.equal(refsA["Shared article"], refsB["Shared article"], "the same article is one content-addressed body for both sources");
    assert.notEqual(refsA["Only in A"], refsB["Only in B"]);
    const sharedRef = refsA["Shared article"]!, onlyA = refsA["Only in A"]!, onlyB = refsB["Only in B"]!;
    const home = homeStore();
    for (const contentRef of [sharedRef, onlyA, onlyB]) assert.equal(home.has(contentRef), true);
    assert.equal(bodyFiles().length, 3);
    const runA = syncedA.run.operation_id, runB = syncedB.run.operation_id;
    assert.equal(operationKeysOf(store, [runA]).length, 1, "SEL keeps one sealed run per pull");
    assert.equal(operationKeysOf(store, [runB]).length, 1);
    assert.equal(operationKeys(store).length, 2);

    // A's history goes; the article B also carries stays readable.
    service.delete(a.source_id, "delete_local_history");
    assert.equal(home.has(onlyA), false, "a body only the deleted source held is deleted");
    assert.equal(home.has(sharedRef), true, "a body another source still holds survives");
    assert.equal(home.has(onlyB), true);
    assert.deepEqual(operationKeysOf(store, [runA]), [], "the search records of the deleted source's pulls are deleted");
    assert.equal(operationKeysOf(store, [runB]).length, 1, "another source's search records are untouched");
    assert.equal(operationKeys(store).length, 1, "and nothing else of the deleted source's pulls is left in the operation store");
    assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.filter((item) => item.source_id === a.source_id).length, 0);
    const released = service.feed.snapshot(DEMO_PROJECT_ID).runs.length;
    assert.equal(released, 1);
    const event = store.db.prepare("SELECT payload_json FROM events WHERE type = 'feed_source.history_released' AND object_id = ?").get(a.source_id) as { payload_json: string };
    assert.deepEqual(JSON.parse(event.payload_json), { bodies_deleted: 1, bodies_kept: 1, records_deleted: 1, complete: true });
    assert.match(home.read(sharedRef), /Both feeds carry this article/);

    // Retaining history deletes nothing; then the last holder goes and takes the shared body with it.
    service.delete(b.source_id, "delete_local_history");
    assert.deepEqual(bodyFiles(), [], "no cached body is left once nothing holds it");
    assert.deepEqual(operationKeys(store), [], "and no search record");
  });
});

test("a Feed source runtime reports the bodies it wrote, whether or not the pull ever reaches a result", async () => {
  await withProject("molis-work-feed-history-written-", async (store) => {
    const runtime = createFeedSourceRuntime({ db: store.db });
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

test("retaining a source's history keeps its bodies and search records", { timeout: 60_000 }, async () => {
  await withProject("molis-work-feed-history-retain-", async (store) => {
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, (db, source) => createFeedSourceRuntime({
      db, sourceCursor: source?.cursor,
      async fetch() { return new Response(rss("Feed", [{ id: "one", title: "One", text: "Kept body." }]), { status: 200, headers: { "content-type": "application/rss+xml" } }); },
    }));
    const source = service.register({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }).source;
    const synced = await service.sync(source.source_id, { idempotencyKey: "history-retain-sync" });
    const bodies = bodyFiles(), records = operationKeysOf(store, [synced.run.operation_id]);
    assert.equal(bodies.length, 1);
    assert.equal(records.length, 1);
    service.delete(source.source_id, "retain_history");
    assert.deepEqual(bodyFiles(), bodies);
    assert.deepEqual(operationKeysOf(store, [synced.run.operation_id]), records);
    assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.length, 1);
  });
});

/** A runtime that writes real bodies into the Home's store and answers with `outcome`, so the run itself can be inspected. */
function bodyWritingRuntime(options: { bodies: string[]; outcome: "failed" | "partial" | "throws" }): () => FeedSourceRuntime {
  return () => {
    const content = createEvidenceContentStore();
    const written: string[] = [];
    return {
      intelligenceCollect: {
        async executeExact(request: IntelligenceCollectRequest): Promise<IntelligenceCollectResult> {
          for (const markdown of options.bodies) written.push(content.write(markdown).contentRef);
          if (options.outcome === "throws") throw Object.assign(new Error("lost the lease after the pull"), { code: "feed_unavailable" });
          const base = createCompletedIntentResultFixtureV1(request);
          return {
            ...base, outcome: options.outcome, requirementMet: false,
            materials: written.map((contentRef, index) => ({
              ...base.materials[0], id: `material:${index}`, candidateId: `candidate:${index}`, contentRef, title: `Body ${index}`,
              canonicalUrl: `https://example.com/${index}`,
            })),
          } as unknown as IntelligenceCollectResult;
        },
        async shutdown() {},
      },
      content, writtenContentRefs: () => written, async shutdown() {},
    } as unknown as FeedSourceRuntime;
  };
}

for (const outcome of ["partial", "throws"] as const) {
  test(`bodies a pull wrote but no Item kept (${outcome === "throws" ? "interrupted pull" : "unusable result"}) go with the source's history`, { timeout: 60_000 }, async () => {
    await withProject(`molis-work-feed-history-${outcome}-`, async (store) => {
      const bodies = [`# ${outcome} one\n\nCached but never used.`, `# ${outcome} two\n\nCached but never used.`];
      const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, bodyWritingRuntime({ bodies, outcome }));
      const source = service.register({ kind: "custom_rss", feed_url: `https://feeds.example.com/${outcome}.xml` }).source;
      await service.sync(source.source_id, { idempotencyKey: `history-${outcome}-sync` }).catch(() => undefined);
      assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).feed_items.length, 0, "no Item references these bodies");
      assert.equal(bodyFiles().length, 2);
      service.delete(source.source_id, "delete_local_history");
      assert.deepEqual(bodyFiles(), [], "the run receipt told the deletion which bodies the pull left behind");
    });
  });
}

/** Another project of the same Home, whose Feed holds a material that points at `contentRef`. */
function otherProject(projectId: string, contentRef: string): () => void {
  const databasePath = join(resolveMolisWorkHome(), "projects", projectId, "molis-work.db");
  mkdirSync(dirname(databasePath), { recursive: true });
  seedDemoBoard(databasePath);
  const other = new LocalProjectDatabase(databasePath);
  const feed = createLocalFeedApplication(other.db);
  const now = new Date().toISOString();
  const source = feed.upsertSource({
    project_id: DEMO_PROJECT_ID, source_id: "other-source", kind: "workflow", definition_id: null, sync_kind: "manual", name: "Other", description: "",
    status: "active", enabled: true, origin: "molis_work", config: {}, schedule: { mode: "manual" }, credential_ref: null,
    account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null, imported_at: now, updated_at: now, item_count: 0, cursor: null,
  } as never);
  feed.ingestItem({
    source, externalId: "o1", title: "Held elsewhere", summary: "s", occurredAt: now, attention: false,
    material: { material_id: "m-other", canonical_url: "https://example.com/o", title: "Held elsewhere", source_name: "Other", published_at: null, preview: "p",
      content_hash: "sha256:x", content_ref: contentRef, content_available: true, content_type: "text/markdown", character_count: 1, captured_at: now, provenance: {}, selected_for_context: false },
  });
  other.close();
  return () => rmSync(dirname(databasePath), { recursive: true, force: true });
}

test("a body that an Item of another project in the Home still holds is not deleted", { timeout: 60_000 }, async () => {
  await withProject("molis-work-feed-history-projects-", async (store) => {
    const markdown = "# Shared across projects\n\nBoth projects keep this article.";
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, bodyWritingRuntime({ bodies: [markdown], outcome: "partial" }));
    const source = service.register({ kind: "custom_rss", feed_url: "https://feeds.example.com/cross.xml" }).source;
    await service.sync(source.source_id, { idempotencyKey: "history-cross-sync" });
    const forget = otherProject("project-two", ref(markdown));
    try {
      service.delete(source.source_id, "delete_local_history");
      assert.equal(homeStore().has(ref(markdown)), true, "the other project's Item still shows it");
    } finally {
      forget();
    }
  });
});

test("when a project of the Home cannot be read nothing can be proven unreferenced, so the bodies stay and the event says so", { timeout: 60_000 }, async () => {
  await withProject("molis-work-feed-history-unreadable-", async (store) => {
    const markdown = "# Maybe held\n\nA damaged project database might refer to this.";
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, bodyWritingRuntime({ bodies: [markdown], outcome: "partial" }));
    const source = service.register({ kind: "custom_rss", feed_url: "https://feeds.example.com/unreadable.xml" }).source;
    await service.sync(source.source_id, { idempotencyKey: "history-unreadable-sync" });
    const damaged = join(resolveMolisWorkHome(), "projects", "damaged", "molis-work.db");
    mkdirSync(dirname(damaged), { recursive: true });
    writeFileSync(damaged, "this is not a database");
    try {
      service.delete(source.source_id, "delete_local_history");
      assert.equal(homeStore().has(ref(markdown)), true);
      const event = store.db.prepare("SELECT payload_json FROM events WHERE type = 'feed_source.history_released' AND object_id = ?").get(source.source_id) as { payload_json: string };
      assert.equal(JSON.parse(event.payload_json).complete, false);
      assert.equal(JSON.parse(event.payload_json).bodies_deleted, 0);
    } finally {
      rmSync(dirname(damaged), { recursive: true, force: true });
    }
    // The source's rows are gone either way; only the shared files wait for a deletion that can count every holder.
    assert.equal(service.feed.snapshot(DEMO_PROJECT_ID).sources.some((candidate) => candidate.source_id === source.source_id), false);
    rmSync(join(resolveFeedSecurityDirectory(), "evidence"), { recursive: true, force: true });
  });
});
