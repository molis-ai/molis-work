import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { ActionError, bindActionHandler, defineErrorCodes, requireSynchronous, type ActionCallContext, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  PLUGIN_DATA_EXPORT_FORMAT, PLUGIN_DATA_EXPORT_VERSION, PLUGIN_DATA_PROVIDER_ID, pluginDataActions, pluginDataSectionsFromManifest,
  type HomePluginDatabaseDeclaration, type PluginDataExportResult, type PluginDataFileSnapshot, type PluginDataSectionDeclaration,
  type PluginDataSectionSnapshot, type PluginDatabaseDeclaration, type PluginManifest,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  pluginManifestDigest, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository, type PluginRuntimeDatabase,
} from "@molis-ai/molis-work-plugin-runtime";
import { describeSqliteBaseline, homeSqlitePath, openReadOnlyHomeSqlite, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import { openReadOnlyHomePluginStore } from "./home-plugin-store.js";
import { homeStores } from "./home-stores.js";
import { installedHomeLibraryName, installedLibrarySnapshots } from "./installed-plugin-libraries.js";
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
  readonly builtin: boolean;
  homePublisherSignature?: string;
  projectPublisherSignature?: string;
  sandboxHomeInstallId?: string;
  sandboxProjectInstallId?: string;
}

/** An installation's Manifest as the host can vouch for it: its stored release, else a pinned package whose digest matches the record. */
export function loadVerifiedManifest(
  db: PluginRuntimeDatabase,
  packages: SandboxPackageStore,
  row: ReturnType<SqlitePluginRuntimeRepository["list"]>[number],
): PluginManifest | undefined {
  let manifest: PluginManifest | undefined = row.state === "uninstalled"
    ? new SqlitePluginRuntimeReleaseArtifactRepository(db).get(row.plugin_id, row.publisher_signature, row.version, row.manifest_digest)?.manifest
    : installedPluginManifest(db, row.install_id)?.manifest;
  if (!manifest && row.publisher_trust === "pinned") {
    try {
      const candidate = packages.load(row.plugin_id, row.publisher_signature, row.version).packaged?.manifest;
      if (candidate && pluginManifestDigest(candidate) === row.manifest_digest) {
        manifest = candidate;
      }
    } catch {
      /* missing or unreadable package is skipped during discovery */
    }
  }
  if (!manifest || manifest.plugin_id !== row.plugin_id) return undefined;
  return manifest;
}

