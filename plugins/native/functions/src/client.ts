/** Functions workbench client: list, edit Choice drafts, preview, publish v1. */
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
  const form = workbench.querySelector("[data-functions-editor]");
  const nameInput = workbench.querySelector("[data-functions-name]");
  const keyInput = workbench.querySelector("[data-functions-key]");
  const instructionsInput = workbench.querySelector("[data-functions-instructions]");
  const criteriaEl = workbench.querySelector("[data-functions-criteria]");
  const previewInput = workbench.querySelector("[data-functions-preview-input]");
  const note = workbench.querySelector("[data-functions-note]");
  const lastPreview = workbench.querySelector("[data-functions-last-preview]");
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
  const criteriaFromForm = () => [...criteriaEl.querySelectorAll("[data-functions-criterion]")].map((row) => ({
    key: row.querySelector("[data-criterion-key]").value.trim(),
    description: row.querySelector("[data-criterion-description]").value.trim(),
  }));
  const addCriterionRow = (item) => {
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
  const renderPreview = (record) => {
    const preview = record?.last_preview;
    if (!preview) {
      lastPreview.hidden = true;
      lastPreview.textContent = "";
      if (record && !previewInput.value) previewInput.value = "";
      return;
    }
    if (!previewInput.value) previewInput.value = preview.input || "";
    lastPreview.hidden = false;
    lastPreview.textContent = [
      preview.outcome === "needs_review" ? L("需要复核") : L("已选出") + " " + (preview.choice || ""),
      preview.model ? "model " + preview.model : "",
      Object.entries(preview.probabilities || {}).map(([key, value]) => key + " " + Number(value).toFixed(3)).join("\\n"),
    ].filter(Boolean).join("\\n");
  };
  const fillEditor = (record) => {
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
    criteriaEl.replaceChildren();
    (record.criteria && record.criteria.length ? record.criteria : [{ key: "yes", description: "" }, { key: "no", description: "" }]).forEach(addCriterionRow);
    criteriaEl.querySelectorAll("input, button").forEach((node) => { node.disabled = locked; });
    renderPreview(record);
    showNote("", false);
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
      row.innerHTML = "<strong></strong><small></small>";
      row.querySelector("strong").textContent = record.name;
      row.querySelector("small").textContent = record.status === "published" ? record.function_key + " · v" + (record.version || 1) : record.function_key + " · " + L("草稿");
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

  workbench.querySelector("[data-functions-new]").addEventListener("click", async () => {
    showNote("", false);
    try {
      const payload = await request("POST", "/api/functions", { name: L("未命名函数") });
      records = [payload.function, ...records];
      renderList();
      fillEditor(payload.function);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  workbench.querySelector("[data-functions-back]").addEventListener("click", () => closeEditor());
  workbench.querySelector("[data-functions-add-criterion]").addEventListener("click", () => {
    if (selected?.status === "published") return;
    addCriterionRow({ key: "", description: "" });
    queueSave();
  });
  form.addEventListener("input", queueSave);
  form.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-criterion-remove]");
    if (!remove || selected?.status === "published") return;
    const row = remove.closest("[data-functions-criterion]");
    if (criteriaEl.querySelectorAll("[data-functions-criterion]").length < 3) {
      showNote(L("Choice 至少需要两个选项"), true);
      return;
    }
    row.remove();
    queueSave();
  });
  rowsEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    const record = records.find((item) => item.id === row.dataset.functionId);
    if (record) fillEditor(record);
  });
  workbench.querySelector("[data-functions-preview]").addEventListener("click", async () => {
    if (!selected) return;
    showNote("", false);
    try {
      await saveDraft();
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/preview", {
        input: previewInput.value,
      });
      selected = payload.function;
      records = records.map((item) => item.id === selected.id ? selected : item);
      renderList();
      fillEditor(selected);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  workbench.querySelector("[data-functions-publish]").addEventListener("click", async () => {
    if (!selected) return;
    showNote("", false);
    try {
      await saveDraft();
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/publish", {});
      selected = payload.function;
      records = records.map((item) => item.id === selected.id ? selected : item);
      renderList();
      fillEditor(selected);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
