import { createHash } from "node:crypto";

/** The notification queue's table, as one current schema; the host composes it into the project database baseline. */
export const PLUGIN_NOTIFICATIONS_SCHEMA_SQL = `
    CREATE TABLE IF NOT EXISTS plugin_notifications (
      notification_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      sender_plugin_id TEXT NOT NULL,
      sender_install_id TEXT NOT NULL,
      sender_generation TEXT NOT NULL,
      key TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      body TEXT NOT NULL,
      open_plugin_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      delivered_at TEXT,
      item_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error_code TEXT,
      UNIQUE (sender_install_id, sender_generation, key)
    );
    CREATE INDEX IF NOT EXISTS plugin_notifications_pending ON plugin_notifications (project_id, created_at) WHERE delivered_at IS NULL;
`;

export interface PluginNotificationsDatabase {
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    all(...parameters: unknown[]): unknown[];
    run(...parameters: unknown[]): { changes: number | bigint };
  };
}

export interface PluginNotificationRow {
  notification_id: string;
  project_id: string;
  sender_plugin_id: string;
  sender_install_id: string;
  sender_generation: string;
  key: string;
  title: string;
  summary: string;
  body: string;
  open_plugin_id: string;
  created_at: string;
}

/** The id a notification has from its sender: the same installation, generation and key are always the same notification. */
export function pluginNotificationId(senderInstallId: string, senderGeneration: string, key: string): string {
  return "notification-" + createHash("sha256").update(JSON.stringify([senderInstallId, senderGeneration, key])).digest("hex").slice(0, 32);
}

/**
 * The platform's queue of notifications plugins sent and no receiver has taken yet. A row is written in the sender's own project
 * transaction (so it commits or rolls back with the business record) and kept after it is delivered only as the record that its key was
 * used: the receiver keeps the content, so the body is dropped on delivery.
 */
export class PluginNotificationQueue {
  constructor(private readonly db: PluginNotificationsDatabase) {}

  /** Queue a notification; `false` when its key was already used by this installation generation. */
  enqueue(row: Omit<PluginNotificationRow, "notification_id">): { notification_id: string; created: boolean } {
    const notification_id = pluginNotificationId(row.sender_install_id, row.sender_generation, row.key);
    const result = this.db.prepare(`INSERT OR IGNORE INTO plugin_notifications
      (notification_id, project_id, sender_plugin_id, sender_install_id, sender_generation, key, title, summary, body, open_plugin_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(notification_id, row.project_id, row.sender_plugin_id, row.sender_install_id, row.sender_generation,
      row.key, row.title, row.summary, row.body, row.open_plugin_id, row.created_at);
    return { notification_id, created: Number(result.changes) > 0 };
  }

  /** What no receiver has taken yet, oldest first. */
  pending(projectId: string): PluginNotificationRow[] {
    return this.db.prepare(`SELECT notification_id, project_id, sender_plugin_id, sender_install_id, sender_generation, key, title, summary, body, open_plugin_id, created_at
      FROM plugin_notifications WHERE project_id = ? AND delivered_at IS NULL ORDER BY created_at, notification_id`).all(projectId) as PluginNotificationRow[];
  }

  delivered(notificationId: string, itemId: string, at: string): void {
    this.db.prepare("UPDATE plugin_notifications SET delivered_at = ?, item_id = ?, body = '', last_error_code = NULL WHERE notification_id = ? AND delivered_at IS NULL")
      .run(at, itemId, notificationId);
  }

  /** A delivery that failed stays queued, with the code of the last failure. */
  failed(notificationId: string, code: string): void {
    this.db.prepare("UPDATE plugin_notifications SET attempts = attempts + 1, last_error_code = ? WHERE notification_id = ? AND delivered_at IS NULL").run(code, notificationId);
  }
}