function collectManifests(homeDirectory: string, projectDb?: SqliteDatabase): Map<string, DiscoveredPluginData> {
  const found = new Map<string, DiscoveredPluginData>();
  const quarantined = new Set<string>();
  for (const entry of PLATFORM_PLUGIN_REGISTRATIONS) {
    found.set(entry.manifest.plugin_id, { manifest: entry.manifest, builtin: true });
  }
  const packages = new SandboxPackageStore(homeDirectory);
  const readRepo = (db: PluginRuntimeDatabase, scope: "home" | "project") => {
    for (const row of new SqlitePluginRuntimeRepository(db).list()) {
      if (row.state === "quarantined") {
        quarantined.add(row.plugin_id);
        continue;
      }
      if (row.state === "uninstalled" && !row.retain_private_data) continue;
      const manifest = loadVerifiedManifest(db, packages, row);
      if (!manifest) continue;
      const existing = found.get(manifest.plugin_id);
      if (existing?.builtin) continue;
      const entry = existing ?? { manifest, builtin: false };
      if (scope === "home") {
        entry.homePublisherSignature = row.publisher_signature;
      } else {
        entry.projectPublisherSignature = row.publisher_signature;
      }
      if (row.execution === "sandbox") {
        if (scope === "home") {
          entry.sandboxHomeInstallId = row.install_id;
        } else {
          entry.sandboxProjectInstallId = row.install_id;
        }
      }
      found.set(manifest.plugin_id, entry);
    }
  };
  const homeStore = openReadOnlyHomePluginStore(homeDirectory);
  if (homeStore) {
    try {
      readRepo(homeStore, "home");
    } finally {
      homeStore.close();
    }
  }
  if (projectDb) readRepo(projectDb, "project");
  for (const pluginId of quarantined) {
    if (!found.get(pluginId)?.builtin) found.delete(pluginId);
  }
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
type TableColumnInfo = { name: string; pk: number };

function tableOrderClause(db: ReadableSqlite, table: string, cols: readonly TableColumnInfo[]): string {
  const quoted = quoteIdent(table);
  try {
    db.prepare(`SELECT rowid FROM ${quoted} LIMIT 0`).all();
    return "ORDER BY rowid";
  } catch {
    const pkCols = cols
      .filter(col => col.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map(col => quoteIdent(col.name));
    return pkCols.length > 0 ? `ORDER BY ${pkCols.join(", ")}` : "";
  }
}

function readTableItems(
  db: ReadableSqlite,
  tables: readonly string[],
  projectId?: string,
  options?: { requireProjectColumn?: boolean; pluginId?: string },
): { items: Array<{ table: string; rows: Record<string, unknown>[] }>; truncated: boolean } {
  const items: Array<{ table: string; rows: Record<string, unknown>[] }> = [];
  let truncated = false;
  for (const table of tables) {
    const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!exists) continue;
    const cols = db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as TableColumnInfo[];
    const hasProjectCol = projectId !== undefined && cols.some(col => col.name === "project_id");
    if (options?.requireProjectColumn && projectId !== undefined && !hasProjectCol) {
      throw new ActionError(
        "actions.scope_mismatch",
        `插件 ${options.pluginId ?? ""} 的非分区 Home 表 ${table} 不按项目隔离，不能在项目范围内导出`,
      );
    }
    const orderClause = tableOrderClause(db, table, cols);
    const orderSql = orderClause ? ` ${orderClause}` : "";
    const raw = (hasProjectCol
      ? db.prepare(`SELECT * FROM ${quoteIdent(table)} WHERE project_id = ?${orderSql} LIMIT ?`).all(projectId, MAX_EXPORT_ROWS_PER_TABLE + 1)
      : db.prepare(`SELECT * FROM ${quoteIdent(table)}${orderSql} LIMIT ?`).all(MAX_EXPORT_ROWS_PER_TABLE + 1)) as Record<string, unknown>[];
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

function verifyInstalledHomeLibrary(
  homeDirectory: string,
  discovered: DiscoveredPluginData,
  dbDecl: HomePluginDatabaseDeclaration,
): boolean {
  if (dbDecl.partition !== undefined) {
    throw new ActionError("actions.forbidden", "第三方插件不支持按项目分区的 Home 库");
  }
  const reserved = homeStores();
  if (!installedHomeLibraryName(dbDecl.store_name, reserved)) {
    throw new ActionError("actions.forbidden", "插件声明的 Home 库名称不在允许范围内");
  }
  const publisherSignature = discovered.homePublisherSignature ?? discovered.projectPublisherSignature;
  if (!publisherSignature) {
    throw new ActionError("actions.forbidden", "缺少插件发布者归属信息，拒绝导出 Home 库");
  }
  const snapshots = installedLibrarySnapshots(homeDirectory, reserved);
  const byStore = snapshots.find(row => row.store_name === dbDecl.store_name);
  if (byStore && byStore.plugin_id !== discovered.manifest.plugin_id) {
    throw new ActionError("actions.forbidden", "该 Home 库属于其他插件，拒绝导出");
  }
  const byPlugin = snapshots.find(row => row.plugin_id === discovered.manifest.plugin_id);
  const file = homeSqlitePath(homeDirectory, dbDecl.store_name);
  if (!byPlugin) {
    if (existsSync(file)) {
      throw new ActionError("actions.forbidden", "Home 库缺少账本归属记录，拒绝导出");
    }
    return false;
  }
  const digest = createHash("sha256").update(dbDecl.schema).digest("hex");
  if (
    byPlugin.publisher_signature !== publisherSignature
    || byPlugin.store_name !== dbDecl.store_name
    || byPlugin.version !== dbDecl.version
    || byPlugin.schema_digest !== digest
  ) {
    throw new ActionError("actions.forbidden", "Home 库账本归属或结构与当前插件不符，拒绝导出");
  }
  return existsSync(file);
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
  const homeDecl = manifest.databases?.home;
  if (!homeDecl) {
    return {
      plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
      items: [], ...fileFields, ...(fileData.truncated ? { truncated: true } : {}),
    };
  }
  if (!discovered.builtin) {
    const ready = verifyInstalledHomeLibrary(homeDirectory, discovered, homeDecl);
    if (!ready) {
      return {
        plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
        items: [], ...fileFields, ...(fileData.truncated ? { truncated: true } : {}),
      };
    }
  }
  const partitioned = homeDecl.partition === "project";
  if (partitioned && !projectId) throw exportErrors.plugin_data_project_required("导出按项目分区的插件数据需要指定 project_id");
  const file = homeSqlitePath(homeDirectory, homeDecl.store_name, partitioned ? projectId! : undefined);
  if (!existsSync(file)) {
    return {
      plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
      items: [], ...fileFields, ...(fileData.truncated ? { truncated: true } : {}),
    };
  }
  const db = openReadOnlyHomeSqlite(homeDirectory, homeDecl.store_name, partitioned ? projectId! : undefined);
  try {
    const result = readTableItems(
      db,
      tables,
      partitioned ? undefined : projectId ?? undefined,
      { requireProjectColumn: !partitioned && projectId !== null, pluginId: manifest.plugin_id },
    );
    const truncated = result.truncated || fileData.truncated;
    return {
      plugin_id: section.plugin_id, section_id: section.section_id, schema_version: section.schema_version, title: section.title,
      items: result.items, ...fileFields, ...(truncated ? { truncated: true } : {}),
    };
  } finally {
    db.close();
  }
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
  } finally {
    projectStore?.close();
  }
}

/** Only the person acting directly may inspect or export plugin data; an Agent, plugin, or delegated call is refused. */
function assertPersonCaller(caller: ActionCallContext): void {
  if (caller.audience !== "user" || caller.host_plugin || caller.delegated_by || caller.calling_plugin_id) {
    throw new ActionError("actions.forbidden", "插件数据分段与导出只能由本人操作");
  }
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
    availability: caller => {
      if (caller.audience !== "user" || caller.host_plugin || caller.delegated_by || caller.calling_plugin_id) {
        return { available: false, code: "actions.forbidden", kind: "forbidden", reason: "插件数据分段与导出只能由本人操作" };
      }
      return { available: true };
    },
    handlers: [
      bindActionHandler(pluginDataActions.sections, async (input, caller) => {
        assertPersonCaller(caller);
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
        } finally {
          projectStore?.close();
        }
      }),
      bindActionHandler(pluginDataActions.export, async (input, caller) => {
        assertPersonCaller(caller);
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
