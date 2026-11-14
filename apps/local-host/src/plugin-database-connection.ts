import { lstatSync, realpathSync } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeSqlitePath, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { assertArtifactLibraryReady } from "./artifact-row-storage-policy.js";

/** A Home library joined into project artifacts must start in WAL at the real path. */
export function prepareHomePluginDatabasePath(home: string, declaration: HomePluginDatabaseDeclaration,
  partition?: { readonly project_id: string }): string {
  if (!declaration.project_rows?.artifact_join) return home;
  const real = realpathSync(home);
  const path = homeSqlitePath(real, declaration.store_name, partition?.project_id);
  assertArtifactLibraryReady(path);
  const existing = lstatSync(path, { throwIfNoEntry: false });
  if (!existing || existing.size === 0) {
    // Establish the space in WAL before the fresh file receives any business schema.
    openHomeSqliteDatabase(real, declaration.store_name, partition?.project_id, db => {
      if (db.prepare("PRAGMA journal_mode=WAL").get()?.journal_mode !== "wal") throw new ActionError("actions.service_unavailable", "插件库初始化日志模式暂不可用");
      db.exec("PRAGMA synchronous=FULL");
    }).close();
  }
  return real;
}
