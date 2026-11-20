import { GOALS_PLUGIN_ID } from "./identity.js";
import type { ProjectReplicaRows } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { isGoalRef } from "./ledger-refs.js";
import { RELATION_EDGES_REPLICA_ID } from "@molis-ai/molis-work-contracts/modules/context-ledger";
const errors = defineErrorCodes("goals", { replica_links_invalid: "invalid" });
const replicaError = (code: string) => errors.replica_links_invalid(code);
export function validateGoalSections(facts: Readonly<Record<string, ProjectReplicaRows>>): void {
  const goals = facts.goals!, governance = facts.governance!, context = facts[RELATION_EDGES_REPLICA_ID]!;
  const ids = new Set(goals.goals!.map(r => r.goal_id));
  for (const row of governance.goal_tree_proposals!) if (row.root_goal_id && !ids.has(row.root_goal_id)) throw replicaError('replica_references_invalid');
  for (const row of goals.goal_event_applied_decisions!) {
    if (!ids.has(row.goal_id) || typeof row.governance_decision_id !== "string" || !row.governance_decision_id) throw replicaError('replica_decision_invalid');
  }
  const edges = new Map(context.context_edges!.map(r => [r.edge_key, r]));
  for (const row of goals.input_bindings!) if (row.source_edge_key) {
    const edge = edges.get(`${GOALS_PLUGIN_ID}:${row.source_edge_key}`);
    if (!edge || JSON.parse(String(edge.source_json)).id !== row.goal_id) throw replicaError('replica_input_invalid');
  }
  for (const row of context.context_edges!) for (const json of [row.source_json, row.target_json]) {
    const ref = JSON.parse(String(json));
    if (isGoalRef(ref) && !ids.has(ref.id)) throw replicaError('replica_context_invalid');
  }
}
