import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { rmSync } from "node:fs";
import { pluginErrors, type HomePluginDatabaseDeclaration, type PluginDefinition, type PluginOwnerFilesDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { clearInExistingHomeSqlite, describeSqliteBaseline } from "@molis-ai/molis-work-storage";
import { ownerFileHasCode, ownerFilePaths } from "./plugin-owner-files-paths.js";

// A project's rows in a plugin's library of the Home, as the plugin declares them (`databases.home.project_rows`, PG-024): the
// platform writes the statements from the declaration and runs them on its own connection to that one library, so deleting a project
// runs no code of the plugin's (specs/repository-anti-corruption/slices/w5-02-registry.md §2). The SDK has checked the shape
// (packages/plugin-sdk `project-rows-declarations.ts`); what it cannot see, that each column is one the schema really creates, is
// checked here against the schema built in SQLite.

const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;

/**
 * The statements that delete one project's rows, in the declared order, each taking the project's id as its one parameter. Throws
 * `plugin.declaration_invalid` when a table or column the declaration names is not one this library's schema creates.
 */
export function projectRowsStatements(library: HomePluginDatabaseDeclaration, pluginId: string): string[] {
  const rows = library.project_rows;
  if (!rows) return [];
  const shape = describeSqliteBaseline(library).tables;
  const has = (table: string, column: string) => shape[table]?.columns.some(item => item.name === column) === true;
  const refuse = (detail: string) => pluginErrors.declaration_invalid(`插件 ${pluginId} 的 project_rows：${detail}`);
  return rows.tables.map(entry => {
    if (!shape[entry.table]) throw refuse(`${entry.table} 不是库 ${library.store_name} 的表`);
    if (!has(entry.table, entry.column)) throw refuse(`${entry.table} 没有列 ${entry.column}`);
    if (!("parent" in entry)) return `DELETE FROM ${quoted(entry.table)} WHERE ${quoted(entry.column)} = ?`;
    const parent = rows.tables.find(item => item.table === entry.parent && !("parent" in item));
    const key = entry.key ?? "id";
    if (!parent || !has(parent.table, key)) throw refuse(`${entry.table} 挂的 ${entry.parent}.${key} 不在声明或库里`);
    return `DELETE FROM ${quoted(entry.table)} WHERE ${quoted(entry.column)} IN (SELECT ${quoted(key)} FROM ${quoted(parent.table)} WHERE ${quoted(parent.column)} = ?)`;
  });
}

/**
 * One declared file list as the deletion reads it: the statement that selects the column for the project, the one that selects it
 * for every row left, and how to read names out of it.
 */
interface ProjectRowFiles { readonly select: string; readonly remaining: string; readonly key?: string; readonly directory: string }

/**
 * The reads of the files the project's rows name (`project_rows.files`), each taking the project's id as its one parameter. Throws
 * `plugin.declaration_invalid` when a column is not one this library's schema creates or the directory is not an `owner_files` one.
 */
function projectRowsFiles(library: HomePluginDatabaseDeclaration, pluginId: string, ownerFiles: PluginOwnerFilesDeclaration | undefined): ProjectRowFiles[] {
  const rows = library.project_rows;
  if (!rows?.files) return [];
  const shape = describeSqliteBaseline(library).tables;
  const refuse = (detail: string) => pluginErrors.declaration_invalid(`插件 ${pluginId} 的 project_rows.files：${detail}`);
  return rows.files.map(item => {
    const owner = rows.tables.find(entry => entry.table === item.table && !("parent" in entry));
    if (!owner) throw refuse(`${item.table} 不是 tables 里不带 parent 的表`);
    if (!shape[item.table]?.columns.some(column => column.name === item.column)) throw refuse(`${item.table} 没有列 ${item.column}`);
    if (!ownerFiles?.entries.some(entry => entry.name === item.directory && entry.kind === "directory")) throw refuse(`${item.directory} 不是 owner_files 声明的目录`);
    const read = `SELECT ${quoted(item.column)} AS names FROM ${quoted(item.table)}`;
    return { select: `${read} WHERE ${quoted(owner.column)} = ?`, remaining: read, ...item.key ? { key: item.key } : {}, directory: item.directory };
  });
}

/** The names one stored value gives: a JSON array of names, or of objects whose `key` field is the name. Anything else gives none. */
function namesIn(value: unknown, key: string | undefined): string[] {
  let parsed: unknown;
  try { parsed = typeof value === "string" ? JSON.parse(value) : null; } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap(item => {
    const name = key === undefined ? item : item && typeof item === "object" && !Array.isArray(item) ? (item as Record<string, unknown>)[key] : undefined;
    return typeof name === "string" ? [name] : [];
  });
}

/**
 * Removes the named files from the plugin's own files, through the same path rules its file service keeps: a name must be one plain
 * segment in the declared directory, and only a regular file there is removed (no link, folder, special node or hard-linked file).
 * A name that breaks a rule is not the plugin's to have removed, and is left; a file already gone is fine. Any other error (a file
 * that cannot be looked at or removed) throws, so the rows it was read from roll back and the next attempt tries again.
 */
function removeNamedFiles(home: string, ownerFiles: PluginOwnerFilesDeclaration, directory: string, names: readonly string[]): void {
  const paths = ownerFilePaths(home, ownerFiles);
  for (const name of new Set(names)) {
    if (name.includes("/")) continue;
    let target: ReturnType<typeof paths.inspect>;
    try { target = paths.inspect(`${directory}/${name}`, "file"); }
    catch (error) {
      if (ownerFileHasCode(error, "host.owner_file_invalid") || ownerFileHasCode(error, "host.owner_file_unsafe")) continue;
      throw error;
    }
    if (target.stat?.isFile()) rmSync(target.path, { force: true });
  }
}

/**
 * Checks every `project_rows` on a start list before anything starts, as the libraries themselves are checked: a mistake is the
 * composition's. A project's list keeps the catalog's existing deletion owners, by their actual Manifest objects; other project
 * entries have no deletion step (BL-620). A Home start list has its own steps; sandboxed declarations stay refused (BL-619).
 */
export function assertProjectRowsEntries(entries: readonly { readonly definition: PluginDefinition }[], scope: "home" | "project"): void {
  for (const { definition } of entries) {
    const library = definition.manifest.databases?.home;
    if (!library?.project_rows) continue;
    if (definition.execution === "sandbox") throw sandboxRefusal(definition);
    if (scope === "project" && !PLATFORM_PLUGIN_REGISTRATIONS.some(entry => entry.manifest === definition.manifest)) {
      throw pluginErrors.declaration_invalid(`插件 ${definition.manifest.plugin_id} 声明了 project_rows：这个项目插件的 Home 库没有登记项目删除步骤（BL-620）`);
    }
    projectRowsStatements(library, definition.manifest.plugin_id);
    projectRowsFiles(library, definition.manifest.plugin_id, definition.manifest.owner_files);
  }
}

export function sandboxRefusal(definition: PluginDefinition): Error {
  return pluginErrors.declaration_invalid(`沙箱插件 ${definition.manifest.plugin_id} 声明了 project_rows：沙箱插件的 Home 库还不能由平台按项目删（BL-619）`);
}

/**
 * Deletes one project's rows from the plugin's own library, straight from its file: one write transaction that waits for an
 * instance's write in progress (`busy_timeout`) rather than failing beside it, and a library that does not exist yet is not made. A
 * wait that runs out throws, and the deletion keeps the step pending in its receipt for the next attempt. The files the rows name
 * (`files`) are read in the same transaction, and a name a row left behind (another project's) still gives is kept. They are removed
 * from the Manifest's own `owner_files` before the transaction commits: a removal that fails rolls the rows back with it, so the
 * next attempt finds the names again rather than leaving files no row names; a commit that fails after them leaves rows naming
 * files already gone, which the next attempt deletes.
 */
export function clearProjectRows(home: string, library: HomePluginDatabaseDeclaration, pluginId: string, projectId: string,
  ownerFiles?: PluginOwnerFilesDeclaration): void {
  const statements = projectRowsStatements(library, pluginId), files = projectRowsFiles(library, pluginId, ownerFiles);
  if (statements.length === 0) return;
  clearInExistingHomeSqlite(home, library.store_name, library, db => {
    const read = (statement: string, item: ProjectRowFiles, ...params: string[]) =>
      (db.prepare(statement).all(...params) as Array<{ names: unknown }>).flatMap(row => namesIn(row.names, item.key));
    const named = files.map(item => ({ directory: item.directory, names: read(item.select, item, projectId) }));
    for (const statement of statements) db.prepare(statement).run(projectId);
    const kept = new Map<string, Set<string>>();
    for (const item of files) for (const name of read(item.remaining, item)) kept.set(item.directory, (kept.get(item.directory) ?? new Set()).add(name));
    for (const { directory, names } of named) removeNamedFiles(home, ownerFiles!, directory, names.filter(name => !kept.get(directory)?.has(name)));
  });
}
