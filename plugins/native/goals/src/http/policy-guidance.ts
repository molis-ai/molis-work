import { ActionError, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsRoute } from "./failure.js";
import { goalsActions } from "../actions.js";
import { randomUUID } from "node:crypto";
import type { GoalsRoutePorts } from "./types.js";
import type { GoalsCommandApi } from "../contract/goals.js";

/** The project's default rules (`goals.policy-save`) and its guidance: read, add, and edit, stop or restore one. */
export function goalPolicyGuidanceRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    goalsRoute("goals.policy-save", ports, async (context) => {
      const body = context.body;
      if (body.scope !== "project_default" || body.goal_id != null) throw new ActionError("actions.input_invalid", "此入口只保存项目默认规则。");
      const result = await context.actions.invoke(goalsActions.policySave, {
        user_confirmed: body.user_confirmed === true,
        policy: body.policy as Parameters<GoalsCommandApi["saveProjectPolicy"]>[0]["policy"],
        idempotency_key: String(body.idempotency_key ?? ""),
      });
      return { status: 200, body: result };
    }),
    goalsRoute("goals.guidance-read", ports, async (context) => ({ status: 200, body: await context.actions.invoke(goalsActions.guidanceRead, {}) })),
    goalsRoute("goals.guidance-add", ports, async (context) => {
      const body = context.body;
      const result = await context.actions.invoke(goalsActions.guidanceAdd, {
        kind: String(body.kind ?? "") as Parameters<GoalsCommandApi["addProjectGuidance"]>[0]["kind"],
        content: String(body.content ?? ""),
        source_refs: Array.isArray(body.source_refs) ? body.source_refs.map(String) : [],
        reason: String(body.reason ?? ""),
        confirmation_summary: "用户在项目说明页面直接提交新增",
        user_confirmed: body.user_confirmed === true,
        idempotency_key: String(body.idempotency_key ?? `web-project-guidance-${randomUUID()}`),
      });
      return { status: 200, body: { ...result, ...await guidanceAfterWrite(context.actions) } };
    }),
    goalsRoute("goals.guidance-update", ports, async (context) => {
      const body = context.body;
      const action = String(body.action ?? "");
      const confirmationSummary = action === "edit"
        ? "用户在项目说明页面直接提交修改"
        : action === "deactivate"
          ? "用户在项目说明页面直接停用"
          : "用户在项目说明页面直接恢复";
      const result = await context.actions.invoke(goalsActions.guidanceUpdate, {
        guidance_id: context.params.guidanceId!,
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
      return { status: 200, body: { ...result, ...await guidanceAfterWrite(context.actions) } };
    }),
  ];
}

/** Saving has committed; a separately denied refresh must not falsify its receipt. */
async function guidanceAfterWrite(actions: BoundActionClient) {
  try { return { project_guidance: await actions.invoke(goalsActions.guidanceRead, {}) }; }
  catch (error) { return { project_guidance: null, project_guidance_error: error instanceof Error ? error.message : String(error) }; }
}
