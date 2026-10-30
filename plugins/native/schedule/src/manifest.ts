import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { scheduleAgentManifest } from "./roles.js";
import { SCHEDULE_UI_CONTRIBUTION_ID } from "./ui.js";
import { SCHEDULE_ACTIONS, scheduleActions } from "./actions.js";
import { SCHEDULE_PROJECT_DATABASE } from "./database.js";
import { REMINDER_ACTIONS } from "./reminder-actions.js";
import { SCHEDULE_OPERATION_ACTIONS } from "./operation-actions.js";
import { SCHEDULE_RECONCILE_JOB, scheduleWakeupActions } from "./background-actions.js";
import { SCHEDULE_MESSAGES } from "./messages.js";
import { SCHEDULE_EN } from "./en.js";
export { SCHEDULE_TASK_WAKEUP_CAPABILITY } from "./background-actions.js";

export const SCHEDULE_PLUGIN_ID = "io.molis.work.schedule";
/** What the project database stores for this Plugin. */
export const SCHEDULE_PROJECT_PLUGIN_ID = "schedule";

export const scheduleManifest: PluginManifest = {
  schema_version: 2,
  host_api_version: 2,
  plugin_id: SCHEDULE_PLUGIN_ID,
  version: "0.3.0",
  name: "Schedule",
  summary: "定时跑对话任务，也替插件准时提醒。",
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-schedule-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "项目里的定时任务" },
    { permission: "schedule:read", required: true, reason: "读取定时任务与闹钟" },
    { permission: "schedule:write", required: true, reason: "新建、修改、暂停和归档定时任务" },
    { permission: "agent:run", required: true, reason: "到点运行本插件声明的只读 Agent" },
    { permission: "model:read", required: true, reason: "显示定时任务是否配置了模型" },
    { permission: "plugins:read", required: true, reason: "核对提醒与定时操作的真实安装" },
    { permission: "actions:invoke", required: true, reason: "在当前项目中运行插件公开的定时功能" },
    { permission: "notifications:write", required: true, reason: "把到期提醒和操作结果放入收件箱" },
  ],
  capabilities: {
    provides: [],
    consumes: [projectsCapabilities.readWorkspace.capability_id],
  },
  actions: [...SCHEDULE_ACTIONS, ...REMINDER_ACTIONS, ...SCHEDULE_OPERATION_ACTIONS, ...Object.values(scheduleWakeupActions)],
  background: { jobs: [{ job_id: SCHEDULE_RECONCILE_JOB, reason: "恢复未完成的排期并标记中断的执行", permissions: ["storage:private", "schedule:read", "schedule:write", "plugins:read"] }],
    wakeups: Object.values(scheduleWakeupActions).map(({ capability_id, version, action }) => ({ action: { capability_id, version }, reason: action.title })) },
  routes: [
    { route_id: "schedule.list", method: "GET", path: "/list", permission: "schedule:read" },
    { route_id: "schedule.readiness", method: "GET", path: "/readiness", permission: "schedule:read" },
    { route_id: "schedule.task.create", method: "POST", path: "/tasks", permission: "schedule:write" },
    { route_id: "schedule.task.update", method: "POST", path: "/tasks/:task_id/update", permission: "schedule:write" },
    { route_id: "schedule.task.archive", method: "POST", path: "/tasks/:task_id/archive", permission: "schedule:write" },
    { route_id: "schedule.task.enabled", method: "POST", path: "/tasks/:task_id/enabled", permission: "schedule:write" },
    { route_id: "schedule.task.open", method: "POST", path: "/tasks/:task_id/open", permission: "schedule:write" },
    { route_id: "schedule.job.enabled", method: "POST", path: "/jobs/:job_id/enabled", permission: "schedule:write" },
    { route_id: "schedule.reminder.recover", method: "POST", path: "/jobs/:job_id/recover-reminder", permission: "schedule:write" },
    { route_id: "schedule.operation.recover", method: "POST", path: "/operations/:operation_id/recover", permission: "schedule:write" },
  ],
  artifacts: { produces: [], consumes: [] },
  agent: scheduleAgentManifest,
  databases: { project: SCHEDULE_PROJECT_DATABASE },
  ui: {
    messages: SCHEDULE_MESSAGES,
    translations: SCHEDULE_EN,
    contributions: [SCHEDULE_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Schedule", contribution_id: SCHEDULE_UI_CONTRIBUTION_ID, icon: "timer", hue: "yellow", order: 35, group: "advance",
        stage_data: { action: scheduleActions.list.capability_id } },
    ],
  },
};
