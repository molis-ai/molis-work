import { randomUUID } from "node:crypto";

import {
  eventTypeKey,
  HOST_EVENT_SOURCE,
  hostEventType,
  type HostEventType,
  PluginEventError,
  type PluginAppContribution,
  type PluginContribution,
  type PluginEventDeliveryContext,
  type PluginEventDeliveryFailure,
  type PluginEventRecord,
} from "@molis-ai/molis-work-contracts/platform/plugin";

import type { PluginHostLifecycle } from "./lifecycle.js";
import { outsidePluginAction } from "./action-scope.js";

/** The installation a host event is addressed to: the one that asked for what the event reports. */
export interface HostEventRecipient {
  plugin_id: string;
  install_id: string;
}

export interface HostEventInput {
  event_type_id: string;
  type_version: number;
  payload: unknown;
  correlation_id?: string;
}

/** What host-event delivery reads: the coordination lifecycle, plus the contribution already running, which it never starts. */
export type PluginHostEventsLifecycle = PluginHostLifecycle & { contribution(pluginId: string): PluginContribution | null };

interface Delivery {
  recipient: HostEventRecipient;
  generation: number;
  installation_generation: string;
  contribution: PluginAppContribution;
  /** How many times the recipient's activation had been withdrawn when the event was sent (`revoke`). */
  revocation: number;
  /** What a broadcast's recipient must hold, declared and granted, from the type table. */
  permission: string | undefined;
  record: PluginEventRecord;
}

/**
 * Host events (X-6, S-54): what the Host itself tells installations, such as `host.review.settled` (addressed) and
 * `host.workspace.changed` (broadcast). The type table decides which: `notify` sends only addressed types, `broadcast` only
 * broadcast ones.
 *
 * Unlike `PluginEventBus` nothing is stored. An event goes only to the installation it is addressed to, or for a broadcast to
 * each installation of the project that holds the type's permission, and only while that installation is running, enabled and
 * subscribed to the type in its current Manifest; it never starts one and is never replayed. The same conditions, and the very
 * contribution that was running when the event was sent, are checked again just before the handler runs, so a stop, crash,
 * restart, revocation, reinstall or withdrawn permission in between drops it. The handler runs outside any action, as the
 * subscriber itself; a failure is reported once and not retried.
 */
export class PluginHostEvents {
  readonly #projectId: string;
  readonly #lifecycle: PluginHostEventsLifecycle;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #failureListeners = new Set<(failure: PluginEventDeliveryFailure) => void>();
  readonly #tails = new Map<string, Promise<void>>();
  readonly #controllers = new Map<string, Set<AbortController>>();
  /** Counted by the Host, not read from the plugin: a crash stops the activation before the runtime forgets its contribution. */
  readonly #revocations = new Map<string, number>();
  #closed = false;

  constructor(input: {
    projectId: string;
    lifecycle: PluginHostEventsLifecycle;
    now?: () => Date;
    createId?: () => string;
  }) {
    this.#projectId = input.projectId;
    this.#lifecycle = input.lifecycle;
    this.#now = input.now ?? (() => new Date());
    this.#createId = input.createId ?? (() => `host-event-${randomUUID()}`);
  }

