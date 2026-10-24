/** Part of the Pages workbench client (client.ts): the request base: element lookups, project route and header helpers. A source slice of one function body, joined in order. */
export const PAGES_CLIENT_SETUP = `  const { translate: L } = host, api = "/api/plugins/io.molis.work.pages/pages";
  if (host.side) return window.MolisWorkPagesEditor.mountComments({ ...host, api, controlHeaders: molisWorkControlHeaders });
  const bench = document.querySelector("[data-pages=workbench]");
  if (!bench) return;
  const el = (s) => bench.querySelector(s), els = (s) => bench.querySelectorAll(s);
  const list = el("[data-pages=directory]");
  const rowsEl = el("[data-pages-rows]");
  const empty = el("[data-pages-empty]");
  const searchEmpty = el("[data-pages-search-empty]");
  const searchInput = el("[data-pages-search]");
  const workspace = el("[data-pages-stage-workspace]");
  const titleEl = el("[data-pages-editor-title]");
  const statusEl = el("[data-pages-editor-status]");
  const titleInput = el("[data-pages-title]");
  const goalSelect = el("[data-pages-goal]");
  const starEditor = el("[data-pages-star-editor]");
  const editorHost = el("[data-pages-editor]");
  const note = el("[data-pages-note]");
  const confirmDialog = el("[data-pages-confirm]");
  const nameDialog = el("[data-pages-name]");
  const templateDialog = el("[data-pages-template-dialog]");
  const Editor = window.MolisWorkPagesEditor;
  const ICON = (name) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const make = (tag, className) => {
    const node = document.createElement(tag);
    node.className = className;
    return node;
  };
  const moreMenu = el("[data-pages-more-menu]"), moreButton = el("[data-pages-more]");
  const createMenu = el("[data-pages-create-menu]");
  const createMore = el("[data-pages-create-more]");
  const moveMenu = el("[data-pages-move-menu]");
  let records = [];
  let folders = [];
  let sel = null, editorEpoch = 0;
  let editor = null;
  let saveTimer = 0;
  let filling = false;
  let query = "";
  let templateFolderId = "";
  let goals = [];
  let movingId = "";
  let suppressFoldToggleUntil = 0;
  let listSeq = 0;
  let selectionSeq = 0;
  let openingId = null;
  let editRev = 0;
  let dirty = false;
  // The open document's body cannot be shown by this editor: read-only, never autosaved (see fillEditor).
  let unshowable = false;
  let saveQueue = Promise.resolve();
  const publishing = new Set();
  const keepListScroll = (paint) => {
    const top = list?.scrollTop || 0;
    paint();
    if (list) list.scrollTop = top;
  };

  const projectId = () => (typeof host.projectId === "function" ? host.projectId() : host.projectId) || "";
  const routePrefix = () => document.body.dataset.routePrefix || "";
  const route = (path) => typeof host.route === "function" ? host.route(path) : routePrefix() + path;
  const headers = () => typeof molisWorkControlHeaders === "function"
    ? molisWorkControlHeaders()
    : { "content-type": "application/json" };
  const withProject = (path) => {
    const id = projectId();
    if (!id) throw new Error(L("缺少项目"));
    return path + (path.includes("?") ? "&" : "?") + "project_id=" + encodeURIComponent(id);
  };
  const pageUrl = (id, tail) => api + "/" + encodeURIComponent(id) + (tail || "");`;
