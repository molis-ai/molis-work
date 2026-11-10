import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import type { SurfaceHomeDisplay } from "@molis-ai/molis-work-design-system";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

const endpoint = "/api/host/surface-home";
const owner = (id: string) => "io.molis.work." + id;
const card = (home: SurfaceHomeDisplay, id: string) => home.groups.find(group => group.owner_plugin_id === owner(id));
async function json<T>(response: Response, status = 200): Promise<T> {
  const value = await response.json() as T;
  assert.equal(response.status, status, JSON.stringify(value));
  return value;
}

test("SCS-07 SCS-08 SCS-11 WBR-24: real Goals, Inbox, Coding and Feed supply one project home and their original routes", { timeout: 60_000 }, async t => {
  let modelCalls = 0;
  const f = await serveHomeRuntime(t, { completeText: async () => { modelCalls++; throw new Error("Home must not call a model"); } });
  const project = await f.project("Home consumers"), prefix = "/projects/" + project.project_id;
  for (const plugin of ["inbox", "coding", "feed"]) await json(await f.request("/api/settings/projects/" + project.project_id + "/plugins", { method: "POST", body: { plugin_id: plugin } }));
  assert.equal((await f.request(prefix + "/")).status, 200);
  const read = (body: unknown = {}) => f.request(prefix + endpoint, { method: "POST", body }).then(response => json<SurfaceHomeDisplay>(response));
  const click = (id: string, target: unknown) => f.request(prefix + endpoint + "/click", { method: "POST", body: { owner_plugin_id: owner(id), target } });
  const invocations = new Map<string, number>(), log = f.host.callLog!, record = log.record;
  log.record = function (caller, action, outcome) {
    if (caller.project_id === project.project_id && outcome.ok) invocations.set(action.capability_id, (invocations.get(action.capability_id) ?? 0) + 1);
    return record.call(this, caller, action, outcome);
  };
  t.after(() => { log.record = record; });
  const count = (action: string) => invocations.get(action) ?? 0;

  const empty = await read({ home_order: [owner("coding"), owner("goals")] });
  for (const id of ["goals", "inbox", "coding", "feed"]) assert.equal(card(empty, id)?.state, "ok", id);
  assert.equal(empty.groups.find(group => group.kind === "plugin")?.owner_plugin_id, owner("coding"));
  assert.equal(empty.display.rows.length, 0);
  assert.equal(empty.groups.some(group => group.kind === "continue"), false);
  const startGoal = card(empty, "goals")?.plugin_card?.start?.[0];
  const startCoding = card(empty, "coding")?.plugin_card?.start?.[0];
  assert.ok(startGoal && startCoding);
  const goalBefore = count("goals.create");
  const nav = await json<{ kind: string; selection: { panel: string }; producer: string }>(await click("goals", startGoal));
  assert.equal(nav.kind, "stage");
  assert.equal(nav.selection.panel, "create-dialog");
  assert.ok(nav.producer);
  assert.equal(count("goals.create"), goalBefore);

  const codingBefore = count("coding.sessions.create");
  const started = await json<{ kind: string; result: { session: { session_id: string; runtime_session_id: string | null } };
    stage: { shell_key: string; item_id: string } }>(await click("coding", startCoding));
  assert.equal(started.kind, "invoked");
  assert.equal(started.stage?.shell_key, "coding");
  assert.equal(started.stage?.item_id, started.result.session.session_id);
  assert.equal(started.result.session.runtime_session_id, null);
  assert.equal(count("coding.sessions.create") - codingBefore, 1);

  const newGoal = await json<{ goal: { goal_id: string } }>(await f.request(prefix + "/api/plugins/io.molis.work.goals/goals", {
    method: "POST", body: { title: "Home Goals owner", outcome: "A visible result", idempotency_key: "goals-home-consumer" },
  }), 201);
  const items = await f.host.withProject(project.reference, runtime => {
    const feed = createLocalFeedApplication(runtime.store.db), sources = createLocalFeedSourceService(runtime.store.db, project.project_id);
    const rss = sources.register({ kind: "custom_rss", feed_url: "https://example.com/home-consumer.xml" }).source;
    const gmail = feed.sources.upsert({ ...rss, source_id: "fixture-gmail", name: "Gmail for this project", kind: "gmail", sync_kind: "gmail",
      status: "error", schedule: { mode: "manual" }, config: {}, last_error_code: "account_offline" });
    const removed = feed.sources.upsert({ ...rss, source_id: "fixture-retired", name: "Former RSS" });
    const ingest = (source: typeof rss, title: string) => feed.ingestItem({ source, externalId: title, title, summary: title,
      occurredAt: new Date().toISOString(), attention: false }).item.item_id;
    const rssId = ingest(rss, "RSS material"), gmailId = ingest(gmail, "Gmail material");
    const absentId = ingest({ ...rss, source_id: "missing-source" }, "Missing-source material");
    const retiredId = ingest(removed, "Retired-source material");
    feed.sources.retire(project.project_id, removed.source_id, "retain_history");
    feed.createInboxEntry({ projectId: project.project_id, subjectType: "source_fault", subjectId: gmail.source_id, reason: "source_fault" });
    return { rssId, gmailId, absentId, retiredId, sourceId: gmail.source_id };
  });
  const before = Object.fromEntries(["goals", "inbox", "coding", "feed"].flatMap(id =>
    ["overview", "values"].map(action => [id + ".presentation." + action, count(id + ".presentation." + action)])));
  const syncRuns = () => f.host.withProject(project.reference, runtime => createLocalFeedApplication(runtime.store.db).snapshot(project.project_id).runs);
  const previousRuns = await syncRuns();
  const next = await read();
  assert.deepEqual(await syncRuns(), previousRuns, "a real Home read neither starts nor records a Feed pull");
  assert.equal(count("feed.sources.sync"), 0);
  for (const id of ["goals", "inbox", "coding", "feed"]) {
    assert.equal(count(id + ".presentation.overview") - before[id + ".presentation.overview"]!, 1, id);
    assert.equal(count(id + ".presentation.values") - before[id + ".presentation.values"]!, 2, id + " has one rule batch and one display batch");
  }
  const row = (kind: string, id: string) => next.display.rows.find(row => row.subject.kind === kind && row.subject.id === id);
  const values = (kind: string, id: string) => {
    const found = row(kind, id);
    assert.ok(found && "values" in found.read, kind + " " + id);
    return found.read.values;
  };
  assert.equal(values("goal", newGoal.goal.goal_id)?.title, "Home Goals owner");
  assert.equal(values("coding_session", started.result.session.session_id)?.status, "idle");
  assert.equal(values("feed_item", items.rssId)?.held_in, "project");
  assert.equal(values("feed_item", items.gmailId)?.held_in, "project");
  assert.equal(values("feed_item", items.absentId)?.held_in, undefined);
  assert.equal(values("feed_item", items.retiredId)?.held_in, undefined);
  const attention = next.groups.find(group => group.kind === "attention")!;
  assert.equal(attention.items.filter(item => item.owner_plugin_id === owner("feed")).length, 1);
  assert.equal(attention.items[0]?.subject.id, items.sourceId);
  assert.equal(card(next, "feed")?.hidden_above?.count, 1);
  assert.equal(card(next, "feed")?.items.some(item => item.subject.id === items.sourceId), false);
  const source = row("source", items.sourceId)!;
  const target = { kind: "object", subject: source.subject, installation: source.installation };
  const sourceNav = await json<{ selection: { surface: string }; item_id: string }>(await click("feed", target));
  assert.deepEqual([sourceNav.selection.surface, sourceNav.item_id], ["source-workbench", items.sourceId]);
  await json(await click("feed", { ...target, installation: { ...target.installation, installation_generation: "changed" } }), 409);
  await json(await click("inbox", target), 409);
  assert.equal(modelCalls, 0);
});

