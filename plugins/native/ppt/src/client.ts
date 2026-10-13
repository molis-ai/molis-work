/** PPT workbench client: slides, theme colors, preview, presenting, PowerPoint/PDF export. */
// Notes kept out of the served script (a comment in it is bytes the browser downloads and never runs). `fixedCell`: A row's only label is its state: a fixed version exists, or one is still being saved. Nothing repeats the plugin's name. `molis:placement-changed`: Moved or copied from the placement bar: this list changed; a deck moved away is no longer here to edit.
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
  let aiAvailable = false, aiUnavailableReason = "";
  let selected = null;
  let currentSlideId = "";
  let saveTimer = 0;
  let editRevision = 0;
  let savedRevision = 0;
  let savePromise = null;
  /** Tell the workbench what just happened, so it can say where the result is and what comes next. */
  const placed = (detail) => { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); };
  /** The deck on screen, for the placement bar and the Assistant: identity, version, unsaved edits. */
  const publishContext = () => {
    const context = { plugin_id: "io.molis.work.ppt", surface_title: "PPT" };
    if (selected) {
      context.object = { kind: "presentation", id: selected.id, version: selected.version, title: titleInput.value || selected.title };
      if (editRevision > savedRevision || saveError) context.unsaved = true;
    }
    workbench.setAttribute("data-assistant-context", JSON.stringify(context));
  };
  const slideNode = (record, slide, index) => {
    const card = document.createElement("article");
    card.className = "ppt-present-slide";
    card.style.background = record.color_background;
    card.style.color = record.color_text;
    card.style.setProperty("--ppt-accent", record.color_primary);
    const heading = document.createElement("h2");
    heading.textContent = slide.title || (index === 0 ? record.title : "");
    card.append(heading);
    if ((slide.bullets || []).length) {
      const bullets = document.createElement("ul");
      slide.bullets.forEach((item) => { const li = document.createElement("li"); li.textContent = item; bullets.append(li); });
      card.append(bullets);
    } else if (index === 0 && record.description) {
      const lede = document.createElement("p"); lede.textContent = record.description; card.append(lede);
    }
    return card;
  };
  /** Full-screen presenting on this computer: arrows or click to move, N for speaker notes, Esc to leave. */
  const present = (record, start) => {
    const slides = record.slides || [];
    if (!slides.length) return;
    let index = Math.max(0, Math.min(slides.length - 1, start));
    let notes = false;
    const stage = document.createElement("div");
    stage.className = "ppt-present";
    stage.tabIndex = -1;
    stage.setAttribute("role", "dialog");
    stage.setAttribute("aria-label", L("放映") + " · " + record.title);
    const frame = document.createElement("div"); frame.className = "ppt-present-frame";
    const notesEl = document.createElement("aside"); notesEl.className = "ppt-present-notes";
    const bar = document.createElement("div"); bar.className = "ppt-present-bar";
    stage.append(frame, notesEl, bar);
    // The slide's canvas is 960×540; the stage scales it to the largest size the screen holds.
    const fit = () => stage.style.setProperty("--present-scale", String(Math.min(window.innerWidth / 960, window.innerHeight / 540)));
    fit();
    window.addEventListener("resize", fit);
    const draw = () => {
      frame.replaceChildren(slideNode(record, slides[index], index));
      const text = slides[index].notes || "";
      notesEl.hidden = !notes || !text;
      notesEl.textContent = text;
      bar.textContent = (index + 1) + " / " + slides.length + " · " + L("←/→ 翻页 · N 讲者备注 · Esc 退出");
    };
    let watchSurface = null;
    const leave = () => {
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("resize", fit);
      watchSurface?.disconnect();
      if (document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
      stage.remove();
      currentSlideId = slides[index].id;
      if (selected && selected.id === record.id) { renderSlideList(selected); fillSlideFields(currentSlide()); renderPreview(liveRecord()); }
    };
    const key = (event) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(event.key)) index = Math.min(slides.length - 1, index + 1);
      else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(event.key)) index = Math.max(0, index - 1);
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = slides.length - 1;
      else if (event.key === "n" || event.key === "N") notes = !notes;
      else if (event.key === "Escape") { event.preventDefault(); leave(); return; }
      else return;
      event.preventDefault(); draw();
    };
    stage.addEventListener("click", (event) => { if (event.target.closest(".ppt-present-notes")) return; index = Math.min(slides.length - 1, index + 1); draw(); });
    stage.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && stage.isConnected) leave(); });
    document.addEventListener("keydown", key, true);
    // Switching to another plugin hides this surface; the show must not stay on top of the next one.
    // The surface hides through an ancestor (the tab workspace pool), so visibility is what to watch.
    watchSurface = { timer: setInterval(() => { if (!workbench.isConnected || (workbench.checkVisibility && !workbench.checkVisibility())) leave(); }, 250), disconnect() { clearInterval(this.timer); } };
    draw();
    document.body.append(stage);
    stage.focus();
    stage.requestFullscreen?.().catch(() => {});
  };
  /** Every slide on its own landscape page, for the browser's print dialog (“存储为 PDF”). */
  const printDeck = (record) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
    document.body.append(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write("<!doctype html><html><head><meta charset='utf-8'><title></title><style>@page{size:A4 landscape;margin:0}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif}.ppt-present-slide{box-sizing:border-box;width:100vw;height:100vh;padding:7vh 8vw;page-break-after:always;border-left:1.2vw solid var(--ppt-accent)}h2{font-size:5vh;margin:0 0 4vh}ul{font-size:3vh;line-height:1.6;margin:0;padding-left:1.2em}p{font-size:3vh}</style></head><body></body></html>");
    doc.close();
    doc.title = record.title;
    (record.slides || []).forEach((slide, index) => doc.body.append(doc.importNode(slideNode(record, slide, index), true)));
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      placed({ verb: "printed", title: record.title });
      setTimeout(() => frame.remove(), 1000);
    }, 50);
  };
  const download = (name, blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    URL.revokeObjectURL(url);
  };
  let saveError = null;
  let busy = false;
  let listSeq = 0;
  const keepListScroll = (paint) => {
    const top = list?.scrollTop || 0;
    paint();
    if (list) list.scrollTop = top;
  };
  const firstLine = (value, fallback = "") => {
    const line = String(value || "").trim().split("\\n")[0].trim();
    return line || fallback;
  };
  const whenOf = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return date.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : { year: "numeric", month: "short", day: "numeric" });
  };
  const fixedCell = (record) => {
    const node = document.createElement("span");
    node.className = "mw-status mw-status--plain feed-entry-status";
    if (record.publication_pending) { node.classList.add("mw-status--attention"); node.textContent = L("固定版本未存完"); }
    else if (record.artifact_version > 0) { node.classList.add("mw-status--done"); node.textContent = L("固定版本") + " v" + record.artifact_version; }
    else node.setAttribute("aria-hidden", "true");
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
    pending.textContent = record.publication_pending ? L("上次固定版本还没存完。恢复会使用上次的固定内容，之后的编辑可以再存一版。") : "";
    if (selected && selected.id === record.id) publishContext();
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
    publishContext();
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
    publishContext();
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
    publishContext();
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const artifactLabel = (record) => record?.publication_pending ? L("继续保存上次固定版本") : record && record.artifact_version > 0 ? L("再存一个固定版本") : L("存为固定版本");
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
      row.append(
        leading,
        textCell("plugin-stage-fact", (record.slides || []).length + " " + L("页")),
        textCell("plugin-stage-meta", firstLine(record.description, whenOf(record.updated_at))),
        fixedCell(record),
      );
      item.append(row);
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
    aiAvailable = payload.ai_available === true;
    aiUnavailableReason = payload.ai_unavailable_reason || "";
    paintOutlineModes();
    renderList();
  };
  /* ---- Outline from text: a dialog that turns pasted text into slides, locally or through the model ---- */
  const outlineDialog = workbench.querySelector("[data-ppt-outline-dialog]");
  const outlineForm = workbench.querySelector("[data-ppt-outline-form]");
  let outlineMode = "local", outlineSourceKind = "text";
  // The other source is a Pages document: listed and read on the server through Pages' own actions, with this person's authority.
  const paintOutlineSource = async () => {
    if (!outlineDialog) return;
    outlineDialog.querySelectorAll("[data-ppt-outline-source]").forEach((button) => {
      const on = button.dataset.pptOutlineSource === outlineSourceKind;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-checked", String(on));
    });
    const pageField = outlineDialog.querySelector("[data-ppt-outline-page-field]");
    const textField = outlineDialog.querySelector("[data-ppt-outline-text-field]");
    const note = outlineDialog.querySelector("[data-ppt-outline-page-note]");
    const textarea = outlineDialog.querySelector("[data-ppt-outline-text]");
    const usePage = outlineSourceKind === "page";
    if (textField) textField.hidden = usePage;
    if (textarea) textarea.required = !usePage;
    if (pageField) pageField.hidden = !usePage;
    if (!usePage) { if (note) note.hidden = true; return; }
    const select = outlineDialog.querySelector("[data-ppt-outline-page]");
    if (select && select.dataset.loaded === "true") return;
    if (note) { note.hidden = false; note.textContent = L("正在读取文档…"); }
    try {
      const payload = await request("GET", "/api/plugins/ppt/outline-pages");
      const documents = payload.documents || [];
      if (select) {
        select.replaceChildren(...documents.map((doc) => { const option = document.createElement("option"); option.value = doc.id; option.textContent = doc.title || L("无标题"); return option; }));
        select.dataset.loaded = "true";
      }
      if (note) {
        note.hidden = documents.length > 0;
        note.textContent = documents.length ? "" : (payload.unavailable_reason ? L(payload.unavailable_reason) : L("这个项目还没有 Pages 文档"));
      }
    } catch (error) {
      if (note) { note.hidden = false; note.textContent = error.message || L("读不到 Pages 文档"); }
    }
  };
  const paintOutlineModes = () => {
    if (!outlineDialog) return;
    const ai = outlineDialog.querySelector('[data-ppt-outline-mode="ai"]');
    const reason = outlineDialog.querySelector("[data-ppt-outline-ai-reason]");
    if (ai) { ai.disabled = !aiAvailable; ai.title = aiAvailable ? "" : (aiUnavailableReason ? L(aiUnavailableReason) : L("请先配置可用的文字模型")); }
    if (!aiAvailable && outlineMode === "ai") outlineMode = "local";
    outlineDialog.querySelectorAll("[data-ppt-outline-mode]").forEach((button) => {
      const on = button.dataset.pptOutlineMode === outlineMode;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-checked", String(on));
    });
    if (reason) { reason.hidden = aiAvailable; reason.textContent = aiAvailable ? "" : (aiUnavailableReason ? L(aiUnavailableReason) : L("请先配置可用的文字模型")); }
  };
  const showOutlineError = (text) => {
    const box = outlineDialog?.querySelector("[data-ppt-outline-error]");
    if (!box) return;
    box.hidden = !text;
    box.textContent = text || "";
  };
  const openOutline = () => {
    if (!outlineDialog || !selected) return;
    showOutlineError("");
    const replace = outlineDialog.querySelector("[data-ppt-outline-replace]");
    // A deck that is still one blank page is simply filled; the box only matters once there is something to keep.
    const blank = selected.slides.length === 1 && !selected.slides[0].bullets.length && !selected.slides[0].notes;
    if (replace) { replace.checked = false; replace.closest("label").hidden = blank; }
    paintOutlineModes();
    const select = outlineDialog.querySelector("[data-ppt-outline-page]");
    if (select) delete select.dataset.loaded;
    void paintOutlineSource();
    outlineDialog.showModal();
    outlineDialog.querySelector(outlineSourceKind === "page" ? "[data-ppt-outline-page]" : "[data-ppt-outline-text]")?.focus();
  };
  const submitOutline = async () => {
    if (!outlineDialog || !selected) return;
    const textarea = outlineDialog.querySelector("[data-ppt-outline-text]");
    const text = (textarea?.value || "").trim();
    const pageId = outlineSourceKind === "page" ? (outlineDialog.querySelector("[data-ppt-outline-page]")?.value || "") : "";
    if (outlineSourceKind === "page" && !pageId) { showOutlineError(L("先选一篇文档")); return; }
    if (outlineSourceKind === "text" && !text) { showOutlineError(L("收到的内容里没有可以做成幻灯片的文字")); textarea?.focus(); return; }
    const submit = outlineDialog.querySelector("[data-ppt-outline-submit]");
    const replace = Boolean(outlineDialog.querySelector("[data-ppt-outline-replace]")?.checked);
    showOutlineError("");
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = outlineMode === "ai" ? L("整理中…") : label;
    try {
      await save();
      const record = selected;
      const payload = await request("POST", "/api/plugins/ppt/" + encodeURIComponent(record.id) + (outlineMode === "ai" ? "/outline-ai" : "/outline"),
        { ...(pageId ? { page_id: pageId } : { text }), replace, expected_version: record.version });
      if (!selected || selected.id !== record.id) return;
      currentSlideId = payload.presentation.slides[replace ? 0 : Math.max(0, payload.presentation.slides.length - payload.slide_count)]?.id || currentSlideId;
      fillEditor(payload.presentation);
      await loadList();
      if (textarea) textarea.value = "";
      outlineDialog.close();
      showNote(L("已生成 {count} 页").replace("{count}", String(payload.slide_count)), false);
    } catch (error) {
      showOutlineError(error.message || L("演示稿请求失败"));
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  };
  outlineDialog?.addEventListener("click", (event) => {
    if (event.target.closest("[data-ppt-outline-close]")) { outlineDialog.close(); return; }
    const sourceButton = event.target.closest("[data-ppt-outline-source]");
    if (sourceButton) { outlineSourceKind = sourceButton.dataset.pptOutlineSource; void paintOutlineSource(); return; }
    const mode = event.target.closest("[data-ppt-outline-mode]");
    if (mode && !mode.disabled) { outlineMode = mode.dataset.pptOutlineMode; paintOutlineModes(); }
  });
  outlineForm?.addEventListener("submit", (event) => { event.preventDefault(); void submitOutline(); });
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
        placed({ verb: "created", title: payload.presentation.title, object: { kind: "presentation", id: payload.presentation.id } });
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
        placed({ verb: "versioned", title: payload.presentation.title, object: { kind: "presentation", id: payload.presentation.id }, artifact: payload.artifact,
          note: L("第 {version} 版 · 放在这个位置的成果里；继续编辑不会改变这一版", { version: payload.artifact.version }) });
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
      if (event.target.closest("[data-ppt-outline-open]") && selected) { openOutline(); return; }
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
      if (event.target.closest("[data-ppt-present]") && selected) {
        await save();
        const index = Math.max(0, (selected.slides || []).findIndex((slide) => slide.id === currentSlideId));
        present(liveRecord(), index);
        return;
      }
      const exportButton = event.target.closest("[data-ppt-export]");
      if (exportButton && selected) {
        exportButton.closest("details")?.removeAttribute("open");
        await save();
        const format = exportButton.dataset.pptExport || "pptx";
        if (format === "pdf") { printDeck(liveRecord()); return; }
        if (format === "pptx") {
          const exported = await request("GET", "/api/plugins/ppt/" + encodeURIComponent(selected.id) + "/pptx?expected_version=" + selected.version);
          const bytes = Uint8Array.from(atob(exported.content_base64), (char) => char.charCodeAt(0));
          download(exported.filename, new Blob([bytes], { type: exported.mime_type }));
          placed({ verb: "exported", title: selected.title, file: { name: exported.filename, format: L("PowerPoint · {count} 页，含讲者备注", { count: exported.slide_count }) } });
          return;
        }
        const exported = await request("GET", "/api/plugins/ppt/" + encodeURIComponent(selected.id) + "/export?expected_version=" + selected.version);
        download(exported.filename, new Blob([exported.content], { type: exported.mime_type }));
        placed({ verb: "exported", title: selected.title, file: { name: exported.filename, format: L("数据文件，不是演示文稿") } });
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
  window.addEventListener("molis:placement-changed", (event) => {
    const detail = event.detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("presentation")) return;
    if (detail.mode === "move" && detail.from && selected && selected.id === detail.from.id) closeEditor();
    void loadList().catch((error) => showNote(error.message, true));
  });
  document.addEventListener("molis-work:model-ready", () => void loadList().catch((error) => showNote(error.message, true)));
  window.addEventListener("beforeunload", (event) => {
    if (selected && (saveError || editRevision > savedRevision)) { event.preventDefault(); event.returnValue = ""; }
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
  void loadList().catch((error) => { showNote(error.message, true); listFailed(error); });
}
`;
