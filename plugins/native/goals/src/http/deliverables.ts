import type { GoalsHttpContext } from "./types.js";
import { goalsActions } from "../actions.js";

/** A Goal's deliverables (specs/artifact-positioning A5): read them and what can be pinned on the spot; record, pin or remove one. */
export async function handleGoalDeliverablesHttp(context: GoalsHttpContext): Promise<boolean> {
  const match = context.pathname.match(/^\/api\/goals\/([^/]+)\/deliverables$/);
  if (!match) return false;
  const goalId = decodeURIComponent(match[1]!);
  try {
    if (context.method === "GET") {
      const [listed, candidates] = await Promise.all([context.actions.invoke(goalsActions.deliverablesList, { goal_id: goalId }),
        context.actions.invoke(goalsActions.deliverablesCandidates, { goal_id: goalId })]);
      context.respond(200, { deliverables: listed.deliverables, candidates: candidates.objects });
      return true;
    }
    if (context.method !== "POST") return false;
    const body = await context.readBody();
    if (typeof body.delivered !== "boolean") { context.respond(400, { error: "delivered 必须是 boolean" }); return true; }
    // A work object is pinned on the spot and its new version handed in; a version already in the 成果库 is recorded as is.
    const subject = body.subject as { kind?: unknown; id?: unknown } | undefined;
    const value = body.reference as { artifact_id?: unknown; version?: unknown } | undefined;
    const reference = { artifact_id: String(value?.artifact_id ?? ""), version: Number(value?.version) };
    const result = subject && body.delivered
      ? await context.actions.invoke(goalsActions.deliverablesPin, { goal_id: goalId, subject: { kind: String(subject.kind ?? ""), id: String(subject.id ?? "") } })
      : body.delivered
        ? await context.actions.invoke(goalsActions.deliverablesAdd, { goal_id: goalId, reference })
        : await context.actions.invoke(goalsActions.deliverablesRemove, { goal_id: goalId, reference });
    context.changed();
    context.respond(200, result);
  } catch (error) {
    context.respond(400, { error: error instanceof Error ? error.message : String(error), code: (error as { code?: string }).code });
  }
  return true;
}
