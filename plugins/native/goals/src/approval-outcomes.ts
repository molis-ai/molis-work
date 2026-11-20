import { createHash } from "node:crypto";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginApprovalOutcome, PluginApprovalOutcomesBinding } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
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

/** A decision outcome's digest from its immutable owner facts. */
export function goalDecisionOutcomeDigest(kind: Outcome["kind"], facts: unknown): string {
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

/**
 * A Goal decision's outcome: the applied decision and its event. Requirement conclusions belong to the platform's
 * acceptance store, so the third tuple element stays empty.
 */
function eventOutcome(applied: ProjectReplicaRow, event: ProjectReplicaRow | undefined): Outcome {
  if (!event || event.event_id !== applied.event_id || event.kind !== "system" || event.project_id !== applied.project_id
    || event.goal_id !== applied.goal_id || event.actor_id !== applied.actor_id || event.actor_kind !== "user") throw invalid();
  const receipt: unknown = JSON.parse(String(event.payload_json));
  const expected = appliedEventFields(applied);
  if (!isRecord(receipt) || Object.entries(expected).some(([key, value]) => !Object.hasOwn(receipt, key)
    || canonicalJsonText(receipt[key]) !== canonicalJsonText(value))) throw invalid();
  const { journal_seq: _sequence, ...stableEvent } = event;
  return { kind: "goal", id: String(applied.goal_id), digest: goalDecisionOutcomeDigest("goal", [applied, stableEvent, []]) };
}

function treeOutcome(effects: Rows): Outcome {
  const proposalId = effects[0]!.proposal_id;
  if (effects.some(row => row.proposal_id !== proposalId) || new Set(effects.map(row => row.item_id)).size !== effects.length) throw invalid();
  const stable = [...effects].sort((a, b) => compare(a.effect_id, b.effect_id));
  return { kind: "goal-tree-proposal", id: String(proposalId), digest: goalDecisionOutcomeDigest("goal-tree-proposal", stable) };
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
  const event = db.prepare("SELECT * FROM goal_work_events WHERE project_id = ? AND event_id = ?").all(project, String(row.event_id))[0] as ProjectReplicaRow | undefined;
  return eventOutcome(row, event);
}

/** The same outcome from the wire after the owning replica has resolved stable journal anchors. */
export function goalApprovalOutcomes(facts: Readonly<Record<string, ProjectReplicaRows>>): Map<string, Outcome> {
  const goals = facts.goals!, governance = facts.governance!;
  const events = new Map(goals.goal_work_events!.map(row => [row.event_id, row]));
  const outcomes = new Map<string, Outcome>();
  const put = (id: ProjectReplicaRow[string], outcome: Outcome) => {
    if (typeof id !== "string" || !id || outcomes.has(id)) throw invalid();
    outcomes.set(id, outcome);
  };
  for (const row of goals.goal_event_applied_decisions!) {
    const id = row.governance_decision_id;
    if (typeof id !== "string" || !id) throw invalid();
    put(id, eventOutcome(row, events.get(row.event_id)));
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

/** Trusted owner binding declared in Goals' registration so platform sync never imports the Goals package directly (PEQ-03). */
export const goalsApprovalOutcomesBinding: PluginApprovalOutcomesBinding = {
  collection_id: "project_goals",
  subject_kinds: ["goal", "goal-tree-proposal"],
  readOutcome(db, project, decision, subjectKind) {
    if (subjectKind !== "goal" && subjectKind !== "goal-tree-proposal") return null;
    return readGoalApprovalOutcome(db, project, decision, subjectKind);
  },
  outcomesFromFacts: goalApprovalOutcomes,
  assertHistory(previous, incoming, facts) {
    const narrow = (source: ReadonlyMap<string, PluginApprovalOutcome>): Map<string, Outcome> => {
      const result = new Map<string, Outcome>();
      for (const [id, item] of source) {
        if (item.kind !== "goal" && item.kind !== "goal-tree-proposal") throw invalid();
        result.set(id, { kind: item.kind, id: item.id, digest: item.digest });
      }
      return result;
    };
    assertGoalApprovalHistory(narrow(previous), narrow(incoming), facts);
  },
};
