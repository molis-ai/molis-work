import type { ProjectGuidanceView } from "@molis-ai/molis-work-contracts/modules/goals";
import type { PlanningMethodPack, PlanningMethodComposition } from "@molis-ai/molis-work-contracts/modules/goals";
import type { MolisWorkIcon } from "@molis-ai/molis-work-design-system";
import { PLANNING_ADOPTION_CLIENT_SCRIPT, PLANNING_SETTINGS_CLIENT_SCRIPT } from "@molis-ai/molis-work-plugin-goals";
import type { MolisWorkWebView } from "./page-view.js";
import { type WebProjectNavigation, type createWorkbenchSettingsNavigation } from "./settings-navigation.js";
import { createProjectSettingsFolds, type ProjectSettingsFoldId } from "./project-settings-folds.js";
import { createWorkbenchGoalsPlanningRenderer } from "./ui-composition.js";
import { CONTROL_CLIENT_SCRIPT, PROJECT_RULES_CLIENT_SCRIPT, PROJECT_GUIDANCE_CLIENT_SCRIPT } from "./browser-assets.js";
import { PROJECT_SETTINGS_CLIENT_SCRIPT } from "./scripts/project-settings.js";

export interface ProjectSettingsPagePorts {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  formatDate(value: string | null | undefined): string;
  icon(name: MolisWorkIcon): string;
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
}

