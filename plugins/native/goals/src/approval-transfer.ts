import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ApprovalRuleOwner, ProjectApprovalRuleScope } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { syncSectionsTracking } from "@molis-ai/molis-work-plugin-sdk";
import { GOALS_PROJECT_DATABASE_AFTER_APPROVAL_TRANSFER } from "./project-database.js";

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

const errors = defineErrorCodes("goals", { approval_transfer_invalid: "invalid" });
const invalid = () => errors.approval_transfer_invalid("旧 Goals 的审批出处、对象关联或规则不符，项目库已保留");

/** Change only this owner's project collection, after the old definition has been verified. */
export function goalsManifestAfterApprovalTransfer(manifest: PluginManifest): PluginManifest {
  const collection = manifest.sync?.collections.find(row => row.id === "project_goals");
  if (!collection?.sections || collection.schema_version !== 1) throw invalid();
  const sections = {
    ...collection.sections,
    business: collection.sections.business.map(section => ({
      ...section, tables: section.tables.filter(table => !GOALS_APPROVAL_TRANSFER_TABLES.some(old => old === table.name)),
    })),
  };
  const tracking = syncSectionsTracking(sections).map(table =>
    collection.tracking?.find(previous => previous.table === table.table) ?? table);
  return {
    ...manifest, databases: { ...manifest.databases, project: GOALS_PROJECT_DATABASE_AFTER_APPROVAL_TRANSFER },
    sync: { ...manifest.sync!, collections: manifest.sync!.collections.map(row =>
      row === collection ? { ...row, schema_version: 2, sections, tracking } : row) },
  };
}

/** Explicit v2 maintenance only. The Host verifies the original schema, publisher and project before reading. */
export function readGoalsApprovalTransfer(db: TransferConnection, projectId: string, owner: Owner) {
  const decisions = readDecisions(db, projectId);
  const rules = (db.prepare("SELECT * FROM policy_bindings ORDER BY created_at, rowid").all() as OriginalRule[]).map(row => {
    if (row.project_id !== projectId || !row.policy_binding_id || (row.scope === "project_default") !== (row.goal_id === null)) throw invalid();
    const policy: unknown = JSON.parse(row.policy_json);
    if (!policy || typeof policy !== "object" || Array.isArray(policy) || Object.keys(policy).some(key => key !== "human_approval")) throw invalid();
    const human = "human_approval" in policy ? policy.human_approval : null;
    if (human !== null && typeof human !== "boolean") throw invalid();
    const scope: ProjectApprovalRuleScope = row.scope === "project_default" ? { kind: "project_default" }
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
    SELECT goal_id, actor_id, authority_source, conclusion, accepts_requirements, scope_json, governance_decision_id
      FROM goal_event_applied_decisions WHERE project_id = ?
  `).all(projectId) as Array<Record<string, string | number | null> & { governance_decision_id: string }>;
  const originals = new Map(events.map(row => [row.decision_id, row]));
  for (const row of applied) {
    const original = originals.get(row.governance_decision_id);
    if (!original || ["goal_id", "actor_id", "authority_source", "conclusion", "accepts_requirements", "scope_json"].some(key => row[key] !== original[key])) throw invalid();
  }
  if (db.prepare(`
    SELECT 1 FROM goal_tree_proposal_decisions d
      LEFT JOIN goal_tree_proposal_items i ON i.item_id = d.item_id
      LEFT JOIN goal_tree_proposals p ON p.proposal_id = d.proposal_id
     WHERE i.item_id IS NULL OR p.proposal_id IS NULL OR i.proposal_id <> d.proposal_id OR p.project_id <> d.project_id OR i.project_id <> d.project_id
     LIMIT 1
  `).get()) throw invalid();
  return [
    ...events.map(row => exportedDecision(projectId, row, "event", row.recorded_at)),
    ...items.map(row => exportedDecision(projectId, row, "proposal-item", row.created_at)),
  ];
}

function exportedDecision(projectId: string, row: OriginalDecision, subject: "event" | "proposal-item", recorded_at: unknown) {
  if (row.project_id !== projectId || !row.actor_id || !row.conversation_ref || !row.message_ref || typeof recorded_at !== "string" || !recorded_at) throw invalid();
  return { subject, recorded_at, row };
}
