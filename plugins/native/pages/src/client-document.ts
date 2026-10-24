import { PAGES_IMPORT_CLIENT_SCRIPT } from "./import-client.js";

/** Part of the Pages workbench client (client.ts): the open document: editor, autosave, open, export and print. A source slice of one function body, joined in order. */
export const PAGES_CLIENT_DOCUMENT = `  const loadList = async () => {
    const seq = ++listSeq;
    const payload = await request("GET", api);
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
  const saveOpen = (id) => sel?.id === id && (saveTimer || dirty) && persist();
  const commentOpen = Editor.bindComments({ workbench: bench, messages: host.messages, persistCurrent: persist, showNote, translate: L, get selected() { return sel; }, get editor() { return editor; }, get unshowable() { return unshowable; }, get dirty() { return dirty || Boolean(saveTimer); } });
  // Shown again (item tab, reload): the workbench took its name off when it hid it, so name it again.
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
    })().catch((error) => { if (seq !== selectionSeq) return; if (error.status === 404 || error.status === 403) bench.dispatchEvent(new CustomEvent("molis-work:item-unreadable", { bubbles: true, detail: { itemId: id } })); if (!sel && (!event.detail?.quiet || error.status === 403)) { bench.setAttribute("data-expanded", "true"); workspace.hidden = false; workspace.dataset.missing = ""; titleEl.textContent = L("文档"); } showNote(error.message || L("保存失败"), true); })
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
    void host.download(blob, safeName(sel.title) + (markdown ? ".md" : ".html")).catch(error => showNote(error.message, true));
    placed({ verb: "exported", title: sel.title, file: { name: safeName(sel.title) + (markdown ? ".md" : ".html"), format: markdown ? "Markdown" : L("网页") } });
  };
  const printDocument = () => {
    assertReadable(); if (!sel || !Editor) return;
    host.printDocument(htmlDocument(editor ? Editor.getDoc(editor) : sel.body));
    placed({ verb: "printed", title: sel.title });
  };
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const openCreated = (record) => openDocument(record);
  const createPage = async (body) => {
    const epoch = editorEpoch;
    if (sel && (saveTimer || dirty)) await persist();
    if (editorEpoch !== epoch) return;
    const left = blankLeaving();
    const payload = await request("POST", api, body || {});
    if (!body || !(body.template_id || body.body || body.title)) fresh.set(payload.document.id, { title: payload.document.title, version: payload.document.version });
    storeDocument(payload.document); placed({ verb: "created", title: payload.document.title || L("无标题"), object: { kind: "pages_document", id: payload.document.id } });
    await loadList();
    void dropBlank(left);
    if (editorEpoch === epoch) { await openCreated(payload.document); titleInput.focus(); titleInput.select(); }
  };
  const toggleStar = async (id) => {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    await saveOpen(id);
    await request("POST", pageUrl(id), { starred: !record.starred });
    await loadList();
  };
  const movePage = async (id, folderId) => {
    const record = records.find((item) => item.id === id);
    if (!record || (record.folder_id || "") === folderId) return;
    await saveOpen(id);
    await request("POST", pageUrl(id), { folder_id: folderId });
    await loadList();
  };
  const clearDrop = () => {
    els("[data-pages-drop].is-drop").forEach((node) => node.classList.remove("is-drop"));
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
      // A failed response may follow a committed version: refresh recovery state, keep local edits.
      try {
        const payload = await request("GET", pageUrl(id));
        if (draft) adoptSaved(draft, payload.document); else storeDocument(payload.document);
        if (sel?.id === id) syncEditorChrome();
      } catch { /* Keep the original error and the user's draft. */ }
      throw error;
    } finally { publishing.delete(id); }
  };
  ${PAGES_IMPORT_CLIENT_SCRIPT}
  window.addEventListener?.("molis:placement-changed", (event) => {
    const detail = event.detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("pages_document")) return;
    void (async () => {
      if (detail.mode === "move" && detail.from && sel && sel.id === detail.from.id) closeEditor();
      await loadList();
    })().catch((error) => showNote(error.message || L("文档请求失败"), true));
  });
`;
