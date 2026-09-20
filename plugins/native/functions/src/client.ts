/** Functions workbench client: Noul/Choice/Score drafts, preview, samples, publish. */
export const FUNCTIONS_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-functions=workbench]");
  if (!workbench) return;
  const list = workbench.querySelector("[data-functions=directory]");
  const rowsEl = workbench.querySelector("[data-functions-rows]");
  const empty = workbench.querySelector("[data-functions-empty]");
  const workspace = workbench.querySelector("[data-functions-stage-workspace]");
  const titleEl = workbench.querySelector("[data-functions-editor-title]");
  const statusEl = workbench.querySelector("[data-functions-editor-status]");
  const deleteBtn = workbench.querySelector("[data-functions-delete]");
  const form = workbench.querySelector("[data-functions-editor]");
  const nameInput = workbench.querySelector("[data-functions-name]");
  const keyInput = workbench.querySelector("[data-functions-key]");
  const instructionsInput = workbench.querySelector("[data-functions-instructions]");
  const criteriaLabel = workbench.querySelector("[data-functions-criteria-label]");
  const addCriterionBtn = workbench.querySelector("[data-functions-add-criterion]");
  const criteriaHead = workbench.querySelector("[data-functions-criteria-head]");
  const criteriaEl = workbench.querySelector("[data-functions-criteria]");
  const samplesEl = workbench.querySelector("[data-functions-samples]");
  const previewInput = workbench.querySelector("[data-functions-preview-input]");
  const publishBtn = workbench.querySelector("[data-functions-publish]");
  const note = workbench.querySelector("[data-functions-note]");
  const lastPreview = workbench.querySelector("[data-functions-last-preview]");
  const createDialog = workbench.querySelector("[data-functions-create-dialog]");
  const createForm = workbench.querySelector("[data-functions-create-form]");
  let records = [];
  let selected = null;
  let saveTimer = 0;

  const headers = () => typeof molisWorkControlHeaders === "function"
    ? molisWorkControlHeaders()
    : { "content-type": "application/json" };
  const request = async (method, path, body) => {
    const response = await fetch(path, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(payload.error || L("Functions 请求失败"));
      failure.code = payload.code || "";
      throw failure;
    }
    return payload;
  };
  const showNote = (text, isError) => {
    if (!note) return;
    note.hidden = !text;
    note.textContent = text || "";
    note.classList.toggle("is-error", Boolean(isError && text));
  };
  const primitiveOf = (record) => record?.primitive || "choice";
  const criteriaFromForm = () => {
    const kind = primitiveOf(selected);
    if (kind === "noul") {
      return {
        true_description: (criteriaEl.querySelector("[data-noul-true]") || {}).value || "",
        false_description: (criteriaEl.querySelector("[data-noul-false]") || {}).value || "",
      };
    }
    if (kind === "score") {
      return [...criteriaEl.querySelectorAll("[data-score-level]")].map((input) => input.value);
    }
    return [...criteriaEl.querySelectorAll("[data-functions-criterion]")].map((row) => ({
      key: row.querySelector("[data-criterion-key]").value.trim(),
      description: row.querySelector("[data-criterion-description]").value.trim(),
    }));
  };
  const addChoiceRow = (item) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.dataset.functionsCriterion = "true";
    row.innerHTML = '<input class="mw-input" data-criterion-key spellcheck="false" autocomplete="off" placeholder="key">'
      + '<input class="mw-input" data-criterion-description autocomplete="off" placeholder="' + L("选项说明") + '">'
      + '<button class="mw-btn mw-btn--ghost" type="button" data-criterion-remove aria-label="' + L("去掉选项") + '">×</button>';
    row.querySelector("[data-criterion-key]").value = item?.key || "";
    row.querySelector("[data-criterion-description]").value = item?.description || "";
    criteriaEl.append(row);
  };
  const addScoreRow = (value) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.innerHTML = '<code data-score-index></code>'
      + '<input class="mw-input" data-score-level autocomplete="off" placeholder="' + L("档位说明") + '">'
      + '<button class="mw-btn mw-btn--ghost" type="button" data-score-remove aria-label="' + L("去掉档位") + '">×</button>';
    row.querySelector("[data-score-level]").value = value || "";
    criteriaEl.append(row);
    [...criteriaEl.querySelectorAll("[data-score-index]")].forEach((node, index) => { node.textContent = String(index); });
  };
  const renderCriteria = (record) => {
    const kind = primitiveOf(record);
    const locked = record.status === "published";
    criteriaEl.replaceChildren();
    addCriterionBtn.hidden = kind === "noul";
    if (criteriaHead) criteriaHead.hidden = kind === "noul";
    if (kind === "noul") {
      criteriaLabel.textContent = L("是的标准（可选）");
      const wrap = document.createElement("div");
      wrap.className = "functions-noul-fields";
      wrap.innerHTML = '<label class="functions-field">' + L("是的标准（可选）") + '<textarea class="mw-input" data-noul-true rows="2"></textarea></label>'
        + '<label class="functions-field">' + L("否的标准（可选）") + '<textarea class="mw-input" data-noul-false rows="2"></textarea></label>';
      wrap.querySelector("[data-noul-true]").value = record.criteria?.true_description || "";
      wrap.querySelector("[data-noul-false]").value = record.criteria?.false_description || "";
      criteriaEl.append(wrap);
    } else if (kind === "score") {
      criteriaLabel.textContent = L("档位");
      const levels = Array.isArray(record.criteria) && record.criteria.length ? record.criteria : ["", ""];
      levels.forEach((level) => addScoreRow(level));
    } else {
      criteriaLabel.textContent = L("选项");
      const items = Array.isArray(record.criteria) && record.criteria.length
        ? record.criteria
        : [{ key: "yes", description: "" }, { key: "no", description: "" }];
      items.forEach(addChoiceRow);
    }
    criteriaEl.querySelectorAll("input, textarea, button").forEach((node) => { node.disabled = locked; });
    addCriterionBtn.disabled = locked;
  };
  const renderSamples = (record) => {
    samplesEl.replaceChildren();
    (record.samples || []).forEach((sample) => {
      const row = document.createElement("div");
      row.className = "functions-sample";
      row.dataset.sampleId = sample.id;
      const load = document.createElement("button");
      load.type = "button";
      load.className = "mw-btn mw-btn--ghost";
      load.dataset.sampleLoad = "true";
      load.textContent = sample.label || L("载入");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mw-btn mw-btn--ghost";
      remove.dataset.sampleRemove = "true";
      remove.setAttribute("aria-label", L("去掉样例"));
      remove.textContent = "×";
      row.append(load, remove);
      samplesEl.append(row);
    });
  };
  const meter = (value) => {
    const bar = document.createElement("div");
    bar.className = "functions-meter";
    const fill = document.createElement("i");
    fill.style.width = Math.max(0, Math.min(100, Number(value) * 100)) + "%";
    bar.append(fill);
    return bar;
  };
  const renderPreview = (record) => {
    const preview = record?.last_preview;
    lastPreview.replaceChildren();
    if (!preview) {
      lastPreview.hidden = true;
      if (record && !previewInput.value) previewInput.value = "";
      return;
    }
    if (!previewInput.value) previewInput.value = preview.input || "";
    lastPreview.hidden = false;
    const head = document.createElement("div");
    head.className = "functions-preview-head";
    const title = document.createElement("strong");
    const kind = preview.primitive || primitiveOf(record);
    if (preview.outcome === "needs_review") title.textContent = L("需要复核");
    else if (kind === "choice") title.textContent = L("已选出") + " " + (preview.choice || "");
    else if (kind === "noul") title.textContent = L("成立概率") + " " + Number(preview.noul ?? 0).toFixed(2);
    else title.textContent = L("判断完成") + " " + String(preview.score ?? "");
    const model = document.createElement("small");
    model.textContent = preview.model ? "model " + preview.model : "";
    head.append(title, model);
    lastPreview.append(head);
    const hint = document.createElement("small");
    hint.textContent = L("模型概率不是正确率。");
    lastPreview.append(hint);
    if (kind === "noul") lastPreview.append(meter(preview.noul ?? 0));
    if (kind === "choice") {
      Object.entries(preview.probabilities || {}).forEach(([key, value]) => {
        const row = document.createElement("div");
        row.className = "functions-probability";
        const code = document.createElement("code");
        code.textContent = key;
        const pct = document.createElement("small");
        pct.textContent = (Number(value) * 100).toFixed(1) + "%";
        row.append(code, meter(value), pct);
        lastPreview.append(row);
      });
    }
    if (kind === "score") {
      const legend = document.createElement("div");
      legend.className = "functions-score-legend";
      (preview.legend || []).forEach((label, index) => {
        const item = document.createElement("span");
        if (Number(preview.score) === index) item.className = "is-chosen";
        const code = document.createElement("code");
        code.textContent = String(index);
        item.append(code, document.createTextNode(" " + label));
        legend.append(item);
      });
      lastPreview.append(legend);
    }
  };
  const fillEditor = (record) => {
    const switching = selected?.id !== record.id;
    selected = record;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = record.name;
    statusEl.textContent = record.status === "published" ? "v" + (record.version || 1) : L("草稿");
    nameInput.value = record.name;
    keyInput.value = record.function_key;
    const locked = record.status === "published";
    nameInput.disabled = locked;
    keyInput.disabled = locked;
    instructionsInput.disabled = locked;
    instructionsInput.value = record.instructions;
    deleteBtn.hidden = locked;
    publishBtn.hidden = locked;
    publishBtn.textContent = locked ? L("发布 v1") : L("发布 v1");
    if (switching) previewInput.value = record.last_preview?.input || "";
    renderCriteria(record);
    renderSamples(record);
    renderPreview(record);
    showNote(locked ? L("已发布，配置不能再改。") : "", false);
    list.querySelectorAll(".functions-row").forEach((row) => {
      const on = row.dataset.functionId === record.id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const closeEditor = () => {
    selected = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    list.querySelectorAll(".functions-row").forEach((row) => {
      row.classList.remove("is-selected");
      row.setAttribute("aria-selected", "false");
    });
  };
  const renderList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "functions-row" + (selected?.id === record.id ? " is-selected" : "");
      row.dataset.functionId = record.id;
      row.setAttribute("aria-selected", String(selected?.id === record.id));
      const title = document.createElement("strong");
      title.textContent = record.name;
      const meta = document.createElement("small");
      const kind = (record.primitive || "choice").replace(/^./, (ch) => ch.toUpperCase());
      meta.textContent = record.status === "published"
        ? kind + " · " + record.function_key + " · v" + (record.version || 1)
        : kind + " · " + record.function_key + " · " + L("草稿");
      row.append(title, meta);
      rowsEl.append(row);
    });
  };
  const loadList = async () => {
    const payload = await request("GET", "/api/functions");
    records = payload.functions || [];
    renderList();
    if (selected) {
      const next = records.find((item) => item.id === selected.id);
      if (next) fillEditor(next);
      else closeEditor();
    }
  };
  const draftBody = () => ({
    name: nameInput.value,
    function_key: keyInput.value,
    instructions: instructionsInput.value,
    criteria: criteriaFromForm(),
  });
  const saveDraft = async () => {
    if (!selected || selected.status === "published") return selected;
    const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id), draftBody());
    selected = payload.function;
    records = records.map((item) => item.id === selected.id ? selected : item);
    renderList();
    titleEl.textContent = selected.name;
    return selected;
  };
  const queueSave = () => {
    if (!selected || selected.status === "published") return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void saveDraft().catch((error) => showNote(error.message, true)); }, 280);
  };
  const remember = (record) => {
    records = records.some((item) => item.id === record.id)
      ? records.map((item) => item.id === record.id ? record : item)
      : [record, ...records];
    renderList();
    fillEditor(record);
  };
  const openCreate = () => {
    if (typeof createDialog.showModal === "function") createDialog.showModal();
    else createDialog.setAttribute("open", "");
  };
  const closeCreate = () => {
    if (typeof createDialog.close === "function") createDialog.close();
    else createDialog.removeAttribute("open");
  };

  workbench.querySelector("[data-functions-new]").addEventListener("click", () => {
    showNote("", false);
    openCreate();
  });
  workbench.querySelectorAll("[data-functions-create-close]").forEach((node) => {
    node.addEventListener("click", () => closeCreate());
  });
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitter = event.submitter;
    const primitive = submitter && submitter.value ? submitter.value : "choice";
    try {
      const payload = await request("POST", "/api/functions", { primitive });
      closeCreate();
      remember(payload.function);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  workbench.querySelector("[data-functions-back]").addEventListener("click", () => closeEditor());
  deleteBtn.addEventListener("click", async () => {
    if (!selected || selected.status === "published") return;
    if (!window.confirm(L("确定删除这个草稿？"))) return;
    try {
      await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/delete", {});
      records = records.filter((item) => item.id !== selected.id);
      closeEditor();
      renderList();
    } catch (error) {
      showNote(error.message, true);
    }
  });
  addCriterionBtn.addEventListener("click", () => {
    if (selected?.status === "published") return;
    if (primitiveOf(selected) === "score") addScoreRow("");
    else addChoiceRow({ key: "", description: "" });
    queueSave();
  });
  form.addEventListener("input", queueSave);
  form.addEventListener("click", (event) => {
    const removeChoice = event.target.closest("[data-criterion-remove]");
    if (removeChoice && selected?.status !== "published") {
      const row = removeChoice.closest("[data-functions-criterion]");
      if (criteriaEl.querySelectorAll("[data-functions-criterion]").length < 3) {
        showNote(L("Choice 至少需要两个选项"), true);
        return;
      }
      row.remove();
      queueSave();
      return;
    }
    const removeScore = event.target.closest("[data-score-remove]");
    if (removeScore && selected?.status !== "published") {
      if (criteriaEl.querySelectorAll("[data-score-level]").length < 3) {
        showNote(L("Score 至少需要两个档位"), true);
        return;
      }
      removeScore.closest(".functions-criterion").remove();
      [...criteriaEl.querySelectorAll("[data-score-index]")].forEach((node, index) => { node.textContent = String(index); });
      queueSave();
    }
  });
  samplesEl.addEventListener("click", async (event) => {
    const load = event.target.closest("[data-sample-load]");
    const remove = event.target.closest("[data-sample-remove]");
    const row = event.target.closest("[data-sample-id]");
    if (!row || !selected) return;
    const sample = (selected.samples || []).find((item) => item.id === row.dataset.sampleId);
    if (load && sample) previewInput.value = sample.input || "";
    if (remove) {
      try {
        const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/samples/delete", {
          sample_id: row.dataset.sampleId,
        });
        remember(payload.function);
      } catch (error) {
        showNote(error.message, true);
      }
    }
  });
  workbench.querySelector("[data-functions-save-sample]").addEventListener("click", async () => {
    if (!selected) return;
    try {
      await saveDraft();
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/samples", {
        input: previewInput.value,
      });
      remember(payload.function);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  rowsEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    const record = records.find((item) => item.id === row.dataset.functionId);
    if (record) fillEditor(record);
  });
  workbench.querySelector("[data-functions-preview]").addEventListener("click", async () => {
    if (!selected) return;
    showNote(L("正在请求 TypeSafe，可能计费。"), false);
    try {
      await saveDraft();
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/preview", {
        input: previewInput.value,
      });
      remember(payload.function);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  publishBtn.addEventListener("click", async () => {
    if (!selected) return;
    showNote("", false);
    try {
      await saveDraft();
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/publish", {});
      remember(payload.function);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
