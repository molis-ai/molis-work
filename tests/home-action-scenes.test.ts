import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard, DEMO_BOARD_ID,
  cachedMolisWorkWebView } from "@molis-ai/molis-work-app-local-host";
import { ActionError, bindActionClient, type ActionCallContext, type ActionDefinition, type ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { PluginRuntime, SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { definePlugin, defineSubjectContextAction, defineHomeEventsAction, defineSubjectOffersAction, subjectContext } from "../packages/plugin-sdk/src/index.js";
import { liveHostFunctionAuthoringCatalog } from "../apps/local-host/src/behavior-catalog.js";
import { publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import { subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";
import { HOME_DOCK_SCENE_ID, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { GOALS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-goals";
import { withFunctionsService, withFunctionsServiceAsync, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";
import { homeActions, homeDockScene, homeDockBindingId, HOME_ACTION_PERMISSIONS, createHomeJudgmentTrigger } from "../apps/local-host/src/home-actions.js";

test("Home scene uses original bindings and history, accepts unknown judgments, and never projects stale recommendations", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-action-scene-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: "canonical-home-project" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...HOME_ACTION_PERMISSIONS, "inbox:write", ...GOALS_ACTION_PERMISSIONS] };
  let effect: (() => void) | undefined;
  let fail = false;
  let calls = 0;
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) {
      calls++; effect?.();
      if (fail) throw Object.assign(new Error("private error"), { code: "fixture.failed" });
      return { primitive: "choice", choice: "inbox.done", probabilities: { "inbox.done": 1 }, confidence: null,
        model: record.model, noul: null, score: null, legend: null };
    },
  } };
  let denied: string | undefined;
  const makeHost = () => new MolisWorkLocalHost({ homeDirectory: home, functions: options,
    actionAvailability: (_caller, action) => action.capability_id === denied
      ? { available: false, code: "actions.forbidden", reason: "revoked fixture" } : { available: true } });
  let host = makeHost();
  const history = () => withFunctionsService(home, service => service.listJudgments(), options);
  try {
    let runtime = await host.withProject(reference, runtime => runtime);
    let feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, reference.board_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "home-scene" }).source;
    const item = feed.ingestItem({ source, externalId: "home-item", title: "核对材料", summary: "真实首页事件", body: "原始内容", occurredAt: new Date().toISOString(), attention: false }).item;
    const entry = feed.ensureInboxEntryForFeedItem(reference.board_id, item.item_id, "manual").entry;
    let scenes = host.sceneClient(reference);
    let actions = bindActionClient(host.actionClient(reference), () => caller);
    const choices = (await actions.invoke(homeActions.choices, {})).choices;
    const done = choices.find(choice => choice.offer_id === "inbox.done")!.key;
    const dismiss = choices.find(choice => choice.offer_id === "inbox.dismiss")!.key;
    await actions.invoke(homeActions.writeJudgment, { function_key: "system_pick_home_dock" });
    denied = "inbox.entry.status";
    const currentRule = { capability_id: "functions.published.system_pick_home_dock", version: 1, provider_id: "system.functions" };
    assert.equal((await scenes.discoverScenes(caller, currentRule)).find(scene => scene.definition.scene_id === HOME_DOCK_SCENE_ID)!.compatible, false);
    assert.equal((await scenes.usages(caller)).find(usage => usage.scene_id === HOME_DOCK_SCENE_ID)!.availability.available, false);
    await assert.rejects(actions.invoke(homeActions.writeJudgment, { function_key: "system_pick_home_dock" }), { code: "actions.scene_incompatible" });
    await assert.rejects(actions.invoke(homeActions.evaluate, { subjects: [{ kind: "inbox_entry", id: entry.entry_id }] }));
    assert.equal(calls, 0, "host policy on a recommended write is checked before model invocation");
    denied = undefined;
    const subjects = [{ kind: "inbox_entry" as const, id: entry.entry_id }];
    await assert.rejects(actions.invoke(homeActions.evaluate, { subjects: [...subjects, { kind: "feed_item", id: "foreign" }] }));
    assert.equal(calls, 0, "validate all subjects before starting any judgment");
    let result = await actions.invoke(homeActions.evaluate, { subjects });
    assert.equal(result.judgments.length, 1);
    assert.equal(history().length, 1, "one consumer history per event, no duplicate Functions invocation record");
    assert.equal(result.judgments[0]!.scene_provenance!.binding_id, homeDockBindingId(reference.project_id));
    assert.deepEqual((await actions.invoke(homeActions.recommendations, {})).judgments.map(j => j.judgment_id).sort(), result.judgments.map(j => j.judgment_id).sort());
    assert.equal(feed.getInboxEntry(reference.board_id, entry.entry_id).status, "open");
    const cache = new Map();
    const viewOptions = { databasePath, boardId: reference.board_id, homeDirectory: home };
    const view = await cachedMolisWorkWebView(cache, runtime.store, viewOptions, actions);
    assert.equal("home_dock_suggested_behavior_ids" in view.feed.feed_items.find(row => row.item_id === item.item_id)!, false, "WebView no longer holds a second copy of Home recommendations");
    denied = "functions.published.system_pick_home_dock";
    assert.deepEqual((await actions.invoke(homeActions.recommendations, {})).judgments, []);
    await cachedMolisWorkWebView(cache, runtime.store, viewOptions, actions);
    assert.deepEqual((await actions.invoke(homeActions.recommendations, {})).judgments, [], "warming the unrelated board cache cannot bypass recommendation authority");
    denied = undefined;
    await actions.invoke(homeActions.writeJudgment, { function_key: "system_pick_home_dock" });
    assert.deepEqual((await actions.invoke(homeActions.recommendations, {})).judgments, [], "same-function rebind invalidates old recommendations");
    result = await actions.invoke(homeActions.evaluate, { subjects });
    assert.equal((await actions.invoke(homeActions.recommendations, {})).judgments.length, 1);
    effect = () => feed.setDisposition(reference.board_id, item.item_id, "saved");
    const count = history().length;
    await assert.rejects(actions.invoke(homeActions.evaluate, { subjects: [subjects[0]!] }), { code: "actions.subject_changed" });
    assert.equal(history().length, count, "changed underlying material invalidates Inbox decision too");
    assert.deepEqual((await actions.invoke(homeActions.recommendations, {})).judgments, []);
    effect = undefined;
    feed.setInboxEntryStatus(reference.board_id, entry.entry_id, "open", feed.getInboxEntry(reference.board_id, entry.entry_id).revision);
    fail = true;
    result = await actions.invoke(homeActions.evaluate, { subjects: [subjects[0]!] });
    assert.equal(result.judgments[0]!.outcome, "needs_review");
    assert.deepEqual(result.judgments[0]!.suggested_behavior_ids, []);
    assert.equal(result.judgments[0]!.error_code, "fixture.failed");
    fail = false;
    await actions.invoke(homeActions.evaluate, { subjects: [subjects[0]!] });
    const current = (await scenes.usages(caller)).find(value => value.scene_id === HOME_DOCK_SCENE_ID)!;
    effect = () => withFunctionsService(home, service => service.saveActionSceneBinding(reference.board_id, current, "system_pick_home_dock"), options);
    await assert.rejects(actions.invoke(homeActions.evaluate, { subjects: [subjects[0]!] }), { code: "actions.binding_changed" });
    effect = undefined;
    await actions.invoke(homeActions.writeJudgment, { function_key: null });
    assert.equal((await actions.invoke(homeActions.readJudgment, {})).binding!.enabled, false);
    const preserved = history().length;
    await host.close(); host = makeHost(); runtime = await host.withProject(reference, runtime => runtime);
    feed = createLocalFeedApplication(runtime.store.db); scenes = host.sceneClient(reference); actions = bindActionClient(host.actionClient(reference), () => caller);
    assert.equal((await actions.invoke(homeActions.readJudgment, {})).binding!.enabled, false);
    assert.equal(history().length, preserved);

    const unknown: ActionDefinition = { capability_id: `fixture.${randomUUID()}.home`, version: 1, operation: "command", action: {
      title: "自带的首页判断", description: "unknown provider", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: [],
      subject_kinds: ["feed_item", "inbox_entry"], input_schema: homeDockScene.input_schema, output_type: homeDockScene.result_type,
      output_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: { enum: [done, dismiss] } } }, required: ["status", "suggested_behavior_ids"] },
    } };
    let unknownCalls = 0;
    let unknownEffect: (() => void) | undefined;
    const stop = host.actionRegistry(reference).registerProvider({ provider: { provider_id: unknown.capability_id, kind: "plugin", title: "Unknown", project_id: reference.project_id },
      definitions: [unknown], handlers: [{ ...unknown, handle: (_caller, input) => { assert.match((input as { content: string }).content, /原始内容|自动材料/); unknownCalls++; unknownEffect?.(); return { status: "ok", suggested_behavior_ids: [dismiss] }; } }] });
    const binding: ActionSceneBinding = { ...current, enabled: true, function: { capability_id: unknown.capability_id, version: 1 } };
    await assert.rejects(scenes.bind({ ...caller, permissions: caller.permissions.filter(p => p !== "home:write") }, binding), { code: "actions.forbidden" });
    await scenes.bind(caller, binding);
    assert.equal(withFunctionsService(home, service => service.actionSceneBinding(HOME_DOCK_SCENE_ID, reference.board_id))!.function.provider_id,
      unknown.capability_id, "binding storage retains the provider selected by the common service");
    assert.ok((await actions.invoke(homeActions.readJudgment, {})).capabilities.some(action => action.capability_id === unknown.capability_id));
    const inboxOnly: ActionDefinition = { ...unknown, capability_id: `${unknown.capability_id}.inbox-only`, action: { ...unknown.action, subject_kinds: ["inbox_entry"] } };
    const stopInboxOnly = host.actionRegistry(reference).registerProvider({ provider: { provider_id: inboxOnly.capability_id, title: "Inbox only", kind: "plugin", project_id: reference.project_id },
      definitions: [inboxOnly], handlers: [{ ...inboxOnly, handle: () => { throw new Error("must not invoke incompatible subject"); } }] });
    assert.equal((await scenes.discoverScenes(caller, inboxOnly)).find(scene => scene.definition.scene_id === HOME_DOCK_SCENE_ID)!.compatible, true);
    await scenes.bind(caller, { ...binding, function: inboxOnly });
    await assert.rejects(actions.invoke(homeActions.evaluate, { subjects: [{ kind: "feed_item", id: item.item_id }] }), { code: "actions.subject_incompatible" });
    await scenes.bind(caller, binding);
    stopInboxOnly();
    const automatic = createLocalFeedApplication(runtime.store.db, { homeJudgment: createHomeJudgmentTrigger({ scenes, context: () => caller, boardId: reference.board_id }) });
    assert.throws(() => runtime.store.db.transaction(() => {
      automatic.ingestItem({ source, externalId: "rollback", title: "自动材料", summary: "自动材料", occurredAt: new Date().toISOString(), attention: { reason: "manual" } });
      throw new Error("roll back");
    }).immediate(), /roll back/);
    await automatic.flushPendingJudgments();
    assert.equal(unknownCalls, 0, "rolled-back Feed and Inbox events must not invoke a judgment");
    const auto = automatic.ingestItem({ source, externalId: "automatic", title: "自动材料", summary: "自动材料", occurredAt: new Date().toISOString(), attention: { reason: "manual" } });
    await automatic.flushPendingJudgments();
    assert.equal(unknownCalls, 1, "only the Inbox event has a concrete declared action; Feed is skipped before judging");
    assert.equal(history().filter(j => j.function_key === unknown.capability_id).length, 1);
    assert.equal((await actions.invoke(homeActions.recommendations, {})).judgments.length, 1);
    const automaticEntry = automatic.listInboxEntries(reference.board_id).find(e => e.subject_id === auto.item.item_id)!;
    unknownEffect = () => automatic.setInboxEntryStatus(reference.board_id, automaticEntry.entry_id, "done", automaticEntry.revision);
    await assert.rejects(actions.invoke(homeActions.evaluate, { subjects: [{ kind: "inbox_entry", id: automaticEntry.entry_id }] }), { code: "actions.subject_changed" });
    assert.equal(automatic.getInboxEntry(reference.board_id, automaticEntry.entry_id).status, "done");
    const beforeStop = history().length;
    stop();
    assert.deepEqual((await actions.invoke(homeActions.recommendations, {})).judgments, []);
    await automatic.evaluateItems(reference.board_id, [auto.item.item_id]);
    assert.equal(history().length, beforeStop, "unloaded judgment is not invoked by automatic events");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("judgment history keeps insertion order when multiple results share a timestamp", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-history-order-"));
  try {
    withFunctionsService(home, service => {
      const records: JudgmentRecord[] = [];
      for (let index = 0; index < 30; index++) records.push(service.recordSceneJudgment({ function_key: "fixture", function_version: 1,
        subject: { kind: "feed_item", id: "same", board_id: "board" }, scene_id: HOME_DOCK_SCENE_ID,
        outcome: "ok", suggested_behavior_ids: [String(index)], error_code: null }));
      assert.equal(service.latestJudgment("feed_item", "same", "board", HOME_DOCK_SCENE_ID)!.judgment_id, records.at(-1)!.judgment_id);
      assert.deepEqual(service.listJudgments().map(record => record.judgment_id), records.reverse().map(record => record.judgment_id));
      assert.deepEqual(service.latestSceneJudgments("board", HOME_DOCK_SCENE_ID).map(record => record.judgment_id), [records[0]!.judgment_id]);
      service.recordSceneJudgment({ function_key: "other", function_version: 1, subject: { kind: "feed_item", id: "same", board_id: "foreign" },
        scene_id: HOME_DOCK_SCENE_ID, outcome: "ok", suggested_behavior_ids: [], error_code: null });
      assert.deepEqual(service.latestSceneJudgments("board", HOME_DOCK_SCENE_ID).map(record => record.judgment_id), [records[0]!.judgment_id]);
      assert.deepEqual(service.latestSceneJudgments("board", "different-scene"), []);
    });
  } finally { await rm(home, { recursive: true, force: true }); }
});

