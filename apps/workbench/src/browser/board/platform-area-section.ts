import { TASK_GRANTS_AREA_HEIGHTS, taskGrantRows, taskGrantsAreaHtml, type TaskGrantsLine } from "../plugin-frame/task-grants-area.js";
import type { TaskGrantCategory, TaskGrantCategoryState } from "@molis-ai/molis-work-contracts/services/agent-task-grants";

/**
 * The program of the board's 平台区域 section (apps/workbench/src/platform-area-specimens.ts): it draws the reads area with the
 * shell's own markup (src/browser/plugin-frame/task-grants-area.ts) at its real heights, so the specimens are what a plugin page
 * shows. The categories are sample data; nothing reads or writes.
 */
const t = globalThis.t.text;
const en = document.documentElement.lang === "en";

const category = (provider_id: string, title: string, description: string, group_id?: string): TaskGrantCategory =>
  ({ provider_id, ...(group_id ? { group_id } : {}), title, description, plugin_id: provider_id.replace(/^plugin\./, "") });
const CATEGORIES = en ? [
  category("plugin.todo", "To-dos", "Titles, due dates and whether each is done"),
  category("plugin.schedule", "Calendar", "Events, times and places this week and next", "events"),
  category("plugin.pages", "Notes", "Titles and text of the pages in this project"),
  category("plugin.inbox", "Inbox", "Senders, subjects and the first lines"),
  category("plugin.feed", "Subscriptions", "Titles and summaries of followed sources"),
] : [
  category("plugin.todo", "待办", "标题、截止日期和是否完成"),
  category("plugin.schedule", "日程", "本周与下周的事件、时间和地点", "events"),
  category("plugin.pages", "笔记", "这个项目里页面的标题和正文"),
  category("plugin.inbox", "收件箱", "发件人、主题和开头几行"),
  category("plugin.feed", "订阅", "关注来源的标题和摘要"),
];
const held = (index: number, status: TaskGrantCategoryState["status"]): TaskGrantCategoryState => ({ ...CATEGORIES[index]!, status });
/** Every status a row has: on, off, new reading to allow, plugin away, and one no longer offered (shown after the offered ones). */
const MIXED = { categories: CATEGORIES.slice(0, 4), subject: { revision: "r1", categories: [held(0, "granted"), held(2, "needs_confirmation"), held(3, "unavailable"), held(4, "removed")] } };
const QUIET = { categories: CATEGORIES, subject: { revision: "r1", categories: [held(0, "granted"), held(1, "granted")] } };
const owner = en ? "Calendar" : "日程";
const idle: TaskGrantsLine = { text: t("workbench.platform-area-section.a-switch-takes-effect-at-once-the") };

/** One area as the shell holds it: a fixed width, the height step that width gets, the shell's markup inside. */
function area(width: number, reads: typeof MIXED, line: TaskGrantsLine, options: { unready?: boolean; busy?: boolean } = {}): HTMLElement {
  const surface = document.createElement("section");
  surface.className = "mw-platform-area";
  surface.style.width = width + "px";
  surface.style.height = (width < 480 ? TASK_GRANTS_AREA_HEIGHTS.narrow : TASK_GRANTS_AREA_HEIGHTS.wide) + "px";
  surface.innerHTML = taskGrantsAreaHtml(t, owner, taskGrantRows(reads), line, Boolean(options.busy));
  if (options.unready) {
    surface.dataset.unready = "";
    surface.querySelectorAll("[data-framed-control]").forEach(control => control.setAttribute("aria-disabled", "true"));
  }
  return surface;
}

/** Only the foot of an area, at the given width: the one line, in each thing it can say. */
function line(width: number, said: TaskGrantsLine): HTMLElement {
  const surface = document.createElement("section");
  surface.className = "mw-platform-area mw-pa-board__line";
  surface.style.width = width + "px";
  surface.innerHTML = taskGrantsAreaHtml(t, owner, [], said, false);
  surface.querySelector("[data-framed-area-head]")?.remove();
  surface.querySelector(".mw-platform-area__body")?.remove();
  return surface;
}

const put = (name: string, ...parts: HTMLElement[]) => document.querySelector(`[data-platform-area-specimen="${name}"]`)?.replaceChildren(...parts);
put("wide", area(560, MIXED, idle));
put("narrow", area(320, QUIET, { text: t("workbench.task-grants-area.name-allowed-the-next-run-can-read", { name: CATEGORIES[1]!.title }), act: "undo" }));
put("unready", area(560, QUIET, idle, { unready: true }));
put("busy", area(560, QUIET, idle, { busy: true }));
put("empty", area(560, { categories: [], subject: { revision: "", categories: [] } }, idle));
const name = { name: CATEGORIES[0]!.title };
const LINES: TaskGrantsLine[] = [
  idle,
  { text: t("workbench.task-grants-area.name-withdrawn-the-next-run-cannot-read", name), act: "undo" },
  { text: t("workbench.task-grants-area.name-may-read-its-new-data", name) },
  { text: t("workbench.task-grants-area.name-withdrawn-turn-on-to-allow-current-data", name) },
  { text: t("workbench.task-grants-area.change-undone") },
  { text: t("workbench.platform-area-section.changed-elsewhere-refreshed") },
  { text: t("workbench.task-grants-area.this-just-moved") },
  { text: t("workbench.task-grants-area.show-this-whole-area-first") },
  { text: t("workbench.platform-area-section.not-saved-the-permissions-are-as-they"), act: "retry", tone: "danger" },
  { text: t("workbench.platform-area-section.cannot-read-what-this-task-may-read"), act: "read", tone: "danger" },
];
put("lines-wide", ...LINES.map(said => line(560, said)));
put("lines-narrow", ...LINES.slice(1, 4).concat(LINES[8]!).map(said => line(320, said)));
