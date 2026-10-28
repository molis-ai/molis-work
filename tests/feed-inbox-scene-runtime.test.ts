import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import type { ActionCallContext, ActionClient, ActionSceneBinding, ActionSceneClient, ActionSceneUsage, ActionSceneView, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_NEXT_SCENE_ID, type JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import { createFeedSceneRuntime, feedCaptureScene, feedCaptureSubjectRevision, type FeedApplication, type FeedItemRecord } from "@molis-ai/molis-work-plugin-feed";
import { createInboxSceneRuntime, inboxNextScene, inboxSceneBindingId, withStagedFeedContent } from "@molis-ai/molis-work-plugin-inbox";

// FI-1 (specs/repository-anti-corruption/slices/feed-inbox-runtime.md, PG-034): the judgment side of Feed's capture scene and of Inbox's
// next-step scene belongs to the plugins. The Host supplies the owners' data (the judgment ledger, the readable item) to Feed and decides
// nothing about which judgments hold; Inbox is a Plugin Runtime plugin (FI-6) and runs its scene over the platform's scene and judgment
// services. These tests run the plugins' runtimes over fake ports, with no database and no Host.

const PROJECT = "project-1";
const caller = { actor_id: "tester", project_id: PROJECT, permissions: ["feed:read", "feed:write", "inbox:read", "inbox:write"] } as never;
const FUNCTION = { capability_id: "functions.published.rule-a", version: 2, provider_id: "system.functions" } as const;

const itemOf = (revision: number, title = "标题"): FeedItemRecord => ({ item_id: "item-1", revision, title, summary: "摘要", body: null, materials: [] }) as never;
const judgment = (over: Partial<JudgmentRecord> & { subject: JudgmentRecord["subject"]; provenance: NonNullable<JudgmentRecord["scene_provenance"]> }): JudgmentRecord =>
  ({ outcome: "ok", suggested_behavior_ids: ["feed.open"], scene_provenance: over.provenance, ...over }) as never;
const usage = (over: Partial<ActionSceneUsage> = {}): ActionSceneUsage => ({ scene_id: feedCaptureScene.scene_id, binding_id: "feed.capture:rule-1", revision: "r1", enabled: true,
  availability: { available: true }, function: FUNCTION, ...over }) as never;
const sceneView = (sceneId: string, version: number, compatible: boolean, availability: unknown = { available: true }, reason?: string): ActionSceneView =>
  ({ definition: { scene_id: sceneId, version }, compatible, availability, ...(reason ? { reason } : {}) }) as never;

function feedRuntime(over: { usages?: ActionSceneUsage[]; judgments?: JudgmentRecord[]; item?: (id: string) => FeedItemRecord; views?: ActionSceneView[]; actions?: Partial<ActionClient> } = {}) {
  const recorded: unknown[] = [];
  const scenes = { usages: async () => over.usages ?? [], discoverScenes: async () => over.views ?? [] } as never;
  const actions = { discover: async () => [], invoke: async () => ({ status: "ok", suggested_behavior_ids: [] }), ...over.actions } as never;
  const runtime = createFeedSceneRuntime({ projectId: PROJECT, feed: {} as FeedApplication, actions, scenes, host: {
    latestJudgments: () => over.judgments ?? [],
    recordJudgment: input => { recorded.push(input); return {} as never; },
    item: over.item ?? (() => itemOf(1)),
  } });
  return { ...runtime, recorded };
}

test("FI-1 RAC-480 the Host has no scene file for Feed or Inbox: both scenes run in their plugins, over services.scenes and services.judgments", () => {
  // FI-6 deleted the Host's Feed scene file, which by FI-1 had kept no judgment logic; Inbox never had one after FI-1.
  for (const file of ["apps/local-host/src/feed-scene.ts", "apps/local-host/src/inbox-scene.ts"]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, `${file}: the scene runs in the plugin`);
  }
});

