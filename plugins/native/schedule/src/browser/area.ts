import type { UiTaskGrantsAreaState } from "@molis-ai/molis-work-contracts/platform/ui";
import { detailOf } from "./dom.js";
import type { SchedulePage } from "./page.js";
import { markChanged } from "./reads.js";

/**
 * The platform's 「能读的数据」 area in the open task's detail (batch 18 P3-2, specs/proactive-assistant/task-grants-platform-area.md §2):
 * Schedule gives the empty element kept for it and the task's id as the key, and nothing more. The shell draws the categories and
 * their switches outside the page and writes them as the person; all Schedule hears is the element's height and, after the person
 * changed something, the two flags it marks the list with. One task's area is open at a time: closing the detail, opening another
 * row, or the form taking the pane closes it.
 */
export function placeArea(page: SchedulePage, taskId: string | null): void {
  const element = taskId ? detailOf(page.workbench, taskId)?.querySelector<HTMLElement>("[data-schedule-reads-area]") ?? null : null;
  if (page.area && page.area.element === element) return;
  closeArea(page);
  if (!element || !taskId) return;
  const control = new AbortController(), section = element.closest<HTMLElement>("[data-schedule-reads]");
  page.area = { element, control };
  element.dataset.scheduleAreaPlaced = "";
  const onChange = (state: UiTaskGrantsAreaState) => markChanged(page, taskId, state);
  void page.host.taskGrants.place(element, taskId, { signal: control.signal, onChange }).then(
    // Shown: the area says each category and its state, so Schedule's own count of them steps aside (the notes stay).
    () => { if (page.area?.control === control && section) section.dataset.scheduleArea = "shown"; },
    // Not shown (closed first, or the platform could not show it): Schedule's own lines are what the detail says.
    () => { if (page.area?.control === control) delete element.dataset.scheduleAreaPlaced; },
  );
}

/** Closes the open area, if any: its element goes back to taking no room. */
export function closeArea(page: SchedulePage): void {
  const open = page.area;
  if (!open) return;
  page.area = null;
  open.control.abort();
  delete open.element.dataset.scheduleAreaPlaced;
  delete open.element.closest<HTMLElement>("[data-schedule-reads]")?.dataset.scheduleArea;
}
