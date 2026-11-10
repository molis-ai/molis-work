// Plugins that exist only for a test, and the libraries their tables live in, for the upgrade steps of a plugin's tables
// (specs/upgrade-continuity/upgrade-chain-design.md §2.4: UPG1-10, UPG1-14, S-147). A project's library here is one this build makes
// (`seedDemoBoard`), copied from one template per test file; nothing here opens a Home or a real store.
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, type TestContext } from "node:test";
import type { PluginDatabaseDeclaration, PluginDatabaseUpgradeStep, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openProjectPluginDatabases, seedDemoBoard, upgradePluginTables } from "@molis-ai/molis-work-app-local-host";
import { openSqliteConnection, type SqliteDatabase } from "@molis-ai/molis-work-storage";

export const PROBE_ID = "io.molis.work.example.probe";

export const declaration = (version: number, schema: string, upgrades?: readonly PluginDatabaseUpgradeStep[], store = "probe"): PluginDatabaseDeclaration =>
  ({ store_name: store, version, read_permission: `${store}:read`, write_permission: `${store}:write`, schema, ...(upgrades ? { upgrades } : {}) });

/** A sync collection that tracks `table` by its `id`; `schemaVersion` is part of the technical tables' names. */
export const tracking = (table: string, schemaVersion = 1): NonNullable<PluginManifest["sync"]> =>
  ({ protocol_version: 1, collections: [{ id: "notes", title: "Notes", schema_version: schemaVersion, requires: [], tracking: [{ table, key: [{ column: "id" }] }] }] });

/** A plugin of the Host's own build, as far as its tables go: the Manifest's database, and nothing it would run. */
export function probeManifest(project: PluginDatabaseDeclaration, options: { readonly id?: string; readonly sync?: PluginManifest["sync"]; readonly home?: PluginDatabaseDeclaration } = {}): PluginManifest {
  const id = options.id ?? PROBE_ID;
  return { schema_version: 1, host_api_version: 1, plugin_id: id, version: `1.0.${project.version}`, name: id, kind: "app",
    publisher: { publisher_id: "molis", signature: `probe-${id}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] }, actions: [],
    databases: { project, ...(options.home ? { home: options.home } : {}) }, ...(options.sync ? { sync: options.sync } : {}) };
}

/** One project's library made by this build, for the whole test file: each test gets a copy. Called once, outside any test. */
export function libraryTemplate(): string {
  const area = realpathSync(mkdtempSync(join(tmpdir(), "molis-plugin-upgrade-")));
  after(() => rmSync(area, { recursive: true, force: true }));
  const file = join(area, "template.db");
  seedDemoBoard(file);
  return file;
}

export interface Library { readonly file: string; readonly db: SqliteDatabase; close(): void }

/** A copy of the template with `manifests`' tables opened the way the Host opens them; closed after the test. */
export function projectLibrary(t: TestContext, template: string, ...manifests: readonly PluginManifest[]): Library {
  const area = realpathSync(mkdtempSync(join(tmpdir(), "molis-plugin-upgrade-case-")));
  const file = join(area, "molis-work.db");
  copyFileSync(template, file);
  const db = openSqliteConnection(file);
  let open = true;
  const close = () => { if (open) { open = false; db.close(); } };
  t.after(() => { close(); rmSync(area, { recursive: true, force: true }); });
  for (const outcome of openProjectPluginDatabases(db, file, manifests).values()) if ("error" in outcome) throw outcome.error;
  return { file, db, close };
}

/** The plugin's upgrade, by the Host's function: `ok`, or the code it was refused with. */
export function upgradeCode(db: SqliteDatabase, manifest: PluginManifest): string {
  try { upgradePluginTables(db, "projects/probe/molis-work.db", manifest); return "ok"; }
  catch (error) { return String((error as { code?: unknown }).code ?? error); }
}

/** How the plugin's own tables stand when the library opens: `ok`, or the refusal that stops only it. */
export function openCode(db: SqliteDatabase, file: string, manifest: PluginManifest): string {
  const outcome = openProjectPluginDatabases(db, file, [manifest]).get(manifest.plugin_id);
  return outcome && "error" in outcome ? String((outcome.error as { code?: unknown }).code) : "ok";
}

const digest = (rows: readonly unknown[]) => createHash("sha256").update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort())).digest("hex");

export interface LibraryState {
  /** Every row of `sqlite_schema`, as SQLite keeps it. */
  readonly schema: ReadonlyMap<string, string>;
  /** Each table's rows, as one digest, in no particular order; the ledger by its rows, as `plugin_project_databases#<plugin_id>`. */
  readonly tables: ReadonlyMap<string, string>;
}

/** A plugin's row in the ledger, by the name `libraryState` gives it. */
export const ledgerRow = (pluginId: string) => `plugin_project_databases#${pluginId}`;

const quoted = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** The whole library as it stands: what a refusal must leave as it was, the platform's tables and every other plugin's included. */
export function libraryState(db: Pick<SqliteDatabase, "prepare">): LibraryState {
  const rows = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_schema").all() as Array<{ type: string; name: string; tbl_name: string; sql: string | null }>;
  const tables = rows.filter(row => row.type === "table" && row.name !== "plugin_project_databases");
  const ledger = rows.some(row => row.type === "table" && row.name === "plugin_project_databases")
    ? db.prepare("SELECT * FROM plugin_project_databases").all() as Array<{ plugin_id: string }> : [];
  return {
    schema: new Map(rows.map(row => [`${row.type}:${row.name}`, JSON.stringify(row)])),
    tables: new Map([...tables.map(row => [row.name, digest(db.prepare(`SELECT * FROM ${quoted(row.name)}`).all())] as const),
      ...ledger.map(row => [ledgerRow(row.plugin_id), JSON.stringify(row)] as const)]),
  };
}

/** What is not `mine`: tables by name, schema rows by the table they are on. */
export function othersOf(state: LibraryState, mine: readonly string[]): { readonly schema: string[]; readonly tables: string[] } {
  const own = new Set(mine.map(name => name.toLowerCase()));
  return {
    schema: [...state.schema.values()].filter(row => !own.has(String((JSON.parse(row) as { tbl_name: string }).tbl_name).toLowerCase())).sort(),
    tables: [...state.tables].filter(([name]) => !own.has(name.toLowerCase())).map(([name, rows]) => `${name}:${rows}`).sort(),
  };
}

/** The tables and objects of `mine` alone. */
export function mineOf(state: LibraryState, mine: readonly string[]): { readonly schema: string[]; readonly tables: string[] } {
  const own = new Set(mine.map(name => name.toLowerCase()));
  return {
    schema: [...state.schema.values()].filter(row => own.has(String((JSON.parse(row) as { tbl_name: string }).tbl_name).toLowerCase())).sort(),
    tables: [...state.tables].filter(([name]) => own.has(name.toLowerCase())).map(([name, rows]) => `${name}:${rows}`).sort(),
  };
}

/** The tables and technical tables of a plugin's tables as its ledger row records them. */
export function ledgerObjects(db: Pick<SqliteDatabase, "prepare">, pluginId: string): string[] {
  const row = db.prepare("SELECT tables_json FROM plugin_project_databases WHERE plugin_id = ?").get(pluginId) as { tables_json: string } | undefined;
  return row ? JSON.parse(row.tables_json) as string[] : [];
}

export const foreignKeys = (db: Pick<SqliteDatabase, "prepare">) => Number((db.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number }).foreign_keys);