test("FI-1 RAC-481 Feed recommends only judgments that still hold: the binding, its revision and the item's content all unchanged", async () => {
  const item = itemOf(1);
  const holds = judgment({ subject: { kind: "feed_item", id: "item-1", project_id: PROJECT },
    provenance: { binding_id: "feed.capture:rule-1", binding_revision: "r1", function: FUNCTION, subject_revision: feedCaptureSubjectRevision(item) } });
  const staleRevision = judgment({ subject: { kind: "feed_item", id: "item-1", project_id: PROJECT },
    provenance: { binding_id: "feed.capture:rule-1", binding_revision: "r1", function: FUNCTION, subject_revision: "changed" } });
  const staleBinding = judgment({ subject: { kind: "feed_item", id: "item-1", project_id: PROJECT },
    provenance: { binding_id: "feed.capture:rule-1", binding_revision: "r0", function: FUNCTION, subject_revision: feedCaptureSubjectRevision(item) } });
  const failed = judgment({ outcome: "needs_review", subject: { kind: "feed_item", id: "item-1", project_id: PROJECT },
    provenance: { binding_id: "feed.capture:rule-1", binding_revision: "r1", function: FUNCTION, subject_revision: feedCaptureSubjectRevision(item) } });
  const other = judgment({ subject: { kind: "inbox_entry", id: "entry-1", project_id: PROJECT },
    provenance: { binding_id: "feed.capture:rule-1", binding_revision: "r1", function: FUNCTION, subject_revision: feedCaptureSubjectRevision(item) } });
  const run = (over: Parameters<typeof feedRuntime>[0]) => feedRuntime({ item: () => item, usages: [usage()], ...over }).selection.recommendations(caller);
  assert.deepEqual(await run({ judgments: [holds] }), { recommendations: [{ item_id: "item-1", suggested_behavior_ids: ["feed.open"] }] });
  for (const [what, judgments, usages] of [["a changed item", [staleRevision], [usage()]], ["a changed binding", [staleBinding], [usage()]], ["a judgment that needed review", [failed], [usage()]],
    ["another subject kind", [other], [usage()]], ["a paused binding", [holds], [usage({ enabled: false })]], ["an unavailable binding", [holds], [usage({ availability: { available: false, reason: "x" } as never })]],
    ["another function", [holds], [usage({ function: { ...FUNCTION, version: 3 } })]]] as const) {
    assert.deepEqual(await run({ judgments: [...judgments], usages: [...usages] }), { recommendations: [] }, what);
  }
  const gone = Object.assign(new Error("gone"), { code: "feed.item_not_found" });
  assert.deepEqual(await run({ judgments: [holds], item: () => { throw gone; } }), { recommendations: [] }, "an item that no longer exists is skipped");
  await assert.rejects(run({ judgments: [holds], item: () => { throw new Error("storage broke"); } }), /storage broke/u, "any other failure is not hidden");
});

test("FI-1 RAC-481 Feed validates a rule's judgment against the capture scene and previews only a validated one", async () => {
  const ok = feedRuntime({ views: [sceneView(feedCaptureScene.scene_id, feedCaptureScene.version, true)] });
  assert.deepEqual(await ok.selection.validate(FUNCTION, caller), FUNCTION);
  const invoked: unknown[] = [];
  const preview = feedRuntime({ views: [sceneView(feedCaptureScene.scene_id, feedCaptureScene.version, true)],
    actions: { invoke: (async (_caller: unknown, reference: unknown, input: unknown) => { invoked.push([reference, input]); return { status: "ok", suggested_behavior_ids: ["feed.open"] }; }) as never } });
  assert.deepEqual(await preview.selection.preview(FUNCTION, "正文", caller), { status: "ok", suggested_behavior_ids: ["feed.open"] });
  assert.deepEqual(invoked, [[FUNCTION, { content: "正文" }]]);
  for (const [what, views] of [["no scene at all", []], ["another scene", [sceneView("other.scene", 1, true)]], ["another version", [sceneView(feedCaptureScene.scene_id, feedCaptureScene.version + 1, true)]],
    ["an incompatible scene", [sceneView(feedCaptureScene.scene_id, feedCaptureScene.version, false, { available: true }, "不兼容")]],
    ["an unavailable scene", [sceneView(feedCaptureScene.scene_id, feedCaptureScene.version, true, { available: false, reason: "没权限" }, "没权限")]]] as const) {
    const runtime = feedRuntime({ views: [...views], actions: { invoke: (async () => { assert.fail("a preview must not run an unvalidated judgment"); }) as never } });
    await assert.rejects(runtime.selection.validate(FUNCTION, caller), { code: "actions.binding_invalid" }, what);
    await assert.rejects(runtime.selection.preview(FUNCTION, "正文", caller), { code: "actions.binding_invalid" }, what);
  }
});

