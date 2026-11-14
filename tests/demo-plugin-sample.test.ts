import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openTestSqlite } from "@molis-ai/molis-work-test-kit/sqlite";
import { mkdirSync } from "node:fs";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, DEMO_CORE_ARTIFACT_ID, LocalProjectDatabase, openProjectVersionStores, MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { FEED_CAPTURE_ARTIFACT_TYPE_ID, feedManifest, feedSourceActions, feedQueryActions, type FeedSnapshot } from "@molis-ai/molis-work-plugin-feed";
import { renderFeedWorkbenchFragment } from "./workbench-renderer-fixture.js";
import { GoalProjectApplication, seedBoard } from "./fixtures/goal-application.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

const DEMO_GITHUB_SOURCE_ID = "demo-github", DEMO_GMAIL_SOURCE_ID = "demo-gmail";

async function startDemoRuntime(databasePath: string, projectId: string, homeDirectory?: string, explicit = false, operation?: (host: MolisWorkLocalHost, ref: ReturnType<typeof molisWorkHostProjectReference>) => Promise<void>): Promise<void> {
  const host = new MolisWorkLocalHost({ homeDirectory, completeText: null });
  try {
    if (homeDirectory) host.configurePersonalPlanning(homeDirectory, withMolisWorkProjectCatalog);
    const ref = molisWorkHostProjectReference({ projectId, databasePath });
    if (explicit) await host.actionClient(ref).invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "workflow",
      permissions: feedManifest.permissions.map(item => item.permission) }, { ...feedManifest.demo_seed!, provider_id: feedManifest.plugin_id }, {});
    else await host.inspectActions({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: projectId, audience: "user", permissions: [] }, ref);
    await operation?.(host, ref);
  } finally { await host.close(); }
}

async function withDirectory<T>(prefix: string, run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function feedHtml(databasePath: string, projectId = DEMO_PROJECT_ID): string {
  const store = new LocalProjectDatabase(databasePath);
  try {
    const view = buildMolisWorkWebView(store, new GoalProjectApplication(store), {
      databasePath,
      projectId,
      demo: true,
    });
    return renderFeedWorkbenchFragment(view);
  } finally {
    store.close();
  }
}

function feedItemCount(databasePath: string, projectId = DEMO_PROJECT_ID): number {
  const store = new LocalProjectDatabase(databasePath);
  try {
    return createLocalFeedApplication(store.db).snapshot(projectId).feed_items.length;
  } finally {
    store.close();
  }
}

async function assertDemoPluginFacts(input: {
  databasePath: string;
  homeDirectory: string;
  projectId: string;
}): Promise<void> {
  const store = new LocalProjectDatabase(input.databasePath);
  try {
    const feed = createLocalFeedApplication(store.db);
    const snapshot = feed.snapshot(input.projectId);
    const kinds = new Set(snapshot.sources.map((source) => source.kind));
    assert.ok(kinds.has("rss"));
    assert.ok(kinds.has("youtube_channel"));
    assert.ok(kinds.has("web_query"));
    assert.ok(kinds.has("github"));
    assert.ok(kinds.has("gmail"));
    assert.ok(snapshot.feed_items.length >= 5);
    const github = snapshot.sources.find((source) => source.source_id === DEMO_GITHUB_SOURCE_ID);
    const gmail = snapshot.sources.find((source) => source.source_id === DEMO_GMAIL_SOURCE_ID);
    assert.equal(github?.status, "disconnected");
    assert.equal(github?.enabled, false);
    assert.equal(github?.credential_ref, null);
    assert.equal(gmail?.status, "disconnected");
    assert.equal(gmail?.enabled, false);
    assert.equal(gmail?.credential_ref, null);
    const active = snapshot.inbox_entries.filter((entry) => entry.status === "open" || entry.status === "in_progress");
    const history = snapshot.inbox_entries.filter((entry) => entry.status === "done" || entry.status === "dismissed");
    assert.ok(active.some((entry) => entry.reason === "manual"));
    assert.ok(active.some((entry) => entry.reason === "source_rule"));
    assert.ok(active.some((entry) => entry.reason === "source_fault"));
    assert.ok(history.some((entry) => entry.status === "done"));
    assert.ok(history.some((entry) => entry.status === "dismissed"));
    const { query } = openProjectVersionStores(store).artifacts;
    const artifacts = query.listArtifacts(input.projectId);
    assert.ok(artifacts.some((artifact) => artifact.artifact_id === DEMO_CORE_ARTIFACT_ID));
    // RAC-510: the 「目标树」 rule captured its article once, with the writer the Runtime Feed is given, so Feed's Manifest is the producer.
    const rule = feed.outRules.list(input.projectId).find((candidate) => candidate.match.contains === "目标树");
    const article = snapshot.feed_items.find((item) => item.title === "第一次把模糊想法收成目标树");
    assert.ok(rule && article);
    const captures = artifacts.filter((artifact) => artifact.artifact_type_id === FEED_CAPTURE_ARTIFACT_TYPE_ID).map((capture) => ({
      item: capture.metadata.feed_item_id, rule: capture.metadata.rule_id, plugin: capture.producer_plugin_id, version: capture.producer_plugin_version,
      signature: capture.producer_binding_signature, versions: query.listArtifactVersions(input.projectId, capture.artifact_id).length,
    }));
    assert.deepEqual(captures, [{ item: article.item_id, rule: rule.rule_id, plugin: feedManifest.plugin_id, version: feedManifest.version,
      signature: feedManifest.publisher.signature, versions: 1 }]);
  } finally {
    store.close();
  }

}

test("seedDemoBoard fixtures stay empty of plugin samples", async () => {
  await withDirectory("molis-work-demo-board-only-", async (directory) => {
    const databasePath = join(directory, "fixture.db");
    seedBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const snapshot = createLocalFeedApplication(store.db).snapshot(DEMO_PROJECT_ID);
      assert.equal(snapshot.feed_items.length, 0);
      assert.equal(snapshot.inbox_entries.length, 0);
      assert.equal(snapshot.sources.length, 0);
      assert.equal(openProjectVersionStores(store).artifacts.query.listArtifacts(DEMO_PROJECT_ID).length, 0);
    } finally {
      store.close();
    }
    // E-3: the Feed draws no demo rows for a project without items; the empty Feed says so instead of showing invented ones.
    const empty = feedHtml(databasePath);
    assert.doesNotMatch(empty, /prototype-feed-github|data-feed-entry-id=/);
    assert.match(empty, /data-feed-empty-title/);
  });
});

