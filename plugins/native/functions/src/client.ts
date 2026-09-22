/** Functions workbench client: look / function / destination columns. */
export const FUNCTIONS_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L, feedApi } = host;
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
  const criteriaHint = workbench.querySelector("[data-functions-criteria-hint]");
  const criteriaEl = workbench.querySelector("[data-functions-criteria]");
  const paletteEl = workbench.querySelector("[data-functions-palette]");
  const mapPanel = workbench.querySelector("[data-functions-map-panel]");
  const mapEl = workbench.querySelector("[data-functions-map]");
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
  let selectionSeq = 0;
  let openingId = null;
  let saveTimer = 0;
  let listSeq = 0;
  let catalog = { subjects: [], destinations: [], behaviors: [] };
  const keepListScroll = (paint) => {
    const top = list?.scrollTop || 0;
    paint();
    if (list) list.scrollTop = top;
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
  const destOf = (id) => catalog.destinations.find((row) => row.destination_id === id) || null;
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
  const boardScenePath = (sceneId) => {
    if (sceneId === "inbox.next") return "/api/inbox/judgment";
    if (sceneId === "home.dock") return "/api/home/dock-judgment";
    return "";
  };
  const destTitle = (recordOrId) => {
    const id = recordOrId && typeof recordOrId === "object" ? recordOrId.scene_id : recordOrId;
    const title = destOf(id)?.title;
    if (title) return L(title);
    return id === "home.dock" ? L("首页") : id === "inbox.next" ? L("Inbox") : id === "feed.capture" ? L("Feed") : id === "agent.mcp" ? L("Agent") : L("还没选");
  };
  const catalogBehaviorIds = () => new Set(catalog.behaviors.map((row) => row.behavior_id));
  const matchesSubjects = (behavior, kinds) => {
    if (!kinds.length) return true;
    return (behavior.subject_kinds || []).some((kind) => kinds.includes(kind));
  };
  const suggestedBehaviors = (destId, kinds) => {
    const dest = destOf(destId);
    const match = (row) => matchesSubjects(row, kinds);
    if (!destId) return kinds.length ? catalog.behaviors.filter(match) : [];
    if (destId === "agent.mcp" || dest?.kind === "mcp") return catalog.behaviors.filter(match);
    return (dest?.behavior_ids || []).map((id) => catalog.behaviors.find((row) => row.behavior_id === id)).filter((row) => row && match(row));
  };
  const defaultChoiceRows = () => [{ key: "yes", description: "" }, { key: "no", description: "" }];
  const criteriaFollowContext = (keys) => {
    if (!keys.length) return true;
    if (keys.length === 2 && keys[0] === "yes" && keys[1] === "no") return true;
    const ids = catalogBehaviorIds();
    return keys.every((key) => ids.has(key));
  };
  const currentChoiceMap = () => {
    const map = new Map();
    criteriaEl.querySelectorAll("[data-choice-row]").forEach((row) => {
      const key = ((row.querySelector("[data-choice-key]") || {}).value || "").trim();
      if (!key) return;
      map.set(key, ((row.querySelector("[data-choice-description]") || {}).value || "").trim());
    });
    return map;
  };
  const applyChoiceRows = (rows) => {
    const prev = currentChoiceMap();
    criteriaEl.replaceChildren();
    rows.forEach((row) => {
      addChoiceRow(row.key, prev.has(row.key) ? prev.get(row.key) : (row.description || ""));
    });
  };
  const pruneSceneMap = (map, destId) => {
    const dest = destOf(destId);
    if (!destId || destId === "agent.mcp" || dest?.kind !== "event") return {};
    const pool = new Set(dest.behavior_ids || []);
    const keys = new Set(outputKeysFromForm());
    const next = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      if (keys.has(key) && pool.has(value)) next[key] = value;
    });
    return next;
  };
  const updateCriteriaHint = (destId, suggested) => {
    if (!criteriaHint || primitiveOf(selected) !== "choice") return;
    const dest = destOf(destId);
    const follow = criteriaFollowContext(outputKeysFromForm());
    if (dest && dest.kind === "event" && follow && suggested.length >= 2) {
      criteriaHint.textContent = L("这些动作跟着「看什么」和「用在哪」更新。");
    } else if (dest && dest.kind === "event" && follow) {
      criteriaHint.textContent = L("勾选的对象在这里没有对应动作。");
    } else {
      criteriaHint.textContent = L("选项是这道判断的答案，不必等于现场按钮。");
    }
  };
  const syncCriteriaPanel = () => {
    if (!selected) return;
    const destId = selectedDestId();
    const kinds = subjectKindsFromForm();
    const suggested = suggestedBehaviors(destId, kinds);
    if (selected.status === "published" || primitiveOf(selected) !== "choice") {
      selected = { ...selected, scene_id: destId || null, subject_kinds: kinds };
      updateCriteriaHint(destId, suggested);
      renderPalette(selected);
      renderMap(selected);
      return;
    }
    const keys = outputKeysFromForm();
    const dest = destOf(destId);
    const eventDest = Boolean(dest && dest.kind === "event");
    const follow = criteriaFollowContext(keys);
    const hasCatalogKeys = keys.some((key) => catalogBehaviorIds().has(key));
    let nextMap = selected.scene_map || {};
    if (follow && eventDest && suggested.length >= 2) {
      applyChoiceRows(suggested.map((row) => ({ key: row.behavior_id, description: row.title || "" })));
      nextMap = {};
    } else if (follow && hasCatalogKeys) {
      applyChoiceRows(defaultChoiceRows());
      nextMap = {};
    } else if (!eventDest) {
      nextMap = {};
    } else {
      nextMap = pruneSceneMap(nextMap, destId);
    }
    selected = {
      ...selected,
      scene_id: destId || null,
      subject_kinds: kinds,
      scene_map: nextMap,
      criteria: criteriaFromForm(),
    };
    updateCriteriaHint(destId, suggested);
    renderPalette(selected);
    renderMap(selected);
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
    if (!current) return selected?.scene_id || "";
    return current.dataset.functionsDestination || "";
  };
  const subjectKindsFromForm = () => [...workbench.querySelectorAll("[data-functions-source]:checked")]
    .map((node) => node.dataset.functionsSource)
    .filter(Boolean);
  const outputKeysFromForm = () => {
    const kind = primitiveOf(selected);
    if (kind === "noul") return ["true", "false"];
    if (kind === "score") return [];
    return [...criteriaEl.querySelectorAll("[data-choice-row]")].map((row) => {
      const key = ((row.querySelector("[data-choice-key]") || {}).value || "").trim();
      return key;
    }).filter(Boolean);
  };
  const sceneMapFromForm = () => {
    const destId = selectedDestId();
    const dest = destOf(destId);
    if (!destId || destId === "agent.mcp" || dest?.kind !== "event") return {};
    const mapped = {};
    mapEl.querySelectorAll("[data-map-key]").forEach((select) => {
      const key = select.dataset.mapKey;
      const value = (select.value || "").trim();
      if (key && value) mapped[key] = value;
    });
    return mapped;
  };
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
    const picked = [...criteriaEl.querySelectorAll("[data-choice-row]")].map((row) => ({
      key: ((row.querySelector("[data-choice-key]") || {}).value || "").trim(),
      description: ((row.querySelector("[data-choice-description]") || {}).value || "").trim(),
    })).filter((row) => row.key);
    if (picked.length >= 2) return picked;
    if (Array.isArray(selected?.criteria) && selected.criteria.length >= 2) return selected.criteria;
    return picked;
  };
  const mappingReady = (record) => {
    const destId = record.scene_id || "";
    if (!destId || destId === "agent.mcp") return true;
    const dest = destOf(destId);
    const pool = dest?.behavior_ids || [];
    if (!pool.length) return true;
    const kind = primitiveOf(record);
    const keys = kind === "noul"
      ? ["true", "false"]
      : kind === "choice" && Array.isArray(record.criteria)
        ? record.criteria.map((row) => row.key)
        : [];
    if (!keys.length) return false;
    const map = record.scene_map || {};
    return keys.every((key) => pool.includes(map[key] || key));
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
  const nextOptionKey = () => {
    const used = new Set(outputKeysFromForm());
    let n = 1;
    while (used.has("option_" + n)) n += 1;
    return "option_" + n;
  };
  const addChoiceRow = (key, description) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.dataset.choiceRow = "true";
    const keyInputEl = document.createElement("input");
    keyInputEl.className = "mw-input";
    keyInputEl.dataset.choiceKey = "true";
    keyInputEl.spellcheck = false;
    keyInputEl.autocomplete = "off";
    keyInputEl.placeholder = L("选项 key");
    keyInputEl.value = key || "";
    const desc = document.createElement("input");
    desc.className = "mw-input";
    desc.dataset.choiceDescription = "true";
    desc.autocomplete = "off";
    desc.placeholder = L("怎么判断");
    desc.value = description || "";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mw-btn mw-btn--ghost";
    remove.dataset.choiceRemove = "true";
    remove.setAttribute("aria-label", L("去掉选项"));
    remove.textContent = "×";
    row.append(keyInputEl, desc, remove);
    criteriaEl.append(row);
  };
  const sourceLabel = (source) => source === "mcp" ? L("MCP") : source === "plugin" ? L("插件") : L("系统");
  const appendPaletteRow = (behavior, parent) => {
    const row = document.createElement("div");
    row.className = "functions-palette-row";
    const body = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = behavior.title;
    const meta = document.createElement("small");
    const bits = [sourceLabel(behavior.source)];
    if (behavior.plugin_title && behavior.source !== "system") bits.push(behavior.plugin_title);
    if (behavior.hint) bits.push(behavior.hint.length > 42 ? behavior.hint.slice(0, 41) + "…" : behavior.hint);
    meta.textContent = bits.join(" · ");
    body.append(title, meta);
    const effect = document.createElement("span");
    effect.className = "functions-effect";
    effect.dataset.effect = behavior.effect;
    effect.textContent = behavior.effect === "write" ? L("写") : L("看");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mw-btn mw-btn--ghost";
    add.dataset.paletteAdd = behavior.behavior_id;
    add.textContent = L("加入");
    row.append(body, effect, add);
    parent.append(row);
  };
  const renderPalette = (record) => {
    paletteEl.replaceChildren();
    if (primitiveOf(record) !== "choice" || record.status === "published") return;
    const destId = selectedDestId() || record.scene_id || "";
    const kinds = subjectKindsFromForm();
    const used = new Set(outputKeysFromForm());
    const fresh = suggestedBehaviors(destId, kinds).filter((row) => row && !used.has(row.behavior_id));
    if (!fresh.length) return;
    const head = document.createElement("strong");
    head.textContent = L("从动作库加入");
    paletteEl.append(head);
    if (destId === "agent.mcp") {
      const groups = new Map();
      fresh.forEach((row) => {
        const label = row.source === "system" ? L("系统") : sourceLabel(row.source) + " · " + row.plugin_title;
        const listItems = groups.get(label) || [];
        listItems.push(row);
        groups.set(label, listItems);
      });
      groups.forEach((groupItems, label) => {
        const group = document.createElement("div");
        group.className = "functions-behavior-group";
        const name = document.createElement("span");
        name.textContent = label;
        group.append(name);
        groupItems.forEach((behavior) => appendPaletteRow(behavior, group));
        paletteEl.append(group);
      });
      return;
    }
    fresh.forEach((behavior) => appendPaletteRow(behavior, paletteEl));
  };
  const renderMap = (record) => {
    mapEl.replaceChildren();
    const destId = record.scene_id || "";
    const dest = destOf(destId);
    const eventDest = dest && dest.kind === "event";
    const kind = primitiveOf(record);
    if (mapPanel) mapPanel.hidden = !eventDest || kind === "score";
    if (!eventDest || kind === "score") return;
    const pool = dest.behavior_ids || [];
    const map = record.scene_map || {};
    const rows = kind === "noul"
      ? [
        { key: "true", label: L("成立") },
        { key: "false", label: L("不成立") },
      ]
      : [...criteriaEl.querySelectorAll("[data-choice-row]")].flatMap((row) => {
        const key = ((row.querySelector("[data-choice-key]") || {}).value || "").trim();
        if (!key) return [];
        const description = ((row.querySelector("[data-choice-description]") || {}).value || "").trim();
        return [{ key, label: description || key }];
      });
    rows.forEach((row) => {
      const line = document.createElement("label");
      line.className = "functions-map-row";
      const title = document.createElement("strong");
      title.textContent = row.label;
      const select = document.createElement("select");
      select.className = "mw-select";
      select.dataset.mapKey = row.key;
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = L("还没对上");
      select.append(empty);
      pool.forEach((id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = behaviorOf(id).title;
        select.append(option);
      });
      const current = map[row.key] || (pool.includes(row.key) ? row.key : "");
      select.value = current;
      select.disabled = record.status === "published";
      line.append(title, select);
      mapEl.append(line);
    });
  };
  const renderCriteria = (record) => {
    const kind = primitiveOf(record);
    const locked = record.status === "published";
    criteriaEl.replaceChildren();
    addCriterionBtn.hidden = kind === "noul";
    if (criteriaHead) criteriaHead.hidden = kind === "noul";
    if (criteriaHint) criteriaHint.hidden = kind !== "choice";
    if (kind === "noul") {
      criteriaLabel.textContent = L("成立时");
      const wrap = document.createElement("div");
      wrap.className = "functions-noul-fields";
      wrap.innerHTML = '<label class="functions-field">' + L("成立时") + '<textarea class="mw-input" data-noul-true rows="2"></textarea></label>'
        + '<label class="functions-field">' + L("不成立时") + '<textarea class="mw-input" data-noul-false rows="2"></textarea></label>';
      wrap.querySelector("[data-noul-true]").value = record.criteria?.true_description || "";
      wrap.querySelector("[data-noul-false]").value = record.criteria?.false_description || "";
      criteriaEl.append(wrap);
    } else if (kind === "score") {
      criteriaLabel.textContent = L("档位");
      const levels = Array.isArray(record.criteria) && record.criteria.length ? record.criteria : ["", ""];
      levels.forEach((level) => addScoreRow(level));
    } else {
      criteriaLabel.textContent = L("选项");
      const rows = Array.isArray(record.criteria) && record.criteria.length
        ? record.criteria
        : [{ key: "yes", description: "" }, { key: "no", description: "" }];
      rows.forEach((row) => addChoiceRow(row.key, row.description || ""));
    }
    criteriaEl.querySelectorAll("input, textarea, button").forEach((node) => { node.disabled = locked; });
    addCriterionBtn.disabled = locked;
    renderPalette(record);
    renderMap(record);
    updateCriteriaHint(record.scene_id || "", suggestedBehaviors(record.scene_id || "", subjectKindsFromForm()));
  };
  const renderRoute = (record) => {
    const kind = primitiveOf(record);
    const destId = record.scene_id || "";
    const selectedKinds = new Set((record.subject_kinds && record.subject_kinds.length) ? record.subject_kinds : subjectKindsFromForm());
    workbench.querySelectorAll("[data-functions-destination]").forEach((node) => {
      const id = node.dataset.functionsDestination || "";
      const on = id === destId;
      node.classList.toggle("is-current", on);
      const dest = destOf(id);
      const related = dest && dest.subject_kinds && dest.subject_kinds.some((item) => selectedKinds.has(item));
      node.classList.toggle("is-related", Boolean(related && !on));
      node.disabled = record.status === "published" || (kind === "score" && dest && dest.kind === "event");
    });
    if (choiceOnlyHint) choiceOnlyHint.hidden = kind !== "score";
    workbench.querySelectorAll("[data-functions-source]").forEach((node) => {
      const kindId = node.dataset.functionsSource;
      node.checked = selectedKinds.has(kindId);
      node.disabled = record.status === "published";
      const dest = destOf(destId);
      node.closest(".functions-chip")?.classList.toggle("is-related", Boolean(dest?.subject_kinds?.includes(kindId)));
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
    const token = record.id;
    usagesEl.replaceChildren();
    const head = document.createElement("strong");
    head.textContent = L("用在哪");
    usagesEl.append(head);
    if (!record.scene_id) {
      const line = document.createElement("p");
      line.textContent = L("先不落地");
      usagesEl.append(line);
      return;
    }
    if (record.scene_id === "agent.mcp") {
      const line = document.createElement("p");
      line.textContent = L("发布后可用。");
      usagesEl.append(line);
      return;
    }
    const path = boardScenePath(record.scene_id);
    if (path) {
      const status = document.createElement("p");
      status.dataset.functionsUsageStatus = "";
      if (record.status !== "published") {
        status.textContent = L("先发布。");
        usagesEl.append(status);
        return;
      }
      if (!mappingReady(record)) {
        status.textContent = L("对上之后才能用在这里。");
        usagesEl.append(status);
        return;
      }
      if (!feedApi) {
        status.textContent = L("先打开项目。");
        usagesEl.append(status);
        return;
      }
      try {
        const payload = await feedApi(path, "GET");
        if (selected?.id !== token) return;
        const current = payload.function_key || "";
        const bind = document.createElement("button");
        bind.type = "button";
        bind.className = "mw-btn mw-btn--secondary";
        if (current === record.function_key) {
          status.textContent = record.scene_id === "inbox.next"
            ? L("Inbox 在用。")
            : L("首页在用。");
          bind.textContent = L("停用");
          bind.dataset.functionsSceneBind = "off";
          usagesEl.append(status, bind);
        } else if (current) {
          const other = (payload.functions || []).find((row) => row.function_key === current);
          status.textContent = other && other.name ? L("正在用") + "「" + other.name + "」" : L("正在用另一个。");
          bind.textContent = L("换成这个");
          bind.dataset.functionsSceneBind = "on";
          usagesEl.append(status, bind);
        } else {
          bind.textContent = record.scene_id === "inbox.next" ? L("用在 Inbox") : L("用在首页");
          bind.dataset.functionsSceneBind = "on";
          usagesEl.append(bind);
        }
      } catch (error) {
        if (selected?.id !== token) return;
        status.textContent = error.message || L("没读到");
        usagesEl.append(status);
      }
      return;
    }
    try {
      const payload = record.status === "published"
        ? await request("GET", "/api/plugins/functions/" + encodeURIComponent(record.id) + "/usages")
        : { usages: [] };
      if (selected?.id !== token) return;
      const usages = payload.usages || [];
      if (usages.length) {
        usages.forEach((row) => {
          const item = document.createElement("p");
          const scene = destOf(row.scene_id);
          item.textContent = destTitle(row.scene_id) + (scene ? " · " + L(scene.configure_at) : "");
          usagesEl.append(item);
        });
        return;
      }
    } catch {
      // Fall through to the unbound copy.
    }
    if (selected?.id !== token) return;
    const line = document.createElement("p");
    line.textContent = L("去 Feed 任务里选。");
    usagesEl.append(line);
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
    showNote(locked ? L("已发布。") : "", false);
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
    keepListScroll(() => paintList());
  };
  const paintList = () => {
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
    const payload = await request("GET", "/api/plugins/functions/catalog");
    if (payload.catalog) catalog = payload.catalog;
  };
  const loadList = async (opts = {}) => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/plugins/functions");
    if (seq !== listSeq) return;
    records = payload.functions || [];
    renderList();
    if (!selected) return;
    const next = records.find((item) => item.id === selected.id);
    if (opts.preserveForm) {
      if (!next) closeEditor();
      return;
    }
    if (next) {
      if (opts.remount) fillEditor(next);
      else {
        selected = next;
        titleEl.textContent = next.name;
      }
    }
    else closeEditor();
  };
  const draftBody = () => ({
    name: nameInput.value,
    function_key: keyInput.value,
    instructions: instructionsInput.value,
    criteria: criteriaFromForm(),
    scene_id: selectedDestId() || null,
    subject_kinds: subjectKindsFromForm(),
    scene_map: sceneMapFromForm(),
    updated_at: selected.updated_at,
  });
  const saveDraft = async () => {
    if (!selected || selected.status === "published") return selected;
    const savingId = selected.id;
    const body = draftBody();
    try {
      const payload = await request("POST", "/api/plugins/functions/" + encodeURIComponent(savingId), body);
      const saved = payload.function;
      records = records.some((item) => item.id === saved.id)
        ? records.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...records];
      if (selected?.id !== savingId) {
        renderList();
        return saved;
      }
      selected = saved;
      renderList();
      titleEl.textContent = selected.name;
      showNote("", false);
      return selected;
    } catch (error) {
      if (selected?.id === savingId) await loadList({ preserveForm: true }).catch(() => {});
      throw error;
    }
  };
  const queueSave = () => {
    if (!selected || selected.status === "published") return;
    const savingId = selected.id;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveDraft().catch((error) => {
        if (selected?.id === savingId) showNote(error.message, true);
      });
    }, 280);
  };
  const remember = (record) => {
    records = records.some((item) => item.id === record.id)
      ? records.map((item) => item.id === record.id ? record : item)
      : [record, ...records];
    renderList();
    fillEditor(record);
  };
  workbench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail?.itemId;
    if (!id) { selectionSeq++; openingId = null; return; }
    if (selected?.id === id) {
      workbench.setAttribute("data-expanded", "true"); workspace.hidden = false; return;
    }
    if (openingId === id) return;
    openingId = id;
    const seq = ++selectionSeq;
    void (async () => {
      if (selected && saveTimer) { clearTimeout(saveTimer); saveTimer = 0; await saveDraft(); }
      await loadCatalog();
      const payload = await request("GET", "/api/plugins/functions/" + encodeURIComponent(id));
      if (seq === selectionSeq) remember(payload.function);
    })().catch((error) => { if (seq === selectionSeq) showNote(error.message, true); })
      .finally(() => { if (seq === selectionSeq) openingId = null; });
  });
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
      const payload = await request("POST", "/api/plugins/functions", { primitive });
      closeCreate();
      await loadList();
      remember(payload.function);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  workbench.querySelector("[data-functions-back]").addEventListener("click", async () => {
    await saveDraft().catch((error) => showNote(error.message, true));
    closeEditor();
    await loadList().catch((error) => showNote(error.message, true));
  });
  deleteBtn.addEventListener("click", async () => {
    if (!selected || selected.status === "published") return;
    if (!window.confirm(L("确定删除这个草稿？"))) return;
    try {
      await request("POST", "/api/plugins/functions/" + encodeURIComponent(selected.id) + "/delete", {
        updated_at: selected.updated_at,
      });
      closeEditor();
      await loadList();
    } catch (error) {
      showNote(error.message, true);
    }
  });
  addCriterionBtn.addEventListener("click", () => {
    if (selected?.status === "published") return;
    if (primitiveOf(selected) === "score") addScoreRow("");
    else if (primitiveOf(selected) === "choice") addChoiceRow(nextOptionKey(), "");
    renderPalette(selected);
    renderMap(selected);
    queueSave();
  });
  usagesEl?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-functions-scene-bind]");
    if (!button || !selected || !feedApi) return;
    const path = boardScenePath(selected.scene_id);
    if (!path) return;
    button.disabled = true;
    try {
      const on = button.dataset.functionsSceneBind !== "off";
      await feedApi(path, "POST", { function_key: on ? selected.function_key : null });
      await renderUsages(selected);
    } catch (error) {
      const status = usagesEl.querySelector("[data-functions-usage-status]");
      if (status) status.textContent = error.message || L("没打开");
      button.disabled = false;
    }
  });
  workbench.querySelector("[data-functions-destinations]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-functions-destination]");
    if (!button || !selected || selected.status === "published" || button.disabled) return;
    const destId = button.dataset.functionsDestination || "";
    if (primitiveOf(selected) === "score" && destId && destId !== "agent.mcp") {
      showNote(L("Score 不能绑 Inbox、首页、Feed。"), true);
      return;
    }
    if (destId === (selected.scene_id || "")) return;
    selected = {
      ...selected,
      scene_id: destId || null,
      scene_map: destId && destId !== "agent.mcp" ? (selected.scene_map || {}) : {},
    };
    renderRoute(selected);
    syncCriteriaPanel();
    void renderUsages(selected);
    queueSave();
  });
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-choice-key], [data-choice-description], [data-map-key]")) {
      if (selected) renderMap({ ...selected, criteria: criteriaFromForm(), scene_map: sceneMapFromForm() });
    }
    queueSave();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-functions-source]")) {
      if (selected && selected.status !== "published") {
        selected = { ...selected, subject_kinds: subjectKindsFromForm() };
        renderRoute(selected);
        syncCriteriaPanel();
      }
    }
    if (event.target.matches("[data-map-key]") && selected) {
      void renderUsages({ ...selected, scene_map: sceneMapFromForm(), criteria: criteriaFromForm() });
    }
    queueSave();
  });
  form.addEventListener("click", (event) => {
    const paletteAdd = event.target.closest("[data-palette-add]");
    if (paletteAdd && selected?.status !== "published" && primitiveOf(selected) === "choice") {
      const behavior = behaviorOf(paletteAdd.dataset.paletteAdd);
      if (!outputKeysFromForm().includes(behavior.behavior_id)) {
        addChoiceRow(behavior.behavior_id, behavior.title || "");
      }
      renderPalette(selected);
      renderMap(selected);
      queueSave();
      return;
    }
    const removeChoice = event.target.closest("[data-choice-remove]");
    if (removeChoice && selected?.status !== "published") {
      if (criteriaEl.querySelectorAll("[data-choice-row]").length < 3) {
        showNote(L("Choice 至少需要两个选项"), true);
        return;
      }
      removeChoice.closest("[data-choice-row]").remove();
      renderPalette(selected);
      renderMap(selected);
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
        const payload = await request("POST", "/api/plugins/functions/" + encodeURIComponent(selected.id) + "/samples/delete", {
          sample_id: row.dataset.sampleId,
          updated_at: selected.updated_at,
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
      const payload = await request("POST", "/api/plugins/functions/" + encodeURIComponent(selected.id) + "/samples", {
        input: previewInput.value,
        updated_at: selected.updated_at,
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
  let previewing = false;
  const previewBtn = workbench.querySelector("[data-functions-preview]");
  previewBtn.addEventListener("click", async () => {
    if (!selected || previewing) return;
    const previewId = selected.id;
    previewing = true;
    previewBtn.disabled = true;
    showNote(L("可能计费。"), false);
    try {
      await saveDraft();
      if (selected?.id !== previewId) return;
      const payload = await request("POST", "/api/plugins/functions/" + encodeURIComponent(previewId) + "/preview", {
        input: previewInput.value,
        updated_at: selected.updated_at,
      });
      if (selected?.id !== previewId) return;
      remember(payload.function);
    } catch (error) {
      if (selected?.id === previewId) showNote(error.message, true);
    } finally {
      previewing = false;
      previewBtn.disabled = false;
    }
  });
  publishBtn.addEventListener("click", async () => {
    if (!selected) return;
    showNote("", false);
    try {
      await saveDraft();
      const payload = await request("POST", "/api/plugins/functions/" + encodeURIComponent(selected.id) + "/publish", {
        updated_at: selected.updated_at,
      });
      remember(payload.function);
      await loadList();
    } catch (error) {
      showNote(error.message, true);
    }
  });
  void loadCatalog().then(loadList).catch((error) => showNote(error.message, true));
}
`;
