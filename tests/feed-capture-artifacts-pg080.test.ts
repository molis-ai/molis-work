import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPluginArtifactOperations } from "@molis-ai/molis-work-module-artifacts";
import {
  createLocalFeedApplication, createLocalFeedSourceService, DEMO_PROJECT_ID, LocalProjectDatabase, openProjectVersionStores, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { FEED_CAPTURE_ARTIFACT_TYPE_ID, FEED_CAPTURE_SCHEMA_VERSION, feedCaptureArtifactId, feedManifest } from "@molis-ai/molis-work-plugin-feed";

// PG-080 (ac-artifacts): Feed writes its captures through the platform's artifact client, bound to Feed's own Manifest, instead of the
// Host calling `registerVersion` for it. The rehearsal of the maintenance that moves lines written before this change is
// `tests/fixtures/feed-producer-maintenance.sql` (R-B9). RAC-670 the producer, RAC-671 the Manifest holds the write (V-04),
// RAC-672 the maintenance, RAC-673 no direct write is left.

const OLD_PRODUCER = { plugin_id: "io.molis.work.native.feed", plugin_version: "0.0.0", binding_signature: "native:feed" } as const;
const maintenance = readFileSync(new URL("./fixtures/feed-producer-maintenance.sql", import.meta.url), "utf8");

function harness(writeLikeBefore = false) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-pg080-"));
  const path = join(directory, "project.sqlite");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  const app = openProjectVersionStores(store);
  // What the Host did before: register the version itself under the producer id it made up for Feed.
  const feed = createLocalFeedApplication(store.db, writeLikeBefore ? { artifacts: {
    publish: (projectId, input) => app.artifacts.commands.registerVersion({ ...input, project_id: projectId, actor_id: LOCAL_PERSON_ACTOR_ID, producer: OLD_PRODUCER }),
    head: (projectId, artifactId) => app.artifacts.query.latestArtifactVersion(projectId, artifactId),
  } } : {});
  const source = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID).register({ kind: "web_query", query: "launch coverage" }).source;
  return { directory, store, app, feed, source };
}
type Harness = ReturnType<typeof harness>;
const close = (data: Harness) => { data.store.close(); rmSync(data.directory, { recursive: true, force: true }); };
const ingest = (data: Harness, feed: Harness["feed"], revision: number) => feed.ingestItem({
  source: data.source, externalId: "launch-1", signal: { signal_id: "sig-launch", revision }, title: `Launch notes r${revision}`, summary: `Payload ${revision}`,
  occurredAt: "2026-09-15T00:00:00.000Z", attention: false,
});

test("RAC-670: a Feed capture is written under the producer of Feed's Manifest, not one the Host made up", () => {
  const data = harness();
  try {
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, { name: "发布相关", match: { contains: "launch" } });
    const item = ingest(data, data.feed, 1).item;
    const capture = data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, feedCaptureArtifactId(item.item_id, rule.rule_id));
    assert.ok(capture);
    assert.deepEqual([capture.producer_plugin_id, capture.producer_plugin_version, capture.producer_binding_signature],
      [feedManifest.plugin_id, feedManifest.version, feedManifest.publisher.signature]);
    assert.equal(capture.owner_actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal(capture.scope, "personal");
  } finally { close(data); }
});

test("RAC-671: V-04 the write is held to the Manifest: a type Feed does not declare is refused, a declared one is written", () => {
  const data = harness();
  try {
    const publish = (artifactType: string) => createPluginArtifactOperations({ api: data.app.artifacts, process: data.app.processItems, manifest: feedManifest,
      project_id: DEMO_PROJECT_ID, actor_id: LOCAL_PERSON_ACTOR_ID, authorize: () => {}, assertCallerCurrent: () => {}, assertInput: assertActionInput }).client.publish({
      artifact_id: `v04-${artifactType}`, version: 1, artifact_type_id: artifactType, schema_version: FEED_CAPTURE_SCHEMA_VERSION, content: { kind: "inline", payload: { ok: true } },
      origin: { kind: "pinned", subject: { kind: "feed_item", id: "item-1" }, revision: "r1" }, title: "t", media_type: "application/json" });
    assert.throws(() => publish("feed.not_declared"), (error: unknown) => (error as { code?: string }).code === "artifacts.plugin_incompatible");
    assert.equal(data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, "v04-feed.not_declared"), null, "nothing was written");
    assert.equal(publish(FEED_CAPTURE_ARTIFACT_TYPE_ID).artifact.producer_plugin_id, feedManifest.plugin_id);
    assert.ok(feedManifest.permissions.some(item => item.permission === "artifact:write") && feedManifest.permissions.some(item => item.permission === "artifact:read"),
      "Feed asks for the permissions the client holds it to");
  } finally { close(data); }
});

