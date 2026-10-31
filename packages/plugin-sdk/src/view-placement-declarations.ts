import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionEffect } from "@molis-ai/molis-work-contracts/platform/actions";
import { UI_VIEW_GROUPS, UI_VIEW_HUES, UI_VIEW_RAILS, type UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLUGIN_ICON_NAMES } from "./ui/icon-names.js";

// The checks for where a view says its plugin is listed, made new and started from (W5-06 2b): its icon, its tab-strip `hue` (PG-075), its rail `group`,
// what it `creates` and its project home `start`. Only a view that opens its plugin from the rail (`navigator`, `island`) may say
// the last three; its rail place (`rail`) and Dock default (`pinned_default`) are a `navigator` view's alone, and the read action
// that gives a settings page its data (`settings_data`) a `settings` view's (W5-02 PR-D), and the one that gives a stage its data
// (`stage_data`) the view's that opens the stage, under the same rule (T-133).
// Returns every problem and never throws, appended after the older view checks.

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const words = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const GROUPS: ReadonlySet<string> = new Set(UI_VIEW_GROUPS);
const RAILS: ReadonlySet<string> = new Set(UI_VIEW_RAILS);
const HUES: ReadonlySet<string> = new Set(UI_VIEW_HUES);
const HAN = /\p{Script=Han}/u;
const CONTROL = /[\u0000-\u001f\u007f]/u;
/** The longest English name or title, in Unicode code points: the unit the Host's directory cuts a name to (`apps/workbench/src/plugin-directory.ts`). */
export const ENGLISH_NAME_LIMIT = 80;

/**
 * What is wrong with a declared English name (`name_en`, a view's `title_en`; BL-636), or null: one line of text that says what it
 * shows, so it is exactly what the shell draws. Not blank, no space at either end, no control character (a line break included),
 * no Han character, at most {@link ENGLISH_NAME_LIMIT} code points. `field` is the name the author wrote.
 */
export function englishNameProblem(value: unknown, field: string): string | null {
  if (typeof value !== "string") return `${field} 必须是文字`;
  if (value.trim() === "") return `${field} 不能为空`;
  if (value !== value.trim()) return `${field} 首尾不能有空白`;
  if (CONTROL.test(value)) return `${field} 不能含控制字符或换行`;
  if (HAN.test(value)) return `${field} 必须是英文，不能含汉字`;
  if ([...value].length > ENGLISH_NAME_LIMIT) return `${field} 最多 ${ENGLISH_NAME_LIMIT} 个字符`;
  return null;
}

/** The station ids the Manifest's own actions can create (`workflow_content` with the `create` role). */
export function createStations(parsed: PluginManifest): ReadonlySet<string> {
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  return new Set(actions.flatMap(action => {
    const station = isObject(action?.action) ? action.action.workflow_content : undefined;
    return isObject(station) && station.role === "create" && words(station.id) ? [station.id] : [];
  }));
}

/** The ids of the Manifest's own actions a settings page may read its data with: one version, a query that only reads, for the person. */
export function settingsReadActions(parsed: PluginManifest): ReadonlySet<string> {
  // Entries that are not objects are the shape rules' to report; this cross-declaration read skips them rather than throwing (W1-04).
  const actions = Array.isArray(parsed.actions) ? parsed.actions.filter((action): boolean => isObject(action)) : [];
  const versions = new Map<string, number>();
  for (const action of actions) versions.set(action.capability_id, (versions.get(action.capability_id) ?? 0) + 1);
  return new Set(actions.filter(action => versions.get(action.capability_id) === 1 && action.operation === "query" && isObject(action.action)
    && actionEffect(action.action, action.capability_id) === "read" && Array.isArray(action.action.audiences) && action.action.audiences.includes("user"))
    .map(action => action.capability_id));
}

