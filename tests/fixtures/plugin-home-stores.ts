import { openPartitionPluginLibrary, partitionPluginScope, PLATFORM_PLUGIN_REGISTRATIONS, pluginSyncDatabaseDeclaration } from "@molis-ai/molis-work-app-local-host";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { applySqliteBaseline, homeSqlitePath, openBaselineHomeSqlite, openHomeSqliteDatabase, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { COGNIA_DATABASE, CogniaStore } from "@molis-ai/molis-work-plugin-cognia";
import { DATASET_DATABASE, DatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { FORM_DATABASE, FormStore } from "@molis-ai/molis-work-plugin-form";
import { JELLY_DATABASE, JellyStore } from "@molis-ai/molis-work-plugin-jelly";
import type { PluginDatabaseTransaction } from "@molis-ai/molis-work-contracts/platform/plugin";
import { LINGGUANG_DATABASE, LingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { PAGES_DATABASE, PagesStore, type PagesSql } from "@molis-ai/molis-work-plugin-pages";
import { PPT_DATABASE, PptStore } from "@molis-ai/molis-work-plugin-ppt";
import { TODO_DATABASE, TodoStore } from "@molis-ai/molis-work-plugin-todo";
import { WORKFLOWS_DATABASE, WorkflowsStore } from "@molis-ai/molis-work-plugin-workflows";

// A plugin's library over a file of a Home, for tests that look at a store directly. The plugins do not open their own files (PG-023):
// a running plugin is given its library by the Runtime (`services.database`); only this fixture, outside every plugin package, goes
// through the storage package, with the plugin's own declared baseline.

const sqlOf = (db: DatabaseSync) => ({
  get: (text: string, parameters: readonly SQLInputValue[] = []) => db.prepare(text).get(...parameters),
  all: (text: string, parameters: readonly SQLInputValue[] = []) => db.prepare(text).all(...parameters),
  run: (text: string, parameters: readonly SQLInputValue[] = []) => db.prepare(text).run(...parameters),
});
const atomically = (db: DatabaseSync) => <T>(run: () => T): T => {
  if (db.isTransaction) return run();
  db.exec("BEGIN IMMEDIATE");
  try { const result = run(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
};
// Seed the same complete library the Runtime opens, including platform-owned sync tables.
function completeDeclaration(declaration: { store_name: string; version: number; schema: string }) {
  const manifest = PLATFORM_PLUGIN_REGISTRATIONS.map(row => row.manifest).find(row => row.databases?.home?.store_name === declaration.store_name);
  return manifest?.databases?.home ? pluginSyncDatabaseDeclaration(manifest, manifest.databases.home) : declaration;
}
const open = (home: string, declaration: { store_name: string; version: number; schema: string }) => openBaselineHomeSqlite(home, declaration.store_name, completeDeclaration(declaration));

/**
 * A plugin's library in one partition (U2): `<partition root>/libraries/<store>.db`, opened the way the Host opens it for that partition's instance
 * — the partition root checked, the complete baseline (with the platform's sync tables) applied, the Home's storage space bound.
 */
function openPartition(home: string, partition: string, declaration: { store_name: string }): { db: DatabaseSync; file: string } {
  const manifest = PLATFORM_PLUGIN_REGISTRATIONS.map(row => row.manifest).find(row => row.databases?.partition?.store_name === declaration.store_name);
  if (!manifest?.databases?.partition) throw new Error(`没有申报分区库 ${declaration.store_name} 的内置插件`);
  const scope = partitionPluginScope(home, partition, manifest.plugin_id, `${manifest.plugin_id}-test`);
  const library = openPartitionPluginLibrary(scope, home, pluginSyncDatabaseDeclaration(manifest, manifest.databases.partition));
  // Opened with its baseline and space by the Host's own path, then handed to the store as a plain connection to the same file.
  library.close();
  const db = new DatabaseSync(scope.libraryPath(declaration.store_name));
  // The journal mode stays the Host's: a partition library joins the project database in one rollback-journal commit (pin and promote).
  db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
  return { db, file: scope.libraryPath(declaration.store_name) };
}

/** Todo's library in one partition (batch 108): the personal space unless a test names a project. */
export function openTodoStore(home: string, now?: () => Date, partition = "personal"): TodoStore {
  const { db } = openPartition(home, partition, TODO_DATABASE);
  return new TodoStore(sqlOf(db), atomically(db), () => db.close(), now);
}
export function openFormStore(home: string, partition: string): FormStore {
  const { db } = openPartition(home, partition, FORM_DATABASE);
  return new FormStore(sqlOf(db), partition, atomically(db), () => db.close());
}
export function openLingguangStore(home: string, partition: string): LingguangStore {
  const { db } = openPartition(home, partition, LINGGUANG_DATABASE);
  return new LingguangStore(sqlOf(db), partition, atomically(db), () => db.close());
}
export function openDatasetStore(home: string, partition: string): DatasetStore {
  const { db } = openPartition(home, partition, DATASET_DATABASE);
  return new DatasetStore(sqlOf(db), partition, atomically(db), () => db.close());
}
export function openPptStore(home: string, partition: string): PptStore {
  const { db } = openPartition(home, partition, PPT_DATABASE);
  return new PptStore(sqlOf(db), partition, atomically(db), () => db.close());
}
/** Where a partition's library of one of these plugins lives, for tests that look at the file itself. */
/** Images' library in one partition (batch 108), opened by the Host's own path; the test writes its rows directly. */
export function openImagesDatabase(home: string, partition: string): DatabaseSync {
  return openPartition(home, partition, { store_name: "images" }).db;
}
export const partitionLibraryFile = (home: string, partition: string, store: string) => partitionPluginScope(home, partition, store, `${store}-test`).libraryPath(store);
/** A test's own connection to the library a plugin keeps in one partition (U2); the plugin must have made it already. */
export const openPartitionLibraryDatabase = (home: string, partition: string, store: string) =>
  openSqliteConnection(partitionLibraryFile(home, partition, store), { fileMustExist: true });

/** A library opened and given its baseline the way these three stores always were: the database first, then the baseline on it. */
function openWithBaseline(home: string, declaration: { store_name: string; version: number; schema: string }, pragmas: string): DatabaseSync {
  const db = openHomeSqliteDatabase(home, declaration.store_name);
  try { db.exec(pragmas); applySqliteBaseline(db, homeSqlitePath(home, declaration.store_name), completeDeclaration(declaration)); return db; }
  catch (error) { db.close(); throw error; }
}
/** Jelly's rows over one Home, the Runtime's shape without a caller: `write` runs in one transaction. */
export interface JellyTestStore { read<T>(run: (store: JellyStore) => T): T; write<T>(run: (store: JellyStore) => T): T; close(): void }
export function openJellyStore(home: string): JellyTestStore {
  const db = openWithBaseline(home, JELLY_DATABASE, "PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  const run = atomically(db);
  const transaction: PluginDatabaseTransaction = {
    get: (query: string, parameters: readonly SQLInputValue[] = []) => db.prepare(query).get(...parameters) ?? null,
    all: (query: string, parameters: readonly SQLInputValue[] = []) => db.prepare(query).all(...parameters),
    run: (query: string, parameters: readonly SQLInputValue[] = []) => db.prepare(query).run(...parameters),
    savepoint: () => { throw new Error("Jelly 不用保存点"); },
  };
  return { read: work => work(new JellyStore(transaction)), write: work => run(() => work(new JellyStore(transaction))), close: () => db.close() };
}
/** Cognia's library in one partition (batch 108); the personal space's unless a test names another. */
export function openCogniaStore(home: string, partition = "personal"): CogniaStore {
  const { db } = openPartition(home, partition, COGNIA_DATABASE);
  return new CogniaStore(sqlOf(db), atomically(db), () => db.close());
}
export function openWorkflowsStore(home: string, partition: string): WorkflowsStore {
  const { db } = openPartition(home, partition, WORKFLOWS_DATABASE);
  return new WorkflowsStore(sqlOf(db), partition, () => db.close());
}

/**
 * Generation attempts a test process started, per library file: true while in progress, false once the call ended without being allowed
 * to write. In a running plugin that memory is one per instance (plugin.ts); the stores a test opens on one file share this one.
 */
const pagesAttempts = new Map<string, Map<string, boolean>>();
export function openPagesStore(home: string, partition: string): PagesStore {
  const { db, file } = openPartition(home, partition, PAGES_DATABASE);
  let attempts = pagesAttempts.get(file);
  if (!attempts) pagesAttempts.set(file, attempts = new Map());
  const sql: PagesSql = {
    get: (text, parameters = []) => db.prepare(text).get(...parameters),
    all: (text, parameters = []) => db.prepare(text).all(...parameters),
    run: (text, parameters = []) => db.prepare(text).run(...parameters),
  };
  const immediate = <T>(run: () => T): T => { db.exec("BEGIN IMMEDIATE"); try { const result = run(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } };
  return new PagesStore(sql, partition, attempts, immediate, () => db.close());
}
