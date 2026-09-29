import { randomUUID } from "node:crypto";
import {
  PluginEventError,
  type PluginEventCursorRecord,
  type PluginEventRecoveryInput,
  type PluginEventRecoveryView,
  type PluginEventResolutionRecord,
  type PluginEventsRepository,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginHostLifecycle } from "./lifecycle.js";

interface RecoveryPorts {
  boardId: string;
  lifecycle: PluginHostLifecycle;
  repository: PluginEventsRepository;
  closed: boolean;
}

function recoveryView(ports: RecoveryPorts, cursor: PluginEventCursorRecord): PluginEventRecoveryView {
  const event = ports.repository.list(ports.boardId, {
    source_plugin_id: cursor.source_plugin_id, event_type_id: cursor.event_type_id,
    type_version: cursor.type_version, since_sequence: cursor.delivered_sequence, limit: 1,
  })[0] ?? null;
  const current = ports.lifecycle.installation(cursor.subscriber_plugin_id);
  const subscribed = ports.lifecycle.contract(cursor.subscriber_plugin_id)?.subscribes.some(subscription =>
    subscription.event_type_id === cursor.event_type_id && subscription.type_version === cursor.type_version
      && subscription.from_plugin_ids.has(cursor.source_plugin_id));
  const reason = ports.closed ? "插件运行平台已关闭"
    : !cursor.subscriber_install_id || !cursor.subscriber_generation ? "历史订阅缺少可信安装身份，只能保留查看"
    : !current?.running ? "原订阅插件尚未运行，请先恢复插件"
    : current.install_id !== cursor.subscriber_install_id || current.installation_generation !== cursor.subscriber_generation
      ? "插件已重新安装，不能接管旧安装的事件"
    : !subscribed ? "当前插件版本已不再订阅此事件"
    : !event ? "原事件记录不可读取，不能猜测处理进度" : null;
  return {
    cursor, event, subscriber_name: ports.lifecycle.manifest(cursor.subscriber_plugin_id)?.name ?? cursor.subscriber_plugin_id,
    source_name: ports.lifecycle.manifest(cursor.source_plugin_id)?.name ?? cursor.source_plugin_id,
    subscriber_version: current?.version ?? null, can_recover: reason === null, unavailable_reason: reason,
  };
}

export function readEventRecoveries(ports: RecoveryPorts): PluginEventRecoveryView[] {
  return ports.repository.listCursors(ports.boardId).filter(cursor => cursor.state === "quarantined")
    .map(cursor => recoveryView(ports, cursor));
}

/** Host-only decision. Expected values fence stale confirmations; authority stays in the Host. */
export function resolveEventRecovery(ports: RecoveryPorts & { now(): Date; busy(pluginId: string, sourceId: string): boolean },
  actorId: string, input: PluginEventRecoveryInput): PluginEventResolutionRecord {
  if (!input || typeof input !== "object" || !["retry", "skip"].includes(input.decision)
    || typeof input.reason !== "string" || !input.reason.trim() || input.reason.trim().length > 2000
    || typeof input.expected_revision !== "string" || !actorId.trim()
    || !Number.isSafeInteger(input.type_version) || input.type_version < 1
    || [input.subscriber_plugin_id, input.source_plugin_id, input.event_type_id, input.event_id,
      input.expected_install_id, input.expected_generation, input.expected_version].some(value => typeof value !== "string" || !value)) {
    throw new PluginEventError("event_recovery_invalid", "请重新读取待核对事件并填写处理依据");
  }
  const previous = ports.repository.cursor(ports.boardId, input.subscriber_plugin_id, input,
    { install_id: input.expected_install_id, installation_generation: input.expected_generation });
  if (!previous || previous.state !== "quarantined" || previous.revision !== input.expected_revision) {
    throw new PluginEventError("event_recovery_changed", "待核对事件已变化，请重新读取后确认");
  }
  const view = recoveryView(ports, previous);
  if (!view.can_recover || view.subscriber_version !== input.expected_version || view.event?.event_id !== input.event_id
    || ports.busy(input.subscriber_plugin_id, input.source_plugin_id)) {
    throw new PluginEventError("event_recovery_changed", view.unavailable_reason ?? "插件版本或原处理已变化，请重新读取后确认");
  }
  const at = ports.now().toISOString();
  const resolution: PluginEventResolutionRecord = {
    board_id: ports.boardId, subscriber_plugin_id: previous.subscriber_plugin_id,
    subscriber_install_id: previous.subscriber_install_id, subscriber_generation: previous.subscriber_generation,
    source_plugin_id: previous.source_plugin_id, event_type_id: previous.event_type_id, type_version: previous.type_version,
    event_id: view.event!.event_id, cursor_revision: previous.revision, subscriber_version: view.subscriber_version!,
    decision: input.decision, reason: input.reason.trim(), actor_id: actorId, resolved_at: at,
  };
  const next: PluginEventCursorRecord = {
    ...previous, revision: randomUUID(), state: "idle", retry_at: null, last_error_code: null, updated_at: at,
    delivered_sequence: input.decision === "skip" ? view.event!.sequence : previous.delivered_sequence,
  };
  if (!ports.repository.resolveCursor(previous, next, resolution)) {
    throw new PluginEventError("event_recovery_changed", "待核对事件已被其他操作处理，请重新读取");
  }
  return resolution;
}
