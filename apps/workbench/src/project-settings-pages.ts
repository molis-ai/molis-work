import type { ProjectGuidanceView } from "@molis-ai/molis-work-plugin-goals/contract";
import type { PlanningMethodPack, PlanningMethodComposition } from "@molis-ai/molis-work-plugin-goals/contract";
import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { MolisWorkWebView } from "./page-view.js";
import { type WebProjectNavigation, type createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { createProjectGuidanceDocumentRenderer, type GoalsRendererFactories } from "@molis-ai/molis-work-plugin-goals/page";
import { createProjectSettingsFolds, type ProjectSettingsFoldId } from "./project-settings-folds.js";
import { PROJECT_GUIDANCE_CLIENT_SCRIPT } from "./browser-assets.js";
import { pluginSettingsClients } from "./plugin-workbench.js";
import { renderHint } from "@molis-ai/molis-work-design-system";
import { UI_REQUEST_CLIENT_SCRIPT } from "@molis-ai/molis-work-ui-host";
import { PROJECT_SETTINGS_CLIENT_SCRIPT } from "./scripts/project-settings.js";
import { WRITE_CHECKERS_CLIENT_SCRIPT } from "./scripts/write-checkers-client.js";
import { renderWriteCheckersSection } from "./write-checkers-section.js";
import { MEMORY_SETTINGS_CLIENT_SCRIPT, renderMemorySettings } from "./settings-memory.js";
import { knowledgeClientTag, renderKnowledgeSettings } from "./settings-knowledge.js";
import { PLUGIN_TRUST_SETTINGS_CLIENT_SCRIPT, renderPluginTrustSettings } from "./settings-plugins.js";

export interface ProjectSettingsPagePorts {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  formatDate(value: string | null | undefined): string;
  icon(name: PluginIconName): string;
  htmlLang(): string;
  listJoin(values: readonly string[]): string;
  controlTokenMeta(token: string): string;
  clientI18nScript(): string;
  renderIconSprite(): string;
  withDesktopQuery(path: string): string;
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
  navigation: Pick<ReturnType<typeof createWorkbenchSettingsNavigation>, "settingsContextHref" | "renderProjectSettingsNavigation" | "renderSettingsNavigation">;
  composePlanningMethodPacks(methods: readonly PlanningMethodPack[]): PlanningMethodComposition;
  renderProjectPolicyDocument(view: MolisWorkWebView): string;
  /** Goals' planning pages, mounted where the Planning contribution declares them. */
  planningRenderer: GoalsRendererFactories["planning"];
}

/** The settings pages whose content Goals owns: a project without Goals (`guidance` null in the hub) has none of them (RAC-400). */
const GOALS_SETTINGS_SECTIONS: ReadonlySet<ProjectSettingsFoldId> = new Set(["guidance", "rules", "planning"]);

/** Settings page composition consumes canonical Goals facts and platform presentation ports. */
export function createWorkbenchProjectSettingsPages(ports: ProjectSettingsPagePorts) {
  const { composePlanningMethodPacks, L, escapeHtml, formatDate, icon, htmlLang, listJoin, controlTokenMeta, clientI18nScript, renderIconSprite, withDesktopQuery, renderProjectPolicyDocument, planningRenderer: createPlanningRenderer } = ports;
  const { settingsContextHref, renderProjectSettingsNavigation, renderSettingsNavigation } = ports.navigation;
  const THEME_BOOTSTRAP_SCRIPT = ports.themeBootstrapScript;
  const VISUAL_FOUNDATION_CLIENT_SCRIPT = ports.visualFoundationClientScript;
  const folds = createProjectSettingsFolds({ L, escapeHtml, icon, withDesktopQuery });
  const renderProjectGuidanceDocument = createProjectGuidanceDocumentRenderer({ L, escapeHtml, formatDate, icon, renderHint });

  function planningPageRenderer(controlToken: string, desktopShell: boolean, navigation: string) {
    return createPlanningRenderer({
      translate: L, escapeHtml, icon, listJoin, withDesktopQuery,
      settingsContextHref,
      renderPage: (page) => `<!doctype html>${page.documentComment ?? ""}<html lang="${htmlLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${escapeHtml(page.title)} · Molis Work</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"></head><body class="settings-page planning-page project-preferences-page" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>${renderIconSprite()}${`<header class="project-preferences-chrome"${desktopShell ? ' data-tauri-drag-region="deep"' : ""}><span>${navigation.includes("project-settings-navigation") ? L("项目设置") : L("全局设置")}</span><a href="${page.returnHref}" aria-label="${L("返回工作台")}">${icon("x")}</a></header>`}<main class="settings-shell">${navigation}<div class="settings-content">${page.body}</div></main><script>${clientI18nScript()}${page.requiresControl ? UI_REQUEST_CLIENT_SCRIPT : ""}${page.clientScript}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script></body></html>`,
    });
  }

  function planningBodyRenderer() {
    return createPlanningRenderer({
      translate: L, escapeHtml, icon, listJoin, withDesktopQuery,
      settingsContextHref,
      renderPage: (page) => page.body,
    });
  }

  function hubProject(view: MolisWorkWebView) {
    const project = view.project!;
    return {
      ...project,
      data_class: project.data_class ?? (view.demo ? "regenerable_demo" as const : "user" as const),
    };
  }

  function renderHubSection(view: MolisWorkWebView, guidance: ProjectGuidanceView | null, methods: readonly PlanningMethodPack[], section: ProjectSettingsFoldId, desktopShell: boolean): string {
    if (section === "workspaces") return `<section class="project-settings-page" data-project-workspaces data-workspace-prefix="${escapeHtml(view.route_prefix || `/projects/${encodeURIComponent(view.project!.project_id)}`)}">
      <header class="settings-page-heading"><h1>${L("工作目录")}</h1><p>${L("关联本机文件夹，并选择 Files 和 Git 浏览的目录。Coding 在每个会话中单独选择执行目录。")}</p></header>
      <section class="settings-section"><div class="settings-setting-row"><span class="setting-copy"><strong>${L("已关联目录")}</strong><span>${L("浏览选择对当前项目生效。")}</span></span><button class="mw-btn mw-btn--secondary" type="button" data-project-workspaces-refresh>${L("刷新")}</button></div><div data-project-workspaces-list></div><p data-project-workspaces-status role="status" aria-live="polite"></p></section>
      <section class="settings-section"><h2>${L("关联新目录")}</h2><form data-project-workspaces-add><div class="settings-setting-row"><label class="setting-copy" for="project-workspace-path"><strong>${L("文件夹路径")}</strong><span>${L("选择本机文件夹或填写绝对路径。")}</span></label><div class="setting-value"><input id="project-workspace-path" name="path" required placeholder="/path/to/project"><button class="mw-btn mw-btn--secondary" type="button" data-project-workspaces-pick>${L("选择目录")}</button></div></div><div class="settings-setting-row"><span class="setting-copy">${L("关联后可用于当前项目的浏览与 Coding 会话。")}</span><button class="mw-btn mw-btn--primary" type="submit">${L("关联目录")}</button></div><p data-project-workspaces-add-status role="status" aria-live="polite"></p></form></section>${renderWriteCheckersSection(L)}
    </section>`;
    if (section === "general" || guidance === null && GOALS_SETTINGS_SECTIONS.has(section)) return folds.renderGeneralPage(hubProject(view), desktopShell);
    if (section === "guidance") return renderProjectGuidanceDocument(guidance!);
    if (section === "memory") return renderMemorySettings({ L, scope: "project", projectId: view.project!.project_id });
    if (section === "knowledge") return renderKnowledgeSettings({ L, projectId: escapeHtml(view.project!.project_id) });
    if (section === "plugins") return renderPluginTrustSettings({ L, projectId: escapeHtml(view.project!.project_id), chevron: icon("chevron-down") });
    if (section === "rules") return renderProjectPolicyDocument(view);
    const composition = composePlanningMethodPacks(methods.filter((method) => method.scope === "project" && method.enabled));
    return planningBodyRenderer().renderProject(view, methods, composition, desktopShell);
  }

  function renderMolisWorkProjectSettingsHub(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView | null,
    methods: readonly PlanningMethodPack[],
    controlToken = "",
    desktopShell = false,
    open: ProjectSettingsFoldId = "general",
    embed: ProjectSettingsFoldId | null = null,
  ): string {
    const project = view.project;
    if (!project) return "";
    if (embed) return renderHubSection(view, guidance, methods, embed, desktopShell);
    const routePrefix = view.route_prefix || `/projects/${encodeURIComponent(project.project_id)}`;
    const projectReturnHref = desktopShell ? withDesktopQuery(routePrefix || "/") : routePrefix || "/";
    const page = renderHubSection(view, guidance, methods, open, desktopShell), navigation = renderProjectSettingsNavigation(guidance === null && GOALS_SETTINGS_SECTIONS.has(open) ? "general" : open, project, desktopShell, [], { goals: guidance !== null });
    return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${L("项目设置")} · ${escapeHtml(project.display_name)} · Molis Work</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"></head>
<body class="settings-page project-preferences-page" data-route-prefix="${escapeHtml(routePrefix)}" data-settings-section="${open}" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>
  <!-- THESIS: Project settings are a dedicated space for deliberate changes. OWN-WORLD: Coss neutral surfaces, fine dividers, 8px controls. STORY: Choose a category, edit the shared project contract, return to the same workspace. FIRST VIEWPORT: 224px rail, 840px content column, 24px title, settings rows with controls on the right. FORM: Independent preferences; project-settings-v2. Interaction: category navigation preserves workspace tabs; disclosures reveal advanced controls with 160ms arrow motion and reduced-motion support. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
  ${renderIconSprite()}
  <header class="project-preferences-chrome"${desktopShell ? ' data-tauri-drag-region="deep"' : ""}><span>${L("项目设置")}</span><a href="${projectReturnHref}" aria-label="${L("返回工作台")}" title="${L("返回工作台")}">${icon("x")}</a></header>
  <main class="settings-shell">
    ${navigation}
    <div class="settings-content" id="settings-content">${page}</div>
  </main>
  <div class="mw-toast toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${UI_REQUEST_CLIENT_SCRIPT}${WRITE_CHECKERS_CLIENT_SCRIPT}${PROJECT_SETTINGS_CLIENT_SCRIPT}${PROJECT_GUIDANCE_CLIENT_SCRIPT}${MEMORY_SETTINGS_CLIENT_SCRIPT}${PLUGIN_TRUST_SETTINGS_CLIENT_SCRIPT}${pluginSettingsClients()}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>${knowledgeClientTag()}
</body></html>`;
  }

  function renderMolisWorkProjectGeneralSettings(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    methods: readonly PlanningMethodPack[],
    controlToken = "",
    desktopShell = false,
  ): string {
    return renderMolisWorkProjectSettingsHub(view, guidance, methods, controlToken, desktopShell, "general");
  }

  function renderMolisWorkProjectSettings(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    methods: readonly PlanningMethodPack[],
    controlToken = "",
    desktopShell = false,
  ): string {
    return renderMolisWorkProjectSettingsHub(view, guidance, methods, controlToken, desktopShell, "rules");
  }

  function renderMolisWorkProjectGuidanceSettings(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    methods: readonly PlanningMethodPack[],
    controlToken = "",
    desktopShell = false,
  ): string {
    return renderMolisWorkProjectSettingsHub(view, guidance, methods, controlToken, desktopShell, "guidance");
  }

  function renderMolisWorkPlanningLibrary(methods: readonly PlanningMethodPack[], contextProject: WebProjectNavigation | null = null, controlToken = "", desktopShell = false, projects: readonly WebProjectNavigation[] = [], enabledPlugins?: readonly string[]): string {
    const navigation = renderSettingsNavigation("planning", contextProject, desktopShell, projects, enabledPlugins);
    return planningPageRenderer(controlToken, desktopShell, navigation).renderLibrary(methods, contextProject, desktopShell);
  }
  function renderMolisWorkPlanningMethodPage(method: PlanningMethodPack | null, mode: "detail" | "edit" | "new", saveScope: "personal" | "project", project: WebProjectNavigation | null, controlToken = "", desktopShell = false, projects: readonly WebProjectNavigation[] = [], enabledPlugins?: readonly string[]): string {
    const navigation = saveScope === "project" && project ? renderProjectSettingsNavigation("planning", project, desktopShell, projects) : renderSettingsNavigation("planning", project, desktopShell, projects, enabledPlugins);
    return planningPageRenderer(controlToken, desktopShell, navigation).renderMethod(method, mode, saveScope, project, desktopShell);
  }
  function renderMolisWorkPlanningSettings(view: MolisWorkWebView, methods: readonly PlanningMethodPack[], controlToken = "", desktopShell = false): string {
    return renderMolisWorkProjectSettingsHub(view, { entries: [], inactive_entries: [], revisions: [], virtual_document: "", runtime_prompt_prefix: "" }, methods, controlToken, desktopShell, "planning");
  }

  return {
    renderMolisWorkProjectSettingsHub,
    renderMolisWorkProjectGeneralSettings,
    renderMolisWorkProjectSettings,
    renderMolisWorkProjectGuidanceSettings,
    renderMolisWorkPlanningLibrary,
    renderMolisWorkPlanningMethodPage,
    renderMolisWorkPlanningSettings,
  };
}
