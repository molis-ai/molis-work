import { setTimeout } from "node:timers/promises";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundClient, PluginJobDeclaration, PluginProjectDatabase, PluginScheduleClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleWakeupInput, ScheduleWakeupReply } from "@molis-ai/molis-work-contracts/services/scheduler";

const text = { type: "string", minLength: 1 };
/** The same cadence the Host's own clock gave Feed's sources; a source's interval is its own and is never shorter than the clock's. */
export const FEED_WAKE_INTERVAL_MS = 30_000;
const WAKE_OBJECT = "sources";

/**
 * What the platform's clock wakes (`background.wakeups`): the plugin's own command, for the plugin audience, with the wakeup's input. It
 * needs everything a tick does, so it declares the same permissions; the platform lets a call use a service only if the action says so.
 */
export function feedWakeAction(tick: ActionDefinition): ActionDefinition<ScheduleWakeupInput, ScheduleWakeupReply> {
  return { capability_id: "feed.sources.wake", version: 1, operation: "command", action: {
    title: "拉取到期来源", description: "平台的定时器叫醒 Feed：拉取已到期的来源，并更新各来源的下次拉取时间",
    kind: "operation", scope: "project", audiences: ["plugin"], scheduling: "concurrent", permissions: tick.action.permissions, subject_kinds: [],
    execution: { timeout_ms: 660_000 },
    input_schema: { type: "object", properties: { job_id: text, plugin_id: text, capability_id: text, object_ref: text, due_at: text },
      required: ["job_id", "plugin_id", "capability_id", "object_ref", "due_at"], additionalProperties: false },
    output_schema: { type: "object", properties: { status: { enum: ["ok", "failed", "plugin_unavailable"] }, detail: { type: "string" } }, additionalProperties: false },
  } };
}

/** The job that asks the clock: kept while the activation runs, because the clock takes a registration only from an installation that is running. */
export const FEED_WAKE_JOB = "feed-wakeup";
export const feedWakeJob: PluginJobDeclaration = { job_id: FEED_WAKE_JOB, reason: "请平台的定时器按时叫醒 Feed 去拉取到期的来源", permissions: ["schedule:read", "schedule:write"] };

interface WakeupServices {
  readonly grants: readonly string[];
  readonly scheduler: PluginScheduleClient | undefined;
  readonly database: PluginProjectDatabase | undefined;
  readonly wake: ActionDefinition;
}

/**
 * Asks the platform's clock to wake Feed's sources every `FEED_WAKE_INTERVAL_MS`: only where the clock is granted, and only when the job is
 * not already there as this installation's own, because registering again would restart its interval.
 */
async function ensureFeedWakeup(options: WakeupServices & { beforeEffect(): Promise<void> }): Promise<void> {
  const { scheduler, database, wake } = options;
  if (!scheduler || !database || !options.grants.includes("schedule:read") || !options.grants.includes("schedule:write")) return;
  const current = scheduler.list().find(job => job.capability_id === wake.capability_id && job.object_ref === WAKE_OBJECT);
  if (current?.enabled && current.authorization === "current" && current.recurrence.kind === "interval" && current.recurrence.interval_ms === FEED_WAKE_INTERVAL_MS) return;
  await database.transaction(options.beforeEffect, transaction => scheduler.join(transaction, writer => writer.register({
    action: { capability_id: wake.capability_id, version: wake.version }, object_ref: WAKE_OBJECT, title: "拉取到期的 Feed 来源",
    due_at: new Date().toISOString(), recurrence: { kind: "interval", interval_ms: FEED_WAKE_INTERVAL_MS } })));
}

/** Keeps the job that sets the wakeup, trying again for a few seconds while the installation is still being recorded as running. */
export function keepFeedWakeup(background: PluginBackgroundClient | undefined, services: WakeupServices): void {
  background?.keep(FEED_WAKE_JOB, async control => {
    await setTimeout(0, undefined, { signal: control.signal });
    for (let attempt = 0; ; attempt += 1) {
      try { return await ensureFeedWakeup({ ...services, beforeEffect: control.beforeEffect }); }
      catch (error) {
        control.assert_authority_current();
        if (attempt >= 25) throw error;
        await setTimeout(200, undefined, { signal: control.signal });
      }
    }
  });
}
