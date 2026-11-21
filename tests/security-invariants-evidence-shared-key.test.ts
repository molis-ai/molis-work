// BL-1065 (user 2026-11-19): Feed and research bodies stay encrypted and one Home shares one content key. While that key is lost
// and any directory it seals still holds a body, saving pauses with its own reason and no replacement key is made; only when every
// such directory is empty does the first save create the key. Every case runs in its own isolated Home.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { SOURCE_PULL_EVIDENCE_KEY_MISSING } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
import { createAlchemistSearchPort, DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { createEvidenceContentStore, createLazyFileSecretStore, RESEARCH_EVIDENCE_DIRECTORY, type SecretStore } from "@molis-ai/molis-work-storage";
import { holdSearchNetwork } from "./fixtures/alchemist-search-network.js";
import { createLocalFeedSourceService, listTestFeedSourceCatalog } from "./fixtures/feed-library.js";
import { homeStorageTree } from "./fixtures/home-storage-files.js";
import { createTestSourcePull } from "./fixtures/source-pull.js";

const KEY_REF = "system:feed:evidence-content-key:v1";
const KEY_MISSING = { code: "storage.evidence_content.key_unavailable" };

function isolatedHome(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-bl1065-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const home = join(directory, "home"), secrets = createLazyFileSecretStore(home);
  const feedRoot = join(home, "feed", "evidence");
  // The research root is where the Host puts it: the project's Alchemist directory (`alchemist-paths.ts`) plus Storage's name.
  const researchRoot = (project: string) => join(home, "alchemist", "projects", project, RESEARCH_EVIDENCE_DIRECTORY);
  const feed = () => createEvidenceContentStore({ secretStore: secrets, rootDirectory: feedRoot });
  const research = (project = "project-a") => createEvidenceContentStore({ secretStore: secrets, rootDirectory: researchRoot(project) });
  const loseKey = () => { assert.equal(secrets.deleteIfPresent(KEY_REF), true); };
  return { home, secrets, feed, research, loseKey, key: () => secrets.get(KEY_REF) };
}

test("S-12 BL-1065: a lost evidence key with bodies in any directory it seals pauses new saves without a replacement key", async t => {
  await t.test("Feed has old bodies, research is empty", t => {
    const h = isolatedHome(t);
    const old = h.feed().write("# 动态旧正文\n\n丢钥之前保存的动态。");
    mkdirSync(join(h.home, "alchemist", "projects", "project-b"), { recursive: true }); // an Alchemist project with no research bodies yet
    h.loseKey();
    const before = homeStorageTree(h.home);
    for (const store of [h.research(), h.research("project-b"), h.feed()]) {
      assert.equal(store.sealingStatus(), "missing");
      assert.throws(() => store.write("新的正文"), KEY_MISSING);
    }
    assert.throws(() => h.feed().read(old.contentRef), KEY_MISSING, "the old body still says the key is missing, not that it is damaged");
    assert.equal(h.key(), null, "no replacement key");
    assert.deepEqual(homeStorageTree(h.home), before, "old files kept, nothing new written");
  });

  await t.test("research has old bodies, Feed is empty", t => {
    const h = isolatedHome(t);
    const old = h.research().write("# 研究旧正文\n\n丢钥之前保存的研究资料。");
    h.loseKey();
    const before = homeStorageTree(h.home);
    for (const store of [h.feed(), h.research("project-new"), h.research()]) {
      assert.equal(store.sealingStatus(), "missing");
      assert.throws(() => store.write("新的正文"), KEY_MISSING);
    }
    assert.throws(() => h.research().read(old.contentRef), KEY_MISSING);
    assert.equal(h.key(), null, "no replacement key");
    assert.deepEqual(homeStorageTree(h.home), before, "old files kept, nothing new written");
  });

  await t.test("both empty: the first save creates the key", t => {
    const h = isolatedHome(t);
    assert.equal(h.feed().sealingStatus(), "creatable"); assert.equal(h.research().sealingStatus(), "creatable");
    const first = h.research().write("首次保存的研究正文");
    assert.ok(h.key(), "the first save made the key");
    const second = h.feed().write("之后保存的动态正文");
    assert.equal(h.research().read(first.contentRef), "首次保存的研究正文");
    assert.equal(h.feed().read(second.contentRef), "之后保存的动态正文");
  });

  await t.test("original key present: both sides read and write", t => {
    const h = isolatedHome(t);
    const feedBody = h.feed().write("动态正文"), researchBody = h.research().write("研究正文"), key = h.key();
    assert.equal(h.feed().sealingStatus(), "ready"); assert.equal(h.research().sealingStatus(), "ready");
    assert.equal(h.feed().read(feedBody.contentRef), "动态正文"); assert.equal(h.research().read(researchBody.contentRef), "研究正文");
    assert.equal(h.research().read(h.research().write("第二份研究正文").contentRef), "第二份研究正文");
    assert.equal(h.key(), key, "the same key throughout");
  });

  await t.test("restoring the original key resumes saving and opens the old bodies", t => {
    const h = isolatedHome(t);
    const old = h.feed().write("动态旧正文"), original = h.key()!;
    h.loseKey();
    assert.throws(() => h.research().write("新的研究正文"), KEY_MISSING);
    h.secrets.put(KEY_REF, original);
    assert.equal(h.feed().read(old.contentRef), "动态旧正文");
    assert.equal(h.research().read(h.research().write("新的研究正文").contentRef), "新的研究正文");
  });
});

function feedSource(t: TestContext, home: string, secrets: SecretStore) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-bl1065-feed-"));
  const databasePath = join(directory, "project.sqlite");
  seedDemoBoard(databasePath);
  const store = new LocalProjectDatabase(databasePath);
  t.after(() => { store.close(); rmSync(directory, { recursive: true, force: true }); });
  const fetched: string[] = [];
  const fetch = async (input: string | URL) => { fetched.push(String(input)); return new Response("", { status: 503 }); };
  const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, db => createTestSourcePull({ db, home, secretStore: secrets, fetch }));
  const source = service.register({ kind: "custom_rss", feed_url: "https://example.com/bl1065.xml" }).source;
  return { service, source, fetched };
}

