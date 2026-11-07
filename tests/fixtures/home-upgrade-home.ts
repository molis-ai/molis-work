// Temporary Homes and test baselines for the upgrade process. No real store changes version and nothing here touches a real Home:
// every descriptor is registered by the test that uses it, for as long as it runs.
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { registerHomeUpgradeDescriptors, type HomeUpgradeDescriptor } from "@molis-ai/molis-work-app-local-host";
import { bindDatabaseSpace, ensureStorageSpace, homeSqlitePath, LocalCatalogMetadata, sqliteVersionRefusal, type SqliteBaseline, type SqliteBaselineDatabase, type StorageSpace } from "@molis-ai/molis-work-storage";

export const V1 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);";
export const V2 = "CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL, tag TEXT NOT NULL DEFAULT '');";
export const ADD_TAG = "ALTER TABLE notes ADD COLUMN tag TEXT NOT NULL DEFAULT ''";
export const BASELINE_V2: SqliteBaseline = { version: 2, schema: V2, upgrades: [{ from: 1, sql: ADD_TAG }] };

export const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");
export const present = (file: string) => lstatSync(file, { throwIfNoEntry: false }) !== undefined;
export const onStore = <T>(file: string, use: (db: DatabaseSync) => T): T => { const db = new DatabaseSync(file); try { return use(db); } finally { db.close(); } };
export const versionOf = (file: string) => onStore(file, db => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
export const notesOf = (file: string) => onStore(file, db => db.prepare("SELECT * FROM notes ORDER BY id").all().map(row => ({ ...row })));
export const openNode = (file: string) => new DatabaseSync(file);

/** A store where the Home keeps its libraries, so the real open paths reach it: `<home>/<name>/<name>.db`. */
export const storePath = (home: string, name: string) => homeSqlitePath(home, name);
export const relativeStore = (name: string) => `${name}/${name}.db`;

/** A store at `version`, bound to `space` like every Home library. DELETE journal, so its bytes are its baseline without any checkpoint. */
export function seedStore(home: string, name: string, options: { readonly version?: number; readonly space?: StorageSpace | null; readonly schema?: string; readonly journal?: "WAL" | "DELETE" } = {}): string {
  const file = storePath(home, name);
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(file);
  try {
    db.exec(`PRAGMA journal_mode = ${options.journal ?? "DELETE"}; ${options.schema ?? V1} INSERT INTO notes (id, body) VALUES ('1', 'a'), ('2', 'b'); PRAGMA user_version = ${options.version ?? 1};`);
    const space = options.space === undefined ? ensureStorageSpace(home) : options.space;
    if (space) bindDatabaseSpace(db, space);
  } finally { db.close(); }
  return file;
}

export function upgradeTestHome(t: TestContext) {
  const area = realpathSync(mkdtempSync(join(tmpdir(), "molis-home-upgrade-")));
  const home = join(area, "home"), outside = join(area, "outside");
  mkdirSync(home, { mode: 0o700 });
  mkdirSync(outside);
  t.after(() => rmSync(area, { recursive: true, force: true }));
  return { area, home, outside, lock: join(home, "agent-runtime") };
}

export const notesDescriptor = (name: string, overrides: Partial<HomeUpgradeDescriptor> = {}): HomeUpgradeDescriptor =>
  ({ owner: "tests/notes", pattern: relativeStore(name), baseline: BASELINE_V2, open: openNode, ...overrides });

/** A step that does its change and then fails, so only a rollback or a restore can undo it. */
export const failingBaseline = (message = "the step's own words"): SqliteBaseline =>
  ({ version: 2, schema: V2, upgrades: [{ from: 1, run: db => { db.exec(ADD_TAG); throw new Error(message); } }] });

export function useDescriptors(t: TestContext, ...descriptors: readonly HomeUpgradeDescriptor[]): () => void {
  const stop = registerHomeUpgradeDescriptors(() => descriptors);
  t.after(stop);
  return stop;
}

export const ledgerFile = (home: string) => join(home, "upgrade", "ledger.json");
export const stampFile = (home: string) => join(home, "upgrade", "state.json");

export interface LedgerUnitOnDisk { kind: string; owner: string; relative_path: string; group: string | null; from: number; to: number; state: string; error: { code: string; reason: string } | null }
export interface LedgerOnDisk { schema_version: number; home_identity: string; run_id: string; from: string | null; to: string; started_at: string; units: LedgerUnitOnDisk[] }

export const ledgerOf = (home: string) => JSON.parse(readFileSync(ledgerFile(home), "utf8")) as LedgerOnDisk;
export const unitOf = (home: string, name: string) => ledgerOf(home).units.find(unit => unit.relative_path === relativeStore(name));
export const writeLedger = (home: string, ledger: LedgerOnDisk) => writeFileSync(ledgerFile(home), JSON.stringify(ledger), { mode: 0o600 });

export const catalogFile = (home: string) => join(home, "projects", "catalog.db");
export const PROBE_TABLE = "CREATE TABLE upgrade_probe (id INTEGER)";
export const catalogDescriptor = (overrides: Partial<HomeUpgradeDescriptor> = {}): HomeUpgradeDescriptor =>
  ({ owner: "tests/catalog", pattern: "projects/catalog.db", baseline: { version: 2, schema: PROBE_TABLE, upgrades: [{ from: 1, sql: PROBE_TABLE }] }, open: openNode, ...overrides });

/** A Home with a real project in its real catalog, marked as one version older for `catalogAtBaseline`. */
export async function catalogHome(t: TestContext, version = 1) {
  const f = upgradeTestHome(t);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: f.home });
  const project = await catalog.createProject({ display_name: "Kept project", actor_id: "fixture" });
  catalog.close();
  onStore(catalogFile(f.home), db => db.exec(`PRAGMA user_version = ${version}`));
  return { ...f, project, catalog: catalogFile(f.home) };
}

/**
 * The real catalog's version is not on a baseline until U1-d, so an entry cannot yet see a low one on its own. This makes the catalog's one
 * version read refuse the way a baseline will, with the public refusal, and every path around it stays real.
 */
export function catalogAtBaseline(t: TestContext, expected = 2): void {
  const real = LocalCatalogMetadata.prototype.version;
  t.mock.method(LocalCatalogMetadata.prototype, "version", function (this: LocalCatalogMetadata) {
    const db: SqliteBaselineDatabase = Reflect.get(this, "db");
    const found = Number((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version);
    if (found !== expected) throw sqliteVersionRefusal("projects/catalog.db", found, expected);
    return real.call(this);
  });
}
