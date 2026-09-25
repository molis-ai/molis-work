import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { LocalSqliteStorage, LocalCatalogMetadata } from "@molis-ai/molis-work-storage";
import { ProjectsRepository } from "@molis-ai/molis-work-module-projects";
import { PagesError, type PagesStore } from "@molis-ai/molis-work-plugin-pages";
import { assertOwnedCatalog } from "./catalog-migrations.js";
import { catalogSchemaCompatibilityError } from "./project-catalog-contract.js";
import type { MolisWorkProjectRuntime } from "./project-host.js";

/** Read the original catalog owner; never infer a project alias from caller arguments. */
export function migrateLegacyPagesProject(home: string, runtime: MolisWorkProjectRuntime, pages: PagesStore): void {
  if (runtime.board_id === runtime.project_id || !pages.hasProjectData(runtime.board_id)) return;
  const path = join(home, "projects", "catalog.db");
  const unresolved = () => new PagesError("pages.legacy_scope_unresolved", "旧文稿的项目归属尚未确认，原数据已保留，请修复项目关联");
  if (!existsSync(path)) throw unresolved();
  const storage = new LocalSqliteStorage(path, { readonly: true });
  try {
    assertOwnedCatalog(storage, path);
    const problem = catalogSchemaCompatibilityError(new LocalCatalogMetadata(storage.db).version());
    if (problem) throw problem;
    const projects = new ProjectsRepository(storage.db).listProjects();
    const owners = projects.filter(project => project.board_id === runtime.board_id || project.project_id === runtime.board_id);
    if (owners.length !== 1 || owners[0]!.project_id !== runtime.project_id || resolve(owners[0]!.database_path) !== resolve(runtime.store.path)) throw unresolved();
    pages.migrateProjectScope(runtime.board_id, runtime.project_id);
  } finally { storage.close(); }
}
