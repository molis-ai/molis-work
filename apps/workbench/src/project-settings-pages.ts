import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { SKILL_SETTINGS_CLIENT_SCRIPT } from "./settings-skills.js";
import { KIT_SETTINGS_LOADER_SCRIPT, renderKitSettings } from "./settings-kit.js";
import { renderCharacters } from "./characters/ui.js";
import { CHARACTERS_SETTINGS_LOADER_SCRIPT } from "./characters/client-asset.js";
import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/project-guidance";
import { createProjectGuidanceDocumentRenderer } from "./project-guidance-settings.js";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { MolisWorkWebView } from "./page-view.js";
import { ACCOUNT_REGISTRATION_BODY, NO_FAVICON_LINK } from "./document-shell.js";
import type { createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import type { UiLocalePack } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createProjectSettingsFolds, type ProjectSettingsFoldId } from "./project-settings-folds.js";
import { PROJECT_GUIDANCE_CLIENT_SCRIPT } from "./browser-assets.js";
import { pluginSettingsClients } from "./plugin-workbench.js";
import { CONTROL_CLIENT_SCRIPT as UI_REQUEST_CLIENT_SCRIPT } from "./scripts/control.js";
import { PROJECT_SETTINGS_CLIENT_SCRIPT } from "./scripts/project-settings.js";
import { WRITE_CHECKERS_CLIENT_SCRIPT } from "./scripts/write-checkers-client.js";
import { renderProjectDirectoriesSection } from "./project-directories-section.js";
import { PROJECT_DIRECTORIES_CLIENT_SCRIPT } from "./scripts/project-directories-client.js";
import { MEMORY_SETTINGS_CLIENT_SCRIPT, renderMemorySettings } from "./settings-memory.js";
import { knowledgeClientTag, renderKnowledgeSettings } from "./settings-knowledge.js";
import { PLUGIN_RETAINED_ICONS, PLUGIN_TRUST_SETTINGS_CLIENT_SCRIPT, renderPluginTrustSettings } from "./settings-plugins.js";
import { renderTaskGrantsSettings, TASK_GRANTS_SETTINGS_CLIENT_SCRIPT } from "./settings-task-grants.js";
import { appearanceClientTag, appearanceHead, type WorkbenchAppearancePorts } from "./appearance-document.js";
import { renderAppearanceRecovery } from "./settings-appearance.js";
import { renderLanguageHead } from "./language-resource.js";

