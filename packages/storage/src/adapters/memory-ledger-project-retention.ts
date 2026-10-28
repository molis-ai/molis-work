import type { DatabaseSync } from "node:sqlite";
import type { MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryLedgerAdoptionSnapshot } from "./memory-ledger-adoption.js";
import { assertMemoryLedgerRetainedObjectsCleared, createMemoryLedgerRetention } from "./memory-ledger-retention.js";
import { createMemoryLedgerRetentionCommands, type MemoryLedgerSelectedRetention } from "./memory-ledger-selected-retention.js";

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
export interface MemoryLedgerProjectRetention extends Omit<MemoryLedgerSelectedRetention, "suppressSources"> {
  suppressSources(input: Expected & { readonly scope: MemoryScope; readonly owner: string; readonly sources: readonly { readonly event_id: string; readonly version: string }[] }): MemoryLedgerAdoptionSnapshot;
  /** The caller must first finish SDK coverage; only the original nonpersonal scopes can close. */
  forgetScopes(input: Expected): MemoryLedgerAdoptionSnapshot;
}
const conflict = (): never => { throw Object.assign(new Error("原项目记忆清理计划、快照或后置条件不符"), { code: "memory.adoption_conflict" }); };
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const versioned = (items: readonly { readonly version: number }[]) => Array.isArray(items) && items.every(item => item && typeof item === "object"
  && !("state" in item) && Number.isSafeInteger(item.version) && item.version > 0);
const body = (value: unknown): Record<string, unknown> => {
  try { const record: unknown = JSON.parse(String(value)); if (record && typeof record === "object" && !Array.isArray(record)) return record as Record<string, unknown>; }
  catch { return conflict(); }
  return conflict();
};

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
  const plan = structuredClone(input.plan);
  if (!plan || !text(plan.project_id) || !Array.isArray(plan.scopes)
    || plan.scopes.some((target: MemoryLedgerProjectRetentionPlan["scopes"][number]) => !target || target.scope === "project" && target.owner !== plan.project_id
      || !versioned(target.memories) || !versioned(target.candidates)
      || !Array.isArray(target.sources) || target.sources.some(source => !source || !text(source.version)))) return conflict();
  const { change, commands } = createMemoryLedgerRetentionCommands({ ...input,
    plan: { actor_id: plan.actor_id, operation_id: plan.operation_id, scopes: plan.scopes } });
  return Object.freeze({
    ...commands,
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
  } satisfies MemoryLedgerProjectRetention);
}
