import type { ScheduleJobRecord } from "@molis-ai/molis-work-contracts/services/scheduler";
import type { SchedulePluginRouteHandler, SchedulePluginRouteResponse } from "./routes.js";

export interface ScheduleRouteHandlerPorts {
  listJobs(): readonly ScheduleJobRecord[];
  setEnabled(jobId: string, enabled: boolean): ScheduleJobRecord;
  changed(): void;
}

export function createScheduleRouteHandlers(options: ScheduleRouteHandlerPorts): Record<string, SchedulePluginRouteHandler> {
  return {
    "schedule.list": () => ({
      status: 200,
      body: { jobs: options.listJobs() },
    }),
    "schedule.job.enabled": ({ params, request }) => {
      const enabled = request.body.enabled;
      if (typeof enabled !== "boolean") {
        return { status: 400, body: { error: "请指定是否启用" } };
      }
      const jobId = params.job_id;
      if (!jobId) return { status: 404, body: { error: "定时任务不存在", code: "schedule_job_not_found" } };
      const job = options.setEnabled(jobId, enabled);
      options.changed();
      return { status: 200, body: { job } };
    },
  };
}

export function scheduleRouteErrorResponse(error: unknown): SchedulePluginRouteResponse {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
  const message = error instanceof Error ? error.message : String(error);
  if (code === "schedule_job_not_found") {
    return { status: 404, body: { error: message, code } };
  }
  return { status: 400, body: { error: message, ...(code ? { code } : {}) } };
}
