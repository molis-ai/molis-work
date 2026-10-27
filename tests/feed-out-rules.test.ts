import { feedCaptureFixture } from "./feed-capture-fixture.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { ActionError, bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { DEMO_PROJECT_ID, LocalProjectDatabase, listFeedSourceCatalog, openProjectVersionStores, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import {
  FEED_CAPTURE_ARTIFACT_TYPE_ID,
  feedCaptureArtifactId,
  createFeedRuleHandlers, feedRuleActions,
} from "@molis-ai/molis-work-plugin-feed";
import {
  FEED_CAPTURE_SCENE_ID,
  INBOX_ADMIT_BEHAVIOR_ID,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { FEED_API, feedTestRoutes } from "./fixtures/feed-http.js";

const TOKEN = "feed-out-rules-test-token-0123456789012345";

function harness(artifacts?: Parameters<typeof createLocalFeedApplication>[1]) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-out-rules-"));
  const path = join(directory, "project.sqlite");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  const app = openProjectVersionStores(store);
  const feed = createLocalFeedApplication(store.db, artifacts);
  const source = createLocalFeedSourceService(store.db, DEMO_PROJECT_ID).register({
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
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, {
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
    const artifact = data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, artifactId);
    assert.ok(artifact);
    assert.equal(artifact.version, 1);
    assert.equal(artifact.artifact_type_id, FEED_CAPTURE_ARTIFACT_TYPE_ID);
    const payload = artifact.payload as { title?: string; tags?: string[] };
    assert.equal(payload.title, "Product launch checklist");
    assert.deepEqual(payload.tags, ["launch"]);
    assert.equal(
      data.feed.listInboxEntries(DEMO_PROJECT_ID).filter((entry) => entry.reason === "artifact_out_failed").length,
      0,
    );
    assert.equal(data.feed.getFeedItem(DEMO_PROJECT_ID, ingested.item.item_id).item_id, ingested.item.item_id);
  } finally {
    close(data);
  }
});

test("out-rule judgment records a suggestion without admitting the Feed Item", async () => {
  const fixture = feedCaptureFixture(() => ({ status: "ok", suggested_behavior_ids: [INBOX_ADMIT_BEHAVIOR_ID] }));
  const data = harness(fixture.options);
  fixture.attach(data.feed, DEMO_PROJECT_ID);
  try {
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, {
      name: "发布相关",
      match: { contains: "launch" },
      judgment: fixture.reference,
    });
    assert.throws(() => data.feed.updateOutRule(DEMO_PROJECT_ID, rule.rule_id, { name: " " }));
    assert.throws(() => data.feed.updateOutRule(DEMO_PROJECT_ID, "missing-rule", { name: "替换" }));
    assert.deepEqual(data.feed.listOutRules(DEMO_PROJECT_ID)[0]?.judgment, fixture.reference);
    const ingested = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-judge",
      title: "Product launch checklist",
      summary: "Ship the launch notes",
      tags: ["launch"],
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    await data.feed.flushPendingJudgments();
    assert.equal(fixture.history[0]?.scene_id, FEED_CAPTURE_SCENE_ID);
    assert.equal(
      data.feed.listInboxEntries(DEMO_PROJECT_ID).filter((entry) => entry.subject_id === ingested.item.item_id).length,
      0,
    );
  } finally {
    close(data);
  }
});

test("re-ingesting the same envelope does not create a new Artifact lineage", () => {
  const data = harness();
  try {
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, {
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
    const versions = data.app.artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, artifactId);
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
    const updated = data.app.artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, artifactId);
    assert.equal(updated.length, 2);
    assert.equal(data.app.artifacts.query.latestArtifactVersion(DEMO_PROJECT_ID, artifactId)?.version, 2);
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
    data.feed.createOutRule(DEMO_PROJECT_ID, {
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
      data.app.artifacts.query.listArtifacts(DEMO_PROJECT_ID, {
        artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID,
      }).length,
      0,
    );
    assert.equal(data.feed.getFeedItem(DEMO_PROJECT_ID, historical.item.item_id).title, "Product launch yesterday");
  } finally {
    close(data);
  }
});

