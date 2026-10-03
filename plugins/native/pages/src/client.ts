import { PAGES_IMPORT_CLIENT_SCRIPT } from "./import-client.js";

/** Pages workbench client: library, autosave, ProseMirror host. */
export const PAGES_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-pages=workbench]");
  if (!workbench) return;
  const list = workbench.querySelector("[data-pages=directory]");
  const rowsEl = workbench.querySelector("[data-pages-rows]");
  const empty = workbench.querySelector("[data-pages-empty]");
  const searchEmpty = workbench.querySelector("[data-pages-search-empty]");
  const searchInput = workbench.querySelector("[data-pages-search]");
  const workspace = workbench.querySelector("[data-pages-stage-workspace]");
  const titleEl = workbench.querySelector("[data-pages-editor-title]");
  const statusEl = workbench.querySelector("[data-pages-editor-status]");
  const titleInput = workbench.querySelector("[data-pages-title]");
  const goalSelect = workbench.querySelector("[data-pages-goal]");
  const starEditor = workbench.querySelector("[data-pages-star-editor]");
  const editorHost = workbench.querySelector("[data-pages-editor]");
  const note = workbench.querySelector("[data-pages-note]");
  const confirmDialog = workbench.querySelector("[data-pages-confirm]");
  const nameDialog = workbench.querySelector("[data-pages-name]");
  const templateDialog = workbench.querySelector("[data-pages-template-dialog]");
  const Editor = window.MolisWorkPagesEditor;
  const ICON = (name) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const moreMenu = workbench.querySelector("[data-pages-more-menu]");
  const moreButton = workbench.querySelector("[data-pages-more]");
  const createMenu = workbench.querySelector("[data-pages-create-menu]");
  const createMore = workbench.querySelector("[data-pages-create-more]");
  const moveMenu = workbench.querySelector("[data-pages-move-menu]");
  let records = [];
  let folders = [];
  let selected = null;
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
  let editVersion = 0;
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
  const request = async (method, path, body) => {
    const payloadBody = body === undefined ? undefined : { ...body, project_id: projectId() };
    const response = await fetch(route(withProject(path)), {
      method,
      headers: headers(),
      body: payloadBody === undefined || method === "GET" ? undefined : JSON.stringify(payloadBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || L("文档请求失败"));
    return payload;
  };
  const showNote = (text, isError) => {
    if (!note) return;
    if (!text && selected?.publication_pending) text = L("上次成果保存尚未完成。继续保存会恢复当时的快照，当前编辑内容可在之后另存一版。");
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
    workbench.querySelectorAll("[data-pages-move][aria-expanded=true]").forEach((node) => {
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
    workbench.querySelectorAll("[data-pages-move]").forEach((node) => {
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
    const current = selected?.goal_id || "";
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
    const unsaved = Boolean(selected && (saveTimer || dirty));
    const context = { plugin_id: "io.molis.work.pages", surface_title: "Pages" };
    if (selected) {
      context.object = { kind: "pages_document", id: selected.id, version: selected.version, title: titleInput.value || selected.title };
      if (unsaved) {
        context.unsaved = true;
        const text = docText(editor && Editor ? Editor.getDoc(editor) : selected.body);
        if (text) context.draft_text = text.slice(0, 20000);
      }
    }
    workbench.setAttribute("data-assistant-context", JSON.stringify(context));
  };
  // What the person has in hand here, for the bar and the Assistant (specs/archive/contextual-interaction §4): the editor's
  // focus around this document. A document this editor cannot show offers nothing to act on. Pages reports its own
  // focus, so a selection elsewhere on this surface (a row of the list, say) is not read as part of the document.
  workbench.setAttribute("data-surface-focus", "own");
  let focusNow = null;
  let focusShown = null;
  const surfaceFocus = () => {
    if (!focusNow || !selected || unshowable) return null;
    const goal = goals.find((item) => item.id === selected.goal_id);
    return { context_id: "pages:" + selected.id + ":" + focusNow.local_id, plugin_id: "io.molis.work.pages",
      activity: focusNow.activity, granularity: focusNow.granularity,
      object: { kind: "pages_document", id: selected.id, version: selected.version, title: titleInput.value || selected.title },
      targets: focusNow.targets, surroundings: focusNow.surroundings,
      ...(saveTimer || dirty ? { unsaved: true } : {}), ...(goal ? { goal: { id: goal.id, title: goal.title } } : {}) };
  };
  // Several documents picked in the list (⌘ or Ctrl + click): they are in hand together, to compare or combine.
  // Nothing is written in place for them, so the bar hands their actions to the Assistant as cards.
  const picked = new Set();
  const objectsFocus = () => {
    const chosen = records.filter((record) => picked.has(record.id));
    if (chosen.length < 2) return null;
    return { context_id: "pages-objects:" + chosen.map((record) => record.id + "@" + record.version).sort().join(","),
      plugin_id: "io.molis.work.pages", activity: "selecting", granularity: "objects",
      object: { kind: "pages_document", id: chosen[0].id, version: chosen[0].version, title: chosen[0].title },
      targets: chosen.slice(0, 8).map((record) => {
        const text = (record.title + "\\n" + docText(record.body)).slice(0, 1500);
        return { kind: "object", role: "object", text, ...(text.length >= 1500 ? { truncated: true } : {}),
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
  workbench.addEventListener("keydown", (event) => { if (event.key === "Escape" && picked.size) clearPicked(); });
  const reportFocus = () => {
    const detail = objectsFocus() || surfaceFocus();
    if ((detail ? detail.context_id : null) === (focusShown ? focusShown.context_id : null)) return;
    focusShown = detail;
    workbench.dispatchEvent?.(new CustomEvent("molis:surface-focus", { bubbles: true, detail }));
  };
  // The person chose one of this document's actions in the bar: run it on the range they had in hand when it was
  // ranked, through the writing popup, so the result is a candidate they accept before anything is written. A
  // whole-document action (also one of the Assistant's starting points, with nothing in hand) runs on this document
  // when it is the one open here.
  window.addEventListener?.("molis:assistant-context-action-chosen", (event) => {
    const chosen = event.detail;
    if (!chosen || chosen.plugin_id !== "io.molis.work.pages") return;
    const whole = chosen.scope === "object" && Boolean(chosen.object && selected && !unshowable && chosen.object.id === selected.id);
    if (!whole && (!focusShown || !focusNow || chosen.context_id !== focusShown.context_id || focusShown.granularity === "objects")) return;
    if (!editor || !editor.runCommand || !["result", "replace", "insert_after"].includes(chosen.apply) || typeof chosen.prepare !== "function") return;
    event.preventDefault();
    const documentId = selected.id;
    void editor.runCommand("", undefined, { ...(whole ? { scope: "object" } : { localId: focusNow.local_id }), title: chosen.title,
      mode: chosen.apply === "replace" ? "replace" : "insert_after", okLabel: chosen.apply === "replace" ? L("替换") : L("插到后面"),
      prepare: async () => {
        const prepared = await chosen.prepare();
        const input = prepared && prepared.input ? prepared.input : {};
        if (input.id !== documentId || typeof input.command !== "string") throw new Error(L("这个动作暂时准备不了，请重新选择"));
        return { command: input.command, style: typeof input.style === "string" ? input.style : undefined, text: typeof input.text === "string" ? input.text : undefined };
      } });
  });
  // The writing menu lists exactly what the context row shows for what is in hand (specs/archive/contextual-interaction
  // §6.4.1): the row publishes its plan; a choice in the menu goes back to the row like a click there.
  let menuPlan = null;
  const menuWatchers = new Set();
  document.addEventListener?.("molis:assistant-context-actions", (event) => {
    if (!event.detail || !event.detail.plan) return;
    menuPlan = event.detail.plan;
    [...menuWatchers].forEach((listener) => listener());
  });
  const menuActions = () => {
    if (!menuPlan || !focusShown || menuPlan.context_id !== focusShown.context_id) return null;
    const byKey = new Map(menuPlan.candidates.map((candidate) => [candidate.key, candidate]));
    const item = (key) => {
      const candidate = byKey.get(key);
      return candidate && candidate.available ? { key, title: candidate.title, hint: candidate.hint, emphasis: menuPlan.emphasis === key,
        ...(candidate.source && candidate.source.provider_id !== "io.molis.work.pages" ? { kind: candidate.provider_title } : {}) } : null;
    };
    const groups = [{ title: "", items: menuPlan.primary.map(item).filter(Boolean) },
      ...menuPlan.more.map((group) => ({ title: group.title, items: group.keys.map(item).filter(Boolean) }))];
    return { groups: groups.filter((group) => group.items.length) };
  };
  const chooseMenuAction = (key) => {
    if (!focusShown) return;
    document.dispatchEvent?.(new CustomEvent("molis:assistant-context-action-choose", { detail: { context_id: focusShown.context_id, key } }));
  };
  const syncEditorChrome = () => {
    publishContext();
    reportFocus();
    if (!selected) return;
    if (starEditor) {
      starEditor.classList.toggle("is-on", Boolean(selected.starred));
      starEditor.setAttribute("aria-label", selected.starred ? L("取消收藏") : L("收藏"));
      starEditor.title = selected.starred ? L("取消收藏") : L("收藏");
    }
    fillGoalSelect();
    const artifactBar = workbench.querySelector("[data-pages-artifact-bar]");
    if (artifactBar) artifactBar.textContent = selected.publication_pending ? L("继续保存上次固定版本") : selected.artifact_version > 0 ? L("再存一个固定版本") : L("存为固定版本");
    if (selected.publication_pending) showNote("", false);
  };
  const markSelected = (id) => {
    rowsEl.querySelectorAll("[data-page-id]").forEach((row) => {
      const on = row.dataset.pageId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  // A row's only label is its state: a fixed version exists, or one is still being saved.
  // Only a row that has one gets the cell; a row with no fixed version shows just its title and date.
  const fixedCell = (record) => {
    if (!record.publication_pending && !(record.artifact_version > 0)) return null;
    const node = document.createElement("span");
    node.className = "mw-status mw-status--plain feed-entry-status " + (record.publication_pending ? "mw-status--attention" : "mw-status--done");
    node.textContent = record.publication_pending ? L("固定版本未存完") : L("固定版本") + " v" + record.artifact_version;
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
    row.className = "feed-stage-entry directory-list-row" + (selected?.id === record.id ? " is-selected" : "");
    row.dataset.pageId = record.id;
    row.setAttribute("aria-selected", String(selected?.id === record.id));
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
    selected = record;
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    renderList();
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存");
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
      onChange: () => { if (!filling) queueSave(); },
      onFocus: (focus) => { focusNow = focus; reportFocus(); },
      menuActions,
      watchMenuActions: (listener) => { menuWatchers.add(listener); return () => menuWatchers.delete(listener); },
      chooseMenuAction,
      translate: L,
      pages: () => records.map((item) => ({ id: item.id, title: item.title })),
      onOpenPage: (id) => {
        const record = records.find((item) => item.id === id);
        if (record) void openDocument(record).catch((error) => showNote(error.message || L("保存失败"), true));
      },
      runAi: async (input) => {
        if (!selected) throw new Error(L("文档请求失败"));
        const id = selected.id;
        const revision = editVersion;
        if (saveTimer || dirty) await persistCurrent();
        if (!selected || selected.id !== id || editVersion !== revision) throw new Error(L("文档已改变，请重新生成"));
        const result = await request("POST", "/api/plugins/pages/" + encodeURIComponent(id) + "/ai", { ...input, expected_version: selected.version });
        if (!selected || selected.id !== id || editVersion !== revision) throw new Error(L("文档已改变，请重新生成"));
        return result;
      },
      // Selected text to the resident Assistant, as a suggestion or as the person's own request (spec 8.3).
      askAssistant: (input) => {
        if (!selected) return;
        window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
          message_id: crypto.randomUUID(), purpose: input.mode, source: { surface: "pages", title: "Pages" },
          object: { kind: "pages_document", id: selected.id, title: selected.title, version: selected.version },
          text: input.request, materials: input.selection.trim() ? [{ title: L("选中的文字") + " · " + selected.title, text: input.selection }] : [],
        } }));
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
    if (!selected) return null;
    return {
      id: selected.id,
      title: titleInput.value,
      body: editor && Editor ? Editor.getDoc(editor) : selected.body,
      version: editVersion,
      server_version: selected.version,
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
    if (!selected || selected.id !== draft.id) return document;
    if (editVersion !== draft.version || saveTimer) {
      selected = {
        ...selected,
        goal_id: document.goal_id,
        artifact_id: document.artifact_id,
        artifact_version: document.artifact_version,
        publication_pending: document.publication_pending,
        version: document.version,
        updated_at: document.updated_at,
      };
      return document;
    }
    selected = document;
    titleEl.textContent = document.title;
    statusEl.textContent = L("已保存");
    markSelected(document.id);
    syncEditorChrome();
    if (document.activeElement !== titleInput) titleInput.value = document.title;
    return document;
  };
  const enqueueSave = (draft, patch) => {
    const run = saveQueue.then(async () => {
      const payload = await request("POST", "/api/plugins/pages/" + encodeURIComponent(draft.id), {
        ...(patch || { title: draft.title, body: draft.body }),
        expected_version: selected && selected.id === draft.id ? selected.version : draft.server_version,
      });
      if (!payload.document || payload.document.id !== draft.id) throw new Error(L("文档请求失败"));
      return adoptSaved(draft, payload.document);
    });
    saveQueue = run.then(() => undefined, () => undefined);
    return run;
  };
  const fillEditor = (record) => {
    const switching = Boolean(selected && record && selected.id !== record.id);
    const leaving = switching ? draftOf() : null;
    const pending = Boolean(switching && (saveTimer || dirty));
    clearTimeout(saveTimer);
    saveTimer = 0;
    filling = true;
    selected = record;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = record.title;
    statusEl.textContent = L("已保存");
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
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    selected = null;
    reportFocus();
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    closeMore();
    closeCreate();
    closeMove();
    workbench.querySelectorAll(".pages-format-bar, .pages-slash, .pages-pop, .pages-block-handle, .pages-block-menu, .pages-block-ghost, .pages-drop-line").forEach((node) => { node.hidden = true; });
  };
  const loadList = async () => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/plugins/pages");
    if (seq !== listSeq) return;
    records = payload.documents || [];
    folders = payload.folders || [];
    renderList();
    if (selected) {
      const next = records.find((item) => item.id === selected.id);
      if (!next) closeEditor();
      else if (!saveTimer && !dirty) {
        // Changed elsewhere (the Assistant, another window): show what is there now. The old text left on screen under
        // the new version would be saved over the change by the next keystroke.
        const moved = next.version !== selected.version;
        remember(next, moved);
        if (moved) editVersion += 1;
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
      if (editVersion === draft.version && !saveTimer) dirty = false;
      publishContext();
      return saved;
    } catch (error) {
      dirty = true;
      statusEl.textContent = L("保存失败");
      throw error;
    }
  };
  const queueSave = () => {
    if (unshowable) return;
    statusEl.textContent = L("保存中");
    editVersion += 1;
    dirty = true;
    publishContext();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };
  const persistCurrent = async () => {
    if (!selected) return;
    do { await save(); } while (selected && (saveTimer || dirty));
  };
  // Showing the document already open here again (its item tab after the page's list, a reload's second request): the
  // workbench took its name off the surface when it hid it, so name it again with its version and title.
  const revealEditor = () => {
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    syncEditorChrome();
  };
  const openDocument = async (record) => {
    if (!record) return;
    if (selected && selected.id === record.id) {
      revealEditor();
      return;
    }
    if (selected && (saveTimer || dirty)) await persistCurrent();
    fillEditor(record);
    dirty = false;
    editVersion += 1;
  };
  workbench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail?.itemId;
    if (!id) { selectionSeq++; openingId = null; return; }
    if (selected?.id === id) {
      revealEditor();
      return;
    }
    if (openingId === id) return;
    openingId = id;
    const seq = ++selectionSeq;
    void (async () => {
      if (selected && (saveTimer || dirty)) await persistCurrent();
      const payload = await request("GET", "/api/plugins/pages/" + encodeURIComponent(id));
      if (seq !== selectionSeq) return;
      fillEditor(payload.document);
      dirty = false;
      editVersion += 1;
      showNote("", false);
    })().catch((error) => { if (seq === selectionSeq) showNote(error.message || L("保存失败"), true); })
      .finally(() => { if (seq === selectionSeq) openingId = null; });
  });
  /** Tell the workbench what just happened, so it can say where the result is and what comes next. */
  const placed = (detail) => { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); };
  const safeName = (value) => String(value || L("无标题")).replace(/[\\\\/:*?"<>|]/g, "_").slice(0, 80);
  const htmlDocument = (body) => "<!doctype html><html lang=\\"zh-CN\\"><head><meta charset=\\"utf-8\\"><title>"
    + escapeHtml(selected.title) + "</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:15px/1.7 -apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif;color:#222}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body><h1>"
    + escapeHtml(selected.title) + "</h1>" + Editor.toHTML(body) + "</body></html>";
  const exportDocument = (format) => {
    if (!selected || !Editor) return;
    const body = editor ? Editor.getDoc(editor) : selected.body;
    const markdown = format === "md";
    const content = markdown ? "# " + (selected.title || L("无标题")) + "\\n\\n" + Editor.toMarkdown(body) : htmlDocument(body);
    const blob = new Blob([content], { type: markdown ? "text/markdown;charset=utf-8" : "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = safeName(selected.title) + (markdown ? ".md" : ".html");
    link.click();
    URL.revokeObjectURL(url);
    placed({ verb: "exported", title: selected.title, file: { name: link.download, format: markdown ? "Markdown" : L("网页") } });
  };
  const printDocument = () => {
    if (!selected || !Editor) return;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.append(frame);
    frame.srcdoc = htmlDocument(editor ? Editor.getDoc(editor) : selected.body);
    frame.addEventListener("load", () => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      placed({ verb: "printed", title: selected?.title || "" });
      setTimeout(() => frame.remove(), 1000);
    }, { once: true });
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const openCreated = (record) => {
    remember(record, false);
    fillEditor(record);
  };
  const createPage = async (body) => {
    if (selected && (saveTimer || dirty)) await persistCurrent();
    const payload = await request("POST", "/api/plugins/pages", body || {});
    await loadList();
    openCreated(payload.document);
    placed({ verb: "created", title: payload.document.title || L("无标题"), object: { kind: "pages_document", id: payload.document.id } });
    dirty = false;
    editVersion += 1;
    titleInput.focus();
    titleInput.select();
  };
  const toggleStar = async (id) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    await request("POST", "/api/plugins/pages/" + encodeURIComponent(id), { starred: !record.starred });
    await loadList();
  };
  const movePage = async (id, folderId) => {
    const record = records.find((item) => item.id === id);
    if (!record || (record.folder_id || "") === folderId) return;
    await request("POST", "/api/plugins/pages/" + encodeURIComponent(id), { folder_id: folderId });
    await loadList();
  };
  const clearDrop = () => {
    workbench.querySelectorAll("[data-pages-drop].is-drop").forEach((node) => node.classList.remove("is-drop"));
  };

  const publishPage = async (id) => {
    if (publishing.has(id)) return;
    publishing.add(id);
    let draft = null;
    try {
      if (selected?.id === id) await persistCurrent();
      const current = selected?.id === id ? selected : records.find(record => record.id === id);
      if (!current) return;
      draft = selected?.id === id ? draftOf() : null;
      const payload = await request("POST", "/api/plugins/pages/" + encodeURIComponent(id) + "/promote", {
        goal_id: current.publication_pending?.goal_id ?? current.goal_id ?? "", expected_version: current.version,
      });
      if (draft) adoptSaved(draft, payload.document); else storeDocument(payload.document);
      if (payload.recovered) showNote(L("已恢复上次成果；当前编辑内容已保留，需要时可再存一版。"), false);
      placed({ verb: "versioned", title: payload.document.title, object: { kind: "pages_document", id: payload.document.id },
        note: L("第 {version} 版 · 放在这个位置的成果里；继续编辑不会改变这一版", { version: payload.document.artifact_version }) });
    } catch (error) {
      // A failed response may follow an already committed Artifact. Refresh its
      // durable recovery state while preserving any local edits made in flight.
      try {
        const payload = await request("GET", "/api/plugins/pages/" + encodeURIComponent(id));
        if (draft) adoptSaved(draft, payload.document); else storeDocument(payload.document);
        if (selected?.id === id) syncEditorChrome();
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
      if (detail.mode === "move" && detail.from && selected && selected.id === detail.from.id) closeEditor();
      await loadList();
    })().catch((error) => showNote(error.message || L("文档请求失败"), true));
  });

  // Back in this window: the open document may have changed elsewhere (another window, the Assistant in another tab).
  // Only it is read again; the change shows at once when nothing of the person's own waits, and otherwise they are told.
  const recheckOpen = async () => {
    if (!selected || document.hidden) return;
    const id = selected.id, version = selected.version;
    const payload = await request("GET", "/api/plugins/pages/" + encodeURIComponent(id));
    const next = payload && payload.document;
    if (!next || !selected || selected.id !== id || next.version === version) return;
    if (saveTimer || dirty) { showNote(L("这篇文档刚在别处改过；你还有未保存的修改，保存时会提示冲突，不会覆盖。"), true); return; }
    remember(next, true);
    editVersion += 1;
  };
  window.addEventListener?.("focus", () => { void recheckOpen().catch(() => {}); });
  document.addEventListener?.("visibilitychange", () => { void recheckOpen().catch(() => {}); });

  // The Assistant changed a Pages document: show the saved version, unless the person has edits of their own in flight.
  window.addEventListener?.("molis:assistant-effect", (event) => {
    const capability = event.detail && event.detail.capability_id;
    if (typeof capability !== "string" || capability.indexOf("pages.") !== 0) return;
    void (async () => {
      const before = selected ? { id: selected.id, version: selected.version } : null;
      await loadList();
      if (!before || !selected || selected.id !== before.id) return;
      const next = records.find((item) => item.id === before.id);
      if (!next || next.version === before.version) return;
      if (saveTimer || dirty) { showNote(L("助理刚修改了这篇文档；你还有未保存的修改，保存时会提示冲突，不会覆盖。"), true); return; }
      fillEditor(next);
      dirty = false;
      editVersion += 1;
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
    if (!selected) return;
    const draft = draftOf();
    if (!draft) return;
    selected = { ...selected, goal_id: goalSelect.value };
    void enqueueSave(draft, { goal_id: goalSelect.value })
      .catch((error) => {
        dirty = true;
        showNote(error.message || L("保存失败"), true);
      });
  });
  workbench.addEventListener("click", async (event) => {
    try {
      if (Date.now() < suppressFoldToggleUntil && event.target.closest("summary")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.target.closest("[data-pages-more]")) {
        event.preventDefault();
        event.stopPropagation();
        closeMove();
        closeCreate();
        toggleMore();
        return;
      }
      if (event.target.closest("[data-pages-create-more]")) {
        event.preventDefault();
        event.stopPropagation();
        closeMove();
        toggleCreate();
        return;
      }
      const moveTo = event.target.closest("[data-pages-move-to]");
      if (moveTo) {
        event.preventDefault();
        event.stopPropagation();
        const id = movingId;
        const folderId = moveTo.dataset.pagesMoveTo || "";
        closeMove();
        if (id) await movePage(id, folderId);
        return;
      }
      const move = event.target.closest("[data-pages-move]");
      if (move) {
        event.preventDefault();
        event.stopPropagation();
        closeMore();
        if (move.getAttribute("aria-expanded") === "true") closeMove();
        else openMove(move, move.dataset.pagesMove);
        return;
      }
      const star = event.target.closest("[data-pages-star]");
      if (star) {
        event.preventDefault();
        event.stopPropagation();
        await toggleStar(star.dataset.pagesStar);
        return;
      }
      const folderNew = event.target.closest("[data-pages-folder-new]");
      if (folderNew) {
        event.preventDefault();
        event.stopPropagation();
        await createPage({ folder_id: folderNew.dataset.pagesFolderNew });
        return;
      }
      const folderRename = event.target.closest("[data-pages-folder-rename]");
      if (folderRename) {
        event.preventDefault();
        event.stopPropagation();
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
        event.preventDefault();
        event.stopPropagation();
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
        if (!picked.size && selected && selected.id !== id) picked.add(selected.id);
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
      if (event.target.closest("[data-pages-star-editor]") && selected) {
        await toggleStar(selected.id);
        return;
      }
      if (event.target.closest("[data-pages-back]")) {
        await persistCurrent();
        dirty = false;
        closeEditor();
        await loadList();
        return;
      }
      if (event.target.closest("[data-pages-extract]") && selected) {
        closeMore();
        const id = selected.id;
        await persistCurrent();
        const payload = await request("POST", "/api/plugins/pages/" + encodeURIComponent(id) + "/extract", {});
        await loadList();
        if (selected && selected.id === id) {
          dirty = false;
          remember(payload.document, true);
        }
        return;
      }
      if (event.target.closest("[data-pages-promote]") && selected) {
        closeMore();
        await publishPage(selected.id);
        return;
      }
      if (event.target.closest("[data-pages-export]") && selected) {
        closeMore();
        exportDocument(event.target.closest("[data-pages-export]").dataset.pagesExport || "html");
        return;
      }
      if (event.target.closest("[data-pages-print]") && selected) {
        closeMore();
        printDocument();
        return;
      }
      if (event.target.closest("[data-pages-delete]") && selected) {
        closeMore();
        const ok = await ask(L("要删除这篇文档吗？删除后无法恢复。"), L("删除"));
        if (!ok) return;
        const id = selected.id;
        await request("POST", "/api/plugins/pages/" + encodeURIComponent(id) + "/delete", {});
        closeEditor();
        await loadList();
      }
    } catch (error) {
      showNote(error.message || L("文档请求失败"), true);
    }
  });
  workbench.addEventListener("dragstart", (event) => {
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
  workbench.addEventListener("dragover", (event) => {
    const fold = event.target.closest("[data-pages-drop=folder]");
    if (!fold) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    clearDrop();
    fold.classList.add("is-drop");
  });
  workbench.addEventListener("dragleave", (event) => {
    const fold = event.target.closest("[data-pages-drop=folder]");
    if (!fold) return;
    const next = event.relatedTarget;
    if (next && fold.contains(next)) return;
    fold.classList.remove("is-drop");
  });
  workbench.addEventListener("drop", (event) => {
    const fold = event.target.closest("[data-pages-drop=folder]");
    clearDrop();
    workbench.querySelectorAll(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
    if (!fold || !event.dataTransfer) return;
    event.preventDefault();
    event.stopPropagation();
    suppressFoldToggleUntil = Date.now() + 400;
    const id = event.dataTransfer.getData("text/plain");
    void movePage(id, fold.dataset.folderId || "").catch((error) => showNote(error.message || L("保存失败"), true));
  });
  workbench.addEventListener("dragend", () => {
    clearDrop();
    workbench.querySelectorAll(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
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
  // A list that cannot be read says so where the list is, with a way to try again (the note lives in the editor).
  const listFailed = (error) => {
    if (empty) empty.hidden = true;
    const box = document.createElement("div");
    box.className = "mw-empty mw-empty--error";
    box.setAttribute("role", "alert");
    box.innerHTML = '<span class="mw-empty__mark"><svg aria-hidden="true"><use href="#icon-circle-alert"></use></svg></span><strong></strong><p></p><button class="mw-btn mw-btn--secondary" type="button"></button>';
    box.querySelector("strong").textContent = L("列表暂时读不到");
    box.querySelector("p").textContent = error?.message || L("请稍后重试");
    const retry = box.querySelector("button");
    retry.textContent = L("重试");
    retry.addEventListener("click", () => { retry.disabled = true; void loadList().then(() => box.remove(), (next) => { retry.disabled = false; box.querySelector("p").textContent = next?.message || L("请稍后重试"); }); });
    rowsEl.replaceChildren(box);
  };
  void loadList().catch((error) => { showNote(error.message || L("文档请求失败"), true); listFailed(error); });
  void loadGoals();
}`;
