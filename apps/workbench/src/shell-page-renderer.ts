import type { PreparedStageView } from "./page-view.js";
import { escapeHtml, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderPluginFrameSurface } from "./plugin-frame.js";
import { renderUnavailablePluginStage, type UnavailablePluginStage } from "./unavailable-plugin-stage.js";
import { pluginSurfaceClients, deferredSurfaceClients } from "./plugin-workbench.js";
import { BUILTIN_PLUGIN_CATALOG } from "./builtin-plugins.js";
import { listPluginSettingsNavItems } from "./plugin-settings-catalog.js";
import type { UiRenderRequest, WorkbenchDocumentRenderRequest } from "@molis-ai/molis-work-contracts/platform/ui";

import type { PluginIconName as PageIcon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderDialog } from "@molis-ai/molis-work-design-system";
import { directoryPanelIdentity, renderDirectoryPluginSections, renderImmersiveHeader, renderWorkbenchBar, renderPluginRail, renderProjectHome, renderPluginMarket, renderGlobalSearchOverlay, renderWorkspaceChrome } from "./immersive-shell.js";
import { directoryWidthPreferenceScript } from "./directory-width.js";
import { homeStarts, islandEntries, pluginDirectoryFor, pluginStageSummaries, pluginTabTitles, railEntries, sideEntries, sideOpenedPlugins } from "./plugin-catalog.js";
import { shownPagePlugins } from "./page-plugin-visibility.js";
import { renderPluginDirectoryData, renderPluginTabTitlesData, type PluginDirectory } from "./plugin-directory.js";
import { renderDeclaredStages, type RenderedStagePage } from "./declared-stages.js";
import { homeToolKeysScript, homePluginSideTabs } from "./home-plugin-navigation.js";
import { renderPersonalMenuItems, renderProjectSettingsDirectorySection, renderProjectSettingsWorkSurface, renderSettingsDirectorySection, renderSettingsWorkSurface } from "./settings-directory.js";
import { renderAppearanceRecovery, renderRuntimePlanDialog } from "./settings-appearance.js";
import { appearanceHead, type WorkbenchAppearancePorts } from "./appearance-document.js";
import { knowledgeClientTag } from "./settings-knowledge.js";
import { renderInlinePageText } from "./language-resource.js";
type Translate = (text: string, values?: Record<string, string | number>) => string;
function projectSideTabs(enabled: readonly string[], routePrefix: string, directory: PluginDirectory) {
  const home = homePluginSideTabs(routePrefix, directory);
  return [...home, ...sideEntries(enabled, directory).filter(side => !home.some(tab => tab.key === `${side.project_plugin_id}/${side.view_id}`))
    .map(side => ({ key: `${side.project_plugin_id}/${side.view_id}`, title: side.title, ...(side.context_binding ? { contextOwner: side.plugin_id, contextSurface: side.project_plugin_id } : {}), icon: (side.icon ?? "package") as PageIcon, order: side.order,
      src: `${routePrefix}/side/${encodeURIComponent(side.project_plugin_id)}/${encodeURIComponent(side.view_id)}` }))];
}
function stagedFrameSource(view: WorkbenchShellPageView, id: string) {
  const drawn = view.plugin_stage_views?.[`project:${id}`] ?? view.plugin_stage_views?.[`home:${id}`];
  const descriptor = drawn?.descriptor;
  const main = descriptor?.surfaces?.find(surface => surface.surface_id === "workbench" && surface.target_slot_id === "workbench.main");
  if (!drawn?.producer || !descriptor || !main) return null;
  return { producer: drawn.producer, mount: { contribution_id: descriptor.contribution_id, surface: main.surface_id, target_slot_id: main.target_slot_id } };
}

function projectedPageText(view: WorkbenchShellPageView): string {
  const pages = Object.entries(view.plugin_stage_views ?? {}).flatMap(([slot, source]) =>
    source?.producer && source.textPacks ? [{ slot, producer: source.producer, packs: source.textPacks() }] : []);
  return renderInlinePageText(pages);
}

