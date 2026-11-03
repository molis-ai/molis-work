/** Functions workbench, part of FUNCTIONS_CLIENT_FACTORY_SCRIPT joined in place: event wiring, preview, publish and the first load. */
export const FUNCTIONS_CLIENT_EVENTS_PART = `  bench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail?.itemId;
    if (!id) { selectSeq++; openingId = null; return; }
    if (sel?.id === id) {
      bench.setAttribute("data-expanded", "true"); workspace.hidden = false; return;
    }
    if (openingId === id) return;
    openingId = id;
    const seq = ++selectSeq;
    void (async () => {
      if (sel && (saveTick || saving || dirty)) { clearTimeout(saveTick); saveTick = 0; await saveDraft(); }
      await loadCatalog();
      const payload = await req("GET", "/api/functions/" + encodeURIComponent(id));
      if (seq === selectSeq) remember(payload.function);
    })().catch((error) => { if (seq === selectSeq) showNote(error, true); })
      .finally(() => { if (seq === selectSeq) openingId = null; });
  });
  const openCreate = () => {
    if (typeof createBox.showModal === "function") createBox.showModal();
    else createBox.setAttribute("open", "");
  };
  const closeCreate = () => {
    if (typeof createBox.close === "function") createBox.close();
    else createBox.removeAttribute("open");
  };

  bench.querySelector("[data-functions-new]").addEventListener("click", () => {
    showNote("", false);
    openCreate();
  });
  bench.querySelectorAll("[data-functions-create-close]").forEach((node) => {
    node.addEventListener("click", () => closeCreate());
  });
  let creating = false;
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (creating) return;
    creating = true;
    const createNote = bench.querySelector("[data-functions-create-note]");
    createNote.textContent = "";
    const submitter = event.submitter;
    const primitive = submitter && submitter.value ? submitter.value : "choice";
    createForm.querySelectorAll("button").forEach((node) => { node.disabled = true; });
    try {
      if (dirty || saveTick || saving) await saveDraft();
      const payload = await req("POST", "/api/functions", { primitive });
      closeCreate();
      await loadList();
      remember(payload.function);
    } catch (error) {
      molisWorkRequest.show(createNote,error,L("保存失败"));
    } finally {
      creating = false;
      createForm.querySelectorAll("button").forEach((node) => { node.disabled = false; });
    }
  });
  bench.querySelector("[data-functions-back]").addEventListener("click", async () => {
    try {
      await saveDraft();
      closeEditor();
      await loadList();
    } catch (error) { showNote(error, true); }
  });
  deleteBtn.addEventListener("click", async () => {
    if (!sel || sel.status === "published") return;
    const rec = sel;
    if (!window.confirm(L("确定删除这个草稿？"))) return;
    try {
      await req("POST", "/api/functions/" + encodeURIComponent(rec.id) + "/delete", { updated_at: rec.updated_at });
      if (sel?.id === rec.id) closeEditor();
      await loadList({ preserveForm: true });
    } catch (error) { if (sel?.id === rec.id) showNote(error, true); }
  });
  addCrit.addEventListener("click", () => {
    if (sel?.status === "published") return;
    if (prim(sel) === "score") addScoreRow("");
    else if (prim(sel) === "choice") addChoice(nextOptionKey(), "");
    paintPalette(sel);
    renderMap(sel);
    queueSave();
  });
  usagesEl?.addEventListener("click", async (event) => {
    const btnEl = event.target.closest("[data-functions-scene-bind]");
    const args = btnEl && configReads.get(btnEl);
    if (!args || btnEl.disabled || sel?.id !== args.id) return;
    const rec = sel;
    btnEl.disabled = true;
    try {
      await ruleRequest(rec, "configure", "POST", args);
      if (sel?.id === rec.id) await paintUses(sel);
    } catch (error) {
      if (sel?.id !== rec.id) return;
      await paintUses(sel);
      if (sel?.id !== rec.id) return;
      const status = document.createElement("p"); status.setAttribute("role", "alert");
      molisWorkRequest.show(status,error,L("配置未保存，请重试。")); usagesEl.append(status);
    }
  });
  bench.querySelector("[data-functions-destinations]").addEventListener("click", (event) => {
    const btnEl = event.target.closest("[data-functions-destination]");
    if (!btnEl || !sel || sel.status === "published" || btnEl.disabled) return;
    const dst = btnEl.dataset.functionsDestination || "";
    if (prim(sel) === "score" && dst && dst !== "agent.mcp") {
      showNote(L("Score 不能绑 Inbox、首页、Feed。"), true);
      return;
    }
    const ref = destRef(btnEl);
    if (dst === (sel.scene_id || "") && ref.scene_version === (sel.scene_version || null)
      && ref.scene_provider_id === (sel.scene_provider_id || null)) return;
    sel = {
      ...sel,
      ...ref,
      scene_map: dst && dst !== "agent.mcp" ? (sel.scene_map || {}) : {},
      action_map: dst === "agent.mcp" ? (sel.action_map || {}) : {},
    };
    renderRoute(sel);
    syncPanel();
    void paintUses(sel);
    queueSave();
  });
  paletteFind.addEventListener("input", () => { if (sel) paintPalette(sel); });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-functions-palette-search], [data-functions-preview-input]")) return;
    if (event.target.matches("[data-choice-key], [data-choice-description]")) {
      if (sel) renderMap({ ...sel, criteria: readCriteria(), scene_map: sceneMap(), action_map: actionMap() });
    }
    queueSave();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-functions-source]")) {
      if (sel && sel.status !== "published") {
        sel = { ...sel, subject_kinds: readKinds(), scene_map: sceneMap(), action_map: actionMap() };
        renderRoute(sel);
        syncPanel();
      }
    }
    if (event.target.matches("[data-map-key]") && sel) {
      sel = { ...sel, scene_map: sceneMap(), action_map: actionMap(), criteria: readCriteria() };
      void paintUses(sel);
    }
    queueSave();
  });
  form.addEventListener("click", (event) => {
    const paletteAdd = event.target.closest("[data-palette-add]");
    if (paletteAdd && sel?.status !== "published" && prim(sel) === "choice") {
      const beh = behaviorOf(paletteAdd.dataset.paletteAdd);
      sel = { ...sel, scene_map: sceneMap(), action_map: actionMap() };
      if (beh.action_ref && destKey() === "agent.mcp") sel.action_map[beh.behavior_id] = beh.action_ref;
      if (!readKeys().includes(beh.behavior_id)) {
        addChoice(beh.behavior_id, behaviorTitle(beh));
      }
      paintPalette(sel);
      renderMap(sel);
      queueSave();
      return;
    }
    const removeChoice = event.target.closest("[data-choice-remove]");
    if (removeChoice && sel?.status !== "published") {
      if (critEl.querySelectorAll("[data-choice-row]").length < 3) {
        showNote(L("Choice 至少需要两个选项"), true);
        return;
      }
      removeChoice.closest("[data-choice-row]").remove();
      paintPalette(sel);
      renderMap(sel);
      queueSave();
      return;
    }
    const removeScore = event.target.closest("[data-score-remove]");
    if (removeScore && sel?.status !== "published") {
      if (critEl.querySelectorAll("[data-score-level]").length < 3) {
        showNote(L("Score 至少需要两个档位"), true);
        return;
      }
      removeScore.closest(".functions-criterion").remove();
      [...critEl.querySelectorAll("[data-score-index]")].forEach((node, index) => { node.textContent = String(index); });
      queueSave();
    }
  });
  samplesEl.addEventListener("click", async (event) => {
    const load = event.target.closest("[data-sample-load]");
    const remove = event.target.closest("[data-sample-remove]");
    const row = event.target.closest("[data-sample-id]");
    if (!row || !sel) return;
    const sample = (sel.samples || []).find((item) => item.id === row.dataset.sampleId);
    if (load && sample) sampleText.value = sample.input || "";
    if (remove) {
      const rec = sel, origin = { id: rec.id, revision: editRevision };
      try {
        const payload = await req("POST", "/api/functions/" + encodeURIComponent(rec.id) + "/samples/delete", {
          sample_id: row.dataset.sampleId, updated_at: rec.updated_at,
        });
        remember(payload.function, origin);
      } catch (error) { if (sel?.id === rec.id) showNote(error, true); }
    }
  });
  bench.querySelector("[data-functions-save-sample]").addEventListener("click", async () => {
    if (!sel) return;
    const origin = { id: sel.id, revision: editRevision }, input = sampleText.value;
    try {
      const saved = await saveDraft();
      const payload = await req("POST", "/api/functions/" + encodeURIComponent(origin.id) + "/samples", { input, updated_at: saved.updated_at });
      remember(payload.function, origin);
    } catch (error) { if (sel?.id === origin.id) showNote(error, true); }
  });
  rowsEl.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    const rec = records.find((item) => item.id === row.dataset.functionId);
    if (rec) {
      if (sel?.id === rec.id) return;
      try {
        if (saveTick || saving || dirty) await saveDraft();
        fillEditor(rec);
      } catch (error) { showNote(error, true); }
    }
  });
  let previewing = false;
  const previewBtn = bench.querySelector("[data-functions-preview]");
  previewBtn.addEventListener("click", async () => {
    if (!sel || previewing) return;
    const previewId = sel.id;
    previewing = true;
    bench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = true; });
    pubBtn.disabled = true;
    previewBtn.disabled = true;
    previewBtn.textContent = L("正在试跑…");
    showNote(L("正在请求判断，通常需要几秒。"), false);
    try {
      await saveDraft();
      if (sel?.id !== previewId) return;
      const payload = await req("POST", "/api/functions/" + encodeURIComponent(previewId) + "/preview", {
        input: sampleText.value,
        updated_at: sel.updated_at,
      });
      if (sel?.id !== previewId) return;
      remember(payload.function);
    } catch (error) {
      if (sel?.id === previewId) {
        if (error.code === "functions.invalid" && !promptInput.value.trim()) setStep("fn", true);
        showNote(error, true);
        if (error.code === "functions.provider_not_configured" || error.code === "actions.connection_required") {
          const link = document.createElement("a");
          const connection = new URL("/capabilities/connections", location.origin);
          connection.searchParams.set("connector", "typesafe");
          const current = page.address();
          for (const key of ["project", "desktop"]) if (current.searchParams.has(key)) connection.searchParams.set(key, current.searchParams.get(key));
          link.href = connection.pathname + connection.search;
          link.textContent = L("连接判断服务");
          note.append(document.createTextNode(" "), link);
        }
      }
    } finally {
      previewing = false;
      bench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = false; });
      pubBtn.disabled = false;
      previewBtn.disabled = false;
      previewBtn.textContent = L("试跑");
    }
  });
  pubBtn.addEventListener("click", async () => {
    if (!sel || pubBtn.disabled) return;
    if (destKey() && destKey() !== "agent.mcp" && !mappingReady({ ...sel, scene_id: destKey(), criteria: readCriteria(), scene_map: sceneMap() })) {
      setStep("fn", true);
      showNote(L("还有结果未对应页面动作，请补齐后再发布。"), true);
      return;
    }
    const publishId = sel.id;
    pubBtn.disabled = true;
    showNote("", false);
    try {
      await saveDraft();
      if (sel?.id !== publishId) return;
      const path = "/api/functions/" + encodeURIComponent(publishId) + "/publish";
      const body = { updated_at: sel.updated_at };
      const payload = api ? await api(path, "POST", body) : await req("POST", path, body);
      if (sel?.id !== publishId) return;
      remember(payload.function);
      await loadList();
    } catch (error) {
      if (sel?.id === publishId) showNote(error, true);
    } finally { pubBtn.disabled = false; }
  });
  const load = () => loadCatalog().then(loadList).catch((error) => {
    empty.hidden = false;
    molisWorkRequest.show(empty.querySelector("p"),error,L("Functions 请求失败"));
    let retry = empty.querySelector("button");
    if (!retry) {
      retry = document.createElement("button");
      retry.type = "button";
      retry.className = "mw-btn mw-btn--secondary";
      retry.textContent = L("重新加载");
      retry.addEventListener("click", () => { retry.remove(); void load(); });
      empty.append(retry);
    }
  });
  rowsEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    bench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: row.dataset.functionId } }));
  });
  void load().then(() => {
    const params = page.address().searchParams;
    const id = params.get("rule") || records.find(rec => rec.function_key === params.get("key"))?.id;
    if (id) bench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: id } }));
    else if (params.get("key")) showNote(L("找不到这条判断规则，请从列表重新选择。"), true);
  });
}
`;
