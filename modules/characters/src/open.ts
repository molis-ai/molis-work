import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySqliteBaseline, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { CharactersService } from "./service.js";
import { characterErrors } from "./errors.js";
import { CharactersRepository } from "./repository.js";

/** The one current schema of `characters/characters.sqlite`; any other version, or tables without one, is refused (repository-anti-corruption §4.1). */
export const CHARACTERS_STORE_BASELINE: SqliteBaseline = { version: 1, schema: `CREATE TABLE character_drafts (
  character_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);` };

/** Installation-level personal drafts. No production credential store is opened. */
export function openCharacters(homeDirectory: string, actorId: string): { service: CharactersService; close(): void } {
  if (!actorId.trim() || actorId.length > 200) throw characterErrors.invalid("角色库缺少有效所有者");
  const directory = join(homeDirectory, "characters");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, "characters.sqlite"), db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    applySqliteBaseline(db, filename, CHARACTERS_STORE_BASELINE);
    // Only a store this build opens is narrowed to its owner; a refused one is left exactly as it was found, mode included.
    chmodSync(filename, 0o600);
    return { service: new CharactersService(new CharactersRepository(db, actorId), actorId), close: () => db.close() };
  } catch (error) { db.close(); throw error; }
}
