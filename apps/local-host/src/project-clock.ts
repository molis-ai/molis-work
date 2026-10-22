import { createScheduleService, PluginWakeupIndex, type ScheduleService, type ScheduleSqliteDatabase } from "@molis-ai/molis-work-service-scheduler";

const clocks = new WeakMap<object, ScheduleService>();

/** One project clock. Every plugin supplies its own declared action through the public scheduler service. */
export function scheduleServiceFor(db: ScheduleSqliteDatabase, now?: () => Date): ScheduleService {
  let clock = clocks.get(db);
  if (!clock) {
    clock = createScheduleService(db, { wakeupIndex: new PluginWakeupIndex(), ...(now ? { now } : {}) });
    clocks.set(db, clock);
  }
  return clock;
}

/** Cancel active dispatch before the project's connection is released. */
export async function closeProjectClock(db: ScheduleSqliteDatabase): Promise<void> {
  await clocks.get(db)?.close();
}
