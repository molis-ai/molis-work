import { renderKitSettings } from "./settings-kit.js";
import { renderModelSettingsDocument } from "./settings-models.js";
import { ACCOUNT_REGISTRATION_BODY, NO_FAVICON_LINK } from "./document-shell.js";
import { renderInlinePageText, renderLanguageHead } from "./language-resource.js";
import { t as uiText, icon as modelIcon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SETTINGS_CLIENT_SCRIPT } from "./browser-assets.js";
import { CONTROL_CLIENT_SCRIPT as UI_REQUEST_CLIENT_SCRIPT } from "./scripts/control.js";
import type { MolisWorkSettingsView } from "./settings-view.js";
import type { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { renderAppearanceRecovery, renderAppearanceSettingsDocument, renderRuntimePlanDialog } from "./settings-appearance.js";
import { appearanceClientTag, appearanceHead, type WorkbenchAppearancePorts } from "./appearance-document.js";
import { findPluginSettingsNavItem } from "./plugin-settings-catalog.js";
import { BUILTIN_PLUGIN_WORKBENCH, pluginSettingsStyleLinks } from "./plugin-workbench.js";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import type { ProjectSettingsPagePorts } from "./project-settings-pages.js";
import { renderConnectorsSettings } from "./settings-connectors.js";
import { renderPromptSettings } from "./settings-prompts.js";
import { renderAssistantSettings } from "./settings-assistant.js";
import { renderMemorySettings } from "./settings-memory.js";
import { renderLocalDirectorySettings } from "./settings-local-directories.js";
import { renderDiagnosticsSettings } from "./settings-call-diagnostics.js";
import { renderUpdateSettings } from "./settings-update.js";
export { renderUpdateSettings, type SettingsRollbackPoint, type SettingsUpdateView } from "./settings-update.js";
import { renderRunningSettings } from "./settings-running.js";
import { renderSyncSettings } from './settings-sync.js';
import { createCapabilitiesRenderer } from "./capabilities.js";
import { renderMcpSettings, renderRuntimeSettings } from "./settings-runtimes.js";
import { renderProjectSettings } from "./settings-project-manager.js";
import { renderFunctionsWorkbench } from "./judgment-rules/ui.js";
import { groupedGlobalSettingsSections } from "./settings-sections.js";
import { FUNCTIONS_SYSTEM_CLIENT_SCRIPT } from "./judgment-rules/bootstrap.js";
/** The docs page that lists every outbound network class (docs/platform/NETWORK.md), per interface language. */
const NETWORK_DOC_HREF = {
  zh: "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.md",
  en: "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.en.md",
} as const;
export interface SettingsRenderPrimitives {
  accountRegistration?: boolean;
  catalogTextPacks: ProjectSettingsPagePorts["catalogTextPacks"];
  readText(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "check" | "sun" | "moon" | "system" | "workflow" | "settings" | "chevron-down" | "chevron-right" | "database" | "refresh" | "x" | "brand" | "blocked" | "tree" | "plus" | "book" | "shield" | "link" | "mail" | "back", className?: string): string;
  currentLocale(): string;
  localeSwitchHref(locale: import("./i18n.js").WebLocalePreference, nextPath: string): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  renderIconSprite(): string;
  withDesktopQuery(path: string): string;
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
  settingsContextHref: ReturnType<typeof createWorkbenchSettingsNavigation>["settingsContextHref"];
  renderSettingsNavigation: ReturnType<typeof createWorkbenchSettingsNavigation>["renderSettingsNavigation"];
  appearance?: WorkbenchAppearancePorts;
  projectDeletionLabels?(): readonly string[];
}

/** Settings clients use stable keys carried as literals in the registered bundle. */
function settingsText(page: ReturnType<typeof findPluginSettingsNavItem>, packsFor: SettingsRenderPrimitives["catalogTextPacks"]): string {
  if (!page) return "";
  const manifest = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === page.plugin_id)?.manifest;
  const client = BUILTIN_PLUGIN_WORKBENCH.find(pack => pack.contributions.some(contribution =>
    contribution.descriptor.contribution_id === page.contribution_id))?.settingsClient;
  if (!manifest || !client) return "";
  const packs = packsFor(manifest).map(pack => ({ ...pack, messages: Object.fromEntries(
    Object.entries(pack.messages).filter(([key]) => client.includes(JSON.stringify(key))),
  ) })).filter(pack => Object.keys(pack.messages).length);
  return packs.length ? renderInlinePageText([{ slot: `settings:${page.section_id}`, producer: manifest.plugin_id, packs }]) : "";
}

