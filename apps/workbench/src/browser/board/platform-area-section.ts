import { TASK_GRANTS_AREA_HEIGHTS, taskGrantRows, taskGrantsAreaHtml, type TaskGrantsLine } from "../plugin-frame/task-grants-area.js";
import type { TaskGrantCategory, TaskGrantCategoryState } from "@molis-ai/molis-work-contracts/services/agent-task-grants";

/**
 * The program of the board's 平台区域 section (apps/workbench/src/platform-area-specimens.ts): it draws the reads area with the
 * shell's own markup (src/browser/plugin-frame/task-grants-area.ts) at its real heights, so the specimens are what a plugin page
 * shows. The categories are sample data; nothing reads or writes.
 */
const t = globalThis.t.text;

const category = (provider_id: string, title: string, description: string, group_id?: string): TaskGrantCategory =>
  ({ provider_id, ...(group_id ? { group_id } : {}), title, description, plugin_id: provider_id.replace(/^plugin\./, "") });

function sampleCategories(): TaskGrantCategory[] {
  return [
    category("plugin.todo", t("workbench.catalog-board.core.pa-todo-title"), t("workbench.catalog-board.core.pa-todo-desc")),
    category("plugin.schedule", t("workbench.catalog-board.core.pa-schedule-title"), t("workbench.catalog-board.core.pa-schedule-desc"), "events"),
    category("plugin.pages", t("workbench.catalog-board.core.pa-pages-title"), t("workbench.catalog-board.core.pa-pages-desc")),
    category("plugin.inbox", t("workbench.catalog-board.core.pa-inbox-title"), t("workbench.catalog-board.core.pa-inbox-desc")),
    category("plugin.feed", t("workbench.catalog-board.core.pa-feed-title"), t("workbench.catalog-board.core.pa-feed-desc")),
  ];
}

function renderPlatformAreaSpecimens(): void {
  const categories = sampleCategories();
  const held = (index: number, status: TaskGrantCategoryState["status"]): TaskGrantCategoryState => ({ ...categories[index]!, status });
  /** Every status a row has: on, off, new reading to allow, plugin away, and one no longer offered (shown after the offered ones). */
  const mixed = { categories: categories.slice(0, 4), subject: { revision: "r1", categories: [held(0, "granted"), held(2, "needs_confirmation"), held(3, "unavailable"), held(4, "removed")] } };
  const quiet = { categories, subject: { revision: "r1", categories: [held(0, "granted"), held(1, "granted")] } };
  const owner = t("workbench.catalog-board.core.pa-owner");
  const idle: TaskGrantsLine = { text: t("workbench.platform-area-section.a-switch-takes-effect-at-once-the") };

  /** One area as the shell holds it: a fixed width, the height step that width gets, the shell's markup inside. */
  const area = (width: number, reads: typeof mixed, lineText: TaskGrantsLine, options: { unready?: boolean; busy?: boolean } = {}): HTMLElement => {
    const surface = document.createElement("section");
    surface.className = "mw-platform-area";
    surface.style.width = width + "px";
    surface.style.height = (width < 480 ? TASK_GRANTS_AREA_HEIGHTS.narrow : TASK_GRANTS_AREA_HEIGHTS.wide) + "px";
    surface.innerHTML = taskGrantsAreaHtml(t, owner, taskGrantRows(reads), lineText, Boolean(options.busy));
    if (options.unready) {
      surface.dataset.unready = "";
      surface.querySelectorAll("[data-framed-control]").forEach(control => control.setAttribute("aria-disabled", "true"));
    }
    return surface;
  };

  /** Only the foot of an area, at the given width: the one line, in each thing it can say. */
  const line = (width: number, said: TaskGrantsLine): HTMLElement => {
    const surface = document.createElement("section");
    surface.className = "mw-platform-area mw-pa-board__line";
    surface.style.width = width + "px";
    surface.innerHTML = taskGrantsAreaHtml(t, owner, [], said, false);
    surface.querySelector("[data-framed-area-head]")?.remove();
    surface.querySelector(".mw-platform-area__body")?.remove();
    return surface;
  };

  const put = (name: string, ...parts: HTMLElement[]) => document.querySelector(`[data-platform-area-specimen="${name}"]`)?.replaceChildren(...parts);
  put("wide", area(560, mixed, idle));
  put("narrow", area(320, quiet, { text: t("workbench.task-grants-area.allowed", { name: categories[1]!.title }), act: "undo" }));
  put("unready", area(560, quiet, idle, { unready: true }));
  put("busy", area(560, quiet, idle, { busy: true }));
  put("empty", area(560, { categories: [], subject: { revision: "", categories: [] } }, idle));
  const name = { name: categories[0]!.title };
  const lines: TaskGrantsLine[] = [
    idle,
    { text: t("workbench.task-grants-area.withdrawn", name), act: "undo" },
    { text: t("workbench.task-grants-area.new-data-allowed", name) },
    { text: t("workbench.task-grants-area.withdrawn-new-data", name) },
    { text: t("workbench.task-grants-area.change-undone") },
    { text: t("workbench.platform-area-section.changed-elsewhere-refreshed") },
    { text: t("workbench.task-grants-area.area-moved") },
    { text: t("workbench.task-grants-area.reveal") },
    { text: t("workbench.platform-area-section.not-saved-the-permissions-are-as-they"), act: "retry", tone: "danger" },
    { text: t("workbench.platform-area-section.cannot-read-what-this-task-may-read"), act: "read", tone: "danger" },
  ];
  put("lines-wide", ...lines.map(said => line(560, said)));
  put("lines-narrow", ...lines.slice(1, 4).concat(lines[8]!).map(said => line(320, said)));
}

renderPlatformAreaSpecimens();
document.addEventListener("molis-work:language-changed", renderPlatformAreaSpecimens);
