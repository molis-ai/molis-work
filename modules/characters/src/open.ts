import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { applySqliteBaseline, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import { CharactersService } from "./service.js";
import { characterErrors } from "@molis-ai/molis-work-contracts/modules/characters";
import { CharactersRepository } from "./repository.js";
import { CharacterRunsRepository, type CharacterRuns } from "./runs.js";

/**
 * The one current schema of `characters/characters.sqlite`; any other version, or tables without one, is refused (repository-anti-corruption §4.1).
 * The current schema includes `character_runs`, the native runs Characters records itself (Sessions cleanup SC-2, D3).
 * Clean Homes start at 1; an existing file at another version is not upgraded on open.
 */
export const CHARACTERS_STORE_BASELINE: SqliteBaseline = { version: 1, schema: `CREATE TABLE character_drafts (
  character_id TEXT PRIMARY KEY,
  owner_actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  record TEXT NOT NULL
);
CREATE TABLE character_runs (
  run_id TEXT PRIMARY KEY,
  panel_id TEXT NOT NULL UNIQUE,
  owner_actor_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  artifact_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  task TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  runtime_id TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('starting', 'dispatched', 'failed')),
  status_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX character_runs_by_character ON character_runs (owner_actor_id, project_id, character_id, created_at);` };

/** The Characters store in the Home's store registry (W4-11): `characters/characters.sqlite`. */
export const CHARACTERS_HOME_STORE = { path: "characters", library: { baseline: CHARACTERS_STORE_BASELINE, file: "characters.sqlite" } } as const satisfies HomeStoreDeclaration;

function openStore(homeDirectory: string, actorId: string): DatabaseSync {
  if (!actorId.trim() || actorId.length > 200) throw characterErrors.invalid("角色库缺少有效所有者");
  const directory = join(homeDirectory, CHARACTERS_HOME_STORE.path);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, CHARACTERS_HOME_STORE.library.file), db = new DatabaseSync(filename);
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    applySqliteBaseline(db, filename, CHARACTERS_STORE_BASELINE);
    // Only a store this build opens is narrowed to its owner; a refused one is left exactly as it was found, mode included.
    chmodSync(filename, 0o600);
    return db;
  } catch (error) { db.close(); throw error; }
}

/** Installation-level personal drafts. No production credential store is opened. */
export function openCharacters(homeDirectory: string, actorId: string): { service: CharactersService; close(): void } {
  const db = openStore(homeDirectory, actorId);
  return { service: new CharactersService(new CharactersRepository(db, actorId), actorId), close: () => db.close() };
}

/** One person's native Character runs in one project, in the same store as the drafts. */
export function openCharacterRuns(homeDirectory: string, actorId: string, projectId: string): { runs: CharacterRuns; close(): void } {
  if (!projectId.trim()) throw characterErrors.invalid("角色执行记录缺少项目");
  const db = openStore(homeDirectory, actorId);
  return { runs: new CharacterRunsRepository(db, actorId, projectId), close: () => db.close() };
}
