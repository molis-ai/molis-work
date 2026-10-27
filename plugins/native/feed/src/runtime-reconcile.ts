import { setTimeout } from "node:timers/promises";
import type { PluginBackgroundClient, PluginJobControl, PluginJobDeclaration } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginConnectionsClient } from "@molis-ai/molis-work-contracts/platform/plugin-connections";
import type { FeedApplication } from "./application.js";
import { FEED_CONTENT_LEDGER_BATCH, isFeedBodyRef } from "./content-ledger.js";
import { connectorSlotOf } from "./runtime-connector.js";
import { holdingsOfSnapshot } from "./source-history.js";

// What a Runtime Feed sets right on its own, without a caller (FI-4 step 4e-2f, RAC-493 and RAC-518 of
// specs/repository-anti-corruption/slices/feed-inbox-home-reference-ledger.md): the stored state of its account sources follows the account the
// person bound to each, and the Home's reference ledger names every body this project's library keeps. Both run in a job the installation
// keeps, because nothing else of an installation runs without a call: the platform's account and ledger services answer a call or a kept job.

export const FEED_RECONCILE_JOB = "feed-reconcile";
export const feedReconcileJob: PluginJobDeclaration = { job_id: FEED_RECONCILE_JOB, reason: "让账号来源的状态跟上你的账号，并让 Home 的引用账记全这个项目留着的正文",
  permissions: ["connections:use", "actions:invoke"] };

/** The journal's actor for what the installation does on its own: the plugin, not a person. */
export const FEED_RECONCILE_ACTOR = "io.molis.work.feed";

/** An event that arrived while the job was busy is not lost: the job looks again when it is done. */
export function createConnectionWatch() {
  let pending = false, wake: (() => void) | undefined;
  return {
    /** A connection of the Home changed. */
    changed(): void { pending = true; wake?.(); },
    /** Resolves when something changed since the last call (at once when it already has), or when the job is stopped. */
    async next(signal: AbortSignal): Promise<void> {
      if (!pending && !signal.aborted) await new Promise<void>(resolve => { wake = resolve; signal.addEventListener("abort", () => resolve(), { once: true }); });
      wake = undefined; pending = false;
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
  // The snapshot is the application's one way to list sources as records; this runs once at start and once per change of a connection.
  for (const source of feed.snapshot(projectId).sources) {
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
      const latest = feed.getSource(projectId, source.source_id);
      if (latest.status !== source.status) return false;
      feed.upsertSource({ ...latest, status, updated_at: new Date().toISOString(), last_error_code: usable ? null : "sources.connector_disconnected" });
      return true;
    });
    if (moved) changed += 1;
  }
  return changed;
}

/**
 * Names every body the project's library keeps in the Home's ledger, in batches the ledger takes; a body already named stays named. Only the
 * ledger's own bodies are named, not what another library keeps (`research:<id>`).
 */
export async function holdKeptBodies(ports: FeedReconcilePorts): Promise<void> {
  const { feed, projectId, hold } = ports;
  if (!hold) return;
  const snapshot = feed.snapshot(projectId);
  for (const source of snapshot.sources) {
    const kept = holdingsOfSnapshot(snapshot, source.source_id).content_refs.filter(isFeedBodyRef);
    for (let start = 0; start < kept.length; start += FEED_CONTENT_LEDGER_BATCH) await hold(source.source_id, kept.slice(start, start + FEED_CONTENT_LEDGER_BATCH));
  }
}

/** How long the job waits before each further try at start when the Home's ledger does not answer (it may start after this instance). */
export const FEED_HOLD_RETRY_DELAYS_MS: readonly number[] = [500, 2_000, 10_000, 30_000];

/** A failed step is the job's to try again, unless the job was stopped or lost its authority. */
function unlessStopped(control: PluginJobControl, error: unknown): void {
  control.assert_authority_current();
  if (error instanceof Error && error.name === "AbortError") throw error;
}

/** Whether every kept body is named, trying once and then once after each delay. */
async function holdWithRetries(ports: FeedReconcilePorts, control: PluginJobControl, delays: readonly number[]): Promise<boolean> {
  for (let attempt = 0; ; attempt += 1) {
    try { await holdKeptBodies(ports); return true; }
    catch (error) { unlessStopped(control, error); if (attempt >= delays.length) return false; }
    await setTimeout(delays[attempt], undefined, { signal: control.signal });
  }
}

/**
 * Keeps the job: the bodies are named at start, the states are set right at start, and again each time the Home says a connection changed.
 * Naming the bodies is tried a few times at start, then again at each change until it has worked, and at every start: the library itself
 * says which bodies to name, so a later try names all of them, never a failure swallowed for good. A state that fails to refresh (the account
 * service not there yet, a call refused) is tried again at the next change; the job ends only when the installation stops.
 */
export function keepFeedReconcile(background: PluginBackgroundClient | undefined, ports: FeedReconcilePorts, watch: ReturnType<typeof createConnectionWatch>,
  retryDelays: readonly number[] = FEED_HOLD_RETRY_DELAYS_MS): void {
  background?.keep(FEED_RECONCILE_JOB, async control => {
    await setTimeout(0, undefined, { signal: control.signal });
    let named = await holdWithRetries(ports, control, retryDelays);
    while (!control.signal.aborted) {
      try { await refreshAccountSourceStates(ports, control); }
      catch (error) { unlessStopped(control, error); }
      await watch.next(control.signal);
      if (!named && !control.signal.aborted) named = await holdWithRetries(ports, control, []);
    }
  });
}
