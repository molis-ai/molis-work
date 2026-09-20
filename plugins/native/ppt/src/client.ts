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
    if (!response.ok) throw new Error(payload.error || L("演示稿请求失败"));
    return payload;
  };
  const showNote = (text, isError) => {
    if (!note) return;
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
  const liveRecord = () => ({
    ...selected,
    title: titleInput.value,
    description: descriptionInput.value,
    color_primary: colorPrimary.value,
    color_background: colorBackground.value,
    color_text: colorText.value,
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
      card.append(kicker, heading, bullets);
      previewEl.append(card);
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
      button.textContent = (index + 1) + ". " + (slide.title || L("未命名一页"));
      const up = document.createElement("button");
      up.type = "button";
      up.className = "mw-btn mw-btn--ghost";
      up.dataset.slideMove = "-1";
      up.textContent = "↑";
      const down = document.createElement("button");
      down.type = "button";
      down.className = "mw-btn mw-btn--ghost";
      down.dataset.slideMove = "1";
      down.textContent = "↓";
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mw-btn mw-btn--ghost";
      remove.dataset.slideRemove = "true";
      remove.textContent = "×";
      row.append(button, up, down, remove);
      slideList.append(row);
    });
  };
  const syncSlideLabel = () => {
    const button = slideList.querySelector('[data-slide-id="' + currentSlideId + '"] [data-slide-select]');
    if (!button) return;
    const index = (selected?.slides || []).findIndex((slide) => slide.id === currentSlideId);
    button.textContent = (index + 1) + ". " + (slideTitle.value.trim() || L("未命名一页"));
  };
  const fillSlideFields = (slide) => {
    currentSlideId = slide?.id || "";
    slideTitle.value = slide?.title || "";
    slideBullets.value = (slide?.bullets || []).join("\\n");
    slideNotes.value = slide?.notes || "";
  };
  const markSelected = (id) => {
    list.querySelectorAll(".ppt-row").forEach((row) => {
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
    markSelected(record.id);
    if (redraw) fillEditor(record);
    else renderPreview(liveRecord());
  };
  const fillEditor = (record) => {
    clearTimeout(saveTimer);
    selected = record;
    if (!record.slides.some((slide) => slide.id === currentSlideId)) currentSlideId = record.slides[0]?.id || "";
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = record.title;
    titleInput.value = record.title;
    descriptionInput.value = record.description || "";
    colorPrimary.value = record.color_primary;
    colorBackground.value = record.color_background;
    colorText.value = record.color_text;
    fillSlideFields(currentSlide());
    renderSlideList(record);
    renderPreview(record);
    markSelected(record.id);
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    selected = null;
    currentSlideId = "";
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
  };
  const renderList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ppt-row" + (selected?.id === record.id ? " is-selected" : "");
      row.dataset.pptId = record.id;
      const title = document.createElement("strong");
      title.textContent = record.title;
      const meta = document.createElement("small");
      meta.textContent = (record.slides || []).length + " " + L("页");
      row.append(title, meta);
      rowsEl.append(row);
    });
  };
  const loadList = async () => {
    const payload = await request("GET", "/api/ppt");
    records = payload.presentations || [];
    renderList();
    if (selected) {
      const next = records.find((item) => item.id === selected.id);
      if (next) remember(next, false);
      else closeEditor();
    }
  };
  const save = async () => {
    if (!selected) return selected;
    const payload = await request("POST", "/api/ppt/" + encodeURIComponent(selected.id), liveRecord());
    remember(payload.presentation, false);
    return selected;
  };
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };

  workbench.addEventListener("click", async (event) => {
    try {
      const create = event.target.closest("[data-ppt-new]");
      if (create) {
        const payload = await request("POST", "/api/ppt", {});
        currentSlideId = payload.presentation.slides[0]?.id || "";
        fillEditor(payload.presentation);
        remember(payload.presentation, false);
        return;
      }
      const row = event.target.closest(".ppt-row");
      if (row) {
        const record = records.find((item) => item.id === row.dataset.pptId);
        if (record) fillEditor(record);
        return;
      }
      if (event.target.closest("[data-ppt-back]")) { closeEditor(); return; }
      if (event.target.closest("[data-ppt-add-slide]") && selected) {
        const slides = [...slidesFromEditor(), { id: "s-" + Date.now(), title: L("未命名一页"), bullets: [], notes: "", order: selected.slides.length + 1 }];
        selected = { ...selected, slides };
        currentSlideId = slides.at(-1).id;
        fillSlideFields(slides.at(-1));
        renderSlideList(selected);
        renderPreview(selected);
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
        queueSave();
        return;
      }
      if (event.target.closest("[data-ppt-export]") && selected) {
        await save();
        const blob = new Blob([JSON.stringify(selected, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = (selected.title || "ppt") + ".json";
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      if (event.target.closest("[data-ppt-delete]") && selected) {
        if (!await ask(L("删除这份演示稿？"), L("删除"))) return;
        await request("POST", "/api/ppt/" + encodeURIComponent(selected.id) + "/delete");
        records = records.filter((item) => item.id !== selected.id);
        closeEditor();
        renderList();
      }
    } catch (error) {
      showNote(error.message || L("演示稿请求失败"), true);
    }
  });
  workbench.addEventListener("input", (event) => {
    if (!event.target.closest(".ppt-workspace") || !selected) return;
    selected = liveRecord();
    renderPreview(selected);
    if (event.target === slideTitle) syncSlideLabel();
    queueSave();
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
