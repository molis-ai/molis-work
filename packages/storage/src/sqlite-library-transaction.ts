import type { Stats } from "node:fs";
import { pathToFileURL } from "node:url";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SqliteDatabase } from "./sqlite-connection.js";
import { snapshotFileStat } from "./snapshot-files.js";
import { assertSqliteLibraryReady } from "./sqlite-rollback-policy.js";

const sameNode = (a: Stats, b: Stats) => a.ino === b.ino && a.dev === b.dev;
const wrongLibrary = () => new ActionError("actions.forbidden", "本次保存的存储库已变化，请重新打开当前项目。");
const wrongMode = () => new ActionError("actions.service_unavailable", "本次保存需要共同提交的存储库，请重新启动当前 Home 后重试。");

/** Join an existing library to the owner's live connection; a single native COMMIT covers both files. */
export function withSqliteLibraryTransaction<T>(db: SqliteDatabase, library: {
  readonly path: string;
  readonly schema: string;
  readonly identity: { readonly database: Stats; readonly library: Stats };
  /** The composition owner verifies current library versions, space and business ownership inside the transaction. */
  check(): void;
  /** Record successful submission before DETACH or other cleanup can fail. */
  committed?(): void;
}, write: () => T): T {
  if (db.inTransaction || db.name === ":memory:" || db.name === "") throw wrongLibrary();
  assertSqliteLibraryReady(db.name);
  assertSqliteLibraryReady(library.path);
  const { database: original, library: joined } = library.identity;
  const checkFiles = () => {
    if (original.dev !== joined.dev || sameNode(original, joined)
      || !sameNode(original, snapshotFileStat(db.name)) || !sameNode(joined, snapshotFileStat(library.path))) throw wrongLibrary();
  };
  checkFiles();
  const databases = db.pragma("database_list") as Array<{ name: string; file: string }>;
  if (databases.some(row => row.name !== "main" && row.name !== "temp")
    || databases.find(row => row.name === "main")?.file !== db.name) throw wrongLibrary();
  if (db.pragma("main.journal_mode", { simple: true }) !== "delete" || db.pragma("main.synchronous", { simple: true }) !== 3) throw wrongMode();
  const schema = `"${library.schema.replaceAll('"', '""')}"`;
  const url = pathToFileURL(library.path);
  url.searchParams.set("mode", "rw");
  const previousTimeout = db.pragma("busy_timeout", { simple: true });
  db.pragma("busy_timeout=100");
  try {
    db.prepare(`ATTACH DATABASE ? AS ${schema}`).run(url.href);
    try {
      if (db.pragma(`${schema}.journal_mode`, { simple: true }) !== "delete") throw wrongMode();
      db.pragma(`${schema}.synchronous=EXTRA`);
      if (db.pragma(`${schema}.synchronous`, { simple: true }) !== 3) throw wrongMode();
      const result = db.transaction(() => {
        checkFiles(); library.check();
        const value = write();
        checkFiles(); library.check();
        return value;
      }).immediate();
      library.committed?.();
      return result;
    } finally {
      try { db.exec(`DETACH DATABASE ${schema}`); }
      catch (error) { db.close(); throw error; }
    }
  } finally { if (db.open) db.pragma(`busy_timeout=${previousTimeout}`); }
}
