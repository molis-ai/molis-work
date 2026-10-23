import type { AssistantActivity, AssistantNotice, AssistantRecovery, AssistantRound, AssistantWork, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentPendingQuestion } from "@molis-ai/molis-work-contracts/services/agent-interaction";

/**
 * The shapes the component board's Assistant samples are built from (assistant-board-samples.ts), and its four lighter works:
 * waiting on an answer, failed, stopped and done, so the list and the tabs show every state a work can be in beside the two
 * carried ones; a work whose round was cut off and has to be checked, the sub-tasks the plan handed on, and the notices the
 * bell shows. Fixed sample content, in the contract's shapes (specs/visual-ui-experience VUX-39).
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

/**
 * The question 「给王一骏回邮件」 waits on: a questionnaire with one choice (a recommended option and room for another), a
 * choice of several (with another) and words that may stay empty, so the board shows each way a card is answered.
 */
export const BOARD_QUESTION: AgentPendingQuestion = {
  pending_id: "q-reply", pending_revision: 1, sequence: 3, kind: "clarification", prompt: "回信之前想跟你确认三件事", options: [], allows_free_text: false, answerable: true,
  questions: [
    { index: 1, prompt: "回复用哪种语言？", type: "choice", required: true, multiple: false, allow_other: true,
      options: [{ index: 1, label: "中文", recommended: true, description: "他上一封是中文写的" }, { index: 2, label: "英文" }] },
    { index: 2, prompt: "回信里写上哪些安排？", type: "choice", required: true, multiple: true, allow_other: true, help: "可以多选；没列出的写在「其他」里。",
      options: [{ index: 1, label: "同意延到下周三" }, { index: 2, label: "时间沿用上午 10:00" }, { index: 3, label: "附上试用复盘议程" }] },
    { index: 3, prompt: "还有想补充的话吗？", type: "text", required: false, multiple: false, allow_other: false, options: [], multiline: true },
  ],
};

