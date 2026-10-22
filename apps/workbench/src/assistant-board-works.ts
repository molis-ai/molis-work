import type { AssistantActivity, AssistantRound, AssistantWork, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";

/**
 * The shapes the component board's Assistant samples are built from (assistant-board-samples.ts), and its four lighter works:
 * waiting on an answer, failed, stopped and done, so the list and the tabs show every state a work can be in beside the two
 * carried ones. Fixed sample content, in the contract's shapes (specs/visual-ui-experience VUX-39).
 */
export const BOARD_PROJECT = { id: "board-sample", title: "示例项目" } as const;
const SCOPE = { kind: "project", project_id: BOARD_PROJECT.id } as const;
/** An ISO time `minutesAgo` before the moment the samples are made. */
export type Iso = (minutesAgo: number) => string;

export const act = (call_id: string, verb: string, target: string, state: AssistantActivity["state"], more: Partial<AssistantActivity> = {}): AssistantActivity =>
  ({ call_id, verb, target, state, ...more });
export const round = (at: Iso, run_id: string, minutesAgo: number, more: Partial<AssistantRound>): AssistantRound => ({
  run_id, text: "", materials: [], context: null, started_at: at(minutesAgo), phase: "completed", turns: [], activity: [], awaiting_input: [], ended_at: at(minutesAgo - 2), ...more,
});
export const boardWork = (at: Iso, work_id: string, title: string, state: AssistantWork["state"], minutesAgo: number, more: Partial<AssistantWork> = {}): AssistantWork => ({
  work_id, executor: { kind: "assistant" }, revision: 3, title, scope: SCOPE, scope_title: BOARD_PROJECT.title, origin: { surface: "home", title: "项目首页" },
  state, session_id: "session-" + work_id, draft: "", created_at: at(minutesAgo + 60), updated_at: at(minutesAgo), archived: false, ...more,
});
export const boardView = (work: AssistantWork, rounds: AssistantRound[], more: Partial<AssistantWorkView> = {}): AssistantWorkView =>
  ({ work, rounds, reviews: [], cards: [], objects: [], ...more });
const said = (at: Iso, id: string, minutesAgo: number, text: string, sequence = 2) => ({ turn_id: id, kind: "assistant" as const, text, at: at(minutesAgo), sequence });

export function boardFinishedWorks(at: Iso): AssistantWorkView[] {
  const asking = boardView(boardWork(at, "board-reply", "给王一骏回邮件", "waiting-input", 2), [round(at, "run-reply-1", 4, {
    text: "帮我回王一骏关于试用时间的邮件", phase: "awaiting-input", ended_at: null,
    activity: [act("c-r1", "read", "Mail · 读取邮件", "completed", { capability_id: "mail.messages.read", sequence: 1 }), act("c-r2", "ask", "回复用中文还是英文？", "started", { sequence: 3 })],
    turns: [said(at, "t-reply-1", 3, "邮件读过了，他问能不能把试用延到下周三。")],
    awaiting_input: [{ pending_id: "q-lang", pending_revision: 1, sequence: 3, kind: "clarification", prompt: "回复用中文还是英文？", options: [{ value: "zh", label: "中文" }, { value: "en", label: "英文" }], allows_free_text: true, answerable: true }],
  })]);
  const failed = boardView(boardWork(at, "board-digest", "整理上周的 Feed 摘要", "failed", 25, { scope: { kind: "personal" }, scope_title: undefined }), [round(at, "run-digest-1", 30, {
    text: "把上周 Feed 里和试用有关的整理成摘要", phase: "failed", stop_reason: "模型服务暂时不可用",
    activity: [act("c-d1", "read", "Feed · 读取条目", "completed", { capability_id: "feed.items.read", sequence: 1 }), act("c-d2", "read", "Feed · 读取全文", "failed", { capability_id: "feed.items.content", detail: "来源返回 503", sequence: 2 })],
  })]);
  const stopped = boardView(boardWork(at, "board-deps", "检查依赖更新", "stopped", 70), [round(at, "run-deps-1", 75, {
    text: "看看哪些依赖可以升级", phase: "stopped", stop_reason: "你停止了这一轮",
    activity: [act("c-s1", "lookup", "依赖", "completed", { sequence: 1 }), act("c-s2", "read", "Packages · 列出过期依赖", "failed", { reason: "interrupted", sequence: 2 })],
  })]);
  const done = boardView(boardWork(at, "board-weekly", "写本周周报", "completed", 12), [round(at, "run-weekly-1", 20, {
    text: "按本周完成的待办写一份周报",
    activity: [act("c-w1", "read", "Todo · 列出本周完成", "completed", { capability_id: "todo.items.list", sequence: 1 }), act("c-w2", "change", "Pages · 新建文档", "completed", { capability_id: "pages.docs.create", sequence: 2 })],
    turns: [said(at, "t-weekly-1", 13, "周报写在「本周周报」里了：完成 9 项，2 项顺延到下周。", 3)],
  })], { objects: [{ relation: "result", subject: { kind: "pages.doc", id: "doc-weekly" }, title: "本周周报", recorded_revision: "1", current_revision: "1", state: "current", recorded_at: at(13), open: { surface: "pages", id: "doc-weekly" } }] });
  return [asking, failed, stopped, done];
}
