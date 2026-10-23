import { installBatch } from "./batch.js";
import { installDetail } from "./detail.js";
import { listen } from "./events.js";
import { installList } from "./list.js";
import { todoPage } from "./page.js";
import { installQuick } from "./quick.js";
import { installReminders } from "./reminders.js";
import { installReview } from "./review.js";
import type { TodoClientHost } from "./types.js";

/**
 * The Todo page in the workbench: views, quick entry, inline completion, batch changes, the detail editor and undo.
 * Saving failures block navigation and follow-up writes; explicit reload/delete may discard. Pending input survives outside
 * refreshes. The resident Assistant hears about a todo through its page message, with the todo as the object and its details as
 * material; handing over needs a real click here, anything else is only offered to it. Built with esbuild into the plugin's client
 * pack (src/client.ts reads the bundle); type-checked by tsconfig.browser.json.
 */
export function todoClient(host: TodoClientHost): void {
  const bench = document.querySelector<HTMLElement>("[data-todo=workbench]");
  if (!bench) return;
  const page = todoPage(host, bench);
  installList(page);
  installBatch(page);
  installReminders(page);
  installReview(page);
  installDetail(page);
  installQuick(page);
  listen(page);

  // The batch menu is drawn without the project's name, and in the personal space there is no project to move into.
  const batchProject = bench.querySelector<HTMLElement>('[data-todo-batch-placement="project"]');
  if (batchProject) { batchProject.textContent = page.hereName(); batchProject.hidden = !page.projectId(); }
  page.paintPlaces(page.el.quickPlacement, page.quickDefaultPlacement(), "data-todo-quick-placement-choice");
  page.publishContext();
  void page.load().catch((error: Error) => { page.el.loading.hidden = true; page.showNote(error.message || host.translate("todo.error.not-open"), { error: true }); });
}
