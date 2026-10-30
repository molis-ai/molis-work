import { CODING_SESSION_MARKS } from "../../session-marks.js";
import { el } from "../dom.js";
import { renderGoalFace } from "./goals.js";
import type { Page } from "./page.js";
import type { SessionRecord } from "./shapes.js";

const NEEDS_YOU = ["paused", "waiting-answer", "waiting-approval", "failed", "reconcile-required"];
const BUSY = ["running", "paused", "waiting-answer", "waiting-approval", "queued"];
const pad = (n: number) => String(n).padStart(2, "0");

/** The filters double as the background-task overview: how many rounds are working and how many wait on you. */
function drawFilterCounts(page: Page) {
  const { directory, s } = page;
  const counts: Record<string, number> = {
    running: s.state.sessions.filter(session => session.state === "running").length,
    "needs-you": s.state.sessions.filter(session => session.checkpoint_busy || NEEDS_YOU.includes(session.state)).length,
  };
  directory.querySelectorAll<HTMLElement>("[data-coding-filter]").forEach(button => {
    const count = counts[button.dataset.codingFilter ?? ""];
    if (count === undefined) return;
    let badge = button.querySelector<HTMLElement>(".coding-filter-count");
    if (!badge) {
      badge = el("span", "", "coding-filter-count");
      button.append(badge);
    }
    badge.textContent = count ? String(count) : "";
    badge.hidden = !count;
  });
}

/** A new row of the session list: icon, title, time and state, filled by `drawRow`. */
function newRow(page: Page, session: SessionRecord): HTMLAnchorElement {
  const row = el("a", "", "mw-dir-row mw-dir-row--meta coding-session-row");
  row.href = "#session-" + encodeURIComponent(session.session_id);
  row.dataset.codingSession = session.session_id;
  const icon = el("span", "", "mw-dir-row__icon");
  icon.innerHTML = page.root.querySelector("[data-coding-face=sessions] svg")?.outerHTML || "";
  const copy = el("span", "", "mw-dir-row__copy"), headline = el("span", "", "mw-dir-row__headline");
  headline.append(el("strong", "", "coding-session-title"), el("time", "", "mw-dir-row__count coding-session-time"));
  copy.append(headline, el("small", "", "coding-session-state"));
  row.append(icon, copy);
  return row;
}

/** Local time: today reads as a clock time, earlier days as a date. */
function drawTime(time: HTMLTimeElement, updated: string) {
  if (time.dateTime === updated) return;
  const at = new Date(updated), now = new Date(), invalid = Number.isNaN(at.getTime());
  time.textContent = invalid ? updated.slice(5, 10) : at.toDateString() === now.toDateString() ? pad(at.getHours()) + ":" + pad(at.getMinutes()) : pad(at.getMonth() + 1) + "-" + pad(at.getDate());
  time.dateTime = updated;
  time.title = invalid ? updated : at.toLocaleString(document.documentElement.lang || "zh-CN");
}

/** What a session's state line says: priority, the state, who holds its open plan steps, and a twin on the same Goal. */
function stateLabel(page: Page, session: SessionRecord, visible: readonly SessionRecord[]): string {
  const { L, s } = page, steps = session.steps;
  // Who is on the open plan steps, after the state: what waits on the person first.
  const holders = steps ? [steps.mine ? L("coding.steps.mine", { count: steps.mine }) : "", steps.subtasks ? L("coding.steps.subtasks", { count: steps.subtasks }) : "", steps.unowned ? L("coding.steps.unowned", { count: steps.unowned }) : ""].filter(Boolean).join(" · ") : "";
  // Two sessions under way on the same Goal may be doing the same thing twice.
  const twin = session.goal_id && BUSY.includes(session.state) ? visible.find(other => other !== session && other.goal_id === session.goal_id && BUSY.includes(other.state)) : null;
  return (session.priority ? L("coding.session.priority") + " · " : "") + (session.checkpoint_busy ? L("coding.session.rewind-pending") : s.SESSION_STATE[session.state] || session.state)
    + (session.background_unreadable ? " · " + L("coding.session.background-unreadable") : "") + (holders ? " · " + holders : "") + (twin ? " · " + L("coding.session.twin", { title: twin.title.slice(0, 16) }) : "");
}

