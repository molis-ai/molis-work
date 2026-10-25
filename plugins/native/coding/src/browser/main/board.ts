import { api, sessionPath } from "./request.js";
import type { Page } from "./page.js";
import type { BoardData } from "../taskboard-types.js";
import type { PlanEntry } from "../shapes.js";
import type { SubagentGroup } from "../subagents.js";
import type { RunView } from "./shapes.js";

/** The session's whole read for the board (`/taskboard`): every round, its plans and its subagents. */
export interface BoardRead {
  readonly runs: RunView[];
  readonly taskboard_plans: PlanEntry[];
  readonly subagents: SubagentGroup[];
}

/** What the board draws: the window just read for its own rounds, the whole-session read for the others. */
function mergedBoard(page: Page, id: string, data: BoardData & { readonly run_count?: number }): BoardData {
  const { s } = page, all = s.boardAll.id === id ? s.boardAll.value : null;
  if (!all) return { ...data, runs: s.allRuns };
  const held = new Set((data.runs || []).map(run => run.ref.run_id));
  // The window read just now is the freshest for its own rounds; every other round comes from the whole-session read.
  return {
    ...data,
    runs: all.runs.map(run => s.allRuns.find(own => own.ref.run_id === run.ref.run_id && !own.light) || run),
    taskboard_plans: [...all.taskboard_plans.filter(entry => !held.has(entry.run_id)), ...(data.taskboard_plans || [])],
    subagents: [...all.subagents.filter(group => !held.has(group.run_id)), ...(data.subagents || [])],
  };
}

/**
 * The board shows every round of the session: the loaded window as it is, earlier rounds from one read of the whole session's
 * plans and subagents, fetched again only when the number of rounds changes.
 */
export function boardUpdate(page: Page, id: string, data: BoardData & { readonly run_count?: number }) {
  const { directory, root } = page, { taskboard } = page.refs, { s } = page;
  taskboard.update(id, mergedBoard(page, id, data));
  const key = id + ":" + (data.run_count ?? s.allRuns.length);
  if ((root.dataset.codingBoardOpen === "true" || directory.dataset.codingCurrentFace === "taskboard") && s.boardAll.key !== key) {
    s.boardAll.key = key;
    void api<BoardRead>(page, sessionPath(id) + "/taskboard").then(value => {
      if (s.current !== id) return;
      s.boardAll = { key, id, value };
      taskboard.update(id, mergedBoard(page, id, data));
    }).catch(() => {
      // The whole-session read failed: the board keeps what the window has, and asks again with the next read.
      s.boardAll.key = "";
    });
  }
}

/** The main area shows the conversation or the TaskBoard; the header's switch and the board's "回到对话" both set it. */
export function showBoard(page: Page, open: boolean) {
  const { root } = page, { taskboard } = page.refs;
  root.dataset.codingBoardOpen = String(open);
  root.querySelectorAll<HTMLElement>("[data-coding-view]").forEach(button => {
    const on = (button.dataset.codingView === "board") === open;
    button.setAttribute("aria-pressed", String(on));
    button.classList.toggle("is-current", on);
  });
  if (open) taskboard.show();
  else taskboard.hide();
}

/**
 * A session is "on show" from the moment it is opened until its tab closes or it is archived. Going back to the directory on a
 * narrow screen does not end it: the faces there describe the session the person just left.
 */
export function onShow(page: Page): boolean {
  return page.s.sessionOnShow && Boolean(page.s.current);
}
