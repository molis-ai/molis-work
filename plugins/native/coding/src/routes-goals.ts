import { codingArtifacts } from "./artifacts.js";
import { currentGoalDirectory, readCurrentGoalSnapshot, currentGoalContext, savedGoalContext, saveGoalContext } from "./goal-context.js";
import { readCodingExecutionReport } from "./report.js";
import { type CodingActivation, selected } from "./route-activation.js";
import { codingActionControl } from "./route-entry.js";
import { bodyOf } from "./route-selections.js";
import { text } from "./run-inputs.js";
import { GOALS_ACTIONS } from "./goals-actions.js";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { codingFailure, codingText } from "./words.js";

/** Coding routes for a session's Goal: the directory, a Goal's context, the one chosen for the next round, and a report's progress recorded on it. */

const reportProgress = (a: CodingActivation, write: boolean) => a.route(write ? "coding.record-report-progress" : "coding.report-progress", async (request, _api, execution, beforeWrite) => {
  const session = selected(a, request, execution);
  const runId = text(request.params.runId, "coding.field.run");
  const saved = readCodingExecutionReport(codingArtifacts(a.context), session.session_id, runId);
  if (!saved) throw codingFailure("coding.server.goal-report-first");
  const { report, reference } = saved;
  if (!report.goal || report.goal_source_error) throw codingFailure("coding.server.goal-original-missing");
  const goalId = report.goal.goal_id;
  const idempotencyKey = `coding-report-progress:${reference.artifact_id}@${reference.version}`;
  const actorId = request.actor_id;
  if (!actorId) throw codingFailure("coding.server.no-actor");
  if (!write) {
    const receipt = await a.context.services!.actions!.invoke(GOALS_ACTIONS.receipt, { goal_id: goalId, idempotency_key: idempotencyKey }, codingActionControl(beforeWrite));
    if (receipt) return { report_goal: report.goal, reference, title: report.title, recorded: receipt, current: null };
    const current = await readCurrentGoalSnapshot(a.context, goalId, codingActionControl(beforeWrite));
    return { report_goal: report.goal, reference, title: report.title, recorded: null, current };
  }
  const body = bodyOf(request);
  const cursor = body.expected_goal_cursor;
  if (typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 0) throw codingFailure("coding.server.goal-view-first");
  // The original Goal transaction checks replay first, then versions and write.
  // Nothing is derived from a browser-supplied report, Goal id, or source body.
  return a.context.services!.actions!.invoke(GOALS_ACTIONS.progress, {
    goal_id: goalId, idempotency_key: idempotencyKey,
    based_on_cursor: cursor, expected_goal_cursor: cursor,
    summary: text(body.summary, "coding.field.progress", 10000),
    ...(body.next_step ? { next_step: text(body.next_step, "coding.field.next", 10000) } : {}),
    source: { ...reference, title: report.title, origin: { plugin_id: "coding", item_id: reference.artifact_id } },
  }, codingActionControl(beforeWrite));
});

type RouteMaker = (a: CodingActivation) => PluginRouteBinding | PluginRouteBinding[];

const ROUTES: RouteMaker[] = [
  (a) => {
    const { context, route } = a;
    return route("coding.goals", async (request, _api, _execution, beforeWrite) => currentGoalDirectory(context, request.query?.after_cursor ? String(request.query.after_cursor) : undefined, codingActionControl(beforeWrite)));
  },
  (a) => {
    const { context, route } = a;
    return route("coding.goal-context", async (request, _api, _execution, beforeWrite) => {
      const value = await currentGoalContext(context, text(request.params.goalId, "coding.field.goal"), codingActionControl(beforeWrite));
      return { ...value, text: value.material.text };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.read-goal", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      if (!record.goal_id) return { goal_id: null, selected: null };
      try { return { goal_id: record.goal_id, selected: savedGoalContext(context, record.session_id) }; }
      catch (error) { return { goal_id: record.goal_id, selected: null, error: error instanceof Error ? error.message : codingText(execution.locale)("coding.server.goal-unreadable") }; }
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.select-goal", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      const notSubmitting = () => { if (busy.has(record.session_id)) throw codingFailure("coding.server.busy-goal"); };
      notSubmitting();
      const goalId = body.goal_id === null ? null : text(body.goal_id, "coding.field.goal");
      if (goalId) {
        const value = await currentGoalContext(context, goalId, codingActionControl(beforeWrite));
        if (value.reference.artifact_id !== body.expected_artifact_id) throw codingFailure("coding.server.goal-changed");
        await beforeWrite(); beforeWrite.assert_current();
        notSubmitting();
        saveGoalContext(context, record.session_id, value);
        // The title the person has just chosen it by is the one the directory shows from now on.
        execution.goalTitles.remember(goalId, value.snapshot.goal.title);
      }
      // Checked again inside the write: a round started while the write waited on `beforeWrite` is still refused.
      const session = await execution.sessions.setGoal(beforeWrite, projectId, record.session_id, goalId, new Date().toISOString(), notSubmitting);
      if (!goalId) context.services!.storage!.delete(`goal-context:${record.session_id}`);
      return { session, selected: goalId ? savedGoalContext(context, record.session_id) : null };
    });
  },
  (a) => [reportProgress(a, false), reportProgress(a, true)],
];

/** The Goal-context routes of one activation. */
export const goalsRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
