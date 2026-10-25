import { isAbsolute } from "node:path";
import type { MemoryLedgerRecoveryLocation, MemoryLedgerRecoveryPage } from "@molis-ai/molis-work-contracts/services/memory";
import { homeSqlitePath, openReadOnlyHomeSqlite } from "../home-sqlite.js";
import { assertMemoryLedgerAdoptionSchema } from "./memory-ledger-adoption.js";
import { MEMORY_LEDGER_STORE } from "./memory-ledger.js";
import { projectMemoryLedgerRecoveryRow, type RecoveryEntry } from "./memory-ledger-recovery-facts.js";

const DEFAULT_RECOVERY_PAGE_SIZE = 40;
const MAX_RECOVERY_PAGE_SIZE = 100;
const failure = (code: string) => Object.assign(new Error("记忆来源检查未完成，保留原件待核对"), { code: `memory.${code}` });
export interface MemoryLedgerRecoveryInspection {
  next(options?: { limit?: number }): MemoryLedgerRecoveryPage;
  close(): void;
}

/** Inspect only a complete working copy. Never initialize, migrate, checkpoint, or expose a writer. */
export function openMemoryLedgerRecoveryInspection(input: {
  homeDirectory: string;
  assertCurrent(): void;
  signal?: AbortSignal;
}): MemoryLedgerRecoveryInspection {
  const current = () => {
    input.signal?.throwIfAborted();
    const result: unknown = input.assertCurrent();
    if (result !== undefined) {
      if (result !== null && (typeof result === "object" || typeof result === "function") && "then" in result)
        void Promise.resolve(result).catch(() => undefined);
      throw failure("recovery_current_required");
    }
    input.signal?.throwIfAborted();
  };
  if (!isAbsolute(input.homeDirectory)) throw failure("recovery_absolute_path_required");
  current();
  const db = (() => {
    try { return openReadOnlyHomeSqlite(input.homeDirectory, MEMORY_LEDGER_STORE); }
    catch { throw failure("recovery_open_failed"); }
  })();
  let closed = false;
  try {
    db.exec("BEGIN");
    try { assertMemoryLedgerAdoptionSchema(db, homeSqlitePath(input.homeDirectory, MEMORY_LEDGER_STORE)); }
    catch { throw failure("recovery_schema_invalid"); }
    current();
  } catch (error) {
    try { db.close(); } catch { throw new AggregateError([error, failure("recovery_close_failed")], "来源检查与关闭失败"); }
    throw error;
  }
  const queries = [
    { table: "markers", sql: "SELECT rowid AS row_number,actor_id,key,at,body FROM memory_markers WHERE key LIKE 'memory-%'" },
    { table: "owners", sql: "SELECT rowid AS row_number,scope,owner,project_id,subject FROM memory_owners WHERE 1" },
    { table: "candidates", sql: "SELECT rowid AS row_number,candidate_id,actor_id,state,body FROM memory_candidates WHERE 1" },
    { table: "changes", sql: "SELECT rowid AS row_number,change_id,actor_id,memory_id,at,body FROM memory_changes WHERE 1" },
  ] as const;
  let table = 0, last: number | undefined, entries: Generator<RecoveryEntry> | undefined;
  // Entries consumed while assembling a refused page stay here. A later call never skips that page.
  const pending: RecoveryEntry[] = [];
  const read = (): RecoveryEntry | undefined => {
    while (table < queries.length) {
      current();
      if (entries) {
        const entry = entries.next();
        if (!entry.done) return entry.value;
        entries = undefined;
      }
      const query = queries[table]!;
      let row: Record<string, unknown> | undefined;
      try {
        const statement = db.prepare(`${query.sql}${last === undefined ? "" : " AND rowid > ?"} ORDER BY rowid LIMIT 1`);
        row = last === undefined ? statement.get() : statement.get(last);
      } catch { throw failure("recovery_read_failed"); }
      if (!row) { table++; last = undefined; continue; }
      if (typeof row.row_number !== "number" || !Number.isSafeInteger(row.row_number)) throw failure("recovery_read_failed");
      last = row.row_number;
      const location: MemoryLedgerRecoveryLocation = { table: query.table, row: last };
      entries = projectMemoryLedgerRecoveryRow(location, row);
    }
    return undefined;
  };
  return {
    next(options = {}) {
      if (closed) throw failure("recovery_closed");
      const limit = options.limit ?? DEFAULT_RECOVERY_PAGE_SIZE;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RECOVERY_PAGE_SIZE) throw failure("recovery_limit_invalid");
      current();
      while (pending.length < limit) {
        current();
        const next = read();
        if (!next) break;
        pending.push(next);
      }
      current();
      const page = pending.splice(0, limit);
      return { facts: page.flatMap(entry => "fact" in entry ? [entry.fact] : []),
        issues: page.flatMap(entry => "issue" in entry ? [entry.issue] : []), exhausted: table === queries.length && pending.length === 0 };
    },
    close() {
      if (closed) return;
      const errors: unknown[] = [];
      try { current(); } catch (error) { errors.push(error); }
      // Authority never prevents disposal. SQLite close rolls back the read transaction and releases the snapshot.
      try { db.close(); }
      catch { errors.push(failure("recovery_close_failed")); }
      finally {
        closed = !db.isOpen;
        if (closed) { entries = undefined; pending.length = 0; }
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length) throw new AggregateError(errors, "来源检查关闭未完成");
    },
  };
}
