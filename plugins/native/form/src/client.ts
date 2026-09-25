/** Forms workbench client: author, preview, submit, results. */
export const FORM_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-form=workbench]");
  if (!workbench) return;
  const list = workbench.querySelector("[data-form=directory]");
  const rowsEl = workbench.querySelector("[data-form-rows]");
  const empty = workbench.querySelector("[data-form-empty]");
  const workspace = workbench.querySelector("[data-form-stage-workspace]");
  const titleEl = workbench.querySelector("[data-form-editor-title]");
  const statusEl = workbench.querySelector("[data-form-editor-status]");
  const titleInput = workbench.querySelector("[data-form-title]");
  const descriptionInput = workbench.querySelector("[data-form-description]");
  const questionsEl = workbench.querySelector("[data-form-questions]");
  const typeSelect = workbench.querySelector("[data-form-question-type]");
  const aiPrompt = workbench.querySelector("[data-form-ai-prompt]");
  const note = workbench.querySelector("[data-form-note]");
  const previewEl = workbench.querySelector("[data-form-preview]");
  const previewForm = workbench.querySelector("[data-form-pane=preview]");
  const summaryEl = workbench.querySelector("[data-form-result-summary]");
  const resultListEl = workbench.querySelector("[data-form-result-list]");
  const exportEl = workbench.querySelector("[data-form-export]");
  const confirmDialog = workbench.querySelector("[data-form-confirm]");
  let records = [];
  let selected = null;
  let tab = "editor";
  let saveTimer = 0;
  let editRevision = 0;
  let savedRevision = 0;
  let savePromise = null;
  let saveError = null;
  let busy = false;
  let aiAvailable = false;
  let aiUnavailableReason = "";
  let previewVersion = null;
  let previewQuestions = [];
  let answerDirty = false;
  let submissionAttempt = null;
  let noteScope = "";
  let resultsSeq = 0;
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
      const error = new Error(payload.code === "form.conflict" ? L("问卷已在别处修改，当前输入已保留。请复制需要保留的内容，再重新读取。") : payload.error || L("问卷请求失败"));
      error.code = payload.code;
      throw error;
    }
    return payload;
  };
  const showNote = (text, isError, scope = "") => {
    noteScope = text ? scope : "";
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
  const paintStatus = (record) => {
    const published = record.status === "published";
    statusEl.className = "mw-status mw-status--" + (saveError ? "blocked" : published ? "done" : "quiet");
    statusEl.textContent = saveError ? L("保存失败") : savePromise ? L("保存中") : editRevision > savedRevision ? L("尚未保存") : busy ? L("处理中") : published ? L("已发布") : L("已保存");
    const pending = workbench.querySelector("[data-form-publication-note]");
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
  const usesOptions = (type) => type === "singleChoice" || type === "multiChoice" || type === "dropdown";
  const questionsFromDom = () => [...questionsEl.querySelectorAll("[data-form-question]")].map((row, index) => {
    const type = row.querySelector("[data-question-type]").value;
    const options = usesOptions(type)
      ? [...row.querySelectorAll("[data-option-label]")].map((input, optionIndex) => ({
        id: input.dataset.optionId || "",
        label: input.value.trim() || L("选项") + " " + (optionIndex + 1),
      }))
      : undefined;
    return {
      id: row.dataset.questionId,
      type,
      title: row.querySelector("[data-question-title]").value,
      required: row.querySelector("[data-question-required]").checked,
      order: index + 1,
      options,
    };
  });
  const addOptionRow = (container, option) => {
    const row = document.createElement("div");
    row.className = "form-option-row";
    const input = document.createElement("input");
    input.className = "mw-input";
    input.dataset.optionLabel = "true";
    input.dataset.optionId = option?.id || crypto.randomUUID();
    input.value = option?.label || "";
    input.placeholder = L("选项");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
    remove.dataset.optionRemove = "true";
    remove.setAttribute("aria-label", L("删选项"));
    remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    row.append(input, remove);
    container.append(row);
  };
  const fillOptions = (row, type, options) => {
    const optionsEl = row.querySelector("[data-question-options]");
    optionsEl.replaceChildren();
    if (!usesOptions(type)) return;
    const list = document.createElement("div");
    list.className = "form-option-list";
    const source = options && options.length ? options : [{ label: "" }, { label: "" }];
    source.forEach((option) => addOptionRow(list, option));
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mw-btn mw-btn--ghost";
    add.dataset.optionAdd = "true";
    add.textContent = L("加选项");
    optionsEl.append(list, add);
  };
  const renderQuestion = (question) => {
    const row = document.createElement("div");
    row.className = "form-question";
    row.dataset.formQuestion = "true";
    row.dataset.questionId = question.id;
    row.innerHTML = '<input class="mw-input" data-question-title autocomplete="off">'
      + '<select class="mw-select" data-question-type>'
      + '<option value="text">' + L("填空") + '</option>'
      + '<option value="singleChoice">' + L("单选") + '</option>'
      + '<option value="multiChoice">' + L("多选") + '</option>'
      + '<option value="dropdown">' + L("下拉") + '</option>'
      + '<option value="rating">' + L("评分") + '</option>'
      + '<option value="date">' + L("日期") + '</option>'
      + '</select>'
      + '<label class="mw-check-row"><input class="mw-check" type="checkbox" data-question-required><span>' + L("必填") + '</span></label>'
      + '<span class="form-question-move">'
      + '<button class="mw-btn mw-btn--ghost" type="button" data-question-move="-1" aria-label="' + L("上移") + '"><svg aria-hidden="true"><use href="#icon-chevron-up"></use></svg></button>'
      + '<button class="mw-btn mw-btn--ghost" type="button" data-question-move="1" aria-label="' + L("下移") + '"><svg aria-hidden="true"><use href="#icon-chevron-down"></use></svg></button>'
      + '</span>'
      + '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-question-remove aria-label="' + L("删题") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button>'
      + '<div class="form-question-options" data-question-options></div>';
    row.querySelector("[data-question-title]").placeholder = L("题目");
    row.querySelector("[data-question-title]").value = question.title || "";
    row.querySelector("[data-question-type]").value = question.type || "text";
    row.querySelector("[data-question-required]").checked = Boolean(question.required);
    fillOptions(row, question.type, question.options);
    return row;
  };
  const renderQuestions = (questions) => {
    questionsEl.replaceChildren();
    (questions || []).forEach((question) => questionsEl.append(renderQuestion(question)));
  };
  const setTab = (next) => {
    tab = next;
    showNote("", false);
    workbench.querySelectorAll("[data-form-tab]").forEach((button) => {
      const on = button.dataset.formTab === next;
      button.classList.toggle("is-current", on);
      button.setAttribute("aria-selected", String(on));
    });
    workbench.querySelectorAll("[data-form-pane]").forEach((pane) => {
      pane.hidden = pane.dataset.formPane !== next;
    });
  };
  const renderPreview = (record) => {
    previewVersion = record.version;
    previewQuestions = record.questions || [];
    answerDirty = false;
    submissionAttempt = null;
    previewEl.replaceChildren();
    const submitBtn = previewForm.querySelector("[data-form-submit]");
    if (submitBtn) submitBtn.hidden = !(record.questions || []).length;
    if (!(record.questions || []).length) {
      const emptyPreview = document.createElement("p");
      emptyPreview.className = "form-preview-empty";
      emptyPreview.textContent = L("还没有题目。回到编辑加一题。");
      previewEl.append(emptyPreview);
      return;
    }
    (record.questions || []).forEach((question) => {
      const field = document.createElement("div");
      field.className = "form-field";
      const title = document.createElement("span");
      title.textContent = question.title + (question.required ? " *" : "");
      field.append(title);
      if (question.type === "singleChoice" || question.type === "multiChoice") {
        const box = document.createElement("div");
        box.className = "form-preview-options";
        box.dataset.answerId = question.id;
        box.dataset.answerKind = question.type === "multiChoice" ? "multi" : "single";
        (question.options || []).forEach((option) => {
          const label = document.createElement("label");
          label.className = "form-preview-option";
          const input = document.createElement("input");
          input.type = question.type === "multiChoice" ? "checkbox" : "radio";
          input.className = question.type === "multiChoice" ? "mw-check" : "mw-radio";
          input.name = "q-" + question.id;
          input.value = option.label;
          label.append(input, document.createTextNode(option.label));
          box.append(label);
        });
        field.append(box);
      } else if (question.type === "dropdown") {
        const input = document.createElement("select");
        input.className = "mw-select";
        input.dataset.answerId = question.id;
        input.append(new Option("", ""));
        (question.options || []).forEach((option) => input.append(new Option(option.label, option.label)));
        field.append(input);
      } else if (question.type === "rating") {
        const box = document.createElement("div");
        box.className = "form-preview-options form-preview-rating";
        box.dataset.answerId = question.id;
        box.dataset.answerKind = "single";
        for (let score = 1; score <= 5; score += 1) {
          const label = document.createElement("label");
          label.className = "form-preview-option";
          const input = document.createElement("input");
          input.type = "radio";
          input.className = "mw-radio";
          input.name = "q-" + question.id;
          input.value = String(score);
          label.append(input, document.createTextNode(String(score)));
          box.append(label);
        }
        field.append(box);
      } else {
        const input = document.createElement("input");
        input.className = "mw-input";
        input.dataset.answerId = question.id;
        input.type = question.type === "date" ? "date" : "text";
        field.append(input);
      }
      previewEl.append(field);
    });
  };
  const collectAnswers = () => {
    const answers = {};
    previewEl.querySelectorAll("[data-answer-id]").forEach((node) => {
      const id = node.dataset.answerId;
      if (node.dataset.answerKind === "multi") {
        answers[id] = [...node.querySelectorAll("input:checked")].map((input) => input.value).join("\\n");
        return;
      }
      if (node.dataset.answerKind === "single") {
        answers[id] = node.querySelector("input:checked")?.value || "";
        return;
      }
      answers[id] = node.value;
    });
    return answers;
  };
  const markSelected = (id) => {
    list.querySelectorAll("[data-form-id]").forEach((row) => {
      const on = row.dataset.formId === id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const remember = (record, redraw) => {
    selected = record;
    const index = records.findIndex((item) => item.id === record.id);
    if (index >= 0) records[index] = record;
    else records.unshift(record);
    renderList();
    titleEl.textContent = record.title;
    paintStatus(record);
    markSelected(record.id);
    if (redraw) fillEditor(record);
  };
  const fillEditor = (record) => {
    clearTimeout(saveTimer);
    editRevision = savedRevision = 0;
    saveError = null;
    answerDirty = false;
    submissionAttempt = null;
    resultsSeq += 1;
    selected = record;
    showNote("", false);
    const opening = workspace.hidden;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    if (opening) arrive(workspace);
    titleEl.textContent = record.title;
    paintStatus(record);
    titleInput.value = record.title;
    descriptionInput.value = record.description || "";
    renderQuestions(record.questions);
    renderPreview(record);
    markSelected(record.id);
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    editRevision = savedRevision = 0;
    saveError = null;
    answerDirty = false;
    submissionAttempt = null;
    resultsSeq += 1;
    selected = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const artifactLabel = (record) => record?.publication_pending ? L("恢复发布") : record && record.artifact_version > 0 ? L("再存一版") : L("存成 Artifact");
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
      row.dataset.formId = record.id;
      row.setAttribute("aria-selected", String(selected?.id === record.id));
      const leading = document.createElement("span");
      leading.className = "feed-stage-leading";
      const title = document.createElement("strong");
      title.title = record.title;
      title.textContent = record.title;
      leading.append(title);
      const published = record.status === "published";
      const status = document.createElement("span");
      status.className = "mw-status mw-status--" + (published ? "done" : "quiet") + " feed-entry-status";
      status.textContent = published ? L("已发布") : L("草稿");
      row.append(
        leading,
        kindChip("form", L("问卷")),
        textCell("plugin-stage-fact", (record.questions || []).length + " " + L("题")),
        textCell("plugin-stage-meta", firstLine(record.description)),
        status,
      );
      item.append(row, artifactControl(record, "formArtifact"));
      rowsEl.append(item);
    });
    const bar = workbench.querySelector("[data-form-artifact-bar]");
    if (bar) bar.textContent = artifactLabel(selected);
  };
  const loadList = async () => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/plugins/form");
    if (seq !== listSeq) return;
    records = payload.forms || [];
    renderList();
    aiAvailable = payload.ai_available === true;
    aiUnavailableReason = payload.ai_unavailable_reason || "";
    const button = workbench.querySelector("[data-form-generate-ai]");
    button.disabled = !aiAvailable;
    const reason = workbench.querySelector("[data-form-ai-reason]");
    reason.hidden = aiAvailable;
    reason.textContent = aiUnavailableReason || L("当前没有可用的文字模型，请检查模型设置和服务连接。");
  };
  const draftFromDom = () => ({ title: titleInput.value, description: descriptionInput.value, questions: questionsFromDom() });
  const save = () => {
    clearTimeout(saveTimer);
    if (savePromise) return savePromise;
    const drain = async () => {
      if (saveError) throw saveError;
      while (selected && savedRevision < editRevision) {
        const revision = editRevision;
        const draft = draftFromDom();
        try {
          const payload = await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id), {
            ...draft, expected_version: selected.version,
          });
          // Preserve edits made while the previous request was in flight.
          const laterDraft = editRevision > revision ? draftFromDom() : null;
          savedRevision = revision;
          remember(laterDraft ? { ...payload.form, ...laterDraft } : payload.form, false);
          if (noteScope === "save" || (noteScope === "publication" && selected.publication_pending)) showNote("", false);
        } catch (error) {
          saveError = error;
          throw error;
        }
      }
      return selected;
    };
    savePromise = drain().finally(() => {
      savePromise = null;
      if (selected) paintStatus(selected);
    });
    if (selected) paintStatus(selected);
    return savePromise;
  };
  const queueSave = () => {
    if (saveError && ["form.invalid", "actions.input_invalid"].includes(saveError.code)) saveError = null;
    editRevision += 1;
    if (selected) paintStatus(selected);
    clearTimeout(saveTimer);
    if (!saveError) saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true, "save")); }, 400);
  };
  const setBusy = (value) => {
    busy = value;
    // Keep confirmation dialogs usable while preventing competing editor commands.
    workspace.inert = value;
    list.inert = value;
    workbench.setAttribute("aria-busy", String(value));
    if (selected) paintStatus(selected);
  };

  workbench.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button || button.type === "submit" || button.closest("dialog") || button.disabled || busy) return;
    setBusy(true);
    try {
      if (button.closest("[data-form-reload]") && selected) {
        clearTimeout(saveTimer);
        if (savePromise) await savePromise.catch(() => {});
        if ((saveError || editRevision > savedRevision || answerDirty) && !await ask(L("重新读取会丢弃未保存的编辑和填写内容。继续吗？"), L("重新读取"))) return;
        const payload = await request("GET", "/api/plugins/form/" + encodeURIComponent(selected.id));
        fillEditor(payload.form);
        await loadList();
        if (tab === "results") await loadResults();
        return;
      }
      const create = event.target.closest("[data-form-new]");
      if (create) {
        await save();
        if (answerDirty && !await ask(L("离开会丢弃未提交的填写内容。继续吗？"), L("继续"))) return;
        const payload = await request("POST", "/api/plugins/form", {});
        await loadList();
        setTab("editor");
        fillEditor(payload.form);
        return;
      }
      const artifact = event.target.closest("[data-form-artifact]");
      if (artifact) {
        const id = artifact.dataset.formArtifact || (selected && selected.id);
        if (!id) return;
        if (selected && selected.id === id) {
          await save();
        }
        const record = selected?.id === id ? selected : records.find((item) => item.id === id);
        let payload;
        try {
          payload = await request("POST", "/api/plugins/form/" + encodeURIComponent(id) + "/promote", { expected_version: record.version });
        } catch (error) {
          if (error.code !== "form.conflict") {
            // Publication may have reached Artifact storage before association failed.
            const fresh = await request("GET", "/api/plugins/form/" + encodeURIComponent(id)).catch(() => null);
            if (fresh && selected?.id === id) remember(fresh.form, false);
            await loadList().catch(() => {});
          }
          throw error;
        }
        showNote(L("已存成 Artifact"), false);
        await loadList();
        if (payload.form && selected && selected.id === payload.form.id) remember(payload.form, false);
        return;
      }
      const row = event.target.closest("[data-form-id]");
      if (row) {
        await save();
        if (answerDirty && !await ask(L("离开会丢弃未提交的填写内容。继续吗？"), L("继续"))) return;
        const payload = await request("GET", "/api/plugins/form/" + encodeURIComponent(row.dataset.formId));
        setTab("editor"); fillEditor(payload.form);
        return;
      }
      if (event.target.closest("[data-form-back]")) {
        await save();
        if (answerDirty && !await ask(L("离开会丢弃未提交的填写内容。继续吗？"), L("继续"))) return;
        closeEditor();
        await loadList();
        return;
      }
      const tabButton = event.target.closest("[data-form-tab]");
      if (tabButton && selected) {
        if (tabButton.dataset.formTab === tab) return;
        await save();
        if (answerDirty && !await ask(L("离开会丢弃未提交的填写内容。继续吗？"), L("继续"))) return;
        answerDirty = false;
        setTab(tabButton.dataset.formTab);
        if (tabButton.dataset.formTab === "preview") renderPreview(selected);
        if (tabButton.dataset.formTab === "results") await loadResults();
        return;
      }
      if (event.target.closest("[data-form-add-question]") && selected) {
        const row = renderQuestion({
          id: "q-" + crypto.randomUUID(),
          type: typeSelect.value,
          title: "",
          required: false,
          options: usesOptions(typeSelect.value) ? [{ label: "" }, { label: "" }] : undefined,
        });
        questionsEl.append(row);
        arrive(row);
        queueSave();
        return;
      }
      if (event.target.closest("[data-option-add]")) {
        const listEl = event.target.closest("[data-form-question]").querySelector("[data-question-options] > div");
        addOptionRow(listEl, { label: "" });
        arrive(listEl.lastElementChild);
        queueSave();
        return;
      }
      if (event.target.closest("[data-option-remove]")) {
        event.target.closest(".form-option-row").remove();
        queueSave();
        return;
      }
      const move = event.target.closest("[data-question-move]");
      if (move) {
        const rowEl = move.closest("[data-form-question]");
        const delta = Number(move.dataset.questionMove);
        const siblings = [...questionsEl.children];
        const index = siblings.indexOf(rowEl);
        const next = index + delta;
        if (next < 0 || next >= siblings.length) return;
        if (delta < 0) questionsEl.insertBefore(rowEl, siblings[next]);
        else questionsEl.insertBefore(siblings[next], rowEl);
        queueSave();
        return;
      }
      if (event.target.closest("[data-question-remove]")) {
        event.target.closest("[data-form-question]").remove();
        queueSave();
        return;
      }
      if (event.target.closest("[data-form-generate], [data-form-generate-ai]") && selected) {
        await save();
        const payload = await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + (button.matches("[data-form-generate-ai]") ? "/generate-ai-question" : "/generate-questions"), {
          prompt: aiPrompt.value, expected_version: selected.version,
        });
        fillEditor(payload.form);
        aiPrompt.value = "";
        await loadList();
        return;
      }
      if (event.target.closest("[data-form-publish]") && selected) {
        await save();
        const payload = await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/publish", { expected_version: selected.version });
        remember(payload.form, false);
        await loadList();
        showNote(L("已发布"), false);
        return;
      }
      if (event.target.closest("[data-form-delete]") && selected) {
        if (!await ask(L("删除这份问卷？答卷也会一起删掉。"), L("删除"))) return;
        await save();
        await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/delete", { expected_version: selected.version });
        closeEditor();
        await loadList();
      }
    } catch (error) {
      if (error.code === "form.conflict") saveError = error;
      showNote(error.message || L("问卷请求失败"), true, saveError ? "save" : button.matches("[data-form-artifact]") ? "publication" : "");
    } finally { setBusy(false); }
  });
  const markAnswersChanged = () => {
    answerDirty = true;
    if (noteScope === "required") {
      const answers = collectAnswers();
      if (!previewQuestions.some(question => question.required && !String(answers[question.id] || "").trim())) showNote("", false);
    }
  };
  workbench.addEventListener("input", (event) => {
    if (busy) return;
    if (event.target.closest("[data-form-pane=preview]")) { markAnswersChanged(); return; }
    if (event.target.closest("[data-form-ai-prompt]")) return;
    if (event.target.closest("[data-form-title], [data-form-description], [data-form-question]")) queueSave();
  });
  workbench.addEventListener("change", (event) => {
    if (busy) return;
    if (event.target.closest("[data-form-pane=preview]")) { markAnswersChanged(); return; }
    if (event.target.closest("[data-form-question]")) queueSave();
    if (event.target.matches("[data-question-type]")) {
      const row = event.target.closest("[data-form-question]");
      const existing = [...row.querySelectorAll("[data-option-label]")].map((input) => ({
        id: input.dataset.optionId || "",
        label: input.value,
      }));
      fillOptions(row, event.target.value, existing);
    }
  });
  const loadResults = async () => {
    if (!selected) return;
    const id = selected.id;
    const seq = ++resultsSeq;
    summaryEl.textContent = L("载入中…");
    resultListEl.replaceChildren();
    exportEl.textContent = "";
    const payload = await request("GET", "/api/plugins/form/" + encodeURIComponent(id) + "/results");
    if (seq !== resultsSeq || selected?.id !== id) return;
    const count = payload.analysis?.submission_count || 0;
    summaryEl.textContent = count ? count + " " + L("份答卷") : L("还没有答卷");
    const questions = selected.questions || [];
    resultListEl.replaceChildren();
    (payload.submissions || []).forEach((submission, index) => {
      const card = document.createElement("article");
      card.className = "form-result";
      const head = document.createElement("strong");
      const when = submission.submitted_at ? new Date(submission.submitted_at).toLocaleString() : "";
      head.textContent = L("答卷") + " " + (index + 1) + (when ? " · " + when : "");
      card.append(head);
      if (!submission.questions) {
        const legacy = document.createElement("p"); legacy.className = "form-result-legacy"; legacy.textContent = L("历史答卷未保存题目快照；名称参考当前问卷，未知题目保留原题号。"); card.append(legacy);
      }
      const submittedQuestions = submission.questions || questions;
      const labels = new Map(submittedQuestions.map(question => [question.id, question.title]));
      Object.entries(submission.answers || {}).forEach(([questionId, answer]) => {
        const row = document.createElement("p");
        const label = document.createElement("span");
        label.textContent = labels.get(questionId) || questionId;
        const value = document.createElement("span");
        const raw = answer;
        value.textContent = raw ? String(raw).replace(/\\n/g, "、") : "—";
        row.append(label, value);
        card.append(row);
      });
      resultListEl.append(card);
    });
    exportEl.textContent = JSON.stringify(payload.submissions || [], null, 2);
  };
  previewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    try {
      const answers = collectAnswers();
      const missing = previewQuestions.find((question) => question.required && !String(answers[question.id] || "").trim());
      if (missing) { showNote(L("还有必填题没填"), true, "required"); return; }
      const input = { id: selected.id, expected_version: previewVersion, answers };
      const fingerprint = JSON.stringify(input);
      if (!submissionAttempt || submissionAttempt.fingerprint !== fingerprint) submissionAttempt = { fingerprint, request_id: crypto.randomUUID() };
      await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/submit", { answers, expected_version: previewVersion, request_id: submissionAttempt.request_id });
      answerDirty = false;
      await loadResults();
      setTab("results");
      showNote(L("已提交"), false);
    } catch (error) { showNote(error.message, true); }
    finally { setBusy(false); }
  });
  window.addEventListener("beforeunload", (event) => {
    if (selected && (saveError || editRevision > savedRevision || answerDirty)) {
      event.preventDefault(); event.returnValue = "";
    }
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
