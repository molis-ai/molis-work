import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { DEMO_BOARD_ID,
  DEMO_CORE_ARTIFACT_ID,
  DEMO_GITHUB_SOURCE_ID,
  DEMO_GMAIL_SOURCE_ID,
  GoalProjectApplication,
  LocalProjectDatabase,
  
  createLocalFeedApplication,
  openWorkSessionRegistry,
  seedDemoBoard,
  seedDemoPluginSurfaces,
  seedDemoProjectExtras } from "@molis-ai/molis-work-app-local-host";
import { FEED_CAPTURE_ARTIFACT_TYPE_ID } from "@molis-ai/molis-work-plugin-feed";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { renderFeedWorkbenchFragment } from "./workbench-renderer-fixture.js";

async function withDirectory<T>(prefix: string, run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function feedHtml(databasePath: string): string {
  const store = new LocalProjectDatabase(databasePath);
  try {
    const view = buildMolisWorkWebView(store, new GoalProjectApplication(store), {
      databasePath,
      boardId: DEMO_BOARD_ID,
      demo: true,
    });
    return renderFeedWorkbenchFragment(view);
  } finally {
    store.close();
  }
}

function feedItemCount(databasePath: string): number {
  const store = new LocalProjectDatabase(databasePath);
  try {
    return createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID).feed_items.length;
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
    const snapshot = createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID);
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
    const artifacts = new GoalProjectApplication(store).artifacts.query.listArtifacts(DEMO_BOARD_ID);
    assert.ok(artifacts.some((artifact) => artifact.artifact_id === DEMO_CORE_ARTIFACT_ID));
    assert.ok(artifacts.some((artifact) => artifact.artifact_type_id === FEED_CAPTURE_ARTIFACT_TYPE_ID));
  } finally {
    store.close();
  }
  const registry = await openWorkSessionRegistry({ homeDirectory: input.homeDirectory });
  try {
    const sessions = registry.list({ project_id: input.projectId })
      .filter((session) => session.metadata.regenerable_demo === true);
    assert.ok(sessions.length >= 2);
    assert.ok(sessions.every((session) => registry.eventCount(session.session_id) > 0));
    assert.ok(sessions.every((session) => !session.native_runtime_session_id));
  } finally {
    registry.close();
  }
  assert.ok(
    openShelfStore(input.homeDirectory).snapshot().materials.some((item) => item.name === "试用示例.pdf"),
  );
}

test("seedDemoBoard fixtures stay empty of plugin samples", async () => {
  await withDirectory("molis-work-demo-board-only-", async (directory) => {
    const databasePath = join(directory, "fixture.db");
    seedDemoBoard(databasePath);
    const store = new LocalProjectDatabase(databasePath);
    try {
      const snapshot = createLocalFeedApplication(store.db).snapshot(DEMO_BOARD_ID);
      assert.equal(snapshot.feed_items.length, 0);
      assert.equal(snapshot.inbox_entries.length, 0);
      assert.equal(snapshot.sources.length, 0);
      assert.equal(new GoalProjectApplication(store).artifacts.query.listArtifacts(DEMO_BOARD_ID).length, 0);
    } finally {
      store.close();
    }
    assert.match(feedHtml(databasePath), /prototype-feed-github/);
  });
});

