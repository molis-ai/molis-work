import { syncSection, syncSectionsDeclaration, syncSectionsTracking } from "@molis-ai/molis-work-plugin-sdk";
import type { SyncSectionsDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { goalReplicationDefinition } from "./module/replication.js";
import { governanceReplicationDefinition } from "./governance/replication.js";
import { validateGoalSections } from "./sync-validation.js";
export const goalSections: SyncSectionsDefinition = {kind:"project_goals",business:[syncSection(goalReplicationDefinition()),syncSection(governanceReplicationDefinition())],platform:["relation-edges"],journal:true,journalIgnoredTypes:["board.created"],validate:validateGoalSections};
export const goalSectionsDeclaration = syncSectionsDeclaration(goalSections);
export const goalSectionsTracking = syncSectionsTracking(goalSectionsDeclaration).map(table => table.table === 'boards' ? {...table, existsAny:['goals'].map(table=>({table,match:[{column:'project_id',rowColumn:'project_id'}]}))} : table);
/**
 * Where a person's approved Goals decision leaves its result (44B): the platform reads and digests these rows itself. A Goal decision's
 * result is its applied-decision row; a tree proposal's is the effects of its items.
 */
export const goalApprovalOutcomes = [
  { subject_kind: "goal", section: "goals", table: "goal_event_applied_decisions", decision_column: "governance_decision_id", subject_column: "goal_id",
    subjects: { section: "goals", table: "goals", column: "goal_id" } },
  { subject_kind: "goal-tree-proposal", section: "governance", table: "goal_tree_item_effects", decision_column: "approval_id", subject_column: "proposal_id",
    subjects: { section: "governance", table: "goal_tree_proposals", column: "proposal_id" } },
] as const;
