import type { GoalsQueryApi, GoalsImpactApi } from "@molis-ai/molis-work-contracts/modules/goals";
import type { ExecutionQueryApi } from "@molis-ai/molis-work-contracts/modules/execution";
import type { EvidenceQueryApi } from "@molis-ai/molis-work-contracts/modules/evidence-verification";
import type { GovernanceApplicationApi, GovernanceQueryApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { BoardSnapshot } from "./goal-entry-contract.js";
export interface MolisWorkSnapshotPorts {
 goals: GoalsQueryApi;
 impacts: Pick<GoalsImpactApi, "list">;
 execution: ExecutionQueryApi;
 evidence: EvidenceQueryApi;
 governance: GovernanceQueryApi;
 clarification: Pick<GovernanceApplicationApi["clarification"], "listSessions" | "listTurns">;
}
/** One read model from the owning Module queries, preserving their history and ordering. */
export function readMolisWorkSnapshot(ports: MolisWorkSnapshotPorts, boardId: string): BoardSnapshot {
    const goals = ports.goals.snapshot(boardId);
    const execution = ports.execution;
    const evidence = ports.evidence;
    const governance = ports.governance.snapshot(boardId);
    return {
      board: goals.board,
      cursor: goals.observed_event_cursor,
      goals: goals.goals,
      relations: goals.relations,
      impacts: ports.impacts.list(boardId),
      risks: goals.risks,
      goal_risks: goals.goal_risks,
      claims: execution.listClaims(boardId),
      runs: execution.listRuns(boardId),
      evidence: evidence.listEvidence(boardId),
      evidence_corrections: evidence.listCorrections(boardId),
      review_obligations: governance.review_obligations,
      reviews: governance.reviews,
      goal_contract_revisions: ports.goals.listContractRevisions(boardId),
      coverage_contract_revisions: ports.goals.listCoverageRevisions(boardId),
      lifecycle_events: [
        ...ports.goals.listLifecycleEvents(boardId), ...execution.listLifecycleEvents(boardId),
        ...evidence.listLifecycleEvents(boardId),
        ...ports.governance.listLifecycleEvents(boardId),
      ].sort((left, right) => left.seq - right.seq),
      candidates: governance.candidates,
      contract_proposals: governance.contract_proposals,
      rewires: governance.rewires,
      clarification_sessions: ports.clarification.listSessions(boardId),
      clarification_turns: ports.clarification.listTurns(boardId),
      goal_tree_proposals: governance.goal_tree_proposals,
      planning_method_packs: goals.planning_method_packs,
      project_guidance: goals.project_guidance,
    };

}
