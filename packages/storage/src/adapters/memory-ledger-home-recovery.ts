import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { MemoryHomeRecoveryDecision } from "@molis-ai/molis-work-contracts/services/memory";
import { homeSqlitePath, openReadOnlyHomeSqlite } from "../home-sqlite.js";
import { inspectExistingSqlitePath } from "../storage-maintenance-path.js";
import { MEMORY_LEDGER_STORE } from "./memory-ledger.js";
import { beginMemoryLedgerAdoptionInTransaction, changeMemoryLedgerAdoption, completeMemoryLedgerAdoptionInTransaction, memoryLedgerAdoptionSnapshot,
  type MemoryLedgerAdoptionProfile, type MemoryLedgerAdoptionSnapshot } from "./memory-ledger-adoption.js";
import { memoryLedgerCloseFailures, withMemoryLedgerDatabase, type MemoryLedgerCloseFailure } from "./memory-ledger-close.js";
import { decodeMemoryHomeRecoveryDecision, homeRecoveryConflict as conflict, homeRecoveryKey, memoryHomeRecoveryRecords,
  type MemoryHomeRecoveryRecord } from "./memory-ledger-home-recovery-decision.js";

export interface MemoryLedgerHomeRecoveryExpected {
  readonly snapshot: MemoryLedgerAdoptionSnapshot;
  readonly parent: MemoryHomeRecoveryRecord | null;
}
export interface MemoryLedgerHomeRecoveryChange { readonly before: MemoryLedgerHomeRecoveryExpected; readonly after: MemoryLedgerHomeRecoveryExpected }
export interface MemoryLedgerHomeRecovery {
  read(): MemoryLedgerHomeRecoveryExpected;
  adopt(expected: MemoryLedgerHomeRecoveryExpected): MemoryLedgerHomeRecoveryChange;
  begin(input: { readonly expected: MemoryLedgerHomeRecoveryExpected; readonly decision: Omit<MemoryHomeRecoveryDecision, "phase"> }): MemoryLedgerHomeRecoveryChange;
  complete(input: { readonly expected: MemoryLedgerHomeRecoveryExpected; readonly profiles: readonly MemoryLedgerAdoptionProfile[] }): MemoryLedgerHomeRecoveryChange;
  close(): Promise<void>;
}

/** Own one immutable recovery decision; callers retain the original Home owner through final publication. */
export function createMemoryLedgerHomeRecovery(input: {
  readonly homeDirectory: string; readonly operation_id: string; readonly assertCurrent: () => void; readonly signal?: AbortSignal;
}): MemoryLedgerHomeRecovery {
  const { homeDirectory, operation_id: id, assertCurrent, signal } = input;
  if (!isAbsolute(homeDirectory) || !id?.trim() || typeof assertCurrent !== "function") return conflict();
  const path = homeSqlitePath(homeDirectory, MEMORY_LEDGER_STORE), files = inspectExistingSqlitePath(path);
  const pending = new Set<MemoryLedgerCloseFailure>();
  let closing = false, busy = false, disposal: Promise<void> | undefined;
  const current = () => {
    if (closing) conflict();
    files.assertCurrent(); signal?.throwIfAborted();
    const result: unknown = assertCurrent();
    if (result !== undefined) { void Promise.resolve(result).catch(() => undefined); conflict(); }
    signal?.throwIfAborted(); files.assertCurrent(); if (closing) conflict();
  };
  const run = <T>(work: () => T): T => {
    if (closing || busy || pending.size) return conflict();
    busy = true;
    try { return work(); }
    catch (error) {
      for (const failure of memoryLedgerCloseFailures(error)) pending.add(failure);
      if (pending.size) closing = true;
      throw error;
    } finally { busy = false; }
  };
  const observe = (db: DatabaseSync): MemoryLedgerHomeRecoveryExpected => ({
    snapshot: memoryLedgerAdoptionSnapshot(db, path),
    parent: memoryHomeRecoveryRecords(db).find(parent => parent.body.operation_id === id) ?? null,
  });
  const change = (expected: MemoryLedgerHomeRecoveryExpected, work: (db: DatabaseSync) => void, requireAdopting = true): MemoryLedgerHomeRecoveryChange => {
    current();
    return changeMemoryLedgerAdoption({ homeDirectory, snapshot: expected.snapshot }, db => {
      const before = observe(db);
      if (!isDeepStrictEqual(before, expected)) conflict();
      if (requireAdopting && (!before.snapshot.adoptions.length || before.snapshot.adoptions.some(mark => !mark.body || typeof mark.body !== "object"
        || !("origin" in mark.body) || mark.body.origin !== "adopting"))) conflict();
      if (memoryHomeRecoveryRecords(db).some(parent => parent.body.operation_id !== id && parent.body.phase === "pending")) conflict();
      current(); work(db); current();
      return { before, after: observe(db) };
    }, current, files);
  };
  return {
    read: () => run(() => {
      current();
      return withMemoryLedgerDatabase(openReadOnlyHomeSqlite(homeDirectory, MEMORY_LEDGER_STORE), db => {
        current(); db.exec("BEGIN"); const result = observe(db); current(); return result;
      });
    }),
    adopt: expected => run(() => {
      const fixed = structuredClone(expected);
      if (fixed.parent !== null) return conflict();
      return change(fixed, db => beginMemoryLedgerAdoptionInTransaction(db, fixed.snapshot), false);
    }),
    begin: request => run(() => {
      const fixed = structuredClone(request);
      if (Object.keys(fixed).some(key => key !== "expected" && key !== "decision") || "phase" in fixed.decision) return conflict();
      const decision = decodeMemoryHomeRecoveryDecision({ ...fixed.decision, phase: "pending" }, id);
      if (fixed.expected.parent !== null) return conflict();
      return change(fixed.expected, db => {
        db.prepare("INSERT INTO memory_markers(actor_id,key,at,body) VALUES ('',?,?,?)")
          .run(homeRecoveryKey(id), new Date().toISOString(), JSON.stringify(decision));
      });
    }),
    complete: request => run(() => {
      const fixed = structuredClone(request);
      if (Object.keys(fixed).some(key => key !== "expected" && key !== "profiles") || fixed.expected.parent?.body.phase !== "pending") return conflict();
      return change(fixed.expected, db => {
        const parent = fixed.expected.parent!;
        db.prepare("UPDATE memory_markers SET body=? WHERE actor_id='' AND key=?")
          .run(JSON.stringify({ ...parent.body, phase: "committed" }), homeRecoveryKey(id));
        completeMemoryLedgerAdoptionInTransaction(db, { snapshot: fixed.expected.snapshot, profiles: fixed.profiles });
      });
    }),
    close() {
      closing = true;
      if (!disposal) {
        disposal = Promise.resolve().then(async () => {
          const errors: unknown[] = [];
          for (const failure of pending) {
            try { await failure.close(); pending.delete(failure); }
            catch (error) { errors.push(error); }
          }
          if (errors.length) throw new AggregateError(errors, "恢复父决定资源关闭未完成", { cause: errors[0] });
        });
        void disposal.then(() => { disposal = undefined; }, () => { disposal = undefined; });
      }
      return disposal;
    },
  };
}
