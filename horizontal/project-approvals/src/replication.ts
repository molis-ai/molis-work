import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectReplicaRow } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { canonicalJsonText, createSyncConflictState, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { createSqliteReplica, namespacedReplicaDatabase, type ReplicaDatabase } from "@molis-ai/molis-work-storage";
import { PROJECT_APPROVALS_JOURNAL } from "./schema.js";
import { assertFrozenProjectReview, assertProjectReviewCoverage } from "./coverage.js";
import { isApprovalRuleScope } from "./rules.js";

type ApprovalRow = ProjectReplicaRow & { project_id: string };
const decisionColumns = ["decision_id", "project_id", "request_id", "request_key", "record_json", "recorded_at"] as const;
const ruleColumns = ["id", "project_id", "scope_json", "rule_order", "requires_person", "revision", "state", "created_by", "created_at",
  "reason", "changed_by", "changed_at", "change_reason"] as const;
const invalid = () => new ActionError("actions.input_invalid", "项目审批的同步内容与原项目或决定不符");
const collision = () => new ActionError("actions.conflict", "同一审批决定或规则版本有不同内容，原件已保留");
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0;
const idText = (value: unknown): value is string => typeof value === "string" && value.length <= 240 && value.trim().length > 0;
const fields = (value: Record<string, unknown>, columns: readonly string[]) =>
  Object.keys(value).length === columns.length && columns.every(column => Object.hasOwn(value, column));
const canonical = (value: unknown) => canonicalJsonText(value, "null");

function decisionOwner(owner: unknown, projectId: string, publisherSignature: string) {
  if (!isRecord(owner) || owner.kind !== "trusted-decision" || owner.scope !== "project" || owner.project_id !== projectId) throw invalid();
  if (fields(owner, ["kind", "project_id", "scope", "plugin_id", "install_id", "installation_generation"])
    && idText(owner.plugin_id) && idText(owner.install_id) && idText(owner.installation_generation)) {
    return { kind: "trusted-decision" as const, scope: "project" as const, project_id: projectId,
      plugin_id: owner.plugin_id, install_id: owner.install_id, installation_generation: owner.installation_generation };
  }
  if (fields(owner, ["kind", "project_id", "scope", "provider_id"]) && idText(owner.provider_id)
    && publisherSignature === `system:${owner.provider_id}`) {
    return { kind: "trusted-decision" as const, scope: "project" as const, project_id: projectId, provider_id: owner.provider_id };
  }
  throw invalid();
}

function parsedJson(value: unknown): Record<string, unknown> {
  try { if (typeof value === "string") { const row: unknown = JSON.parse(value); if (isRecord(row)) return row; } }
  catch { throw invalid(); }
  throw invalid();
}

function validateDecision(row: ApprovalRow) {
  const value = parsedJson(row.record_json);
  if (!text(row.decision_id) || !text(row.recorded_at) || value.decision_id !== row.decision_id
    || value.outcome_digest !== undefined && (typeof value.outcome_digest !== "string" || !/^sha256:[a-f0-9]{64}$/u.test(value.outcome_digest))) throw invalid();
  if (value.kind === "history") {
    const original = value.original;
    if (row.request_id !== null || row.request_key !== null || value.project_id !== row.project_id || value.recorded_at !== row.recorded_at
      || !isRecord(value.owner) || value.owner.kind !== "plugin" || !text(value.owner.plugin_id) || !text(value.owner.publisher_signature)
      || (value.subject !== "event" && value.subject !== "proposal-item") || !isRecord(original)
      || original.project_id !== row.project_id || original.decision_id !== row.decision_id
      || !text(original.actor_id) || !text(original.conversation_ref) || !text(original.message_ref)
      || !Object.values(original).every(item => item === null || typeof item === "string" || typeof item === "number")) throw invalid();
    return;
  }
  const ref = value.reference, source = value.source;
  if (!text(row.request_id) || !text(row.request_key) || value.request_key !== row.request_key || value.decided_at !== row.recorded_at
    || !text(value.decision) || (value.note !== null && typeof value.note !== "string")
    || typeof value.choice_fingerprint !== "string" || !/^[a-f0-9]{64}$/u.test(value.choice_fingerprint)
    || !isRecord(ref) || ref.id !== row.request_id || !idText(ref.version) || !isRecord(source) || source.kind !== "person"
    || !text(value.actor_id) || source.actor_id !== value.actor_id || !isRecord(source.entry)
    || (source.entry.source !== "management" && source.entry.source !== "web")
    || !text(source.entry.conversation_ref) || !text(source.entry.message_ref) || !text(value.publisher_signature)) throw invalid();
  const owner = decisionOwner(ref.owner, row.project_id, value.publisher_signature);
  const coverage = assertProjectReviewCoverage(value.review, owner);
  assertFrozenProjectReview(value.presentation, coverage, value.decision, value.actor_id);
}

function validateRule(row: ApprovalRow) {
  if (!text(row.id) || !Number.isSafeInteger(row.revision) || Number(row.revision) < 1
    || !Number.isSafeInteger(row.rule_order) || Number(row.rule_order) < 1
    || ![null, 0, 1].includes(row.requires_person as number | null) || !["active", "replaced", "withdrawn"].includes(String(row.state))
    || !text(row.created_by) || !text(row.created_at) || typeof row.reason !== "string") throw invalid();
  const changed = [row.changed_by, row.changed_at, row.change_reason];
  if (!changed.every(item => item === null) && !changed.every(text)) throw invalid();
  if (!isApprovalRuleScope(parsedJson(row.scope_json))) throw invalid();
}

function approvedRows(input: unknown, projectId: string, columns: readonly string[], validate: (row: ApprovalRow) => void): ApprovalRow[] {
  if (!Array.isArray(input)) throw invalid();
  return input.map((value: unknown) => {
    if (!isRecord(value) || !fields(value, columns) || value.project_id !== projectId
      || !Object.values(value).every(cell => cell === null || typeof cell === "string" || typeof cell === "number" && Number.isFinite(cell))) throw invalid();
    const row = value as ApprovalRow;
    validate(row);
    return row;
  });
}

/** Reads one project and merges its approved records without replacing local history or accepting a mutable identity. */
export function projectApprovalReplica(db: ReplicaDatabase, projectId: string, spaceId: string, authorize: () => void) {
  const key = JSON.stringify([projectId, PROJECT_APPROVALS_JOURNAL, projectId]);
  const scoped = (input: string) => { authorize(); if (input !== key) throw invalid(); };
  const read = () => ({
    space_id: spaceId, project_id: projectId,
    decisions: db.prepare("SELECT * FROM project_review_decisions WHERE project_id=? ORDER BY decision_id").all(projectId),
    rules: db.prepare("SELECT * FROM project_approval_rules WHERE project_id=? ORDER BY rule_order,id").all(projectId),
  });
  function mergeDecisions(rows: readonly ApprovalRow[]) {
    const read = db.prepare("SELECT * FROM project_review_decisions WHERE decision_id=?");
    const insert = db.prepare(`INSERT INTO project_review_decisions (${decisionColumns.join(",")}) VALUES (?,?,?,?,?,?)`);
    for (const row of rows) {
      const existing = read.get(row.decision_id!);
      if (!existing) insert.run(...decisionColumns.map(column => row[column]!));
      else if (canonical(existing) !== canonical(row)) throw collision();
    }
  }
  function mergeRules(rows: readonly ApprovalRow[]) {
    const read = db.prepare("SELECT * FROM project_approval_rules WHERE id=?");
    const insert = db.prepare(`INSERT INTO project_approval_rules (${ruleColumns.join(",")}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const update = db.prepare(`UPDATE project_approval_rules SET revision=?,state=?,changed_by=?,changed_at=?,change_reason=?
      WHERE project_id=? AND id=?`);
    const immutable = [...ruleColumns.slice(0, 5), ...ruleColumns.slice(7, 10)];
    for (const row of rows) {
      const existing = read.get(row.id!);
      if (!existing) { insert.run(...ruleColumns.map(column => row[column]!)); continue; }
      if (immutable.some(column => row[column] !== existing[column])) throw collision();
      if (row.revision === existing.revision && canonical(existing) !== canonical(row)) throw collision();
      if (Number(row.revision) > Number(existing.revision)) {
        if (existing.state !== "active" || row.state === "active") throw collision();
        update.run(row.revision!, row.state!, row.changed_by!, row.changed_at!, row.change_reason!, projectId, row.id!);
      }
    }
  }
  return createSqliteReplica(namespacedReplicaDatabase(db, PROJECT_APPROVALS_JOURNAL), {
    authorize, authorizeKey: scoped, conflictState: createSyncConflictState, belongsToProject: (candidate, id) => candidate === key && id === projectId,
    read(candidate) {
      scoped(candidate);
      const facts = read();
      return facts.decisions.length || facts.rules.length ? facts : null;
    },
    apply(candidate, input) {
      scoped(candidate);
      if (!isRecord(input) || !fields(input, ["space_id", "project_id", "decisions", "rules"])
        || input.space_id !== spaceId || input.project_id !== projectId) throw invalid();
      const decisions = approvedRows(input.decisions, projectId, decisionColumns, validateDecision);
      const rules = approvedRows(input.rules, projectId, ruleColumns, validateRule);
      if (new Set(decisions.map(row => row.decision_id)).size !== decisions.length
        || new Set(rules.map(row => row.id)).size !== rules.length) throw invalid();
      mergeDecisions(decisions);
      mergeRules(rules);
      authorize();
    },
  });
}
