import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, type ActionAudience, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, feedItemActions, feedQueryActions, promoteFeedItemToGoal, promoteOffered, type FeedGoalPromotionGoals } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PLUGIN_ID, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { goalApplicationOf, seedBoard } from "./fixtures/goal-application.js";
import { PROJECT, fixture } from "./fixtures/feed-goal-promotion.js";

test("a call withdrawn while Goals worked writes nothing of Feed's: neither the new-Goal path nor the existing-Goal path links or changes the item", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-feed-promotion-withdrawn-"));
  const databasePath = join(home, "project.db");
  seedBoard(databasePath, PROJECT);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, PROJECT).register({ kind: "web_query", query: "Review external input" }).source;
    const ingest = (externalId: string) => feed.ingestItem({ source, externalId, title: externalId, summary: "s", body: "b", priority: "low", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
    const calls: string[] = [];
    const goals: FeedGoalPromotionGoals = {
      active: async goalId => ({ goal_id: goalId }),
      create: async () => { calls.push("create"); return { goal_id: "goal-made", replayed: false }; },
      confirmInput: async () => { calls.push("confirm"); },
    };
    const withdrawn = new Error("call_withdrawn");
    const ports = { feed, goals, hydrateItem: (row: ReturnType<typeof ingest>) => row, transaction: <T>(operation: () => T) => store.db.transaction(operation).immediate(),
      beforeEffect: async (): Promise<void> => { calls.push("beforeEffect"); throw withdrawn; }, by_person: true };

    const fresh = ingest("withdrawn-new");
    await assert.rejects(promoteFeedItemToGoal(ports, { projectId: PROJECT, routePrefix: "", itemId: fresh.item_id, expectedRevision: fresh.revision }), withdrawn);
    assert.deepEqual(calls, ["create", "confirm", "beforeEffect"], "Goals worked, then the check ran before Feed wrote");
    const shape = (id: string) => { const row = feed.getItem(PROJECT, id); return { linked: row.linked_goal_id, revision: row.revision, disposition: row.disposition }; };
    assert.deepEqual(shape(fresh.item_id), { linked: null, revision: fresh.revision, disposition: fresh.disposition }, "the item is neither linked nor changed");

    calls.length = 0;
    const linked = feed.linkGoal(PROJECT, ingest("withdrawn-linked").item_id, "goal-existing", "promoted");
    const reused = await promoteFeedItemToGoal(ports, { projectId: PROJECT, routePrefix: "", itemId: linked.item_id, expectedRevision: linked.revision });
    assert.deepEqual(calls, [], "reusing the Goal writes nothing, so nothing asks for the withdrawal check");
    assert.deepEqual([reused.goal_id, reused.created], ["goal-existing", false]);
    assert.deepEqual(shape(linked.item_id), { linked: "goal-existing", revision: linked.revision, disposition: "promoted" }, "the item stays promoted");
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

test("the reader's promotion button follows the promote action: shown while Goals can be written through, gone when it cannot", async () => {
  let removed = false;
  const f = fixture(["Review external input"], { disableGoals: () => removed });
  const [item] = f.items;
  try {
    // The objects reader asks Feed's own read for the person's currently offered actions.
    const rendered: boolean[] = [];
    const detail = async () => { rendered.push((await f.person.invoke(feedQueryActions.reader, { object_id: item!.item_id })).promote_available); };
    await detail();
    removed = true;
    await detail();
    removed = false;
    await detail();
    assert.deepEqual(rendered, [true, false, true]);
  } finally { await f.done(); }
});

test("whether the promotion is offered is one predicate for the offers and the reader: Feed's own action at this version, runnable, and nothing else", async () => {
  const f = fixture(["Review external input"]);
  try {
    const views = await f.host.inspectActions(f.personContext, f.reference);
    const promote = views.find(view => view.capability_id === feedItemActions.promote.capability_id)!;
    const rest = views.filter(view => view !== promote);
    assert.equal(promoteOffered(views), true, "the directory of a project with Goals offers it");
    assert.equal(promoteOffered(rest), false, "a listing without the action does not");
    assert.equal(promoteOffered([...rest, { ...promote, provider: { ...promote.provider, plugin_id: GOALS_PLUGIN_ID } }]), false, "an action of another plugin under the same id is not Feed's promotion");
    assert.equal(promoteOffered([...rest, { ...promote, version: promote.version + 1 }]), false, "another version is not the promotion Feed's offers point at");
    assert.equal(promoteOffered([...rest, { ...promote, availability: { available: false, code: "actions.plugin_disabled", reason: "Goals 已从项目移除" } }]), false, "an action that cannot run is not offered");
  } finally { await f.done(); }
});

test("only the person names the creation channel: a Runtime's promotion is recorded as the Runtime's", async () => {
  const f = fixture(["Runtime promotion"]);
  const [item] = f.items;
  try {
    const promoted = await f.runtime.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(promoted.created, true);
    assert.equal((await f.runtime.invoke(goalsActions.state, { goal_id: promoted.goal_id })).intent.source_kind, "runtime");
    const owned = await f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT).filter(binding => binding.goal_id === promoted.goal_id));
    assert.deepEqual(owned.map(binding => binding.created_by), ["runtime:promoter:session"]);
  } finally { await f.done(); }
});

