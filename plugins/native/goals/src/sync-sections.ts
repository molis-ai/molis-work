import { syncSection, syncSectionsDeclaration, syncSectionsTracking } from "@molis-ai/molis-work-plugin-sdk";
import type { SyncSectionsDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { goalReplicationDefinition } from "./module/replication.js";
import { governanceReplicationDefinition } from "./governance/replication.js";
import { validateGoalSections } from "./sync-validation.js";
export const goalSections: SyncSectionsDefinition = {kind:"project_goals",business:[syncSection(goalReplicationDefinition()),syncSection(governanceReplicationDefinition())],platform:["goal-context"],journal:true,journalIgnoredTypes:["board.created"],validate:validateGoalSections};
export const goalSectionsDeclaration = syncSectionsDeclaration(goalSections);
export const goalSectionsTracking = syncSectionsTracking(goalSectionsDeclaration).map(table => table.table === 'boards' ? {...table, existsAny:['goals','project_guidance_entries'].map(table=>({table,match:[{column:'project_id',rowColumn:'project_id'}]}))} : table);
