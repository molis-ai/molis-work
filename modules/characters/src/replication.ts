import { syncError } from './sync-errors.js';
import type { DatabaseSync } from "node:sqlite";
import type { CharacterDraft } from "@molis-ai/molis-work-contracts/modules/characters";
import { parseCharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import type { SyncReplicaAdapter } from "@molis-ai/molis-work-contracts/platform/sync-transport";
import {
  createSqliteReplica,
  initializeReplica,
  namespacedReplicaDatabase,
  readDatabaseSpace,
  replicaMarkSql,
  replicaTransaction,
  queueReplicaChange,
} from "@molis-ai/molis-work-storage";

function invalid(): never { throw syncError("invalid", "角色草稿同步数据不合法"); }
function limit(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > 512 * 1024) throw syncError("limit", "角色草稿超过当前同步上限（512 KiB）");
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exactOptional(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): void {
  if (required.some(key => !Object.hasOwn(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key))) invalid();
}
function parseDraft(value: unknown, id: string, actorId: string): CharacterDraft {
  const x = object(value);
  exactOptional(x, ["character_id", "owner_actor_id", "revision", "state", "title", "instructions", "host_tools", "created_at", "updated_at"], ["action_tools", "import_snapshot"]);
  if (x.character_id !== id || x.owner_actor_id !== actorId
    || !Number.isSafeInteger(x.revision) || Number(x.revision) < 1
    || !["active", "disabled", "tombstoned"].includes(String(x.state))
    || typeof x.created_at !== "string" || !Number.isFinite(Date.parse(x.created_at))
    || typeof x.updated_at !== "string" || !Number.isFinite(Date.parse(x.updated_at))) invalid();
  let parsed: ReturnType<typeof parseCharacterContent>;
  try {
    parsed = parseCharacterContent({ ...x, instructions: typeof x.instructions === "string" && !x.instructions.trim() ? "草稿" : x.instructions,
      source: { owner_actor_id: actorId, draft_revision: x.revision } });
  } catch { invalid(); }
  return {
    character_id: id,
    owner_actor_id: actorId,
    revision: x.revision as number,
    state: x.state as CharacterDraft["state"],
    title: parsed.title,
    instructions: x.instructions as string,
    host_tools: parsed.host_tools,
    created_at: x.created_at as string,
    updated_at: x.updated_at as string,
    ...(parsed.action_tools === undefined ? {} : { action_tools: parsed.action_tools }),
    ...(parsed.import_snapshot === undefined ? {} : { import_snapshot: parsed.import_snapshot }),
  };
}

/** Journal shares the business transaction and never exports a private database file. */
export function installCharactersReplication(db: DatabaseSync): void {
  const ledger = namespacedReplicaDatabase(db, "characters");
  replicaTransaction(db, () => {
    initializeReplica(ledger);
    if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='trigger' AND name='characters_sync_insert'").get()) return;
    for(const row of db.prepare('SELECT owner_actor_id,character_id FROM character_drafts ORDER BY character_id').all())queueReplicaChange(ledger,JSON.stringify([row.owner_actor_id,'character',row.character_id]));
    for (const [event, row] of [["INSERT", "NEW"], ["UPDATE", "NEW"], ["DELETE", "OLD"]]) {
      const mark = replicaMarkSql(`json_array(${row}.owner_actor_id,'character',${row}.character_id)`)
        .replace(/\breplica_/gu, "characters_replica_");
      db.exec(`CREATE TRIGGER characters_sync_${event.toLowerCase()} AFTER ${event} ON character_drafts BEGIN ${mark} END`);
    }
  });
}

export function createCharactersReplica(db: DatabaseSync, actorId: string, context: {
  spaceId: string; authorize(): void;
}): SyncReplicaAdapter {
  const binding = readDatabaseSpace(db);
  if (binding?.kind !== "personal" || binding.spaceId !== context.spaceId) throw syncError("scope", "角色草稿不属于当前个人空间");
  const idFromKey = (key: string): string => {
    let parts: unknown;
    try { parts = JSON.parse(key); } catch { invalid(); }
    if (!Array.isArray(parts) || parts.length !== 3 || parts[0] !== actorId
      || parts[1] !== "character" || typeof parts[2] !== "string" || !parts[2] || parts[2].length > 200) invalid();
    return parts[2];
  };
  return createSqliteReplica(namespacedReplicaDatabase(db, "characters"), {
    authorize: context.authorize,
    canUpload: key => {
      try { idFromKey(key); return true; } catch { return false; }
    },
    read(key) {
      const id = idFromKey(key);
      const row = db.prepare("SELECT owner_actor_id,record FROM character_drafts WHERE character_id=?").get(id) as {
        owner_actor_id: string; record: string;
      } | undefined;
      if (!row) return null;
      if (row.owner_actor_id !== actorId) throw syncError("scope", "角色标识已属于另一位用户");
      const record = parseDraft(JSON.parse(row.record), id, actorId);
      const value = { format: 1, spaceId: context.spaceId, record };
      limit(value);
      return value;
    },
    apply(key, value) {
      const id = idFromKey(key);
      const current = db.prepare("SELECT owner_actor_id,revision,updated_at FROM character_drafts WHERE character_id=?").get(id) as {
        owner_actor_id: string; revision: number; updated_at: string;
      } | undefined;
      if (current && current.owner_actor_id !== actorId) throw syncError("scope", "角色标识已属于另一位用户");
      if (value === null) {
        db.prepare("DELETE FROM character_drafts WHERE character_id=? AND owner_actor_id=?").run(id, actorId);
        return;
      }
      limit(value);
      const wire = object(value);
      exactOptional(wire, ["format", "spaceId", "record"]);
      if (wire.format !== 1 || wire.spaceId !== context.spaceId) invalid();
      const record = parseDraft(wire.record, id, actorId);
      const revision = Math.max(record.revision, (current?.revision ?? 0) + 1);
      const updated = new Date(Math.max(Date.now(), Date.parse(record.updated_at), current ? Date.parse(current.updated_at) + 1 : 0)).toISOString();
      const target = { ...record, revision, updated_at: updated };
      db.prepare(`INSERT INTO character_drafts(character_id,owner_actor_id,revision,updated_at,record) VALUES (?,?,?,?,?)
        ON CONFLICT(character_id) DO UPDATE SET revision=excluded.revision,updated_at=excluded.updated_at,record=excluded.record`)
        .run(id, actorId, revision, updated, JSON.stringify(target));
      context.authorize();
    },
  });
}
