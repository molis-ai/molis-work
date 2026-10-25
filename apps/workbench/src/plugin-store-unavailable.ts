import { escapeHtml, icon, renderIconSprite, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import type { ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { renderWorkbenchDocument } from "./document-shell.js";
import { renderUnavailablePluginStatus } from "./unavailable-plugin-stage.js";
import type { WorkbenchRendererPorts } from "./renderer.js";

/** A static failure document has no plugin client, snapshot or execution authority. Membership is explicitly the stored display projection. */
export function renderPluginStoreUnavailablePage(input: {
  project: { project_id: string; display_name: string } | null;
  membership: ProjectPluginMembership;
  reason: string;
  reloadHref: string;
  desktopShell: boolean;
}, locale: { L(text: string, values?: Record<string, string | number>): string; htmlLang(): string; desktop: WorkbenchRendererPorts["desktop"] }): string {
  const { L } = locale;
  const plugins = [...new Set([...input.membership.plugins, ...input.membership.hidden])];
  const members = plugins.map(pluginId => {
    const entry = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === pluginId);
    const hidden = input.membership.hidden.includes(pluginId);
    return `<li data-stored-project-plugin="${escapeHtml(pluginId)}" data-plugin-hidden="${hidden}">${escapeHtml(L(entry?.manifest.name ?? pluginId))}${hidden ? ` · ${escapeHtml(L("已隐藏"))}` : ""}</li>`;
  }).join("");
  // These are failure/status entries, not derived project members. Never invoke a running contribution while its ledger is unreadable.
  const statuses = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.runtime?.scope === "home").map(entry =>
    `<section class="mw-frame__panel" data-work-surface="${escapeHtml(entry.project_plugin_id)}" data-home-plugin-unavailable="workbench">${renderUnavailablePluginStatus({
      surface: entry.project_plugin_id, label: entry.manifest.name, scope: "home", reason: L("Home 插件运行库不可用"),
    }, L)}</section>`).join("");
  const html = renderWorkbenchDocument({
    lang: locale.htmlLang(), title: L("Home 插件运行库不可用"),
    head_html: `<script>${THEME_BOOTSTRAP_SCRIPT}${locale.desktop.bootstrapScript}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"><style>body[data-home-plugin-store-unavailable] .mw-btn { min-height: var(--control-h); min-width: var(--control-h); }</style>`,
    body_attributes: { class: "settings-page project-preferences-page global-preferences-page", "data-home-plugin-store-unavailable": true,
      "data-desktop-shell": "false", "data-native-desktop": input.desktopShell ? "true" : false, style: "--control-h:44px" },
    body_html: `${renderIconSprite()}<header class="project-preferences-chrome"${input.desktopShell ? ' data-tauri-drag-region="deep"' : ""}><span>${escapeHtml(input.project?.display_name ?? "Molis Work")}</span><a class="mw-btn mw-btn--ghost mw-btn--icon-only" href="/" aria-label="${escapeHtml(L("返回项目列表"))}" title="${escapeHtml(L("返回项目列表"))}">${icon("x")}</a></header>
      <main class="settings-shell settings-shell--standalone"><div class="settings-content" style="overflow-wrap:anywhere;min-width:0">
        <section class="mw-empty" role="alert"><h1>${escapeHtml(L("Home 插件运行库不可用"))}</h1><p>${escapeHtml(input.reason)}</p>
          <p>${escapeHtml(L("请查看插件状态，恢复运行库后重新加载页面。"))}</p><a class="mw-btn mw-btn--secondary" href="${escapeHtml(input.reloadHref)}">${escapeHtml(L("重新加载页面"))}</a></section>
        ${input.project ? `<section><h2>${escapeHtml(L("已保存的项目插件"))}</h2>${members ? `<ul>${members}</ul>` : `<p>${escapeHtml(L("没有已保存的项目插件"))}</p>`}</section>` : ""}
        ${statuses}
      </div></main>`,
  });
  return input.desktopShell ? locale.desktop.appendDesktopQueryToLocalHrefs(html) : html;
}
