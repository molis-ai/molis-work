import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard, DEMO_PROJECT_ID, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { inboxActions, inboxContentActions, inboxNextScene, inboxSceneBindingId, INBOX_ACTION_PERMISSIONS, type InboxJudgmentState } from "@molis-ai/molis-work-plugin-inbox";
import { feedContentActions, feedItemActions } from "@molis-ai/molis-work-plugin-feed";
import { createFunctionsService, publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import type { ActionCallContext, ActionDefinition, ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { createLocalInboxScene, type InboxSceneServices } from "../apps/local-host/dist/inbox-scene.js";

type FunctionsHostOptions = NonNullable<InboxSceneServices["functions"]>;

test("FI-1 RAC-482 binding a published rule reads stable identities without building any rule's full definition", async t => {
  const home = await mkdtemp(join(tmpdir(), "inbox-rule-identities-"));
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: { async evaluate(_key, record) {
    return { primitive: "choice", choice: "inbox.done", probabilities: { "inbox.done": 1 }, confidence: null,
      model: record.model, noul: null, score: null, legend: null };
  } } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: options, completeText: null });
  const service = createFunctionsService({ home, credential: () => null, ...options });
  try {
    const publish = async (function_key: string) => {
      const draft = service.createChoice({ name: function_key, function_key });
      service.updateDraft(draft.id, { instructions: "Choose the next Inbox step", subject_kinds: ["inbox_entry"], scene_id: "inbox.next",
        criteria: [{ key: "inbox.done", description: "Done" }, { key: "inbox.compose", description: "Compose" }] });
      await service.preview(draft.id, "A real publication fixture");
      return service.publish(draft.id, undefined, { scene_id: "inbox.next", version: 1, provider_id: "io.molis.work.inbox" });
    };
    const target = await publish("fi1_target"), unrelated = await publish("fi1_unrelated");
    const draft = service.createChoice({ name: "Not published", function_key: "fi1_draft" });
    const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
    const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
    const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS] };
    const feed = await host.withProject(reference, runtime => createLocalFeedApplication(runtime.store.db));
    const scenes = host.sceneClient(reference);
    // These are normally published records. Observe the adapter's reads without changing any stored data or field value.
    const definitionReads: string[] = [];
    const identityFields = new Set(["status", "version", "function_key", "name"]);
    const list = service.list.bind(service);
    t.mock.method(service, "list", () => list().map(record => new Proxy(record, { get(value, property, receiver) {
      if (typeof property === "string" && !identityFields.has(property)) definitionReads.push(`${record.function_key}.${property}`);
      return Reflect.get(value, property, receiver);
    } })));
    const scene = createLocalInboxScene(home, reference.project_id, feed, { actions: host.actionClient(reference), scenes, readFunctions: operation => operation(service) });
    assert.equal(service.getByKey(unrelated.function_key)?.status, "published");
    assert.deepEqual(await scene.ports.writeJudgment!(target.function_key, caller), { function_key: "fi1_target" });
    const binding = service.actionSceneBinding(inboxNextScene.scene_id, reference.project_id);
    assert.deepEqual(binding?.function, { capability_id: "functions.published.fi1_target", version: target.version, provider_id: "system.functions" });
    assert.deepEqual(definitionReads, [], "binding only needs published identities, including when other valid rules are present");
    for (const key of [draft.function_key, "fi1_missing"]) {
      await assert.rejects(scene.ports.writeJudgment!(key, caller), { code: "actions.binding_invalid" });
      assert.deepEqual(service.actionSceneBinding(inboxNextScene.scene_id, reference.project_id), binding);
    }
    await assert.rejects(scene.ports.writeJudgment!(target.function_key, { ...caller, permissions: [] }), { code: "actions.forbidden" });
    assert.deepEqual(service.actionSceneBinding(inboxNextScene.scene_id, reference.project_id), binding);
    await assert.rejects(scene.ports.writeJudgment!("system_admit_inbox", caller), { code: "actions.scene_incompatible" });
    assert.deepEqual(service.actionSceneBinding(inboxNextScene.scene_id, reference.project_id), binding);
    const state = await scene.ports.readJudgment!(caller) as InboxJudgmentState;
    assert.deepEqual(state.functions.filter(rule => rule.function_key.startsWith("fi1_")).map(rule => rule.function_key).sort(), ["fi1_target", "fi1_unrelated"]);
    assert.deepEqual(definitionReads, [], "catalog reads and refused bindings also consume only identities from this port");
  } finally {
    service.close();
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("Inbox consumes a registered judgment, retains the original binding and history across restart, and rejects stale results", async () => {
  const home = await mkdtemp(join(tmpdir(), "inbox-action-scene-"));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS] };
  const inputs: string[] = [];
  let duringJudgment: (() => void) | undefined;
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" },
    provider: { async evaluate(_key, record, content) {
      inputs.push(content); duringJudgment?.();
      return { primitive: "choice", choice: "inbox.done", probabilities: { "inbox.done": 1 }, confidence: null,
        model: record.model, noul: null, score: null, legend: null };
    } } };
  let disabled = false;
  const makeHost = () => new MolisWorkLocalHost({ homeDirectory: home, functions: options,
    sceneAvailability: () => disabled ? { available: false, code: "actions.plugin_disabled", reason: "disabled fixture" } : { available: true } });
  let host = makeHost();
  const history = () => withFunctionsService(home, service => service.listJudgments(), options);
  try {
    const entry = await host.withProject(reference, runtime => {
      const feed = createLocalFeedApplication(runtime.store.db);
      const source = createLocalFeedSourceService(runtime.store.db, runtime.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "inbox-scene-test" }).source;
      const item = feed.ingestItem({ source, externalId: "article-1", title: "核对发布说明", summary: "尚未确认的数据", body: "原文内容", occurredAt: new Date().toISOString(), attention: false }).item;
      return feed.ensureInboxEntryForFeedItem(runtime.project_id, item.item_id, "manual").entry;
    });
    const rule = withFunctionsService(home, service => service.list().find(rule => rule.function_key === "system_pick_inbox_next")!, options);
    const fn = publishedFunctionAction(rule);
    let scenes = host.sceneClient(reference), actions = host.actionClient(reference);
    await actions.invoke(caller, inboxActions.writeJudgment, { function_key: rule.function_key });
    assert.equal((await scenes.discoverScenes(caller, fn)).find(scene => scene.definition.scene_id === inboxNextScene.scene_id)?.compatible, true);
    const before = await scenes.usages(caller, fn);
    assert.equal(before.length, 1);
    assert.equal(before[0]!.project_id, reference.project_id);
    assert.equal(before[0]!.availability.available, true);
    await assert.rejects(actions.invoke({ ...caller, project_id: "other-project" }, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.scope_mismatch" });
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id, "foreign-entry"] }));
    assert.equal(inputs.length, 0, "the entire selection is checked before calling the model");
    const result = await actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }) as { judgments: JudgmentRecord[] };
    assert.equal(result.judgments.length, 1);
    assert.deepEqual(result.judgments[0]!.suggested_behavior_ids, ["inbox.done"]);
    assert.deepEqual(result.judgments[0]!.subject, { kind: "inbox_entry", id: entry.entry_id, project_id: reference.project_id });
    const recommendations = async () => (await actions.invoke(caller, inboxActions.recommendations, {}) as { judgments: JudgmentRecord[] }).judgments;
    assert.deepEqual(await recommendations(), result.judgments);
    assert.equal((await actions.invoke(caller, inboxActions.readJudgment, {}) as InboxJudgmentState).summary?.available, true);
    assert.equal(history().length, 1, "the scene commits one consumer history, not an extra MCP invocation record");
    assert.match(inputs[0]!, /原文内容/);
    await host.withProject(reference, runtime => {
      assert.equal(createLocalFeedApplication(runtime.store.db).getInboxEntry(runtime.project_id, entry.entry_id).status, "open", "a suggestion cannot complete the item");
      const events = runtime.store.db.prepare("SELECT * FROM events WHERE object_id = ?").all(result.judgments[0]!.judgment_id);
      assert.equal(events.length, 1, "Feed receives the actual judgment event");
    });
    // Rebinding to the same function is still a changed configuration revision.
    duringJudgment = () => withFunctionsService(home, service => service.saveActionSceneBinding(reference.project_id, { ...before[0]!, title: "changed while waiting" }), options);
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.binding_changed" });
    assert.equal(history().length, 1);
    duringJudgment = () => { disabled = true; };
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.plugin_disabled" });
    assert.equal(history().length, 1);
    assert.deepEqual(await recommendations(), []);
    disabled = false; duringJudgment = undefined;
    await actions.invoke(caller, inboxActions.writeJudgment, { function_key: null });
    const stopped = (await scenes.usages(caller, fn))[0]!;
    assert.equal(stopped.enabled, false);
    assert.deepEqual(await recommendations(), []);
    await host.close(); host = makeHost(); scenes = host.sceneClient(reference); actions = host.actionClient(reference);
    assert.equal((await scenes.usages(caller, fn))[0]!.enabled, false, "disable preserves the binding across restart");
    assert.equal(history().length, 1);

    // Any compatible registered judgment can replace Functions; the consumer does not know its ID.
    const unknown: ActionDefinition = { capability_id: `fixture.${randomUUID()}.judge`, version: 1, operation: "command", action: {
      title: "本地规则", description: "fixture judgment", kind: "judgment", scope: "project", audiences: ["user", "mcp"], permissions: [], subject_kinds: ["inbox_entry"],
      input_schema: inboxNextScene.input_schema, output_type: inboxNextScene.result_type,
      output_schema: { type: "object", properties: { status: { enum: ["ok", "needs_review"] }, suggested_behavior_ids: { type: "array", items: { enum: ["inbox.done", "inbox.compose", "inbox.verify"] } } }, required: ["status", "suggested_behavior_ids"] },
    } };
    let unknownEffect: (() => void) | undefined;
    let next = "inbox.done", uncertain = false;
    const stop = host.actionRegistry(reference).registerProvider({ provider: { provider_id: unknown.capability_id, title: "fixture", kind: "plugin", project_id: reference.project_id },
      definitions: [unknown], handlers: [{ ...unknown, handle: () => { unknownEffect?.(); return { status: uncertain ? "needs_review" : "ok", suggested_behavior_ids: [next] }; } }] });
    const binding: ActionSceneBinding = { ...stopped, function: { capability_id: unknown.capability_id, version: unknown.version }, enabled: true };
    await assert.rejects(scenes.bind({ ...caller, permissions: caller.permissions.filter(p => p !== "inbox:write") }, binding), { code: "actions.forbidden" });
    await scenes.bind(caller, binding);
    const configured = await actions.invoke(caller, inboxActions.readJudgment, {}) as { capabilities: ActionDefinition[]; binding: ActionSceneBinding };
    assert.ok(configured.capabilities.some(action => action.capability_id === unknown.capability_id));
    assert.equal(configured.binding.function.capability_id, unknown.capability_id);
    const summary = (await actions.invoke(caller, inboxActions.readJudgment, {}) as InboxJudgmentState).summary!;
    assert.equal(summary.name, "本地规则"); assert.equal(summary.available, true);
    const legacy = withFunctionsService(home, service => service.recordSceneJudgment({ function_key: unknown.capability_id, function_version: 1,
      subject: { kind: "inbox_entry", id: entry.entry_id, project_id: reference.project_id }, scene_id: inboxNextScene.scene_id,
      outcome: "ok", suggested_behavior_ids: ["inbox.done"], error_code: null }), options);
    assert.deepEqual(await recommendations(), [], "old history without binding and content provenance is retained but cannot claim current advice");
    const consumed = await scenes.runScene(caller, inboxNextScene, inboxSceneBindingId(reference.project_id), { entry_id: entry.entry_id }) as JudgmentRecord;
    assert.equal(consumed.function_key, unknown.capability_id);
    assert.deepEqual(consumed.suggested_behavior_ids, ["inbox.done"]);
    assert.equal(history().length, 3);
    assert.deepEqual(await recommendations(), [consumed]);
    await host.withProject(reference, runtime => runtime.store.db.prepare("UPDATE feed_items SET body = ? WHERE item_id = ? AND project_id = ?").run("原文已更正", entry.subject_id, reference.project_id));
    assert.deepEqual(await recommendations(), [], "changing the underlying material also withdraws advice without changing the Inbox entry");
    assert.ok(history().some(record => record.judgment_id === consumed.judgment_id));
    assert.ok(history().some(record => record.judgment_id === legacy.judgment_id));
    for (const recommendation of ["inbox.compose", "inbox.verify"]) {
      next = recommendation;
      const result = await actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }) as { judgments: JudgmentRecord[] };
      assert.deepEqual(result.judgments[0]!.suggested_behavior_ids, [recommendation]);
    }
    uncertain = true;
    const review = await actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }) as { judgments: JudgmentRecord[] };
    assert.equal(review.judgments[0]!.outcome, "needs_review");
    assert.deepEqual(review.judgments[0]!.suggested_behavior_ids, [], "uncertain judgments cannot recommend an action");
    const count = history().length;
    let revoked = false;
    unknownEffect = () => { revoked = true; };
    const revocableCaller: ActionCallContext = { ...caller, validate_authority: reference => {
      if (revoked && reference.capability_id === inboxActions.evaluateJudgment.capability_id && reference.provider_id === "io.molis.work.inbox") {
        throw Object.assign(new Error("origin revoked"), { code: "fixture.origin_revoked" });
      }
    } };
    await assert.rejects(actions.invoke(revocableCaller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "fixture.origin_revoked" });
    assert.equal(history().length, count, "revoking the initiating operation while its judgment runs must prevent history consumption");
    // Change the actual entry while the provider is executing, through its business owner.
    const feed = await host.withProject(reference, runtime => createLocalFeedApplication(runtime.store.db));
    unknownEffect = () => feed.setInboxEntryStatus(reference.project_id, entry.entry_id, "in_progress", entry.revision);
    await assert.rejects(scenes.runScene(caller, inboxNextScene, binding.binding_id, { entry_id: entry.entry_id }), { code: "actions.subject_changed" });
    assert.equal(history().length, count);
    assert.deepEqual(await recommendations(), [], "an edited entry invalidates previously saved advice");
    const current = feed.getInboxEntry(reference.project_id, entry.entry_id);
    feed.setInboxEntryStatus(reference.project_id, entry.entry_id, "dismissed", current.revision);
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.subject_unavailable" });
    assert.equal(history().length, count);
    stop();
    assert.deepEqual(await recommendations(), []);
    assert.equal((await actions.invoke(caller, inboxActions.readJudgment, {}) as InboxJudgmentState).summary?.available, false);
    const orphan = (await scenes.usages(caller))[0]!;
    assert.equal(orphan.function.capability_id, unknown.capability_id);
    assert.equal(orphan.availability.available, false);
    assert.equal((await actions.discover(caller)).find(action => action.capability_id === inboxActions.evaluateJudgment.capability_id)!.availability.available, false,
      "the trigger action reflects the missing judgment, not just the saved binding");
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.binding_invalid" });
    await assert.rejects(scenes.runScene(caller, inboxNextScene, binding.binding_id, { entry_id: entry.entry_id }), { code: "actions.scene_incompatible" });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("admission actions wait for the Inbox next-step judgment beside the project's queue, not on it", async () => {
  const home = await mkdtemp(join(tmpdir(), "inbox-admission-queue-"));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "feed:read", "feed:write", "inbox:write"] };
  let gate = Promise.withResolvers<void>(), asked = Promise.withResolvers<void>();
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" },
    provider: { async evaluate(_key, record) {
      asked.resolve(); await gate.promise;
      return { primitive: "choice", choice: "inbox.done", probabilities: { "inbox.done": 1 }, confidence: null, model: record.model, noul: null, score: null, legend: null };
    } } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: options });
  const actions = host.actionClient(reference);
  const settle = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
  // The same unrelated serial command of the project, sent while the model is still thinking.
  const unrelatedRead = async (itemId: string) => Promise.race([actions.invoke(caller, feedItemActions.read, { item_id: itemId }).then(() => "answered"), settle(1_000).then(() => "stuck behind the judgment")]);
  try {
    for (const action of [feedItemActions.inbox, feedContentActions.receive, inboxContentActions.receive]) {
      assert.equal(action.action.scheduling, "concurrent", `${action.capability_id} waits for a model, so it runs beside the project's queue`);
    }
    const rule = withFunctionsService(home, service => service.list().find(rule => rule.function_key === "system_pick_inbox_next")!, options);
    await actions.invoke(caller, inboxActions.writeJudgment, { function_key: rule.function_key });
    const { first, second, other } = await host.withProject(reference, runtime => {
      const feed = createLocalFeedApplication(runtime.store.db);
      const source = createLocalFeedSourceService(runtime.store.db, runtime.project_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "inbox-queue-test" }).source;
      const add = (id: string) => feed.ingestItem({ source, externalId: id, title: `消息 ${id}`, summary: id, body: `正文 ${id}`, occurredAt: new Date().toISOString(), attention: false }).item;
      return { first: add("a"), second: add("b"), other: add("c") };
    });

    // feed.items.inbox: the admission is saved, then the judgment is awaited.
    const admission = actions.invoke(caller, feedItemActions.inbox, { item_id: first.item_id, expected_revision: first.revision });
    await asked.promise;
    assert.equal(await unrelatedRead(other.item_id), "answered");
    gate.resolve(); await admission;

    // inbox.content.receive: a workflow handoff into the Inbox waits for the same judgment.
    gate = Promise.withResolvers<void>(); asked = Promise.withResolvers<void>();
    const handoff = actions.invoke(caller, inboxContentActions.receive, { title: "工作流交来的内容", body: "正文", request_id: "workflow:queue-test:1" });
    await asked.promise;
    assert.equal(await unrelatedRead(second.item_id), "answered");
    gate.resolve(); const handed = await handoff;

    // W4-6-05: who handed it in comes from the call's audience (this caller is a person), never from the input. The entry says so, and
    // the nested Feed call kept the audience: the material is filed under the hand-in source, not under 「工作流程」.
    await host.withProject(reference, runtime => {
      const feed = createLocalFeedApplication(runtime.store.db);
      const entry = feed.getInboxEntry(reference.project_id, handed.item_id);
      assert.equal(entry.detail?.added_by, "web_user");
      const item = feed.getFeedItem(reference.project_id, entry.subject_id);
      assert.equal(item.source_label, "放进来的内容");
    });
  } finally { gate.resolve(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
