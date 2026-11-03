/** Functions workbench, part of FUNCTIONS_CLIENT_FACTORY_SCRIPT joined in place: the editor, the list, loading and saving of rules. */
export const FUNCTIONS_CLIENT_RECORDS_PART = `  const fillEditor = (rec) => {
    const switching = sel?.id !== rec.id;
    sel = rec;
    if (switching) {
      dirty = false;
      bench.querySelector("[data-functions-subject-details]").open = Boolean(rec.subject_kinds?.length);
      paletteInfo.open = false;
      setStep(rec.status === "published" ? "use" : "look");
      paletteFind.value = "";
    }
    saveStatus.textContent = rec.status === "published" ? L("已发布 · 规则只读") : L("草稿自动保存");
    bench.querySelector("[data-functions-kind-description]").textContent = prim(rec) === "noul"
      ? L("是非判断：返回成立的概率，例如材料是否足够。")
      : prim(rec) === "score" ? L("等级评分：按你定义的档位返回分数，例如紧急程度。")
      : L("结果选择：从你定义的结果中选出一个，例如跟进、保存或忽略。");
    releaseHint.textContent = rec.status === "published" ? L("规则已锁定，可以继续试跑，并查看或调整使用状态。") : L("发布会锁定名称、规则和用途。确认试跑符合预期后再发布；发布不会自动启用页面判断。");
    bench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = rec.name;
    statusEl.textContent = rec.status === "published" ? "v" + (rec.version || 1) : L("草稿");
    nameInput.value = rec.name;
    keyInput.value = rec.function_key;
    const locked = rec.status === "published";
    nameInput.disabled = locked;
    keyInput.disabled = locked;
    promptInput.disabled = locked;
    promptInput.value = rec.instructions;
    deleteBtn.hidden = locked;
    pubBtn.hidden = locked;
    pubBtn.textContent = L("发布 v1");
    if (switching) sampleText.value = rec.last_preview?.input || "";
    renderRoute(rec);
    renderCriteria(rec);
    renderSamples(rec);
    renderPreview(rec);
    void paintUses(rec);
    showNote(locked ? L("已发布。") : "", false);
    list.querySelectorAll("[data-function-id]").forEach((row) => {
      const on = row.dataset.functionId === rec.id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const closeEditor = () => {
    sel = null;
    const next = page.address(); next.searchParams.delete("rule"); next.searchParams.delete("key");
    page.replace(next);
    bench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    list.querySelectorAll("[data-function-id]").forEach((row) => {
      row.classList.remove("is-selected");
      row.setAttribute("aria-selected", "false");
    });
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const rememberRecord = (rec) => {
    records = records.some((item) => item.id === rec.id)
      ? records.map((item) => item.id === rec.id ? rec : item) : [rec, ...records];
    renderList();
  };
  const paintList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((rec) => {
      const item = document.createElement("article");
      item.className = "feed-stage-item";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "feed-stage-entry directory-list-row" + (sel?.id === rec.id ? " is-selected" : "");
      row.dataset.functionId = rec.id;
      row.setAttribute("aria-selected", String(sel?.id === rec.id));
      const leading = document.createElement("span");
      leading.className = "feed-stage-leading";
      const title = document.createElement("strong");
      title.title = rec.name;
      title.textContent = rec.name;
      leading.append(title);
      const primitive = rec.primitive === "noul" ? L("是非") : rec.primitive === "score" ? L("评分") : L("选择");
      const published = rec.status === "published";
      const status = document.createElement("span");
      status.className = "mw-status mw-status--" + (published ? "done" : "quiet") + " feed-entry-status";
      status.dataset.mwState = published ? "ready" : "draft"; status.textContent = published ? "v" + (rec.version || 1) : L("草稿");
      row.append(
        leading,
        kindChip(rec.primitive || "choice", primitive),
        textCell("plugin-stage-fact", destTitle(rec)),
        textCell("plugin-stage-meta", functionMeta(rec)),
        status,
      );
      item.append(row);
      rowsEl.append(item);
    });
  };
  const loadCatalog = async () => {
    const payload = api ? await api("/api/functions/catalog", "GET") : await req("GET", "/api/functions/catalog");
    if (payload.catalog) cat = payload.catalog;
    const subjects = bench.querySelector("[data-functions-subject-list]");
    if (cat.subjects.length && subjects) {
      const checked = new Set(sel?.subject_kinds || readKinds());
      subjects.replaceChildren();
      cat.subjects.forEach((subject) => {
        const label = document.createElement("label");
        label.className = "functions-chip";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "mw-check";
        input.dataset.functionsSource = subject.subject_kind;
        input.checked = checked.has(subject.subject_kind);
        const title = document.createElement("span");
        title.textContent = L(subject.title);
        label.append(input, title);
        subjects.append(label);
      });
    }
  };
  const loadList = async (opts = {}) => {
    const seq = ++listSeq;
    const payload = await req("GET", "/api/functions");
    if (seq !== listSeq) return;
    records = payload.functions || [];
    renderList();
    if (!sel) return;
    const next = records.find((item) => item.id === sel.id);
    if (opts.preserveForm) {
      if (!next) closeEditor();
      return;
    }
    if (next) {
      if (opts.remount) fillEditor(next);
      else {
        sel = next;
        titleEl.textContent = next.name;
      }
    }
    else closeEditor();
  };
  const draftBody = () => ({
    name: nameInput.value,
    function_key: keyInput.value,
    instructions: promptInput.value,
    criteria: readCriteria(),
    ...sceneRef(),
    subject_kinds: readKinds(),
    scene_map: sceneMap(),
    action_map: actionMap(),
    updated_at: sel.updated_at,
  });
  let saving = null;
  const saveDraft = async () => {
    clearTimeout(saveTick); saveTick = 0;
    const rec = sel, revision = editRevision;
    if (!rec || rec.status === "published") return rec;
    const body = draftBody();
    if (saving) { const prior = await saving; if (prior?.id === rec.id) body.updated_at = prior.updated_at; }
    const operation = persistDraft(rec.id, body, revision);
    saving = operation;
    try { return await operation; } finally { if (saving === operation) saving = null; }
  };
  const persistDraft = async (savingId, body, revision) => {
    if (sel?.id === savingId) saveStatus.textContent = L("正在保存…");
    try {
      const payload = await req("POST", "/api/functions/" + encodeURIComponent(savingId), body);
      const saved = payload.function;
      rememberRecord(saved);
      if (sel?.id !== savingId) return saved;
      sel = saved;
      if (revision === editRevision) dirty = false;
      saveStatus.textContent = dirty ? L("有更改，等待保存…") : L("已保存");
      titleEl.textContent = sel.name;
      showNote("", false);
      return sel;
    } catch (error) {
      if (sel?.id === savingId) {
        saveStatus.textContent = L("未保存 · 请修正后重试");
        await loadList({ preserveForm: true }).catch(() => {});
      }
      throw error;
    }
  };
  const queueSave = () => {
    if (!sel || sel.status === "published") return;
    const savingId = sel.id;
    dirty = true;
    editRevision++;
    saveStatus.textContent = L("有更改，等待保存…");
    clearTimeout(saveTick);
    saveTick = setTimeout(() => {
      void saveDraft().catch((error) => {
        if (sel?.id === savingId) showNote(error, true);
      });
    }, 280);
  };
  const remember = (rec, origin) => {
    rememberRecord(rec);
    if (origin && sel?.id !== origin.id) return;
    if (origin && editRevision !== origin.revision) {
      sel = { ...sel, updated_at: rec.updated_at, samples: rec.samples };
      renderSamples(sel); return;
    }
    const next = page.address(); next.searchParams.set("rule", rec.id); next.searchParams.delete("key");
    page.replace(next);
    const listNote = bench.querySelector("[data-functions-list-note]");
    if (listNote) listNote.hidden = true;
    fillEditor(rec);
  };
`;
