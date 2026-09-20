import { AsyncLocalStorage } from "node:async_hooks";

import {
  PluginWakeupIndex,
  createScheduleService,
  registerScheduleCapabilities,
  scheduleFingerprint,
  type ScheduleService,
  type ScheduleSqliteDatabase,
} from "@molis-ai/molis-work-service-scheduler";
import {
  SCHEDULE_PLUGIN_ID,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
  handleScheduleTaskWakeup,
  migrateScheduleConversationTasks,
  rescheduleEnabledConversationTasks,
  scheduleConversationFingerprint,
  type ScheduledTaskRunner,
} from "@molis-ai/molis-work-plugin-schedule";

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

function ensureConversationWakeup(): void {
  if (wakeupBound) return;
  wakeupBound = true;
  wakeupIndex.register(SCHEDULE_PLUGIN_ID, SCHEDULE_TASK_WAKEUP_CAPABILITY, async (input) => {
    const ctx = tickContext.getStore();
    if (!ctx) throw new Error("闹钟叫醒没有项目现场");
    return handleScheduleTaskWakeup(ctx.db, input.object_ref, ctx.runner);
  });
}

export function bindScheduledTaskRunner(db: ScheduleSqliteDatabase, runner: ScheduledTaskRunner): void {
  runners.set(db, runner);
}

export function scheduleServiceFor(db: ScheduleSqliteDatabase, now?: () => Date): ScheduleService {
  ensureConversationWakeup();
  migrateScheduleConversationTasks(db);
  const inner = createScheduleService(db, {
    wakeupIndex,
    ...(now ? { now } : {}),
  });
  return {
    ...inner,
    async tick(at) {
      const runner = runners.get(db) ?? missingRunner;
      const when = at ?? now?.() ?? new Date();
      return tickContext.run({ db, runner }, async () => {
        const result = await inner.tick(when);
        await rescheduleEnabledConversationTasks(db, inner, () => when);
        return result;
      });
    },
  };
}

export function scheduleViewFingerprint(db: ScheduleSqliteDatabase): string {
  return JSON.stringify({
    jobs: scheduleFingerprint(db),
    tasks: scheduleConversationFingerprint(db),
  });
}

export function registerHostScheduleCapabilities<Context>(
  registrar: Parameters<typeof registerScheduleCapabilities<Context>>[0],
  dbFor: (context: Context) => ScheduleSqliteDatabase,
  nowFor?: (context: Context) => () => Date,
): void {
  registerScheduleCapabilities(registrar, (context) =>
    scheduleServiceFor(dbFor(context), nowFor?.(context)));
}
