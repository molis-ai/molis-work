import { pluginErrors, type PluginDatabaseDeclaration, type PluginPinnedRowsDeclaration, type PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { describeSqliteBaseline } from "@molis-ai/molis-work-storage";

// Kept apart from `plugin-project-rows.ts`, which reads the built-in registry: the sandbox statement worker opens plugin libraries
// through `plugin-database.ts` and must not load every built-in plugin to do so (its memory cap counts what it imports).

export interface ProjectArtifactRoot {
  readonly declaration: PluginPinnedRowsDeclaration;
  /**
   * The column naming the project of a row in a Home library shared by every project (`databases.home.project_rows`). A partition's own
   * library (`databases.partition.pinned_rows`) is that partition's alone, so its rows name none.
   */
  readonly projectColumn?: string;
  readonly columns: ReadonlySet<string>;
}

/**
 * The table a library's pins are recorded on, proven by the library's own schema: its single-column key and its pin fields. For a Home library
 * the declaration is `project_rows.artifact_join` and its root table's project column comes from `project_rows.tables`; for a partition's
 * library it is `pinned_rows`.
 */
export function pinnedArtifactRoot(library: PluginDatabaseDeclaration & { readonly project_rows?: PluginProjectRowsDeclaration },
  declaration: PluginPinnedRowsDeclaration | undefined, pluginId: string): ProjectArtifactRoot | undefined {
  if (!declaration) return undefined;
  const refuse = () => pluginErrors.declaration_invalid(`插件 ${pluginId} 的成果固定声明与库的根表不一致`);
  let projectColumn: string | undefined;
  if (library.project_rows) {
    const root = library.project_rows.tables.find(entry => !("parent" in entry) && entry.table === declaration.table);
    if (!root) throw refuse();
    projectColumn = root.column;
  }
  const schema = describeSqliteBaseline(library).tables, table = schema[declaration.table];
  if (!table) throw refuse();
  const { id_column, version_column, artifact_id_column, artifact_version_column, write_columns, pending_column } = declaration;
  const columns = new Map(table.columns.map(column => [column.name, column]));
  const names = [...projectColumn === undefined ? [] : [projectColumn], id_column, version_column, artifact_id_column, artifact_version_column, ...write_columns];
  if (pending_column !== undefined) names.push(pending_column);
  const typeOf = (name: string) => columns.get(name)?.type.toUpperCase();
  if (new Set(names).size !== names.length || names.some(name => !columns.has(name))
    || table.columns.filter(column => column.pk !== 0).length !== 1 || columns.get(id_column)?.pk !== 1
    || typeOf(id_column) !== "TEXT" || projectColumn !== undefined && typeOf(projectColumn) !== "TEXT" || typeOf(version_column) !== "INTEGER"
    || typeOf(artifact_id_column) !== "TEXT" || typeOf(artifact_version_column) !== "INTEGER"
    || pending_column !== undefined && typeOf(pending_column) !== "TEXT") throw refuse();
  // SQLite counts only the directly updated row. A mutable foreign-key target could silently update additional rows.
  const mutable = new Set([version_column, artifact_id_column, artifact_version_column, ...write_columns]);
  if (Object.values(schema).some(item => item.foreign_keys.some(key => key.table.toLowerCase() === declaration.table
    && key.to !== null && mutable.has(key.to.toLowerCase())))) throw refuse();
  return { declaration, ...(projectColumn === undefined ? {} : { projectColumn }), columns: new Set(columns.keys()) };
}