  /**
   * Queue one host event for its recipient, behind that recipient's earlier ones. False when the recipient cannot take it
   * now; the event is then dropped, not kept for later.
   */
  notify(recipient: HostEventRecipient, input: HostEventInput): boolean {
    const type = this.#type(input, "addressed");
    if (this.#closed) return false;
    const delivery = this.#prepare(recipient.plugin_id, recipient.install_id, input, type);
    if (!delivery || !this.#current(delivery)) return false;
    this.#enqueue(delivery);
    return true;
  }

  /**
   * Queue one broadcast host event for every installation of the project that can take it now, each behind its own earlier
   * events and with its own `event_id`. It names no review or caller: `correlation_id` is always null. Returns how many it was
   * queued for; the rest are not kept for later.
   */
  broadcast(input: Omit<HostEventInput, "correlation_id">): number {
    const type = this.#type(input, "broadcast");
    if (this.#closed) return 0;
    let queued = 0;
    for (const pluginId of this.#lifecycle.enabledPluginIds()) {
      const delivery = this.#prepare(pluginId, undefined, { event_type_id: input.event_type_id, type_version: input.type_version, payload: input.payload }, type);
      if (!delivery || !this.#current(delivery)) continue;
      this.#enqueue(delivery);
      queued += 1;
    }
    return queued;
  }

  /** Abort the recipient's handler that is running now; anything queued for it before now fails its own check and is dropped. */
  revoke(projectId: string, pluginId: string): void {
    if (projectId !== this.#projectId) return;
    this.#revocations.set(pluginId, (this.#revocations.get(pluginId) ?? 0) + 1);
    for (const controller of [...this.#controllers.get(pluginId) ?? []]) {
      if (!controller.signal.aborted) controller.abort();
    }
    this.#controllers.delete(pluginId);
  }

  async close(): Promise<void> {
    this.#closed = true;
    for (const pluginId of [...this.#controllers.keys()]) this.revoke(this.#projectId, pluginId);
    await this.drain();
  }

  /** Wait for queued deliveries. Test and shutdown seam, not a Plugin API. */
  async drain(): Promise<void> {
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

  /** The type as the Host declares it, sent the way the type table says; a type sent the other way is refused, not converted. */
  #type(input: Pick<HostEventInput, "event_type_id" | "type_version">, delivery: HostEventType["delivery"]): HostEventType {
    const key = eventTypeKey(input.event_type_id, input.type_version), type = hostEventType(input.event_type_id, input.type_version);
    if (!type) throw new PluginEventError("plugin.event_type_invalid", `宿主没有事件 ${key}`);
    if (type.delivery !== delivery) {
      throw new PluginEventError("plugin.event_type_invalid", type.delivery === "broadcast" ? `宿主事件 ${key} 是广播，不能定向发给一个安装` : `宿主事件 ${key} 只发给指定的安装，不能广播`);
    }
    return type;
  }

  /** One delivery to the running contribution of `pluginId`, or undefined when there is none to deliver to. */
  #prepare(pluginId: string, installId: string | undefined, input: HostEventInput, type: HostEventType): Delivery | undefined {
    const generation = this.#lifecycle.generation(pluginId);
    const installation = this.#lifecycle.installation(pluginId);
    const contribution = this.#lifecycle.contribution(pluginId);
    if (generation === undefined || installation === undefined || contribution?.kind !== "app") return undefined;
    return {
      recipient: { plugin_id: pluginId, install_id: installId ?? installation.install_id },
      generation,
      installation_generation: installation.installation_generation,
      contribution,
      revocation: this.#revocations.get(pluginId) ?? 0,
      permission: type.permission,
      record: {
        event_id: this.#createId(),
        project_id: this.#projectId,
        sequence: 0,
        event_type_id: input.event_type_id,
        type_version: input.type_version,
        source_plugin_id: HOST_EVENT_SOURCE,
        source_install_id: HOST_EVENT_SOURCE,
        payload: JSON.parse(JSON.stringify(input.payload ?? null)) as unknown,
        correlation_id: input.correlation_id ?? null,
        occurred_at: this.#now().toISOString(),
      },
    };
  }

  /**
   * The recipient is still the one the event was sent to: same enablement, installation and running contribution, still
   * subscribed, and for a broadcast still holding its permission — declared in the current Manifest and granted.
   */
  #current({ recipient, generation, installation_generation, contribution, revocation, permission, record }: Delivery): boolean {
    const installation = this.#lifecycle.installation(recipient.plugin_id);
    return !this.#closed && (this.#revocations.get(recipient.plugin_id) ?? 0) === revocation && this.#lifecycle.generation(recipient.plugin_id) === generation
      && installation?.running === true && installation.install_id === recipient.install_id
      && installation.installation_generation === installation_generation
      && this.#lifecycle.contribution(recipient.plugin_id) === contribution
      && (permission === undefined || (installation.grants.includes(permission)
        && (this.#lifecycle.manifest(recipient.plugin_id)?.permissions ?? []).some((declared) => declared.permission === permission)))
      && (this.#lifecycle.contract(recipient.plugin_id)?.subscribes ?? []).some((subscription) =>
        subscription.event_type_id === record.event_type_id && subscription.type_version === record.type_version);
  }

  /** One chain per recipient, so its host events arrive one at a time and in order. */
  #enqueue(delivery: Delivery): void {
    const key = delivery.recipient.plugin_id;
    const previous = this.#tails.get(key) ?? Promise.resolve();
    const next = outsidePluginAction(() => previous.then(() => this.#deliver(delivery)))
      .then(() => undefined, () => undefined);
    this.#tails.set(key, next);
    void next.then(() => {
      if (this.#tails.get(key) === next) this.#tails.delete(key);
    });
  }

  async #deliver(delivery: Delivery): Promise<void> {
    const { recipient, contribution, record } = delivery;
    const onEvent = contribution.onEvent;
    if (!onEvent) return; // Redemption refuses a subscriber without a handler before it runs.
    const controller = new AbortController();
    const owned = this.#controllers.get(recipient.plugin_id) ?? new Set<AbortController>();
    owned.add(controller);
    this.#controllers.set(recipient.plugin_id, owned);
    const beforeEffect = () => {
      if (controller.signal.aborted || !this.#current(delivery)) throw new PluginEventError("plugin.event_delivery_revoked", "宿主事件的收件安装已失效");
    };
    const context: PluginEventDeliveryContext = {
      project_id: this.#projectId,
      plugin_id: recipient.plugin_id,
      install_id: recipient.install_id,
      installation_generation: delivery.installation_generation,
      actor_id: `plugin:${recipient.plugin_id}`,
      signal: controller.signal,
      beforeEffect,
    };
    let abort = () => {};
    let dispatched = false;
    try {
      const aborted = new Promise<never>((_, reject) => { abort = () => reject(new PluginEventError("plugin.event_delivery_revoked", "宿主事件投递已停止")); controller.signal.addEventListener("abort", abort, { once: true }); });
      // Checked again at the moment of dispatch, not only when queued (S-54): a recipient stopped since then gets nothing.
      await Promise.race([Promise.resolve().then(() => { beforeEffect(); dispatched = true; return onEvent.call(contribution, structuredClone(record), context); }), aborted]);
    } catch {
      // Never dispatched: dropped like any other event its recipient could no longer take.
      if (dispatched) {
        const revoked = controller.signal.aborted || !this.#current(delivery);
        this.#fail(revoked ? "plugin.subscriber_revoked" : "plugin.subscriber_handler_failed", recipient.plugin_id, record,
          revoked ? "收件插件已停止，宿主事件的处理结果未确认" : "收件插件处理宿主事件时失败；宿主事件不重投");
      }
    } finally {
      controller.signal.removeEventListener("abort", abort);
      owned.delete(controller);
    }
  }

  #fail(code: PluginEventDeliveryFailure["code"], pluginId: string, record: PluginEventRecord, message: string): void {
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
