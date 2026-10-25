import { renderPluginFrameSurface } from "./plugin-frame.js";
import { renderUnavailablePluginStage, type UnavailablePluginStage } from "./unavailable-plugin-stage.js";
import { pluginSurfaceClients, deferredSurfaceClients } from "./plugin-workbench.js";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { listPluginSettingsNavItems } from "./plugin-settings-catalog.js";
import type { WorkbenchDocumentRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import { buildGoalCollectionModel, type GoalCollectionItem, type GoalCollectionView, type GoalCollectionModel } from "@molis-ai/molis-work-plugin-goals";

import type { PluginIconName as PageIcon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderDialog } from "@molis-ai/molis-work-design-system";
import { renderDirectoryPluginSections, renderImmersiveHeader, renderImmersiveGoalHeader, renderGoalDetailsAside, renderImmersiveWorkTabs, renderWorkbenchBar, renderPluginRail, renderProjectHome, renderPluginMarket, renderGlobalSearchOverlay, renderWorkspaceChrome } from "./immersive-shell.js";
import { homeStarts, pluginDirectoryFor, sideEntries } from "./plugin-catalog.js";
import { shownPagePlugins } from "./page-plugin-visibility.js";
import { renderPluginDirectoryData, type PluginDirectory } from "./plugin-directory.js";
import { renderDeclaredStages } from "./declared-stages.js";
import { renderGoalFrameStage } from "./goal-frame-stage.js";
import { homeToolKeysScript, homePluginSideTabs } from "./home-plugin-navigation.js";
import { renderPersonalMenuItems, renderProjectSettingsDirectorySection, renderProjectSettingsWorkSurface, renderSettingsDirectorySection, renderSettingsWorkSurface } from "./settings-directory.js";
import { renderRuntimePlanDialog } from "./settings-appearance.js";
import { knowledgeClientTag } from "./settings-knowledge.js";
type Translate = (text: string, values?: Record<string, string | number>) => string;
function projectSideTabs(enabled: readonly string[], routePrefix: string) {
  const home = homePluginSideTabs(routePrefix);
  return [...home, ...sideEntries(enabled).filter(side => !home.some(tab => tab.key === `${side.project_plugin_id}/${side.view_id}`))
    .map(side => ({ key: `${side.project_plugin_id}/${side.view_id}`, title: side.title, ...(side.context_binding ? { contextOwner: side.plugin_id, contextSurface: side.project_plugin_id } : {}), icon: (side.icon ?? "package") as PageIcon, order: side.order,
      src: `${routePrefix}/side/${encodeURIComponent(side.project_plugin_id)}/${encodeURIComponent(side.view_id)}` }))];
}
function deferredSurfaces(L: Translate, enabledPlugins: readonly string[], panePlugin: string | undefined) {
  const deferredIds = new Set(deferredSurfaceClients().map(client => client.id));
  const isolatedIds = new Set(pluginSurfaceClients().map(client => client.id));
  return (html: string): string => {
    const match = html.match(/^(\s*<([a-z][a-z0-9-]*)\b[^>]*data-work-surface="([^"]+)"[^>]*>)([\s\S]*)(<\/\2>\s*)$/);
    if (!match || !deferredIds.has(match[3]!)) return html;
    if (panePlugin && panePlugin !== match[3]) return match[1]!.replace(/>$/, ' data-pane-placeholder>') + match[5];
    if (!isolatedIds.has(match[3]!)) return match[1]!.replace(/>$/, ' data-deferred-surface>') + '<template data-deferred-content>' + match[4] + '</template>' + match[5];
    return renderPluginFrameSurface(html, match[3]!, L(BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === match[3])?.manifest.name ?? match[3]!), true, listPluginSettingsNavItems(enabledPlugins).some(item => item.section_id === match[3]));
  };
}

type FeedPageSurface = "workbench" | "source-workbench" | "directory" | "source-directory" | "overlays";
/** The project a page is drawn for: what the shell's title bar and project switcher need. */
export interface ShellProject {
  project_id: string;
  display_name: string;
}

