import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { UI_VIEW_GROUPS, type UiViewDeclaration } from "@molis-ai/molis-work-contracts/platform/ui";

// The checks for where a view says its plugin is listed, made new and started from (W5-06 2b): its icon, its rail `group`,
// what it `creates` and its project home `start`. Only a view that opens its plugin from the rail (`navigator`, `island`) may say
// the last three. Returns every problem and never throws, appended after the older view checks.

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const words = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const GROUPS: ReadonlySet<string> = new Set(UI_VIEW_GROUPS);

/** The station ids the Manifest's own actions can create (`workflow_content` with the `create` role). */
export function createStations(parsed: PluginManifest): ReadonlySet<string> {
  const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
  return new Set(actions.flatMap(action => {
    const station = isObject(action?.action) ? action.action.workflow_content : undefined;
    return isObject(station) && station.role === "create" && words(station.id) ? [station.id] : [];
  }));
}

export function viewPlacementProblems(view: UiViewDeclaration, stations: ReadonlySet<string>): string[] {
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