export function boardFinishedWorks(at: Iso): AssistantWorkView[] {
  const asking = boardView(boardWork(at, "board-reply", "给王一骏回邮件", "waiting-input", 2), [round(at, "run-reply-1", 4, {
    text: "帮我回王一骏关于试用时间的邮件", phase: "awaiting-input", ended_at: null,
    activity: [act("c-r1", "read", "Mail · 读取邮件", "completed", { capability_id: "mail.messages.read", sequence: 1 }), act("c-r2", "ask", "回信之前想跟你确认三件事", "started", { sequence: 3 })],
    turns: [said(at, "t-reply-1", 3, "邮件读过了，他问能不能把试用延到下周三。")],
    awaiting_input: [BOARD_QUESTION],
    model: { model_id: "MiniMax-M2", window_tokens: 200000 },
  })]);
  const failed = boardView(boardWork(at, "board-digest", "整理上周的 Feed 摘要", "failed", 25, { scope: { kind: "personal" }, scope_title: undefined }), [round(at, "run-digest-1", 30, {
    text: "把上周 Feed 里和试用有关的整理成摘要", phase: "failed", stop_reason: "模型服务暂时不可用", model: { model_id: "MiniMax-M2" },
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

/** What 「给王一骏回邮件」 becomes once its question is answered: the round goes on and ends with the draft. */
export function boardAnswered(at: Iso, asking: AssistantWorkView): AssistantWorkView {
  const [latest] = asking.rounds;
  return boardView({ ...asking.work, revision: asking.work.revision + 1, state: "completed", updated_at: at(0) }, [{ ...latest!, phase: "completed", ended_at: at(0), awaiting_input: [],
    activity: [...latest!.activity.map((one) => one.verb === "ask" ? { ...one, state: "completed" as const } : one), act("c-r3", "suggest", "Mail · 写回复草稿", "completed", { capability_id: "mail.drafts.create", sequence: 4 })],
    turns: [...latest!.turns, said(at, "t-reply-2", 0, "回复草稿写好了，放在 Mail 的草稿箱里：同意延到下周三，时间沿用上午 10:00。", 5)] }]);
}

/** Two sub-tasks the plan handed to works of their own: one still running (its model call rate-limited, the runtime waiting ten minutes to retry), one done. */
export function boardDelegatedWorks(at: Iso, parent: AssistantWork): AssistantWorkView[] {
  const by = { work_id: parent.work_id, title: parent.title, acceptance: "列出首次导入卡住最久的三处，每处带一句试用者的原话" };
  const running = boardView(boardWork(at, "board-sub-interviews", "汇总试用访谈", "running", 3, { delegated_by: by }), [round(at, "run-sub-1", 5, {
    text: by.acceptance, written_by: "host", phase: "running", ended_at: null, retry_wait: { until: at(-10), reason: "rate-limited", attempt: 1 },
    activity: [act("c-i1", "read", "Research · 读取访谈记录", "completed", { capability_id: "research.notes.read", sequence: 1 }), act("c-i2", "read", "Research · 读取访谈录音转写", "started", { sequence: 2 })],
  })]);
  const done = boardView(boardWork(at, "board-sub-survey", "整理问卷里的首次导入问题", "completed", 8, { delegated_by: by }), [round(at, "run-sub-2", 12, {
    text: by.acceptance, written_by: "host",
    activity: [act("c-v1", "read", "Dataset · 读取问卷", "completed", { capability_id: "dataset.rows.read", sequence: 1 })],
    turns: [said(at, "t-sub-2", 9, "问卷里 31 份提到首次导入，最多的是「不知道从哪开始」（14 份）。", 2)],
  })]);
  return [running, done];
}

/** A work whose round was cut off (the window closed while it ran): what really happened has to be checked before it ends. */
export function boardInterruptedWork(at: Iso): { view: AssistantWorkView; recovery: AssistantRecovery; closed: AssistantWorkView } {
  const work = boardWork(at, "board-sync", "把复盘结论同步给产品组", "needs-check", 40);
  const cut = round(at, "run-sync-1", 42, {
    text: "把复盘结论发给产品组，再建一个跟进待办", phase: "unknown", ended_at: null,
    activity: [act("c-y1", "change", "Todo · 新建待办「复盘跟进」", "completed", { capability_id: "todo.items.create", sequence: 1 }),
      act("c-y2", "change", "Mail · 发送邮件给产品组", "unknown", { capability_id: "mail.messages.send", sequence: 2 })],
  });
  const view = boardView(work, [cut], { problem: { message: "上一轮在窗口关闭时中断了，有的步骤不知道做没做成。" } });
  const recovery: AssistantRecovery = { blockers: [], rounds: [{ run_id: cut.run_id, version: 1, can_close: true, blockers: [], operations: [
    { summary: "Todo · 新建待办「复盘跟进」", outcome: "completed" }, { summary: "Mail · 发送邮件给产品组", outcome: "unknown" },
    { summary: "日程 · 修改「试用复盘」", outcome: "failed" }, { summary: "Pages · 更新「试用复盘提纲」", outcome: "not-dispatched" }] }] };
  const closed = boardView({ ...work, revision: work.revision + 1, state: "stopped", updated_at: at(0) }, [{ ...cut, phase: "stopped", stop_reason: "你核对后结束了这一轮", ended_at: at(0) }]);
  return { view, recovery, closed };
}

/** What the bell holds: a decision and a failure first, a reminder that came due, news folded below, one held by a rule. */
export function boardNotices(at: Iso): AssistantNotice[] {
  const notice = (notice_id: string, kind: AssistantNotice["kind"], work_id: string, work_title: string, text: string, minutesAgo: number, more: Partial<AssistantNotice> = {}): AssistantNotice =>
    ({ notice_id, kind, work_id, work_title, text, created_at: at(minutesAgo), ...more });
  return [
    notice("n-plan", "needs-decision", "board-plan", "安排试用复盘", "「安排试用复盘」等你确认创建日程", 4),
    notice("n-digest", "failed", "board-digest", "整理上周的 Feed 摘要", "「整理上周的 Feed 摘要」没有完成：模型服务暂时不可用", 25),
    notice("n-room", "reminder", "", "Todo", "到时间了：订会议室", 1, { open: { surface: "todo", id: "todo-room", title: "订会议室", project_id: BOARD_PROJECT.id } }),
    notice("n-weekly", "completed", "board-weekly", "写本周周报", "「写本周周报」完成了", 12),
    notice("n-review", "material", "board-coding", "登录兼容旧的 session cookie", "GitHub 上有 1 条和「登录兼容旧的 session cookie」有关的新评论", 9, { held: { rule_id: "rule-focus", reason: "专注到 17:00" } }),
  ];
}
