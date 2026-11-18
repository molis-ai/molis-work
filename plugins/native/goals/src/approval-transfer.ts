import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectApprovalRuleScope } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { canonicalJsonText } from "@molis-ai/molis-work-plugin-sdk";
import { GOALS_APPROVAL_TRANSFER_BASELINES, GOALS_PROJECT_DATABASE, GOALS_PROJECT_DATABASE_V5, type GoalsApprovalSource } from "./project-database.js";
import { GOALS_TREE_EFFECTS_SQL } from "./project-database-governance.js";
import { goalsApprovalTransferSync, goalsV5Sync } from "./approval-transfer-sync.js";
import { readGoalApprovalOutcome } from "./approval-outcomes.js";

interface TransferConnection {
  exec(sql: string): unknown;
  prepare(sql: string): { get(...params: unknown[]): unknown; all(...params: unknown[]): unknown[] };
}

type OriginalDecision = Record<string, string | number | null> & { project_id: string; decision_id: string };
type OriginalRule = {
  policy_binding_id: string; project_id: string; goal_id: string | null;
  scope: "project_default" | "ancestor_minimum" | "goal"; policy_json: string;
  state: "active" | "replaced" | "withdrawn"; created_by: string; reason: string; created_at: string;
};
type Owner = Extract<ApprovalRuleOwner, { kind: "plugin" }>;

export const GOALS_APPROVAL_TRANSFER_TABLES = ["goal_event_trusted_decisions", "goal_tree_proposal_decisions", "policy_bindings"] as const;
export const GOALS_APPROVAL_OUTCOMES_SQL = GOALS_TREE_EFFECTS_SQL;

const errors = defineErrorCodes("goals", { approval_transfer_invalid: "invalid" });
const invalid = () => errors.approval_transfer_invalid("旧 Goals 的审批出处、对象关联或规则不符，项目库已保留");

export function isGoalsApprovalSource(version: number): version is GoalsApprovalSource {
  return Object.hasOwn(GOALS_APPROVAL_TRANSFER_BASELINES, version);
}

/** The original declaration is frozen for maintenance; it does not use the current collection's row projection. */
export function goalsApprovalTransferManifest(manifest: PluginManifest, version: number): PluginManifest {
  if (isGoalsApprovalSource(version)) return {
    ...manifest, databases: { ...manifest.databases, project: GOALS_APPROVAL_TRANSFER_BASELINES[version] },
    sync: goalsApprovalTransferSync(version),
  };
  if (version === GOALS_PROJECT_DATABASE_V5.version) return {
    ...manifest, databases: { ...manifest.databases, project: GOALS_PROJECT_DATABASE_V5 }, sync: goalsV5Sync(),
  };
  if (version !== GOALS_PROJECT_DATABASE.version || manifest.databases?.project?.version !== GOALS_PROJECT_DATABASE.version
    || !manifest.sync?.collections.find(row => row.id === "project_goals")?.sections) throw invalid();
  return manifest;
}

/** The Host verifies the original schema, publisher and project before maintenance reads these records. */
export function readGoalsApprovalTransfer(db: TransferConnection, projectId: string, owner: Owner) {
  const decisions = readDecisions(db, projectId);
  const rules = (db.prepare("SELECT * FROM policy_bindings ORDER BY created_at, rowid").all() as OriginalRule[]).map(row => {
    if (row.project_id !== projectId || !row.policy_binding_id || (row.scope === "project_default") !== (row.goal_id === null)) throw invalid();
    const policy: unknown = JSON.parse(row.policy_json);
    if (!policy || typeof policy !== "object" || Array.isArray(policy) || Object.keys(policy).some(key => key !== "human_approval")) throw invalid();
    const human = "human_approval" in policy ? policy.human_approval : null;
    if (human !== null && typeof human !== "boolean") throw invalid();
    const scope: ProjectApprovalRuleScope = row.scope === "project_default" ? { kind: "project_default", owner }
      : { kind: row.scope === "goal" ? "object" : "ancestor_minimum", owner, subject: { kind: "goal", id: row.goal_id! } };
    const { policy_binding_id, project_id, state, created_by, reason, created_at } = row;
    return { policy_binding_id, project_id, scope, requires_person: human, state, created_by, reason, created_at };
  });
  return { decisions, rules };
}

