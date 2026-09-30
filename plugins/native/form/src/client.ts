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
  const statsEl = workbench.querySelector("[data-form-result-stats]");
  const importInput = workbench.querySelector("[data-form-import-files]");
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
  /** Tell the workbench what just happened, so it can say where the result is and what comes next. */
  const placed = (detail) => { window.dispatchEvent(new CustomEvent("molis:placement-result", { detail })); };
  /** The form on screen, for the placement bar and the Assistant. */
  const publishContext = () => {
    const context = { plugin_id: "io.molis.work.form", surface_title: "Forms" };
    if (selected) {
      context.object = { kind: "form", id: selected.id, version: selected.version, title: titleInput.value || selected.title };
      if (editRevision > savedRevision || saveError || answerDirty) context.unsaved = true;
    }
    workbench.setAttribute("data-assistant-context", JSON.stringify(context));
  };
  const download = (name, blob) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    URL.revokeObjectURL(url);
  };
  const COLLECT = { draft: "未开始收集", published: "正在这台电脑上收集", closed: "已停止收集" };
  const paintCollect = (record) => {
    const collecting = record.status === "published";
    const state = workbench.querySelector("[data-form-collect-state]");
    if (state) { state.textContent = L(COLLECT[record.status] || COLLECT.draft); state.className = "form-collect-state mw-status mw-status--" + (collecting ? "done" : "quiet"); }
    const start = workbench.querySelector("[data-form-publish]");
    if (start) { start.hidden = collecting; start.textContent = record.status === "closed" ? L("重新开始收集") : L("开始收集"); }
    const fill = workbench.querySelector("[data-form-fill]");
    if (fill) fill.hidden = !collecting;
    const close = workbench.querySelector("[data-form-close]");
    if (close) close.hidden = !collecting;
  };
  /** Full-screen fill page on this computer: one person after another, each submission counted as a response. */
  const openFillPage = (record) => {
    const stage = document.createElement("div");
    stage.className = "form-fill-page";
    stage.setAttribute("role", "dialog");
    stage.setAttribute("aria-label", L("填写页") + " · " + record.title);
    const sheet = document.createElement("form");
    sheet.className = "form-fill-sheet";
    const leave = () => { document.removeEventListener("keydown", onKey, true); stage.remove(); if (tab === "results") void loadResults(); };
    const onKey = (event) => { if (event.key === "Escape") { event.preventDefault(); leave(); } };
    const draw = () => {
      sheet.replaceChildren();
      const kicker = document.createElement("p"); kicker.className = "form-fill-kicker"; kicker.textContent = L("在这台电脑上填写 · 回答只保存在这台电脑");
      const heading = document.createElement("h1"); heading.textContent = record.title;
      sheet.append(kicker, heading);
      if (record.description) { const lede = document.createElement("p"); lede.className = "form-fill-lede"; lede.textContent = record.description; sheet.append(lede); }
      const fields = document.createElement("div"); fields.className = "form-fill-fields";
      buildFields(fields, record.questions || []);
      const error = document.createElement("p"); error.className = "form-fill-error"; error.setAttribute("role", "alert");
      const actions = document.createElement("div"); actions.className = "form-fill-actions";
      const exit = document.createElement("button"); exit.type = "button"; exit.className = "mw-btn mw-btn--secondary"; exit.textContent = L("退出填写页"); exit.onclick = leave;
      const submit = document.createElement("button"); submit.type = "submit"; submit.className = "mw-btn mw-btn--primary"; submit.textContent = L("提交");
      actions.append(exit, submit);
      sheet.append(fields, error, actions);
      let attempt = null;
      sheet.onsubmit = async (event) => {
        event.preventDefault();
        const answers = collectAnswers(fields);
        const missing = (record.questions || []).find((question) => question.required && !String(answers[question.id] || "").trim());
        if (missing) { error.textContent = L("还有必填题没填") + "：" + missing.title; return; }
        attempt ||= crypto.randomUUID();
        submit.disabled = true; error.textContent = "";
        try {
          await request("POST", "/api/plugins/form/" + encodeURIComponent(record.id) + "/submit", { answers, expected_version: record.version, request_id: attempt, source: "fill" });
          const results = await request("GET", "/api/plugins/form/" + encodeURIComponent(record.id) + "/results");
          sheet.replaceChildren();
          const done = document.createElement("h1"); done.textContent = L("已提交，谢谢");
          const count = document.createElement("p"); count.className = "form-fill-lede"; count.textContent = L("这是第 {count} 份答卷。可以把电脑交给下一位。", { count: results.analysis?.submission_count || 0 });
          const next = document.createElement("button"); next.type = "button"; next.className = "mw-btn mw-btn--primary"; next.textContent = L("下一位填写"); next.onclick = draw;
          const quit = document.createElement("button"); quit.type = "button"; quit.className = "mw-btn mw-btn--secondary"; quit.textContent = L("退出填写页"); quit.onclick = leave;
          const row = document.createElement("div"); row.className = "form-fill-actions"; row.append(quit, next);
          sheet.append(done, count, row);
          next.focus();
        } catch (failure) { error.textContent = failure.message || L("提交失败"); submit.disabled = false; }
      };
      requestAnimationFrame(() => sheet.querySelector("input, select, textarea")?.focus());
    };
    draw();
    stage.append(sheet);
    document.addEventListener("keydown", onKey, true);
    document.body.append(stage);
  };
  const SOURCE = { preview: "试填", fill: "本机填写页", file: "答卷文件" };
  /** Each question at a glance: counts for choices and ratings (with the average), recent answers for text. */
  const renderStats = (questions, submissions) => {
    statsEl.replaceChildren();
    if (!submissions.length) return;
    const sources = {};
    submissions.forEach((submission) => { const key = submission.source || "preview"; sources[key] = (sources[key] || 0) + 1; });
    const origin = document.createElement("p"); origin.className = "form-stats-origin";
    origin.textContent = Object.entries(sources).map(([key, count]) => L(SOURCE[key] || key) + " " + count).join(" · ");
    statsEl.append(origin);
    questions.forEach((question, index) => {
      const card = document.createElement("article"); card.className = "form-stat";
      const head = document.createElement("strong"); head.textContent = (index + 1) + ". " + (question.title || L("未命名题目"));
      card.append(head);
      const values = submissions.map((submission) => String(submission.answers?.[question.id] ?? "")).filter(Boolean);
      const meta = document.createElement("small"); meta.textContent = L("{count} 人回答", { count: values.length });
      card.append(meta);
      if (["singleChoice", "multiChoice", "dropdown", "rating"].includes(question.type)) {
        const counts = new Map();
        const labels = question.type === "rating" ? ["5", "4", "3", "2", "1"] : (question.options || []).map((option) => option.label);
        labels.forEach((label) => counts.set(label, 0));
        values.forEach((value) => (question.type === "multiChoice" ? value.split("\\n") : [value]).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1)));
        const bars = document.createElement("div"); bars.className = "form-stat-bars";
        counts.forEach((count, label) => {
          const row = document.createElement("div");
          const name = document.createElement("span"); name.textContent = question.type === "rating" ? L("{score} 分", { score: label }) : label;
          const track = document.createElement("span"); track.className = "form-stat-track";
          const fill = document.createElement("i"); fill.style.width = (values.length ? Math.round(count / values.length * 100) : 0) + "%"; track.append(fill);
          const value = document.createElement("span"); value.className = "form-stat-count"; value.textContent = String(count);
          row.append(name, track, value); bars.append(row);
        });
        card.append(bars);
        if (question.type === "rating" && values.length) {
          const average = values.reduce((sum, value) => sum + Number(value), 0) / values.length;
          meta.textContent += " · " + L("平均 {score} / 5", { score: average.toFixed(1) });
        }
      } else if (values.length) {
        const list = document.createElement("ul"); list.className = "form-stat-texts";
        values.slice(-3).reverse().forEach((value) => { const item = document.createElement("li"); item.textContent = value; list.append(item); });
        card.append(list);
      }
      statsEl.append(card);
    });
  };
  const paintStatus = (record) => {
    statusEl.className = "mw-status mw-status--" + (saveError ? "blocked" : "quiet");
    statusEl.textContent = saveError ? L("保存失败") : savePromise ? L("保存中") : editRevision > savedRevision ? L("尚未保存") : busy ? L("处理中") : L("已保存");
    paintCollect(record);
    if (selected && selected.id === record.id) publishContext();
    const pending = workbench.querySelector("[data-form-publication-note]");
    pending.hidden = !record.publication_pending;
    pending.textContent = record.publication_pending ? L("上次固定版本还没存完。恢复会使用上次的固定内容，之后的编辑可以再存一版。") : "";
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
    buildFields(previewEl, record.questions || []);
  };
  /** The answer fields of a form, into any container: the author's trial or the full-screen fill page. */
  const buildFields = (container, questions) => {
    questions.forEach((question) => {
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
      container.append(field);
    });
  };
  const collectAnswers = (container = previewEl) => {
    const answers = {};
    container.querySelectorAll("[data-answer-id]").forEach((node) => {
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
    publishContext();
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const artifactLabel = (record) => record?.publication_pending ? L("继续保存上次固定版本") : record && record.artifact_version > 0 ? L("再存一个固定版本") : L("存为固定版本");
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
      status.textContent = published ? L("正在收集") : record.status === "closed" ? L("已停止收集") : L("未开始收集");
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
    reason.replaceChildren(document.createTextNode(aiUnavailableReason || L("当前没有可用的文字模型，请检查模型设置和服务连接。")));
    if (!aiAvailable) {
      const link = document.createElement("a");
      link.href = "/settings/models";
      link.textContent = L("打开模型设置");
      reason.append(document.createTextNode(" "), link);
    }
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
        placed({ verb: "created", title: payload.form.title, object: { kind: "form", id: payload.form.id } });
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
        placed({ verb: "versioned", title: payload.form.title, object: { kind: "form", id: payload.form.id },
          note: L("第 {version} 版题目 · 放在这个位置的成果（Artifacts）里；不含答卷", { version: payload.artifact.version }) });
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
        if (!(selected.questions || []).length) { showNote(L("还没有题目，先加题再开始收集"), true); return; }
        const payload = await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/publish", { expected_version: selected.version });
        remember(payload.form, false);
        await loadList();
        showNote(L("正在收集答卷：可以在这台电脑上打开填写页，或导出填写页文件发给别人。不会生成外网链接。"), false);
        return;
      }
      if (event.target.closest("[data-form-close]") && selected) {
        event.target.closest("details")?.removeAttribute("open");
        await save();
        const payload = await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/close", { expected_version: selected.version });
        remember(payload.form, false);
        await loadList();
        showNote(L("已停止收集。已有答卷都保留；填写页不再接受提交，导入答卷文件仍然可以。"), false);
        return;
      }
      if (event.target.closest("[data-form-fill]") && selected) {
        await save();
        openFillPage(selected);
        return;
      }
      if (event.target.closest("[data-form-export-fill]") && selected) {
        event.target.closest("details")?.removeAttribute("open");
        await save();
        const page = await request("GET", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/fill-page");
        download(page.filename, new Blob([page.content], { type: "text/html;charset=utf-8" }));
        placed({ verb: "exported", title: selected.title, file: { name: page.filename, format: L("填写页 · 发给对方在自己的浏览器里填，填完得到答卷文件发回，在“结果”里导入") } });
        return;
      }
      if (event.target.closest("[data-form-export-csv]") && selected) {
        event.target.closest("details")?.removeAttribute("open");
        await save();
        const table = await request("GET", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/results.csv");
        download(table.filename, new Blob([table.content], { type: "text/csv;charset=utf-8" }));
        placed({ verb: "exported", title: selected.title, file: { name: table.filename, format: L("{count} 份答卷 · Excel、Numbers 可以打开", { count: table.count }) } });
        return;
      }
      if (event.target.closest("[data-form-import]") && selected) {
        importInput.value = "";
        importInput.click();
        return;
      }
      if (event.target.closest("[data-form-to-dataset]") && selected) {
        await save();
        const table = await request("GET", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/results.csv");
        if (!table.count) { showNote(L("还没有答卷，收到答卷后再存成数据表"), true); return; }
        window.dispatchEvent(new CustomEvent("molis:placement-convert", { detail: { source: { kind: "form", id: selected.id }, station: "dataset",
          title: selected.title + " · " + L("答卷"), payload: { title: selected.title + " · " + L("答卷"), body: table.content.replace(/^\ufeff/, "") },
          note: L("{count} 份答卷做成的表 · 之后的新答卷不会自动加入", { count: table.count }) } }));
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
    statsEl.replaceChildren();
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
    renderStats(questions, payload.submissions || []);
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
      await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/submit", { answers, expected_version: previewVersion, request_id: submissionAttempt.request_id, source: "preview" });
      answerDirty = false;
      await loadResults();
      setTab("results");
      showNote(L("已提交"), false);
    } catch (error) { showNote(error.message, true); }
    finally { setBusy(false); }
  });
  importInput?.addEventListener("change", async () => {
    const files = [...importInput.files || []];
    if (!files.length || !selected) return;
    setBusy(true);
    try {
      const contents = await Promise.all(files.map(async (file) => ({ name: file.name, content: file.size > 400000 ? "" : await file.text() })));
      const result = await request("POST", "/api/plugins/form/" + encodeURIComponent(selected.id) + "/answers", { files: contents });
      const parts = [L("导入 {count} 份", { count: result.imported })];
      if (result.skipped) parts.push(L("{count} 份已导入过，跳过", { count: result.skipped }));
      if (result.rejected.length) parts.push(L("{count} 份没有导入", { count: result.rejected.length }) + "：" + result.rejected.map((item) => item.name + "（" + item.reason + "）").join("；"));
      showNote(parts.join(" · "), result.rejected.length > 0);
      await loadResults();
    } catch (error) { showNote(error.message || L("导入失败"), true); }
    finally { setBusy(false); importInput.value = ""; }
  });
  // Moved or copied from the placement bar: this list changed; a form moved away is no longer here to edit.
  window.addEventListener("molis:placement-changed", (event) => {
    const detail = event.detail || {};
    if (![detail.from && detail.from.kind, detail.to && detail.to.kind].includes("form")) return;
    if (detail.mode === "move" && detail.from && selected && selected.id === detail.from.id) closeEditor();
    void loadList().catch((error) => showNote(error.message, true));
  });
  window.addEventListener("beforeunload", (event) => {
    if (selected && (saveError || editRevision > savedRevision || answerDirty)) {
      event.preventDefault(); event.returnValue = "";
    }
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
