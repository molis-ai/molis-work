import type { GoalsQueryApi } from "./contract/goals.js";
import type { GovernanceQueryApi } from "./contract/governance-collaboration.js";
import type { BoardSnapshot } from "./goal-entry-contract.js";
export interface MolisWorkSnapshotPorts {
 goals: GoalsQueryApi;
 governance: GovernanceQueryApi;
}
/** One read model from the owning Module queries, preserving their history and ordering. */
export function readMolisWorkSnapshot(ports: MolisWorkSnapshotPorts, projectId: string): BoardSnapshot {
    const goals = ports.goals.snapshot(projectId);
    const governance = ports.governance.snapshot(projectId);
    return {
      board: goals.board,
      cursor: goals.observed_event_cursor,
      goals: goals.goals,
      relations: goals.relations,
      goal_tree_proposals: governance.goal_tree_proposals,
      planning_method_packs: goals.planning_method_packs,
      project_guidance: goals.project_guidance,
    };

}
