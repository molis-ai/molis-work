import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { pluginErrors, type HomePluginDatabaseDeclaration, type PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { clearInExistingHomeSqlite, describeSqliteBaseline } from "@molis-ai/molis-work-storage";

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
  }
}

export function sandboxRefusal(definition: PluginDefinition): Error {
  return pluginErrors.declaration_invalid(`沙箱插件 ${definition.manifest.plugin_id} 声明了 project_rows：沙箱插件的 Home 库还不能由平台按项目删（BL-619）`);
}

/**
 * Deletes one project's rows from the plugin's own library, straight from its file: one write transaction that waits for an
 * instance's write in progress (`busy_timeout`) rather than failing beside it, and a library that does not exist yet is not made. A
 * wait that runs out throws, and the deletion keeps the step pending in its receipt for the next attempt.
 */
export function clearProjectRows(home: string, library: HomePluginDatabaseDeclaration, pluginId: string, projectId: string): void {
  const statements = projectRowsStatements(library, pluginId);
  if (statements.length === 0) return;
  clearInExistingHomeSqlite(home, library.store_name, library, db => {
    for (const statement of statements) db.prepare(statement).run(projectId);
  });
}
