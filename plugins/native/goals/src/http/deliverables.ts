import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { goalsFailure, goalsRoute } from "./failure.js";
import type { GoalsRoutePorts } from "./types.js";
import { goalsActions } from "../actions.js";

/** A Goal's deliverables (specs/artifact-positioning A5): read them and what can be pinned on the spot; record, pin or remove one. */
export function goalDeliverableRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    ...goalArtifactInputRoutes(ports),
    goalsRoute("goals.deliverables-read", ports, async (context) => {
      const goalId = context.params.goalId!;
      const [listed, candidates] = await Promise.all([context.actions.invoke(goalsActions.deliverablesList, { goal_id: goalId }),
        context.actions.invoke(goalsActions.deliverablesCandidates, { goal_id: goalId })]);
      return { status: 200, body: { deliverables: listed.deliverables, candidates: candidates.objects } };
    }),
    goalsRoute("goals.deliverables-write", ports, async (context) => {
      const goalId = context.params.goalId!;
      const body = context.body;
      if (typeof body.delivered !== "boolean") return goalsFailure(new ActionError("actions.input_invalid", "delivered 必须是 boolean"));
      // A work object is pinned on the spot and its new version handed in; a version already in the 成果库 is recorded as is.
      const subject = body.subject as { kind?: unknown; id?: unknown } | undefined;
      const value = body.reference as { artifact_id?: unknown; version?: unknown } | undefined;
      const reference = { artifact_id: String(value?.artifact_id ?? ""), version: Number(value?.version) };
      const result = subject && body.delivered
        ? await context.actions.invoke(goalsActions.deliverablesPin, { goal_id: goalId, subject: { kind: String(subject.kind ?? ""), id: String(subject.id ?? "") } })
        : body.delivered
          ? await context.actions.invoke(goalsActions.deliverablesAdd, { goal_id: goalId, reference })
          : await context.actions.invoke(goalsActions.deliverablesRemove, { goal_id: goalId, reference });
      return { status: 200, body: result };
    }),
  ];
}

/**
 * 「作为 Goal 的输入」 (A4b): the Goals to choose from, and recording or removing one version from the 成果库 as a Goal's input.
 */
function goalArtifactInputRoutes(ports: GoalsRoutePorts): PluginRouteBinding[] {
  return [
    goalsRoute("goals.directory", ports, async (context) => {
      const directory = await context.actions.invoke(goalsActions.list, { limit: 100 });
      return { status: 200, body: { goals: directory.goals.map(goal => ({ goal_id: goal.goal_id, title: goal.title })) } };
    }),
    goalsRoute("goals.artifact-inputs-read", ports, async (context) =>
      ({ status: 200, body: await context.actions.invoke(goalsActions.artifactInputsList, { goal_id: context.params.goalId! }) })),
    goalsRoute("goals.artifact-inputs-write", ports, async (context) => {
      const goalId = context.params.goalId!;
      const body = context.body;
      if (typeof body.used !== "boolean") return goalsFailure(new ActionError("actions.input_invalid", "used 必须是 boolean"));
      const value = body.reference as { artifact_id?: unknown; version?: unknown } | undefined;
      const reference = { artifact_id: String(value?.artifact_id ?? ""), version: Number(value?.version) };
      // A work object (not yet a version) taken as 「固定这一版」 is pinned through its owner first.
      const subject = body.subject as { kind?: unknown; id?: unknown } | undefined;
      const result = subject && body.used
        ? await context.actions.invoke(goalsActions.artifactInputsPin, { goal_id: goalId, subject: { kind: String(subject.kind ?? ""), id: String(subject.id ?? "") } })
        : body.used ? await context.actions.invoke(goalsActions.artifactInputsAdd, { goal_id: goalId, reference })
          : await context.actions.invoke(goalsActions.artifactInputsRemove, { goal_id: goalId, reference });
      return { status: 200, body: result };
    }),
  ];
}
