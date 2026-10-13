/**
 * A parked session waits on the Host (a background command, a reply, another round); these read one wait and decide
 * what the page shows and what the next round is told. They touch no storage: the caller passes what was saved.
 */
import type { AgentWait } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

export const OPEN_WAIT = ["waiting", "fired"];

/** An "app" wait carries the round the person sent and the project work item it waits as. */
export const appData = (wait: AgentWait) => {
  const data = (wait.data ?? {}) as { app?: { body?: Record<string, unknown>; actor_id?: string } | null; work_id?: string };
  return { body: data.app?.body ?? {}, actor: data.app?.actor_id ?? LOCAL_PERSON_ACTOR_ID, work_id: data.work_id };
};
export const waitingFor = (wait: AgentWait) => wait.by === "app" ? "work" : wait.on.some(one => one.kind === "envelope") ? "reply" : "command";
/** What the page shows about a parked session; `note` is what was kept when the wait was held for the person. */
export const waitViewOf = (wait: AgentWait, note: string | undefined) => ({ wait_id: wait.wait_id, after_title: wait.waiting_on, waiting_for: waitingFor(wait), reason: wait.reason,
  at: new Date(wait.created_at_ms).toISOString(), ...(note ? { note } : {}) });
/** Whether a fired wait starts the next round on its own, or waits for the person (and why). */
export const holdReason = (wait: AgentWait): string | undefined => {
  const fired = wait.fired;
  if (!fired) return undefined;
  if (wait.by === "app" && fired.outcome === "not-done") return `${wait.waiting_on}没有完成，这一轮还在等你决定：现在开始，或取消等待。`;
  if (fired.kind === "envelope" && fired.outcome === "withdrawn") return `${wait.waiting_on}：请求已撤回或过期，这一轮还在等你决定：现在开始，或取消等待。`;
  return undefined;
};
/**
 * The round a wait wakes to: what it waited for, what happened, and the task it had been doing. `last` is the body
 * of the round that parked (saved as `last-start:<session>`); `person` means the person chose to go on without it.
 */
export const wakeBodyOf = (wait: AgentWait, last: Record<string, unknown>, person = false) => {
  if (wait.by === "app") { const { body, work_id } = appData(wait); return { ...body, ...(work_id ? { queued_work_id: work_id } : {}) }; }
  const { actor_id: _actor, origin_task, ...how } = last;
  const fired = wait.fired;
  const what = person ? `你决定不再等${wait.waiting_on}，直接接着做。`
    : !fired ? ""
    : fired.outcome === "answered" ? `它的答复：${fired.text}`
    : fired.outcome === "settled" ? `${wait.waiting_on.replace(/的答复$/, "")}那一轮已经结束，没有专门答复；它可能已经做了你请求的事，先读一下相关文件确认。`
    : fired.outcome === "failed" && fired.kind === "envelope" ? `${wait.waiting_on}不会来了：${fired.text}。先读一下相关文件，确认对方做到了哪里，再决定自己接着做，还是改做别的。`
    : fired.outcome === "interrupted" ? `你等的${fired.kind === "command" ? "后台命令" : "那件事"}被服务重启打断了，结果未知，不要当成成功；需要的话重新运行。\n${fired.text}`
    : fired.outcome === "output" ? `你等的后台命令输出了你在等的内容（命令还在运行）。\n${fired.text}`
    : `${fired.kind === "command" ? "后台命令" : ""}结束了（${({ succeeded: "成功", failed: "失败", stopped: "被停止" } as Record<string, string>)[fired.outcome] ?? fired.outcome}），结束于 ${new Date(fired.at_ms).toISOString()}（宿主记录的时间）。\n${fired.text}`;
  // The original task travels on, so a round woken again still knows what it was for.
  return { ...how, ...(typeof origin_task === "string" ? { origin_task } : {}), task: [`（接着之前的任务）你之前挂起等待：${wait.reason.slice(0, 400)}`, what,
    `请接着完成原来的任务：${typeof origin_task === "string" ? origin_task : ""}`].filter(Boolean).join("\n") };
};