export interface ProjectSettingsPagePorts {
  accountRegistration?: boolean;
  appearance?: WorkbenchAppearancePorts;
  projectDeletionLabels?(): readonly string[];
  catalogTextPacks(manifest: PluginManifest): readonly UiLocalePack[];
  readText(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  formatDate(value: string | null | undefined): string;
  icon(name: PluginIconName): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  renderIconSprite(): string;
  withDesktopQuery(path: string): string;
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
  navigation: Pick<ReturnType<typeof createWorkbenchSettingsNavigation>, "renderProjectSettingsNavigation">;
}

/** Settings page composition: the platform's project facts and presentation ports. */
export function createWorkbenchProjectSettingsPages(ports: ProjectSettingsPagePorts) {
  const { readText, escapeHtml, icon, htmlLang, controlTokenMeta, renderIconSprite, withDesktopQuery } = ports;
  const { renderProjectSettingsNavigation } = ports.navigation;
  const THEME_BOOTSTRAP_SCRIPT = ports.themeBootstrapScript;
  const VISUAL_FOUNDATION_CLIENT_SCRIPT = ports.visualFoundationClientScript;
  const folds = createProjectSettingsFolds({ readText, escapeHtml, icon, withDesktopQuery, projectDeletionLabels: ports.projectDeletionLabels });
  const renderGuidance = createProjectGuidanceDocumentRenderer({ escapeHtml, icon, formatDate: ports.formatDate });

  function hubProject(view: MolisWorkWebView) {
    const project = view.project!;
    return {
      ...project,
      data_class: project.data_class ?? (view.demo ? "regenerable_demo" as const : "user" as const),
    };
  }

  function renderHubSection(view: MolisWorkWebView, guidance: ProjectGuidanceView, section: ProjectSettingsFoldId, desktopShell: boolean): string {
    if (section === "workspaces") return renderProjectDirectoriesSection(readText, view.route_prefix || `/projects/${encodeURIComponent(view.project!.project_id)}`);
    if (section === "general") return folds.renderGeneralPage(hubProject(view), desktopShell);
    if (section === "guidance") return renderGuidance(guidance);
    if (section === "memory") return renderMemorySettings({ readText, scope: "project", projectId: view.project!.project_id });
    if (section === "knowledge") return renderKnowledgeSettings({ readText, projectId: escapeHtml(view.project!.project_id) });
    if (section === "kit") return renderKitSettings({ projectId: view.project!.project_id });
    // 项目设置 › 角色 (docs/design/role-scope, plan C): this project's default and members; the person's own roles are in Settings › 角色.
    if (section === "characters") return renderCharacters({ route_prefix: view.route_prefix || `/projects/${encodeURIComponent(view.project!.project_id)}`, scope: "project", primitives: { escape: escapeHtml } });
    if (section === "plugins") return renderPluginTrustSettings({ readText, projectId: escapeHtml(view.project!.project_id), chevron: icon("chevron-down"), kinds: Object.fromEntries(Object.entries(PLUGIN_RETAINED_ICONS).map(([kind, name]) => [kind, icon(name)])) });
    if (section === "grants") return renderTaskGrantsSettings({ readText, projectId: escapeHtml(view.project!.project_id) });
    const href = `/settings/authorizations?view=project-rules&project=${encodeURIComponent(view.project!.project_id)}`;
    return `<a class="mw-btn mw-btn--secondary" href="${escapeHtml(desktopShell ? withDesktopQuery(href) : href)}">${uiText("workbench.settings-navigation.access-approvals")}</a>`;
  }

  function renderMolisWorkProjectSettingsHub(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    controlToken = "",
    desktopShell = false,
    open: ProjectSettingsFoldId = "general",
    embed: ProjectSettingsFoldId | null = null,
  ): string {
    const project = view.project;
    if (!project) return "";
    if (embed) return renderHubSection(view, guidance, embed, desktopShell);
    const appearance = ports.appearance?.current();
    const routePrefix = view.route_prefix || `/projects/${encodeURIComponent(project.project_id)}`;
    const projectReturnHref = desktopShell ? withDesktopQuery(routePrefix || "/") : routePrefix || "/";
    const page = renderHubSection(view, guidance, open, desktopShell), navigation = renderProjectSettingsNavigation(open, project, desktopShell);
    return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${NO_FAVICON_LINK}${controlTokenMeta(controlToken)}<title>${uiText("workbench.project-settings-pages.project-settings")} · ${escapeHtml(project.display_name)} · Molis Work</title>${renderLanguageHead(htmlLang())}<script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css">${appearanceHead(appearance)}</head>
<body${ports.accountRegistration ? ACCOUNT_REGISTRATION_BODY : ''} class="settings-page project-preferences-page" data-route-prefix="${escapeHtml(routePrefix)}" data-settings-section="${open}" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>
  <!-- THESIS: Project settings are a dedicated space for deliberate changes. OWN-WORLD: Coss neutral surfaces, fine dividers, 8px controls. STORY: Choose a category, edit the shared project contract, return to the same workspace. FIRST VIEWPORT: 224px rail, 840px content column, 24px title, settings rows with controls on the right. FORM: Independent preferences; project-settings-v2. Interaction: category navigation preserves workspace tabs; disclosures reveal advanced controls with 160ms arrow motion and reduced-motion support. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
  ${renderIconSprite()}
  <header class="project-preferences-chrome"${desktopShell ? ' data-tauri-drag-region="deep"' : ""}><span>${uiText("workbench.project-settings-pages.project-settings")}</span><a href="${projectReturnHref}" aria-label="${uiText("workbench.project-settings-pages.back-workbench")}" title="${uiText("workbench.project-settings-pages.back-workbench")}">${icon("x")}</a></header>
  <main class="settings-shell">
    ${navigation}
    <div class="settings-content" id="settings-content">${page}</div>
  </main>
  <div class="mw-toast toast" data-settings-toast role="status" aria-live="polite"></div>${renderAppearanceRecovery(readText, appearance)}
  <script>${UI_REQUEST_CLIENT_SCRIPT}${WRITE_CHECKERS_CLIENT_SCRIPT}${PROJECT_DIRECTORIES_CLIENT_SCRIPT}${PROJECT_SETTINGS_CLIENT_SCRIPT}${PROJECT_GUIDANCE_CLIENT_SCRIPT}${MEMORY_SETTINGS_CLIENT_SCRIPT}${SKILL_SETTINGS_CLIENT_SCRIPT}${KIT_SETTINGS_LOADER_SCRIPT}${CHARACTERS_SETTINGS_LOADER_SCRIPT}${PLUGIN_TRUST_SETTINGS_CLIENT_SCRIPT}${TASK_GRANTS_SETTINGS_CLIENT_SCRIPT}${pluginSettingsClients()}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>${appearanceClientTag(appearance)}${knowledgeClientTag()}
</body></html>`;
  }

  function renderMolisWorkProjectGeneralSettings(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    controlToken = "",
    desktopShell = false,
  ): string {
    return renderMolisWorkProjectSettingsHub(view, guidance, controlToken, desktopShell, "general");
  }

  function renderMolisWorkProjectSettings(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    controlToken = "",
    desktopShell = false,
  ): string {
    return renderMolisWorkProjectSettingsHub(view, guidance, controlToken, desktopShell, "rules");
  }

  function renderMolisWorkProjectGuidanceSettings(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    controlToken = "",
    desktopShell = false,
  ): string {
    return renderMolisWorkProjectSettingsHub(view, guidance, controlToken, desktopShell, "guidance");
  }

  return {
    renderMolisWorkProjectSettingsHub,
    renderMolisWorkProjectGeneralSettings,
    renderMolisWorkProjectSettings,
    renderMolisWorkProjectGuidanceSettings,
  };
}
