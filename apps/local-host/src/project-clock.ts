import { createScheduleService, type ScheduleService, type ScheduleSqliteDatabase } from "@molis-ai/molis-work-service-scheduler";

const clocks = new WeakMap<object, ScheduleService>();

/** One project clock. Every wakeup is a plugin's own declared action, delivered through that installation's gateway; the Host registers no handler of its own. */
export function scheduleServiceFor(db: ScheduleSqliteDatabase, now?: () => Date): ScheduleService {
  let clock = clocks.get(db);
  if (!clock) {
    clock = createScheduleService(db, now ? { now } : {});
    clocks.set(db, clock);
  }
  return clock;
}

/** Cancel active dispatch before the project's connection is released. */
export async function closeProjectClock(db: ScheduleSqliteDatabase): Promise<void> {
  await clocks.get(db)?.close();
}
