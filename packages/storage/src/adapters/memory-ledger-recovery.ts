import { lstatSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { MemoryRestoreIdentity, MemoryRestoreLedgerFacts, MemoryRestoreRetention, MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { homeSqlitePath } from "../home-sqlite.js";
import { inspectMemoryLedgerSnapshot, MEMORY_LEDGER_STORE } from "./memory-ledger.js";
import { createMemoryLedgerRetention } from "./memory-ledger-retention.js";
import { assertStorageOwner, type StorageOwner } from "./storage-owner.js";
import { HOME_RESTORE_JOURNAL } from "./home-restore-guard.js";

interface RecoveryOwner { readonly homeDirectory: string; readonly storageOwner: StorageOwner; assertCurrent(): void }
const invalid = () => Object.assign(new Error("记忆恢复的原决定或归属无法确认"), { code: "memory.conflict" });
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid(); return value as Record<string, unknown>; };
const text = (value: unknown): string => { if (typeof value !== "string" || !value.trim()) throw invalid(); return value; };
function identity(value: Record<string, unknown>, actor?: string): MemoryRestoreIdentity {
  if (!["personal", "project", "character"].includes(String(value.scope))) throw invalid();
  const scope = value.scope as MemoryScope, owner = text(value.owner);
  if (actor !== undefined && scope === "personal" && owner !== actor) throw invalid();
  return { scope, owner };
}
function current(input: RecoveryOwner): void {
  assertStorageOwner(join(input.homeDirectory, "agent-runtime"), input.storageOwner); input.assertCurrent();
}

/** Existing current schema only. Storage decodes body-free facts; Memory decides what they mean. */
export function readMemoryLedgerRestoreFacts(input: RecoveryOwner & { readonly candidatesFor?: MemoryRestoreRetention }): MemoryRestoreLedgerFacts {
  current(input);
  const result = inspectMemoryLedgerSnapshot(input.homeDirectory, db => {
    const forgotten: string[] = [], sources: MemoryRestoreLedgerFacts["sources"][number][] = [];
    const identities: MemoryRestoreLedgerFacts["identities"][number][] = [], candidates: MemoryRestoreLedgerFacts["candidates"][number][] = [];
    const markers = db.prepare("SELECT actor_id,key,at,body FROM memory_markers WHERE key LIKE 'memory-%'").all();
    for (const row of markers) {
      const key = String(row.key);
      if (!key.startsWith("memory-forgotten:") && !key.startsWith("memory-source-forgotten:")) continue;
      const body = object(JSON.parse(String(row.body)));
      if (key.startsWith("memory-forgotten:")) {
        const id = text(body.memory_id);
        if (row.actor_id !== "" || body.state !== "forgotten" || key !== `memory-forgotten:${id}`) throw invalid();
        forgotten.push(id);
        if (body.scope !== undefined || body.owner !== undefined) identities.push({ memory_id: id, ...identity(body) });
      } else {
        const parts: unknown = JSON.parse(key.slice("memory-source-forgotten:".length));
        if (!Array.isArray(parts) || parts.length !== 3) throw invalid();
        const actor_id = text(row.actor_id), where = identity({ scope: parts[0], owner: parts[1] }, actor_id), event_id = text(parts[2]);
        if (body.event_id !== event_id || key !== `memory-source-forgotten:${JSON.stringify([where.scope, where.owner, event_id])}`) throw invalid();
        sources.push({ ...where, actor_id, event_id, at: text(row.at) });
      }
    }
    const retain = (id: unknown, body: Record<string, unknown>, actor: string) => {
      if (typeof id === "string" && forgotten.includes(id)) identities.push({ memory_id: id, ...identity(body, actor) });
    };
    for (const row of forgotten.length ? markers : []) if (String(row.key).startsWith("memory-operation:")) {
      const body = object(JSON.parse(String(row.body))), actor = String(row.actor_id);
      retain(body.memory_id, body, actor);
      if (body.result) retain(object(body.result).memory_id, body, actor);
    }
    for (const row of forgotten.length ? db.prepare("SELECT actor_id,memory_id,body FROM memory_changes").all() : []) {
      if (!forgotten.includes(String(row.memory_id))) continue;
      const body = object(JSON.parse(String(row.body)));
      if (body.memory_id !== row.memory_id) throw invalid();
      retain(row.memory_id, body, String(row.actor_id));
    }
    const selectedMemories = new Set(input.candidatesFor?.memories.filter(item => item.selection_mode === "related").map(item => item.memory_id));
    const selectedCandidates = new Set(input.candidatesFor?.candidates.map(item => item.candidate_id));
    const selectedSources = new Set(input.candidatesFor?.sources.map(item => item.event_id));
    // Current facts need only witnesses for their actual terminal decisions. Incoming projections
    // are read only when they may relate to a retained decision; unrelated rows stay opaque.
    const needsCandidates = forgotten.length || selectedMemories.size || selectedCandidates.size || selectedSources.size;
    for (const row of needsCandidates ? db.prepare("SELECT candidate_id,actor_id,body FROM memory_candidates").all() : []) {
      const body = object(JSON.parse(String(row.body))), actor = String(row.actor_id);
      const witness = typeof body.memory_id === "string" && forgotten.includes(body.memory_id);
      const references = Array.isArray(body.source_refs) ? body.source_refs : [];
      const selected = selectedCandidates.has(String(row.candidate_id)) || selectedMemories.has(String(body.memory_id)) || selectedMemories.has(String(body.supersedes))
        || references.some(ref => ref && typeof ref === "object" && selectedSources.has(String(ref.event_id)));
      if (!witness && !selected) continue;
      const candidate_id = text(row.candidate_id);
      if (body.candidate_id !== candidate_id || body.actor_id !== actor) throw invalid();
      const where = identity(body, actor);
      if (selected) {
        if (body.source_refs !== undefined && !Array.isArray(body.source_refs)) throw invalid();
        const source_event_ids = references.map(ref => { const source = object(ref); text(source.version); return text(source.event_id); });
        candidates.push({ ...where, candidate_id, ...(body.memory_id ? { memory_id: text(body.memory_id) } : {}),
          ...(body.supersedes ? { supersedes: text(body.supersedes) } : {}), source_event_ids });
      }
      retain(body.memory_id, body, actor);
    }
    current(input); return { forgotten, identities, sources, candidates };
  }) ?? { forgotten: [], identities: [], sources: [], candidates: [] };
  current(input); return result;
}

/** The real offline owner may only merge terminal barriers and remove ledger copies, never initialize or migrate. */
export function retainMemoryLedgerAfterRestore(input: RecoveryOwner & {
  readonly retention: MemoryRestoreRetention; readonly candidateIds: readonly string[];
}): void {
  current(input);
  if (!lstatSync(join(input.homeDirectory, "agent-runtime", HOME_RESTORE_JOURNAL), { throwIfNoEntry: false })?.isFile()) throw invalid();
  const file = homeSqlitePath(input.homeDirectory, MEMORY_LEDGER_STORE), stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw invalid();
  // Validate through the owner's disposable read snapshot before opening the one existing writable database.
  if (inspectMemoryLedgerSnapshot(input.homeDirectory, () => true) !== true) throw invalid();
  current(input);
  const db = new DatabaseSync(file);
  let transaction = false;
  try {
    db.exec("BEGIN IMMEDIATE"); transaction = true;
    const retention = createMemoryLedgerRetention(db, work => work());
    for (const source of input.retention.sources) {
      current(input);
      db.prepare("INSERT OR IGNORE INTO memory_markers(actor_id,key,at,body) VALUES (?,?,?,?)")
        .run(source.actor_id, `memory-source-forgotten:${JSON.stringify([source.scope, source.owner, source.event_id])}`, source.at, JSON.stringify({ event_id: source.event_id }));
    }
    for (const memory of input.retention.memories) {
      current(input); retention.forget(memory.memory_id, memory.selection_mode);
      // An archive predating creation has no original operation witness. Preserve the already-validated owner with its terminal fact.
      db.prepare("UPDATE memory_markers SET body=? WHERE actor_id='' AND key=?")
        .run(JSON.stringify({ memory_id: memory.memory_id, state: "forgotten", scope: memory.scope, owner: memory.owner }), `memory-forgotten:${memory.memory_id}`);
    }
    for (const id of input.candidateIds) { current(input); db.prepare("DELETE FROM memory_candidates WHERE candidate_id=?").run(id); }
    current(input); db.exec("COMMIT"); transaction = false;
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    current(input);
  } finally { try { if (transaction) db.exec("ROLLBACK"); } finally { db.close(); } }
}
