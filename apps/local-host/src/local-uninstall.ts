import { promises as fs } from "node:fs";
import path from "node:path";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { MolisWorkUninstallService } from "./installer/uninstall.js";
import type { MolisWorkUninstallServiceOptions, UninstallProjectAccess } from "./installer/uninstall-contract.js";
import { inspectProjectCatalogForUninstall } from "@molis-ai/molis-work-module-projects";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { resolveConfiguredHome } from "./product-home.js";

/** Read-only Catalog inspection and the existing Demo lifecycle for local uninstall. */
export function createLocalUninstallService(options: Omit<MolisWorkUninstallServiceOptions, "projects">, withMolisWorkProjectCatalog: LocalWebCatalogRunner): MolisWorkUninstallService {
  const homeDirectory = path.resolve(options.homeDirectory ?? resolveConfiguredHome());
  const projects: UninstallProjectAccess = {
    async inspect() {
      const databasePath = path.join(homeDirectory, "projects", "catalog.db");
      try { await fs.stat(databasePath); } catch { return { projects: [], conflict: null }; }
      let storage: LocalSqliteStorage | null = null;
      try {
        storage = new LocalSqliteStorage(databasePath, { readonly: true });
        const inspection = inspectProjectCatalogForUninstall(storage.db);
        return { projects: inspection.projects, conflict: inspection.owned ? null : `项目 catalog 不属于 Molis Work：${databasePath}` };
      } catch (error) {
        return { projects: [], conflict: `无法安全读取项目 catalog：${error instanceof Error ? error.message : String(error)}` };
      } finally { storage?.close(); }
    },
    async removeDemos(input) {
      await withMolisWorkProjectCatalog({ homeDirectory }, async catalog => {
        for (const projectId of input.project_ids) await catalog.removeDemoProject({
          project_id: projectId, actor_id: "molis-work-uninstaller", delete_confirmed: true,
          idempotency_key: `${input.plan_id}:${projectId}`,
        });
      });
    },
  };
  return new MolisWorkUninstallService({ ...options, homeDirectory, projects });
}
