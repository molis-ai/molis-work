import { pluginErrors, type HomePluginDatabaseDeclaration, type PluginProjectRowsDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { describeSqliteBaseline } from "@molis-ai/molis-work-storage";

// Kept apart from `plugin-project-rows.ts`, which reads the built-in registry: the sandbox statement worker opens plugin libraries
// through `plugin-database.ts` and must not load every built-in plugin to do so (its memory cap counts what it imports).

export interface ProjectArtifactRoot {
  readonly declaration: NonNullable<PluginProjectRowsDeclaration["artifact_join"]>;
  readonly projectColumn: string;
  readonly columns: ReadonlySet<string>;
}

/** The same schema that owns deletion proves the root, its single-column key, and its pin fields. */
export function projectArtifactRoot(library: HomePluginDatabaseDeclaration, pluginId: string): ProjectArtifactRoot | undefined {
  const rows = library.project_rows;
  if (!rows?.artifact_join) return undefined;
  const declaration = rows.artifact_join;
  const root = rows.tables.find(entry => entry.table === declaration.table && !("parent" in entry));
  const schema = describeSqliteBaseline(library).tables, table = schema[declaration.table];
  const refuse = () => pluginErrors.declaration_invalid(`插件 ${pluginId} 的成果固定声明与 Home 根表不一致`);
  if (!root || !table) throw refuse();
  const { id_column, version_column, artifact_id_column, artifact_version_column, write_columns, pending_column } = declaration;
  const columns = new Map(table.columns.map(column => [column.name, column]));
  const names = [root.column, id_column, version_column, artifact_id_column, artifact_version_column, ...write_columns];
  if (pending_column !== undefined) names.push(pending_column);
  const typeOf = (name: string) => columns.get(name)?.type.toUpperCase();
  if (new Set(names).size !== names.length || names.some(name => !columns.has(name))
    || table.columns.filter(column => column.pk !== 0).length !== 1 || columns.get(id_column)?.pk !== 1
    || typeOf(id_column) !== "TEXT" || typeOf(root.column) !== "TEXT" || typeOf(version_column) !== "INTEGER"
    || typeOf(artifact_id_column) !== "TEXT" || typeOf(artifact_version_column) !== "INTEGER"
    || pending_column !== undefined && typeOf(pending_column) !== "TEXT") throw refuse();
  // SQLite counts only the directly updated row. A mutable foreign-key target could silently update additional rows.
  const mutable = new Set([version_column, artifact_id_column, artifact_version_column, ...write_columns]);
  if (Object.values(schema).some(item => item.foreign_keys.some(key => key.table.toLowerCase() === declaration.table
    && key.to !== null && mutable.has(key.to.toLowerCase())))) throw refuse();
  return { declaration, projectColumn: root.column, columns: new Set(columns.keys()) };
}
