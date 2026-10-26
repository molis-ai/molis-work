import { renderModelSettingsDocument } from "./settings-models.js";
import { icon as modelIcon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SETTINGS_CLIENT_SCRIPT } from "./browser-assets.js";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import type { MolisWorkSettingsView } from "./settings-view.js";
import type { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { renderAppearanceSettingsDocument, renderRuntimePlanDialog } from "./settings-appearance.js";
import { findPluginSettingsNavItem } from "./plugin-settings-catalog.js";
import { pluginSettingsStyleLinks } from "./plugin-workbench.js";
import { renderConnectorsSettings } from "./settings-connectors.js";
import { renderPromptSettings } from "./settings-prompts.js";
import { renderAssistantSettings } from "./settings-assistant.js";
import { renderMemorySettings } from "./settings-memory.js";
import { renderLocalDirectorySettings } from "./settings-local-directories.js";
import { renderDiagnosticsSettings } from "./settings-call-diagnostics.js";
import { createCapabilitiesRenderer } from "./capabilities.js";
import { renderMcpSettings, renderRuntimeSettings } from "./settings-runtimes.js";
import { renderProjectSettings } from "./settings-project-manager.js";
import { renderFunctionsWorkbench } from "./functions/ui.js";
import { groupedGlobalSettingsSections } from "./settings-sections.js";
import { FUNCTIONS_SYSTEM_CLIENT_SCRIPT } from "./functions/bootstrap.js";
/** The docs page that lists every outbound network class (docs/platform/NETWORK.md), per interface language. */
const NETWORK_DOC_HREF = {
  zh: "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.md",
  en: "https://github.com/molis-ai/molis-work/blob/main/docs/platform/NETWORK.en.md",
} as const;
export interface SettingsRenderPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: "check" | "sun" | "moon" | "system" | "workflow" | "settings" | "chevron-down" | "chevron-right" | "database" | "refresh" | "x" | "brand" | "blocked" | "tree" | "plus" | "book" | "shield" | "link" | "mail" | "back", className?: string): string;
  currentLocale(): string;
  localeSwitchHref(locale: "zh" | "en", nextPath: string): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  clientI18nScript(): string;
  renderIconSprite(): string;
  withDesktopQuery(path: string): string;
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
  settingsContextHref: ReturnType<typeof createWorkbenchSettingsNavigation>["settingsContextHref"];
  renderSettingsNavigation: ReturnType<typeof createWorkbenchSettingsNavigation>["renderSettingsNavigation"];
}
export function createWorkbenchSettingsRenderer(primitives: SettingsRenderPrimitives) {
  const { L, escapeHtml, icon, currentLocale, localeSwitchHref, htmlLang, controlTokenMeta, clientI18nScript, renderIconSprite,
    withDesktopQuery, settingsContextHref, renderSettingsNavigation,
    themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT, visualFoundationClientScript: VISUAL_FOUNDATION_CLIENT_SCRIPT } = primitives;
function renderAppearanceSettings(nextPath: string): string {
  return renderAppearanceSettingsDocument({ L, currentLocale, localeSwitchHref }, nextPath);
}

function renderMolisWorkSettings(view: MolisWorkSettingsView, controlToken = "", desktopShell = false): string {
  const capabilities = view.capabilities ? createCapabilitiesRenderer(primitives, view.capabilities, view.context_project ?? null, view.projects, desktopShell) : undefined;
  const pluginPage = findPluginSettingsNavItem(view.section);
  const title = capabilities ? L("能力") : view.section === "appearance"
    ? L("界面与语言")
    : view.section === "models" ? L("模型设置")
    : view.section === "runtimes"
      ? L("AI 与执行工具")
    : view.section === "assistant"
      ? L("助理")
    : view.section === "prompts"
      ? L("提示词")
    : view.section === "memory"
      ? L("记忆")
    : view.section === "mcp"
      ? L("MCP")
      : view.section === "connectors"
        ? L("Connectors")
        : view.section === "projects"
        ? L("项目设置")
        : view.section === "diagnostics"
          ? L("诊断")
          : L(pluginPage?.label ?? groupedGlobalSettingsSections().flatMap(group => group.sections).find(section => section.id === view.section)?.label ?? view.section);
  const contextProject = view.context_project ?? null;
  const settingsPath = settingsContextHref(`/settings/${view.section}`, contextProject, desktopShell);
  const rawReturnHref = contextProject ? `/projects/${encodeURIComponent(contextProject.project_id)}/` : "/";
  const returnHref = desktopShell ? withDesktopQuery(rawReturnHref) : rawReturnHref;
  const projectManager = view.section === "projects";
  const content = (view.capabilities?.rules ? renderFunctionsWorkbench({ primitives: { escape: escapeHtml, text: L } }) : view.capabilities?.section === "library" ? capabilities!.library() : view.capabilities?.section === "history" ? capabilities!.history() : undefined) || (view.section === "models" && view.model_settings ? renderModelSettingsDocument({
    ...view.model_settings, primitives: { L, escape: escapeHtml, icon: modelIcon },
  }) : view.plugin_settings_html)
    || (view.section === "appearance"
      ? renderAppearanceSettings(settingsPath)
      : view.section === "runtimes"
        ? renderRuntimeSettings(view, primitives)
        : view.section === "assistant"
          ? renderAssistantSettings({ L, projectId: contextProject?.project_id ?? null })
        : view.section === "prompts" ? renderPromptSettings({ L })
        : view.section === "memory"
          ? renderMemorySettings({ L, scope: "personal", projectId: null })
        : view.section === "directories" ? renderLocalDirectorySettings({ L })
        : view.section === "mcp"
          ? renderMcpSettings(view, desktopShell, primitives)
          : view.section === "connectors"
            ? renderConnectorsSettings(view, { L, escapeHtml, icon, networkDocHref: NETWORK_DOC_HREF[currentLocale() === "en" ? "en" : "zh"] })
          : view.section === "projects"
          ? renderProjectSettings(view, desktopShell, primitives)
          : view.section === "diagnostics"
            ? renderDiagnosticsSettings(view, primitives, desktopShell)
            : "");
  return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${title} · ${L("Molis Work 设置")}</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css">${pluginSettingsStyleLinks(pluginPage?.contribution_id ?? "")}</head>
<body class="settings-page project-preferences-page global-preferences-page${capabilities ? " capabilities-page" : ""}" data-settings-section="${view.section}" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>
  ${renderIconSprite()}
  <header class="project-preferences-chrome"${desktopShell ? ' data-tauri-drag-region="deep"' : ""}><span>${capabilities ? L("能力") : projectManager ? L("项目管理") : L("全局设置")}</span><a href="${returnHref}" aria-label="${L(capabilities ? "关闭能力服务" : "关闭全局设置")}">${icon("x")}</a></header>
  <main class="settings-shell${projectManager ? " settings-shell--standalone" : ""}">
    ${capabilities?.navigation ?? (projectManager ? "" : renderSettingsNavigation(view.section, contextProject, desktopShell, view.projects, view.shown_plugins))}
    <div class="settings-content">${content}</div>
  </main>
  ${renderRuntimePlanDialog({ L, icon })}
  <div class="mw-toast toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${UI_REQUEST_CLIENT_SCRIPT}${SETTINGS_CLIENT_SCRIPT}${view.capabilities?.rules ? FUNCTIONS_SYSTEM_CLIENT_SCRIPT : ""}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body></html>`;
}


  return renderMolisWorkSettings;
}
