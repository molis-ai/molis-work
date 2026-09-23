import type { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { jobEventsParamsSchema, jobEventsQuerySchema } from "../../shared/contracts/job.js";
import type { ApiDependencies } from "./dependencies.js";

const terminalStatuses = new Set(["completed", "partial", "failed", "cancelled"]);

export function registerJobRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.post("/api/v1/runs/:id/cancel", (context) => {
    try {
      return context.json({ run: dependencies.cancelLensRun(context.req.param("id")) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "LENS_RUN_NOT_CANCELLABLE";
      return context.json(
        {
          code,
          message: code === "LENS_RUN_NOT_FOUND" ? "没有找到这次研究。" : "这次研究已经结束，不能再取消。",
        },
        code === "LENS_RUN_NOT_FOUND" ? 404 : 409,
      );
    }
  });

  app.get("/api/v1/runs/:id/events", (context) => {
    const params = jobEventsParamsSchema.safeParse(context.req.param());
    const query = jobEventsQuerySchema.safeParse(context.req.query());
    if (!params.success || !query.success || !dependencies.jobs.get(params.success ? params.data.id : "")) {
      return context.json({ code: "RUN_NOT_FOUND", message: "没有找到这次运行。" }, 404);
    }
    const jobId = params.data.id;
    return streamSSE(context, async (stream) => {
      let cursor = query.data.after;
      while (!stream.aborted) {
        const events = dependencies.jobs.listEvents(jobId, cursor);
        for (const event of events) {
          await stream.writeSSE({
            id: String(event.sequence),
            event: event.type,
            data: JSON.stringify(event),
          });
          cursor = event.sequence;
        }
        const current = dependencies.jobs.get(jobId);
        if (!current || terminalStatuses.has(current.status)) return;
        await stream.sleep(150);
      }
    });
  });
}
