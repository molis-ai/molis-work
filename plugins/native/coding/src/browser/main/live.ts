import { terminal } from "./composer-state.js";
import type { Page } from "./page.js";
import { readCurrent } from "./read.js";
import { api, sessionPath, status } from "./request.js";
import { renderRuns } from "./runs.js";
import { SESSION_PAGE } from "../../session-window-sizes.js";
import { errorMessage } from "../dom.js";
import type { RunView } from "./shapes.js";

/** A round followed live: the Host answers when the round changes, or after a wait with no change. */
interface LiveRead { readonly version: string; readonly runs: readonly RunView[] }

/** Follows one running round, drawing it each time the Host says it changed, until it ends or the page moves on. */
export async function followLive(page: Page, id: string, runId: string) {
  const { lifetime, s } = page, { usageMeter } = page.refs;
  if (!lifetime.visible || s.liveRun === runId) return;
  s.liveRun = runId;
  const ticket = ++s.liveTicket, signal = s.viewSignal;
  let since: string | null = null, failures = 0;
  while (lifetime.visible && !signal?.aborted && s.current === id && s.liveRun === runId && ticket === s.liveTicket) {
    try {
      const data: LiveRead = await api<LiveRead>(page, sessionPath(id, runId) + "/live?timeout=20000" + (since ? "&since=" + encodeURIComponent(since) : ""), "GET", undefined, signal);
      if (s.current !== id || s.liveRun !== runId || ticket !== s.liveTicket) break;
      failures = 0;
      since = data.version;
      const run = data.runs[0], at = s.windowRuns.findIndex(held => held.ref.run_id === runId);
      if (!run || at < 0) break;
      s.windowRuns[at] = run;
      s.allRuns = s.allRuns.map(held => held.ref.run_id === runId ? run : held);
      renderRuns(page, [run], s.allRuns);
      if (s.lastData) usageMeter.render(s.lastData, s.lastRun);
      if (terminal(run.phase)) {
        void readCurrent(page);
        break;
      }
    } catch {
      if (signal?.aborted || !lifetime.visible || ++failures > 3) break;
      try {
        await lifetime.delay(1000, signal);
      } catch {
        break;
      }
    }
  }
  if (ticket === s.liveTicket && s.liveRun === runId) s.liveRun = "";
}

/** The bar above the first loaded round: it names how many earlier rounds there are and loads them. */
export function renderEarlier(page: Page) {
  const { L, lifetime, s, turns } = page, hidden = s.allRuns.findIndex(run => !run.light);
  let bar = turns.querySelector<HTMLButtonElement>(":scope > [data-coding-earlier]");
  if (hidden <= 0) {
    if (bar) {
      s.earlierWatch.unobserve(bar);
      bar.remove();
    }
    return;
  }
  if (!bar) {
    bar = document.createElement("button");
    bar.type = "button";
    bar.className = "coding-earlier";
    bar.dataset.codingEarlier = "";
    lifetime.listen(bar, "click", () => void loadEarlier(page));
    s.earlierWatch.observe(bar);
  }
  if (turns.firstElementChild !== bar) turns.prepend(bar);
  bar.disabled = s.pageLoading;
  bar.textContent = s.pageLoading ? L("coding.turns.loading-earlier") : L("coding.turns.show-earlier", { count: hidden });
}

/** Earlier rounds come back a page at a time as the reader scrolls up; what they were reading stays where it was. */
export async function loadEarlier(page: Page) {
  const { lifetime, s } = page, { subagents } = page.refs, start = s.allRuns.findIndex(run => !run.light);
  if (s.pageLoading || !s.current || start <= 0) return;
  const id = s.current, ticket = s.generation;
  s.pageLoading = true;
  renderEarlier(page);
  try {
    const older = await api<{ runs: readonly RunView[]; taskboard_plans?: typeof s.planEntries; subagents?: typeof s.subagentGroups }>(page, sessionPath(id) + "/runs?before=" + start + "&limit=" + SESSION_PAGE);
    if (s.current !== id || ticket !== s.generation) return;
    older.runs.forEach(run => s.olderViews.set(run.ref.run_id, run));
    s.olderPlanEntries.push(...(older.taskboard_plans || []));
    s.olderSubagents.push(...(older.subagents || []));
    s.allRuns = s.allRuns.map(run => run.light && s.olderViews.get(run.ref.run_id) || run);
    s.planEntries = [...s.olderPlanEntries, ...s.planEntries.filter(entry => !s.olderPlanEntries.includes(entry))];
    s.subagentGroups = [...s.olderSubagents, ...s.subagentGroups.filter(group => !s.olderSubagents.includes(group))];
    // The results panel lists every loaded round's subtasks, so an earlier round's "评价并整合成果" finds its row.
    subagents.update(id, s.subagentGroups);
    // Drawn two rounds a frame, nearest first, so scrolling never waits on a whole page; renderRuns keeps the part being read put.
    const pending = older.runs.map(run => s.olderViews.get(run.ref.run_id)!).reverse();
    while (pending.length) {
      if (s.current !== id || ticket !== s.generation) return;
      renderRuns(page, pending.splice(0, 2).reverse(), s.allRuns);
      if (pending.length) await lifetime.nextFrame();
    }
  } catch (error) {
    if (s.current === id) status(page, errorMessage(error), true);
  } finally {
    s.pageLoading = false;
    if (s.current === id) renderEarlier(page);
  }
}
