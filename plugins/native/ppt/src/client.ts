/** PPT workbench client: slides, theme colors, preview, JSON export. */
export const PPT_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-ppt=workbench]");
  if (!workbench) return;
  const list = workbench.querySelector("[data-ppt=directory]");
  const rowsEl = workbench.querySelector("[data-ppt-rows]");
  const empty = workbench.querySelector("[data-ppt-empty]");
  const workspace = workbench.querySelector("[data-ppt-stage-workspace]");
  const titleEl = workbench.querySelector("[data-ppt-editor-title]");
  const statusEl = workbench.querySelector("[data-ppt-editor-status]");
  const titleInput = workbench.querySelector("[data-ppt-title]");
  const descriptionInput = workbench.querySelector("[data-ppt-description]");
  const colorPrimary = workbench.querySelector("[data-ppt-color-primary]");
  const colorBackground = workbench.querySelector("[data-ppt-color-background]");
  const colorText = workbench.querySelector("[data-ppt-color-text]");
  const slideList = workbench.querySelector("[data-ppt-slide-list]");
  const slideTitle = workbench.querySelector("[data-ppt-slide-title]");
  const slideBullets = workbench.querySelector("[data-ppt-slide-bullets]");
  const slideNotes = workbench.querySelector("[data-ppt-slide-notes]");
  const previewEl = workbench.querySelector("[data-ppt-preview]");
  const note = workbench.querySelector("[data-ppt-note]");
  const confirmDialog = workbench.querySelector("[data-ppt-confirm]");
  let records = [];
  let selected = null;
  let currentSlideId = "";
  let saveTimer = 0;
  let editRevision = 0;
  let savedRevision = 0;
  let savePromise = null;
  let saveError = null;
  let busy = false;
  let listSeq = 0;
  const keepListScroll = (paint) => {
    const top = list?.scrollTop || 0;
    paint();
    if (list) list.scrollTop = top;
  };
  const firstLine = (value) => {
    const line = String(value || "").trim().split("\\n")[0].trim();
    return line || L("还没有说明");
  };
  const kindChip = (kind, label) => {
    const node = document.createElement("span");
    node.className = "mw-status plugin-stage-kind";
    node.dataset.kind = kind;
    node.textContent = label;
    return node;
  };
  const textCell = (className, text) => {
    const node = document.createElement("span");
    node.className = className;
    node.title = text;
    node.textContent = text;
    return node;
  };

  const projectId = () => (typeof host.projectId === "function" ? host.projectId() : host.projectId) || "";
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
    const response = await fetch(withProject(path), {
      method,
      headers: headers(),
      body: payloadBody === undefined || method === "GET" ? undefined : JSON.stringify(payloadBody),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.code === "ppt.conflict" ? L("演示稿已在别处修改，当前输入已保留。请复制需要保留的内容，再重新读取。") : payload.error || L("演示稿请求失败"));
      error.code = payload.code;
      throw error;
    }
    return payload;
  };
  const showNote = (text, isError) => {
    if (!note) return;
    note.hidden = !text;
    note.textContent = text || "";
    note.classList.toggle("is-error", Boolean(isError && text));
    if (isError && text) note.scrollIntoView({ block: "nearest" });
  };
  const arrive = (node) => {
    if (!node) return node;
    node.classList.remove("is-arriving");
    void node.offsetWidth;
    node.classList.add("is-arriving");
    return node;
  };
  const paintPages = (record) => {
    if (!statusEl) return;
    statusEl.className = "mw-status mw-status--" + (saveError ? "blocked" : "quiet");
    const state = saveError ? L("保存失败") : savePromise ? L("保存中") : editRevision > savedRevision ? L("尚未保存") : busy ? L("处理中") : L("已保存");
    statusEl.textContent = (record.slides || []).length + " " + L("页") + " · " + state;
    const pending = workbench.querySelector("[data-ppt-publication-note]");
    pending.hidden = !record.publication_pending;
    pending.textContent = record.publication_pending ? L("上次 Artifact 发布尚未完成。恢复使用上次固定内容，后续编辑可另存一版。") : "";
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
  const currentSlide = () => (selected?.slides || []).find((slide) => slide.id === currentSlideId) || selected?.slides?.[0];
  const slidesFromEditor = () => {
    const slides = [...(selected?.slides || [])];
    const index = slides.findIndex((slide) => slide.id === currentSlideId);
    if (index < 0) return slides;
    slides[index] = {
      ...slides[index],
      title: slideTitle.value,
      bullets: slideBullets.value.split("\\n").map((line) => line.trim()).filter(Boolean),
      notes: slideNotes.value,
      order: index + 1,
    };
    return slides;
  };
  const colorOf = (root) => root?.dataset.value || "";
  const setColor = (root, value) => {
    if (!root) return;
    root.dataset.value = value;
    root.querySelectorAll("[data-ppt-swatch]").forEach((button) => {
      button.setAttribute("aria-checked", String(button.dataset.pptSwatch === value));
    });
  };
  const liveRecord = () => ({
    ...selected,
    title: titleInput.value,
    description: descriptionInput.value,
    color_primary: colorOf(colorPrimary),
    color_background: colorOf(colorBackground),
    color_text: colorOf(colorText),
    slides: slidesFromEditor(),
  });
  const renderPreview = (record) => {
    previewEl.replaceChildren();
    (record.slides || []).forEach((slide, index) => {
      const card = document.createElement("article");
      card.className = "ppt-card" + (slide.id === currentSlideId ? " is-current" : "");
      card.style.background = record.color_background;
      card.style.color = record.color_text;
      card.style.borderColor = record.color_primary;
      const kicker = document.createElement("small");
      kicker.textContent = String(index + 1);
      kicker.style.color = record.color_primary;
      const heading = document.createElement("h2");
      heading.textContent = slide.title || L("未命名一页");
      const bullets = document.createElement("ul");
      (slide.bullets || []).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        bullets.append(li);
      });
      if (!bullets.childElementCount) {
        const emptySlide = document.createElement("p");
        emptySlide.className = "ppt-card-empty";
        emptySlide.textContent = L("还没有要点");
        card.append(kicker, heading, emptySlide);
      } else {
        card.append(kicker, heading, bullets);
      }
      const item = document.createElement("div");
      item.className = "ppt-preview-item";
      item.append(card);
      if (slide.notes) {
        const notes = document.createElement("p");
        notes.className = "ppt-card-notes";
        notes.textContent = slide.notes;
        item.append(notes);
      }
      previewEl.append(item);
    });
  };
  const renderSlideList = (record) => {
    slideList.replaceChildren();
    (record.slides || []).forEach((slide, index) => {
      const row = document.createElement("div");
      row.className = "ppt-slide-row" + (slide.id === currentSlideId ? " is-selected" : "");
      row.dataset.slideId = slide.id;
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.slideSelect = "true";
      const indexMark = document.createElement("span");
      indexMark.className = "ppt-slide-index";
      indexMark.textContent = String(index + 1);
      const label = document.createElement("span");
      label.className = "ppt-slide-title";
      label.textContent = slide.title || L("未命名一页");
      button.append(indexMark, label);
      const up = document.createElement("button");
      up.type = "button";
      up.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
      up.dataset.slideMove = "-1";
      up.setAttribute("aria-label", L("上移"));
      up.innerHTML = '<svg aria-hidden="true"><use href="#icon-chevron-up"></use></svg>';
      const down = document.createElement("button");
      down.type = "button";
      down.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
      down.dataset.slideMove = "1";
      down.setAttribute("aria-label", L("下移"));
      down.innerHTML = '<svg aria-hidden="true"><use href="#icon-chevron-down"></use></svg>';
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
      remove.dataset.slideRemove = "true";
      remove.setAttribute("aria-label", L("删除这一页"));
      remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
      row.append(button, up, down, remove);
      slideList.append(row);
    });
  };
  const syncSlideLabel = () => {
    const button = slideList.querySelector('[data-slide-id="' + currentSlideId + '"] [data-slide-select]');
    if (!button) return;
    const index = (selected?.slides || []).findIndex((slide) => slide.id === currentSlideId);
    const indexMark = button.querySelector(".ppt-slide-index");
    const label = button.querySelector(".ppt-slide-title");
    if (indexMark) indexMark.textContent = String(index + 1);
    if (label) label.textContent = slideTitle.value.trim() || L("未命名一页");
  };
  const fillSlideFields = (slide) => {
    currentSlideId = slide?.id || "";
    slideTitle.value = slide?.title || "";
    slideBullets.value = (slide?.bullets || []).join("\\n");
    slideNotes.value = slide?.notes || "";
  };
  const markSelected = (id) => {
    list.querySelectorAll("[data-ppt-id]").forEach((row) => {
      const on = row.dataset.pptId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const remember = (record, redraw) => {
    selected = record;
    if (!record.slides.some((slide) => slide.id === currentSlideId)) currentSlideId = record.slides[0]?.id || "";
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    renderList();
    titleEl.textContent = record.title;
    paintPages(record);
    markSelected(record.id);
    if (redraw) fillEditor(record);
    else renderPreview(liveRecord());
  };
  const fillEditor = (record) => {
    clearTimeout(saveTimer);
    editRevision = savedRevision = 0;
    saveError = null;
    showNote("", false);
    selected = record;
    if (!record.slides.some((slide) => slide.id === currentSlideId)) currentSlideId = record.slides[0]?.id || "";
    const opening = workspace.hidden;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    if (opening) arrive(workspace);
    titleEl.textContent = record.title;
    paintPages(record);
    titleInput.value = record.title;
    descriptionInput.value = record.description || "";
    setColor(colorPrimary, record.color_primary);
    setColor(colorBackground, record.color_background);
    setColor(colorText, record.color_text);
    fillSlideFields(currentSlide());
    renderSlideList(record);
    renderPreview(record);
    markSelected(record.id);
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    editRevision = savedRevision = 0;
    saveError = null;
    showNote("", false);
    selected = null;
    currentSlideId = "";
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const artifactLabel = (record) => record?.publication_pending ? L("恢复发布") : record && record.artifact_version > 0 ? L("再存一版") : L("保存成果版本");
  const artifactControl = (record, key) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "creative-artifact-act";
    button.dataset[key] = record.id;
    const label = artifactLabel(record);
    button.setAttribute("aria-label", label);
    button.innerHTML = '<svg aria-hidden="true"><use href="#icon-upload"></use></svg><span></span>';
    button.lastElementChild.textContent = label;
    return button;
  };
  const paintList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => {
      const item = document.createElement("article");
      item.className = "feed-stage-item creative-artifact-row";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "feed-stage-entry directory-list-row" + (selected?.id === record.id ? " is-selected" : "");
      row.dataset.pptId = record.id;
      row.setAttribute("aria-selected", String(selected?.id === record.id));
      const leading = document.createElement("span");
      leading.className = "feed-stage-leading";
      const title = document.createElement("strong");
      title.title = record.title;
      title.textContent = record.title;
      leading.append(title);
      const status = document.createElement("span");
      status.className = "feed-entry-status";
      status.setAttribute("aria-hidden", "true");
      row.append(
        leading,
        kindChip("ppt", L("演示稿")),
        textCell("plugin-stage-fact", (record.slides || []).length + " " + L("页")),
        textCell("plugin-stage-meta", firstLine(record.description)),
        status,
      );
      item.append(row, artifactControl(record, "pptArtifact"));
      rowsEl.append(item);
    });
    const bar = workbench.querySelector("[data-ppt-artifact-bar]");
    if (bar) bar.textContent = artifactLabel(selected);
  };
  const loadList = async () => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/plugins/ppt");
    if (seq !== listSeq) return;
    records = payload.presentations || [];
    renderList();
  };
  const draftFromDom = () => {
    const value = liveRecord();
    return { title: value.title, description: value.description, color_primary: value.color_primary,
      color_background: value.color_background, color_text: value.color_text, slides: value.slides };
  };
  const save = () => {
    clearTimeout(saveTimer);
    if (savePromise) return savePromise;
    const drain = async () => {
      if (saveError) throw saveError;
      while (selected && savedRevision < editRevision) {
        const revision = editRevision;
        const draft = draftFromDom();
        try {
          const payload = await request("POST", "/api/plugins/ppt/" + encodeURIComponent(selected.id), { ...draft, expected_version: selected.version });
          const laterDraft = editRevision > revision ? draftFromDom() : null;
          savedRevision = revision;
          remember(laterDraft ? { ...payload.presentation, ...laterDraft } : payload.presentation, false);
          showNote("", false);
        } catch (error) { saveError = error; throw error; }
      }
      return selected;
    };
    savePromise = drain().finally(() => { savePromise = null; if (selected) paintPages(selected); });
    if (selected) paintPages(selected);
    return savePromise;
  };
  const queueSave = () => {
    if (saveError && ["ppt.invalid", "actions.input_invalid"].includes(saveError.code)) saveError = null;
    editRevision += 1;
    if (selected) paintPages(selected);
    clearTimeout(saveTimer);
    if (!saveError) saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };
  const setBusy = (value) => {
    busy = value; workspace.inert = value; list.inert = value;
    workbench.setAttribute("aria-busy", String(value));
    if (selected) paintPages(selected);
  };

  workbench.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.closest("dialog") || button.disabled || busy) return;
    setBusy(true);
    try {
      if (button.closest("[data-ppt-reload]") && selected) {
        clearTimeout(saveTimer);
        if (savePromise) await savePromise.catch(() => {});
        if ((saveError || editRevision > savedRevision) && !await ask(L("重新读取会丢弃未保存的编辑。继续吗？"), L("重新读取"))) return;
        const payload = await request("GET", "/api/plugins/ppt/" + encodeURIComponent(selected.id));
        fillEditor(payload.presentation); await loadList(); return;
      }
      const swatch = event.target.closest("[data-ppt-swatch]");
      if (swatch && selected) {
        setColor(swatch.closest("[role=radiogroup]"), swatch.dataset.pptSwatch);
        queueSave();
        renderPreview(liveRecord());
        return;
      }
      const create = event.target.closest("[data-ppt-new]");
      if (create) {
        await save();
        const payload = await request("POST", "/api/plugins/ppt", {});
        await loadList();
        currentSlideId = payload.presentation.slides[0]?.id || "";
        fillEditor(payload.presentation);
        return;
      }
      const artifact = event.target.closest("[data-ppt-artifact]");
      if (artifact) {
        const id = artifact.dataset.pptArtifact || (selected && selected.id);
        if (!id) return;
        if (selected && selected.id === id) {
          await save();
        }
        const record = selected?.id === id ? selected : records.find(item => item.id === id);
        let payload;
        try {
          payload = await request("POST", "/api/plugins/ppt/" + encodeURIComponent(id) + "/promote", { expected_version: record.version });
        } catch (error) {
          if (error.code !== "ppt.conflict") {
            const fresh = await request("GET", "/api/plugins/ppt/" + encodeURIComponent(id)).catch(() => null);
            if (fresh && selected?.id === id) remember(fresh.presentation, false);
            await loadList().catch(() => {});
          }
          throw error;
        }
        showNote(L("已保存成果版本"), false);
        await loadList();
        if (payload.presentation && selected && selected.id === payload.presentation.id) remember(payload.presentation, false);
        return;
      }
      const row = event.target.closest("[data-ppt-id]");
      if (row) {
        await save();
        const payload = await request("GET", "/api/plugins/ppt/" + encodeURIComponent(row.dataset.pptId));
        fillEditor(payload.presentation);
        return;
      }
      if (event.target.closest("[data-ppt-back]")) {
        await save();
        closeEditor();
        await loadList();
        return;
      }
      if (event.target.closest("[data-ppt-add-slide]") && selected) {
        const slides = [...slidesFromEditor(), { id: "s-" + crypto.randomUUID(), title: L("未命名一页"), bullets: [], notes: "", order: selected.slides.length + 1 }];
        selected = { ...selected, slides };
        currentSlideId = slides.at(-1).id;
        fillSlideFields(slides.at(-1));
        renderSlideList(selected);
        renderPreview(selected);
        arrive(slideList.lastElementChild);
        arrive(previewEl.lastElementChild);
        paintPages(selected);
        queueSave();
        return;
      }
      const select = event.target.closest("[data-slide-select]");
      if (select && selected) {
        selected = liveRecord();
        currentSlideId = select.closest("[data-slide-id]").dataset.slideId;
        fillSlideFields(currentSlide());
        renderSlideList(selected);
        renderPreview(selected);
        queueSave();
        return;
      }
      const move = event.target.closest("[data-slide-move]");
      if (move && selected) {
        const id = move.closest("[data-slide-id]").dataset.slideId;
        const delta = Number(move.dataset.slideMove);
        const slides = slidesFromEditor();
        const index = slides.findIndex((slide) => slide.id === id);
        const next = index + delta;
        if (index < 0 || next < 0 || next >= slides.length) return;
        const swap = slides[index];
        slides[index] = slides[next];
        slides[next] = swap;
        selected = { ...selected, slides };
        currentSlideId = id;
        fillSlideFields(currentSlide());
        renderSlideList(selected);
        renderPreview(selected);
        queueSave();
        return;
      }
      if (event.target.closest("[data-slide-remove]") && selected) {
        const id = event.target.closest("[data-slide-id]").dataset.slideId;
        const slides = slidesFromEditor().filter((slide) => slide.id !== id);
        if (!slides.length) { showNote(L("至少保留一页"), true); return; }
        selected = { ...selected, slides };
        currentSlideId = slides[0]?.id || "";
        fillSlideFields(currentSlide());
        renderSlideList(selected);
        renderPreview(selected);
        paintPages(selected);
        queueSave();
        return;
      }
      if (event.target.closest("[data-ppt-export]") && selected) {
        await save();
        const exported = await request("GET", "/api/plugins/ppt/" + encodeURIComponent(selected.id) + "/export?expected_version=" + selected.version);
        const blob = new Blob([exported.content], { type: exported.mime_type });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = exported.filename;
        link.click();
        URL.revokeObjectURL(url);
        showNote(L("已导出"), false);
        return;
      }
      if (event.target.closest("[data-ppt-delete]") && selected) {
        if (!await ask(L("删除这份演示稿？"), L("删除"))) return;
        await save();
        await request("POST", "/api/plugins/ppt/" + encodeURIComponent(selected.id) + "/delete", { expected_version: selected.version });
        closeEditor();
        await loadList();
      }
    } catch (error) {
      if (error.code === "ppt.conflict") saveError = error;
      showNote(error.message || L("演示稿请求失败"), true);
    } finally { setBusy(false); }
  });
  workbench.addEventListener("input", (event) => {
    if (busy || !event.target.closest(".ppt-workspace") || !selected) return;
    selected = liveRecord();
    renderPreview(selected);
    if (event.target === slideTitle) syncSlideLabel();
    queueSave();
  });
  window.addEventListener("beforeunload", (event) => {
    if (selected && (saveError || editRevision > savedRevision)) { event.preventDefault(); event.returnValue = ""; }
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
