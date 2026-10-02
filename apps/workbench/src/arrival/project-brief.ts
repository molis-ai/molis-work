import {
  renderBrief,
  renderBriefFocus,
  renderBriefRecent,
  renderBriefSection,
  renderBriefStatus,
  renderButton,
  renderDirectoryRow,
  renderEmpty,
  renderGoalTrack,
  renderSkeleton,
  type MolisWorkIcon,
  type MwGoalTrackState,
} from "@molis-ai/molis-work-design-system";

/**
 * The project brief: what a project is, in one reading, for the chooser's right-hand sheet. Read through the same public
 * readers Home uses (the Goals directory, the Home events), so a number here is the number there. What no reader gives
 * is not shown: the brief never fills a gap with a guess.
 */

/** A goal as the Goals directory lists it. */
export interface BriefGoal {
  goal_id: string;
  title: string;
  work_status: "open" | "completed" | "cancelled";
  next_hint: string;
  pending_decision_count: number;
  updated_at: string;
}

/** A thing Home would show, from whichever plugin offers it. */
export interface BriefEvent {
  event_id: string;
  title: string;
  summary: string;
  occurred_at: string;
  placement: "occurred" | "active" | "today";
  needs_attention: boolean;
  /** Where opening it goes: a plugin's page, or one item on it. */
  open: { surface: string; id: string | null; title: string } | null;
  source_title: string;
}

export interface ProjectBriefInput {
  project_id: string;
  name: string;
  personal: boolean;
  demo: boolean;
  /** When the person last opened it from this Home. */
  opened_at: string | null;
  description: string | null;
  /** Null when the Goals directory could not be read (distinct from a project with no goals). */
  goals: readonly BriefGoal[] | null;
  /** Null when Home's events could not be read. */
  events: readonly BriefEvent[] | null;
  /** One line on where the goal in play stands (its recorded progress, or why it exists), read for that goal alone. */
  current_detail?: string | null;
  workspace_path: string | null;
  now: string;
}

export interface BriefTrackGoal { title: string; state: MwGoalTrackState }
export interface BriefNextItem { title: string; caption: string; attention: boolean; open: BriefEvent["open"] }
export interface BriefRecentItem { at: string; title: string }

/** What the brief says, decided. The chooser's rows read the summary; the sheet renders the rest. */
export interface ProjectBriefModel extends Omit<ProjectBriefInput, "goals" | "events"> {
  goals: null | { total: number; done: number; current: BriefGoal | null; track: BriefTrackGoal[] };
  next: BriefNextItem[];
  recent: BriefRecentItem[];
  issues: string[];
}

/** The part of the brief a directory row shows: how far along, what is current, what waits on the person. */
export interface ProjectBriefSummary {
  project_id: string;
  goals_done: number | null;
  goals_total: number | null;
  current: string | null;
  waiting: number;
  opened_at: string | null;
}

/** The goal being worked: of the open ones, the one touched last. The same rule decides what the brief reads further about. */
export function currentBriefGoal(goals: readonly BriefGoal[]): BriefGoal | null {
  return goals.filter(goal => goal.work_status === "open").sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

const TRACK_LIMIT = 12;
const NEXT_LIMIT = 3;
const RECENT_LIMIT = 3;

/** Decide what the brief says from what the readers returned. Pure. */
export function composeProjectBrief(input: ProjectBriefInput): ProjectBriefModel {
  const issues: string[] = [];
  let goals: ProjectBriefModel["goals"] = null;
  if (input.goals) {
    const live = input.goals.filter(goal => goal.work_status !== "cancelled");
    const done = live.filter(goal => goal.work_status === "completed").sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    const open = live.filter(goal => goal.work_status === "open").sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const current = open[0] ?? null;
    const track: BriefTrackGoal[] = [
      ...done.map(goal => ({ title: goal.title, state: "done" as const })),
      ...open.map((goal, index) => ({ title: goal.title, state: index === 0 ? "doing" as const : "todo" as const })),
    ];
    // A long history keeps its newest finished goals beside the open ones; the count still says how many in all.
    let shown = track;
    if (track.length > TRACK_LIMIT) {
      const keepOpen = Math.min(open.length, TRACK_LIMIT);
      shown = [...track.slice(Math.max(0, done.length - (TRACK_LIMIT - keepOpen)), done.length), ...track.slice(done.length, done.length + keepOpen)];
    }
    goals = { total: live.length, done: done.length, current, track: shown };
  } else issues.push("goals");
  const events = input.events ?? [];
  if (!input.events) issues.push("events");
  const byNewest = (a: BriefEvent, b: BriefEvent) => b.occurred_at.localeCompare(a.occurred_at);
  // What is ahead, or waiting on the person, first; then what just happened.
  const ahead = events.filter(event => event.placement !== "occurred" || event.needs_attention)
    .sort((a, b) => Number(b.needs_attention) - Number(a.needs_attention) || byNewest(a, b)).slice(0, NEXT_LIMIT);
  const aheadIds = new Set(ahead.map(event => event.event_id));
  const next = ahead.map(event => ({ title: event.title, caption: event.summary || event.source_title, attention: event.needs_attention, open: event.open }));
  const recent = events.filter(event => !aheadIds.has(event.event_id) && event.placement === "occurred").sort(byNewest).slice(0, RECENT_LIMIT)
    .map(event => ({ at: event.occurred_at, title: event.title }));
  return { ...input, goals, next, recent, issues };
}

/** What a directory row reads from the brief. When goals are unreadable the counts stay null rather than zero. */
export function summarizeProjectBrief(model: ProjectBriefModel, events: readonly BriefEvent[] | null, goals: readonly BriefGoal[] | null): ProjectBriefSummary {
  const waiting = events ? events.filter(event => event.needs_attention).length : (goals ?? []).filter(goal => goal.work_status === "open").reduce((sum, goal) => sum + goal.pending_decision_count, 0);
  return { project_id: model.project_id, goals_done: model.goals?.done ?? null, goals_total: model.goals?.total ?? null, current: model.goals?.current?.title ?? null, waiting, opened_at: model.opened_at };
}

export interface ProjectBriefPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  dateTimeLocale(): string;
}

