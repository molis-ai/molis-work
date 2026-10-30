import { isDeepStrictEqual } from "node:util";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describeSqliteSchema, describeSqliteBaseline } from "@molis-ai/molis-work-storage";
import { GOALS_HOME_DATABASE } from "@molis-ai/molis-work-plugin-goals";

export function validatePlanningCatalog(db, personal) {
  if (db.prepare("SELECT value FROM catalog_meta WHERE key='owner'").get()?.value !== "molis-work-project-catalog-v1"
    || db.prepare("SELECT value FROM catalog_meta WHERE key='schema_version'").get()?.value !== "22") throw new Error("planning catalog owner/version mismatch");
  const scratch = new DatabaseSync(":memory:");
  try {
    scratch.exec(readFileSync(new URL("./catalog-before-w517.sql", import.meta.url), "utf8"));
    if (personal) scratch.exec(GOALS_HOME_DATABASE.schema);
    if (!isDeepStrictEqual(describeSqliteSchema(db), describeSqliteSchema(scratch))
      || db.prepare("SELECT 1 FROM sqlite_schema WHERE type NOT IN ('table','index')").get()) throw new Error("planning catalog structure mismatch");
  } finally { scratch.close(); }
  integrity(db);
}

export function validatePlanningHome(db) {
  if (db.prepare("PRAGMA user_version").get().user_version !== GOALS_HOME_DATABASE.version
    || !isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(GOALS_HOME_DATABASE))
    || db.prepare("SELECT 1 FROM sqlite_schema WHERE type NOT IN ('table','index')").get()) throw new Error("Goals Home version/structure mismatch");
  integrity(db);
}

function integrity(db) {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok" || db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("planning maintenance integrity check failed");
}
