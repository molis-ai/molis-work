import type { ActionDefinition, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SchedulePluginRouteHandler, SchedulePluginRouteResponse } from "./routes.js";
import { scheduleActions, type ScheduleTaskInput } from "./actions.js";

export interface ScheduleRouteHandlerPorts {
  readonly actions: BoundActionClient;
  changed(): void;
  renderWorkbench?(): string | Promise<string>;
}

/** HTTP adapts presentation and legacy parameters; validation and business work belong to actions. */
export function createScheduleRouteHandlers(options: ScheduleRouteHandlerPorts): Record<string, SchedulePluginRouteHandler> {
  const run = async <Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, status = 200): Promise<SchedulePluginRouteResponse> => {
    const body = await options.actions.invoke(definition, input);
    if (definition.operation === "command") options.changed();
    return { status, body };
  };
  const task = (body: Readonly<Record<string, unknown>>): ScheduleTaskInput => {
    const clock = body.time ?? body.clock;
    return {
      title: typeof body.title === "string" ? body.title : "",
      instructions: typeof body.instructions === "string" ? body.instructions : "",
      time: typeof clock === "string" ? clock : "",
      notify_important: body.notify_important !== false,
    };
  };
  const enabled = (body: Readonly<Record<string, unknown>>) => typeof body.enabled === "boolean" ? body.enabled : null;
  return {
    "schedule.list": () => run(scheduleActions.list, {}),
    "schedule.workbench": async () => {
      if (!options.renderWorkbench) return { status: 501, body: { error: "Schedule 工作区不可用" } };
      await options.actions.invoke(scheduleActions.list, {});
      return { status: 200, html: await options.renderWorkbench() };
    },
    "schedule.job.enabled": ({ params, request }) => {
      const value = enabled(request.body);
      if (value === null) return { status: 400, body: { error: "请指定是否启用" } };
      if (!params.job_id) return { status: 404, body: { error: "定时任务不存在", code: "schedule_job_not_found" } };
      return run(scheduleActions.setJobEnabled, { job_id: params.job_id, enabled: value });
    },
    "schedule.reminder.recover": ({ params, request }) => run(scheduleActions.recoverReminder, {
      job_id: params.job_id ?? "",
      expected_installation_id: typeof request.body.expected_installation_id === "string" ? request.body.expected_installation_id : "",
      expected_generation: typeof request.body.expected_generation === "string" ? request.body.expected_generation : "",
    }),
    "schedule.operation.recover": ({ params, request }) => run(scheduleActions.recoverOperation, {
      operation_id: params.operation_id ?? "", decision: request.body.decision as "resume" | "retry" | "skip",
      expected_revision: request.body.expected_revision as string, expected_installation_id: request.body.expected_installation_id as string,
      expected_generation: request.body.expected_generation as string, expected_version: request.body.expected_version as string,
    }),
    "schedule.task.create": ({ request }) => run(scheduleActions.createTask, task(request.body), 201),
    "schedule.task.update": ({ params, request }) => run(scheduleActions.updateTask, { ...task(request.body), task_id: params.task_id ?? "" }),
    "schedule.task.archive": ({ params }) => run(scheduleActions.archiveTask, { task_id: params.task_id ?? "" }),
    "schedule.task.enabled": ({ params, request }) => {
      const value = enabled(request.body);
      if (value === null) return { status: 400, body: { error: "请指定是否启用" } };
      if (!params.task_id) return { status: 404, body: { error: "定时任务不存在", code: "schedule_task_not_found" } };
      return run(scheduleActions.setTaskEnabled, { task_id: params.task_id, enabled: value });
    },
    "schedule.task.open": ({ params }) => {
      if (!params.task_id) return { status: 404, body: { error: "定时任务不存在", code: "schedule_task_not_found" } };
      return run(scheduleActions.openTask, { task_id: params.task_id });
    },
  };
}

export function scheduleRouteErrorResponse(error: unknown): SchedulePluginRouteResponse {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
  const message = error instanceof Error ? error.message : String(error);
  if (code === "schedule_job_not_found" || code === "schedule_task_not_found" || code === "actions.missing") {
    return { status: 404, body: { error: message, code } };
  }
  if (["actions.forbidden", "actions.scope_mismatch", "actions.owner_mismatch"].includes(code)) return { status: 403, body: { error: message, code } };
  if (code === "actions.unredeemed") return { status: 503, body: { error: message, code } };
  return { status: 400, body: { error: message, ...(code ? { code } : {}) } };
}
