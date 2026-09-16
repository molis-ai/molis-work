import { randomUUID } from "node:crypto";
import type { GoalsHttpContext } from "./types.js";
import type { GoalsCommandApi } from "@molis-ai/molis-work-contracts/modules/goals";

export async function handleGoalPolicyGuidanceHttp(context: GoalsHttpContext): Promise<boolean> {
  if (context.method === "POST" && context.pathname === "/api/policy-bindings") {
    const body = await context.readBody();
    try {
      if (body.scope !== "project_default" || body.goal_id != null) throw new Error("此入口只保存项目默认规则。");
      const result = context.commands.saveProjectPolicy({
        board_id: context.options.boardId, actor_id: "web-user",
        reason: String(body.reason ?? ""), user_confirmed: body.user_confirmed === true,
        policy: body.policy as Parameters<GoalsCommandApi["saveProjectPolicy"]>[0]["policy"],
        idempotency_key: String(body.idempotency_key ?? ""),
      });
      context.respond(200, result);
      context.changed();
    } catch (error) {
      context.respond(400, { error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }
  if (context.method === "GET" && context.pathname === "/api/project-guidance") {
    context.respond( 200, context.query.readProjectGuidance(context.options.boardId));
    return true;
  }
  if (context.method === "POST" && context.pathname === "/api/project-guidance") {
    const body = await context.readBody();
    try {
      const result = context.commands.addProjectGuidance({
        board_id: context.options.boardId,
        actor_id: "web-user",
        kind: String(body.kind ?? "") as Parameters<GoalsCommandApi["addProjectGuidance"]>[0]["kind"],
        content: String(body.content ?? ""),
        source_refs: Array.isArray(body.source_refs) ? body.source_refs.map(String) : [],
        reason: String(body.reason ?? ""),
        confirmation_summary: "用户在项目说明页面直接提交新增",
        user_confirmed: body.user_confirmed === true,
        idempotency_key: String(body.idempotency_key ?? `web-project-guidance-${randomUUID()}`),
      });
      context.respond( 200, {
        ...result,
        project_guidance: context.query.readProjectGuidance(context.options.boardId),
      });
    } catch (error) {
      context.respond( 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  const projectGuidanceUpdateMatch = context.pathname.match(/^\/api\/project-guidance\/([^/]+)$/);
  if (context.method === "PATCH" && projectGuidanceUpdateMatch) {
    const body = await context.readBody();
    const action = String(body.action ?? "");
    const confirmationSummary = action === "edit"
      ? "用户在项目说明页面直接提交修改"
      : action === "deactivate"
        ? "用户在项目说明页面直接停用"
        : "用户在项目说明页面直接恢复";
    try {
      const result = context.commands.updateProjectGuidance({
        board_id: context.options.boardId,
        guidance_id: decodeURIComponent(projectGuidanceUpdateMatch[1]),
        actor_id: "web-user",
        action: action as Parameters<GoalsCommandApi["updateProjectGuidance"]>[0]["action"],
        kind: body.kind == null
          ? undefined
          : String(body.kind) as Parameters<GoalsCommandApi["updateProjectGuidance"]>[0]["kind"],
        content: body.content == null ? undefined : String(body.content),
        source_refs: Array.isArray(body.source_refs) ? body.source_refs.map(String) : undefined,
        reason: String(body.reason ?? ""),
        confirmation_summary: confirmationSummary,
        user_confirmed: body.user_confirmed === true,
        idempotency_key: String(body.idempotency_key ?? `web-project-guidance-update-${randomUUID()}`),
      });
      context.respond( 200, {
        ...result,
        project_guidance: context.query.readProjectGuidance(context.options.boardId),
      });
    } catch (error) {
      context.respond( 400, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return true;
  }
  return false;
}
