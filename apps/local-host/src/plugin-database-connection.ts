import { lstatSync, realpathSync } from "node:fs";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { homeSqlitePath, openBaselineHomeSqlite, openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { assertArtifactLibraryReady } from "./artifact-row-storage-policy.js";

/** Opens the same declared library in the Host and in the bounded SQL worker. */
export function openHomePluginDatabaseConnection(home: string, declaration: HomePluginDatabaseDeclaration,
  partition?: { readonly project_id: string }): ReturnType<typeof openBaselineHomeSqlite> {
  if (!declaration.project_rows?.artifact_join) return openBaselineHomeSqlite(home, declaration.store_name, declaration, partition?.project_id);
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
  return openBaselineHomeSqlite(real, declaration.store_name, declaration, partition?.project_id);
}
