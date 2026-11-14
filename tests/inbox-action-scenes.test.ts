import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_PROJECT_ID, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { inboxActions, inboxContentActions, inboxNextScene, INBOX_ACTION_PERMISSIONS, type InboxJudgmentState } from "@molis-ai/molis-work-plugin-inbox";
import { feedContentActions, feedItemActions, type FeedJudgmentCatalog } from "@molis-ai/molis-work-plugin-feed";
import { createFunctionsService, publishedFunctionAction } from "@molis-ai/molis-work-module-judgment-rules";
import type { ActionCallContext, ActionDefinition, ActionSceneBinding, ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import type { FunctionsHostOptions } from "../apps/local-host/dist/judgment-rules-host.js";
import { createLocalFeedApplication, createLocalFeedSourceService, listTestFeedSourceCatalog } from "./fixtures/feed-library.js";
import { sceneCandidateMeter, type SceneCandidateCounts } from "./fixtures/scene-candidate-meter.js";
import { openTestHome } from "./fixtures/test-home.js";

test("FI-1 RAC-482 binding a published rule goes through the plugin's own scene and refuses drafts, unknown rules, read-only callers and rules of another scene", async () => {
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
        criteria: [{ key: "inbox.done", description: "Done" }, { key: "inbox.compose", description: "Compose" }] }, service.get(draft.id).updated_at);
      await service.preview(draft.id, "A real publication fixture", service.get(draft.id).updated_at);
      return service.publish(draft.id, service.get(draft.id).updated_at, { scene_id: "inbox.next", version: 1, provider_id: "io.molis.work.inbox" });
    };
    const target = await publish("fi1_target"), unrelated = await publish("fi1_unrelated");
    const draft = service.createChoice({ name: "Not published", function_key: "fi1_draft" });
    const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
    const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
    const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "evidence:read"] };
    const actions = host.actionClient(reference);
    await actions.discover(caller); // the project's plugins register their scenes, and a scene's rule is written when it does
    const read = async () => await actions.invoke(caller, inboxActions.readJudgment, {}) as InboxJudgmentState & { binding: ActionSceneBinding | null };
    assert.equal(service.getByKey(unrelated.function_key)?.status, "published");
    assert.deepEqual(await actions.invoke(caller, inboxActions.writeJudgment, { function_key: target.function_key }), { function_key: "fi1_target" });
    const binding = (await read()).binding;
    assert.deepEqual(binding?.function, { capability_id: "functions.published.fi1_target", version: target.version, provider_id: "system.functions" });
    for (const key of [draft.function_key, "fi1_missing"]) {
      await assert.rejects(actions.invoke(caller, inboxActions.writeJudgment, { function_key: key }), { code: "actions.binding_invalid" });
      assert.deepEqual((await read()).binding, binding);
    }
    const readOnlyCaller = { ...caller, permissions: caller.permissions.filter(permission => permission !== "inbox:write") };
    await assert.rejects(actions.invoke(readOnlyCaller, inboxActions.writeJudgment, { function_key: target.function_key }), { code: "actions.forbidden" });
    assert.deepEqual((await read()).binding, binding);
    await assert.rejects(actions.invoke(caller, inboxActions.writeJudgment, { function_key: "system_admit_inbox" }), { code: "actions.scene_incompatible" });
    assert.deepEqual((await read()).binding, binding);
    const state = await read();
    assert.deepEqual(state.functions.filter(rule => rule.function_key.startsWith("fi1_")).map(rule => rule.function_key).sort(), ["fi1_target", "fi1_unrelated"]);
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
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "evidence:read"] };
  const inputs: string[] = [];
  let duringJudgment: (() => void | Promise<void>) | undefined;
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" },
    provider: { async evaluate(_key, record, content) {
      inputs.push(content); await duringJudgment?.();
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
    await host.actionClient(reference).discover(caller); // the project's plugins register their scenes, and a scene's rule is written when it does
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
    duringJudgment = async () => { duringJudgment = undefined; await scenes.bind(caller, { ...before[0]!, title: "changed while waiting" }); };
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
    await actions.discover(caller); // the project's plugins start when it opens, and a scene is there once its plugin is
    assert.equal((await scenes.usages(caller, fn))[0]!.enabled, false, "disable preserves the binding across restart");
    assert.equal(history().length, 1);

    // Any compatible registered judgment can replace Functions; the consumer does not know its ID.
    const unknown: ActionDefinition = { capability_id: `fixture.${randomUUID()}.judge`, version: 1, operation: "command", action: {
      title: "本地规则", description: "fixture judgment", kind: "judgment", scope: "project", audiences: ["user", "workflow", "mcp"], permissions: [], subject_kinds: ["inbox_entry"],
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
    // The scene reads a Feed item's text from Inbox's own action, so it is run through that action.
    const consumed = (await actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }) as { judgments: JudgmentRecord[] }).judgments[0]!;
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
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.subject_changed" });
    assert.equal(history().length, count);
    assert.deepEqual(await recommendations(), [], "an edited entry invalidates previously saved advice");
    const current = feed.getInboxEntry(reference.project_id, entry.entry_id);
    feed.setInboxEntryStatus(reference.project_id, entry.entry_id, "dismissed", current.revision);
    await assert.rejects(actions.invoke(caller, inboxActions.evaluateJudgment, { entry_ids: [entry.entry_id] }), { code: "actions.subject_unavailable" });
    assert.equal(history().length, count);
    stop();
    assert.deepEqual(await recommendations(), []);
    assert.equal((await actions.invoke(caller, inboxActions.readJudgment, {}) as InboxJudgmentState).summary?.available, false);
    const orphan = (await scenes.usages(caller)).find(usage => usage.scene_id === inboxNextScene.scene_id)!;
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
  // The hand-in reaches feed.content.receive, which pins what the capture rules match in its commit (artifact:write, RAC-510).
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS, "evidence:read", "feed:write", "inbox:write", "artifact:write"] };
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
    await actions.discover(caller); // the project's plugins register their scenes, and a scene's rule is written when it does
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