/** Settings page composition consumes canonical Goals facts and platform presentation ports. */
export function createWorkbenchProjectSettingsPages(ports: ProjectSettingsPagePorts) {
  const { composePlanningMethodPacks, L, escapeHtml, formatDate, icon, htmlLang, listJoin, controlTokenMeta, clientI18nScript, renderIconSprite, withDesktopQuery, renderProjectPolicyDocument } = ports;
  const { settingsContextHref, renderProjectSettingsNavigation, renderSettingsNavigation } = ports.navigation;
  const THEME_BOOTSTRAP_SCRIPT = ports.themeBootstrapScript;
  const VISUAL_FOUNDATION_CLIENT_SCRIPT = ports.visualFoundationClientScript;
  const folds = createProjectSettingsFolds({ L, escapeHtml, icon, withDesktopQuery });

  function renderProjectGuidanceDocument(guidance: ProjectGuidanceView): string {
    const kindMeta: Record<string, { label: string; description: string }> = {
      context: { label: L("项目背景"), description: L("项目是什么，以及长期成立的事实") },
      requirement: { label: L("共同要求"), description: L("所有 Goal 都要满足的产品或业务要求") },
      constraint: { label: L("硬约束"), description: L("任何推进都不能越过的边界") },
      convention: { label: L("协作约定"), description: L("命名、表达和协作方式") },
      workflow: { label: L("工作方式"), description: L("项目稳定采用的推进顺序") },
      quality_bar: { label: L("质量标准"), description: L("共同认可的完成质量") },
    };
    const orderedKinds = ["context", "requirement", "constraint", "convention", "workflow", "quality_bar"];
    const sections = orderedKinds.map((kind) => {
      const entries = guidance.entries.filter((entry) => entry.kind === kind);
      const meta = kindMeta[kind]!;
      return `<section class="guidance-section" aria-labelledby="guidance-${kind}"><header class="guidance-section-heading"><h2 id="guidance-${kind}">${meta.label}</h2><p>${meta.description}</p></header><button type="button" class="guidance-text-action guidance-category-add" data-guidance-new data-guidance-kind="${kind}" aria-label="${meta.label} · ${L("新增说明")}">${icon("plus")}${L("添加")}</button><div class="guidance-entry-list">${entries.map((entry) => `<article class="guidance-entry" data-guidance-entry="${escapeHtml(entry.guidance_id)}"><p>${escapeHtml(entry.content)}</p><footer><span class="guidance-entry-meta">${L("第 {revision} 版 · 更新于 {time}", { revision: entry.revision, time: formatDate(entry.updated_at) })}</span><span class="guidance-entry-actions"><button class="guidance-text-action" type="button" data-guidance-edit="${escapeHtml(entry.guidance_id)}">${L("修改")}</button><button class="guidance-text-action guidance-text-action--danger" type="button" data-guidance-action="deactivate" data-guidance-id="${escapeHtml(entry.guidance_id)}">${L("停用")}</button></span></footer></article>`).join("")}</div></section>`;
    }).join("");
    const inactiveItems = guidance.inactive_entries.length > 0
      ? `<ul class="guidance-inactive-list">${guidance.inactive_entries.map((entry) => `<li><p>${escapeHtml(entry.content)}</p><button class="guidance-text-action" type="button" data-guidance-action="restore" data-guidance-id="${escapeHtml(entry.guidance_id)}">${L("恢复这条说明")}</button></li>`).join("")}</ul>`
      : `<p>${L("当前没有停用的说明。")}</p>`;
    const changeLabels: Record<string, string> = {
      created: L("新增"),
      edited: L("修改"),
      deactivated: L("停用"),
      restored: L("恢复"),
    };
    const historyRows = guidance.revisions.map((revision) => {
      const content = revision.content.length > 220 ? `${revision.content.slice(0, 220)}…` : revision.content;
      const stateLabel = revision.active ? L("生效版本") : L("停用版本");
      return `<article class="guidance-history-row"><div><strong>${escapeHtml(changeLabels[revision.change_kind] ?? revision.change_kind)}</strong><div class="guidance-history-state${revision.active ? "" : " guidance-history-state--inactive"}">${L("第 {revision} 版", { revision: revision.revision })} · ${stateLabel}</div></div><div><strong>${escapeHtml(kindMeta[revision.kind]?.label ?? revision.kind)}</strong><p>${escapeHtml(content)}</p><details class="guidance-history-entry"><summary>${L("查看完整版本与变更原因")}</summary><dl class="guidance-history-full"><div><dt>${L("完整原文")}</dt><dd>${escapeHtml(revision.content)}</dd></div><div><dt>${L("变更原因")}</dt><dd>${escapeHtml(revision.reason)}</dd></div><div><dt>${L("操作者")}</dt><dd>${escapeHtml(revision.changed_by)}</dd></div><div><dt>${L("确认记录")}</dt><dd>${escapeHtml(revision.confirmation_summary)}</dd></div></dl></details></div><time datetime="${escapeHtml(revision.created_at)}">${formatDate(revision.created_at)}</time></article>`;
    }).join("");
    const guidanceData = JSON.stringify(guidance).replaceAll("<", "\\u003c");
    return `<section class="guidance-document" aria-labelledby="guidance-title">
      <header class="guidance-page-header"><div><h1 id="guidance-title">${L("项目说明")}</h1><p>${L("这是一份所有 Goal 和未来会话共享的长期说明。这里只显示已经生效的内容；你可以直接维护它，并随时查看每次改动。")}</p></div><button class="guidance-primary-action" type="button" data-guidance-new>${icon("plus")}${L("新增说明")}</button></header>
      <div class="settings-body"><p class="project-rules-receipt" data-guidance-receipt role="status" aria-live="polite" hidden></p>
      <section class="guidance-editor" data-guidance-editor hidden aria-labelledby="guidance-editor-title"><header><div><h2 id="guidance-editor-title" data-guidance-editor-title></h2><p data-guidance-editor-description></p></div></header><form data-guidance-form><input type="hidden" name="action"><input type="hidden" name="guidance_id"><div class="guidance-editor-body"><div class="guidance-editor-fields" data-guidance-editor-fields><label>${L("分类")}<select name="kind"><option value="context">${L("项目背景")}</option><option value="requirement">${L("共同要求")}</option><option value="constraint">${L("硬约束")}</option><option value="convention">${L("协作约定")}</option><option value="workflow">${L("工作方式")}</option><option value="quality_bar">${L("质量标准")}</option></select></label><label>${L("说明原文")}<textarea name="content" maxlength="4000" rows="5" placeholder="${L("写成未来 Runtime 可以直接理解和遵守的完整说明")}"></textarea></label></div><p class="guidance-editor-preview" data-guidance-editor-preview hidden></p><label>${L("为什么要做这次变更")}<textarea name="reason" rows="3" required placeholder="${L("这条原因会进入版本记录，方便以后理解当时为什么修改")}"></textarea></label></div><div class="guidance-editor-actions"><p class="guidance-editor-error" data-guidance-editor-error role="alert" hidden></p><footer><button class="guidance-secondary-action" type="button" data-guidance-editor-close>${L("取消")}</button><button class="guidance-primary-action" type="submit">${L("保存说明")}</button></footer></div></form></section>
      <div class="guidance-settings-list">${sections}</div>
      <details class="settings-advanced guidance-history"><summary><span class="setting-copy"><strong>${L("版本记录")}</strong><span>${L("共 {count} 次变更", { count: guidance.revisions.length })}</span></span>${icon("chevron-down")}</summary><div class="guidance-history-list">${historyRows || `<p>${L("还没有版本记录。")}</p>`}</div></details>
      <details class="settings-advanced guidance-inactive"><summary><span class="setting-copy"><strong>${L("已停用的说明")}</strong><span>${guidance.inactive_entries.length}</span></span>${icon("chevron-down")}</summary>${inactiveItems}</details>
      <p class="settings-footnote">${L("只发送当前生效版本，并放在当前 Goal 和外部内容之前。修改或停用会在下一次 Prompt 中生效。")}</p></div>
      <script type="application/json" data-project-guidance-json>${guidanceData}</script>
    </section>`;
  }

  function planningPageRenderer(controlToken: string, desktopShell: boolean, navigation: string) {
    return createWorkbenchGoalsPlanningRenderer({
      translate: L, escapeHtml, icon, listJoin, withDesktopQuery,
      settingsContextHref,
      renderPage: (page) => `<!doctype html>${page.documentComment ?? ""}<html lang="${htmlLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${escapeHtml(page.title)} · Molis Work</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"></head><body class="settings-page planning-page project-preferences-page" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>${renderIconSprite()}${`<header class="project-preferences-chrome"${desktopShell ? " data-tauri-drag-region" : ""}><span>${navigation.includes("project-settings-navigation") ? L("项目设置") : L("全局设置")}</span><a href="${page.returnHref}" aria-label="${L("返回工作台")}">${icon("x")}</a></header>`}<main class="settings-shell">${navigation}<div class="settings-content">${page.body}</div></main><script>${clientI18nScript()}${page.requiresControl ? CONTROL_CLIENT_SCRIPT : ""}${page.clientScript}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script></body></html>`,
    });
  }

  function planningBodyRenderer() {
    return createWorkbenchGoalsPlanningRenderer({
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

  function renderHubSection(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
    methods: readonly PlanningMethodPack[],
    section: ProjectSettingsFoldId,
    desktopShell: boolean,
  ): string {
    if (section === "general") {
      const project = hubProject(view);
      return `<section class="project-settings-page" data-project-pane="${escapeHtml(project.project_id)}">
      <header class="settings-page-heading"><h1>${L("常规")}</h1><p>${L("管理项目名称和保存在本机的数据。")}</p></header>
      <section class="settings-section" aria-label="${L("项目信息")}">
        <form class="settings-setting-row project-name-form" data-project-rename="${escapeHtml(project.project_id)}">
          <label class="setting-copy" for="project-display-name"><strong>${L("项目名称")}</strong><span>${L("显示在项目列表、目录和工作区中。")}</span></label>
          <div class="setting-value"><input id="project-display-name" name="display_name" type="text" value="${escapeHtml(project.display_name)}" required maxlength="160"><button class="settings-button" type="submit">${L("保存名称")}</button></div>
          <p class="settings-form-error" role="alert" hidden></p>
        </form>
        <details class="settings-data-disclosure"><summary><span class="setting-copy"><strong>${L("本地数据")}</strong><span>${L("查看项目标识与数据库位置。")}</span></span>${icon("chevron-down")}</summary><dl class="settings-data-list"><div><dt>${L("项目 ID")}</dt><dd>${escapeHtml(project.project_id)}</dd></div>${project.database_path ? `<div><dt>${L("数据文件")}</dt><dd>${escapeHtml(project.database_path)}</dd></div>` : ""}</dl></details>
      </section>
      <section class="settings-section settings-project-maintenance"><h2>${L("项目管理")}</h2>${folds.renderDanger(project)}</section>
      ${folds.renderProjectDeleteDialog(project, desktopShell)}
    </section>`;
    }
    if (section === "guidance") return renderProjectGuidanceDocument(guidance);
    if (section === "rules") return renderProjectPolicyDocument(view);
    const composition = composePlanningMethodPacks(methods.filter((method) => method.scope === "project" && method.enabled));
    return planningBodyRenderer().renderProject(view, methods, composition, desktopShell);
  }

  function renderMolisWorkProjectSettingsHub(
    view: MolisWorkWebView,
    guidance: ProjectGuidanceView,
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
    const page = renderHubSection(view, guidance, methods, open, desktopShell);
    const navigation = renderProjectSettingsNavigation(open, project, desktopShell);
    return `<!doctype html>
<html lang="${htmlLang()}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${controlTokenMeta(controlToken)}<title>${L("项目设置")} · ${escapeHtml(project.display_name)} · Molis Work</title><script>${THEME_BOOTSTRAP_SCRIPT}</script><link rel="stylesheet" href="/assets/molis-work-settings.css"></head>
<body class="settings-page project-preferences-page" data-route-prefix="${escapeHtml(routePrefix)}" data-settings-section="${open}" data-desktop-shell="false"${desktopShell ? ' data-native-desktop="true"' : ""}>
  <!-- THESIS: Project settings are a dedicated space for deliberate changes. OWN-WORLD: Coss neutral surfaces, fine dividers, 8px controls. STORY: Choose a category, edit the shared project contract, return to the same workspace. FIRST VIEWPORT: 224px rail, 840px content column, 24px title, settings rows with controls on the right. FORM: Independent preferences; project-settings-v2. Interaction: category navigation preserves workspace tabs; disclosures reveal advanced controls with 160ms arrow motion and reduced-motion support. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
  ${renderIconSprite()}
  <header class="project-preferences-chrome"${desktopShell ? ' data-tauri-drag-region' : ""}><span>${L("项目设置")}</span><a href="${projectReturnHref}" aria-label="${L("返回工作台")}" title="${L("返回工作台")}">${icon("x")}</a></header>
  <main class="settings-shell">
    ${navigation}
    <div class="settings-content" id="settings-content">${page}</div>
  </main>
  <div class="toast" data-settings-toast role="status" aria-live="polite"></div>
  <script>${clientI18nScript()}${CONTROL_CLIENT_SCRIPT}${PROJECT_SETTINGS_CLIENT_SCRIPT}${PROJECT_GUIDANCE_CLIENT_SCRIPT}${PROJECT_RULES_CLIENT_SCRIPT}${PLANNING_SETTINGS_CLIENT_SCRIPT}${PLANNING_ADOPTION_CLIENT_SCRIPT}${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
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

  function renderMolisWorkPlanningLibrary(methods: readonly PlanningMethodPack[], contextProject: WebProjectNavigation | null = null, controlToken = "", desktopShell = false, projects: readonly WebProjectNavigation[] = []): string {
    const navigation = renderSettingsNavigation("planning", contextProject, desktopShell, projects);
    return planningPageRenderer(controlToken, desktopShell, navigation).renderLibrary(methods, contextProject, desktopShell);
  }
  function renderMolisWorkPlanningMethodPage(method: PlanningMethodPack | null, mode: "detail" | "edit" | "new", saveScope: "personal" | "project", project: WebProjectNavigation | null, controlToken = "", desktopShell = false, projects: readonly WebProjectNavigation[] = []): string {
    const navigation = saveScope === "project" && project ? renderProjectSettingsNavigation("planning", project, desktopShell, projects) : renderSettingsNavigation("planning", project, desktopShell, projects);
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
