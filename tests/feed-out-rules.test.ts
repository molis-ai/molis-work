import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { AttentionModule, migrateAttention } from "@molis-ai/molis-work-module-attention-resumption";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import {
  createLocalFeedApplication,
  createLocalFeedSourceService,
  DEMO_BOARD_ID,
  GoalProjectApplication,
  LocalProjectDatabase,
  seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import {
  FEED_CAPTURE_ARTIFACT_TYPE_ID,
  feedCaptureArtifactId,
} from "@molis-ai/molis-work-plugin-feed";

const TOKEN = "feed-out-rules-test-token-0123456789012345";

function harness(artifacts?: Parameters<typeof createLocalFeedApplication>[1]) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-out-rules-"));
  const path = join(directory, "project.sqlite");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  const app = new GoalProjectApplication(store);
  const feed = createLocalFeedApplication(store.db, artifacts);
  const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({
    kind: "web_query",
    query: "launch coverage",
  }).source;
  return { directory, store, app, feed, source };
}

function close(data: ReturnType<typeof harness>): void {
  data.store.close();
  rmSync(data.directory, { recursive: true, force: true });
}

test("new Feed Item matching an out rule leaves an exact Artifact and no success Inbox row", () => {
  const data = harness();
  try {
    const rule = data.feed.createOutRule(DEMO_BOARD_ID, {
      name: "发布相关",
      match: { contains: "launch" },
    });
    const ingested = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-1",
      title: "Product launch checklist",
      summary: "Ship the launch notes",
      tags: ["launch"],
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    assert.equal(ingested.created, true);
    const artifactId = feedCaptureArtifactId(ingested.item.item_id, rule.rule_id);
    const artifact = data.app.artifacts.query.latestArtifactVersion(DEMO_BOARD_ID, artifactId);
    assert.ok(artifact);
    assert.equal(artifact.version, 1);
    assert.equal(artifact.artifact_type_id, FEED_CAPTURE_ARTIFACT_TYPE_ID);
    const payload = artifact.payload as { title?: string; tags?: string[] };
    assert.equal(payload.title, "Product launch checklist");
    assert.deepEqual(payload.tags, ["launch"]);
    assert.equal(
      data.feed.listInboxEntries(DEMO_BOARD_ID).filter((entry) => entry.reason === "artifact_out_failed").length,
      0,
    );
    assert.equal(data.feed.getFeedItem(DEMO_BOARD_ID, ingested.item.item_id).item_id, ingested.item.item_id);
  } finally {
    close(data);
  }
});

test("re-ingesting the same envelope does not create a new Artifact lineage", () => {
  const data = harness();
  try {
    const rule = data.feed.createOutRule(DEMO_BOARD_ID, {
      name: "发布相关",
      match: { contains: "launch" },
    });
    const first = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-2",
      signal: { signal_id: "sig-launch", revision: 1 },
      title: "Launch notes",
      summary: "Same payload",
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    const artifactId = feedCaptureArtifactId(first.item.item_id, rule.rule_id);
    const replay = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-2",
      signal: { signal_id: "sig-launch", revision: 2 },
      title: "Launch notes",
      summary: "Same payload",
      occurredAt: "2026-09-15T01:00:00.000Z",
      attention: false,
    });
    assert.equal(replay.created, false);
    assert.equal(replay.updated, true);
    const versions = data.app.artifacts.query.listArtifactVersions(DEMO_BOARD_ID, artifactId);
    assert.equal(versions.length, 1);
    assert.equal(versions[0]?.version, 1);

    const changed = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-2",
      signal: { signal_id: "sig-launch", revision: 3 },
      title: "Launch notes revised",
      summary: "Changed payload",
      occurredAt: "2026-09-15T02:00:00.000Z",
      attention: false,
    });
    assert.equal(changed.updated, true);
    const updated = data.app.artifacts.query.listArtifactVersions(DEMO_BOARD_ID, artifactId);
    assert.equal(updated.length, 2);
    assert.equal(data.app.artifacts.query.latestArtifactVersion(DEMO_BOARD_ID, artifactId)?.version, 2);
  } finally {
    close(data);
  }
});