const action = (reference: typeof FUNCTION, title = "规则 A"): ActionView => ({ capability_id: reference.capability_id, version: reference.version, provider: { provider_id: reference.provider_id, title: "Functions" },
  action: { kind: "judgment", title } }) as never;
const entry = (over: Partial<{ revision: number; status: string; reason: string }> = {}) =>
  ({ entry_id: "entry-1", revision: 1, status: "open", reason: "manual", detail: { k: 1 }, subject_type: "manual", subject_id: "entry-1", ...over });

function inboxRuntime(over: { entry?: (id: string) => ReturnType<typeof entry>; bound?: ActionSceneBinding | null; judgments?: JudgmentRecord[]; usages?: ActionSceneUsage[];
  views?: ActionSceneView[]; capabilities?: ActionView[]; content?: (id: string) => Promise<never> } = {}) {
  const bound: ActionSceneBinding[] = [], saved: ActionSceneBinding[] = [], events: JudgmentRecord[] = [], recorded: unknown[] = [];
  const scenes = { usages: async () => over.usages ?? [], discoverScenes: async () => over.views ?? [sceneView(INBOX_NEXT_SCENE_ID, 1, true)],
    bind: async (binding: ActionSceneBinding) => { bound.push(binding); }, runScene: async () => ({ ran: true }) } as never;
  const judgments = { latest: () => over.judgments ?? [], record: (input: unknown) => { recorded.push(input); return { judgment_id: "j1" } as never; } } as never;
  const runtime = createInboxSceneRuntime({ projectId: PROJECT, scenes, judgments,
    bindings: { get: () => over.bound ?? null, save: (_context, binding) => { saved.push(binding); } },
    judgmentActions: async () => over.capabilities ?? [], entry: id => (over.entry ?? (() => entry()))(id),
    content: over.content ?? (async () => { throw new Error("these entries point at no Feed item"); }), recordEvent: (_context, judgment) => { events.push(judgment); } });
  return { ...runtime, bound, saved, events, recorded };
}

test("FI-1 RAC-482 Inbox binds only a published rule, and unbinding pauses the binding it has", async () => {
  const runtime = inboxRuntime({ capabilities: [action(FUNCTION)] });
  await assert.rejects(runtime.ports.writeJudgment!("unknown-rule", caller), { code: "actions.binding_invalid" });
  assert.deepEqual(runtime.bound, []);
  assert.deepEqual(await runtime.ports.writeJudgment!("rule-a", caller), { function_key: "rule-a" });
  assert.equal(runtime.bound.length, 1);
  assert.deepEqual({ id: runtime.bound[0]!.binding_id, scene: runtime.bound[0]!.scene_id, version: runtime.bound[0]!.scene_version, fn: runtime.bound[0]!.function, enabled: runtime.bound[0]!.enabled },
    { id: inboxSceneBindingId(PROJECT), scene: inboxNextScene.scene_id, version: inboxNextScene.version, fn: FUNCTION, enabled: true });
  const current: ActionSceneBinding = { ...runtime.bound[0]!, revision: "r1" };
  const paused = inboxRuntime({ bound: current, capabilities: [action(FUNCTION)] });
  await paused.ports.writeJudgment!(null, caller);
  assert.deepEqual(paused.bound.map(binding => binding.enabled), [false]);
  const none = inboxRuntime();
  await none.ports.writeJudgment!(null, caller);
  assert.deepEqual(none.bound, [], "nothing to pause, nothing bound");
});

