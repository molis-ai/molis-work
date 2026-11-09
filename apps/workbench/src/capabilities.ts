import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { ActionSceneUsage, ActionSceneView, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { JudgmentRecord } from "@molis-ai/molis-work-contracts/modules/functions";
import type { SettingsRenderPrimitives } from "./settings-renderer.js";
import type { WebProjectNavigation } from "./settings-navigation.js";
import { renderCallRow, type CallRowView } from "./call-row.js";
import { withPluginWords } from "./i18n.js";

export type CapabilitySection = "library" | "connections" | "access" | "history";
export interface CapabilitiesView {
  rules?: boolean;
  section: CapabilitySection;
  actions: readonly ActionView[];
  selected?: ActionView;
  selection_error?: string;
  scenes?: readonly ActionSceneView[];
  usages?: readonly ActionSceneUsage[];
  /** Home event actions that offer this capability. */
  offered_in?: readonly { provider: string; title: string }[];
  /** Saved references reported by their owners (workflow steps, Character scopes, client grants). */
  reported_usages?: readonly { usage_id: string; title: string; detail?: string; enabled: boolean; href?: string; reporter: string }[];
  usage_issues?: readonly string[];
  history?: readonly JudgmentRecord[];
  /** Recent calls in this scope: what was called, for whom, how it ended (`refused`: turned away, so it did not run). No inputs are kept; a message only for a command that ran and failed. */
  calls?: readonly CallRowView[];
  query: string;
  kind: string;
  /** Synthetic content is only supplied by the preview fixture. */
  preview?: boolean;
}

const sections = [
  ["library", "能力库", "book"], ["connections", "服务连接", "link"],
  ["access", "对外接入", "shield"], ["history", "调用记录", "workflow"],
] as const;
const kinds: Record<string, string> = { query: "workbench.capabilities.query", judgment: "workbench.capabilities.evaluation", operation: "workbench.capabilities.action", navigation: "workbench.capabilities.open-page" };

export function createCapabilitiesRenderer(p: SettingsRenderPrimitives, model: CapabilitiesView, project: WebProjectNavigation | null, projects: readonly WebProjectNavigation[], desktop: boolean) {
  const { L, escapeHtml: e, icon } = p;
  // An action's title, description and input words are its provider's own text: English from that Plugin's own words, whoever published it.
  const own = (action: ActionView, text: string) => withPluginWords(action.provider.plugin_id ?? "", () => uiText.text(text));
  function href(section: CapabilitySection, extra: Record<string, string> = {}): string {
    const query = new URLSearchParams({ ...(project ? { project: project.project_id } : {}), ...(desktop ? { desktop: "1" } : {}), ...extra });
    return `/capabilities/${section}${query.size ? `?${e(query.toString())}` : ""}`;
  }
  const filters = { ...(model.query ? { q: model.query } : {}), ...(model.kind ? { kind: model.kind } : {}) };
  const navigation = `<nav class="settings-navigation settings-navigation--codex" aria-label="${uiText("workbench.capabilities.capability-service")}"><a class="settings-nav-back" href="${desktop ? p.withDesktopQuery(project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/") : project ? `/projects/${encodeURIComponent(project.project_id)}/` : "/"}">${icon("back")}${uiText("workbench.capabilities.back-workbench")}</a><div class="settings-project-identity"><strong>${uiText("workbench.capabilities.capabilities")}</strong><span>${uiText("workbench.capabilities.system-service")}</span></div><div class="settings-nav-body">${sections.map(([id, label, glyph]) => `<a href="${href(id)}"${model.section === id ? ' aria-current="page"' : ""}>${icon(glyph)}${L(label)}</a>`).join("")}</div></nav>`;
  function scopeForm(): string {
    return `<form class="capability-filters" action="/capabilities/${model.section}" method="get">${desktop ? '<input type="hidden" name="desktop" value="1">' : ""}<label>${uiText("workbench.capabilities.scope")}<select name="project" aria-label="${uiText("workbench.capabilities.capability-scope")}"><option value="">${uiText("workbench.capabilities.global-capabilities")}</option>${projects.map(item => `<option value="${e(item.project_id)}"${project?.project_id === item.project_id ? " selected" : ""}>${e(item.display_name)}</option>`).join("")}</select></label>${model.section === "library" ? `<label class="capability-search">${uiText("workbench.capabilities.search")}<input type="search" name="q" value="${e(model.query)}" placeholder="${uiText("workbench.capabilities.name-purpose-provider")}"></label><label>${uiText("workbench.capabilities.type")}<select name="kind"><option value="">${uiText("workbench.capabilities.all-types")}</option>${Object.entries(kinds).map(([id, label]) => `<option value="${id}"${model.kind === id ? " selected" : ""}>${L(label)}</option>`).join("")}</select></label>` : ""}<button class="mw-btn mw-btn--secondary" type="submit">${uiText("workbench.capabilities.update-list")}</button></form>`;
  }
  function status(action: ActionView): string {
    return `<span class="capability-status${action.availability.available ? "" : " is-unavailable"}">${uiText(action.availability.available ? "workbench.capabilities.available" : "workbench.capabilities.unavailable")}</span>`;
  }
  const AUDIENCE: Record<string, string> = { user: "workbench.capabilities.used-directly-app-home", agent: "workbench.capabilities.built-agent-characters-can-select", workflow: "workbench.capabilities.workflows-can-call", mcp: "workbench.capabilities.external-mcp-clients-can-call-once-granted", plugin: "workbench.capabilities.other-plugins-can-call" };
  const link = (title: string, target?: string) => target?.startsWith("/") && !target.startsWith("//") ? `<a href="${e(desktop ? p.withDesktopQuery(target) : target)}">${e(title)}</a>` : e(title);
  function uses(action: ActionView): string {
    const available = [
      ...action.action.audiences.filter(audience => AUDIENCE[audience]).map(audience => `<li><strong>${uiText(AUDIENCE[audience]!)}</strong></li>`),
      ...(model.offered_in ?? []).map(offer => `<li><strong>${uiText("workbench.capabilities.home-item")} · ${e(offer.title)}</strong><span>${e(offer.provider)}</span></li>`),
      ...(action.action.kind === "judgment" ? (model.scenes ?? []).map(scene => `<li><strong>${e(scene.definition.title)}</strong><span>${e(scene.definition.trigger)}</span><span>${!scene.compatible ? e(scene.reason ?? uiText.text("workbench.capabilities.input-output-incompatible")) : !scene.availability.available ? e(scene.availability.reason) : uiText("workbench.capabilities.compatible-contract")}</span></li>`) : []),
    ];
    const used = [
      ...(model.usages ?? []).map(usage => `<li><strong>${link(usage.title, usage.href)}</strong><span>${uiText(usage.enabled ? "workbench.capabilities.enabled" : "workbench.capabilities.switched-off")}${!usage.availability.available ? ` · ${e(usage.availability.reason)}` : ""}</span></li>`),
      ...(model.reported_usages ?? []).map(usage => `<li><strong>${link(usage.title, usage.href)}</strong>${usage.detail ? `<span>${e(usage.detail)}</span>` : ""}<span>${e(usage.reporter)} · ${uiText(usage.enabled ? "workbench.capabilities.enabled" : "workbench.capabilities.switched-off")}</span></li>`),
    ];
    const noScenes = action.action.kind === "judgment" && !model.scenes?.length ? `<p>${uiText("workbench.capabilities.no-consumer-scenes-registered-scope-choose-project-check")}</p>` : "";
    return `<section><h3>${uiText("workbench.capabilities.compatible-uses")}</h3>${available.length ? `<ul class="capability-uses">${available.join("")}</ul>` : `<p>${uiText("workbench.capabilities.only-its-own-plugin-uses-capability")}</p>`}${noScenes}`
      + `<h3>${uiText("workbench.capabilities.current-uses")}</h3>${used.length ? `<ul class="capability-uses">${used.join("")}</ul>` : `<p>${uiText("workbench.capabilities.nothing-scope-uses-yet")}</p>`}`
      + (model.usage_issues ?? []).map(issue => `<p class="capability-unavailable" role="status">${e(issue)}</p>`).join("") + `</section>`;
  }
  function detail(action: ActionView): string {
    const properties = action.action.input_schema.properties as Record<string, Record<string, unknown>> | undefined;
    const required = action.action.input_schema.required as readonly string[] | undefined;
    const schema = (label: string, value: unknown) => `<details class="capability-contract"><summary>${uiText(label)}</summary><pre>${e(JSON.stringify(value, null, 2))}</pre></details>`;
    return `<article class="capability-detail"><a class="capability-back" href="${href("library", filters)}">${icon("back")}${uiText("workbench.capabilities.back-capabilities")}</a><header><div class="capability-detail-meta">${e(action.provider.title)} · ${uiText(kinds[action.action.kind]!)} ${status(action)}</div><h2>${e(own(action, action.action.title))}</h2><p>${e(own(action, action.action.description))}</p></header>${!action.availability.available ? `<p class="capability-unavailable" role="status">${e(action.availability.reason)}</p>` : ""}
      <section><h3>${uiText("workbench.capabilities.required-input")}</h3>${properties && Object.keys(properties).length ? `<dl class="capability-fields">${Object.entries(properties).map(([name, field]) => `<div><dt><code>${e(name)}</code><small>${uiText(required?.includes(name) ? "workbench.capabilities.required" : "workbench.capabilities.optional")}</small></dt><dd>${e(typeof (field.description ?? field.title) === "string" ? own(action, String(field.description ?? field.title)) : field.type ?? uiText.text("workbench.capabilities.structured-input"))}</dd></div>`).join("")}</dl>` : `<p>${uiText("workbench.capabilities.review-input-contract-supply-required-parameters")}</p>`}${schema("workbench.capabilities.view-input-contract", action.action.input_schema)}${action.action.output_schema ? schema("workbench.capabilities.view-result-contract", action.action.output_schema) : `<p>${uiText("workbench.capabilities.capability-does-not-declare-fixed-result-structure")}</p>`}</section>
      ${uses(action)}
      <section><h3>${uiText("workbench.capabilities.call-requirements")}</h3><p>${uiText("workbench.capabilities.scope-2")}：${uiText(action.action.scope === "home" ? "workbench.capabilities.everywhere" : "workbench.capabilities.project")}</p><p>${uiText("workbench.capabilities.required-permissions")}：${e(action.action.permissions.join(", ") || uiText.text("workbench.capabilities.no-additional-permissions"))}</p><details class="capability-contract"><summary>${uiText("workbench.capabilities.capability-identity")}</summary><p><code>${e(action.capability_id)}@${action.version}</code></p></details></section></article>`;
  }
  function library(): string {
    const needle = model.query.trim().toLocaleLowerCase();
    const actions = model.actions.filter(item => (!model.kind || item.action.kind === model.kind) && (!needle || `${item.action.title} ${item.action.description} ${item.provider.title} ${item.capability_id}`.toLocaleLowerCase().includes(needle)));
    return `<section class="capability-library${(model.selected || model.selection_error) ? " has-selection" : ""}"><header class="capability-heading"><h1>${uiText("workbench.capabilities.capability-library")}</h1><a class="capability-rules-link" href="${href("library").replace("/capabilities/library", "/capabilities/rules")}">${uiText("workbench.capabilities.edit-judgment-rules")}</a><p>${uiText("workbench.capabilities.see-what-each-capability-does-what-requires")}</p>${model.preview ? `<p role="status">${uiText("workbench.capabilities.interactive-preview-sample-data-no-real-operations")}</p>` : ""}${scopeForm()}</header><div class="capability-browser"><section class="capability-index" aria-label="${uiText("workbench.capabilities.capabilities-2")}"><p class="capability-count" role="status">${uiText("workbench.capabilities.count-count", { count: actions.length })}</p><nav>${actions.map(action => `<a class="capability-row" href="${href("library", { ...filters, action: action.capability_id, version: String(action.version) })}"${action.capability_id === model.selected?.capability_id && action.version === model.selected.version ? ' aria-current="true"' : ""}><span><strong>${e(own(action, action.action.title))}</strong><small>${e(action.provider.title)} · ${uiText(kinds[action.action.kind]!)} · v${action.version}</small></span>${status(action)}</a>`).join("")}</nav>${actions.length ? "" : `<div class="settings-empty"><strong>${uiText(model.actions.length ? "workbench.capabilities.no-matching-capabilities" : "workbench.capabilities.no-capabilities-scope")}</strong><span>${uiText("workbench.capabilities.try-another-search-choose-different-project")}</span></div>`}</section>${model.selected ? detail(model.selected) : `<div class="capability-empty">${model.selection_error ? `<a class="capability-back" href="${href("library", filters)}">${uiText("workbench.capabilities.back-capabilities")}</a>` : ""}<h2>${uiText(model.selection_error ? "workbench.capabilities.capability-unavailable" : "workbench.capabilities.select-capability")}</h2><p>${e(uiText.text(model.selection_error ?? "workbench.capabilities.review-its-purpose-required-input-current-uses"))}</p></div>`}</div></section>`;
  }
  function history(): string {
    const calls = model.calls ?? [];
    const callList = calls.length ? `<div class="capability-history">${calls.map(row => renderCallRow(row, p)).join("")}</div>`
      : `<div class="settings-empty"><strong>${uiText("workbench.capabilities.no-operations-have-run-scope-yet")}</strong><span>${uiText("workbench.capabilities.operations-run-app-home-workflows-agent-mcp-appear")}</span></div>`;
    const judgments = model.history?.length ? `<div class="capability-history">${model.history.map(row => `<article><header><strong>${e(row.function_key)} · v${row.function_version}</strong><span>${e(row.outcome)}</span></header><p>${e(row.scene_id ?? uiText.text("workbench.capabilities.direct-call"))} · ${e(row.subject.id)}</p><time datetime="${e(row.created_at)}">${e(row.created_at)}</time>${row.error_code ? `<p>${uiText("workbench.capabilities.reason-failure")}：${e(row.error_code)}</p>` : ""}${row.suggested_behavior_ids.length ? `<p>${uiText("workbench.capabilities.recommendation")}：${e(row.suggested_behavior_ids.join(", "))}</p>` : ""}</article>`).join("")}</div>`
      : `<div class="settings-empty"><strong>${uiText("workbench.capabilities.no-judgment-records-scope")}</strong><span>${uiText("workbench.capabilities.records-appear-here-after-rule-runs-saves-its")}</span></div>`;
    return `<section class="settings-document"><header class="settings-heading"><h1>${uiText("workbench.capabilities.call-history")}</h1><p>${uiText("workbench.capabilities.recent-operations-saved-judgments-only-who-called-what")}</p><p>${uiText("workbench.capabilities.each-record-has-diagnostic-id-copy-look-up", { link: "\uFFF0" }).replace("\uFFF0", `<a href="${e(p.settingsContextHref("/settings/diagnostics", project, desktop))}">${uiText("workbench.capabilities.settings-diagnostics")}</a>`)}</p>${scopeForm()}</header>`
      + `<section><h2>${uiText("workbench.capabilities.action")}</h2>${callList}</section><section><h2>${uiText("workbench.capabilities.judgments")}</h2>${judgments}</section></section>`;
  }
  return { navigation, library, history };
}
