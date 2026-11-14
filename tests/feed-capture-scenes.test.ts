import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { FEED_ACTION_PERMISSIONS, feedCaptureScene, feedRuleActions, feedSceneBindingId, createFeedCaptureTrigger, type FeedJudgmentCatalog, type FeedOutRuleRecord, type FeedSourceRecord } from "@molis-ai/molis-work-plugin-feed";
import { bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/dist/judgment-rules-host.js";
import { createLocalFeedApplication, createLocalFeedSourceService, listTestFeedSourceCatalog } from "./fixtures/feed-library.js";
import { openTestHome } from "./fixtures/test-home.js";

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "feed-capture-scenes-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "捕捉判断", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "feed", actor_id: "test" });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "test", project_id: project.project_id, audience: "user",
    permissions: [...FEED_ACTION_PERMISSIONS, "functions:invoke"] };
  const inputs: string[] = [];
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture" }, provider: { async evaluate(_key, record, input) {
    inputs.push(input);
    if (input.includes("failure")) throw Object.assign(new Error("private detail"), { code: "fixture.failure" });
    const choice = input.includes("leave") ? "feed.open" : "inbox.admit";
    return { primitive: "choice", choice, noul: null, score: null, legend: null, probabilities: { [choice]: 1 }, confidence: null, model: record.model };
  } } };
  catalog.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions });
  const history = () => withFunctionsService(home, service => service.listJudgments(), functions);
  return { home, project, reference, caller, inputs, functions, host, history,
    close: async () => { await host.close(); await rm(home, { recursive: true, force: true }); } };
}

test("Feed capture runs through the common scene, keeps judgment history and survives a reopen", async () => {
  const f = await fixture();
  try {
    // A rule saved before the project runtime opens, with a judgment already on record.
    const store = new LocalProjectDatabase(f.project.database_path);
    const saved = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, f.project.project_id).register({ kind: "web_query", query: "capture" }).source;
    const judgment = { capability_id: "functions.published.system_admit_inbox", version: 1, provider_id: "system.functions" };
    const original = saved.outRules.create(f.project.project_id, { name: "原捕捉规则", match: { source_id: source.source_id }, admission: "inbox", judgment });
    withFunctionsService(f.home, service => service.recordSceneJudgment({ function_key: "system_admit_inbox", function_version: 1,
      subject: { kind: "feed_item", id: "old-item", project_id: f.project.project_id }, scene_id: "feed.capture", outcome: "ok", suggested_behavior_ids: ["feed.open"], error_code: null }), f.functions);
    store.close();
    const runtime = await f.host.withProject(f.reference, runtime => runtime);
    const scenes = f.host.sceneClient(f.reference);
    // The project's Runtime plugins (Feed) attach as it opens; a discovery waits for them.
    await f.host.actionClient(f.reference).discover(f.caller);
    const feed = createLocalFeedApplication(runtime.store.db, { captureJudgment: createFeedCaptureTrigger({ scenes, context: () => f.caller, projectId: runtime.project_id }) });
    const opened = feed.outRules.list(runtime.project_id).find(rule => rule.rule_id === original.rule_id)!;
    assert.deepEqual(opened.judgment, judgment);
    assert.ok(f.history().some(record => record.subject.id === "old-item"));
    assert.ok((await scenes.usages(f.caller)).some(use => use.binding_id === feedSceneBindingId(original.rule_id) && use.availability.available));
    const ids = ["admit", "leave", "failure"].map(title => feed.ingestItem({ source, externalId: title, title, summary: "原消息正文", occurredAt: new Date().toISOString(), attention: false }).item.item_id);
    await feed.flushPendingJudgments();
    assert.equal(f.inputs.length, 3);
    const entries = feed.listInboxEntries(runtime.project_id).filter(entry => ids.includes(entry.subject_id));
    assert.equal(entries.length, 2);
    assert.equal(entries.find(entry => entry.subject_id === ids[2])!.detail.needs_review, true);
    assert.equal(f.history().find(record => record.subject.id === ids[2])!.error_code, "fixture.failure");
    assert.ok(!JSON.stringify(f.history()).includes("private detail"));
    await bindActionClient(f.host.actionClient(f.reference), () => f.caller).invoke(feedRuleActions.update, { rule_id: original.rule_id, patch: { enabled: false } });
    await feed.evaluateItems(runtime.project_id, ids, f.caller);
    assert.equal(f.inputs.length, 3, "paused rules cannot invoke the model");
    const savedRevision = opened.revision;
    await f.host.close();
    const reopened = new MolisWorkLocalHost({ homeDirectory: f.home, functions: f.functions });
    try {
      const again = await bindActionClient(reopened.actionClient(f.reference), () => f.caller).invoke(feedRuleActions.list, {});
      const rule = again.rules.find(rule => rule.rule_id === original.rule_id)!;
      assert.equal(rule.enabled, false); assert.deepEqual(rule.judgment, judgment); assert.notEqual(rule.revision, savedRevision);
      assert.equal(f.history().length, 4);
    } finally { await reopened.close(); }
  } finally { await f.close(); }
});

