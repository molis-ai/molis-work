import { isAbsolute } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { homeSqlitePath, openReadOnlyHomeSqlite } from "../home-sqlite.js";
import { inspectExistingSqlitePath } from "../storage-maintenance-path.js";
import { MEMORY_LEDGER_STORE } from "./memory-ledger.js";
import { changeMemoryLedgerAdoption, memoryLedgerAdoptionSnapshot, type MemoryLedgerAdoptionSnapshot } from "./memory-ledger-adoption.js";
import { assertMemoryLedgerRetainedObjectsCleared, assertMemoryLedgerRetentionIdentities, createMemoryLedgerRetention, dropMemoryLedgerCandidate, suppressMemoryLedgerSources } from "./memory-ledger-retention.js";

/** A source-forgotten barrier has no version; versioned sources retain their exact original tuple. */
export interface MemoryLedgerSelectedRetentionSource { readonly event_id: string; readonly version?: string }
export interface MemoryLedgerSelectedRetentionPlan {
  readonly actor_id: string;
  readonly operation_id: string;
  readonly scopes: readonly {
    readonly scope: MemoryScope; readonly owner: string;
    readonly memories: readonly { readonly memory_id: string; readonly version: number }[];
    readonly candidates: readonly { readonly candidate_id: string; readonly version: number }[];
    readonly sources: readonly MemoryLedgerSelectedRetentionSource[];
  }[];
}
type Expected = { readonly snapshot: MemoryLedgerAdoptionSnapshot };
export interface MemoryLedgerSelectedRetention {
  suppressSources(input: Expected & { readonly scope: MemoryScope; readonly owner: string; readonly sources: readonly MemoryLedgerSelectedRetentionSource[] }): MemoryLedgerAdoptionSnapshot;
  dropCandidate(input: Expected & { readonly candidate_id: string }): MemoryLedgerAdoptionSnapshot;
  forget(input: Expected & { readonly memory_id: string }): MemoryLedgerAdoptionSnapshot;
  verifyOriginal(input: Expected): void;
}
interface RetentionInput {
  readonly homeDirectory: string; readonly plan: MemoryLedgerSelectedRetentionPlan; readonly mode: "cleanup" | "original";
  readonly assertCurrent: () => void; readonly signal?: AbortSignal;
}
const conflict = (): never => { throw Object.assign(new Error("原记忆清理选择、快照或后置条件不符"), { code: "memory.adoption_conflict" }); };
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const positive = (value: unknown) => Number.isSafeInteger(value) && Number(value) > 0;
const fields = (value: object, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));

function copyPlan(input: MemoryLedgerSelectedRetentionPlan): MemoryLedgerSelectedRetentionPlan {
  const plan = structuredClone(input);
  if (!plan || !fields(plan, ["actor_id", "operation_id", "scopes"]) || !text(plan.actor_id) || !text(plan.operation_id) || !Array.isArray(plan.scopes)) return conflict();
  const scopes = new Set<string>(), memories = new Set<string>(), candidates = new Set<string>();
  for (const target of plan.scopes) {
    if (!target || !fields(target, ["scope", "owner", "memories", "candidates", "sources"])
      || !["personal", "project", "character"].includes(target.scope) || !text(target.owner)
      || target.scope === "personal" && target.owner !== plan.actor_id
      || !Array.isArray(target.memories) || !Array.isArray(target.candidates) || !Array.isArray(target.sources)) return conflict();
    const key = JSON.stringify([target.scope, target.owner]); if (scopes.has(key)) return conflict(); scopes.add(key);
    for (const item of target.memories) {
      if (!item || !fields(item, ["memory_id", "version"]) || !text(item.memory_id) || !positive(item.version) || memories.has(item.memory_id)) return conflict();
      memories.add(item.memory_id);
    }
    for (const item of target.candidates) {
      if (!item || !fields(item, ["candidate_id", "version"]) || !text(item.candidate_id) || !positive(item.version) || candidates.has(item.candidate_id)) return conflict();
      candidates.add(item.candidate_id);
    }
    for (const source of target.sources) if (!source || !fields(source, ["event_id", "version"]) || !text(source.event_id)
      || "version" in source && !text(source.version)) return conflict();
  }
  return plan;
}

/** Shared package-internal transaction assembly; no database or mutation callback crosses the public entrypoint. */
export function createMemoryLedgerRetentionCommands(input: RetentionInput) {
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
  const commands: MemoryLedgerSelectedRetention = Object.freeze({
    suppressSources(request) {
      const fixed = structuredClone(request), target = plan.scopes.find(item => item.scope === fixed.scope && item.owner === fixed.owner);
      if (!fields(fixed, ["snapshot", "scope", "owner", "sources"]) || !target || !Array.isArray(fixed.sources)
        || fixed.sources.some(source => !target.sources.some(original => isDeepStrictEqual(original, source)))) return conflict();
      return change(fixed, db => suppressMemoryLedgerSources(db, plan.actor_id, target.scope, target.owner, fixed.sources));
    },
    dropCandidate(request) {
      const fixed = structuredClone(request), target = plan.scopes.find(item => item.candidates.some(candidate => candidate.candidate_id === fixed.candidate_id));
      if (!fields(fixed, ["snapshot", "candidate_id"]) || !target) return conflict();
      return change(fixed, db => dropMemoryLedgerCandidate(db, fixed.candidate_id, target, plan.actor_id));
    },
    forget(request) {
      const fixed = structuredClone(request);
      if (!fields(fixed, ["snapshot", "memory_id"]) || !plan.scopes.some(target => target.memories.some(item => item.memory_id === fixed.memory_id))) return conflict();
      return change(fixed, db => createMemoryLedgerRetention(db, work => work()).forget(fixed.memory_id));
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
  } satisfies MemoryLedgerSelectedRetention);
  return { change, commands };
}

/** Exact selected retention only: no project or scope-wide cleanup capability. */
export function createMemoryLedgerSelectedRetention(input: RetentionInput): MemoryLedgerSelectedRetention {
  return createMemoryLedgerRetentionCommands(input).commands;
}
