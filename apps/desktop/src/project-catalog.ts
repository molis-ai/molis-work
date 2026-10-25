import { MolisWorkProjectCatalog, openProjectDeletionRecoveryTarget, type ProjectDeletionRecoveryTargetInput,
  type MolisWorkProjectCatalogOptions } from "@molis-ai/molis-work-app-local-host";
import { DesktopPanelService } from "./panels.js";
import { createDesktopPanelTables, SqliteDesktopPanelRepository } from "./adapters/sqlite-panels.js";

/** Open the one Host catalog with the current desktop platform adapters. */
export function openMolisWorkProjectCatalog(options: MolisWorkProjectCatalogOptions = {}): Promise<MolisWorkProjectCatalog> {
  return MolisWorkProjectCatalog.open(options, {
    createPanelSchema: createDesktopPanelTables,
    createPanels: (db, ports) => new DesktopPanelService({ ...ports, repository: new SqliteDesktopPanelRepository(db) }),
  });
}
export async function withMolisWorkProjectCatalog<T>(options: MolisWorkProjectCatalogOptions, operation: (catalog: MolisWorkProjectCatalog) => T | Promise<T>): Promise<T> {
  const catalog = await openMolisWorkProjectCatalog(options);
  try { return await operation(catalog); } finally { catalog.close(); }
}

/** Offline recovery uses the same panel owner without opening normal Catalog/Runtime services. */
export function openDesktopProjectDeletionRecoveryTarget(input: ProjectDeletionRecoveryTargetInput) {
  return openProjectDeletionRecoveryTarget(input, {
    createPanels: (db, ports) => new DesktopPanelService({ ...ports, repository: new SqliteDesktopPanelRepository(db) }),
  });
}
