import type { Hono } from "hono";
import { createDecisionRequestSchema, decisionParamsSchema } from "../../shared/contracts/decision.js";
import { DecisionServiceError } from "../services/decision-workspace.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerDecisionRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/decisions", (context) => {
    const persisted = dependencies.activity.list(dependencies.workspaceId);
    const jobs = dependencies.jobs.listRecent().map((job) => ({
      id: `job_activity:${job.id}`,
      workspaceId: dependencies.workspaceId,
      kind: `run.${job.status}`,
      targetKind: "job",
      targetId: job.id,
      payload: {
        jobKind: job.kind,
        attempt: job.attempt,
        ...(job.errorCode ? { errorCode: job.errorCode } : {}),
      },
      createdAt: job.updatedAt,
    }));
    const activities = [...persisted, ...jobs]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 100);
    return context.json({
      cases: dependencies.decisionWorkspace.listCases(),
      log: dependencies.decisionWorkspace.listLog(),
      activities,
    });
  });

  app.get("/api/v1/ideas/:id/versions/:version/decision", (context) => {
    const params = decisionParamsSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json({ code: "IDEA_VERSION_NOT_FOUND", message: "没有找到这个 Idea 版本。" }, 404);
    }
    try {
      return context.json(dependencies.decisionWorkspace.getWorkspace(params.data.id, params.data.version));
    } catch (error) {
      if (error instanceof DecisionServiceError && error.code === "IDEA_VERSION_NOT_FOUND") {
        return context.json({ code: error.code, message: "没有找到这个 Idea 版本。" }, 404);
      }
      throw error;
    }
  });

  app.post("/api/v1/ideas/:id/versions/:version/decision", async (context) => {
    const params = decisionParamsSchema.safeParse(context.req.param());
    const body = createDecisionRequestSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!params.success || !body.success) {
      return context.json({ code: "DECISION_INVALID", message: "请选择决定并写下理由。" }, 400);
    }
    try {
      const decision = dependencies.decisionWorkspace.decide({
        ideaId: params.data.id,
        ideaVersion: params.data.version,
        outcome: body.data.outcome,
        reason: body.data.reason,
        revisitCondition: body.data.revisitCondition,
      });
      return context.json({ decision }, 201);
    } catch (error) {
      if (error instanceof DecisionServiceError) {
        const message =
          error.code === "DECISION_ALREADY_EXISTS"
            ? "这个 Idea 版本已经有正式决定。"
            : error.code === "DECISION_VERSION_NOT_CURRENT"
              ? "旧 Idea 版本只能回看。"
              : "两条兼容研究材料尚未齐全。";
        return context.json({ code: error.code, message }, 409);
      }
      throw error;
    }
  });
}
