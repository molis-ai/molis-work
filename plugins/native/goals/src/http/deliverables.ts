import type { GoalsHttpContext } from "./types.js";
import { goalsActions } from "../actions.js";

/** A Goal's deliverables (specs/artifact-positioning A5): read them and what can be pinned on the spot; record, pin or remove one. */
export async function handleGoalDeliverablesHttp(context: GoalsHttpContext): Promise<boolean> {
  if (await handleGoalArtifactInputsHttp(context)) return true;
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

/**
 * 「作为 Goal 的输入」 (A4b): the Goals to choose from, and recording or removing one version from the 成果库 as a Goal's input.
 */
async function handleGoalArtifactInputsHttp(context: GoalsHttpContext): Promise<boolean> {
  if (context.method === "GET" && context.pathname === "/api/goals/directory") {
    const directory = await context.actions.invoke(goalsActions.list, { limit: 100 });
    context.respond(200, { goals: directory.goals.map(goal => ({ goal_id: goal.goal_id, title: goal.title })) });
    return true;
  }
  const match = context.pathname.match(/^\/api\/goals\/([^/]+)\/artifact-inputs$/);
  if (!match) return false;
  const goalId = decodeURIComponent(match[1]!);
  try {
    if (context.method === "GET") { context.respond(200, await context.actions.invoke(goalsActions.artifactInputsList, { goal_id: goalId })); return true; }
    if (context.method !== "POST") return false;
    const body = await context.readBody();
    if (typeof body.used !== "boolean") { context.respond(400, { error: "used 必须是 boolean" }); return true; }
    const value = body.reference as { artifact_id?: unknown; version?: unknown } | undefined;
    const reference = { artifact_id: String(value?.artifact_id ?? ""), version: Number(value?.version) };
    // A work object (not yet a version) taken as 「固定这一版」 is pinned through its owner first.
    const subject = body.subject as { kind?: unknown; id?: unknown } | undefined;
    const result = subject && body.used
      ? await context.actions.invoke(goalsActions.artifactInputsPin, { goal_id: goalId, subject: { kind: String(subject.kind ?? ""), id: String(subject.id ?? "") } })
      : body.used ? await context.actions.invoke(goalsActions.artifactInputsAdd, { goal_id: goalId, reference })
        : await context.actions.invoke(goalsActions.artifactInputsRemove, { goal_id: goalId, reference });
    context.changed();
    context.respond(200, result);
  } catch (error) {
    context.respond(400, { error: error instanceof Error ? error.message : String(error), code: (error as { code?: string }).code });
  }
  return true;
}