const functionRef = (key: string): ExactActionReference => ({ capability_id: `functions.published.${key}`, version: 1, provider_id: "system.functions" });
const candidateKey = ({ capability_id, version, provider_id }: ExactActionReference) => `${capability_id}@${version}:${provider_id}`;

function assertSceneCandidateBudget(counts: SceneCandidateCounts, isInbox: boolean, candidates: number) {
  assert.deepEqual(counts.discover, { workflow: 2, user: 4 }, "full Kernel discoveries per audience");
  assert.deepEqual(counts.scenePasses, { workflow: 1, user: 5 }, "actual scene declaration enumerations");
  assert.equal(counts.sceneRows, 16, "only the requested owner's scene is projected for the batch");
  assert.deepEqual(counts.bindingReads, { inbox: isInbox ? 4 : 3, feed: 3, home: 0 });
  assert.deepEqual(counts.kernelUsages, { workflow: 1, user: 2 });
  assert.deepEqual(counts.ownerUsages, { user: 1 });
  assert.equal(counts.candidateDirectories, 1);
  assert.equal(counts.candidates, candidates);
  assert.deepEqual(counts.sceneCalls, { user: 1 });
  assert.equal(counts.batchCalls, 1);
  assert.equal(counts.sceneRefs, candidates);
}

