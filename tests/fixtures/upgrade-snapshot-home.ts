// A temporary Home with one small store, for the upgrade snapshot and restore tests. Nothing here touches a real Home.
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { acquireStorageOwner, captureUpgradeSnapshot, type UpgradeSnapshotUnit } from "@molis-ai/molis-work-storage";

export const STORE = "notes/notes.db";
export const V1 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);";
export const SIDECARS = ["-wal", "-shm", "-journal"] as const;
const CRASH = fileURLToPath(new URL("./upgrade-snapshot-crash.mjs", import.meta.url));

export const openNode = (path: string) => new DatabaseSync(path);
export const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
export const present = (file: string) => lstatSync(file, { throwIfNoEntry: false }) !== undefined;
export const sidecarsOf = (file: string) => SIDECARS.filter(suffix => present(file + suffix));
export const onStore = <T>(path: string, use: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(path); try { return use(db); } finally { db.close(); } };
export const versionOf = (path: string) => onStore(path, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
export const notesOf = (path: string) => onStore(path, db => db.prepare("SELECT * FROM notes ORDER BY id").all().map(row => ({ ...row })));

export function seedStore(file: string, journal: "WAL" | "DELETE" = "WAL"): void {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  try { db.exec(`PRAGMA journal_mode = ${journal}; ${V1} INSERT INTO notes VALUES ('1', 'a'), ('2', 'b'); PRAGMA user_version = 1;`); }
  finally { db.close(); }
}

/** Starts holding the Home's owner lock (`release` gives it up early), with one version-1 store and an area beside the Home for what must stay untouched. */
export function upgradeHome(t: TestContext, options: { readonly journal?: "WAL" | "DELETE"; readonly lock?: boolean } = {}) {
  const area = realpathSync(mkdtempSync(join(tmpdir(), "molis-upgrade-snapshot-")));
  const home = join(area, "home"), outside = join(area, "outside"), file = join(home, STORE);
  mkdirSync(home, { mode: 0o700 });
  mkdirSync(outside);
  seedStore(file, options.journal);
  const owner = options.lock === false ? undefined : acquireStorageOwner(home);
  let released = false;
  const release = () => { if (!released) owner?.release(); released = true; };
  t.after(() => { try { release(); } finally { rmSync(area, { recursive: true, force: true }); } });
  const unit = { owner: owner!, home, runId: "run-1", relativePath: STORE } satisfies UpgradeSnapshotUnit;
  return { area, home, outside, file, owner: owner!, unit, release, run: join(home, "upgrade", "run-1") };
}

export const capture = (unit: UpgradeSnapshotUnit) => captureUpgradeSnapshot(unit, openNode);

/** Everything the run directory holds, for checks over all of its bytes. */
export const runFiles = (run: string) => ({ snapshot: join(run, `${createHash("sha256").update(STORE).digest("hex")}.snapshot`), manifest: join(run, "manifest.json") });

/** Runs the operation in a child with the lock released; `kill` is the index of the file-system call that dies by SIGKILL. */
export function inChild(home: string, operation: "capture" | "restore", mode: { readonly kill: number } | "trace") {
  const result = spawnSync(process.execPath, [CRASH, home, STORE, "run-1", operation, mode === "trace" ? "trace" : String(mode.kill)], { env: process.env, encoding: "utf8" });
  return { killed: result.signal === "SIGKILL", status: result.status, stdout: result.stdout, stderr: result.stderr };
}
