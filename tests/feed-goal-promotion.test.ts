import { createLocalFeedApplication, createLocalFeedSourceService } from "./fixtures/feed-library.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { LocalProjectDatabase, MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { feedItemActions, feedQueryActions, promoteFeedItemToGoal, type FeedGoalPromotionGoals } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PLUGIN_ID, goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { goalApplicationOf, seedBoard } from "./fixtures/goal-application.js";
import { PROJECT, afterGoalsCall, fixture } from "./fixtures/feed-goal-promotion.js";

test("Feed promotion makes the Goal and binds the item through Goals' actions, links the item and reuses an active Goal", async () => {
  const f = fixture(["Review external input"]);
  const [item] = f.items;
  try {
    const goals = async () => (await f.person.invoke(goalsActions.list, { limit: 100 })).goals;
    const before = (await goals()).length;
    const first = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(first.created, true);
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
    const receipts = (goalId: string) => f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT).filter(receipt => receipt.goal_id === goalId));
    const bindings = await receipts(first.goal_id);
    assert.deepEqual(bindings.map(receipt => [receipt.source_type, receipt.source_ref, receipt.state, receipt.created_by, receipt.input_name]),
      [["feed_item", `feed-item:${item!.item_id}`, "confirmed", "web-user", "Feed Item 输入"]]);
    assert.equal(bindings[0]!.reason, "用户从 Feed Item 创建 Goal 时确认该输入");
    assert.match(bindings[0]!.snapshot_digest ?? "", /^sha256:[0-9a-f]{64}$/);
    assert.equal((await f.person.invoke(goalsActions.state, { goal_id: first.goal_id })).intent.source_kind, "feed");
    assert.equal((await goals()).length, before + 1);

    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), { code: "feed.revision_conflict" });
    const second = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: linked.revision });
    assert.equal(second.created, false);
    assert.equal(second.goal_id, first.goal_id);
    assert.equal(second.item.disposition, "promoted");
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
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: archived.revision }), { code: "feed.invalid_transition" });
    assert.deepEqual(await goals(), beforeArchivedAttempt);
    assert.deepEqual((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item, archived);
  } finally { await f.done(); }
});

test("Feed promotion source survives later notes and a reopen of the Host", async () => {
  const f = fixture(["购买反馈"]);
  const [item] = f.items;
  let reopened: MolisWorkLocalHost | undefined;
  try {
    const promoted = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(promoted.created, true);
    assert.equal((await f.person.invoke(goalsActions.state, { goal_id: promoted.goal_id })).intent.source_kind, "feed");
    // More events than one page of history holds: the source of the Goal must not depend on the first page.
    await f.host.withProject(f.reference, runtime => {
      for (let index = 0; index < 41; index++) {
        goalApplicationOf(runtime).goalEvents.recordNote({ project_id: PROJECT, goal_id: promoted.goal_id, actor_id: "runtime-1", actor_kind: "runtime",
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
    // What Feed offers follows the action it points at: the person is shown promotion only while it can run.
    const offered = async () => (await f.person.invoke(feedItemActions.offers, { subject: { kind: "feed_item", id: item!.item_id }, request_id: "offers" })).offers.map(offer => offer.title);
    assert.ok((await offered()).includes("升格为 Goal"));

    removed = true;
    const unavailable = (await promote()).availability;
    assert.deepEqual([unavailable.available, !unavailable.available && unavailable.code], [false, "actions.plugin_disabled"]);
    assert.ok(!(await offered()).includes("升格为 Goal"), "the offer follows the action behind it: with Goals gone Feed does not offer promotion");
    assert.ok((await offered()).includes("保存为资料"), "the other entries stay");
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), { code: "actions.plugin_disabled" });
    const untouched = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    assert.equal(untouched.linked_goal_id, null);
    assert.equal(untouched.revision, item!.revision);

    removed = false;
    assert.ok((await offered()).includes("升格为 Goal"), "offered again once Goals is back");
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
    // Goals' own tables take no trigger (a statement with one is refused), so the failure comes at the input's edge in the Context Ledger.
    await f.host.withProject(f.reference, runtime => runtime.store.db.exec(`CREATE TRIGGER fail_promotion_input BEFORE INSERT ON context_edges WHEN NEW.edge_key LIKE '${GOALS_PLUGIN_ID}:%'
      BEGIN SELECT RAISE(ABORT, 'injected_promotion_input_failure'); END`));
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), /injected_promotion_input_failure/);
    const unlinked = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    assert.equal(unlinked.linked_goal_id, null, "Feed wrote nothing of its own");
    assert.equal(unlinked.revision, item!.revision);
    const orphan = (await goals()).filter(goal => goal.title.startsWith("处理 Feed Item"));
    assert.equal(orphan.length, 1, "Goals kept the Goal the first attempt made");
    const receipts = (goalId: string) => f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT).filter(receipt => receipt.goal_id === goalId));
    assert.deepEqual(await receipts(orphan[0]!.goal_id), []);

    await f.host.withProject(f.reference, runtime => runtime.store.db.exec("DROP TRIGGER fail_promotion_input"));
    const retried = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(retried.goal_id, orphan[0]!.goal_id, "the same key finds the Goal again");
    assert.equal((await goals()).length, before + 1, "no second Goal");
    assert.equal((await receipts(retried.goal_id)).length, 1);
    assert.equal((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item.linked_goal_id, retried.goal_id);
  } finally { await f.done(); }
});

