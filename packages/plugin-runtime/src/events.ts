import { randomUUID } from "node:crypto";

import {
  eventTypeKey,
  isReservedEventType,
  ownsEventType,
  PluginEventError,
  PLUGIN_EVENT_PAYLOAD_MAX_BYTES,
  type PluginEventBusApi,
  type PluginEventCursorRecord,
  type PluginEventDeliveryContext,
  type PluginEventDeliveryFailure,
  type PluginEventLogQuery,
  type PluginEventPublishInput,
  type PluginEventPublishResult,
  type PluginEventPublisherIdentity,
  type PluginEventRecord,
  type PluginEventRef,
  type PluginEventsClient,
  type PluginEventsRepository,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginActiveInstance, PluginHostLifecycle } from "./lifecycle.js";

interface Envelope {
  generation: number;
  subscriber_plugin_id: string;
  record: PluginEventRecord;
}

function isolatePayload(payload: unknown): unknown {
  const json = JSON.stringify(payload ?? null);
  if (json === undefined) {
    throw new PluginEventError("event_payload_invalid", "事件内容必须能序列化为 JSON");
  }
  if (Buffer.byteLength(json, "utf8") > PLUGIN_EVENT_PAYLOAD_MAX_BYTES) {
    throw new PluginEventError(
      "event_payload_too_large",
      `事件内容超过 ${PLUGIN_EVENT_PAYLOAD_MAX_BYTES} 字节上限；大正文请改用 Artifact 引用`,
    );
  }
  return JSON.parse(json) as unknown;
}

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && /^[a-z][a-z0-9_.]{1,63}$/u.test(code)) return code;
  }
  return "subscriber_handler_failed";
}

/**
 * Durable, per-source ordered event delivery.
 *
 * Publish only validates and accepts; delivery happens afterwards so a slow or
 * failing subscriber never blocks the publisher. Every accepted event is stored
 * before anyone is woken, so a restart resumes from durable cursors instead of
 * losing or replaying work.
 */
export class PluginEventBus implements PluginEventBusApi {
  readonly #boardId: string;
  readonly #lifecycle: PluginHostLifecycle;
  readonly #repository: PluginEventsRepository;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #failureListeners = new Set<(failure: PluginEventDeliveryFailure) => void>();
  readonly #tails = new Map<string, Promise<void>>();
  readonly #queued = new Set<string>();
  readonly #controllers = new Map<string, Set<AbortController>>();

  constructor(input: {
    boardId: string;
    lifecycle: PluginHostLifecycle;
    repository: PluginEventsRepository;
    now?: () => Date;
    createId?: () => string;
  }) {
    this.#boardId = input.boardId;
    this.#lifecycle = input.lifecycle;
    this.#repository = input.repository;
    this.#now = input.now ?? (() => new Date());
    this.#createId = input.createId ?? (() => `plugin-event-${randomUUID()}`);
  }

  /** Author surface bound to one activation. A Plugin publishes; it never reads the log. */
  clientFor(identity: PluginEventPublisherIdentity): PluginEventsClient {
    return {
      publish: (input) => this.publish(identity, input),
    };
  }

