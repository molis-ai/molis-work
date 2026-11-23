import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { setTimeout } from "node:timers/promises";
import type { ActionDefinition, ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  PluginBackgroundClient, PluginJobDeclaration, PluginProjectDatabase, PluginProjectDatabaseTransaction, PluginScheduleClient, PluginScheduleJob,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleWakeupInput, ScheduleWakeupReply } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { FeedApplication } from "./application.js";
import { sourceDeletedAt } from "./contract/sources.js";

const text = { type: "string", minLength: 1 };
/**
 * Two alternating one-shot wake slots for Feed's sources: `"sources"` is the primary slot, and `"sources:next"` is armed when
 * the currently executing wakeup hands off to the next exact due time before the scheduler marks the executing one-shot disabled
 * (registering on the executing slot itself would abort the running wakeup).
 */
export const FEED_WAKE_OBJECT = "sources";
const FEED_WAKE_NEXT_OBJECT = "sources:next";
const WAKE_OBJECTS: readonly string[] = [FEED_WAKE_OBJECT, FEED_WAKE_NEXT_OBJECT];
const WAKE_TITLE = "拉取到期的 Feed 来源";
const BUSY_RETRY_MS = 50;
const STARTUP_RETRY_MS = 200;
const STARTUP_MAX_ATTEMPTS = 25;

/**
 * What the platform's clock wakes (`background.wakeups`): the plugin's own command, for the plugin audience, with the wakeup's input. It
 * needs everything a tick does, so it declares the same permissions; the platform lets a call use a service only if the action says so.
 */
export function feedWakeAction(tick: ActionDefinition): ActionDefinition<ScheduleWakeupInput, ScheduleWakeupReply> {
  return createActionDefinition<ScheduleWakeupInput, ScheduleWakeupReply>("feed.sources.wake", "command", {
    title: "拉取到期来源", description: "平台的定时器叫醒 Feed：拉取已到期的来源，并更新各来源的下次拉取时间",
    audiences: ["plugin"], scheduling: "concurrent", permissions: tick.action.permissions, subject_kinds: [],
    execution: { timeout_ms: 660_000 },
    input_schema: { type: "object", properties: { job_id: text, plugin_id: text, capability_id: text, object_ref: text, due_at: text },
      required: ["job_id", "plugin_id", "capability_id", "object_ref", "due_at"], additionalProperties: false },
    output_schema: { type: "object", properties: { status: { enum: ["ok", "failed", "plugin_unavailable"] }, detail: { type: "string" }, view_changed: { const: false } }, additionalProperties: false },
  }, /* @version action.feed.sources.wake */ 1);
}

/** The job that asks the clock: kept while the activation runs, because the clock takes a registration only from an installation that is running. */
export const FEED_WAKE_JOB = "feed-wakeup";
export const feedWakeJob: PluginJobDeclaration = { job_id: FEED_WAKE_JOB, reason: "请平台的定时器按时叫醒 Feed 去拉取到期的来源", permissions: ["schedule:read", "schedule:write"] };

export interface FeedWakeupServices {
  readonly grants: readonly string[];
  readonly scheduler: PluginScheduleClient | undefined;
  readonly database: PluginProjectDatabase | undefined;
  readonly wake: ActionDefinition;
  readonly feed: Pick<FeedApplication, "sources">;
  readonly projectId: string;
  /** Runs the reconcile callback inside a live project transaction with Feed's ports bound to it. */
  readonly withinTransaction?: <T>(beforeEffect: () => Promise<void>, body: (transaction: PluginProjectDatabaseTransaction) => T) => Promise<T>;
}

export interface FeedWakeupWatch {
  /** Signals that Feed's wake registration should be checked once no wakeup is executing. */
  dirty(): void;
  /** Resolves when `dirty()` has been signalled since the previous pass, or when `signal` aborts. */
  next(signal: AbortSignal): Promise<void>;
}

export type FeedWakeupSyncResult = "settled" | "busy";

