import type { WorkbenchDocumentRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { buildGoalCollectionModel, type GoalCollectionItem, type GoalCollectionView, type GoalCollectionModel } from "@molis-ai/molis-work-plugin-goals";
import type { ProjectOperationsData, ProjectOperationsProject, ProjectOperationsSlice } from "@molis-ai/molis-work-plugin-work";

import type { MolisWorkIcon as PageIcon } from "@molis-ai/molis-work-design-system";
import { renderDirectoryPluginSections, renderImmersiveHeader, renderImmersiveGoalHeader, renderImmersiveWorkTabs, renderPluginRail, renderProjectHome, renderPluginMarket, renderGlobalSearchOverlay } from "./immersive-shell.js";
import { renderPluginRailAccountFooter, renderSettingsDirectorySection } from "./settings-directory.js";
import { renderRuntimePlanDialog } from "./settings-appearance.js";
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
    renderGoalStageList(view: TView, collection: GoalCollectionModel<TItem>): string;
  };
  renderCreateDialog(view: TView): string;
  renderGoalTrashDialog(): string;
  renderMomentumPlaceholder(): string;
  renderGoalKanban(view: TView, selectedGoalId: string, items: readonly TItem[]): string;
  renderTuiPane(selected: TItem | undefined, view: TView, cliAvailability: Record<string, boolean>): string;
  renderProjectOperations(project: ProjectOperationsProject | null, data: ProjectOperationsData | undefined): ProjectOperationsSlice;
  renderDesktopProjectChrome(project: ProjectOperationsProject | null, projects: readonly ProjectOperationsProject[],
    desktop: boolean, settingsHref: string | null,
    options: { switcherClass: string; manageHref: string; directoryToggle: boolean; globalSearch?: boolean }): string;
  renderProjectSwitcher(project: ProjectOperationsProject | null, projects: readonly ProjectOperationsProject[],
    desktop: boolean, className: string, manageHref: string): string;
  renderFeedNativePluginSurface(view: TView, surface: FeedPageSurface, preset: "feed",
    entries?: TFeedEntry[], active?: boolean): string;
  renderInboxNativePluginSurface(view: TView, surface: "directory" | "workbench"): string;
}

