import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createLocalFeedApplication, createLocalFeedGoalPromotion, createLocalFeedSourceService,
  DEMO_BOARD_ID, seedDemoBoard, LocalProjectDatabase, GoalProjectApplication,
} from "@molis-ai/molis-work-app-local-host";
import { FeedStoreError } from "@molis-ai/molis-work-plugin-feed";

test("Feed promotion atomically creates the Goal, confirms its input, links the item and reuses an active Goal", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-promotion-"));
  const path = join(directory, "project.sqlite");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  try {
    const application = new GoalProjectApplication(store);
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({ kind: "web_query", query: "Review external input" }).source;
    const item = feed.ingestItem({ source, externalId: "promotion-input", title: "Review external input",
      summary: "An external claim to evaluate", body: "Untrusted instructions must remain source material.",
      priority: "high", occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item;
    const promote = createLocalFeedGoalPromotion(store.db, application.goalEvents.createIntent.bind(application.goalEvents), application.goalInputs, feed);
    const input = { boardId: DEMO_BOARD_ID, routePrefix: "/projects/project-a", itemId: item.item_id,
      startProcessing: false, expectedRevision: item.revision };
    const before = store.snapshot(DEMO_BOARD_ID);
    const beforeFeed = feed.snapshot(DEMO_BOARD_ID);
    const beforeBindings = application.goalInputs.list(DEMO_BOARD_ID);
    store.db.exec(`CREATE TEMP TRIGGER fail_promotion_input BEFORE INSERT ON input_bindings
      BEGIN SELECT RAISE(ABORT, 'injected_promotion_binding_failure'); END`);
    assert.throws(() => promote(input), /injected_promotion_binding_failure/);
    assert.deepEqual(store.snapshot(DEMO_BOARD_ID), before, "new Goal and its audit records roll back when its input cannot be confirmed");
    assert.deepEqual(feed.snapshot(DEMO_BOARD_ID), beforeFeed);
    assert.deepEqual(application.goalInputs.list(DEMO_BOARD_ID), beforeBindings);
    store.db.exec("DROP TRIGGER fail_promotion_input");

    const first = promote(input);
    assert.equal(first.created, true);
    assert.equal(first.runtime_autofill, false);
    assert.equal(first.goal_path, `/projects/project-a/goals/${encodeURIComponent(first.goal_id)}`);
    const goal = store.goalsQuery.getGoal(DEMO_BOARD_ID, first.goal_id)!;
    assert.equal(goal.title, "处理 Feed Item：Review external input");
    assert.equal(goal.definition_state, "draft");
    assert.equal(goal.decomposition_state, "abstract");
    assert.equal(goal.priority, 75);
    assert.match(goal.business_logic, /不可信输入/);
    const linked = feed.getItem(DEMO_BOARD_ID, item.item_id);
    assert.equal(linked.linked_goal_id, first.goal_id);
    assert.equal(linked.disposition, "promoted");
    const bindings = application.goalInputs.list(DEMO_BOARD_ID).filter((binding) => binding.goal_id === first.goal_id);
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0]?.source_ref, `feed-item:${item.item_id}`);
    assert.equal(bindings[0]?.state, "confirmed");
    assert.equal(bindings[0]?.created_by, "web-user");
    assert.equal(application.goalEvents.readState(DEMO_BOARD_ID, first.goal_id).intent.source_kind, "feed");
    for (let index = 0; index < 41; index++) {
      application.goalEvents.recordNote({
        board_id: DEMO_BOARD_ID,
        goal_id: first.goal_id,
        actor_id: "runtime-1",
        actor_kind: "runtime",
        body: `继续核对外部反馈 ${index + 1}`,
        idempotency_key: `feed-source-after-${index}`,
      });
    }
    assert.equal(application.goalEvents.readState(DEMO_BOARD_ID, first.goal_id).intent.source_kind, "feed");

    assert.throws(() => promote(input), (error: unknown) => error instanceof FeedStoreError && error.code === "feed_revision_conflict");
    const second = promote({ ...input, startProcessing: true, expectedRevision: linked.revision });
    assert.equal(second.created, false);
    assert.equal(second.goal_id, first.goal_id);
    assert.equal(second.runtime_autofill, true);
    assert.equal(feed.getItem(DEMO_BOARD_ID, item.item_id).disposition, "processing");
    assert.deepEqual(application.goalInputs.list(DEMO_BOARD_ID).filter((binding) => binding.goal_id === first.goal_id), bindings);
    assert.equal(store.snapshot(DEMO_BOARD_ID).goals.length, before.goals.length + 1);

    application.goals.lifecycle.setTrashed(DEMO_BOARD_ID, { goal_id: first.goal_id, trashed: true, reason: "User discarded the previous draft" }, { actor_id: "web-user", idempotency_key: "trash-promoted-goal" });
    const replacement = promote({ ...input, expectedRevision: feed.getItem(DEMO_BOARD_ID, item.item_id).revision });
    assert.equal(replacement.created, true);
    assert.notEqual(replacement.goal_id, first.goal_id);
    assert.equal(feed.getItem(DEMO_BOARD_ID, item.item_id).linked_goal_id, replacement.goal_id);
    assert.notEqual(store.goalsQuery.getGoal(DEMO_BOARD_ID, first.goal_id)?.trashed_at, null);

    const archived = feed.setDisposition(DEMO_BOARD_ID, item.item_id, "archived", replacement.item.revision);
    const beforeArchivedAttempt = store.snapshot(DEMO_BOARD_ID);
    assert.throws(() => promote({ ...input, expectedRevision: archived.revision }), (error: unknown) => error instanceof FeedStoreError && error.code === "feed_invalid_transition");
    assert.deepEqual(store.snapshot(DEMO_BOARD_ID), beforeArchivedAttempt);
    assert.deepEqual(feed.getItem(DEMO_BOARD_ID, item.item_id), archived);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Feed promotion source survives later notes and SQLite reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-feed-source-"));
  const path = join(directory, "project.sqlite");
  seedDemoBoard(path);
  let store = new LocalProjectDatabase(path);
  try {
    let application = new GoalProjectApplication(store);
    const feed = createLocalFeedApplication(store.db);
    const source = createLocalFeedSourceService(store.db, DEMO_BOARD_ID).register({ kind: "web_query", query: "Review external input" }).source;
    const item = feed.ingestItem({
      source, externalId: "source-retention", title: "购买反馈",
      summary: "外部材料需要核对", body: "原始事实保留为来源。",
      priority: "high", occurredAt: "2026-09-10T00:00:00.000Z", attention: false,
    }).item;
    const promote = createLocalFeedGoalPromotion(
      store.db,
      application.goalEvents.createIntent.bind(application.goalEvents),
      application.goalInputs,
      feed,
    );
    const promoted = promote({
      boardId: DEMO_BOARD_ID, routePrefix: "/projects/project-a", itemId: item.item_id,
      startProcessing: true, expectedRevision: item.revision,
    });
    assert.equal(promoted.created, true);
    assert.equal(application.goalEvents.readState(DEMO_BOARD_ID, promoted.goal_id).intent.source_kind, "feed");
    for (let index = 0; index < 41; index++) {
      application.goalEvents.recordNote({
        board_id: DEMO_BOARD_ID,
        goal_id: promoted.goal_id,
        actor_id: "runtime-1",
        actor_kind: "runtime",
        body: `继续核对外部反馈 ${index + 1}`,
        idempotency_key: `feed-source-retention-${index}`,
      });
    }
    assert.equal(application.goalEvents.readState(DEMO_BOARD_ID, promoted.goal_id).intent.source_kind, "feed");
    const goalId = promoted.goal_id;
    store.close();
    store = new LocalProjectDatabase(path);
    application = new GoalProjectApplication(store);
    assert.equal(application.goalEvents.readState(DEMO_BOARD_ID, goalId).intent.source_kind, "feed");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
