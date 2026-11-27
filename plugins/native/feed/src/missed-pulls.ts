import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  ActionError, assertRunsWindow, bindActionHandler, defineRunDecisionAction, defineRunsOverviewAction, runHasExpired, runsExpiryBounds, withinRunsWindow,
  RUNS_MISSED_LIMIT, RUNS_UPCOMING_LIMIT,
  type ActionExecutionContext, type ActionHandlerBinding, type RunDecided, type RunDecision, type RunsOverview, type RunsWindow, type ScheduledRun,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { OVERVIEW_TEXT_LIMITS, type PluginOverviewRows } from "@molis-ai/molis-work-contracts/platform/plugin";
import { sourceDeletedAt } from "./contract/sources.js";
import type { FeedApplication } from "./application.js";

/**
 * Feed's part in the menu-bar panel (resident-runtime-design §2.1): the sources' next scheduled pulls, and the pulls that came up more
 * than the grace late and were not made (`FeedSourceScheduler.tick` writes those down). 「现在做」 puts the source's next pull back at
 * the time it missed and keeps the decision on that row, as Schedule does: the next tick pulls that slot once on the usual path, even
 * when it comes much later (the computer slept right after the click), and does not ask again; 「跳过」 only marks it. A pull nobody
 * decided on for seven days from its time is skipped on its own (scheduled-runs.ts): its row is left undecided, so it is told apart
 * from the person's 跳过, and it is counted in `expired` instead of listed.
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
  const bounds = runsExpiryBounds(window);
  const missed = feed.sources.missed.list(projectId, RUNS_MISSED_LIMIT, bounds.listed_after).map(entry => ({ run_id: entry.run_id, title: entry.title, due_at: entry.due_at,
    project_id: projectId, open: { surface: FEED_SURFACE, id: entry.source_id }, needs: ["network" as const], missed_at: entry.missed_at }));
  const expired = feed.sources.missed.expired(projectId, bounds);
  // The host page shows this label; the plugin's own words follow the action caller's language, with the old Chinese as a fallback for
  // direct calls that install no text context.
  let title = "Feed 来源";
  try { const word = uiText.text("feed.runs.source-title"); if (word !== "feed.runs.source-title") title = word; } catch { /* direct call has no text context */ }
  return { source: { surface: FEED_SURFACE, title }, upcoming, missed, expired };
}

/**
 * One decision, synchronous so the Runtime's transaction holds it whole. A source that is gone, paused or no longer on a schedule is
 * `gone`, and so is a pull whose seven days ran out before the click: it was already skipped on its own, and stays counted as that.
 */
export function decideMissedPull(feed: FeedApplication, projectId: string, input: RunDecision, now: Date): RunDecided {
  const missed = feed.sources.missed.get(projectId, input.run_id);
  if (!missed || missed.decision || runHasExpired(missed.due_at, now.getTime())) return { state: "gone" };
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
  feed.sources.upsert({ ...source, schedule: { ...schedule, next_pull_at: missed.due_at }, updated_at: at });
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

/** How many upcoming and missed pulls Feed keeps in the overview at most: well under the platform's limit of rows per kind. */
const OVERVIEW_UPCOMING_ROWS = 200, OVERVIEW_MISSED_ROWS = 250;
const OPEN_PART = /^[A-Za-z0-9._:-]{1,200}$/;

/**
 * Feed's rows in the overview (specs/unified-partition-plugins §6.1「主库摘要表」, V17, batch 108), written again at the end of every Feed
 * write, in its transaction (`FeedRuntimePorts.summarizeWith`): each scheduled source's next pull, and each missed pull nobody decided on.
 * What is expired and what the person was told stays the Home's (`runExpiredUntold`).
 */
export function writeFeedRunRows(rows: PluginOverviewRows, feed: FeedApplication, projectId: string, now: number): void {
  rows.removePrefix("scheduled_run", "pull:");
  const at = new Date(now).toISOString(), title = (name: string, fallback: string) => [...(name.trim() || fallback)].slice(0, OVERVIEW_TEXT_LIMITS.title).join("");
  const open = (sourceId: string) => OPEN_PART.test(sourceId) ? { open: { surface: FEED_SURFACE, id: sourceId } } : {};
  const upcoming = feed.sources.stored(projectId).flatMap(source => source.enabled && source.status !== "paused" && source.status !== "disconnected" && source.schedule.mode === "interval"
    && source.schedule.enabled && source.schedule.next_pull_at && Date.parse(source.schedule.next_pull_at) > now ? [{ source, due: source.schedule.next_pull_at }] : [])
    .sort((a, b) => Date.parse(a.due) - Date.parse(b.due)).slice(0, OVERVIEW_UPCOMING_ROWS);
  for (const { source, due } of upcoming) {
    rows.upsert("scheduled_run", { row_id: missedPullRunId(source.source_id, due), title: title(source.name, source.source_id), due_at: due, updated_at: at,
      needs: ["network"], ...open(source.source_id) });
  }
  for (const entry of feed.sources.missed.list(projectId, OVERVIEW_MISSED_ROWS, "")) {
    rows.upsert("scheduled_run", { row_id: entry.run_id, title: title(entry.title, entry.source_id), due_at: entry.due_at, missed_at: entry.missed_at,
      updated_at: entry.missed_at, needs: ["network"], ...open(entry.source_id) });
  }
}
