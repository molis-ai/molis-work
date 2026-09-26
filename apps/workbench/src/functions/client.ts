/** Functions workbench: purpose, rules, then preview and activation. */
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
  const saveStatus = workbench.querySelector("[data-functions-save-status]");
  const paletteSearch = workbench.querySelector("[data-functions-palette-search]");
  const paletteDetails = workbench.querySelector("[data-functions-palette-details]");
  const destinationHint = workbench.querySelector("[data-functions-destination-hint]");
  const releaseHint = workbench.querySelector("[data-functions-release-hint]");
  let activeStep = "look";
  const stepOrder = ["look", "fn", "use"];
  const setStep = (step, focus = false) => {
    activeStep = step;
    workbench.querySelectorAll("[data-functions-col]").forEach((node) => { node.hidden = node.dataset.functionsCol !== step; });
    workbench.querySelectorAll("[data-functions-step]").forEach((node) => {
      if (node.dataset.functionsStep === step) node.setAttribute("aria-current", "step");
      else node.removeAttribute("aria-current");
    });
    const prev = workbench.querySelector("[data-functions-prev]");
    const next = workbench.querySelector("[data-functions-next]");
    prev.hidden = step === "look";
    next.hidden = step === "use";
    next.textContent = step === "look" ? L("下一步：判断规则") : L("下一步：试跑与启用");
    workbench.querySelector("[data-functions-columns]").scrollTop = 0;
    if (focus) workbench.querySelector('[data-functions-col="' + step + '"] h2')?.focus();
  };
  workbench.querySelectorAll("[data-functions-step]").forEach((node) => node.addEventListener("click", () => setStep(node.dataset.functionsStep, true)));
  workbench.querySelector("[data-functions-prev]").addEventListener("click", () => setStep(stepOrder[Math.max(0, stepOrder.indexOf(activeStep) - 1)], true));
  workbench.querySelector("[data-functions-next]").addEventListener("click", () => setStep(stepOrder[Math.min(2, stepOrder.indexOf(activeStep) + 1)], true));
  let records = [];
  let selected = null;
  let selectionSeq = 0;
  let openingId = null;
  let saveTimer = 0;
  let dirty = false;
  let editRevision = 0;
  let listSeq = 0;
  let usagesSeq = 0;
  const configurationRequests = new WeakMap();
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
  const matchesScene = (row, record) => row.destination_id === record?.scene_id
    && (!record.scene_version || row.scene_version === record.scene_version)
    && (!record.scene_provider_id || row.provider_id === record.scene_provider_id);
  const destOf = (id, record = selected) => {
    const reference = record?.scene_id === id ? record : { scene_id: id };
    const matches = catalog.destinations.filter(row => matchesScene(row, reference));
    return matches.length === 1 ? matches[0] : id ? {
      destination_id: id, scene_version: reference.scene_version, provider_id: reference.scene_provider_id,
      kind: "event", title: L("原用途不可用"), when: "", subject_kinds: [], behavior_ids: [],
      availability: { available: false, reason: L(matches.length > 1 ? "请为原用途选择具体版本。" : "当前范围未注册原用途，请检查插件状态或重新选择。") },
    } : null;
  };
  const behaviorMatches = (row, destId, record = selected) => {
    const dest = destOf(destId, record);
    return row.destination_id === destId && (!row.scene_version || row.scene_version === dest?.scene_version)
      && (!row.provider_id || row.provider_id === dest?.provider_id);
  };
  const behaviorOf = (id, destId = selectedDestId()) => catalog.behaviors.find((row) => row.behavior_id === id && behaviorMatches(row, destId))
    || catalog.behaviors.find((row) => row.behavior_id === id && !row.destination_id) || {
    behavior_id: id,
    title: id,
    effect: "read",
    source: "system",
    plugin_id: "system",
    plugin_title: L("系统"),
    subject_kinds: [],
    clickable: true,
  };
  const behaviorTitle = (behavior) => behavior.source === "mcp" && behavior.hint
    ? L(behavior.hint).split(/[。\\n]/)[0]
    : L(behavior.title);
  const outputLabel = (record, key) => {
    const behavior = catalog.behaviors.find((row) => row.behavior_id === key && (!row.destination_id || behaviorMatches(row, record.scene_id, record)));
    if (behavior) return behaviorTitle(behavior);
    const criterion = Array.isArray(record.criteria) && record.criteria.find((row) => row.key === key);
    return criterion?.description || key;
  };
  const destTitle = (recordOrId) => {
    const id = recordOrId && typeof recordOrId === "object" ? recordOrId.scene_id : recordOrId;
    const dest = destOf(id, typeof recordOrId === "object" ? recordOrId : selected);
    if (dest?.title) return L(dest.title) + (dest.scene_version ? " · v" + dest.scene_version : "");
    return id === "home.dock" ? L("首页") : id === "inbox.next" ? L("Inbox") : id === "feed.capture" ? L("Feed") : id === "agent.mcp" ? L("Agent") : L("还没选");
  };
  const catalogBehaviorIds = () => new Set(catalog.behaviors.filter(row => !row.destination_id || behaviorMatches(row, selectedDestId())).map((row) => row.behavior_id));
  const matchesSubjects = (behavior, kinds) => {
    if (!kinds.length || !behavior.subject_kinds?.length) return true;
    return (behavior.subject_kinds || []).some((kind) => kinds.includes(kind));
  };
  const suggestedBehaviors = (destId, kinds) => {
    const dest = destOf(destId);
    const match = (row) => matchesSubjects(row, kinds);
    if (!destId) return kinds.length ? catalog.behaviors.filter(row => !row.destination_id && match(row)) : [];
    if (destId === "agent.mcp" || dest?.kind === "mcp") return catalog.behaviors.filter(row => row.destination_id === "agent.mcp" && match(row));
    return (dest?.behavior_ids || []).map((id) => behaviorOf(id, destId)).filter(match);
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
    const keys = new Set(outputKeysFromForm());
    const next = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      if (keys.has(key)) next[key] = value;
    });
    return next;
  };
  const updateCriteriaHint = (destId, suggested) => {
    if (!criteriaHint || primitiveOf(selected) !== "choice") return;
    const dest = destOf(destId);
    const follow = criteriaFollowContext(outputKeysFromForm());
    if (dest && dest.kind === "event" && follow && suggested.length >= 2 && outputKeysFromForm().every((key) => catalogBehaviorIds().has(key))) {
      criteriaHint.textContent = L("已按用途提供动作。请补充每个动作的选择条件；切换用途会更新默认动作，自定义结果会保留。");
    } else if (dest && dest.kind === "event" && follow && suggested.length < 2) {
      criteriaHint.textContent = destId === "home.dock" && !feedApi
        ? L("请先选择项目，再配置这个项目可用的首页动作。")
        : suggested.length ? L("可以设置多个判断结果，再为每个结果选择对应动作。") : L("当前没有可用的推荐动作，请检查对象类型、插件状态和权限。");
    } else {
      criteriaHint.textContent = L("至少保留两个结果，说明各自在什么情况下被选中。");
    }
  };
  const syncCriteriaPanel = () => {
    if (!selected) return;
    const destId = selectedDestId();
    const kinds = subjectKindsFromForm();
    const suggested = suggestedBehaviors(destId, kinds);
    if (destOf(destId)?.availability?.available === false) {
      selected = { ...selected, scene_id: destId || null, subject_kinds: kinds };
      renderPalette(selected); renderMap(selected);
      return;
    }
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
    } else if (follow && hasCatalogKeys && destId !== "agent.mcp") {
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
    const target = workspace.hidden ? workbench.querySelector("[data-functions-list-note]") : note;
    if (!target) return;
    target.hidden = !text;
    target.textContent = text || "";
    target.classList.toggle("is-error", Boolean(isError && text));
  };
  const primitiveOf = (record) => record?.primitive || "choice";
  const selectedDestId = () => {
    const current = workbench.querySelector("[data-functions-destination].is-current");
    if (!current) return selected?.scene_id || "";
    return current.dataset.functionsDestination || "";
  };
  const destinationReference = (node) => ({ scene_id: node?.dataset.functionsDestination || null,
    scene_version: Number(node?.dataset.sceneVersion) || null, scene_provider_id: node?.dataset.sceneProvider || null });
  const selectedSceneReference = () => {
    const current = workbench.querySelector("[data-functions-destination].is-current");
    return current ? destinationReference(current) : { scene_id: selected?.scene_id || null,
      scene_version: selected?.scene_version || null, scene_provider_id: selected?.scene_provider_id || null };
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
  const actionMapFromForm = () => {
    if (selectedDestId() !== "agent.mcp") return {};
    const mapped = {};
    mapEl.querySelectorAll("[data-map-key]").forEach((select) => {
      if (select.dataset.mapKey && select.value) mapped[select.dataset.mapKey] = JSON.parse(select.value);
    });
    return mapped;
  };
  const actionReferenceValue = (reference) => reference ? JSON.stringify({ capability_id: reference.capability_id,
    version: reference.version, provider_id: reference.provider_id }) : "";
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
    return picked;
  };
  const mappingReady = (record) => {
    const destId = record.scene_id || "";
    if (!destId || destId === "agent.mcp") return true;
    const dest = destOf(destId, record);
    if (dest?.availability?.available === false) return false;
    const pool = dest?.behavior_ids || [];
    if (!pool.length) return false;
    const kind = primitiveOf(record);
    const keys = kind === "noul"
      ? ["true", "false"]
      : kind === "choice" && Array.isArray(record.criteria)
        ? record.criteria.map((row) => row.key)
        : [];
    if (!keys.length) return false;
    const map = record.scene_map || {};
    return keys.every((key) => pool.includes(map[key] || key) && behaviorOf(map[key] || key).availability?.available !== false);
  };
  const addScoreRow = (value) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.innerHTML = '<code data-score-index></code>'
      + '<input class="mw-input" data-score-level autocomplete="off" placeholder="' + L("档位说明") + '">'
      + '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-score-remove aria-label="' + L("去掉档位") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button>';
    row.querySelector("[data-score-level]").value = value || "";
    row.querySelector("[data-score-level]").setAttribute("aria-label", L("档位说明") + " " + criteriaEl.children.length);
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
    keyInputEl.setAttribute("aria-label", L("结果标识"));
    const desc = document.createElement("input");
    desc.className = "mw-input";
    desc.dataset.choiceDescription = "true";
    desc.autocomplete = "off";
    desc.placeholder = L("怎么判断");
    desc.value = description || "";
    desc.setAttribute("aria-label", L("选择此结果的条件"));
    desc.placeholder = L("什么情况下选择这个结果？");
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
    remove.dataset.choiceRemove = "true";
    remove.setAttribute("aria-label", L("去掉选项"));
    remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
    const label = document.createElement("label");
    label.className = "functions-field functions-option-condition";
    const behavior = catalog.behaviors.find((item) => item.behavior_id === key && (!item.destination_id || behaviorMatches(item, selectedDestId())));
    const caption = document.createElement("span");
    caption.textContent = behavior ? behaviorTitle(behavior) : L("结果") + " · " + (key || "");
    label.append(caption, desc);
    const advanced = document.createElement("details");
    advanced.className = "functions-option-key";
    const summary = document.createElement("summary");
    summary.textContent = L("标识");
    advanced.append(summary, keyInputEl);
    row.append(label, advanced, remove);
    criteriaEl.append(row);
  };
  const sourceLabel = (source) => source === "mcp" ? L("MCP") : source === "plugin" ? L("插件") : L("系统");
  const appendPaletteRow = (behavior, parent) => {
    const row = document.createElement("div");
    row.className = "functions-palette-row";
    const body = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = behaviorTitle(behavior);
    const meta = document.createElement("small");
    const bits = [sourceLabel(behavior.source)];
    if (behavior.plugin_title && behavior.source !== "system") bits.push(behavior.plugin_title);
    if (behavior.hint) bits.push(L(behavior.hint));
    meta.textContent = bits.join(" · ");
    body.append(title, meta);
    const effect = document.createElement("span");
    effect.className = "functions-effect";
    effect.dataset.effect = behavior.effect;
    effect.textContent = behavior.effect === "write" ? L("执行时修改数据") : L("只读");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mw-btn mw-btn--ghost";
    add.dataset.paletteAdd = behavior.behavior_id;
    add.textContent = L("加入");
    add.disabled = behavior.availability?.available === false;
    row.append(body, effect, add);
    parent.append(row);
  };
  const renderPalette = (record) => {
    paletteEl.replaceChildren();
    if (paletteDetails) paletteDetails.hidden = primitiveOf(record) !== "choice" || record.status === "published";
    if (primitiveOf(record) !== "choice" || record.status === "published") return;
    const destId = selectedDestId() || record.scene_id || "";
    const kinds = subjectKindsFromForm();
    const used = new Set(outputKeysFromForm());
    const query = (paletteSearch?.value || "").trim().toLocaleLowerCase();
    const fresh = suggestedBehaviors(destId, kinds).filter((row) => row && !used.has(row.behavior_id))
      .filter((row) => !query || [row.title, row.hint, row.plugin_title, row.behavior_id].join(" ").toLocaleLowerCase().includes(query));
    if (!fresh.length) {
      const hint = document.createElement("p");
      hint.className = "functions-hint";
      hint.textContent = query ? L("没有匹配的能力，试试其他关键词。") : !destId && !kinds.length ? L("先选择用途或判断对象，即可查看相关能力。") : L("没有可添加的动作：可能已加入全部结果，或所选对象不适用于此用途。");
      paletteEl.append(hint);
      return;
    }
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
    const dest = destOf(destId, record);
    const eventDest = dest && dest.kind === "event";
    const kind = primitiveOf(record);
    const agentDest = destId === "agent.mcp";
    if (mapPanel) mapPanel.hidden = !(eventDest || agentDest) || kind === "score";
    if (!(eventDest || agentDest) || kind === "score") return;
    mapPanel.querySelector("[data-functions-map-title]").textContent = L(agentDest ? "结果推荐的能力" : "结果对应的页面动作");
    mapPanel.querySelector("[data-functions-map-hint]").textContent = L(agentDest
      ? "可为每个结果选择推荐能力，也可只返回判断。推荐不会自动执行动作。"
      : "每个结果都需要对应一个动作，才能在所选页面启用。");
    const pool = agentDest ? suggestedBehaviors(destId, subjectKindsFromForm()) : (dest.behavior_ids || []).map(id => behaviorOf(id));
    const map = agentDest ? record.action_map || {} : record.scene_map || {};
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
      empty.textContent = L(agentDest ? "只返回判断" : "请选择对应动作");
      select.append(empty);
      pool.forEach((behavior) => {
        const option = document.createElement("option");
        option.value = agentDest ? actionReferenceValue(behavior.action_ref) : behavior.behavior_id;
        option.textContent = behavior.title + (agentDest ? " · " + behavior.plugin_title + " · v" + behavior.action_ref.version : "")
          + (behavior.availability?.available === false ? " · " + behavior.availability.reason : "");
        option.disabled = behavior.availability?.available === false;
        select.append(option);
      });
      const current = agentDest ? actionReferenceValue(map[row.key]) : map[row.key] || row.key;
      if (current && ![...select.options].some(option => option.value === current)) {
        const missing = document.createElement("option");
        missing.value = current;
        missing.textContent = L("原动作不可用，请重新选择");
        missing.disabled = true;
        select.append(missing);
      }
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
      criteriaLabel.textContent = L("返回哪些结果");
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
    const selectedKinds = new Set(record.subject_kinds || []);
    const list = workbench.querySelector(".functions-dest-list");
    list.replaceChildren();
    const destinations = [{ destination_id: "", kind: "none", title: L("独立使用"), when: L("先写规则、试跑，暂不接入页面。") }, ...catalog.destinations];
    const chosen = destOf(destId, record);
    if (destId && !catalog.destinations.includes(chosen)) destinations.push(chosen);
    destinations.forEach(destination => {
      const button = document.createElement("button");
      button.type = "button"; button.className = "functions-dest";
      button.dataset.functionsDestination = destination.destination_id; button.dataset.kind = destination.kind;
      if (destination.scene_version) button.dataset.sceneVersion = String(destination.scene_version);
      if (destination.provider_id) button.dataset.sceneProvider = destination.provider_id;
      const title = document.createElement("strong"); title.textContent = L(destination.title) + (destination.scene_version ? " · v" + destination.scene_version : "");
      const hint = document.createElement("small"); hint.textContent = destination.availability?.available === false ? L(destination.availability.reason) : L(destination.when || "");
      button.append(title, hint); list.append(button);
    });
    for (const kindId of selectedKinds) if (![...workbench.querySelectorAll("[data-functions-source]")].some(node => node.dataset.functionsSource === kindId)) {
      const label = document.createElement("label"); label.className = "functions-chip";
      const input = document.createElement("input"); input.type = "checkbox"; input.className = "mw-check"; input.dataset.functionsSource = kindId;
      const text = document.createElement("span"); text.textContent = kindId + " · " + L("原对象类型");
      label.append(input, text); workbench.querySelector("[data-functions-subject-list]").append(label);
    }
    workbench.querySelectorAll("[data-functions-destination]").forEach((node) => {
      const id = node.dataset.functionsDestination || "";
      const reference = destinationReference(node);
      const on = id === destId && (id ? reference.scene_version === (chosen?.scene_version || null) && reference.scene_provider_id === (chosen?.provider_id || null) : true);
      node.classList.toggle("is-current", on);
      node.setAttribute("aria-pressed", String(on));
      const dest = destOf(id, reference);
      const related = dest && dest.subject_kinds && dest.subject_kinds.some((item) => selectedKinds.has(item));
      node.classList.toggle("is-related", Boolean(related && !on));
      node.disabled = record.status === "published" || dest?.availability?.available === false || (kind === "score" && dest && dest.kind === "event");
    });
    if (choiceOnlyHint) choiceOnlyHint.hidden = kind !== "score";
    destinationHint.textContent = destOf(destId)?.availability?.available === false ? L(destOf(destId).availability.reason) : destId === "agent.mcp"
      ? L("返回建议给 Agent；不会自动执行工具。实际调用取决于工具启用状态和权限。")
      : destId === "feed.capture" ? L("发布后，到 Feed 任务的捕捉规则中选择此函数；具体处理由该规则决定。")
      : destId ? L("判断结果用于推荐页面动作。发布后还需要在当前项目启用。")
      : L("可先保存和试跑，不必绑定任何页面。发布后也可通过接口调用。");
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
      remove.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
      remove.dataset.sampleRemove = "true";
      remove.setAttribute("aria-label", L("去掉样例"));
      remove.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
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
    else if (kind === "choice") title.textContent = L("已选出") + " " + outputLabel(record, preview.choice || "");
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
        code.textContent = outputLabel(record, key);
        code.title = key;
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
  const ruleRequest = (record, suffix, method = "GET", body) => {
    const path = "/api/functions/" + encodeURIComponent(record.id) + "/" + suffix;
    return feedApi ? feedApi(path, method, body) : request(method, path, body);
  };
  const renderUsages = async (record) => {
    if (!usagesEl) return;
    const sequence = ++usagesSeq;
    const current = () => selected?.id === record.id && sequence === usagesSeq;
    usagesEl.replaceChildren();
    const head = document.createElement("strong"); head.textContent = L("使用状态"); usagesEl.append(head);
    const line = (text) => { const p = document.createElement("p"); p.textContent = L(text); usagesEl.append(p); return p; };
    if (record.status !== "published") {
      line("草稿尚未生效。发布后将在这里显示可配置的位置。");
      return;
    }
    try {
      const [uses, locations] = await Promise.all([ruleRequest(record, "usages"), ruleRequest(record, "targets")]);
      if (!current()) return;
      const usages = uses.usages || [];
      const sameRule = (binding) => binding?.function?.capability_id === "functions.published." + record.function_key
        && binding.function.version === record.version && binding.function.provider_id === "system.functions";
      const targets = (locations.targets || []).filter(target => target.availability.available || sameRule(target.binding) || target.scene_id === record.scene_id);
      const title = (container, row) => {
        if (row.href?.startsWith("/") && !row.href.startsWith("//")) {
          const link = document.createElement("a"); link.href = row.href; link.textContent = row.title; container.append(link);
        } else container.append(document.createTextNode(row.title || destTitle(row.scene_id)));
      };
      const targetKey = (row) => JSON.stringify([row.scene_id, row.scene_version, row.binding_id, row.project_id]);
      const shown = new Set();
      targets.forEach(target => {
        const own = sameRule(target.binding);
        const active = own && target.binding.enabled;
        const section = document.createElement("div"); section.className = "functions-usage-target";
        const summary = document.createElement("p"); title(summary, target);
        const state = own ? (active ? "已启用" : "已停用") : target.binding?.enabled ? "正在使用另一条判断规则" : "尚未启用此判断";
        section.append(summary);
        const detail = document.createElement("p");
        detail.textContent = destTitle({ scene_id: target.scene_id, scene_version: target.scene_version, scene_provider_id: target.provider_id }) + " · " + L(state); section.append(detail);
        const availability = active ? target.configuration_availability : target.availability;
        if (!target.availability.available) {
          const reason = document.createElement("p"); reason.textContent = L(target.availability.reason); section.append(reason);
        }
        const button = document.createElement("button"); button.type = "button"; button.className = "mw-btn mw-btn--secondary";
        button.textContent = L(active ? "停用" : target.binding && !own ? "换成这个" : "在此启用");
        button.dataset.functionsSceneBind = active ? "off" : "on";
        button.dataset.functionsBindingId = target.binding_id;
        button.dataset.functionsSceneId = target.scene_id;
        button.dataset.functionsSceneVersion = String(target.scene_version);
        button.disabled = !availability.available;
        configurationRequests.set(button, { id: record.id, scene_id: target.scene_id, scene_version: target.scene_version,
          provider_id: target.provider_id, binding_id: target.binding_id, expected_revision: target.revision, enabled: !active });
        section.append(button); usagesEl.append(section);
        if (own) shown.add(targetKey(target));
      });
      usages.filter(row => !shown.has(targetKey(row))).forEach(row => {
        const summary = document.createElement("p"); title(summary, row);
        const state = row.availability?.available === false ? row.availability.reason : row.enabled === false ? "已停用" : row.enabled === true ? "已启用" : "";
        if (state) summary.append(document.createTextNode(" · " + L(state)));
        usagesEl.append(summary);
      });
      if (!targets.length && !usages.length) line(record.scene_id === "agent.mcp"
        ? "已发布，可供授权的 Agent 调用。返回判断和推荐能力，具体动作需另行调用。"
        : record.scene_id ? "当前范围没有可配置的位置。请先在对应场景中创建规则或检查插件状态。"
        : "当前范围未绑定消费场景，可独立调用。");
    } catch (error) {
      if (current()) line(error.message || "未能读取实际使用位置，请重试。");
    }
  };
  const fillEditor = (record) => {
    const switching = selected?.id !== record.id;
    selected = record;
    if (switching) {
      dirty = false;
      workbench.querySelector("[data-functions-subject-details]").open = Boolean(record.subject_kinds?.length);
      paletteDetails.open = false;
      setStep(record.status === "published" ? "use" : "look");
      paletteSearch.value = "";
    }
    saveStatus.textContent = record.status === "published" ? L("已发布 · 规则只读") : L("草稿自动保存");
    workbench.querySelector("[data-functions-kind-description]").textContent = primitiveOf(record) === "noul"
      ? L("是非判断：返回成立的概率，例如材料是否足够。")
      : primitiveOf(record) === "score" ? L("等级评分：按你定义的档位返回分数，例如紧急程度。")
      : L("结果选择：从你定义的结果中选出一个，例如跟进、保存或忽略。");
    releaseHint.textContent = record.status === "published" ? L("规则已锁定，可以继续试跑，并查看或调整使用状态。") : L("发布会锁定名称、规则和用途。确认试跑符合预期后再发布；发布不会自动启用页面判断。");
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
    const next = new URL(location.href); next.searchParams.delete("rule"); next.searchParams.delete("key");
    history.replaceState(null, "", next);
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
      const primitive = record.primitive === "noul" ? L("是非") : record.primitive === "score" ? L("评分") : L("选择");
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
    const payload = feedApi ? await feedApi("/api/functions/catalog", "GET") : await request("GET", "/api/functions/catalog");
    if (payload.catalog) catalog = payload.catalog;
    const subjects = workbench.querySelector("[data-functions-subject-list]");
    if (catalog.subjects.length && subjects) {
      const checked = new Set(selected?.subject_kinds || subjectKindsFromForm());
      subjects.replaceChildren();
      catalog.subjects.forEach((subject) => {
        const label = document.createElement("label");
        label.className = "functions-chip";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "mw-check";
        input.dataset.functionsSource = subject.subject_kind;
        input.checked = checked.has(subject.subject_kind);
        const title = document.createElement("span");
        title.textContent = L(subject.title);
        label.append(input, title);
        subjects.append(label);
      });
    }
  };
  const loadList = async (opts = {}) => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/functions");
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
    ...selectedSceneReference(),
    subject_kinds: subjectKindsFromForm(),
    scene_map: sceneMapFromForm(),
    action_map: actionMapFromForm(),
    updated_at: selected.updated_at,
  });
  let saving = null;
  const saveDraft = async () => {
    clearTimeout(saveTimer); saveTimer = 0;
    if (saving) await saving;
    const operation = persistDraft();
    saving = operation;
    try { return await operation; } finally { if (saving === operation) saving = null; }
  };
  const persistDraft = async () => {
    if (!selected || selected.status === "published") return selected;
    const savingId = selected.id;
    const body = draftBody();
    const revision = editRevision;
    saveStatus.textContent = L("正在保存…");
    try {
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(savingId), body);
      const saved = payload.function;
      records = records.some((item) => item.id === saved.id)
        ? records.map((item) => item.id === saved.id ? saved : item)
        : [saved, ...records];
      if (selected?.id !== savingId) {
        renderList();
        return saved;
      }
      selected = saved;
      if (revision === editRevision) dirty = false;
      saveStatus.textContent = dirty ? L("有更改，等待保存…") : L("已保存");
      renderList();
      titleEl.textContent = selected.name;
      showNote("", false);
      return selected;
    } catch (error) {
      if (selected?.id === savingId) {
        saveStatus.textContent = L("未保存 · 请修正后重试");
        await loadList({ preserveForm: true }).catch(() => {});
      }
      throw error;
    }
  };
  const queueSave = () => {
    if (!selected || selected.status === "published") return;
    const savingId = selected.id;
    dirty = true;
    editRevision++;
    saveStatus.textContent = L("有更改，等待保存…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void saveDraft().catch((error) => {
        if (selected?.id === savingId) showNote(error.message, true);
      });
    }, 280);
  };
  const remember = (record) => {
    const next = new URL(location.href); next.searchParams.set("rule", record.id); next.searchParams.delete("key");
    history.replaceState(null, "", next);
    const listNote = workbench.querySelector("[data-functions-list-note]");
    if (listNote) listNote.hidden = true;
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
      if (selected && (saveTimer || saving || dirty)) { clearTimeout(saveTimer); saveTimer = 0; await saveDraft(); }
      await loadCatalog();
      const payload = await request("GET", "/api/functions/" + encodeURIComponent(id));
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
  let creating = false;
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (creating) return;
    creating = true;
    const createNote = workbench.querySelector("[data-functions-create-note]");
    createNote.textContent = "";
    const submitter = event.submitter;
    const primitive = submitter && submitter.value ? submitter.value : "choice";
    createForm.querySelectorAll("button").forEach((node) => { node.disabled = true; });
    try {
      if (dirty || saveTimer || saving) await saveDraft();
      const payload = await request("POST", "/api/functions", { primitive });
      closeCreate();
      await loadList();
      remember(payload.function);
    } catch (error) {
      createNote.textContent = error.message || L("保存失败");
    } finally {
      creating = false;
      createForm.querySelectorAll("button").forEach((node) => { node.disabled = false; });
    }
  });
  workbench.querySelector("[data-functions-back]").addEventListener("click", async () => {
    try {
      await saveDraft();
      closeEditor();
      await loadList();
    } catch (error) { showNote(error.message, true); }
  });
  deleteBtn.addEventListener("click", async () => {
    if (!selected || selected.status === "published") return;
    if (!window.confirm(L("确定删除这个草稿？"))) return;
    try {
      await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/delete", {
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
    const args = button && configurationRequests.get(button);
    if (!args || button.disabled || selected?.id !== args.id) return;
    const record = selected;
    button.disabled = true;
    try {
      await ruleRequest(record, "configure", "POST", args);
      if (selected?.id === record.id) await renderUsages(selected);
    } catch (error) {
      if (selected?.id !== record.id) return;
      await renderUsages(selected);
      if (selected?.id !== record.id) return;
      const status = document.createElement("p"); status.setAttribute("role", "alert");
      status.textContent = error.message || L("配置未保存，请重试。"); usagesEl.append(status);
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
    const reference = destinationReference(button);
    if (destId === (selected.scene_id || "") && reference.scene_version === (selected.scene_version || null)
      && reference.scene_provider_id === (selected.scene_provider_id || null)) return;
    selected = {
      ...selected,
      ...reference,
      scene_map: destId && destId !== "agent.mcp" ? (selected.scene_map || {}) : {},
      action_map: destId === "agent.mcp" ? (selected.action_map || {}) : {},
    };
    renderRoute(selected);
    syncCriteriaPanel();
    void renderUsages(selected);
    queueSave();
  });
  paletteSearch.addEventListener("input", () => { if (selected) renderPalette(selected); });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-functions-palette-search], [data-functions-preview-input]")) return;
    if (event.target.matches("[data-choice-key], [data-choice-description]")) {
      if (selected) renderMap({ ...selected, criteria: criteriaFromForm(), scene_map: sceneMapFromForm(), action_map: actionMapFromForm() });
    }
    queueSave();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-functions-source]")) {
      if (selected && selected.status !== "published") {
        selected = { ...selected, subject_kinds: subjectKindsFromForm(), scene_map: sceneMapFromForm(), action_map: actionMapFromForm() };
        renderRoute(selected);
        syncCriteriaPanel();
      }
    }
    if (event.target.matches("[data-map-key]") && selected) {
      selected = { ...selected, scene_map: sceneMapFromForm(), action_map: actionMapFromForm(), criteria: criteriaFromForm() };
      void renderUsages(selected);
    }
    queueSave();
  });
  form.addEventListener("click", (event) => {
    const paletteAdd = event.target.closest("[data-palette-add]");
    if (paletteAdd && selected?.status !== "published" && primitiveOf(selected) === "choice") {
      const behavior = behaviorOf(paletteAdd.dataset.paletteAdd);
      selected = { ...selected, scene_map: sceneMapFromForm(), action_map: actionMapFromForm() };
      if (behavior.action_ref && selectedDestId() === "agent.mcp") selected.action_map[behavior.behavior_id] = behavior.action_ref;
      if (!outputKeysFromForm().includes(behavior.behavior_id)) {
        addChoiceRow(behavior.behavior_id, behaviorTitle(behavior));
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
        const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/samples/delete", {
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
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(selected.id) + "/samples", {
        input: previewInput.value,
        updated_at: selected.updated_at,
      });
      remember(payload.function);
    } catch (error) {
      showNote(error.message, true);
    }
  });
  rowsEl.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    const record = records.find((item) => item.id === row.dataset.functionId);
    if (record) {
      if (selected?.id === record.id) return;
      try {
        if (saveTimer || saving || dirty) await saveDraft();
        fillEditor(record);
      } catch (error) { showNote(error.message, true); }
    }
  });
  let previewing = false;
  const previewBtn = workbench.querySelector("[data-functions-preview]");
  previewBtn.addEventListener("click", async () => {
    if (!selected || previewing) return;
    const previewId = selected.id;
    previewing = true;
    workbench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = true; });
    publishBtn.disabled = true;
    previewBtn.disabled = true;
    previewBtn.textContent = L("正在试跑…");
    showNote(L("正在请求判断，通常需要几秒。"), false);
    try {
      await saveDraft();
      if (selected?.id !== previewId) return;
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(previewId) + "/preview", {
        input: previewInput.value,
        updated_at: selected.updated_at,
      });
      if (selected?.id !== previewId) return;
      remember(payload.function);
    } catch (error) {
      if (selected?.id === previewId) {
        if (error.code === "functions.invalid" && !instructionsInput.value.trim()) setStep("fn", true);
        showNote(error.message, true);
        if (error.code === "functions.provider_not_configured" || error.code === "actions.connection_required") {
          const link = document.createElement("a");
          const connection = new URL("/capabilities/connections", location.origin);
          connection.searchParams.set("connector", "typesafe");
          const current = new URL(location.href);
          for (const key of ["project", "desktop"]) if (current.searchParams.has(key)) connection.searchParams.set(key, current.searchParams.get(key));
          link.href = connection.pathname + connection.search;
          link.textContent = L("连接判断服务");
          note.append(document.createTextNode(" "), link);
        }
      }
    } finally {
      previewing = false;
      workbench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = false; });
      publishBtn.disabled = false;
      previewBtn.disabled = false;
      previewBtn.textContent = L("试跑");
    }
  });
  publishBtn.addEventListener("click", async () => {
    if (!selected || publishBtn.disabled) return;
    if (selectedDestId() && selectedDestId() !== "agent.mcp" && !mappingReady({ ...selected, scene_id: selectedDestId(), criteria: criteriaFromForm(), scene_map: sceneMapFromForm() })) {
      setStep("fn", true);
      showNote(L("还有结果未对应页面动作，请补齐后再发布。"), true);
      return;
    }
    const publishId = selected.id;
    publishBtn.disabled = true;
    showNote("", false);
    try {
      await saveDraft();
      if (selected?.id !== publishId) return;
      const path = "/api/functions/" + encodeURIComponent(publishId) + "/publish";
      const body = { updated_at: selected.updated_at };
      const payload = feedApi ? await feedApi(path, "POST", body) : await request("POST", path, body);
      if (selected?.id !== publishId) return;
      remember(payload.function);
      await loadList();
    } catch (error) {
      if (selected?.id === publishId) showNote(error.message, true);
    } finally { publishBtn.disabled = false; }
  });
  const load = () => loadCatalog().then(loadList).catch((error) => {
    empty.hidden = false;
    empty.querySelector("p").textContent = error.message || L("Functions 请求失败");
    let retry = empty.querySelector("button");
    if (!retry) {
      retry = document.createElement("button");
      retry.type = "button";
      retry.className = "mw-btn mw-btn--secondary";
      retry.textContent = L("重新加载");
      retry.addEventListener("click", () => { retry.remove(); void load(); });
      empty.append(retry);
    }
  });
  rowsEl.addEventListener("click", (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    workbench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: row.dataset.functionId } }));
  });
  void load().then(() => {
    const params = new URL(location.href).searchParams;
    const id = params.get("rule") || records.find(record => record.function_key === params.get("key"))?.id;
    if (id) workbench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: id } }));
    else if (params.get("key")) showNote(L("找不到这条判断规则，请从列表重新选择。"), true);
  });
}
`;
