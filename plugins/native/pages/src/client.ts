import { PAGES_BLANK_CLIENT_SCRIPT } from "./blank-client.js";
import { PAGES_IMPORT_CLIENT_SCRIPT } from "./import-client.js";

/** Pages workbench client: library, autosave, ProseMirror host. */
export const PAGES_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  if (host.side) return window.MolisWorkPagesEditor.mountComments({ ...host, controlHeaders: molisWorkControlHeaders });
  const bench = document.querySelector("[data-pages=workbench]");
  if (!bench) return;
  const list = bench.querySelector("[data-pages=directory]");
  const rowsEl = bench.querySelector("[data-pages-rows]");
  const empty = bench.querySelector("[data-pages-empty]");
  const searchEmpty = bench.querySelector("[data-pages-search-empty]");
  const searchInput = bench.querySelector("[data-pages-search]");
  const workspace = bench.querySelector("[data-pages-stage-workspace]");
  const titleEl = bench.querySelector("[data-pages-editor-title]");
  const statusEl = bench.querySelector("[data-pages-editor-status]");
  const titleInput = bench.querySelector("[data-pages-title]");
  const goalSelect = bench.querySelector("[data-pages-goal]");
  const starEditor = bench.querySelector("[data-pages-star-editor]");
  const editorHost = bench.querySelector("[data-pages-editor]");
  const note = bench.querySelector("[data-pages-note]");
  const confirmDialog = bench.querySelector("[data-pages-confirm]");
  const nameDialog = bench.querySelector("[data-pages-name]");
  const templateDialog = bench.querySelector("[data-pages-template-dialog]");
  const Editor = window.MolisWorkPagesEditor;
  const ICON = (name) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const moreMenu = bench.querySelector("[data-pages-more-menu]");
  const moreButton = bench.querySelector("[data-pages-more]");
  const createMenu = bench.querySelector("[data-pages-create-menu]");
  const createMore = bench.querySelector("[data-pages-create-more]");
  const moveMenu = bench.querySelector("[data-pages-move-menu]");
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
  const pageUrl = (id, tail) => "/api/plugins/pages/" + encodeURIComponent(id) + (tail || "");
  const request = async (method, path, body, more) => {
    const payloadBody = body === undefined ? undefined : { ...body, project_id: projectId() };
    const response = await fetch(route(withProject(path)), {
      method, headers: headers(), ...more,
      body: payloadBody === undefined || method === "GET" ? undefined : JSON.stringify(payloadBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || L("文档请求失败"));
    return payload;
  };
  const showNote = (text, isError) => {
    if (!note) return;
    if (!text && sel?.publication_pending) text = L("上次成果保存尚未完成。继续保存会恢复当时的快照，当前编辑内容可在之后另存一版。");
    // While the open body cannot be shown, clearing other notes leaves this one: the page is read-only for that reason.
    if (!text && unshowable) { text = L("这篇文档的内容结构在编辑器里显示不了，为了不覆盖原内容，这里暂停编辑和自动保存。可以让助理重新写一遍，或在助理的工作面板里撤销那次修改。"); isError = true; }
    note.hidden = !text;
    note.textContent = text || "";
    note.classList.toggle("is-error", Boolean(isError && text));
  };
  const ask = (message, okLabel) => new Promise((resolve) => {
    if (!confirmDialog) { resolve(false); return; }
    confirmDialog.querySelector("[data-confirm-text]").textContent = message;
    confirmDialog.querySelector("[data-confirm-ok]").textContent = okLabel;
    confirmDialog.returnValue = "cancel";
    const onClose = () => {
      confirmDialog.removeEventListener("close", onClose);
      resolve(confirmDialog.returnValue === "ok");
    };
    confirmDialog.addEventListener("close", onClose);
    confirmDialog.showModal();
  });
  const askName = (message, initial) => new Promise((resolve) => {
    if (!nameDialog) { resolve(null); return; }
    const input = nameDialog.querySelector("[data-name-input]");
    nameDialog.querySelector("[data-name-label]").textContent = message;
    input.value = initial || "";
    nameDialog.returnValue = "cancel";
    const onClose = () => {
      nameDialog.removeEventListener("close", onClose);
      resolve(nameDialog.returnValue === "ok" ? input.value : null);
    };
    nameDialog.addEventListener("close", onClose);
    nameDialog.showModal();
    input.focus();
    input.select();
  });
  const formatTime = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(undefined, sameYear
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" });
  };
  const visibleRecords = () => {
    const needle = query.trim().toLowerCase();
    if (!needle) return records;
    return records.filter((record) => String(record.title || "").toLowerCase().includes(needle));
  };
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
  const closeMore = () => {
    if (!moreMenu || !moreButton) return;
    moreMenu.hidden = true;
    moreButton.setAttribute("aria-expanded", "false");
  };
  const toggleMore = () => {
    if (!moreMenu || !moreButton) return;
    const open = moreMenu.hidden;
    moreMenu.hidden = !open;
    moreButton.setAttribute("aria-expanded", String(open));
    if (open) closeCreate();
  };
  const closeCreate = () => {
    if (!createMenu || !createMore) return;
    createMenu.hidden = true;
    createMore.setAttribute("aria-expanded", "false");
  };
  const toggleCreate = () => {
    if (!createMenu || !createMore) return;
    const open = createMenu.hidden;
    createMenu.hidden = !open;
    createMore.setAttribute("aria-expanded", String(open));
    if (open) closeMore();
  };
  const closeMove = () => {
    if (!moveMenu) return;
    moveMenu.hidden = true;
    movingId = "";
    bench.querySelectorAll("[data-pages-move][aria-expanded=true]").forEach((node) => {
      node.setAttribute("aria-expanded", "false");
    });
  };
  const openMove = (trigger, id) => {
    if (!moveMenu) return;
    const record = records.find((item) => item.id === id);
    if (!record) return;
    movingId = id;
    moveMenu.replaceChildren();
    const addItem = (folderId, label) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "mw-menu__item";
      item.setAttribute("role", "menuitem");
      item.dataset.pagesMoveTo = folderId;
      const on = (record.folder_id || "") === folderId;
      item.classList.toggle("is-current", on);
      item.setAttribute("aria-selected", String(on));
      item.textContent = label;
      moveMenu.append(item);
    };
    addItem("", L("未分类"));
    folders.forEach((folder) => addItem(folder.id, folder.title));
    bench.querySelectorAll("[data-pages-move]").forEach((node) => {
      node.setAttribute("aria-expanded", node === trigger ? "true" : "false");
    });
    moveMenu.hidden = false;
    const box = trigger.getBoundingClientRect();
    const width = Math.max(180, moveMenu.offsetWidth);
    const left = Math.min(Math.max(8, box.right - width), window.innerWidth - width - 8);
    const below = box.bottom + 4;
    const height = moveMenu.offsetHeight;
    const top = below + height > window.innerHeight - 8 ? Math.max(8, box.top - height - 4) : below;
    moveMenu.style.left = left + "px";
    moveMenu.style.top = top + "px";
  };
  const fillGoalSelect = () => {
    if (!goalSelect) return;
    const current = sel?.goal_id || "";
    goalSelect.replaceChildren();
    const none = document.createElement("option");
    none.value = "";
    none.textContent = L("不挂 Goal");
    goalSelect.append(none);
    goals.forEach((goal) => {
      const option = document.createElement("option");
      option.value = goal.id;
      option.textContent = goal.title;
      goalSelect.append(option);
    });
    goalSelect.value = goals.some((goal) => goal.id === current) ? current : "";
  };
  const loadGoals = async () => {
    try {
      const response = await fetch(route("/api/board"), { headers: headers() });
      const payload = await response.json().catch(() => ({}));
      goals = (payload.goals || []).map((item) => ({
        id: item.goal?.goal_id || item.goal_id || "",
        title: item.goal?.title || item.title || "",
      })).filter((item) => item.id);
    } catch {
      goals = [];
    }
    fillGoalSelect();
  };
  // What the Assistant sees when the person turns to it: the open document, its version, and edits not yet saved.
  const docText = (node) => !node ? "" : typeof node.text === "string" ? node.text
    : Array.isArray(node.content) ? node.content.map(docText).join(node.type === "doc" ? "\\n" : "") : "";
  const publishContext = () => {
    const unsaved = Boolean(sel && (saveTimer || dirty));
    const context = { plugin_id: "io.molis.work.pages", surface_title: "Pages" };
    if (sel) {
      context.object = { kind: "pages_document", id: sel.id, version: sel.version, title: titleInput.value || sel.title };
      if (unsaved) {
        context.unsaved = true;
        const text = docText(editor && Editor ? Editor.getDoc(editor) : sel.body);
        if (text) context.draft_text = text.slice(0, 20000);
      }
    }
    bench.setAttribute("data-assistant-context", JSON.stringify(context));
  };
  // What the person has in hand here, for the bar and the Assistant (specs/archive/contextual-interaction §4): the editor's
  // focus around this document, nothing for one it cannot show. Pages reports its own focus, so a list row's selection is not part of it.
  bench.setAttribute("data-surface-focus", "own");
  let focusNow = null;
  let focusShown = null;
  const surfaceFocus = () => {
    if (!focusNow || !sel || unshowable) return null;
    const goal = goals.find((item) => item.id === sel.goal_id);
    const rect = editor && editor.screen();
    return { context_id: "pages:" + sel.id + ":" + focusNow.local_id, plugin_id: "io.molis.work.pages",
      ...(rect ? { screen: { rect } } : {}),
      activity: focusNow.activity, granularity: focusNow.granularity,
      object: { kind: "pages_document", id: sel.id, version: sel.version, title: titleInput.value || sel.title },
      targets: focusNow.targets, surroundings: focusNow.surroundings,
      ...(saveTimer || dirty ? { unsaved: true } : {}), ...(goal ? { goal: { id: goal.id, title: goal.title } } : {}) };
  };
  // Several documents picked in the list (⌘ or Ctrl + click): they are in hand together, to compare or combine.
  // Nothing is written in place for them, so the bar hands their actions to the Assistant as cards.
  const picked = new Set();
  const pickedRect = () => {
    const boxes = [...rowsEl.querySelectorAll(".pages-doc-row[data-page-id]")].filter((row) => picked.has(row.dataset.pageId)).map((row) => row.getBoundingClientRect());
    const edge = (side, pick) => pick(...boxes.map((box) => box[side]));
    return boxes.length ? { left: edge("left", Math.min), right: edge("right", Math.max), top: edge("top", Math.min), bottom: edge("bottom", Math.max) } : null;
  };
  const objectsFocus = () => {
    const chosen = records.filter((record) => picked.has(record.id));
    if (chosen.length < 2) return null;
    const rect = pickedRect();
    return { context_id: "pages-objects:" + chosen.map((record) => record.id + "@" + record.version).sort().join(","),
      plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "objects", ...(rect ? { screen: { rect, placement: "below" } } : {}),
      object: { kind: "pages_document", id: chosen[0].id, version: chosen[0].version, title: chosen[0].title },
      targets: chosen.slice(0, 8).map((record) => {
        const text = record.title + "\\n" + docText(record.body);
        return { kind: "object", role: "object", text: text.slice(0, 1500), ...(text.length > 1500 ? { truncated: true } : {}),
          ref: { kind: "pages_document", id: record.id, version: record.version, title: record.title } };
      }) };
  };
  const paintPicked = () => {
    rowsEl.querySelectorAll(".pages-doc-row[data-page-id]").forEach((row) => {
      const on = picked.has(row.dataset.pageId);
      row.classList.toggle("is-picked", on);
      row.querySelector("button[data-page-id]")?.setAttribute("aria-pressed", String(on));
    });
  };
  const clearPicked = () => {
    if (!picked.size) return;
    picked.clear();
    paintPicked();
    reportFocus();
  };
  bench.addEventListener("keydown", (event) => { if (event.key === "Escape" && picked.size) clearPicked(); });
  document.addEventListener?.("scroll", () => { if (picked.size) reportFocus(); }, true);
  const placeOf = (detail) => (detail ? detail.context_id + (detail.screen ? Object.values(detail.screen.rect).map(Math.round).join() : "") : "");
  const reportFocus = () => {
    const detail = objectsFocus() || surfaceFocus();
    if (placeOf(detail) === placeOf(focusShown)) return;
    focusShown = detail;
    bench.dispatchEvent?.(new CustomEvent("molis:surface-focus", { bubbles: true, detail }));
    if (detail) publishTools();
  };
  // The person chose one of this document's actions in the bar: run it on the range they had in hand when it was
  // ranked, through the writing popup, so the result is a candidate they accept before anything is written. A
  // whole-document action (also one of the Assistant's starting points, with nothing in hand) runs on this document
  // when it is the one open here.
  window.addEventListener?.("molis:assistant-context-action-chosen", (event) => {
    const chosen = event.detail;
    if (!chosen || chosen.plugin_id !== "io.molis.work.pages") return;
    const whole = chosen.scope === "object" && Boolean(chosen.object && sel && !unshowable && chosen.object.id === sel.id);
    if (!whole && (!focusShown || !focusNow || chosen.context_id !== focusShown.context_id || focusShown.granularity === "objects")) return;
    if (!editor || !editor.runCommand || !["result", "replace", "insert_after"].includes(chosen.apply) || typeof chosen.prepare !== "function") return;
    event.preventDefault();
    const documentId = sel.id;
    void editor.runCommand("", undefined, { ...(whole ? { scope: "object" } : { localId: focusNow.local_id }), title: chosen.title,
      mode: chosen.apply === "replace" ? "replace" : "insert_after", okLabel: chosen.apply === "replace" ? L("替换") : L("插到后面"),
      prepare: async () => {
        const prepared = await chosen.prepare();
        const input = prepared && prepared.input ? prepared.input : {};
        if (input.id !== documentId || typeof input.command !== "string") throw new Error(L("这个动作暂时准备不了，请重新选择"));
        return { command: input.command, style: typeof input.style === "string" ? input.style : undefined, text: typeof input.text === "string" ? input.text : undefined };
      } });
  });
  let toolsKey = "";
  const publishTools = () => {
    if (!editor || !editor.tools || !focusShown || focusShown.granularity === "objects") return;
    const groups = editor.tools(), key = focusShown.context_id + JSON.stringify(groups);
    if (key === toolsKey) return;
    toolsKey = key;
    bench.dispatchEvent(new CustomEvent("molis:context-tools", { bubbles: true, detail: { context_id: focusShown.context_id, groups } }));
  };
  const sendPanel = (detail) => {
    const event = new CustomEvent("molis:context-panel-open", { bubbles: true, cancelable: true, detail: { context_id: focusShown ? focusShown.context_id : "", ...detail } });
    bench.dispatchEvent?.(event);
    return event.defaultPrevented;
  };
  bench.addEventListener("molis:context-tool-invoke", (event) => {
    const chosen = event.detail;
    if (editor && chosen && focusShown && chosen.context_id === focusShown.context_id) editor.runTool(chosen.id);
  });
  const syncEditorChrome = () => {
    publishContext();
    reportFocus();
    if (!sel) return;
    if (starEditor) {
      starEditor.classList.toggle("is-on", Boolean(sel.starred));
      starEditor.setAttribute("aria-label", sel.starred ? L("取消收藏") : L("收藏"));
      starEditor.title = sel.starred ? L("取消收藏") : L("收藏");
    }
    fillGoalSelect();
    const artifactBar = bench.querySelector("[data-pages-artifact-bar]");
    if (artifactBar) artifactBar.textContent = sel.publication_pending ? L("继续保存上次固定版本") : sel.artifact_version > 0 ? L("再存一个固定版本") : L("存为固定版本");
    if (sel.publication_pending) showNote("", false);
  };
  const markSelected = (id) => {
    rowsEl.querySelectorAll("[data-page-id]").forEach((row) => {
      const on = row.dataset.pageId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  // A row's only label is its state (a fixed version exists, or one is being saved); a row with neither shows just title and date.
  const fixedCell = (record) => {
    if (!record.publication_pending && !(record.artifact_version > 0)) return null;
    const node = document.createElement("span");
    node.className = "mw-status mw-status--plain feed-entry-status " + (record.publication_pending ? "mw-status--attention" : "mw-status--done");
    node.dataset.mwState = record.publication_pending ? "unsaved" : "saved"; node.textContent = record.publication_pending ? L("固定版本未存完") : L("固定版本") + " v" + record.artifact_version;
    return node;
  };
  const renderRow = (record) => {
    const item = document.createElement("article");
    item.className = "feed-stage-item pages-doc-row creative-artifact-row";
    item.draggable = folders.length > 0;
    item.dataset.pageId = record.id;
    const row = document.createElement("button");
    row.type = "button";
    row.draggable = folders.length > 0;
    row.className = "feed-stage-entry directory-list-row" + (sel?.id === record.id ? " is-selected" : "");
    row.dataset.pageId = record.id;
    row.setAttribute("aria-selected", String(sel?.id === record.id));
    row.setAttribute("aria-pressed", String(picked.has(record.id)));
    if (picked.has(record.id)) item.classList.add("is-picked");
    const leading = document.createElement("span");
    leading.className = "feed-stage-leading";
    const mark = document.createElement("span");
    mark.className = "pages-doc-mark";
    mark.setAttribute("aria-hidden", "true");
    mark.innerHTML = ICON("note");
    const title = document.createElement("strong");
    title.title = record.title;
    title.textContent = record.title;
    leading.append(mark, title);
    const meta = document.createElement("span");
    meta.className = "plugin-stage-meta";
    meta.textContent = formatTime(record.updated_at);
    row.append(leading, meta);
    const fixed = fixedCell(record);
    if (fixed) row.append(fixed);
    const actions = document.createElement("span");
    actions.className = "pages-row-actions";
    if (folders.length) {
      const move = document.createElement("button");
      move.type = "button";
      move.className = "pages-row-act";
      move.dataset.pagesMove = record.id;
      move.setAttribute("aria-label", L("移到文件夹"));
      move.setAttribute("title", L("移到文件夹"));
      move.setAttribute("aria-haspopup", "true");
      move.setAttribute("aria-expanded", "false");
      move.innerHTML = ICON("folder");
      actions.append(move);
    }
    const star = document.createElement("button");
    star.type = "button";
    star.className = "pages-row-act pages-star" + (record.starred ? " is-on" : "");
    star.dataset.pagesStar = record.id;
    star.setAttribute("aria-label", record.starred ? L("取消收藏") : L("收藏"));
    star.innerHTML = ICON("star");
    actions.append(star);
    item.append(row, actions);
    return item;
  };
  const renderFold = (key, label, items, actions) => {
    const fold = document.createElement("details");
    fold.className = "goal-collection-fold";
    fold.open = true;
    fold.dataset.folderId = key;
    const summary = document.createElement("summary");
    const caret = document.createElement("span");
    caret.className = "goal-collection-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.innerHTML = ICON("chevron-down");
    const strong = document.createElement("strong");
    strong.textContent = label;
    const small = document.createElement("small");
    small.textContent = String(items.length);
    summary.append(caret, strong, small);
    if (actions) summary.append(actions);
    if (key !== "starred") fold.dataset.pagesDrop = "folder";
    fold.append(summary);
    if (!items.length) {
      const vacant = document.createElement("p");
      vacant.className = "goal-collection-empty";
      vacant.textContent = L("还没有文档");
      fold.append(vacant);
    } else items.forEach((record) => fold.append(renderRow(record)));
    return fold;
  };
  const folderActions = (folder) => {
    const wrap = document.createElement("span");
    wrap.className = "pages-folder-actions";
    const add = document.createElement("button");
    add.type = "button";
    add.dataset.pagesFolderNew = folder.id;
    add.setAttribute("aria-label", L("在此新建"));
    add.innerHTML = ICON("plus");
    const rename = document.createElement("button");
    rename.type = "button";
    rename.dataset.pagesFolderRename = folder.id;
    rename.setAttribute("aria-label", L("重命名文件夹"));
    rename.innerHTML = ICON("edit");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.dataset.pagesFolderDelete = folder.id;
    remove.setAttribute("aria-label", L("删除文件夹"));
    remove.innerHTML = ICON("x");
    wrap.append(add, rename, remove);
    return wrap;
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const paintList = () => {
    closeMove();
    const shown = visibleRecords();
    const searching = Boolean(query.trim());
    empty.hidden = records.length > 0 || searching || folders.length > 0;
    searchEmpty.hidden = !(searching && shown.length === 0);
    const open = new Set([...rowsEl.querySelectorAll("details[data-folder-id][open]")].map((node) => node.dataset.folderId));
    rowsEl.replaceChildren();
    const grouped = folders.length > 0 || records.some((record) => record.starred);
    if (searching || !grouped) {
      shown.forEach((record) => rowsEl.append(renderRow(record)));
      return;
    }
    const starred = shown.filter((record) => record.starred);
    if (starred.length) rowsEl.append(renderFold("starred", L("收藏"), starred));
    folders.forEach((folder) => {
      const items = shown.filter((record) => record.folder_id === folder.id);
      const fold = renderFold(folder.id, folder.title, items, folderActions(folder));
      if (open.size) fold.open = open.has(folder.id);
      rowsEl.append(fold);
    });
    const unfiled = shown.filter((record) => !record.folder_id);
    if (unfiled.length) rowsEl.append(renderFold("", L("未分类"), unfiled));
  };
  const remember = (record, redraw) => {
    sel = record;
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    renderList();
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存"); statusEl.dataset.mwState = "saved";
    markSelected(record.id);
    syncEditorChrome();
    if (redraw) fillEditor(record);
  };
  const ensureEditor = (body) => {
    if (!Editor || !editorHost) throw new Error(L("编辑器内核未加载"));
    if (editor) {
      Editor.setDoc(editor, body);
      return;
    }
    editor = Editor.mount(editorHost, {
      doc: body,
      onComment: (markId) => { void commentOpen(markId); },
      onChange: () => { if (!filling) queueSave(); },
      onFocus: (focus) => { focusNow = focus; reportFocus(); },
      onTools: publishTools,
      onScreen: reportFocus,
      openPanel: (panel) => (focusShown || !panel.node) && sendPanel(panel),
      translate: L,
      pages: () => records.map((item) => ({ id: item.id, title: item.title })),
      onOpenPage: (id) => {
        const record = records.find((item) => item.id === id);
        if (record) void openDocument(record).catch((error) => showNote(error.message || L("保存失败"), true));
      },
      runAi: async (input) => {
        if (!sel) throw new Error(L("文档请求失败"));
        const id = sel.id;
        const revision = editRev;
        if (saveTimer || dirty) await persist();
        if (!sel || sel.id !== id || editRev !== revision) throw new Error(L("文档已改变，请重新生成"));
        const result = await request("POST", pageUrl(id, "/ai"), { ...input, expected_version: sel.version });
        if (!sel || sel.id !== id || editRev !== revision) throw new Error(L("文档已改变，请重新生成"));
        return result;
      },
      onCreateFromAi: async (input) => {
        const content = String(input.text || "").split(/\\n{2,}/).map((part) => (
          part.trim()
            ? { type: "paragraph", content: [{ type: "text", text: part.trim() }] }
            : { type: "paragraph" }
        ));
        await createPage({ title: input.title, body: { type: "doc", content } });
      },
    });
  };
  const draftOf = () => {
    if (!sel || unshowable) return null;
    return {
      id: sel.id,
      title: titleInput.value,
      body: editor && Editor ? Editor.getDoc(editor) : sel.body,
      version: editRev,
      server_version: sel.version,
    };
  };
  const storeDocument = (document) => {
    const index = records.findIndex((item) => item.id === document.id);
    if (index >= 0) records[index] = document;
    else records.unshift(document);
    renderList();
  };
  const adoptSaved = (draft, document) => {
    storeDocument(document);
    if (!sel || sel.id !== draft.id) return document;
    if (editRev !== draft.version || saveTimer) {
      sel = {
        ...sel,
        goal_id: document.goal_id,
        artifact_id: document.artifact_id,
        artifact_version: document.artifact_version,
        publication_pending: document.publication_pending,
        version: document.version,
        updated_at: document.updated_at,
      };
      return document;
    }
    sel = document;
    titleEl.textContent = document.title;
    statusEl.textContent = L("已保存"); statusEl.dataset.mwState = "saved";
    markSelected(document.id);
    syncEditorChrome();
    if (document.activeElement !== titleInput) titleInput.value = document.title;
    return document;
  };
  const enqueueSave = (draft, patch) => {
    const run = saveQueue.then(async () => {
      const payload = await request("POST", pageUrl(draft.id), {
        ...(patch || { title: draft.title, body: draft.body }),
        expected_version: sel && sel.id === draft.id ? sel.version : draft.server_version,
      });
      if (!payload.document || payload.document.id !== draft.id) throw new Error(L("文档请求失败"));
      if (!patch) savedByPerson(payload.document);
      return adoptSaved(draft, payload.document);
    });
    saveQueue = run.then(() => undefined, () => undefined);
    return run;
  };
  ${PAGES_BLANK_CLIENT_SCRIPT}
  const fillEditor = (record) => {
    editorEpoch += 1; const switching = Boolean(sel && record && sel.id !== record.id);
    const leaving = switching ? draftOf() : null;
    const left = switching ? blankLeaving() : null;
    const pending = Boolean(switching && (saveTimer || dirty));
    clearTimeout(saveTimer);
    saveTimer = 0;
    filling = true;
    sel = record;
    bench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存"); statusEl.dataset.mwState = "saved";
    titleInput.value = record.title;
    // A body this editor cannot show (written elsewhere in another structure) is not shown as an empty page: the next
    // keystroke would save that empty page over it. It stays read-only and unsaved until it is replaced or undone.
    unshowable = Boolean(record.body && Editor && Editor.canShow && !Editor.canShow(record.body));
    try {
      ensureEditor(unshowable ? Editor.emptyDoc() : record.body || (Editor && Editor.emptyDoc()));
    } finally {
      filling = false;
    }
    if (editor && editor.view) editor.view.setProps({ editable: () => !unshowable });
    titleInput.disabled = unshowable;
    markSelected(record.id);
    syncEditorChrome();
    showNote("", false);
    if (pending && leaving) {
      void enqueueSave(leaving).catch((error) => showNote(error.message || L("保存失败"), true));
    }
    void dropBlank(left);
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    sel = null; editorEpoch += 1;
    syncEditorChrome();
    bench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    closeMore();
    closeCreate();
    closeMove();
    bench.querySelectorAll(".pages-slash, .pages-pop, .pages-block-handle, .pages-block-menu, .pages-block-ghost, .pages-drop-line").forEach((node) => { node.hidden = true; });
    sendPanel({ node: null });
  };
  const loadList = async () => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/plugins/pages");
    if (seq !== listSeq) return;
    records = payload.documents || [];
    folders = payload.folders || [];
    renderList();
    if (sel) {
      const next = records.find((item) => item.id === sel.id);
      if (!next) closeEditor();
      else if (!saveTimer && !dirty) {
        // Changed elsewhere (the Assistant, another window): show what is there now. The old text left on screen under
        // the new version would be saved over the change by the next keystroke.
        const moved = next.version !== sel.version;
        remember(next, moved);
        if (moved) editRev += 1;
      }
    }
  };
  const save = async () => {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const draft = draftOf();
    if (!draft) return null;
    try {
      const saved = await enqueueSave(draft);
      if (editRev === draft.version && !saveTimer) dirty = false;
      publishContext();
      return saved;
    } catch (error) {
      dirty = true;
      statusEl.textContent = L("保存失败"); statusEl.dataset.mwState = "failed";
      throw error;
    }
  };
  const queueSave = () => {
    if (unshowable) return;
    statusEl.textContent = L("保存中"); statusEl.dataset.mwState = "saving";
    editRev += 1;
    dirty = true;
    publishContext();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };
  const persist = async () => {
    if (!sel || unshowable) return;
    do { await save(); } while (sel && (saveTimer || dirty));
  };
  const commentOpen = Editor.bindComments({ workbench: bench, persistCurrent: persist, showNote, translate: L, get selected() { return sel; }, get editor() { return editor; }, get unshowable() { return unshowable; }, get dirty() { return dirty || Boolean(saveTimer); } });
  // Showing the document already open here again (its item tab after the page's list, a reload's second request): the
  // workbench took its name off the surface when it hid it, so name it again with its version and title.
  const revealEditor = () => {
    bench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    syncEditorChrome();
  };
  const openDocument = async (record) => {
    if (!record) return;
    if (sel && sel.id === record.id) {
      revealEditor();
      return;
    }
    if (sel && (saveTimer || dirty)) await persist();
    fillEditor(record);
    dirty = false;
    editRev += 1;
  };
  bench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail?.itemId;
    if (!id) { selectionSeq++; openingId = null; leaveOnFold(); return; }
    if (sel?.id === id) {
      revealEditor();
      return;
    }
    if (openingId === id) return;
    openingId = id;
    const seq = ++selectionSeq;
    void (async () => {
      if (sel && (saveTimer || dirty)) await persist();
      const payload = await request("GET", pageUrl(id));
      if (seq !== selectionSeq) return;
      fillEditor(payload.document);
      dirty = false;
      editRev += 1;
      showNote("", false);
    })().catch((error) => { if (seq === selectionSeq) showNote(error.message || L("保存失败"), true); })
      .finally(() => { if (seq === selectionSeq) openingId = null; });
  });
  /** Tell the workbench what just happened, so it can say where the result is and what comes next. */
  const placed = (detail) => { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); };
  const safeName = (value) => String(value || L("无标题")).replace(/[\\\\/:*?"<>|]/g, "_").slice(0, 80);
  const htmlDocument = (body) => "<!doctype html><html lang=\\"zh-CN\\"><head><meta charset=\\"utf-8\\"><title>"
    + escapeHtml(sel.title) + "</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:15px/1.7 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#222}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body><h1>"
    + escapeHtml(sel.title) + "</h1>" + Editor.toHTML(body) + "</body></html>";
  const assertReadable = (record = sel) => { if (record?.body && Editor?.canShow && !Editor.canShow(record.body)) throw new Error(L("这篇文档的内容结构暂不支持此操作，原内容已保留。")); };
  const exportDocument = (format) => {
    assertReadable(); if (!sel || !Editor) return;
    const body = editor ? Editor.getDoc(editor) : sel.body;
    const markdown = format === "md";
    const content = markdown ? "# " + (sel.title || L("无标题")) + "\\n\\n" + Editor.toMarkdown(body) : htmlDocument(body);
    const blob = new Blob([content], { type: markdown ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName(sel.title) + (markdown ? ".md" : ".html");
    link.click();
    URL.revokeObjectURL(url);
    placed({ verb: "exported", title: sel.title, file: { name: link.download, format: markdown ? "Markdown" : L("网页") } });
  };
  const printDocument = () => {
    assertReadable(); if (!sel || !Editor) return;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.append(frame);
    frame.srcdoc = htmlDocument(editor ? Editor.getDoc(editor) : sel.body);
    frame.addEventListener("load", () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      placed({ verb: "printed", title: sel?.title || "" });
      setTimeout(() => frame.remove(), 1000);
    }, { once: true });
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const openCreated = (record) => openDocument(record);
  const createPage = async (body) => {
    const epoch = editorEpoch;
    if (sel && (saveTimer || dirty)) await persist();
    if (editorEpoch !== epoch) return;
    const left = blankLeaving();
    const payload = await request("POST", "/api/plugins/pages", body || {});
    if (!body || !(body.template_id || body.body || body.title)) fresh.set(payload.document.id, { title: payload.document.title, version: payload.document.version });
    storeDocument(payload.document); placed({ verb: "created", title: payload.document.title || L("无标题"), object: { kind: "pages_document", id: payload.document.id } });
    await loadList();
    if (editorEpoch === epoch) { await openCreated(payload.document); titleInput.focus(); titleInput.select(); }
    void dropBlank(left);
  };
  const toggleStar = async (id) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    await request("POST", pageUrl(id), { starred: !record.starred });
    await loadList();
  };
  const movePage = async (id, folderId) => {
    const record = records.find((item) => item.id === id);
    if (!record || (record.folder_id || "") === folderId) return;
    await request("POST", pageUrl(id), { folder_id: folderId });
    await loadList();
  };
  const clearDrop = () => {
    bench.querySelectorAll("[data-pages-drop].is-drop").forEach((node) => node.classList.remove("is-drop"));
  };

  const publishPage = async (id) => {
    if (publishing.has(id)) return;
    publishing.add(id);
    let draft = null;
    try {
      if (sel?.id === id) await persist();
      const current = sel?.id === id ? sel : records.find(record => record.id === id);
      if (!current) return;
      assertReadable(current);
      draft = sel?.id === id ? draftOf() : null;
      const payload = await request("POST", pageUrl(id, "/promote"), {
        goal_id: current.publication_pending?.goal_id ?? current.goal_id ?? "", expected_version: current.version,
      });
      if (draft) adoptSaved(draft, payload.document); else storeDocument(payload.document);
      if (payload.recovered) showNote(L("已恢复上次成果；当前编辑内容已保留，需要时可再存一版。"), false);
      placed({ verb: "versioned", title: payload.document.title, object: { kind: "pages_document", id: payload.document.id }, artifact: payload.artifact,
        note: L("第 {version} 版 · 放在这个位置的成果里；继续编辑不会改变这一版", { version: payload.document.artifact_version }) });
    } catch (error) {
      // A failed response may follow an already committed Artifact. Refresh its
      // durable recovery state while preserving any local edits made in flight.
      try {
        const payload = await request("GET", pageUrl(id));
        if (draft) adoptSaved(draft, payload.document); else storeDocument(payload.document);
        if (sel?.id === id) syncEditorChrome();
      } catch { /* Keep the original error and the user's draft. */ }
      throw error;
    } finally { publishing.delete(id); }
  };
  ${PAGES_IMPORT_CLIENT_SCRIPT}
  // Moved or copied from the placement bar: the list here changed; a document moved away is no longer here to edit.
  window.addEventListener?.("molis:placement-changed", (event) => {
    const detail = event.detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("pages_document")) return;
    void (async () => {
      if (detail.mode === "move" && detail.from && sel && sel.id === detail.from.id) closeEditor();
      await loadList();
    })().catch((error) => showNote(error.message || L("文档请求失败"), true));
  });

  // Back in this window: the open document may have changed elsewhere (another window, the Assistant in another tab).
  // Only it is read again; the change shows at once when nothing of the person's own waits, and otherwise they are told.
  const recheckOpen = async () => {
    if (!sel || document.hidden) return;
    const id = sel.id, version = sel.version;
    const payload = await request("GET", pageUrl(id));
    const next = payload && payload.document;
    if (!next || !sel || sel.id !== id || next.version === version) return;
    if (saveTimer || dirty) { showNote(L("这篇文档刚在别处改过；你还有未保存的修改，保存时会提示冲突，不会覆盖。"), true); return; }
    remember(next, true);
    editRev += 1;
  };
  window.addEventListener?.("focus", () => { void recheckOpen().catch(() => {}); });
  document.addEventListener?.("visibilitychange", () => { void recheckOpen().catch(() => {}); });

  // The Assistant changed a Pages document: show the saved version, unless the person has edits of their own in flight.
  window.addEventListener?.("molis:assistant-effect", (event) => {
    const capability = event.detail && event.detail.capability_id;
    if (typeof capability !== "string" || capability.indexOf("pages.") !== 0) return;
    void (async () => {
      const before = sel ? { id: sel.id, version: sel.version } : null;
      await loadList();
      if (!before || !sel || sel.id !== before.id) return;
      const next = records.find((item) => item.id === before.id);
      if (!next || next.version === before.version) return;
      if (saveTimer || dirty) { showNote(L("助理刚修改了这篇文档；你还有未保存的修改，保存时会提示冲突，不会覆盖。"), true); return; }
      fillEditor(next);
      dirty = false;
      editRev += 1;
    })().catch(() => {});
  });

  titleInput.addEventListener("input", () => {
    if (titleEl) titleEl.textContent = titleInput.value || L("文档");
    queueSave();
  });
  titleInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (!editor || !Editor.focusStart) return;
    event.preventDefault();
    Editor.focusStart(editor);
  });
  searchInput?.addEventListener("input", () => {
    query = searchInput.value || "";
    renderList();
  });
  goalSelect?.addEventListener("change", () => {
    if (!sel) return;
    const draft = draftOf();
    if (!draft) return;
    sel = { ...sel, goal_id: goalSelect.value };
    void enqueueSave(draft, { goal_id: goalSelect.value })
      .catch((error) => {
        dirty = true;
        showNote(error.message || L("保存失败"), true);
      });
  });
  bench.addEventListener("click", async (event) => {
    try {
      if (Date.now() < suppressFoldToggleUntil && event.target.closest("summary")) {
        stop(event);
        return;
      }
      if (event.target.closest("[data-pages-more]")) {
        stop(event);
        closeMove();
        closeCreate();
        toggleMore();
        return;
      }
      if (event.target.closest("[data-pages-create-more]")) {
        stop(event);
        closeMove();
        toggleCreate();
        return;
      }
      const moveTo = event.target.closest("[data-pages-move-to]");
      if (moveTo) {
        stop(event);
        const id = movingId;
        const folderId = moveTo.dataset.pagesMoveTo || "";
        closeMove();
        if (id) await movePage(id, folderId);
        return;
      }
      const move = event.target.closest("[data-pages-move]");
      if (move) {
        stop(event);
        closeMore();
        if (move.getAttribute("aria-expanded") === "true") closeMove();
        else openMove(move, move.dataset.pagesMove);
        return;
      }
      const star = event.target.closest("[data-pages-star]");
      if (star) {
        stop(event);
        await toggleStar(star.dataset.pagesStar);
        return;
      }
      const folderNew = event.target.closest("[data-pages-folder-new]");
      if (folderNew) {
        stop(event);
        await createPage({ folder_id: folderNew.dataset.pagesFolderNew });
        return;
      }
      const folderRename = event.target.closest("[data-pages-folder-rename]");
      if (folderRename) {
        stop(event);
        const folder = folders.find((item) => item.id === folderRename.dataset.pagesFolderRename);
        if (!folder) return;
        const title = await askName(L("文件夹名称"), folder.title);
        if (title == null) return;
        await request("POST", "/api/plugins/pages/folders/" + encodeURIComponent(folder.id), { title });
        await loadList();
        return;
      }
      const folderDelete = event.target.closest("[data-pages-folder-delete]");
      if (folderDelete) {
        stop(event);
        const ok = await ask(L("要删除这个文件夹吗？里面的文档会回到未分类。"), L("删除"));
        if (!ok) return;
        const id = folderDelete.dataset.pagesFolderDelete;
        await request("POST", "/api/plugins/pages/folders/" + encodeURIComponent(id) + "/delete", {});
        await loadList();
        return;
      }
      const template = event.target.closest("[data-pages-template]");
      if (template) {
        templateDialog?.close();
        await createPage({ template_id: template.dataset.pagesTemplate, folder_id: templateFolderId || undefined });
        templateFolderId = "";
        return;
      }
      if (event.target.closest("[data-pages-templates]")) {
        closeCreate();
        templateFolderId = "";
        templateDialog?.showModal();
        return;
      }
      if (event.target.closest("[data-pages-new-folder]")) {
        closeCreate();
        const title = await askName(L("文件夹名称"), "");
        if (title == null) return;
        await request("POST", "/api/plugins/pages/folders", { title });
        await loadList();
        return;
      }
      if (event.target.closest("[data-pages-new]")) {
        closeCreate();
        await createPage({});
        return;
      }
      const listedArtifact = event.target.closest("[data-pages-artifact]");
      if (listedArtifact) {
        await publishPage(listedArtifact.dataset.pagesArtifact);
        return;
      }
      const row = event.target.closest("button[data-page-id]");
      if (row && (event.metaKey || event.ctrlKey)) {
        // Picking, not opening: the open document joins the first pick, so one ⌘-click already gives two.
        const id = row.dataset.pageId;
        if (!picked.size && sel && sel.id !== id) picked.add(sel.id);
        if (picked.has(id)) picked.delete(id); else picked.add(id);
        paintPicked();
        reportFocus();
        return;
      }
      if (row) {
        clearPicked();
        const record = records.find((item) => item.id === row.dataset.pageId);
        if (record) await openDocument(record);
        return;
      }
      if (event.target.closest("[data-pages-star-editor]") && sel) {
        await toggleStar(sel.id);
        return;
      }
      if (event.target.closest("[data-pages-back]")) {
        await persist();
        dirty = false;
        const left = blankLeaving();
        closeEditor();
        await dropBlank(left);
        await loadList();
        return;
      }
      if (event.target.closest("[data-pages-extract]") && sel) {
        closeMore(); assertReadable();
        const id = sel.id, epoch = editorEpoch;
        await persist();
        if (sel?.id !== id || editorEpoch !== epoch) return;
        const draft = draftOf();
        const payload = await request("POST", pageUrl(id, "/extract"), {});
        storeDocument(payload.document);
        if (sel?.id === id && editorEpoch === epoch) {
          if (editRev === draft.version && !dirty && !saveTimer) { remember(payload.document, true); editRev += 1; }
          else await persist();
        }
        await loadList();
        return;
      }
      if (event.target.closest("[data-pages-promote]") && sel) {
        closeMore();
        await publishPage(sel.id);
        return;
      }
      if (event.target.closest("[data-pages-export]") && sel) {
        closeMore();
        exportDocument(event.target.closest("[data-pages-export]").dataset.pagesExport || "html");
        return;
      }
      if (event.target.closest("[data-pages-print]") && sel) {
        closeMore();
        printDocument();
        return;
      }
      if (event.target.closest("[data-pages-delete]") && sel) {
        closeMore();
        const ok = await ask(L("要删除这篇文档吗？删除后无法恢复。"), L("删除"));
        if (!ok) return;
        const id = sel.id;
        await request("POST", pageUrl(id, "/delete"), {});
        closeEditor();
        await loadList();
      }
    } catch (error) {
      showNote(error.message || L("文档请求失败"), true);
    }
  });
  bench.addEventListener("dragstart", (event) => {
    if (event.target.closest(".pages-row-act, .pages-folder-actions, .creative-artifact-act")) {
      event.preventDefault();
      return;
    }
    const row = event.target.closest(".pages-doc-row[data-page-id]");
    if (!row || !event.dataTransfer) return;
    event.dataTransfer.setData("text/plain", row.dataset.pageId);
    event.dataTransfer.effectAllowed = "move";
    row.classList.add("is-dragging");
  });
  bench.addEventListener("dragover", (event) => {
    const fold = event.target.closest("[data-pages-drop=folder]");
    if (!fold) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearDrop();
    fold.classList.add("is-drop");
  });
  bench.addEventListener("dragleave", (event) => {
    const fold = event.target.closest("[data-pages-drop=folder]");
    if (!fold) return;
    const next = event.relatedTarget;
    if (next && fold.contains(next)) return;
    fold.classList.remove("is-drop");
  });
  bench.addEventListener("drop", (event) => {
    const fold = event.target.closest("[data-pages-drop=folder]");
    clearDrop();
    bench.querySelectorAll(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
    if (!fold || !event.dataTransfer) return;
    stop(event);
    suppressFoldToggleUntil = Date.now() + 400;
    const id = event.dataTransfer.getData("text/plain");
    void movePage(id, fold.dataset.folderId || "").catch((error) => showNote(error.message || L("保存失败"), true));
  });
  bench.addEventListener("dragend", () => {
    clearDrop();
    bench.querySelectorAll(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
  });
  document.addEventListener("pointerdown", (event) => {
    const target = event.target && event.target.nodeType === 1 ? event.target : event.target && event.target.parentElement;
    if (!target) return;
    if (moreMenu && !moreMenu.hidden && !moreMenu.contains(target) && !moreButton?.contains(target)) closeMore();
    if (createMenu && !createMenu.hidden && !createMenu.contains(target) && !createMore?.contains(target)) closeCreate();
    if (moveMenu && !moveMenu.hidden && !moveMenu.contains(target) && !target.closest("[data-pages-move]")) closeMove();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.querySelector("dialog[open]")) return;
    let handled = false;
    if (moreMenu && !moreMenu.hidden) {
      closeMore();
      moreButton?.focus();
      handled = true;
    }
    if (moveMenu && !moveMenu.hidden) {
      closeMove();
      handled = true;
    }
    if (createMenu && !createMenu.hidden) {
      closeCreate();
      handled = true;
    }
    if (handled) event.preventDefault();
  });
  void loadList().catch((error) => { showNote(error.message || L("文档请求失败"), true); window.MolisWorkPagesEditor.listFailed({empty,rowsEl,L,loadList},error); });
  void loadGoals();
}`;
