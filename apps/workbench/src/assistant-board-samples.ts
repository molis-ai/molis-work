import type { AssistantActivity, AssistantNotice, AssistantRecovery, AssistantRound, AssistantWork, AssistantWorkSurroundings, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import {
  BOARD_PROJECT, act, boardAnswered, boardDelegatedWorks, boardFinishedWorks, boardInterruptedWork, boardNotices, boardView, boardWork, round, type Iso,
} from "./assistant-board-works.js";
import { boardSampleText, type BoardSampleText } from "./assistant-board-text.js";

/**
 * The fixed works of the component board's Assistant frame (specs/visual-ui-experience VUX-39, VUX-08/09/13): what the Host
 * would answer at `/api/assistant` for one person, in the contract's own shapes, so the shipped island draws them as it draws
 * a real Home. Two works carry the comparison — one not about code (the Assistant, waiting on a confirmation) and one about
 * code (Coding, running) — and four lighter ones make the list a real multi-task list (waiting on an answer, failed, stopped,
 * done). Their words are the person's and the model's, so they are not translated; the Host's and the page's own labels are.
 * Simulated: nothing here was run, and the board says so.
 */
export interface AssistantBoardSamples {
  project: { id: string; title: string };
  works: AssistantWork[];
  views: Record<string, AssistantWorkView>;
  surroundings: Record<string, AssistantWorkSurroundings>;
  /** What the board's 「推进一步」 shows next for a running work: its following views, in order. */
  next: Record<string, AssistantWorkView[]>;
  /** What a work becomes once the person answers its question, or closes its interrupted round after checking it. */
  answered: Record<string, AssistantWorkView>;
  closed: Record<string, AssistantWorkView>;
  /** What an interrupted round really did, as the runtime's receipts show it. */
  recovery: Record<string, AssistantRecovery>;
  /** What the bell holds when the frame opens. */
  notices: AssistantNotice[];
}

const PLAN_REPLY = "周五上午 10:00 大家都空，我准备好了日程，等你确认后再创建 🗓️。\n\n- 时长 45 分钟，只看首次使用\n- 议程放在「试用复盘议程 v1」里\n\n通讯录没有授权给我，参加的人请你在确认时核对一下。";

/** Not about code: the Assistant planned a review and holds the calendar entry for the person's yes. */
function planWork(at: Iso): { view: AssistantWorkView; surroundings: AssistantWorkSurroundings } {
  const work = boardWork(at, "board-plan", "安排试用复盘", "waiting-review", 3, { draft: "顺便把三楼的会议室也订上" });
  const first = round(at, "run-plan-1", 48, {
    text: "帮我安排一次试用复盘，材料在附件里",
    materials: [{ material_id: "m-notes", kind: "file", title: "试用记录.md", explicit: true }, { material_id: "m-board", kind: "image", title: "图片：白板.png", explicit: true }],
    turns: [{ turn_id: "t-plan-1", kind: "assistant", text: "看过试用记录和白板照片了：12 位试用者里有 7 位卡在第一次导入。要我按这个安排复盘吗？", at: at(46), sequence: 3 }],
    activity: [act("c-p1", "read", "Feed · 读取条目", "completed", { capability_id: "feed.items.read", sequence: 1 }), act("c-p2", "lookup", "日程", "completed", { sequence: 2 })],
  });
  const latest = round(at, "run-plan-2", 6, {
    text: "就周五上午吧，叫上王一骏和产品组", phase: "awaiting-review", ended_at: null,
    materials: [{ material_id: "m-outline", kind: "object", title: "引用：首次使用记录汇总", explicit: true, object: { kind: "pages.doc", id: "doc-usage", title: "首次使用记录汇总" } }],
    context: { source: { surface: "pages", title: "Pages" }, selection: { text: "首次使用卡住最久的三处" }, captured_at: at(6) },
    activity: [
      act("c-p3", "lookup", "日程", "completed", { sequence: 1 }),
      act("c-p4", "read", "日程 · 查看空闲时间", "completed", { capability_id: "schedule.events.free", sequence: 2 }),
      act("c-p5", "read", "通讯录 · 查找联系人", "failed", { capability_id: "contacts.people.search", reason: "not-authorized", sequence: 3 }),
      act("c-p6", "read", "会议室 · 查看空闲会议室", "unknown", { capability_id: "rooms.availability.read", detail: "会议室服务没有回答", sequence: 4 }),
      act("c-p7", "suggest", "日程 · 创建日程", "completed", { capability_id: "schedule.events.create", sequence: 5 }),
    ],
    turns: [{ turn_id: "t-plan-2", kind: "assistant", text: PLAN_REPLY, at: at(4), sequence: 6 }],
    model: { model_id: "MiniMax-M2", window_tokens: 200000 },
    usage: { tokens: { input: 9200, output: 640, cached_input: 6000 }, coverage: { input: "reported", output: "reported", cached_input: "reported", cache_creation: "unknown", cost_usd: "unknown" }, context: { tokens: 41000, coverage: "reported" } },
  });
  const view = boardView(work, [first, latest], {
    reviews: [{ review_id: "rv-plan", kind: "business", run_id: "run-plan-2", summary: "日程 · 创建日程「试用复盘」", requested_at: at(4), expires_at: null,
      fields: [{ label: "时间", value: "周五 10:00–10:45" }, { label: "参加", value: "王一骏、产品组" }, { label: "地点", value: "待定" }] }],
    objects: [
      { relation: "result", subject: { kind: "artifact", id: "art-agenda" }, title: "试用复盘议程 v1", recorded_revision: "1", current_revision: "1", state: "current", recorded_at: at(5), open: { surface: "artifacts", id: "art-agenda" } },
      { relation: "result", subject: { kind: "pages.doc", id: "doc-outline" }, title: "试用复盘提纲", recorded_revision: "4", current_revision: "6", state: "changed", recorded_at: at(5), open: { surface: "pages", id: "doc-outline" } },
      { relation: "material", subject: { kind: "pages.doc", id: "doc-usage" }, title: "首次使用记录汇总", recorded_revision: "2", current_revision: "3", state: "changed", recorded_at: at(6), open: { surface: "pages", id: "doc-usage" } },
      { relation: "material", subject: { kind: "feed.item", id: "feed-week" }, title: "上周用户反馈", recorded_revision: "1", current_revision: null, state: "missing", recorded_at: at(48) },
    ],
    undoable: [
      { undo_id: "u-todo", title: "Todo · 新建待办「订会议室」", state: "available", created_at: at(5) },
      { undo_id: "u-inbox", title: "Inbox · 归档 3 条", state: "failed", created_at: at(30), detail: "Inbox 已关闭" },
    ],
    unsettled: [{ change_id: "s-feed", work_id: work.work_id, title: "Feed · 标记已读", started_at: at(47), state: "pending" }],
    jobs: [
      { job_id: "j-research", work_id: work.work_id, title: "Research · 汇总试用访谈", state: "running", started_at: at(5) },
      { job_id: "j-dataset", work_id: work.work_id, title: "Dataset · 导入试用问卷", state: "failed", started_at: at(44), ended_at: at(40) },
    ],
    usage: { tokens: 18200, rounds: 2, budget_tokens: null },
    delegated: [{ work_id: "board-sub-interviews", title: "汇总试用访谈", state: "running", follow_ups: 1 }, { work_id: "board-sub-survey", title: "整理问卷里的首次导入问题", state: "completed", follow_ups: 0 }],
  });
  const surroundings: AssistantWorkSurroundings = {
    environment: { scope: { kind: "project", project_id: BOARD_PROJECT.id, title: BOARD_PROJECT.title } },
    connections: [
      { connection_id: "cal", title: "Google Calendar", account: "yijun@example.com", state: "connected", tools: "callable" },
      { connection_id: "wecom", title: "企业微信", account: null, state: "needs-authorization", tools: "blocked" },
    ],
    tools: { executor: "assistant", callable: [{ provider: "日程", count: 4 }, { provider: "Pages", count: 6 }, { provider: "Todo", count: 3 }],
      unavailable: [{ title: "查找联系人", provider: "通讯录", reason: "未获授权" }] },
    read_at: at(1),
  };
  return { view, surroundings };
}

const CODE_STEPS = (states: Array<"pending" | "in-progress" | "done">) => ["读现有的会话读取", "兼容旧格式", "跑测试", "更新文档"].map((text, index) => ({ id: "s" + (index + 1), text, state: states[index]! }));
const CODE_ACTIVITY = [
  act("c-c1", "file-read", "auth/session.ts", "completed", { sequence: 1 }), act("c-c2", "file-read", "auth/cookie.ts", "completed", { sequence: 2 }),
  act("c-c3", "file-search", "readCookie(", "completed", { sequence: 3 }), act("c-c4", "file-change", "auth/session.ts", "completed", { sequence: 4 }),
  act("c-c5", "command", "pnpm test auth", "failed", { detail: "2 个用例失败：tests/session.test.ts", sequence: 5 }), act("c-c6", "file-change", "auth/session.ts", "completed", { sequence: 6 }),
];

/** About code: Coding carries it, in a repository with a conflict; 「推进一步」 finishes the running command, then the round. */
function codingWork(at: Iso): { views: AssistantWorkView[]; surroundings: AssistantWorkSurroundings } {
  const work = boardWork(at, "board-coding", "登录兼容旧的 session cookie", "running", 1, { executor: { kind: "plugin", plugin_id: "io.molis.work.coding", title: "Coding", session_id: "cs-auth", mode: "execute" } });
  const text = "登录要兼容旧的 session cookie，公开接口别动";
  const reply = "先读了 `auth/session.ts` 和 `auth/cookie.ts`：旧格式的 Cookie 叫 `session`，没有过期时间。改成先读 `sid`、再读旧的 `session`，过期时间按新的七天补上。";
  const step = (state: AssistantActivity["state"]) => act("c-c7", "command", "pnpm test auth", state, { sequence: 7 });
  const stage = (activity: AssistantActivity[], steps: Array<"pending" | "in-progress" | "done">, more: Partial<AssistantRound> = {}) => round(at, "run-code-1", 9, {
    executor: "plugin", text, phase: "running", ended_at: null, activity, steps: CODE_STEPS(steps), model: { model_id: "MiniMax-M2", window_tokens: 200000 },
    turns: [{ turn_id: "t-code-1", kind: "assistant", text: reply, at: at(7), sequence: 0 }], ...more,
  });
  const done = "改好了：旧 Cookie 可读，42 个用例通过，`docs/auth.md` 写了兼容说明。";
  const views = [
    boardView(work, [stage([...CODE_ACTIVITY, step("started")], ["done", "done", "in-progress", "pending"])]),
    boardView({ ...work, revision: 4 }, [stage([...CODE_ACTIVITY, step("completed"), act("c-c8", "file-change", "docs/auth.md", "started", { sequence: 8 })], ["done", "done", "done", "in-progress"])]),
    boardView({ ...work, revision: 5, state: "completed" }, [stage([...CODE_ACTIVITY, step("completed"), act("c-c8", "file-change", "docs/auth.md", "completed", { sequence: 8 })], ["done", "done", "done", "done"], {
      phase: "completed", ended_at: at(0), turns: [{ turn_id: "t-code-1", kind: "assistant", text: reply, at: at(7), sequence: 0 }, { turn_id: "t-code-2", kind: "assistant", text: done, at: at(0), sequence: 9 }] })]),
  ];
  const surroundings: AssistantWorkSurroundings = {
    environment: { scope: { kind: "project", project_id: BOARD_PROJECT.id, title: BOARD_PROJECT.title },
      executor: { workspace: { name: "molis-auth", path: "~/code/molis-auth" }, git: { repository: "molis-ai/molis-auth", branch: "feature/session-cookie", ahead: 2, behind: 0, changed: 3, conflicted: 1 } } },
    connections: [
      { connection_id: "github", title: "GitHub", account: "yijunw0212", state: "connected", tools: "callable" },
      { connection_id: "linear", title: "Linear", account: null, state: "needs-authorization", tools: "blocked" },
    ],
    tools: { executor: "plugin", callable: [{ provider: "GitHub MCP", count: 3 }], unavailable: [{ title: "create_issue", provider: "Linear MCP", reason: "服务未连接" }] },
    read_at: at(1),
  };
  return { views, surroundings };
}

/**
 * The samples as the Host would answer them `now`, their words in `text`: times are relative, so a finished work is still fresh
 * when the frame opens.
 */
export function assistantBoardSamples(now: number, text: BoardSampleText = "zh"): AssistantBoardSamples {
  const at: Iso = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();
  const plan = planWork(at), coding = codingWork(at), rest = boardFinishedWorks(at), cut = boardInterruptedWork(at);
  const others = [...rest, cut.view, ...boardDelegatedWorks(at, plan.view.work)];
  const views = [coding.views[0]!, plan.view, ...others];
  return boardSampleText({
    project: { ...BOARD_PROJECT },
    works: views.map((view) => view.work),
    views: Object.fromEntries(views.map((view) => [view.work.work_id, view])),
    surroundings: { [plan.view.work.work_id]: plan.surroundings, [coding.views[0]!.work.work_id]: coding.surroundings,
      ...Object.fromEntries(others.map((view) => [view.work.work_id, { ...plan.surroundings, connections: [], tools: { executor: "assistant" as const, callable: [], unavailable: [] } }])) },
    next: { [coding.views[0]!.work.work_id]: coding.views.slice(1) },
    answered: { [rest[0]!.work.work_id]: boardAnswered(at, rest[0]!) },
    closed: { [cut.view.work.work_id]: cut.closed },
    recovery: { [cut.view.work.work_id]: cut.recovery },
    notices: boardNotices(at),
  }, text);
}