test("only the person's promotion confirms the input: an assistant, Agent, workflow or MCP client's leaves it proposed, and says so", async () => {
  const f = fixture(["Person", "Agent", "Workflow", "MCP"]);
  const callers: Array<[string, ActionCallContext]> = [["person", f.personContext], ["agent", f.runtimeContext],
    ["workflow", { ...f.runtimeContext, audience: "workflow" }], ["mcp", { ...f.runtimeContext, audience: "mcp" }]];
  try {
    const receipts = await Promise.all(callers.map(async ([, caller], index) => {
      const item = f.items[index]!;
      const promoted = await f.client.invoke(caller, feedItemActions.promote, { item_id: item.item_id, expected_revision: item.revision }) as { goal_id: string };
      const owned = await f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT).filter(receipt => receipt.goal_id === promoted.goal_id));
      return owned.map(receipt => [receipt.state, receipt.created_by, receipt.reason]);
    }));
    assert.deepEqual(callers.map(([name], index) => [name, receipts[index]]), [
      ["person", [["confirmed", "web-user", "用户从 Feed Item 创建 Goal 时确认该输入"]]],
      ["agent", [["proposed", "runtime:promoter:session", "从 Feed Item 创建 Goal 时提议该输入，待用户确认"]]],
      ["workflow", [["proposed", "runtime:promoter:session", "从 Feed Item 创建 Goal 时提议该输入，待用户确认"]]],
      ["mcp", [["proposed", "runtime:promoter:session", "从 Feed Item 创建 Goal 时提议该输入，待用户确认"]]],
    ]);
  } finally { await f.done(); }
});

