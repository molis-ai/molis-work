import os from "node:os";
import type { IncomingMessage, ServerResponse } from "node:http";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import { composeProjectBrief, currentBriefGoal, summarizeProjectBrief, type BriefEvent, type BriefGoal, type ProjectBriefInput, type ProjectBriefModel, type ProjectBriefSummary } from "@molis-ai/molis-work-app-workbench";
import type { HomeEventView, HomeEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
import { homeActions } from "./home-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "./local-owner-permissions.js";
import { bindLocalWebActions } from "./local-web-actions.js";
import { isPersonalSpace, PERSONAL_SPACE_PROJECT_ID } from "./personal-space.js";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { descriptionFromSummary, readProjectArrival } from "./project-arrival.js";
import { sendLocalWebJson as sendJson } from "./web-http.js";
import { currentLocale, L } from "./web-locale.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

/**
 * What the project chooser asks of a project it is only looking at: its brief. Read as the person, through the same
 * public readers Home uses (the Goals directory, Home's events), for one project at a time; nothing here writes, and a
 * reader that cannot answer is left out of the brief rather than guessed.
 */
export interface ProjectBriefResponse { html: string; summary: ProjectBriefSummary }

interface ProjectArrivalHttpPorts {
  localHost: MolisWorkLocalHost;
  withCatalog: LocalWebCatalogRunner;
  renderBrief(model: ProjectBriefModel): string;
}

/** A reader that does not answer in time is as good as unreadable: the sheet says so and the project still opens. */
const READ_TIMEOUT_MS = 8_000;
/** Looking from project to project and back asks the same questions; one answer is good for a few seconds. */
const BRIEF_TTL_MS = 5_000;
const EVENT_WINDOW = { before_days: 14, after_days: 7 } as const;
/** Reading a project opens it, which is not free: however quickly the person moves down the list, only this many are read at once. */
const MAX_CONCURRENT_READS = 2;

/** At most `max` runs at a time; the rest wait their turn in the order they came, and a failure gives its place to the next. */
export function createReadLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function limited<T>(run: () => Promise<T>): Promise<T> {
    if (active < max) active++;
    else await new Promise<void>(resolve => waiting.push(resolve)); // the finisher hands its place over, so the count never passes max
    try {
      return await run();
    } finally {
      const next = waiting.shift();
      if (next) next(); else active--;
    }
  };
}

