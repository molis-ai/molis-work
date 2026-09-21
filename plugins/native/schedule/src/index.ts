export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-schedule",
  packagePath: "plugins/native/schedule",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["schedule.ui-contribution.v1", "schedule.http-routes.v1", "schedule.conversation-tasks.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export * from "./ui.js";
export * from "./routes.js";
export {
  createScheduleRouteHandlers,
  createScheduleRouteHandlerPorts,
  scheduleRouteErrorResponse,
} from "./route-handlers.js";
export type { ScheduleRouteHandlerPorts } from "./route-handlers.js";
export { SCHEDULE_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { SCHEDULE_EN } from "./en.js";
export { SCHEDULE_STYLES } from "./styles.js";
export {
  SCHEDULE_PLUGIN_ID,
  SCHEDULE_PROJECT_PLUGIN_ID,
  SCHEDULE_TASK_WAKEUP_CAPABILITY,
  scheduleManifest,
} from "./manifest.js";
export { SCHEDULE_READER_ROLE, scheduleAgentManifest, schedulePrompts } from "./roles.js";
export {
  nextDailyLocalDue,
  parseClockTime,
  formatClockTime,
} from "./calendar.js";
export { ScheduleTaskError } from "./task-error.js";
export {
  parseScheduledAgentReply,
  composeScheduledTaskPrompt,
} from "./reply.js";
export {
  migrateScheduleConversationTasks,
  scheduleConversationFingerprint,
  listScheduleConversationTasks,
  getScheduleConversationTask,
  createScheduleConversationTask,
  bindScheduleConversationJob,
  openScheduleConversationTask,
  toScheduleConversationTaskView,
} from "./tasks.js";
export type {
  ScheduleTaskDatabase,
  ScheduleConversationTaskRecord,
  ScheduleConversationTaskView,
  ScheduleConversationTurnRecord,
} from "./tasks.js";
export {
  handleScheduleTaskWakeup,
  rescheduleEnabledConversationTasks,
  registerConversationJob,
  pauseOrResumeConversationTask,
  ownedScheduleJobs,
} from "./wakeup.js";
export type { ScheduledTaskRunner, ScheduleJobPort } from "./wakeup.js";
