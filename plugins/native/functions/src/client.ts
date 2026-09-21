/** Functions workbench client: author source/destination, preview, publish. */
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
  const behaviorHint = workbench.querySelector("[data-functions-behavior-hint]");
  const samplesEl = workbench.querySelector("[data-functions-samples]");
  const previewInput = workbench.querySelector("[data-functions-preview-input]");
  const publishBtn = workbench.querySelector("[data-functions-publish]");
  const note = workbench.querySelector("[data-functions-note]");
  const lastPreview = workbench.querySelector("[data-functions-last-preview]");
  const usagesEl = workbench.querySelector("[data-functions-usages]");
  const createDialog = workbench.querySelector("[data-functions-create-dialog]");
  const createForm = workbench.querySelector("[data-functions-create-form]");
  const choiceOnlyHint = workbench.querySelector("[data-functions-choice-only]");
  let records = [];
  let selected = null;
  let saveTimer = 0;
  let catalog = { subjects: [], destinations: [], behaviors: [] };
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
  const destOf = (id) => catalog.destinations.find((row) => row.destination_id === id)
    || null;
  const behaviorOf = (id) => catalog.behaviors.find((row) => row.behavior_id === id) || {
    behavior_id: id,
    title: id,
    effect: "read",
    source: "system",
    plugin_id: "system",
    plugin_title: L("系统"),
    subject_kinds: [],
    clickable: true,
  };
  const destTitle = (recordOrId) => {
    const id = recordOrId && typeof recordOrId === "object" ? recordOrId.scene_id : recordOrId;
    const primitive = recordOrId && typeof recordOrId === "object" ? recordOrId.primitive : "";
    if (!id && (primitive === "noul" || primitive === "score")) return L("给 Agent 调用");
    return destOf(id)?.title || (id === "home.dock" ? L("首页事件") : id === "inbox.next" ? L("Inbox 落地") : id === "feed.capture" ? L("Feed 捕捉") : id === "agent.mcp" ? L("给 Agent 调用") : L("未选去向"));
  };
  const functionMeta = (record) => {
    const bits = [];
    const line = String(record.instructions || "").trim().split("\\n")[0].trim();
    if (line) bits.push(line);
    if (record.primitive === "choice" && Array.isArray(record.criteria) && record.criteria.length) {
      bits.push(record.criteria.length + " " + L("选项"));
    }
    if (record.primitive === "score" && Array.isArray(record.criteria) && record.criteria.length) {
      bits.push(record.criteria.length + " " + L("档位"));
    }
    if ((record.samples || []).length) bits.push((record.samples || []).length + " " + L("样例"));
    if (record.last_preview) bits.push(L("试过"));
    return bits.join(" · ") || L("还没有说明");
  };

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
  const selectedDestId = () => {
    const current = workbench.querySelector("[data-functions-destination].is-current");
    return current ? current.dataset.functionsDestination : (selected?.scene_id || "");
  };
  const subjectKindsFromForm = () => [...workbench.querySelectorAll("[data-functions-source]:checked")]
    .map((node) => node.dataset.functionsSource)
    .filter(Boolean);
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
    const picked = [...criteriaEl.querySelectorAll("[data-behavior-id]")].flatMap((row) => {
      const check = row.querySelector("[data-behavior-check]");
      if (!check || !check.checked) return [];
      return [{
        key: row.dataset.behaviorId,
        description: (row.querySelector("[data-behavior-description]") || {}).value || "",
      }];
    });
    if (picked.length >= 2) return picked;
    if (Array.isArray(selected?.criteria) && selected.criteria.length >= 2) return selected.criteria;
    return picked;
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
  const sourceLabel = (source) => source === "mcp" ? L("MCP") : source === "plugin" ? L("插件") : L("系统");
  const appendBehavior = (behavior, checked, description, locked, parent) => {
    const row = document.createElement("label");
    row.className = "functions-behavior";
    row.dataset.behaviorId = behavior.behavior_id;
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "mw-check";
    check.dataset.behaviorCheck = "true";
    check.checked = Boolean(checked);
    check.disabled = locked;
    const body = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = behavior.title;
    const meta = document.createElement("small");
    const grouped = parent && parent !== criteriaEl;
    const bits = [];
    if (!grouped) {
      bits.push(sourceLabel(behavior.source));
      if (behavior.plugin_title && behavior.source !== "system") bits.push(behavior.plugin_title);
    }
    if (behavior.hint) bits.push(behavior.hint.length > 42 ? behavior.hint.slice(0, 41) + "…" : behavior.hint);
    else if (!behavior.clickable && !grouped) bits.push(L("未接线，给 Agent 用"));
    meta.textContent = bits.join(" · ");
    const desc = document.createElement("input");
    desc.className = "mw-input";
    desc.dataset.behaviorDescription = "true";
    desc.placeholder = L("选项说明");
    desc.value = description || "";
    desc.disabled = locked;
    desc.hidden = !checked;
    body.append(title, meta, desc);
    const effect = document.createElement("span");
    effect.className = "functions-effect";
    effect.dataset.effect = behavior.effect;
    effect.textContent = behavior.effect === "write" ? L("写") + " · " + L("判断只建议") : L("看");
    row.append(check, body, effect);
    (parent || criteriaEl).append(row);
  };
  const appendGroup = (label, items, selectedKeys, descriptions, locked) => {
    if (!items.length) return;
    const group = document.createElement("div");
    group.className = "functions-behavior-group";
    const head = document.createElement("span");
    head.textContent = label;
    group.append(head);
    items.forEach((behavior) => {
      appendBehavior(behavior, selectedKeys.has(behavior.behavior_id), descriptions.get(behavior.behavior_id) || behavior.title, locked, group);
    });
    criteriaEl.append(group);
  };
  const renderChoiceBehaviors = (record) => {
    const locked = record.status === "published";
    const destId = record.scene_id || selectedDestId();
    const dest = destOf(destId);
    const selectedKeys = new Set((Array.isArray(record.criteria) ? record.criteria : []).map((row) => row.key));
    const descriptions = new Map((Array.isArray(record.criteria) ? record.criteria : []).map((row) => [row.key, row.description || ""]));
    criteriaLabel.textContent = L("会在这些动作里挑");
    if (behaviorHint) behaviorHint.hidden = false;
    if (!destId) {
      const empty = document.createElement("p");
      empty.className = "functions-hint";
      empty.textContent = L("判断结果用在哪。开关仍在现场，这里只选定去向。");
      criteriaEl.append(empty);
      return;
    }
    if (destId === "agent.mcp") {
      const system = catalog.behaviors.filter((row) => row.source === "system");
      appendGroup(L("系统"), system, selectedKeys, descriptions, locked);
      const pluginGroups = new Map();
      catalog.behaviors.filter((row) => row.source === "plugin").forEach((row) => {
        const list = pluginGroups.get(row.plugin_title) || [];
        list.push(row);
        pluginGroups.set(row.plugin_title, list);
      });
      pluginGroups.forEach((items, title) => appendGroup(L("插件") + " · " + title, items, selectedKeys, descriptions, locked));
      const mcpGroups = new Map();
      catalog.behaviors.filter((row) => row.source === "mcp").forEach((row) => {
        const list = mcpGroups.get(row.plugin_title) || [];
        list.push(row);
        mcpGroups.set(row.plugin_title, list);
      });
      mcpGroups.forEach((items, title) => appendGroup(L("MCP") + " · " + title, items, selectedKeys, descriptions, locked));
      return;
    }
    const ids = dest?.behavior_ids?.length ? dest.behavior_ids : [];
    ids.forEach((id) => {
      const behavior = behaviorOf(id);
      appendBehavior(behavior, selectedKeys.size ? selectedKeys.has(id) : true, descriptions.get(id) || behavior.title, locked, criteriaEl);
    });
  };
  const renderCriteria = (record) => {
    const kind = primitiveOf(record);
    const locked = record.status === "published";
    criteriaEl.replaceChildren();
    addCriterionBtn.hidden = kind !== "score";
    if (criteriaHead) criteriaHead.hidden = kind === "noul";
    if (behaviorHint) behaviorHint.hidden = kind !== "choice";
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
      renderChoiceBehaviors(record);
    }
    criteriaEl.querySelectorAll("input, textarea, button").forEach((node) => { node.disabled = locked; });
    addCriterionBtn.disabled = locked;
  };
  const renderRoute = (record) => {
    const kind = primitiveOf(record);
    const destId = kind === "choice" ? (record.scene_id || "") : "agent.mcp";
    workbench.querySelectorAll("[data-functions-destination]").forEach((node) => {
      const on = node.dataset.functionsDestination === destId;
      node.classList.toggle("is-current", on);
      node.disabled = record.status === "published" || (kind !== "choice" && node.dataset.functionsDestination !== "agent.mcp");
    });
    if (choiceOnlyHint) choiceOnlyHint.hidden = kind === "choice";
    const dest = destOf(destId);
    const kinds = (record.subject_kinds && record.subject_kinds.length)
      ? record.subject_kinds
      : (dest?.subject_kinds || []);
    const kindSet = new Set(kinds);
    workbench.querySelectorAll("[data-functions-source]").forEach((node) => {
      node.checked = kindSet.has(node.dataset.functionsSource);
      node.disabled = record.status === "published" || kind !== "choice";
    });
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
  const renderUsages = async (record) => {
    if (!usagesEl) return;
    usagesEl.replaceChildren();
    const dest = destOf(record.scene_id);
    const head = document.createElement("strong");
    head.textContent = L("被用在哪");
    usagesEl.append(head);
    if (record.scene_id === "agent.mcp" || primitiveOf(record) !== "choice") {
      const line = document.createElement("p");
      line.textContent = L("发布后 Agent 就能调用，不用再去 Inbox 或首页开开关。");
      usagesEl.append(line);
      return;
    }
    try {
      const payload = record.status === "published"
        ? await request("GET", "/api/functions/" + encodeURIComponent(record.id) + "/usages")
        : { usages: [] };
      const usages = payload.usages || [];
      if (usages.length) {
        usages.forEach((row) => {
          const item = document.createElement("p");
          const scene = destOf(row.scene_id);
          item.textContent = destTitle(row.scene_id) + (scene ? " · " + scene.configure_at : "");
          usagesEl.append(item);
        });
        return;
      }
    } catch {
      // Fall through to the unbound copy.
    }
    const line = document.createElement("p");
    line.textContent = L("还没接到现场。发布后到这里选它：");
    usagesEl.append(line);
    const where = document.createElement("p");
    where.textContent = dest?.configure_at || L("Inbox 列表的「下一步判断」");
    usagesEl.append(where);
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
    publishBtn.textContent = L("发布 v1");
    if (switching) previewInput.value = record.last_preview?.input || "";
    renderRoute(record);
    renderCriteria(record);
    renderSamples(record);
    renderPreview(record);
    void renderUsages(record);
    showNote(locked ? L("已发布，配置不能再改。") : "", false);
    list.querySelectorAll("[data-function-id]").forEach((row) => {
      const on = row.dataset.functionId === record.id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const closeEditor = () => {
    selected = null;
    workbench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    list.querySelectorAll("[data-function-id]").forEach((row) => {
      row.classList.remove("is-selected");
      row.setAttribute("aria-selected", "false");
    });
  };
  const renderList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => {
      const item = document.createElement("article");
      item.className = "feed-stage-item";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "feed-stage-entry directory-list-row" + (selected?.id === record.id ? " is-selected" : "");
      row.dataset.functionId = record.id;
      row.setAttribute("aria-selected", String(selected?.id === record.id));
      const leading = document.createElement("span");
      leading.className = "feed-stage-leading";
      const title = document.createElement("strong");
      title.title = record.name;
      title.textContent = record.name;
      leading.append(title);
      const primitive = record.primitive === "noul" ? "Noul" : record.primitive === "score" ? "Score" : "Choice";
      const published = record.status === "published";
      const status = document.createElement("span");
      status.className = "mw-status mw-status--" + (published ? "done" : "quiet") + " feed-entry-status";
      status.textContent = published ? "v" + (record.version || 1) : L("草稿");
      row.append(
        leading,
        kindChip(record.primitive || "choice", primitive),
        textCell("plugin-stage-fact", destTitle(record)),
        textCell("plugin-stage-meta", functionMeta(record)),
        status,
      );
      item.append(row);
      rowsEl.append(item);
    });
  };
  const loadCatalog = async () => {
    const payload = await request("GET", "/api/functions/catalog");
    if (payload.catalog) catalog = payload.catalog;
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
  const criteriaForDestination = (destId, current) => {
    if (destId === "agent.mcp") return current;
    const dest = destOf(destId);
    const ids = dest?.behavior_ids || [];
    if (ids.length < 2) return current;
    return ids.map((id) => {
      const behavior = behaviorOf(id);
      return { key: id, description: behavior.title };
    });
  };
  const draftBody = () => ({
    name: nameInput.value,
    function_key: keyInput.value,
    instructions: instructionsInput.value,
    criteria: criteriaFromForm(),
    scene_id: primitiveOf(selected) === "choice" ? (selectedDestId() || null) : "agent.mcp",
    subject_kinds: primitiveOf(selected) === "choice" ? subjectKindsFromForm() : ["mcp_invoke"],
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
    queueSave();
  });
  workbench.querySelector("[data-functions-destinations]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-functions-destination]");
    if (!button || !selected || selected.status === "published" || button.disabled) return;
    const destId = button.dataset.functionsDestination;
    if (primitiveOf(selected) !== "choice" && destId !== "agent.mcp") {
      showNote(L("现场判断要用 Choice。Noul 和 Score 只给 Agent 用。"), true);
      return;
    }
    const dest = destOf(destId);
    selected = {
      ...selected,
      scene_id: destId,
      subject_kinds: dest?.subject_kinds || selected.subject_kinds || [],
      criteria: primitiveOf(selected) === "choice" ? criteriaForDestination(destId, selected.criteria) : selected.criteria,
    };
    renderRoute(selected);
    renderCriteria(selected);
    void renderUsages(selected);
    queueSave();
  });
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-behavior-check]")) {
      const desc = event.target.closest("[data-behavior-id]")?.querySelector("[data-behavior-description]");
      if (desc) desc.hidden = !event.target.checked;
    }
    queueSave();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-functions-source], [data-behavior-check]")) queueSave();
  });
  form.addEventListener("click", (event) => {
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
  void loadCatalog().then(loadList).catch((error) => showNote(error.message, true));
}
`;
