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
  type PluginEventSubscriberIdentity,
  type PluginEventSubscribeSource,
  type PluginEventRecoveryInput,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginActiveInstance, PluginHostLifecycle } from "./lifecycle.js";
import { readEventRecoveries, resolveEventRecovery } from "./event-recovery.js";

interface Envelope {
  generation: number;
  subscriber_plugin_id: string;
  record: PluginEventRecord;
  identity: PluginEventSubscriberIdentity;
  version: string;
}

function isolatePayload(payload: unknown): unknown {
  const json = JSON.stringify(payload ?? null);
  if (json === undefined) {
    throw new PluginEventError("event_payload_invalid", "事件内容必须能序列化为 JSON");
  }
  if (Buffer.byteLength(json, "utf8") > PLUGIN_EVENT_PAYLOAD_MAX_BYTES) {
    throw new PluginEventError(
      "event_payload_too_large",
      `事件内容超过 ${PLUGIN_EVENT_PAYLOAD_MAX_BYTES} 字节上限；大正文请改用成果引用`,
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
 * before anyone is woken. Restart resumes unstarted work and isolates handler
 * outcomes that could not be confirmed; external effects are never blindly replayed.
 */
export class PluginEventBus implements PluginEventBusApi {
  readonly #projectId: string;
  readonly #lifecycle: PluginHostLifecycle;
  readonly #repository: PluginEventsRepository;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #failureListeners = new Set<(failure: PluginEventDeliveryFailure) => void>();
  readonly #tails = new Map<string, Promise<void>>();
  readonly #queued = new Set<string>();
  readonly #controllers = new Map<string, Set<AbortController>>();
  #closed = false;

  constructor(input: {
    projectId: string;
    lifecycle: PluginHostLifecycle;
    repository: PluginEventsRepository;
    now?: () => Date;
    createId?: () => string;
  }) {
    this.#projectId = input.projectId;
    this.#lifecycle = input.lifecycle;
    this.#repository = input.repository;
    this.#now = input.now ?? (() => new Date());
    this.#createId = input.createId ?? (() => `plugin-event-${randomUUID()}`);
  }

  /** Author surface bound to one activation. A Plugin publishes; it never reads the log. */
  clientFor(identity: PluginEventPublisherIdentity, assertActive: () => void): PluginEventsClient {
    return {
      publish: (input) => { assertActive(); return this.publish(identity, input); },
    };
  }

  publish(
    identity: PluginEventPublisherIdentity,
    input: PluginEventPublishInput,
  ): PluginEventPublishResult {
    const installation = this.#lifecycle.installation(identity.plugin_id);
    if (this.#closed || identity.project_id !== this.#projectId || !installation?.running || installation.install_id !== identity.install_id) {
      throw new PluginEventError("event_identity_invalid", "事件发布者的项目或安装身份已失效");
    }
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
      project_id: this.#projectId,
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
      const subscriber = this.#lifecycle.installation(subscriberPluginId);
      if (generation === undefined || !subscriber) continue;
      this.#cursor(subscriberPluginId, record, subscriber, record.sequence - 1);
      // A prior enablement may have left work queued but never dispatched. Wake
      // the pending source in order instead of stranding it behind this event.
      for (const pending of this.#pending(subscriberPluginId, subscriber, record.source_plugin_id)) {
        this.#enqueue({ generation, subscriber_plugin_id: subscriberPluginId, record: pending, identity: subscriber, version: subscriber.version });
      }
    }

    const ref: PluginEventRef = {
      event_id: record.event_id,
      project_id: record.project_id,
      sequence: record.sequence,
      event_type_id: record.event_type_id,
      type_version: record.type_version,
      source_plugin_id: record.source_plugin_id,
      source_install_id: record.source_install_id,
    };
    return { accepted: true, ref };
  }

  revoke(projectId: string, pluginId: string): void {
    if (projectId !== this.#projectId) return;
    const controllers = this.#controllers.get(pluginId);
    if (controllers) {
      for (const controller of [...controllers]) {
        if (!controller.signal.aborted) controller.abort();
      }
      this.#controllers.delete(pluginId);
    }
    // Keep the queue until its aborted delivery settles; deleting it permits overlapping deliveries.
  }

  /** Stop accepting work before the database owner closes its connection. */
  async close(): Promise<void> {
    this.#closed = true;
    for (const pluginId of [...this.#controllers.keys()]) this.revoke(this.#projectId, pluginId);
    await this.drain();
  }

  /** Administrative Host seam; never handed to plugin event clients. */
  recoveries(projectId: string) {
    return projectId === this.#projectId ? readEventRecoveries({ projectId, lifecycle: this.#lifecycle,
      repository: this.#repository, closed: this.#closed }) : [];
  }

  recoveryHistory(projectId: string) {
    return projectId === this.#projectId ? this.#repository.resolutions(projectId) : [];
  }

  recover(projectId: string, actorId: string, input: PluginEventRecoveryInput) {
    if (projectId !== this.#projectId) throw new PluginEventError("event_identity_invalid", "事件不属于当前项目");
    const result = resolveEventRecovery({ projectId, lifecycle: this.#lifecycle, repository: this.#repository,
      closed: this.#closed, now: this.#now, busy: (plugin, source) => this.#tails.has(`${plugin}\u0000${source}`) }, actorId, input);
    this.#resume(projectId);
    return result;
  }

  /** Replay everything a subscriber has not acknowledged. Safe to call repeatedly. */
  async resume(projectId: string): Promise<number> {
    return this.#resume(projectId);
  }

  #resume(projectId: string): number {
    if (this.#closed || projectId !== this.#projectId) return 0;
    let queued = 0;
    for (const subscriberPluginId of this.#lifecycle.enabledPluginIds()) {
      const generation = this.#lifecycle.generation(subscriberPluginId);
      const identity = this.#lifecycle.installation(subscriberPluginId);
      if (generation === undefined || !identity) continue;
      for (const record of this.#pending(subscriberPluginId, identity)) {
        this.#enqueue({ generation, subscriber_plugin_id: subscriberPluginId, record, identity, version: identity.version });
        queued += 1;
      }
    }
    // Deliberately does not drain: an activation hook may call this from inside a
    // delivery, and waiting on the queue that contains it would deadlock.
    return queued;
  }

  #pending(pluginId: string, identity: PluginEventSubscriberIdentity, onlySource?: string): PluginEventRecord[] {
    const records = new Map<string, PluginEventRecord>();
    for (const subscription of this.#lifecycle.contract(pluginId)?.subscribes ?? []) {
      for (const sourcePluginId of subscription.from_plugin_ids) {
        if (onlySource !== undefined && sourcePluginId !== onlySource) continue;
        const source = { source_plugin_id: sourcePluginId, event_type_id: subscription.event_type_id, type_version: subscription.type_version };
        const cursor = this.#cursor(pluginId, source, identity, this.#repository.latestSequence(this.#projectId));
        if (cursor.state === "quarantined") continue;
        for (const record of this.#repository.list(this.#projectId, { ...source, since_sequence: cursor.delivered_sequence })) {
          records.set(record.event_id, record);
        }
      }
    }
    return [...records.values()].sort((left, right) => left.sequence - right.sequence);
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

  log(projectId: string, query?: PluginEventLogQuery): PluginEventRecord[] {
    return projectId === this.#projectId ? this.#repository.list(projectId, query) : [];
  }

  cursors(projectId: string, subscriberPluginId?: string): PluginEventCursorRecord[] {
    return projectId === this.#projectId
      ? this.#repository.listCursors(projectId, subscriberPluginId)
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
    if (this.#closed) return;
    // Queued and in-flight events are deduplicated, so `resume` is idempotent and an
    // activation hook firing mid-delivery cannot deliver the same event twice.
    const pendingKey = JSON.stringify([envelope.subscriber_plugin_id, envelope.identity.install_id, envelope.identity.installation_generation, envelope.version, envelope.generation, envelope.record.event_id]);
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
    if (!this.#current(envelope)) return;
    const cursor = this.#repository.cursor(this.#projectId, pluginId, record, envelope.identity);
    if (!cursor || cursor.delivered_sequence >= record.sequence || cursor.state === "quarantined") return;
    if (cursor.state === "delivering") {
      this.#saveCursor(envelope, { advance: false, state: "quarantined", code: "subscriber_outcome_unknown" });
      return;
    }
    const [first] = this.#repository.list(this.#projectId, {
        source_plugin_id: record.source_plugin_id,
        event_type_id: record.event_type_id,
        type_version: record.type_version,
        since_sequence: cursor.delivered_sequence,
        limit: 1,
    });
    // Never acknowledge past a gap, including a queue handoff during an upgrade.
    if (first?.event_id !== record.event_id) return;

    let subscriber: PluginActiveInstance | undefined;
    let readyError: unknown;
    try {
      subscriber = await this.#lifecycle.ensureStarted(pluginId);
    } catch (error) {
      readyError = error;
    }

    if (!this.#current(envelope)) return;
    if (subscriber === undefined) {
      // The cursor does not advance: the event stays pending until the subscriber is
      // healthy again and `resume` replays it.
      this.#saveCursor(envelope, {
        advance: false,
        state: "retry_wait",
        code: readyError === undefined ? "subscriber_start_failed" : safeErrorCode(readyError),
      });
      this.#fail("subscriber_start_failed", pluginId, record, "订阅者未能就绪，事件保留在游标上等待重投");
      return;
    }
    if (!subscriber.active()) {
      this.#saveCursor(envelope, {
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
      this.#saveCursor(envelope, {
        advance: false,
        state: "retry_wait",
        code: "subscriber_start_failed",
      });
      this.#fail("subscriber_start_failed", pluginId, record, "订阅者没有事件处理入口");
      return;
    }

    const controller = new AbortController();
    this.#track(pluginId, controller);
    const beforeEffect = () => {
      if (controller.signal.aborted || !this.#current(envelope) || !subscriber!.active()) throw new PluginEventError("event_delivery_revoked", "事件订阅的安装或执行身份已失效");
    };
    const context: PluginEventDeliveryContext = {
      project_id: this.#projectId,
      plugin_id: pluginId,
      install_id: subscriber.install_id,
      installation_generation: envelope.identity.installation_generation,
      actor_id: `plugin:${pluginId}`,
      signal: controller.signal,
      beforeEffect,
    };
    let abort = () => {};
    let dispatched = false;
    try {
      beforeEffect();
      this.#saveCursor(envelope, { advance: false, state: "delivering", code: null });
      const aborted = new Promise<never>((_, reject) => { abort = () => reject(new PluginEventError("event_delivery_revoked", "事件投递已停止，处理结果可能尚未确认")); controller.signal.addEventListener("abort", abort, { once: true }); });
      await Promise.race([Promise.resolve().then(() => { beforeEffect(); dispatched = true; return onEvent.call(subscriber.contribution, structuredClone(record), context); }), aborted]);
      beforeEffect();
      this.#saveCursor(envelope, { advance: true, state: "idle", code: null });
    } catch (error) {
      const revoked = controller.signal.aborted || !this.#current(envelope) || !subscriber.active();
      this.#saveCursor(envelope, {
        advance: dispatched && !revoked,
        state: dispatched ? revoked ? "quarantined" : "idle" : "retry_wait",
        code: safeErrorCode(error),
      });
      this.#fail(!dispatched ? "subscriber_start_failed" : revoked ? "subscriber_revoked" : "subscriber_handler_failed", pluginId, record,
        !dispatched ? "事件尚未派出，保留等待恢复" : revoked ? "订阅者已撤销，未确认的处理保留隔离且不自动重投" : "订阅者处理事件时失败；该事件不再重投");
    } finally {
      controller.signal.removeEventListener("abort", abort);
      this.#untrack(pluginId, controller);
    }
  }

  #current(envelope: Envelope): boolean {
    const current = this.#lifecycle.installation(envelope.subscriber_plugin_id);
    return !this.#closed && this.#lifecycle.generation(envelope.subscriber_plugin_id) === envelope.generation
      && current?.install_id === envelope.identity.install_id && current.installation_generation === envelope.identity.installation_generation
      && current.version === envelope.version && this.#match(envelope.record).includes(envelope.subscriber_plugin_id);
  }

  #cursor(pluginId: string, source: PluginEventSubscribeSource, identity: PluginEventSubscriberIdentity, start: number): PluginEventCursorRecord {
    const existing = this.#repository.cursor(this.#projectId, pluginId, source, identity);
    if (existing) return existing;
    const created: PluginEventCursorRecord = { revision: randomUUID(), project_id: this.#projectId, subscriber_plugin_id: pluginId,
      subscriber_install_id: identity.install_id, subscriber_generation: identity.installation_generation,
      source_plugin_id: source.source_plugin_id, event_type_id: source.event_type_id, type_version: source.type_version,
      delivered_sequence: start, state: "idle", retry_at: null, last_error_code: null, updated_at: this.#now().toISOString() };
    this.#repository.saveCursor(created);
    return created;
  }

  #saveCursor(
    envelope: Envelope,
    outcome: { advance: boolean; state: PluginEventCursorRecord["state"]; code: string | null },
  ): void {
    const { subscriber_plugin_id: pluginId, record, identity } = envelope;
    const existing = this.#repository.cursor(this.#projectId, pluginId, {
      source_plugin_id: record.source_plugin_id,
      event_type_id: record.event_type_id,
      type_version: record.type_version,
    }, identity);
    this.#repository.saveCursor({
      revision: randomUUID(),
      project_id: this.#projectId,
      subscriber_plugin_id: pluginId,
      subscriber_install_id: identity.install_id,
      subscriber_generation: identity.installation_generation,
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
      project_id: this.#projectId,
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
