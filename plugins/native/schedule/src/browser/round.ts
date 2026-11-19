import { roundStamp } from "../round-stamp.js";
import { detailOf } from "./dom.js";
import type { SchedulePage } from "./page.js";

/** One task of the project by its id (`schedule.tasks.get`): the read the page makes to see whether its round has landed. */
const getTask = { capability_id: "schedule.tasks.get", version: /* @version action.schedule.tasks.get */ 1 };
type TaskAnswer = { readonly task: Parameters<typeof roundStamp>[0] };

/** How long after its time a round is waited for, and the longest pause between two reads while waiting. */
const WAITED = 30 * 60_000, LONGEST = 60_000;
/** A time further off than a timer can wait: the detail is drawn again before then (it is opened again, or the page is read again). */
const FAR = 24 * 86_400_000;

/** Stops waiting for a round: another row, the form or nothing is open now, or the detail is being drawn again. */
export function stopFollowing(page: SchedulePage): void {
  page.following++;
  clearTimeout(page.followTimer);
  page.followTimer = undefined;
  page.followPending = null;
}

/**
 * While a task's detail is open, waits for its next round to end and then calls `landed` once, so the detail shows the answer, or the
 * round that did not run and why, without the person reading the page again (96-2). Nothing runs before the task's time; from then on
 * the page reads that one task, at growing intervals, until what the detail shows has changed, for at most half an hour. Opening
 * another row, the form or nothing stops it, and an answer that comes back after that is dropped: it is not about what is open now.
 * A page that is not on screen reads nothing; the wait goes on when it shows again.
 */
export function followRound(page: SchedulePage, taskId: string, landed: () => void): void {
  stopFollowing(page);
  const detail = detailOf(page.workbench, taskId);
  // A paused task has no round coming.
  if (detail?.dataset.scheduleEnabled !== "true") return;
  const token = page.following, shown = detail.dataset.scheduleRound ?? "";
  const due = Date.parse(detail.dataset.scheduleDue ?? "");
  // On, with no next time: a round has just ended and the next one is being set, so it is read from now.
  const from = Number.isFinite(due) ? due : Date.now();
  if (from - Date.now() > FAR) return;
  let pause = 2_000;
  const later = () => {
    if (Date.now() - from > WAITED) return;
    page.followTimer = setTimeout(check, pause);
    pause = Math.min(pause * 2, LONGEST);
  };
  const check = () => {
    if (token !== page.following) return;
    if (document.hidden) { page.followPending = check; return; }
    page.followPending = null;
    page.host.invokeAction<TaskAnswer>(getTask, { task_id: taskId }).then(answer => {
      if (token !== page.following) return;
      if (roundStamp(answer.task) !== shown) landed(); else later();
    // A task that can no longer be read (archived elsewhere) is not waited for; the next read of the page shows what became of it.
    }, () => undefined);
  };
  page.followTimer = setTimeout(check, Math.max(0, from - Date.now()) + 1_000);
}

/** A page shown again goes on with the wait it put off while hidden. */
export function wireFollowing(page: SchedulePage): void {
  document.addEventListener("visibilitychange", () => { if (!document.hidden) page.followPending?.(); });
}
