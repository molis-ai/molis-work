import { replicaSchemaSql } from "@molis-ai/molis-work-storage";
import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySqliteBaseline, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { CharactersService } from "./service.js";
import { characterErrors } from "./errors.js";
import { CharactersRepository } from "./repository.js";
import { bindDatabaseSpace, ensureStorageSpace, type AggregateReplicaContext } from "@molis-ai/molis-work-storage";
import { createCharactersReplica, installCharactersReplication } from "./replication.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

/** The one current schema of `characters/characters.sqlite`; any other version, or tables without one, is refused (repository-anti-corruption §4.1). */
export const CHARACTERS_STORE_BASELINE: SqliteBaseline = { version: 2, schema: (`CREATE TABLE character_drafts (
  character_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);`)+replicaSchemaSql('characters') };

/** The Characters store in the Home's store registry (W4-11): `characters/characters.sqlite`. */
export const CHARACTERS_HOME_STORE = { path: "characters", library: { baseline: CHARACTERS_STORE_BASELINE, file: "characters.sqlite" } } as const satisfies HomeStoreDeclaration;

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
  if (!actorId.trim() || actorId.length > 200) throw characterErrors.invalid("角色库缺少有效所有者");
  const directory = join(homeDirectory, CHARACTERS_HOME_STORE.path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, CHARACTERS_HOME_STORE.library.file), db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    applySqliteBaseline(db, filename, CHARACTERS_STORE_BASELINE);
    const space = ensureStorageSpace(homeDirectory);
    bindDatabaseSpace(db, space);
    if (space.kind === "personal") installCharactersReplication(db);
    chmodSync(filename, 0o600);
    return db;
  } catch (error) { db.close(); throw error; }
}
