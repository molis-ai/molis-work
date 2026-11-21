import { existsSync } from "node:fs";
import { ActionError, bindActionHandler, defineErrorCodes, requireSynchronous, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  PLUGIN_DATA_EXPORT_FORMAT, PLUGIN_DATA_EXPORT_VERSION, PLUGIN_DATA_PROVIDER_ID, pluginDataActions, pluginDataSectionsFromManifest,
  type PluginDataExportResult, type PluginDataFileSnapshot, type PluginDataSectionDeclaration, type PluginDataSectionSnapshot,
  type PluginDatabaseDeclaration, type PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginRuntimeRepository, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteBaseline, homeSqlitePath, openReadOnlyHomeSqlite, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { installedPluginManifest } from "./plugin-installation-directory.js";
import { openPluginOwnerFiles } from "./plugin-owner-files.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { sandboxOwnerFilesBase } from "./plugin-sandbox-owner-files.js";
import { LocalProjectDatabase } from "./project-database.js";
import { SandboxPackageStore } from "./sandbox-package-store.js";

const exportErrors = defineErrorCodes("host", {
  plugin_data_not_found: "not_found",
  plugin_data_project_required: "invalid",
});

const MAX_EXPORT_ROWS_PER_TABLE = 5000;
const MAX_EXPORT_FILES = 500;
const MAX_EXPORT_FILE_BYTES = 256 * 1024;
const MAX_EXPORT_TOTAL_FILE_BYTES = 2 * 1024 * 1024;

export interface PluginDataExportPorts {
  readonly homeDirectory: string;
  resolveProject(projectId: string): Promise<LocalHostProjectReference | null>;
}

interface DiscoveredPluginData {
  readonly manifest: PluginManifest;
  sandboxHomeInstallId?: string;
  sandboxProjectInstallId?: string;
}

function collectManifests(homeDirectory: string, projectDb?: SqliteDatabase): Map<string, DiscoveredPluginData> {
  const found = new Map<string, DiscoveredPluginData>();
  for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) found.set(entry.manifest.plugin_id, { manifest: entry.manifest });
  const packages = new SandboxPackageStore(homeDirectory);
  const readRepo = (db: PluginRuntimeDatabase, scope: "home" | "project") => {
    for (const row of new SqlitePluginRuntimeRepository(db).list()) {
      if (row.state === "uninstalled") continue;
      let manifest: PluginManifest | undefined = installedPluginManifest(db, row.install_id)?.manifest;
      if (!manifest && row.publisher_trust === "pinned") {
        try { manifest = packages.load(row.plugin_id, row.publisher_signature, row.version).packaged?.manifest; }
        catch { /* missing or unreadable package is skipped during discovery */ }
      }
      if (!manifest) continue;
      const entry = found.get(manifest.plugin_id) ?? { manifest };
      if (row.execution === "sandbox") {
        if (scope === "home") entry.sandboxHomeInstallId = row.install_id;
        else entry.sandboxProjectInstallId = row.install_id;
      }
      found.set(manifest.plugin_id, entry);
    }
  };
  const homeStore = openReadOnlyHomePluginStore(homeDirectory);
  if (homeStore) { try { readRepo(homeStore, "home"); } finally { homeStore.close(); } }
  if (projectDb) readRepo(projectDb, "project");
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

function readTableItems(
  db: ReadableSqlite,
  tables: readonly string[],
  projectId?: string,
): { items: Array<{ table: string; rows: Record<string, unknown>[] }>; truncated: boolean } {
  const items: Array<{ table: string; rows: Record<string, unknown>[] }> = [];
  let truncated = false;
  for (const table of tables) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as Array<{ name: string }>;
    const hasProjectCol = projectId !== undefined && cols.some(col => col.name === "project_id");
    const raw = (hasProjectCol
      ? db.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE project_id = ? LIMIT ?`).all(projectId, MAX_EXPORT_ROWS_PER_TABLE + 1)
      : db.prepare(`SELECT * FROM ${quoteIdent(table)} LIMIT ?`).all(MAX_EXPORT_ROWS_PER_TABLE + 1)) as Record<string, unknown>[];
    if (raw.length > MAX_EXPORT_ROWS_PER_TABLE) {
      truncated = true;
      raw.length = MAX_EXPORT_ROWS_PER_TABLE;
    }
    items.push({ table, rows: raw.map(row => normalizeRow(row)) });
  }
  return { items, truncated };
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value instanceof Uint8Array ? Buffer.from(value).toString("base64") : typeof value === "bigint" ? Number(value) : value;
  }
  return out;
}

/** The file and byte limits are for the whole export, shared by the sections that carry owner files. */
interface OwnerFileBudget { files: number; bytes: number }

function readOwnerFileSnapshots(
  homeDirectory: string,
  discovered: DiscoveredPluginData,
  section: PluginDataSectionDeclaration,
  projectId: string | null,
  budget: OwnerFileBudget,
): { files: PluginDataFileSnapshot[]; truncated: boolean } {
  const declaration = discovered.manifest.owner_files;
  if (!declaration || section.files.length === 0) return { files: [], truncated: false };
  let base: string | null = null;
  if (section.scope === "project" && discovered.sandboxProjectInstallId && projectId) {
    base = sandboxOwnerFilesBase(homeDirectory, projectId, discovered.sandboxProjectInstallId);
  } else if (section.scope === "home" && discovered.sandboxHomeInstallId) {
    base = sandboxOwnerFilesBase(homeDirectory, null, discovered.sandboxHomeInstallId);
  } else if (discovered.sandboxProjectInstallId && projectId && !discovered.sandboxHomeInstallId) {
    base = sandboxOwnerFilesBase(homeDirectory, projectId, discovered.sandboxProjectInstallId);
  } else if (!discovered.sandboxHomeInstallId && !discovered.sandboxProjectInstallId) {
    base = homeDirectory;
  }
  if (!base || !existsSync(base)) return { files: [], truncated: false };
  const reader = openPluginOwnerFiles(base, declaration);
  const files: PluginDataFileSnapshot[] = [];
  let truncated = false;
  const visit = (relative: string, kind: "file" | "directory") => {
    if (budget.files >= MAX_EXPORT_FILES) { truncated = true; return; }
    const info = reader.stat(relative);
    if (!info) return;
    if (kind === "directory" && info.kind === "directory") {
      for (const child of reader.list(relative)) {
        if (budget.files >= MAX_EXPORT_FILES) { truncated = true; return; }
        visit(`${relative}/${child.name}`, child.kind);
      }
      return;
    }
    if (info.kind !== "file") return;
    budget.files += 1;
    const byteLength = info.byte_length;
    if (byteLength <= MAX_EXPORT_FILE_BYTES && budget.bytes + byteLength <= MAX_EXPORT_TOTAL_FILE_BYTES) {
      const content = reader.read(relative);
      budget.bytes += byteLength;
      files.push({ path: relative, byte_length: byteLength, ...(content ? { content_base64: Buffer.from(content).toString("base64") } : {}) });
    } else {
      truncated = true;
      files.push({ path: relative, byte_length: byteLength, truncated: true });
    }
  };
  for (const entry of declaration.entries) {
    if (!section.files.includes(entry.name)) continue;
    visit(entry.name, entry.kind);
  }
  return { files, truncated };
}

function readSectionSnapshot(
  homeDirectory: string,
  discovered: DiscoveredPluginData,
  section: PluginDataSectionDeclaration,
  projectId: string | null,
  projectDb: SqliteDatabase | undefined,
  budget: OwnerFileBudget | null,
): PluginDataSectionSnapshot {
  const manifest = discovered.manifest;
  const dbDecl = section.scope === "home" ? manifest.databases?.home : manifest.databases?.project;
  const fileData = budget ? readOwnerFileSnapshots(homeDirectory, discovered, section, projectId, budget) : { files: [], truncated: false };
  const fileFields = {
    ...(fileData.files.length > 0 ? { files: fileData.files } : {}),
  };
  if (!dbDecl) {
    return {
      plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
      items: [], ...fileFields, ...(fileData.truncated ? { truncated: true } : {}),
    };
  }
  const permitted = new Set(allowedTables(dbDecl));
  const tables = (section.tables.length > 0 ? section.tables : [...permitted]).filter(table => permitted.has(table));
  if (section.scope === "project") {
    if (!projectDb || !projectId) throw exportErrors.plugin_data_project_required("导出项目级插件数据需要指定 project_id");
    const result = readTableItems(projectDb, tables, projectId);
    const truncated = result.truncated || fileData.truncated;
    return {
      plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
      items: result.items, ...fileFields, ...(truncated ? { truncated: true } : {}),
    };
  }
  const partitioned = manifest.databases?.home?.partition === "project";
  if (partitioned && !projectId) throw exportErrors.plugin_data_project_required("导出按项目分区的插件数据需要指定 project_id");
  const file = homeSqlitePath(homeDirectory, dbDecl.store_name, partitioned ? projectId! : undefined);
  if (!existsSync(file)) {
    return {
      plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
      items: [], ...fileFields, ...(fileData.truncated ? { truncated: true } : {}),
    };
  }
  const db = openReadOnlyHomeSqlite(homeDirectory, dbDecl.store_name, partitioned ? projectId! : undefined);
  try {
    const result = readTableItems(db, tables, partitioned ? undefined : projectId ?? undefined);
    const truncated = result.truncated || fileData.truncated;
    return {
      plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
      items: result.items, ...fileFields, ...(truncated ? { truncated: true } : {}),
    };
  } finally { db.close(); }
}

/** Export a plugin's declared business data sections read-only (works identically for built-in and installed plugins). */
export async function exportPluginData(
  ports: PluginDataExportPorts,
  input: { plugin_id: string; project_id?: string },
  signal?: AbortSignal,
  assertCurrent?: () => void,
): Promise<PluginDataExportResult> {
  signal?.throwIfAborted();
  assertCurrent?.();
  const projectRef = input.project_id ? await ports.resolveProject(input.project_id) : null;
  signal?.throwIfAborted();
  assertCurrent?.();
  if (input.project_id && !projectRef) throw exportErrors.plugin_data_not_found("项目不存在");
  const projectStore = projectRef ? new LocalProjectDatabase(projectRef.storage_key, { existingOnly: true }) : undefined;
  try {
    const discovered = collectManifests(ports.homeDirectory, projectStore?.db).get(input.plugin_id);
    if (!discovered) throw exportErrors.plugin_data_not_found(`找不到插件 ${input.plugin_id}`);
    const manifest = discovered.manifest;
    const declared = pluginDataSectionsFromManifest(manifest);
    if (declared.length > 0 && !projectStore && declared.every(section => section.scope === "project")) {
      throw exportErrors.plugin_data_project_required("导出项目级插件数据需要指定 project_id");
    }
    const eligible = declared.filter(section => section.scope === "home" || projectStore !== undefined);
    // Owner files are the plugin's, listed on every section; they are exported once per scope (the first section of that scope carries
    // them, since Home and project files live apart), within one budget for the whole export; a section that hits it says so (`truncated`).
    const budget: OwnerFileBudget = { files: 0, bytes: 0 };
    const filesCarried = new Set<PluginDataSectionDeclaration["scope"]>();
    const sections = eligible.map(section => {
      const carriesFiles = !filesCarried.has(section.scope);
      filesCarried.add(section.scope);
      return readSectionSnapshot(ports.homeDirectory, discovered, section, projectRef?.project_id ?? null, projectStore?.db, carriesFiles ? budget : null);
    });
    return { format: PLUGIN_DATA_EXPORT_FORMAT, version: PLUGIN_DATA_EXPORT_VERSION, plugin_id: manifest.plugin_id, project_id: projectRef?.project_id ?? null, exported_at: new Date().toISOString(), sections };
  } finally { projectStore?.close(); }
}

function resolveRequestedProjectId(caller: ActionCallContext, requested?: string): string | undefined {
  if (caller.project_id && requested && requested !== caller.project_id) {
    throw new ActionError("actions.scope_mismatch", "请求与当前项目不一致");
  }
  return requested ?? caller.project_id ?? undefined;
}

export function pluginDataActionProvider(ports: PluginDataExportPorts): ActionProviderRegistration {
  return {
    provider: { provider_id: PLUGIN_DATA_PROVIDER_ID, title: "插件数据分段与导出", kind: "system" },
    definitions: [pluginDataActions.sections, pluginDataActions.export],
    handlers: [
      bindActionHandler(pluginDataActions.sections, async (input, caller) => {
        const assertCurrent = () => {
          caller.signal?.throwIfAborted();
          requireSynchronous(caller.assert_authority_current?.());
        };
        assertCurrent();
        const projectId = resolveRequestedProjectId(caller, input.project_id);
        const projectRef = projectId ? await ports.resolveProject(projectId) : null;
        assertCurrent();
        const projectStore = projectRef ? new LocalProjectDatabase(projectRef.storage_key, { existingOnly: true }) : undefined;
        try {
          const manifests = collectManifests(ports.homeDirectory, projectStore?.db);
          const selected = input.plugin_id
            ? (manifests.has(input.plugin_id) ? [manifests.get(input.plugin_id)!.manifest] : [])
            : [...manifests.values()].map(entry => entry.manifest);
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
        const assertCurrent = () => {
          caller.signal?.throwIfAborted();
          requireSynchronous(caller.assert_authority_current?.());
        };
        assertCurrent();
        const projectId = resolveRequestedProjectId(caller, input.project_id);
        return exportPluginData(
          ports,
          { plugin_id: input.plugin_id, ...(projectId ? { project_id: projectId } : {}) },
          caller.signal,
          assertCurrent,
        );
      }),
    ],
  };
}