test("WBR-24 SCS-08: Feed reads the personal partition and discards the whole reply after display permission changes", { timeout: 60_000 }, async t => {
  const f = await serveHomeRuntime(t);
  const prefix = "/projects/personal";
  assert.equal((await f.request(prefix + endpoint, { method: "POST", body: {} })).status, 404, "a cold composition does not create personal space");
  assert.equal((await f.request(prefix + "/")).status, 200, "the real personal space entry opens the partition");
  const project = f.host.ensureWebCatalog(f.home, openMolisWorkProjectCatalog).read(catalog => catalog.getProject("personal"));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: "personal" });
  await json(await f.request("/api/settings/projects/personal/plugins", { method: "POST", body: { plugin_id: "feed" } }));
  await f.request(prefix + "/");
  const { itemId, records, install } = await f.host.withProject(reference, runtime => {
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, "personal").register({ kind: "custom_rss", feed_url: "https://example.com/personal-home.xml" }).source;
    const itemId = feed.ingestItem({ source, externalId: "personal", title: "Personal material", summary: "", occurredAt: new Date().toISOString(), attention: false }).item.item_id;
    const records = new SqlitePluginRuntimeRepository(runtime.store.db);
    const install = records.list().find(record => record.plugin_id === owner("feed"));
    assert.ok(install?.grants.includes("feed:read"));
    return { itemId, records, install };
  });
  const request = () => f.request(prefix + endpoint, { method: "POST", body: {} });
  const result = await json<SurfaceHomeDisplay>(await request());
  const item = result.display.rows.find(row => row.subject.id === itemId);
  assert.ok(item && "values" in item.read);
  assert.equal(item.read.values?.held_in, "personal");
  assert.equal(result.groups.find(group => group.kind === "attention")?.items.length, 0);

  const log = f.host.callLog!, record = log.record;
  let values = 0;
  log.record = function (caller, action, outcome) {
    record.call(this, caller, action, outcome);
    // This is the production second (display) read, after its owner has answered, before HTTP delivery.
    if (caller.project_id === "personal" && action.capability_id === "feed.presentation.values" && outcome.ok && ++values === 2) {
      records.save({ ...install, grants: install.grants.filter(permission => permission !== "feed:read") });
    }
  };
  try {
    const response = await request();
    const body = await response.json() as { groups?: unknown; display?: unknown; code?: string };
    assert.ok(response.status === 403 || response.status === 409, JSON.stringify(body));
    assert.equal(body.groups, undefined);
    assert.equal(body.display, undefined);
    assert.equal(values, 2);
  } finally { log.record = record; records.save(install); }
});

