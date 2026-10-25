import { existsSync } from "node:fs";
import { homeSqlitePath, openBaselineHomeSqlite, type HomeStoreDeclaration, type SqliteBaseline } from "@molis-ai/molis-work-storage";

/**
 * The local directories the person let a plugin read (PG-049, user 2026-10-25): each grant stands until the person takes it back in
 * Settings › 本机目录, for one plugin installation (its upgrades keep it), in one project ('' for a Home-level activation), for the
 * person who chose it. The directory's real path and its device and inode are kept, so a folder moved, swapped or replaced by a link
 * is not the one granted. Every read is recorded against its grant: who started the call and how it ended, never a file name or
 * content. An uninstall and a project's deletion take their grants and records with them.
 */
const DIRECTORY_GRANTS_BASELINE: SqliteBaseline = { version: 1, schema: `
  CREATE TABLE plugin_directory_grants (
    grant_id TEXT PRIMARY KEY, plugin_id TEXT NOT NULL, plugin_name TEXT NOT NULL, install_id TEXT NOT NULL, project_id TEXT NOT NULL,
    actor_id TEXT NOT NULL, root TEXT NOT NULL, device TEXT NOT NULL, inode TEXT NOT NULL, granted_at TEXT NOT NULL,
    last_read_at TEXT, read_count INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE plugin_directory_reads (
    read_id INTEGER PRIMARY KEY AUTOINCREMENT, grant_id TEXT NOT NULL, origin TEXT NOT NULL, caller TEXT NOT NULL, outcome TEXT NOT NULL, at TEXT NOT NULL);
  CREATE INDEX plugin_directory_reads_grant ON plugin_directory_reads (grant_id, read_id);
` };
export const DIRECTORY_GRANTS_HOME_STORE: HomeStoreDeclaration = { path: "plugin-directories", library: { baseline: DIRECTORY_GRANTS_BASELINE } };

/** The most recent reads kept for one grant; the count and the last time cover the rest. */
const KEPT_READS = 200;

/** Who started a call that read: the person on a page, or one of the callers that act for them without being there. */
export type DirectoryReadOrigin = "person" | "agent" | "workflow" | "mcp" | "plugin" | "background";

export interface StoredDirectoryGrant {
  readonly grant_id: string;
  readonly plugin_id: string;
  readonly plugin_name: string;
  readonly install_id: string;
  /** null for a Home-level activation. */
  readonly project_id: string | null;
  readonly actor_id: string;
  readonly root: string;
  readonly device: string;
  readonly inode: string;
  readonly granted_at: string;
  readonly last_read_at: string | null;
  readonly read_count: number;
}

export interface DirectoryReadRecord { readonly at: string; readonly origin: DirectoryReadOrigin; readonly caller: string; readonly outcome: string }

type Row = Record<string, unknown>;
const grantOf = (row: Row): StoredDirectoryGrant => ({
  grant_id: String(row.grant_id), plugin_id: String(row.plugin_id), plugin_name: String(row.plugin_name), install_id: String(row.install_id),
  project_id: row.project_id ? String(row.project_id) : null, actor_id: String(row.actor_id), root: String(row.root), device: String(row.device),
  inode: String(row.inode), granted_at: String(row.granted_at), last_read_at: row.last_read_at ? String(row.last_read_at) : null, read_count: Number(row.read_count),
});

function withStore<T>(home: string, use: (db: ReturnType<typeof openBaselineHomeSqlite>) => T): T {
  const db = openBaselineHomeSqlite(home, DIRECTORY_GRANTS_HOME_STORE.path, DIRECTORY_GRANTS_BASELINE);
  try { return use(db); } finally { db.close(); }
}
/** Removal never creates the store: a Home where no directory was ever granted has nothing to take back. */
const whenPresent = (home: string, use: (db: ReturnType<typeof openBaselineHomeSqlite>) => number): number =>
  existsSync(homeSqlitePath(home, DIRECTORY_GRANTS_HOME_STORE.path)) ? withStore(home, use) : 0;
const remove = (db: ReturnType<typeof openBaselineHomeSqlite>, where: string, value: string): number => {
  db.prepare(`DELETE FROM plugin_directory_reads WHERE grant_id IN (SELECT grant_id FROM plugin_directory_grants WHERE ${where} = ?)`).run(value);
  return Number(db.prepare(`DELETE FROM plugin_directory_grants WHERE ${where} = ?`).run(value).changes);
};

