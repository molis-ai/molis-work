import { createHash } from "node:crypto";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { openTestSqlite, type SqliteDatabase } from "@molis-ai/molis-work-test-kit/sqlite";
import { runLocalCli } from "@molis-ai/molis-work-app-local-host";

export interface InjectedSnapshotChange {
  readonly mode: number;
  readonly mtime: number;
  readonly sha256: string;
}

/** Mutate the actual source at a real payload/backup boundary; all copying and validation stay production code. */
export function changeSnapshotSource(kind: string, source: string, observed: (state: InjectedSnapshotChange) => void) {
  let changed = false;
  const mutate = () => {
    if (changed) return;
    changed = true;
    if (kind.endsWith("replace")) {
      const previous = source + ".fixture-original";
      fs.renameSync(source, previous);
      fs.copyFileSync(previous, source);
      fs.unlinkSync(previous);
    } else if (kind === "file-append") fs.appendFileSync(source, "external change during copy");
    else if (kind === "file-truncate") fs.truncateSync(source, 0);
    else {
      const writer = new DatabaseSync(source);
      try {
        if (kind === "sqlite-version") writer.exec("PRAGMA user_version = 999");
        else if (kind === "sqlite-owner") writer.prepare("UPDATE catalog_meta SET value=? WHERE key='owner'").run("replacement-owner");
        else if (kind === "sqlite-schema") writer.exec("CREATE TABLE external_change (value TEXT)");
        else throw new Error("Unknown snapshot fixture mutation");
      } finally { writer.close(); }
    }
    const info = fs.statSync(source);
    observed({ mode: info.mode & 0o777, mtime: info.mtimeMs, sha256: createHash("sha256").update(fs.readFileSync(source)).digest("hex") });
  };
  if (kind.startsWith("file-")) {
    const write = fs.writeSync;
    fs.writeSync = function (...args: unknown[]): number {
      const result = Reflect.apply(write, fs, args);
      mutate();
      return result;
    };
    syncBuiltinESMExports();
    return () => { fs.writeSync = write; syncBuiltinESMExports(); };
  }
  // Hook the same driver's backup method that the snapshot opens through storage.
  const probe = openTestSqlite(":memory:");
  const prototype: Pick<SqliteDatabase, "backup"> = Object.getPrototypeOf(probe);
  probe.close();
  const backup = prototype.backup;
  prototype.backup = function (this: SqliteDatabase, ...args: Parameters<SqliteDatabase["backup"]>) {
    if (this.name === source) mutate();
    return Reflect.apply(backup, this, args);
  };
  return () => { prototype.backup = backup; };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [kind, source, home, destination] = process.argv.slice(2);
  if (!kind || !source || !home || !destination) throw new Error("Snapshot fixture arguments required");
  const restore = changeSnapshotSource(kind, source, state => process.send?.({ phase: "source-changed", state }));
  try {
    process.exitCode = await runLocalCli(["home", "snapshot", "--home", home, "--to", destination, "--json"], {
      defaultSourceDirectory: () => { throw new Error("Offline snapshot cannot inspect installation"); },
      withCatalog: async () => { throw new Error("Offline snapshot cannot construct Catalog"); },
      runPlugin: async () => { throw new Error("Offline snapshot cannot enter plugins"); },
    });
  } finally {
    restore();
    process.disconnect();
  }
}
