import { randomUUID } from "node:crypto";
import type { PluginDatabaseDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inspectProjectLibrary, pluginProjectDatabaseErrors, type PluginProjectSchemaInspector } from "./project-database.js";
import type { PluginRuntimeDatabase } from "./repository.js";

type Schema = { declaration: PluginDatabaseDeclaration; platformSchema?: string; platformPrelude?: string };
type Owner = { plugin_id: string; publisher_signature: string };
const identifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';
const mismatch = () => pluginProjectDatabaseErrors.shape_mismatch("旧数据的归属与安装记录不符，已停止安装");

function owned(db: PluginRuntimeDatabase, owner: Owner, schema: Schema | undefined, inspector: PluginProjectSchemaInspector, path: string) {
  if (!db.prepare("SELECT 1 FROM plugin_project_databases WHERE plugin_id=?").get(owner.plugin_id)) return;
  if (!schema) throw mismatch();
  const shape = inspector.shape(db);
  const { record, declared } = inspectProjectLibrary(db, { ...owner, declaration: schema.declaration }, {
    ...inspector, shape: connection => connection === db ? shape : inspector.shape(connection),
  }, path, schema);
  const tables = new Set(declared.tables);
  const objects = inspector.objects(db).filter(item => !item.automatic && (tables.has(item.table) || declared.triggers?.has(item.name)));
  if (objects.some(item => !declared.objects.includes(item.name))) throw mismatch();
  // A foreign table referring to this installation must keep its references intact.
  const names = new Set(declared.tables.map(name => name.toLowerCase()));
  for (const [table, description] of Object.entries(shape.tables)) {
    if (!tables.has(table) && description.foreign_keys.some(key => names.has(key.table.toLowerCase()))) throw mismatch();
  }
  return { record, tables: declared.tables, triggers: [...declared.triggers?.keys() ?? []] };
}

function drop(db: PluginRuntimeDatabase, data: NonNullable<ReturnType<typeof owned>>) {
  for (const trigger of data.triggers) db.exec("DROP TRIGGER main." + identifier(trigger));
  for (const table of data.tables) db.exec("DROP TABLE main." + identifier(table));
  db.prepare("DELETE FROM plugin_project_databases WHERE plugin_id=? AND publisher_signature=?").run(data.record.plugin_id, data.record.publisher_signature);
}

// Suspend foreign keys on this connection only during a synchronous transaction so cyclic owned tables can be dropped together.
function transaction<T>(db: PluginRuntimeDatabase, operation: () => T): T {
  const foreignKeys = (db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys;
  db.exec("PRAGMA foreign_keys=OFF");
  try {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = operation();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    if (foreignKeys) db.exec("PRAGMA foreign_keys=ON");
  }
}

function copyRows(db: PluginRuntimeDatabase, table: string) {
  const columns = db.prepare("SELECT name FROM pragma_table_xinfo(?) WHERE hidden=0 ORDER BY cid").all(table) as { name: string }[];
  const hasRowid = Boolean(db.prepare("SELECT 1 FROM pragma_table_list WHERE schema='main' AND name=? AND wr=0").get(table));
  const rowid = hasRowid && ["_rowid_", "rowid", "oid"].find(alias => !columns.some(column => column.name.toLowerCase() === alias));
  const names = [...rowid ? [rowid] : [], ...columns.map(column => column.name)].map(identifier).join(",");
  const backup = "temp." + identifier(randomUUID());
  const source = "main." + identifier(table);
  db.exec(`CREATE TEMP TABLE ${backup} AS SELECT ${names} FROM ${source}`);
  return { backup, source, names };
}

/** Keep old rows in connection-private temporary tables until this install settles. Leave the project available between transactions. */
export function stageProjectDatabaseDiscard(db: PluginRuntimeDatabase, owner: Owner,
  previous: Schema | undefined, next: Schema | undefined, inspector: PluginProjectSchemaInspector, path: string) {
  const snapshot = transaction(db, () => {
    const old = owned(db, owner, previous, inspector, path);
    if (!old) return;
    const objects = old.record.objects.map(name => db.prepare("SELECT type,sql FROM main.sqlite_schema WHERE name=?").get(name) as {type: string; sql: string});
    const tables = old.tables.map(table => copyRows(db, table));
    const sequences = db.prepare("SELECT 1 FROM main.sqlite_schema WHERE name='sqlite_sequence'").get()
      ? old.tables.flatMap(name => db.prepare("SELECT name,CAST(seq AS TEXT) AS seq FROM main.sqlite_sequence WHERE name=?").all(name)) as {name: string; seq: string}[] : [];
    drop(db, old);
    return { old, objects, tables, sequences };
  });
  if (!snapshot && !next) return;
  return {
    restore() {
      transaction(db, () => {
        const replacement = owned(db, owner, next, inspector, path);
        if (replacement) drop(db, replacement);
        if (!snapshot) return;
        const { old, objects, tables, sequences } = snapshot;
        for (const object of objects.filter(item => item.type === "table")) db.exec(object.sql);
        // Insert by position: SQLite may label the implicit rowid with its INTEGER PRIMARY KEY alias in the copy.
        for (const table of tables) db.exec(`INSERT INTO ${table.source}(${table.names}) SELECT * FROM ${table.backup}`);
        for (const row of sequences) {
          db.prepare("DELETE FROM main.sqlite_sequence WHERE name=?").run(row.name);
          db.prepare("INSERT INTO main.sqlite_sequence(name,seq) VALUES (?,CAST(? AS INTEGER))").run(row.name, row.seq);
        }
        for (const object of objects.filter(item => item.type !== "table")) db.exec(object.sql);
        const r = old.record;
        db.prepare("INSERT INTO plugin_project_databases(plugin_id,publisher_signature,store_name,version,tables_json,created_at) VALUES(?,?,?,?,?,?)")
          .run(r.plugin_id, r.publisher_signature, r.store_name, r.version, JSON.stringify(r.objects), r.created_at);
      });
    },
    close() {
      for (const table of snapshot?.tables ?? []) db.exec("DROP TABLE " + table.backup);
    },
  };
}
