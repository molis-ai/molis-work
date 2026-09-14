import type { WorkbenchDocumentRenderRequest } from "@adeptify/goalboard-contracts/platform/ui";
import { buildGoalCollectionModel, type GoalCollectionItem, type GoalCollectionView, type GoalCollectionModel } from "@adeptify/goalboard-plugin-goals";
import type { ProjectOperationsData, ProjectOperationsProject, ProjectOperationsSlice } from "@adeptify/goalboard-plugin-work";

import type { GoalBoardIcon as PageIcon } from "@adeptify/goalboard-design-system";
import { renderImmersivePluginStrip, renderImmersiveHeader, renderImmersiveGoalHeader, renderImmersiveWorkTabs, renderProjectHome, renderPluginMarket } from "./immersive-shell.js";
type Translate = (text: string, values?: Record<string, string | number>) => string;
type FeedPageSurface = "workbench" | "source-workbench" | "directory" | "source-directory" | "overlays";
export interface WorkbenchGoalsPageView<TItem extends GoalCollectionItem> extends GoalCollectionView<TItem> {
  enabled_plugins?: readonly string[];
  project: ProjectOperationsProject | null;
  projects: ProjectOperationsProject[];
  route_prefix: string;
}

/** Finite composition ports, not a second Web model or an execution/permission API.
 * HTML ports accept only trusted output from the registered product owners.
 */
export interface WorkbenchGoalsPageOwners<TItem extends GoalCollectionItem, TView extends WorkbenchGoalsPageView<TItem>, TFeedEntry> {
  L: Translate;
  escapeHtml(value: unknown): string;
  icon(name: PageIcon): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  themeBootstrapScript: string;
  renderIconSprite(): string;
  clientI18nScript(): string;
  dataJson(view: TView): string;
  prefixLocalLinks(html: string, prefix: string, desktopShell?: boolean): string;
  renderWorkbenchDocument(request: WorkbenchDocumentRenderRequest): string;
  renderGoalDocument(item: TItem, view: TView, selected: boolean): string;
  renderTrashGoalDocument(item: TItem, selected: boolean): string;
  goalsDocumentRenderer: {
    renderInitialGoalTab(goal: TItem["goal"]): string;
    renderEmptyGoalCollection(trash: boolean, full: boolean): string;
  };
  goalsTreeRenderer: {
    renderGoalRootEntry(count: number, active: boolean): string;
    renderGoalDirectory(view: TView, collection: GoalCollectionModel<TItem>, active: boolean): string;
    renderGoalRefreshDirectory(view: TView, collection: GoalCollectionModel<TItem>): string;
  };
  renderCreateDialog(view: TView): string;
  renderGoalTrashDialog(): string;
  renderMomentumPlaceholder(): string;
  renderTuiPane(selected: TItem | undefined, view: TView, cliAvailability: Record<string, boolean>): string;
  renderProjectOperations(project: ProjectOperationsProject | null, data: ProjectOperationsData | undefined): ProjectOperationsSlice;
  renderDesktopProjectChrome(project: ProjectOperationsProject | null, projects: readonly ProjectOperationsProject[],
    desktop: boolean, settingsHref: string | null,
    options: { switcherClass: string; manageHref: string; directoryToggle: boolean }): string;
  renderProjectSwitcher(project: ProjectOperationsProject | null, projects: readonly ProjectOperationsProject[],
    desktop: boolean, className: string, manageHref: string): string;
  feedNativePluginSupplementalEntries(view: TView): TFeedEntry[];
  renderFeedNativePluginSurface(view: TView, surface: FeedPageSurface, preset: "inbox_message",
    entries?: TFeedEntry[], active?: boolean): string;
}

