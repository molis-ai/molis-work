import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { feedCaptureScene, feedRuleActions, feedSceneBindingId, createFeedCaptureTrigger } from "@molis-ai/molis-work-plugin-feed";
import { bindActionClient, type ActionCallContext, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "feed-capture-scenes-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "捕捉判断", actor_id: "test" });
  const project = catalog.getProject(created.project_id);
  catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "feed", actor_id: "test" });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
  const caller: ActionCallContext = { actor_id: "test", project_id: project.project_id, audience: "user",
    permissions: ["feed:read", "feed:write", "inbox:read", "inbox:write", "model:invoke", "functions:invoke"] };
  const inputs: string[] = [];
  const functions: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture" }, provider: { async evaluate(_key, record, input) {
    inputs.push(input);
    if (input.includes("failure")) throw Object.assign(new Error("private detail"), { code: "fixture.failure" });
    const choice = input.includes("leave") ? "feed.open" : "inbox.admit";
    return { primitive: "choice", choice, noul: null, score: null, legend: null, probabilities: { [choice]: 1 }, confidence: null, model: record.model };
  } } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions });
  const history = () => withFunctionsService(home, service => service.listJudgments(), functions);
  return { home, catalog, project, reference, caller, inputs, functions, host, history,
    close: async () => { await host.close(); catalog.close(); await rm(home, { recursive: true, force: true }); } };
}

test("Feed migrates its original rule binding once, preserves history and executes capture through the common scene", async () => {
  const f = await fixture();
  try {
    // Write the old representation before the project runtime opens.
    const store = new LocalProjectDatabase(f.project.database_path);
    const old = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, f.project.board_id).register({ kind: "web_query", query: "capture" }).source;
    const original = old.createOutRule(f.project.board_id, { name: "原捕捉规则", match: { source_id: source.source_id }, admission: "inbox" });
    store.db.prepare("UPDATE feed_out_rules SET function_key = ?, judgment_json = NULL WHERE rule_id = ?").run("system_admit_inbox", original.rule_id);
    const missing = old.createOutRule(f.project.board_id, { name: "丢失的旧函数", match: { contains: "missing-only" }, admission: "inbox" });
    store.db.prepare("UPDATE feed_out_rules SET function_key = 'removed-function', judgment_json = NULL WHERE rule_id = ?").run(missing.rule_id);
    withFunctionsService(f.home, service => {
      service.bindScene("feed.capture", "system_admit_inbox", f.project.board_id, original.rule_id);
      service.recordSceneJudgment({ function_key: "system_admit_inbox", function_version: 1, subject: { kind: "feed_item", id: "old-item", board_id: f.project.board_id },
        scene_id: "feed.capture", outcome: "ok", suggested_behavior_ids: ["feed.open"], error_code: null });
    }, f.functions);
    store.close();
    const runtime = await f.host.withProject(f.reference, runtime => runtime);
    const scenes = f.host.sceneClient(f.reference);
    const feed = createLocalFeedApplication(runtime.store.db, { captureJudgment: createFeedCaptureTrigger({ scenes, context: () => f.caller, boardId: runtime.board_id }) });
    const migrated = feed.listOutRules(runtime.board_id).find(rule => rule.rule_id === original.rule_id)!;
    assert.deepEqual(migrated.judgment, { capability_id: "functions.published.system_admit_inbox", version: 1, provider_id: "system.functions" });
    assert.equal(feed.listOutRules(runtime.board_id).find(rule => rule.rule_id === missing.rule_id)!.judgment, null);
    assert.equal(withFunctionsService(f.home, service => service.sceneBinding("feed.capture", runtime.board_id, original.rule_id), f.functions), null);
    assert.ok(f.history().some(record => record.subject.id === "old-item"));
    assert.ok((await scenes.usages(f.caller)).some(use => use.binding_id === feedSceneBindingId(original.rule_id) && use.availability.available));
    const ids = ["admit", "leave", "failure"].map(title => feed.ingestItem({ source, externalId: title, title, summary: "原消息正文", occurredAt: new Date().toISOString(), attention: false }).item.item_id);
    await feed.flushPendingJudgments();
    assert.equal(f.inputs.length, 3);
    const entries = feed.listInboxEntries(runtime.board_id).filter(entry => ids.includes(entry.subject_id));
    assert.equal(entries.length, 2);
    assert.equal(entries.find(entry => entry.subject_id === ids[2])!.detail.needs_review, true);
    assert.equal(f.history().find(record => record.subject.id === ids[2])!.error_code, "fixture.failure");
    assert.ok(!JSON.stringify(f.history()).includes("private detail"));
    await bindActionClient(f.host.actionClient(f.reference), () => f.caller).invoke(feedRuleActions.update, { rule_id: original.rule_id, patch: { enabled: false } });
    await feed.evaluateItems(runtime.board_id, ids, f.caller);
    assert.equal(f.inputs.length, 3, "paused rules cannot invoke the model");
    const unresolvedItem = feed.ingestItem({ source, externalId: "missing-only", title: "missing-only", summary: "未绑定", occurredAt: new Date().toISOString(), attention: false }).item;
    await feed.flushPendingJudgments();
    assert.ok(!feed.listInboxEntries(runtime.board_id).some(entry => entry.subject_id === unresolvedItem.item_id), "an unresolved function must never become a keyword-only auto-admission rule");
    const savedRevision = migrated.revision;
    await f.host.close();
    const reopened = new MolisWorkLocalHost({ homeDirectory: f.home, functions: f.functions });
    try {
      const again = await bindActionClient(reopened.actionClient(f.reference), () => f.caller).invoke(feedRuleActions.list, {});
      const rule = again.rules.find(rule => rule.rule_id === original.rule_id)!;
      assert.equal(rule.enabled, false); assert.deepEqual(rule.judgment, migrated.judgment); assert.notEqual(rule.revision, savedRevision);
      assert.equal(again.rules.find(rule => rule.rule_id === missing.rule_id)!.function_key, "removed-function");
      assert.equal(f.history().length, 4);
    } finally { await reopened.close(); }
  } finally { await f.close(); }
});

