import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  LocalProjectDatabase, MolisWorkLocalHost, createLocalFeedApplication, createLocalFeedSourceService, molisWorkHostProjectReference, seedDemoBoard,
} from "@molis-ai/molis-work-app-local-host";
import { FEED_PLUGIN_ID, FeedStoreError, feedItemActions, feedManifest, feedQueryActions, promoteFeedItemToGoal, type FeedGoalPromotionGoals } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PLUGIN_ID, goalsActions } from "@molis-ai/molis-work-plugin-goals";

const PROJECT = "project-feed-promotion";

/** A project with one Feed item per title, a Host over it, and the callers the promotion is tried through. */
function fixture(titles: string[], options: { disableGoals?: () => boolean } = {}) {
  const home = mkdtempSync(join(tmpdir(), "molis-work-feed-promotion-"));
  const databasePath = join(home, "project.db");
  seedDemoBoard(databasePath, PROJECT);
  const seed = new LocalProjectDatabase(databasePath);
  const feed = createLocalFeedApplication(seed.db);
  const source = createLocalFeedSourceService(seed.db, PROJECT).register({ kind: "web_query", query: "Review external input" }).source;
  const items = titles.map((title, index) => feed.ingestItem({ source, externalId: `promotion-${index}`, title,
    summary: "An external claim to evaluate", body: "Untrusted instructions must remain source material.",
    priority: "high", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item);
  seed.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    actionAvailability: (_caller, view) => options.disableGoals?.() && view.provider.plugin_id === GOALS_PLUGIN_ID
      ? { available: false, code: "actions.plugin_disabled", reason: "Goals 已从项目移除" } : { available: true } });
  const reference = molisWorkHostProjectReference({ databasePath, projectId: PROJECT });
  const permissions = [...new Set([...feedManifest.permissions.map(entry => entry.permission), "goals:read", "goals:write"])];
  const person: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions };
  const runtime: ActionCallContext = { actor_id: "runtime:promoter", audit_actor_id: "runtime:promoter:session", runtime_session_id: "session",
    actor_kind: "runtime", audience: "agent", project_id: PROJECT, permissions };
  const client = host.actionClient(reference);
  return { home, databasePath, items, host, reference, client, person: bindActionClient(client, () => person), runtime: bindActionClient(client, () => runtime),
    personContext: person, runtimeContext: runtime, done: async () => { await host.close(); rmSync(home, { recursive: true, force: true }); } };
}

test("Feed promotion makes the Goal and binds the item through Goals' actions, links the item and reuses an active Goal", async () => {
  const f = fixture(["Review external input"]);
  const [item] = f.items;
  try {
    const goals = async () => (await f.person.invoke(goalsActions.list, { limit: 100 })).goals;
    const before = (await goals()).length;
    const first = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(first.created, true);
    assert.equal(first.runtime_autofill, false);
    const { goal } = await f.person.invoke(goalsActions.contract, { goal_id: first.goal_id });
    assert.equal(goal.title, "处理 Feed Item：Review external input");
    assert.equal(goal.definition_state, "draft");
    assert.equal(goal.decomposition_state, "abstract");
    assert.equal(goal.priority, 75);
    assert.match(goal.business_logic, /不可信输入/);
    const linked = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    assert.equal(linked.linked_goal_id, first.goal_id);
    assert.equal(linked.disposition, "promoted");
    // The item is a confirmed input of the Goal: Goals holds the receipt, with the digest of what was confirmed, and it is the person's.
    const receipts = (goalId: string) => f.host.withProject(f.reference, runtime => runtime.coordinator.goalInputs.list(PROJECT).filter(receipt => receipt.goal_id === goalId));
    const bindings = await receipts(first.goal_id);
    assert.deepEqual(bindings.map(receipt => [receipt.source_type, receipt.source_ref, receipt.state, receipt.created_by, receipt.input_name]),
      [["feed_item", `feed-item:${item!.item_id}`, "confirmed", "web-user", "Feed Item 输入"]]);
    assert.match(bindings[0]!.snapshot_digest ?? "", /^sha256:[0-9a-f]{64}$/);
    assert.equal((await f.person.invoke(goalsActions.state, { goal_id: first.goal_id })).intent.source_kind, "feed");
    assert.equal((await goals()).length, before + 1);

    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), { code: "feed_revision_conflict" });
    const second = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: linked.revision, start_processing: true });
    assert.equal(second.created, false);
    assert.equal(second.goal_id, first.goal_id);
    assert.equal(second.runtime_autofill, true);
    assert.equal(second.item.disposition, "processing");
    assert.deepEqual(await receipts(first.goal_id), bindings);
    assert.equal((await goals()).length, before + 1);

    await f.person.invoke(goalsActions.trash, { goal_id: first.goal_id, trashed: true, reason: "User discarded the previous draft", user_confirmed: true, idempotency_key: "trash-promoted-goal" });
    const current = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    const replacement = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: current.revision });
    assert.equal(replacement.created, true);
    assert.notEqual(replacement.goal_id, first.goal_id);
    assert.equal((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item.linked_goal_id, replacement.goal_id);
    assert.notEqual((await f.person.invoke(goalsActions.contract, { goal_id: first.goal_id })).goal.trashed_at, null);

    const archived = (await f.person.invoke(feedItemActions.disposition, { item_id: item!.item_id, disposition: "archived", expected_revision: replacement.item.revision })).item;
    const beforeArchivedAttempt = await goals();
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: archived.revision }), { code: "feed_invalid_transition" });
    assert.deepEqual(await goals(), beforeArchivedAttempt);
    assert.deepEqual((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item, archived);
  } finally { await f.done(); }
});