/** Workbench owns placement; Goals/Feed/Work owners retain their actual UI and facts. */
export function createWorkbenchGoalsPageRenderer<TItem extends GoalCollectionItem,
  TView extends WorkbenchGoalsPageView<TItem>, TFeedEntry>(
  owners: WorkbenchGoalsPageOwners<TItem, TView, TFeedEntry>,
) {
  const { L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    renderIconSprite, clientI18nScript, dataJson, prefixLocalLinks, renderWorkbenchDocument,
    renderGoalDocument, renderTrashGoalDocument, goalsDocumentRenderer, goalsTreeRenderer,
    renderCreateDialog, renderGoalTrashDialog, renderMomentumPlaceholder, renderTuiPane,
    renderProjectOperations, renderDesktopProjectChrome,
    feedNativePluginSupplementalEntries, renderFeedNativePluginSurface } = owners;

function renderGoalBoardRefreshFragment(
  view: TView,
  requestedGoalId?: string,
  archiveView = false,
  trashView = false,
): string {
  const collection = buildGoalCollectionModel(view, requestedGoalId, archiveView, trashView, false, L);
  const { selected } = collection;
  const document = selected
    ? trashView
      ? renderTrashGoalDocument(selected, true)
      : renderGoalDocument(selected, view, true)
    : goalsDocumentRenderer.renderEmptyGoalCollection(trashView, false);
  const bodyView = trashView ? "trash" : archiveView ? "archive" : "current";
  const html = `<!doctype html><html><body data-board-view="${bodyView}">
    ${goalsTreeRenderer.renderGoalRefreshDirectory(view, collection)}
    <section data-document-pane><section data-work-surface="goal">${document}</section></section>
    ${renderCreateDialog(view)}
    <script id="goalboard-data" type="application/json">${dataJson(view)}</script>
  </body></html>`;
  return prefixLocalLinks(html, view.route_prefix);
}

function renderGoalBoardWeb(
  view: TView,
  requestedGoalId?: string,
  archiveView = false,
  decisionView = false,
  trashView = false,
  controlToken = "",
  desktopShell = false,
  cliAvailability: Record<string, boolean> = {},
  projectOperationsData?: ProjectOperationsData,
): string {
  const collection = buildGoalCollectionModel(view, requestedGoalId, archiveView, trashView, decisionView, L);
  const { visibleGoals, selected, title, collectionTitle } = collection;
  const initialFeedPreset = "inbox_message" as const;
  const initialDesktopDirectory = decisionView ? "feed" : requestedGoalId || archiveView || trashView ? "goals" : "root";
  const projectOptions = view.projects.length ? view.projects : view.project ? [view.project] : [];
  const primitives = { L, escapeHtml, icon };
  const enabledPlugins = view.enabled_plugins ?? ["goals", "sessions", "feed", "artifacts"];
  const projectOperations = renderProjectOperations(view.project
    ? { project_id: view.project.project_id, display_name: view.project.display_name }
    : null, projectOperationsData);
  const desktopAccountFooter = `<footer class="personal-sidebar-footer">
    <button class="immersive-market-entry" type="button" data-work-surface-open="market">${icon("plus")}<span>${L("插件市场")}</span></button>
    <a class="personal-account" data-settings-link href="__SYSTEM_SETTINGS__" aria-label="${L("打开全局设置")}">
      <span class="personal-account-avatar" aria-hidden="true">${icon("user")}</span>
      <span class="personal-account-copy"><strong>${L("一骏")}</strong><small>${L("本地空间")}</small></span>
      <span class="personal-account-settings" aria-hidden="true">${icon("settings")}</span>
    </a>
  </footer>`;
  const desktopRootDirectory = `<section class="desktop-directory-panel desktop-directory-root" data-directory-panel="root"${initialDesktopDirectory === "root" ? "" : " hidden"}>
    <nav class="desktop-module-list" aria-label="${L("工作台目录")}">
      <button class="desktop-module-item" type="button" data-work-surface-open="home">${icon("home")}<span><strong>${L("项目首页")}</strong><small>${escapeHtml(view.project?.display_name || title)}</small></span></button>
      ${goalsTreeRenderer.renderGoalRootEntry(visibleGoals.length, initialDesktopDirectory === "goals")}
      ${enabledPlugins.includes("sessions") ? projectOperations.rootItems : ""}
      <button class="desktop-module-item" type="button"${enabledPlugins.includes("feed") ? "" : " hidden"} data-directory-open="feed" data-work-surface-open="feed" data-feed-preset="feed">${icon("activity")}<span><strong>Feed</strong><small>${L("所有来源消息，完整保留")}</small></span>${icon("chevron-right")}</button>
      <button class="desktop-module-item" type="button"${enabledPlugins.includes("artifacts") ? "" : " hidden"} data-directory-open="artifacts" data-work-surface-open="artifacts">${icon("file")}<span><strong>Artifacts</strong><small>${L("插件发布的结果与版本")}</small></span>${icon("chevron-right")}</button>
    </nav>
  </section>`;
  const projectNavigatorLayer = `<section class="navigator-project" aria-label="${L("当前项目")}">${renderDesktopProjectChrome(view.project ?? null, projectOptions, desktopShell, view.project ? "__PROJECT_SETTINGS__" : null, { switcherClass: "desktop-project-switcher", manageHref: "__PROJECT_INDEX__", directoryToggle: true })}</section>`;
  const showTui = !decisionView && !archiveView && !trashView;
  const renderedDocumentContent = selected
    ? trashView ? renderTrashGoalDocument(selected, true) : renderGoalDocument(selected, view, true)
    : goalsDocumentRenderer.renderEmptyGoalCollection(trashView, true);
  const feedSupplementalEntries = feedNativePluginSupplementalEntries(view);
  const goalDocument = `<section class="document-pane" id="goal-document-pane" data-document-pane aria-label="${escapeHtml(collectionTitle)}">
    <section class="desktop-work-surface" data-work-surface="goal" data-work-surface-label="Goals">${renderedDocumentContent}</section>
  </section>`;
  const goalStage = showTui ? `<div class="goal-canvas-shell" data-goal-canvas-shell>
    ${renderMomentumPlaceholder()}
    <section class="goal-node-workspace" data-goal-node-workspace aria-label="${L("Goal 工作区")}" hidden>
      ${renderImmersiveGoalHeader(selected?.goal.title || "", primitives)}
      <div class="goal-node-workbench" data-goal-node-workbench>
        <section class="goal-work-main" data-goal-work-main>
          ${renderImmersiveWorkTabs(primitives)}
          ${renderTuiPane(selected, view, cliAvailability)}
        </section>
        ${goalDocument}
      </div>
    </section>
  </div>` : goalDocument;
  const feedViews = `<nav class="immersive-feed-views" data-feed-views hidden aria-label="${L("Feed 视图")}"><button type="button" data-directory-open="feed" data-work-surface-open="feed" data-feed-preset="inbox_message">Inbox</button><button type="button" data-directory-open="feed" data-work-surface-open="feed" data-feed-preset="feed">Feed</button><button type="button" data-directory-open="sources" data-work-surface-open="sources">${L("来源")}</button><button class="source-add-trigger" type="button" data-feed-sources-open aria-label="${L("添加来源")}">${icon("plus")}</button></nav>`;
  const html = renderWorkbenchDocument({
    preamble_html: `<!--
THESIS: 从项目首页进入工作，在同一 Goal 框内操作终端和检查结果。
OWN-WORLD: 用户确认的石墨中性色、紧凑两层目录、纯文字浮起插件标签及 32px 对齐标题栏。
STORY: 项目目录 → Goal 画布 → 固定工作框 → 原视角；插件边界和真实数据持续保留。
FIRST VIEWPORT: 左侧项目与插件目录；右侧项目首页。进入 Goals 后显示画布，展开默认终端，对话暂不可用，右侧为 Goal 信息与时间线。
FORM: 已确认 docs/design/immersive-workbench 原型，生产数据与 Runtime 通过所属 Plugin 接入。
-->\n`,
    lang: htmlLang(),
    title,
    head_before_title_html: controlTokenMeta(controlToken),
    head_html: `<script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <script>if(new URLSearchParams(location.search).get("onboarding-embed")==="1"){document.documentElement.dataset.onboardingEmbed="true";document.documentElement.dataset.resolvedTheme="dark";document.documentElement.dataset.resolvedTerminalTheme="dark";}</script>
  <link rel="stylesheet" href="__WORKBENCH_CSS__">`,
    body_attributes: {
      class: "immersive-workbench",
      "data-board-view": decisionView ? "decisions" : trashView ? "trash" : archiveView ? "archive" : "current",
      "data-route-prefix": view.route_prefix,
      "data-desktop-shell": "true",
      "data-desktop-surface": decisionView ? "feed" : initialDesktopDirectory === "root" ? "home" : "goal",
      "data-native-desktop": desktopShell ? "true" : null,
    },
    body_html: `
  ${renderIconSprite()}
  <div class="app">
    <main class="immersive-workspace${showTui ? " is-desktop-tui" : ""}" data-workspace data-mobile-view="document" data-workspace-mode="graph">
      <aside class="tree-pane" id="goal-tree-pane" data-desktop-directory="${initialDesktopDirectory}" aria-label="${L("应用目录")}">
        ${projectNavigatorLayer}
        ${renderImmersivePluginStrip(primitives, enabledPlugins)}
        ${feedViews}
        ${desktopRootDirectory}
        ${goalsTreeRenderer.renderGoalDirectory(view, collection, initialDesktopDirectory === "goals")}
        ${projectOperations.directories}
        ${renderFeedNativePluginSurface(view, "directory", initialFeedPreset, feedSupplementalEntries)}
        ${renderFeedNativePluginSurface(view, "source-directory", initialFeedPreset)}
        <section class="desktop-directory-panel" data-directory-panel="artifacts" hidden><div data-artifact-directory></div></section>
        ${desktopAccountFooter}
      </aside>
      <div class="tree-resizer" data-tree-resizer role="separator" tabindex="0" aria-orientation="vertical" aria-label="${L("调整目录宽度")}" aria-controls="goal-tree-pane" aria-valuemin="236" aria-valuemax="520" aria-valuenow="264" title="${L("拖动调整目录宽度，双击恢复默认")}"></div>
      <button class="immersive-sidebar-scrim" data-directory-dismiss tabindex="-1" aria-label="${L("收起目录")}" hidden></button>
      ${renderImmersiveHeader(primitives, desktopShell)}
      <div class="immersive-plugin-stage" data-plugin-stage>
        ${renderProjectHome(view.project?.display_name || title, primitives)}
        ${goalStage}
        ${projectOperations.surfaces}
        ${renderFeedNativePluginSurface(view, "workbench", initialFeedPreset, feedSupplementalEntries, decisionView)}
        ${renderFeedNativePluginSurface(view, "source-workbench", initialFeedPreset)}
        <section class="desktop-work-surface immersive-artifact-surface" data-work-surface="artifacts" data-work-surface-label="Artifacts" hidden><div data-artifact-detail></div></section>
        <section class="desktop-work-surface immersive-market" data-work-surface="market" data-work-surface-label="${L("插件市场")}" hidden>${renderPluginMarket(primitives)}</section>
      </div>
      ${renderFeedNativePluginSurface(view, "overlays", initialFeedPreset)}
    </main>
  </div>
  ${renderCreateDialog(view)}
  ${renderGoalTrashDialog()}
  ${projectOperations.overlays}
  <div class="toast" data-toast role="status" aria-live="polite"></div>
  <script id="goalboard-data" type="application/json">${dataJson(view)}</script>
  <script>${clientI18nScript()}</script>
  <script src="/assets/goalboard-workbench.js"></script>
  ${showTui ? '<script src="/desktop/pty-client.js"></script>' : ""}`,
  });
  return prefixLocalLinks(html, view.route_prefix, desktopShell);
}
  return { renderGoalBoardWeb, renderGoalBoardRefreshFragment };
}
