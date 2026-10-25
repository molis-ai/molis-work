import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { actionEffect } from "@molis-ai/molis-work-contracts/platform/actions";
import { UI_VIEW_GROUPS, UI_VIEW_RAILS, type UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";

// The checks for where a view says its plugin is listed, made new and started from (W5-06 2b): its icon, its rail `group`,
// what it `creates` and its project home `start`. Only a view that opens its plugin from the rail (`navigator`, `island`) may say
// the last three; its rail place (`rail`) and Dock default (`pinned_default`) are a `navigator` view's alone, and the read action
// that gives a settings page its data (`settings_data`) a `settings` view's (W5-02 PR-D).
// Returns every problem and never throws, appended after the older view checks.

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const words = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const GROUPS: ReadonlySet<string> = new Set(UI_VIEW_GROUPS);
const RAILS: ReadonlySet<string> = new Set(UI_VIEW_RAILS);

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
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
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
  const opens = view.slot === "navigator" || view.slot === "island";
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
  const data: unknown = view.settings_data;
  if (data !== undefined) {
    if (view.slot !== "settings") problems.push(`视图 ${id} 的 settings_data 只用于 settings 视图`);
    if (!isObject(data) || !words(data.action)) problems.push(`视图 ${id} 的 settings_data 必须写明 action`);
    else if (!readables.has(data.action)) problems.push(`视图 ${id} 的 settings_data 指向 ${data.action}，本 Manifest 没有这个只读、面向用户（audience user）、只有一个版本的查询动作`);
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