test("RAC-672: a line written under the made-up producer is refused by the new code until the maintenance rewrites it; then it continues; running it again changes nothing", () => {
  const data = harness(true);
  try {
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, { name: "发布相关", match: { contains: "launch" } });
    const item = ingest(data, data.feed, 1).item, artifactId = feedCaptureArtifactId(item.item_id, rule.rule_id);
    const before = data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, artifactId);
    assert.deepEqual([before?.version, before?.producer_plugin_id, before?.producer_binding_signature], [1, OLD_PRODUCER.plugin_id, OLD_PRODUCER.binding_signature]);

    // The current code, on the same library: the old line is not Feed's by its Manifest, so it is refused and nothing is written.
    const current = createLocalFeedApplication(data.store.db);
    ingest(data, current, 2);
    assert.equal(data.app.artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, artifactId).length, 1, "no read fallback, no write");
    const failure = current.listInboxEntries(DEMO_PROJECT_ID).find(entry => entry.reason === "artifact_out_failed");
    assert.deepEqual((failure?.detail as { error_codes?: string[] } | undefined)?.error_codes, ["artifacts.plugin_denied"]);

    data.store.db.exec(maintenance);
    const moved = data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, artifactId);
    assert.deepEqual([moved?.version, moved?.producer_plugin_id, moved?.producer_binding_signature], [1, feedManifest.plugin_id, feedManifest.publisher.signature]);
    assert.deepEqual(moved?.payload, before?.payload, "only the producer changed");
    const lines = () => data.store.db.prepare("SELECT * FROM library_artifacts ORDER BY artifact_id").all();
    const linesBefore = lines();
    data.store.db.exec(maintenance);
    assert.deepEqual(lines(), linesBefore, "a second run has nothing to change");

    ingest(data, current, 3);
    assert.equal(data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, artifactId)?.version, 2, "the line continues under Feed's producer");
  } finally { close(data); }
});

test("RAC-672: the maintenance stops and changes nothing when a line names only half of the old producer", () => {
  const data = harness(true);
  try {
    data.feed.createOutRule(DEMO_PROJECT_ID, { name: "发布相关", match: { contains: "launch" } });
    ingest(data, data.feed, 1);
    const rows = () => data.store.db.prepare("SELECT artifact_id, producer_plugin_id, producer_binding_signature FROM library_artifacts ORDER BY artifact_id").all();
    data.store.db.prepare("UPDATE library_artifacts SET producer_binding_signature = 'someone-else'").run();
    const original = rows();
    assert.throws(() => data.store.db.exec(maintenance));
    if (data.store.db.inTransaction) data.store.db.exec("ROLLBACK");
    assert.deepEqual(rows(), original);
  } finally { close(data); }
});

test("RAC-673: the Host writes no 成果 for Feed itself, and the made-up producer is gone from the source", () => {
  const root = resolve(import.meta.dirname, "..");
  const tracked = execFileSync("git", ["ls-files", "-z", "--", "apps", "packages", "plugins", "modules"], { cwd: root, encoding: "utf8" }).split("\0")
    .filter(file => /\.ts$/.test(file) && !file.includes("/tests/"));
  const read = (file: string) => { try { return readFileSync(join(root, file), "utf8"); } catch { return ""; } };
  assert.deepEqual(tracked.filter(file => /FEED_ARTIFACT_PRODUCER/.test(read(file))), []);
  assert.doesNotMatch(read("apps/local-host/src/feed-application.ts"), /commands\.registerVersion/);
});
