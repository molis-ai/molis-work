import { createHash } from "node:crypto";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectReplicaRow, ProjectReplicaRows } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";

const errors = defineErrorCodes("goals", { approval_outcome_invalid: "conflict" });
const invalid = () => errors.approval_outcome_invalid("目标结果与原决定的业务事实不符");
type Rows = ProjectReplicaRow[];
type Outcome = { readonly kind: "goal" | "goal-tree-proposal"; readonly id: string; readonly digest: string };
type Reader = { prepare(sql: string): { all(...params: string[]): unknown[] } };
type EventFields = Readonly<Record<string, unknown>>;

function by(rows: Rows, key: string): Map<ProjectReplicaRow[string], Rows> {
  const index = new Map<ProjectReplicaRow[string], Rows>();
  for (const row of rows) {
    const group = index.get(row[key]!);
    if (group) group.push(row); else index.set(row[key]!, [row]);
  }
  return index;
}

function compare(left: unknown, right: unknown): number {
  const a = String(left), b = String(right);
  return a < b ? -1 : Number(a > b);
}

function digest(kind: Outcome["kind"], facts: unknown): string {
  return "sha256:" + createHash("sha256").update(canonicalJsonText(["goals-decision-outcome", 1, kind, facts], "null")).digest("hex");
}

function appliedEventFields(applied: ProjectReplicaRow): EventFields {
  return {
    operation: "user_decision", decision_id: applied.decision_id, governance_decision_id: applied.governance_decision_id,
    request_id: applied.request_id, selected_option_id: applied.selected_option_id, conclusion: applied.conclusion,
    accepts_requirements: applied.accepts_requirements === 1, effects: JSON.parse(String(applied.effects_json ?? "[]")),
    scope: JSON.parse(String(applied.scope_json)), authorized_change: JSON.parse(String(applied.authorized_change_json ?? "null")),
    config_version: applied.config_version, agreement_version: applied.agreement_version,
  };
}

function eventOutcome(applied: ProjectReplicaRow, event: ProjectReplicaRow | undefined, conclusions: Rows): Outcome {
  if (!event || event.event_id !== applied.event_id || event.kind !== "system" || event.project_id !== applied.project_id
    || event.goal_id !== applied.goal_id || event.actor_id !== applied.actor_id || event.actor_kind !== "user") throw invalid();
  const receipt: unknown = JSON.parse(String(event.payload_json));
  const expected = appliedEventFields(applied);
  if (!isRecord(receipt) || Object.entries(expected).some(([key, value]) => !Object.hasOwn(receipt, key)
    || canonicalJsonText(receipt[key]) !== canonicalJsonText(value))) throw invalid();
  const { journal_seq, ...stableEvent } = event;
  const rows = conclusions.map(({ journal_seq: sequence, ...row }) => {
    if (sequence !== journal_seq || row.actor_id !== applied.actor_id || row.project_id !== applied.project_id || row.goal_id !== applied.goal_id) throw invalid();
    return row;
  }).sort((a, b) => compare(a.requirement_id, b.requirement_id));
  return { kind: "goal", id: String(applied.goal_id), digest: digest("goal", [applied, stableEvent, rows]) };
}

function treeOutcome(effects: Rows): Outcome {
  const proposalId = effects[0]!.proposal_id;
  if (effects.some(row => row.proposal_id !== proposalId) || new Set(effects.map(row => row.item_id)).size !== effects.length) throw invalid();
  const stable = [...effects].sort((a, b) => compare(a.effect_id, b.effect_id));
  return { kind: "goal-tree-proposal", id: String(proposalId), digest: digest("goal-tree-proposal", stable) };
}

/** Read only this decision's immutable owner rows, in the transaction that applied them or transferred validated history. */
export function readGoalApprovalOutcome(db: Reader, project: string, decision: string, subject: Outcome["kind"]): Outcome | null {
  if (subject === "goal-tree-proposal") {
    const effects = db.prepare("SELECT * FROM goal_tree_item_effects WHERE project_id = ? AND approval_id = ?").all(project, decision) as Rows;
    return effects.length ? treeOutcome(effects) : null;
  }
  const applied = db.prepare("SELECT * FROM goal_event_applied_decisions WHERE project_id = ? AND governance_decision_id = ?").all(project, decision) as Rows;
  if (!applied.length) return null;
  if (applied.length !== 1) throw invalid();
  const [row] = applied as [ProjectReplicaRow];
  const key = String(row.decision_id);
  const event = db.prepare("SELECT * FROM goal_work_events WHERE project_id = ? AND event_id = ?").all(project, String(row.event_id))[0] as ProjectReplicaRow | undefined;
  const conclusions = db.prepare("SELECT * FROM goal_event_requirement_conclusions WHERE project_id = ? AND decision_id = ?").all(project, key) as Rows;
  return eventOutcome(row, event, conclusions);
}

/** The same outcome from the wire after the owning replica has resolved stable journal anchors. */
export function goalApprovalOutcomes(facts: Readonly<Record<string, ProjectReplicaRows>>): Map<string, Outcome> {
  const goals = facts.goals!, governance = facts.governance!;
  const events = new Map(goals.goal_work_events!.map(row => [row.event_id, row]));
  const conclusions = by(goals.goal_event_requirement_conclusions!, "decision_id");
  const outcomes = new Map<string, Outcome>();
  const put = (id: ProjectReplicaRow[string], outcome: Outcome) => {
    if (typeof id !== "string" || !id || outcomes.has(id)) throw invalid();
    outcomes.set(id, outcome);
  };
  for (const row of goals.goal_event_applied_decisions!) {
    const id = row.governance_decision_id;
    if (typeof id !== "string" || !id) throw invalid();
    put(id, eventOutcome(row, events.get(row.event_id), conclusions.get(row.decision_id!) ?? []));
  }
  for (const [id, effects] of by(governance.goal_tree_item_effects!, "approval_id")) put(id, treeOutcome(effects));
  return outcomes;
}

/** A full project snapshot may leave out pending decisions and legitimately removed subjects. */
export function assertGoalApprovalHistory(previous: ReadonlyMap<string, Outcome>, incoming: ReadonlyMap<string, Outcome>,
  facts: Readonly<Record<string, ProjectReplicaRows>>): void {
  const goals = new Set(facts.goals!.goals!.map(row => row.goal_id));
  const proposals = new Set(facts.governance!.goal_tree_proposals!.map(row => row.proposal_id));
  for (const [decision, result] of previous) {
    if ((result.kind === "goal" ? goals : proposals).has(result.id) && !incoming.has(decision)) throw invalid();
  }
}