test("creating a rule does not backfill historical Feed Items", () => {
  const data = harness();
  try {
    const historical = data.feed.ingestItem({
      source: data.source,
      externalId: "already-there",
      title: "Product launch yesterday",
      summary: "Historical",
      tags: ["launch"],
      occurredAt: "2026-09-14T00:00:00.000Z",
      attention: false,
    });
    data.feed.createOutRule(DEMO_BOARD_ID, {
      name: "发布相关",
      match: { contains: "launch" },
    });
    const replay = data.feed.ingestItem({
      source: data.source,
      externalId: "already-there",
      title: "Product launch yesterday",
      summary: "Historical",
      tags: ["launch"],
      occurredAt: "2026-09-14T00:00:00.000Z",
      attention: false,
    });
    assert.equal(replay.created, false);
    assert.equal(replay.updated, false);
    assert.equal(
      data.app.artifacts.query.listArtifacts(DEMO_BOARD_ID, {
        artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID,
      }).length,
      0,
    );
    assert.equal(data.feed.getFeedItem(DEMO_BOARD_ID, historical.item.item_id).title, "Product launch yesterday");
  } finally {
    close(data);
  }
});

test("registerVersion failure writes artifact_out_failed Attention and keeps the Feed Item", () => {
  const data = harness({
    artifacts: {
      registerVersion() {
        throw Object.assign(new Error("injected artifact failure"), { code: "artifact.unavailable" });
      },
      latestVersion() {
        return null;
      },
    },
  });
  try {
    data.feed.createOutRule(DEMO_BOARD_ID, {
      name: "发布相关",
      match: { contains: "launch" },
    });
    const ingested = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-fail",
      title: "Launch blocked",
      summary: "Need to retry capture",
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    const failures = data.feed.listInboxEntries(DEMO_BOARD_ID).filter((entry) =>
      entry.subject_id === ingested.item.item_id && entry.reason === "artifact_out_failed"
    );
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.status, "open");
    assert.deepEqual(failures[0]?.detail.error_codes, ["artifact.unavailable"]);
    assert.equal(data.feed.getFeedItem(DEMO_BOARD_ID, ingested.item.item_id).item_id, ingested.item.item_id);
    assert.equal(
      data.app.artifacts.query.listArtifacts(DEMO_BOARD_ID, {
        artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID,
      }).length,
      0,
    );
  } finally {
    close(data);
  }
});

test("source_rule Attention can coexist with a successful out capture", () => {
  const data = harness();
  try {
    const rule = data.feed.createOutRule(DEMO_BOARD_ID, {
      name: "发布相关",
      match: { contains: "launch" },
    });
    const ingested = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-both",
      title: "Launch review request",
      summary: "Needs a human look and a capture",
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: { reason: "source_rule", detail: { matched: "launch" } },
    });
    const entries = data.feed.listInboxEntries(DEMO_BOARD_ID).filter((entry) =>
      entry.subject_id === ingested.item.item_id
    );
    assert.equal(entries.some((entry) => entry.reason === "source_rule"), true);
    assert.equal(entries.some((entry) => entry.reason === "artifact_out_failed"), false);
    assert.ok(data.app.artifacts.query.latestArtifactVersion(
      DEMO_BOARD_ID,
      feedCaptureArtifactId(ingested.item.item_id, rule.rule_id),
    ));
  } finally {
    close(data);
  }
});

