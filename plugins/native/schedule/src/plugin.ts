import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginRouteRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createScheduleRouteHandlers } from "./route-handlers.js";
import { scheduleManifest } from "./manifest.js";
import { scheduleUiContribution } from "./ui.js";
import { schedulePrompts } from "./roles.js";
import { SCHEDULE_RECONCILE_JOB, scheduleWakeupActions } from "./background-actions.js";
import { scheduleRuntimeDatabase } from "./runtime-database.js";
import { scheduleRuntimeActions } from "./runtime-actions.js";
import { scheduleRuntimeWakeup } from "./runtime-wakeups.js";
import { reconcileSchedule } from "./runtime-reconcile.js";
import type { ScheduleWakeupInput } from "@molis-ai/molis-work-contracts/services/scheduler";

export function createSchedulePlugin(): PluginDefinition {
  let problem: string | null = null;
  return { manifest: scheduleManifest, agent_prompts: schedulePrompts, async start(context) {
    for (const grant of scheduleManifest.permissions) if (grant.required) context.requireGrant(grant.permission);
    const projectId = context.project_id, services = context.services, actions = services?.actions;
    if (!projectId || !actions?.dependencies || !services?.project_database || !services.scheduler || !services.installations || !services.notifications || !services.background) {
      throw new ActionError("actions.unredeemed", "定时任务需要公共项目库、调度、安装目录、通知与后台服务");
    }
    const runtime = scheduleRuntimeDatabase(services.project_database, services.scheduler, services.notifications);
    services.background.keep(SCHEDULE_RECONCILE_JOB, control => reconcileSchedule(runtime, projectId, services.installations!, control, value => { problem = value; }));
    const wakeups = new Set(Object.values(scheduleWakeupActions).map(item => item.capability_id));
    return { kind: "app", views: [scheduleUiContribution], actions: scheduleManifest.actions!.map(definition => ({ ...definition,
      handle: async (caller, input) => {
        if (wakeups.has(definition.capability_id)) return scheduleRuntimeWakeup(services, runtime, context.install_id, caller, input as ScheduleWakeupInput);
        const bindings = await scheduleRuntimeActions(projectId, services, runtime, caller, definition.capability_id);
        return bindings.find(binding => binding.capability_id === definition.capability_id && binding.version === definition.version)!.handle(caller, input);
      },
    })),
      routes: scheduleManifest.routes!.map(({ route_id }) => ({ route_id, async handle(request: PluginRouteRequest) {
        const handlers = createScheduleRouteHandlers({ changed() {}, actions: {
          discover: async () => [], invoke: (definition, input) => actions.invoke(definition, input, request.execution),
        } });
        return handlers[route_id]!({ params: request.params, request: { method: request.method as "GET" | "POST", pathname: request.pathname,
          query: new URLSearchParams(request.query), body: request.body && typeof request.body === "object" && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {} } });
      } })) };
  }, async health() { return problem ? { ok: false, message: problem } : { ok: true, message: "定时任务已接通" }; } };
}