export interface WorkbenchShellPageView<TItem extends GoalCollectionItem> extends GoalCollectionView<TItem> {
  /** Presentation-only: an embedded pane requests this plugin, never execution authority. */
  pane_plugin?: string;
  enabled_plugins?: readonly string[];
  /** Personal plugins this project has hidden. They stay installed; the rail omits them. */
  hidden_plugins?: readonly string[];
  /**
   * Directory panels rendered by Plugins the Host is actually running, keyed by
   * project plugin id.
   *
   * This is the seam between a Plugin composed at build time and one started by
   * Plugin Runtime: a Plugin that is running supplies its own panel here, and
   * the shell stops knowing how to draw it. Absent — which is every caller
   * today — the shell renders exactly what it rendered before.
   *
   * The HTML is trusted product output, same as the other panel sources.
   */
  plugin_panels?: Readonly<Record<string, string>>;
  plugin_stages?: readonly string[];
  /** Host-owned failures are not plugin HTML and cannot request a page grant. */
  unavailable_plugin_stages?: readonly UnavailablePluginStage[];
  /** Contribution ids already rendered by a host stage path; the Manifest fallback skips them. */
  plugin_stage_ids?: readonly string[];
  /**
   * The declarations of the plugins the Host's Runtimes run in this project, read from their Manifests for this page: built-in
   * and installed at run time alike (W5-06 余项 2). Absent means a page drawn with no Runtime, which reads the built-in catalog's.
   */
  plugin_directory?: PluginDirectory;
  /** The Host runs in developer mode: the plugin list also offers what is otherwise kept out of it (Text Stats). */
  developer_mode?: boolean;
  project: ShellProject | null;
  projects: ShellProject[];
  route_prefix: string;
}

/** Finite composition ports, not a second Web model or an execution/permission API.
 * HTML ports accept only trusted output from the registered product owners.
 */
export interface WorkbenchShellPageOwners<TItem extends GoalCollectionItem, TView extends WorkbenchShellPageView<TItem>, TFeedEntry> {
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
  renderGoalProposals(view: TView): string;
  renderGoalDocument(item: TItem, view: TView, selected: boolean): string;
  renderTrashGoalDocument(item: TItem, selected: boolean): string;
  goalsDocumentRenderer: {
    renderEmptyGoalCollection(trash: boolean, full: boolean): string;
  };
  goalsTreeRenderer: {
    renderGoalRootEntry(count: number, active: boolean): string;
    renderGoalDirectory(view: TView, collection: GoalCollectionModel<TItem>, active: boolean): string;
    renderGoalRefreshDirectory(view: TView, collection: GoalCollectionModel<TItem>, proposals: string): string;
    renderGoalStageList(view: TView, collection: GoalCollectionModel<TItem>, proposals: string): string;
    renderTreeChrome(view: TView): string;
  };
  renderCreateDialog(view: TView): string;
  renderGoalTrashDialog(): string;
  renderMomentumPlaceholder(): string;
  renderGoalKanban(view: TView, selectedGoalId: string, items: readonly TItem[]): string;
  renderTuiPane(selected: TItem | undefined, view: TView, cliAvailability: Record<string, boolean>): string;
  renderDesktopProjectChrome(project: ShellProject | null, projects: readonly ShellProject[],
    desktop: boolean, settingsHref: string | null,
    options: { switcherClass: string; manageHref: string; directoryToggle: boolean; globalSearch?: boolean }): string;
  renderProjectSwitcher(project: ShellProject | null, projects: readonly ShellProject[],
    desktop: boolean, className: string, manageHref: string): string;
  renderFeedNativePluginSurface(view: TView, surface: FeedPageSurface, preset: "feed",
    entries?: TFeedEntry[], active?: boolean): string;
  /** The model a plugin's declared stage is drawn with, from this page's view. */
  stageModel(projectPluginId: string, view: TView): unknown;
}

