import {
  ActionError, assertRunsWindow, bindActionHandler, defineRunDecisionAction, defineRunsOverviewAction, withinRunsWindow, RUNS_MISSED_LIMIT, RUNS_UPCOMING_LIMIT,
  type ActionExecutionContext, type ActionHandlerBinding, type RunDecided, type RunDecision, type RunsOverview, type RunsWindow, type ScheduledRun,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { sourceDeletedAt } from "./contract/sources.js";
import type { FeedApplication } from "./application.js";

/**
 * Feed's part in the menu-bar panel (resident-runtime-design §2.1): the sources' next scheduled pulls, and the pulls that came up more
 * than the grace late and were not made (`FeedSourceScheduler.tick` writes those down). 「现在做」 sets the source's next pull to now, so
 * the next tick pulls it on the usual path; 「跳过」 only marks it.
 */
export const missedPullRunId = (sourceId: string, plannedAt: string) => `pull:${sourceId}:${plannedAt}`;
const FEED_SURFACE = "feed";

export const feedRunsActions = {
  overview: defineRunsOverviewAction("feed.runs.overview", /* @version action.feed.runs.overview */ 1, "Feed 来源的拉取概况", ["feed:read"], "project"),
  decide: defineRunDecisionAction("feed.runs.decide", /* @version action.feed.runs.decide */ 1, "处理错过的拉取", ["feed:read", "feed:write"], "project"),
};

export function feedRunsOverview(feed: FeedApplication, projectId: string, window: RunsWindow): RunsOverview {
  assertRunsWindow(window);
  const upcoming: ScheduledRun[] = feed.sources.list(projectId)
    .flatMap(source => source.enabled && source.status !== "paused" && source.status !== "disconnected" && source.schedule.mode === "interval"
      && source.schedule.enabled && source.schedule.next_pull_at && withinRunsWindow(source.schedule.next_pull_at, window)
      ? [{ run_id: missedPullRunId(source.source_id, source.schedule.next_pull_at), title: [...source.name].slice(0, 300).join("") || source.source_id,
        due_at: source.schedule.next_pull_at, project_id: projectId, open: { surface: FEED_SURFACE, id: source.source_id }, needs: ["network" as const] }] : [])
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)).slice(0, RUNS_UPCOMING_LIMIT);
  const missed = feed.sources.missed.list(projectId, RUNS_MISSED_LIMIT).map(entry => ({ run_id: entry.run_id, title: entry.title, due_at: entry.due_at,
    project_id: projectId, open: { surface: FEED_SURFACE, id: entry.source_id }, needs: ["network" as const], missed_at: entry.missed_at }));
  return { source: { surface: FEED_SURFACE, title: "Feed 来源" }, upcoming, missed };
}

/** One decision, synchronous so the Runtime's transaction holds it whole. A source that is gone, paused or no longer on a schedule is `gone`. */
export function decideMissedPull(feed: FeedApplication, projectId: string, input: RunDecision, now: Date): RunDecided {
  const missed = feed.sources.missed.get(projectId, input.run_id);
  if (!missed || missed.decision) return { state: "gone" };
  const at = now.toISOString();
  let source: ReturnType<FeedApplication["sources"]["get"]> | null = null;
  try { source = feed.sources.get(projectId, missed.source_id); }
  catch (error) { if (!(error instanceof ActionError) || error.code !== "feed.source_not_found") throw error; }
  const schedule = source?.schedule;
  if (!source || sourceDeletedAt(source) || !source.enabled || source.status === "paused" || source.status === "disconnected"
    || schedule?.mode !== "interval" || !schedule.enabled) {
    feed.sources.missed.decide(projectId, input.run_id, "skip", at);
    return { state: "gone" };
  }
  if (input.decision === "skip") { feed.sources.missed.decide(projectId, input.run_id, "skip", at); return { state: "skipped" }; }
  feed.sources.upsert({ ...source, schedule: { ...schedule, next_pull_at: at }, updated_at: at });
  feed.sources.missed.decide(projectId, input.run_id, "run_now", at);
  return { state: "started" };
}

export function createFeedRunsHandlers(projectId: string, ports: { feed(): FeedApplication; now?(): Date }): ActionHandlerBinding[] {
  const here = (caller: ActionExecutionContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "这件事不属于这个项目");
  };
  return [
    bindActionHandler(feedRunsActions.overview, (input, caller) => { here(caller); return feedRunsOverview(ports.feed(), projectId, input); }),
    bindActionHandler(feedRunsActions.decide, (input, caller) => { here(caller); return decideMissedPull(ports.feed(), projectId, input, ports.now?.() ?? new Date()); }),
  ];
}