test("BL-1065: Feed sync with a lost key and research bodies pauses before fetching, says why and does not blame the source", async t => {
  const h = isolatedHome(t);
  // The research body is saved by the real research port, so its directory is the one the Host actually uses.
  assert.equal((await search(t, h.home, h.secrets).run()).length, 1);
  h.loseKey();
  const before = homeStorageTree(h.home);
  const f = feedSource(t, h.home, h.secrets);
  for (const attempt of [1, 2, 3]) {
    await assert.rejects(f.service.sync(f.source.source_id, { idempotencyKey: `bl1065-feed-000${attempt}` }), (error: Error & { code?: string }) => {
      assert.equal(error.code, "feed.source_sync_interrupted");
      assert.equal(error.message, "同步已暂停：保存正文的钥匙找不到了。已有内容原样保留；找回原钥匙并重启后再同步。");
      return true;
    });
  }
  const source = f.service.feed.sources.get(DEMO_PROJECT_ID, f.source.source_id);
  assert.equal(source.last_error_code, SOURCE_PULL_EVIDENCE_KEY_MISSING);
  assert.equal(source.status, "active", "a lost key is not the source's failure");
  assert.deepEqual(f.service.feed.listInboxEntries(DEMO_PROJECT_ID).filter(entry => entry.subject_type === "source_fault"), [],
    "three paused syncs raise no fault asking to fix or retry the source");
  assert.deepEqual(f.fetched, [], "nothing fetched");
  assert.equal(h.key(), null);
  assert.deepEqual(homeStorageTree(h.home), before);
});

function search(t: TestContext, home: string, secrets: SecretStore) {
  const network = holdSearchNetwork(t, "dns"); network.release();
  const port = createAlchemistSearchPort({ homeDirectory: home, projectId: "project-a", secretStore: secrets });
  t.after(() => port.shutdown());
  return { network, run: () => port.search({ query: "users retain original interviews for product decisions", lens: "market_space" } as Parameters<typeof port.search>[0]) };
}

test("BL-1065: research with a lost key and Feed bodies pauses before searching and says why", async t => {
  const h = isolatedHome(t);
  h.feed().write("动态旧正文"); h.loseKey();
  const s = search(t, h.home, h.secrets);
  const before = homeStorageTree(h.home);
  await assert.rejects(s.run(), (error: Error & { code?: string }) => {
    assert.equal(error.code, "alchemist.research_evidence_key_missing");
    assert.match(error.message, /钥匙找不到了.*原样保留/u);
    return true;
  });
  assert.equal(s.network.seen.connections, 0, "no search was spent");
  assert.equal(h.key(), null);
  assert.deepEqual(homeStorageTree(h.home), before);
});