test("BRC-05 Inbox and Feed HTTP candidate catalogs do the same full reads at either candidate count", { timeout: 60_000 }, async t => {
  const measure = sceneCandidateMeter(t);
  let now = Date.parse("2026-11-09T18:00:00Z");
  t.mock.timers.enable({ apis: ["Date", "setTimeout", "setInterval"], now });
  const env = { TYPESAFE_API_KEY: "fixture-only" };
  const feedReason = "Fixture: Feed scene unavailable";
  let feedUnavailable = false;
  const home = await openTestHome(t, { host: { clock: () => new Date(), functions: {
    env, provider: { async evaluate() { return assert.fail("a catalog must not run a judgment"); } },
  }, sceneAvailability: (_caller, scene) => feedUnavailable && scene.definition.scene_id === "feed.capture"
    ? { available: false, code: "actions.connection_required", reason: feedReason } : { available: true } } });
  const host: MolisWorkLocalHost = home.host;
  const project = await home.createProject("Scene candidate budget", ["feed"]);
  const prefix = `/projects/${encodeURIComponent(project.project_id)}/api/plugins/`;
  const inboxId = "io.molis.work.inbox", feedId = "io.molis.work.feed";
  const inbox = prefix + inboxId + "/judgment", feed = prefix + feedId, catalog = feed + "/out-rules/judgments";
  const inboxKey = "system_pick_inbox_next", inboxRef = functionRef(inboxKey), feedRef = functionRef("system_admit_inbox");
  await home.web.get(inbox);
  await home.web.post(inbox, { function_key: inboxKey });
  const inboxBinding = (await home.web.get<InboxJudgmentState>(inbox)).binding;
  assert.ok(inboxBinding?.revision);
  const { source } = await home.web.post<{ source: { source_id: string } }>(feed + "/sources", { kind: "rss", definition_id: listTestFeedSourceCatalog()[0]!.id });
  const { rule } = await home.web.post<{ rule: { rule_id: string; revision: string } }>(feed + "/out-rules",
    { name: "Capture", source_id: source.source_id, contains: "launch", judgment: feedRef, admission: "suggest" });

  const incompatible = { capability_id: "fixture.n49.feed_incompatible", version: 1, provider_id: "n49-fixture" };
  const definition: ActionDefinition = { ...incompatible, operation: "command", action: {
    kind: "judgment", title: "Fixture judgment", description: "Different output contract", scope: "project",
    audiences: ["user", "workflow"], permissions: [], subject_kinds: ["feed_item"],
    input_schema: { type: "object", properties: { content: { type: "string" } }, required: ["content"] },
    output_schema: { type: "object", properties: { choice: { type: "boolean" } }, required: ["choice"] },
  } };
  t.after(host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id: incompatible.provider_id, title: "Fixture", kind: "system" }, definitions: [definition],
    handlers: [{ ...definition, handle: () => assert.fail("a catalog must not run a judgment") }],
  }));

  // Select the exact candidates before the real Web action constructs its caller. Scene checks, policy and binding reads stay live.
  let allowed = new Set<string>();
  const inspect = host.inspectPreparedActionMetadata;
  t.mock.method(host, "inspectPreparedActionMetadata", async function (this: MolisWorkLocalHost, ...args: Parameters<typeof inspect>) {
    return (await inspect.apply(this, args)).filter(row => row.action.kind !== "judgment" ||
      allowed.has(candidateKey({ capability_id: row.capability_id, version: row.version, provider_id: row.provider.provider_id })));
  });
  const manyInbox = [inboxRef, feedRef, { ...inboxRef, capability_id: "functions.invoke" }];
  const fixtures = [
    { plugin: inboxId, refs: manyInbox },
    { plugin: inboxId, refs: [inboxRef] },
    { plugin: inboxId, refs: manyInbox, disconnected: true },
    { plugin: inboxId, refs: [...manyInbox, functionRef("system_pick_home_dock")] },
    { plugin: feedId, refs: [feedRef, incompatible] },
    { plugin: feedId, refs: [feedRef] },
    { plugin: feedId, refs: [feedRef, incompatible], disconnected: true },
    { plugin: feedId, refs: [feedRef, incompatible], disconnected: true, sceneDenied: true },
  ];
  for (const { plugin, refs, disconnected, sceneDenied } of fixtures) {
    const isInbox = plugin === inboxId;
    allowed = new Set(refs.map(candidateKey));
    env.TYPESAFE_API_KEY = disconnected ? "" : "fixture-only";
    feedUnavailable = !!sceneDenied;
    t.mock.timers.setTime(now += 60_000);
    const { body, counts } = await measure<InboxJudgmentState | FeedJudgmentCatalog>(plugin, () => isInbox
      ? home.web.get<InboxJudgmentState>(inbox) : home.web.get<FeedJudgmentCatalog>(catalog));
    t.diagnostic(JSON.stringify({ plugin, candidates: refs.length, disconnected: !!disconnected, sceneDenied: !!sceneDenied, counts }));
    assertSceneCandidateBudget(counts, isInbox, refs.length);
    if ("functions" in body) {
      assert.equal(body.function_key, inboxKey);
      assert.deepEqual(body.functions.map(value => value.function_key), [inboxKey]);
      assert.deepEqual(body.capabilities?.map(view => ({ capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id })), [inboxRef]);
      assert.deepEqual(body.binding, inboxBinding);
      assert.deepEqual(body.binding?.function, inboxRef);
      assert.equal(body.summary?.available, !disconnected);
      assert.equal(body.summary?.reason, disconnected ? "请先连接判断服务" : null);
    } else {
      assert.deepEqual(body.choices.map(choice => choice.reference), refs.length > 1 ? [incompatible, feedRef] : [feedRef]);
      const valid = body.choices.at(-1);
      assert.equal(valid?.available, !sceneDenied);
      assert.equal(valid?.reason, sceneDenied ? feedReason : undefined);
      if (refs.length > 1) assert.deepEqual(body.choices[0], {
        reference: incompatible, title: "Fixture judgment · Fixture", available: false, reason: "判断结果类型不匹配",
      });
      const usage = body.usages.find(row => row.binding_id === `feed.capture:${rule.rule_id}`);
      assert.deepEqual(usage?.function, feedRef);
      assert.equal(usage?.revision, rule.revision);
      assert.equal(usage?.availability.available, !disconnected);
      if (disconnected) assert.deepEqual(usage?.availability, { available: false, code: "actions.connection_required", reason: "请先连接判断服务" });
    }
  }

  // A regression inside the batch could keep the owner call count at one. Make an additional real discovery and prove the budget rejects it.
  const batch = ActionService.prototype.discoverScenesFor;
  const extra = t.mock.method(ActionService.prototype, "discoverScenesFor", function (this: ActionService, ...args: Parameters<typeof batch>) {
    this.discover(args[0]);
    return batch.apply(this, args);
  });
  try {
    env.TYPESAFE_API_KEY = "fixture-only";
    feedUnavailable = false;
    t.mock.timers.setTime(now + 60_000);
    const { body, counts } = await measure(feedId, () => home.web.get<FeedJudgmentCatalog>(catalog));
    assert.deepEqual(body.choices.map(choice => choice.reference), [incompatible, feedRef]);
    t.diagnostic(JSON.stringify({ extraDiscovery: counts.discover, sceneCalls: counts.sceneCalls }));
    assert.throws(() => assertSceneCandidateBudget(counts, false, 2), /full Kernel discoveries per audience/);
  } finally { extra.mock.restore(); }
});
