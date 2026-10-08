import { AsyncLocalStorage } from "node:async_hooks";

import {
  PluginWakeupIndex,
  createScheduleService,
  registerScheduleCapabilities,
  type ScheduleService,
  type ScheduleSqliteDatabase,
  type ScheduleWakeupControl,
  type ScheduleWakeupReply,
} from "@molis-ai/molis-work-service-scheduler";
import {
  SCHEDULE_PLUGIN_ID,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
  SCHEDULE_REMINDER_WAKEUP,
  SCHEDULE_OPERATION_WAKEUP,
  prepareScheduledOperation,
  reconcileScheduledOperations,
  handleScheduleTaskWakeup,
  SCHEDULE_TASKS_SCHEMA_SQL,
  SCHEDULE_REMINDERS_SCHEMA_SQL,
  SCHEDULED_OPERATIONS_SCHEMA_SQL,
  rescheduleEnabledConversationTasks,
  type ScheduledTaskRunner,
} from "@molis-ai/molis-work-plugin-schedule";
import { deliverHostReminder } from "./schedule-reminders.js";
import { runHostScheduledOperation } from "./schedule-operations.js";
import { createLocalFeedApplication, type LocalFeedApplicationOptions } from "./feed-application.js";

const wakeupIndex = new PluginWakeupIndex();
const tickContext = new AsyncLocalStorage<{
  db: ScheduleSqliteDatabase;
  runner: ScheduledTaskRunner;
}>();
const runners = new WeakMap<object, ScheduledTaskRunner>();
const deliveryFeeds = new WeakMap<object, LocalFeedApplicationOptions>();
let wakeupBound = false;

const missingRunner: ScheduledTaskRunner = {
  async run() {
    throw new Error("还没有配置到点执行的 Agent");
  },
};

function ensureHostWakeups(): void {
  if (wakeupBound) return;
  wakeupBound = true;
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_TASK_WAKEUP_CAPABILITY, async (input, control) => {
    const ctx = tickContext.getStore();
    if (!ctx) throw new Error("闹钟叫醒没有项目现场");
    return handleScheduleTaskWakeup(ctx.db, input.object_ref, ctx.runner, undefined, control);
  });
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_REMINDER_WAKEUP, async (input, control) => {
    const ctx = tickContext.getStore();
    if (!ctx) throw new Error("提醒没有项目现场");
    const feed = deliveryFeed(ctx.db);
    const reply = deliverHostReminder(ctx.db, input, control, feed);
    await judgeDelivered(feed, control);
    return reply;
  });
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_OPERATION_WAKEUP, async (input, control) => {
    const ctx = tickContext.getStore();
    if (!ctx) throw new Error("定时操作没有项目现场");
    const feed = deliveryFeed(ctx.db);
    const reply = await runHostScheduledOperation(ctx.db, input, control, feed);
    await judgeDelivered(feed, control);
    return reply;
  }, { prepare(input) {
    const ctx = tickContext.getStore();
    if (!ctx) throw new Error("定时操作没有项目现场");
    prepareScheduledOperation(ctx.db, input);
  } });
}

/** Reminders and scheduled results enter Feed through a wakeup, so the project binds the judgments such an entry starts. */
export function bindScheduleDeliveryFeed(db: ScheduleSqliteDatabase, options: LocalFeedApplicationOptions): void {
  deliveryFeeds.set(db, options);
}

function deliveryFeed(db: ScheduleSqliteDatabase) {
  return createLocalFeedApplication(db as Parameters<typeof createLocalFeedApplication>[0], deliveryFeeds.get(db));
}

/**
 * The delivery has committed (a rolled-back or refused one threw before this point), so the Inbox next step and
 * capture rules its item started run now. They follow the delivery: a model failure never un-delivers a reminder,
 * and a wakeup that lost its lease starts nothing new.
 */
async function judgeDelivered(feed: ReturnType<typeof deliveryFeed>, control: ScheduleWakeupControl): Promise<void> {
  if (control.signal.aborted) return;
  try { await feed.flushPendingJudgments(); } catch { /* The judgment is recorded or can be asked for again from the Inbox entry. */ }
}

/**
 * A host-composed wakeup. The project tick supplies the database the job lives in.
 * Registering twice for the same plugin and capability replaces the handler.
 */
export function registerHostWakeup(pluginId: string, capabilityId: string,
  handler: (db: ScheduleSqliteDatabase, input: Parameters<Parameters<PluginWakeupIndex["register"]>[2]>[0], control: ScheduleWakeupControl) => Promise<ScheduleWakeupReply | void>): () => void {
  return wakeupIndex.register(pluginId, capabilityId, async (input, control) => {
    const ctx = tickContext.getStore();
    if (!ctx) throw new Error("闹钟叫醒没有项目现场");
    return handler(ctx.db, input, control);
  });
}

export function bindScheduledTaskRunner(db: ScheduleSqliteDatabase, runner: ScheduledTaskRunner): void {
  runners.set(db, runner);
}

export function scheduleServiceFor(db: ScheduleSqliteDatabase, now?: () => Date): ScheduleService {
  ensureHostWakeups();
  db.exec(SCHEDULE_TASKS_SCHEMA_SQL);
  const inner = createScheduleService(db, {
    wakeupIndex,
    ...(now ? { now } : {}),
  });
  db.exec(SCHEDULE_REMINDERS_SCHEMA_SQL);
  db.exec(SCHEDULED_OPERATIONS_SCHEMA_SQL);
  return {
    ...inner,
    async tick(at) {
      const runner = runners.get(db) ?? missingRunner;
      const when = at ?? now?.() ?? new Date();
      return tickContext.run({ db, runner }, async () => {
        reconcileScheduledOperations(db, inner);
        const result = await inner.tick(when);
        reconcileScheduledOperations(db, inner);
        await rescheduleEnabledConversationTasks(db, inner, () => when);
        return result;
      });
    },
  };
}

export function registerHostScheduleCapabilities<Context>(
  registrar: Parameters<typeof registerScheduleCapabilities<Context>>[0],
  dbFor: (context: Context) => ScheduleSqliteDatabase,
  nowFor?: (context: Context) => () => Date,
): void {
  registerScheduleCapabilities(registrar, (context) =>
    scheduleServiceFor(dbFor(context), nowFor?.(context)));
}
