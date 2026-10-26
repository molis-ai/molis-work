import { ActionError, type ActionCallContext, type ActionClient, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_NOTIFICATION_DELIVERY_ACTOR, type PluginManifest, type PluginNotificationDelivery, type PluginNotificationDeliveryReceipt } from "@molis-ai/molis-work-contracts/platform/plugin";
import { PluginNotificationQueue, type PluginNotificationRow, type PluginRuntimeDatabase } from "@molis-ai/molis-work-plugin-runtime";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { hostLog } from "./host-log.js";
import { installedPluginManifest } from "./plugin-installation-directory.js";
import { pluginInstallRecords } from "./plugin-install-records.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { bindPluginNotificationDelivery, bindPluginNotificationFeed } from "./plugin-notification-service.js";

/** A plugin of the project that declares `notifications.receive`, with the permissions its receiving action asks for. */
export interface NotificationReceiver {
  readonly plugin_id: string;
  readonly reference: ActionReference;
  readonly permissions: readonly string[];
}

export interface NotificationDeliveryPorts {
  readonly project_id: string;
  readonly queue: PluginNotificationQueue;
  readonly client: ActionClient;
  /** The plugins the project has now that declare they take notifications, in the order they are offered one. */
  readonly receivers: () => readonly NotificationReceiver[];
  /** The sender's name as its Manifest gives it. */
  readonly senderName: (pluginId: string) => string;
  readonly signal?: AbortSignal;
}

/** The receiver is not there for this call (not registered, disabled, or missing what it needs): the notification waits, it did not fail. */
const UNAVAILABLE = new Set(["actions.missing", "actions.plugin_disabled", "actions.dependency_missing", "actions.unavailable"]);

/** The receivers a set of Manifests declares: each plugin with `notifications.receive` whose action is one of its own commands. */
export function declaredNotificationReceivers(manifests: Iterable<PluginManifest>): NotificationReceiver[] {
  const receivers: NotificationReceiver[] = [];
  for (const manifest of manifests) {
    const reference = manifest.notifications?.receive;
    const definition = reference && manifest.actions?.find(item => item.capability_id === reference.capability_id && item.version === reference.version);
    if (reference && definition) receivers.push({ plugin_id: manifest.plugin_id, reference: { capability_id: reference.capability_id, version: reference.version }, permissions: definition.action.permissions });
  }
  return receivers;
}

/** The Manifests a project has now: the shipped plugins' and those installed in its library (a shipped one is not shadowed by an installed copy). */
export function projectNotificationSources(db: PluginRuntimeDatabase): Pick<NotificationDeliveryPorts, "receivers" | "senderName"> {
  const manifests = (): Map<string, PluginManifest> => {
    const byId = new Map<string, PluginManifest>(PLATFORM_PLUGIN_REGISTRATIONS.map(entry => [entry.manifest.plugin_id, entry.manifest] as const));
    for (const record of pluginInstallRecords(db).list()) {
      const installed = byId.has(record.plugin_id) ? null : installedPluginManifest(db, record.install_id);
      if (installed) byId.set(record.plugin_id, installed.manifest);
    }
    return byId;
  };
  return { receivers: () => declaredNotificationReceivers(manifests().values()), senderName: pluginId => manifests().get(pluginId)?.name ?? pluginId };
}

/**
 * Hands the queued notifications of one project to the receiver its plugins declare (D6-2). The platform calls the receiving action as
 * itself (the workflow audience under `PLUGIN_NOTIFICATION_DELIVERY_ACTOR`) with only the permissions that action declares; a receiver
 * keeps the content, the queue keeps the record that a key was used. With no receiver that can take it now a notification stays queued
 * and is offered again at the next flush; one that fails stays queued with the code of the failure. Flushes of a project run one after
 * another, so a notification is never offered twice at once.
 */
export function createNotificationDelivery(ports: NotificationDeliveryPorts) {
  let chain: Promise<void> = Promise.resolve();
  const deliver = async (row: PluginNotificationRow): Promise<void> => {
    const delivery: PluginNotificationDelivery = { notification_id: row.notification_id, sender_plugin_id: row.sender_plugin_id, sender_name: ports.senderName(row.sender_plugin_id),
      sender_install_id: row.sender_install_id, sender_generation: row.sender_generation, key: row.key, title: row.title, summary: row.summary, body: row.body,
      open_plugin_id: row.open_plugin_id, created_at: row.created_at };
    for (const receiver of ports.receivers()) {
      const caller: ActionCallContext = { actor_id: PLUGIN_NOTIFICATION_DELIVERY_ACTOR, project_id: ports.project_id, audience: "workflow",
        permissions: [...receiver.permissions], ...(ports.signal ? { signal: ports.signal } : {}) };
      try {
        const receipt = await ports.client.invoke(caller, receiver.reference, delivery) as PluginNotificationDeliveryReceipt;
        if (typeof receipt?.item_id !== "string") throw new ActionError("actions.output_invalid", "通知接收方没有返回有效回执");
        ports.queue.delivered(row.notification_id, receipt.item_id, new Date().toISOString());
        return;
      } catch (error) {
        if (error instanceof ActionError && UNAVAILABLE.has(error.code)) continue;
        ports.queue.failed(row.notification_id, error instanceof ActionError ? error.code : "plugin.notification_delivery_failed");
        hostLog.warn("plugin_notifications", "delivery_failed", error, { project_id: ports.project_id, notification_id: row.notification_id, receiver: receiver.plugin_id });
        return;
      }
    }
  };
  const flush = (): Promise<void> => {
    const run = chain.then(async () => { for (const row of ports.queue.pending(ports.project_id)) { ports.signal?.throwIfAborted(); await deliver(row); } });
    chain = run.catch(() => undefined);
    return run;
  };
  return Object.freeze({ flush });
}

export type NotificationDelivery = ReturnType<typeof createNotificationDelivery>;

/**
 * A project's notifications as its runtime opens, after its providers are registered: the delivery and the judgments a delivered item
 * starts are bound to its database, and what was queued while no receiver could take it (or before this Host stopped) is offered again.
 */
export function bindProjectNotifications(db: SqliteDatabase, projectId: string, client: ActionClient,
  feedOptions: Parameters<typeof bindPluginNotificationFeed>[1]): void {
  const delivery = createNotificationDelivery({ project_id: projectId, queue: new PluginNotificationQueue(db), client, ...projectNotificationSources(db) });
  bindPluginNotificationDelivery(db, delivery); bindPluginNotificationFeed(db, feedOptions);
  void delivery.flush().catch(error => hostLog.warn("plugin_notifications", "flush_failed", error, { project_id: projectId }));
}
