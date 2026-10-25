import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { openBaselineHomeSqlite } from "@molis-ai/molis-work-storage";
import { DATASET_DATABASE, DatasetStore } from "@molis-ai/molis-work-plugin-dataset";
import { FORM_DATABASE, FormStore } from "@molis-ai/molis-work-plugin-form";
import { LINGGUANG_DATABASE, LingguangStore } from "@molis-ai/molis-work-plugin-lingguang";
import { PPT_DATABASE, PptStore } from "@molis-ai/molis-work-plugin-ppt";
import { TODO_DATABASE, TodoStore } from "@molis-ai/molis-work-plugin-todo";

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
const open = (home: string, declaration: { store_name: string; version: number; schema: string }) => openBaselineHomeSqlite(home, declaration.store_name, declaration);

export function openTodoStore(home: string, now?: () => Date): TodoStore {
  const db = open(home, TODO_DATABASE);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  return new TodoStore(sqlOf(db), atomically(db), () => db.close(), now);
}
export function openFormStore(home: string): FormStore {
  const db = open(home, FORM_DATABASE);
  return new FormStore(sqlOf(db), atomically(db), () => db.close());
}
export function openLingguangStore(home: string): LingguangStore {
  const db = open(home, LINGGUANG_DATABASE);
  return new LingguangStore(sqlOf(db), atomically(db), () => db.close());
}
export function openDatasetStore(home: string): DatasetStore {
  const db = open(home, DATASET_DATABASE);
  return new DatasetStore(sqlOf(db), atomically(db), () => db.close());
}
export function openPptStore(home: string): PptStore {
  const db = open(home, PPT_DATABASE);
  return new PptStore(sqlOf(db), atomically(db), () => db.close());
}
