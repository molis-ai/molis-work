/**
 * The words of what Coding's server sends a page (route errors and notes), worded in the caller's language through
 * `codingText` and `codingError` (words.ts): a part of `CODING_MESSAGES`, which spreads it.
 */
export const CODING_SERVER_MESSAGES = {
  "coding.server.session-unreadable": { zh: "会话暂不可读", en: "The session can't be read right now" },
  "coding.server.choose-workspace": { zh: "请先为这个项目选择已授权的工作区目录", en: "Choose an authorized workspace directory for this project first" },
  "coding.server.compact-unclear": { zh: "请说明是否在下一轮整理上下文", en: "Say whether to tidy the context next turn" },
  "coding.server.compact-nothing": { zh: "这个会话还没有执行过，没有可整理的上下文", en: "This session hasn't run yet, so there's no context to tidy" },
  "coding.server.archived-edit": { zh: "会话已归档，不能再修改", en: "The session is archived and can't be changed" },
  "coding.server.materials-busy": { zh: "正在提交任务或收下交付，请稍后修改材料", en: "A task or a delivery is being taken in; change the materials shortly" },
  "coding.server.question-drafts-invalid": { zh: "待答草稿格式无效", en: "The answer drafts aren't valid" },
  "coding.server.question-drafts-long": { zh: "待答草稿超过长度限制", en: "The answer drafts are too long" },
  "coding.server.draft-invalid": { zh: "草稿格式无效或超过长度限制", en: "The draft isn't valid or is too long" },
  "coding.server.budget-range": { zh: "预算须为 1000 到 100 亿之间的 token 数", en: "The budget must be between 1,000 and 10 billion tokens" },
  "coding.server.archived-run": { zh: "会话已归档，不能再运行", en: "The session is archived and can't run" },
  "coding.server.waiting": { zh: "这个会话挂起在等待中；先取消等待，或选择现在开始", en: "This session is waiting; cancel the wait first, or start now" },
  "coding.server.wait-round-open": { zh: "这个会话还有一轮没结束，结束后再安排等待", en: "A turn of this session hasn't ended; plan the wait once it has" },
  "coding.server.wait-target-gone": { zh: "要等待的那项工作已经结束或不再重叠，可以直接开始", en: "The work to wait for has ended or no longer overlaps; you can start right away" },
  "coding.server.not-waiting": { zh: "这个会话没有在等待", en: "This session isn't waiting" },
  "coding.server.wait-choose": { zh: "请选择现在开始或取消等待", en: "Choose to start now or cancel the wait" },
  "coding.server.never-run": { zh: "这个会话尚未执行", en: "This session hasn't run yet" },
  "coding.server.run-not-found": { zh: "找不到属于这个会话的执行", en: "No run of this session was found" },
  "coding.server.round-ended": { zh: "这一轮已经结束，请开始新一轮", en: "This turn has ended; start a new one" },
  "coding.server.answered": { zh: "回答已交给原执行者，继续这一轮任务。", en: "The answer went to the one running the turn, which carries on with it." },
  "coding.server.submitting": { zh: "会话正在提交任务", en: "the session is taking in a task" },
  "coding.server.answered-next": { zh: "已回答，下一轮已开始，接着原来的任务。", en: "Answered; the next turn has started and carries on with the task." },
  "coding.server.answered-not-next": { zh: "已回答、下一轮没能开始：{reason}。回答留在排队里，点「从断点继续」再开始。", en: "Answered, but the next turn couldn't start: {reason}. The answer waits in the queue; press “Continue from where it stopped” to start again." },
  "coding.server.busy-archive": { zh: "会话正在提交任务，请稍后归档", en: "The session is taking in a task; archive it shortly" },
  "coding.server.stop-before-archive": { zh: "请先完成或停止当前执行，再归档会话", en: "Finish or stop the current run before archiving the session" },
  "coding.server.busy": { zh: "这个会话正在提交任务", en: "This session is taking in a task" },
} as const;