test("a leftover Goal the person has discarded is not taken up again: promoting again makes a fresh Goal and links it", async () => {
  const f = fixture(["Review external input"]);
  const [item] = f.items;
  try {
    const goals = async () => (await f.person.invoke(goalsActions.list, { limit: 100 })).goals.filter(goal => goal.title.startsWith("处理 Feed Item"));
    const receipts = (goalId: string) => f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT).filter(receipt => receipt.goal_id === goalId));
    const discard = (goalId: string) => f.person.invoke(goalsActions.trash, { goal_id: goalId, trashed: true, reason: "Discard the leftover", user_confirmed: true, idempotency_key: `discard-${goalId}` });
    const failInput = (on: boolean) => f.host.withProject(f.reference, runtime => on
      ? runtime.store.db.exec(`CREATE TRIGGER fail_promotion_input BEFORE INSERT ON context_edges WHEN NEW.edge_key LIKE '${GOALS_PLUGIN_ID}:%' BEGIN SELECT RAISE(ABORT, 'injected_promotion_input_failure'); END`)
      : runtime.store.db.exec("DROP TRIGGER fail_promotion_input"));
    const promote = () => f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    const stillUnlinked = async () => {
      const current = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
      assert.equal(current.linked_goal_id, null);
      assert.equal(current.revision, item!.revision, "the same revision stays: nothing but the key moves on");
    };

    await failInput(true);
    await assert.rejects(promote(), /injected_promotion_input_failure/);
    const [first] = await goals();
    await discard(first!.goal_id);
    // The key of this revision now returns the discarded Goal; Goals refuses an input for it, and that must not end the item's promotion.
    await assert.rejects(promote(), /injected_promotion_input_failure/);
    await stillUnlinked();
    const [second] = (await goals()).filter(goal => goal.goal_id !== first!.goal_id);
    assert.ok(second, "the retry made a fresh Goal, not the discarded one");
    await discard(second.goal_id);

    await failInput(false);
    // Marking it read leaves the revision where it is; promotion must still work at that revision.
    await f.person.invoke(feedItemActions.read, { item_id: item!.item_id });
    const promoted = await promote();
    assert.equal(promoted.created, true);
    assert.ok(![first!.goal_id, second.goal_id].includes(promoted.goal_id), "neither discarded Goal is taken up");
    assert.equal((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item.linked_goal_id, promoted.goal_id);
    assert.equal((await receipts(promoted.goal_id)).length, 1);
    assert.deepEqual(await Promise.all([first!, second].map(async goal => (await f.person.invoke(goalsActions.contract, { goal_id: goal.goal_id })).goal.trashed_at !== null)), [true, true]);
    assert.equal((await goals()).filter(goal => ![first!.goal_id, second.goal_id].includes(goal.goal_id)).length, 1, "one live Goal for the item");

    // Promoting again finds the live Goal, not a new one.
    const again = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: promoted.item.revision });
    assert.deepEqual([again.created, again.goal_id], [false, promoted.goal_id]);
  } finally { await f.done(); }
});

test("a promotion whose Feed action is withdrawn while Goals worked starts no further write in Goals: no Goal, no input receipt", async () => {
  let withdrawn = false;
  const f = fixture(["Review external input"], { disableFeed: () => withdrawn });
  const [item] = f.items;
  try {
    const receipts = () => f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT));
    const liveGoals = async () => (await f.person.invoke(goalsActions.list, { limit: 100 })).goals.filter(goal => goal.title.startsWith("处理 Feed Item"));
    // The item's Goal was discarded, so the next promotion first reads the directory and then, finding nothing, writes a new Goal.
    const first = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    await f.person.invoke(goalsActions.trash, { goal_id: first.goal_id, trashed: true, reason: "Discard before promoting again", user_confirmed: true, idempotency_key: "discard-before-promoting" });
    const current = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    const receiptsBefore = await receipts();
    assert.deepEqual(await liveGoals(), []);

    afterGoalsCall(f, goalsActions.directoryItem.capability_id, () => { withdrawn = true; });
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: current.revision }), { code: "actions.plugin_disabled" });
    assert.equal(withdrawn, true, "Feed was withdrawn while the call was running");
    withdrawn = false;
    assert.deepEqual(await liveGoals(), [], "the withdrawn call wrote no Goal");
    assert.deepEqual(await receipts(), receiptsBefore, "and no input receipt");
    const after = (await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item;
    assert.deepEqual([after.linked_goal_id, after.revision], [first.goal_id, current.revision], "nor did Feed touch the item");
  } finally { await f.done(); }
});

