/** Runs inside the Pages client factory and shares its editor/list helpers. */
export const PAGES_IMPORT_CLIENT_SCRIPT = String.raw`
  const importDialog = workbench.querySelector("[data-pages-import-dialog]");
  const importFilesInput = importDialog.querySelector("[data-pages-import-files]");
  const importSource = importDialog.querySelector("[data-pages-import-source]");
  const importFolder = importDialog.querySelector("[data-pages-import-folder]");
  const importPreview = importDialog.querySelector("[data-pages-import-preview]");
  const importDocuments = importDialog.querySelector("[data-pages-import-documents]");
  const importStatus = importDialog.querySelector("[data-pages-import-status]");
  const importSubmit = importDialog.querySelector("[data-pages-import-submit]");
  const importOpen = importDialog.querySelector("[data-pages-import-open]");
  const importClose = importDialog.querySelector("[data-pages-import-close]");
  const importAll = importDialog.querySelector("[data-pages-import-all]");
  const importDrop = importDialog.querySelector("[data-pages-import-drop]");
  let importFiles = [];
  let importBusy = false;
  let importBlocked = false;
  let importFinished = [];
  let importSubmission = null;
  let importProject = "";
  let importPrefix = "";
  const importMessage = (text, error = false) => {
    importStatus.textContent = text;
    importStatus.classList.toggle("is-error", error);
  };
  const importHelp = () => {
    const help = importSource.value === "notion"
      ? "在 Notion 的页面菜单中导出为 Markdown & CSV 或 HTML，可包含子页面；直接选择下载的 ZIP。"
      : importSource.value === "feishu"
        ? "在飞书文档菜单中下载为 Word（.docx）或 Markdown，再选择导出的文件。"
        : "从原工具导出为 Word（.docx）、Markdown、HTML 或纯文本；CSV 会导入为文档中的表格。";
    importDialog.querySelector("[data-pages-import-help]").textContent = L(help);
  };
  const importChecks = () => [...importDocuments.querySelectorAll("input[type=checkbox]")];
  const syncImportControls = () => {
    const checks = importChecks();
    const count = checks.filter((input) => input.checked).length;
    const locked = importBusy || Boolean(importSubmission) || importFinished.length > 0;
    [importFilesInput, importSource, importFolder, importAll, ...checks].forEach((input) => { input.disabled = locked; });
    importAll.checked = checks.length > 0 && count === checks.length;
    importAll.indeterminate = count > 0 && count < checks.length;
    importSubmit.disabled = importBusy || importBlocked || count === 0 || importFinished.length > 0;
    importSubmit.hidden = importFinished.length > 0;
    importSubmit.textContent = importBusy ? L("正在处理") : L("导入所选文档") + (count ? " (" + count + ")" : "");
    importOpen.hidden = importFinished.length === 0;
    importClose.disabled = importBusy;
    importClose.textContent = importFinished.length ? L("完成") : importBlocked ? L("关闭") : L("取消");
    importDialog.setAttribute("aria-busy", String(importBusy));
  };
  const importRequest = async (path, body) => {
    if (projectId() !== importProject || routePrefix() !== importPrefix) throw new Error(L("项目已切换，请在目标项目重新打开导入。"));
    const response = await fetch(importPrefix + "/api/plugins/pages/import" + path + "?project_id=" + encodeURIComponent(importProject), {
      method: "POST", headers: headers(), body: JSON.stringify({ ...body, project_id: importProject }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || L("导入失败，请检查文件后重试。"));
      error.status = response.status;
      throw error;
    }
    return payload;
  };
  const appendImportWarnings = (container, warnings) => {
    container.replaceChildren();
    for (const warning of warnings || []) {
      const li = document.createElement("li"); li.textContent = warning; container.append(li);
    }
    container.hidden = !container.childElementCount;
  };
  const importText = (node) => {
    if (node?.type === "text") return node.text || "";
    return (node?.content || []).map(importText).join(node?.type === "doc" ? "\n" : " ");
  };
  const showImportPreview = (payload) => {
    importDocuments.replaceChildren();
    appendImportWarnings(importDialog.querySelector("[data-pages-import-warnings]"), payload.warnings);
    for (const doc of payload.documents || []) {
      const card = document.createElement("section"); card.className = "pages-import-document";
      const label = document.createElement("label");
      const check = document.createElement("input"); check.type = "checkbox"; check.checked = true; check.value = doc.key;
      const title = document.createElement("strong"); title.textContent = doc.title;
      label.append(check, title); card.append(label);
      const source = document.createElement("small"); source.textContent = doc.name; card.append(source);
      const warnings = document.createElement("ul"); warnings.className = "pages-import-warnings";
      appendImportWarnings(warnings, doc.warnings); card.append(warnings);
      const details = document.createElement("details");
      const summary = document.createElement("summary"); summary.textContent = L("预览正文");
      const content = document.createElement("div"); content.className = "pages-import-body";
      // Plain text preview never inserts source HTML or follows imported links.
      const text = importText(doc.body); content.textContent = text.slice(0, 4000) + (text.length > 4000 ? "…" : "");
      details.append(summary, content); card.append(details); importDocuments.append(card);
    }
    importPreview.hidden = false;
    importMessage(L("已解析文档，请选择要导入的内容并检查转换提示。"));
  };
  const readImportFile = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, data: String(reader.result).split(",")[1] || "" });
    reader.onerror = () => reject(new Error(L("文件读取失败")));
    reader.readAsDataURL(file);
  });
  const prepareImport = async (files) => {
    if (importBusy || importSubmission || importFinished.length || !files.length) return;
    importBusy = true; importFiles = []; importDocuments.replaceChildren(); importPreview.hidden = true;
    importMessage(L("正在读取并解析文件…")); syncImportControls();
    try {
      if (files.length > 100 || files.reduce((size, file) => size + file.size, 0) > 10 * 1024 * 1024) {
        throw new Error(L("请选择不超过 100 个文件，总大小不超过 10 MB。"));
      }
      const parsedFiles = [];
      for (const file of files) parsedFiles.push(await readImportFile(file));
      const payload = await importRequest("/preview", { files: parsedFiles });
      importFiles = parsedFiles;
      showImportPreview(payload);
    } catch (error) { importMessage(error.message || L("导入失败，请检查文件后重试。"), true); }
    finally { importBusy = false; importFilesInput.value = ""; syncImportControls(); }
  };
  const openImport = async () => {
    closeCreate(); closeMore(); closeMove();
    // A failed save must leave the current page and its editor intact.
    if (selected) { clearTimeout(saveTimer); await save(); saveTimer = 0; }
    if (!importSubmission || importBlocked || importFinished.length || importProject !== projectId() || importPrefix !== routePrefix()) {
      importProject = projectId(); importPrefix = routePrefix(); importFiles = []; importSubmission = null; importFinished = []; importBlocked = false;
      importFilesInput.value = ""; importDocuments.replaceChildren(); importPreview.hidden = true; importMessage("");
      importFolder.replaceChildren();
      for (const folder of [{ id: "", title: L("未分类") }, ...folders]) {
        const option = document.createElement("option"); option.value = folder.id; option.textContent = folder.title; importFolder.append(option);
      }
    }
    importHelp(); syncImportControls(); importDialog.showModal();
  };
  workbench.querySelectorAll("[data-pages-import]").forEach((button) => button.addEventListener("click", () => {
    void openImport().catch((error) => showNote(error.message || L("保存失败"), true));
  }));
  importSource.addEventListener("change", importHelp);
  importFilesInput.addEventListener("change", () => { void prepareImport([...importFilesInput.files]); });
  importAll.addEventListener("change", () => { importChecks().forEach((input) => { input.checked = importAll.checked; }); syncImportControls(); });
  importDocuments.addEventListener("change", syncImportControls);
  importDrop.addEventListener("dragover", (event) => { event.preventDefault(); importDrop.classList.add("is-dragover"); });
  importDrop.addEventListener("dragleave", () => importDrop.classList.remove("is-dragover"));
  importDrop.addEventListener("drop", (event) => {
    event.preventDefault(); event.stopPropagation(); importDrop.classList.remove("is-dragover");
    if (event.dataTransfer) void prepareImport([...event.dataTransfer.files]);
  });
  importDialog.addEventListener("cancel", (event) => { if (importBusy) event.preventDefault(); });
  importClose.addEventListener("click", () => { if (!importBusy) importDialog.close(); });
  importSubmit.addEventListener("click", async () => {
    if (importBusy || importBlocked || importFinished.length) return;
    const keys = importChecks().filter((input) => input.checked).map((input) => input.value);
    if (!keys.length) return;
    importBusy = true;
    importSubmission ||= { files: importFiles, selected_keys: keys, folder_id: importFolder.value, request_id: crypto.randomUUID() };
    importMessage(L("正在导入文档…")); syncImportControls();
    try {
      const payload = await importRequest("", importSubmission);
      importFinished = payload.documents || [];
      importMessage(L("已导入") + " " + importFinished.length + " " + L("篇文档"));
      if (projectId() === importProject && routePrefix() === importPrefix) {
        query = ""; if (searchInput) searchInput.value = "";
        // Keep the successful receipt visible even if refreshing the library fails.
        await loadList().catch(() => {});
      }
    } catch (error) {
      if (error.status === 400 || error.status === 404) importSubmission = null;
      importBlocked = error.status === 409;
      importMessage((error.message || L("导入失败，请检查文件后重试。"))
        + (importBlocked ? "" : " " + L("可重试此批导入，不会重复创建文档。")), true);
    } finally { importBusy = false; syncImportControls(); }
  });
  importOpen.addEventListener("click", () => {
    if (projectId() !== importProject || routePrefix() !== importPrefix) {
      importMessage(L("项目已切换，请在目标项目重新打开导入。"), true); return;
    }
    if (importFinished[0]) { importDialog.close(); openCreated(importFinished[0]); }
  });
`;
