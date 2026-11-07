import {
  sqliteStoreLabel,
  sqliteVersionRefusal,
  storageErrors,
  upgradedShapeMatches,
  type SqliteBaseline,
  type SqliteBaselineDatabase,
  type SqliteUpgradeStep,
} from "./sqlite-baseline.js";

export interface SqliteUpgradeResult {
  readonly from: number;
  readonly to: number;
}

/** Fixed text only: a step's own error can quote the store's content, so it travels as `cause` and never reaches the message or details. */
const FAILURES = {
  invalid_step: "段的声明不对",
  missing_step: "缺少升级段",
  foreign_keys_state: "外键开关没有切到要的状态",
  begin_failed: "拿不到写事务",
  version_changed: "升级途中版本变了",
  step_failed: "升级段执行失败",
  transaction_ended: "升级段自己结束了事务",
  integrity: "完整性检查没有通过",
  foreign_keys: "外键检查没有通过",
  structure: "结构与当前基线不符",
  rows_reduced: "有表的行数变少了，而这一段没有声明",
  verify_failed: "主人的检查没有通过",
  run_failed: "升级没有走完",
} as const;
type UpgradeFailure = (reason: keyof typeof FAILURES, options?: { readonly step?: number; readonly cause?: unknown }) => Error;

const readVersion = (db: SqliteBaselineDatabase) => Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
const readForeignKeys = (db: SqliteBaselineDatabase) => Number((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys);

/** The steps from `found` to the baseline's version, in order. Every declared step is checked, so a bad declaration fails whichever older version the store is at. */
function stepsToRun(baseline: SqliteBaseline, found: number, fail: UpgradeFailure): readonly SqliteUpgradeStep[] {
  const declared = new Map<number, SqliteUpgradeStep>();
  for (const step of baseline.upgrades ?? []) {
    const valid = Number.isInteger(step.from) && step.from >= 1 && step.from < baseline.version && !declared.has(step.from)
      && (step.sql !== undefined || step.run !== undefined);
    if (!valid) throw fail("invalid_step", { step: step.from });
    declared.set(step.from, step);
  }
  const steps: SqliteUpgradeStep[] = [];
  for (let from = found; from < baseline.version; from += 1) {
    const step = declared.get(from);
    if (!step) throw fail("missing_step", { step: from });
    steps.push(step);
  }
  return steps;
}

/** Foreign keys only switch outside a transaction; SQLite ignores the pragma inside one and says nothing, so it is read back. */
function switchForeignKeys(db: SqliteBaselineDatabase, value: number, fail: UpgradeFailure): void {
  db.exec(`PRAGMA foreign_keys = ${value}`);
  if (readForeignKeys(db) !== value) throw fail("foreign_keys_state");
}

/** Driver-neutral: `SqliteBaselineDatabase` has no transaction flag, and SQLite refuses a nested BEGIN without changing anything. */
function transactionOpen(db: SqliteBaselineDatabase): boolean {
  try { db.exec("BEGIN"); }
  catch { return true; }
  db.exec("ROLLBACK");
  return false;
}

function tableRowCounts(db: SqliteBaselineDatabase): ReadonlyMap<string, number> {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as Array<{ name: string }>;
  return new Map(tables.map(({ name }) => {
    const row = db.prepare(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`).get() as { n: number | bigint };
    return [name, Number(row.n)];
  }));
}

/**
 * The transaction cannot wait, so an `async` function would fail after the commit (`=> void` lets the compiler accept one). Returning a
 * promise is the failure, whatever it settles to; its own rejection is dropped here so it does not end the process as unhandled.
 */
function callStepFunction(work: ((db: SqliteBaselineDatabase) => unknown) | undefined, db: SqliteBaselineDatabase): void {
  const result = work?.(db);
  if ((typeof result !== "object" && typeof result !== "function") || result === null || !("then" in result) || typeof result.then !== "function") return;
  Promise.resolve(result).catch(() => undefined);
  throw new TypeError("升级段的函数必须是同步的");
}

function runSteps(db: SqliteBaselineDatabase, steps: readonly SqliteUpgradeStep[], fail: UpgradeFailure): void {
  for (const step of steps) {
    try {
      if (step.sql !== undefined) db.exec(step.sql);
      callStepFunction(step.run, db);
    } catch (cause) { throw fail("step_failed", { step: step.from, cause }); }
    if (!transactionOpen(db)) throw fail("transaction_ended", { step: step.from });
  }
}

/** Everything §2.2 step 5 checks before commit. It sees the new state because the transaction's own connection reads it. */
function verifyUpgrade(db: SqliteBaselineDatabase, baseline: SqliteBaseline, steps: readonly SqliteUpgradeStep[], rowsBefore: ReadonlyMap<string, number>, fail: UpgradeFailure): void {
  const integrity = db.prepare("PRAGMA integrity_check").all() as Array<{ integrity_check: string }>;
  if (integrity.length !== 1 || integrity[0]!.integrity_check !== "ok") throw fail("integrity");
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw fail("foreign_keys");
  if (!upgradedShapeMatches(db, baseline)) throw fail("structure");
  const reduces = new Set(steps.flatMap(step => step.reduces_rows ?? [])), rowsAfter = tableRowCounts(db);
  for (const [table, before] of rowsBefore) if (!reduces.has(table) && (rowsAfter.get(table) ?? 0) < before) throw fail("rows_reduced");
  for (const step of steps) {
    try { callStepFunction(step.verify, db); }
    catch (cause) { throw fail("verify_failed", { step: step.from, cause }); }
  }
}

function upgradeInOneTransaction(db: SqliteBaselineDatabase, baseline: SqliteBaseline, found: number, steps: readonly SqliteUpgradeStep[], fail: UpgradeFailure): void {
  try { db.exec("BEGIN IMMEDIATE"); }
  catch (cause) { throw fail("begin_failed", { cause }); }
  try {
    if (readVersion(db) !== found) throw fail("version_changed");
    const rowsBefore = tableRowCounts(db);
    runSteps(db, steps, fail);
    db.exec(`PRAGMA user_version = ${baseline.version}`);
    verifyUpgrade(db, baseline, steps, rowsBefore, fail);
    db.exec("COMMIT");
  } catch (error) {
    // A step that ended the transaction itself leaves nothing to roll back; what it committed is the snapshot's to restore.
    if (transactionOpen(db)) db.exec("ROLLBACK");
    throw error instanceof Error && "code" in error && error.code === "storage.upgrade_failed" ? error : fail("run_failed", { cause: error });
  }
}

/**
 * Upgrade one store on the connection the caller opened (upgrade-chain-design §2.2, steps 1, 4, 5). The caller holds the storage owner
 * lock and has no other connection on the file. The connection stays open: the upgrade process closes it, and takes the snapshot around
 * this call. After a throw it must close the connection synchronously, with no `await` in between, or the later writes of a step function
 * that returned a promise still land in the store. Every failure rolls back and raises `storage.upgrade_failed`; a store at the current
 * version is left alone, and one this build cannot start from is refused by what it is, without a write.
 */
export function runSqliteUpgrade(db: SqliteBaselineDatabase, path: string, baseline: SqliteBaseline, home?: string): SqliteUpgradeResult {
  const to = baseline.version, found = readVersion(db);
  if (found === to) return { from: to, to };
  if (found < 1 || found > to) throw sqliteVersionRefusal(path, found, to, home);
  const store = sqliteStoreLabel(path, home);
  const fail: UpgradeFailure = (reason, options = {}) => {
    const error = storageErrors.upgrade_failed(`${store} 从版本 ${found} 升到 ${to} 没有成功：${FAILURES[reason]}。`, {
      path: store, found, expected: to, reason, ...(options.step === undefined ? {} : { step: options.step }),
    });
    // The raiser takes no cause. Not enumerable, as in `ActionError`'s own constructor, so serializing the error leaves it out.
    if (options.cause !== undefined) Object.defineProperty(error, "cause", { value: options.cause, writable: true, configurable: true });
    return error;
  };
  const steps = stepsToRun(baseline, found, fail);
  if (!steps.some(step => step.rebuilds_tables)) {
    upgradeInOneTransaction(db, baseline, found, steps, fail);
    return { from: found, to };
  }
  const foreignKeysBefore = readForeignKeys(db);
  switchForeignKeys(db, 0, fail);
  try { upgradeInOneTransaction(db, baseline, found, steps, fail); }
  finally { switchForeignKeys(db, foreignKeysBefore, fail); }
  return { from: found, to };
}
