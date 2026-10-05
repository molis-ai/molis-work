import type { GoalsQueryApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { GovernanceQueryApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { BoardSnapshot } from "./goal-entry-contract.js";
export interface MolisWorkSnapshotPorts {
 goals: GoalsQueryApi;
 governance: GovernanceQueryApi;
}
/** One read model from the owning Module queries, preserving their history and ordering. */
export function readMolisWorkSnapshot(ports: MolisWorkSnapshotPorts, boardId: string): BoardSnapshot {
    const goals = ports.goals.snapshot(boardId);
    const governance = ports.governance.snapshot(boardId);
    return {
      board: goals.board,
      cursor: goals.observed_event_cursor,
      goals: goals.goals,
      relations: goals.relations,
      risks: goals.risks,
      goal_risks: goals.goal_risks,
      goal_contract_revisions: ports.goals.listContractRevisions(boardId),
      lifecycle_events: ports.goals.listLifecycleEvents(boardId),
      goal_tree_proposals: governance.goal_tree_proposals,
      planning_method_packs: goals.planning_method_packs,
      project_guidance: goals.project_guidance,
    };

}