test("FI-1 RAC-482 Inbox lists a rule only when its capability can run the scene, and says why a binding is not usable", async () => {
  const compatible = inboxRuntime({ capabilities: [action(FUNCTION)] });
  const state = await compatible.ports.readJudgment!(caller) as { functions: unknown[]; function_key: string | null; summary: { reason: string | null; name: string | null } };
  assert.deepEqual(state.functions, [{ function_key: "rule-a", name: "规则 A" }]);
  assert.deepEqual({ key: state.function_key, reason: state.summary.reason }, { key: null, reason: "尚未绑定规则" });
  const incompatible = inboxRuntime({ capabilities: [action(FUNCTION)], views: [sceneView(INBOX_NEXT_SCENE_ID, 1, false)] });
  assert.deepEqual((await incompatible.ports.readJudgment!(caller) as { functions: unknown[] }).functions, []);
  const binding: ActionSceneBinding = { binding_id: inboxSceneBindingId(PROJECT), scene_id: INBOX_NEXT_SCENE_ID, scene_version: 1, project_id: PROJECT, function: FUNCTION, enabled: true, revision: "r1", title: "t", href: "/" } as never;
  const unauthorised = await inboxRuntime({ bound: binding, capabilities: [action(FUNCTION)] }).ports.readJudgment!(caller) as { function_key: string | null; summary: { reason: string | null } };
  assert.deepEqual({ key: unauthorised.function_key, reason: unauthorised.summary.reason }, { key: "rule-a", reason: "当前无权使用此场景" });
});

test("FI-1 RAC-483 Inbox keeps a judgment only while its entry is open and unchanged, and judges only open entries", async () => {
  const bindingUsage = (over: Partial<ActionSceneUsage> = {}) => usage({ scene_id: INBOX_NEXT_SCENE_ID, binding_id: inboxSceneBindingId(PROJECT), ...over });
  const first = inboxRuntime();
  const subject = { entry_id: "entry-1", revision: 1, status: "open", content: ["manual", JSON.stringify({ k: 1 })].join("\n") };
  const { createHash } = await import("node:crypto");
  const revision = createHash("sha256").update(JSON.stringify(subject)).digest("hex");
  const holds = judgment({ subject: { kind: "inbox_entry", id: "entry-1", project_id: PROJECT },
    provenance: { binding_id: inboxSceneBindingId(PROJECT), binding_revision: "r1", function: FUNCTION, subject_revision: revision } });
  const run = (over: Parameters<typeof inboxRuntime>[0]) => inboxRuntime({ usages: [bindingUsage()], judgments: [holds], ...over }).ports.recommendations!(caller);
  assert.equal((await run({})).judgments.length, 1, "unchanged entry keeps its judgment");
  assert.equal((await run({ entry: () => entry({ revision: 2 }) })).judgments.length, 0, "a changed entry drops it");
  assert.equal((await run({ entry: () => entry({ status: "done" }) })).judgments.length, 0, "a finished entry drops it");
  assert.equal((await run({ entry: () => { throw Object.assign(new Error("gone"), { code: "inbox.entry_not_found" }); } })).judgments.length, 0, "a missing entry drops it");
  // Feed removed with Inbox and only Inbox added back (BL-800): the item's content cannot be read, and the project page must still open.
  const feedEntry = () => ({ ...entry(), subject_type: "feed_item", subject_id: "item-1" });
  const feedAbsent = async () => { throw Object.assign(new Error("Feed 不在项目里"), { code: "actions.dependency_missing" }); };
  assert.equal((await run({ entry: feedEntry, content: feedAbsent })).judgments.length, 0, "an item Feed cannot give now drops it");
  await assert.rejects(run({ entry: () => { throw new Error("storage broke"); } }), /storage broke/u);
  assert.equal((await run({ usages: [bindingUsage({ enabled: false })] })).judgments.length, 0, "a paused binding gives none");
  assert.equal((await run({ usages: [] })).judgments.length, 0, "no right to the scene gives none");
  assert.equal(first.recorded.length, 0);
  const finished = inboxRuntime({ entry: () => entry({ status: "dismissed" }) });
  await assert.rejects(finished.ports.evaluateJudgment!(["entry-1"], caller), { code: "actions.subject_unavailable" });
  assert.deepEqual(await inboxRuntime().ports.evaluateJudgment!(["entry-1", "entry-1"], caller), { judgments: [{ ran: true }] }, "an id given twice is judged once");
});