export function viewPlacementProblems(view: UiViewDeclaration, stations: ReadonlySet<string>, readables: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  const id = view.view_id;
  if (view.icon !== undefined && !words(view.icon)) problems.push(`视图 ${id} 的 icon 必须是图标名`);
  else if (view.icon !== undefined && !(PLUGIN_ICON_NAMES as readonly unknown[]).includes(view.icon)) problems.push(`视图 ${id} 的图标 ${JSON.stringify(view.icon)} 不在平台图标集里`);
  if (view.hue !== undefined && (typeof view.hue !== "string" || !HUES.has(view.hue))) problems.push(`视图 ${id} 的 hue ${String(view.hue)} 不是设计系统的颜色名（${UI_VIEW_HUES.join("、")}）`);
  const opens = view.slot === "navigator" || view.slot === "island";
  if (view.title_en !== undefined) {
    const problem = opens ? englishNameProblem(view.title_en, "title_en") : "title_en 只用于 navigator 或 island 视图";
    if (problem) problems.push(`视图 ${id} 的 ${problem}`);
  }
  for (const field of ["group", "creates", "start"] as const) {
    if (view[field] !== undefined && !opens) problems.push(`视图 ${id} 的 ${field} 只用于 navigator 或 island 视图`);
  }
  if (view.group !== undefined && !GROUPS.has(String(view.group))) {
    problems.push(`视图 ${id} 的 group ${String(view.group)} 不是工作台的分组（${UI_VIEW_GROUPS.join("、")}）`);
  }
  for (const field of ["rail", "pinned_default"] as const) {
    if (view[field] !== undefined && view.slot !== "navigator") problems.push(`视图 ${id} 的 ${field} 只用于 navigator 视图`);
  }
  if (view.rail !== undefined && !RAILS.has(String(view.rail))) problems.push(`视图 ${id} 的 rail ${String(view.rail)} 不是 ${UI_VIEW_RAILS.join(" 或 ")}`);
  if (view.pinned_default !== undefined && view.pinned_default !== true) problems.push(`视图 ${id} 的 pinned_default 只能是 true`);
  if (view.settings_runtimes !== undefined) {
    if (view.slot !== "settings") problems.push(`视图 ${id} 的 settings_runtimes 只用于 settings 视图`);
    if (view.settings_runtimes !== true) problems.push(`视图 ${id} 的 settings_runtimes 只能是 true`);
  }
  const data: unknown = view.settings_data;
  if (data !== undefined) {
    if (view.slot !== "settings") problems.push(`视图 ${id} 的 settings_data 只用于 settings 视图`);
    if (!isObject(data) || !words(data.action)) problems.push(`视图 ${id} 的 settings_data 必须写明 action`);
    else if (!readables.has(data.action)) problems.push(`视图 ${id} 的 settings_data 指向 ${data.action}，本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作`);
  }
  const stage: unknown = view.stage_data;
  if (stage !== undefined) {
    if (view.slot !== "stage" && view.slot !== "navigator") problems.push(`视图 ${id} 的 stage_data 只用于打开舞台的视图（stage 或 navigator）`);
    if (!isObject(stage) || !words(stage.action)) problems.push(`视图 ${id} 的 stage_data 必须写明 action`);
    else if (!readables.has(stage.action)) problems.push(`视图 ${id} 的 stage_data 指向 ${stage.action}，本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作`);
  }
  const creates: unknown = view.creates;
  if (creates !== undefined) {
    if (!isObject(creates) || !words(creates.station) || !words(creates.title)) problems.push(`视图 ${id} 的 creates 必须写明 station 与 title`);
    else if (!stations.has(creates.station)) problems.push(`视图 ${id} 的 creates 指向 ${creates.station}，本 Manifest 没有这个能新建的工作流内容站`);
  }
  const start: unknown = view.start;
  if (start !== undefined) {
    if (!isObject(start) || !words(start.title) || !words(start.hint)) problems.push(`视图 ${id} 的 start 必须写明 title 与 hint`);
    else if (start.icon !== undefined && !words(start.icon)) problems.push(`视图 ${id} 的 start.icon 必须是图标名`);
  }
  return problems;
}

/**
 * A stage's data is the view's that opens the stage: the `stage` view, else the first `navigator` view, as the workbench opens it. Any
 * other view that says `stage_data` would never be read, so the Manifest is refused instead (T-133).
 */
export function stageDataPlacementProblems(views: readonly UiViewDeclaration[]): string[] {
  const opening = views.find(view => view.slot === "stage") ?? views.find(view => view.slot === "navigator");
  return views.filter(view => view.stage_data !== undefined && view !== opening && (view.slot === "stage" || view.slot === "navigator"))
    .map(view => `视图 ${view.view_id} 的 stage_data 只用于打开舞台的视图（${opening?.view_id ?? "无"}）`);
}
