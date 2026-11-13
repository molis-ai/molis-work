import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { createScheduleService, type ScheduleService, type ScheduleSqliteDatabase } from "@molis-ai/molis-work-service-scheduler";
import { scheduleWakeupRecords } from "./observation-host.js";

const clocks = new WeakMap<object, ScheduleService>();

/**
 * One project clock. Every wakeup is a plugin's own declared action, delivered through that installation's gateway; the Host registers no
 * handler of its own. Each wakeup is an operation of its own, and with a Home and project it is kept in the work records.
 */
export function scheduleServiceFor(db: ScheduleSqliteDatabase, options: { now?: () => Date; home?: string; projectId?: string } = {}): ScheduleService {
  let clock = clocks.get(db);
  if (!clock) {
    clock = createScheduleService(db, { ...(options.now ? { now: options.now } : {}), eachWakeup: run => withCallId(newCallId(), run),
      ...(options.home && options.projectId ? { wakeupEnded: scheduleWakeupRecords(options.home, options.projectId) } : {}) });
    clocks.set(db, clock);
  }
  return clock;
}

/** Cancel active dispatch before the project's connection is released. */
export async function closeProjectClock(db: ScheduleSqliteDatabase): Promise<void> {
  await clocks.get(db)?.close();
}
