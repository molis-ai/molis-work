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
  /** The notification as the platform keeps it: stable for the same sender installation, generation and `key`. */
  readonly notification_id: string;
  readonly created: boolean;
  /** Await after commit, within the originating concurrent action or retained job: it hands the notification to the project's receiver, if there is one now. */
  settle(): Promise<void>;
}

/**
 * Notifications are written to the platform's own queue in the plugin's exact current project transaction, so they commit or roll back with
 * the business record. After commit the platform hands each one to the receiver the project's plugins declare in `notifications.receive`
 * (D6-2); with none that can take it now, a notification stays queued and is handed over when one can.
 */
export interface PluginNotificationClient {
  deliver(transaction: PluginDatabaseTransaction, input: PluginNotificationInput): PluginNotificationReceipt;
}

/**
 * What the platform sends the receiver action (`notifications.receive` in its Manifest): the notification and the installation that wrote it,
 * as the platform recorded them. The receiver reads who is calling from the call (`PLUGIN_NOTIFICATION_DELIVERY_ACTOR`, never from this input).
 */
export interface PluginNotificationDelivery {
  notification_id: string;
  sender_plugin_id: string;
  /** The sender's name as its Manifest gives it, for the source the receiver shows its notifications under. */
  sender_name: string;
  sender_install_id: string;
  sender_generation: string;
  key: string;
  title: string;
  summary: string;
  body: string;
  /** The plugin the notification opens, already checked to be the sender or one installed in the project. */
  open_plugin_id: string;
  /** When the sender wrote it, not when it was handed over. */
  created_at: string;
}

/** What the receiver answers: the item it kept for the notification and whether this delivery created it. */
export interface PluginNotificationDeliveryReceipt {
  item_id: string;
  created: boolean;
}

/**
 * The only caller that may call a receiver action: the platform's notification service, as a workflow-audience call with this actor id. A
 * receiver refuses any other actor, so a workflow or an Agent that reaches the action cannot post a notification as another plugin.
 */
export const PLUGIN_NOTIFICATION_DELIVERY_ACTOR = "platform-notifications";

/** `notifications.receive` in a Manifest: the plugin takes the platform's notifications (D6-2). The action must be one of its own `workflow` command actions. */
export interface PluginNotificationReceiverDeclaration {
  readonly receive: { readonly capability_id: string; readonly version: number };
}