function drawRow(page: Page, row: HTMLAnchorElement, session: SessionRecord, visible: readonly SessionRecord[]) {
  const { s } = page;
  row.setAttribute("aria-current", String(s.current === session.session_id));
  row.classList.toggle("is-selected", s.current === session.session_id);
  const title = row.querySelector<HTMLElement>(".coding-session-title"), time = row.querySelector("time"), mark = row.querySelector<HTMLElement>(".coding-session-state");
  if (!title || !time || !mark) return;
  if (title.textContent !== session.title) title.textContent = session.title;
  title.title = session.title;
  drawTime(time, session.updated_at);
  const label = stateLabel(page, session, visible);
  if (mark.textContent !== label) mark.textContent = label;
  mark.dataset.state = session.checkpoint_busy ? "waiting-approval" : session.state;
  mark.dataset.mwState = session.checkpoint_busy ? "verify" : CODING_SESSION_MARKS[session.state as keyof typeof CODING_SESSION_MARKS]?.ring || "idle";
}

/** A session goes under the group of its Goal; a group is made the first time one of its sessions is on show. */
function placeInGroup(page: Page, list: Element, row: HTMLAnchorElement, session: SessionRecord) {
  const { L, s } = page, goalKey = session.goal_id || "";
  let group = s.directoryGroups.get(goalKey);
  if (!group) {
    group = el("section", "", "coding-session-group");
    group.append(el("h2", "", "mw-dir__heading"));
    s.directoryGroups.set(goalKey, group);
  }
  const groupTitle = session.goal_title || (session.goal_id ? L("coding.directory.goal-unavailable") : L("coding.directory.no-goal"));
  if (group.firstChild && group.firstChild.textContent !== groupTitle) group.firstChild.textContent = groupTitle;
  if (!group.isConnected) list.append(group);
  if (row.parentElement !== group) group.append(row);
}

/** The list is reordered only when the underlying order changes, preserving pointer and focus targets. */
function reorder(page: Page, visible: readonly SessionRecord[]) {
  const { s } = page;
  for (const [key, group] of s.directoryGroups) {
    if (group.children.length === 1) {
      group.remove();
      s.directoryGroups.delete(key);
    }
  }
  for (const [goalKey, group] of s.directoryGroups) {
    const rows = visible.filter(session => (session.goal_id || "") === goalKey).map(session => s.directoryRows.get(session.session_id));
    rows.forEach((row, index) => {
      if (row && group.children[index + 1] !== row) group.insertBefore(row, group.children[index + 1] || null);
    });
  }
}

function matches(session: SessionRecord, needle: string, filter: string): boolean {
  if (!session.title.toLocaleLowerCase().includes(needle)) return false;
  return filter === "all" || filter === "running" && session.state === "running" || filter === "needs-you" && Boolean(session.checkpoint_busy || NEEDS_YOU.includes(session.state));
}

/** The session list, grouped by Goal; rows are kept and updated in place. */
export function renderDirectory(page: Page) {
  const { L, directory, s } = page;
  renderGoalFace(page);
  const filter = directory.querySelector<HTMLElement>("[data-coding-filter][aria-pressed=true]")?.dataset.codingFilter || "all";
  drawFilterCounts(page);
  const search = directory.querySelector<HTMLInputElement>("[data-coding-search]"), list = directory.querySelector("[data-coding-sessions]");
  if (!search || !list) return;
  const needle = search.value.trim().toLocaleLowerCase();
  // Replace the server's first paint once, then preserve live pointer targets. Until the session list has been read (a restored
  // tab reads its session first, and a cold start takes a while), the server's paint stays: replacing it with "no sessions"
  // would say something untrue.
  if (!s.directoryClaimed) {
    if (!s.stateLoaded) return;
    list.replaceChildren();
    s.directoryClaimed = true;
  }
  const visible = s.state.sessions.filter(session => matches(session, needle, filter)), visibleIds = new Set(visible.map(session => session.session_id));
  for (const [id, row] of s.directoryRows) {
    if (!visibleIds.has(id)) {
      row.remove();
      s.directoryRows.delete(id);
    }
  }
  list.querySelector(".mw-empty")?.remove();
  if (!visible.length) {
    const empty = el("div", "", "mw-empty");
    empty.append(el("p", needle ? L("coding.directory.no-match") : filter !== "all" ? L("coding.directory.none-of-kind") : L("coding.directory.empty")));
    list.append(empty);
    return;
  }
  for (const session of visible) {
    let row = s.directoryRows.get(session.session_id);
    if (!row) {
      row = newRow(page, session);
      s.directoryRows.set(session.session_id, row);
    }
    drawRow(page, row, session, visible);
    placeInGroup(page, list, row, session);
  }
  reorder(page, visible);
}
