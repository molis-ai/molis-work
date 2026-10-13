/** Functions workbench: purpose, rules, then preview and activation. */
export const FUNCTIONS_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L, feedApi, root, page } = host;
  const bench = root.matches?.("[data-functions=workbench]") ? root : root.querySelector("[data-functions=workbench]");
  if (!bench || bench.dataset.bound === "1") return; bench.dataset.bound = "1";
  const list = bench.querySelector("[data-functions=directory]");
  const rowsEl = bench.querySelector("[data-functions-rows]");
  const empty = bench.querySelector("[data-functions-empty]");
  const workspace = bench.querySelector("[data-functions-stage-workspace]");
  const titleEl = bench.querySelector("[data-functions-editor-title]");
  const statusEl = bench.querySelector("[data-functions-editor-status]");
  const deleteBtn = bench.querySelector("[data-functions-delete]");
  const form = bench.querySelector("[data-functions-editor]");
  const nameInput = bench.querySelector("[data-functions-name]");
  const keyInput = bench.querySelector("[data-functions-key]");
  const instr = bench.querySelector("[data-functions-instructions]");
  const colLabel = bench.querySelector("[data-functions-criteria-label]");
  const addCol = bench.querySelector("[data-functions-add-criterion]");
  const criteriaHead = bench.querySelector("[data-functions-criteria-head]");
  const colHint = bench.querySelector("[data-functions-criteria-hint]");
  const cols = bench.querySelector("[data-functions-criteria]");
  const palette = bench.querySelector("[data-functions-palette]");
  const mapPanel = bench.querySelector("[data-functions-map-panel]");
  const mapEl = bench.querySelector("[data-functions-map]");
  const samplesEl = bench.querySelector("[data-functions-samples]");
  const previewFn = bench.querySelector("[data-functions-preview-input]");
  const publish = bench.querySelector("[data-functions-publish]");
  const note = bench.querySelector("[data-functions-note]");
  const lastTry = bench.querySelector("[data-functions-last-preview]");
  const usedBy = bench.querySelector("[data-functions-usages]");
  const createBox = bench.querySelector("[data-functions-create-dialog]");
  const createForm = bench.querySelector("[data-functions-create-form]");
  const choiceHint = bench.querySelector("[data-functions-choice-only]");
  const savedAt = bench.querySelector("[data-functions-save-status]");
  const poolQuery = bench.querySelector("[data-functions-palette-search]");
  const poolDetail = bench.querySelector("[data-functions-palette-details]");
  const destinationHint = bench.querySelector("[data-functions-destination-hint]");
  const releaseHint = bench.querySelector("[data-functions-release-hint]");
  let activeStep = "look";
  const stepOrder = ["look", "fn", "use"];
  const setStep = (step, focus = false) => {
    activeStep = step;
    bench.querySelectorAll("[data-functions-col]").forEach((node) => { node.hidden = node.dataset.functionsCol !== step; });
    bench.querySelectorAll("[data-functions-step]").forEach((node) => {
      if (node.dataset.functionsStep === step) node.setAttribute("aria-current", "step");
      else node.removeAttribute("aria-current");
    });
    const prev = bench.querySelector("[data-functions-prev]");
    const next = bench.querySelector("[data-functions-next]");
    prev.hidden = step === "look";
    next.hidden = step === "use";
    next.textContent = step === "look" ? L("下一步：判断规则") : L("下一步：试跑与启用");
    bench.querySelector("[data-functions-columns]").scrollTop = 0;
    if (focus) bench.querySelector('[data-functions-col="' + step + '"] h2')?.focus();
  };
  bench.querySelectorAll("[data-functions-step]").forEach((node) => node.addEventListener("click", () => setStep(node.dataset.functionsStep, true)));
  bench.querySelector("[data-functions-prev]").addEventListener("click", () => setStep(stepOrder[Math.max(0, stepOrder.indexOf(activeStep) - 1)], true));
  bench.querySelector("[data-functions-next]").addEventListener("click", () => setStep(stepOrder[Math.min(2, stepOrder.indexOf(activeStep) + 1)], true));
  let records = [];
  let sel = null;
  let pickSeq = 0;
  let openingId = null;
  let timer = 0;
  let dirty = false;
  let editRev = 0;
  let listSeq = 0;
  let usagesSeq = 0;
  const cfgCalls = new WeakMap();
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
  const destOf = (id, record = sel) => {
    const reference = record?.scene_id === id ? record : { scene_id: id };
    const matches = catalog.destinations.filter(row => matchesScene(row, reference));
    return matches.length === 1 ? matches[0] : id ? {
      destination_id: id, scene_version: reference.scene_version, provider_id: reference.scene_provider_id,
      kind: "event", title: L("原用途不可用"), when: "", subject_kinds: [], behavior_ids: [],
      availability: { available: false, reason: L(matches.length > 1 ? "请为原用途选择具体版本。" : "当前范围未注册原用途，请检查插件状态或重新选择。") },
    } : null;
  };
  const matchesFn = (row, destId, record = sel) => {
    const dest = destOf(destId, record);
    return row.destination_id === destId && (!row.scene_version || row.scene_version === dest?.scene_version)
      && (!row.provider_id || row.provider_id === dest?.provider_id);
  };
  const behOf = (id, destId = destFn()) => catalog.behaviors.find((row) => row.behavior_id === id && matchesFn(row, destId))
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
  const behTitle = (behavior) => behavior.source === "mcp" && behavior.hint
    ? L(behavior.hint).split(/[。\\n]/)[0]
    : L(behavior.title);
  const outputLabel = (record, key) => {
    const behavior = catalog.behaviors.find((row) => row.behavior_id === key && (!row.destination_id || matchesFn(row, record.scene_id, record)));
    if (behavior) return behTitle(behavior);
    const criterion = Array.isArray(record.criteria) && record.criteria.find((row) => row.key === key);
    return criterion?.description || key;
  };
  const destTitle = (recordOrId) => {
    const id = recordOrId && typeof recordOrId === "object" ? recordOrId.scene_id : recordOrId;
    const dest = destOf(id, typeof recordOrId === "object" ? recordOrId : sel);
    if (dest?.title) return L(dest.title) + (dest.scene_version ? " · v" + dest.scene_version : "");
    return id === "home.dock" ? L("首页") : id === "inbox.next" ? L("Inbox") : id === "feed.capture" ? L("Feed") : id === "agent.mcp" ? L("Agent") : L("还没选");
  };
  const idsFn = () => new Set(catalog.behaviors.filter(row => !row.destination_id || matchesFn(row, destFn())).map((row) => row.behavior_id));
  const matchesSubjects = (behavior, kinds) => {
    if (!kinds.length || !behavior.subject_kinds?.length) return true;
    return (behavior.subject_kinds || []).some((kind) => kinds.includes(kind));
  };
  const suggestedFn = (destId, kinds) => {
    const dest = destOf(destId);
    const match = (row) => matchesSubjects(row, kinds);
    if (!destId) return kinds.length ? catalog.behaviors.filter(row => !row.destination_id && match(row)) : [];
    if (destId === "agent.mcp" || dest?.kind === "mcp") return catalog.behaviors.filter(row => row.destination_id === "agent.mcp" && match(row));
    return (dest?.behavior_ids || []).map((id) => behOf(id, destId)).filter(match);
  };
  const defaultChoiceRows = () => [{ key: "yes", description: "" }, { key: "no", description: "" }];
  const followCtx = (keys) => {
    if (!keys.length) return true;
    if (keys.length === 2 && keys[0] === "yes" && keys[1] === "no") return true;
    const ids = idsFn();
    return keys.every((key) => ids.has(key));
  };
  const currentChoiceMap = () => {
    const map = new Map();
    cols.querySelectorAll("[data-choice-row]").forEach((row) => {
      const key = ((row.querySelector("[data-choice-key]") || {}).value || "").trim();
      if (!key) return;
      map.set(key, ((row.querySelector("[data-choice-description]") || {}).value || "").trim());
    });
    return map;
  };
  const applyRows = (rows) => {
    const prev = currentChoiceMap();
    cols.replaceChildren();
    rows.forEach((row) => {
      addChoice(row.key, prev.has(row.key) ? prev.get(row.key) : (row.description || ""));
    });
  };
  const pruneSceneMap = (map, destId) => {
    const dest = destOf(destId);
    if (!destId || destId === "agent.mcp" || dest?.kind !== "event") return {};
    const keys = new Set(outs());
    const next = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      if (keys.has(key)) next[key] = value;
    });
    return next;
  };
  const hintFn = (destId, suggested) => {
    if (!colHint || prim(sel) !== "choice") return;
    const dest = destOf(destId);
    const follow = followCtx(outs());
    if (dest && dest.kind === "event" && follow && suggested.length >= 2 && outs().every((key) => idsFn().has(key))) {
      colHint.textContent = L("已按用途提供动作。请补充每个动作的选择条件；切换用途会更新默认动作，自定义结果会保留。");
    } else if (dest && dest.kind === "event" && follow && suggested.length < 2) {
      colHint.textContent = destId === "home.dock" && !feedApi
        ? L("请先选择项目，再配置这个项目可用的首页动作。")
        : suggested.length ? L("可以设置多个判断结果，再为每个结果选择对应动作。") : L("当前没有可用的推荐动作，请检查对象类型、插件状态和权限。");
    } else {
      colHint.textContent = L("至少保留两个结果，说明各自在什么情况下被选中。");
    }
  };
  const syncCols = () => {
    if (!sel) return;
    const destId = destFn();
    const kinds = subj();
    const suggested = suggestedFn(destId, kinds);
    if (destOf(destId)?.availability?.available === false) {
      sel = { ...sel, scene_id: destId || null, subject_kinds: kinds };
      paintFn(sel); mapView(sel);
      return;
    }
    if (sel.status === "published" || prim(sel) !== "choice") {
      sel = { ...sel, scene_id: destId || null, subject_kinds: kinds };
      hintFn(destId, suggested);
      paintFn(sel);
      mapView(sel);
      return;
    }
    const keys = outs();
    const dest = destOf(destId);
    const eventDest = Boolean(dest && dest.kind === "event");
    const follow = followCtx(keys);
    const hasCatalogKeys = keys.some((key) => idsFn().has(key));
    let nextMap = sel.scene_map || {};
    if (follow && eventDest && suggested.length >= 2) {
      applyRows(suggested.map((row) => ({ key: row.behavior_id, description: row.title || "" })));
      nextMap = {};
    } else if (follow && hasCatalogKeys && destId !== "agent.mcp") {
      applyRows(defaultChoiceRows());
      nextMap = {};
    } else if (!eventDest) {
      nextMap = {};
    } else {
      nextMap = pruneSceneMap(nextMap, destId);
    }
    sel = {
      ...sel,
      scene_id: destId || null,
      subject_kinds: kinds,
      scene_map: nextMap,
      criteria: fields(),
    };
    hintFn(destId, suggested);
    paintFn(sel);
    mapView(sel);
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
  const say = (text, isError) => {
    const target = workspace.hidden ? bench.querySelector("[data-functions-list-note]") : note;
    if (!target) return;
    target.hidden = !text;
    target.textContent = text || "";
    target.classList.toggle("is-error", Boolean(isError && text));
  };
  const prim = (record) => record?.primitive || "choice";
  const destFn = () => {
    const current = bench.querySelector("[data-functions-destination].is-current");
    if (!current) return sel?.scene_id || "";
    return current.dataset.functionsDestination || "";
  };
  const destRef = (node) => ({ scene_id: node?.dataset.functionsDestination || null,
    scene_version: Number(node?.dataset.sceneVersion) || null, scene_provider_id: node?.dataset.sceneProvider || null });
  const sceneRef = () => {
    const current = bench.querySelector("[data-functions-destination].is-current");
    return current ? destRef(current) : { scene_id: sel?.scene_id || null,
      scene_version: sel?.scene_version || null, scene_provider_id: sel?.scene_provider_id || null };
  };
  const subj = () => [...bench.querySelectorAll("[data-functions-source]:checked")]
    .map((node) => node.dataset.functionsSource)
    .filter(Boolean);
  const outs = () => {
    const kind = prim(sel);
    if (kind === "noul") return ["true", "false"];
    if (kind === "score") return [];
    return [...cols.querySelectorAll("[data-choice-row]")].map((row) => {
      const key = ((row.querySelector("[data-choice-key]") || {}).value || "").trim();
      return key;
    }).filter(Boolean);
  };
  const scenes = () => {
    const destId = destFn();
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
  const acts = () => {
    if (destFn() !== "agent.mcp") return {};
    const mapped = {};
    mapEl.querySelectorAll("[data-map-key]").forEach((select) => {
      if (select.dataset.mapKey && select.value) mapped[select.dataset.mapKey] = JSON.parse(select.value);
    });
    return mapped;
  };
  const actRef = (reference) => reference ? JSON.stringify({ capability_id: reference.capability_id,
    version: reference.version, provider_id: reference.provider_id }) : "";
  const fields = () => {
    const kind = prim(sel);
    if (kind === "noul") {
      return {
        true_description: (cols.querySelector("[data-noul-true]") || {}).value || "",
        false_description: (cols.querySelector("[data-noul-false]") || {}).value || "",
      };
    }
    if (kind === "score") {
      return [...cols.querySelectorAll("[data-score-level]")].map((input) => input.value);
    }
    const picked = [...cols.querySelectorAll("[data-choice-row]")].map((row) => ({
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
    const kind = prim(record);
    const keys = kind === "noul"
      ? ["true", "false"]
      : kind === "choice" && Array.isArray(record.criteria)
        ? record.criteria.map((row) => row.key)
        : [];
    if (!keys.length) return false;
    const map = record.scene_map || {};
    return keys.every((key) => pool.includes(map[key] || key) && behOf(map[key] || key).availability?.available !== false);
  };
  const addScoreRow = (value) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.innerHTML = '<code data-score-index></code>'
      + '<input class="mw-input" data-score-level autocomplete="off" placeholder="' + L("档位说明") + '">'
      + '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-score-remove aria-label="' + L("去掉档位") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button>';
    row.querySelector("[data-score-level]").value = value || "";
    row.querySelector("[data-score-level]").setAttribute("aria-label", L("档位说明") + " " + cols.children.length);
    cols.append(row);
    [...cols.querySelectorAll("[data-score-index]")].forEach((node, index) => { node.textContent = String(index); });
  };
  const nextOptionKey = () => {
    const used = new Set(outs());
    let n = 1;
    while (used.has("option_" + n)) n += 1;
    return "option_" + n;
  };
  const addChoice = (key, description) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.dataset.choiceRow = "true";
    const keyBox = document.createElement("input");
    keyBox.className = "mw-input";
    keyBox.dataset.choiceKey = "true";
    keyBox.spellcheck = false;
    keyBox.autocomplete = "off";
    keyBox.placeholder = L("选项 key");
    keyBox.value = key || "";
    keyBox.setAttribute("aria-label", L("结果标识"));
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
    const behavior = catalog.behaviors.find((item) => item.behavior_id === key && (!item.destination_id || matchesFn(item, destFn())));
    const caption = document.createElement("span");
    caption.textContent = behavior ? behTitle(behavior) : L("结果") + " · " + (key || "");
    label.append(caption, desc);
    const advanced = document.createElement("details");
    advanced.className = "functions-option-key";
    const summary = document.createElement("summary");
    summary.textContent = L("标识");
    advanced.append(summary, keyBox);
    row.append(label, advanced, remove);
    cols.append(row);
  };
  const sourceLabel = (source) => source === "mcp" ? L("MCP") : source === "plugin" ? L("插件") : L("系统");
  const appendFn = (behavior, parent) => {
    const row = document.createElement("div");
    row.className = "functions-palette-row";
    const body = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = behTitle(behavior);
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
  const paintFn = (record) => {
    palette.replaceChildren();
    if (poolDetail) poolDetail.hidden = prim(record) !== "choice" || record.status === "published";
    if (prim(record) !== "choice" || record.status === "published") return;
    const destId = destFn() || record.scene_id || "";
    const kinds = subj();
    const used = new Set(outs());
    const query = (poolQuery?.value || "").trim().toLocaleLowerCase();
    const fresh = suggestedFn(destId, kinds).filter((row) => row && !used.has(row.behavior_id))
      .filter((row) => !query || [row.title, row.hint, row.plugin_title, row.behavior_id].join(" ").toLocaleLowerCase().includes(query));
    if (!fresh.length) {
      const hint = document.createElement("p");
      hint.className = "functions-hint";
      hint.textContent = query ? L("没有匹配的能力，试试其他关键词。") : !destId && !kinds.length ? L("先选择用途或判断对象，即可查看相关能力。") : L("没有可添加的动作：可能已加入全部结果，或所选对象不适用于此用途。");
      palette.append(hint);
      return;
    }
    const head = document.createElement("strong");
    head.textContent = L("从动作库加入");
    palette.append(head);
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
        groupItems.forEach((behavior) => appendFn(behavior, group));
        palette.append(group);
      });
      return;
    }
    fresh.forEach((behavior) => appendFn(behavior, palette));
  };
  const mapView = (record) => {
    mapEl.replaceChildren();
    const destId = record.scene_id || "";
    const dest = destOf(destId, record);
    const eventDest = dest && dest.kind === "event";
    const kind = prim(record);
    const agentTo = destId === "agent.mcp";
    if (mapPanel) mapPanel.hidden = !(eventDest || agentTo) || kind === "score";
    if (!(eventDest || agentTo) || kind === "score") return;
    mapPanel.querySelector("[data-functions-map-title]").textContent = L(agentTo ? "结果推荐的能力" : "结果对应的页面动作");
    mapPanel.querySelector("[data-functions-map-hint]").textContent = L(agentTo
      ? "可为每个结果选择推荐能力，也可只返回判断。推荐不会自动执行动作。"
      : "每个结果都需要对应一个动作，才能在所选页面启用。");
    const pool = agentTo ? suggestedFn(destId, subj()) : (dest.behavior_ids || []).map(id => behOf(id));
    const map = agentTo ? record.action_map || {} : record.scene_map || {};
    const rows = kind === "noul"
      ? [
        { key: "true", label: L("成立") },
        { key: "false", label: L("不成立") },
      ]
      : [...cols.querySelectorAll("[data-choice-row]")].flatMap((row) => {
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
      empty.textContent = L(agentTo ? "只返回判断" : "请选择对应动作");
      select.append(empty);
      pool.forEach((behavior) => {
        const option = document.createElement("option");
        option.value = agentTo ? actRef(behavior.action_ref) : behavior.behavior_id;
        option.textContent = behavior.title + (agentTo ? " · " + behavior.plugin_title + " · v" + behavior.action_ref.version : "")
          + (behavior.availability?.available === false ? " · " + behavior.availability.reason : "");
        option.disabled = behavior.availability?.available === false;
        select.append(option);
      });
      const current = agentTo ? actRef(map[row.key]) : map[row.key] || row.key;
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
    const kind = prim(record);
    const locked = record.status === "published";
    cols.replaceChildren();
    addCol.hidden = kind === "noul";
    if (criteriaHead) criteriaHead.hidden = kind === "noul";
    if (colHint) colHint.hidden = kind !== "choice";
    if (kind === "noul") {
      colLabel.textContent = L("成立时");
      const wrap = document.createElement("div");
      wrap.className = "functions-noul-fields";
      wrap.innerHTML = '<label class="functions-field">' + L("成立时") + '<textarea class="mw-input" data-noul-true rows="2"></textarea></label>'
        + '<label class="functions-field">' + L("不成立时") + '<textarea class="mw-input" data-noul-false rows="2"></textarea></label>';
      wrap.querySelector("[data-noul-true]").value = record.criteria?.true_description || "";
      wrap.querySelector("[data-noul-false]").value = record.criteria?.false_description || "";
      cols.append(wrap);
    } else if (kind === "score") {
      colLabel.textContent = L("档位");
      const levels = Array.isArray(record.criteria) && record.criteria.length ? record.criteria : ["", ""];
      levels.forEach((level) => addScoreRow(level));
    } else {
      colLabel.textContent = L("返回哪些结果");
      const rows = Array.isArray(record.criteria) && record.criteria.length
        ? record.criteria
        : [{ key: "yes", description: "" }, { key: "no", description: "" }];
      rows.forEach((row) => addChoice(row.key, row.description || ""));
    }
    cols.querySelectorAll("input, textarea, button").forEach((node) => { node.disabled = locked; });
    addCol.disabled = locked;
    paintFn(record);
    mapView(record);
    hintFn(record.scene_id || "", suggestedFn(record.scene_id || "", subj()));
  };
  const renderTo = (record) => {
    const kind = prim(record);
    const destId = record.scene_id || "";
    const kindsFn = new Set(record.subject_kinds || []);
    const list = bench.querySelector(".functions-dest-list");
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
    for (const kindId of kindsFn) if (![...bench.querySelectorAll("[data-functions-source]")].some(node => node.dataset.functionsSource === kindId)) {
      const label = document.createElement("label"); label.className = "functions-chip";
      const input = document.createElement("input"); input.type = "checkbox"; input.className = "mw-check"; input.dataset.functionsSource = kindId;
      const text = document.createElement("span"); text.textContent = kindId + " · " + L("原对象类型");
      label.append(input, text); bench.querySelector("[data-functions-subject-list]").append(label);
    }
    bench.querySelectorAll("[data-functions-destination]").forEach((node) => {
      const id = node.dataset.functionsDestination || "";
      const reference = destRef(node);
      const on = id === destId && (id ? reference.scene_version === (chosen?.scene_version || null) && reference.scene_provider_id === (chosen?.provider_id || null) : true);
      node.classList.toggle("is-current", on);
      node.setAttribute("aria-pressed", String(on));
      const dest = destOf(id, reference);
      const related = dest && dest.subject_kinds && dest.subject_kinds.some((item) => kindsFn.has(item));
      node.classList.toggle("is-related", Boolean(related && !on));
      node.disabled = record.status === "published" || dest?.availability?.available === false || (kind === "score" && dest && dest.kind === "event");
    });
    if (choiceHint) choiceHint.hidden = kind !== "score";
    destinationHint.textContent = destOf(destId)?.availability?.available === false ? L(destOf(destId).availability.reason) : destId === "agent.mcp"
      ? L("返回建议给 Agent；不会自动执行工具。实际调用取决于工具启用状态和权限。")
      : destId === "feed.capture" ? L("发布后，到 Feed 任务的捕捉规则中选择此函数；具体处理由该规则决定。")
      : destId ? L("判断结果用于推荐页面动作。发布后还需要在当前项目启用。")
      : L("可先保存和试跑，不必绑定任何页面。发布后也可通过接口调用。");
    bench.querySelectorAll("[data-functions-source]").forEach((node) => {
      const kindId = node.dataset.functionsSource;
      node.checked = kindsFn.has(kindId);
      node.disabled = record.status === "published";
      const dest = destOf(destId);
      node.closest(".functions-chip")?.classList.toggle("is-related", Boolean(dest?.subject_kinds?.includes(kindId)));
    });
  };
  const paintSamples = (record) => {
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
    lastTry.replaceChildren();
    if (!preview) {
      lastTry.hidden = true;
      if (record && !previewFn.value) previewFn.value = "";
      return;
    }
    if (!previewFn.value) previewFn.value = preview.input || "";
    lastTry.hidden = false;
    const head = document.createElement("div");
    head.className = "functions-preview-head";
    const title = document.createElement("strong");
    const kind = preview.primitive || prim(record);
    if (preview.outcome === "needs_review") title.textContent = L("需要复核");
    else if (kind === "choice") title.textContent = L("已选出") + " " + outputLabel(record, preview.choice || "");
    else if (kind === "noul") title.textContent = L("成立概率") + " " + Number(preview.noul ?? 0).toFixed(2);
    else title.textContent = L("判断完成") + " " + String(preview.score ?? "");
    const model = document.createElement("small");
    model.textContent = preview.model ? "model " + preview.model : "";
    head.append(title, model);
    lastTry.append(head);
    const hint = document.createElement("small");
    hint.textContent = L("模型概率不是正确率。");
    lastTry.append(hint);
    if (kind === "noul") lastTry.append(meter(preview.noul ?? 0));
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
        lastTry.append(row);
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
      lastTry.append(legend);
    }
  };
  const readRule = (record, suffix, method = "GET", body) => {
    const path = "/api/functions/" + encodeURIComponent(record.id) + "/" + suffix;
    return feedApi ? feedApi(path, method, body) : request(method, path, body);
  };
  const usagesFn = async (record) => {
    if (!usedBy) return;
    const sequence = ++usagesSeq;
    const current = () => sel?.id === record.id && sequence === usagesSeq;
    usedBy.replaceChildren();
    const head = document.createElement("strong"); head.textContent = L("使用状态"); usedBy.append(head);
    const line = (text) => { const p = document.createElement("p"); p.textContent = L(text); usedBy.append(p); return p; };
    if (record.status !== "published") {
      line("草稿尚未生效。发布后将在这里显示可配置的位置。");
      return;
    }
    try {
      const [uses, locations] = await Promise.all([readRule(record, "usages"), readRule(record, "targets")]);
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
        cfgCalls.set(button, { id: record.id, scene_id: target.scene_id, scene_version: target.scene_version,
          provider_id: target.provider_id, binding_id: target.binding_id, expected_revision: target.revision, enabled: !active });
        section.append(button); usedBy.append(section);
        if (own) shown.add(targetKey(target));
      });
      usages.filter(row => !shown.has(targetKey(row))).forEach(row => {
        const summary = document.createElement("p"); title(summary, row);
        const state = row.availability?.available === false ? row.availability.reason : row.enabled === false ? "已停用" : row.enabled === true ? "已启用" : "";
        if (state) summary.append(document.createTextNode(" · " + L(state)));
        usedBy.append(summary);
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
    const switching = sel?.id !== record.id;
    sel = record;
    if (switching) {
      dirty = false;
      bench.querySelector("[data-functions-subject-details]").open = Boolean(record.subject_kinds?.length);
      poolDetail.open = false;
      setStep(record.status === "published" ? "use" : "look");
      poolQuery.value = "";
    }
    savedAt.textContent = record.status === "published" ? L("已发布 · 规则只读") : L("草稿自动保存");
    bench.querySelector("[data-functions-kind-description]").textContent = prim(record) === "noul"
      ? L("是非判断：返回成立的概率，例如材料是否足够。")
      : prim(record) === "score" ? L("等级评分：按你定义的档位返回分数，例如紧急程度。")
      : L("结果选择：从你定义的结果中选出一个，例如跟进、保存或忽略。");
    releaseHint.textContent = record.status === "published" ? L("规则已锁定，可以继续试跑，并查看或调整使用状态。") : L("发布会锁定名称、规则和用途。确认试跑符合预期后再发布；发布不会自动启用页面判断。");
    bench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = record.name;
    statusEl.textContent = record.status === "published" ? "v" + (record.version || 1) : L("草稿");
    nameInput.value = record.name;
    keyInput.value = record.function_key;
    const locked = record.status === "published";
    nameInput.disabled = locked;
    keyInput.disabled = locked;
    instr.disabled = locked;
    instr.value = record.instructions;
    deleteBtn.hidden = locked;
    publish.hidden = locked;
    publish.textContent = L("发布 v1");
    if (switching) previewFn.value = record.last_preview?.input || "";
    renderTo(record);
    renderCriteria(record);
    paintSamples(record);
    renderPreview(record);
    void usagesFn(record);
    say(locked ? L("已发布。") : "", false);
    list.querySelectorAll("[data-function-id]").forEach((row) => {
      const on = row.dataset.functionId === record.id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const closeFn = () => {
    sel = null;
    const next = page.address(); next.searchParams.delete("rule"); next.searchParams.delete("key");
    page.replace(next);
    bench.setAttribute("data-expanded", "false");
    workspace.hidden = true;
    list.querySelectorAll("[data-function-id]").forEach((row) => {
      row.classList.remove("is-selected");
      row.setAttribute("aria-selected", "false");
    });
  };
  const renderList = () => {
    keepListScroll(() => paintList());
  };
  const rememberRec = (record) => {
    records = records.some((item) => item.id === record.id)
      ? records.map((item) => item.id === record.id ? record : item) : [record, ...records];
    renderList();
  };
  const paintList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((record) => {
      const item = document.createElement("article");
      item.className = "feed-stage-item";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "feed-stage-entry directory-list-row" + (sel?.id === record.id ? " is-selected" : "");
      row.dataset.functionId = record.id;
      row.setAttribute("aria-selected", String(sel?.id === record.id));
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
    const subjects = bench.querySelector("[data-functions-subject-list]");
    if (catalog.subjects.length && subjects) {
      const checked = new Set(sel?.subject_kinds || subj());
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
  const loadFn = async (opts = {}) => {
    const seq = ++listSeq;
    const payload = await request("GET", "/api/functions");
    if (seq !== listSeq) return;
    records = payload.functions || [];
    renderList();
    if (!sel) return;
    const next = records.find((item) => item.id === sel.id);
    if (opts.preserveForm) {
      if (!next) closeFn();
      return;
    }
    if (next) {
      if (opts.remount) fillEditor(next);
      else {
        sel = next;
        titleEl.textContent = next.name;
      }
    }
    else closeFn();
  };
  const draftBody = () => ({
    name: nameInput.value,
    function_key: keyInput.value,
    instructions: instr.value,
    criteria: fields(),
    ...sceneRef(),
    subject_kinds: subj(),
    scene_map: scenes(),
    action_map: acts(),
    updated_at: sel.updated_at,
  });
  let saving = null;
  const save = async () => {
    clearTimeout(timer); timer = 0;
    const record = sel, revision = editRev;
    if (!record || record.status === "published") return record;
    const body = draftBody();
    if (saving) { const prior = await saving; if (prior?.id === record.id) body.updated_at = prior.updated_at; }
    const operation = persistDraft(record.id, body, revision);
    saving = operation;
    try { return await operation; } finally { if (saving === operation) saving = null; }
  };
  const persistDraft = async (savingId, body, revision) => {
    if (sel?.id === savingId) savedAt.textContent = L("正在保存…");
    try {
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(savingId), body);
      const saved = payload.function;
      rememberRec(saved);
      if (sel?.id !== savingId) return saved;
      sel = saved;
      if (revision === editRev) dirty = false;
      savedAt.textContent = dirty ? L("有更改，等待保存…") : L("已保存");
      titleEl.textContent = sel.name;
      say("", false);
      return sel;
    } catch (error) {
      if (sel?.id === savingId) {
        savedAt.textContent = L("未保存 · 请修正后重试");
        await loadFn({ preserveForm: true }).catch(() => {});
      }
      throw error;
    }
  };
  const queue = () => {
    if (!sel || sel.status === "published") return;
    const savingId = sel.id;
    dirty = true;
    editRev++;
    savedAt.textContent = L("有更改，等待保存…");
    clearTimeout(timer);
    timer = setTimeout(() => {
      void save().catch((error) => {
        if (sel?.id === savingId) say(error.message, true);
      });
    }, 280);
  };
  const remember = (record, origin) => {
    rememberRec(record);
    if (origin && sel?.id !== origin.id) return;
    if (origin && editRev !== origin.revision) {
      sel = { ...sel, updated_at: record.updated_at, samples: record.samples };
      paintSamples(sel); return;
    }
    const next = page.address(); next.searchParams.set("rule", record.id); next.searchParams.delete("key");
    page.replace(next);
    const listNote = bench.querySelector("[data-functions-list-note]");
    if (listNote) listNote.hidden = true;
    fillEditor(record);
  };
  bench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail?.itemId;
    if (!id) { pickSeq++; openingId = null; return; }
    if (sel?.id === id) {
      bench.setAttribute("data-expanded", "true"); workspace.hidden = false; return;
    }
    if (openingId === id) return;
    openingId = id;
    const seq = ++pickSeq;
    void (async () => {
      if (sel && (timer || saving || dirty)) { clearTimeout(timer); timer = 0; await save(); }
      await loadCatalog();
      const payload = await request("GET", "/api/functions/" + encodeURIComponent(id));
      if (seq === pickSeq) remember(payload.function);
    })().catch((error) => { if (seq === pickSeq) say(error.message, true); })
      .finally(() => { if (seq === pickSeq) openingId = null; });
  });
  const openCreate = () => {
    if (typeof createBox.showModal === "function") createBox.showModal();
    else createBox.setAttribute("open", "");
  };
  const closeCreate = () => {
    if (typeof createBox.close === "function") createBox.close();
    else createBox.removeAttribute("open");
  };

  bench.querySelector("[data-functions-new]").addEventListener("click", () => {
    say("", false);
    openCreate();
  });
  bench.querySelectorAll("[data-functions-create-close]").forEach((node) => {
    node.addEventListener("click", () => closeCreate());
  });
  let creating = false;
  createForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (creating) return;
    creating = true;
    const createNote = bench.querySelector("[data-functions-create-note]");
    createNote.textContent = "";
    const submitter = event.submitter;
    const primitive = submitter && submitter.value ? submitter.value : "choice";
    createForm.querySelectorAll("button").forEach((node) => { node.disabled = true; });
    try {
      if (dirty || timer || saving) await save();
      const payload = await request("POST", "/api/functions", { primitive });
      closeCreate();
      await loadFn();
      remember(payload.function);
    } catch (error) {
      createNote.textContent = error.message || L("保存失败");
    } finally {
      creating = false;
      createForm.querySelectorAll("button").forEach((node) => { node.disabled = false; });
    }
  });
  bench.querySelector("[data-functions-back]").addEventListener("click", async () => {
    try {
      await save();
      closeFn();
      await loadFn();
    } catch (error) { say(error.message, true); }
  });
  deleteBtn.addEventListener("click", async () => {
    if (!sel || sel.status === "published") return;
    const record = sel;
    if (!window.confirm(L("确定删除这个草稿？"))) return;
    try {
      await request("POST", "/api/functions/" + encodeURIComponent(record.id) + "/delete", { updated_at: record.updated_at });
      if (sel?.id === record.id) closeFn();
      await loadFn({ preserveForm: true });
    } catch (error) { if (sel?.id === record.id) say(error.message, true); }
  });
  addCol.addEventListener("click", () => {
    if (sel?.status === "published") return;
    if (prim(sel) === "score") addScoreRow("");
    else if (prim(sel) === "choice") addChoice(nextOptionKey(), "");
    paintFn(sel);
    mapView(sel);
    queue();
  });
  usedBy?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-functions-scene-bind]");
    const args = button && cfgCalls.get(button);
    if (!args || button.disabled || sel?.id !== args.id) return;
    const record = sel;
    button.disabled = true;
    try {
      await readRule(record, "configure", "POST", args);
      if (sel?.id === record.id) await usagesFn(sel);
    } catch (error) {
      if (sel?.id !== record.id) return;
      await usagesFn(sel);
      if (sel?.id !== record.id) return;
      const status = document.createElement("p"); status.setAttribute("role", "alert");
      status.textContent = error.message || L("配置未保存，请重试。"); usedBy.append(status);
    }
  });
  bench.querySelector("[data-functions-destinations]").addEventListener("click", (event) => {
    const button = event.target.closest("[data-functions-destination]");
    if (!button || !sel || sel.status === "published" || button.disabled) return;
    const destId = button.dataset.functionsDestination || "";
    if (prim(sel) === "score" && destId && destId !== "agent.mcp") {
      say(L("Score 不能绑 Inbox、首页、Feed。"), true);
      return;
    }
    const reference = destRef(button);
    if (destId === (sel.scene_id || "") && reference.scene_version === (sel.scene_version || null)
      && reference.scene_provider_id === (sel.scene_provider_id || null)) return;
    sel = {
      ...sel,
      ...reference,
      scene_map: destId && destId !== "agent.mcp" ? (sel.scene_map || {}) : {},
      action_map: destId === "agent.mcp" ? (sel.action_map || {}) : {},
    };
    renderTo(sel);
    syncCols();
    void usagesFn(sel);
    queue();
  });
  poolQuery.addEventListener("input", () => { if (sel) paintFn(sel); });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-functions-palette-search], [data-functions-preview-input]")) return;
    if (event.target.matches("[data-choice-key], [data-choice-description]")) {
      if (sel) mapView({ ...sel, criteria: fields(), scene_map: scenes(), action_map: acts() });
    }
    queue();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-functions-source]")) {
      if (sel && sel.status !== "published") {
        sel = { ...sel, subject_kinds: subj(), scene_map: scenes(), action_map: acts() };
        renderTo(sel);
        syncCols();
      }
    }
    if (event.target.matches("[data-map-key]") && sel) {
      sel = { ...sel, scene_map: scenes(), action_map: acts(), criteria: fields() };
      void usagesFn(sel);
    }
    queue();
  });
  form.addEventListener("click", (event) => {
    const paletteAdd = event.target.closest("[data-palette-add]");
    if (paletteAdd && sel?.status !== "published" && prim(sel) === "choice") {
      const behavior = behOf(paletteAdd.dataset.paletteAdd);
      sel = { ...sel, scene_map: scenes(), action_map: acts() };
      if (behavior.action_ref && destFn() === "agent.mcp") sel.action_map[behavior.behavior_id] = behavior.action_ref;
      if (!outs().includes(behavior.behavior_id)) {
        addChoice(behavior.behavior_id, behTitle(behavior));
      }
      paintFn(sel);
      mapView(sel);
      queue();
      return;
    }
    const removeChoice = event.target.closest("[data-choice-remove]");
    if (removeChoice && sel?.status !== "published") {
      if (cols.querySelectorAll("[data-choice-row]").length < 3) {
        say(L("Choice 至少需要两个选项"), true);
        return;
      }
      removeChoice.closest("[data-choice-row]").remove();
      paintFn(sel);
      mapView(sel);
      queue();
      return;
    }
    const removeScore = event.target.closest("[data-score-remove]");
    if (removeScore && sel?.status !== "published") {
      if (cols.querySelectorAll("[data-score-level]").length < 3) {
        say(L("Score 至少需要两个档位"), true);
        return;
      }
      removeScore.closest(".functions-criterion").remove();
      [...cols.querySelectorAll("[data-score-index]")].forEach((node, index) => { node.textContent = String(index); });
      queue();
    }
  });
  samplesEl.addEventListener("click", async (event) => {
    const load = event.target.closest("[data-sample-load]");
    const remove = event.target.closest("[data-sample-remove]");
    const row = event.target.closest("[data-sample-id]");
    if (!row || !sel) return;
    const sample = (sel.samples || []).find((item) => item.id === row.dataset.sampleId);
    if (load && sample) previewFn.value = sample.input || "";
    if (remove) {
      const record = sel, origin = { id: record.id, revision: editRev };
      try {
        const payload = await request("POST", "/api/functions/" + encodeURIComponent(record.id) + "/samples/delete", {
          sample_id: row.dataset.sampleId, updated_at: record.updated_at,
        });
        remember(payload.function, origin);
      } catch (error) { if (sel?.id === record.id) say(error.message, true); }
    }
  });
  bench.querySelector("[data-functions-save-sample]").addEventListener("click", async () => {
    if (!sel) return;
    const origin = { id: sel.id, revision: editRev }, input = previewFn.value;
    try {
      const saved = await save();
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(origin.id) + "/samples", { input, updated_at: saved.updated_at });
      remember(payload.function, origin);
    } catch (error) { if (sel?.id === origin.id) say(error.message, true); }
  });
  rowsEl.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    const record = records.find((item) => item.id === row.dataset.functionId);
    if (record) {
      if (sel?.id === record.id) return;
      try {
        if (timer || saving || dirty) await save();
        fillEditor(record);
      } catch (error) { say(error.message, true); }
    }
  });
  let previewing = false;
  const tryBtn = bench.querySelector("[data-functions-preview]");
  tryBtn.addEventListener("click", async () => {
    if (!sel || previewing) return;
    const previewId = sel.id;
    previewing = true;
    bench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = true; });
    publish.disabled = true;
    tryBtn.disabled = true;
    tryBtn.textContent = L("正在试跑…");
    say(L("正在请求判断，通常需要几秒。"), false);
    try {
      await save();
      if (sel?.id !== previewId) return;
      const payload = await request("POST", "/api/functions/" + encodeURIComponent(previewId) + "/preview", {
        input: previewFn.value,
        updated_at: sel.updated_at,
      });
      if (sel?.id !== previewId) return;
      remember(payload.function);
    } catch (error) {
      if (sel?.id === previewId) {
        if (error.code === "functions.invalid" && !instr.value.trim()) setStep("fn", true);
        say(error.message, true);
        if (error.code === "functions.provider_not_configured" || error.code === "actions.connection_required") {
          const link = document.createElement("a");
          const connection = new URL("/capabilities/connections", location.origin);
          connection.searchParams.set("connector", "typesafe");
          const current = page.address();
          for (const key of ["project", "desktop"]) if (current.searchParams.has(key)) connection.searchParams.set(key, current.searchParams.get(key));
          link.href = connection.pathname + connection.search;
          link.textContent = L("连接判断服务");
          note.append(document.createTextNode(" "), link);
        }
      }
    } finally {
      previewing = false;
      bench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = false; });
      publish.disabled = false;
      tryBtn.disabled = false;
      tryBtn.textContent = L("试跑");
    }
  });
  publish.addEventListener("click", async () => {
    if (!sel || publish.disabled) return;
    if (destFn() && destFn() !== "agent.mcp" && !mappingReady({ ...sel, scene_id: destFn(), criteria: fields(), scene_map: scenes() })) {
      setStep("fn", true);
      say(L("还有结果未对应页面动作，请补齐后再发布。"), true);
      return;
    }
    const publishId = sel.id;
    publish.disabled = true;
    say("", false);
    try {
      await save();
      if (sel?.id !== publishId) return;
      const path = "/api/functions/" + encodeURIComponent(publishId) + "/publish";
      const body = { updated_at: sel.updated_at };
      const payload = feedApi ? await feedApi(path, "POST", body) : await request("POST", path, body);
      if (sel?.id !== publishId) return;
      remember(payload.function);
      await loadFn();
    } catch (error) {
      if (sel?.id === publishId) say(error.message, true);
    } finally { publish.disabled = false; }
  });
  const load = () => loadCatalog().then(loadFn).catch((error) => {
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
    bench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: row.dataset.functionId } }));
  });
  void load().then(() => {
    const params = page.address().searchParams;
    const id = params.get("rule") || records.find(record => record.function_key === params.get("key"))?.id;
    if (id) bench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: id } }));
    else if (params.get("key")) say(L("找不到这条判断规则，请从列表重新选择。"), true);
  });
}
`;
