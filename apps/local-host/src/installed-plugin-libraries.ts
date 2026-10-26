import { createHash } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginErrors, type HomePluginDatabaseDeclaration, type HomeStoreDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import { describeSqliteBaseline, describeSqliteSchema, snapshotFileStat, openBaselineHomeSqlite, openReadOnlyHomeSqlite, type HomeStoreRegistry, type SqliteBaseline } from "@molis-ai/molis-work-storage";

// A library in the Home for a plugin the Host did not ship (PG-022 P1b, specs/repository-anti-corruption/slices/pg022-manifest-declarations.md).
// The plugin declares it in its Manifest (`databases.home`), like a shipped one; what a shipped plugin has from the Host's store registry
// (`home-stores.ts`) an installed one has from this ledger: one row per plugin, which library it made, under which publisher, at which
// version and schema. The publisher is the install record's, fixed when the plugin was installed; the first value is the Manifest's own
// word at install time, and that nobody checks the signature there is PG-001's gap (the `ac-trust` line). What the ledger promises is only
// that once a library has an owner, no other publisher's plugin opens it and a shipped store is never taken. Purge reads the same rows.

export const installedLibraryErrors = defineErrorCodes("plugin.home_database", {
  /** The name is a shipped store's, a directory of the Home no row made, or another plugin's library. */
  object_taken: "conflict",
  publisher_mismatch: "forbidden",
  version_mismatch: "conflict",
  shape_mismatch: "conflict",
});

/** A plugin library's name: one directory of the Home. */
export const INSTALLED_LIBRARY_NAME = /^[a-z][a-z0-9-]*$/u;

const LEDGER_BASELINE: SqliteBaseline = {
  version: 1,
  schema: `
    CREATE TABLE IF NOT EXISTS plugin_home_libraries (
      plugin_id TEXT PRIMARY KEY,
      publisher_signature TEXT NOT NULL,
      store_name TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL CHECK (version >= 1),
      schema_digest TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `,
};

/** The ledger's own store in the Home's registry: removed with the others by `uninstall --purge-user-data`. */
export const INSTALLED_LIBRARIES_HOME_STORE: HomeStoreDeclaration = { path: "plugin-libraries", library: { baseline: LEDGER_BASELINE } };

/** The installation a library is claimed for: what the install record holds, not what the Manifest says now. */
export interface InstalledLibraryOwner {
  readonly plugin_id: string;
  readonly publisher_signature: string;
}

interface LedgerRow { plugin_id: string; publisher_signature: string; store_name: string; version: number; schema_digest: string }

/** Actual installed library identities and versions, read by their owner for the Home registry's offline enumeration. */
export function installedLibrarySnapshots(home: string, reserved: HomeStoreRegistry): readonly LedgerRow[] {
  const file = join(home, INSTALLED_LIBRARIES_HOME_STORE.path, "plugin-libraries.db");
  if (!existsSync(file)) return [];
  snapshotFileStat(file);
  const ledger = openReadOnlyHomeSqlite(home, INSTALLED_LIBRARIES_HOME_STORE.path);
  try {
    const version = Number(ledger.prepare("PRAGMA user_version").get()?.user_version);
    if (version !== LEDGER_BASELINE.version || JSON.stringify(describeSqliteSchema(ledger)) !== JSON.stringify(describeSqliteBaseline(LEDGER_BASELINE))) {
      throw installedLibraryErrors.shape_mismatch("安装库账本不是现行版本或完整结构，未枚举快照");
    }
    const rows: LedgerRow[] = [];
    for (const row of ledger.prepare("SELECT plugin_id, publisher_signature, store_name, version, schema_digest FROM plugin_home_libraries ORDER BY store_name").all()) {
      if (typeof row.plugin_id !== "string" || typeof row.publisher_signature !== "string" || typeof row.store_name !== "string"
        || typeof row.version !== "number" || typeof row.schema_digest !== "string" || !INSTALLED_LIBRARY_NAME.test(row.store_name)
        || holderOf(row.store_name, reserved) !== undefined || !Number.isSafeInteger(row.version) || row.version < 1 || !/^[0-9a-f]{64}$/u.test(row.schema_digest)) {
        throw installedLibraryErrors.shape_mismatch("安装库账本含无效归属、路径或版本，未枚举快照");
      }
      rows.push({ plugin_id: row.plugin_id, publisher_signature: row.publisher_signature, store_name: row.store_name, version: row.version, schema_digest: row.schema_digest });
    }
    return rows;
  } finally { ledger.close(); }
}

/** Top-level directories of the Home the installer owns without registering them whole (their files are registered one by one, or are the program's). */
const INSTALLER_DIRECTORIES: readonly string[] = ["config", "bin", "releases"];

/** Who holds a top-level name of the Home: a registered store, a store registered inside it, or the installer. */
function holderOf(name: string, reserved: HomeStoreRegistry): string | undefined {
  const store = reserved.get(name) ?? reserved.stores.find(candidate => candidate.path.startsWith(`${name}/`));
  if (store) return `${store.owner} 的 ${store.path}`;
  return INSTALLER_DIRECTORIES.includes(name) ? "安装器的目录" : undefined;
}

