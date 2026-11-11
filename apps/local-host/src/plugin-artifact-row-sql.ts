import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginManifest, PluginSqlRow } from "@molis-ai/molis-work-contracts/platform/plugin";
import { sqliteRowAuthorizerCodes, type SqliteAuthorizer, type SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ArtifactRootRow } from "./plugin-artifact-row-transaction.js";
import type { ProjectArtifactRoot } from "./plugin-artifact-root.js";
import { pluginSyncLibraryManifest, pluginSyncNamespace } from "./plugin-sync-database.js";

export const ARTIFACT_HOME_SCHEMA = "molis_home";
const denied = () => new ActionError("actions.forbidden", "固定成果事务越过 Home 根行的存储边界");
const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The already compiled platform triggers are the only programs that can reach these tables. */
export function artifactRowReplication(manifest: PluginManifest, library: HomePluginDatabaseDeclaration, root: string) {
  const reads = new Map<string, ReadonlySet<string>>(), inserts = new Set<string>(), updates = new Map<string, string>();
  const revision = (table: string, column: string, keys: readonly string[]) => {
    reads.set(table, new Set([...keys, column]));
    inserts.add(table);
    updates.set(table, column);
  };
  for (const collection of pluginSyncLibraryManifest(manifest, library).sync?.collections ?? []) {
    const namespace = pluginSyncNamespace(manifest, collection.id);
    reads.set(`${namespace}_replica_state`, new Set(["id", "applying"]));
    inserts.add(`${namespace}_replica_changes`);
    if (collection.aggregates?.some(item => item.table === root && item.versionColumn)) {
      revision(`${namespace}_aggregate_editor_versions`, "version", ["key"]);
    }
    for (const item of collection.tracking ?? []) {
      if (item.table === root && item.revision) revision(item.revision.table, item.revision.column, item.revision.key.map(key => key.column));
    }
  }
  return { reads, inserts, updates };
}

type Replication = ReturnType<typeof artifactRowReplication>;

function rootPrograms(db: SqliteDatabase, table: string, expected: ReadonlyMap<string, string>): ReadonlySet<string> {
  const rows = db.prepare<[], { name: string; tbl_name: string; sql: string }>(
    `SELECT name, tbl_name, sql FROM ${ARTIFACT_HOME_SCHEMA}.sqlite_schema WHERE type='trigger'`,
  ).all();
  const actual = new Map(rows.map(row => [row.name, row.sql]));
  const programs = rows.filter(row => row.tbl_name === table);
  if ([...expected].some(([name, sql]) => actual.get(name) !== sql) || programs.some(row => row.sql !== expected.get(row.name))) throw denied();
  return new Set(programs.map(row => row.name));
}

function rowAuthorizer(codes: NonNullable<typeof sqliteRowAuthorizerCodes>, root: ProjectArtifactRoot, programs: ReadonlySet<string>, replication: Replication, writeColumns?: ReadonlySet<string>): SqliteAuthorizer {
  const { allow, deny: refuse } = codes, table = root.declaration.table;
  return (action, first, second, schema, origin) => {
    if (origin && (!writeColumns || !programs.has(origin))) return refuse;
    if (action === codes.select) return allow;
    if (action === codes.call && origin && (second === "json_array" || second === "max")) return allow;
    if (!first || schema !== ARTIFACT_HOME_SCHEMA) return refuse;
    if (action === codes.read && second && (first === table ? root.columns.has(second) : origin && replication.reads.get(first)?.has(second))) return allow;
    if (!writeColumns) return refuse;
    if (origin) {
      if (action === codes.insert && replication.inserts.has(first)) return allow;
      if (action === codes.update && second && replication.updates.get(first) === second) return allow;
    }
    return !origin && action === codes.update && first === table && second && writeColumns.has(second) ? allow : refuse;
  };
}

/** SQL and schema names come exclusively from the checked Manifest. Every caller value is bound to this one project and row. */
export function boundArtifactRootRow(db: SqliteDatabase, root: ProjectArtifactRoot, expected: ReadonlyMap<string, string>, replication: Replication,
  projectId: string, id: string): ArtifactRootRow {
  const codes = sqliteRowAuthorizerCodes;
  if (!codes) throw new ActionError("actions.service_unavailable", "当前宿主缺少 SQLite 原生语句授权");
  const { table, id_column, version_column, artifact_id_column, artifact_version_column, write_columns, pending_column } = root.declaration;
  const programs = rootPrograms(db, table, expected);
  const where = `${quoted(root.projectColumn)} COLLATE BINARY=? AND ${quoted(id_column)} COLLATE BINARY=?`;
  const guarded = <T>(run: () => T, columns?: ReadonlySet<string>): T => {
    db.setAuthorizer(rowAuthorizer(codes, root, programs, replication, columns));
    try { return run(); } finally { db.setAuthorizer(null); }
  };
  return {
    get inTransaction() { return db.inTransaction; },
    read() {
      const row = guarded(() => db.prepare<[string, string], PluginSqlRow>(`SELECT * FROM ${ARTIFACT_HOME_SCHEMA}.${quoted(table)} WHERE ${where}`).get(projectId, id));
      if (row && pending_column && row[pending_column] !== null) throw new ActionError("actions.conflict", "原发布仍待恢复，请从原入口完成后再固定");
      return row ?? null;
    },
    compareAndSet(version, artifact, changes, check) {
      const extras = Object.entries(changes);
      if (extras.some(([column]) => !write_columns.includes(column))) throw denied();
      const assignments = [[artifact_id_column, artifact.artifact_id], [artifact_version_column, artifact.version], ...extras] as const;
      const writes = new Set([version_column, ...assignments.map(([column]) => column)]);
      const revision = quoted(version_column);
      const pending = pending_column === undefined ? "" : ` AND ${quoted(pending_column)} IS NULL`;
      const sql = `UPDATE OR ABORT ${ARTIFACT_HOME_SCHEMA}.${quoted(table)} SET ${assignments.map(([column]) => `${quoted(column)}=?`).join(", ")}, ${revision}=${revision}+1`
        + ` WHERE ${where} AND ${revision}=?${pending}`;
      check();
      return guarded(() => db.prepare(sql).run(...assignments.map(([, value]) => value), projectId, id, version).changes === 1, writes);
    },
  };
}
