import { buildMolisWorkWebView } from "./fixtures/web-view.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  LocalProjectDatabase,
  createLocalFeedApplication,
} from "@molis-ai/molis-work-app-local-host";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { GOALS_PLUGIN_ID, goalsManifest, hostEventDecisionAuthority } from "@molis-ai/molis-work-plugin-goals";
import { renderMolisWorkWeb } from "./workbench-renderer-fixture.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";
import { recordInstallation } from "./fixtures/plugin-installations.js";

const BOARD = "board";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-goal-decision-attention-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: BOARD, actor_id: "user-1", idempotency_key: "init" });
  // Goals runs over this library: a start would have left its build and installation here, which is where the Inbox reads its declaration.
  recordInstallation(store.db, goalsManifest);
  const root = app.goalEvents.createIntent({
    project_id: BOARD,
    goal_id: "root",
    title: "根目标",
    outcome: "保留待判断",
    actor_id: "web-user",
    actor_kind: "user",
    idempotency_key: "root-intent",
    source_kind: "web",
  });
  return { directory, store, app, feed: createLocalFeedApplication(store.db), rootId: root.goal.goal_id };
}

function propose(app: GoalProjectApplication, childId: string, key: string) {
  return app.goalTreeSubmission.submitGoalTreeProposal({
    project_id: BOARD,
    actor_id: "runtime:test:session",
    root_goal_id: "root",
    summary: `新增 ${childId}`,
    items: [{
      item_id: `${childId}-item`,
      kind: "goal",
      operation: "create",
      payload: { goal_id: childId, title: childId, outcome: `${childId} 结果` },
      source_refs: ["runtime"],
      reason: "用户确认后创建",
      confidence: 1,
    }],
    idempotency_key: key,
  }).proposal;
}

function decide(app: GoalProjectApplication, proposalId: string, key: string) {
  return app.goalTreeDecision.decideGoalTreeProposal({
    project_id: BOARD,
    proposal_id: proposalId,
    authority: {
      ...hostEventDecisionAuthority("web", BOARD, "web-user", key),
      whole_confirmation_prompted: true,
    },
    confirm_all_pending: true,
    reason: "采用",
    idempotency_key: key,
  });
}

function goalDecisionEntries(feed: ReturnType<typeof createLocalFeedApplication>) {
  return feed.listInboxEntries(BOARD).filter((entry) =>
    entry.subject_type === "goal_decision" && entry.subject_id === "root",
  );
}

