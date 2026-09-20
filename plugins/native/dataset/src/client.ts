/** Dataset workbench client: columns, rows, CSV, versions. */
export const DATASET_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L } = host;
  const workbench = document.querySelector("[data-dataset=workbench]");
  if (!workbench) return;
  const list = workbench.querySelector("[data-dataset=directory]");
  const rowsEl = workbench.querySelector("[data-dataset-rows]");
  const empty = workbench.querySelector("[data-dataset-empty]");
  const workspace = workbench.querySelector("[data-dataset-stage-workspace]");
  const titleEl = workbench.querySelector("[data-dataset-editor-title]");
  const statusEl = workbench.querySelector("[data-dataset-editor-status]");
  const titleInput = workbench.querySelector("[data-dataset-title]");
  const descriptionInput = workbench.querySelector("[data-dataset-description]");
  const tableEl = workbench.querySelector("[data-dataset-table]");
  const tableEmpty = workbench.querySelector("[data-dataset-table-empty]");
  const filterInput = workbench.querySelector("[data-dataset-filter]");
  const columnName = workbench.querySelector("[data-dataset-column-name]");
  const columnType = workbench.querySelector("[data-dataset-column-type]");
  const aiPrompt = workbench.querySelector("[data-dataset-ai-prompt]");
  const csvInput = workbench.querySelector("[data-dataset-csv]");
  const note = workbench.querySelector("[data-dataset-note]");
  const versionsEl = workbench.querySelector("[data-dataset-versions]");
  const versionNote = workbench.querySelector("[data-dataset-version-note]");
  const confirmDialog = workbench.querySelector("[data-dataset-confirm]");
  let records = [];
  let selected = null;
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
    if (!response.ok) throw new Error(payload.error || L("数据表请求失败"));
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
  const download = (filename, text, type) => {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  const columnsFromDom = () => [...tableEl.querySelectorAll("[data-dataset-column]")].map((cell, index) => ({
    id: cell.dataset.columnId,
    name: cell.querySelector("[data-column-name]").value.trim() || L("列") + " " + (index + 1),
    type: cell.querySelector("[data-column-type]").value,
    order: index + 1,
  }));
  const rowsFromDom = () => [...tableEl.querySelectorAll("[data-dataset-row]")].map((row) => ({
    id: row.dataset.rowId,
    cells: Object.fromEntries([...row.querySelectorAll("[data-cell]")].map((input) => [input.dataset.columnId, input.value])),
  }));
  const renderTable = (record) => {
    const columns = record.columns || [];
    if (!columns.length) {
      tableEl.replaceChildren();
      tableEl.hidden = true;
      if (tableEmpty) tableEmpty.hidden = false;
      return;
    }
    tableEl.hidden = false;
    if (tableEmpty) tableEmpty.hidden = true;
    const query = (filterInput.value || "").trim().toLowerCase();
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    columns.forEach((column) => {
      const th = document.createElement("th");
      th.dataset.datasetColumn = "true";
      th.dataset.columnId = column.id;
      th.innerHTML = '<div class="dataset-col-head"><input class="mw-input" data-column-name autocomplete="off">'
        + '<select class="mw-select dataset-col-type" data-column-type>'
        + '<option value="text">' + L("文字") + '</option>'
        + '<option value="number">' + L("数字") + '</option>'
        + '<option value="date">' + L("日期") + '</option>'
        + '</select><button class="mw-btn mw-btn--ghost" type="button" data-column-remove aria-label="' + L("删列") + '">×</button></div>';
      th.querySelector("[data-column-name]").value = column.name || "";
      th.querySelector("[data-column-type]").value = column.type || "text";
      headRow.append(th);
    });
    headRow.append(document.createElement("th"));
    thead.append(headRow);
    const tbody = document.createElement("tbody");
    (record.rows || []).forEach((row) => {
      const match = !query || columns.some((column) => String(row.cells?.[column.id] ?? "").toLowerCase().includes(query));
      if (!match) return;
      const tr = document.createElement("tr");
      tr.dataset.datasetRow = "true";
      tr.dataset.rowId = row.id;
      columns.forEach((column) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.className = "mw-input";
        input.dataset.cell = "true";
        input.dataset.columnId = column.id;
        input.type = column.type === "number" ? "number" : column.type === "date" ? "date" : "text";
        input.value = row.cells?.[column.id] ?? "";
        td.append(input);
        tr.append(td);
      });
      const remove = document.createElement("td");
      remove.innerHTML = '<button class="mw-btn mw-btn--ghost" type="button" data-row-remove>×</button>';
      tr.append(remove);
      tbody.append(tr);
    });
    tableEl.replaceChildren(thead, tbody);
  };
  const renderVersions = (versions) => {
    versionsEl.replaceChildren();
    (versions || []).forEach((item) => {
      const row = document.createElement("div");
      row.className = "dataset-version";
      row.dataset.versionId = item.id;
      const label = document.createElement("span");
      label.textContent = (item.note || L("快照")) + " · " + item.created_at.slice(0, 19).replace("T", " ");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mw-btn mw-btn--ghost";
      button.dataset.datasetRollback = "true";
      button.textContent = L("回滚");
      row.append(label, button);
      versionsEl.append(row);
    });
  };
  const markSelected = (id) => {
    list.querySelectorAll(".dataset-row").forEach((row) => {
      const on = row.dataset.datasetId === id;
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
    statusEl.textContent = record.status === "ready" ? L("已就绪") : L("草稿");
    markSelected(record.id);
    if (redraw) {
      if (document.activeElement !== titleInput) titleInput.value = record.title;
      if (document.activeElement !== descriptionInput) descriptionInput.value = record.description || "";
      renderTable(record);
    }
  };
  const fillEditor = async (record) => {
    clearTimeout(saveTimer);
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleInput.value = record.title;
    descriptionInput.value = record.description || "";
    remember(record, true);
    const payload = await request("GET", "/api/dataset/" + encodeURIComponent(record.id) + "/versions");
    renderVersions(payload.versions || []);
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    selected = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
  };
  const renderList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "dataset-row" + (selected?.id === record.id ? " is-selected" : "");
      row.dataset.datasetId = record.id;
      const title = document.createElement("strong");
      title.textContent = record.title;
      const meta = document.createElement("small");
      meta.textContent = (record.columns || []).length + " × " + (record.rows || []).length;
      row.append(title, meta);
      rowsEl.append(row);
    });
  };
  const loadList = async () => {
    const payload = await request("GET", "/api/dataset");
    records = payload.datasets || [];
    renderList();
    if (selected) {
      const next = records.find((item) => item.id === selected.id);
      if (next) remember(next, false);
      else closeEditor();
    }
  };
  const draftFromDom = () => {
    const columns = columnsFromDom();
    const visible = new Map(rowsFromDom().map((row) => [row.id, row]));
    const rows = [];
    const seen = new Set();
    (selected?.rows || []).forEach((row) => {
      seen.add(row.id);
      rows.push(visible.get(row.id) || row);
    });
    visible.forEach((row, id) => {
      if (!seen.has(id)) rows.push(row);
    });
    return { title: titleInput.value, description: descriptionInput.value, columns, rows };
  };
  const save = async () => {
    if (!selected) return selected;
    const payload = await request("POST", "/api/dataset/" + encodeURIComponent(selected.id), draftFromDom());
    remember(payload.dataset, false);
    return selected;
  };
  const queueSave = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
  };

  workbench.addEventListener("click", async (event) => {
    try {
      const create = event.target.closest("[data-dataset-new]");
      if (create) {
        const payload = await request("POST", "/api/dataset", {});
        await fillEditor(payload.dataset);
        return;
      }
      const row = event.target.closest(".dataset-row");
      if (row) {
        const record = records.find((item) => item.id === row.dataset.datasetId);
        if (record) await fillEditor(record);
        return;
      }
      if (event.target.closest("[data-dataset-back]")) { closeEditor(); return; }
      if (event.target.closest("[data-dataset-add-column]") && selected) {
        const draft = draftFromDom();
        draft.columns.push({
          id: "col-" + Date.now(),
          name: columnName.value.trim() || L("列") + " " + (draft.columns.length + 1),
          type: columnType.value,
          order: draft.columns.length + 1,
        });
        columnName.value = "";
        selected = { ...selected, ...draft };
        renderTable(selected);
        queueSave();
        return;
      }
      if (event.target.closest("[data-dataset-add-row]") && selected) {
        const draft = draftFromDom();
        draft.rows.push({ id: "row-" + Date.now(), cells: Object.fromEntries(draft.columns.map((column) => [column.id, ""])) });
        selected = { ...selected, ...draft };
        renderTable(selected);
        queueSave();
        return;
      }
      if (event.target.closest("[data-column-remove]") && selected) {
        event.target.closest("[data-dataset-column]").remove();
        const draft = draftFromDom();
        selected = { ...selected, ...draft };
        renderTable(selected);
        queueSave();
        return;
      }
      if (event.target.closest("[data-row-remove]") && selected) {
        event.target.closest("[data-dataset-row]").remove();
        queueSave();
        return;
      }
      if (event.target.closest("[data-dataset-generate]") && selected) {
        await save();
        const payload = await request("POST", "/api/dataset/" + encodeURIComponent(selected.id) + "/generate-column", {
          prompt: aiPrompt.value,
        });
        await fillEditor(payload.dataset);
        aiPrompt.value = "";
        return;
      }
      if (event.target.closest("[data-dataset-import]") && selected) {
        if (!await ask(L("导入会覆盖当前表格的列和行。确定吗？"), L("导入"))) return;
        await save();
        const payload = await request("POST", "/api/dataset/" + encodeURIComponent(selected.id) + "/import-csv", {
          csv: csvInput.value,
        });
        await fillEditor(payload.dataset);
        csvInput.value = "";
        return;
      }
      if (event.target.closest("[data-dataset-export-csv]") && selected) {
        await save();
        const payload = await request("GET", "/api/dataset/" + encodeURIComponent(selected.id) + "/export");
        download((selected.title || "dataset") + ".csv", payload.csv || "", "text/csv;charset=utf-8");
        return;
      }
      if (event.target.closest("[data-dataset-export-json]") && selected) {
        await save();
        download((selected.title || "dataset") + ".json", JSON.stringify(selected, null, 2), "application/json");
        return;
      }
      if (event.target.closest("[data-dataset-snapshot]") && selected) {
        await save();
        await request("POST", "/api/dataset/" + encodeURIComponent(selected.id) + "/versions", {
          note: versionNote.value,
        });
        versionNote.value = "";
        const payload = await request("GET", "/api/dataset/" + encodeURIComponent(selected.id) + "/versions");
        renderVersions(payload.versions || []);
        showNote(L("已保存版本"), false);
        return;
      }
      const rollback = event.target.closest("[data-dataset-rollback]");
      if (rollback && selected) {
        const payload = await request("POST", "/api/dataset/" + encodeURIComponent(selected.id) + "/rollback", {
          version_id: rollback.closest("[data-version-id]").dataset.versionId,
        });
        await fillEditor(payload.dataset);
        showNote(L("已回滚"), false);
        return;
      }
      if (event.target.closest("[data-dataset-delete]") && selected) {
        if (!await ask(L("删除这张表？版本记录也会一起删掉。"), L("删除"))) return;
        await request("POST", "/api/dataset/" + encodeURIComponent(selected.id) + "/delete");
        records = records.filter((item) => item.id !== selected.id);
        closeEditor();
        renderList();
      }
    } catch (error) {
      showNote(error.message || L("数据表请求失败"), true);
    }
  });
  workbench.addEventListener("input", (event) => {
    if (event.target === filterInput && selected) {
      selected = { ...selected, ...draftFromDom() };
      renderTable(selected);
      return;
    }
    if (event.target.closest("[data-dataset-csv], [data-dataset-ai-prompt], [data-dataset-version-note], [data-dataset-column-name], [data-dataset-filter]")) return;
    if (event.target.closest(".dataset-workspace")) queueSave();
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
