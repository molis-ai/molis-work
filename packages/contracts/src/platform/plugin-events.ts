import type { ContractDescriptor } from "./package.js";

export const platformPluginEventsContract = {
  contractId: "io.molis.work.platform.plugin-events.v1",
  kind: "platform",
  schemaVersion: 1,
  maturity: "partial",
  ssot: "docs/platform/PLUGIN-PLATFORM.md",
} as const satisfies ContractDescriptor;

/**
 * UTF-8 ceiling for one event payload. Events carry coordination facts, not
 * content: a larger body belongs in an Artifact and travels as a reference.
 */
export const PLUGIN_EVENT_PAYLOAD_MAX_BYTES = 16_384;

/** Namespaces the Host owns. A Plugin can never declare or publish into them. */
export const RESERVED_EVENT_NAMESPACES = ["molis.", "host."] as const;

export type PluginEventErrorCode =
  | "event_type_invalid"
  | "event_type_reserved"
  | "event_type_not_owned"
  | "event_not_declared"
  | "event_payload_invalid"
  | "event_payload_too_large"
  | "event_subscription_invalid";

export class PluginEventError extends Error {
  constructor(
    readonly code: PluginEventErrorCode,
    message: string,
    readonly detail?: Readonly<Record<string, string | number>>,
  ) {
    super(message);
    this.name = "PluginEventError";
  }
}

export interface PluginEventTypeDeclaration {
  event_type_id: string;
  type_version: number;
}

export interface PluginEventSubscribeDeclaration extends PluginEventTypeDeclaration {
  /**
   * Sources this subscription accepts. Wildcards are rejected: a Plugin must
   * name who it listens to. A source that is not installed simply never
   * matches; it is not a dependency failure.
   */
  from_plugin_ids: string[];
}

export interface PluginEventsDeclaration {
  publishes: PluginEventTypeDeclaration[];
  subscribes: PluginEventSubscribeDeclaration[];
}

/** Author-supplied validator. The Host stores only what this accepts. */
export interface PluginEventType<Payload = unknown> extends PluginEventTypeDeclaration {
  validate(payload: unknown): Payload;
}

export interface PluginEventRef {
  event_id: string;
  board_id: string;
  /** Monotonic per board. Subscribers resume from it after a restart. */
  sequence: number;
  event_type_id: string;
  type_version: number;
  source_plugin_id: string;
  source_install_id: string;
}

export interface PluginEventRecord<Payload = unknown> extends PluginEventRef {
  payload: Payload;
  correlation_id: string | null;
  occurred_at: string;
}

export interface PluginEventPublishInput {
  event_type_id: string;
  type_version: number;
  payload: unknown;
  correlation_id?: string;
}

/** Acceptance only. Delivery to subscribers is asynchronous and observable. */
export interface PluginEventPublishResult {
  accepted: true;
  ref: PluginEventRef;
}

/** Host-bound author surface. A Plugin publishes; it never reads the log. */
export interface PluginEventsClient {
  publish(input: PluginEventPublishInput): PluginEventPublishResult;
}

export interface PluginEventDeliveryContext {
  board_id: string;
  plugin_id: string;
  install_id: string;
  signal: AbortSignal;
}

export type PluginEventCursorState = "idle" | "delivering" | "retry_wait" | "quarantined";

export interface PluginEventCursorRecord {
  board_id: string;
  subscriber_plugin_id: string;
  source_plugin_id: string;
  event_type_id: string;
  type_version: number;
  delivered_sequence: number;
  state: PluginEventCursorState;
  retry_at: string | null;
  last_error_code: string | null;
  updated_at: string;
}

export type PluginEventDeliveryFailureCode =
  | "subscriber_start_failed"
  | "subscriber_handler_failed"
  | "subscriber_revoked"
  | "payload_invalid";

export interface PluginEventDeliveryFailure {
  code: PluginEventDeliveryFailureCode;
  board_id: string;
  subscriber_plugin_id: string;
  source_plugin_id: string;
  event_id: string;
  event_type_id: string;
  type_version: number;
  message: string;
  occurred_at: string;
}

export interface PluginEventLogQuery {
  event_type_id?: string;
  type_version?: number;
  source_plugin_id?: string;
  since_sequence?: number;
  limit?: number;
}

