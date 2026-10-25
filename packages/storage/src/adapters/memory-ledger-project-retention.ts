import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { homeSqlitePath, openReadOnlyHomeSqlite } from "../home-sqlite.js";
import { inspectExistingSqlitePath } from "../storage-maintenance-path.js";
import { MEMORY_LEDGER_STORE } from "./memory-ledger.js";
import { changeMemoryLedgerAdoption, memoryLedgerAdoptionSnapshot, type MemoryLedgerAdoptionSnapshot } from "./memory-ledger-adoption.js";
import { assertMemoryLedgerRetainedObjectsCleared, assertMemoryLedgerRetentionIdentities, createMemoryLedgerRetention, dropMemoryLedgerCandidate, suppressMemoryLedgerSources } from "./memory-ledger-retention.js";

/** Structurally accepts the original Catalog plan; Storage never owns or rebuilds that plan. */
export interface MemoryLedgerProjectRetentionPlan {
  readonly project_id: string;
  readonly actor_id: string;
  readonly operation_id: string;
  readonly scopes: readonly {
    readonly scope: MemoryScope; readonly owner: string;
    readonly memories: readonly { readonly memory_id: string; readonly version: number }[];
    readonly candidates: readonly { readonly candidate_id: string; readonly version: number }[];
    readonly sources: readonly { readonly event_id: string; readonly version: string }[];
  }[];
}
type Expected = { readonly snapshot: MemoryLedgerAdoptionSnapshot };
export interface MemoryLedgerProjectRetention {
  suppressSources(input: Expected & { readonly scope: MemoryScope; readonly owner: string; readonly sources: readonly { readonly event_id: string; readonly version: string }[] }): MemoryLedgerAdoptionSnapshot;
  dropCandidate(input: Expected & { readonly candidate_id: string }): MemoryLedgerAdoptionSnapshot;
  forget(input: Expected & { readonly memory_id: string }): MemoryLedgerAdoptionSnapshot;
  /** The caller must first finish SDK coverage; only the original nonpersonal scopes can close. */
  forgetScopes(input: Expected): MemoryLedgerAdoptionSnapshot;
  verifyOriginal(input: Expected): void;
}
const conflict = (): never => { throw Object.assign(new Error("原项目记忆清理计划、快照或后置条件不符"), { code: "memory.adoption_conflict" }); };
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const body = (value: unknown): Record<string, unknown> => {
  try { const record: unknown = JSON.parse(String(value)); if (record && typeof record === "object" && !Array.isArray(record)) return record as Record<string, unknown>; }
  catch { return conflict(); }
  return conflict();
};

function copyPlan(input: MemoryLedgerProjectRetentionPlan): MemoryLedgerProjectRetentionPlan {
  const plan = structuredClone(input);
  if (!plan || !text(plan.project_id) || !text(plan.actor_id) || !text(plan.operation_id) || !Array.isArray(plan.scopes)) return conflict();
  const scopes = new Set<string>(), memories = new Set<string>(), candidates = new Set<string>();
  for (const target of plan.scopes) {
    if (!target || !["personal", "project", "character"].includes(target.scope) || !text(target.owner)
      || target.scope === "project" && target.owner !== plan.project_id || target.scope === "personal" && target.owner !== plan.actor_id
      || !Array.isArray(target.memories) || !Array.isArray(target.candidates) || !Array.isArray(target.sources)) return conflict();
    const key = JSON.stringify([target.scope, target.owner]); if (scopes.has(key)) return conflict(); scopes.add(key);
    for (const item of target.memories) {
      if (!item || !text(item.memory_id) || !positive(item.version) || memories.has(item.memory_id)) return conflict();
      memories.add(item.memory_id);
    }
    for (const item of target.candidates) {
      if (!item || !text(item.candidate_id) || !positive(item.version) || candidates.has(item.candidate_id)) return conflict();
      candidates.add(item.candidate_id);
    }
    for (const source of target.sources) if (!source || !text(source.event_id) || !text(source.version)) return conflict();
  }
  return plan;
}

/** Do not let the original scope mutation erase evidence of a later, unselected object or owner. */
function assertScopeSelection(db: DatabaseSync, plan: MemoryLedgerProjectRetentionPlan, snapshot: MemoryLedgerAdoptionSnapshot): void {
  const scopes = plan.scopes.filter(target => target.scope !== "personal");
  for (const owner of snapshot.owners) {
    const selected = scopes.some(target => target.scope === owner.scope && target.owner === owner.owner);
    if (owner.project_id === plan.project_id && !selected || selected && owner.project_id !== plan.project_id) conflict();
  }
  for (const table of ["memory_candidates", "memory_changes", "memory_pairs"]) {
    for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
      const record = body(row.body), selected = scopes.find(target => target.scope === record.scope && target.owner === record.owner);
      if (!selected) continue;
      if (table === "memory_candidates" && !selected.candidates.some(item => item.candidate_id === record.candidate_id)) conflict();
      if (table === "memory_changes" && !selected.memories.some(item => item.memory_id === record.memory_id)) conflict();
      if (table === "memory_pairs") for (const name of ["a", "b"]) {
        const item = record[name];
        if (!item || typeof item !== "object" || !("memory_id" in item) || !selected.memories.some(memory => memory.memory_id === item.memory_id)) conflict();
      }
    }
  }
}