/** Workbench owns placement; Goals/Feed/Work owners retain their actual UI and facts. */
export function createWorkbenchGoalsPageRenderer<TItem extends GoalCollectionItem,
  TView extends WorkbenchGoalsPageView<TItem>, TFeedEntry>(
  owners: WorkbenchGoalsPageOwners<TItem, TView, TFeedEntry>,
) {
  const { L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    renderIconSprite, clientI18nScript, dataJson, prefixLocalLinks, renderWorkbenchDocument,
    renderGoalDocument, renderTrashGoalDocument, goalsDocumentRenderer, goalsTreeRenderer,
    renderCreateDialog, renderGoalTrashDialog, renderMomentumPlaceholder, renderGoalKanban, renderTuiPane,
    renderProjectOperations, renderDesktopProjectChrome,
    renderFeedNativePluginSurface, renderInboxNativePluginSurface } = owners;

function renderMolisWorkRefreshFragment(
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
    <script id="molis-work-data" type="application/json">${dataJson(view)}</script>
  </body></html>`;
  return prefixLocalLinks(html, view.route_prefix);
}

function renderMolisWorkWeb(
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
  const { selected, title, collectionTitle } = collection;
  const initialFeedPreset = "feed" as const;
  const initialDesktopDirectory = decisionView ? "inbox" : requestedGoalId || archiveView || trashView ? "goals" : "root";
  const projectOptions = view.projects.length ? view.projects : view.project ? [view.project] : [];
  const primitives = { L, escapeHtml, icon, htmlLang };
  const enabledPlugins = view.enabled_plugins ?? ["goals", "sessions", "inbox", "feed", "artifacts"];
  const projectOperations = renderProjectOperations(view.project
    ? { project_id: view.project.project_id, display_name: view.project.display_name }
    : null, projectOperationsData);
  const desktopAccountFooter = renderPluginRailAccountFooter(primitives);
  const settingsDirectory = renderSettingsDirectorySection(primitives, `${view.route_prefix || ""}/` || "/");
  const pluginEnabled = (id: string) => enabledPlugins.includes(id);
  const projectTitlebarChrome = renderDesktopProjectChrome(view.project ?? null, projectOptions, desktopShell, view.project ? "__PROJECT_SETTINGS__" : null, { switcherClass: "desktop-project-switcher", manageHref: "__PROJECT_INDEX__", directoryToggle: true, globalSearch: true });
  const directoryEmpty = initialDesktopDirectory === "root";
  const showTui = !decisionView && !archiveView && !trashView;
  const renderedDocumentContent = selected
    ? trashView ? renderTrashGoalDocument(selected, true) : renderGoalDocument(selected, view, true)
    : goalsDocumentRenderer.renderEmptyGoalCollection(trashView, true);
  const goalDocument = `<section class="document-pane" id="goal-document-pane" data-document-pane aria-label="${escapeHtml(collectionTitle)}">
    <section class="desktop-work-surface" data-work-surface="goal" data-work-surface-label="Goals">${renderedDocumentContent}</section>
  </section>`;
  const stageList = goalsTreeRenderer.renderGoalStageList(view, collection);
  const goalStage = showTui ? `<div class="goal-canvas-shell" data-goal-canvas-shell data-board-view="list">
    <div class="goal-board-switch" data-board-switch role="group" aria-label="${L("列表")} / ${L("画布")} / ${L("看板")}">
      <button type="button" data-board-view-tab="list" aria-current="page">${L("列表")}</button>
      <button type="button" data-board-view-tab="canvas">${L("画布")}</button>
      <button type="button" data-board-view-tab="kanban">${L("看板")}</button>
    </div>
    ${stageList}
    ${renderMomentumPlaceholder()}
    ${renderGoalKanban(view, selected?.goal.goal_id || "", view.goals)}
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
  </div>` : `${decisionView ? "" : stageList}${goalDocument}`;
  const frameStage = showTui ? `<section class="goal-frame-surface" data-goal-frame-surface aria-label="Frame" hidden>
    <header class="frame-goal-summary"><div class="frame-goal-heading"><h1 data-frame-goal-title></h1><span data-frame-goal-status></span></div><p data-frame-goal-outcome></p><div class="frame-goal-actions"><button type="button" data-frame-add-content>${icon("plus")}${L("添加已有内容")}</button><button type="button" data-frame-goal-work>${icon("terminal")}${L("打开工作区")}</button><button type="button" data-frame-goal-locate>${icon("target")}${L("在关系画布中定位")}</button></div></header>
    <div class="goal-frame-canvas" data-frame-canvas><div class="frame-empty" data-frame-empty><strong>${L("把这项目标需要的内容放在这里")}</strong><p>${L("从目录拖入消息、会话或资料，在同一个画布上组织工作。")}</p><button type="button" class="button" data-frame-add-content>${icon("plus")}${L("添加已有内容")}</button></div>
      <div class="goal-frame-world" data-frame-world></div>
    </div>
    <dialog class="frame-picker" data-frame-picker aria-labelledby="frame-picker-title">
      <header><h2 id="frame-picker-title">${L("添加已有内容")}</h2><button type="button" class="icon-button" data-frame-picker-close aria-label="${L("关闭")}">${icon("x")}</button></header>
      <div class="frame-picker-tools"><input type="search" data-frame-picker-search placeholder="${L("搜索标题或来源")}" aria-label="${L("搜索标题或来源")}" autofocus><select data-frame-picker-kind aria-label="${L("内容来源")}"><option value="all">${L("全部来源")}</option><option value="feed">Feed</option><option value="inbox">Inbox</option><option value="session">${L("会话")}</option><option value="artifact">${L("交付物")}</option></select></div>
      <div class="frame-picker-list" data-frame-picker-list></div>
      <footer><span>${L("添加引用，原内容保持在所属来源。")}</span><button type="button" class="button" data-frame-picker-close>${L("取消")}</button></footer>
    </dialog>
    <footer class="goal-canvas-tools goal-frame-tools"><div role="group" aria-label="${L("画布缩放")}"><button type="button" data-frame-zoom="out" aria-label="${L("缩小")}">−</button><output data-frame-zoom-value>100%</output><button type="button" data-frame-zoom="in" aria-label="${L("放大")}">+</button></div></footer>
  </section>` : "";
  const html = renderWorkbenchDocument({
    preamble_html: `<!--
THESIS: 在连续工作区内阅读、记录和执行，内容贴齐标签页，避免浮窗套浮窗。
OWN-WORLD: 用户指定的 Linear × coss 方向；石墨中性色、细分隔线、平面选中、44px 标签栏。
STORY: 点左边插件在右边开分组标签；点 item 开一张；可拆栏并排看。
FIRST VIEWPORT: 左侧目录，右侧固定标签栏和全宽内容；Goal 返回在左上，编辑操作在固定底栏。临时配置贴右边缘。
FORM: 用户指定 continuous-workspace-v11；保留画布节点、分屏及真实 Plugin 数据与 Runtime 契约。控件短反馈，面板轻淡入，无缩放弹起。
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
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
      "data-desktop-surface": decisionView ? "inbox" : initialDesktopDirectory === "root" ? "home" : "goal",
      "data-native-desktop": desktopShell ? "true" : null,
    },
    body_html: `
  ${renderIconSprite()}
  <div class="app">
    <main class="immersive-workspace${showTui ? " is-desktop-tui" : ""}${directoryEmpty ? " is-plugin-directory-empty" : ""}" data-workspace data-mobile-view="document" data-workspace-mode="graph">
      ${renderImmersiveHeader(primitives, desktopShell, projectTitlebarChrome)}
      ${renderPluginRail(primitives, enabledPlugins, desktopAccountFooter)}
      <aside class="tree-pane" id="goal-tree-pane" data-desktop-directory="${initialDesktopDirectory}" aria-label="${L("应用目录")}">
        <div class="directory-content-scroll">
        ${renderDirectoryPluginSections(primitives, enabledPlugins, {
          goals: pluginEnabled("goals") ? goalsTreeRenderer.renderGoalDirectory(view, collection, true) : "",
          sessions: pluginEnabled("sessions") ? projectOperations.directories : "",
          inbox: pluginEnabled("inbox") ? renderInboxNativePluginSurface(view, "directory") : "",
          feed: pluginEnabled("feed")
            ? `${renderFeedNativePluginSurface(view, "directory", initialFeedPreset)}${renderFeedNativePluginSurface(view, "source-directory", initialFeedPreset)}`
            : "",
          artifacts: pluginEnabled("artifacts")
            ? `<section class="desktop-directory-panel" data-directory-panel="artifacts"><div data-artifact-directory></div></section>`
            : "",
        }, initialDesktopDirectory, settingsDirectory)}
        </div>
      </aside>
      <div class="tree-resizer" data-tree-resizer role="separator" tabindex="0" aria-orientation="vertical" aria-label="${L("调整目录宽度")}" aria-controls="goal-tree-pane" aria-valuemin="200" aria-valuemax="520" aria-valuenow="240" title="${L("拖动调整目录宽度，双击恢复默认")}"></div>
      <button class="immersive-sidebar-scrim" data-directory-dismiss tabindex="-1" aria-label="${L("收起目录")}" hidden></button>
      <div class="immersive-plugin-stage" data-plugin-stage>
        <div class="tab-workspace" data-tab-workspace>
          <div class="tab-workspace-panes" data-tab-panes></div>
          <div class="tab-workspace-exclusive" data-tab-exclusive hidden></div>
          <div class="tab-workspace-pool" data-surface-pool>
            ${renderProjectHome(view.project?.display_name || title, primitives)}
            ${goalStage}
            ${frameStage}
            ${projectOperations.surfaces}
            ${renderInboxNativePluginSurface(view, "workbench")}
            ${renderFeedNativePluginSurface(view, "workbench", initialFeedPreset, [], false)}
            ${renderFeedNativePluginSurface(view, "source-workbench", initialFeedPreset)}
            <section class="desktop-work-surface immersive-artifact-surface" data-work-surface="artifacts" data-work-surface-label="Artifacts" hidden><div data-artifact-detail></div></section>
            <section class="desktop-work-surface immersive-market" data-work-surface="market" data-work-surface-label="${L("插件市场")}" hidden>${renderPluginMarket(primitives)}</section>
          </div>
        </div>
      </div>
      ${renderFeedNativePluginSurface(view, "overlays", initialFeedPreset)}
      ${renderRuntimePlanDialog({ L, icon })}
    </main>
  </div>
  ${renderCreateDialog(view)}
  ${renderGlobalSearchOverlay(primitives)}
  ${renderGoalTrashDialog()}
  ${projectOperations.overlays}
  <div class="toast" data-toast data-settings-toast role="status" aria-live="polite"></div>
  <script id="molis-work-data" type="application/json">${dataJson(view)}</script>
  <script>${clientI18nScript()}</script>
  <script src="/assets/molis-work-workbench.js"></script>
  ${showTui ? '<script src="/desktop/pty-client.js"></script>' : ""}`,
  });
  return prefixLocalLinks(html, view.route_prefix, desktopShell);
}
  return { renderMolisWorkWeb, renderMolisWorkRefreshFragment };
}