export interface PluginEventsRepository {
  append(record: Omit<PluginEventRecord, "sequence">): PluginEventRecord;
  list(boardId: string, query?: PluginEventLogQuery): PluginEventRecord[];
  latestSequence(boardId: string): number;
  cursor(
    boardId: string,
    subscriberPluginId: string,
    source: PluginEventSubscribeSource,
  ): PluginEventCursorRecord | null;
  listCursors(boardId: string, subscriberPluginId?: string): PluginEventCursorRecord[];
  saveCursor(record: PluginEventCursorRecord): void;
  deleteCursors(boardId: string, subscriberPluginId: string): void;
}

export interface PluginEventSubscribeSource {
  source_plugin_id: string;
  event_type_id: string;
  type_version: number;
}

export interface PluginEventPublisherIdentity {
  board_id: string;
  plugin_id: string;
  install_id: string;
}

export interface PluginEventBusApi {
  publish(
    identity: PluginEventPublisherIdentity,
    input: PluginEventPublishInput,
  ): PluginEventPublishResult;
  /** Drop pending delivery for one subscriber; durable cursors are kept. */
  revoke(boardId: string, pluginId: string): void;
  /** Replay undelivered events from durable cursors after a restart. */
  resume(boardId: string): Promise<number>;
  observeFailures(listener: (failure: PluginEventDeliveryFailure) => void): () => void;
  log(boardId: string, query?: PluginEventLogQuery): PluginEventRecord[];
  cursors(boardId: string, subscriberPluginId?: string): PluginEventCursorRecord[];
}

const EVENT_TOKEN = /^[a-z0-9][a-z0-9.-]*$/u;

export function isReservedEventType(eventTypeId: string): boolean {
  return RESERVED_EVENT_NAMESPACES.some((prefix) => eventTypeId.startsWith(prefix));
}

/** A Plugin owns exactly the `<plugin_id>.` event namespace. */
export function ownsEventType(pluginId: string, eventTypeId: string): boolean {
  return eventTypeId.startsWith(`${pluginId}.`);
}

export function isValidEventTypeId(value: unknown): value is string {
  return typeof value === "string" && EVENT_TOKEN.test(value);
}

export function isValidEventTypeVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1;
}

export function eventTypeKey(eventTypeId: string, typeVersion: number): string {
  return `${eventTypeId}@${typeVersion}`;
}

/**
 * Validate one Plugin's event declarations against its own identity. Returns
 * every problem so an author sees the whole contract, not the first failure.
 */
export function inspectEventDeclarations(
  pluginId: string,
  events: PluginEventsDeclaration | undefined,
): string[] {
  if (!events) return [];
  const problems: string[] = [];
  const published = new Set<string>();
  for (const item of events.publishes ?? []) {
    if (!isValidEventTypeId(item.event_type_id)) {
      problems.push("发布事件缺少合法类型 ID");
      continue;
    }
    if (!isValidEventTypeVersion(item.type_version)) {
      problems.push(`发布事件 ${item.event_type_id} 的版本无效`);
      continue;
    }
    if (isReservedEventType(item.event_type_id)) {
      problems.push(`不能发布宿主保留事件 ${item.event_type_id}`);
      continue;
    }
    if (!ownsEventType(pluginId, item.event_type_id)) {
      problems.push(`事件 ${item.event_type_id} 不属于 ${pluginId} 的命名空间`);
      continue;
    }
    const key = eventTypeKey(item.event_type_id, item.type_version);
    if (published.has(key)) problems.push(`发布事件重复：${key}`);
    published.add(key);
  }

  const subscribed = new Set<string>();
  for (const item of events.subscribes ?? []) {
    if (!isValidEventTypeId(item.event_type_id)) {
      problems.push("订阅事件缺少合法类型 ID");
      continue;
    }
    if (!isValidEventTypeVersion(item.type_version)) {
      problems.push(`订阅事件 ${item.event_type_id} 的版本无效`);
      continue;
    }
    if (!Array.isArray(item.from_plugin_ids) || item.from_plugin_ids.length === 0) {
      problems.push(`订阅 ${item.event_type_id} 必须显式限定来源插件`);
      continue;
    }
    const sources = new Set<string>();
    let ok = true;
    for (const source of item.from_plugin_ids) {
      if (typeof source !== "string" || source.trim() === "" || source.includes("*")) {
        problems.push(`订阅 ${item.event_type_id} 的来源声明无效`);
        ok = false;
        break;
      }
      if (sources.has(source)) {
        problems.push(`订阅 ${item.event_type_id} 的来源重复：${source}`);
        ok = false;
        break;
      }
      sources.add(source);
    }
    if (!ok) continue;
    const key = eventTypeKey(item.event_type_id, item.type_version);
    if (subscribed.has(key)) problems.push(`订阅事件重复：${key}`);
    subscribed.add(key);
  }
  return problems;
}