// Goals reads the person from what the Host sets on the nested caller of a plugin's action directory (S-43), so only the person's own call to
// Feed's action confirms, and only for Feed's own source (the `feed` channel, a `feed_item` input; S-99 provisional): an assistant, Agent,
// workflow or MCP client handing in through Feed, a scene's run, a caller that only claims the person, another plugin handing in for the person
// (Workflows), and a plugin's own call (a Feed timer: `plugin` audience, which these Goals actions are not open to) never do. A delegation that
// names no channel is the Runtime's: Feed's own promotion always names `feed` for the person.
test("Goals takes the person only from the Host's delegated caller: no other origin confirms an input or names the Goal's channel", async () => {
  const f = fixture(["Delegated"]);
  const [item] = f.items;
  const delegated = (delegated_audience: ActionAudience, extra: Partial<ActionCallContext> = {}): ActionCallContext =>
    ({ ...f.personContext, audience: "workflow", delegated_by: FEED_PLUGIN_ID, delegated_audience, ...extra });
  // BL-803: the Host also hands in the delegating handler's own action from the Runtime's scope; only Feed's real promotion entered by the person counts.
  const promote = { delegated_action: { capability_id: "feed.items.promote", version: 1, provider_id: FEED_PLUGIN_ID, direct_person_entry: true as const } };
  const callers: Array<[string, ActionCallContext]> = [["person", delegated("user", promote)], ["no proof", delegated("user")], ["agent", delegated("agent", promote)], ["workflow", delegated("workflow", promote)],
    ["mcp", delegated("mcp")], ["scene", delegated("user", { scene_binding: { scene_id: "feed.capture", binding_id: "capture-binding" } })],
    ["claimed", { ...f.personContext, audience: "workflow", delegated_audience: "user" }],
    ["other plugin", { ...f.personContext, audience: "workflow", delegated_by: "io.molis.work.native.workflows", delegated_audience: "user" }]];
  const intent = (key: string) => ({ title: "Delegated promotion", outcome: "Checked", why: "Who asked", business_logic: "Only the trusted caller", priority: 50, idempotency_key: key });
  const confirm = (goal_id: string) => ({ goal_id, source: { kind: "feed_item" as const, id: item!.item_id }, name: "Feed Item 输入", snapshot_digest: `sha256:${"0".repeat(64)}`, reason: "who asked" });
  const receipts = () => f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT).map(receipt => [receipt.goal_id, receipt.state]));
  try {
    const outcomes: unknown[] = [];
    for (const [name, caller] of callers) {
      const named = await f.client.invoke(caller, goalsActions.create, { ...intent(`named-${name}`), source_kind: "feed" }).then(() => "named", (error: ActionError) => error.code);
      const { goal } = await f.client.invoke(caller, goalsActions.create, intent(`plain-${name}`)) as { goal: { goal_id: string } };
      await f.client.invoke(caller, goalsActions.inputsConfirm, confirm(goal.goal_id));
      const state = (await receipts()).find(([goalId]) => goalId === goal.goal_id)?.[1];
      outcomes.push([name, named, (await f.person.invoke(goalsActions.state, { goal_id: goal.goal_id })).intent.source_kind, state]);
    }
    assert.deepEqual(outcomes, [
      ["person", "named", "runtime", "confirmed"],
      ["no proof", "actions.input_invalid", "runtime", "proposed"],
      ["agent", "actions.input_invalid", "runtime", "proposed"],
      ["workflow", "actions.input_invalid", "runtime", "proposed"],
      ["mcp", "actions.input_invalid", "runtime", "proposed"],
      ["scene", "actions.input_invalid", "runtime", "proposed"],
      ["claimed", "actions.input_invalid", "runtime", "proposed"],
      ["other plugin", "actions.input_invalid", "runtime", "proposed"],
    ]);

    // Feed's own timer reaches Goals as the plugin's own call (`plugin` audience, S-73), which neither action admits; a caller only shaped like
    // one is refused before that, as only the Host issues a plugin's caller. Either way nothing is created or recorded.
    for (const definition of [goalsActions.create, goalsActions.inputsConfirm]) assert.equal(definition.action.audiences?.includes("plugin"), false, definition.capability_id);
    const before = await receipts();
    const timer: ActionCallContext = { ...f.personContext, actor_id: "plugin:feed", audience: "plugin", delegated_by: FEED_PLUGIN_ID, delegated_audience: "plugin" };
    await assert.rejects(f.client.invoke(timer, goalsActions.create, intent("timer")), { code: "host.plugin_caller_invalid" });
    const { goal } = await f.person.invoke(goalsActions.create, intent("timer-target"));
    await assert.rejects(f.client.invoke(timer, goalsActions.inputsConfirm, confirm(goal.goal_id)), { code: "host.plugin_caller_invalid" });
    assert.deepEqual(await receipts(), before);
  } finally { await f.done(); }
});

test("promotion uses the caller's own grants: a client allowed only the promotion does not reach Goals through it", async () => {
  const f = fixture(["Granted promotion"]);
  const [item] = f.items;
  const reference = (definition: { capability_id: string; version: number }, provider_id: string) => ({ capability_id: definition.capability_id, version: definition.version, provider_id });
  const promotion = reference(feedItemActions.promote, FEED_PLUGIN_ID);
  const mcp: ActionCallContext = { ...f.runtimeContext, audience: "mcp", allowed_actions: [promotion] };
  try {
    const view = (await f.host.inspectActions(mcp, f.reference)).find(row => row.capability_id === feedItemActions.promote.capability_id)!;
    assert.deepEqual([view.availability.available, !view.availability.available && view.availability.code], [false, "actions.forbidden"]);
    await assert.rejects(f.client.invoke(mcp, feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), { code: "actions.forbidden" });
    assert.equal((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item.linked_goal_id, null);

    // The grants for the three Goals actions it writes through make it available, and the Goal is the client's.
    const granted: ActionCallContext = { ...mcp, allowed_actions: [promotion, reference(goalsActions.directoryItem, GOALS_PLUGIN_ID),
      reference(goalsActions.create, GOALS_PLUGIN_ID), reference(goalsActions.inputsConfirm, GOALS_PLUGIN_ID), reference(goalsActions.state, GOALS_PLUGIN_ID)] };
    const promoted = await f.client.invoke(granted, feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }) as { goal_id: string; created: boolean };
    assert.equal(promoted.created, true);
    assert.equal((await f.client.invoke(granted, goalsActions.state, { goal_id: promoted.goal_id }) as { intent: { source_kind: string } }).intent.source_kind, "runtime");
  } finally { await f.done(); }
});