function deferredSurfaces(enabledPlugins: readonly string[], view: WorkbenchShellPageView, directory: PluginDirectory) {
  const deferredIds = new Set(deferredSurfaceClients().map(client => client.id));
  const isolatedIds = new Set(pluginSurfaceClients().map(client => client.id));
  const summaries = pluginStageSummaries(directory), titles = pluginTabTitles(directory);
  const defer = (html: string): string => {
    if (html.includes("data-plugin-client=")) return html;
    const match = html.match(/^(\s*<([a-z][a-z0-9-]*)\b[^>]*data-work-surface="([^"]+)"[^>]*>)([\s\S]*)(<\/\2>\s*)$/);
    if (!match || !deferredIds.has(match[3]!)) return html;
    if (view.pane_plugin && view.pane_plugin !== match[3]) return match[1]!.replace(/>$/, ' data-pane-placeholder>') + match[5];
    if (!isolatedIds.has(match[3]!)) return match[1]!.replace(/>$/, ' data-deferred-surface>') + '<template data-deferred-content>' + match[4] + '</template>' + match[5];
    const id = match[3]!, entry = BUILTIN_PLUGIN_CATALOG.find(plugin => plugin.project_plugin_id === id);
    const source = stagedFrameSource(view, id), settings = listPluginSettingsNavItems(enabledPlugins).some(item => item.section_id === id);
    return renderPluginFrameSurface(html, id, (titles[id] ?? entry?.manifest.name ?? id), true, settings, id, source?.mount, entry?.manifest.plugin_id, source?.producer, Boolean(source));
  };
  return (html: string): string => defer(html).replace(/^(\s*<[a-z][^>]*\bdata-work-surface="([^"]+)"[^>]*)(>)/u,
    (tag, start: string, id: string, close: string) => Object.hasOwn(summaries, id) ? `${start} data-work-surface-description="${escapeHtml(summaries[id]!.summary)}"${close}` : tag);
}

/** The project a page is drawn for: what the shell's title bar and project switcher need. */
export interface ShellProject {
  project_id: string;
  display_name: string;
}

