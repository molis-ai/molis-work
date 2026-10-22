import { randomUUID } from "node:crypto";

import {
  eventTypeKey,
  HOST_EVENT_SOURCE,
  isHostEventType,
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
  record: PluginEventRecord;
}

/**
 * Host events (X-6, S-54): what the Host itself tells one installation, such as `host.review.settled`.
 *
 * Unlike `PluginEventBus` nothing is stored. An event goes only to the installation it is addressed to, and only while that
 * installation is running, enabled and subscribed to the type in its current Manifest; it never starts one and is never
 * replayed. The same conditions, and the very contribution that was running when the event was sent, are checked again just
 * before the handler runs, so a stop, restart, revocation or reinstall in between drops it. The handler runs outside any
 * action, as the subscriber itself; a failure is reported once and not retried.
 */
export class PluginHostEvents {
  readonly #projectId: string;
  readonly #lifecycle: PluginHostEventsLifecycle;
  readonly #now: () => Date;
  readonly #createId: () => string;
  readonly #failureListeners = new Set<(failure: PluginEventDeliveryFailure) => void>();
  readonly #tails = new Map<string, Promise<void>>();
  readonly #controllers = new Map<string, Set<AbortController>>();
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
    if (!isHostEventType(input.event_type_id, input.type_version)) {
      throw new PluginEventError("plugin.event_type_invalid", `宿主没有事件 ${eventTypeKey(input.event_type_id, input.type_version)}`);
    }
    if (this.#closed) return false;
    const generation = this.#lifecycle.generation(recipient.plugin_id);
    const installation = this.#lifecycle.installation(recipient.plugin_id);
    const contribution = this.#lifecycle.contribution(recipient.plugin_id);
    if (generation === undefined || installation === undefined || contribution?.kind !== "app") return false;
    const delivery: Delivery = {
      recipient: { plugin_id: recipient.plugin_id, install_id: recipient.install_id },
      generation,
      installation_generation: installation.installation_generation,
      contribution,
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
    if (!this.#current(delivery)) return false;
    this.#enqueue(delivery);
    return true;
  }

  /** Abort the recipient's handler that is running now; anything still queued for it fails its own check and is dropped. */
  revoke(projectId: string, pluginId: string): void {
    if (projectId !== this.#projectId) return;
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

  /** The recipient is still the one the event was sent to: same enablement, installation and running contribution, still subscribed. */
  #current({ recipient, generation, installation_generation, contribution, record }: Delivery): boolean {
    const installation = this.#lifecycle.installation(recipient.plugin_id);
    return !this.#closed && this.#lifecycle.generation(recipient.plugin_id) === generation
      && installation?.running === true && installation.install_id === recipient.install_id
      && installation.installation_generation === installation_generation
      && this.#lifecycle.contribution(recipient.plugin_id) === contribution
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
