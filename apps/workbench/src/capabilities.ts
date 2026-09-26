import type { ActionSceneUsage, ActionSceneView, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import type { WebProjectNavigation } from "./settings-navigation.js";

export type CapabilitySection = "library" | "connections" | "access" | "history";
export interface CapabilitiesView {
  rules?: boolean;
  section: CapabilitySection;
  actions: readonly ActionView[];
  selected?: ActionView;
  selection_error?: string;
  scenes?: readonly ActionSceneView[];
  usages?: readonly ActionSceneUsage[];
  history?: readonly JudgmentRecord[];
  query: string;
  kind: string;
  /** Synthetic content is only supplied by the preview fixture. */
  preview?: boolean;
}

const sections = [
  ["library", "能力库", "book"], ["connections", "服务连接", "link"],
  ["access", "对外接入", "shield"], ["history", "调用记录", "workflow"],
] as const;
const kinds: Record<string, string> = { query: "查询", judgment: "判断", operation: "操作", navigation: "打开页面" };

export function createCapabilitiesRenderer(p: SettingsRenderPrimitives, model: CapabilitiesView, project: WebProjectNavigation | null, projects: readonly WebProjectNavigation[], desktop: boolean) {
  const { L, escapeHtml: e, icon } = p;
  function href(section: CapabilitySection, extra: Record<string, string> = {}): string {
    const query = new URLSearchParams({ ...(project ? { project: project.project_id } : {}), ...(desktop ? { desktop: "1" } : {}), ...extra });
    return `/capabilities/${section}${query.size ? `?${e(query.toString())}` : ""}`;
  }
  const filters = { ...(model.query ? { q: model.query } : {}), ...(model.kind ? { kind: model.kind } : {}) };
  const navigation = `<nav class="settings-navigation settings-navigation--codex" aria-label="${L("能力服务")}"><a class="settings-nav-back" href="${desktop ? p.withDesktopQuery(project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/") : project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/"}">${icon("back")}${L("返回工作台")}</a><div class="settings-project-identity"><strong>${L("能力")}</strong><span>${L("系统服务")}</span></div><div class="settings-nav-body">${sections.map(([id, label, glyph]) => `<a href="${href(id)}"${model.section === id ? ' aria-current="page"' : ""}>${icon(glyph)}${L(label)}</a>`).join("")}</div></nav>`;
  function scopeForm(): string {
    return `<form class="capability-filters" action="/capabilities/${model.section}" method="get">${desktop ? '<input type="hidden" name="desktop" value="1">' : ""}<label>${L("范围")}<select name="project" aria-label="${L("能力范围")}"><option value="">${L("全局能力")}</option>${projects.map(item => `<option value="${e(item.project_id)}"${project?.project_id === item.project_id ? " selected" : ""}>${e(item.display_name)}</option>`).join("")}</select></label>${model.section === "library" ? `<label class="capability-search">${L("搜索")}<input type="search" name="q" value="${e(model.query)}" placeholder="${L("名称、用途或来源")}"></label><label>${L("类型")}<select name="kind"><option value="">${L("全部类型")}</option>${Object.entries(kinds).map(([id, label]) => `<option value="${id}"${model.kind === id ? " selected" : ""}>${L(label)}</option>`).join("")}</select></label>` : ""}<button class="mw-btn mw-btn--secondary" type="submit">${L("更新列表")}</button></form>`;
  }
  function status(action: ActionView): string {
    return `<span class="capability-status${action.availability.available ? "" : " is-unavailable"}">${L(action.availability.available ? "可使用" : "不可用")}</span>`;
  }
  function detail(action: ActionView): string {
    const properties = action.action.input_schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = action.action.input_schema.required as readonly string[] | undefined;
    const schema = (label: string, value: unknown) => `<details class="capability-contract"><summary>${L(label)}</summary><pre>${e(JSON.stringify(value, null, 2))}</pre></details>`;
    return `<article class="capability-detail"><a class="capability-back" href="${href("library", filters)}">${icon("back")}${L("返回能力列表")}</a><header><div class="capability-detail-meta">${e(action.provider.title)} · ${L(kinds[action.action.kind]!)} ${status(action)}</div><h2>${e(action.action.title)}</h2><p>${e(action.action.description)}</p></header>${!action.availability.available ? `<p class="capability-unavailable" role="status">${e(action.availability.reason)}</p>` : ""}
      <section><h3>${L("需要提供什么")}</h3>${properties && Object.keys(properties).length ? `<dl class="capability-fields">${Object.entries(properties).map(([name, field]) => `<div><dt><code>${e(name)}</code><small>${L(required?.includes(name) ? "必填" : "可选")}</small></dt><dd>${e(field.description ?? field.title ?? field.type ?? L("结构化输入"))}</dd></div>`).join("")}</dl>` : `<p>${L("查看输入合同，按调用场景提供参数。")}</p>`}${schema("查看输入合同", action.action.input_schema)}${action.action.output_schema ? schema("查看返回结果合同", action.action.output_schema) : `<p>${L("此能力未声明固定的结果结构。")}</p>`}</section>
      ${action.action.kind === "judgment" ? `<section><h3>${L("可用在哪")}</h3>${model.scenes?.length ? `<ul class="capability-uses">${model.scenes.map(scene => `<li><strong>${e(scene.definition.title)}</strong><span>${e(scene.definition.trigger)}</span><span>${!scene.compatible ? e(scene.reason ?? L("输入输出不兼容")) : !scene.availability.available ? e(scene.availability.reason) : L("合同兼容")}</span></li>`).join("")}</ul>` : `<p>${L("当前范围还没有注册的消费场景。可切换到项目查看。")}</p>`}<h3>${L("已用在哪")}</h3>${model.usages?.length ? `<ul class="capability-uses">${model.usages.map(usage => `<li><strong>${usage.href?.startsWith("/") && !usage.href.startsWith("//") ? `<a href="${e(desktop ? p.withDesktopQuery(usage.href) : usage.href)}">${e(usage.title)}</a>` : e(usage.title)}</strong><span>${L(usage.enabled ? "已启用" : "已停用")}${!usage.availability.available ? ` · ${e(usage.availability.reason)}` : ""}</span></li>`).join("")}</ul>` : `<p>${L("当前范围没有使用绑定。")}</p>`}</section>` : ""}
      <section><h3>${L("调用条件")}</h3><p>${L("作用范围")}：${L(action.action.scope === "home" ? "全局" : "项目")}</p><p>${L("所需权限")}：${e(action.action.permissions.join(", ") || L("无额外权限"))}</p><details class="capability-contract"><summary>${L("能力身份")}</summary><p><code>${e(action.capability_id)}@${action.version}</code></p></details></section></article>`;
  }
  function library(): string {
    const needle = model.query.trim().toLocaleLowerCase();
    const actions = model.actions.filter(item => (!model.kind || item.action.kind === model.kind) && (!needle || `${item.action.title} ${item.action.description} ${item.provider.title} ${item.capability_id}`.toLocaleLowerCase().includes(needle)));
    return `<section class="capability-library${(model.selected || model.selection_error) ? " has-selection" : ""}"><header class="capability-heading"><h1>${L("能力库")}</h1><a class="capability-rules-link" href="${href("library").replace("/capabilities/library", "/capabilities/rules")}">${L("编辑判断规则")}</a><p>${L("查看能做什么，以及当前使用条件。")}</p>${model.preview ? `<p role="status">${L("交互预览 · 示例数据，不会执行真实操作")}</p>` : ""}${scopeForm()}</header><div class="capability-browser"><section class="capability-index" aria-label="${L("能力列表")}"><p class="capability-count" role="status">${L("共 {count} 项", { count: actions.length })}</p><nav>${actions.map(action => `<a class="capability-row" href="${href("library", { ...filters, action: action.capability_id, version: String(action.version) })}"${action.capability_id === model.selected?.capability_id && action.version === model.selected.version ? ' aria-current="true"' : ""}><span><strong>${e(action.action.title)}</strong><small>${e(action.provider.title)} · ${L(kinds[action.action.kind]!)} · v${action.version}</small></span>${status(action)}</a>`).join("")}</nav>${actions.length ? "" : `<div class="settings-empty"><strong>${L(model.actions.length ? "没有符合条件的能力" : "当前范围还没有能力")}</strong><span>${L("尝试其他搜索条件，或切换项目范围。")}</span></div>`}</section>${model.selected ? detail(model.selected) : `<div class="capability-empty">${model.selection_error ? `<a class="capability-back" href="${href("library", filters)}">${L("返回能力列表")}</a>` : ""}<h2>${L(model.selection_error ? "能力已不可访问" : "选择一项能力")}</h2><p>${e(L(model.selection_error ?? "查看用途、所需输入和实际使用位置。"))}</p></div>`}</div></section>`;
  }
  function history(): string {
    return `<section class="settings-document"><header class="settings-heading"><h1>${L("调用记录")}</h1><p>${L("当前显示已保存的判断记录，其他能力的调用记录尚未接入。")}</p>${scopeForm()}</header><div class="capability-history">${model.history?.length ? model.history.map(row => `<article><header><strong>${e(row.function_key)} · v${row.function_version}</strong><span>${e(row.outcome)}</span></header><p>${e(row.scene_id ?? L("直接调用"))} · ${e(row.subject.id)}</p><time datetime="${e(row.created_at)}">${e(row.created_at)}</time>${row.error_code ? `<p>${L("失败原因")}：${e(row.error_code)}</p>` : ""}${row.suggested_behavior_ids.length ? `<p>${L("建议")}：${e(row.suggested_behavior_ids.join(", "))}</p>` : ""}</article>`).join("") : `<div class="settings-empty"><strong>${L("当前范围没有判断记录")}</strong><span>${L("规则执行并保存结果后，会显示在这里。")}</span></div>`}</div></section>`;
  }
  return { navigation, library, history };
}