test("Feed promotion source survives later notes and a reopen of the Host", async () => {
  const f = fixture(["购买反馈"]);
  const [item] = f.items;
  let reopened: MolisWorkLocalHost | undefined;
  try {
    const promoted = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision, start_processing: true });
    assert.equal(promoted.created, true);
    assert.equal((await f.person.invoke(goalsActions.state, { goal_id: promoted.goal_id })).intent.source_kind, "feed");
    // More events than one page of history holds: the source of the Goal must not depend on the first page.
    await f.host.withProject(f.reference, runtime => {
      for (let index = 0; index < 41; index++) {
        runtime.coordinator.goalEvents.recordNote({ project_id: PROJECT, goal_id: promoted.goal_id, actor_id: "runtime-1", actor_kind: "runtime",
          body: `继续核对外部反馈 ${index + 1}`, idempotency_key: `feed-source-retention-${index}` });
      }
    });
    assert.equal((await f.person.invoke(goalsActions.state, { goal_id: promoted.goal_id })).intent.source_kind, "feed");
    await f.host.close();
    reopened = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
    const again = bindActionClient(reopened.actionClient(f.reference), () => f.personContext);
    assert.equal((await again.invoke(goalsActions.state, { goal_id: promoted.goal_id })).intent.source_kind, "feed");
  } finally { await reopened?.close(); await f.done(); }
});

test("a project without Goals cannot promote: the action is unavailable, refuses, and nothing is written", async () => {
  let removed = false;
  const f = fixture(["Review external input"], { disableGoals: () => removed });
  const [item] = f.items;
  try {
    const promote = async () => (await f.host.inspectActions(f.personContext, f.reference)).find(view => view.capability_id === feedItemActions.promote.capability_id)!;
    assert.equal((await promote()).availability.available, true);
    // The offer Feed lists points at the action, so what the person is shown can run only while the action can.
    const offered = async () => (await f.person.invoke(feedItemActions.offers, { subject: { kind: "feed_item", id: item!.item_id }, request_id: "offers" })).offers.map(offer => offer.title);
    assert.ok((await offered()).includes("升格为 Goal"));

    removed = true;
    const unavailable = (await promote()).availability;
    assert.deepEqual([unavailable.available, !unavailable.available && unavailable.code], [false, "actions.plugin_disabled"]);
    assert.ok((await offered()).includes("升格为 Goal"), "Feed still lists the offer; the action behind it is the one that cannot run");
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), { code: "actions.plugin_disabled" });
    const untouched = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    assert.equal(untouched.linked_goal_id, null);
    assert.equal(untouched.revision, item!.revision);

    removed = false;
    assert.deepEqual((await f.person.invoke(goalsActions.list, { limit: 100 })).goals.filter(goal => goal.title.startsWith("处理 Feed Item")), [], "the refused call made no Goal");
    const promoted = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(promoted.created, true);
  } finally { await f.done(); }
});