/** The brief's two reading aids that depend on the clock: how long ago, and which day. */
export function createBriefTime(primitives: Pick<ProjectBriefPrimitives, "L" | "dateTimeLocale">, nowIso: string) {
  const { L, dateTimeLocale } = primitives;
  const now = new Date(nowIso);
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return {
    /** “2 小时前”, or the date once it is more than a week ago. */
    ago(iso: string | null): string {
      const at = iso ? new Date(iso) : null;
      if (!at || !Number.isFinite(at.getTime())) return "";
      const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
      if (minutes < 1) return L("刚刚");
      if (minutes < 60) return L("{n} 分钟前", { n: minutes });
      if (minutes < 60 * 24 && dayKey(at) === dayKey(now)) return L("{n} 小时前", { n: Math.round(minutes / 60) });
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      if (dayKey(at) === dayKey(yesterday)) return L("昨天");
      if (minutes < 60 * 24 * 7) return L("{n} 天前", { n: Math.round(minutes / (60 * 24)) });
      return new Intl.DateTimeFormat(dateTimeLocale(), { month: "numeric", day: "numeric" }).format(at);
    },
    /** “昨天 22:14” or “9月29日”. */
    when(iso: string): string {
      const at = new Date(iso);
      if (!Number.isFinite(at.getTime())) return "";
      const clock = new Intl.DateTimeFormat(dateTimeLocale(), { hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      if (dayKey(at) === dayKey(now)) return L("今天 {time}", { time: clock });
      if (dayKey(at) === dayKey(yesterday)) return L("昨天 {time}", { time: clock });
      return new Intl.DateTimeFormat(dateTimeLocale(), { month: "long", day: "numeric" }).format(at);
    },
  };
}

export function createWorkbenchProjectBriefRenderer(primitives: ProjectBriefPrimitives) {
  const { L, escapeHtml } = primitives;
  const PERSONAL_NOTE = "不属于任何项目的资料和工作。没想好放哪里，就先放这里。";

  /** A project's link into its own page: its Home, or one plugin's page and the item on it. */
  const hrefFor = (projectId: string, open: BriefEvent["open"]): string => {
    const base = `/projects/${encodeURIComponent(projectId)}/`;
    if (!open) return base;
    const params = new URLSearchParams({ openPlugin: open.surface });
    if (open.id) { params.set("openItem", open.id); params.set("openTitle", open.title); }
    return `${base}?${params.toString()}`;
  };

  function renderProjectBrief(model: ProjectBriefModel): string {
    const time = createBriefTime(primitives, model.now);
    const name = model.personal ? L("个人空间") : model.name;
    const goals = model.goals;
    const state = model.personal
      ? { label: L("只有你能看到"), tone: "quiet" as const, glyph: "user" as MolisWorkIcon }
      : !goals || !goals.total ? { label: L("未设目标"), tone: "quiet" as const, glyph: "status-todo" as MolisWorkIcon }
      : goals.done === goals.total ? { label: L("已完成"), tone: "done" as const, glyph: "status-done" as MolisWorkIcon }
      : { label: L("进行中"), tone: "progress" as const, glyph: "status-progress" as MolisWorkIcon };
    const opened = model.opened_at ? `<span>${L("最近打开")} <time datetime="${escapeHtml(model.opened_at)}" data-relative>${escapeHtml(time.ago(model.opened_at))}</time></span>` : "";
    const kicker = `${renderBriefStatus(state)}${opened}${model.demo ? `<span>${L("演示数据，可随时重建")}</span>` : ""}`;

    const description = model.personal ? L(PERSONAL_NOTE) : model.description ?? undefined;
    const missing = model.personal || model.description ? undefined : L("还没有项目描述。进入项目后，在项目设置里补一句它要做什么。");

    let focus = "";
    if (!model.personal && goals) {
      if (!goals.total) {
        focus = renderBriefFocus({ label: "", title: L("还没有目标"), body: L("进入项目后写下第一个目标，也可以先让助理起草。"), empty: {
          action: renderButton({ variant: "secondary", size: "md", icon: "sparkles", label: L("让助理起草目标"), attrs: { "data-act": "prefill", "data-text": L("帮我为这个项目起草几个目标") } }),
        } });
      } else {
        const allDone = goals.done === goals.total;
        const track = renderGoalTrack({ goals: goals.track, label: L("{done} / {total} 个目标完成", { done: goals.done, total: goals.total }) });
        focus = renderBriefFocus({
          label: allDone ? L("目标全部完成") : L("当前目标"),
          count: `<b>${goals.done}</b> / ${goals.total} ${L("完成")}`,
          title: allDone ? L("{n} 个目标都完成了", { n: goals.total }) : goals.current?.title ?? "",
          body: allDone ? L("可以收尾，或为这个项目定下新的目标。") : model.current_detail || goals.current?.next_hint || undefined,
          track,
        });
      }
    }

    const nextBody = model.next.length
      ? `<div class="mw-brief__list">${model.next.map(item => renderDirectoryRow({
          title: item.title, caption: item.caption, density: "meta", href: hrefFor(model.project_id, item.open),
          ...(item.attention ? { status: L("等你确认"), statusTone: "attention" as const, statusIcon: "status-needs-you" as MolisWorkIcon } : {}),
          attrs: { "data-act": "enter-item" },
        })).join("")}</div>`
      : `<p class="mw-brief__quiet">${model.issues.includes("events") ? L("暂时读不到事项，进入项目可以看到。") : goals?.total ? L("没有待推进的事。") : L("目标定下来之后，要推进的事会出现在这里。")}</p>`;
    const recentBody = model.recent.length
      ? renderBriefRecent(model.recent.map(item => ({ when: time.when(item.at), text: item.title })))
      : `<p class="mw-brief__quiet">${model.issues.includes("events") ? L("暂时读不到动静。") : L("还没有动静。")}</p>`;
    const sections = [renderBriefSection({ title: L("接下来"), body: nextBody }), renderBriefSection({ title: L("最近"), body: recentBody })];
    const facts = model.workspace_path ? `<p class="mw-brief__facts"><span>${L("工作目录")} ${escapeHtml(model.workspace_path)}</span></p>` : "";
    return renderBrief({ kicker, title: name, description, descriptionMissing: missing, focus, sections, facts, attrs: { "data-id": model.project_id } });
  }

  /** The brief before it arrives: the name is known, the rest is a quiet placeholder of the same shape. */
  function renderProjectBriefLoading(name: string, id: string): string {
    const line = (width: string) => `<span style="display:block;width:${width};margin-top:12px">${renderSkeleton()}</span>`;
    return `<article class="mw-brief mw-brief--loading" data-slot="brief" aria-labelledby="brief-title" aria-busy="true" data-id="${escapeHtml(id)}"><p class="mw-brief__kicker"><span class="mw-loading">${L("正在读取项目…")}</span></p><h1 class="mw-brief__title" id="brief-title">${escapeHtml(name)}</h1>${line("62%")}${line("48%")}<div class="mw-brief__focus" aria-hidden="true">${line("40%")}${line("72%")}</div></article>`;
  }

  /** The brief that could not be read says so where it would be, and offers the retry. */
  function renderProjectBriefError(name: string, id: string, reason: string): string {
    return `<article class="mw-brief mw-brief--error" data-slot="brief" aria-labelledby="brief-title" data-id="${escapeHtml(id)}"><h1 class="mw-brief__title" id="brief-title">${escapeHtml(name)}</h1>${renderEmpty({ icon: "circle-alert", title: L("项目简介暂时读不到"), body: reason || L("这个项目没有及时响应。仍然可以直接进入它。"), className: "mw-empty--error", action: renderButton({ variant: "secondary", size: "md", icon: "refresh", label: L("重试"), attrs: { "data-act": "retry-brief" } }) })}</article>`;
  }

  return { renderProjectBrief, renderProjectBriefLoading, renderProjectBriefError, hrefFor };
}
