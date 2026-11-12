import { t as uiText, escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderIconSprite, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";
import type { ProjectPluginMembership } from "@molis-ai/molis-work-contracts/modules/projects";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { renderWorkbenchDocument } from "./document-shell.js";
import { renderUnavailablePluginStatus } from "./unavailable-plugin-stage.js";
import { renderOwnerUnavailableCard, type OwnerUnavailableCard } from "./owner-unavailable-card.js";
import type { WorkbenchRendererPorts } from "./renderer.js";

/** The static page has no shell, so no shared copy feedback: these few lines answer its one copy button the same way. */
const COPY_SCRIPT = `document.addEventListener("click",async(e)=>{const b=e.target.closest&&e.target.closest("[data-copy-value]");if(!b)return;try{await navigator.clipboard.writeText(b.dataset.copyValue);b.dataset.copy="done";}catch{b.dataset.copy="failed";}setTimeout(()=>{delete b.dataset.copy;},2500);});`;

/**
 * A page for a part that has no page of its own to hold the card: the project list, a whole project, the Home plugin ledger. It has no
 * plugin client, snapshot or execution authority. `membership` is the stored display projection, given only for the Home plugin ledger,
 * whose page also lists the project's saved plugins and the Home plugins it stopped.
 */
export function renderOwnerUnavailablePage(input: {
  project: { project_id: string; display_name: string } | null;
  card: OwnerUnavailableCard;
  membership?: ProjectPluginMembership;
  desktopShell: boolean;
}, locale: { readText(text: string, values?: Record<string, string | number>): string; htmlLang(): string; desktop: WorkbenchRendererPorts["desktop"] }): string {
  const { readText } = locale, membership = input.membership;
  const members = membership ? [...new Set([...membership.plugins, ...membership.hidden])].map(pluginId => {
    const entry = BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === pluginId);
    const hidden = membership.hidden.includes(pluginId);
    return `<li data-stored-project-plugin="${escapeHtml(pluginId)}" data-plugin-hidden="${hidden}">${escapeHtml((entry?.manifest.name ?? pluginId))}${hidden ? ` · ${escapeHtml(uiText.text("workbench.plugin-store-unavailable.hidden"))}` : ""}</li>`;
  }).join("") : "";
  // These are failure/status entries, not derived project members. Never invoke a running contribution while its ledger is unreadable.
  const statuses = membership ? BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.runtime?.scope === "home").map(entry =>
    `<section class="mw-frame__panel" data-work-surface="${escapeHtml(entry.project_plugin_id)}" data-home-plugin-unavailable="workbench">${renderUnavailablePluginStatus({
      surface: entry.project_plugin_id, label: entry.manifest.name, scope: "home", reason: uiText.text("workbench.plugin-store-unavailable.home-plugin-store-unavailable"),
    }, readText, false)}</section>`).join("") : "";
  const saved = membership && input.project ? `<section><h2>${escapeHtml(uiText.text("workbench.plugin-store-unavailable.saved-project-plugins"))}</h2>${members ? `<ul>${members}</ul>` : `<p>${escapeHtml(uiText.text("workbench.plugin-store-unavailable.no-saved-project-plugins"))}</p>`}</section>` : "";
  const back = uiText.text("workbench.plugin-store-unavailable.back-projects");
  const html = renderWorkbenchDocument({
    lang: locale.htmlLang(), title: uiText.text("workbench.owner-unavailable.title", { part: input.card.title }),
    head_html: `<script>${THEME_BOOTSTRAP_SCRIPT}${locale.desktop.bootstrapScript}${COPY_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"><style>body[data-owner-unavailable-page] .mw-btn { min-height: var(--control-h); min-width: var(--control-h); }</style>`,
    body_attributes: { class: "settings-page project-preferences-page global-preferences-page", "data-owner-unavailable-page": true,
      ...(membership ? { "data-home-plugin-store-unavailable": true } : {}),
      "data-desktop-shell": "false", "data-native-desktop": input.desktopShell ? "true" : false, style: "--control-h:44px" },
    body_html: `${renderIconSprite()}<header class="project-preferences-chrome"${input.desktopShell ? ' data-tauri-drag-region="deep"' : ""}><span>${escapeHtml(input.project?.display_name ?? "Molis Work")}</span><a class="mw-btn mw-btn--ghost mw-btn--icon-only" href="/" aria-label="${escapeHtml(back)}" title="${escapeHtml(back)}">${icon("x")}</a></header>
      <main class="settings-shell settings-shell--standalone"><div class="settings-content" style="overflow-wrap:anywhere;min-width:0">
        ${renderOwnerUnavailableCard(input.card)}
        ${saved}
        ${statuses}
      </div></main>`,
  }, { languageScript: false });
  return input.desktopShell ? locale.desktop.appendDesktopQueryToLocalHrefs(html) : html;
}
