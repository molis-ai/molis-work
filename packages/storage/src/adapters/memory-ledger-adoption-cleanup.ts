import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { DatabaseSync } from "node:sqlite";
import type { MemoryCandidateRecord } from "@molis-ai/molis-work-contracts/services/memory";
import { openReadOnlyHomeSqlite } from "../home-sqlite.js";
import { MEMORY_LEDGER_STORE } from "./memory-ledger.js";
import { changeMemoryLedgerAdoption, type MemoryLedgerAdoptionSnapshot } from "./memory-ledger-adoption.js";
import { createMemoryLedgerRetention } from "./memory-ledger-retention.js";

export interface MemoryLedgerCleanupTarget {
  readonly ref: { readonly kind: "memory"; readonly id: string; readonly revision: number } | { readonly kind: "memory-candidate"; readonly id: string; readonly revision: number };
  readonly expectedVersion: number;
  readonly identity: { readonly scope: "user" | "project" | "character"; readonly owner: string };
  readonly sessionRef: { readonly kind: "session"; readonly id: string; readonly revision: number };
  readonly state: "active" | "paused" | "disabled" | "tombstoned" | "pending" | "accepted" | "promoted" | "discarded" | "expired" | "cancelled";
  readonly reason: "session-missing" | "session-purged";
  readonly sources: readonly { readonly actor_id: string; readonly event_id: string; readonly version: string }[];
}
export interface MemoryLedgerCleanupDecision {
  readonly kind: "adoption-cleanup";
  readonly operation_id: string;
  readonly phase: "pending" | "committed";
  readonly items: readonly { readonly target: MemoryLedgerCleanupTarget; readonly operation_id: string; readonly completed: boolean }[];
}
type Maintenance = { homeDirectory: string; snapshot: MemoryLedgerAdoptionSnapshot; assertCurrent(): void };
const keyOf = (operation: string) => `memory-operation:${operation}:adoption-cleanup`;
const conflict = (): never => { throw Object.assign(new Error("清理必须沿用原确认目标、版本与来源身份"), { code: "memory.adoption_conflict" }); };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return conflict();
  return value as Record<string, unknown>;
};

/** Validate the caller's body-free confirmation envelope; stored SDK rows are decoded only by the SDK. */
export function copyMemoryLedgerCleanupTargets(values: readonly unknown[]): readonly MemoryLedgerCleanupTarget[] {
  const exact = (value: unknown, keys: string[]) => {
    const result = object(value);
    if (Object.keys(result).length !== keys.length || Object.keys(result).some(key => !keys.includes(key))) conflict();
    return result;
  };
  const text = (value: unknown): string => typeof value === "string" && value.trim() ? value : conflict();
  const version = (value: unknown): number => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : conflict();
  return values.map(value => {
    const item = exact(value, ["ref", "expectedVersion", "identity", "sessionRef", "state", "reason", "sources"]);
    const ref = exact(item.ref, ["kind", "id", "revision"]), session = exact(item.sessionRef, ["kind", "id", "revision"]);
    const identity = exact(item.identity, ["scope", "owner"]);
    if (ref.kind !== "memory" && ref.kind !== "memory-candidate" || session.kind !== "session"
      || identity.scope !== "user" && identity.scope !== "project" && identity.scope !== "character"
      || item.reason !== "session-missing" && item.reason !== "session-purged" || !Array.isArray(item.sources)) return conflict();
    const state = item.state;
    if (state !== "active" && state !== "paused" && state !== "disabled" && state !== "tombstoned" && state !== "pending"
      && state !== "accepted" && state !== "promoted" && state !== "discarded" && state !== "expired" && state !== "cancelled") return conflict();
    return { ref: { kind: ref.kind, id: text(ref.id), revision: version(ref.revision) }, expectedVersion: version(item.expectedVersion),
      identity: { scope: identity.scope, owner: text(identity.owner) }, sessionRef: { kind: "session", id: text(session.id), revision: version(session.revision) },
      state, reason: item.reason, sources: item.sources.map(value => {
        const source = exact(value, ["actor_id", "event_id", "version"]);
        return { actor_id: text(source.actor_id), event_id: text(source.event_id), version: text(source.version) };
      }) };
  });
}

