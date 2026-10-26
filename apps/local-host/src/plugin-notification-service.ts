import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginInstanceRecord, PluginManifest, PluginNotificationClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { InstallationDirectoryClient } from "./plugin-installation-directory.js";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, PluginNotificationQueue, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalFeedApplicationOptions } from "./feed-application.js";
import { joinPluginTransaction } from "./plugin-transaction.js";
import type { NotificationDelivery } from "./plugin-notification-delivery.js";
import { NOTIFICATIONS_WRITE_PERMISSION } from "./plugin-service-permissions.js";

type Control = Pick<ActionCallContext, "signal" | "validate_authority" | "assert_authority_current">;
const deliveries = new WeakMap<object, NotificationDelivery>();
const feeds = new WeakMap<object, (control: Control) => LocalFeedApplicationOptions>();

/** Project composition supplies the existing event judgments, under the delivery's lifetime. */
export function bindPluginNotificationFeed(db: object, options: (control: Control) => LocalFeedApplicationOptions): void {
  feeds.set(db, options);
}

/** The judgments a notification the receiver keeps starts, under the authority of the delivering call. */
export function pluginNotificationFeedOptions(db: object, caller: Control): LocalFeedApplicationOptions | undefined {
  // Only the lifetime of the delivering call, never its identity or permissions: the judgments run as the Host's event identity.
  return feeds.get(db)?.({ ...(caller.signal ? { signal: caller.signal } : {}), ...(caller.validate_authority ? { validate_authority: caller.validate_authority } : {}),
    ...(caller.assert_authority_current ? { assert_authority_current: caller.assert_authority_current } : {}) });
}

/** Project composition supplies the delivery that hands the project's queued notifications to the receiver its plugins declare (D6-2). */
export function bindPluginNotificationDelivery(db: object, delivery: NotificationDelivery): void {
  deliveries.set(db, delivery);
}

export function pluginNotificationsFor(manifest: PluginManifest, context: PluginStartContext, database: PluginDatabase | undefined,
  connection: object | undefined, projectId: string, assertActive: () => void, record: () => PluginInstanceRecord | null, installations?: InstallationDirectoryClient): PluginNotificationClient | undefined {
  if (!database || !connection || !("transaction" in connection) || typeof connection.transaction !== "function"
    || !manifest.permissions.some(entry => entry.permission === NOTIFICATIONS_WRITE_PERMISSION)) return undefined;
  const db = connection as SqliteDatabase, generation = record()?.installation_generation;
  const check = (scope: ReturnType<typeof currentPluginInvocation>) => {
    assertActive(); context.requireGrant(NOTIFICATIONS_WRITE_PERMISSION);
    const current = record();
    if (!generation || current?.installation_generation !== generation || current.state !== "running" || !current.grants.includes(NOTIFICATIONS_WRITE_PERMISSION)) {
      throw new ActionError("actions.forbidden", "通知所属安装已停止或撤权");
    }
    if (!scope || scope.caller.project_id !== projectId || pluginInvocationReadOnly(scope)) {
      throw new ActionError("actions.forbidden", "通知投递需要当前项目中的可写插件调用");
    }
    assertCapturedPluginActionCurrent(scope, context);
    if ("scene" in scope || "definition" in scope && (scope.definition.action.scheduling !== "concurrent" || !scope.definition.action.permissions.includes(NOTIFICATIONS_WRITE_PERMISSION))
      || "job" in scope && !scope.caller.permissions.includes(NOTIFICATIONS_WRITE_PERMISSION)) throw new ActionError("actions.forbidden", "通知投递需要可等待的并行动作");
  };
  return Object.freeze<PluginNotificationClient>({ deliver: (transaction, input) => {
    const scope = currentPluginInvocation(); check(scope);
    return joinPluginTransaction(database, transaction, (afterCommit, live) => {
      live();
      for (const [field, limit] of [["key", 300], ["title", 200], ["summary", 1000], ["body", 100000]] as const) {
        if (typeof input[field] !== "string" || (field !== "summary" && !input[field].trim()) || input[field].length > limit) {
          throw new ActionError("actions.input_invalid", "通知字段无效：" + field);
        }
      }
      const target = input.open_plugin_id ?? manifest.plugin_id;
      if (typeof target !== "string" || target !== manifest.plugin_id && !installations?.list().some(item => item.plugin_id === target)) {
        throw new ActionError("actions.input_invalid", "通知只能打开当前项目中已安装的插件");
      }
      const { notification_id, created } = new PluginNotificationQueue(db).enqueue({ project_id: projectId, sender_plugin_id: manifest.plugin_id,
        sender_install_id: context.install_id, sender_generation: String(generation), key: input.key, title: input.title, summary: input.summary, body: input.body,
        open_plugin_id: target, created_at: new Date().toISOString() });
      check(scope); live();
      let committed = false, settling: Promise<void> | undefined;
      afterCommit(() => { committed = true; });
      return Object.freeze({ notification_id, created, settle: async () => {
        if (currentPluginInvocation() !== scope) throw new ActionError("actions.forbidden", "通知回执只能在原调用中等待");
        check(scope);
        if (!committed) throw new ActionError("actions.forbidden", "通知事务尚未提交或已回滚");
        settling ??= deliveries.get(db)?.flush() ?? Promise.resolve();
        await settling;
      } });
    });
  } });
}
