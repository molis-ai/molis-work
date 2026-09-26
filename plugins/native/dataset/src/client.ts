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
  let editRevision = 0;
  let savedRevision = 0;
  let savePromise = null;
  let saveError = null;
  let busy = false;
  let aiAvailable = false;
  let aiUnavailableReason = "";
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
    if (!response.ok) {
      const error = new Error(payload.code === "dataset.conflict" ? L("数据表已在别处修改，当前输入已保留。请复制需要保留的内容，再重新读取。") : payload.error || L("数据表请求失败"));
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
  const paintStatus = (record) => {
    const ready = record.status === "ready";
    statusEl.className = "mw-status mw-status--" + (saveError ? "blocked" : ready ? "done" : "quiet");
    statusEl.textContent = saveError ? L("保存失败") : savePromise ? L("保存中") : editRevision > savedRevision ? L("尚未保存") : busy ? L("处理中") : L("已保存");
    const pending = workbench.querySelector("[data-dataset-publication-note]");
    pending.hidden = !record.publication_pending;
    pending.textContent = record.publication_pending ? L("上次发布尚未完成。恢复发布会使用上次的固定内容；后续修改可另存一版。") : "";
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
    cells: Object.fromEntries([...row.querySelectorAll("[data-cell]")].map((input) => {
      const previous = selected?.rows.find((item) => item.id === row.dataset.rowId)?.cells[input.dataset.columnId];
      // Textareas normalize line endings; preserve unchanged CSV bytes.
      const value = typeof previous === "string" && previous.replace(/\\r\\n?/g, "\\n") === input.value ? previous : input.value;
      return [input.dataset.columnId, value];
    })),
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
        + '</select><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-column-remove aria-label="' + L("删列") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button></div>';
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
        const value = row.cells?.[column.id] ?? "";
        let input = document.createElement(column.type === "text" ? "textarea" : "input");
        if (input.tagName === "INPUT") {
          input.type = column.type === "number" ? "number" : "date";
          input.value = value;
          // Existing cells are strings, including values a date/number input cannot represent.
          if (input.value !== value) input = document.createElement("textarea");
        }
        input.className = "mw-input";
        input.dataset.cell = "true";
        input.dataset.columnId = column.id;
        if (input.tagName === "TEXTAREA") input.rows = Math.min(4, value.split("\\n").length);
        input.value = value;
        td.append(input);
        tr.append(td);
      });
      const remove = document.createElement("td");
      remove.innerHTML = '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-row-remove aria-label="' + L("删行") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button>';
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
    editRevision = savedRevision = 0;
    saveError = null;
    showNote("", false);
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
    editRevision = savedRevision = 0;
    saveError = null;
    editorSeq += 1;
    selected = null;
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
    aiAvailable = payload.ai_available === true;
    aiUnavailableReason = payload.ai_unavailable_reason || "";
    paintAiAvailability();
    // A directory refresh must not advance the editor's acknowledged version.
  };
  const paintAiAvailability = () => {
    const button = workbench.querySelector("[data-dataset-generate-ai]");
    button.disabled = !aiAvailable;
    const reason = workbench.querySelector("[data-dataset-ai-reason]");
    reason.hidden = aiAvailable;
    reason.textContent = aiUnavailableReason || L("当前没有可用的文字模型，请检查模型设置和服务连接。");
  };
  const draftFromDom = () => {
    const columns = columnsFromDom();
    const rows = mergeDatasetDraftRows(selected?.rows || [], rowsFromDom(), columns, renderedFilter);
    return { title: titleInput.value, description: descriptionInput.value, columns, rows };
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
          const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id), {
            ...draft, expected_version: selected.version,
          });
          // Preserve edits made while the previous request was in flight.
          const laterDraft = editRevision > revision ? draftFromDom() : null;
          savedRevision = revision;
          remember(laterDraft ? { ...payload.dataset, ...laterDraft } : payload.dataset, false);
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
    editRevision += 1;
    if (selected) paintStatus(selected);
    clearTimeout(saveTimer);
    if (!saveError) saveTimer = setTimeout(() => { void save().catch((error) => showNote(error.message || L("保存失败"), true)); }, 400);
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
    if (!button || button.closest("dialog") || button.disabled || busy) return;
    setBusy(true);
    try {
      if (button.closest("[data-dataset-reload]") && selected) {
        clearTimeout(saveTimer);
        if (savePromise) await savePromise.catch(() => {});
        if ((saveError || editRevision > savedRevision) && !await ask(L("重新读取会丢弃当前未保存的输入。继续吗？"), L("重新读取"))) return;
        const payload = await request("GET", "/api/plugins/dataset/" + encodeURIComponent(selected.id));
        await fillEditor(payload.dataset);
        await loadList();
        return;
      }
      const create = event.target.closest("[data-dataset-new]");
      if (create) {
        await save();
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
          await save();
        }
        const record = selected?.id === id ? selected : records.find((item) => item.id === id);
        let payload;
        try {
          payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(id) + "/promote", { expected_version: record.version });
        } catch (error) {
          if (error.code !== "dataset.conflict") {
            // Publication may have reached Artifact storage before association failed.
            const fresh = await request("GET", "/api/plugins/dataset/" + encodeURIComponent(id)).catch(() => null);
            if (fresh && selected?.id === id) remember(fresh.dataset, false);
            await loadList().catch(() => {});
          }
          throw error;
        }
        showNote(L("已保存成果版本"), false);
        await loadList();
        if (payload.dataset && selected && selected.id === payload.dataset.id) remember(payload.dataset, false);
        return;
      }
      const row = event.target.closest("[data-dataset-id]");
      if (row) {
        await save();
        const payload = await request("GET", "/api/plugins/dataset/" + encodeURIComponent(row.dataset.datasetId));
        await fillEditor(payload.dataset);
        return;
      }
      if (event.target.closest("[data-dataset-back]")) {
        await save();
        closeEditor();
        await loadList();
        return;
      }
      if (event.target.closest("[data-dataset-add-column]") && selected) {
        const draft = draftFromDom();
        draft.columns.push({
          id: "col-" + crypto.randomUUID(),
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
        draft.rows.push({ id: "row-" + crypto.randomUUID(), cells: Object.fromEntries(draft.columns.map((column) => [column.id, ""])) });
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
      if (event.target.closest("[data-dataset-generate], [data-dataset-generate-ai]") && selected) {
        await save();
        const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + (button.matches("[data-dataset-generate-ai]") ? "/generate-ai-column" : "/generate-column"), {
          prompt: aiPrompt.value, expected_version: selected.version,
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
          csv: csvInput.value, expected_version: selected.version,
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
          note: versionNote.value, expected_version: selected.version,
        });
        versionNote.value = "";
        const payload = await request("GET", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/versions");
        renderVersions(payload.versions || []);
        showNote(L("已保存版本"), false);
        return;
      }
      const rollback = event.target.closest("[data-dataset-rollback]");
      if (rollback && selected) {
        await save();
        const payload = await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/rollback", {
          version_id: rollback.closest("[data-version-id]").dataset.versionId, expected_version: selected.version,
        });
        await fillEditor(payload.dataset);
        showNote(L("已回滚"), false);
        await loadList();
        return;
      }
      if (event.target.closest("[data-dataset-delete]") && selected) {
        if (!await ask(L("删除这张表？版本记录也会一起删掉。"), L("删除"))) return;
        await save();
        await request("POST", "/api/plugins/dataset/" + encodeURIComponent(selected.id) + "/delete", { expected_version: selected.version });
        closeEditor();
        await loadList();
      }
    } catch (error) {
      if (error.code === "dataset.conflict") saveError = error;
      showNote(error.message || L("数据表请求失败"), true);
    } finally {
      setBusy(false);
    }
  });
  workbench.addEventListener("input", (event) => {
    if (busy) return;
    if (event.target === filterInput && selected) {
      selected = { ...selected, ...draftFromDom() };
      renderTable(selected);
      return;
    }
    if (event.target.closest("[data-dataset-csv], [data-dataset-ai-prompt], [data-dataset-version-note], [data-dataset-filter], [data-dataset-column-name], [data-dataset-column-type]")) return;
    if (event.target.closest(".dataset-workspace")) queueSave();
  });
  workbench.addEventListener("change", (event) => {
    if (busy || !selected || !event.target.closest("[data-column-type]")) return;
    selected = { ...selected, ...draftFromDom() };
    renderTable(selected);
    queueSave();
  });
  window.addEventListener("beforeunload", (event) => {
    if (selected && (saveError || editRevision > savedRevision)) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  void loadList().catch((error) => showNote(error.message, true));
}
`;
