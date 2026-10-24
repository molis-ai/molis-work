import { PAGES_LANDING_CLIENT_SCRIPT } from "./landing-client.js";

/** Part of the Pages workbench client (client.ts): notes, dialogs, menus, the goal select and the Pages context the workbench client publishes. A source slice of one function body, joined in order. */
export const PAGES_CLIENT_MENUS = `  const showNote = (text, isError) => {
    if (!note) return;
    if (!text && sel?.publication_pending) text = L("上次成果保存尚未完成。继续保存会恢复当时的快照，当前编辑内容可在之后另存一版。");
    // While the open body cannot be shown, clearing other notes leaves this one: the page is read-only for that reason.
    if (!text && unshowable) { text = L("这篇文档的内容结构在编辑器里显示不了，为了不覆盖原内容，这里暂停编辑和自动保存。可以让助理重新写一遍，或在助理的工作面板里撤销那次修改。"); isError = true; }
    note.hidden = !text;
    note.textContent = text || "";
    note.classList.toggle("is-error", Boolean(isError && text));
  };
  // The shared box (host.confirmBox): with a run function the request goes out inside it and a refusal is said there.
  const ask = (message, okLabel, run) => {
    if (!confirmDialog) return Promise.resolve(false);
    const ok = confirmDialog.querySelector("[data-confirm-ok]");
    confirmDialog.querySelector("[data-confirm-text]").textContent = message; ok.textContent = okLabel;
    return host.confirmBox(confirmDialog, ok, run);
  };
  const askName = (message, initial, save) => new Promise((resolve) => {
    if (!nameDialog) { resolve(null); return; }
    const input = nameDialog.querySelector("[data-name-input]"), ok = nameDialog.querySelector("[data-name-ok]"), bad = nameDialog.querySelector("[data-name-error]");
    nameDialog.querySelector("[data-name-label]").textContent = message; input.value = initial || ""; bad.hidden = true; nameDialog.returnValue = "cancel"; let busy = false;
    nameDialog.onclose = () => { nameDialog.onclose = nameDialog.oncancel = null; resolve(nameDialog.returnValue === "ok" ? input.value : null); };
    nameDialog.oncancel = (event) => { if (busy) event.preventDefault(); };
    nameDialog.querySelector("[data-name-cancel]").onclick = () => { if (!busy) nameDialog.close("cancel"); };
    nameDialog.querySelector("form").onsubmit = async (event) => {
      event.preventDefault();
      if (busy) return;
      busy = true; bad.hidden = true; ok.setAttribute("data-loading", ""); ok.insertAdjacentHTML("afterbegin", '<span class="mw-spinner" aria-hidden="true"></span>');
      try { await save(input.value); nameDialog.close("ok"); } catch (error) { bad.textContent = error.message; bad.hidden = false; input.focus(); }
      finally { busy = false; ok.removeAttribute("data-loading"); ok.querySelector(".mw-spinner").remove(); }
    };
    nameDialog.showModal(); input.focus(); input.select();
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
    els("[data-pages-move][aria-expanded=true]").forEach((node) => {
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
    els("[data-pages-move]").forEach((node) => {
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
      const payload = await host.invokeAction({ capability_id: "goals.collection.read", version: 2 }, {});
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
    bench.setAttribute("data-assistant-context", JSON.stringify(context)); landing.report(); closingBlank();
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
  // What the list (a listbox that picks several) says is selected: the picked documents, else the open one.
  const chosen = (id) => (picked.size ? picked.has(id) : sel?.id === id);
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
      row.querySelector("button[data-page-id]")?.setAttribute("aria-selected", String(chosen(row.dataset.pageId)));
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
    landing.report(); const detail = objectsFocus() || surfaceFocus();
    if (placeOf(detail) === placeOf(focusShown)) return;
    focusShown = detail;
    bench.dispatchEvent?.(new CustomEvent("molis:surface-focus", { bubbles: true, detail }));
    if (detail) publishTools();
  };
  ${PAGES_LANDING_CLIENT_SCRIPT}
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
    const artifactBar = el("[data-pages-artifact-bar]");
    if (artifactBar) artifactBar.textContent = sel.publication_pending ? L("继续保存上次固定版本") : sel.artifact_version > 0 ? L("再存一个固定版本") : L("存为固定版本");
    if (sel.publication_pending) showNote("", false);
  };
  const markSelected = (id) => {
    rowsEl.querySelectorAll("[data-page-id]").forEach((row) => {
      const on = row.dataset.pageId === id;
      row.classList.toggle("is-selected", on);
    });
    paintPicked();
  };`;
