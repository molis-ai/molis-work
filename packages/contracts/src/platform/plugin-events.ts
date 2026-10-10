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
  | "event_identity_invalid"
  | "event_delivery_revoked"
  | "event_recovery_changed"
  | "event_recovery_invalid"
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
  project_id: string;
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
  project_id: string;
  plugin_id: string;
  install_id: string;
  installation_generation: string;
  /** The subscriber's own installation identity, never the original publisher's caller. */
  actor_id: string;
  signal: AbortSignal;
  beforeEffect(): void;
}

export interface PluginEventSubscriberIdentity {
  install_id: string;
  installation_generation: string;
}

export type PluginEventCursorState = "idle" | "delivering" | "retry_wait" | "quarantined";

export interface PluginEventCursorRecord {
  /** Changes on every persisted transition. */
  revision: string;
  project_id: string;
  subscriber_plugin_id: string;
  subscriber_install_id: string;
  subscriber_generation: string;
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
  project_id: string;
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
  list(projectId: string, query?: PluginEventLogQuery): PluginEventRecord[];
  latestSequence(projectId: string): number;
  cursor(
    projectId: string,
    subscriberPluginId: string,
    source: PluginEventSubscribeSource,
    identity: PluginEventSubscriberIdentity,
  ): PluginEventCursorRecord | null;
  listCursors(projectId: string, subscriberPluginId?: string): PluginEventCursorRecord[];
  saveCursor(record: PluginEventCursorRecord): void;
  resolveCursor(previous: PluginEventCursorRecord, next: PluginEventCursorRecord, resolution: PluginEventResolutionRecord): boolean;
  resolutions(projectId: string, subscriberPluginId?: string): PluginEventResolutionRecord[];
  deleteCursors(projectId: string, subscriberPluginId: string): void;
}

export interface PluginEventResolutionRecord {
  project_id: string;
  subscriber_plugin_id: string;
  subscriber_install_id: string;
  subscriber_generation: string;
  source_plugin_id: string;
  event_type_id: string;
  type_version: number;
  event_id: string;
  cursor_revision: string;
  subscriber_version: string;
  decision: "retry" | "skip";
  actor_id: string;
  reason: string;
  resolved_at: string;
}

/** Expected identities prevent a stale confirmation; none of them supplies authority. */
export interface PluginEventRecoveryInput extends PluginEventSubscribeSource {
  subscriber_plugin_id: string;
  expected_revision: string;
  expected_install_id: string;
  expected_generation: string;
  expected_version: string;
  event_id: string;
  decision: "retry" | "skip";
  reason: string;
}

export interface PluginEventRecoveryView {
  cursor: PluginEventCursorRecord;
  event: PluginEventRecord | null;
  subscriber_name: string;
  source_name: string;
  subscriber_version: string | null;
  can_recover: boolean;
  unavailable_reason: string | null;
}

export interface PluginEventSubscribeSource {
  source_plugin_id: string;
  event_type_id: string;
  type_version: number;
}

export interface PluginEventPublisherIdentity {
  project_id: string;
  plugin_id: string;
  install_id: string;
}

export interface PluginEventBusApi {
  publish(
    identity: PluginEventPublisherIdentity,
    input: PluginEventPublishInput,
  ): PluginEventPublishResult;
  /** Drop pending delivery for one subscriber; durable cursors are kept. */
  revoke(projectId: string, pluginId: string): void;
  /** Replay undelivered events from durable cursors after a restart. */
  resume(projectId: string): Promise<number>;
  observeFailures(listener: (failure: PluginEventDeliveryFailure) => void): () => void;
  log(projectId: string, query?: PluginEventLogQuery): PluginEventRecord[];
  cursors(projectId: string, subscriberPluginId?: string): PluginEventCursorRecord[];
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
