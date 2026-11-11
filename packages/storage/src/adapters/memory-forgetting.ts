import { isDeepStrictEqual } from "node:util";
import { lstatSync, readdirSync, type Stats } from "node:fs";
import { join } from "node:path";
import type { MemoryForgettingDecision, MemoryForgettingFacts, MemoryForgettingPort, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import type { HomeStoreDeclaration } from "../home-stores.js";
import { readSnapshotFile, snapshotFileStat } from "../snapshot-files.js";
import { atomicWriteFileSync } from "./atomic-write.js";
import { assertStorageOwner, hasOnlyStorageOwnerFiles, type StorageOwner } from "./storage-owner.js";
import { assertNoPendingHomeRestore } from "./home-restore-guard.js";
import { readStorageSpace } from "../space.js";

export const MEMORY_FORGETTING_HOME_STORE: HomeStoreDeclaration = { path: "memory-forgetting-v2.json" };
const filePath = (home: string) => join(home, MEMORY_FORGETTING_HOME_STORE.path);

const invalid = () => Object.assign(new Error("独立遗忘决定缺失、损坏或不是受支持的完整格式"), { code: "memory.forgetting_invalid" });
const conflict = () => Object.assign(new Error("同一次遗忘决定不能改为另一份固定选择"), { code: "memory.conflict" });
const compare = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
const operationKey = (item: MemoryForgettingDecision) => JSON.stringify([item.actor_id, item.operation_id]);
function object(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== fields.length || fields.some(field => !Object.hasOwn(record, field))) throw invalid();
  return record;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw invalid();
  return value;
}
function list<T>(value: unknown, decode: (item: unknown) => T, key: (item: T) => string): T[] {
  if (!Array.isArray(value)) throw invalid();
  const decoded = value.map(decode), keys = decoded.map(key);
  if (new Set(keys).size !== keys.length) throw invalid();
  return decoded.sort((left, right) => compare(key(left), key(right)));
}
function target(value: unknown, kind: "memory_id" | "candidate_id") {
  const item = object(value, [kind, "version"]), id = text(item[kind]), version = item.version;
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 1) throw invalid();
  return { id, version };
}
function decision(value: unknown): MemoryForgettingDecision {
  const record = object(value, ["selection_mode", "operation_id", "actor_id", "scope", "owner", "accepted_at", "memories", "candidates", "source_event_ids"]);
  const selection_mode = record.selection_mode;
  if (selection_mode !== "related" && selection_mode !== "exact-identities") throw invalid();
  const operation_id = text(record.operation_id), actor_id = text(record.actor_id), owner = text(record.owner), scope = record.scope;
  if (scope !== "personal" && scope !== "project" && scope !== "character" || scope === "personal" && owner !== actor_id) throw invalid();
  const accepted_at = text(record.accepted_at), time = Date.parse(accepted_at);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== accepted_at) throw invalid();
  const memories = list(record.memories, item => { const decoded = target(item, "memory_id"); return { memory_id: decoded.id, version: decoded.version }; }, item => item.memory_id);
  const candidates = list(record.candidates, item => { const decoded = target(item, "candidate_id"); return { candidate_id: decoded.id, version: decoded.version }; }, item => item.candidate_id);
  const source_event_ids = list(record.source_event_ids, text, item => item);
  if (!memories.length && !candidates.length && !source_event_ids.length) throw invalid();
  if (selection_mode === "exact-identities" && (source_event_ids.length || !memories.length && !candidates.length)) throw invalid();
  return { selection_mode, operation_id, actor_id, scope: scope as MemoryScope, owner, accepted_at, memories, candidates, source_event_ids };
}
function facts(value: unknown): MemoryForgettingFacts {
  const record = object(value, ["format_version", "decisions"]);
  if (record.format_version !== /* @version format.memory.forgetting */ 1) throw invalid();
  return { format_version: /* @version format.memory.forgetting */ 1, decisions: list(record.decisions, decision, operationKey) };
}

/** The sole decoder for this persisted boundary. Missing/partial data is never an empty list. */
export function parseMemoryForgetting(contents: string): MemoryForgettingFacts {
  let value: unknown;
  try { value = JSON.parse(contents); } catch { throw invalid(); }
  return facts(value);
}

/** Validate owner-supplied fixed facts too; unknown fields cannot smuggle a body into the file. */
export function serializeMemoryForgetting(value: MemoryForgettingFacts): string {
  return JSON.stringify(facts(value)) + "\n";
}

/** Current and archive facts are irreversible. Repeated identities must describe the identical accepted decision. */
export function mergeMemoryForgetting(current: MemoryForgettingFacts, incoming: MemoryForgettingFacts): MemoryForgettingFacts {
  const selected = new Map<string, MemoryForgettingDecision>();
  for (const item of [...facts(current).decisions, ...facts(incoming).decisions]) {
    const key = operationKey(item), previous = selected.get(key);
    if (previous && !isDeepStrictEqual(previous, item)) throw conflict();
    if (!previous) selected.set(key, item);
  }
  return { format_version: /* @version format.memory.forgetting */ 1, decisions: [...selected.values()].sort((left, right) => compare(operationKey(left), operationKey(right))) };
}

