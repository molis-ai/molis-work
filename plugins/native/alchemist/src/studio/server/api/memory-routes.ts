import type { Hono } from "hono";
import { ZodError } from "zod";
import { createTasteRuleSchema, memoryRuleParamsSchema } from "../../shared/contracts/memory.js";
import type { ApiDependencies } from "./dependencies.js";

export function registerMemoryRoutes(app: Hono, dependencies: ApiDependencies): void {
  app.get("/api/v1/memory", (context) =>
    context.json({
      taste: dependencies.memory.listTasteRules(dependencies.workspaceId),
      playbook: dependencies.memory.listPlaybookRules(dependencies.workspaceId).map((rule) => ({
        ...rule,
        applications: dependencies.memory
          .listApplications(rule.id)
          .map(({ planId, runId }) => ({ planId, ...(runId ? { runId } : {}) })),
      })),
    }),
  );

  app.post("/api/v1/annotations/:id/playbook-proposals", async (context) => {
    const params = memoryRuleParamsSchema.safeParse(context.req.param());
    const body = await context.req.json().catch(() => undefined);
    if (!params.success) {
      return context.json({ code: "ANNOTATION_ID_INVALID", message: "无法定位这条注释。" }, 400);
    }
    try {
      const proposal = dependencies.calibrationMemory.createPlaybookProposal(params.data.id, body);
      return context.json({ proposal }, 201);
    } catch (error) {
      if (error instanceof ZodError) {
        return context.json(
          {
            code: "PLAYBOOK_PROPOSAL_INVALID",
            message: "方法变化、正反例和作用域需要由你明确填写。",
          },
          400,
        );
      }
      const code = error instanceof Error ? error.message : "PLAYBOOK_PROPOSAL_FAILED";
      return context.json(
        { code, message: "这条反馈暂时不能形成 Research Playbook 提案。" },
        code.endsWith("NOT_FOUND") ? 404 : 409,
      );
    }
  });

  app.post("/api/v1/action-proposals/:id/apply", (context) => {
    const params = memoryRuleParamsSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json({ code: "ACTION_PROPOSAL_ID_INVALID", message: "无法定位这条提案。" }, 400);
    }
    try {
      return context.json(dependencies.calibrationMemory.applyProposal(params.data.id));
    } catch (error) {
      const code = error instanceof Error ? error.message : "ACTION_PROPOSAL_APPLY_FAILED";
      return context.json(
        { code, message: "这张校准提案已经处理或无法应用。" },
        code.endsWith("NOT_FOUND") ? 404 : 409,
      );
    }
  });

  app.post("/api/v1/memory/taste", async (context) => {
    const body = createTasteRuleSchema.safeParse(await context.req.json().catch(() => undefined));
    if (!body.success) {
      return context.json({ code: "TASTE_RULE_INVALID", message: "请完整写下偏好及其适用范围。" }, 400);
    }
    const now = dependencies.clock.now();
    const rule = dependencies.memory.createTasteRule({
      id: dependencies.idFactory.next("taste"),
      workspaceId: dependencies.workspaceId,
      actorId: dependencies.actorId,
      version: 1,
      ...body.data,
      source: { kind: "direct", id: "memory_settings" },
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    dependencies.activity.create({
      id: dependencies.idFactory.next("activity"),
      workspaceId: dependencies.workspaceId,
      kind: "memory.taste_created",
      targetKind: "taste_rule",
      targetId: rule.id,
      payload: { source: "direct" },
      createdAt: now,
    });
    return context.json({ rule }, 201);
  });

  app.post("/api/v1/memory/taste/:id/disable", (context) => {
    const params = memoryRuleParamsSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json({ code: "TASTE_RULE_ID_INVALID", message: "无法定位这条 Taste。" }, 400);
    }
    try {
      return context.json({
        rule: dependencies.memory.updateTasteStatus(params.data.id, "disabled", dependencies.clock.now()),
      });
    } catch {
      return context.json({ code: "TASTE_RULE_NOT_FOUND", message: "没有找到这条 Taste。" }, 404);
    }
  });

  app.post("/api/v1/memory/playbook/:id/disable", (context) => {
    const params = memoryRuleParamsSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json({ code: "PLAYBOOK_RULE_ID_INVALID", message: "无法定位这条校准规则。" }, 400);
    }
    try {
      return context.json({
        rule: dependencies.memory.updatePlaybookStatus(params.data.id, "disabled", dependencies.clock.now()),
      });
    } catch {
      return context.json({ code: "PLAYBOOK_RULE_NOT_FOUND", message: "没有找到这条校准规则。" }, 404);
    }
  });
}
