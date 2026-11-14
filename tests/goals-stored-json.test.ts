import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import test from "node:test";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { GOALS_HOME_DATABASE, GOALS_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { GoalsModule } from "./fixtures/goals-modules.js";
import { fixtureProjectRule, GoalProjectApplication } from "./fixtures/goal-application.js";
import { projectApprovalRules } from "@molis-ai/molis-work-service-project-approvals";
import { pluginLegalSql } from "./fixtures/plugin-legal-sql.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

const BOARD = "board-stored-json";
const UNREADABLE = "goals.storage.record_unreadable";

function fixture() {
  const store = new LocalProjectDatabase(":memory:");
  const app = new GoalProjectApplication(store);
  app.initializeBoard({ project_id: BOARD, actor_id: "user-1", idempotency_key: "init" });
  return { store, app, goals: new GoalsModule(pluginLegalSql(store).db, store, {},
    { approvalRules: (project, history) => projectApprovalRules(store.db, project).read(history).rules }), close: () => store.close() };
}

/** BGE-05: the error names the broken cell by table, column and the row's own rowid (a decimal string), and nothing else. */
function locatedAt(error: ActionError, store: LocalProjectDatabase, table: string, column: string, where: string, ...params: string[]): void {
  const row = store.db.prepare(`SELECT rowid AS r FROM ${table} WHERE ${where}`).get(...params) as { r: number };
  assert.deepEqual(error.details, { storage: { table, column, row_ref: String(row.r) } });
}

function createGoal(app: GoalProjectApplication): string {
  return app.goalEvents.createIntent({
    project_id: BOARD, title: "库里存了读不出来的 JSON", outcome: "读的时候要报错",
    actor_id: "runtime-1", actor_kind: "runtime", idempotency_key: "intent-stored-json",
  }).goal.goal_id;
}

/** The one thing every case asserts: a stored-value read that cannot parse raises the owner's "record unreadable" code. */
function captured(action: () => unknown, code = UNREADABLE): ActionError {
  let thrown: unknown = null;
  try { action(); } catch (error) { thrown = error; }
  if (!(thrown instanceof ActionError)) assert.fail("读不出来的 JSON 应当抛 ActionError，而不是当成备用值");
  assert.equal(thrown.code, code);
  assert.equal(thrown.kind, "internal");
  return thrown;
}

test("RAC-1260: an unreadable project rule stops policy resolution and the snapshot instead of reading as no rule", () => {
  const data = fixture();
  try {
    const goalId = createGoal(data.app);
    fixtureProjectRule(data.store, BOARD, "user-1", true, "Require approval");
    const at = "project_id = ? AND state = 'active'";
    data.store.db.prepare(`UPDATE project_approval_rules SET scope_json = ? WHERE ${at}`).run('{"kind":"invalid-scope"}', BOARD);
    // BGE-05：同一表列经两条读取路径（规则解析与快照），两条都指到同一行。
    locatedAt(captured(() => data.goals.query.resolvePolicy(BOARD, goalId), "actions.execution_failed"), data.store, "project_approval_rules", "scope_json", at, BOARD);
    locatedAt(captured(() => data.goals.query.snapshot(BOARD), "actions.execution_failed"), data.store, "project_approval_rules", "scope_json", at, BOARD);
  } finally { data.close(); }
});

test("RAC-1262: an unreadable Goal list column stops the snapshot and the Goal list", () => {
  const listColumn = fixture();
  try {
    const goalId = createGoal(listColumn.app);
    listColumn.store.db.prepare("UPDATE goals SET in_scope_json = ? WHERE goal_id = ?").run('{"unreadable":', goalId);
    locatedAt(captured(() => listColumn.goals.query.snapshot(BOARD)), listColumn.store, "goals", "in_scope_json", "goal_id = ?", goalId);
    locatedAt(captured(() => listColumn.goals.query.listGoals(BOARD)), listColumn.store, "goals", "in_scope_json", "goal_id = ?", goalId);
  } finally { listColumn.close(); }

  const criterionColumn = fixture();
  try {
    criterionColumn.goals.commands.createGoal(BOARD, {
      goal_id: "goal-with-evidence", title: "带验收标准的目标", outcome: "读不出来要报错", why: "用户得看到失败",
      business_logic: "一行坏整个读取失败", definition_state: "accepted", decomposition_state: "closed_leaf",
      acceptance_criteria: [{ criterion_id: "criterion-evidence", statement: "证据可读", decision_method: "inspection", pass_condition: "读得出来" }],
    }, { actor_id: "user-1", idempotency_key: "create-evidence-goal" });
    criterionColumn.store.db.prepare("UPDATE acceptance_criteria SET required_evidence_json = ? WHERE criterion_id = ?")
      .run('{"unreadable":', "criterion-evidence");
    locatedAt(captured(() => criterionColumn.goals.query.snapshot(BOARD)), criterionColumn.store, "acceptance_criteria", "required_evidence_json", "criterion_id = ?", "criterion-evidence");
    locatedAt(captured(() => criterionColumn.goals.query.listGoals(BOARD)), criterionColumn.store, "acceptance_criteria", "required_evidence_json", "criterion_id = ?", "criterion-evidence");
  } finally { criterionColumn.close(); }
});

test("RAC-1263: a readable method pack is kept and an unreadable one stops the snapshot", () => {
  const data = fixture();
  try {
    const at = "2026-09-03T00:00:00.000Z";
    data.store.db.prepare(`INSERT INTO planning_method_packs (
      project_id, method_id, version, enabled, pack_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(BOARD, "pack-one", 1, 1, '{"method_id":"pack-one","version":1,"enabled":true}', at, at);
    const readable = data.goals.query.snapshot(BOARD);
    assert.equal(readable.planning_method_packs.length, 1);
    assert.equal(readable.planning_method_packs[0]?.method_id, "pack-one");
    data.store.db.prepare("UPDATE planning_method_packs SET pack_json = ? WHERE project_id = ?").run('{"unreadable":', BOARD);
    locatedAt(captured(() => data.goals.query.snapshot(BOARD)), data.store, "planning_method_packs", "pack_json", "method_id = ?", "pack-one");
  } finally { data.close(); }
});

test("RAC-1265: unreadable guidance source refs stop the snapshot and the guidance read", () => {
  const data = fixture();
  try {
    data.app.goals.commands.addProjectGuidance({
      kind: "constraint", content: "用户数据只保存在本机。", source_refs: ["project://requirements"],
      reason: "长期数据边界", confirmation_summary: "用户已确认此原文", user_confirmed: true,
      idempotency_key: "guidance-unreadable", project_id: BOARD, actor_id: "user-1",
    });
    data.store.db.prepare("UPDATE project_guidance_entries SET source_refs_json = ? WHERE project_id = ?")
      .run('{"unreadable":', BOARD);
    locatedAt(captured(() => data.goals.query.snapshot(BOARD)), data.store, "project_guidance_entries", "source_refs_json", "project_id = ?", BOARD);
    locatedAt(captured(() => data.goals.query.readProjectGuidance(BOARD)), data.store, "project_guidance_entries", "source_refs_json", "project_id = ?", BOARD);
  } finally { data.close(); }
});

test("RAC-1268: readable rows read the same values again, and null columns read as null", () => {
  const data = fixture();
  try {
    data.goals.commands.createGoal(BOARD, {
      goal_id: "goal-null-columns", title: "空列照旧读到 null", outcome: "读得出来", why: "对照",
      business_logic: "不把 null 当损坏", definition_state: "accepted", decomposition_state: "closed_leaf",
      acceptance_criteria: [{ criterion_id: "criterion-null-target", statement: "目标为空", decision_method: "inspection", pass_condition: "读到 null" }],
    }, { actor_id: "user-1", idempotency_key: "create-null-goal" });
    const before = data.goals.query.snapshot(BOARD);
    assert.equal(before.goals.length, 1);
    assert.equal(before.goals[0]?.decomposition_review, null);
    assert.equal(before.goals[0]?.acceptance_criteria[0]?.target, null);
    assert.deepEqual(data.goals.query.snapshot(BOARD), before, "同样的数据再读一次值不变");

    data.app.governance.records.insertGoalTreeProposal({
      proposal_id: "proposal-null-narrative", project_id: BOARD, root_goal_id: "goal-null-columns",
      submitted_by: "user-1", submitted_session_id: null, state: "pending", version: 1,
      supersedes_proposal_id: null, base_event_cursor: data.store.eventCursor(BOARD),
      summary: "空叙述提案", narrative: null, created_at: "2026-09-04T00:00:00.000Z", updated_at: "2026-09-04T00:00:00.000Z",
    });
    const proposal = data.app.governance.query.getGoalTreeProposal(BOARD, "proposal-null-narrative");
    assert.equal(proposal?.narrative, null);

    const at = "2026-09-04T00:00:00.000Z", id = "decision-readable";
    const original = { decision_id: id, project_id: BOARD, goal_id: "goal-null-columns", actor_id: "user-1", actor_kind: "user", authority_source: "web",
      conversation_ref: "conversation://thread/message", message_ref: "message-1", request_id: null, selected_option_id: null, conclusion: "用户确认",
      accepts_requirements: 1, scope_json: '{"requirement_ids":["r-1"],"event_ids":[],"concern_ids":[],"action":null}', change_json: null, recorded_at: at };
    data.store.db.prepare(`INSERT INTO project_review_decisions(decision_id, project_id, record_json, recorded_at) VALUES (?, ?, ?, ?)`)
      .run(id, BOARD, JSON.stringify({ kind: "history", subject: "event", decision_id: id, project_id: BOARD, recorded_at: at,
        owner: { kind: "plugin", plugin_id: GOALS_PLUGIN_ID, publisher_signature: goalsManifest.publisher.signature }, original }), at);
    const decision = data.app.governance.eventDecisions.read(BOARD, "decision-readable");
    assert.deepEqual(decision?.scope, { requirement_ids: ["r-1"], event_ids: [], concern_ids: [], action: null });
    assert.equal(decision?.authorized_change, null);
    assert.equal(decision?.request_id, null);

    assert.deepEqual(data.goals.query.snapshot(BOARD), before, "对照数据加完，快照仍与损坏前一致");
  } finally { data.close(); }
});

test("RAC-1269: the unreadable-record error never repeats the stored text", () => {
  const data = fixture();
  try {
    const marker = "RAC-1269-goals-module-marker";
    const goalId = createGoal(data.app);
    fixtureProjectRule(data.store, BOARD, "user-1", true, "Require approval");
    data.store.db.prepare("UPDATE project_approval_rules SET scope_json = ? WHERE project_id = ? AND state = 'active'")
      .run(JSON.stringify({ kind: marker }), BOARD);
    const error = captured(() => data.goals.query.resolvePolicy(BOARD, goalId), "actions.execution_failed");
    assert.doesNotMatch(error.message, new RegExp(marker));
    // BGE-05：详情只有表、列和行号，不带业务键（项目、Goal、规则的 id）。
    for (const leaked of [marker, BOARD, goalId, "human_approval"]) assert.doesNotMatch(JSON.stringify(error.details ?? null), new RegExp(leaked));
  } finally { data.close(); }
});

const GOALS_SRC = join(import.meta.dirname, "..", "plugins", "native", "goals", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(join(dir, entry.name))
    : entry.name.endsWith(".ts") ? [join(dir, entry.name)] : []);
}

test("BGE-05: every stored-JSON read in Goals names a real table and column of the database it reads", () => {
  // Each read names its cell as literals (`storedJson(row, "<table>", "<column>", …)`); a name that is not in the schema would point
  // maintenance at nothing. A read that forgot `rowid AS stored_row` fails on its first read, so every Goals test reading that path catches it.
  const reads = sourceFiles(GOALS_SRC).flatMap(file => [...readFileSync(file, "utf8").matchAll(/storedJson(?:<[^(]*>)?\(row, "(\w+)", "(\w+)"/g)]
    .map(match => ({ file, table: match[1]!, column: match[2]! })));
  assert.ok(reads.length >= 39, `读到 ${reads.length} 处。项目审批规则的两条原路径已改为读取平台提供的规则。`);
  const project = new LocalProjectDatabase(":memory:");
  const home = new DatabaseSync(":memory:");
  try {
    home.exec(GOALS_HOME_DATABASE.schema);
    const columns = (db: DatabaseSync | SqliteDatabase, table: string) =>
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(row => row.name);
    for (const read of reads) {
      const db = read.table.startsWith("personal_") ? home : project.db;
      assert.ok(columns(db, read.table).includes(read.column), `${read.file} 读的 ${read.table}.${read.column} 不在库结构里`);
    }
  } finally { project.close(); home.close(); }
});
