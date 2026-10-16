/**
 * A session's step waits on the Host's task graph (a background command, a reply, another session's round); these read
 * one session's wait and decide what the page shows and what the next round is told. They touch no storage: the caller
 * passes what was saved.
 */
import type { AgentCollaborationSessionView, AgentCollaborationWait } from "@molis-ai/molis-work-contracts/services/agent-collaboration";

/** A session view with its wait. */
export type CodingWaitView = AgentCollaborationSessionView & { wait: AgentCollaborationWait };

/** The wait still holds the session: it is going on, or it is over and its continuation was not taken up yet. */
export const openWait = (view: AgentCollaborationSessionView | undefined): CodingWaitView | undefined => {
  if (!view?.wait) return undefined;
  const going = view.continuation && ["armed", "eligible", "claimed", "blocked", "needs-reconciliation"].includes(view.continuation.state);
  return view.wait.state === "waiting" || going ? view as CodingWaitView : undefined;
};
/** What it waits on, for a person: "会话「A」的答复", "后台命令 npm test", "「A」那一步". */
export const waitingOn = (wait: AgentCollaborationWait) => wait.conditions.map(one => one.label).join(wait.mode === "any" ? "，或" : "，以及");
export const waitingFor = (wait: AgentCollaborationWait) => wait.by === "app" ? "work" : wait.conditions.some(one => one.kind === "envelope") ? "reply" : "command";
/** What the page shows about a waiting session; `note` is what was kept when the wait was held for the person. */
export const waitViewOf = (view: CodingWaitView, note: string | undefined) => ({ wait_id: view.wait.wait_id, after_title: waitingOn(view.wait), waiting_for: waitingFor(view.wait),
  reason: view.wait.reason, at: view.wait.created_at, ...(note ? { note } : {}) });
/** Whether a wait that is over starts the next round on its own, or waits for the person (and why). */
export const holdReason = (view: CodingWaitView): string | undefined => {
  const continuation = view.continuation, on = waitingOn(view.wait);
  if (continuation?.state === "blocked") return `${on}${view.wait.state === "expired" ? "等到期限也没有结果" : "没有完成"}，这一轮还在等你决定：现在开始，或取消等待。`;
  if (continuation?.state === "needs-reconciliation") return `${on}：服务重启后结果需要核对，这一轮还在等你决定：现在开始，或取消等待。`;
  if (continuation?.state === "eligible" && !continuation.auto) return `${on}已经有结果，这一轮等你决定：现在开始，或取消等待。`;
  return undefined;
};
const SEEN: Record<AgentCollaborationWait["conditions"][number]["last"]["status"], string> = { pending: "还没有结果", satisfied: "已经有了结果", failed: "失败了", unknown: "结果未知，不要当成成功" };
/**
 * The round a wait goes on to: what it waited for, how each thing stands, and the task it had been doing. What the wait
 * brought (a reply, a command's output) is put into the session's next turn by the Runtime; this only says where things
 * stand. `last` is the body of the round that waited (saved as `last-start:<session>`); `queued` is the round the person
 * queued behind another; `person` means the person chose to go on without it.
 */
export const wakeBodyOf = (view: CodingWaitView, last: Record<string, unknown>, person = false, queued?: { body: Record<string, unknown>; work_id: string }) => {
  if (view.wait.by === "app" && queued) return { ...queued.body, queued_work_id: queued.work_id };
  const { actor_id: _actor, origin_task, ...how } = last;
  const what = person ? `你决定不再等${waitingOn(view.wait)}，直接接着做。`
    : view.wait.conditions.map(one => `${one.label}${SEEN[one.last.status]}${one.last.note ? `（${one.last.note}）` : ""}。`).join("\n");
  // The original task travels on, so a round woken again still knows what it was for.
  return { ...how, ...(typeof origin_task === "string" ? { origin_task } : {}), task: [`（接着之前的任务）你之前在等：${view.wait.reason.slice(0, 400)}`, what,
    `请接着完成原来的任务：${typeof origin_task === "string" ? origin_task : ""}`].filter(Boolean).join("\n") };
};
