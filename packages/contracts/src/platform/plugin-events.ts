import type { ContractDescriptor } from "./package.js";
import type { PluginReviewKind } from "../services/agent-host-reviews.js";

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

/**
 * Host events (X-6): what the Host itself publishes. A Plugin subscribes to one by type and version and names no source, since
 * the Host is the only one (S-54). Each type fixes how it is delivered, and no caller chooses: an `addressed` one goes only to
 * the installation the Host names; a `broadcast` one goes to every installation of the project that runs, subscribes to it and
 * holds its `permission` (declared and granted), and a Manifest that subscribes to it must declare that permission. They are not
 * stored: an installation that is not running when one is sent never gets it.
 */
export const HOST_REVIEW_SETTLED_EVENT = "host.review.settled";
export const HOST_WORKSPACE_CHANGED_EVENT = "host.workspace.changed";

export interface HostEventType {
  readonly event_type_id: string;
  readonly type_version: number;
  readonly delivery: "addressed" | "broadcast";
  /** A broadcast's recipients must hold this permission; the type table, not the sender, decides. */
  readonly permission?: string;
}

export const HOST_EVENT_TYPES: readonly HostEventType[] = [
  { event_type_id: HOST_REVIEW_SETTLED_EVENT, type_version: 1, delivery: "addressed" },
  { event_type_id: HOST_WORKSPACE_CHANGED_EVENT, type_version: 1, delivery: "broadcast", permission: "workspace:read" },
];

/** `source_plugin_id` and `source_install_id` of a host event's record. Never a plugin id: those are `io.molis.work.…`. */
export const HOST_EVENT_SOURCE = "host";

/**
 * `host.review.settled@1`: an operation a person approved for this installation (`review:<kind>`) has run, and its outcome is
 * recorded. It goes only to the installation that asked for the review; a rejected, cancelled or expired review sends none.
 */
export interface HostReviewSettledPayload {
  review_id: string;
  kind: PluginReviewKind;
  operation_id: string;
  workspace_id: string;
  outcome: "succeeded" | "failed" | "unknown";
}

/**
 * `host.workspace.changed@1`: files in this project's workspace may have changed, so a subscriber that shows or holds them reads
 * them again. It carries no review, operation, outcome or installation: it tells every subscriber that holds `workspace:read`
 * only what any of them could read for itself. Treat every `cause` alike; new causes come as new values: `plugin-operation` is a
 * plugin's person-reviewed operation, `agent-change` an Agent's own approved file edit, command or Git step in that workspace,
 * `workspace-settings` the project's folder settings changed (a folder linked, repaired or unlinked, or the browsing folder chosen)
 * and `workspace_id` names that folder (BL-521), and `project-opened` the project's plugin platform has just been opened through the
 * Host's web entry and tells what a subscriber could not hear while none ran: `workspace_id` names the folder the project browses
 * then, or is empty when it has none (BL-521).
 */
export interface HostWorkspaceChangedPayload {
  workspace_id: string;
  cause: "plugin-operation" | "agent-change" | "workspace-settings" | "project-opened";
}

export type PluginEventErrorCode =
  | "plugin.event_type_invalid"
  | "plugin.event_type_reserved"
  | "plugin.event_type_not_owned"
  | "plugin.event_not_declared"
  | "plugin.event_payload_invalid"
  | "plugin.event_payload_too_large"
  | "plugin.event_identity_invalid"
  | "plugin.event_delivery_revoked"
  | "plugin.event_recovery_changed"
  | "plugin.event_recovery_invalid"
  | "plugin.event_subscription_invalid";

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
   * matches; it is not a dependency failure. Required for another plugin's
   * event; absent for a host event (`HOST_EVENT_TYPES`), whose only source is the Host.
   */
  from_plugin_ids?: string[];
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
  | "plugin.subscriber_start_failed"
  | "plugin.subscriber_handler_failed"
  | "plugin.subscriber_revoked"
  | "plugin.payload_invalid";

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

/**
 * The Host's own declaration of this type at this version: how it is delivered and what its recipients must hold. Undefined when
 * the Host does not publish it; the declared ones are the only reserved types a Plugin may subscribe to.
 */
export function hostEventType(eventTypeId: string, typeVersion: number): HostEventType | undefined {
  return HOST_EVENT_TYPES.find((type) => type.event_type_id === eventTypeId && type.type_version === typeVersion);
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
