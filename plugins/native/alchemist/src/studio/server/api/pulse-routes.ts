import type { Context, Hono } from "hono";
import {
  opportunityParamsSchema,
  type PulseWorkspaceDto,
  pulseSourceParamsSchema,
  startPulseRunRequestSchema,
  updatePulseSourceRequestSchema,
} from "../../shared/contracts/pulse.js";
import { OpportunityActionError } from "../services/opportunity-actions.js";
import { StartPulseRunError } from "../services/start-pulse-run.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerPulseRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/pulse/reports", (context) => {
    const reports = dependencies.pulse.listReports().map((report) => ({
      report,
      opportunities: dependencies.pulse.listOpportunities(report.id),
      signals: dependencies.pulse.listSignals(report.runId),
    }));
    const body: PulseWorkspaceDto = {
      ...(dependencies.pulse.getLatestRun() ? { latestRun: dependencies.pulse.getLatestRun() } : {}),
      reports,
    };
    return context.json(body);
  });

  app.get("/api/v1/pulse/sources", (context) =>
    context.json({ sources: dependencies.pulse.listSourceSettings() }),
  );

  app.patch("/api/v1/pulse/sources/:sourceId", async (context) => {
    const params = pulseSourceParamsSchema.safeParse(context.req.param());
    const body = updatePulseSourceRequestSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!params.success || !body.success) {
      return context.json({ code: "PULSE_SOURCE_INVALID", message: "来源设置不完整。" }, 400);
    }
    try {
      const source = dependencies.pulse.updateSourceSetting(
        params.data.sourceId,
        body.data.enabled,
        dependencies.clock.now(),
      );
      return context.json({ source });
    } catch (error) {
      if (error instanceof Error && error.message === "PULSE_SOURCE_NOT_FOUND") {
        return context.json({ code: error.message, message: "没有找到这个市场来源。" }, 404);
      }
      throw error;
    }
  });

  app.post("/api/v1/pulse/runs", async (context) => {
    const body = startPulseRunRequestSchema.safeParse(await context.req.json().catch(() => ({})));
    if (!body.success) {
      return context.json({ code: "PULSE_RUN_INVALID", message: "脉搏运行参数不完整。" }, 400);
    }
    try {
      return context.json({ run: dependencies.startPulseRun(body.data) }, 202);
    } catch (error) {
      if (error instanceof StartPulseRunError) {
        return context.json({ code: error.message, message: "请至少启用一个市场来源。" }, 409);
      }
      throw error;
    }
  });

  app.post("/api/v1/opportunities/:id/save", (context) => {
    const params = opportunityParamsSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json({ code: "OPPORTUNITY_NOT_FOUND", message: "没有找到这个机会方向。" }, 404);
    }
    try {
      return context.json({
        opportunity: dependencies.opportunityActions.saveForLater(params.data.id),
        destination: { surface: "pulse", collection: "saved_for_later" },
      });
    } catch (error) {
      return opportunityError(context, error);
    }
  });

  app.post("/api/v1/opportunities/:id/convert", (context) => {
    const params = opportunityParamsSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json({ code: "OPPORTUNITY_NOT_FOUND", message: "没有找到这个机会方向。" }, 404);
    }
    try {
      const result = dependencies.opportunityActions.convert(params.data.id);
      return context.json(
        {
          opportunity: result.opportunity,
          direction: result.direction,
          destination: { surface: "ideas", directionId: result.direction.id },
        },
        result.created ? 201 : 200,
      );
    } catch (error) {
      return opportunityError(context, error);
    }
  });
}

function opportunityError(context: Context, error: unknown) {
  if (error instanceof OpportunityActionError) {
    const notFound = error.message === "OPPORTUNITY_NOT_FOUND";
    return context.json(
      {
        code: error.message,
        message: notFound ? "没有找到这个机会方向。" : "这个机会当前无法执行该动作。",
      },
      notFound ? 404 : 409,
    );
  }
  throw error;
}
