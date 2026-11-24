// BL-1065 (user 2026-11-19): source bodies stay encrypted under the Home's one content key. While that key is lost and its
// directory still holds a body, saving pauses with its own reason and no replacement key is made; only when the directory is
// empty does the first save create the key. Every case runs in its own isolated Home.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { SOURCE_PULL_EVIDENCE_KEY_MISSING } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createEvidenceContentStore, createLazyFileSecretStore, type SecretStore } from "@molis-ai/molis-work-storage";
import { createLocalFeedSourceService, listTestFeedSourceCatalog } from "./fixtures/feed-library.js";
import { homeStorageTree } from "./fixtures/home-storage-files.js";
import { createTestSourcePull } from "./fixtures/source-pull.js";

const KEY_REF = "system:feed:evidence-content-key:v1";
const KEY_MISSING = { code: "storage.evidence_content.key_unavailable" };

function isolatedHome(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-bl1065-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const home = join(directory, "home"), secrets = createLazyFileSecretStore(home);
  const feed = () => createEvidenceContentStore({ secretStore: secrets, rootDirectory: join(home, "security", "evidence") });
  const loseKey = () => { assert.equal(secrets.deleteIfPresent(KEY_REF), true); };
  return { home, secrets, feed, loseKey, key: () => secrets.get(KEY_REF) };
}

test("S-12 BL-1065: a lost evidence key with old bodies pauses new saves without a replacement key", async t => {
  await t.test("old bodies, key lost", t => {
    const h = isolatedHome(t);
    const old = h.feed().write("# 动态旧正文\n\n丢钥之前保存的动态。");
    h.loseKey();
    const before = homeStorageTree(h.home);
    assert.equal(h.feed().sealingStatus(), "missing");
    assert.throws(() => h.feed().write("新的正文"), KEY_MISSING);
    assert.throws(() => h.feed().read(old.contentRef), KEY_MISSING, "the old body still says the key is missing, not that it is damaged");
    assert.equal(h.key(), null, "no replacement key");
    assert.deepEqual(homeStorageTree(h.home), before, "old files kept, nothing new written");
  });

  await t.test("empty: the first save creates the key", t => {
    const h = isolatedHome(t);
    assert.equal(h.feed().sealingStatus(), "creatable");
    const first = h.feed().write("首次保存的正文");
    assert.ok(h.key(), "the first save made the key");
    assert.equal(h.feed().sealingStatus(), "ready");
    assert.equal(h.feed().read(first.contentRef), "首次保存的正文");
  });

  await t.test("restoring the original key resumes saving and opens the old bodies", t => {
    const h = isolatedHome(t);
    const old = h.feed().write("动态旧正文"), original = h.key()!;
    h.loseKey();
    assert.throws(() => h.feed().write("新的正文"), KEY_MISSING);
    h.secrets.put(KEY_REF, original);
    assert.equal(h.feed().read(old.contentRef), "动态旧正文");
    assert.equal(h.feed().read(h.feed().write("新的正文").contentRef), "新的正文");
  });
});

function feedSource(t: TestContext, home: string, secrets: SecretStore, fetch: (input: string | URL) => Promise<Response>) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-bl1065-feed-"));
  const databasePath = join(directory, "project.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  return createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, db => createTestSourcePull({ db, home, secretStore: secrets, fetch }));
}

test("BL-1065: Feed sync with a lost key and old bodies pauses before fetching, says why and does not blame the source", async t => {
  const h = isolatedHome(t);
  h.feed().write("动态旧正文");
  h.loseKey();
  const before = homeStorageTree(h.home);
  const fetched: string[] = [];
  const service = feedSource(t, h.home, h.secrets, async input => { fetched.push(String(input)); return new Response("", { status: 503 }); });
  const source = service.register({ kind: "custom_rss", feed_url: "https://example.com/bl1065.xml" }).source;
  for (const attempt of [1, 2, 3]) {
    await assert.rejects(service.sync(source.source_id, { idempotencyKey: `bl1065-feed-000${attempt}` }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "feed.source_sync_interrupted");
      assert.equal(error.message, "同步已暂停：保存正文的钥匙找不到了。已有内容原样保留；找回原钥匙并重启后再同步。");
      return true;
    });
  }
  const saved = service.feed.sources.get(DEMO_PROJECT_ID, source.source_id);
  assert.equal(saved.last_error_code, SOURCE_PULL_EVIDENCE_KEY_MISSING);
  assert.equal(saved.status, "active", "a lost key is not the source's failure");
  assert.deepEqual(service.feed.listInboxEntries(DEMO_PROJECT_ID).filter(entry => entry.subject_type === "source_fault"), [],
    "three paused syncs raise no fault asking to fix or retry the source");
  assert.deepEqual(fetched, [], "nothing fetched");
  assert.equal(h.key(), null);
  assert.deepEqual(homeStorageTree(h.home), before);
});

test("P1-F4: a corrupted evidence key reports missing and is never overwritten; a key lost mid-pull maps to the source-pull reason", async t => {
  await t.test("corrupted key (not 32 bytes) with zero blobs reports missing and never overwrites", st => {
    const h = isolatedHome(st);
    assert.equal(h.secrets.createIfAbsent(KEY_REF, "not-32-bytes"), true);
    assert.equal(h.feed().sealingStatus(), "missing");
    assert.throws(() => h.feed().write("should-not-overwrite"), KEY_MISSING);
    assert.equal(h.key(), "not-32-bytes", "corrupted key entry is preserved, never overwritten");
  });

  await t.test("mid-pull key loss in SourcePullPort maps storage.evidence_content.key_unavailable to SOURCE_PULL_EVIDENCE_KEY_MISSING", async st => {
    const h = isolatedHome(st);
    h.feed().write("initial-body-creates-valid-key");
    const service = feedSource(st, h.home, h.secrets, async () => {
      // Key disappears while the network fetch is in flight, before body write.
      h.secrets.deleteIfPresent(KEY_REF);
      return new Response(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>Mid</title><item><title>One</title><link>https://example.com/1</link><description>Body text for mid-pull key loss</description></item></channel></rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );
    });
    const source = service.register({ kind: "rss", definition_id: listTestFeedSourceCatalog()[0]!.id }).source;
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "p1f4-mid-pull-0001" }),
      (error: Error & { code?: string }) => error.code === "feed.source_sync_interrupted",
    );
    assert.equal(service.feed.sources.get(DEMO_PROJECT_ID, source.source_id).last_error_code, SOURCE_PULL_EVIDENCE_KEY_MISSING);
  });
});
