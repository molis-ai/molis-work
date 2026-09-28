import { isAccountConnectorSyncKind } from "@molis-ai/molis-work-contracts/modules/sources";
import { ActionError, retainActionAuthority, type ActionAudience, type ActionCallContext, type ActionExecutionContext, type ActionDefinition, type ActionHandlerBinding, type ActionSchema } from "@molis-ai/molis-work-contracts/platform/actions";
import { FeedDomainError } from "@molis-ai/molis-work-contracts/modules/feed";
import { FEED_PLUGIN_ID } from "./identity.js";
import type { FeedApplication } from "./application.js";
import { FeedStoreError } from "./application-errors.js";
import type { FeedConnectorService } from "./connector-service.js";
import type { FeedSourceRecord, SourceHistoryDecision } from "./projection.js";
import { sourceRegistrationInput } from "./route-input.js";
import type { ConfigureFeedSourceScheduleInput, FeedSourceSyncResult, UpdateFeedSourceInput } from "./source-ports.js";
import type { FeedSourceService } from "./source-service.js";
import { FeedSourceScheduler, type FeedSourceSchedulerResult } from "./source-scheduler.js";

const id = { type: "string", minLength: 1, maxLength: 200 };
const text = { type: "string", maxLength: 2000 };
const source = { type: "object", properties: { source_id: { type: "string" }, name: { type: "string" }, status: { type: "string" } }, required: ["source_id"] };
const sourceResult: ActionSchema = { type: "object", properties: { source }, required: ["source"] };
const closed = (properties: Record<string, unknown>, required: string[]): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const SHARED: readonly ActionAudience[] = ["user", "agent", "mcp"];
/** Disconnecting removes an account's credentials: only the person at this computer does that. */
const LOCAL: readonly ActionAudience[] = ["user"];
function define<Input, Output>(suffix: string, title: string, description: string, input: ActionSchema, output: ActionSchema,
  audiences: readonly ActionAudience[] = SHARED, permissions: readonly string[] = ["feed:read", "feed:write"], scheduling?: "concurrent"): ActionDefinition<Input, Output> {
  return { capability_id: `feed.sources.${suffix}`, version: 1, operation: "command", action: { title, description, kind: "operation", scope: "project",
    audiences, permissions, subject_kinds: ["source"], input_schema: input, output_schema: output, ...((scheduling ?? (suffix === "sync" ? "concurrent" : undefined)) ? { scheduling: scheduling ?? "concurrent" } : {}) } };
}

export type FeedSourceRegistration = Record<string, unknown> & { kind: string };
export interface FeedSourceRegistered { source: FeedSourceRecord; registered: boolean }
/** Source management: the Feed page and every other caller change sources through these, never the store directly. */
export const feedSourceActions = {
  register: define<FeedSourceRegistration, FeedSourceRegistered>("register", "添加来源", "添加研究库、RSS、网页查询、YouTube 频道或自定义 RSS 来源；已有同一来源时返回原来源",
    { type: "object", properties: { kind: { enum: ["research_library", "rss", "web_query", "youtube_channel", "custom_rss"] }, name: text, repository: text, research_source: text,
      definition_id: text, query: text, channel_id: text, feed_url: text }, required: ["kind"], additionalProperties: false },
    { type: "object", properties: { source, registered: { type: "boolean" } }, required: ["source", "registered"] }),
  update: define<{ source_id: string; name?: string; description?: string; scope?: string; feed_url?: string; connection_id?: string }, { source: FeedSourceRecord }>("update", "修改来源", "修改来源名称、说明、范围、订阅地址或所用连接",
    closed({ source_id: id, name: text, description: text, scope: text, feed_url: text, connection_id: text }, ["source_id"]), sourceResult),
  delete: define<{ source_id: string; history_decision: SourceHistoryDecision }, { source: FeedSourceRecord; history_decision: SourceHistoryDecision }>("delete", "删除来源",
    "删除来源；必须说明保留（retain_history）还是删除（delete_local_history）本地已收到的消息",
    closed({ source_id: id, history_decision: { enum: ["retain_history", "delete_local_history"] } }, ["source_id", "history_decision"]),
    { type: "object", properties: { source, history_decision: { type: "string" } }, required: ["source", "history_decision"] }),
  schedule: define<ConfigureFeedSourceScheduleInput & { source_id: string }, { source: FeedSourceRecord }>("schedule", "设置拉取计划", "设为仅手动拉取，或按固定分钟间隔自动拉取",
    { type: "object", properties: { source_id: id, mode: { enum: ["manual", "interval"] }, enabled: { type: "boolean" }, interval_minutes: { type: "integer", minimum: 1 } },
      required: ["source_id", "mode"], additionalProperties: false }, sourceResult),
  enabled: define<{ source_id: string; enabled: boolean }, { source: FeedSourceRecord }>("enabled", "暂停或恢复来源", "暂停后不再拉取新消息，已收到的消息保留",
    closed({ source_id: id, enabled: { type: "boolean" } }, ["source_id", "enabled"]), sourceResult),
  disconnect: define<{ source_id: string }, { source: FeedSourceRecord }>("disconnect", "断开来源账号", "断开账号型来源所用的账号；公开来源请暂停或删除",
    closed({ source_id: id }, ["source_id"]), sourceResult, LOCAL),
  sync: define<{ source_id: string; idempotency_key?: string; mode?: "normal" | "rebuild_cursor" }, FeedSourceSyncResult>("sync", "立即拉取", "立即从来源拉取新消息，并按当前捕捉规则处理；同一幂等键重试不会重复拉取",
    closed({ source_id: id, idempotency_key: { type: "string", maxLength: 200 }, mode: { enum: ["normal", "rebuild_cursor"] } }, ["source_id"]), { type: "object" }),
  tick: define<Record<string, never>, FeedSourceSchedulerResult>("tick", "执行到期拉取", "执行已启用来源的到期拉取计划，并更新下次拉取时间",
    closed({}, []), closed({ due: { type: "integer" }, completed: { type: "integer" }, failed: { type: "integer" }, skipped: { type: "integer" } }, ["due", "completed", "failed", "skipped"]), LOCAL, ["feed:read", "feed:write"], "concurrent"),
} as const;
export const FEED_SOURCE_ACTIONS: readonly ActionDefinition[] = Object.values(feedSourceActions);