/** Stable ordinary-file inspection is shared by startup, snapshots and offline restore. */
export function inspectMemoryForgetting(homeDirectory: string): MemoryForgettingFacts {
  try {
    const file = filePath(homeDirectory), stat = snapshotFileStat(file);
    if ((stat.mode & 0o777) !== 0o600) throw invalid();
    return parseMemoryForgetting(readSnapshotFile(file, stat.size).toString("utf8"));
  } catch { throw invalid(); }
}

interface ForgettingOwner {
  readonly homeDirectory: string;
  readonly storageOwner: StorageOwner;
  assertCurrent(): void;
}
function frozen(value: MemoryForgettingFacts): MemoryForgettingFacts {
  for (const item of value.decisions) {
    item.memories.forEach(Object.freeze); item.candidates.forEach(Object.freeze);
    Object.freeze(item.memories); Object.freeze(item.candidates); Object.freeze(item.source_event_ids); Object.freeze(item);
  }
  Object.freeze(value.decisions); return Object.freeze(value);
}
const sameFile = (left: Stats, right: Stats) => ["dev", "ino", "mode", "size", "mtimeMs", "ctimeMs", "nlink"]
  .every(key => Reflect.get(left, key) === Reflect.get(right, key));
function current(input: ForgettingOwner): void {
  assertStorageOwner(join(input.homeDirectory, "agent-runtime"), input.storageOwner);
  assertNoPendingHomeRestore(join(input.homeDirectory, "agent-runtime"));
  input.assertCurrent();
}

/** Only the original fresh-Home owner may explicitly establish the empty decision set. */
export function initializeMemoryForgetting(input: ForgettingOwner): void {
  current(input);
  if (readdirSync(input.homeDirectory).some(name => name !== "agent-runtime" && (name !== "storage-space.json" || readStorageSpace(input.homeDirectory) === null))
    || !hasOnlyStorageOwnerFiles(join(input.homeDirectory, "agent-runtime"), input.storageOwner)) throw invalid();
  atomicWriteFileSync(filePath(input.homeDirectory), serializeMemoryForgetting({ format_version: /* @version format.memory.forgetting */ 1, decisions: [] }), { mode: 0o600, durable: true });
  current(input);
}

/**
 * The new generation's empty facts, only when the ledger's own 1 → 2 upgrade asks (finishMemoryLedgerUpgrade). A file already there is the one
 * an interrupted start wrote; it is kept and must be valid.
 */
export function startMemoryForgettingGeneration(input: ForgettingOwner): void {
  current(input);
  let present = true;
  try { lstatSync(filePath(input.homeDirectory)); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw invalid(); present = false; }
  if (present) { inspectMemoryForgetting(input.homeDirectory); return; }
  atomicWriteFileSync(filePath(input.homeDirectory), serializeMemoryForgetting({ format_version: /* @version format.memory.forgetting */ 1, decisions: [] }), { mode: 0o600, durable: true });
  current(input);
}

/** No initializer or missing-file fallback is exposed through the normal Memory mutation port. */
export function openMemoryForgetting(input: ForgettingOwner): MemoryForgettingPort {
  current(input);
  const load = () => {
    try {
    const identity = snapshotFileStat(filePath(input.homeDirectory)), value = frozen(inspectMemoryForgetting(input.homeDirectory));
    if (!sameFile(identity, snapshotFileStat(filePath(input.homeDirectory)))) throw invalid();
    return { identity, value };
    } catch { throw invalid(); }
  };
  // All runtime facades receive this one owner instance. There is no module registry or global cache.
  let held = load(), unreadable = false;
  const read = () => {
    current(input);
    if (unreadable) throw invalid();
    // A second independent writer cannot make this owner return stale facts or overwrite its changes.
    try { if (!sameFile(held.identity, snapshotFileStat(filePath(input.homeDirectory)))) throw invalid(); }
    catch { unreadable = true; throw invalid(); }
    return held.value;
  };
  read();
  return {
    read,
    accept(selection) {
      const previous = read(), old = previous.decisions.find(item => item.actor_id === selection.actor_id && item.operation_id === selection.operation_id);
      const next = decision({ ...selection, accepted_at: old?.accepted_at ?? new Date().toISOString() });
      if (old && !isDeepStrictEqual(old, next)) throw conflict();
      const merged = old ? previous : mergeMemoryForgetting(previous, { format_version: /* @version format.memory.forgetting */ 1, decisions: [next] });
      current(input);
      // A same-operation retry also confirms durability after an earlier rename/dirsync uncertainty.
      // No SDK effect is permitted until this write and its original owner check both return.
      try {
        atomicWriteFileSync(filePath(input.homeDirectory), serializeMemoryForgetting(merged), { mode: 0o600, durable: true });
        held = { value: frozen(merged), identity: snapshotFileStat(filePath(input.homeDirectory)) };
      } catch (error) {
        // A rename may have committed before its error. Every facade must immediately see
        // that barrier; inability to inspect it stops reads instead of returning stale facts.
        try { held = load(); }
        catch { unreadable = true; }
        throw error;
      }
      current(input); return old ?? next;
    },
  };
}
