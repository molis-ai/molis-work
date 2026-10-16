import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CharacterError, CharactersService } from "./service.js";
import { CharactersRepository } from "./repository.js";
import { bindDatabaseSpace, ensureStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import { createCharactersReplica, installCharactersReplication } from "./replication.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/** Installation-level personal drafts. No production credential store is opened. */
export function openCharacters(homeDirectory: string, actorId: string): { service: CharactersService; close(): void } {
  const db = openDatabase(homeDirectory, actorId);
  return { service: new CharactersService(new CharactersRepository(db, actorId), actorId), close: () => db.close() };
}

/** Trusted sync composition; ordinary Character actions do not get this adapter. */
export function createCharactersReplicationBinding(homeDirectory: string, userId: string) {
  const space = ensureStorageSpace(homeDirectory);
  if (space.kind !== "personal" || space.ownerUserId !== userId) {
    throw new Error("SYNC_PERSONAL_SPACE_REQUIRED");
  }
  const actorId = LOCAL_PERSON_ACTOR_ID;
  const db = openDatabase(homeDirectory, actorId);
  return {
    replica(context: AggregateReplicaContext) { return createCharactersReplica(db, actorId, context); },
    close() { db.close(); },
  };
}

function openDatabase(homeDirectory: string, actorId: string): DatabaseSync {
  if (!actorId.trim() || actorId.length > 200) throw new CharacterError("character.invalid", "角色库缺少有效所有者");
  const directory = join(homeDirectory, "characters");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, "characters.sqlite"), db = new DatabaseSync(filename);
  try {
    chmodSync(filename, 0o600);
    db.exec("PRAGMA busy_timeout = 3000");
    const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    if (version > 1) throw new CharacterError("character.invalid", "角色库由更新版本创建，请使用更新的应用");
    db.exec(`CREATE TABLE IF NOT EXISTS character_drafts (
      character_id TEXT PRIMARY KEY,
      owner_actor_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      record TEXT NOT NULL
    ); PRAGMA user_version = 1;`);
    const space = ensureStorageSpace(homeDirectory);
    bindDatabaseSpace(db, space);
    if (space.kind === "personal") installCharactersReplication(db);
    return db;
  } catch (error) { db.close(); throw error; }
}
