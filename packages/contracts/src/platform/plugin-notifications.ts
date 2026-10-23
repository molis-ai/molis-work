import type { PluginDatabaseTransaction } from "./plugin-database.js";

export interface PluginNotificationInput {
  /** Stable within this installation. Repeating it refers to the same delivered item. */
  key: string;
  title: string;
  summary: string;
  body: string;
  /** Optional navigation to an installed plugin in this project; it never changes the notification's owner. */
  open_plugin_id?: string;
}

export interface PluginNotificationReceipt {
  readonly item_id: string;
  readonly created: boolean;
  /** Await after commit, within the originating concurrent action or retained job. */
  settle(): Promise<void>;
}

/** Notifications enter Feed and Inbox in the plugin's exact current project transaction. */
export interface PluginNotificationClient {
  deliver(transaction: PluginDatabaseTransaction, input: PluginNotificationInput): PluginNotificationReceipt;
}
