import { existsSync } from "node:fs";
import { bindActionHandler, defineErrorCodes, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  PLUGIN_DATA_EXPORT_FORMAT, PLUGIN_DATA_EXPORT_VERSION, PLUGIN_DATA_PROVIDER_ID, pluginDataActions, pluginDataSectionsFromManifest,
  type PluginDataExportResult, type PluginDataSectionDeclaration, type PluginDataSectionSnapshot,
  type PluginDatabaseDeclaration, type PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginRuntimeRepository, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteBaseline, homeSqlitePath, openReadOnlyHomeSqlite, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { installedPluginManifest } from "./plugin-installation-directory.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { LocalProjectDatabase } from "./project-database.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";

const exportErrors = defineErrorCodes("host", {
  plugin_data_not_found: "not_found",
  plugin_data_project_required: "invalid",
});

const MAX_EXPORT_ROWS_PER_TABLE = 5000;

export interface PluginDataExportPorts {
  readonly homeDirectory: string;
  resolveProject(projectId: string): Promise<LocalHostProjectReference | null>;
}

function collectManifests(homeDirectory: string, projectDb?: SqliteDatabase): Map<string, PluginManifest> {
  const found = new Map<string, PluginManifest>();
  for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) found.set(entry.manifest.plugin_id, entry.manifest);
  const packages = new SandboxPackageStore(homeDirectory);
  const readRepo = (db: PluginRuntimeDatabase) => {
    for (const row of new SqlitePluginRuntimeRepository(db).list()) {
      if (row.state === "uninstalled") continue;
      const loaded = installedPluginManifest(db, row.install_id);
      if (loaded) { found.set(loaded.manifest.plugin_id, loaded.manifest); continue; }
      if (row.publisher_trust === "pinned") {
        try {
          const manifest = packages.load(row.plugin_id, row.publisher_signature, row.version).packaged?.manifest;
          if (manifest) found.set(manifest.plugin_id, manifest);
        } catch { /* missing or unreadable package is skipped during discovery */ }
      }
    }
  };
  const homeStore = openReadOnlyHomePluginStore(homeDirectory);
  if (homeStore) { try { readRepo(homeStore); } finally { homeStore.close(); } }
  if (projectDb) readRepo(projectDb);
  return found;
}