test("SCS-11: Coding completes the original create once when its original read route becomes unavailable", { timeout: 60_000 }, async t => {
  let refuseRead = false;
  const f = await serveHomeRuntime(t, { actionAvailability: (_caller, view) =>
    refuseRead && view.capability_id === "coding.subject.read"
      ? { available: false, code: "actions.forbidden", reason: "Reader withdrawn" } : { available: true } });
  const project = await f.project("Coding home receipt"), prefix = "/projects/" + project.project_id;
  await json(await f.request("/api/settings/projects/" + project.project_id + "/plugins", { method: "POST", body: { plugin_id: "coding" } }));
  await f.request(prefix + "/");
  const read = () => f.request(prefix + endpoint, { method: "POST", body: {} }).then(response => json<SurfaceHomeDisplay>(response));
  const click = (target: unknown) => f.request(prefix + endpoint + "/click", { method: "POST", body: { owner_plugin_id: owner("coding"), target } });
  const start = card(await read(), "coding")?.plugin_card?.start?.[0];
  assert.ok(start);
  const log = f.host.callLog!, record = log.record;
  let created = 0;
  log.record = function (caller, action, outcome) {
    record.call(this, caller, action, outcome);
    if (caller.project_id === project.project_id && action.capability_id === "coding.sessions.create" && outcome.ok) { created++; refuseRead = true; }
  };
  try {
    const result = await json<{ kind: string; stage?: unknown; retry_open: unknown; result: { session: { session_id: string } } }>(await click(start));
    assert.equal(result.kind, "invoked");
    assert.equal(result.stage, undefined);
    assert.ok(result.retry_open);
    await json(await click(result.retry_open), 409);
    refuseRead = false;
    const stage = await json<{ item_id: string }>(await click(result.retry_open));
    assert.equal(stage.item_id, result.result.session.session_id);
    const rows = (await read()).display.rows.filter(row => row.owner === owner("coding"));
    assert.deepEqual(rows.map(row => row.subject.id), [result.result.session.session_id]);
    assert.equal(created, 1);
  } finally { log.record = record; }
});