/** Event-driven signal shared by Feed's actions, account reconciler, and kept wakeup job. */
export function createFeedWakeupWatch(): FeedWakeupWatch {
  let pending = false;
  let wake: (() => void) | undefined;
  return {
    dirty(): void {
      pending = true;
      wake?.();
    },
    async next(signal: AbortSignal): Promise<void> {
      if (!pending && !signal.aborted) {
        await new Promise<void>(resolve => {
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
  };
}

/**
 * Earliest scheduled auto-pull instant across the project's active Feed sources, normalized to UTC ISO-8601,
 * or `null` when no source currently needs automatic pulling. Matches `FeedSourceService.dueSources` eligibility.
 */
export function earliestFeedWakeAt(feed: Pick<FeedApplication, "sources">, projectId: string): string | null {
  let earliestMs = Number.POSITIVE_INFINITY;
  for (const source of feed.sources.list(projectId)) {
    if (sourceDeletedAt(source) !== null) continue;
    if (!source.enabled || source.status === "paused" || source.status === "disconnected") continue;
    const schedule = source.schedule;
    if (schedule.mode !== "interval" || !schedule.enabled || !schedule.next_pull_at) continue;
    const parsed = Date.parse(schedule.next_pull_at);
    if (Number.isFinite(parsed) && parsed < earliestMs) earliestMs = parsed;
  }
  return Number.isFinite(earliestMs) ? new Date(earliestMs).toISOString() : null;
}

function canUseScheduler(services: FeedWakeupServices): services is FeedWakeupServices & { readonly scheduler: PluginScheduleClient; readonly database: PluginProjectDatabase } {
  return Boolean(services.scheduler && services.database && services.grants.includes("schedule:read") && services.grants.includes("schedule:write"));
}

function wakeJobs(scheduler: PluginScheduleClient, wake: ActionDefinition): PluginScheduleJob[] {
  return scheduler.list().filter(job => job.capability_id === wake.capability_id);
}

function matchesIdleWakeup(jobs: readonly PluginScheduleJob[], dueAt: string | null): boolean {
  const enabled = jobs.filter(job => job.enabled);
  if (dueAt === null) return enabled.length === 0;
  if (enabled.length !== 1) return false;
  const active = enabled[0]!;
  return WAKE_OBJECTS.includes(active.object_ref) && active.authorization === "current"
    && active.recurrence.kind === "once" && active.next_due_at === dueAt;
}

function matchesHandoffWakeup(jobs: readonly PluginScheduleJob[], runningJob: PluginScheduleJob, targetObject: string, dueAt: string | null): boolean {
  const others = jobs.filter(job => job.job_id !== runningJob.job_id && job.enabled);
  if (dueAt === null) return others.length === 0;
  if (others.length !== 1) return false;
  const target = others[0]!;
  return target.object_ref === targetObject && target.authorization === "current"
    && target.recurrence.kind === "once" && target.next_due_at === dueAt;
}

/**
 * Resolves the effective wall clock for a `feed.sources.wake` run using the scheduler's own executing job timestamp:
 * in production `now >= next_due_at` always holds so real wall clock is used; when a caller advances the scheduler clock
 * to a future due instant, the job's own trusted `next_due_at` allows the due source at that instant to be pulled.
 */
export function wakeTimeForInput(services: FeedWakeupServices, input: ScheduleWakeupInput, now: () => Date = () => new Date()): Date {
  const current = now();
  if (!canUseScheduler(services)) return current;
  const job = services.scheduler.get(input.job_id);
  if (!job || job.capability_id !== services.wake.capability_id || job.object_ref !== input.object_ref
    || job.authorization !== "current" || !services.scheduler.isExecuting(job.job_id)) {
    return current;
  }
  const dueMs = Date.parse(job.next_due_at);
  return Number.isFinite(dueMs) && dueMs > current.getTime() ? new Date(dueMs) : current;
}

/**
 * Reconciles Feed's `schedule_jobs` registration atomically inside the caller's live project transaction.
 * - Without `handoffFrom`: if a wake job is currently executing, returns `"busy"` without touching `schedule_jobs` (so
 *   the running wakeup is never aborted). Otherwise registers the single exact earliest one-shot due time on `"sources"`
 *   or disables any enabled Feed wake jobs when no source needs auto-pull.
 * - With `handoffFrom` (the finishing wakeup's `job_id`): arms the alternating slot (`"sources"` <-> `"sources:next"`)
 *   with the next exact due time before the scheduler finishes and disables the executing one-shot job.
 */
export function reconcileFeedWakeupInTransaction(
  services: FeedWakeupServices,
  transaction: PluginProjectDatabaseTransaction,
  options: { readonly handoffFrom?: string } = {},
): FeedWakeupSyncResult {
  if (!canUseScheduler(services)) return "settled";
  const { scheduler, wake, feed, projectId } = services;
  const dueAt = earliestFeedWakeAt(feed, projectId);
  const jobs = wakeJobs(scheduler, wake);
  const executing = jobs.filter(job => scheduler.isExecuting(job.job_id));
  if (options.handoffFrom !== undefined) {
    const runningJob = executing.find(job => job.job_id === options.handoffFrom);
    if (executing.some(job => job.job_id !== options.handoffFrom)) return "busy";
    if (runningJob) {
      const targetObject = runningJob.object_ref === FEED_WAKE_OBJECT ? FEED_WAKE_NEXT_OBJECT : FEED_WAKE_OBJECT;
      if (!matchesHandoffWakeup(jobs, runningJob, targetObject, dueAt)) {
        scheduler.join(transaction, writer => {
          if (dueAt !== null) {
            writer.register({
              action: { capability_id: wake.capability_id, version: wake.version },
              object_ref: targetObject, title: WAKE_TITLE, due_at: dueAt, recurrence: { kind: "once" },
            });
          }
          for (const other of jobs) {
            if (other.job_id !== runningJob.job_id && (dueAt === null || other.object_ref !== targetObject) && other.enabled) {
              writer.setEnabled(other.job_id, false);
            }
          }
        });
      }
      // An interval-recurrence row stays enabled when its wakeup ends; mark busy so the kept job disables it immediately after.
      return runningJob.recurrence.kind === "once" ? "settled" : "busy";
    }
  }
  if (executing.length > 0) return "busy";
  if (matchesIdleWakeup(jobs, dueAt)) return "settled";
  scheduler.join(transaction, writer => {
    if (dueAt === null) {
      for (const job of jobs) if (job.enabled) writer.setEnabled(job.job_id, false);
      return;
    }
    writer.register({
      action: { capability_id: wake.capability_id, version: wake.version },
      object_ref: FEED_WAKE_OBJECT, title: WAKE_TITLE, due_at: dueAt, recurrence: { kind: "once" },
    });
    for (const job of jobs) {
      if (job.object_ref !== FEED_WAKE_OBJECT && job.enabled) writer.setEnabled(job.job_id, false);
    }
  });
  return "settled";
}

/**
 * Checks whether Feed's wake registration matches the current sources; opens a write transaction only when a change is needed,
 * so startup with no scheduled sources or an already-current wakeup performs zero writes.
 */
async function ensureFeedWakeup(options: FeedWakeupServices & { beforeEffect(): Promise<void> }): Promise<FeedWakeupSyncResult> {
  if (!canUseScheduler(options)) return "settled";
  const jobs = wakeJobs(options.scheduler, options.wake);
  if (jobs.some(job => options.scheduler.isExecuting(job.job_id))) return "busy";
  const dueAt = earliestFeedWakeAt(options.feed, options.projectId);
  if (matchesIdleWakeup(jobs, dueAt)) return "settled";
  const run = options.withinTransaction
    ? (body: (transaction: PluginProjectDatabaseTransaction) => FeedWakeupSyncResult) => options.withinTransaction!(options.beforeEffect, body)
    : (body: (transaction: PluginProjectDatabaseTransaction) => FeedWakeupSyncResult) => options.database.transaction(options.beforeEffect, body);
  return await run(transaction => reconcileFeedWakeupInTransaction(options, transaction));
}

export interface FeedWakeupCoordinator {
  sync(transaction: PluginProjectDatabaseTransaction): void;
  wakeAt(input: ScheduleWakeupInput): Date;
  afterWake(caller: ActionExecutionContext, jobId: string): Promise<void>;
  markDirty(): void;
  start(background: PluginBackgroundClient | undefined): void;
}

/** Coordinates startup recovery, transaction-atomic updates, post-wake handoff, and background retries for Feed's wake job. */
export function createFeedWakeupCoordinator(
  services: FeedWakeupServices,
  commitWake: (caller: ActionExecutionContext, afterWrite: (transaction: PluginProjectDatabaseTransaction) => void) => Promise<void>,
): FeedWakeupCoordinator {
  const watch = createFeedWakeupWatch();
  return {
    sync(transaction: PluginProjectDatabaseTransaction): void {
      if (reconcileFeedWakeupInTransaction(services, transaction) === "busy") watch.dirty();
    },
    wakeAt(input: ScheduleWakeupInput): Date {
      return wakeTimeForInput(services, input);
    },
    async afterWake(caller: ActionExecutionContext, jobId: string): Promise<void> {
      if (!canUseScheduler(services)) return;
      try {
        await commitWake(caller, transaction => {
          if (reconcileFeedWakeupInTransaction(services, transaction, { handoffFrom: jobId }) === "busy") watch.dirty();
        });
      } catch (error) {
        watch.dirty();
        throw error;
      }
    },
    markDirty(): void { watch.dirty(); },
    start(background: PluginBackgroundClient | undefined): void { keepFeedWakeup(background, services, watch); },
  };
}

/**
 * Keeps Feed's wake registration synchronized on startup/recovery and whenever source state changes outside a direct action commit
 * (account connection changes, or a wakeup that exited while busy or on a prior interval job). Parks with no timer once settled.
 */
export function keepFeedWakeup(background: PluginBackgroundClient | undefined, services: FeedWakeupServices, watch: FeedWakeupWatch): void {
  background?.keep(FEED_WAKE_JOB, async control => {
    await setTimeout(0, undefined, { signal: control.signal });
    let attempts = 0;
    while (!control.signal.aborted) {
      try {
        const state = await ensureFeedWakeup({ ...services, beforeEffect: control.beforeEffect });
        attempts = 0;
        if (state === "busy") {
          await setTimeout(BUSY_RETRY_MS, undefined, { signal: control.signal });
          continue;
        }
        await watch.next(control.signal);
      } catch (error) {
        control.assert_authority_current();
        if (error instanceof Error && error.name === "AbortError") throw error;
        if (attempts >= STARTUP_MAX_ATTEMPTS) {
          attempts = 0;
          await watch.next(control.signal);
          continue;
        }
        attempts += 1;
        await setTimeout(STARTUP_RETRY_MS, undefined, { signal: control.signal });
      }
    }
  });
}
