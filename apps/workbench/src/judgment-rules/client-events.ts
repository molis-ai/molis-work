/** Functions workbench, part of FUNCTIONS_CLIENT_FACTORY_SCRIPT joined in place: event wiring, preview, publish and the first load. */
export const FUNCTIONS_CLIENT_EVENTS_PART = `  bench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail?.itemId;
    if (event.detail?.invalidate && id === undefined) return;
    if (!id) { selectSeq++; openingId = null; return; }
    if (sel?.id === id) {
      bench.setAttribute("data-expanded", "true"); workspace.hidden = false; return;
    }
    if (openingId === id) return;
    if (sel && holding()) { leaving(() => bench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: id } }))); return; }
    openingId = id;
    const seq = ++selectSeq;
    void (async () => {
      if (sel && (saveTick || saving || dirty)) { clearTimeout(saveTick); saveTick = 0; await saveDraft(); }
      await loadCatalog();
      const rec = await getRule(id);
      if (seq === selectSeq) remember(rec);
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
    leaving(openCreate);
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
      molisWorkRequest.show(createNote,error,globalThis.t.text("workbench.client-events.could-not-save"));
    } finally {
      creating = false;
      createForm.querySelectorAll("button").forEach((node) => { node.disabled = false; });
    }
  });
  bench.querySelector("[data-functions-back]").addEventListener("click", () => leaving(async () => {
    try {
      if (dirty || saveTick || saving) await saveDraft();
      closeEditor();
      await loadList();
    } catch (error) { showNote(error, true); }
  }));
  deleteBtn.addEventListener("click", async () => {
    if (!sel || sel.status === "published") return;
    const rec = sel;
    if (!window.confirm(globalThis.t.text("workbench.client-events.delete-draft"))) return;
    try {
      await withKeep(() => req("POST", "/api/functions/" + encodeURIComponent(rec.id) + "/delete", revisionOf(sel)));
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
      molisWorkRequest.show(status,error,globalThis.t.text("workbench.client-events.settings-weren-t-saved-please-retry")); usagesEl.append(status);
    }
  });
  bench.querySelector("[data-functions-destinations]").addEventListener("click", (event) => {
    const btnEl = event.target.closest("[data-functions-destination]");
    if (!btnEl || !sel || sel.status === "published" || btnEl.disabled) return;
    const dst = btnEl.dataset.functionsDestination || "";
    if (prim(sel) === "score" && dst && dst !== "agent.mcp") {
      showNote(globalThis.t.text("workbench.client-events.score-cannot-bind-inbox-home-feed"), true);
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
      const beh = optionOf(paletteAdd.dataset.paletteAdd);
      sel = { ...sel, scene_map: sceneMap(), action_map: actionMap() };
      if (beh.action_ref && destKey() === "agent.mcp") sel.action_map[beh.option_id] = beh.action_ref;
      if (!readKeys().includes(beh.option_id)) {
        addChoice(beh.option_id, optionTitle(beh));
      }
      paintPalette(sel);
      renderMap(sel);
      queueSave();
      return;
    }
    const removeChoice = event.target.closest("[data-choice-remove]");
    if (removeChoice && sel?.status !== "published") {
      if (critEl.querySelectorAll("[data-choice-row]").length < 3) {
        showNote(globalThis.t.text("workbench.client-events.choice-needs-least-two-options"), true);
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
        showNote(globalThis.t.text("workbench.client-events.score-needs-least-two-levels"), true);
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
        const payload = await withKeep(() => req("POST", "/api/functions/" + encodeURIComponent(rec.id) + "/samples/delete", {
          sample_id: row.dataset.sampleId, ...revisionOf(sel),
        }));
        remember(payload.function, origin);
      } catch (error) { if (sel?.id === rec.id) showNote(error, true); }
    }
  });
  bench.querySelector("[data-functions-save-sample]").addEventListener("click", async () => {
    if (!sel || blocked()) return;
    const origin = { id: sel.id, revision: editRevision }, input = sampleText.value;
    try {
      const saved = await saveDraft();
      const payload = await withKeep(() => req("POST", "/api/functions/" + encodeURIComponent(origin.id) + "/samples", { input, ...revisionOf(sel?.id === origin.id ? sel : saved) }));
      remember(payload.function, origin);
    } catch (error) { if (sel?.id === origin.id) { showNote(error, true); if (error?.keepEdits) toBand(); } }
  });
  rowsEl.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    const rec = records.find((item) => item.id === row.dataset.functionId);
    if (rec) {
      if (sel?.id === rec.id || holding()) return;
      try {
        if (saveTick || saving || dirty) await saveDraft();
        fillEditor(rec);
      } catch (error) { showNote(error, true); }
    }
  });
  let previewing = false;
  const previewBtn = bench.querySelector("[data-functions-preview]");
  previewBtn.addEventListener("click", async () => {
    if (!sel || previewing || blocked()) return;
    const previewId = sel.id;
    previewing = true;
    bench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = true; });
    pubBtn.disabled = true;
    previewBtn.disabled = true;
    previewBtn.textContent = globalThis.t.text("workbench.client-events.testing");
    showNote(globalThis.t.text("workbench.client-events.requesting-judgment-usually-takes-few-seconds"), false);
    try {
      await saveDraft();
      if (sel?.id !== previewId) return;
      const payload = await withKeep(() => req("POST", "/api/functions/" + encodeURIComponent(previewId) + "/preview", {
        input: sampleText.value,
        ...revisionOf(sel),
      }));
      if (sel?.id !== previewId) return;
      remember(payload.function);
    } catch (error) {
      if (sel?.id === previewId) {
        if (error.keepEdits) { toBand(); return; }
        if (error.code === "functions.invalid" && !promptInput.value.trim()) setStep("fn", true);
        showNote(error, true);
        if (error.code === "functions.provider_not_configured" || error.code === "actions.connection_required") {
          const link = document.createElement("a");
          const connection = new URL("/capabilities/connections", location.origin);
          connection.searchParams.set("connector", "typesafe");
          const current = page.address();
          for (const key of ["project", "desktop"]) if (current.searchParams.has(key)) connection.searchParams.set(key, current.searchParams.get(key));
          link.href = connection.pathname + connection.search;
          link.textContent = globalThis.t.text("workbench.client-events.connect-judgment-service");
          note.append(document.createTextNode(" "), link);
        }
      }
    } finally {
      previewing = false;
      bench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = false; });
      pubBtn.disabled = false;
      previewBtn.disabled = false;
      previewBtn.textContent = globalThis.t.text("workbench.client-events.preview");
    }
  });
  pubBtn.addEventListener("click", async () => {
    if (!sel || pubBtn.disabled || blocked()) return;
    if (destKey() && destKey() !== "agent.mcp" && !mappingReady({ ...sel, scene_id: destKey(), criteria: readCriteria(), scene_map: sceneMap() })) {
      setStep("fn", true);
      showNote(globalThis.t.text("workbench.client-events.some-results-not-mapped-page-actions-complete-mapping"), true);
      return;
    }
    const publishId = sel.id;
    pubBtn.disabled = true;
    showNote("", false);
    try {
      await saveDraft();
      if (sel?.id !== publishId) return;
      const path = "/api/functions/" + encodeURIComponent(publishId) + "/publish";
      const payload = await withKeep(() => api ? api(path, "POST", revisionOf(sel)) : req("POST", path, revisionOf(sel)));
      if (sel?.id !== publishId) return;
      remember(payload.function);
      await loadList();
    } catch (error) {
      if (sel?.id === publishId) { showNote(error, true); if (error?.keepEdits) toBand(); }
    } finally { pubBtn.disabled = false; }
  });
  const load = () => loadCatalog().then(loadList).catch((error) => {
    empty.hidden = false;
    molisWorkRequest.show(empty.querySelector("p"),error,globalThis.t.text("workbench.client-events.request-failed"));
    let retry = empty.querySelector("button");
    if (!retry) {
      retry = document.createElement("button");
      retry.type = "button";
      retry.className = "mw-btn mw-btn--secondary";
      retry.textContent = globalThis.t.text("workbench.client-events.reload");
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
    else if (params.get("key")) showNote(globalThis.t.text("workbench.client-events.judgment-rule-could-not-be-found-choose-another"), true);
  });
}
`;