export function createWorkbenchSettingsRenderer(primitives: SettingsRenderPrimitives) {
  const { readText, escapeHtml, icon, currentLocale, localeSwitchHref, htmlLang, controlTokenMeta, renderIconSprite,
    withDesktopQuery, settingsContextHref, renderSettingsNavigation,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT } = primitives;
function renderMolisWorkSettings(view: MolisWorkSettingsView, controlToken = "", desktopShell = false): string {
  const appearance = primitives.appearance?.current();
  const capabilities = view.capabilities ? createCapabilitiesRenderer(primitives, view.capabilities, view.context_project ?? null, view.projects, desktopShell) : undefined;
  const pluginPage = findPluginSettingsNavItem(view.section);
  const title = view.section === "sync" ? uiText.text("workbench.settings-renderer.sync") : capabilities ? uiText.text("workbench.settings-renderer.capabilities") : view.section === "appearance"
    ? uiText.text("workbench.settings-renderer.interface-language")
    : view.section === "models" ? uiText.text("workbench.settings-renderer.models")
    : view.section === "runtimes"
      ? uiText.text("workbench.settings-renderer.ai-execution-tools")
    : view.section === "assistant"
      ? uiText.text("workbench.settings-renderer.assistant")
    : view.section === "prompts"
      ? uiText.text("workbench.settings-renderer.prompts")
    : view.section === "memory"
      ? uiText.text("workbench.settings-renderer.memory")
    : view.section === "mcp"
      ? "MCP"
      : view.section === "connectors"
        ? "Connectors"
        : view.section === "projects"
        ? uiText.text("workbench.settings-renderer.project-settings")
        : view.section === "diagnostics"
          ? uiText.text("workbench.settings-renderer.diagnostics")
        : view.section === "update" ? uiText.text("workbench.settings-update.title")
        : view.section === "running" ? uiText.text("workbench.settings-running.title")
          : (pluginPage?.label ?? groupedGlobalSettingsSections(undefined, true).flatMap(group => group.sections).find(section => section.id === view.section)?.label ?? view.section);
  const contextProject = view.context_project ?? null;
  const settingsPath = settingsContextHref(`/settings/${view.section}`, contextProject, desktopShell);
  const rawReturnHref = contextProject ? `/projects/${encodeURIComponent(contextProject.project_id)}/` : "/";
  const returnHref = desktopShell ? withDesktopQuery(rawReturnHref) : rawReturnHref;
  const projectManager = view.section === "projects";
  const content = (view.capabilities?.rules ? renderFunctionsWorkbench({ primitives: { escape: escapeHtml, text: readText } }) : view.capabilities?.section === "library" ? capabilities!.library() : view.capabilities?.section === "history" ? capabilities!.history() : undefined) || (view.section === "models" && view.model_settings ? renderModelSettingsDocument({
    ...view.model_settings, primitives: { readText, escape: escapeHtml, icon: modelIcon },
  }) : view.plugin_settings_html)
    || (view.section === "sync" ? renderSyncSettings(readText) : view.section === "appearance"
      ? renderAppearanceSettingsDocument({ readText, currentLocale, localeSwitchHref }, settingsPath,
        appearance && primitives.appearance ? { current: appearance, choices: primitives.appearance.choices() } : undefined)
      : view.section === "runtimes"
        ? renderRuntimeSettings(view, primitives)
        : view.section === "assistant"
          ? renderAssistantSettings({ readText, projectId: contextProject?.project_id ?? null })
        : view.section === "kit" ? renderKitSettings({ projectId: null })
        : view.section === "prompts" ? renderPromptSettings({ readText, displayModel: view.agent_display_model })
        : view.section === "memory"
          ? renderMemorySettings({ readText, scope: "personal", projectId: null })
        : view.section === "directories" ? renderLocalDirectorySettings({ readText })
        : view.section === "mcp"
          ? renderMcpSettings(view, desktopShell, primitives)
          : view.section === "connectors"
            ? renderConnectorsSettings(view, { readText, escapeHtml, icon, networkDocHref: NETWORK_DOC_HREF[currentLocale() === "en" ? "en" : "zh"] })
          : view.section === "projects"
          ? renderProjectSettings(view, desktopShell, primitives)
          : view.section === "diagnostics"
            ? renderDiagnosticsSettings(view, primitives, desktopShell)
          : view.section === "update" ? renderUpdateSettings(view, desktopShell)
          : view.section === "running" ? renderRunningSettings()
            : "");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${NO_FAVICON_LINK}${controlTokenMeta(controlToken)}<title>${title} · ${uiText("workbench.settings-renderer.molis-work-settings")}</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css">${pluginSettingsStyleLinks(pluginPage?.contribution_id ?? "")}${appearanceHead(appearance)}</head>
<body${primitives.accountRegistration ? ACCOUNT_REGISTRATION_BODY : ''} class="settings-page project-preferences-page global-preferences-page${capabilities ? " capabilities-page" : ""}" data-settings-section="${view.section}" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="project-preferences-chrome"${desktopShell ? ' data-tauri-drag-region="deep"' : ""}><span>${capabilities ? uiText("workbench.settings-renderer.capabilities") : projectManager ? uiText("workbench.settings-renderer.project-management") : uiText("workbench.settings-renderer.global-settings")}</span><a href="${returnHref}" aria-label="${uiText(capabilities ? "workbench.settings-renderer.close-capabilities" : "workbench.settings-renderer.close-global-settings")}">${icon("x")}</a></header>
  <main class="settings-shell${projectManager ? " settings-shell--standalone" : ""}">
    ${capabilities?.navigation ?? (projectManager ? "" : renderSettingsNavigation(view.section, contextProject, desktopShell, view.projects, view.shown_plugins))}
    <div class="settings-content">${content}</div>
  </main>
  ${renderRuntimePlanDialog({ readText, icon })}
  <div class="mw-toast toast" data-settings-toast role="status" aria-live="polite"></div>${renderAppearanceRecovery(readText, appearance)}
  ${settingsText(pluginPage, primitives.catalogTextPacks)}${renderLanguageHead(htmlLang())}<script>${UI_REQUEST_CLIENT_SCRIPT}${SETTINGS_CLIENT_SCRIPT}${view.capabilities?.rules ? FUNCTIONS_SYSTEM_CLIENT_SCRIPT : ""}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>${appearanceClientTag(appearance)}
</body></html>`;
}


  return renderMolisWorkSettings;
}