test("registerVersion failure writes artifact_out_failed Attention and keeps the Feed Item", () => {
  const data = harness({
    artifacts: {
      // The 成果库 refuses the capture itself, not the call: Feed records it as the item's failed capture.
      capture: (_projectId, write) => write({
        head: () => null,
        publish() {
          throw Object.assign(new Error("injected artifact failure"), { code: "artifacts.artifact.unavailable" });
        },
      }),
    },
  });
  try {
    data.feed.createOutRule(DEMO_PROJECT_ID, {
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
    const failures = data.feed.listInboxEntries(DEMO_PROJECT_ID).filter((entry) =>
      entry.subject_id === ingested.item.item_id && entry.reason === "artifact_out_failed"
    );
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.status, "open");
    assert.deepEqual(failures[0]?.detail.error_codes, ["artifacts.artifact.unavailable"]);
    assert.equal(data.feed.getFeedItem(DEMO_PROJECT_ID, ingested.item.item_id).item_id, ingested.item.item_id);
    assert.equal(
      data.app.artifacts.query.listArtifacts(DEMO_PROJECT_ID, {
        artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID,
      }).length,
      0,
    );
  } finally {
    close(data);
  }
});

// RAC-510: a capture is pinned in the commit of its item, and a refusal of the call itself there (cancelled, revoked, stopped) is the call's,
// not a failed capture: it goes up, so the Runtime rolls the whole commit back, and Feed records no artifact_out_failed for it.
for (const [what, refusal, expected] of [
  ["revoked", new ActionError("actions.forbidden", "所属安装已停止或撤权"), { code: "actions.forbidden" }],
  ["cancelled", new DOMException("This operation was aborted", "AbortError"), { name: "AbortError" }],
] as const) {
  test(`RAC-510 a refusal of the call while capturing (${what}) goes up and is not recorded as a failed capture`, () => {
    const data = harness({
      artifacts: { capture: () => { throw refusal; } },
    });
    try {
      data.feed.createOutRule(DEMO_PROJECT_ID, { name: "发布相关", match: { contains: "launch" } });
      assert.throws(() => data.feed.ingestItem({
        source: data.source,
        externalId: "launch-refused",
        title: "Launch refused",
        summary: "The call was refused",
        occurredAt: "2026-09-15T00:00:00.000Z",
        attention: false,
      }), expected);
      assert.equal(data.feed.listInboxEntries(DEMO_PROJECT_ID).filter((entry) => entry.reason === "artifact_out_failed").length, 0);
    } finally {
      close(data);
    }
  });
}

// Anything else a capture throws is the item's failed capture, as on main, an error without a code too (a TypeError of the content, a SQLite
// error): the item stays, so one item that cannot be captured does not hold its batch back on every retry.
test("RAC-510 a capture that throws without a code is recorded as feed_artifact_register_failed and keeps the Feed Item", () => {
  const data = harness({
    artifacts: { capture: (_projectId, write) => write({ head: () => null, publish() { throw new TypeError("不是可保存的 JSON 值"); } }) },
  });
  try {
    data.feed.createOutRule(DEMO_PROJECT_ID, { name: "发布相关", match: { contains: "launch" } });
    const ingested = data.feed.ingestItem({
      source: data.source,
      externalId: "launch-uncapturable",
      title: "Launch uncapturable",
      summary: "The content cannot be saved",
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    const failures = data.feed.listInboxEntries(DEMO_PROJECT_ID).filter((entry) =>
      entry.subject_id === ingested.item.item_id && entry.reason === "artifact_out_failed");
    assert.deepEqual(failures.map((entry) => entry.detail.error_codes), [["feed_artifact_register_failed"]]);
    assert.equal(data.feed.getFeedItem(DEMO_PROJECT_ID, ingested.item.item_id).item_id, ingested.item.item_id);
  } finally {
    close(data);
  }
});

test("source_rule Attention can coexist with a successful out capture", () => {
  const data = harness();
  try {
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, {
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
    const entries = data.feed.listInboxEntries(DEMO_PROJECT_ID).filter((entry) =>
      entry.subject_id === ingested.item.item_id
    );
    assert.equal(entries.some((entry) => entry.reason === "source_rule"), true);
    assert.equal(entries.some((entry) => entry.reason === "artifact_out_failed"), false);
    assert.ok(data.app.artifacts.query.latestArtifactVersion(
      DEMO_PROJECT_ID,
      feedCaptureArtifactId(ingested.item.item_id, rule.rule_id),
    ));
  } finally {
    close(data);
  }
});

test("out-rule CRUD rejects an empty match and can disable a rule", () => {
  const data = harness();
  try {
    assert.equal(data.feed.listOutRules(DEMO_PROJECT_ID).length, 0);
    assert.throws(
      () => data.feed.createOutRule(DEMO_PROJECT_ID, { name: "空规则", match: {} }),
      (error: unknown) => error instanceof ActionError && error.code === "feed.out_rule_invalid",
    );
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, {
      name: "发布相关",
      match: { contains: "launch" },
    });
    data.feed.updateOutRule(DEMO_PROJECT_ID, rule.rule_id, { enabled: false });
    data.feed.ingestItem({
      source: data.source,
      externalId: "launch-disabled",
      title: "Launch ignored",
      summary: "Rule is off",
      occurredAt: "2026-09-15T00:00:00.000Z",
      attention: false,
    });
    assert.equal(
      data.app.artifacts.query.listArtifacts(DEMO_PROJECT_ID, {
        artifact_type_id: FEED_CAPTURE_ARTIFACT_TYPE_ID,
      }).length,
      0,
    );
    data.feed.deleteOutRule(DEMO_PROJECT_ID, rule.rule_id);
    assert.equal(data.feed.listOutRules(DEMO_PROJECT_ID).length, 0);
  } finally {
    close(data);
  }
});

test("Attention records an Inbox entry for a failed 成果 output", () => {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY); INSERT INTO project_root (project_id) VALUES ('board');");
  const attention = new AttentionModule(db, { exists: () => true });
  const created = attention.commands.create({
    project_id: "board",
    subject_type: "feed_item",
    subject_id: "item-new",
    reason: "artifact_out_failed",
    detail: { rule_ids: ["rule-1"], error_codes: ["artifacts.artifact.unavailable"] },
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
  // Out-rules belong to a Source; a new project has none until one is added.
  const registered = await webFetch(`${origin}${prefix}${FEED_API}/sources`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "rss", definition_id: listFeedSourceCatalog()[0]!.id }) });
  assert.equal(registered.status, 201, await registered.clone().text());
  const page = await (await webFetch(`${origin}${prefix}/`)).text();
  assert.match(page, /data-feed-rule-instructions/);
  assert.match(page, /data-feed-out-rule-function-key/);
  const directory = await (await webFetch(`${origin}${prefix}${FEED_API}/out-rules/judgments`)).json() as { choices: { reference: { capability_id: string } }[] };
  assert.ok(directory.choices.some(choice => choice.reference.capability_id === "functions.published.system_admit_inbox"));
  assert.doesNotMatch(page, /data-feed-add-out-rule-function-key/);

  const published = (key: string) => ({ capability_id: `functions.published.${key}`, version: 1, provider_id: "system.functions" });
  const unpublished = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "坏判断", contains: "launch", judgment: published("not_a_published_function") }),
  });
  assert.equal(unpublished.status, 400);
  const emptyAfterUnpublished = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`);
  assert.equal(((await emptyAfterUnpublished.json()) as { rules: unknown[] }).rules.length, 0);

  const mismatched = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "首页判断", contains: "launch", judgment: published("system_pick_home_dock") }),
  });
  assert.equal(mismatched.status, 400);
  const emptyAfterMismatch = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`);
  assert.equal(((await emptyAfterMismatch.json()) as { rules: unknown[] }).rules.length, 0);

  const bound = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "发布判断", contains: "launch", judgment: published("system_admit_inbox") }),
  });
  assert.equal(bound.status, 201);
  const boundBody = await bound.json() as { rule: { rule_id: string; judgment: unknown } };
  assert.deepEqual(boundBody.rule.judgment, published("system_admit_inbox"));
  const deletedBound = await webFetch(`${origin}${prefix}${FEED_API}/out-rules/${encodeURIComponent(boundBody.rule.rule_id)}`, {
    method: "DELETE",
  });
  assert.equal(deletedBound.status, 200);

  const createdRule = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "发布相关", contains: "launch" }),
  });
  assert.equal(createdRule.status, 201);
  const createdBody = await createdRule.json() as { rule: { rule_id: string; enabled: boolean; match: { contains?: string } } };
  assert.equal(createdBody.rule.match.contains, "launch");

  const listed = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`);
  assert.equal(listed.status, 200);
  const listedBody = await listed.json() as { rules: Array<{ rule_id: string }> };
  assert.equal(listedBody.rules.length, 1);

  const patched = await webFetch(`${origin}${prefix}${FEED_API}/out-rules/${encodeURIComponent(createdBody.rule.rule_id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ enabled: false }),
  });
  assert.equal(patched.status, 200);
  const patchedBody = await patched.json() as { rule: { enabled: boolean } };
  assert.equal(patchedBody.rule.enabled, false);

  const deleted = await webFetch(`${origin}${prefix}${FEED_API}/out-rules/${encodeURIComponent(createdBody.rule.rule_id)}`, {
    method: "DELETE",
  });
  assert.equal(deleted.status, 200);
  const after = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`);
  assert.equal(((await after.json()) as { rules: unknown[] }).rules.length, 0);

  const empty = await webFetch(`${origin}${prefix}${FEED_API}/out-rules`, {
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


test("Feed rule preview matches recent source messages without writes or backfill", async () => {
  const data = harness();
  try {
    const another = createLocalFeedSourceService(data.store.db, DEMO_PROJECT_ID).register({ kind: "web_query", query: "another source" }).source;
    for (let index = 0; index < 7; index++) data.feed.ingestItem({
      source: data.source, externalId: `preview-${index}`, title: index === 6 ? "LAUNCH now" : `Message ${index}`,
      summary: index === 5 ? "launch in summary" : "summary",
      body: index === 4 ? "launch in body" : "body", tags: index === 3 ? ["launch"] : [],
      occurredAt: `2026-09-${String(index + 10).padStart(2, "0")}T00:00:00.000Z`, attention: false,
    });
    data.feed.ingestItem({ source: another, externalId: "foreign", title: "launch from another source", summary: "foreign", occurredAt: "2026-09-30T00:00:00.000Z", attention: false });
    const service = new ActionService();
    service.registerProvider({ provider: { provider_id: "io.molis.work.feed", title: "Feed", kind: "plugin", project_id: "preview-project" },
      definitions: Object.values(feedRuleActions), handlers: createFeedRuleHandlers(data.feed, DEMO_PROJECT_ID, item => item) });
    const routes = feedTestRoutes(bindActionClient(service, () => ({ actor_id: "preview", project_id: "preview-project", audience: "user", permissions: ["feed:read"] })));
    const writesBefore = data.store.db.prepare("SELECT total_changes() AS n").get();
    const before = data.feed.snapshot(DEMO_PROJECT_ID);
    const request = { method: "POST" as const, pathname: `${FEED_API}/out-rules/preview`, query: new URLSearchParams(), body: { source_id: data.source.source_id, contains: "launch" } };
    const response = await routes.handle(request);
    assert.equal(response?.status, 200);
    const samples = (response?.body as { samples: { title: string; matched: boolean; input: string }[] }).samples;
    assert.deepEqual(samples.map(item => [item.title, item.matched]), [["LAUNCH now", true], ["Message 5", true], ["Message 4", true], ["Message 3", true], ["Message 2", false]]);
    assert.equal(samples[0]?.input, "LAUNCH now\nsummary\nbody");
    assert.deepEqual(data.feed.snapshot(DEMO_PROJECT_ID), before);
    assert.deepEqual(data.store.db.prepare("SELECT total_changes() AS n").get(), writesBefore);
    await assert.rejects(() => routes.handle({ ...request, body: { source_id: "source-from-another-project", contains: "launch" } }), /请选择当前项目的来源/);
    await assert.rejects(() => routes.handle({ ...request, body: { source_id: data.source.source_id, contains: "x".repeat(201) } }), { code: "actions.input_invalid" });
  } finally { close(data); }
});

test("Feed rule validation cannot overwrite a rule edited while its selected capability was being checked", async () => {
  const data = harness();
  try {
    const rule = data.feed.createOutRule(DEMO_PROJECT_ID, { name: "原规则", match: { contains: "launch" } });
    const service = new ActionService();
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    service.registerProvider({ provider: { provider_id: "fixture.feed", title: "Feed", kind: "plugin", project_id: DEMO_PROJECT_ID },
      definitions: Object.values(feedRuleActions), handlers: createFeedRuleHandlers(data.feed, DEMO_PROJECT_ID, item => item, {
        catalog: async () => ({ choices: [], usages: [] }), recommendations: async () => ({ recommendations: [] }),
        preview: async () => ({ status: "ok", suggested_behavior_ids: [] }),
        validate: async reference => { entered(); await new Promise<void>(resolve => { release = resolve; }); return reference; },
      }) });
    const client = bindActionClient(service, () => ({ actor_id: "fixture", project_id: DEMO_PROJECT_ID, audience: "user", permissions: ["feed:read", "feed:write"] }));
    const pending = client.invoke(feedRuleActions.update, { rule_id: rule.rule_id, patch: {
      judgment: { capability_id: "fixture.judgment", version: 1, provider_id: "fixture" }, name: "旧页面修改" } });
    await ready;
    data.feed.updateOutRule(DEMO_PROJECT_ID, rule.rule_id, { name: "另一窗口的新修改" });
    release(); await assert.rejects(pending, { code: "feed.revision_conflict" });
    const saved = data.feed.listOutRules(DEMO_PROJECT_ID).find(value => value.rule_id === rule.rule_id)!;
    assert.equal(saved.name, "另一窗口的新修改"); assert.equal(saved.judgment, null);
  } finally { close(data); }
});
