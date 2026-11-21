import { PANE_MESSAGES_SCRIPT } from "./pane-messages.js";

/** Page-local state: a saved directory from another version is not restored, and the page opens at the root. */
const DESKTOP_NAVIGATION_STATE = /* @version format.workbench.navigation-state */ 1;

/**
 * AP3 Workbench client segment: bootstrap.
 *
 * Notes on the script below. They are kept here rather than inside it because the script is served as it stands: a
 * comment inside it is bytes the browser downloads and never runs.
 *
 * - `paneMessages`: the one split-pane message check (S-30, `pane-messages.ts`), handed to the factories that listen for
 *   pane messages (the tab workspace, the context actions) so the page carries it once.
 * - `settingsReturn`: this window's return trips (settings-return.ts), set up before anything mounts a frame; it reads the tab
 *   workspace only when asked, so it does not wait for it.
 * - `pages`: the page clients of the plugins whose page the shell draws (specs/page-client-lifecycle), started in
 *   editing-graph. The shell asks them by hook and never by name. `uiScope` is which of a plugin's views this page is: a
 *   collection page keeps its own saved state.
 */
export const CLIENT_BOOTSTRAP_SCRIPT = `  (() => {
    const readText = globalThis.t.text;
    const q = (selector) => document.querySelector(selector);
    const project = { project_id: document.body.dataset.projectId || "", display_name: document.body.dataset.projectTitle || "" };
    const workspace = q("[data-workspace]");
    const treePane = q("[data-directory-pane]");
    const treeResizer = q("[data-tree-resizer]");
    const tuiResizer = q("[data-tui-resizer]");
    const tuiPane = q("[data-tui-pane]");
    const desktopDirectoryPanels = [...document.querySelectorAll("[data-directory-panel]")];
    const desktopWorkSurfaces = [...document.querySelectorAll("[data-work-surface]")];
    const projectMenus = [...document.querySelectorAll("[data-project-menu]")];
    const toast = q("[data-toast]");
    const routePrefix = document.body.dataset.routePrefix || "";
    const route = (pathname) => routePrefix + pathname;
    const api = (pathname,method,body,fallback) => molisWorkRequest(route(pathname), {method,body:body==null?undefined:body,fallback});
    const localPathname = () => routePrefix && location.pathname.startsWith(routePrefix)
      ? location.pathname.slice(routePrefix.length) || "/"
      : location.pathname;
    const uiStorageKey = "molis-work-ui:" + project.project_id;
    const desktopNavigationStateVersion = ${DESKTOP_NAVIGATION_STATE};
    let immersiveNavigation = null;
    let tabWorkspace = null;
    // A side view's own frame cannot reach the tab workspace: its "open on the stage" (expand, review grants) posts here,
    // from the side frame only, with the asking plugin as the origin so the workbench does not send it back to the side.
    addEventListener("message", event => {
      if (event.origin !== location.origin || event.data?.type !== "molis:side-main-open") return;
      const from = event.data.from, plugin = event.data.plugin, itemId = event.data.itemId, title = event.data.title;
      if (typeof from !== "string" || !/^[a-z][a-z0-9-]{0,100}$/u.test(from)
        || typeof plugin !== "string" || !/^[a-z][a-z0-9-]{0,100}$/u.test(plugin)
        || typeof itemId !== "string" || !itemId || itemId.length > 1000
        || (title !== undefined && (typeof title !== "string" || title.length > 1000))) return;
      const source = event.source;
      if (!source || ![...document.querySelectorAll("#side-panel iframe[data-side-frame]")].some(frame => frame.contentWindow === source)) return;
      tabWorkspace?.openItem(plugin, itemId, title, undefined, { from });
    });
    const paneMessages = ${PANE_MESSAGES_SCRIPT};
    const settingsReturn = molisWorkSettingsReturn({ translate: readText, projectId: project.project_id, prefix: routePrefix,
      tabWorkspace: () => tabWorkspace, showToast: (...args) => showToast(...args), setDirectory: (...args) => setDesktopDirectory(...args) });
    let projectHome = null, projectPositions = null;
    let pluginWorkbench = null;
    let globalSearchPalette = null;
    let assistantIsland = null;
    let desktopDirectoryOrigin = null;
    let activeDesktopSurface = document.body.dataset.desktopSurface || "home";
    let desktopSurfaceScroll = {};
    let deferredClients = null;
    let pageLifetime = null;
    let saveTimer;
    let saveUiState = () => {};
    const queueSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveUiState(), 120);
    };
    let resizeStartX = 0;
    let resizeStartWidth = 0;
    let searchBusyUntil = 0;
    let navigatorView = "list";
    let desktopCompanionActive = document.body.dataset.desktopShell === "true" && matchMedia("(max-width: 760px)").matches;
    const pages = [];
    const pageFor = (surface) => pages.find((page) => page.surface === surface) || null;
    let uiScope = "current";
    let storageKey = uiStorageKey + ":current";

`;