export function saveDirectoryGrant(home: string, grant: Omit<StoredDirectoryGrant, "last_read_at" | "read_count">): void {
  withStore(home, db => db.prepare(`INSERT INTO plugin_directory_grants (grant_id, plugin_id, plugin_name, install_id, project_id, actor_id, root, device, inode, granted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(grant.grant_id, grant.plugin_id, grant.plugin_name, grant.install_id, grant.project_id ?? "", grant.actor_id,
    grant.root, grant.device, grant.inode, grant.granted_at));
}

export function directoryGrant(home: string, grantId: string): StoredDirectoryGrant | null {
  if (!existsSync(homeSqlitePath(home, DIRECTORY_GRANTS_HOME_STORE.path))) return null;
  const row = withStore(home, db => db.prepare("SELECT * FROM plugin_directory_grants WHERE grant_id = ?").get(grantId));
  return row ? grantOf(row) : null;
}

/** The grant the same installation already holds for the same folder, for the same person in the same project: choosing it again reuses it. */
export function matchingDirectoryGrant(home: string, key: Pick<StoredDirectoryGrant, "plugin_id" | "install_id" | "project_id" | "actor_id" | "device" | "inode">): StoredDirectoryGrant | null {
  if (!existsSync(homeSqlitePath(home, DIRECTORY_GRANTS_HOME_STORE.path))) return null;
  const row = withStore(home, db => db.prepare(`SELECT * FROM plugin_directory_grants WHERE plugin_id = ? AND install_id = ? AND project_id = ? AND actor_id = ? AND device = ? AND inode = ?`)
    .get(key.plugin_id, key.install_id, key.project_id ?? "", key.actor_id, key.device, key.inode));
  return row ? grantOf(row) : null;
}

/** Every grant, newest first, each with its most recent reads (Settings › 本机目录). */
export function listDirectoryGrants(home: string, reads = 20): (StoredDirectoryGrant & { reads: DirectoryReadRecord[] })[] {
  if (!existsSync(homeSqlitePath(home, DIRECTORY_GRANTS_HOME_STORE.path))) return [];
  return withStore(home, db => db.prepare("SELECT * FROM plugin_directory_grants ORDER BY plugin_name, granted_at DESC").all().map(row => ({
    ...grantOf(row),
    reads: db.prepare("SELECT at, origin, caller, outcome FROM plugin_directory_reads WHERE grant_id = ? ORDER BY read_id DESC LIMIT ?").all(String(row.grant_id), reads)
      .map(read => ({ at: String(read.at), origin: String(read.origin) as DirectoryReadOrigin, caller: String(read.caller), outcome: String(read.outcome) })),
  })));
}

/** One read, against the grant it used; the oldest records past the kept number go. */
export function recordDirectoryRead(home: string, grantId: string, read: DirectoryReadRecord): void {
  withStore(home, db => {
    db.prepare("INSERT INTO plugin_directory_reads (grant_id, origin, caller, outcome, at) VALUES (?, ?, ?, ?, ?)").run(grantId, read.origin, read.caller, read.outcome, read.at);
    db.prepare("UPDATE plugin_directory_grants SET last_read_at = ?, read_count = read_count + 1 WHERE grant_id = ?").run(read.at, grantId);
    db.prepare(`DELETE FROM plugin_directory_reads WHERE grant_id = ? AND read_id NOT IN (SELECT read_id FROM plugin_directory_reads WHERE grant_id = ? ORDER BY read_id DESC LIMIT ?)`)
      .run(grantId, grantId, KEPT_READS);
  });
}

export const revokeDirectoryGrant = (home: string, grantId: string): number => whenPresent(home, db => remove(db, "grant_id", grantId));
export const revokePluginDirectoryGrants = (home: string, pluginId: string): number => whenPresent(home, db => remove(db, "plugin_id", pluginId));
/** A project's installation goes with that project's grants only (an installation id is the same in every project); a Home-level one with all of its own. */
export const forgetInstallationDirectoryGrants = (home: string, installId: string, projectId: string | null): number => whenPresent(home, db => {
  const where = projectId === null ? "install_id = ?" : "install_id = ? AND project_id = ?", values = projectId === null ? [installId] : [installId, projectId];
  db.prepare(`DELETE FROM plugin_directory_reads WHERE grant_id IN (SELECT grant_id FROM plugin_directory_grants WHERE ${where})`).run(...values);
  return Number(db.prepare(`DELETE FROM plugin_directory_grants WHERE ${where}`).run(...values).changes);
});
export const forgetProjectDirectoryGrants = (home: string, projectId: string): number => projectId ? whenPresent(home, db => remove(db, "project_id", projectId)) : 0;
