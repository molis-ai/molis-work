import {
  PluginWakeupIndex,
  createScheduleService,
  registerScheduleCapabilities,
  scheduleFingerprint,
  type ScheduleService,
  type ScheduleSqliteDatabase,
} from "@molis-ai/molis-work-service-scheduler";

const wakeupIndex = new PluginWakeupIndex();

export function hostWakeupIndex(): PluginWakeupIndex {
  return wakeupIndex;
}

export function scheduleServiceFor(db: ScheduleSqliteDatabase, now?: () => Date): ScheduleService {
  return createScheduleService(db, {
    wakeupIndex,
    ...(now ? { now } : {}),
  });
}

export function scheduleViewFingerprint(db: ScheduleSqliteDatabase): string {
  return scheduleFingerprint(db);
}

export function registerHostScheduleCapabilities<Context>(
  registrar: Parameters<typeof registerScheduleCapabilities<Context>>[0],
  dbFor: (context: Context) => ScheduleSqliteDatabase,
  nowFor?: (context: Context) => () => Date,
): void {
  registerScheduleCapabilities(registrar, (context) =>
    scheduleServiceFor(dbFor(context), nowFor?.(context)));
}
