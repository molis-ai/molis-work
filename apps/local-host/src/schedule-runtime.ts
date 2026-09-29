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
  migrateScheduleConversationTasks,
  rescheduleEnabledConversationTasks,
  type ScheduledTaskRunner,
} from "@molis-ai/molis-work-plugin-schedule";
import { deliverHostReminder, LEGACY_REMINDER_OWNER, LEGACY_REMINDER_WAKEUP, migrateLegacyReminders } from "./schedule-reminders.js";
import { LEGACY_OPERATION_OWNER, LEGACY_OPERATION_WAKEUP, migrateLegacyScheduledOperations, runHostScheduledOperation } from "./schedule-operations.js";

const wakeupIndex = new PluginWakeupIndex();
const tickContext = new AsyncLocalStorage<{
  db: ScheduleSqliteDatabase;
  runner: ScheduledTaskRunner;
}>();
const runners = new WeakMap<object, ScheduledTaskRunner>();
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
  for (const [owner, capability] of [[SCHEDULE_PLUGIN_ID, SCHEDULE_REMINDER_WAKEUP], [LEGACY_REMINDER_OWNER, LEGACY_REMINDER_WAKEUP]] as const) {
    wakeupIndex.register(owner, capability, async (input, control) => {
      const ctx = tickContext.getStore();
      if (!ctx) throw new Error("提醒没有项目现场");
      return deliverHostReminder(ctx.db, input, control);
    });
  }
  for (const [owner, capability] of [[SCHEDULE_PLUGIN_ID, SCHEDULE_OPERATION_WAKEUP], [LEGACY_OPERATION_OWNER, LEGACY_OPERATION_WAKEUP]] as const) {
    wakeupIndex.register(owner, capability, async (input, control) => {
      const ctx = tickContext.getStore();
      if (!ctx) throw new Error("定时操作没有项目现场");
      return runHostScheduledOperation(ctx.db, input, control);
    }, { prepare(input) {
      const ctx = tickContext.getStore();
      if (!ctx) throw new Error("定时操作没有项目现场");
      prepareScheduledOperation(ctx.db, input);
    } });
  }
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
  migrateScheduleConversationTasks(db);
  const inner = createScheduleService(db, {
    wakeupIndex,
    ...(now ? { now } : {}),
  });
  migrateLegacyReminders(db, inner);
  migrateLegacyScheduledOperations(db, inner);
  return {
    ...inner,
    async tick(at) {
      const runner = runners.get(db) ?? missingRunner;
      const when = at ?? now?.() ?? new Date();
      return tickContext.run({ db, runner }, async () => {
        // A long-lived timer may have first opened while an old process still held a lease.
        // Retry the one-way import before claiming any newly available legacy wakeup.
        migrateLegacyScheduledOperations(db, inner);
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