/** Ledger projection, not an SDK decoder: only proven source identities leave this owner. */
function sourcesOf(db: DatabaseSync, target: Omit<MemoryLedgerCleanupTarget, "sources">): MemoryLedgerCleanupTarget["sources"] {
  const sources = new Map<string, { actor_id: string; event_id: string; version: string }>();
  const scope = target.identity.scope === "user" ? "personal" : target.identity.scope;
  const add = (actor: string, refs: unknown) => {
    if (!Array.isArray(refs)) return conflict();
    for (const item of refs) {
      const ref = object(item);
      if (!actor || typeof ref.event_id !== "string" || !ref.event_id || typeof ref.version !== "string" || !ref.version) conflict();
      const source = { actor_id: actor, event_id: ref.event_id as string, version: ref.version as string };
      sources.set(JSON.stringify([actor, source.event_id, source.version]), source);
    }
  };
  if (target.ref.kind === "memory") {
    for (const row of db.prepare("SELECT actor_id, body FROM memory_markers WHERE key=?").all(`memory-source-links:${target.ref.id}`)) {
      add(String(row.actor_id), object(JSON.parse(String(row.body))).sources);
    }
  }
  for (const row of db.prepare("SELECT actor_id,body FROM memory_candidates").all()) {
    const note = object(JSON.parse(String(row.body)));
    if (target.ref.kind === "memory" ? note.memory_id === target.ref.id : note.candidate_id === target.ref.id) {
      if (note.scope !== scope || note.owner !== target.identity.owner) conflict();
      if (note.source_refs !== undefined) add(String(row.actor_id), note.source_refs);
    }
  }
  for (const row of db.prepare("SELECT actor_id,body FROM memory_markers WHERE key LIKE 'memory-operation:%:promotion-journal'").all()) {
    const mark = object(JSON.parse(String(row.body)));
    const candidate = mark.candidate === undefined ? undefined : object(mark.candidate);
    if (mark.kind === "promotion" && mark.scope === scope && mark.owner === target.identity.owner
      && (target.ref.kind === "memory" ? mark.memory_id === target.ref.id : candidate && candidate.candidate_id === target.ref.id)) add(String(row.actor_id), mark.sources);
  }
  return [...sources.values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function inspectMemoryLedgerCleanupSources(input: { homeDirectory: string; targets: readonly Omit<MemoryLedgerCleanupTarget, "sources">[] }): readonly MemoryLedgerCleanupTarget[] {
  const db = openReadOnlyHomeSqlite(input.homeDirectory, MEMORY_LEDGER_STORE);
  try { db.exec("BEGIN"); return input.targets.map(target => ({ ...target, sources: sourcesOf(db, target) })); }
  finally { db.close(); }
}
function read(db: DatabaseSync, operation: string): MemoryLedgerCleanupDecision | undefined {
  const row = db.prepare("SELECT body FROM memory_markers WHERE actor_id='' AND key=?").get(keyOf(operation));
  if (!row) return undefined;
  const mark = object(JSON.parse(String(row.body)));
  if (mark.kind !== "adoption-cleanup" || mark.operation_id !== operation || !["pending", "committed"].includes(String(mark.phase)) || !Array.isArray(mark.items)) return conflict();
  const items = mark.items.map(value => {
    const item = object(value);
    if (typeof item.operation_id !== "string" || !item.operation_id || typeof item.completed !== "boolean") return conflict();
    return { target: copyMemoryLedgerCleanupTargets([item.target])[0]!, operation_id: item.operation_id, completed: item.completed };
  });
  if (!items.length || (mark.phase === "committed") !== items.every(item => item.completed)) conflict();
  return { kind: "adoption-cleanup", operation_id: operation, phase: mark.phase === "committed" ? "committed" : "pending", items };
}
function write(db: DatabaseSync, decision: MemoryLedgerCleanupDecision) {
  db.prepare("INSERT INTO memory_markers(actor_id,key,at,body) VALUES ('',?,?,?) ON CONFLICT(actor_id,key) DO UPDATE SET body=excluded.body")
    .run(keyOf(decision.operation_id), new Date().toISOString(), JSON.stringify(decision));
}

/** Existing decisions are read before preview so a tombstone or physical absence never changes the original version. */
export function readMemoryLedgerCleanupDecision(input: Maintenance & { operation_id: string }): MemoryLedgerCleanupDecision | undefined {
  return changeMemoryLedgerAdoption(input, db => read(db, input.operation_id), input.assertCurrent);
}
export function beginMemoryLedgerCleanup(input: Maintenance & { operation_id: string; targets: readonly MemoryLedgerCleanupTarget[] }): MemoryLedgerCleanupDecision {
  return changeMemoryLedgerAdoption(input, db => {
    const before = read(db, input.operation_id);
    if (before) {
      if (!isDeepStrictEqual(before.items.map(item => item.target), input.targets)) conflict();
      return before;
    }
    if (!input.snapshot.adoptions.length || input.snapshot.adoptions.some(marker => object(marker.body).origin !== "adopting")) conflict();
    const targets = copyMemoryLedgerCleanupTargets(input.targets);
    for (const target of targets) if (!isDeepStrictEqual(sourcesOf(db, target), target.sources)) conflict();
    const decision: MemoryLedgerCleanupDecision = { kind: "adoption-cleanup", operation_id: input.operation_id, phase: "pending",
      items: targets.map(target => ({ target, operation_id: randomUUID(), completed: false })) };
    write(db, decision); return decision;
  }, input.assertCurrent);
}

/** Suppression is committed before SDK deletion and is never undone by a later failure. */
export function suppressMemoryLedgerCleanupSources(input: Maintenance & { decision: MemoryLedgerCleanupDecision; index: number }): void {
  changeMemoryLedgerAdoption(input, db => {
    if (!isDeepStrictEqual(read(db, input.decision.operation_id), input.decision)) conflict();
    const item = input.decision.items[input.index];
    if (!item) return conflict();
    for (const source of item.target.sources) {
      const scope = item.target.identity.scope === "user" ? "personal" : item.target.identity.scope;
      db.prepare("INSERT OR IGNORE INTO memory_markers(actor_id,key,at,body) VALUES (?,?,?,?)").run(source.actor_id,
        `memory-source-forgotten:${JSON.stringify([scope, item.target.identity.owner, source.event_id])}`,
        new Date().toISOString(), JSON.stringify({ event_id: source.event_id }));
    }
  }, input.assertCurrent);
}
export function completeMemoryLedgerCleanupTarget(input: Maintenance & { decision: MemoryLedgerCleanupDecision; index: number }): MemoryLedgerCleanupDecision {
  return changeMemoryLedgerAdoption(input, db => {
    if (!isDeepStrictEqual(read(db, input.decision.operation_id), input.decision)) conflict();
    const item = input.decision.items[input.index];
    if (!item) return conflict();
    if (item.target.ref.kind === "memory") createMemoryLedgerRetention(db, work => work()).forget(item.target.ref.id);
    else {
      const row = db.prepare("SELECT body FROM memory_candidates WHERE candidate_id=?").get(item.target.ref.id);
      if (row) {
        const note = JSON.parse(String(row.body)) as MemoryCandidateRecord;
        const scope = item.target.identity.scope === "user" ? "personal" : item.target.identity.scope;
        if (note.scope !== scope || note.owner !== item.target.identity.owner) conflict();
        db.prepare("DELETE FROM memory_candidates WHERE candidate_id=?").run(item.target.ref.id);
      }
    }
    const items = input.decision.items.map((entry, index) => index === input.index ? { ...entry, completed: true } : entry);
    const decision: MemoryLedgerCleanupDecision = { ...input.decision, items, phase: items.every(entry => entry.completed) ? "committed" : "pending" };
    write(db, decision); return decision;
  }, input.assertCurrent);
}
