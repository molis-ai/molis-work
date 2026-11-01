import { MolisWorkProjectCatalog, type MolisWorkProjectCatalogOptions } from "@molis-ai/molis-work-app-local-host";
import { createDesktopPanelTables } from "./adapters/sqlite-panels.js";

/** Open the one Host catalog with the current desktop platform adapters. */
export function openMolisWorkProjectCatalog(options: MolisWorkProjectCatalogOptions = {}): Promise<MolisWorkProjectCatalog> {
  return MolisWorkProjectCatalog.open(options, {
    createPanelSchema: createDesktopPanelTables,
  });
}
export async function withMolisWorkProjectCatalog<T>(options: MolisWorkProjectCatalogOptions, operation: (catalog: MolisWorkProjectCatalog) => T | Promise<T>): Promise<T> {
  const catalog = await openMolisWorkProjectCatalog(options);
  try { return await operation(catalog); } finally { catalog.close(); }
}
