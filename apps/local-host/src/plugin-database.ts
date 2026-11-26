import { lstatSync, realpathSync } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeSqlitePath, openBaselineHomeSqlite, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { assertSqliteLibraryReady } from "@molis-ai/molis-work-storage";

/** A Home library joined into project artifacts must start in WAL at the real path. */
function prepareHomePluginDatabasePath(home: string, declaration: HomePluginDatabaseDeclaration): string {
  if (!declaration.project_rows?.artifact_join) return home;
  const real = realpathSync(home);
  const path = homeSqlitePath(real, declaration.store_name);
  assertSqliteLibraryReady(path);
  const existing = lstatSync(path, { throwIfNoEntry: false });
  if (!existing || existing.size === 0) {
    // Establish the space in WAL before the fresh file receives any business schema.
    openHomeSqliteDatabase(real, declaration.store_name, db => {
      if (db.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode !== "wal") throw new ActionError("actions.service_unavailable", "插件库初始化日志模式暂不可用");
      db.exec("PRAGMA synchronous=FULL");
    }).close();
  }
  return real;
}

/** The single typed declaration bridge used by the authorized Host client and the bounded SQL worker. */
function openPluginDatabaseConnection(home: string, declaration: PluginDatabaseDeclaration): ReturnType<typeof openBaselineHomeSqlite> {
  return openBaselineHomeSqlite(home, declaration.store_name, declaration);
}

export function openHomePluginDatabaseConnection(home: string, declaration: HomePluginDatabaseDeclaration): ReturnType<typeof openBaselineHomeSqlite> {
  return openPluginDatabaseConnection(prepareHomePluginDatabasePath(home, declaration), declaration);
}
