import { ActionError, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginHostServices } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ScheduleWakeupControl, ScheduleWakeupInput } from "@molis-ai/molis-work-contracts/services/scheduler";
import { scheduleInstallations } from "./runtime-installations.js";
import type { ScheduleRuntime } from "./runtime-actions.js";
import { SCHEDULE_OPERATION_WAKEUP, SCHEDULE_REMINDER_WAKEUP, SCHEDULE_TASK_WAKEUP_CAPABILITY } from "./background-actions.js";
import { SCHEDULE_PLUGIN_ID } from "./manifest.js";
import { SCHEDULE_READER_ROLE } from "./roles.js";
import { handleScheduleTaskWakeup } from "./wakeup.js";
import { composeScheduledTaskPrompt, parseScheduledAgentReply } from "./reply.js";
import { deliverScheduleReminder } from "./reminders.js";
import { prepareScheduledOperation, runScheduledOperation } from "./operations.js";

/** The notification service takes a title of at most 200 UTF-16 units; a longer one is cut at a whole character and ends with 「…」. */
function notificationTitle(title: string): string {
  if (title.length <= 200) return title;
  let cut = "";
  for (const character of title) {
    if (cut.length + character.length > 199) break;
    cut += character;
  }
  return cut + "…";
}

export async function scheduleRuntimeWakeup(services: PluginHostServices, runtime: ScheduleRuntime, installId: string,
  caller: ActionExecutionContext, input: ScheduleWakeupInput) {
  if (caller.audience !== "plugin" || caller.plugin_install_id !== installId || input.plugin_id !== SCHEDULE_PLUGIN_ID) {
    throw new ActionError("actions.forbidden", "唤醒只接受本安装的调度调用");
  }
  const job = services.scheduler!.get(input.job_id);
  if (!job || job.capability_id !== input.capability_id || job.object_ref !== input.object_ref || job.authorization !== "current" || !services.scheduler!.isExecuting(job.job_id)) {
    throw new ActionError("actions.forbidden", "唤醒没有当前执行的闹钟");
  }
  const control: ScheduleWakeupControl = { signal: caller.signal!, beforeEffect: () => { caller.signal!.throwIfAborted(); caller.assert_authority_current?.(); } };
  const write = (operation: () => void) => runtime.write(caller.beforeEffect, operation);
  if (input.capability_id === SCHEDULE_TASK_WAKEUP_CAPABILITY) {
    return handleScheduleTaskWakeup(runtime.db, input.object_ref, { run: async task => {
      if (!services.agents) throw new ActionError("actions.connection_required", "当前 Home 的后台 Agent 尚未接通");
      const result = await services.agents.run({ role_id: SCHEDULE_READER_ROLE, title: task.title, task: composeScheduledTaskPrompt(task) });
      return parseScheduledAgentReply(result.text);
    } }, undefined, control, write);
  }
  const observed = services.installations!.list();
  const views = input.capability_id === SCHEDULE_OPERATION_WAKEUP ? await services.actions!.dependencies!.discover() : [];
  const owners = scheduleInstallations(services.installations!, observed, views);
  if (input.capability_id === SCHEDULE_REMINDER_WAKEUP) return runtime.write(caller.beforeEffect, () => deliverScheduleReminder(runtime.db, input, control, {
    currentInstallation: reminder => owners.matches(reminder.pluginId, reminder.installationId, reminder.installationGeneration),
    deliver: (reminder, dueAt) => runtime.notify({ key: reminder.id + ":" + dueAt, title: notificationTitle(reminder.pluginTitle + "：" + reminder.text),
      summary: reminder.text, body: reminder.text, open_plugin_id: reminder.pluginId }),
  }));
  if (input.capability_id !== SCHEDULE_OPERATION_WAKEUP) throw new ActionError("actions.forbidden", "未知的定时唤醒");
  await write(() => prepareScheduledOperation(runtime.db, input));
  return runScheduledOperation(runtime.db, input, control, {
    write, currentInstallation: run => owners.matches(run.pluginId, run.installationId, run.installationGeneration),
    executor: run => {
      const installation = owners.operation(run.pluginId), target = owners.operations(run.pluginId).get(run.operationId);
      if (!installation || !target) return null;
      const beforeEffect = () => {
        control.beforeEffect();
        const current = owners.current(run.pluginId);
        if (!current || current.install_id !== run.installationId || current.installation_generation !== run.installationGeneration || current.version !== installation.version) {
          throw new ActionError("actions.plugin_unavailable", "定时操作的安装执行入口已改变");
        }
      };
      return { signal: control.signal, beforeEffect, invoke: async execution => {
        try {
          beforeEffect();
          const value = await services.actions!.dependencies!.invoke({ capability_id: target.capability_id, version: target.version, provider_id: target.provider.provider_id }, run.input,
            { signal: execution.signal, beforeEffect: async () => execution.beforeEffect(), assert_authority_current: execution.beforeEffect });
          return { state: "succeeded", value };
        } catch (error) {
          execution.beforeEffect();
          return { state: error instanceof ActionError && error.code === "actions.outcome_unknown" ? "unknown" : "failed", value: error instanceof Error ? error.message : String(error) };
        }
      } };
    },
    deliver: (run, dueAt, outcome, text) => runtime.notify({ key: run.id + ":" + dueAt,
      title: run.pluginTitle + "：" + (outcome.state === "succeeded" ? (text.replace(/\s+/g, " ").trim().slice(0, 80) || run.operationTitle) : run.operationTitle.slice(0, 40) + "没有完成"),
      summary: text.slice(0, 280), body: text || "操作已结束", open_plugin_id: run.pluginId }),
  });
}