test("submitting a Goal proposal writes one open Attention row and keeps it for later proposals on the same Goal", () => {
  const data = fixture();
  try {
    propose(data.app, "child-a", "propose-a");
    let entries = goalDecisionEntries(data.feed);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.status, "open");
    assert.equal(entries[0]?.reason, "goal_decision");
    const entryId = entries[0]!.entry_id;
    propose(data.app, "child-b", "propose-b");
    entries = goalDecisionEntries(data.feed);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.entry_id, entryId);
    assert.equal(entries[0]?.status, "open");
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("deciding the last pending proposal marks Attention done; a new submit reopens it", () => {
  const data = fixture();
  try {
    const first = propose(data.app, "child-done", "propose-done");
    decide(data.app, first.proposal_id, "decide-done");
    let entries = goalDecisionEntries(data.feed);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.status, "done");
    propose(data.app, "child-reopen", "propose-reopen");
    entries = goalDecisionEntries(data.feed);
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.status, "open");
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("reconcile does not reopen a dismissed Goal decision; a new submit does", () => {
  const data = fixture();
  try {
    propose(data.app, "child-dismiss", "propose-dismiss");
    const open = goalDecisionEntries(data.feed)[0];
    assert.ok(open);
    data.feed.setInboxEntryStatus(BOARD, open.entry_id, "dismissed", open.revision);
    data.app.goalDecisionAttention.reconcile(BOARD);
    assert.equal(goalDecisionEntries(data.feed)[0]?.status, "dismissed");
    propose(data.app, "child-after-dismiss", "propose-after-dismiss");
    assert.equal(goalDecisionEntries(data.feed)[0]?.status, "open");
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("Goal pending decisions appear in Inbox and on the Goal document, not in Feed", () => {
  const data = fixture();
  try {
    propose(data.app, "child-ui", "propose-ui");
    const view = buildMolisWorkWebView(data.store, data.app, { projectId: BOARD });
    const home = renderMolisWorkWeb(view);
    const goalPage = renderMolisWorkWeb(view, "root");
    assert.match(home, /data-desktop-directory="root"/);
    assert.match(home, /data-inbox-directory/);
    assert.match(home, /data-inbox-workbench/);
    assert.match(home, /data-inbox-subject-type="goal_decision"/);
    assert.match(home, /data-inbox-subject-id="root"/);
    assert.match(home, /打开 Goal/);
    assert.doesNotMatch(home, /data-feed-entry-id="decision:/);
    assert.doesNotMatch(home, /data-feed-detail="decision:/);
    assert.match(goalPage, /data-goal-decision-panel/);
    assert.match(goalPage, /data-goal-tree-decision-form/);
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("RAC-806 the Inbox lists the decision reminder Goals keeps under its own id, and no other plugin's entry of the same kind", () => {
  const data = fixture();
  try {
    propose(data.app, "child-owner", "propose-owner");
    const mine = goalDecisionEntries(data.feed);
    assert.equal(mine.length, 1);
    assert.equal(mine[0]?.owner_plugin_id, GOALS_PLUGIN_ID);
    // Another plugin may declare the same kind for the same bare id (S9-0b): the Inbox does not resolve it as a Goal's.
    const other = new AttentionModule(data.store.db, { exists: () => true }, { eventSink: () => undefined })
      .commands.create({ project_id: BOARD, owner_plugin_id: "io.molis.work.other", subject_type: "goal_decision", subject_id: "root", reason: "goal_decision" }).entry;
    assert.deepEqual(goalDecisionEntries(data.feed).map(entry => entry.entry_id), [mine[0]!.entry_id]);
    assert.throws(() => data.feed.getInboxEntry(BOARD, other.entry_id), { code: "inbox.entry_not_found" });
    assert.equal(data.feed.getInboxEntry(BOARD, mine[0]!.entry_id).entry_id, mine[0]!.entry_id);
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("reconcile restores Attention for a historical pending Goal that has no row", () => {
  const data = fixture();
  try {
    propose(data.app, "child-history", "propose-history");
    assert.equal(goalDecisionEntries(data.feed).length, 1);
    data.store.db.prepare("DELETE FROM inbox_entries WHERE project_id = ? AND subject_type = 'goal_decision'").run(BOARD);
    assert.equal(goalDecisionEntries(data.feed).length, 0);
    data.app.goalDecisionAttention.reconcile(BOARD);
    const restored = goalDecisionEntries(data.feed);
    assert.equal(restored.length, 1);
    assert.equal(restored[0]?.status, "open");
    assert.equal(restored[0]?.subject_id, "root");
  } finally {
    data.store.close();
    rmSync(data.directory, { recursive: true, force: true });
  }
});

test("W2-18-ATTENTION-TX-01 independent Goal reconcile refuses a failing journal atomically and retries once", () => {
  const data = fixture();
  try {
    const proposal = propose(data.app, "child-atomic", "propose-atomic");
    data.store.db.prepare("DELETE FROM inbox_entries WHERE project_id = ? AND subject_type = 'goal_decision'").run(BOARD);
    const snapshot = () => ({ entries: data.store.db.prepare("SELECT * FROM inbox_entries ORDER BY entry_id").all(),
      attention: data.store.db.prepare("SELECT * FROM attention_events ORDER BY event_id").all(),
      journal: data.store.db.prepare("SELECT * FROM events ORDER BY seq").all() });
    const before = snapshot();
    data.store.db.exec("CREATE TRIGGER refuse_attention BEFORE INSERT ON events WHEN NEW.object_type = 'inbox_entry' BEGIN SELECT RAISE(ABORT, 'journal refused'); END;");
    assert.throws(() => data.app.goalDecisionAttention.reconcile(BOARD), /journal refused/);
    assert.deepEqual(snapshot(), before);
    assert.equal(data.app.goalTree.listGoalTreeProposals({ project_id: BOARD }).proposals.find(row => row.proposal_id === proposal.proposal_id)?.state, proposal.state);
    data.store.db.exec("DROP TRIGGER refuse_attention");
    data.app.goalDecisionAttention.reconcile(BOARD);
    data.app.goalDecisionAttention.reconcile(BOARD);
    assert.equal(goalDecisionEntries(data.feed).length, 1);
    assert.equal(snapshot().attention.length - before.attention.length, 1);
    assert.equal(snapshot().journal.length - before.journal.length, 1);
  } finally { data.store.close(); rmSync(data.directory, { recursive: true, force: true }); }
});
