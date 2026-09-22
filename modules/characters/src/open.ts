import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CharacterError, CharactersService } from "./service.js";
import { CharactersRepository } from "./repository.js";

/** Installation-level personal drafts. No production credential store is opened. */
export function openCharacters(homeDirectory: string, actorId: string): { service: CharactersService; close(): void } {
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
    return { service: new CharactersService(new CharactersRepository(db, actorId), actorId), close: () => db.close() };
  } catch (error) { db.close(); throw error; }
}
