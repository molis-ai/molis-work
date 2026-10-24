/** Part of the Pages workbench client (client.ts): page actions (create, star, move, publish), the focus recheck and the listeners. A source slice of one function body, joined in order. */
export const PAGES_CLIENT_ACTIONS = `  // Back in this window: the open document may have changed elsewhere (another window, the Assistant in another tab).
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
        const title = await askName(L("文件夹名称"), folder.title, (title) => request("POST", api + "/folders/" + encodeURIComponent(folder.id), { title }));
        if (title == null) return;
        await loadList();
        return;
      }
      const folderDelete = event.target.closest("[data-pages-folder-delete]");
      if (folderDelete) {
        stop(event);
        const id = folderDelete.dataset.pagesFolderDelete;
        const ok = await ask(L("要删除这个文件夹吗？里面的文档会回到未分类。"), L("删除"), async () => {
          if (sel?.folder_id === id) await saveOpen(sel.id);
          await request("POST", api + "/folders/" + encodeURIComponent(id) + "/delete", {});
        });
        if (!ok) return;
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
        const title = await askName(L("文件夹名称"), "", (title) => request("POST", api + "/folders", { title }));
        if (title == null) return;
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
        const id = sel.id;
        const ok = await ask(L("要删除这篇文档吗？删除后无法恢复。"), L("删除"), () => request("POST", pageUrl(id, "/delete"), {}));
        if (!ok) return;
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
    els(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
    if (!fold || !event.dataTransfer) return;
    stop(event);
    suppressFoldToggleUntil = Date.now() + 400;
    const id = event.dataTransfer.getData("text/plain");
    void movePage(id, fold.dataset.folderId || "").catch((error) => showNote(error.message || L("保存失败"), true));
  });
  bench.addEventListener("dragend", () => {
    clearDrop();
    els(".pages-doc-row.is-dragging").forEach((node) => node.classList.remove("is-dragging"));
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
  void loadGoals();`;