test("out-rule CRUD rejects an empty match and can disable a rule", () => {
  const data = harness();
  try {
    assert.throws(
      () => data.feed.createOutRule(DEMO_BOARD_ID, { name: "空规则", match: {} }),
      (error: unknown) => error instanceof FeedDomainError && error.code === "feed_out_rule_invalid",
    );
    const rule = data.feed.createOutRule(DEMO_BOARD_ID, {
      name: "发布相关",
      match: { contains: "launch" },
    });
    data.feed.updateOutRule(DEMO_BOARD_ID, rule.rule_id, { enabled: false });
    data.feed.ingestItem({
      source: data.source,
      externalId: "launch-disabled",
      title: "Launch ignored",
      summary: "Rule is off",
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    assert.equal(
      data.app.artifacts.query.listArtifacts(DEMO_BOARD_ID, {
        artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID,
      }).length,
      0,
    );
    data.feed.deleteOutRule(DEMO_BOARD_ID, rule.rule_id);
    assert.equal(data.feed.listOutRules(DEMO_BOARD_ID).length, 0);
  } finally {
    close(data);
  }
});

test("existing Attention databases gain artifact_out_failed without dropping rows", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE boards (board_id TEXT PRIMARY KEY);
    INSERT INTO boards (board_id) VALUES ('board');
    CREATE TABLE inbox_entries (
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL,
      subject_type TEXT NOT NULL CHECK (subject_type IN ('feed_item', 'goal_decision', 'source_fault')),
      subject_id TEXT NOT NULL,
      reason TEXT NOT NULL CHECK (reason IN ('manual', 'source_rule', 'goal_decision', 'source_fault')),
      status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'done', 'dismissed')),
      detail_json TEXT NOT NULL DEFAULT '{}',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      PRIMARY KEY (board_id, entry_id),
      UNIQUE (board_id, subject_type, subject_id, reason)
    );
    INSERT INTO inbox_entries VALUES (
      'board', 'entry-old', 'feed_item', 'item-old', 'manual', 'open', '{}', 1,
      '2026-09-14T00:00:00.000Z', '2026-09-14T00:00:00.000Z', NULL
    );
  `);
  migrateAttention(db);
  const sql = (db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'inbox_entries'").get() as { sql: string }).sql;
  assert.match(sql, /artifact_out_failed/);
  const kept = db.prepare("SELECT entry_id, reason FROM inbox_entries WHERE entry_id = 'entry-old'").get() as { entry_id: string; reason: string };
  assert.equal(kept.reason, "manual");
  const attention = new AttentionModule(db, { exists: () => true });
  const created = attention.commands.create({
    project_id: "board",
    subject_type: "feed_item",
    subject_id: "item-new",
    reason: "artifact_out_failed",
    detail: { rule_ids: ["rule-1"], error_codes: ["artifact.unavailable"] },
  });
  assert.equal(created.created, true);
  assert.equal(created.entry.reason, "artifact_out_failed");
});

test("Feed out-rule HTTP CRUD is owned by Feed plugin routes", async (t) => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-feed-out-http-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const created = await catalog.createProject({ display_name: "Out 规则项目", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  let sequence = 0;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    catalog.close();
    await rm(homeDirectory, { recursive: true, force: true });
  });

  const addFeed = await fetch(`${origin}/api/settings/projects/${project.project_id}/plugins`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "x-molis-work-control-token": TOKEN,
      "x-molis-work-idempotency-key": "add-feed",
    },
    body: JSON.stringify({ plugin_id: "feed" }),
  });
  assert.equal(addFeed.status, 200);

  const prefix = `/projects/${encodeURIComponent(project.project_id)}`;
  const createdRule = await webFetch(`${origin}${prefix}/api/feed/out-rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "发布相关", contains: "launch" }),
  });
  assert.equal(createdRule.status, 201);
  const createdBody = await createdRule.json() as { rule: { rule_id: string; enabled: boolean; match: { contains?: string } } };
  assert.equal(createdBody.rule.match.contains, "launch");

  const listed = await webFetch(`${origin}${prefix}/api/feed/out-rules`);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json() as { rules: Array<{ rule_id: string }> };
  assert.equal(listedBody.rules.length, 1);

  const patched = await webFetch(`${origin}${prefix}/api/feed/out-rules/${encodeURIComponent(createdBody.rule.rule_id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(patched.status, 200);
  const patchedBody = await patched.json() as { rule: { enabled: boolean } };
  assert.equal(patchedBody.rule.enabled, false);

  const deleted = await webFetch(`${origin}${prefix}/api/feed/out-rules/${encodeURIComponent(createdBody.rule.rule_id)}`, {
    method: "DELETE",
  });
  assert.equal(deleted.status, 200);
  const after = await webFetch(`${origin}${prefix}/api/feed/out-rules`);
  assert.equal(((await after.json()) as { rules: unknown[] }).rules.length, 0);

  const empty = await webFetch(`${origin}${prefix}/api/feed/out-rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "空规则" }),
  });
  assert.equal(empty.status, 400);

  function webFetch(input: string, init: RequestInit = {}): Promise<Response> {
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "GET") return fetch(input, init);
    const headers = new Headers(init.headers);
    headers.set("origin", origin);
    headers.set("x-molis-work-control-token", TOKEN);
    if (!headers.has("x-molis-work-idempotency-key")) {
      sequence += 1;
      headers.set("x-molis-work-idempotency-key", `feed-out-${sequence}`);
    }
    return fetch(input, { ...init, headers });
  }
});
