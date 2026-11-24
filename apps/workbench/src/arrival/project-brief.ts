import { t as uiText, renderButton, renderDirectoryRow, renderEmpty, renderSkeleton, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  renderBrief,
  renderBriefFocus,
  renderBriefRecent,
  renderBriefSection,
  renderBriefStatus,
  renderProgressTrack,
  type MwProgressTrackState,
} from "@molis-ai/molis-work-design-system";

/**
 * The project brief: what a project is, in one reading, for the chooser's right-hand sheet. Read through the same public
 * readers Home uses (the progress a plugin publishes, the Home events), so a number here is the number there. What no reader gives
 * is not shown: the brief never fills a gap with a guess.
 */

/** One item of the progress a plugin publishes in its resume summary (`progress`, M2), whichever plugin that is. */
export interface BriefProgressItem {
  item_id: string;
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
  /** Null when no plugin publishes progress, or it could not be read (distinct from published progress with no items). */
  progress: readonly BriefProgressItem[] | null;
  /** Null when Home's events could not be read. */
  events: readonly BriefEvent[] | null;
  /** One line on where the item in play stands (its recorded progress, or why it exists), read for that item alone. */
  current_detail?: string | null;
  workspace_path: string | null;
  now: string;
}

interface BriefTrackItem { title: string; state: MwProgressTrackState }
interface BriefNextItem { title: string; caption: string; attention: boolean; open: BriefEvent["open"] }
interface BriefRecentItem { at: string; title: string }

/** What the brief says, decided. The chooser's rows read the summary; the sheet renders the rest. */
export interface ProjectBriefModel extends Omit<ProjectBriefInput, "progress" | "events"> {
  progress: null | { total: number; done: number; current: BriefProgressItem | null; track: BriefTrackItem[] };
  next: BriefNextItem[];
  recent: BriefRecentItem[];
  issues: string[];
}

/** The part of the brief a directory row shows: how far along, what is current, what waits on the person. */
export interface ProjectBriefSummary {
  project_id: string;
  progress_done: number | null;
  progress_total: number | null;
  current: string | null;
  waiting: number;
  opened_at: string | null;
}