test("Feed binds unknown judgments and rejects stale rule, item, provider and authority results", { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const runtime = await f.host.withProject(f.reference, runtime => runtime);
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, runtime.project_id).register({ kind: "web_query", query: "capture" }).source;
    const definition: ActionDefinition = { capability_id: `fixture.capture.${f.project.project_id}`, version: 1, operation: "command", action: {
      title: "陌生判断", description: "Plugin-owned decision", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: [], subject_kinds: ["feed_item"],
      input_schema: feedCaptureScene.input_schema, output_schema: feedCaptureScene.result_schema, output_type: feedCaptureScene.result_type } };
    let started!: () => void, release!: () => void;
    let delayed = false, calls = 0;
    const provider = `provider.${f.project.project_id}`;
    const stop = f.host.actionRegistry(f.reference).registerProvider({ provider: { provider_id: provider, title: "陌生插件", kind: "plugin", project_id: f.project.project_id },
      definitions: [definition], handlers: [{ ...definition, handle: async () => { calls++; if (delayed) { started(); await new Promise<void>(resolve => { release = resolve; }); } return { status: "ok", suggested_behavior_ids: ["inbox.admit"] }; } }] });
    const actions = bindActionClient(f.host.actionClient(f.reference), () => f.caller), scenes = f.host.sceneClient(f.reference);
    await assert.rejects(f.host.actionClient(f.reference).invoke({ ...f.caller, permissions: f.caller.permissions.filter(permission => permission !== "inbox:write") }, feedRuleActions.create,
      { name: "无权自动入箱", match: { source_id: source.source_id }, admission: "inbox" }), { code: "actions.forbidden" });
    assert.ok(!feed.outRules.list(runtime.project_id).some(rule => rule.name === "无权自动入箱"));
    let rule = (await actions.invoke(feedRuleActions.create, { name: "陌生能力规则", match: { source_id: source.source_id }, admission: "inbox",
      judgment: { capability_id: definition.capability_id, version: 1, provider_id: provider } })).rule;
    assert.deepEqual(rule.judgment, { capability_id: definition.capability_id, version: 1, provider_id: provider });
    const item = feed.ingestItem({ source, externalId: "item", title: "需要处理", summary: "原文", occurredAt: new Date().toISOString(), attention: false }).item;
    const run = (caller = f.caller) => scenes.runScene(caller, feedCaptureScene, feedSceneBindingId(rule.rule_id), { rule_id: rule.rule_id, item_id: item.item_id });
    await run();
    assert.equal(f.history().length, 1); assert.equal(feed.listInboxEntries(runtime.project_id).filter(entry => entry.subject_id === item.item_id).length, 1);
    assert.equal(f.history()[0]!.function_key, definition.capability_id);
    await assert.rejects(scenes.runScene({ ...f.caller, permissions: f.caller.permissions.filter(permission => permission !== "inbox:write") }, feedCaptureScene,
      feedSceneBindingId(rule.rule_id), { rule_id: rule.rule_id, item_id: item.item_id }), { code: "actions.forbidden" });
    assert.equal(calls, 1);
    const race = async (change: () => unknown | Promise<unknown>, code: string) => {
      delayed = true; const ready = new Promise<void>(resolve => { started = resolve; }); const pending = run();
      await ready; await change(); release(); await assert.rejects(pending, { code }); assert.equal(f.history().length, 1);
    };
    await race(() => { rule = feed.outRules.update(runtime.project_id, rule.rule_id, { name: "新规则名" }); }, "actions.binding_changed");
    await race(() => feed.setDisposition(runtime.project_id, item.item_id, "saved"), "actions.subject_changed");
    delayed = true;
    let revoked = false;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const pending = run({ ...f.caller, validate_authority: () => { if (revoked) throw Object.assign(new Error("revoked"), { code: "fixture.revoked" }); } });
    await ready; revoked = true; release(); await assert.rejects(pending, { code: "fixture.revoked" });
    assert.equal(f.history().length, 1, "revocation while an unknown judgment runs must prevent history and admission");
    const manualReady = new Promise<void>(resolve => { started = resolve; });
    const manualPending = actions.invoke(feedRuleActions.evaluate, { item_ids: [item.item_id] });
    await manualReady;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const changed = await Promise.race([actions.invoke(feedRuleActions.update, { rule_id: rule.rule_id, patch: { name: "处理期间修改" } }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Feed judgment blocked the project queue")), 2000); })]);
      rule = changed.rule;
    } finally { clearTimeout(timer); release(); }
    await assert.rejects(manualPending, { code: "actions.binding_changed" });
    assert.equal(f.history().length, 1, "manual processing must report invalidated work, not claim it was applied");
    await race(() => stop(), "actions.scene_incompatible");
    assert.equal((await scenes.usages(f.caller)).find(use => use.binding_id === feedSceneBindingId(rule.rule_id))!.availability.available, false);
    await actions.invoke(feedRuleActions.update, { rule_id: rule.rule_id, patch: { name: "失效后仍能编辑", enabled: false } });
    await assert.rejects(actions.invoke(feedRuleActions.update, { rule_id: rule.rule_id, patch: { enabled: true } }), { code: "actions.binding_invalid" });
    assert.equal((await actions.invoke(feedRuleActions.list, {})).rules.find(value => value.rule_id === rule.rule_id)!.enabled, false);
    assert.equal(calls, 6);
  } finally { await f.close(); }
});

