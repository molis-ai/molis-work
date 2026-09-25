import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { inboxActions, inboxNextScene, inboxSceneBindingId, INBOX_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-inbox";
import { publishedFunctionAction } from "@molis-ai/molis-work-module-functions";
import type { ActionCallContext, ActionDefinition, ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { withFunctionsService, type FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";

test("Inbox consumes a registered judgment, retains the original binding and history across restart, and rejects stale results", async () => {
  const home = await mkdtemp(join(tmpdir(), "inbox-action-scene-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: "canonical-inbox-project" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS] };
  const inputs: string[] = [];
  let duringJudgment: (() => void) | undefined;
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, allowed_behavior_ids: ["inbox.verify", "inbox.done"],
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
      const source = createLocalFeedSourceService(runtime.store.db, runtime.board_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "inbox-scene-test" }).source;
      const item = feed.ingestItem({ source, externalId: "article-1", title: "核对发布说明", summary: "尚未确认的数据", body: "原文内容", occurredAt: new Date().toISOString(), attention: false }).item;
      return feed.ensureInboxEntryForFeedItem(runtime.board_id, item.item_id, "manual").entry;
    });
    const rule = withFunctionsService(home, service => {
      service.bindScene(inboxNextScene.scene_id, "system_pick_inbox_next", reference.board_id);
      return service.list().find(rule => rule.function_key === "system_pick_inbox_next")!;
    }, options);
    const fn = publishedFunctionAction(rule);
    let scenes = host.sceneClient(reference), actions = host.actionClient(reference);
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
    assert.deepEqual(result.judgments[0]!.subject, { kind: "inbox_entry", id: entry.entry_id, board_id: reference.board_id });
    assert.equal(history().length, 1, "the scene commits one consumer history, not an extra MCP invocation record");
    assert.match(inputs[0]!, /原文内容/);
    await host.withProject(reference, runtime => {
      assert.equal(createLocalFeedApplication(runtime.store.db).getInboxEntry(runtime.board_id, entry.entry_id).status, "open", "a suggestion cannot complete the item");
      const events = runtime.store.db.prepare("SELECT * FROM events WHERE object_id = ?").all(result.judgments[0]!.judgment_id);
      assert.equal(events.length, 1, "Feed receives the actual judgment event");
    });
    // Rebinding to the same function is still a changed configuration revision.
    duringJudgment = () => withFunctionsService(home, service => service.saveActionSceneBinding(reference.board_id, { ...before[0]!, title: "changed while waiting" }, rule.function_key), options);
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.binding_changed" });
    assert.equal(history().length, 1);
    duringJudgment = () => withFunctionsService(home, service => service.bindScene(inboxNextScene.scene_id, rule.function_key, reference.board_id), options);
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.binding_changed" });
    assert.equal(history().length, 1, "legacy rebinds also invalidate the in-flight decision");
    duringJudgment = () => { disabled = true; };
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.plugin_disabled" });
    assert.equal(history().length, 1);
    disabled = false; duringJudgment = undefined;
    await actions.invoke(caller, inboxActions.writeJudgment, { function_key: null });
    const stopped = (await scenes.usages(caller, fn))[0]!;
    assert.equal(stopped.enabled, false);
    assert.equal(withFunctionsService(home, service => service.sceneBinding(inboxNextScene.scene_id, reference.board_id), options), null);
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
    const consumed = await scenes.runScene(caller, inboxNextScene, inboxSceneBindingId(reference.project_id), { entry_id: entry.entry_id }) as JudgmentRecord;
    assert.equal(consumed.function_key, unknown.capability_id);
    assert.deepEqual(consumed.suggested_behavior_ids, ["inbox.done"]);
    assert.equal(history().length, 2);
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
    // Change the actual entry while the provider is executing, through its business owner.
    const feed = await host.withProject(reference, runtime => createLocalFeedApplication(runtime.store.db));
    unknownEffect = () => feed.setInboxEntryStatus(reference.board_id, entry.entry_id, "in_progress", entry.revision);
    await assert.rejects(scenes.runScene(caller, inboxNextScene, binding.binding_id, { entry_id: entry.entry_id }), { code: "actions.subject_changed" });
    assert.equal(history().length, count);
    const current = feed.getInboxEntry(reference.board_id, entry.entry_id);
    feed.setInboxEntryStatus(reference.board_id, entry.entry_id, "dismissed", current.revision);
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.subject_unavailable" });
    assert.equal(history().length, count);
    stop();
    const orphan = (await scenes.usages(caller))[0]!;
    assert.equal(orphan.function.capability_id, unknown.capability_id);
    assert.equal(orphan.availability.available, false);
    assert.equal((await actions.discover(caller)).find(action => action.capability_id === inboxActions.evaluateJudgment.capability_id)!.availability.available, false,
      "the trigger action reflects the missing judgment, not just the saved binding");
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.binding_invalid" });
    await assert.rejects(scenes.runScene(caller, inboxNextScene, binding.binding_id, { entry_id: entry.entry_id }), { code: "actions.scene_incompatible" });
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