/** A project file that evidence points to opens here, in an overlay over the workbench, never in a new browser tab. */
function renderProjectReferenceDialog(L: (text: string) => string): string {
  return renderDialog({ labelledBy: "project-reference-title", title: L("项目内引用"), className: "project-reference-dialog",
    attrs: { "data-project-reference-dialog": true }, closeLabel: L("关闭"),
    body: `<pre class="project-reference-body" data-project-reference-body tabindex="0"></pre>`,
    footer: `<a class="mw-btn mw-btn--secondary" data-project-reference-download download>${L("下载")}</a><button class="mw-btn mw-btn--primary" value="close">${L("关闭")}</button>` });
}

/** The shell's whole page: Workbench owns placement; Goals/Feed/Work owners retain their actual UI and facts. The function keeps its old name until W5-10 splits it, because the giant-unit gate keys a function by its name. */
export function createWorkbenchGoalsPageRenderer<TItem extends GoalCollectionItem,
  TView extends WorkbenchShellPageView<TItem>, TFeedEntry>(
  owners: WorkbenchShellPageOwners<TItem, TView, TFeedEntry>,
) {
  const { L, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    renderIconSprite, clientI18nScript, dataJson, prefixLocalLinks, renderWorkbenchDocument,
    renderGoalDocument, renderTrashGoalDocument, goalsDocumentRenderer, goalsTreeRenderer, renderGoalProposals,
    renderCreateDialog, renderGoalTrashDialog, renderMomentumPlaceholder, renderGoalKanban, renderTuiPane,
    renderDesktopProjectChrome,
    renderFeedNativePluginSurface, stageModel } = owners;

function renderMolisWorkRefreshFragment(
  view: TView,
  requestedGoalId?: string,
  archiveView = false,
  trashView = false,
): string {
  const collection = buildGoalCollectionModel(view, requestedGoalId, archiveView, trashView, L);
  const { selected } = collection;
  const document = selected
    ? trashView
      ? renderTrashGoalDocument(selected, true)
      : renderGoalDocument(selected, view, true)
    : goalsDocumentRenderer.renderEmptyGoalCollection(trashView, false);
  const bodyView = trashView ? "trash" : archiveView ? "archive" : "current";
  const html = `<!doctype html><html><body data-board-view="${bodyView}">
    ${goalsTreeRenderer.renderGoalRefreshDirectory(view, collection, renderGoalProposals(view))}
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
  trashView = false,
  controlToken = "",
  desktopShell = false,
  cliAvailability: Record<string, boolean> = {},
): string {
  const collection = buildGoalCollectionModel(view, requestedGoalId, archiveView, trashView, L);
  const { selected, title, collectionTitle } = collection;
  const initialFeedPreset = "feed" as const;
  const initialDesktopDirectory = "root";
  const initialDesktopSurface = requestedGoalId || archiveView || trashView ? "goal" : "home";
  const projectOptions = view.projects.length ? view.projects : view.project ? [view.project] : [];
  const primitives = { L, escapeHtml, icon, htmlLang };
  const enabledPlugins = shownPagePlugins(view);
  // What the Runtimes run in this project, as their Manifests declare it; a page drawn with no Runtime reads the built-in catalog.
  const directory = pluginDirectoryFor(view.plugin_directory);
  const settingsDirectory = `${renderSettingsDirectorySection(primitives, enabledPlugins)}${view.project ? renderProjectSettingsDirectorySection(primitives) : ""}`;
  const settingsSurfaces = `${renderSettingsWorkSurface(primitives, `${view.route_prefix || ""}/?settings=appearance`)}${view.project ? renderProjectSettingsWorkSurface(primitives, view.project, desktopShell) : ""}`;
  const defer = deferredSurfaces(L, enabledPlugins, view.pane_plugin);
  const pluginEnabled = (id: string) => enabledPlugins.includes(id);
  const projectTitlebarChrome = renderDesktopProjectChrome(view.project ?? null, projectOptions, desktopShell, view.project ? "__PROJECT_SETTINGS__" : null, { switcherClass: "desktop-project-switcher", manageHref: "__PROJECT_INDEX__", directoryToggle: true, globalSearch: true });
  const directoryEmpty = initialDesktopDirectory === "root";
  const showTui = !archiveView && !trashView;
  const renderedDocumentContent = selected
    ? trashView ? renderTrashGoalDocument(selected, true) : renderGoalDocument(selected, view, true)
    : goalsDocumentRenderer.renderEmptyGoalCollection(trashView, true);
  const goalDocument = `<section class="document-pane" id="goal-document-pane" data-document-pane aria-label="${escapeHtml(collectionTitle)}">
    <section class="desktop-work-surface" data-work-surface="goal" data-work-surface-label="Goals">${renderedDocumentContent}</section>
  </section>`;
  const stageList = goalsTreeRenderer.renderGoalStageList(view, collection, renderGoalProposals(view));
  const goalStage = showTui ? `<div class="goal-canvas-shell" data-goal-canvas-shell data-record-owner="goals" data-board-view="list">
    ${stageList}
    <section class="goal-work-planning-pane" data-goal-work-planning aria-label="${L("工作规划")}"></section>
    <section class="goal-work-rules-pane settings-stage" data-goal-work-rules aria-label="${L("工作规则")}"></section>
    ${renderMomentumPlaceholder()}
    ${renderGoalKanban(view, selected?.goal.goal_id || "", view.goals)}
    <div class="goal-stage-chrome" data-goal-stage-chrome>${goalsTreeRenderer.renderTreeChrome(view)}
    <div class="mw-toggle-group goal-board-switch" data-slot="toggle-group" data-board-switch role="group" aria-label="${L("列表")} / ${L("画布")} / ${L("看板")}">
      <button class="mw-toggle is-current" type="button" data-board-view-tab="list" aria-pressed="true" aria-current="page" aria-label="${L("列表")}" title="${L("列表")}">${icon("rows")}<span class="goal-board-switch-label">${L("列表")}</span></button>
      <button class="mw-toggle" type="button" data-board-view-tab="canvas" aria-pressed="false" aria-label="${L("画布")}" title="${L("画布")}">${icon("network")}<span class="goal-board-switch-label">${L("画布")}</span></button>
      <button class="mw-toggle" type="button" data-board-view-tab="kanban" aria-pressed="false" aria-label="${L("看板")}" title="${L("看板")}">${icon("columns")}<span class="goal-board-switch-label">${L("看板")}</span></button>
    </div>
    <button class="mw-btn mw-btn--ghost goal-work-planning-toggle" type="button" data-open-work-planning aria-pressed="false" data-craft-tip="${L("工作规划")}">${icon("workflow")}<span>${L("工作规划")}</span></button>
    <button class="mw-btn mw-btn--ghost goal-work-planning-toggle" type="button" data-open-work-rules aria-pressed="false" data-craft-tip="${L("工作规则")}">${icon("shield")}<span>${L("工作规则")}</span></button></div>
    <section class="goal-node-workspace" data-goal-node-workspace aria-label="${L("Goal 工作区")}" hidden>
      ${renderImmersiveGoalHeader(selected?.goal.title || "", primitives)}
      <div class="goal-node-workbench" data-goal-node-workbench>
        <section class="goal-work-main" data-goal-work-main>
          ${renderImmersiveWorkTabs(primitives)}
          ${renderTuiPane(selected, view, cliAvailability)}
        </section>
        ${renderGoalDetailsAside(goalDocument, primitives)}
      </div>
    </section>
  </div>` : `${stageList}${goalDocument}`;
  const frameStage = showTui ? renderGoalFrameStage({ L, icon }) : "";
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
    head_html: `<script>${THEME_BOOTSTRAP_SCRIPT}${homeToolKeysScript()}</script>
  <link rel="stylesheet" href="__WORKBENCH_CSS__">`,
    body_attributes: {
      class: "immersive-workbench",
      "data-board-view": trashView ? "trash" : archiveView ? "archive" : "current",
      "data-route-prefix": view.route_prefix,
      "data-project-id": view.project?.project_id || "",
      "data-desktop-shell": "true",
      "data-desktop-surface": initialDesktopSurface,
      "data-native-desktop": desktopShell ? "true" : null,
    },
    body_html: `
  ${renderIconSprite()}
  ${renderPluginDirectoryData(directory)}
  <div class="app">
    <main class="immersive-workspace${showTui ? " is-desktop-tui" : ""}${directoryEmpty ? " is-plugin-directory-empty" : ""}" data-workspace data-mobile-view="document" data-workspace-mode="graph">
      ${renderImmersiveHeader(primitives, desktopShell)}
      ${renderWorkbenchBar(primitives, {
        enabled: enabledPlugins,
        rail: renderPluginRail(primitives, enabledPlugins, "", "", directory, { developerMode: view.developer_mode }),
        projectChrome: renderWorkspaceChrome(primitives, projectTitlebarChrome.replace("<!-- project-menu-extra -->", renderPersonalMenuItems(primitives))),
        sideTabs: projectSideTabs(enabledPlugins, view.route_prefix),
      })}
      <aside class="mw-sidebar mw-sidebar--directory mw-drawer mw-drawer--left tree-pane" id="goal-tree-pane" data-desktop-directory="${initialDesktopDirectory}" data-slot="sidebar" aria-label="${L("应用目录")}">
        <div class="mw-scroll directory-content-scroll">
        ${renderDirectoryPluginSections(primitives, enabledPlugins, {
          feed: pluginEnabled("feed")
            ? renderFeedNativePluginSurface(view, "source-directory", initialFeedPreset)
            : "",
          // A running Plugin's own panel wins over the built-in one.
          ...(view.plugin_panels ?? {}),
        }, initialDesktopDirectory, settingsDirectory)}
        </div>
      </aside>
      <div class="tree-resizer" data-tree-resizer role="separator" tabindex="0" aria-orientation="vertical" aria-label="${L("调整目录宽度")}" aria-controls="goal-tree-pane" aria-valuemin="200" aria-valuemax="520" aria-valuenow="240" title="${L("拖动调整目录宽度，双击恢复默认")}"></div>
      <button class="immersive-sidebar-scrim" data-directory-dismiss tabindex="-1" aria-label="${L("收起目录")}" hidden></button>
      <div class="mw-frame immersive-plugin-stage" data-plugin-stage data-slot="frame">
        <div class="tab-workspace mw-frame__panel" data-tab-workspace>
          <div class="tab-workspace-panes" data-tab-panes></div>
          <div class="tab-workspace-exclusive" data-tab-exclusive hidden></div>
          <div class="tab-workspace-pool" data-surface-pool hidden>
            ${renderProjectHome(view.project?.display_name || title, primitives, homeStarts(enabledPlugins, directory))}
            ${goalStage}
            ${frameStage}
            ${renderFeedNativePluginSurface(view, "source-workbench", initialFeedPreset)}
            <section class="desktop-work-surface immersive-artifact-surface plugin-stage-shell" data-work-surface="artifacts" data-work-surface-label="成果" data-artifact-stage-shell data-expanded="false" hidden><div class="plugin-stage-list feed-stage-tree" data-artifact-directory></div><div class="plugin-stage-workspace" data-artifact-stage-workspace hidden><div data-artifact-detail></div></div></section>
            <section class="desktop-work-surface immersive-market" data-work-surface="market" data-work-surface-label="${L("插件市场")}" hidden>${renderPluginMarket(primitives, { developerMode: view.developer_mode }, directory)}</section>
            ${settingsSurfaces}
            ${(view.unavailable_plugin_stages ?? []).map(stage => renderUnavailablePluginStage(stage, L)).join("")}${(view.plugin_stages ?? []).map(defer).join("")}
            ${renderDeclaredStages({ enabled: enabledPlugins, rendered: view.plugin_stage_ids ?? [],
              model: pluginId => stageModel(pluginId, view) }).map(defer).join("")}
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
  <div class="mw-toast toast" data-toast data-settings-toast role="status" aria-live="polite"></div>${renderProjectReferenceDialog(L)}
  <script id="molis-work-data" type="application/json">${dataJson(view)}</script>
  <script>${clientI18nScript()}</script>
  <script src="/assets/molis-work-workbench.js"></script>${knowledgeClientTag()}
  ${showTui ? '<script src="/desktop/pty-client.js"></script>' : ""}`,
  });
  return prefixLocalLinks(html, view.route_prefix, desktopShell);
}
  return { renderMolisWorkWeb, renderMolisWorkRefreshFragment };
}