test("Home judgment resolves a formally installed plugin's own subjects and pins source authority and revisions", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-unknown-judgment-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: "unknown-home-project" });
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) { return { primitive: "noul", noul: 0.9, choice: null, score: null, legend: null,
      probabilities: {}, confidence: null, model: record.model }; },
  } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: options });
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: ["home:read", "home:write", "model:invoke", "notes:read", "notes:write", "functions:invoke", "functions:manage"] };
  const subject = { kind: "unknown-note", id: "own-note" };
  let runtime: PluginRuntime | undefined, installId = "";
  try {
    const project = await host.withProject(reference, project => project);
    project.store.db.exec("CREATE TABLE fixture_home_judgment_notes (id TEXT PRIMARY KEY, revision INTEGER NOT NULL, content TEXT NOT NULL)");
    project.store.db.prepare("INSERT INTO fixture_home_judgment_notes VALUES (?, 1, ?)").run(subject.id, "插件私有记录的原始正文");
    const reader = defineSubjectContextAction("unknown.notes.read", subject.kind, "原笔记", ["notes:read"]);
    const events = defineHomeEventsAction("unknown.notes.events", [subject.kind], "笔记事项", ["notes:read"]);
    const write: ActionDefinition = { capability_id: "unknown.notes.finish", version: 1, operation: "command", action: {
      title: "完成笔记", description: "修改插件原记录", kind: "operation", scope: "project", audiences: ["user", "mcp"],
      permissions: ["notes:write"], subject_kinds: [subject.kind], input_schema: { type: "object", properties: { id: { type: "string" }, revision: { type: "integer" }, marker: { type: "string" } }, required: ["id", "revision", "marker"], additionalProperties: false },
      output_schema: { type: "object", properties: { changed: { type: "integer" } }, required: ["changed"] } } };
    const offerQuery = defineSubjectOffersAction("unknown.notes.offers", [subject.kind], "笔记动作", ["notes:read"], [
      { offer_id: "notes.finish", title: "完成笔记", action: { capability_id: write.capability_id, version: 1 } },
    ]);
    let marker = "original", available = true;
    const now = new Date().toISOString();
    let onRead: (() => void) | undefined;
    const plugin = definePlugin({ manifest: { schema_version: 2, host_api_version: 2, plugin_id: "io.molis.work.example.judgment-subject", version: "1.0.0", name: "笔记事项",
      kind: "app", publisher: { publisher_id: "example", signature: "judgment-subject" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
      permissions: ["notes:read", "notes:write"].map(permission => ({ permission, required: false, reason: "读写原始笔记" })), capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [reader, events, offerQuery, write] },
      async start() { return { kind: "app", actions: [{ ...write, handle: (_caller, value) => {
        const input = value as { id: string; revision: number; marker: string };
        assert.equal(input.marker, marker);
        const result = project.store.db.prepare("UPDATE fixture_home_judgment_notes SET revision = revision + 1, content = '完成后的正文' WHERE id = ? AND revision = ?").run(input.id, input.revision);
        return { changed: Number(result.changes) };
      } }, { ...offerQuery, handle: (_caller, value) => {
        const input = value as { subject: { id: string } };
        const row = project.store.db.prepare("SELECT revision FROM fixture_home_judgment_notes WHERE id = ?").get(input.subject.id) as { revision: number } | undefined;
        return { offers: !row || !available ? [] : [{ offer_id: "notes.finish", title: "完成笔记", action: { capability_id: write.capability_id, version: 1 }, input: { id: input.subject.id, revision: row.revision, marker } }] };
      } }, { ...reader, handle: (_caller, input) => {
        const row = project.store.db.prepare("SELECT * FROM fixture_home_judgment_notes WHERE id = ?").get((input as { subject_id: string }).subject_id) as { id: string; revision: number; content: string } | undefined;
        if (!row) throw new ActionError("actions.subject_unavailable", "笔记已不存在");
        onRead?.();
        return subjectContext({ subject: { kind: subject.kind, id: row.id }, revision: String(row.revision), title: "插件自有笔记", content: row.content, goal_ids: [], session_id: null });
      } }, { ...events, handle: () => ({ source: { surface: "notes", title: "笔记", icon: "note" }, events: [{ event_id: "own-note", subject, occurred_at: now,
        placement: "occurred", category: "personal", title: "插件自有笔记", summary: "", content: "插件私有记录的原始正文", facts: [], needs_attention: true, open: null }] }) }] }; } });
    const repository = new SqlitePluginRuntimeRepository(project.store.db);
    runtime = new PluginRuntime(repository, undefined, { actions: { registry: host.actionRegistry(reference), project_id: reference.project_id } });
    installId = runtime.install({ definition: plugin, deployment: "local", grants: ["notes:read", "notes:write"] }).install.install_id;
    await runtime.start(installId);
    const choice = () => subjectOfferChoiceKey({ ...offerQuery, provider_id: installId }, offerQuery.action.subject_offer_choices![0]!);
    let selectedKey = choice();
    const authoring = liveHostFunctionAuthoringCatalog(await host.actionClient(reference).discover(caller), await host.sceneClient(reference).discoverScenes(caller));
    assert.ok(authoring.destinations.find(destination => destination.destination_id === HOME_DOCK_SCENE_ID)!.behavior_ids.includes(selectedKey));
    assert.equal(authoring.behaviors.find(behavior => behavior.behavior_id === selectedKey)!.title, "完成笔记");
    const authored = await withFunctionsServiceAsync(home, async service => {
      const draft = service.create({ primitive: "noul", function_key: "unknown_note_decision", name: "笔记完成判断" });
      service.updateDraft(draft.id, { instructions: "依据原文判断是否完成", criteria: { true_description: "已完成", false_description: "待确认完成" },
        scene_id: HOME_DOCK_SCENE_ID, subject_kinds: [subject.kind], scene_map: { true: selectedKey, false: selectedKey } });
      await service.preview(draft.id, "插件原始正文");
      return service.publish(draft.id);
    }, options);
    assert.equal((await host.sceneClient(reference).discoverScenes(caller, publishedFunctionAction(authored))).find(scene => scene.definition.scene_id === HOME_DOCK_SCENE_ID)!.compatible, true);
    await host.actionClient(reference).invoke(caller, homeActions.writeJudgment, { function_key: authored.function_key });
    const authoredResult = await host.actionClient(reference).invoke(caller, homeActions.evaluate, { subjects: [subject] }) as { judgments: JudgmentRecord[] };
    assert.deepEqual(authoredResult.judgments[0]!.suggested_behavior_ids, [selectedKey], "authored mappings survive storage, publish, registration and real Home consumption");
    let judgmentEffect: (() => void) | undefined, calls = 0;
    let judgment: ActionDefinition = { capability_id: "unknown.subject.judgment", version: 1, operation: "command", action: {
      title: "笔记下一步", description: "按原始笔记判断", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: [],
      subject_kinds: [subject.kind], input_schema: homeDockScene.input_schema, output_type: homeDockScene.result_type, output_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: { enum: [selectedKey] } } }, required: ["status", "suggested_behavior_ids"] },
    } };
    const registerJudgment = () => host.actionRegistry(reference).registerProvider({ provider: { provider_id: "unknown-judge", title: "独立判断", kind: "plugin", project_id: reference.project_id },
      definitions: [judgment], handlers: [{ ...judgment, handle: (_caller, input) => { calls++; assert.match((input as { content: string }).content, /插件.*正文/); judgmentEffect?.(); return { status: "ok", suggested_behavior_ids: [selectedKey] }; } }] });
    let stopJudgment = registerJudgment();
    const binding: ActionSceneBinding = { binding_id: homeDockBindingId(reference.project_id), scene_id: HOME_DOCK_SCENE_ID, scene_version: 1,
      project_id: reference.project_id, function: judgment, enabled: true, title: "笔记下一步" };
    const scenes = host.sceneClient(reference), actions = bindActionClient(host.actionClient(reference), () => caller);
    const evaluate = () => actions.invoke(homeActions.evaluate, { subjects: [subject] });
    const history = () => withFunctionsService(home, service => service.listJudgments().filter(record => record.function_key === "unknown.subject.judgment"));
    const recommendations = () => actions.invoke(homeActions.recommendations, {});
    await scenes.bind(caller, binding);
    assert.ok((await actions.invoke(homeActions.readJudgment, {})).capabilities.some(action => action.capability_id === judgment.capability_id));
    await assert.rejects(actions.invoke(homeActions.evaluate, { subjects: [subject, { kind: "feed_item", id: "any" }] }), { code: "actions.subject_incompatible" });
    assert.equal(calls, 0, "reject an incompatible batch before any model calls");
    const before = project.store.snapshot(reference.board_id).cursor;
    let result = await actions.invoke(homeActions.evaluate, { subjects: [subject, { id: subject.id, kind: subject.kind }] });
    assert.equal(history().length, 1); assert.equal(result.judgments[0]!.subject.kind, subject.kind);
    assert.ok(project.store.snapshot(reference.board_id).cursor > before, "judgment advances the original project journal without a Feed item");
    assert.deepEqual((await recommendations()).judgments.map(record => record.judgment_id), [result.judgments[0]!.judgment_id]);
    const range = { from: new Date(Date.parse(now) - 1000).toISOString(), to: new Date(Date.parse(now) + 1000).toISOString(), now };
    assert.deepEqual((await actions.invoke(homeActions.events, range)).events.find(event => event.subject.id === subject.id)?.suggested_behavior_ids, [selectedKey]);
    const noWrite = { ...caller, permissions: caller.permissions.filter(permission => permission !== "notes:write") };
    assert.equal((await scenes.usages(noWrite))[0]!.availability.available, false);
    await assert.rejects(scenes.bind(noWrite, binding));
    assert.deepEqual(((await host.actionClient(reference).invoke(noWrite, homeActions.recommendations, {})) as { judgments: JudgmentRecord[] }).judgments, []);
    const noNotes = { ...caller, permissions: caller.permissions.filter(permission => permission !== "notes:read") };
    assert.deepEqual(((await host.actionClient(reference).invoke(noNotes, homeActions.recommendations, {})) as { judgments: JudgmentRecord[] }).judgments, []);
    await assert.rejects(host.actionClient(reference).invoke(noNotes, homeActions.evaluate, { subjects: [subject] }));
    assert.equal(calls, 1);
    judgmentEffect = () => project.store.db.prepare("UPDATE fixture_home_judgment_notes SET revision = revision + 1, content = ?").run("插件修改后的原始正文");
    await assert.rejects(evaluate(), { code: "actions.subject_changed" }); assert.equal(history().length, 1);
    assert.deepEqual((await recommendations()).judgments, []);
    judgmentEffect = undefined; result = await evaluate();
    assert.deepEqual((await recommendations()).judgments.map(record => record.judgment_id), [result.judgments[0]!.judgment_id]);
    judgmentEffect = () => repository.save({ ...runtime!.get(installId), grants: [] });
    const count = history().length; await assert.rejects(evaluate()); assert.equal(history().length, count, "revoked original reader prevents judgment publication");
    assert.deepEqual((await recommendations()).judgments, []);
    judgmentEffect = undefined; repository.save({ ...runtime.get(installId), grants: ["notes:read", "notes:write"] });
    const duplicate = { ...reader, capability_id: "different.notes.reader" };
    const stopDuplicate = host.actionRegistry(reference).registerProvider({ provider: { provider_id: "duplicate", title: "Duplicate", kind: "plugin", project_id: reference.project_id },
      definitions: [duplicate], handlers: [{ ...duplicate, handle: () => { throw new Error("cannot arbitrarily choose this reader"); } }] });
    await assert.rejects(evaluate(), { code: "actions.subject_ambiguous" }); assert.deepEqual((await recommendations()).judgments, []); stopDuplicate();
    const prior = (await recommendations()).judgments[0]!.judgment_id;
    judgmentEffect = () => { marker = "changed input without changing subject"; };
    const beforeChangedOffer = history().length;
    await assert.rejects(evaluate(), { code: "actions.offer_changed" });
    assert.equal(history().length, beforeChangedOffer); assert.deepEqual((await recommendations()).judgments, []);
    judgmentEffect = undefined;
    await evaluate();
    available = false;
    assert.deepEqual((await recommendations()).judgments, []);
    const beforeUnavailable = calls;
    await assert.rejects(evaluate(), { code: "actions.subject_unavailable" }); assert.equal(calls, beforeUnavailable);
    available = true;
    await evaluate();
    onRead = () => repository.save({ ...runtime!.get(installId), grants: [] });
    assert.deepEqual((await recommendations()).judgments, []); onRead = undefined;
    repository.save({ ...runtime.get(installId), grants: ["notes:read", "notes:write"] });
    await runtime.stop(installId); await runtime.uninstall(installId);
    assert.deepEqual((await recommendations()).judgments, []);
    installId = runtime.install({ definition: { ...plugin, manifest: { ...plugin.manifest, plugin_id: "io.molis.work.example.replacement-subject" } }, deployment: "local", grants: ["notes:read", "notes:write"] }).install.install_id;
    await runtime.start(installId);
    assert.deepEqual((await recommendations()).judgments, [], "identical content from a replacement provider cannot inherit original recommendations");
    await assert.rejects(evaluate(), { code: "actions.binding_invalid" });
    stopJudgment(); selectedKey = choice();
    judgment = { ...judgment, action: { ...judgment.action, output_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: { enum: [selectedKey] } } }, required: ["status", "suggested_behavior_ids"] } } };
    stopJudgment = registerJudgment(); await scenes.bind(caller, binding);
    result = await evaluate(); assert.notEqual(result.judgments[0]!.judgment_id, prior);
    assert.equal((await recommendations()).judgments.length, 1);
    const request_id = result.judgments[0]!.scene_provenance!.offer_request_id!;
    const prepared = await actions.invoke(homeActions.offers, { subject, request_id });
    const offered = prepared.offers.find(offer => offer.recommendation_key === selectedKey)!;
    const { availability: _availability, ...offer } = offered;
    const executed = await actions.invoke(homeActions.execute, { subject, request_id, offer });
    assert.deepEqual(executed.result, { changed: 1 });
    assert.equal((project.store.db.prepare("SELECT content FROM fixture_home_judgment_notes WHERE id = ?").get(subject.id) as { content: string }).content, "完成后的正文");
    assert.deepEqual((await recommendations()).judgments, []);
    project.store.db.prepare("DELETE FROM fixture_home_judgment_notes WHERE id = ?").run(subject.id);
    assert.deepEqual((await recommendations()).judgments, []); assert.ok(history().some(record => record.judgment_id === prior), "missing original objects retain history");
  } finally { if (runtime && installId) await runtime.stop(installId); await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("saved scene bindings retain provider identity and only known legacy Functions keys restore it", async () => {
  const home = await mkdtemp(join(tmpdir(), "home-binding-provider-migration-"));
  const old: ActionSceneBinding = { binding_id: "home.dock:project", scene_id: HOME_DOCK_SCENE_ID, scene_version: 1, project_id: "project",
    function: { capability_id: "functions.published.system_pick_home_dock", version: 1 }, enabled: true, title: "旧首页规则" };
  try {
    const saved = withFunctionsService(home, service => service.saveActionSceneBinding("board", old, "system_pick_home_dock"));
    const migrated = withFunctionsService(home, service => service.actionSceneBinding(HOME_DOCK_SCENE_ID, "board"))!;
    assert.equal(migrated.function.provider_id, "system.functions"); assert.equal(migrated.revision, saved.revision);
    assert.equal(migrated.title, old.title); assert.equal(migrated.enabled, true);
    withFunctionsService(home, service => service.saveActionSceneBinding("board", { ...old, function: { capability_id: "unknown.judge", version: 3 } }));
    assert.equal(withFunctionsService(home, service => service.actionSceneBinding(HOME_DOCK_SCENE_ID, "board"))!.function.provider_id, undefined,
      "unknown legacy identities cannot be inferred from whatever provider is installed now");
    const pinned = { ...old, function: { capability_id: "unknown.judge", version: 3, provider_id: "original-plugin" } };
    withFunctionsService(home, service => service.saveActionSceneBinding("board", pinned));
    assert.deepEqual(withFunctionsService(home, service => service.actionSceneBinding(HOME_DOCK_SCENE_ID, "board"))!.function, pinned.function);
  } finally { await rm(home, { recursive: true, force: true }); }
});
