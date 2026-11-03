import { ActionError, type ActionExecutionContext, type ActionHandlerBinding, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginHostServices } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ProjectWorkspaceRef } from "@molis-ai/molis-work-contracts/modules/projects";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { createScheduleActionHandlers } from "./actions.js";
import { createScheduleActionPorts } from "./service.js";
import { createReminderActionHandlers } from "./reminder-actions.js";
import { createScheduleReminders } from "./reminders.js";
import { createScheduleReminderManagement } from "./reminder-management.js";
import { createScheduledOperationActionHandlers, scheduledOperationActions } from "./operation-actions.js";
import { createScheduledOperations, type ScheduledOperationInput } from "./operations.js";
import { createScheduledOperationManagement } from "./operation-management.js";
import { scheduleErrors } from "./error.js";
import type { scheduleRuntimeDatabase } from "./runtime-database.js";
import { scheduleInstallations } from "./runtime-installations.js";

export type ScheduleRuntime = ReturnType<typeof scheduleRuntimeDatabase>;

export async function scheduleRuntimeActions(projectId: string, services: PluginHostServices, runtime: ScheduleRuntime,
  caller: ActionExecutionContext, capabilityId: string): Promise<ActionHandlerBinding[]> {
  const observed = services.installations!.list();
  const needOperations = capabilityId === "schedule.tasks.list" || capabilityId.startsWith("schedule.operations.") || capabilityId.startsWith("schedules.");
  const views: readonly ActionView[] = needOperations ? await services.actions!.dependencies!.discover() : [];
  const owners = scheduleInstallations(services.installations!, observed, views), { db, schedule } = runtime;
  const write = <T>(context: ActionExecutionContext, operation: () => T) => runtime.write(context.beforeEffect, operation);
  const link = (pluginId: string) => `/projects/${encodeURIComponent(projectId)}/plugins/${encodeURIComponent(pluginId)}`;
  const reminders = createScheduleReminders({ db, projectId, schedule, describe: identity => {
    const current = owners.reminder(identity.pluginId);
    if (!current || current.installation_id !== identity.installationId) throw scheduleErrors.job_invalid("提醒的插件安装当前没有运行");
    return { title: current.title, link: link(identity.pluginId), generation: current.generation };
  } });
  const operations = createScheduledOperations({ db, projectId, schedule, describe: identity => {
    const current = owners.operation(identity.pluginId); return current?.installationId === identity.installationId ? current : null;
  }, link });
  const ports = createScheduleActionPorts({ db, schedule,
    reminders: createScheduleReminderManagement({ db, projectId, schedule, currentInstallation: owners.reminder }),
    operations: createScheduledOperationManagement({ db, projectId, schedule, currentInstallation: owners.operation }),
    readiness: async () => {
      const workspace = await services.actions!.invokeQuery<[], ProjectWorkspaceRef | null>(projectsCapabilities.readWorkspace, []).catch(error => {
        // A project without workspace services is not ready. Refused or failed reads remain errors.
        if (error instanceof ActionError && error.code === "actions.dependency_missing") return null;
        throw error;
      });
      return { model: services.model?.availability().available === true, workspace: workspace?.realpath_verified === true };
    },
  });
  const pluginId = (installId: string) => services.installations!.get(installId)?.plugin_id ?? null;
  const operationHandlers = createScheduledOperationActionHandlers(projectId, { ...operations, pluginId }, write);
  // Validate the exact public input before persisting a scheduled call; creation itself never invokes it.
  const add = operationHandlers.find(item => item.capability_id === scheduledOperationActions.add.capability_id)!;
  const original = add.handle;
  add.handle = async (context, given) => {
    const input = given as ScheduledOperationInput, pluginId = context.plugin_install_id ? services.installations!.get(context.plugin_install_id)?.plugin_id ?? "" : "";
    const target = owners.operations(pluginId).get(input.operation);
    if (!target || owners.current(pluginId)?.install_id !== context.plugin_install_id) throw new ActionError("actions.forbidden", "定时操作必须属于调用的插件安装");
    await services.actions!.dependencies!.check({ capability_id: target.capability_id, version: target.version, provider_id: target.provider.provider_id }, input.input ?? {});
    await caller.beforeEffect();
    return original(context, input);
  };
  return [...createScheduleActionHandlers(projectId, ports, write), ...createReminderActionHandlers(projectId, { ...reminders, pluginId }, write), ...operationHandlers];
}