/** The item being worked: of the open ones, the one touched last. The same rule decides what the brief reads further about. */
export function currentBriefItem(progress: readonly BriefProgressItem[]): BriefProgressItem | null {
  return progress.filter(item => item.work_status === "open").sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

const TRACK_LIMIT = 12;
const NEXT_LIMIT = 3;
const RECENT_LIMIT = 3;

/** Decide what the brief says from what the readers returned. Pure. */
export function composeProjectBrief(input: ProjectBriefInput): ProjectBriefModel {
  const issues: string[] = [];
  let progress: ProjectBriefModel["progress"] = null;
  if (input.progress) {
    const live = input.progress.filter(item => item.work_status !== "cancelled");
    const done = live.filter(item => item.work_status === "completed").sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    const open = live.filter(item => item.work_status === "open").sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const current = open[0] ?? null;
    const track: BriefTrackItem[] = [
      ...done.map(item => ({ title: item.title, state: "done" as const })),
      ...open.map((item, index) => ({ title: item.title, state: index === 0 ? "doing" as const : "todo" as const })),
    ];
    // A long history keeps its newest finished items beside the open ones; the count still says how many in all.
    let shown = track;
    if (track.length > TRACK_LIMIT) {
      const keepOpen = Math.min(open.length, TRACK_LIMIT);
      shown = [...track.slice(Math.max(0, done.length - (TRACK_LIMIT - keepOpen)), done.length), ...track.slice(done.length, done.length + keepOpen)];
    }
    progress = { total: live.length, done: done.length, current, track: shown };
  } else issues.push("progress");
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
  return { ...input, progress, next, recent, issues };
}

/** What a directory row reads from the brief. When no progress was read the counts stay null rather than zero. */
export function summarizeProjectBrief(model: ProjectBriefModel, events: readonly BriefEvent[] | null, progress: readonly BriefProgressItem[] | null): ProjectBriefSummary {
  const waiting = events ? events.filter(event => event.needs_attention).length : (progress ?? []).filter(item => item.work_status === "open").reduce((sum, item) => sum + item.pending_decision_count, 0);
  return { project_id: model.project_id, progress_done: model.progress?.done ?? null, progress_total: model.progress?.total ?? null, current: model.progress?.current?.title ?? null, waiting, opened_at: model.opened_at };
}

interface ProjectBriefPrimitives {
  readText(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  dateTimeLocale(): string;
}

/** The brief's two reading aids that depend on the clock: how long ago, and which day. */
export function createBriefTime(primitives: Pick<ProjectBriefPrimitives, "readText" | "dateTimeLocale">, nowIso: string) {
  const { dateTimeLocale } = primitives;
  const now = new Date(nowIso);
  const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  return {
    /** “2 小时前”, or the date once it is more than a week ago. */
    ago(iso: string | null): string {
      const at = iso ? new Date(iso) : null;
      if (!at || !Number.isFinite(at.getTime())) return "";
      const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000));
      if (minutes < 1) return uiText.text("workbench.project-brief.just-now");
      if (minutes < 60) return uiText.text("workbench.project-brief.n-min-ago", { n: minutes });
      if (minutes < 60 * 24 && dayKey(at) === dayKey(now)) return uiText.text("workbench.project-brief.n-h-ago", { n: Math.round(minutes / 60) });
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      if (dayKey(at) === dayKey(yesterday)) return uiText.text("workbench.project-brief.yesterday");
      if (minutes < 60 * 24 * 7) return uiText.text("workbench.project-brief.n-n-ago", { n: Math.round(minutes / (60 * 24)) });
      return new Intl.DateTimeFormat(dateTimeLocale(), { month: "numeric", day: "numeric" }).format(at);
    },
    /** “昨天 22:14” or “9月29日”. */
    when(iso: string): string {
      const at = new Date(iso);
      if (!Number.isFinite(at.getTime())) return "";
      const clock = new Intl.DateTimeFormat(dateTimeLocale(), { hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
      const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
      if (dayKey(at) === dayKey(now)) return uiText.text("workbench.project-brief.today-time", { time: clock });
      if (dayKey(at) === dayKey(yesterday)) return uiText.text("workbench.project-brief.yesterday-time", { time: clock });
      return new Intl.DateTimeFormat(dateTimeLocale(), { month: "long", day: "numeric" }).format(at);
    },
  };
}

export function createWorkbenchProjectBriefRenderer(primitives: ProjectBriefPrimitives) {
  const { escapeHtml } = primitives;
  const PERSONAL_NOTE = "workbench.project-brief.material-work-that-doesn-t-belong-any-project";

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
    const name = model.personal ? uiText.text("workbench.project-brief.personal-space") : model.name;
    const progress = model.progress;
    // The badge speaks only for the published progress; a project with none (or none read) claims no state, since its work may well
    // be in plugins that publish none.
    const state = model.personal
      ? { label: uiText.text("workbench.project-brief.only-can-see"), tone: "quiet" as const, glyph: "user" as PluginIconName }
      : !progress || !progress.total ? null
      : progress.done === progress.total ? { label: uiText.text("workbench.project-brief.progress-done"), tone: "done" as const, glyph: "status-done" as PluginIconName }
      : { label: uiText.text("workbench.project-brief.progress-ongoing"), tone: "progress" as const, glyph: "status-progress" as PluginIconName };
    const opened = model.opened_at ? `<span>${uiText("workbench.project-brief.last-opened")} <time datetime="${escapeHtml(model.opened_at)}" data-relative>${escapeHtml(time.ago(model.opened_at))}</time></span>` : "";
    const kicker = `${state ? renderBriefStatus(state) : ""}${opened}${model.demo ? `<span>${uiText("workbench.project-brief.demo-data-can-be-rebuilt-any-time")}</span>` : ""}`;

    const description = model.personal ? uiText.text(PERSONAL_NOTE) : model.description ?? undefined;
    const missing = model.personal || model.description ? undefined : uiText.text("workbench.project-brief.no-description-yet-open-project-add-line-its");

    let focus = "";
    // Progress with nothing in it yet draws nothing: what to start with is the publishing plugin's to say, on its own page.
    if (!model.personal && progress?.total) {
      const allDone = progress.done === progress.total;
      const track = renderProgressTrack({ items: progress.track, label: uiText.text("workbench.project-brief.done-total-total-done", { done: progress.done, total: progress.total }) });
      focus = renderBriefFocus({
        label: allDone ? uiText.text("workbench.project-brief.all-done") : uiText.text("workbench.project-brief.focused-item"),
        count: `<b>${progress.done}</b> / ${progress.total} ${uiText("common.control.done")}`,
        title: allDone ? uiText.text("workbench.project-brief.all-n-n-done", { n: progress.total }) : progress.current?.title ?? "",
        body: allDone ? uiText.text("workbench.project-brief.can-wrap-up") : model.current_detail || progress.current?.next_hint || undefined,
        track,
      });
    }

    const nextBody = model.next.length
      ? `<div class="mw-brief__list">${model.next.map(item => renderDirectoryRow({
          title: item.title, caption: item.caption, density: "meta", href: hrefFor(model.project_id, item.open),
          ...(item.attention ? { status: uiText.text("workbench.project-brief.needs-approval"), statusTone: "attention" as const, statusIcon: "status-needs-you" as PluginIconName } : {}),
          attrs: { "data-act": "enter-item" },
        })).join("")}</div>`
      : `<p class="mw-brief__quiet">${model.issues.includes("events") ? uiText("workbench.project-brief.can-t-read-items-right-now-open-project") : progress?.total ? uiText("workbench.project-brief.nothing-waiting-move-forward") : uiText("workbench.project-brief.when-plugin-has-something-move-confirm-will-show")}</p>`;
    const recentBody = model.recent.length
      ? renderBriefRecent(model.recent.map(item => ({ when: time.when(item.at), text: item.title })))
      : `<p class="mw-brief__quiet">${model.issues.includes("events") ? uiText("workbench.project-brief.can-t-read-recent-activity-right-now") : uiText("workbench.project-brief.nothing-yet")}</p>`;
    const sections = [renderBriefSection({ title: uiText.text("workbench.project-brief.next"), body: nextBody }), renderBriefSection({ title: uiText.text("workbench.project-brief.last"), body: recentBody })];
    const directory = model.workspace_path ? `<p class="mw-brief__facts"><span>${uiText("workbench.project-brief.working-directory")} ${escapeHtml(model.workspace_path)}</span></p>` : "";
    const facts = directory + (model.personal ? "" : renderButton({ variant: "ghost", size: "md", icon: "sparkles",
      label: uiText.text("workbench.automation.title"), attrs: { "data-automation-open": model.project_id } }));
    return renderBrief({ kicker, title: name, description, descriptionMissing: missing, focus, sections, facts, attrs: { "data-id": model.project_id } });
  }

  /** The brief before it arrives: the name is known, the rest is a quiet placeholder of the same shape. */
  function renderProjectBriefLoading(name: string, id: string): string {
    const line = (width: string) => `<span style="display:block;width:${width};margin-top:12px">${renderSkeleton()}</span>`;
    return `<article class="mw-brief mw-brief--loading" data-slot="brief" aria-labelledby="brief-title" aria-busy="true" data-id="${escapeHtml(id)}"><p class="mw-brief__kicker"><span class="mw-loading">${uiText("workbench.project-brief.loading-projects")}</span></p><h1 class="mw-brief__title" id="brief-title">${escapeHtml(name)}</h1>${line("62%")}${line("48%")}<div class="mw-brief__focus" aria-hidden="true">${line("40%")}${line("72%")}</div></article>`;
  }

  /** The brief that could not be read says so where it would be, and offers the retry. */
  function renderProjectBriefError(name: string, id: string, reason: string): string {
    return `<article class="mw-brief mw-brief--error" data-slot="brief" aria-labelledby="brief-title" data-id="${escapeHtml(id)}"><h1 class="mw-brief__title" id="brief-title">${escapeHtml(name)}</h1>${renderEmpty({ icon: "circle-alert", title: uiText.text("workbench.project-brief.can-t-read-project-summary-right-now"), body: reason || uiText.text("workbench.project-brief.project-didn-t-answer-time-can-still-open"), className: "mw-empty--error", action: renderButton({ variant: "secondary", size: "md", icon: "refresh", label: uiText.text("common.control.retry"), attrs: { "data-act": "retry-brief" } }) })}</article>`;
  }

  return { renderProjectBrief, renderProjectBriefLoading, renderProjectBriefError, hrefFor };
}