function allowedTables(declaration: PluginDatabaseDeclaration): string[] {
  return Object.keys(describeSqliteBaseline(declaration).tables)
    .filter(name => name !== "molis_storage_space" && !name.includes("replica_") && name !== "aggregate_editor_versions");
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

type ReadableSqlite = { prepare(sql: string): { get(...params: readonly unknown[]): unknown; all(...params: readonly unknown[]): unknown[] } };

function readTableItems(db: ReadableSqlite, tables: readonly string[], projectId?: string): Array<{ table: string; rows: Record<string, unknown>[] }> {
  const items: Array<{ table: string; rows: Record<string, unknown>[] }> = [];
  for (const table of tables) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>;
    const hasProjectCol = projectId !== undefined && cols.some(col => col.name === "project_id");
    const rows = (hasProjectCol
      ? db.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE project_id = ? LIMIT ?`).all(projectId, MAX_EXPORT_ROWS_PER_TABLE)
      : db.prepare(`SELECT * FROM ${quoteIdent(table)} LIMIT ?`).all(MAX_EXPORT_ROWS_PER_TABLE)) as Record<string, unknown>[];
    items.push({ table, rows: rows.map(row => normalizeRow(row)) });
  }
  return items;
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Uint8Array ? Buffer.from(value).toString("base64") : typeof value === "bigint" ? Number(value) : value;
  }
  return out;
}

function readSectionSnapshot(
  homeDirectory: string,
  manifest: PluginManifest,
  section: PluginDataSectionDeclaration,
  projectId: string | null,
  projectDb?: SqliteDatabase,
): PluginDataSectionSnapshot {
  const dbDecl = section.scope === "home" ? manifest.databases?.home : manifest.databases?.project;
  if (!dbDecl) return { plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title, items: [] };
  const permitted = new Set(allowedTables(dbDecl));
  const tables = (section.tables.length > 0 ? section.tables : [...permitted]).filter(table => permitted.has(table));
  if (section.scope === "project") {
    if (!projectDb || !projectId) throw exportErrors.plugin_data_project_required("导出项目级插件数据需要指定 project_id");
    return { plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title, items: readTableItems(projectDb, tables, projectId) };
  }
  const partitioned = manifest.databases?.home?.partition === "project";
  if (partitioned && !projectId) throw exportErrors.plugin_data_project_required("导出按项目分区的插件数据需要指定 project_id");
  const file = homeSqlitePath(homeDirectory, dbDecl.store_name, partitioned ? projectId! : undefined);
  if (!existsSync(file)) return { plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title, items: [] };
  const db = openReadOnlyHomeSqlite(homeDirectory, dbDecl.store_name, partitioned ? projectId! : undefined);
  try {
    return { plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title, items: readTableItems(db, tables, partitioned ? undefined : projectId ?? undefined) };
  } finally { db.close(); }
}

/** Export a plugin's declared business data sections read-only (works identically for built-in and installed plugins). */
export async function exportPluginData(ports: PluginDataExportPorts, input: { plugin_id: string; project_id?: string }): Promise<PluginDataExportResult> {
  const projectRef = input.project_id ? await ports.resolveProject(input.project_id) : null;
  if (input.project_id && !projectRef) throw exportErrors.plugin_data_not_found("项目不存在");
  const projectStore = projectRef ? new LocalProjectDatabase(projectRef.storage_key, { existingOnly: true }) : undefined;
  try {
    const manifest = collectManifests(ports.homeDirectory, projectStore?.db).get(input.plugin_id);
    if (!manifest) throw exportErrors.plugin_data_not_found(`找不到插件 ${input.plugin_id}`);
    const declared = pluginDataSectionsFromManifest(manifest);
    if (declared.length > 0 && !projectStore && declared.every(section => section.scope === "project")) {
      throw exportErrors.plugin_data_project_required("导出项目级插件数据需要指定 project_id");
    }
    const sections = declared
      .filter(section => section.scope === "home" || projectStore !== undefined)
      .map(section => readSectionSnapshot(ports.homeDirectory, manifest, section, projectRef?.project_id ?? null, projectStore?.db));
    return { format: PLUGIN_DATA_EXPORT_FORMAT, version: PLUGIN_DATA_EXPORT_VERSION, plugin_id: manifest.plugin_id, project_id: projectRef?.project_id ?? null, exported_at: new Date().toISOString(), sections };
  } finally { projectStore?.close(); }
}

export function pluginDataActionProvider(ports: PluginDataExportPorts): ActionProviderRegistration {
  return {
    provider: { provider_id: PLUGIN_DATA_PROVIDER_ID, title: "插件数据分段与导出", kind: "system" },
    definitions: [pluginDataActions.sections, pluginDataActions.export],
    handlers: [
      bindActionHandler(pluginDataActions.sections, async (input, caller) => {
        const projectId = input.project_id ?? caller.project_id;
        const projectRef = projectId ? await ports.resolveProject(projectId) : null;
        const projectStore = projectRef ? new LocalProjectDatabase(projectRef.storage_key, { existingOnly: true }) : undefined;
        try {
          const manifests = collectManifests(ports.homeDirectory, projectStore?.db);
          const selected = input.plugin_id ? (manifests.has(input.plugin_id) ? [manifests.get(input.plugin_id)!] : []) : [...manifests.values()];
          return {
            sections: selected.flatMap(manifest => pluginDataSectionsFromManifest(manifest).map(section => {
              if (section.tables.length > 0) return section;
              const dbDecl = section.scope === "home" ? manifest.databases?.home : manifest.databases?.project;
              return dbDecl ? { ...section, tables: allowedTables(dbDecl) } : section;
            })),
          };
        } finally { projectStore?.close(); }
      }),
      bindActionHandler(pluginDataActions.export, async (input, caller) => {
        const projectId = input.project_id ?? caller.project_id ?? undefined;
        return exportPluginData(ports, { plugin_id: input.plugin_id, ...(projectId ? { project_id: projectId } : {}) });
      }),
    ],
  };
}
