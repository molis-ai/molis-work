import { setTimeout } from "node:timers/promises";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundClient, PluginJobControl, PluginJobDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConnectionsClient } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import type { FeedApplication } from "./application.js";
import { connectorSlotOf } from "./runtime-connector.js";
import { keptProjectBodyPages } from "./history-pages.js";

// What a Runtime Feed sets right on its own, without a caller (FI-4 step 4e-2f, RAC-493 and RAC-518 of
// specs/archive/repository-anti-corruption/slices/feed-inbox-home-reference-ledger.md): the stored state of its account sources follows the account the
// person bound to each, and the Home's reference ledger names every body this project's library keeps. Both run in a job the installation
// keeps, because nothing else of an installation runs without a call: the platform's account and ledger services answer a call or a kept job.

export const FEED_RECONCILE_JOB = "feed-reconcile";
export const feedReconcileJob: PluginJobDeclaration = {
  job_id: FEED_RECONCILE_JOB,
  reason: "让账号来源的状态跟上你的账号，并让 Home 的引用账记全这个项目留着的正文",
  permissions: ["connections:use", "actions:invoke"],
};

/** The journal's actor for what the installation does on its own: the plugin, not a person. */
export const FEED_RECONCILE_ACTOR = "io.molis.work.feed";

export interface FeedReconcileHoldGroup {
  readonly source_id: string;
  readonly refs: readonly string[];
}

interface PendingHoldRequest {
  readonly groups: readonly FeedReconcileHoldGroup[];
  resolve(): void;
  reject(error: unknown): void;
}

/** An event that arrived while the job was busy is not lost: the job looks again when it is done. */
export function createConnectionWatch() {
  let pending = false;
  let bodiesDirty = false;
  let stopped = false;
  let wake: (() => void) | undefined;
  const pendingHolds: PendingHoldRequest[] = [];

  const hasWork = () => pending || bodiesDirty || pendingHolds.length > 0;

  return {
    /** A connection of the Home changed. */
    changed(): void {
      pending = true;
      wake?.();
    },
    /** Project body references changed outside a direct source pull (e.g. personal sync apply or recovery). */
    bodiesChanged(): void {
      bodiesDirty = true;
      wake?.();
    },
    /** Queues explicit body holds to run inside the reconcile job's authorized scope, waking it immediately. */
    enqueueHold(groups: readonly FeedReconcileHoldGroup[]): Promise<void> {
      if (groups.length === 0) return Promise.resolve();
      if (stopped) {
        return Promise.reject(new ActionError("actions.cancelled", "Feed 正文引用登记已停止"));
      }
      return new Promise<void>((resolve, reject) => {
        pendingHolds.push({ groups, resolve, reject });
        wake?.();
      });
    },
    /** Resolves when something changed since the last call (at once when it already has), or when the job is stopped. */
    async next(signal: AbortSignal): Promise<void> {
      if (!hasWork() && !signal.aborted) {
        await new Promise<void>((resolve) => {
          const done = () => {
            signal.removeEventListener("abort", done);
            resolve();
          };
          wake = done;
          signal.addEventListener("abort", done, { once: true });
        });
      }
      wake = undefined;
      pending = false;
    },
    /** Waits for a retry delay, waking early only when explicit sync holds arrive or the signal aborts. */
    async waitRetry(ms: number, signal: AbortSignal): Promise<boolean> {
      if (pendingHolds.length > 0) return true;
      if (signal.aborted) {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        throw error;
      }
      return await new Promise<boolean>((resolve, reject) => {
        const cleanup = () => {
          globalThis.clearTimeout(timer);
          signal.removeEventListener("abort", onAbort);
          if (wake === onWake) wake = undefined;
        };
        const onAbort = () => {
          cleanup();
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        };
        const onWake = () => {
          if (pendingHolds.length === 0) return;
          cleanup();
          resolve(true);
        };
        const timer = globalThis.setTimeout(() => {
          cleanup();
          resolve(false);
        }, ms);
        wake = onWake;
        signal.addEventListener("abort", onAbort, { once: true });
      });
    },
    consumeBodiesDirty(): boolean {
      const value = bodiesDirty;
      bodiesDirty = false;
      return value;
    },
    shiftHold(): PendingHoldRequest | undefined {
      return pendingHolds.shift();
    },
    failPendingHolds(error: unknown): void {
      stopped = true;
      while (pendingHolds.length > 0) {
        pendingHolds.shift()!.reject(error);
      }
    },
  };
}

export interface FeedReconcilePorts {
  readonly feed: FeedApplication;
  readonly projectId: string;
  readonly connections: PluginConnectionsClient | undefined;
  /** One commit, with the job's own last check. */
  commit<T>(control: PluginJobControl, body: () => T): Promise<T>;
  /** Names bodies in the Home's reference ledger (idempotent); absent when the installation may not reach the ledger. */
  hold: ((sourceId: string, contentRefs: readonly string[]) => Promise<void>) | undefined;
  /** Notified when account reconciliation moves one or more sources between active and disconnected states. */
  onSourceStateChanged?: () => void;
}

/**
 * Brings the stored state of each account source in step with the account the person bound to it: an account that is not usable takes an
 * active source to `disconnected`, a usable one gives it back; a paused source stays paused, and a source with no account is left to the
 * sync, which tells the person. Correctness never rests on this: a pull asks the account again before it reads or writes anything.
 */