test("FI-1 RAC-483 a judgment is recorded with the binding it came from, the content it read, and becomes an event of the entry", async () => {
  const runtime = inboxRuntime();
  const binding = { binding_id: inboxSceneBindingId(PROJECT), revision: "r7", function: FUNCTION } as never;
  const effects: string[] = [];
  const context = { ...caller, beforeEffect: async () => { effects.push("checked"); } };
  const handler = runtime.handler as { consume(caller: unknown, input: unknown, result: unknown, execution: { binding: ActionSceneBinding; state: unknown }): unknown };
  const state = { entry_id: "entry-1", revision: 1, status: "open", content: ["manual", JSON.stringify({ k: 1 })].join("\n") };
  await handler.consume(context, {}, { status: "ok", suggested_behavior_ids: ["inbox.done"] }, { binding, state });
  assert.deepEqual(effects, ["checked"], "the ledger is written only after the call's own check before an effect");
  assert.equal(runtime.recorded.length, 1);
  assert.deepEqual(runtime.recorded[0], { function: FUNCTION, subject: { kind: "inbox_entry", id: "entry-1", project_id: PROJECT }, scene_id: INBOX_NEXT_SCENE_ID,
    scene_provenance: { binding_id: inboxSceneBindingId(PROJECT), binding_revision: "r7", function: FUNCTION, subject_revision: (runtime.recorded[0] as { scene_provenance: { subject_revision: string } }).scene_provenance.subject_revision },
    outcome: "ok", suggested_behavior_ids: ["inbox.done"], error_code: null });
  assert.equal(runtime.events.length, 1);
  assert.throws(() => handler.consume(context, {}, { status: "ok", suggested_behavior_ids: [] }, { binding, state: { ...state, revision: 2 } }), { code: "actions.subject_changed" },
    "the entry changed while the judgment ran");
  assert.equal(runtime.recorded.length, 1, "a judgment of a changed entry is not recorded");
});

test("FI-6 a callback of the scene that no Inbox action started judges nothing for an entry that points at a Feed item", async () => {
  const feedEntry = { ...entry(), subject_type: "feed_item", subject_id: "item-1" };
  const runtime = inboxRuntime({ entry: () => feedEntry });
  const handler = runtime.handler as { prepare(caller: unknown, event: unknown): unknown };
  assert.throws(() => handler.prepare(caller, { entry_id: "entry-1" }), { code: "actions.subject_unavailable" }, "the item's text arrives only with Inbox's own evaluate action");
  const staged = withStagedFeedContent(new Map([["item-1", { item_id: "item-1", revision: 1, title: "标题", summary: null, body: "正文", materials: [] }]]),
    () => handler.prepare(caller, { entry_id: "entry-1" })) as { input: { content: string } };
  assert.match(staged.input.content, /正文/u);
});