test("BRC-05 S-89 a Feed choice from a real GET cannot bind, preview, or run after its provider changes", { timeout: 30_000 }, async t => {
  const home = await openTestHome(t);
  const host: MolisWorkLocalHost = home.host;
  const project = await home.createProject("Stale scene candidate", ["feed"]);
  const api = `/projects/${encodeURIComponent(project.project_id)}/api/plugins/io.molis.work.feed`;
  const rules = api + "/out-rules", preview = rules + "/preview-judgment";
  const { source } = await home.web.post<{ source: FeedSourceRecord }>(api + "/sources", { kind: "rss", definition_id: listTestFeedSourceCatalog()[0]!.id });
  const item = await host.withProject(project.reference, runtime => createLocalFeedApplication(runtime.store.db).ingestItem({
    source, externalId: "n49-preview", title: "Launch note", summary: "Original text", occurredAt: new Date().toISOString(), attention: false,
  }).item);
  const definition: ActionDefinition = { capability_id: "fixture.n49.stale_judgment", version: 1, operation: "command", action: {
    title: "Original judgment", description: "Judges a Feed item", kind: "judgment", scope: "project", audiences: ["user", "workflow"], permissions: [],
    subject_kinds: ["feed_item"], input_schema: feedCaptureScene.input_schema, output_schema: feedCaptureScene.result_schema, output_type: feedCaptureScene.result_type,
  } };
  let invoked = 0;
  const register = (provider_id: string) => host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id, title: provider_id, kind: "system", project_id: project.project_id }, definitions: [definition],
    handlers: [{ ...definition, handle() { invoked++; return { status: "ok", suggested_behavior_ids: ["feed.open"] }; } }],
  });
  const remove = register("fixture.original");
  t.after(remove);
  const choice = (await home.web.get<FeedJudgmentCatalog>(rules + "/judgments")).choices.find(row => row.reference.capability_id === definition.capability_id);
  assert.ok(choice?.available);
  assert.equal(choice.reference.provider_id, "fixture.original");
  const input = { name: "Saved with original provider", source_id: source.source_id, judgment: choice.reference, admission: "suggest" };
  const saved = (await home.web.post<{ rule: FeedOutRuleRecord }>(rules, input)).rule;
  const previewInput = { item_id: item.item_id, judgment: choice.reference };
  assert.deepEqual(await home.web.post(preview, previewInput), { status: "ok", suggested_behavior_ids: ["feed.open"] });
  const history = () => withFunctionsService(home.home, service => service.listJudgments());
  const before = history();

  remove();
  t.after(register("fixture.replacement"));
  const invalid = { code: "actions.binding_invalid", message: /原引用不能自动替换/ };
  await assert.rejects(home.web.post(rules, { ...input, name: "Refused binding" }), invalid);
  await assert.rejects(home.web.post(preview, previewInput), invalid);
  const caller: ActionCallContext = { actor_id: "owner", project_id: project.project_id, audience: "user", permissions: FEED_ACTION_PERMISSIONS };
  await assert.rejects(host.sceneClient(project.reference).runScene(caller, feedCaptureScene, feedSceneBindingId(saved.rule_id), {
    rule_id: saved.rule_id, item_id: item.item_id,
  }), { code: "actions.scene_incompatible", message: /原引用不能自动替换/ });
  assert.deepEqual(await home.web.get(rules), { rules: [saved] }, "no new rule and the existing binding revision is unchanged");
  assert.deepEqual(history(), before, "no judgment record was written");
  assert.equal(invoked, 1, "neither the removed judgment nor its replacement ran");
  const latest = await home.web.get<FeedJudgmentCatalog>(rules + "/judgments");
  assert.ok(latest.choices.some(row => row.reference.provider_id === "fixture.replacement" && row.available));
  assert.equal(latest.usages.find(row => row.binding_id === feedSceneBindingId(saved.rule_id))?.availability.available, false);
});
