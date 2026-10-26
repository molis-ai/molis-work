import type { GovernanceDecisionApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import type { GovernanceSqliteDatabase } from "./repository.js";

/** The existing decision and nested preview savepoints, not a separate transaction system. */
export class GovernanceDecisionTransactions implements GovernanceDecisionApi {
  constructor(private readonly db: GovernanceSqliteDatabase) {}

  materializeAtomically<T>(operation: () => T): T {
    return this.db.transaction(operation).immediate();
  }

  /** Runs the whole materialization to see what it would do, then undoes all of it, whether it finished or threw. */
  previewMaterialization<T>(operation: () => T): T {
    return this.db.savepoint(() => ({ keep: false, value: operation() }));
  }

  /** One item's preview inside a preview: its writes stay only when the operation says `keep`; a throw undoes them. */
  previewMaterializationItem<T>(operation: () => { keep: boolean; value: T }): T {
    return this.db.savepoint(operation);
  }
}