test("plugin samples are written under the project id they are given", async () => {
  await withDirectory("molis-work-demo-old-board-", async (directory) => {
    const databasePath = join(directory, "old-demo.db");
    const store = new LocalProjectDatabase(databasePath);
    try {
      new GoalProjectApplication(store).initializeBoard({
        project_id: "goalboard-v1-demo",
        actor_id: "demo-user",
        idempotency_key: "demo-old-board",
      });
    } finally {
      store.close();
    }
    await startDemoRuntime(databasePath, "goalboard-v1-demo", join(directory, "home"), true);
    const seeded = new LocalProjectDatabase(databasePath);
    try {
      const snapshot = createLocalFeedApplication(seeded.db).snapshot("goalboard-v1-demo");
      const kinds = new Set(snapshot.sources.map((source) => source.kind));
      assert.ok(kinds.has("rss"));
      assert.ok(kinds.has("youtube_channel"));
      assert.ok(kinds.has("web_query"));
      assert.ok(kinds.has("github"));
      assert.ok(kinds.has("gmail"));
      assert.ok(snapshot.feed_items.length >= 5);
      const active = snapshot.inbox_entries.filter((entry) => entry.status === "open" || entry.status === "in_progress");
      const history = snapshot.inbox_entries.filter((entry) => entry.status === "done" || entry.status === "dismissed");
      assert.ok(active.some((entry) => entry.reason === "manual"));
      assert.ok(active.some((entry) => entry.reason === "source_rule"));
      assert.ok(active.some((entry) => entry.reason === "source_fault"));
      assert.ok(history.some((entry) => entry.status === "done"));
      assert.ok(history.some((entry) => entry.status === "dismissed"));
      const artifacts = openProjectVersionStores(seeded).artifacts.query.listArtifacts("goalboard-v1-demo");
      assert.ok(artifacts.some((artifact) => artifact.artifact_type_id === FEED_CAPTURE_ARTIFACT_TYPE_ID));
      assert.ok(artifacts.some((artifact) => artifact.artifact_type_id === FEED_CAPTURE_ARTIFACT_TYPE_ID));
    } finally {
      seeded.close();
    }
  });
});