export interface WorkbenchShellPageView {
  page_owner?: string;
  page_stage?: RenderedStagePage;
  /** Presentation-only: an embedded pane requests this plugin, never execution authority. */
  pane_plugin?: string;
  /** Presentation-only URL intent; it never grants access to a plugin or a surface. */
  initial_plugin?: string;
  /** The actual owner contributions already read for this request. */
  plugin_stage_views?: Readonly<Record<string, PreparedStageView | null>>;
  enabled_plugins?: readonly string[];
  /** The Catalog observation used to draw the project's plugin picker. */
  project_plugin_revision?: string;
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
  plugin_stage_surfaces?: ReadonlyArray<Pick<UiRenderRequest, "contribution_id" | "surface">>;
  plugin_overlays?: readonly string[];
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
export interface WorkbenchShellPageOwners<TView extends WorkbenchShellPageView> {
  readText: Translate;
  escapeHtml(value: unknown): string;
  icon(name: PageIcon): string;
  htmlLang(): string;
  controlTokenMeta(token: string): string;
  themeBootstrapScript: string;
  renderIconSprite(): string;
  prefixLocalLinks(html: string, prefix: string, desktopShell?: boolean): string;
  renderWorkbenchDocument(request: WorkbenchDocumentRenderRequest): string;
  renderDesktopProjectChrome(project: ShellProject | null, projects: readonly ShellProject[],
    desktop: boolean, settingsHref: string | null,
    options: { switcherClass: string; manageHref: string; directoryToggle: boolean; globalSearch?: boolean }): string;
  renderProjectSwitcher(project: ShellProject | null, projects: readonly ShellProject[],
    desktop: boolean, className: string, manageHref: string): string;
  /** The model a plugin's declared stage is drawn with, from this page's view. */
  stageModel(projectPluginId: string, view: TView): unknown;
  appearance?: WorkbenchAppearancePorts;
  projectDeletionLabels?(): readonly string[];
}

/** A project file that evidence points to opens here, in an overlay over the workbench, never in a new browser tab. */
function renderProjectReferenceDialog(_L: (text: string) => string): string {
  return renderDialog({ labelledBy: "project-reference-title", title: uiText.text("workbench.shell-page-renderer.project-reference"), className: "project-reference-dialog",
    attrs: { "data-project-reference-dialog": true }, closeLabel: uiText.text("common.control.close"),
    body: `<pre class="project-reference-body" data-project-reference-body tabindex="0"></pre>`,
    footer: `<a class="mw-btn mw-btn--secondary" data-project-reference-download download>${uiText("workbench.shell-page-renderer.downloads")}</a><button class="mw-btn mw-btn--primary" value="close">${uiText("common.control.close")}</button>` });
}

/** The shell's whole page: Workbench owns placement; Goals/Feed/Work owners retain their actual UI and facts. The function keeps its old name until W5-10 splits it, because the giant-unit gate keys a function by its name. */
export function createWorkbenchGoalsPageRenderer<TView extends WorkbenchShellPageView>(
  owners: WorkbenchShellPageOwners<TView>,
) {
  const { readText, escapeHtml, icon, htmlLang, controlTokenMeta, themeBootstrapScript: THEME_BOOTSTRAP_SCRIPT,
    renderIconSprite, prefixLocalLinks, renderWorkbenchDocument,
    renderDesktopProjectChrome,
    stageModel } = owners;

function renderMolisWorkWeb(
  view: TView,
  controlToken = "",
  desktopShell = false,
): string {
  const enabledPlugins = shownPagePlugins(view), pluginEnabled = (id: string) => enabledPlugins.includes(id), goalsEnabled = pluginEnabled("goals");
  const declared = renderDeclaredStages({ enabled: enabledPlugins, rendered: view.plugin_stage_surfaces ?? [], unavailable: (view.unavailable_plugin_stages ?? []).map(stage => stage.surface), page_owner: view.page_owner,
    model: pluginId => stageModel(pluginId, view) });
  const page = view.page_stage ?? declared.page, parts = page?.parts;
  const title = parts?.title ?? "Molis Work";
  const bootstrap = parts?.bootstrap;
  const projectOptions = view.projects.length ? view.projects : view.project ? [view.project] : [];
  const primitives = { readText, escapeHtml, icon, htmlLang };
  const appearance = owners.appearance?.current();
  // What the Runtimes run in this project, as their Manifests declare it; a page drawn with no Runtime reads the built-in catalog.
  const directory = pluginDirectoryFor(view.plugin_directory);
  // A running Plugin's own panel wins over the built-in one; initial geometry and the rendered sections use this same set.
  const directoryPanels = { ...declared.panels, ...(view.plugin_panels ?? {}) };
  const requested = view.pane_plugin ?? view.initial_plugin;
  const surfaces = [...(view.plugin_stage_surfaces ?? []), ...declared.surfaces];
  const offered = [...railEntries(enabledPlugins, directory), ...islandEntries(enabledPlugins, directory)];
  const contributions = requested ? [view.plugin_stage_views?.[`home:${requested}`], view.plugin_stage_views?.[`project:${requested}`],
    ...BUILTIN_PLUGIN_CATALOG.filter(entry => entry.project_plugin_id === requested).flatMap(entry => entry.workbench.contributions)] : [];
  const requestedMain = requested && offered.some(entry => entry.id === requested) && !Object.hasOwn(sideOpenedPlugins(), requested)
    && !(view.unavailable_plugin_stages ?? []).some(stage => stage.surface === requested)
    && contributions.some(contribution => contribution?.descriptor.surfaces?.some(surface => surface.surface_id === "workbench"
      && surface.target_slot_id === "workbench.main" && surface.format === "declarative-html"
      && surfaces.some(drawn => drawn.contribution_id === contribution.descriptor.contribution_id && drawn.surface === surface.surface_id)));
  const initialDesktopSurface = parts?.open_stage ? page!.owner : requested && requestedMain ? requested : "home";
  const initialDesktopDirectory = railEntries(enabledPlugins, directory).some(entry => entry.id === initialDesktopSurface
    && directoryPanelIdentity(entry.id, directoryPanels[entry.id] ?? "").ids.includes(initialDesktopSurface))
    ? initialDesktopSurface : "root";
  const settingsDirectory = `${renderSettingsDirectorySection(primitives, enabledPlugins, desktopShell)}${view.project ? renderProjectSettingsDirectorySection(primitives, goalsEnabled) : ""}`;
  const settingsSurfaces = `${renderSettingsWorkSurface(primitives, `${view.route_prefix || ""}/?settings=appearance`,
    appearance && owners.appearance ? { current: appearance, choices: owners.appearance.choices() } : undefined)}${view.project ? renderProjectSettingsWorkSurface({ ...primitives, projectDeletionLabels: owners.projectDeletionLabels }, view.project, desktopShell) : ""}`;
  const defer = deferredSurfaces(enabledPlugins, view, directory);
  const projectTitlebarChrome = renderDesktopProjectChrome(view.project ?? null, projectOptions, desktopShell, view.project ? "__PROJECT_SETTINGS__" : null, { switcherClass: "desktop-project-switcher", manageHref: "__PROJECT_INDEX__", directoryToggle: true, globalSearch: true });
  const directoryEmpty = initialDesktopDirectory === "root";
  const sideTabs = projectSideTabs(enabledPlugins, view.route_prefix, directory);
  const collection = parts?.body_attributes?.["data-board-view"];
  const widthPreference = directoryWidthPreferenceScript(view.project?.project_id ?? "", collection === "archive" || collection === "trash" ? collection : "current", view.pane_plugin !== undefined);

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
    head_before_title_html: controlTokenMeta(controlToken) + projectedPageText(view),
    head_html: `<script>${THEME_BOOTSTRAP_SCRIPT};${homeToolKeysScript()};${widthPreference}</script>
  <link rel="stylesheet" href="__WORKBENCH_CSS__">${appearanceHead(appearance)}`,
    body_attributes: {
      class: "immersive-workbench",
      ...Object.fromEntries(Object.entries(parts?.body_attributes ?? {}).filter(([name]) => /^data-[a-z0-9-]+$/.test(name))),
      "data-route-prefix": view.route_prefix,
      "data-project-id": view.project?.project_id || "",
      "data-project-plugin-revision": view.project_plugin_revision ?? null,
      "data-desktop-shell": "true",
      "data-desktop-surface": initialDesktopSurface,
      "data-native-desktop": desktopShell ? "true" : null,
    },
    body_html: `
  ${renderIconSprite()}
  ${renderPluginDirectoryData(directory, offered.map(entry => entry.id))}
  ${renderPluginTabTitlesData(pluginTabTitles(directory))}
  <div class="app">
    <main class="immersive-workspace${parts?.workspace_classes?.length ? ` ${escapeHtml(parts.workspace_classes.join(" "))}` : ""}${directoryEmpty ? " is-plugin-directory-empty" : ""}" data-workspace data-mobile-view="document" data-workspace-mode="graph">
      ${renderImmersiveHeader(primitives, desktopShell, sideTabs)}
      ${renderWorkbenchBar(primitives, { placing: true,
        enabled: enabledPlugins,
        rail: renderPluginRail(primitives, enabledPlugins, directory, { developerMode: view.developer_mode, marksFromHost: Boolean(view.plugin_directory) }),
        projectChrome: renderWorkspaceChrome(primitives, projectTitlebarChrome.replace("<!-- project-menu-extra -->", renderPersonalMenuItems(primitives, !!appearance))),
        sideTabs,
      })}
      <aside class="mw-sidebar mw-sidebar--directory mw-drawer mw-drawer--left tree-pane" id="goal-tree-pane" data-desktop-directory="${initialDesktopDirectory}" data-slot="sidebar" aria-label="${uiText("workbench.shell-page-renderer.app-directory")}">
        <div class="mw-scroll directory-content-scroll">
        ${renderDirectoryPluginSections(primitives, enabledPlugins, directoryPanels, directory, initialDesktopDirectory, settingsDirectory)}
        </div>
      </aside>
      <div class="tree-resizer" data-tree-resizer role="separator" tabindex="0" aria-orientation="vertical" aria-label="${uiText("workbench.shell-page-renderer.resize-directory")}" aria-controls="goal-tree-pane" aria-valuemin="200" aria-valuemax="520" aria-valuenow="240" title="${uiText("workbench.shell-page-renderer.drag-resize-directory-double-click-reset")}"></div>
      <button class="immersive-sidebar-scrim" data-directory-dismiss tabindex="-1" aria-label="${uiText("workbench.shell-page-renderer.collapse-directory")}" hidden></button>
      <div class="mw-frame immersive-plugin-stage" data-plugin-stage data-slot="frame">
        <div class="tab-workspace mw-frame__panel" data-tab-workspace>
          <div class="tab-workspace-panes" data-tab-panes></div>
          <div class="tab-workspace-exclusive" data-tab-exclusive hidden></div>
          <div class="tab-workspace-pool" data-surface-pool hidden>
            ${renderProjectHome(view.project?.display_name || title, primitives, homeStarts(enabledPlugins, directory))}
            ${page?.html ?? ""}
            <section class="desktop-work-surface immersive-artifact-surface plugin-stage-shell" data-work-surface="artifacts" data-work-surface-label="${uiText("workbench.artifacts.navigation-name")}" data-artifact-stage-shell data-expanded="false" hidden><div class="plugin-stage-list feed-stage-tree" data-artifact-directory></div><div class="plugin-stage-workspace" data-artifact-stage-workspace hidden><div data-artifact-detail></div></div></section>
            <section class="desktop-work-surface immersive-market" data-work-surface="market" data-work-surface-label="${uiText("workbench.shell-page-renderer.plugin-market")}" hidden>${renderPluginMarket(primitives, { developerMode: view.developer_mode, marksFromHost: Boolean(view.plugin_directory) }, directory)}</section>
            ${settingsSurfaces}
            ${(view.unavailable_plugin_stages ?? []).map(stage => renderUnavailablePluginStage(stage, readText)).join("")}${(view.plugin_stages ?? []).map(defer).join("")}
            ${declared.html.map(defer).join("")}
          </div>
        </div>
      </div>
      ${[...(view.plugin_overlays ?? []), ...declared.overlays].join("")}
      ${renderRuntimePlanDialog({ readText, icon })}
    </main>
  </div>
  ${page?.before_global_search ?? ""}
  ${renderGlobalSearchOverlay(primitives)}
  ${page?.after_global_search ?? ""}
  <div class="mw-toast toast" data-toast data-settings-toast role="status" aria-live="polite"></div>${renderProjectReferenceDialog(readText)}${renderAppearanceRecovery(readText, appearance)}
  ${bootstrap ? `<script id="${escapeHtml(bootstrap.id)}" type="application/json">${JSON.stringify(bootstrap.value).replaceAll("<", "\\u003c")}</script>` : ""}
  <script src="/assets/molis-work-workbench.js"></script>${knowledgeClientTag()}
  ${parts?.terminal_client ? '<script src="/desktop/pty-client.js"></script>' : ""}`,
  });
  return prefixLocalLinks(html, view.route_prefix, desktopShell);
}
  return { renderMolisWorkWeb };
}