test("Feed binds unknown judgments and rejects stale rule, item, provider and authority results", { timeout: 30000 }, async () => {
  const f = await fixture();
  try {
    const runtime = await f.host.withProject(f.reference, runtime => runtime);
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, runtime.board_id).register({ kind: "web_query", query: "capture" }).source;
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
    assert.ok(!feed.listOutRules(runtime.board_id).some(rule => rule.name === "无权自动入箱"));
    let rule = (await actions.invoke(feedRuleActions.create, { name: "陌生能力规则", match: { source_id: source.source_id }, admission: "inbox",
      judgment: { capability_id: definition.capability_id, version: 1, provider_id: provider } })).rule;
    assert.equal(rule.function_key, null);
    const item = feed.ingestItem({ source, externalId: "item", title: "需要处理", summary: "原文", occurredAt: new Date().toISOString(), attention: false }).item;
    const run = (caller = f.caller) => scenes.runScene(caller, feedCaptureScene, feedSceneBindingId(rule.rule_id), { rule_id: rule.rule_id, item_id: item.item_id });
    await run();
    assert.equal(f.history().length, 1); assert.equal(feed.listInboxEntries(runtime.board_id).filter(entry => entry.subject_id === item.item_id).length, 1);
    assert.equal(f.history()[0]!.function_key, definition.capability_id);
    await assert.rejects(scenes.runScene({ ...f.caller, permissions: f.caller.permissions.filter(permission => permission !== "inbox:write") }, feedCaptureScene,
      feedSceneBindingId(rule.rule_id), { rule_id: rule.rule_id, item_id: item.item_id }), { code: "actions.forbidden" });
    assert.equal(calls, 1);
    const race = async (change: () => unknown | Promise<unknown>, code: string) => {
      delayed = true; const ready = new Promise<void>(resolve => { started = resolve; }); const pending = run();
      await ready; await change(); release(); await assert.rejects(pending, { code }); assert.equal(f.history().length, 1);
    };
    await race(() => { rule = feed.updateOutRule(runtime.board_id, rule.rule_id, { name: "新规则名" }); }, "actions.binding_changed");
    await race(() => feed.setDisposition(runtime.board_id, item.item_id, "saved"), "actions.subject_changed");
    delayed = true;
    let revoked = false;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const pending = run({ ...f.caller, validate_authority: () => { if (revoked) throw Object.assign(new Error("revoked"), { code: "fixture.revoked" }); } });
    await ready; revoked = true; release(); await assert.rejects(pending, { code: "fixture.revoked" });
    assert.equal(f.history().length, 1, "revocation while an unknown judgment runs must prevent history and admission");
    const manualReady = new Promise<void>(resolve => { started = resolve; });
    const manualPending = actions.invoke(feedRuleActions.evaluate, { item_ids: [item.item_id] });
    await manualReady; rule = feed.updateOutRule(runtime.board_id, rule.rule_id, { name: "处理期间修改" }); release();
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
