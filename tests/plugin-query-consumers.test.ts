import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedQueryActions, feedItemActions } from "@molis-ai/molis-work-plugin-feed";
import { inboxActions } from "@molis-ai/molis-work-plugin-inbox";
import { scheduleActions } from "@molis-ai/molis-work-plugin-schedule";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { cachedMolisWorkWebView, declaredStageData } from "@molis-ai/molis-work-app-local-host";
import { informationActions } from "../apps/local-host/dist/information-actions.js";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";

test("Feed reads and warm Web projections use each owner's current authority, retain exact content, and recover without altering original records", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "plugin-query-consumers-"));
  // Feed's page routes are the project's Runtime plugin's (FI-7), so the project is one in the catalog that has Feed, Inbox and Schedule.
  const { project_id: projectId, database_path: databasePath } = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const { project_id } = await catalog.createProject({ display_name: "读取", actor_id: "test" });
    for (const plugin_id of ["feed", "inbox", "schedule"]) if (!catalog.listProjectPlugins(project_id).includes(plugin_id)) catalog.addProjectPlugin({ project_id, plugin_id, actor_id: "test" });
    return catalog.getProject(project_id);
  });
  const disabled = new Set<string>();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    actionAvailability: (_, action) => disabled.has(action.provider.provider_id) ? { available: false, code: "actions.plugin_disabled", reason: "测试中停用" } : { available: true } });
  const reference = molisWorkHostProjectReference({ databasePath, projectId });
  // Feed's actions declare the platform services they use, and a caller holds those too (4e-2f): its reads decrypt retained bodies
  // (`evidence:read`; the snapshot still leaves the body out unless asked for it), and a promotion settles the item's Inbox entries (`attention:write`).
  const caller: ActionCallContext = { actor_id: "reader", audience: "user", project_id: reference.project_id,
    permissions: [...new Set(["goals:read", "feed:read", "inbox:read", "schedule:read", "schedule:write", "feed:write", "goals:write", "context-ledger:write", "evidence:read", "attention:write", ...feedQueryActions.stage.action.permissions])] };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const runtime = await host.withProject(reference, r => r);
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, projectId).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "query-fixture" }).source;
    const item = feed.ingestItem({ source, externalId: "one", title: "独立材料", summary: "目录摘要", body: "正文只在获得读取权限后提供", occurredAt: new Date().toISOString(), attention: false }).item;
    feed.ensureInboxEntryForFeedItem(projectId, item.item_id, "manual");
    await actions.invoke(scheduleActions.createTask, { title: "原任务", instructions: "查阅原材料", time: "10:00" });
    const cache = new Map(), options = { databasePath, projectId, homeDirectory: home };
    const view = async () => ({ ...await cachedMolisWorkWebView(cache, runtime.store, options, actions),
      stage_data: await declaredStageData(["feed", "inbox"], () => actions) });
    // Schedule's stage reads its own data (`stage_data`), as the person and with only that read's permissions (T-133).
    const scheduleTasks = async () => ((await declaredStageData(["schedule"], action => bindActionClient(host.actionClient(reference),
      () => ({ ...caller, permissions: [...action.action.permissions] })))).schedule as { tasks: unknown[] } | undefined)?.tasks.length ?? 0;
    const first = await view();
    assert.equal(first.stage_data.feed.snapshot.feed_items.find(row => row.item_id === item.item_id)?.body, null);
    assert.equal(first.stage_data.inbox.entries.length, 1); assert.equal(await scheduleTasks(), 1);
    const read = await actions.invoke(feedQueryActions.item, { item_id: item.item_id });
    assert.deepEqual(read.item, feed.getFeedItem(projectId, item.item_id));
    // RAC-2507/2511/2512: real Runtime owners compose stage data through their declared public reads.
    const feedStage = await actions.invoke(feedQueryActions.stage, {});
    assert.equal(feedStage.snapshot.feed_items.find(row => row.item_id === item.item_id)?.body, null);
    assert.equal(feedStage.inbox_entries.some(row => row.subject_id === item.item_id), true);
    const inboxStage = await actions.invoke(inboxActions.stage, {});
    const ownedEntry = inboxStage.entries.find(row => row.subject_id === item.item_id);
    assert.ok(ownedEntry);
    assert.equal(inboxStage.subjects.find(row => row.entry_id === ownedEntry.entry_id)?.title, "独立材料");
    const reader = await actions.invoke(feedQueryActions.reader, { object_id: item.item_id });
    assert.equal(reader.item.body, "正文只在获得读取权限后提供");
    assert.equal(reader.inbox_active, true); assert.equal(reader.promote_available, true);
    disabled.add("io.molis.work.goals");
    assert.equal((await actions.invoke(feedQueryActions.reader, { object_id: item.item_id })).promote_available, false);
    disabled.delete("io.molis.work.goals");
    assert.equal("inbox_entries" in await actions.invoke(feedQueryActions.snapshot, {}), false, "Feed cannot grant Inbox access");
    await assert.rejects(host.actionClient(reference).invoke({ ...caller, permissions: [] }, feedQueryActions.item, { item_id: item.item_id }), { code: "actions.forbidden" });
    await assert.rejects(host.actionClient(reference).invoke({ ...caller, project_id: "foreign" }, feedQueryActions.item, { item_id: item.item_id }), { code: "actions.scope_mismatch" });
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}/projects/${encodeURIComponent(projectId)}`;
    assert.equal((await fetch(`${base}/api/plugins/io.molis.work.feed/snapshot`)).status, 200);
    assert.match(await (await fetch(`${base}/api/stage/feed/objects/${encodeURIComponent(item.item_id)}?surface=persisted-detail`)).text(), /正文只在获得读取权限后提供/);
    disabled.add("io.molis.work.feed"); disabled.add("io.molis.work.schedule");
    const revoked = await view();
    assert.strictEqual(revoked.goals, first.goals, "the authorized Goals cache is still warm");
    assert.equal(revoked.stage_data.feed, undefined);
    assert.equal("feed_connector_auth" in revoked, false); assert.equal(await scheduleTasks(), 0);
    assert.equal(revoked.stage_data.inbox.entries.length, 1, "Inbox retains its own authority");
    for (const route of ["/api/plugins/io.molis.work.feed/snapshot", `/api/stage/feed/objects/${encodeURIComponent(item.item_id)}?surface=persisted-detail`]) {
      const response = await fetch(base + route); assert.equal(response.status, 403);
      assert.equal((await response.json() as { code: string }).code, "actions.plugin_disabled");
    }
    disabled.add("io.molis.work.inbox"); assert.equal((await view()).stage_data.inbox, undefined);
    disabled.clear();
    const recovered = await view();
    assert.strictEqual(recovered.goals, first.goals);
    assert.equal(recovered.stage_data.feed.snapshot.feed_items.length, 1);
    feed.ingestItem({ source, externalId: "two", title: "没有 Goals 事件的新材料", summary: "摘要", occurredAt: new Date().toISOString(), attention: false });
    const restored = await view();
    assert.ok(restored.snapshot.cursor >= first.snapshot.cursor);
    assert.equal(restored.stage_data.feed.snapshot.feed_items.length, 2); assert.equal(restored.stage_data.inbox.entries.length, 1);
    assert.equal(await scheduleTasks(), 1);
    assert.equal((await fetch(`${base}/api/plugins/io.molis.work.feed/snapshot`)).status, 200);
    const promoted = await actions.invoke(feedItemActions.promote, { item_id: item.item_id, expected_revision: item.revision });
    const context = await actions.invoke(feedQueryActions.linkedContext, { goal_id: promoted.goal_id, item_id: item.item_id });
    assert.match(context!.source_context, /正文只在获得读取权限后提供/);
    assert.equal(await actions.invoke(feedQueryActions.linkedContext, { goal_id: promoted.goal_id, item_id: "not-linked" }), null);
    disabled.add("io.molis.work.goals");
    await assert.rejects(actions.invoke(feedQueryActions.linkedContext, { goal_id: promoted.goal_id }), { code: "actions.plugin_disabled" });
    disabled.clear();
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); await rm(home, { recursive: true, force: true });
  }
});

for (const phase of ["dispatch", "response"] as const) {
  test(`RAC-1180 RAC-1182 information proposals retain dependency authority during model ${phase} waits`, { timeout: 30_000 }, async () => {
    const home = await mkdtemp(join(tmpdir(), "information-authority-")), databasePath = join(home, "project.sqlite");
    await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
    seedDemoBoard(databasePath);
    let disabled = false, dispatched = 0, pause = true;
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const host = new MolisWorkLocalHost({ homeDirectory: home,
      completeText: async (_prompt, options) => {
        if (phase === "dispatch" && pause) { entered.resolve(); await release.promise; }
        await options?.beforeDispatch?.(); dispatched++;
        if (phase === "response" && pause) { entered.resolve(); await release.promise; }
        return JSON.stringify({ message: "先补充可用材料", action: null });
      },
      actionAvailability: (_, view) => disabled && view.capability_id === inboxActions.list.capability_id
        ? { available: false, code: "actions.plugin_disabled", reason: "Inbox 已停用" } : { available: true },
    });
    const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
    // The plan reads Feed's snapshot, which a caller reaches only holding `evidence:read` too (4e-2f).
    const caller: ActionCallContext = { actor_id: "planner", audience: "user", project_id: reference.project_id, permissions: ["feed:read", "inbox:read", "model:invoke", "evidence:read"] };
    const actions = bindActionClient(host.actionClient(reference), () => caller);
    try {
      const pending = actions.invoke(informationActions.plan, { prompt: "整理一下当前材料" });
      const refused = assert.rejects(pending, { code: "actions.plugin_disabled" });
      await Promise.race([entered.promise, pending.then(() => { throw new Error("missed model wait"); })]);
      disabled = true; release.resolve(); await refused;
      assert.equal(dispatched, phase === "dispatch" ? 0 : 1);
      await assert.rejects(actions.invoke(informationActions.plan, { prompt: "整理" }), { code: "actions.plugin_disabled" });
      disabled = false; pause = false;
      const result = await actions.invoke(informationActions.plan, { prompt: "整理" });
      assert.equal(result.action, null); assert.equal(result.context.project_id, reference.project_id);
      // RAC-1182: the Feed and Inbox dependencies are exactly the two capability ids, with no pinned provider; the directory supplies the one provider of each.
      assert.deepEqual(informationActions.plan.action.required_actions, [
        { capability_id: feedQueryActions.snapshot.capability_id, version: 1 },
        { capability_id: inboxActions.list.capability_id, version: 1 },
      ]);
      assert.equal(dispatched, phase === "dispatch" ? 1 : 2);
      const runtime = await host.withProject(reference, r => r);
      assert.equal(createLocalFeedApplication(runtime.store.db).snapshot(DEMO_PROJECT_ID).feed_items.length, 0);
    } finally { release.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); }
  });
}

// RAC-2507–2510: an unknown plugin exercises the actual owner binding rather than a catalog-specific test renderer.
import { ActionError, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { StagePageModel, UiRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { serveHomeRuntime, deferred } from "./fixtures/home-runtime.js";

for (const selected of ["project", "home"] as const) test(`RAC-2507 RAC-2508 RAC-2509 RAC-2510 stage/objects retain the selected ${selected} owner and finite surfaces`, { timeout: 90_000 }, async t => {
  const id = `io.molis.work.example.stage-${selected}`, contribution = `${id}.main`, foreign = `${id}.foreign`, permission = `${selected}-stage:read`;
  const action = (suffix: string, object = false): ActionDefinition => ({ capability_id: `${id}.${suffix}`, version: 1, operation: "query", action: {
    title: suffix, description: "Owned read", kind: "query", scope: "project", audiences: ["user"], permissions: [permission], subject_kinds: [],
    input_schema: { type: "object", properties: object ? { object_id: { type: "string", minLength: 1 } } : {}, required: object ? ["object_id"] : [], additionalProperties: false }, output_schema: {} } });
  const stage = action("stage"), object = action("object", true), other = action("other");
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: "Owner probe", kind: "app",
    publisher: { publisher_id: "example", signature: "example-stage" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission, required: true, reason: "Read this owner" }], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, actions: [stage, object, other],
    ui: { contributions: [contribution, foreign], views: [{ view_id: "main", slot: "stage", title: "Owner", contribution_id: contribution,
      stage_data: { action: stage.capability_id, object_action: object.capability_id }, stage_surfaces: ["workbench", "source-workbench"] },
      { view_id: "foreign", slot: "side", title: "Other contribution", contribution_id: foreign }] } };
  const reads = { stage: 0, object: 0, other: 0 }, draws: UiRenderRequest[] = [], seen: Array<{ caller: ActionExecutionContext; input: unknown }> = [];
  let held: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  const owner = (half: "home" | "project"): PluginDefinition => ({ manifest, start() {
    return { kind: "app", actions: half === selected ? [stage, object].map(definition => ({ ...definition, async handle(caller, input) {
      reads[definition === stage ? "stage" : "object"]++; seen.push({ caller, input });
      const wait = held; held = undefined;
      if (wait && definition === object) { wait.entered.resolve(); await wait.release.promise; }
      return { half, sequence: reads.stage, input };
    } })) : [{ ...other, handle() { reads.other++; return { half }; } }], views: half === selected ? [{
      descriptor: { contribution_id: contribution, kind: "embedded", label: "Owner", slots: [], surfaces: [
        ...["workbench", "source-workbench", "persisted-detail", "frame-block", "workbench-fragment"].map(surface_id => ({ surface_id, target_slot_id: "workbench.main", format: "declarative-html" })),
        ...["directory", "source-directory"].map(surface_id => ({ surface_id, target_slot_id: "workbench.directory", format: "declarative-html" })),
        { surface_id: "overlay", target_slot_id: "workbench.overlay", format: "declarative-html" },
      ] }, render(request) { draws.push(request); const model = request.model as StagePageModel<{ half: string; sequence: number }>;
        assert.equal(model.data?.half, selected); return `<article data-owner-probe="${request.surface}">${model.data.half}:${model.data.sequence}</article>`; } },
      { descriptor: { contribution_id: foreign, kind: "embedded", label: "Foreign", slots: [], surfaces: [{ surface_id: "foreign-object", target_slot_id: "workbench.main", format: "declarative-html" }] },
        render() { throw new Error("foreign contribution must never render"); } }] : [] };
  } });
  const { host, project, request } = await serveHomeRuntime(t, { pluginFixtures: { home: [{ definition: owner("home"), dual_instance: true }], project: [owner("project")] } });
  const one = await project("Owner surfaces"), base = `/projects/${one.project_id}`, path = `${base}/api/stage/${id}`;
  const page = await request(base); assert.equal(page.status, 200); const html = await page.text();
  const expected = ["workbench", "source-workbench", "directory", "source-directory", "overlay"];
  assert.deepEqual(draws.map(draw => draw.surface), expected); assert.deepEqual(reads, { stage: 1, object: 0, other: 0 });
  for (const surface of expected) assert.equal(html.split(`data-owner-probe="${surface}"`).length - 1, 1, surface);
  assert.equal(new Set(draws.map(draw => (draw.model as StagePageModel).data)).size, 1, "all surfaces use the one stage read result");
  assert.equal(seen[0]!.caller.project_id, one.project_id);
  draws.length = 0; seen.length = 0;
  for (const surface of ["persisted-detail", "frame-block"]) {
    const response = await request(`${path}/objects/node%252Fone?surface=${surface}&actor_id=imposter&project_id=foreign&extra=never`);
    assert.equal(response.status, 200); assert.match(await response.text(), new RegExp(`data-owner-probe="${surface}"`));
    assert.deepEqual(seen.at(-1)!.input, { object_id: "node%2Fone" }); assert.equal(seen.at(-1)!.caller.actor_id, LOCAL_PERSON_ACTOR_ID);
    assert.equal(seen.at(-1)!.caller.project_id, one.project_id);
    const model = draws.at(-1)!.model as StagePageModel;
    assert.deepEqual(model.object, { id: "node%2Fone", surface }); assert.equal(model.request, undefined);
  }
  const before = reads.object, rendered = draws.length;
  for (const suffix of ["/objects/", "/objects/a/b?surface=persisted-detail", "/objects/%GG?surface=persisted-detail", "/objects/%2F?surface=persisted-detail",
    "/objects/a", "/objects/a?surface=", "/objects/a?surface=frame-block&surface=persisted-detail", "/objects/a?surface=directory", "/objects/a?surface=foreign-object", "/objects/a?surface=unknown"]) {
    const response = await request(path + suffix); assert.notEqual(response.status, 200, suffix); await response.text();
  }
  assert.equal(reads.object, before); assert.equal(draws.length, rendered, "invalid requests never read or render");
  const platform = selected === "home" ? await host.homePlugins!.ready() : await host.withProject(one.reference, runtime => runningProjectPlatform(runtime.store, one.project_id));
  assert.ok(platform); const install = platform.supervisor.state(id)!.install_id!;
  held = { entered: deferred(), release: deferred() }; const wait = held;
  const pending = request(`${path}/objects/held?surface=persisted-detail`);
  await wait.entered.promise; await platform.runtime.stop(install); await platform.supervisor.restart(id); wait.release.resolve();
  const late = await pending; assert.notEqual(late.status, 200); assert.doesNotMatch(await late.text(), /data-owner-probe/);
  assert.equal(draws.length, rendered); assert.equal(reads.other, 0, "a late answer never revives the other half or catalog");
});
