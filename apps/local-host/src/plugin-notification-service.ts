import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDatabase, PluginInstallationClient, PluginInstanceRecord, PluginManifest, PluginNotificationClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import type { SqliteDatabase } from "@molis-ai/molis-work-storage";
import { createLocalFeedApplication, type LocalFeedApplicationOptions } from "./feed-application.js";
import { joinPluginTransaction } from "./plugin-transaction.js";
import { hostLog } from "./host-log.js";
import { NOTIFICATIONS_WRITE_PERMISSION } from "./plugin-service-permissions.js";

type Control = Pick<ActionCallContext, "signal" | "validate_authority" | "assert_authority_current">;
const feeds = new WeakMap<object, (control: Control) => LocalFeedApplicationOptions>();

/** Project composition supplies the existing event judgments, under the delivery's lifetime. */
export function bindPluginNotificationFeed(db: object, options: (control: Control) => LocalFeedApplicationOptions): void {
  feeds.set(db, options);
}

export function pluginNotificationsFor(manifest: PluginManifest, context: PluginStartContext, database: PluginDatabase | undefined,
  connection: object | undefined, projectId: string, assertActive: () => void, record: () => PluginInstanceRecord | null, installations?: PluginInstallationClient): PluginNotificationClient | undefined {
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
      const control: Control = { signal: scope!.caller.signal, validate_authority: async () => { check(scope); }, assert_authority_current: () => check(scope) };
      const feed = createLocalFeedApplication(db, feeds.get(db)?.(control));
      const stamp = new Date().toISOString();
      const sourceId = "plugin-notifications:" + manifest.plugin_id;
      const source = feed.snapshot(projectId).sources.find(item => item.source_id === sourceId) ?? feed.upsertSource({
        project_id: projectId, source_id: sourceId, kind: "plugin", definition_id: null, sync_kind: "manual", name: manifest.name,
        description: "插件发送的通知", status: "active", enabled: true, origin: "molis_work", config: {}, schedule: { mode: "manual" },
        credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null,
        imported_at: stamp, updated_at: stamp, item_count: 0, cursor: null,
      });
      const result = feed.ingestItem({ source, externalId: JSON.stringify([context.install_id, generation, input.key]), title: input.title,
        summary: input.summary, body: input.body, url: `/projects/${encodeURIComponent(projectId)}/plugins/${encodeURIComponent(target)}`,
        occurredAt: stamp, attention: { reason: "source_rule", detail: { plugin: manifest.plugin_id, installation: context.install_id } } });
      check(scope); live();
      let committed = false, settling: Promise<void> | undefined;
      afterCommit(() => { committed = true; });
      return Object.freeze({ item_id: result.item.item_id, created: result.created, settle: async () => {
        if (currentPluginInvocation() !== scope) throw new ActionError("actions.forbidden", "通知回执只能在原调用中等待");
        check(scope);
        if (!committed) throw new ActionError("actions.forbidden", "通知事务尚未提交或已回滚");
        if (!settling) settling = feed.flushPendingJudgments().catch(error => {
          check(scope); hostLog.warn("plugin_notifications", "judgment_failed", error);
        });
        await settling;
      } });
    });
  } });
}
