import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsRoute } from "./failure.js";
import { goalsActions } from "../actions.js";
import { randomUUID } from "node:crypto";
import type { GoalsRoutePorts } from "./types.js";
import type { GoalsCommandApi } from "../contract/goals.js";

/** Read, add, edit, stop or restore the project's guidance. */
export function goalPolicyGuidanceRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
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