test("a promotion whose Feed action is withdrawn after Goals made the Goal writes no input receipt for it, and the retry finishes with the same Goal", async () => {
  let withdrawn = false;
  const f = fixture(["Review external input"], { disableFeed: () => withdrawn });
  const [item] = f.items;
  try {
    const receipts = () => f.host.withProject(f.reference, runtime => goalApplicationOf(runtime).goalInputs.list(PROJECT));
    const liveGoals = async () => (await f.person.invoke(goalsActions.list, { limit: 100 })).goals.filter(goal => goal.title.startsWith("处理 Feed Item"));
    afterGoalsCall(f, goalsActions.create.capability_id, () => { withdrawn = true; });
    await assert.rejects(f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision }), { code: "actions.plugin_disabled" });
    withdrawn = false;
    const [leftover] = await liveGoals();
    assert.ok(leftover, "the Goal Goals had already made is kept, as a failed step leaves it");
    assert.deepEqual(await receipts(), [], "but the input was not confirmed after Feed was withdrawn");
    assert.equal((await f.person.invoke(feedQueryActions.item, { item_id: item!.item_id })).item.linked_goal_id, null);

    const retried = await f.person.invoke(feedItemActions.promote, { item_id: item!.item_id, expected_revision: item!.revision });
    assert.equal(retried.goal_id, leftover.goal_id, "the same key finds the Goal again");
    assert.equal((await liveGoals()).length, 1);
    assert.equal((await receipts()).length, 1);
  } finally { await f.done(); }
});

test("promotion walks the keys of the item's revision past every Goal that can no longer take work", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-feed-promotion-keys-"));
  const databasePath = join(home, "project.db");
  seedBoard(databasePath, PROJECT);
  const store = new LocalProjectDatabase(databasePath);
  try {
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, PROJECT).register({ kind: "web_query", query: "Review external input" }).source;
    const item = feed.ingestItem({ source, externalId: "keys", title: "Keys", summary: "s", body: "b", priority: "low", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
    const base = `feed-promote-${item.item_id}-r${item.revision}`;
    const keys: string[] = [];
    // The first two keys return Goals that were made earlier and are gone now; the third is new.
    const goals: FeedGoalPromotionGoals = {
      active: async goalId => goalId === "goal-live" ? { goal_id: goalId } : null,
      create: async ({ idempotency_key }) => { keys.push(idempotency_key); return keys.length < 3 ? { goal_id: `goal-gone-${keys.length}`, replayed: true } : { goal_id: "goal-live", replayed: false }; },
      confirmInput: async ({ goal_id }) => { keys.push(`confirm:${goal_id}`); },
    };
    const ports = { feed, goals, hydrateItem: (row: typeof item) => row, transaction: <T>(operation: () => T) => store.db.transaction(operation).immediate(), beforeEffect: async () => {}, by_person: true };
    const promoted = await promoteFeedItemToGoal(ports, { projectId: PROJECT, routePrefix: "", itemId: item.item_id, expectedRevision: item.revision });
    assert.deepEqual(keys, [base, `${base}-2`, `${base}-3`, "confirm:goal-live"]);
    assert.deepEqual([promoted.goal_id, promoted.created], ["goal-live", true]);
    assert.equal(feed.getItem(PROJECT, item.item_id).linked_goal_id, "goal-live");

    // A key whose Goal can still take work is reused, never walked past.
    const reused = feed.ingestItem({ source, externalId: "keys-2", title: "Keys 2", summary: "s", body: "b", priority: "low", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
    const seen: string[] = [];
    const live: FeedGoalPromotionGoals = { active: async goalId => ({ goal_id: goalId }), create: async ({ idempotency_key }) => { seen.push(idempotency_key); return { goal_id: "goal-leftover", replayed: true }; }, confirmInput: async () => {} };
    await promoteFeedItemToGoal({ ...ports, goals: live }, { projectId: PROJECT, routePrefix: "", itemId: reused.item_id, expectedRevision: reused.revision });
    assert.deepEqual(seen, [`feed-promote-${reused.item_id}-r${reused.revision}`]);
  } finally { store.close(); rmSync(home, { recursive: true, force: true }); }
});