test("an item that changed while Goals worked is refused and Feed writes nothing for it", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-feed-promotion-stale-"));
  const databasePath = join(home, "project.db");
  seedBoard(databasePath, PROJECT);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, PROJECT).register({ kind: "web_query", query: "Review external input" }).source;
    const item = feed.ingestItem({ source, externalId: "stale", title: "Changes underneath", summary: "s", body: "b", priority: "low",
      occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
    const calls: string[] = [];
    const goals: FeedGoalPromotionGoals = {
      active: async () => null,
      create: async () => { calls.push("create"); return { goal_id: "goal-made", replayed: false }; },
      confirmInput: async () => { calls.push("confirm"); feed.setDisposition(PROJECT, item.item_id, "saved", item.revision); },
    };
    const ports = { feed, goals, hydrateItem: (row: typeof item) => row, transaction: <T>(operation: () => T) => store.db.transaction(operation).immediate(), beforeEffect: async () => {}, by_person: true };
    await assert.rejects(promoteFeedItemToGoal(ports, { projectId: PROJECT, routePrefix: "", itemId: item.item_id, expectedRevision: item.revision }),
      (error: unknown) => error instanceof ActionError && error.code === "feed.revision_conflict");
    assert.deepEqual(calls, ["create", "confirm"]);
    const after = feed.getItem(PROJECT, item.item_id);
    assert.equal(after.linked_goal_id, null);
    assert.equal(after.disposition, "saved");
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});

test("RAC-2299 Feed promotion truncates the Goal title and its source title by whole characters, never leaving half of a two-unit character", async () => {
  const prefix = "处理 Feed Item：";
  // Neither an unpaired high surrogate nor an unpaired low one: how a title that was cut by UTF-16 units shows a half character.
  const whole = (text: string) => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text);
  const f = fixture(["x".repeat(103) + "🙂" + "尾", "🙂".repeat(130), "a".repeat(200)]);
  try {
    const titles: string[] = [];
    for (const item of f.items) {
      const promoted = await f.person.invoke(feedItemActions.promote, { item_id: item.item_id, expected_revision: item.revision });
      titles.push((await f.person.invoke(goalsActions.contract, { goal_id: promoted.goal_id })).goal.title);
    }
    // The 104th unit is the first half of the 🙂: the source title keeps the whole character, and the Goal title with it.
    assert.equal(titles[0], prefix + "x".repeat(103) + "🙂");
    assert.equal(whole(titles[0]!), true);
    // 130 of them: the source title keeps 104 whole ones and the Goal title then fits them all, 117 characters, under its 120.
    assert.equal(titles[1], prefix + "🙂".repeat(104));
    assert.equal([...titles[1]!].length, 117);
    assert.equal(whole(titles[1]!), true);
    // A plain title cuts where it did before: 104 characters of the source title under the 13-character prefix.
    assert.equal(titles[2], prefix + "a".repeat(104));
  } finally { await f.done(); }
});

// RAC-2708 (BL-121 ②): the start chain is gone, so the action's input no longer carries start_processing: a caller that still sends it is
// refused by the action's own closed input schema, not quietly given the old "start processing" behaviour.
test("RAC-2708 feed.item.promote refuses start_processing after the start chain is gone", async () => {
  const f = fixture(["Review external input"]);
  const [item] = f.items;
  try {
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision, start_processing: true }),
      { code: "actions.input_invalid" }, "the closed input schema refuses the removed start_processing field");
  } finally { await f.done(); }
});
