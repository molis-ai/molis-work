import { ActionError, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLUGIN_NOTIFICATION_DELIVERY_ACTOR, type PluginNotificationDelivery, type PluginNotificationDeliveryReceipt } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { FeedApplication } from "./application.js";

/**
 * Feed takes the platform's notifications (D6-2, specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §4): a plugin that
 * sends one writes it to the platform's queue, and the platform hands it to the receiver a Manifest declares in `notifications.receive`.
 * This action is that receiver. It is not a person's or a workflow's action: only the platform's notification service calls it (the
 * workflow audience with `PLUGIN_NOTIFICATION_DELIVERY_ACTOR`), and any other caller is refused.
 */
const closed = (properties: Record<string, unknown>, required: string[]): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const text = (maxLength: number) => ({ type: "string", maxLength });

export const feedNotificationActions = {
  receive: { capability_id: "feed.notifications.receive", version: 1, operation: "command", action: {
    title: "接收平台通知", description: "把插件发给平台的通知收进 Feed 的「插件发送的通知」来源，并按当前规则判断；只由平台的通知服务调用",
    kind: "operation", scope: "project", scheduling: "concurrent", audiences: ["workflow"], permissions: ["feed:read", "feed:write", "inbox:write"], subject_kinds: [],
    input_schema: closed({
      notification_id: text(100), sender_plugin_id: text(200), sender_name: text(200), sender_install_id: text(200), sender_generation: text(200),
      key: text(300), title: text(200), summary: text(1000), body: text(100000), open_plugin_id: text(200), created_at: text(40),
    }, ["notification_id", "sender_plugin_id", "sender_name", "sender_install_id", "sender_generation", "key", "title", "summary", "body", "open_plugin_id", "created_at"]),
    output_schema: closed({ item_id: { type: "string" }, created: { type: "boolean" } }, ["item_id", "created"]),
  } } satisfies ActionDefinition<PluginNotificationDelivery, PluginNotificationDeliveryReceipt>,
} as const;
export const FEED_NOTIFICATION_ACTIONS: readonly ActionDefinition[] = Object.values(feedNotificationActions);

export interface FeedNotificationPorts {
  /** The Feed application a delivery writes through, its judgments run under the delivering call's authority. */
  feed(caller: ActionExecutionContext): FeedApplication;
  /** The item is kept when a judgment of it fails; the failure is only reported. */
  judgmentFailed(error: unknown): void;
}

export function createFeedNotificationHandlers(projectId: string, ports: FeedNotificationPorts): ActionHandlerBinding[] {
  // Not an `async` function: what it writes happens before its first wait, so a Runtime's writer commits it as one write, and a failure there
  // (the wrong caller, a cancelled call) is thrown, not returned, and rolls the whole write back.
  return [{ capability_id: feedNotificationActions.receive.capability_id, version: feedNotificationActions.receive.version, handle: (caller, raw) => {
    if (caller.actor_id !== PLUGIN_NOTIFICATION_DELIVERY_ACTOR || caller.audience !== "workflow") {
      throw new ActionError("actions.forbidden", "只有平台的通知服务能向 Feed 投递通知");
    }
    const input = raw as PluginNotificationDelivery, feed = ports.feed(caller);
    const sourceId = "plugin-notifications:" + input.sender_plugin_id;
    const source = feed.snapshot(projectId).sources.find(item => item.source_id === sourceId) ?? feed.upsertSource({
      project_id: projectId, source_id: sourceId, kind: "plugin", definition_id: null, sync_kind: "manual", name: input.sender_name,
      description: "插件发送的通知", status: "active", enabled: true, origin: "molis_work", config: {}, schedule: { mode: "manual" },
      credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null, last_error_code: null,
      imported_at: input.created_at, updated_at: input.created_at, item_count: 0, cursor: null,
    });
    const result = feed.ingestItem({ source, externalId: JSON.stringify([input.sender_install_id, input.sender_generation, input.key]), title: input.title,
      summary: input.summary, body: input.body, url: `/projects/${encodeURIComponent(projectId)}/plugins/${encodeURIComponent(input.open_plugin_id)}`,
      occurredAt: input.created_at, attention: { reason: "source_rule", detail: { plugin: input.sender_plugin_id, installation: input.sender_install_id } } });
    caller.signal?.throwIfAborted();
    const receipt = { item_id: result.item.item_id, created: result.created } satisfies PluginNotificationDeliveryReceipt;
    return feed.flushPendingJudgments().then(() => receipt, error => { caller.assert_authority_current?.(); ports.judgmentFailed(error); return receipt; });
  } }];
}
