import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_PROJECT_ID, DEMO_CORE_ARTIFACT_ID, DEMO_GITHUB_SOURCE_ID, DEMO_GMAIL_SOURCE_ID, LocalProjectDatabase, seedDemoPluginSurfaces, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { FEED_CAPTURE_ARTIFACT_TYPE_ID, feedManifest } from "@molis-ai/molis-work-plugin-feed";
import { renderFeedWorkbenchFragment } from "./workbench-renderer-fixture.js";
import { GoalProjectApplication, seedBoard } from "./fixtures/goal-application.js";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";

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
    const rule = feed.listOutRules(input.projectId).find((candidate) => candidate.match.contains === "目标树");
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
  // The Shelf sample is Shelf's: the resident Host puts it back through `shelf.sample.seed` (shelf-actions.test.ts), the catalog does not.
  assert.equal(existsSync(join(input.homeDirectory, "shelf")), false, "making the demo writes nothing into Shelf's files");
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
    seedDemoPluginSurfaces(databasePath, "goalboard-v1-demo");
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
      assert.ok(artifacts.some((artifact) => artifact.artifact_id === DEMO_CORE_ARTIFACT_ID));
      assert.ok(artifacts.some((artifact) => artifact.artifact_type_id === FEED_CAPTURE_ARTIFACT_TYPE_ID));
    } finally {
      seeded.close();
    }
  });
});

test("creating the demo project seeds every built-in plugin surface", async () => {
  await withDirectory("molis-work-demo-plugin-sample-", async (directory) => {
    const home = join(directory, ".molis-work");
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      const created = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(created.status, "created");
      assert.deepEqual(
        catalog.listProjectPlugins(created.project.project_id),
        ["artifacts", "coding", "feed", "goals", "inbox", "schedule"],
      );
      await assertDemoPluginFacts({
        databasePath: created.project.database_path,
        homeDirectory: home,
        projectId: created.project.project_id,
      });
      assert.doesNotMatch(feedHtml(created.project.database_path, created.project.project_id), /prototype-feed-github/);
      const itemCount = feedItemCount(created.project.database_path, created.project.project_id);

      const existing = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(existing.status, "existing");
      assert.equal(feedItemCount(existing.project.database_path, existing.project.project_id), itemCount);

      const reset = await catalog.resetDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(reset.status, "reset");
      assert.deepEqual(
        catalog.listProjectPlugins(reset.project.project_id),
        ["artifacts", "coding", "feed", "goals", "inbox", "schedule"],
      );
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
