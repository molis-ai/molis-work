/** Dataset workbench client: columns, rows, CSV, versions. */
import { mergeDatasetDraftRows } from "./row-merge.js";

export const DATASET_CLIENT_FACTORY_SCRIPT = `(host) => {
  const mergeDatasetDraftRows = ${mergeDatasetDraftRows.toString()};
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
  const filterEmpty = workbench.querySelector("[data-dataset-filter-empty]");
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
  let saveSeq = 0;
  let editorSeq = 0;
  let listSeq = 0;
  let renderedFilter = "";
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
    if (!response.ok) throw new Error(payload.error || L("数据表请求失败"));
    return payload;
  };
  const showNote = (text, isError) => {
    if (!note) return;
    note.hidden = !text;
    note.textContent = text || "";
    note.classList.toggle("is-error", Boolean(isError && text));
  };
  const arrive = (node) => {
    if (!node) return node;
    node.classList.remove("is-arriving");
    void node.offsetWidth;
    node.classList.add("is-arriving");
    return node;
  };
  const paintStatus = (record) => {
    const ready = record.status === "ready";
    statusEl.className = "mw-status mw-status--" + (ready ? "done" : "quiet");
    statusEl.textContent = ready ? L("已就绪") : L("草稿");
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
      if (filterEmpty) filterEmpty.hidden = true;
      renderedFilter = filterInput.value;
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
    const noMatch = Boolean(query && !tbody.childElementCount);
    tableEl.hidden = noMatch;
    if (filterEmpty) filterEmpty.hidden = !noMatch;
    renderedFilter = filterInput.value;
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
    list.querySelectorAll("[data-dataset-id]").forEach((row) => {
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
    paintStatus(record);
    markSelected(record.id);
    if (redraw) {
      if (document.activeElement !== titleInput) titleInput.value = record.title;
      if (document.activeElement !== descriptionInput) descriptionInput.value = record.description || "";
      renderTable(record);
    }
  };
  const fillEditor = async (record) => {
    clearTimeout(saveTimer);
    saveSeq += 1;
    const seq = ++editorSeq;
    const opening = workspace.hidden;
    workbench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    if (opening) arrive(workspace);
    titleInput.value = record.title;
    descriptionInput.value = record.description || "";
    remember(record, true);
    const payload = await request("GET", "/api/plugins/dataset/" + encodeURIComponent(record.id) + "/versions");
    if (seq !== editorSeq) return;
    renderVersions(payload.versions || []);
  };
  const closeEditor = () => {
    clearTimeout(saveTimer);
    saveSeq += 1;
    editorSeq += 1;
    selected = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const artifactLabel = (record) => record && record.artifact_version > 0 ? L("再存一版") : L("存成 Artifact");
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
      row.dataset.datasetId = record.id;
      row.setAttribute("aria-selected", String(selected?.id === record.id));
      const leading = document.createElement("span");
      leading.className = "feed-stage-leading";
      const title = document.createElement("strong");
      title.title = record.title;
      title.textContent = record.title;
      leading.append(title);
      const ready = record.status === "ready";
      const status = document.createElement("span");
      status.className = "mw-status mw-status--" + (ready ? "done" : "quiet") + " feed-entry-status";
      status.textContent = ready ? L("已就绪") : L("草稿");
      row.append(
        leading,
        kindChip("dataset", L("数据表")),
        textCell("plugin-stage-fact", (record.columns || []).length + " × " + (record.rows || []).length),
        textCell("plugin-stage-meta", firstLine(record.description)),
        status,
      );
      item.append(row, artifactControl(record, "datasetArtifact"));
      rowsEl.append(item);
    });
    const bar = workbench.querySelector("[data-dataset-artifact-bar]");
    if (bar) bar.textContent = artifactLabel(selected);
  };
  const loadList = async () => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/plugins/dataset");
    if (seq !== listSeq) return;
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
    const rows = mergeDatasetDraftRows(selected?.rows || [], rowsFromDom(), columns, renderedFilter);
    return { title: titleInput.value, description: descriptionInput.value, columns, rows };
  };
  const save = async () => {
    if (!selected) return selected;
    const seq = ++saveSeq;
    const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id), draftFromDom());
    if (seq !== saveSeq) return selected;
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
        const payload = await request("POST", "/api/plugins/dataset", {});
        await loadList();
        await fillEditor(payload.dataset);
        return;
      }
      const artifact = event.target.closest("[data-dataset-artifact]");
      if (artifact) {
        const id = artifact.dataset.datasetArtifact || (selected && selected.id);
        if (!id) return;
        if (selected && selected.id === id) {
          await save().catch((error) => showNote(error.message || L("保存失败"), true));
        }
        const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(id) + "/promote", {});
        showNote(L("已存成 Artifact"), false);
        await loadList();
        if (payload.dataset && selected && selected.id === payload.dataset.id) remember(payload.dataset, false);
        return;
      }
      const row = event.target.closest("[data-dataset-id]");
      if (row) {
        const record = records.find((item) => item.id === row.dataset.datasetId);
        if (record) await fillEditor(record);
        return;
      }
      if (event.target.closest("[data-dataset-back]")) {
        await save().catch((error) => showNote(error.message || L("保存失败"), true));
        closeEditor();
        await loadList();
        return;
      }
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
        const columns = tableEl.querySelectorAll("[data-dataset-column]");
        arrive(columns[columns.length - 1]);
        queueSave();
        return;
      }
      if (event.target.closest("[data-dataset-add-row]") && selected) {
        const draft = draftFromDom();
        draft.rows.push({ id: "row-" + Date.now(), cells: Object.fromEntries(draft.columns.map((column) => [column.id, ""])) });
        selected = { ...selected, ...draft };
        renderTable(selected);
        arrive(tableEl.querySelector("[data-dataset-row]:last-child"));
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
        const row = event.target.closest("[data-dataset-row]");
        const id = row.dataset.rowId;
        row.remove();
        selected = {
          ...selected,
          rows: mergeDatasetDraftRows(
            (selected.rows || []).filter((item) => item.id !== id),
            rowsFromDom(),
            columnsFromDom(),
            renderedFilter,
          ),
        };
        if (filterEmpty) {
          const query = (filterInput.value || "").trim();
          const noMatch = Boolean(query && !tableEl.querySelector("[data-dataset-row]"));
          filterEmpty.hidden = !noMatch;
          tableEl.hidden = noMatch;
        }
        queueSave();
        return;
      }
      if (event.target.closest("[data-dataset-generate]") && selected) {
        await save();
        const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/generate-column", {
          prompt: aiPrompt.value,
        });
        await fillEditor(payload.dataset);
        aiPrompt.value = "";
        await loadList();
        return;
      }
      if (event.target.closest("[data-dataset-import]") && selected) {
        if (!await ask(L("导入会覆盖当前表格的列和行。确定吗？"), L("导入"))) return;
        await save();
        const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/import-csv", {
          csv: csvInput.value,
        });
        await fillEditor(payload.dataset);
        csvInput.value = "";
        await loadList();
        return;
      }
      if (event.target.closest("[data-dataset-export-csv]") && selected) {
        await save();
        const payload = await request("GET", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/export");
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
        await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/versions", {
          note: versionNote.value,
        });
        versionNote.value = "";
        const payload = await request("GET", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/versions");
        renderVersions(payload.versions || []);
        showNote(L("已保存版本"), false);
        return;
      }
      const rollback = event.target.closest("[data-dataset-rollback]");
      if (rollback && selected) {
        const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/rollback", {
          version_id: rollback.closest("[data-version-id]").dataset.versionId,
        });
        await fillEditor(payload.dataset);
        showNote(L("已回滚"), false);
        await loadList();
        return;
      }
      if (event.target.closest("[data-dataset-delete]") && selected) {
        if (!await ask(L("删除这张表？版本记录也会一起删掉。"), L("删除"))) return;
        await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/delete");
        closeEditor();
        await loadList();
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
    if (event.target.closest("[data-dataset-csv], [data-dataset-ai-prompt], [data-dataset-version-note], [data-dataset-filter]")) return;
    if (event.target.closest(".dataset-workspace")) queueSave();
  });
  workbench.addEventListener("change", (event) => {
    if (!selected || !event.target.closest("[data-column-type]")) return;
    const select = event.target.closest("[data-column-type]");
    const columnId = select.closest("[data-dataset-column]").dataset.columnId;
    const type = select.value;
    tableEl.querySelectorAll('[data-cell][data-column-id="' + columnId + '"]').forEach((input) => {
      input.type = type === "number" ? "number" : type === "date" ? "date" : "text";
    });
    selected = { ...selected, ...draftFromDom() };
    queueSave();
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
