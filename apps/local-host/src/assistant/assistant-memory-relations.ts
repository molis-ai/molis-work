import { existsSync } from "node:fs";
import { homeSqlitePath, openReadOnlyHomeSqlite, describeSqliteSchema, describeSqliteBaseline, SqliteSchemaVersionError } from "@molis-ai/molis-work-storage";
import { isDeepStrictEqual } from "node:util";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { ASSISTANT_STORE_BASELINE, ASSISTANT_STORE_NAME } from "./assistant-store.js";

const invalid = () => Object.assign(new Error("助理保留的角色归属无法确认"), { code: "memory.conflict" });
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Same persisted Work supplies both facts, including archived Works. A Round has no original project; never join it to today's Work. */
export function assistantMemoryRelations(home: string): Array<{ project_id: string; subject: string }> {
  const filename = homeSqlitePath(home, ASSISTANT_STORE_NAME);
  if (!existsSync(filename)) return [];
  const db = openReadOnlyHomeSqlite(home, ASSISTANT_STORE_NAME);
  try {
    const version = Number(db.prepare("PRAGMA user_version").get()!.user_version);
    if (version !== ASSISTANT_STORE_BASELINE.version) throw new SqliteSchemaVersionError(filename, version, ASSISTANT_STORE_BASELINE.version);
    if (!isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(ASSISTANT_STORE_BASELINE))) throw invalid();
    return db.prepare(`SELECT work_id, actor_id, json_extract(body,'$.work_id') AS body_id, json_extract(body,'$.actor_id') AS body_actor,
      json_extract(body,'$.scope.kind') AS scope, json_extract(body,'$.scope.project_id') AS scope_project,
      json_extract(body,'$.project_ref.project_id') AS project_id, json_extract(body,'$.character.artifact_id') AS subject,
      json_extract(body,'$.character.version') AS version, json_type(body,'$.character') AS character_type
      FROM assistant_works WHERE json_type(body,'$.character') IS NOT NULL`).all().map(row => {
        if (!text(row.work_id) || row.body_id !== row.work_id || row.body_actor !== row.actor_id || row.actor_id !== LOCAL_PERSON_ACTOR_ID
          || row.character_type !== "object" || row.scope !== "project" || !text(row.project_id) || row.scope_project !== row.project_id
          || !text(row.subject) || !Number.isSafeInteger(row.version) || Number(row.version) < 1) throw invalid();
        return { project_id: row.project_id, subject: row.subject };
      });
  } finally { db.close(); }
}
