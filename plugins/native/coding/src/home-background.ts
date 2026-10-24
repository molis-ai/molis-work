import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindOwnerPluginAction, defineHomeBackgroundTasksAction, type ActionHandlerBinding, type HomeBackgroundTask, type HomeBackgroundTaskCollection, type HomeBackgroundTaskPhrase } from "@molis-ai/molis-work-plugin-sdk";
import type { CodingBackgroundSession, CodingSessionStore } from "./store.js";

/**
 * Coding's part of the Home's list of background work (PG-043, S-49): the Home asks this query in every open project and shows what it
 * answers; it knows nothing about Coding. The sessions come from the recorded states Coding keeps current while a round runs, so
 * nothing here opens a runtime, calls a model or writes.
 */
export const codingHomeBackgroundTasks = defineHomeBackgroundTasksAction("coding.home.background-tasks", "Coding 后台任务", ["artifact:read"]);

/** The standing of a session whose round is under way or waiting, in the words the page has translations for. */
const STANDING: Readonly<Record<string, string>> = { running: "进行中", paused: "已暂停", "waiting-answer": "等你回答", "waiting-approval": "等你审查", "reconcile-required": "需要核对", queued: "挂起等待" };
/** The standings in which the session waits on the person, not on the model. */
const WAITING = new Set(["paused", "waiting-answer", "waiting-approval", "reconcile-required", "queued"]);

/**
 * `startedAt` is when the Home process started. A round does not survive that: one recorded as under way before then was cut off, so
 * its session is really waiting to be checked, and opening it shows what happened. Stopping and starting Coding again does not cut a
 * round: that stops only this activation's background jobs (the follower and the wake loop, PG-038, S-52) while the round stays in the
 * Home-level agent host, so an activation that started later says nothing about a round (plugin.ts takes the process's start). A queued
 * round has not started, so it was not cut off.
 */
function codingHomeBackgroundTasksOf(sessions: readonly CodingBackgroundSession[], startedAt: string): HomeBackgroundTask[] {
  return sessions.map(session => {
    const beforeRestart = session.active && !["reconcile-required", "queued"].includes(session.state) && session.updated_at < startedAt;
    const mine = session.steps?.mine ?? 0, subtasks = session.steps?.subtasks ?? 0, unowned = session.steps?.unowned ?? 0;
    // A step the person holds waits on them even after the round ended.
    const shown = beforeRestart ? "reconcile-required" : session.state;
    const holders: HomeBackgroundTaskPhrase[] = [...mine ? [{ text: "你负责 {n} 步", count: mine }] : [], ...subtasks ? [{ text: "{n} 步在子任务手上", count: subtasks }] : [],
      ...unowned ? [{ text: "没人认领 {n} 步", count: unowned }] : []];
    const ended = holders.length || session.commands?.length ? "本轮已结束" : session.state;
    return { id: session.session_id, title: session.title, state: mine ? shown === "running" ? "running" : "waiting-answer" : shown, updated_at: session.updated_at,
      waiting: !beforeRestart && (WAITING.has(session.state) || mine > 0),
      standing: [{ text: beforeRestart ? "服务重启前没有结束，打开后核对" : STANDING[session.state] ?? ended }, ...holders],
      // Stopping one is the same reviewed stop the session's own panel offers.
      commands: (session.commands ?? []).map(command => ({ task_id: command.task_id, summary: command.summary,
        stop_path: `/sessions/${encodeURIComponent(session.session_id)}/background/${encodeURIComponent(command.task_id)}/stop` })) };
  });
}

export function codingHomeBackgroundTasksHandler(context: PluginStartContext, sessions: CodingSessionStore, startedAt: string): ActionHandlerBinding {
  return bindOwnerPluginAction(context, codingHomeBackgroundTasks, (): HomeBackgroundTaskCollection => ({ source: { surface: "coding" },
    tasks: codingHomeBackgroundTasksOf(sessions.backgroundSessions(context.project_id ?? ""), startedAt) }));
}