function readDecisions(db: TransferConnection, projectId: string) {
  const events = db.prepare("SELECT * FROM goal_event_trusted_decisions ORDER BY decision_id").all() as OriginalDecision[];
  const items = db.prepare("SELECT * FROM goal_tree_proposal_decisions ORDER BY decision_id").all() as OriginalDecision[];
  const applied = db.prepare(`
    SELECT a.*, e.event_id AS observed_event_id, e.project_id AS observed_project, e.goal_id AS observed_goal,
      e.kind AS observed_kind, e.actor_id AS observed_actor, e.payload_json AS observed_payload
      FROM goal_event_applied_decisions a LEFT JOIN goal_work_events e ON e.event_id=a.event_id
      WHERE a.project_id = ?
  `).all(projectId) as Array<Record<string, string | number | null> & { governance_decision_id: string }>;
  const originals = new Map(events.map(row => [row.decision_id, row]));
  for (const row of applied) {
    const original = originals.get(row.governance_decision_id);
    const same = ["goal_id", "actor_id", "authority_source", "conclusion", "accepts_requirements", "request_id", "selected_option_id"];
    if (!original || same.some(key => row[key] !== original[key]) || row.observed_event_id !== row.event_id
      || row.observed_project !== projectId || row.observed_goal !== row.goal_id || row.observed_kind !== "system" || row.observed_actor !== row.actor_id) throw invalid();
    const cell = (text: string | number | null | undefined) => canonicalJsonText(JSON.parse(String(text ?? "null")));
    if (cell(row.scope_json) !== cell(original.scope_json) || cell(row.authorized_change_json) !== cell(original.change_json)) throw invalid();
    const event = JSON.parse(String(row.observed_payload)) as { operation?: unknown; governance_decision_id?: unknown; decision_id?: unknown };
    if (event?.operation !== "user_decision" || event.governance_decision_id !== row.governance_decision_id || event.decision_id !== row.decision_id) throw invalid();
  }
  if (db.prepare(`
    SELECT 1 FROM goal_tree_proposal_decisions d
      LEFT JOIN goal_tree_proposal_items i ON i.item_id = d.item_id
      LEFT JOIN goal_tree_proposals p ON p.proposal_id = d.proposal_id
     WHERE i.item_id IS NULL OR p.proposal_id IS NULL OR i.proposal_id <> d.proposal_id OR p.project_id <> d.project_id OR i.project_id <> d.project_id
     LIMIT 1
  `).get()) throw invalid();
  return [
    ...events.map(row => {
      const original = exportedDecision(projectId, row, "event", row.recorded_at);
      const outcome = readGoalApprovalOutcome(db, projectId, row.decision_id, "goal");
      return { ...original, ...(outcome ? { outcome_digest: outcome.digest } : {}) };
    }),
    ...items.map(row => exportedDecision(projectId, row, "proposal-item", row.created_at)),
  ];
}

function exportedDecision(projectId: string, row: OriginalDecision, subject: "event" | "proposal-item", recorded_at: unknown) {
  if (row.project_id !== projectId || !row.actor_id || !row.conversation_ref || !row.message_ref || typeof recorded_at !== "string" || !recorded_at) throw invalid();
  const parts = subject === "event" ? [row.scope_json, row.change_json] : [row.materialized_objects_json];
  for (const value of parts) if (value !== null) {
    if (typeof value !== "string") throw invalid();
    try { JSON.parse(value); } catch { throw invalid(); }
  }
  return { subject, recorded_at, row };
}
