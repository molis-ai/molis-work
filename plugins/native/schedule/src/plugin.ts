import { syncBindings } from "./sync-binding.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createScheduleRouteHandlers } from "./route-handlers.js";
import { scheduleManifest } from "./manifest.js";
import { scheduleActions } from "./actions.js";
import { scheduleUiContribution } from "./ui.js";
import { schedulePrompts } from "./roles.js";
import { SCHEDULE_RECONCILE_JOB, scheduleWakeupActions } from "./background-actions.js";
import { scheduleRuntimeDatabase } from "./runtime-database.js";
import { scheduleRuntimeActions } from "./runtime-actions.js";
import { scheduleRuntimeWakeup, tellOpenPages } from "./runtime-wakeups.js";
import { reconcileSchedule } from "./runtime-reconcile.js";
import { createScheduleTaskGrants } from "./task-grants.js";
import type { ScheduleWakeupInput } from "@molis-ai/molis-work-contracts/services/scheduler";

export function createSchedulePlugin(): PluginDefinition {
  let problem: string | null = null;
  return { manifest: scheduleManifest, agent_prompts: schedulePrompts, async start(context) {
    for (const grant of scheduleManifest.permissions) if (grant.required) context.requireGrant(grant.permission);
    const projectId = context.project_id, services = context.services, actions = services?.actions;
    if (!projectId || !actions?.dependencies || !services?.project_database || !services.scheduler || !services.installations || !services.notifications || !services.background) {
      throw new ActionError("actions.unredeemed", "定时任务需要公共项目库、调度、安装目录、通知与后台服务");
    }
    const runtime = scheduleRuntimeDatabase(services.project_database, services.scheduler, services.notifications), grants = createScheduleTaskGrants(actions);
    services.background.keep(SCHEDULE_RECONCILE_JOB, control => reconcileSchedule(runtime, projectId, services.installations!, grants, control, value => { problem = value; },
      () => services.ui.invalidate()));
    const wakeups = new Set(Object.values(scheduleWakeupActions).map(item => item.capability_id));
    return { kind: "app", sync: syncBindings(context), views: [scheduleUiContribution], actions: scheduleManifest.actions!.map(definition => ({ ...definition,
      handle: async (caller, input) => {
        // Wakeups may write a failure turn even when they throw, so they always tell open pages.
        // Ordinary commands only tell open pages after succeeding, so a failed click keeps its error message visible.
        // Marking a task read changes nothing a page draws until it next reads: it tells no page.
        if (wakeups.has(definition.capability_id)) {
          try {
            return await scheduleRuntimeWakeup(services, runtime, grants, context.install_id, caller, input as ScheduleWakeupInput, projectId);
          } finally {
            tellOpenPages(services.ui, caller);
          }
        }
        const bindings = await scheduleRuntimeActions(projectId, services, runtime, grants, caller, definition.capability_id);
        const result = await bindings.find(binding => binding.capability_id === definition.capability_id && binding.version === definition.version)!.handle(caller, input);
        if (definition.operation === "command" && definition.capability_id !== scheduleActions.openTask.capability_id) {
          tellOpenPages(services.ui, caller);
        }
        return result;
      },
    })),
      routes: scheduleManifest.routes!.map(({ route_id }) => ({ route_id, async handle(request: PluginRouteRequest) {
        // The page's changes go through Schedule's own actions, which tell the open pages themselves.
        const handlers = createScheduleRouteHandlers({ changed() {}, actions: {
          discover: async () => [], invoke: (definition, input) => actions.invoke(definition, input, request.execution),
        } });
        return handlers[route_id]!({ params: request.params, request: { method: request.method as "GET" | "POST", pathname: request.pathname,
          query: new URLSearchParams(request.query), body: request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {} } });
      } })) };
  }, async health() { return problem ? { ok: false, message: problem } : { ok: true, message: "定时任务已接通" }; } };
}
