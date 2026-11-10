import { MolisWorkProjectCatalog, type MolisWorkProjectCatalogOptions } from "@molis-ai/molis-work-app-local-host";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";

export function inspectMolisWorkProjectCatalogSnapshot(database: SqliteDatabase): Readonly<Record<string, string | number>> {
  return MolisWorkProjectCatalog.inspectSnapshot(database);
}

/** Open the one Host catalog with the current desktop platform adapters. */
export function openMolisWorkProjectCatalog(options: MolisWorkProjectCatalogOptions = {}): Promise<MolisWorkProjectCatalog> {
  return MolisWorkProjectCatalog.open(options);
}
export async function withMolisWorkProjectCatalog<T>(options: MolisWorkProjectCatalogOptions, operation: (catalog: MolisWorkProjectCatalog) => T | Promise<T>): Promise<T> {
  const catalog = await openMolisWorkProjectCatalog(options);
  try { return await operation(catalog); } finally { catalog.close(); }
}
