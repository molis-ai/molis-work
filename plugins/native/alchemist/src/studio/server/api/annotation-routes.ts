import type { Hono } from "hono";
import {
  annotationParamsSchema,
  createAnnotationSchema,
  listAnnotationsQuerySchema,
} from "../../shared/contracts/annotation.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerAnnotationRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/annotations", (context) => {
    const parsed = listAnnotationsQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json({ code: "ANNOTATION_QUERY_INVALID", message: "注释目标不完整。" }, 400);
    }
    return context.json({
      annotations: dependencies.calibration.listAnnotations({ ...parsed.data, blockId: "*" }),
    });
  });

  app.post("/api/v1/annotations", async (context) => {
    const body = await context.req.json().catch(() => undefined);
    const parsed = createAnnotationSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        {
          code: "ANNOTATION_INVALID",
          message: "引用和你的评论都需要保留，评论输入不能是引用的副本输入框。",
          recovery: "重新选择一段正文，并另行写下问题或修改意见。",
        },
        400,
      );
    }
    if (!targetExists(parsed.data.target, dependencies)) {
      return context.json(
        { code: "ANNOTATION_TARGET_NOT_FOUND", message: "这个报告版本已经不存在或无法定位。" },
        404,
      );
    }
    const now = dependencies.clock.now();
    const annotation = dependencies.calibration.createAnnotation({
      id: dependencies.idFactory.next("annotation"),
      workspaceId: dependencies.workspaceId,
      actorId: dependencies.actorId,
      target: parsed.data.target,
      quotedSnapshot: parsed.data.quotedSnapshot,
      comment: parsed.data.comment,
      status: "open",
      createdAt: now,
    });
    dependencies.activity.create({
      id: dependencies.idFactory.next("activity"),
      workspaceId: dependencies.workspaceId,
      kind: "annotation.created",
      targetKind: annotation.target.kind,
      targetId: annotation.target.objectId,
      payload: { annotationId: annotation.id, revision: annotation.target.revision },
      createdAt: now,
    });
    return context.json({ annotation }, 201);
  });

  app.post("/api/v1/annotations/:id/resolve", (context) => {
    const parsed = annotationParamsSchema.safeParse(context.req.param());
    if (!parsed.success) {
      return context.json({ code: "ANNOTATION_ID_INVALID", message: "无法定位这条注释。" }, 400);
    }
    try {
      return context.json({
        annotation: dependencies.calibration.markAnnotationResolved(parsed.data.id, dependencies.clock.now()),
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : "ANNOTATION_RESOLVE_FAILED";
      return context.json(
        { code, message: "这条注释已经解决或不存在。" },
        code.endsWith("NOT_FOUND") ? 404 : 409,
      );
    }
  });
}

function targetExists(
  target: { kind: string; objectId: string; revision: number },
  dependencies: ApiDependencies,
): boolean {
  if (target.kind === "idea_brief") {
    return Boolean(dependencies.ideas.getVersion(target.objectId, target.revision));
  }
  if (target.kind === "lens_report") {
    return dependencies.research.getReport(target.objectId)?.revision === target.revision;
  }
  if (target.kind === "pulse_report") {
    return dependencies.pulse.getReport(target.objectId)?.revision === target.revision;
  }
  return false;
}