  publish(
    identity: PluginEventPublisherIdentity,
    input: PluginEventPublishInput,
  ): PluginEventPublishResult {
    const contract = this.#lifecycle.contract(identity.plugin_id);
    if (!contract) {
      throw new PluginEventError("event_not_declared", `插件 ${identity.plugin_id} 没有登记`);
    }
    if (isReservedEventType(input.event_type_id)) {
      throw new PluginEventError("event_type_reserved", "不能发布宿主保留事件");
    }
    if (!ownsEventType(identity.plugin_id, input.event_type_id)) {
      throw new PluginEventError(
        "event_type_not_owned",
        `事件 ${input.event_type_id} 不属于 ${identity.plugin_id} 的命名空间`,
      );
    }
    const type = contract.publishes.get(eventTypeKey(input.event_type_id, input.type_version));
    if (!type) {
      throw new PluginEventError(
        "event_not_declared",
        `没有声明过事件 ${eventTypeKey(input.event_type_id, input.type_version)}`,
      );
    }

    let validated: unknown;
    try {
      validated = type.validate(input.payload);
    } catch (error) {
      if (error instanceof PluginEventError) throw error;
      throw new PluginEventError("event_payload_invalid", "事件内容没有通过类型校验");
    }

    const record = this.#repository.append({
      event_id: this.#createId(),
      board_id: this.#boardId,
      event_type_id: input.event_type_id,
      type_version: input.type_version,
      source_plugin_id: identity.plugin_id,
      source_install_id: identity.install_id,
      payload: isolatePayload(validated),
      correlation_id: input.correlation_id ?? null,
      occurred_at: this.#now().toISOString(),
    });

    for (const subscriberPluginId of this.#match(record)) {
      const generation = this.#lifecycle.generation(subscriberPluginId);
      if (generation === undefined) continue;
      this.#enqueue({ generation, subscriber_plugin_id: subscriberPluginId, record });
    }

    const ref: PluginEventRef = {
      event_id: record.event_id,
      board_id: record.board_id,
      sequence: record.sequence,
      event_type_id: record.event_type_id,
      type_version: record.type_version,
      source_plugin_id: record.source_plugin_id,
      source_install_id: record.source_install_id,
    };
    return { accepted: true, ref };
  }

  revoke(boardId: string, pluginId: string): void {
    if (boardId !== this.#boardId) return;
    const controllers = this.#controllers.get(pluginId);
    if (controllers) {
      for (const controller of [...controllers]) {
        if (!controller.signal.aborted) controller.abort();
      }
      this.#controllers.delete(pluginId);
    }
    for (const key of [...this.#tails.keys()]) {
      if (key.startsWith(`${pluginId}\u0000`)) this.#tails.delete(key);
    }
  }

  /** Replay everything a subscriber has not acknowledged. Safe to call repeatedly. */
  async resume(boardId: string): Promise<number> {
    if (boardId !== this.#boardId) return 0;
    let queued = 0;
    for (const subscriberPluginId of this.#lifecycle.enabledPluginIds()) {
      const contract = this.#lifecycle.contract(subscriberPluginId);
      const generation = this.#lifecycle.generation(subscriberPluginId);
      if (!contract || generation === undefined) continue;
      for (const subscription of contract.subscribes) {
        for (const sourcePluginId of subscription.from_plugin_ids) {
          const cursor = this.#repository.cursor(this.#boardId, subscriberPluginId, {
            source_plugin_id: sourcePluginId,
            event_type_id: subscription.event_type_id,
            type_version: subscription.type_version,
          });
          const pending = this.#repository.list(this.#boardId, {
            event_type_id: subscription.event_type_id,
            type_version: subscription.type_version,
            source_plugin_id: sourcePluginId,
            since_sequence: cursor?.delivered_sequence ?? 0,
          });
          for (const record of pending) {
            this.#enqueue({ generation, subscriber_plugin_id: subscriberPluginId, record });
            queued += 1;
          }
        }
      }
    }
    // Deliberately does not drain: an activation hook may call this from inside a
    // delivery, and waiting on the queue that contains it would deadlock.
    return queued;
  }

  /** Wait for currently queued deliveries. Test and shutdown seam, not a Plugin API. */
  async drain(): Promise<void> {
    // A delivery may enqueue more work (lazy activation, resume), so settle
    // repeatedly until nothing is left rather than snapshotting once.
    for (let guard = 0; this.#tails.size > 0 && guard < 1000; guard += 1) {
      await Promise.all([...this.#tails.values()]);
    }
  }

  observeFailures(listener: (failure: PluginEventDeliveryFailure) => void): () => void {
    this.#failureListeners.add(listener);
    return () => {
      this.#failureListeners.delete(listener);
    };
  }

  log(boardId: string, query?: PluginEventLogQuery): PluginEventRecord[] {
    return boardId === this.#boardId ? this.#repository.list(boardId, query) : [];
  }

  cursors(boardId: string, subscriberPluginId?: string): PluginEventCursorRecord[] {
    return boardId === this.#boardId
      ? this.#repository.listCursors(boardId, subscriberPluginId)
      : [];
  }

  #match(record: PluginEventRecord): string[] {
    const receivers: string[] = [];
    for (const pluginId of this.#lifecycle.enabledPluginIds()) {
      const contract = this.#lifecycle.contract(pluginId);
      if (!contract) continue;
      const subscribed = contract.subscribes.some((subscription) =>
        subscription.event_type_id === record.event_type_id
        && subscription.type_version === record.type_version
        && subscription.from_plugin_ids.has(record.source_plugin_id));
      if (subscribed) receivers.push(pluginId);
    }
    return receivers;
  }

  /** One chain per (subscriber, source) so a source's events stay in order. */
  #enqueue(envelope: Envelope): void {
    // Queued and in-flight events are deduplicated, so `resume` is idempotent and an
    // activation hook firing mid-delivery cannot deliver the same event twice.
    const pendingKey = `${envelope.subscriber_plugin_id}\u0000${envelope.record.event_id}`;
    if (this.#queued.has(pendingKey)) return;
    this.#queued.add(pendingKey);
    const key = `${envelope.subscriber_plugin_id}\u0000${envelope.record.source_plugin_id}`;
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const next = previous
      .then(() => this.#deliver(envelope), () => this.#deliver(envelope))
      .then(() => undefined, () => undefined)
      .finally(() => {
        this.#queued.delete(pendingKey);
      });
    this.#tails.set(key, next);
    void next.then(() => {
      if (this.#tails.get(key) === next) this.#tails.delete(key);
    });
  }

  async #deliver(envelope: Envelope): Promise<void> {
    const { subscriber_plugin_id: pluginId, record } = envelope;
    if (this.#lifecycle.generation(pluginId) !== envelope.generation) return;
    if (this.#alreadyDelivered(pluginId, record)) return;

    let subscriber: PluginActiveInstance | undefined;
    let readyError: unknown;
    try {
      subscriber = await this.#lifecycle.ensureStarted(pluginId);
    } catch (error) {
      readyError = error;
    }

    if (this.#lifecycle.generation(pluginId) !== envelope.generation) return;
    if (subscriber === undefined) {
      // The cursor does not advance: the event stays pending until the subscriber is
      // healthy again and `resume` replays it.
      this.#saveCursor(pluginId, record, {
        advance: false,
        state: "retry_wait",
        code: readyError === undefined ? "subscriber_start_failed" : safeErrorCode(readyError),
      });
      this.#fail("subscriber_start_failed", pluginId, record, "订阅者未能就绪，事件保留在游标上等待重投");
      return;
    }
    if (!subscriber.active()) {
      this.#saveCursor(pluginId, record, {
        advance: false,
        state: "retry_wait",
        code: "subscriber_revoked",
      });
      this.#fail("subscriber_revoked", pluginId, record, "订阅者已被撤权，事件保留在游标上等待重投");
      return;
    }

    const onEvent = subscriber.contribution.onEvent;
    if (!onEvent) {
      // The redemption check already refuses this shape at start; treat a missing
      // handler as an unusable subscriber rather than a silently dropped event.
      this.#saveCursor(pluginId, record, {
        advance: false,
        state: "retry_wait",
        code: "subscriber_start_failed",
      });
      this.#fail("subscriber_start_failed", pluginId, record, "订阅者没有事件处理入口");
      return;
    }

    const controller = new AbortController();
    this.#track(pluginId, controller);
    const context: PluginEventDeliveryContext = {
      board_id: this.#boardId,
      plugin_id: pluginId,
      install_id: subscriber.install_id,
      signal: controller.signal,
    };
    try {
      await onEvent.call(subscriber.contribution, { ...record }, context);
      this.#saveCursor(pluginId, record, { advance: true, state: "idle", code: null });
    } catch (error) {
      this.#saveCursor(pluginId, record, {
        advance: true,
        state: "idle",
        code: safeErrorCode(error),
      });
      this.#fail("subscriber_handler_failed", pluginId, record, "订阅者处理事件时失败；该事件不再重投");
    } finally {
      this.#untrack(pluginId, controller);
    }
  }

  #alreadyDelivered(pluginId: string, record: PluginEventRecord): boolean {
    const cursor = this.#repository.cursor(this.#boardId, pluginId, {
      source_plugin_id: record.source_plugin_id,
      event_type_id: record.event_type_id,
      type_version: record.type_version,
    });
    return cursor !== null && cursor.delivered_sequence >= record.sequence;
  }

  #saveCursor(
    pluginId: string,
    record: PluginEventRecord,
    outcome: { advance: boolean; state: PluginEventCursorRecord["state"]; code: string | null },
  ): void {
    const existing = this.#repository.cursor(this.#boardId, pluginId, {
      source_plugin_id: record.source_plugin_id,
      event_type_id: record.event_type_id,
      type_version: record.type_version,
    });
    this.#repository.saveCursor({
      board_id: this.#boardId,
      subscriber_plugin_id: pluginId,
      source_plugin_id: record.source_plugin_id,
      event_type_id: record.event_type_id,
      type_version: record.type_version,
      delivered_sequence: outcome.advance
        ? Math.max(existing?.delivered_sequence ?? 0, record.sequence)
        : existing?.delivered_sequence ?? 0,
      state: outcome.state,
      retry_at: null,
      last_error_code: outcome.code,
      updated_at: this.#now().toISOString(),
    });
  }

  #track(pluginId: string, controller: AbortController): void {
    const owned = this.#controllers.get(pluginId) ?? new Set<AbortController>();
    owned.add(controller);
    this.#controllers.set(pluginId, owned);
  }

  #untrack(pluginId: string, controller: AbortController): void {
    this.#controllers.get(pluginId)?.delete(controller);
  }

  #fail(
    code: PluginEventDeliveryFailure["code"],
    pluginId: string,
    record: PluginEventRecord,
    message: string,
  ): void {
    const failure: PluginEventDeliveryFailure = {
      code,
      board_id: this.#boardId,
      subscriber_plugin_id: pluginId,
      source_plugin_id: record.source_plugin_id,
      event_id: record.event_id,
      event_type_id: record.event_type_id,
      type_version: record.type_version,
      message,
      occurred_at: this.#now().toISOString(),
    };
    for (const listener of this.#failureListeners) listener({ ...failure });
  }
}