test("plugin samples can be written onto an older demo board id", async () => {
  await withDirectory("molis-work-demo-old-board-", async (directory) => {
    const databasePath = join(directory, "old-demo.db");
    const store = new LocalProjectDatabase(databasePath);
    try {
      new GoalProjectApplication(store).initializeBoard({
        board_id: "goalboard-v1-demo",
        title: "Molis Work 示例项目",
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
      const artifacts = new GoalProjectApplication(seeded).artifacts.query.listArtifacts("goalboard-v1-demo");
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
        ["artifacts", "coding", "feed", "goals", "inbox", "schedule", "sessions"],
      );
      await assertDemoPluginFacts({
        databasePath: created.project.database_path,
        homeDirectory: home,
        projectId: created.project.project_id,
      });
      assert.doesNotMatch(feedHtml(created.project.database_path), /prototype-feed-github/);
      const itemCount = feedItemCount(created.project.database_path);

      const existing = await catalog.ensureDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(existing.status, "existing");
      assert.equal(feedItemCount(existing.project.database_path), itemCount);

      const reset = await catalog.resetDemoProject({ actor_id: "user", user_confirmed: true });
      assert.equal(reset.status, "reset");
      assert.deepEqual(
        catalog.listProjectPlugins(reset.project.project_id),
        ["artifacts", "coding", "feed", "goals", "inbox", "schedule", "sessions"],
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

test("demo Sessions can be written into a Session Registry that still has the old provenance CHECK", async () => {
  await withDirectory("molis-work-demo-session-check-", async (directory) => {
    const home = join(directory, ".molis-work");
    mkdirSync(join(home, "sessions"), { recursive: true });
    const db = new Database(join(home, "sessions", "sessions.db"));
    try {
      db.exec(`
        CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          runtime_id TEXT NOT NULL,
          native_runtime_session_id TEXT,
          correlation_token TEXT,
          correlation_expires_at TEXT,
          surface_id TEXT,
          project_id TEXT,
          current_goal_id TEXT,
          workspace_id TEXT,
          workspace_path TEXT,
          title TEXT,
          status TEXT NOT NULL CHECK (status IN ('discovered', 'active', 'closed')),
          provenance TEXT NOT NULL CHECK (provenance IN (
            'goalboard_created', 'runtime_discovered', 'explicitly_linked', 'legacy_migrated'
          )),
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("owner", "molis-work-session-registry-v1");
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("schema_version", "5");
    } finally {
      db.close();
    }
    await seedDemoProjectExtras({ projectId: "project-demo-old-check", homeDirectory: home, actorId: "user" });
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      const sessions = registry.list({ project_id: "project-demo-old-check" });
      assert.equal(sessions.length, 2);
      assert.ok(sessions.every((session) => session.provenance === "molis_work_created"));
      assert.ok(sessions.every((session) => registry.eventCount(session.session_id) > 0));
    } finally {
      registry.close();
    }
  });
});

test("an interrupted event-source rebuild leftover does not block demo Sessions", async () => {
  await withDirectory("molis-work-demo-session-leftover-", async (directory) => {
    const home = join(directory, ".molis-work");
    mkdirSync(join(home, "sessions"), { recursive: true });
    const db = new Database(join(home, "sessions", "sessions.db"));
    try {
      db.exec(`
        CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          runtime_id TEXT NOT NULL,
          native_runtime_session_id TEXT,
          correlation_token TEXT,
          correlation_expires_at TEXT,
          surface_id TEXT,
          project_id TEXT,
          current_goal_id TEXT,
          workspace_id TEXT,
          workspace_path TEXT,
          title TEXT,
          status TEXT NOT NULL CHECK (status IN ('discovered', 'active', 'closed')),
          provenance TEXT NOT NULL CHECK (provenance IN (
            'goalboard_created', 'runtime_discovered', 'explicitly_linked', 'legacy_migrated'
          )),
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE session_events (
          event_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          source TEXT NOT NULL CHECK (source IN ('goalboard_tui', 'molis-work')),
          kind TEXT NOT NULL CHECK (kind IN (
            'user_message', 'runtime_message', 'tool', 'approval',
            'status', 'artifact', 'terminal_output'
          )),
          source_id TEXT NOT NULL,
          source_order INTEGER NOT NULL,
          occurred_at TEXT NOT NULL,
          content_ref TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, source, source_id)
        );
        CREATE TABLE session_events__src_v2 (
          event_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          source TEXT NOT NULL,
          kind TEXT NOT NULL,
          source_id TEXT NOT NULL,
          source_order INTEGER NOT NULL,
          occurred_at TEXT NOT NULL,
          content_ref TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
      `);
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("owner", "molis-work-session-registry-v1");
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("schema_version", "5");
    } finally {
      db.close();
    }
    await seedDemoProjectExtras({ projectId: "project-demo-leftover", homeDirectory: home, actorId: "user" });
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      const sessions = registry.list({ project_id: "project-demo-leftover" });
      assert.equal(sessions.length, 2);
      assert.ok(sessions.every((session) => session.provenance === "molis_work_created"));
      assert.ok(sessions.every((session) => registry.eventCount(session.session_id) > 0));
    } finally {
      registry.close();
    }
  });
});

test("old goalboard Session event sources are rebuilt so demo Sessions can be written", async () => {
  await withDirectory("molis-work-demo-session-goalboard-source-", async (directory) => {
    const home = join(directory, ".molis-work");
    mkdirSync(join(home, "sessions"), { recursive: true });
    const db = new Database(join(home, "sessions", "sessions.db"));
    try {
      db.exec(`
        CREATE TABLE session_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE sessions (
          session_id TEXT PRIMARY KEY,
          runtime_id TEXT NOT NULL,
          native_runtime_session_id TEXT,
          correlation_token TEXT,
          correlation_expires_at TEXT,
          surface_id TEXT,
          project_id TEXT,
          current_goal_id TEXT,
          workspace_id TEXT,
          workspace_path TEXT,
          title TEXT,
          status TEXT NOT NULL CHECK (status IN ('discovered', 'active', 'closed')),
          provenance TEXT NOT NULL CHECK (provenance IN (
            'goalboard_created', 'runtime_discovered', 'explicitly_linked', 'legacy_migrated'
          )),
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE session_events (
          event_id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
          source TEXT NOT NULL CHECK (source IN ('goalboard_tui', 'goalboard')),
          kind TEXT NOT NULL CHECK (kind IN (
            'user_message', 'runtime_message', 'tool', 'approval',
            'status', 'artifact', 'terminal_output'
          )),
          source_id TEXT NOT NULL,
          source_order INTEGER NOT NULL,
          occurred_at TEXT NOT NULL,
          content_ref TEXT NOT NULL,
          metadata_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE(session_id, source, source_id)
        );
      `);
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("owner", "molis-work-session-registry-v1");
      db.prepare("INSERT INTO session_meta (key, value) VALUES (?, ?)").run("schema_version", "5");
      db.prepare(`
        INSERT INTO sessions (
          session_id, runtime_id, native_runtime_session_id, correlation_token, correlation_expires_at,
          surface_id, project_id, current_goal_id, workspace_id, workspace_path, title, status,
          provenance, metadata_json, created_at, updated_at
        ) VALUES (
          'session-old-source', 'codex', NULL, NULL, NULL, NULL, 'project-demo-goalboard-source',
          NULL, NULL, NULL, '旧来源', 'active', 'legacy_migrated', '{}',
          '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
        )
      `).run();
      db.prepare(`
        INSERT INTO session_events (
          event_id, session_id, source, kind, source_id, source_order, occurred_at, content_ref, metadata_json, created_at
        ) VALUES
          ('evt-tui', 'session-old-source', 'goalboard_tui', 'terminal_output', 'tui-1', 0,
           '2026-01-01T00:00:00.000Z', 'ref-tui', '{}', '2026-01-01T00:00:00.000Z'),
          ('evt-host', 'session-old-source', 'goalboard', 'status', 'host-1', 1,
           '2026-01-01T00:00:01.000Z', 'ref-host', '{}', '2026-01-01T00:00:01.000Z')
      `).run();
    } finally {
      db.close();
    }
    await seedDemoProjectExtras({ projectId: "project-demo-goalboard-source", homeDirectory: home, actorId: "user" });
    const registry = await openWorkSessionRegistry({ homeDirectory: home });
    try {
      const existing = registry.events("session-old-source");
      assert.equal(existing.find((event) => event.event_id === "evt-tui")?.source, "molis_work_tui");
      assert.equal(existing.find((event) => event.event_id === "evt-host")?.source, "molis_work");
      const sessions = registry.list({ project_id: "project-demo-goalboard-source" })
        .filter((session) => session.metadata.regenerable_demo === true);
      assert.equal(sessions.length, 2);
      assert.ok(sessions.every((session) => registry.eventCount(session.session_id) > 0));
    } finally {
      registry.close();
    }
  });
});
