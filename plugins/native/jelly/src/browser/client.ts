import { installCalendarEvents } from "./calendar-events.js";
import { periodTitle } from "./calendar.js";
import { installDatePickers } from "./datepicker.js";
import { installDialog } from "./dialog.js";
import { installGlobalEvents } from "./global-events.js";
import { installItemDialog } from "./item.js";
import { installModelReady } from "./model.js";
import { installNoteEvents } from "./note-events.js";
import { createPage, empty, showNote } from "./page.js";
import { installRootClicks } from "./root-clicks.js";
import { messageOf } from "./util.js";
import { loadList } from "./workspace.js";
import type { JellyHost } from "./types.js";

/** A single browser owner keeps calendar, notes and linked task blocks coherent. */
export function mountJelly(host: JellyHost): void {
  const root = document.querySelector<HTMLElement>("[data-jelly=\"workbench\"]");
  if (!root || root.dataset.jellyInitialized === "true") return;
  root.dataset.jellyInitialized = "true";
  const page = createPage(host, root);
  installDialog(page);
  installItemDialog(page);
  installDatePickers(page);
  installCalendarEvents(page);
  installNoteEvents(page);
  installModelReady(page);
  installRootClicks(page);
  installGlobalEvents(page);
  // The period's name is known before anything loads: named at once, the toolbar has its final width when it is first painted.
  periodTitle(page);
  loadList(page).catch((error: unknown) => {
    page.content.innerHTML = empty(page, "jelly.load.failed-title", "jelly.load.failed-text") + page.btn("jelly.action.retry", "data-jelly-retry");
    showNote(page, messageOf(error), true);
  });
}
