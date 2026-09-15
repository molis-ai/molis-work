import type { GovernanceDecisionApi } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";
import { GovernanceRepository, type GovernanceSqliteDatabase } from "./repository.js";

/** The existing decision and nested preview savepoints, not a separate transaction system. */
export class GovernanceDecisionTransactions implements GovernanceDecisionApi {
  private readonly repository: GovernanceRepository;
  constructor(private readonly db: GovernanceSqliteDatabase) {
    this.repository = new GovernanceRepository(db);
  }

  materializeAtomically<T>(operation: () => T): T {
    return this.repository.immediate(operation);
  }

  previewMaterialization<T>(operation: () => T): T {
    this.db.exec("SAVEPOINT goal_tree_materialization_preflight");
    try {
      return operation();
    } finally {
      this.db.exec("ROLLBACK TO goal_tree_materialization_preflight");
      this.db.exec("RELEASE goal_tree_materialization_preflight");
    }
  }

  previewMaterializationItem<T>(operation: () => { keep: boolean; value: T }): T {
    this.db.exec("SAVEPOINT goal_tree_item_preflight");
    try {
      const result = operation();
      if (!result.keep) this.db.exec("ROLLBACK TO goal_tree_item_preflight");
      this.db.exec("RELEASE goal_tree_item_preflight");
      return result.value;
    } catch (error) {
      this.db.exec("ROLLBACK TO goal_tree_item_preflight");
      this.db.exec("RELEASE goal_tree_item_preflight");
      throw error;
    }
  }
}
