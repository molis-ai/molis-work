import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindOwnerPluginAction, defineBackgroundTasksAction, type ActionHandlerBinding, type BackgroundTask, type BackgroundTaskCollection, type BackgroundTaskPhrase } from "@molis-ai/molis-work-plugin-sdk";
import type { StateRingState } from "@molis-ai/molis-work-plugin-sdk/ui";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { CodingBackgroundSession, CodingSessionStore } from "./store.js";

/**
 * Coding's part of the table of background tasks (PG-043, S-49, specs/work-line §6): the Host asks this query in every open
 * project and shows what it answers; it knows nothing about Coding. The sessions come from the recorded states Coding keeps
 * current while a round runs, so nothing here opens a runtime, calls a model or writes. A session is the event its rounds are
 * done for, so each row serves its own session.
 */
export const codingBackgroundTasks = defineBackgroundTasksAction("coding.background.tasks", /* @version action.coding.background.tasks */ 1, ["coding_session"], "Coding 后台任务", ["artifact:read"]);

/** The standing of a session whose round is under way or waiting, in the words the page has translations for. */
export const CODING_STANDING: Readonly<Record<string, string>> = { running: "coding.home-background.in-progress", paused: "coding.home-background.paused", "waiting-answer": "coding.home-background.waiting-for-your-answer", "waiting-approval": "coding.home-background.waiting-for-your-review", "reconcile-required": "coding.home-background.needs-checking", queued: "coding.home-background.queued" };
/** The standings in which the session waits on the person, not on the model. */
const WAITING = new Set(["paused", "waiting-answer", "waiting-approval", "reconcile-required", "queued"]);
/** The state ring's value for each standing; a round that ended with steps still held shows as ended. */
export const CODING_RING: Readonly<Record<string, StateRingState>> = { running: "running", paused: "paused", "waiting-answer": "answer", "waiting-approval": "approval", "reconcile-required": "verify", queued: "queued" };

/**
 * `startedAt` is when the Home process started. A round does not survive that: one recorded as under way before then was cut off, so
 * its session is really waiting to be checked, and opening it shows what happened. Stopping and starting Coding again does not cut a
 * round: that stops only this activation's background jobs (the follower and the wake loop, PG-038, S-52) while the round stays in the
 * Home-level agent host, so an activation that started later says nothing about a round (plugin.ts takes the process's start). A queued
 * round has not started, so it was not cut off.
 */
function codingBackgroundTasksOf(sessions: readonly CodingBackgroundSession[], startedAt: string, reviewIds: ReadonlyMap<string, string[]>): BackgroundTask[] {
  return sessions.map(session => {
    const beforeRestart = session.active && !["reconcile-required", "queued"].includes(session.state) && session.updated_at < startedAt;
    const mine = session.steps?.mine ?? 0, subtasks = session.steps?.subtasks ?? 0, unowned = session.steps?.unowned ?? 0;
    // A step the person holds waits on them even after the round ended.
    const shown = beforeRestart ? "reconcile-required" : session.state;
    const holders: BackgroundTaskPhrase[] = [...mine ? [{ text: uiText.text("coding.home-background.n-steps-with-you", { n: mine }) }] : [], ...subtasks ? [{ text: uiText.text("coding.home-background.n-steps-with-subtasks", { n: subtasks }) }] : [],
      ...unowned ? [{ text: uiText.text("coding.home-background.n-unclaimed-steps", { n: unowned }) }] : []];
    const ended = holders.length || session.commands?.length ? uiText.text("coding.home-background.the-round-ended") : session.state;
    const subject = { kind: "coding_session", id: session.session_id };
    const agentSession = shown === "waiting-approval" ? session.runtime_session_id : undefined;
    const ids = agentSession ? reviewIds.get(agentSession) : undefined;
    return { subject, title: session.title, state: mine && shown !== "running" ? "answer" : CODING_RING[shown] ?? "round-ended", updated_at: session.updated_at,
      waiting: !beforeRestart && (WAITING.has(session.state) || mine > 0),
      step: { text: beforeRestart ? uiText.text("coding.home-background.this-did-not-finish-before-the-service") : CODING_STANDING[session.state] ? uiText.text(CODING_STANDING[session.state]!) : ended }, details: holders,
      executor: { kind: "plugin", label: "Coding" }, serves: [subject], scope: "project",
      // Stopping one is the same reviewed stop the session's own panel offers, as Coding's own action.
      commands: (session.commands ?? []).map(command => ({ role: "stop", action: { capability_id: "coding.background.stop", version: /* @version action.coding.background.stop */ 1 },
        input: { session_id: session.session_id, task_id: command.task_id }, summary: command.summary })),
      decisions: [],
      ...(agentSession && ids?.length ? { held_reviews: { session_id: agentSession, ids } } : {}),
      open: { kind: "item", surface: "coding", id: session.session_id, title: session.title || uiText.text("coding.home-background.open-session"), label: uiText.text("coding.home-background.open-session") } };
  });
}

export function codingBackgroundTasksHandler(context: PluginStartContext, sessions: CodingSessionStore, startedAt: string): ActionHandlerBinding {
  return bindOwnerPluginAction(context, codingBackgroundTasks, async (): Promise<BackgroundTaskCollection> => {
    const rows = sessions.backgroundSessions(context.project_id ?? "");
    const waiting = rows.flatMap(row => row.state === "waiting-approval" && row.updated_at >= startedAt && row.runtime_session_id ? [row.runtime_session_id] : []);
    const actions = context.services?.actions;
    const reviews = waiting.length && actions
      ? await actions.invoke(agentHostCapabilities.listPendingReviewIds, [waiting]).catch(() => [])
      : [];
    return { source: { surface: "coding", title: "Coding", icon: "code" },
      tasks: codingBackgroundTasksOf(rows, startedAt, new Map(reviews.map(row => [row.session_id, row.ids]))) };
  });
}
