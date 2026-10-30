import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";

interface Transaction {
  readonly owner: PluginDatabase;
  readonly check: () => void;
  readonly committed: Array<() => void>;
}
const active = new WeakMap<PluginDatabaseTransaction, Transaction>();

/** Only the database owner opens this binding, for the lifetime of its synchronous write body. */
export function bindPluginTransaction(handle: PluginDatabaseTransaction, owner: PluginDatabase, check: () => void) {
  const transaction: Transaction = { owner, check, committed: [] };
  active.set(handle, transaction);
  return {
    close() { active.delete(handle); },
    committed() { for (const effect of transaction.committed) effect(); },
    /** Where the after-commit effects stand; `rewind` drops those a rolled-back savepoint registered. */
    mark: () => transaction.committed.length,
    rewind(mark: number) { transaction.committed.length = mark; },
  };
}

/** Platform services join the exact live transaction, without handing out its connection. */
export function joinPluginTransaction<T>(owner: PluginDatabase, handle: PluginDatabaseTransaction,
  write: (afterCommit: (effect: () => void) => void, check: () => void) => T): T {
  const transaction = active.get(handle);
  const check = () => {
    if (!transaction || transaction.owner !== owner || active.get(handle) !== transaction) {
      throw new ActionError("actions.forbidden", "需要此插件当前项目库中仍在执行的事务");
    }
    transaction.check();
  };
  check();
  const result = write(effect => { check(); transaction!.committed.push(effect); }, check);
  requireSynchronous(result, "调度写入必须在当前事务内同步完成");
  check();
  return result;
}