/** Bound semantic commands only. Each operation opens the existing Ledger for exactly one transaction. */
export function createMemoryLedgerProjectRetention(input: {
  readonly homeDirectory: string; readonly plan: MemoryLedgerProjectRetentionPlan; readonly mode: "cleanup" | "original";
  readonly assertCurrent: () => void; readonly signal?: AbortSignal;
}): MemoryLedgerProjectRetention {
  const { homeDirectory, mode, assertCurrent, signal } = input, plan = copyPlan(input.plan);
  if (!text(homeDirectory) || !isAbsolute(homeDirectory) || !["cleanup", "original"].includes(mode) || typeof assertCurrent !== "function") return conflict();
  const authority = () => {
    signal?.throwIfAborted();
    const result: unknown = assertCurrent();
    if (result !== undefined) { void Promise.resolve(result).catch(() => undefined); conflict(); }
    signal?.throwIfAborted();
  };
  authority();
  const files = inspectExistingSqlitePath(homeSqlitePath(homeDirectory, MEMORY_LEDGER_STORE));
  const current = () => { files.assertCurrent(); authority(); files.assertCurrent(); };
  const change = (expected: Expected, mutation: (db: DatabaseSync, snapshot: MemoryLedgerAdoptionSnapshot) => void) => {
    const snapshot = structuredClone(expected.snapshot);
    if (mode !== "cleanup") return conflict();
    current();
    return changeMemoryLedgerAdoption({ homeDirectory, snapshot }, db => {
      if (!snapshot.adoptions.length || snapshot.adoptions.some(mark => !mark.body || typeof mark.body !== "object" || !("origin" in mark.body) || mark.body.origin !== "adopting")) conflict();
      assertMemoryLedgerRetentionIdentities(db); current();
      mutation(db, snapshot);
      return memoryLedgerAdoptionSnapshot(db, homeSqlitePath(homeDirectory, MEMORY_LEDGER_STORE));
    }, current, files);
  };
  current();
  return Object.freeze({
    suppressSources(request) {
      const fixed = structuredClone(request), target = plan.scopes.find(item => item.scope === fixed.scope && item.owner === fixed.owner);
      if (!target || !Array.isArray(fixed.sources) || fixed.sources.some(source => !target.sources.some(original => isDeepStrictEqual(original, source)))) return conflict();
      return change(fixed, db => suppressMemoryLedgerSources(db, plan.actor_id, target.scope, target.owner, fixed.sources));
    },
    dropCandidate(request) {
      const fixed = structuredClone(request), target = plan.scopes.find(item => item.candidates.some(candidate => candidate.candidate_id === fixed.candidate_id));
      if (!target) return conflict();
      return change(fixed, db => dropMemoryLedgerCandidate(db, fixed.candidate_id, target, plan.actor_id));
    },
    forget(request) {
      const fixed = structuredClone(request);
      if (!plan.scopes.some(target => target.memories.some(item => item.memory_id === fixed.memory_id))) return conflict();
      return change(fixed, db => createMemoryLedgerRetention(db, work => work()).forget(fixed.memory_id));
    },
    forgetScopes(request) {
      return change(request, (db, snapshot) => {
        assertMemoryLedgerRetainedObjectsCleared(db, plan);
        assertScopeSelection(db, plan, snapshot);
        const scopes = plan.scopes.filter(target => target.scope !== "personal").map(({ scope, owner }) => ({ scope, owner }));
        createMemoryLedgerRetention(db, work => work()).forgetScopes({ scopes, project_id: plan.project_id,
          prefs_keys: [`project:${plan.project_id}`], signal_prefixes: scopes.map(item => `${item.scope}|${item.owner}|`),
          marker_keys: scopes.map(item => `tidy:${item.scope}:${item.owner}`) });
      });
    },
    verifyOriginal(request) {
      const snapshot = structuredClone(request.snapshot); current();
      const db = openReadOnlyHomeSqlite(homeDirectory, MEMORY_LEDGER_STORE);
      try {
        current();
        db.exec("BEGIN");
        if (!isDeepStrictEqual(memoryLedgerAdoptionSnapshot(db, homeSqlitePath(homeDirectory, MEMORY_LEDGER_STORE)), snapshot)) conflict();
        current(); assertMemoryLedgerRetainedObjectsCleared(db, plan); current();
      } finally { db.close(); }
    },
  } satisfies MemoryLedgerProjectRetention);
}