/** Services are built per call so capture judgments started by a sync run with that caller's authority. */
export interface FeedSourceActionPorts {
  feed(): FeedApplication;
  sources(caller: ActionCallContext): FeedSourceService;
  connectors(caller: ActionCallContext): FeedConnectorService;
}

const asActionError = (error: unknown) => error instanceof FeedStoreError || error instanceof FeedDomainError ? new ActionError(error.code, error.message) : error;
export function createFeedSourceHandlers(board: string, ports: FeedSourceActionPorts): ActionHandlerBinding[] {
  // Retain the scheduler's existing overlap guard across tick invocations, without holding the project's command queue during network waits.
  const scheduledSources = new Set<string>();
  const bind = <Input, Output>(definition: ActionDefinition<Input, Output>, handle: (input: Input, caller: ActionExecutionContext) => Output | Promise<Output>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version,
    // Judgments a sync starts keep this call's authority, pinned to the Feed action that started them.
    handle: async (caller, input) => { try {
      await caller.beforeEffect();
      return await handle(input as Input, retainActionAuthority(caller, { ...definition, provider_id: FEED_PLUGIN_ID }, caller.beforeEffect));
    } catch (error) { throw asActionError(error); } },
  });
  const a = feedSourceActions;
  const sync = async (input: { source_id: string; idempotency_key?: string; mode?: "normal" | "rebuild_cursor" }, caller: ActionExecutionContext) => {
    const current = ports.feed().getSource(board, input.source_id);
    const idempotencyKey = input.idempotency_key ?? "";
    if (current.sync_kind === "public_source") {
      return await ports.sources(caller).sync(input.source_id, { idempotencyKey, beforeEffect: caller.beforeEffect,
        signal: AbortSignal.any([AbortSignal.timeout(current.kind === "research_library" ? 180_000 : 45_000), ...(caller.signal ? [caller.signal] : [])]) });
    }
    if (isAccountConnectorSyncKind(current.sync_kind)) {
      return await ports.connectors(caller).sync(input.source_id, { idempotencyKey, beforeEffect: caller.beforeEffect, signal: caller.signal,
        mode: input.mode === "rebuild_cursor" ? "rebuild_cursor" : "normal" });
    }
    throw new FeedDomainError("这个来源没有同步能力", "feed_source_not_syncable");
  };
  return [
    bind(a.register, (input, caller) => {
      const registration = sourceRegistrationInput(input);
      if (!registration) throw new ActionError("actions.input_invalid", "来源参数无效");
      return ports.sources(caller).register(registration);
    }),
    bind(a.update, (input, caller) => {
      const { source_id, ...patch } = input;
      return { source: ports.sources(caller).update(source_id, patch as UpdateFeedSourceInput) };
    }),
    bind(a.delete, (input, caller) => ({ source: ports.sources(caller).delete(input.source_id, input.history_decision), history_decision: input.history_decision })),
    bind(a.schedule, (input, caller) => {
      const schedule: ConfigureFeedSourceScheduleInput | null = input.mode === "manual" ? { mode: "manual" }
        : input.mode === "interval" && typeof input.enabled === "boolean" && Number.isInteger(input.interval_minutes)
          ? { mode: "interval", enabled: input.enabled, interval_minutes: Number(input.interval_minutes) } : null;
      if (!schedule) throw new ActionError("actions.input_invalid", "拉取计划参数无效");
      return { source: ports.sources(caller).configureSchedule(input.source_id, schedule) };
    }),
    bind(a.enabled, (input, caller) => ({ source: ports.sources(caller).setEnabled(input.source_id, input.enabled) })),
    bind(a.disconnect, (input, caller) => {
      if (!isAccountConnectorSyncKind(ports.feed().getSource(board, input.source_id).sync_kind)) {
        throw new FeedDomainError("公开来源不需要断开账号；可以暂停或删除", "feed_source_invalid_state");
      }
      return { source: ports.sources(caller).disconnect(input.source_id) };
    }),
    bind(a.sync, sync),
    bind(a.tick, (_, caller) => new FeedSourceScheduler(board, () => ports.sources(caller),
      (source, key, authority) => sync({ source_id: source.source_id, idempotency_key: key }, { ...caller, beforeEffect: authority.beforeEffect }), undefined, scheduledSources)
      .tick(new Date(), caller)),
  ];
}
