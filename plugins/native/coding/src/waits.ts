/**
 * A session's step waits on the Host's task graph (a background command, a reply, another session's round); these read
 * one session's wait and decide what the page shows and what the next round is told. They touch no storage: the caller
 * passes what was saved.
 */
import type { AgentCollaborationSessionView, AgentCollaborationWait } from "@molis-ai/molis-work-contracts/services/agent-collaboration";
import { tryUiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { codingFailure } from "./words.js";

/** A session view with its wait. */
export type CodingWaitView = AgentCollaborationSessionView & { wait: AgentCollaborationWait };

const waitWord = (key: string, fallback: string, values?: Record<string, string | number>) => tryUiText(key, values) ?? fallback;

/** The wait still holds the session: it is going on, or it is over and its continuation was not taken up yet. */
export const openWait = (view: AgentCollaborationSessionView | undefined): CodingWaitView | undefined => {
  if (!view?.wait) return undefined;
  const going = view.continuation && ["armed", "eligible", "claimed", "blocked", "needs-reconciliation"].includes(view.continuation.state);
  return view.wait.state === "waiting" || going ? view as CodingWaitView : undefined;
};
/** Whether a wait that is over waits for the person rather than starting on its own. */
export const isHeldWait = (view: CodingWaitView): boolean => {
  const continuation = view.continuation;
  return continuation?.state === "blocked" || continuation?.state === "needs-reconciliation" || Boolean(continuation?.state === "eligible" && !continuation.auto);
};
/** What it waits on, for a person, in the active UI language. */
const waitingOnUi = (wait: AgentCollaborationWait) => wait.conditions.map(one => one.label)
  .join(wait.mode === "any" ? waitWord("coding.wait.join-any", "，或") : waitWord("coding.wait.join-all", "，以及"));
/** What it waits on, in model-facing continuation prompts. */
const waitingOn = (wait: AgentCollaborationWait) => wait.conditions.map(one => one.label).join(wait.mode === "any" ? "，或" : "，以及");
export const waitingFor = (wait: AgentCollaborationWait) => wait.by === "app" ? "work" : wait.conditions.some(one => one.kind === "envelope") ? "reply" : "command";
/** What the page shows about a waiting session; `note` is what was kept when the wait was held for the person. */
export const waitViewOf = (view: CodingWaitView, note: string | undefined) => ({ wait_id: view.wait.wait_id, after_title: waitingOnUi(view.wait), waiting_for: waitingFor(view.wait),
  reason: view.wait.reason, at: view.wait.created_at, ...(note ? { note } : {}) });
/** Whether a wait that is over starts the next round on its own, or waits for the person (and why). */
export const holdReason = (view: CodingWaitView): string | undefined => {
  const continuation = view.continuation, on = waitingOnUi(view.wait);
  if (continuation?.state === "blocked") {
    return view.wait.state === "expired"
      ? waitWord("coding.wait.hold-expired", `${on}等到期限也没有结果，这一轮还在等你决定：现在开始，或取消等待。`, { on })
      : waitWord("coding.wait.hold-failed", `${on}没有完成，这一轮还在等你决定：现在开始，或取消等待。`, { on });
  }
  if (continuation?.state === "needs-reconciliation") {
    return waitWord("coding.wait.hold-reconcile", `${on}：服务重启后结果需要核对，这一轮还在等你决定：现在开始，或取消等待。`, { on });
  }
  if (continuation?.state === "eligible" && !continuation.auto) {
    return waitWord("coding.wait.hold-manual", `${on}已经有结果，这一轮等你决定：现在开始，或取消等待。`, { on });
  }
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
  if (view.wait.by === "app") {
    if (!queued) throw codingFailure("coding.server.queued-round-missing");
    return { ...queued.body, queued_work_id: queued.work_id };
  }
  const what = person ? `你决定不再等${waitingOn(view.wait)}，直接接着做。`
    : view.wait.conditions.map(one => `${one.label}${SEEN[one.last.status]}${one.last.note ? `（${one.last.note}）` : ""}。`).join("\n");
  return continuedBody(last, [`你之前在等：${view.wait.reason.slice(0, 400)}`, what].filter(Boolean).join("\n"));
};
/**
 * The next round of a round that stopped on something (a wait, a question asked before a restart): started the way `last`
 * was, told where things stand (`said`). The original task travels on, so a round woken again still knows what it was for.
 */
export const continuedBody = (last: Record<string, unknown>, said: string) => {
  const { actor_id: _actor, origin_task, ...how } = last;
  return { ...how, ...(typeof origin_task === "string" ? { origin_task } : {}), task: `（接着之前的任务）${said}\n请接着完成原来的任务：${typeof origin_task === "string" ? origin_task : ""}` };
};
