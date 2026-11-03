import { findOccurrence } from "./calendar.js";
import { itemField, openItem } from "./item.js";
import { run, showNote } from "./page.js";
import { command } from "./workspace.js";
import { above } from "./dom.js";
import { addDays, clockLabel, dayOffset } from "./util.js";
import type { JellyPage } from "./types.js";

const DRAG = "application/x-jelly-item";

async function dropItem(page: JellyPage, dayKey: string, occurrenceKey: string): Promise<void> {
  const item = findOccurrence(page, occurrenceKey);
  if (!item) return;
  if (item.series_id) {
    const shift = dayOffset(item.start_date, dayKey);
    await command(page, { type: "series.update", id: item.series_id, original_date: item.original_date, scope: "onlyThis", patch: { start_date: dayKey, end_date: addDays(item.end_date, shift) } });
  } else await command(page, { type: "item.move", id: item.id, date: dayKey });
  showNote(page, page.L("jelly.item.moved"));
}

/** Drag an occurrence onto another day, tick items for a bulk move, double-click the week grid to start an item there. */
export function installCalendarEvents(page: JellyPage): void {
  const { content } = page;
  content.addEventListener("dragstart", (event) => {
    const target = above(event, "[data-jelly-occurrence]");
    if (!target || !(event as DragEvent).dataTransfer) return;
    const transfer = (event as DragEvent).dataTransfer as DataTransfer;
    transfer.setData(DRAG, target.dataset.jellyOccurrence ?? "");
    transfer.effectAllowed = "move";
  });
  content.addEventListener("change", (event) => {
    const node = above<HTMLInputElement>(event, "[data-jelly-select-item]");
    if (!node) return;
    const id = node.dataset.jellySelectItem ?? "";
    if (node.checked) page.calendarSelected.add(id); else page.calendarSelected.delete(id);
    const count = content.querySelector("[data-jelly-selection-count]");
    if (count) count.textContent = `${page.calendarSelected.size} ${page.L("jelly.calendar.selected-count")}`;
  });
  content.addEventListener("dblclick", (event) => {
    const timeline = above(event, "[data-jelly-week-time]");
    if (!timeline || above(event, "[data-jelly-occurrence]")) return;
    const minutes = Math.max(0, Math.min(1410, Math.round(((event as MouseEvent).clientY - timeline.getBoundingClientRect().top) / 44 * 4) * 15));
    openItem(page, null, timeline.dataset.jellyWeekTime);
    itemField(page, "start_time").value = clockLabel(minutes);
    itemField(page, "end_time").value = clockLabel(minutes + 30);
  });
  content.addEventListener("dragover", (event) => {
    const day = above(event, "[data-jelly-day]");
    const transfer = (event as DragEvent).dataTransfer;
    if (day && transfer?.types.includes(DRAG)) {
      event.preventDefault();
      transfer.dropEffect = "move";
      day.classList.add("is-drop");
    }
  });
  content.addEventListener("dragleave", (event) => above(event, "[data-jelly-day]")?.classList.remove("is-drop"));
  content.addEventListener("drop", (event) => {
    const day = above(event, "[data-jelly-day]");
    if (!day) return;
    day.classList.remove("is-drop");
    const key = (event as DragEvent).dataTransfer?.getData(DRAG) ?? "";
    if (!findOccurrence(page, key)) return;
    event.preventDefault();
    void run(page, () => dropItem(page, day.dataset.jellyDay ?? "", key));
  });
}