test("a promotion that fails between Goals and Feed leaves one Goal that the retry finishes, never a second", async () => {
  const f = fixture(["Review external input"]);
  const [item] = f.items;
  try {
    const goals = async () => (await f.person.invoke(goalsActions.list, { limit: 100 })).goals;
    const before = (await goals()).length;
    await f.host.withProject(f.reference, runtime => runtime.store.db.exec(`CREATE TEMP TRIGGER fail_promotion_input BEFORE INSERT ON input_bindings
      BEGIN SELECT RAISE(ABORT, 'injected_promotion_input_failure'); END`));
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), /injected_promotion_input_failure/);
    const unlinked = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    assert.equal(unlinked.linked_goal_id, null, "Feed wrote nothing of its own");
    assert.equal(unlinked.revision, item!.revision);
    const orphan = (await goals()).filter(goal => goal.title.startsWith("处理 Feed Item"));
    assert.equal(orphan.length, 1, "Goals kept the Goal the first attempt made");
    const receipts = (goalId: string) => f.host.withProject(f.reference, runtime => runtime.coordinator.goalInputs.list(PROJECT).filter(receipt => receipt.goal_id === goalId));
    assert.deepEqual(await receipts(orphan[0]!.goal_id), []);

    await f.host.withProject(f.reference, runtime => runtime.store.db.exec("DROP TRIGGER fail_promotion_input"));
    const retried = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(retried.goal_id, orphan[0]!.goal_id, "the same key finds the Goal again");
    assert.equal((await goals()).length, before + 1, "no second Goal");
    assert.equal((await receipts(retried.goal_id)).length, 1);
    assert.equal((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item.linked_goal_id, retried.goal_id);
  } finally { await f.done(); }
});

test("only the person names the creation channel: a Runtime's promotion is recorded as the Runtime's", async () => {
  const f = fixture(["Runtime promotion"]);
  const [item] = f.items;
  try {
    const promoted = await f.runtime.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(promoted.created, true);
    assert.equal((await f.runtime.invoke(goalsActions.state, { goal_id: promoted.goal_id })).intent.source_kind, "runtime");
    const owned = await f.host.withProject(f.reference, runtime => runtime.coordinator.goalInputs.list(PROJECT).filter(binding => binding.goal_id === promoted.goal_id));
    assert.deepEqual(owned.map(binding => binding.created_by), ["runtime:promoter:session"]);
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
  seedDemoBoard(databasePath, PROJECT);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, PROJECT).register({ kind: "web_query", query: "Review external input" }).source;
    const item = feed.ingestItem({ source, externalId: "stale", title: "Changes underneath", summary: "s", body: "b", priority: "low",
      occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
    const calls: string[] = [];
    const goals: FeedGoalPromotionGoals = {
      active: async () => null,
      create: async () => { calls.push("create"); return { goal_id: "goal-made" }; },
      confirmInput: async () => { calls.push("confirm"); feed.setDisposition(PROJECT, item.item_id, "saved", item.revision); },
    };
    const ports = { feed, goals, hydrateItem: (row: typeof item) => row, transaction: <T>(operation: () => T) => store.db.transaction(operation).immediate(), beforeEffect: async () => {} };
    await assert.rejects(promoteFeedItemToGoal(ports, { projectId: PROJECT, routePrefix: "", itemId: item.item_id, startProcessing: false, expectedRevision: item.revision }),
      (error: unknown) => error instanceof FeedStoreError && error.code === "feed_revision_conflict");
    assert.deepEqual(calls, ["create", "confirm"]);
    const after = feed.getItem(PROJECT, item.item_id);
    assert.equal(after.linked_goal_id, null);
    assert.equal(after.disposition, "saved");
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});