test("an existing demo project written by another producer version is kept, not refused", async () => {
  await withDirectory("molis-work-demo-other-producer-", async (directory) => {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: join(directory, ".molis-work") });
    try {
      const created = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      const { database_path: databasePath, project_id: projectId } = created.project;
      // What an earlier product version left behind: the same two versions, each still naming the producer version that wrote it.
      const earlier = new LocalProjectDatabase(databasePath);
      try {
        const moved = earlier.db.prepare("UPDATE library_artifact_versions SET producer_plugin_version = ? WHERE artifact_id = ?").run("0.0.1", DEMO_CORE_ARTIFACT_ID);
        assert.equal(moved.changes, 2);
      } finally { earlier.close(); }

      const existing = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(existing.status, "existing");

      const kept = new LocalProjectDatabase(databasePath);
      try {
        const { query } = openProjectVersionStores(kept).artifacts;
        assert.deepEqual([1, 2].map(version => query.getArtifactVersion(projectId, { artifact_id: DEMO_CORE_ARTIFACT_ID, version })?.producer_plugin_version), ["0.0.1", "0.0.1"]);
      } finally { kept.close(); }
    } finally {
      catalog.close();
    }
  });
});

test("creating the demo project seeds every built-in plugin surface", async () => {
  await withDirectory("molis-work-demo-plugin-sample-", async (directory) => {
    const home = join(directory, ".molis-work");
    let catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const created = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(created.status, "created");
      assert.deepEqual(
        catalog.listProjectPlugins(created.project.project_id),
        ["coding", "feed", "goals", "inbox", "risk", "schedule"],
      );
      catalog.close();
      await startDemoRuntime(created.project.database_path, created.project.project_id, home);
      catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
      await assertDemoPluginFacts({
        databasePath: created.project.database_path,
        homeDirectory: home,
        projectId: created.project.project_id,
      });
      assert.doesNotMatch(feedHtml(created.project.database_path, created.project.project_id), /prototype-feed-github/);
      const itemCount = feedItemCount(created.project.database_path, created.project.project_id);

      const existing = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(existing.status, "existing");
      catalog.close();
      await startDemoRuntime(existing.project.database_path, existing.project.project_id, home);
      catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
      assert.equal(feedItemCount(existing.project.database_path, existing.project.project_id), itemCount);

      const reset = await catalog.resetDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(reset.status, "reset");
      assert.deepEqual(
        catalog.listProjectPlugins(reset.project.project_id),
        ["coding", "feed", "goals", "inbox", "risk", "schedule"],
      );
      catalog.close();
      await startDemoRuntime(reset.project.database_path, reset.project.project_id, home);
      catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
      await assertDemoPluginFacts({
        databasePath: reset.project.database_path,
        homeDirectory: home,
        projectId: reset.project.project_id,
      });
    } finally {
      catalog.close();
    }
  });
});


test("D0041 D0078: restarting a demo never resurrects a deleted sample or re-enables a paused one", async () => {
  await withDirectory("molis-demo-seed-lifecycle-", async directory => {
    const home = join(directory, "home");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    let project: Awaited<ReturnType<typeof catalog.ensureDemoProject>>["project"];
    try { project = (await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true })).project; }
    finally { catalog.close(); }
    let pausedId = "";
    await startDemoRuntime(project.database_path, project.project_id, home, false, async (host, ref) => {
      const client = host.actionClient(ref), caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project.project_id, audience: "user" as const, permissions: feedManifest.permissions.map(item => item.permission) };
      const snapshot = await client.invoke(caller, { ...feedQueryActions.snapshot, provider_id: feedManifest.plugin_id }, {}) as FeedSnapshot;
      pausedId = snapshot.sources.find(source => source.kind === "rss")!.source_id;
      assert.ok(pausedId);
      await client.invoke(caller, { ...feedSourceActions.enabled, provider_id: feedManifest.plugin_id }, { source_id: pausedId, enabled: false });
      await client.invoke(caller, { ...feedSourceActions.delete, provider_id: feedManifest.plugin_id }, { source_id: DEMO_GITHUB_SOURCE_ID, history_decision: "delete_local_history" });
      assert.deepEqual(await client.invoke({ ...caller, audience: "workflow" }, { ...feedManifest.demo_seed!, provider_id: feedManifest.plugin_id }, {}), { seeded: false });
    });
    await startDemoRuntime(project.database_path, project.project_id, home);
    const store = new LocalProjectDatabase(project.database_path);
    try {
      const feed = createLocalFeedApplication(store.db), snapshot = feed.snapshot(project.project_id);
      assert.ok(!snapshot.sources.some(source => source.source_id === DEMO_GITHUB_SOURCE_ID));
      assert.equal(snapshot.sources.find(source => source.source_id === pausedId)?.enabled, false);
      assert.ok(!snapshot.feed_items.some(item => item.source_id === DEMO_GITHUB_SOURCE_ID));
      assert.ok(feed.sources.get(project.project_id, DEMO_GITHUB_SOURCE_ID).config._molis_work_lifecycle, "the source tombstone is the owner-held once receipt");
    } finally { store.close(); }
  });
});
