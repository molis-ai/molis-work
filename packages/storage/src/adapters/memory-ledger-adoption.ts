import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { isCompleteMemoryPrefs, type MemoryPrefs, type MemoryScope } from "@molis-ai/molis-work-contracts/services/memory";
import { homeSqlitePath, openReadOnlyHomeSqlite } from "../home-sqlite.js";
import { describeSqliteBaseline, describeSqliteSchema, SqliteSchemaVersionError } from "../sqlite-baseline.js";
import { MEMORY_LEDGER_BASELINE, MEMORY_LEDGER_STORE } from "./memory-ledger.js";

export interface MemoryLedgerAdoptionProfile { readonly actor_id: string; readonly key: string; readonly prefs: MemoryPrefs }
export interface MemoryLedgerAdoptionSnapshot {
  readonly version: 3 | 4;
  readonly profiles: readonly { readonly actor_id: string; readonly key: string; readonly prefs: unknown }[];
  readonly adoptions: readonly { readonly actor_id: string; readonly at: string; readonly body: unknown }[];
  readonly owners: readonly { readonly scope: MemoryScope; readonly owner: string; readonly project_id: string | null }[];
}

function conflict(message: string): never {
  throw Object.assign(new Error(message), { code: "memory.adoption_conflict" });
}

export function assertMemoryLedgerAdoptionSchema(db: DatabaseSync, path: string): 3 | 4 {
  const found = Number(db.prepare("PRAGMA user_version").get()!.user_version);
  if (found !== 3 && found !== 4) throw new SqliteSchemaVersionError(path, found, MEMORY_LEDGER_BASELINE.version);
  if (!isDeepStrictEqual(describeSqliteSchema(db), describeSqliteBaseline(MEMORY_LEDGER_BASELINE))) {
    conflict("记忆账本结构不符合可采用的旧格式");
  }
  return found;
}

function snapshot(db: DatabaseSync, path: string): MemoryLedgerAdoptionSnapshot {
  const version = assertMemoryLedgerAdoptionSchema(db, path);
  return {
    version,
    profiles: db.prepare("SELECT actor_id, key, body FROM memory_prefs ORDER BY actor_id, key").all()
      .map(row => ({ actor_id: String(row.actor_id), key: String(row.key), prefs: JSON.parse(String(row.body)) as unknown })),
    adoptions: db.prepare("SELECT actor_id, at, body FROM memory_markers WHERE key='strategy-adoption' ORDER BY actor_id").all()
      .map(row => ({ actor_id: String(row.actor_id), at: String(row.at), body: JSON.parse(String(row.body)) as unknown })),
    owners: db.prepare("SELECT scope, owner, project_id FROM memory_owners ORDER BY scope, owner").all()
      .map(row => ({ scope: String(row.scope) as MemoryScope, owner: String(row.owner), project_id: row.project_id === null ? null : String(row.project_id) })),
  };
}

/** Inspection does not create a missing Home or database and does not alter any record. */
export function inspectMemoryLedgerAdoption(input: { homeDirectory: string }): MemoryLedgerAdoptionSnapshot {
  const db = openReadOnlyHomeSqlite(input.homeDirectory, MEMORY_LEDGER_STORE);
  try {
    db.exec("BEGIN");
    return snapshot(db, homeSqlitePath(input.homeDirectory, MEMORY_LEDGER_STORE));
  } finally { db.close(); }
}

export function changeMemoryLedgerAdoption<T>(input: { homeDirectory: string; snapshot: MemoryLedgerAdoptionSnapshot }, work: (db: DatabaseSync) => T, assertCurrent?: () => void): T {
  // Opening read-only first prevents this explicit maintenance command from creating an absent store.
  const path = homeSqlitePath(input.homeDirectory, MEMORY_LEDGER_STORE);
  const existing = openReadOnlyHomeSqlite(input.homeDirectory, MEMORY_LEDGER_STORE);
  existing.close();
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
    try {
      if (!isDeepStrictEqual(snapshot(db, path), input.snapshot)) conflict("记忆设置或采用记录已改变，请重新检查副本");
      const check = () => {
        const checked: unknown = assertCurrent?.();
        if (checked !== undefined) {
          if (checked !== null && (typeof checked === "object" || typeof checked === "function") && "then" in checked)
            void Promise.resolve(checked).catch(() => undefined);
          conflict("维护事务的当前权限必须同步确认");
        }
      };
      check();
      const result = work(db);
      check();
      db.exec("COMMIT");
      return result;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  } finally { db.close(); }
}

function adoptionBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) conflict("记忆采用记录不完整");
  return value as Record<string, unknown>;
}

function originalOrigin(body: Record<string, unknown>): "new-home" | "existing-home" {
  const origin = body.origin === "adopting" ? body.original_origin : body.origin;
  if (origin !== "new-home" && origin !== "existing-home") conflict("记忆采用记录没有合法的原始来源");
  return origin;
}

/** Blocks normal startup before SDK conversion; a failed conversion intentionally leaves this state in place. */
export function beginMemoryLedgerAdoption(input: { homeDirectory: string; snapshot: MemoryLedgerAdoptionSnapshot; assertCurrent?: () => void }): MemoryLedgerAdoptionSnapshot {
  return changeMemoryLedgerAdoption(input, db => {
    if (!input.snapshot.adoptions.length) conflict("旧记忆账本没有采用记录");
    for (const marker of input.snapshot.adoptions) {
      const body = adoptionBody(marker.body);
      db.prepare("UPDATE memory_markers SET body=? WHERE actor_id=? AND key='strategy-adoption'")
        .run(JSON.stringify({ ...body, origin: "adopting", original_origin: originalOrigin(body) }), marker.actor_id);
    }
    return snapshot(db, homeSqlitePath(input.homeDirectory, MEMORY_LEDGER_STORE));
  }, input.assertCurrent);
}

/** The Host validates/maps full profiles; this owner atomically checks the old snapshot and publishes ledger 4. */
export function completeMemoryLedgerAdoption(input: { homeDirectory: string; snapshot: MemoryLedgerAdoptionSnapshot; profiles: readonly MemoryLedgerAdoptionProfile[]; assertCurrent?: () => void }): void {
  changeMemoryLedgerAdoption(input, db => {
    for (const row of db.prepare("SELECT body FROM memory_markers WHERE key LIKE 'memory-operation:%:adoption-cleanup'").all()) {
      const mark = adoptionBody(JSON.parse(String(row.body)));
      if (mark.kind !== "adoption-cleanup" || mark.phase !== "committed") conflict("仍有未完成的确认清理，不能完成记忆采用");
    }
    const keys = (rows: readonly { actor_id: string; key: string }[]) => rows.map(row => JSON.stringify([row.actor_id, row.key])).sort();
    if (input.profiles.some(profile => !isCompleteMemoryPrefs(profile.prefs))) conflict("采用结果必须是完整的九字段设置");
    if (!isDeepStrictEqual(keys(input.profiles), keys(input.snapshot.profiles))) conflict("采用结果必须保留全部原设置身份");
    if (!input.snapshot.adoptions.length) conflict("记忆采用尚未开始");
    for (const marker of input.snapshot.adoptions) {
      const body = adoptionBody(marker.body);
      if (body.origin !== "adopting") conflict("SDK 转换前必须先阻断旧记忆启动");
      const { original_origin: _original, ...rest } = body;
      db.prepare("UPDATE memory_markers SET body=? WHERE actor_id=? AND key='strategy-adoption'")
        .run(JSON.stringify({ ...rest, origin: originalOrigin(body) }), marker.actor_id);
    }
    for (const profile of input.profiles) db.prepare("UPDATE memory_prefs SET body=? WHERE actor_id=? AND key=?")
      .run(JSON.stringify(profile.prefs), profile.actor_id, profile.key);
    db.exec("PRAGMA user_version=4");
  }, input.assertCurrent);
}
