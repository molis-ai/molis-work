import type { GoalsHttpContext } from "./types.js";
import { goalsActions } from "../actions.js";

/** A Goal's deliverables (specs/artifact-positioning A5): read them, and record or remove one version from the 成果库. */
export async function handleGoalDeliverablesHttp(context: GoalsHttpContext): Promise<boolean> {
  const match = context.pathname.match(/^\/api\/goals\/([^/]+)\/deliverables$/);
  if (!match) return false;
  const goalId = decodeURIComponent(match[1]!);
  try {
    if (context.method === "GET") {
      context.respond(200, await context.actions.invoke(goalsActions.deliverablesList, { goal_id: goalId }));
      return true;
    }
    if (context.method !== "POST") return false;
    const body = await context.readBody();
    const value = body.reference as { artifact_id?: unknown; version?: unknown } | undefined;
    const reference = { artifact_id: String(value?.artifact_id ?? ""), version: Number(value?.version) };
    if (typeof body.delivered !== "boolean") { context.respond(400, { error: "delivered 必须是 boolean" }); return true; }
    const result = body.delivered
      ? await context.actions.invoke(goalsActions.deliverablesAdd, { goal_id: goalId, reference })
      : await context.actions.invoke(goalsActions.deliverablesRemove, { goal_id: goalId, reference });
    context.changed();
    context.respond(200, result);
  } catch (error) {
    context.respond(400, { error: error instanceof Error ? error.message : String(error), code: (error as { code?: string }).code });
  }
  return true;
}