const digestOf = (declaration: HomePluginDatabaseDeclaration) => createHash("sha256").update(declaration.schema).digest("hex");

/**
 * Open an installed plugin's library, making it the first time. In one ledger transaction: with no row for the plugin, the name must
 * be free (not a store the Host's registry holds, not another plugin's row, no directory of that name in the Home) and `open` makes the
 * library and the row is written with it; with a row, the publisher must be the one that made it, and the name, version and schema
 * the ones recorded. A refusal opens nothing and changes nothing: a library `open` made for a row that was not kept is closed and
 * removed again. `reserved` is the Home's store registry.
 */
export function openInstalledPluginLibrary<Opened extends { close(): void }>(home: string, owner: InstalledLibraryOwner,
  declaration: HomePluginDatabaseDeclaration, reserved: HomeStoreRegistry, open: () => Opened, now: () => Date = () => new Date()): Opened {
  const name = declaration.store_name, who = `插件 ${owner.plugin_id} 的 Home 库 ${name}`;
  if (!INSTALLED_LIBRARY_NAME.test(name)) throw pluginErrors.declaration_invalid(`${who}：库名必须是一个目录名（小写字母开头，只含小写字母、数字和连字符）`);
  if (declaration.partition !== undefined) {
    throw pluginErrors.declaration_invalid(`${who}：按项目分开的库只有宿主启动名单上的插件能有，装进来的插件现在没有`);
  }
  const holder = holderOf(name, reserved);
  if (holder) throw installedLibraryErrors.object_taken(`${who}：库名是 Home 里${holder}，装进来的插件不能用`);
  const ledger = openBaselineHomeSqlite(home, INSTALLED_LIBRARIES_HOME_STORE.path, LEDGER_BASELINE);
  let opened: Opened | undefined, made = false;
  try {
    ledger.exec("PRAGMA busy_timeout = 5000");
    ledger.exec("BEGIN IMMEDIATE");
    const digest = digestOf(declaration);
    const row = ledger.prepare("SELECT plugin_id, publisher_signature, store_name, version, schema_digest FROM plugin_home_libraries WHERE plugin_id = ?")
      .get(owner.plugin_id) as LedgerRow | undefined;
    if (row) {
      if (row.publisher_signature !== owner.publisher_signature) throw installedLibraryErrors.publisher_mismatch(`${who}：这个插件 ID 的库是另一个发布者建的，换了发布者不能打开`);
      if (row.store_name !== name) throw installedLibraryErrors.shape_mismatch(`${who}：账本记的库名是 ${row.store_name}，这次声明的是 ${name}`);
      if (Number(row.version) !== declaration.version) {
        throw installedLibraryErrors.version_mismatch(`${who}：账本记的是第 ${row.version} 版，这次声明的是第 ${declaration.version} 版`);
      }
      if (row.schema_digest !== digest) throw installedLibraryErrors.shape_mismatch(`${who}：声明的表与账本记下的不同`);
    } else {
      const other = ledger.prepare("SELECT plugin_id FROM plugin_home_libraries WHERE store_name = ?").get(name) as { plugin_id: string } | undefined;
      if (other) throw installedLibraryErrors.object_taken(`${who}：库名已归插件 ${other.plugin_id}`);
      if (existsSync(join(home, name))) throw installedLibraryErrors.object_taken(`${who}：Home 里已经有叫 ${name} 的目录，不是这个插件建的`);
      made = true;
    }
    opened = open();
    if (made) {
      ledger.prepare("INSERT INTO plugin_home_libraries (plugin_id, publisher_signature, store_name, version, schema_digest, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(owner.plugin_id, owner.publisher_signature, name, declaration.version, digest, now().toISOString());
    }
    ledger.exec("COMMIT");
    return opened;
  } catch (error) {
    // SQLite may already have ended the transaction (SQLITE_FULL, SQLITE_IOERR); keep the original error rather than a second one.
    try { ledger.exec("ROLLBACK"); } catch { /* the transaction is already gone */ }
    try { opened?.close(); } catch { /* the library never opened for this call */ }
    if (made) rmSync(join(home, name), { recursive: true, force: true });
    throw error;
  } finally {
    ledger.close();
  }
}

/**
 * The directories of the libraries installed plugins made, for `uninstall --purge-user-data`. A row is only a name the Host wrote, but
 * it becomes a path that is deleted, so a name that is not one plain directory name, or that a registered store has, is not listed.
 */
export function installedLibraryPaths(home: string, reserved: HomeStoreRegistry): string[] {
  if (!existsSync(join(home, INSTALLED_LIBRARIES_HOME_STORE.path, `${INSTALLED_LIBRARIES_HOME_STORE.path}.db`))) return [];
  const ledger = openReadOnlyHomeSqlite(home, INSTALLED_LIBRARIES_HOME_STORE.path);
  try {
    const rows = ledger.prepare("SELECT store_name FROM plugin_home_libraries ORDER BY store_name").all() as Array<{ store_name: string }>;
    return rows.map(row => row.store_name).filter(name => INSTALLED_LIBRARY_NAME.test(name) && holderOf(name, reserved) === undefined).map(name => join(home, name));
  } finally { ledger.close(); }
}