export async function refreshAccountSourceStates(ports: FeedReconcilePorts, control: PluginJobControl): Promise<number> {
  const { feed, projectId, connections } = ports;
  if (!connections) return 0;
  let changed = 0;
  // Source state reads never load the project's messages or materials.
  for (const source of feed.sources.list(projectId)) {
    const lifecycle = source.config._molis_work_lifecycle as { deleted_at?: string } | undefined;
    const slot = connectorSlotOf(source);
    if (slot === null || !source.enabled || lifecycle?.deleted_at) continue;
    const account = await connections.describe(slot, source.source_id);
    if (!account.bound) continue;
    const usable = account.state === "connected";
    const status = usable ? (source.status === "disconnected" ? "active" : source.status) : (source.status === "paused" ? "paused" : "disconnected");
    if (status === source.status) continue;
    const moved = await ports.commit(control, () => {
      // The source may have moved since it was read; only the one that was read is changed.
      const latest = feed.sources.get(projectId, source.source_id);
      if (latest.status !== source.status) return false;
      feed.sources.upsert({ ...latest, status, updated_at: new Date().toISOString(), last_error_code: usable ? null : "sources.connector_disconnected" });
      return true;
    });
    if (moved) changed += 1;
  }
  return changed;
}

/**
 * Names every body the project's library keeps in the Home's ledger, in batches the ledger takes; a body already named stays named. Only the
 * ledger's own bodies are named, not what another library keeps (`research:<id>`). Covers active sources, retain_history retired sources,
 * unassigned items (`source_id IS NULL`), and signals/revisions.
 */
export async function holdKeptBodies(ports: FeedReconcilePorts): Promise<void> {
  const { feed, projectId, hold } = ports;
  if (!hold) return;
  for (const batch of keptProjectBodyPages(feed, projectId)) {
    await hold(batch.source_id, batch.refs);
  }
}

/** How long the job waits before each further try at start when the Home's ledger does not answer (it may start after this instance). */
export const FEED_HOLD_RETRY_DELAYS_MS: readonly number[] = [500, 2_000, 10_000, 30_000];

/** A failed step is the job's to try again, unless the job was stopped or lost its authority. */
function unlessStopped(control: PluginJobControl, error: unknown): void {
  control.assert_authority_current();
  if (error instanceof Error && error.name === "AbortError") throw error;
}

async function drainPendingHolds(
  ports: FeedReconcilePorts,
  control: PluginJobControl,
  watch: ReturnType<typeof createConnectionWatch>,
): Promise<void> {
  for (;;) {
    const request = watch.shiftHold();
    if (!request) return;
    try {
      control.assert_authority_current();
      if (control.signal.aborted) {
        throw new ActionError("actions.cancelled", "Feed 正文引用登记已取消");
      }
      if (!ports.hold) {
        throw new ActionError("actions.dependency_missing", "Feed 需要引用账服务才能登记同步正文");
      }
      for (const group of request.groups) {
        if (group.refs.length === 0) continue;
        await ports.hold(group.source_id, group.refs);
      }
      request.resolve();
    } catch (error) {
      request.reject(error);
      unlessStopped(control, error);
    }
  }
}

/** Whether every kept body is named, trying once and then once after each delay. */
async function holdWithRetries(
  ports: FeedReconcilePorts,
  control: PluginJobControl,
  watch: ReturnType<typeof createConnectionWatch>,
  delays: readonly number[],
): Promise<boolean> {
  let attempt = 0;
  for (;;) {
    await drainPendingHolds(ports, control, watch);
    try {
      await holdKeptBodies(ports);
      return true;
    } catch (error) {
      unlessStopped(control, error);
      if (attempt >= delays.length) return false;
      const delayMs = delays[attempt]!;
      attempt += 1;
      const wokeForHold = await watch.waitRetry(delayMs, control.signal);
      if (wokeForHold) {
        await drainPendingHolds(ports, control, watch);
      }
    }
  }
}

/**
 * Keeps the job: the bodies are named at start, the states are set right at start, and again each time the Home says a connection changed.
 * Naming the bodies is tried a few times at start, then again at each change until it has worked, and at every start: the library itself
 * says which bodies to name, so a later try names all of them, never a failure swallowed for good. A state that fails to refresh (the account
 * service not there yet, a call refused) is tried again at the next change; the job ends only when the installation stops.
 */
export function keepFeedReconcile(
  background: PluginBackgroundClient | undefined,
  ports: FeedReconcilePorts,
  watch: ReturnType<typeof createConnectionWatch>,
  retryDelays: readonly number[] = FEED_HOLD_RETRY_DELAYS_MS,
): void {
  background?.keep(FEED_RECONCILE_JOB, async (control) => {
    try {
      await setTimeout(0, undefined, { signal: control.signal });
      await drainPendingHolds(ports, control, watch);
      let named = await holdWithRetries(ports, control, watch, retryDelays);
      while (!control.signal.aborted) {
        await drainPendingHolds(ports, control, watch);
        try {
          if (await refreshAccountSourceStates(ports, control) > 0) {
            ports.onSourceStateChanged?.();
          }
        } catch (error) {
          unlessStopped(control, error);
        }
        await drainPendingHolds(ports, control, watch);
        await watch.next(control.signal);
        await drainPendingHolds(ports, control, watch);
        const dirty = watch.consumeBodiesDirty();
        if ((!named || dirty) && !control.signal.aborted) {
          named = await holdWithRetries(ports, control, watch, []);
        }
      }
    } finally {
      watch.failPendingHolds(new ActionError("actions.cancelled", "Feed 正文引用登记已停止"));
    }
  });
}
