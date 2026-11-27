import { observationActions } from "@molis-ai/molis-work-contracts/services/observation";
import { scheduleTracking } from "./replication.js";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { projectDirectoryActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { scheduleAgentManifest } from "./roles.js";
import { SCHEDULE_UI_CONTRIBUTION_ID } from "./ui.js";
import { SCHEDULE_ACTIONS, scheduleActions } from "./actions.js";
import { SCHEDULE_PROJECT_DATABASE } from "./database.js";
import { REMINDER_ACTIONS } from "./reminder-actions.js";
import { SCHEDULE_OPERATION_ACTIONS } from "./operation-actions.js";
import { SCHEDULE_RECONCILE_JOB, scheduleWakeupActions } from "./background-actions.js";
import { SCHEDULE_TASK_GRANT_ACTIONS } from "./task-grants.js";
import { scheduleRunsActions } from "./missed-runs.js";
import { localizeManifestActions } from "./manifest-action-text.js";
export { SCHEDULE_TASK_WAKEUP_CAPABILITY } from "./background-actions.js";

export const SCHEDULE_PLUGIN_ID = "io.molis.work.schedule";
/** What the project database stores for this Plugin. */
export const SCHEDULE_PROJECT_PLUGIN_ID = "schedule";

export const scheduleManifest: PluginManifest = {
  schema_version: /* @version manifest.schema */ 1,
  host_api_version: /* @version host.api */ 1,
  plugin_id: SCHEDULE_PLUGIN_ID,
  version: /* @version product.release */ "0.1.0",
  name: "Schedule",
  summary: "定时跑对话任务，也替插件准时提醒。", summary_text: { key: "schedule.directory.summary" },
  kind: "native",
  publisher: { publisher_id: "molis", signature: "official-schedule-binding" },
  entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
  permissions: [
    { permission: "storage:private", required: true, reason: "保存这个项目里的定时任务与提醒排期", reason_text: { key: "schedule.permission.storage-private.reason" } },
    { permission: "schedule:read", required: true, reason: "读取这个项目的定时任务与提醒", reason_text: { key: "schedule.permission.schedule-read.reason" } },
    { permission: "schedule:write", required: true, reason: "新建、修改、暂停和归档定时任务", reason_text: { key: "schedule.permission.schedule-write.reason" } },
    { permission: "agent:run", required: true, reason: "到点按只读权限运行这个项目的定时对话任务", reason_text: { key: "schedule.permission.agent-run.reason" } },
    { permission: "model:read", required: true, reason: "检查定时任务是否已配好可用模型", reason_text: { key: "schedule.permission.model-read.reason" } },
    { permission: "plugins:read", required: true, reason: "核对提醒和定时操作所属的插件安装", reason_text: { key: "schedule.permission.plugins-read.reason" } },
    { permission: "actions:invoke", required: true, reason: "在当前项目里运行插件登记好的定时操作", reason_text: { key: "schedule.permission.actions-invoke.reason" } },
    { permission: "notifications:write", required: true, reason: "把到点的提醒和任务结果放进收件箱", reason_text: { key: "schedule.permission.notifications-write.reason" } },
  ],
  capabilities: {
    provides: [],
    // The platform's grants of this installation's tasks: listed to pick a round's role and mark the page, cleared when a task ends.
    consumes: [observationActions.report.capability_id, projectDirectoryActions.get.capability_id, ...SCHEDULE_TASK_GRANT_ACTIONS.map(action => action.capability_id)],
  },
  actions: localizeManifestActions([...SCHEDULE_ACTIONS, ...REMINDER_ACTIONS, ...SCHEDULE_OPERATION_ACTIONS, ...Object.values(scheduleWakeupActions), ...Object.values(scheduleRunsActions)]),
  // What another plugin's background task may be let read, one switch per group (specs/proactive-assistant/schedule-task-reads.md §3.2).
  // Reminders alone are one group (日程 = Jelly's calendar and these, user decision); the task list carries them together with other
  // plugins' scheduled operations and their original input, so it is a group of its own, off unless the person turns it on.
  read_groups: [
    { group_id: "reminders", title: "提醒", title_text: { key: "schedule.read-group.reminders.title" },
      description: "本项目的提醒：内容（含其他插件登记的提醒的文字）、来自哪个插件和下一次时间", description_text: { key: "schedule.read-group.reminders.description" },
      actions: [scheduleActions.reminders.capability_id] },
    { group_id: "operations", title: "定时操作", title_text: { key: "schedule.read-group.operations.title" },
      description: "本项目的定时任务、提醒，以及其他插件登记的定时操作和它们的原输入", description_text: { key: "schedule.read-group.operations.description" },
      actions: [scheduleActions.list.capability_id, scheduleActions.searchEntries.capability_id, scheduleActions.subject.capability_id] },
  ],
  // A task grant subject's key is a conversation task's id: the grants page names it through `schedule.search.entries`, which lists
  // this kind (specs/proactive-assistant/task-grants-platform-area.md §5.1).
  task_subjects: { kind: "schedule_task" },
  background: { jobs: [{ job_id: SCHEDULE_RECONCILE_JOB, reason: "恢复未完成的排期并标记中断的执行", permissions: ["storage:private", "schedule:read", "schedule:write", "plugins:read"] }],
    wakeups: Object.values(scheduleWakeupActions).map(({ capability_id, version, action }) => ({ action: { capability_id, version }, reason: action.title })) },
  routes: [
    { route_id: "schedule.list", method: "GET", path: "/list", permission: "schedule:read" },
    { route_id: "schedule.readiness", method: "GET", path: "/readiness", permission: "schedule:read" },
    { route_id: "schedule.grants", method: "GET", path: "/grants", permission: "schedule:read" },
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
  sync: { protocol_version: /* @version sync.protocol */ 1, collections: [{ id: "conversation_tasks", tracking: scheduleTracking, title: "定时对话任务", schema_version: /* @version sync.collection.schedule.conversation_tasks */ 1, requires: [] }] },
  databases: { project: SCHEDULE_PROJECT_DATABASE },
  // Its upcoming and missed runs, as rows of the platform's summary table in the partition's main database (V17).
  overview_projection: { kinds: ["scheduled_run"] },
  ui: { locales: { default: "zh", available: ["zh", "en", "ja"] },
    help: {
      default_topic: "page",
      topics: [{
        id: "page",
        title: { key: "schedule.help.title" },
        sections: [
          { id: "what", heading: { key: "common.help.section-what" }, body: { key: "schedule.help.what" } },
          { id: "examples", heading: { key: "common.help.section-examples" }, items: [{ key: "schedule.help.example-1" }, { key: "schedule.help.example-2" }] },
          { id: "scope", heading: { key: "common.help.section-scope" }, body: { key: "schedule.help.scope" } },
          { id: "advanced", heading: { key: "common.help.section-advanced" }, collapsible: true, summary: { key: "schedule.help.advanced-summary" }, body: { key: "schedule.help.advanced" } },
        ],
      }],
    },
    contributions: [SCHEDULE_UI_CONTRIBUTION_ID],
    views: [
      { view_id: "directory", slot: "navigator", title: "Schedule", contribution_id: SCHEDULE_UI_CONTRIBUTION_ID, icon: "timer", hue: "yellow", order: 35, group: "advance",
        stage_data: { action: scheduleActions.list.capability_id } },
    ],
  },
};