for (const keyed of [false, true]) test(`BL-1065: research ${keyed ? "with the original key reads and writes beside Feed" : "in an empty Home creates the key on its first save"}`, async t => {
  const h = isolatedHome(t);
  const feedBody = keyed ? h.feed().write("动态旧正文") : undefined, key = h.key();
  const s = search(t, h.home, h.secrets);
  const sources = await s.run();
  assert.equal(sources.length, 1);
  assert.match(sources[0]!.excerpt, /original interviews/u);
  if (keyed) assert.equal(h.key(), key, "the original key is kept");
  else assert.ok(h.key(), "the first save made the key");
  assert.ok(Object.keys(homeStorageTree(h.home)).some(path => path.includes(`/${RESEARCH_EVIDENCE_DIRECTORY}/blobs/`)), "the research body was saved");
  if (feedBody) assert.equal(h.feed().read(feedBody.contentRef), "动态旧正文");
});

test("P1-F4: corrupted evidence key reports missing (not creatable), never overwrites, maps mid-flight loss, and checks assertCurrent before sealingStatus", async t => {
  await t.test("corrupted key (not 32 bytes) with zero blobs reports missing and never overwrites", st => {
    const h = isolatedHome(st);
    assert.equal(h.secrets.createIfAbsent(KEY_REF, "not-32-bytes"), true);
    assert.equal(h.feed().sealingStatus(), "missing");
    assert.equal(h.research().sealingStatus(), "missing");
    assert.throws(() => h.feed().write("should-not-overwrite"), KEY_MISSING);
    assert.equal(h.key(), "not-32-bytes", "corrupted key entry is preserved, never overwritten");
  });

  await t.test("Alchemist search runs assertCurrent() before sealingStatus()", async st => {
    const h = isolatedHome(st);
    h.feed().write("动态旧正文");
    h.loseKey();
    const network = holdSearchNetwork(st, "dns");
    network.release();
    const port = createAlchemistSearchPort({ homeDirectory: h.home, projectId: "project-revoked", secretStore: h.secrets });
    st.after(() => port.shutdown());
    await assert.rejects(
      port.search({
        query: "users retain original interviews for product decisions",
        lens: "market_space",
        assertCurrent: () => {
          throw Object.assign(new Error("caller authority revoked"), { code: "actions.forbidden" });
        },
      } as Parameters<typeof port.search>[0]),
      (error: Error & { code?: string }) => error.code === "actions.forbidden",
    );
    assert.equal(network.seen.connections, 0);
  });

  await t.test("mid-search key loss in Alchemist maps storage.evidence_content.key_unavailable to alchemist.research_evidence_key_missing", async st => {
    const h = isolatedHome(st);
    h.feed().write("initial-body-creates-valid-key");
    const network = holdSearchNetwork(st, "dns");
    network.release();
    const port = createAlchemistSearchPort({ homeDirectory: h.home, projectId: "project-mid-search", secretStore: h.secrets });
    st.after(() => port.shutdown());
    await assert.rejects(
      port.search({
        query: "users retain original interviews for product decisions",
        lens: "market_space",
        beforeDispatch: async () => {
          // Key disappears after pre-flight sealingStatus() succeeded and right before search writes its body.
          h.secrets.deleteIfPresent(KEY_REF);
        },
      } as Parameters<typeof port.search>[0]),
      (error: Error & { code?: string }) => error.code === "alchemist.research_evidence_key_missing",
    );
  });

  await t.test("mid-pull key loss in SourcePullPort maps storage.evidence_content.key_unavailable to SOURCE_PULL_EVIDENCE_KEY_MISSING", async st => {
    const h = isolatedHome(st);
    h.feed().write("initial-body-creates-valid-key");
    const directory = mkdtempSync(join(tmpdir(), "molis-work-p1f4-midpull-"));
    const databasePath = join(directory, "project.sqlite");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    st.after(() => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    });
    const fetchMidLoss = async () => {
      // Key disappears while the network fetch is in flight, before body write.
      h.secrets.deleteIfPresent(KEY_REF);
      return new Response(
        `<?xml version="1.0"?><rss version="2.0"><channel><title>Mid</title><item><title>One</title><link>https://example.com/1</link><description>Body text for mid-pull key loss</description></item></channel></rss>`,
        { status: 200, headers: { "content-type": "application/rss+xml" } },
      );
    };
    const service = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID, db => createTestSourcePull({
      db,
      home: h.home,
      secretStore: h.secrets,
      fetch: fetchMidLoss,
    }));
    const source = service.register({ kind: "rss", definition_id: listTestFeedSourceCatalog()[0]!.id }).source;
    await assert.rejects(
      service.sync(source.source_id, { idempotencyKey: "p1f4-mid-pull-0001" }),
      (error: Error & { code?: string }) => error.code === "feed.source_sync_interrupted",
    );
    assert.equal(service.feed.sources.get(DEMO_PROJECT_ID, source.source_id).last_error_code, SOURCE_PULL_EVIDENCE_KEY_MISSING);
  });
});
