import { codingArtifacts } from "./artifacts.js";
import { currentGoalDirectory, readCurrentGoalSnapshot, currentGoalContext, savedGoalContext, saveGoalContext } from "./goal-context.js";
import { readCodingExecutionReport } from "./report.js";
import { type CodingActivation, selected } from "./route-activation.js";
import { codingActionControl } from "./route-entry.js";
import { bodyOf } from "./route-selections.js";
import { text } from "./run-inputs.js";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import type { PluginRouteBinding } from "@molis-ai/molis-work-contracts/platform/plugin";

/** Coding routes for a session's Goal: the directory, a Goal's context, the one chosen for the next round, and a report's progress recorded on it. */

const reportProgress = (a: CodingActivation, write: boolean) => a.route(write ? "coding.record-report-progress" : "coding.report-progress", async (request, _api, execution, beforeWrite) => {
  const session = selected(a, request, execution);
  const runId = text(request.params.runId, "执行引用");
  const saved = readCodingExecutionReport(codingArtifacts(a.context), session.session_id, runId);
  if (!saved) throw new Error("请先保存这轮固定报告，再记录 Goal 进展");
  const { report, reference } = saved;
  if (!report.goal || report.goal_source_error) throw new Error("这份报告没有可确认的原目标，不能改用会话后来选择的目标记录进展");
  const goalId = report.goal.goal_id;
  const idempotencyKey = `coding-report-progress:${reference.artifact_id}@${reference.version}`;
  const actorId = request.actor_id;
  if (!actorId) throw new Error("当前操作缺少用户身份");
  if (!write) {
    const receipt = await a.context.services!.actions!.invoke(goalPluginActions.receipt, { goal_id: goalId, idempotency_key: idempotencyKey }, codingActionControl(beforeWrite));
    if (receipt) return { report_goal: report.goal, reference, title: report.title, recorded: receipt, current: null };
    const current = await readCurrentGoalSnapshot(a.context, goalId, codingActionControl(beforeWrite));
    return { report_goal: report.goal, reference, title: report.title, recorded: null, current };
  }
  const body = bodyOf(request);
  const cursor = body.expected_goal_cursor;
  if (typeof cursor !== "number" || !Number.isSafeInteger(cursor) || cursor < 0) throw new Error("请先查看原目标当前版本，再确认记录进展");
  // The original Goal transaction checks replay first, then versions and write.
  // Nothing is derived from a browser-supplied report, Goal id, or source body.
  return a.context.services!.actions!.invoke(goalPluginActions.progress, {
    goal_id: goalId, idempotency_key: idempotencyKey,
    based_on_cursor: cursor, expected_goal_cursor: cursor,
    summary: text(body.summary, "进展内容", 10000),
    ...(body.next_step ? { next_step: text(body.next_step, "下一步", 10000) } : {}),
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
      const value = await currentGoalContext(context, text(request.params.goalId, "目标"), codingActionControl(beforeWrite));
      return { ...value, text: value.material.text };
    });
  },
  (a) => {
    const { context, route } = a;
    return route("coding.read-goal", async (request, _api, execution) => {
      const record = selected(a, request, execution);
      if (!record.goal_id) return { goal_id: null, selected: null };
      try { return { goal_id: record.goal_id, selected: savedGoalContext(context, record.session_id) }; }
      catch (error) { return { goal_id: record.goal_id, selected: null, error: error instanceof Error ? error.message : "固定目标不可读" }; }
    });
  },
  (a) => {
    const { context, projectId, busy, route } = a;
    return route("coding.select-goal", async (request, _api, execution, beforeWrite) => {
      const record = selected(a, request, execution), body = bodyOf(request);
      if (busy.has(record.session_id)) throw new Error("正在提交任务，请稍后修改下一轮目标");
      const goalId = body.goal_id === null ? null : text(body.goal_id, "目标");
      if (goalId) {
        const value = await currentGoalContext(context, goalId, codingActionControl(beforeWrite));
        if (value.reference.artifact_id !== body.expected_artifact_id) throw new Error("目标内容已变化，请重新查看后确认");
        await beforeWrite(); beforeWrite.assert_current();
        if (busy.has(record.session_id)) throw new Error("正在提交任务，请稍后修改下一轮目标");
        saveGoalContext(context, record.session_id, value);
      }
      const session = execution.sessions.setGoal(projectId, record.session_id, goalId, new Date().toISOString());
      if (!goalId) context.services!.storage!.delete(`goal-context:${record.session_id}`);
      return { session, selected: goalId ? savedGoalContext(context, record.session_id) : null };
    });
  },
  (a) => [reportProgress(a, false), reportProgress(a, true)],
];

/** The Goal-context routes of one activation. */
export const goalsRoutes = (a: CodingActivation): PluginRouteBinding[] => ROUTES.flatMap(make => make(a));
