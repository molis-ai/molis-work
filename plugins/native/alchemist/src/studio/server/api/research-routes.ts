import type { Hono } from "hono";
import {
  ideaResearchParamsSchema,
  lensParamsSchema,
  researchPlanRequestSchema,
  startLensRunRequestSchema,
} from "../../shared/contracts/research.js";
import { ResearchPlanError } from "../services/create-research-plan.js";
import { StartLensRunError } from "../services/start-lens-run.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerResearchRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/runtime/models", async (context) =>
    context.json({ models: await dependencies.listRuntimeModels() }),
  );

  app.get("/api/v1/ideas/:id/versions/:version/research", async (context) => {
    const params = ideaResearchParamsSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json({ code: "IDEA_VERSION_NOT_FOUND", message: "没有找到这个 Idea 版本。" }, 404);
    }
    try {
      return context.json(await dependencies.getResearchWorkspace(params.data.id, params.data.version));
    } catch (error) {
      if (error instanceof Error && error.message === "IDEA_VERSION_NOT_FOUND") {
        return context.json({ code: error.message, message: "没有找到这个 Idea 版本。" }, 404);
      }
      throw error;
    }
  });

  app.post("/api/v1/ideas/:id/lenses/:lens/plans", async (context) => {
    const params = lensParamsSchema.safeParse(context.req.param());
    const body = researchPlanRequestSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!params.success || !body.success) {
      return context.json({ code: "RESEARCH_PLAN_INVALID", message: "研究计划参数不完整。" }, 400);
    }
    try {
      const plan = await dependencies.createResearchPlan({
        ideaId: params.data.id,
        ideaVersion: body.data.ideaVersion,
        lens: params.data.lens,
        modelPolicy: body.data.modelPolicy,
        ...(body.data.modelId ? { modelId: body.data.modelId } : {}),
        budget: body.data.budget,
      });
      return context.json({ plan }, 201);
    } catch (error) {
      if (error instanceof ResearchPlanError) {
        if (error.code === "IDEA_VERSION_NOT_FOUND") {
          return context.json({ code: error.code, message: "只有正式 Idea 版本可以开始研究。" }, 404);
        }
        return context.json(
          {
            code: error.code,
            message: error.code === "RUNTIME_MODEL_NOT_FOUND" ? "没有找到所选模型。" : "预算上限无效。",
          },
          422,
        );
      }
      throw error;
    }
  });

  app.post("/api/v1/ideas/:id/lenses/:lens/runs", async (context) => {
    const params = lensParamsSchema.safeParse(context.req.param());
    const body = startLensRunRequestSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!params.success || !body.success) {
      return context.json({ code: "LENS_RUN_INVALID", message: "启动研究所需信息不完整。" }, 400);
    }
    try {
      const run = dependencies.startLensRun({
        ideaId: params.data.id,
        lens: params.data.lens,
        planId: body.data.planId,
      });
      return context.json({ run }, 202);
    } catch (error) {
      if (error instanceof StartLensRunError) {
        return context.json({ code: error.code, message: "这份研究计划无法启动。" }, 409);
      }
      throw error;
    }
  });
}