async function settle<T>(read: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([read, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), READ_TIMEOUT_MS); })]);
    return { ok: true, value };
  } catch {
    return { ok: false };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function eventWindow(now: Date): HomeEventWindow {
  const day = 24 * 60 * 60 * 1000;
  return { from: new Date(now.getTime() - EVENT_WINDOW.before_days * day).toISOString(), to: new Date(now.getTime() + EVENT_WINDOW.after_days * day).toISOString(), now: now.toISOString() };
}

function briefEvent(event: HomeEventView): BriefEvent {
  const open = event.open;
  return {
    event_id: event.event_id, title: event.title, summary: event.summary, occurred_at: event.occurred_at, placement: event.placement, needs_attention: event.needs_attention,
    open: open ? { surface: open.surface, id: open.kind === "surface" ? null : open.id, title: open.title } : null,
    source_title: event.origin.title,
  };
}

/** A sentence from a goal's record, on one line and no longer than the card has room for. */
function oneLine(value: string): string {
  const flat = value.replace(/\s+/gu, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 139).trimEnd()}…` : flat;
}

/** The workspace path as the person knows it: from their home folder. */
function tildePath(value: string): string {
  const home = os.homedir();
  return value === home ? "~" : value.startsWith(`${home}/`) ? `~${value.slice(home.length)}` : value;
}

export function createProjectArrivalHttp(ports: ProjectArrivalHttpPorts) {
  const cache = new Map<string, { at: number; value: ProjectBriefResponse }>();
  const inflight = new Map<string, Promise<ProjectBriefResponse | null>>();
  const limited = createReadLimiter(MAX_CONCURRENT_READS);

  async function readBrief(homeDirectory: string | undefined, projectId: string): Promise<ProjectBriefResponse | null> {
    const found = await ports.withCatalog({ homeDirectory }, catalog => {
      try {
        const project = catalog.getProject(projectId);
        const workspace = catalog.listWorkspaceDirectory(project.project_id)[0] ?? null;
        return { project, workspace_path: workspace?.canonical_path ?? null };
      } catch {
        return null;
      }
    });
    if (!found) {
      // The personal space is made the first time it is opened; until then it has nothing to read.
      if (projectId !== PERSONAL_SPACE_PROJECT_ID) return null;
      const model = composeProjectBrief({ project_id: projectId, name: L("个人空间"), personal: true, demo: false, opened_at: null, description: null, goals: [], events: [], workspace_path: null, now: new Date().toISOString() });
      return { html: ports.renderBrief(model), summary: summarizeProjectBrief(model, [], []) };
    }
    const { project } = found;
    const personal = isPersonalSpace(project);
    const now = new Date();
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, boardId: project.board_id, projectId: project.project_id });
    const actions = bindLocalWebActions(ports.localHost, reference, LOCAL_OWNER_PERMISSIONS);
    const arrival = readProjectArrival(homeDirectory);
    const remembered = arrival.projects[project.project_id];
    const [goals, events, guidance] = await Promise.all([
      settle(actions.invoke(goalsActions.list, { limit: 100 })),
      settle(actions.invoke(homeActions.events, eventWindow(now))),
      // The introduction the person accepted at creation is kept here; a project made another way may carry long-term notes instead.
      remembered?.description || personal ? Promise.resolve({ ok: false as const }) : settle(actions.invoke(goalsActions.guidanceRead, {})),
    ]);
    const goalList: BriefGoal[] | null = goals.ok ? goals.value.goals.map(goal => ({ goal_id: goal.goal_id, title: goal.title, work_status: goal.work_status, next_hint: goal.next_hint,
      pending_decision_count: goal.pending_decision_count, updated_at: goal.updated_at })) : null;
    const eventList: BriefEvent[] | null = events.ok ? events.value.events.map(briefEvent) : null;
    // One more reading, for the goal in play only: where it stands, in the words its own record keeps.
    const current = goalList && !personal ? currentBriefGoal(goalList) : null;
    const state = current ? await settle(actions.invoke(goalsActions.state, { goal_id: current.goal_id })) : null;
    const detail = state?.ok ? (state.value.progress_summary && !state.value.progress_summary.stale ? state.value.progress_summary.summary : state.value.intent.why) : null;
    const context = guidance.ok ? guidance.value.entries.find(entry => entry.active && entry.kind === "context") : undefined;
    const input: ProjectBriefInput = {
      project_id: project.project_id,
      name: project.display_name,
      personal,
      demo: project.data_class === "regenerable_demo",
      opened_at: remembered?.last_opened_at ?? null,
      description: remembered?.description ?? (context ? descriptionFromSummary(context.content) : null),
      goals: goalList,
      events: eventList,
      current_detail: detail ? oneLine(detail) : null,
      workspace_path: found.workspace_path ? tildePath(found.workspace_path) : null,
      now: now.toISOString(),
    };
    const model = composeProjectBrief(input);
    return { html: ports.renderBrief(model), summary: summarizeProjectBrief(model, eventList, goalList) };
  }

  return async function handleProjectArrivalHttp(request: IncomingMessage, response: ServerResponse, url: URL, homeDirectory: string | undefined): Promise<boolean> {
    const match = /^\/api\/projects\/([^/]+)\/brief$/u.exec(url.pathname);
    if (!match || request.method !== "GET") return false;
    let projectId: string;
    try { projectId = decodeURIComponent(match[1]!); } catch { sendJson(response, 404, { error: L("找不到这个 Molis Work 项目") }); return true; }
    // The sheet is worded in the request's language, so a brief read in one is not served in another.
    const key = `${currentLocale()}\n${homeDirectory ?? ""}\n${projectId}`;
    const fresh = cache.get(key);
    if (fresh && Date.now() - fresh.at < BRIEF_TTL_MS) { sendJson(response, 200, fresh.value); return true; }
    try {
      let pending = inflight.get(key);
      if (!pending) {
        pending = limited(() => readBrief(homeDirectory, projectId)).finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      const brief = await pending;
      if (!brief) { sendJson(response, 404, { error: L("找不到这个 Molis Work 项目") }); return true; }
      cache.set(key, { at: Date.now(), value: brief });
      if (cache.size > 64) cache.delete(cache.keys().next().value!);
      sendJson(response, 200, brief);
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : L("项目简介暂时读不到") });
    }
    return true;
  };
}
