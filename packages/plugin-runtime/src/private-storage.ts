import type { PluginManifest, PluginPrivateStorage, PluginUpgradeContext } from "@molis-ai/molis-work-contracts/platform/plugin";

export interface PluginPrivateStorageDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    run(...parameters: unknown[]): { changes: number | bigint };
    all?(...parameters: unknown[]): unknown[];
  };
}

export interface PluginPrivateStorageSnapshotRecord { item_key: string; item_value: string }

export class PluginPrivateStorageError extends Error {
  constructor(readonly code: "plugin_storage_denied" | "plugin_storage_input_invalid", message: string) {
    super(message); this.name = "PluginPrivateStorageError";
  }
}

/** Host-owned private data repository. Never expose this object or its database to Plugin code. */
export class SqlitePluginPrivateStorage {
  constructor(private readonly db: PluginPrivateStorageDatabase) {
    db.exec(`CREATE TABLE IF NOT EXISTS plugin_private_values (
      install_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      item_value TEXT NOT NULL,
      PRIMARY KEY (install_id, item_key)
    )`);
  }

  forPlugin(context: PluginUpgradeContext, manifest: PluginManifest): PluginPrivateStorage {
    if (manifest.plugin_id !== context.plugin_id || manifest.version !== context.version
      || !manifest.permissions.some(item => item.permission === "storage:private")) {
      throw new PluginPrivateStorageError("plugin_storage_denied", "Manifest 未声明当前 Plugin 的私有存储权限");
    }
    const installId = context.install_id;
    const authorize = (key: string) => {
      context.requireGrant("storage:private");
      if (typeof key !== "string" || key.length === 0) {
        throw new PluginPrivateStorageError("plugin_storage_input_invalid", "私有存储 key 必须为非空字符串");
      }
    };
    return {
      get: key => {
        authorize(key);
        const row = this.db.prepare("SELECT item_value FROM plugin_private_values WHERE install_id = ? AND item_key = ?")
          .get(installId, key) as { item_value: string } | undefined;
        return row?.item_value ?? null;
      },
      set: (key, value) => {
        authorize(key);
        if (typeof value !== "string") {
          throw new PluginPrivateStorageError("plugin_storage_input_invalid", "私有存储值必须由 Plugin 编码为字符串");
        }
        this.db.prepare(`INSERT INTO plugin_private_values (install_id, item_key, item_value) VALUES (?, ?, ?)
          ON CONFLICT (install_id, item_key) DO UPDATE SET item_value = excluded.item_value`).run(installId, key, value);
      },
      delete: key => {
        authorize(key);
        return Number(this.db.prepare("DELETE FROM plugin_private_values WHERE install_id = ? AND item_key = ?")
          .run(installId, key).changes) > 0;
      },
      compareAndSet: (key, expected, value) => {
        authorize(key);
        if ((expected !== null && typeof expected !== "string") || typeof value !== "string") {
          throw new PluginPrivateStorageError("plugin_storage_input_invalid", "比较值必须为字符串或 null，新值必须为字符串");
        }
        // One conditional statement, including across separate DB connections.
        // Never emulate compare-and-set with a read followed by an unconditional write.
        const result = expected === null
          ? this.db.prepare(`INSERT INTO plugin_private_values (install_id, item_key, item_value) VALUES (?, ?, ?)
              ON CONFLICT (install_id, item_key) DO NOTHING`).run(installId, key, value)
          : this.db.prepare(`UPDATE plugin_private_values SET item_value = ?
              WHERE install_id = ? AND item_key = ? AND item_value = ?`).run(value, installId, key, expected);
        return Number(result.changes) === 1;
      },
    };
  }

  /** Called only by the owning Host after a non-retaining uninstall succeeds. */
  deleteInstallationData(installId: string): void {
    this.db.prepare("DELETE FROM plugin_private_values WHERE install_id = ?").run(installId);
  }

  snapshotInstallationData(installId: string): PluginPrivateStorageSnapshotRecord[] {
    const statement = this.db.prepare("SELECT item_key, item_value FROM plugin_private_values WHERE install_id = ? ORDER BY item_key");
    if (!statement.all) throw new Error("Plugin private storage database does not support snapshots");
    return statement.all(installId).map(row => {
      if (!row || typeof row !== "object") throw new Error("Invalid Plugin private storage row");
      const value = row as Record<string, unknown>;
      if (typeof value.item_key !== "string" || typeof value.item_value !== "string") {
        throw new Error("Invalid Plugin private storage row");
      }
      return { item_key: value.item_key, item_value: value.item_value };
    });
  }

  restoreInstallationData(installId: string, snapshot: readonly PluginPrivateStorageSnapshotRecord[]): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("DELETE FROM plugin_private_values WHERE install_id = ?").run(installId);
      const insert = this.db.prepare("INSERT INTO plugin_private_values (install_id, item_key, item_value) VALUES (?, ?, ?)");
      for (const row of snapshot) insert.run(installId, row.item_key, row.item_value);
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* preserve the original restoration error */ }
      throw error;
    }
  }
}
