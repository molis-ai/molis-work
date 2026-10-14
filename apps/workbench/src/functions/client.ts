/** Functions workbench: purpose, rules, then preview and activation. */
export const FUNCTIONS_CLIENT_FACTORY_SCRIPT = `(host) => {
  const { translate: L, api, root, page } = host;
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
  const promptInput = bench.querySelector("[data-functions-instructions]");
  const critLabel = bench.querySelector("[data-functions-criteria-label]");
  const addCrit = bench.querySelector("[data-functions-add-criterion]");
  const criteriaHead = bench.querySelector("[data-functions-criteria-head]");
  const critHint = bench.querySelector("[data-functions-criteria-hint]");
  const critEl = bench.querySelector("[data-functions-criteria]");
  const paletteEl = bench.querySelector("[data-functions-palette]");
  const mapPanel = bench.querySelector("[data-functions-map-panel]");
  const mapEl = bench.querySelector("[data-functions-map]");
  const samplesEl = bench.querySelector("[data-functions-samples]");
  const sampleText = bench.querySelector("[data-functions-preview-input]");
  const pubBtn = bench.querySelector("[data-functions-publish]");
  const note = bench.querySelector("[data-functions-note]");
  const lastPreview = bench.querySelector("[data-functions-last-preview]");
  const usagesEl = bench.querySelector("[data-functions-usages]");
  const createBox = bench.querySelector("[data-functions-create-dialog]");
  const createForm = bench.querySelector("[data-functions-create-form]");
  const choiceOnlyHint = bench.querySelector("[data-functions-choice-only]");
  const saveStatus = bench.querySelector("[data-functions-save-status]");
  const paletteFind = bench.querySelector("[data-functions-palette-search]");
  const paletteInfo = bench.querySelector("[data-functions-palette-details]");
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
  let selectSeq = 0;
  let openingId = null;
  let saveTick = 0;
  let dirty = false;
  let editRevision = 0;
  let listSeq = 0;
  let usagesSeq = 0;
  const configReads = new WeakMap();
  let cat = { subjects: [], destinations: [], behaviors: [] };
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
  const matchesScene = (row, rec) => row.destination_id === rec?.scene_id
    && (!rec.scene_version || row.scene_version === rec.scene_version)
    && (!rec.scene_provider_id || row.provider_id === rec.scene_provider_id);
  const destOf = (id, rec = sel) => {
    const ref = rec?.scene_id === id ? rec : { scene_id: id };
    const matches = cat.destinations.filter(row => matchesScene(row, ref));
    return matches.length === 1 ? matches[0] : id ? {
      destination_id: id, scene_version: ref.scene_version, provider_id: ref.scene_provider_id,
      kind: "event", title: L("原用途不可用"), when: "", subject_kinds: [], behavior_ids: [],
      availability: { available: false, reason: L(matches.length > 1 ? "请为原用途选择具体版本。" : "当前范围未注册原用途，请检查插件状态或重新选择。") },
    } : null;
  };
  const behaviorMatches = (row, dst, rec = sel) => {
    const dest = destOf(dst, rec);
    return row.destination_id === dst && (!row.scene_version || row.scene_version === dest?.scene_version)
      && (!row.provider_id || row.provider_id === dest?.provider_id);
  };
  const behaviorOf = (id, dst = destKey()) => cat.behaviors.find((row) => row.behavior_id === id && behaviorMatches(row, dst))
    || cat.behaviors.find((row) => row.behavior_id === id && !row.destination_id) || {
    behavior_id: id,
    title: id,
    effect: "read",
    source: "system",
    plugin_id: "system",
    plugin_title: L("系统"),
    subject_kinds: [],
    clickable: true,
  };
  const behaviorTitle = (beh) => beh.source === "mcp" && beh.hint
    ? L(beh.hint).split(/[。\\n]/)[0]
    : L(beh.title);
  const outputLabel = (rec, key) => {
    const beh = cat.behaviors.find((row) => row.behavior_id === key && (!row.destination_id || behaviorMatches(row, rec.scene_id, rec)));
    if (beh) return behaviorTitle(beh);
    const criterion = Array.isArray(rec.criteria) && rec.criteria.find((row) => row.key === key);
    return criterion?.description || key;
  };
  const destTitle = (recOrId) => {
    const id = recOrId && typeof recOrId === "object" ? recOrId.scene_id : recOrId;
    const dest = destOf(id, typeof recOrId === "object" ? recOrId : sel);
    if (dest?.title) return L(dest.title) + (dest.scene_version ? " · v" + dest.scene_version : "");
    return id === "home.dock" ? L("首页") : id === "inbox.next" ? L("Inbox") : id === "feed.capture" ? L("Feed") : id === "agent.mcp" ? L("Agent") : L("还没选");
  };
  const behaviorIds = () => new Set(cat.behaviors.filter(row => !row.destination_id || behaviorMatches(row, destKey())).map((row) => row.behavior_id));
  const matchesSubjects = (beh, kinds) => {
    if (!kinds.length || !beh.subject_kinds?.length) return true;
    return (beh.subject_kinds || []).some((kind) => kinds.includes(kind));
  };
  const hints = (dst, kinds) => {
    const dest = destOf(dst);
    const match = (row) => matchesSubjects(row, kinds);
    if (!dst) return kinds.length ? cat.behaviors.filter(row => !row.destination_id && match(row)) : [];
    if (dst === "agent.mcp" || dest?.kind === "mcp") return cat.behaviors.filter(row => row.destination_id === "agent.mcp" && match(row));
    return (dest?.behavior_ids || []).map((id) => behaviorOf(id, dst)).filter(match);
  };
  const defaultChoiceRows = () => [{ key: "yes", description: "" }, { key: "no", description: "" }];
  const followContext = (keys) => {
    if (!keys.length) return true;
    if (keys.length === 2 && keys[0] === "yes" && keys[1] === "no") return true;
    const ids = behaviorIds();
    return keys.every((key) => ids.has(key));
  };
  const currentChoiceMap = () => {
    const map = new Map();
    critEl.querySelectorAll("[data-choice-row]").forEach((row) => {
      const key = ((row.querySelector("[data-choice-key]") || {}).value || "").trim();
      if (!key) return;
      map.set(key, ((row.querySelector("[data-choice-description]") || {}).value || "").trim());
    });
    return map;
  };
  const applyChoiceRows = (rows) => {
    const prev = currentChoiceMap();
    critEl.replaceChildren();
    rows.forEach((row) => {
      addChoice(row.key, prev.has(row.key) ? prev.get(row.key) : (row.description || ""));
    });
  };
  const pruneSceneMap = (map, dst) => {
    const dest = destOf(dst);
    if (!dst || dst === "agent.mcp" || dest?.kind !== "event") return {};
    const keys = new Set(readKeys());
    const next = {};
    Object.entries(map || {}).forEach(([key, value]) => {
      if (keys.has(key)) next[key] = value;
    });
    return next;
  };
  const syncHint = (dst, hinted) => {
    if (!critHint || prim(sel) !== "choice") return;
    const dest = destOf(dst);
    const follow = followContext(readKeys());
    if (dest && dest.kind === "event" && follow && hinted.length >= 2 && readKeys().every((key) => behaviorIds().has(key))) {
      critHint.textContent = L("已按用途提供动作。请补充每个动作的选择条件；切换用途会更新默认动作，自定义结果会保留。");
    } else if (dest && dest.kind === "event" && follow && hinted.length < 2) {
      critHint.textContent = dst === "home.dock" && !api
        ? L("请先选择项目，再配置这个项目可用的首页动作。")
        : hinted.length ? L("可以设置多个判断结果，再为每个结果选择对应动作。") : L("当前没有可用的推荐动作，请检查对象类型、插件状态和权限。");
    } else {
      critHint.textContent = L("至少保留两个结果，说明各自在什么情况下被选中。");
    }
  };
  const syncPanel = () => {
    if (!sel) return;
    const dst = destKey();
    const kinds = readKinds();
    const hinted = hints(dst, kinds);
    if (destOf(dst)?.availability?.available === false) {
      sel = { ...sel, scene_id: dst || null, subject_kinds: kinds };
      paintPalette(sel); renderMap(sel);
      return;
    }
    if (sel.status === "published" || prim(sel) !== "choice") {
      sel = { ...sel, scene_id: dst || null, subject_kinds: kinds };
      syncHint(dst, hinted);
      paintPalette(sel);
      renderMap(sel);
      return;
    }
    const keys = readKeys();
    const dest = destOf(dst);
    const eventDest = Boolean(dest && dest.kind === "event");
    const follow = followContext(keys);
    const hasCatalogKeys = keys.some((key) => behaviorIds().has(key));
    let nextMap = sel.scene_map || {};
    if (follow && eventDest && hinted.length >= 2) {
      applyChoiceRows(hinted.map((row) => ({ key: row.behavior_id, description: row.title || "" })));
      nextMap = {};
    } else if (follow && hasCatalogKeys && dst !== "agent.mcp") {
      applyChoiceRows(defaultChoiceRows());
      nextMap = {};
    } else if (!eventDest) {
      nextMap = {};
    } else {
      nextMap = pruneSceneMap(nextMap, dst);
    }
    sel = {
      ...sel,
      scene_id: dst || null,
      subject_kinds: kinds,
      scene_map: nextMap,
      criteria: readCriteria(),
    };
    syncHint(dst, hinted);
    paintPalette(sel);
    renderMap(sel);
  };
  const functionMeta = (rec) => {
    const bits = [];
    const line = String(rec.instructions || "").trim().split("\\n")[0].trim();
    if (line) bits.push(line);
    if (rec.primitive === "choice" && Array.isArray(rec.criteria) && rec.criteria.length) {
      bits.push(rec.criteria.length + " " + L("选项"));
    }
    if (rec.primitive === "score" && Array.isArray(rec.criteria) && rec.criteria.length) {
      bits.push(rec.criteria.length + " " + L("档位"));
    }
    if ((rec.samples || []).length) bits.push((rec.samples || []).length + " " + L("样例"));
    if (rec.last_preview) bits.push(L("试过"));
    return bits.join(" · ") || L("还没有说明");
  };

  const req = (method, path, body) => molisWorkRequest(path, {method, body, fallback: L("Functions 请求失败")});
  const showNote = (text, isError) => {
    const aim = workspace.hidden ? bench.querySelector("[data-functions-list-note]") : note;
    if (!aim) return;
    aim.hidden = !text;
    if (isError && text && typeof text === "object") molisWorkRequest.show(aim, text); else aim.textContent = text || "";
    aim.classList.toggle("is-error", Boolean(isError && text));
  };
  const prim = (rec) => rec?.primitive || "choice";
  const destKey = () => {
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
  const readKinds = () => [...bench.querySelectorAll("[data-functions-source]:checked")]
    .map((node) => node.dataset.functionsSource)
    .filter(Boolean);
  const readKeys = () => {
    const kind = prim(sel);
    if (kind === "noul") return ["true", "false"];
    if (kind === "score") return [];
    return [...critEl.querySelectorAll("[data-choice-row]")].map((row) => {
      const key = ((row.querySelector("[data-choice-key]") || {}).value || "").trim();
      return key;
    }).filter(Boolean);
  };
  const sceneMap = () => {
    const dst = destKey();
    const dest = destOf(dst);
    if (!dst || dst === "agent.mcp" || dest?.kind !== "event") return {};
    const mapped = {};
    mapEl.querySelectorAll("[data-map-key]").forEach((select) => {
      const key = select.dataset.mapKey;
      const value = (select.value || "").trim();
      if (key && value) mapped[key] = value;
    });
    return mapped;
  };
  const actionMap = () => {
    if (destKey() !== "agent.mcp") return {};
    const mapped = {};
    mapEl.querySelectorAll("[data-map-key]").forEach((select) => {
      if (select.dataset.mapKey && select.value) mapped[select.dataset.mapKey] = JSON.parse(select.value);
    });
    return mapped;
  };
  const actionRef = (ref) => ref ? JSON.stringify({ capability_id: ref.capability_id,
    version: ref.version, provider_id: ref.provider_id }) : "";
  const readCriteria = () => {
    const kind = prim(sel);
    if (kind === "noul") {
      return {
        true_description: (critEl.querySelector("[data-noul-true]") || {}).value || "",
        false_description: (critEl.querySelector("[data-noul-false]") || {}).value || "",
      };
    }
    if (kind === "score") {
      return [...critEl.querySelectorAll("[data-score-level]")].map((input) => input.value);
    }
    const picked = [...critEl.querySelectorAll("[data-choice-row]")].map((row) => ({
      key: ((row.querySelector("[data-choice-key]") || {}).value || "").trim(),
      description: ((row.querySelector("[data-choice-description]") || {}).value || "").trim(),
    })).filter((row) => row.key);
    return picked;
  };
  const mappingReady = (rec) => {
    const dst = rec.scene_id || "";
    if (!dst || dst === "agent.mcp") return true;
    const dest = destOf(dst, rec);
    if (dest?.availability?.available === false) return false;
    const pool = dest?.behavior_ids || [];
    if (!pool.length) return false;
    const kind = prim(rec);
    const keys = kind === "noul"
      ? ["true", "false"]
      : kind === "choice" && Array.isArray(rec.criteria)
        ? rec.criteria.map((row) => row.key)
        : [];
    if (!keys.length) return false;
    const map = rec.scene_map || {};
    return keys.every((key) => pool.includes(map[key] || key) && behaviorOf(map[key] || key).availability?.available !== false);
  };
  const addScoreRow = (value) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.innerHTML = '<code data-score-index></code>'
      + '<input class="mw-input" data-score-level autocomplete="off" placeholder="' + L("档位说明") + '">'
      + '<button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" data-score-remove aria-label="' + L("去掉档位") + '"><svg aria-hidden="true"><use href="#icon-x"></use></svg></button>';
    row.querySelector("[data-score-level]").value = value || "";
    row.querySelector("[data-score-level]").setAttribute("aria-label", L("档位说明") + " " + critEl.children.length);
    critEl.append(row);
    [...critEl.querySelectorAll("[data-score-index]")].forEach((node, index) => { node.textContent = String(index); });
  };
  const nextOptionKey = () => {
    const used = new Set(readKeys());
    let n = 1;
    while (used.has("option_" + n)) n += 1;
    return "option_" + n;
  };
  const addChoice = (key, description) => {
    const row = document.createElement("div");
    row.className = "functions-criterion";
    row.dataset.choiceRow = "true";
    const keyEl = document.createElement("input");
    keyEl.className = "mw-input";
    keyEl.dataset.choiceKey = "true";
    keyEl.spellcheck = false;
    keyEl.autocomplete = "off";
    keyEl.placeholder = L("选项 key");
    keyEl.value = key || "";
    keyEl.setAttribute("aria-label", L("结果标识"));
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
    const beh = cat.behaviors.find((item) => item.behavior_id === key && (!item.destination_id || behaviorMatches(item, destKey())));
    const caption = document.createElement("span");
    caption.textContent = beh ? behaviorTitle(beh) : L("结果") + " · " + (key || "");
    label.append(caption, desc);
    const advanced = document.createElement("details");
    advanced.className = "functions-option-key";
    const summary = document.createElement("summary");
    summary.textContent = L("标识");
    advanced.append(summary, keyEl);
    row.append(label, advanced, remove);
    critEl.append(row);
  };
  const sourceLabel = (source) => source === "mcp" ? L("MCP") : source === "plugin" ? L("插件") : L("系统");
  const addPalette = (beh, parent) => {
    const row = document.createElement("div");
    row.className = "functions-palette-row";
    const body = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = behaviorTitle(beh);
    const meta = document.createElement("small");
    const bits = [sourceLabel(beh.source)];
    if (beh.plugin_title && beh.source !== "system") bits.push(beh.plugin_title);
    if (beh.hint) bits.push(L(beh.hint));
    meta.textContent = bits.join(" · ");
    body.append(title, meta);
    const effect = document.createElement("span");
    effect.className = "functions-effect";
    effect.dataset.effect = beh.effect;
    effect.textContent = beh.effect === "write" ? L("执行时修改数据") : L("只读");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mw-btn mw-btn--ghost";
    add.dataset.paletteAdd = beh.behavior_id;
    add.textContent = L("加入");
    add.disabled = beh.availability?.available === false;
    row.append(body, effect, add);
    parent.append(row);
  };
  const paintPalette = (rec) => {
    paletteEl.replaceChildren();
    if (paletteInfo) paletteInfo.hidden = prim(rec) !== "choice" || rec.status === "published";
    if (prim(rec) !== "choice" || rec.status === "published") return;
    const dst = destKey() || rec.scene_id || "";
    const kinds = readKinds();
    const used = new Set(readKeys());
    const query = (paletteFind?.value || "").trim().toLocaleLowerCase();
    const fresh = hints(dst, kinds).filter((row) => row && !used.has(row.behavior_id))
      .filter((row) => !query || [row.title, row.hint, row.plugin_title, row.behavior_id].join(" ").toLocaleLowerCase().includes(query));
    if (!fresh.length) {
      const hint = document.createElement("p");
      hint.className = "functions-hint";
      hint.textContent = query ? L("没有匹配的能力，试试其他关键词。") : !dst && !kinds.length ? L("先选择用途或判断对象，即可查看相关能力。") : L("没有可添加的动作：可能已加入全部结果，或所选对象不适用于此用途。");
      paletteEl.append(hint);
      return;
    }
    const head = document.createElement("strong");
    head.textContent = L("从动作库加入");
    paletteEl.append(head);
    if (dst === "agent.mcp") {
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
        groupItems.forEach((beh) => addPalette(beh, group));
        paletteEl.append(group);
      });
      return;
    }
    fresh.forEach((beh) => addPalette(beh, paletteEl));
  };
  const renderMap = (rec) => {
    mapEl.replaceChildren();
    const dst = rec.scene_id || "";
    const dest = destOf(dst, rec);
    const eventDest = dest && dest.kind === "event";
    const kind = prim(rec);
    const agentDest = dst === "agent.mcp";
    if (mapPanel) mapPanel.hidden = !(eventDest || agentDest) || kind === "score";
    if (!(eventDest || agentDest) || kind === "score") return;
    mapPanel.querySelector("[data-functions-map-title]").textContent = L(agentDest ? "结果推荐的能力" : "结果对应的页面动作");
    mapPanel.querySelector("[data-functions-map-hint]").textContent = L(agentDest
      ? "可为每个结果选择推荐能力，也可只返回判断。推荐不会自动执行动作。"
      : "每个结果都需要对应一个动作，才能在所选页面启用。");
    const pool = agentDest ? hints(dst, readKinds()) : (dest.behavior_ids || []).map(id => behaviorOf(id));
    const map = agentDest ? rec.action_map || {} : rec.scene_map || {};
    const rows = kind === "noul"
      ? [
        { key: "true", label: L("成立") },
        { key: "false", label: L("不成立") },
      ]
      : [...critEl.querySelectorAll("[data-choice-row]")].flatMap((row) => {
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
      pool.forEach((beh) => {
        const option = document.createElement("option");
        option.value = agentDest ? actionRef(beh.action_ref) : beh.behavior_id;
        option.textContent = beh.title + (agentDest ? " · " + beh.plugin_title + " · v" + beh.action_ref.version : "")
          + (beh.availability?.available === false ? " · " + beh.availability.reason : "");
        option.disabled = beh.availability?.available === false;
        select.append(option);
      });
      const current = agentDest ? actionRef(map[row.key]) : map[row.key] || row.key;
      if (current && ![...select.options].some(option => option.value === current)) {
        const missing = document.createElement("option");
        missing.value = current;
        missing.textContent = L("原动作不可用，请重新选择");
        missing.disabled = true;
        select.append(missing);
      }
      select.value = current;
      select.disabled = rec.status === "published";
      line.append(title, select);
      mapEl.append(line);
    });
  };
  const renderCriteria = (rec) => {
    const kind = prim(rec);
    const locked = rec.status === "published";
    critEl.replaceChildren();
    addCrit.hidden = kind === "noul";
    if (criteriaHead) criteriaHead.hidden = kind === "noul";
    if (critHint) critHint.hidden = kind !== "choice";
    if (kind === "noul") {
      critLabel.textContent = L("成立时");
      const wrap = document.createElement("div");
      wrap.className = "functions-noul-fields";
      wrap.innerHTML = '<label class="functions-field">' + L("成立时") + '<textarea class="mw-input" data-noul-true rows="2"></textarea></label>'
        + '<label class="functions-field">' + L("不成立时") + '<textarea class="mw-input" data-noul-false rows="2"></textarea></label>';
      wrap.querySelector("[data-noul-true]").value = rec.criteria?.true_description || "";
      wrap.querySelector("[data-noul-false]").value = rec.criteria?.false_description || "";
      critEl.append(wrap);
    } else if (kind === "score") {
      critLabel.textContent = L("档位");
      const levels = Array.isArray(rec.criteria) && rec.criteria.length ? rec.criteria : ["", ""];
      levels.forEach((level) => addScoreRow(level));
    } else {
      critLabel.textContent = L("返回哪些结果");
      const rows = Array.isArray(rec.criteria) && rec.criteria.length
        ? rec.criteria
        : [{ key: "yes", description: "" }, { key: "no", description: "" }];
      rows.forEach((row) => addChoice(row.key, row.description || ""));
    }
    critEl.querySelectorAll("input, textarea, button").forEach((node) => { node.disabled = locked; });
    addCrit.disabled = locked;
    paintPalette(rec);
    renderMap(rec);
    syncHint(rec.scene_id || "", hints(rec.scene_id || "", readKinds()));
  };
  const renderRoute = (rec) => {
    const kind = prim(rec);
    const dst = rec.scene_id || "";
    const kindSet = new Set(rec.subject_kinds || []);
    const list = bench.querySelector(".functions-dest-list");
    list.replaceChildren();
    const destinations = [{ destination_id: "", kind: "none", title: L("独立使用"), when: L("先写规则、试跑，暂不接入页面。") }, ...cat.destinations];
    const chosen = destOf(dst, rec);
    if (dst && !cat.destinations.includes(chosen)) destinations.push(chosen);
    destinations.forEach(destination => {
      const btnEl = document.createElement("button");
      btnEl.type = "button"; btnEl.className = "functions-dest";
      btnEl.dataset.functionsDestination = destination.destination_id; btnEl.dataset.kind = destination.kind;
      if (destination.scene_version) btnEl.dataset.sceneVersion = String(destination.scene_version);
      if (destination.provider_id) btnEl.dataset.sceneProvider = destination.provider_id;
      const title = document.createElement("strong"); title.textContent = L(destination.title) + (destination.scene_version ? " · v" + destination.scene_version : "");
      const hint = document.createElement("small"); hint.textContent = destination.availability?.available === false ? L(destination.availability.reason) : L(destination.when || "");
      btnEl.append(title, hint); list.append(btnEl);
    });
    for (const kindId of kindSet) if (![...bench.querySelectorAll("[data-functions-source]")].some(node => node.dataset.functionsSource === kindId)) {
      const label = document.createElement("label"); label.className = "functions-chip";
      const input = document.createElement("input"); input.type = "checkbox"; input.className = "mw-check"; input.dataset.functionsSource = kindId;
      const text = document.createElement("span"); text.textContent = kindId + " · " + L("原对象类型");
      label.append(input, text); bench.querySelector("[data-functions-subject-list]").append(label);
    }
    bench.querySelectorAll("[data-functions-destination]").forEach((node) => {
      const id = node.dataset.functionsDestination || "";
      const ref = destRef(node);
      const on = id === dst && (id ? ref.scene_version === (chosen?.scene_version || null) && ref.scene_provider_id === (chosen?.provider_id || null) : true);
      node.classList.toggle("is-current", on);
      node.setAttribute("aria-pressed", String(on));
      const dest = destOf(id, ref);
      const related = dest && dest.subject_kinds && dest.subject_kinds.some((item) => kindSet.has(item));
      node.classList.toggle("is-related", Boolean(related && !on));
      node.disabled = rec.status === "published" || dest?.availability?.available === false || (kind === "score" && dest && dest.kind === "event");
    });
    if (choiceOnlyHint) choiceOnlyHint.hidden = kind !== "score";
    destinationHint.textContent = destOf(dst)?.availability?.available === false ? L(destOf(dst).availability.reason) : dst === "agent.mcp"
      ? L("返回建议给 Agent；不会自动执行工具。实际调用取决于工具启用状态和权限。")
      : dst === "feed.capture" ? L("发布后，到 Feed 任务的捕捉规则中选择此函数；具体处理由该规则决定。")
      : dst ? L("判断结果用于推荐页面动作。发布后还需要在当前项目启用。")
      : L("可先保存和试跑，不必绑定任何页面。发布后也可通过接口调用。");
    bench.querySelectorAll("[data-functions-source]").forEach((node) => {
      const kindId = node.dataset.functionsSource;
      node.checked = kindSet.has(kindId);
      node.disabled = rec.status === "published";
      const dest = destOf(dst);
      node.closest(".functions-chip")?.classList.toggle("is-related", Boolean(dest?.subject_kinds?.includes(kindId)));
    });
  };
  const renderSamples = (rec) => {
    samplesEl.replaceChildren();
    (rec.samples || []).forEach((sample) => {
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
  const renderPreview = (rec) => {
    const peek = rec?.last_preview;
    lastPreview.replaceChildren();
    if (!peek) {
      lastPreview.hidden = true;
      if (rec && !sampleText.value) sampleText.value = "";
      return;
    }
    if (!sampleText.value) sampleText.value = peek.input || "";
    lastPreview.hidden = false;
    const head = document.createElement("div");
    head.className = "functions-preview-head";
    const title = document.createElement("strong");
    const kind = peek.primitive || prim(rec);
    if (peek.outcome === "needs_review") title.textContent = L("需要复核");
    else if (kind === "choice") title.textContent = L("已选出") + " " + outputLabel(rec, peek.choice || "");
    else if (kind === "noul") title.textContent = L("成立概率") + " " + Number(peek.noul ?? 0).toFixed(2);
    else title.textContent = L("判断完成") + " " + String(peek.score ?? "");
    const model = document.createElement("small");
    model.textContent = peek.model ? "model " + peek.model : "";
    head.append(title, model);
    lastPreview.append(head);
    const hint = document.createElement("small");
    hint.textContent = L("模型概率不是正确率。");
    lastPreview.append(hint);
    if (kind === "noul") lastPreview.append(meter(peek.noul ?? 0));
    if (kind === "choice") {
      Object.entries(peek.probabilities || {}).forEach(([key, value]) => {
        const row = document.createElement("div");
        row.className = "functions-probability";
        const code = document.createElement("code");
        code.textContent = outputLabel(rec, key);
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
      (peek.legend || []).forEach((label, index) => {
        const item = document.createElement("span");
        if (Number(peek.score) === index) item.className = "is-chosen";
        const code = document.createElement("code");
        code.textContent = String(index);
        item.append(code, document.createTextNode(" " + label));
        legend.append(item);
      });
      lastPreview.append(legend);
    }
  };
  const ruleRequest = (rec, suffix, method = "GET", body) => {
    const path = "/api/functions/" + encodeURIComponent(rec.id) + "/" + suffix;
    return api ? api(path, method, body) : req(method, path, body);
  };
  const paintUses = async (rec) => {
    if (!usagesEl) return;
    const sequence = ++usagesSeq;
    const current = () => sel?.id === rec.id && sequence === usagesSeq;
    usagesEl.replaceChildren();
    const head = document.createElement("strong"); head.textContent = L("使用状态"); usagesEl.append(head);
    const line = (text) => { const p = document.createElement("p"); p.textContent = L(text); usagesEl.append(p); return p; };
    if (rec.status !== "published") {
      line("草稿尚未生效。发布后将在这里显示可配置的位置。");
      return;
    }
    try {
      const [uses, locations] = await Promise.all([ruleRequest(rec, "usages"), ruleRequest(rec, "targets")]);
      if (!current()) return;
      const usages = uses.usages || [];
      const sameRule = (binding) => binding?.function?.capability_id === "functions.published." + rec.function_key
        && binding.function.version === rec.version && binding.function.provider_id === "system.functions";
      const targets = (locations.targets || []).filter(aim => aim.availability.available || sameRule(aim.binding) || aim.scene_id === rec.scene_id);
      const title = (container, row) => {
        if (row.href?.startsWith("/") && !row.href.startsWith("//")) {
          const link = document.createElement("a"); link.href = row.href; link.textContent = row.title; container.append(link);
        } else container.append(document.createTextNode(row.title || destTitle(row.scene_id)));
      };
      const targetKey = (row) => JSON.stringify([row.scene_id, row.scene_version, row.binding_id, row.project_id]);
      const shown = new Set();
      targets.forEach(aim => {
        const own = sameRule(aim.binding);
        const active = own && aim.binding.enabled;
        const section = document.createElement("div"); section.className = "functions-usage-target";
        const summary = document.createElement("p"); title(summary, aim);
        const state = own ? (active ? "已启用" : "已停用") : aim.binding?.enabled ? "正在使用另一条判断规则" : "尚未启用此判断";
        section.append(summary);
        const detail = document.createElement("p");
        detail.textContent = destTitle({ scene_id: aim.scene_id, scene_version: aim.scene_version, scene_provider_id: aim.provider_id }) + " · " + L(state); section.append(detail);
        const availability = active ? aim.configuration_availability : aim.availability;
        if (!aim.availability.available) {
          const reason = document.createElement("p"); reason.textContent = L(aim.availability.reason); section.append(reason);
        }
        const btnEl = document.createElement("button"); btnEl.type = "button"; btnEl.className = "mw-btn mw-btn--secondary";
        btnEl.textContent = L(active ? "停用" : aim.binding && !own ? "换成这个" : "在此启用");
        btnEl.dataset.functionsSceneBind = active ? "off" : "on";
        btnEl.dataset.functionsBindingId = aim.binding_id;
        btnEl.dataset.functionsSceneId = aim.scene_id;
        btnEl.dataset.functionsSceneVersion = String(aim.scene_version);
        btnEl.disabled = !availability.available;
        configReads.set(btnEl, { id: rec.id, scene_id: aim.scene_id, scene_version: aim.scene_version,
          provider_id: aim.provider_id, binding_id: aim.binding_id, expected_revision: aim.revision, enabled: !active });
        section.append(btnEl); usagesEl.append(section);
        if (own) shown.add(targetKey(aim));
      });
      usages.filter(row => !shown.has(targetKey(row))).forEach(row => {
        const summary = document.createElement("p"); title(summary, row);
        const state = row.availability?.available === false ? row.availability.reason : row.enabled === false ? "已停用" : row.enabled === true ? "已启用" : "";
        if (state) summary.append(document.createTextNode(" · " + L(state)));
        usagesEl.append(summary);
      });
      if (!targets.length && !usages.length) line(rec.scene_id === "agent.mcp"
        ? "已发布，可供授权的 Agent 调用。返回判断和推荐能力，具体动作需另行调用。"
        : rec.scene_id ? "当前范围没有可配置的位置。请先在对应场景中创建规则或检查插件状态。"
        : "当前范围未绑定消费场景，可独立调用。");
    } catch (error) {
      if(current()) { const status=document.createElement("p");molisWorkRequest.show(status,error,L("未能读取实际使用位置，请重试。"));usagesEl.append(status); }
    }
  };
  const fillEditor = (rec) => {
    const switching = sel?.id !== rec.id;
    sel = rec;
    if (switching) {
      dirty = false;
      bench.querySelector("[data-functions-subject-details]").open = Boolean(rec.subject_kinds?.length);
      paletteInfo.open = false;
      setStep(rec.status === "published" ? "use" : "look");
      paletteFind.value = "";
    }
    saveStatus.textContent = rec.status === "published" ? L("已发布 · 规则只读") : L("草稿自动保存");
    bench.querySelector("[data-functions-kind-description]").textContent = prim(rec) === "noul"
      ? L("是非判断：返回成立的概率，例如材料是否足够。")
      : prim(rec) === "score" ? L("等级评分：按你定义的档位返回分数，例如紧急程度。")
      : L("结果选择：从你定义的结果中选出一个，例如跟进、保存或忽略。");
    releaseHint.textContent = rec.status === "published" ? L("规则已锁定，可以继续试跑，并查看或调整使用状态。") : L("发布会锁定名称、规则和用途。确认试跑符合预期后再发布；发布不会自动启用页面判断。");
    bench.setAttribute("data-expanded", "true");
    workspace.hidden = false;
    titleEl.textContent = rec.name;
    statusEl.textContent = rec.status === "published" ? "v" + (rec.version || 1) : L("草稿");
    nameInput.value = rec.name;
    keyInput.value = rec.function_key;
    const locked = rec.status === "published";
    nameInput.disabled = locked;
    keyInput.disabled = locked;
    promptInput.disabled = locked;
    promptInput.value = rec.instructions;
    deleteBtn.hidden = locked;
    pubBtn.hidden = locked;
    pubBtn.textContent = L("发布 v1");
    if (switching) sampleText.value = rec.last_preview?.input || "";
    renderRoute(rec);
    renderCriteria(rec);
    renderSamples(rec);
    renderPreview(rec);
    void paintUses(rec);
    showNote(locked ? L("已发布。") : "", false);
    list.querySelectorAll("[data-function-id]").forEach((row) => {
      const on = row.dataset.functionId === rec.id;
      row.classList.toggle("is-selected", on);
      row.setAttribute("aria-selected", String(on));
    });
  };
  const closeEditor = () => {
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
  const rememberRecord = (rec) => {
    records = records.some((item) => item.id === rec.id)
      ? records.map((item) => item.id === rec.id ? rec : item) : [rec, ...records];
    renderList();
  };
  const paintList = () => {
    empty.hidden = records.length > 0;
    rowsEl.replaceChildren();
    records.forEach((rec) => {
      const item = document.createElement("article");
      item.className = "feed-stage-item";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "feed-stage-entry directory-list-row" + (sel?.id === rec.id ? " is-selected" : "");
      row.dataset.functionId = rec.id;
      row.setAttribute("aria-selected", String(sel?.id === rec.id));
      const leading = document.createElement("span");
      leading.className = "feed-stage-leading";
      const title = document.createElement("strong");
      title.title = rec.name;
      title.textContent = rec.name;
      leading.append(title);
      const primitive = rec.primitive === "noul" ? L("是非") : rec.primitive === "score" ? L("评分") : L("选择");
      const published = rec.status === "published";
      const status = document.createElement("span");
      status.className = "mw-status mw-status--" + (published ? "done" : "quiet") + " feed-entry-status";
      status.dataset.mwState = published ? "ready" : "draft"; status.textContent = published ? "v" + (rec.version || 1) : L("草稿");
      row.append(
        leading,
        kindChip(rec.primitive || "choice", primitive),
        textCell("plugin-stage-fact", destTitle(rec)),
        textCell("plugin-stage-meta", functionMeta(rec)),
        status,
      );
      item.append(row);
      rowsEl.append(item);
    });
  };
  const loadCatalog = async () => {
    const payload = api ? await api("/api/functions/catalog", "GET") : await req("GET", "/api/functions/catalog");
    if (payload.catalog) cat = payload.catalog;
    const subjects = bench.querySelector("[data-functions-subject-list]");
    if (cat.subjects.length && subjects) {
      const checked = new Set(sel?.subject_kinds || readKinds());
      subjects.replaceChildren();
      cat.subjects.forEach((subject) => {
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
    const payload = await req("GET", "/api/functions");
    if (seq !== listSeq) return;
    records = payload.functions || [];
    renderList();
    if (!sel) return;
    const next = records.find((item) => item.id === sel.id);
    if (opts.preserveForm) {
      if (!next) closeEditor();
      return;
    }
    if (next) {
      if (opts.remount) fillEditor(next);
      else {
        sel = next;
        titleEl.textContent = next.name;
      }
    }
    else closeEditor();
  };
  const draftBody = () => ({
    name: nameInput.value,
    function_key: keyInput.value,
    instructions: promptInput.value,
    criteria: readCriteria(),
    ...sceneRef(),
    subject_kinds: readKinds(),
    scene_map: sceneMap(),
    action_map: actionMap(),
    updated_at: sel.updated_at,
  });
  let saving = null;
  const saveDraft = async () => {
    clearTimeout(saveTick); saveTick = 0;
    const rec = sel, revision = editRevision;
    if (!rec || rec.status === "published") return rec;
    const body = draftBody();
    if (saving) { const prior = await saving; if (prior?.id === rec.id) body.updated_at = prior.updated_at; }
    const operation = persistDraft(rec.id, body, revision);
    saving = operation;
    try { return await operation; } finally { if (saving === operation) saving = null; }
  };
  const persistDraft = async (savingId, body, revision) => {
    if (sel?.id === savingId) saveStatus.textContent = L("正在保存…");
    try {
      const payload = await req("POST", "/api/functions/" + encodeURIComponent(savingId), body);
      const saved = payload.function;
      rememberRecord(saved);
      if (sel?.id !== savingId) return saved;
      sel = saved;
      if (revision === editRevision) dirty = false;
      saveStatus.textContent = dirty ? L("有更改，等待保存…") : L("已保存");
      titleEl.textContent = sel.name;
      showNote("", false);
      return sel;
    } catch (error) {
      if (sel?.id === savingId) {
        saveStatus.textContent = L("未保存 · 请修正后重试");
        await loadList({ preserveForm: true }).catch(() => {});
      }
      throw error;
    }
  };
  const queueSave = () => {
    if (!sel || sel.status === "published") return;
    const savingId = sel.id;
    dirty = true;
    editRevision++;
    saveStatus.textContent = L("有更改，等待保存…");
    clearTimeout(saveTick);
    saveTick = setTimeout(() => {
      void saveDraft().catch((error) => {
        if (sel?.id === savingId) showNote(error, true);
      });
    }, 280);
  };
  const remember = (rec, origin) => {
    rememberRecord(rec);
    if (origin && sel?.id !== origin.id) return;
    if (origin && editRevision !== origin.revision) {
      sel = { ...sel, updated_at: rec.updated_at, samples: rec.samples };
      renderSamples(sel); return;
    }
    const next = page.address(); next.searchParams.set("rule", rec.id); next.searchParams.delete("key");
    page.replace(next);
    const listNote = bench.querySelector("[data-functions-list-note]");
    if (listNote) listNote.hidden = true;
    fillEditor(rec);
  };
  bench.addEventListener("molis-work:select-item", (event) => {
    const id = event.detail?.itemId;
    if (!id) { selectSeq++; openingId = null; return; }
    if (sel?.id === id) {
      bench.setAttribute("data-expanded", "true"); workspace.hidden = false; return;
    }
    if (openingId === id) return;
    openingId = id;
    const seq = ++selectSeq;
    void (async () => {
      if (sel && (saveTick || saving || dirty)) { clearTimeout(saveTick); saveTick = 0; await saveDraft(); }
      await loadCatalog();
      const payload = await req("GET", "/api/functions/" + encodeURIComponent(id));
      if (seq === selectSeq) remember(payload.function);
    })().catch((error) => { if (seq === selectSeq) showNote(error, true); })
      .finally(() => { if (seq === selectSeq) openingId = null; });
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
    showNote("", false);
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
      if (dirty || saveTick || saving) await saveDraft();
      const payload = await req("POST", "/api/functions", { primitive });
      closeCreate();
      await loadList();
      remember(payload.function);
    } catch (error) {
      molisWorkRequest.show(createNote,error,L("保存失败"));
    } finally {
      creating = false;
      createForm.querySelectorAll("button").forEach((node) => { node.disabled = false; });
    }
  });
  bench.querySelector("[data-functions-back]").addEventListener("click", async () => {
    try {
      await saveDraft();
      closeEditor();
      await loadList();
    } catch (error) { showNote(error, true); }
  });
  deleteBtn.addEventListener("click", async () => {
    if (!sel || sel.status === "published") return;
    const rec = sel;
    if (!window.confirm(L("确定删除这个草稿？"))) return;
    try {
      await req("POST", "/api/functions/" + encodeURIComponent(rec.id) + "/delete", { updated_at: rec.updated_at });
      if (sel?.id === rec.id) closeEditor();
      await loadList({ preserveForm: true });
    } catch (error) { if (sel?.id === rec.id) showNote(error, true); }
  });
  addCrit.addEventListener("click", () => {
    if (sel?.status === "published") return;
    if (prim(sel) === "score") addScoreRow("");
    else if (prim(sel) === "choice") addChoice(nextOptionKey(), "");
    paintPalette(sel);
    renderMap(sel);
    queueSave();
  });
  usagesEl?.addEventListener("click", async (event) => {
    const btnEl = event.target.closest("[data-functions-scene-bind]");
    const args = btnEl && configReads.get(btnEl);
    if (!args || btnEl.disabled || sel?.id !== args.id) return;
    const rec = sel;
    btnEl.disabled = true;
    try {
      await ruleRequest(rec, "configure", "POST", args);
      if (sel?.id === rec.id) await paintUses(sel);
    } catch (error) {
      if (sel?.id !== rec.id) return;
      await paintUses(sel);
      if (sel?.id !== rec.id) return;
      const status = document.createElement("p"); status.setAttribute("role", "alert");
      molisWorkRequest.show(status,error,L("配置未保存，请重试。")); usagesEl.append(status);
    }
  });
  bench.querySelector("[data-functions-destinations]").addEventListener("click", (event) => {
    const btnEl = event.target.closest("[data-functions-destination]");
    if (!btnEl || !sel || sel.status === "published" || btnEl.disabled) return;
    const dst = btnEl.dataset.functionsDestination || "";
    if (prim(sel) === "score" && dst && dst !== "agent.mcp") {
      showNote(L("Score 不能绑 Inbox、首页、Feed。"), true);
      return;
    }
    const ref = destRef(btnEl);
    if (dst === (sel.scene_id || "") && ref.scene_version === (sel.scene_version || null)
      && ref.scene_provider_id === (sel.scene_provider_id || null)) return;
    sel = {
      ...sel,
      ...ref,
      scene_map: dst && dst !== "agent.mcp" ? (sel.scene_map || {}) : {},
      action_map: dst === "agent.mcp" ? (sel.action_map || {}) : {},
    };
    renderRoute(sel);
    syncPanel();
    void paintUses(sel);
    queueSave();
  });
  paletteFind.addEventListener("input", () => { if (sel) paintPalette(sel); });
  form.addEventListener("submit", (event) => event.preventDefault());
  form.addEventListener("input", (event) => {
    if (event.target.matches("[data-functions-palette-search], [data-functions-preview-input]")) return;
    if (event.target.matches("[data-choice-key], [data-choice-description]")) {
      if (sel) renderMap({ ...sel, criteria: readCriteria(), scene_map: sceneMap(), action_map: actionMap() });
    }
    queueSave();
  });
  form.addEventListener("change", (event) => {
    if (event.target.matches("[data-functions-source]")) {
      if (sel && sel.status !== "published") {
        sel = { ...sel, subject_kinds: readKinds(), scene_map: sceneMap(), action_map: actionMap() };
        renderRoute(sel);
        syncPanel();
      }
    }
    if (event.target.matches("[data-map-key]") && sel) {
      sel = { ...sel, scene_map: sceneMap(), action_map: actionMap(), criteria: readCriteria() };
      void paintUses(sel);
    }
    queueSave();
  });
  form.addEventListener("click", (event) => {
    const paletteAdd = event.target.closest("[data-palette-add]");
    if (paletteAdd && sel?.status !== "published" && prim(sel) === "choice") {
      const beh = behaviorOf(paletteAdd.dataset.paletteAdd);
      sel = { ...sel, scene_map: sceneMap(), action_map: actionMap() };
      if (beh.action_ref && destKey() === "agent.mcp") sel.action_map[beh.behavior_id] = beh.action_ref;
      if (!readKeys().includes(beh.behavior_id)) {
        addChoice(beh.behavior_id, behaviorTitle(beh));
      }
      paintPalette(sel);
      renderMap(sel);
      queueSave();
      return;
    }
    const removeChoice = event.target.closest("[data-choice-remove]");
    if (removeChoice && sel?.status !== "published") {
      if (critEl.querySelectorAll("[data-choice-row]").length < 3) {
        showNote(L("Choice 至少需要两个选项"), true);
        return;
      }
      removeChoice.closest("[data-choice-row]").remove();
      paintPalette(sel);
      renderMap(sel);
      queueSave();
      return;
    }
    const removeScore = event.target.closest("[data-score-remove]");
    if (removeScore && sel?.status !== "published") {
      if (critEl.querySelectorAll("[data-score-level]").length < 3) {
        showNote(L("Score 至少需要两个档位"), true);
        return;
      }
      removeScore.closest(".functions-criterion").remove();
      [...critEl.querySelectorAll("[data-score-index]")].forEach((node, index) => { node.textContent = String(index); });
      queueSave();
    }
  });
  samplesEl.addEventListener("click", async (event) => {
    const load = event.target.closest("[data-sample-load]");
    const remove = event.target.closest("[data-sample-remove]");
    const row = event.target.closest("[data-sample-id]");
    if (!row || !sel) return;
    const sample = (sel.samples || []).find((item) => item.id === row.dataset.sampleId);
    if (load && sample) sampleText.value = sample.input || "";
    if (remove) {
      const rec = sel, origin = { id: rec.id, revision: editRevision };
      try {
        const payload = await req("POST", "/api/functions/" + encodeURIComponent(rec.id) + "/samples/delete", {
          sample_id: row.dataset.sampleId, updated_at: rec.updated_at,
        });
        remember(payload.function, origin);
      } catch (error) { if (sel?.id === rec.id) showNote(error, true); }
    }
  });
  bench.querySelector("[data-functions-save-sample]").addEventListener("click", async () => {
    if (!sel) return;
    const origin = { id: sel.id, revision: editRevision }, input = sampleText.value;
    try {
      const saved = await saveDraft();
      const payload = await req("POST", "/api/functions/" + encodeURIComponent(origin.id) + "/samples", { input, updated_at: saved.updated_at });
      remember(payload.function, origin);
    } catch (error) { if (sel?.id === origin.id) showNote(error, true); }
  });
  rowsEl.addEventListener("click", async (event) => {
    const row = event.target.closest("[data-function-id]");
    if (!row) return;
    const rec = records.find((item) => item.id === row.dataset.functionId);
    if (rec) {
      if (sel?.id === rec.id) return;
      try {
        if (saveTick || saving || dirty) await saveDraft();
        fillEditor(rec);
      } catch (error) { showNote(error, true); }
    }
  });
  let previewing = false;
  const previewBtn = bench.querySelector("[data-functions-preview]");
  previewBtn.addEventListener("click", async () => {
    if (!sel || previewing) return;
    const previewId = sel.id;
    previewing = true;
    bench.querySelectorAll("[data-functions-col=look], [data-functions-col=fn]").forEach((node) => { node.inert = true; });
    pubBtn.disabled = true;
    previewBtn.disabled = true;
    previewBtn.textContent = L("正在试跑…");
    showNote(L("正在请求判断，通常需要几秒。"), false);
    try {
      await saveDraft();
      if (sel?.id !== previewId) return;
      const payload = await req("POST", "/api/functions/" + encodeURIComponent(previewId) + "/preview", {
        input: sampleText.value,
        updated_at: sel.updated_at,
      });
      if (sel?.id !== previewId) return;
      remember(payload.function);
    } catch (error) {
      if (sel?.id === previewId) {
        if (error.code === "functions.invalid" && !promptInput.value.trim()) setStep("fn", true);
        showNote(error, true);
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
      pubBtn.disabled = false;
      previewBtn.disabled = false;
      previewBtn.textContent = L("试跑");
    }
  });
  pubBtn.addEventListener("click", async () => {
    if (!sel || pubBtn.disabled) return;
    if (destKey() && destKey() !== "agent.mcp" && !mappingReady({ ...sel, scene_id: destKey(), criteria: readCriteria(), scene_map: sceneMap() })) {
      setStep("fn", true);
      showNote(L("还有结果未对应页面动作，请补齐后再发布。"), true);
      return;
    }
    const publishId = sel.id;
    pubBtn.disabled = true;
    showNote("", false);
    try {
      await saveDraft();
      if (sel?.id !== publishId) return;
      const path = "/api/functions/" + encodeURIComponent(publishId) + "/publish";
      const body = { updated_at: sel.updated_at };
      const payload = api ? await api(path, "POST", body) : await req("POST", path, body);
      if (sel?.id !== publishId) return;
      remember(payload.function);
      await loadList();
    } catch (error) {
      if (sel?.id === publishId) showNote(error, true);
    } finally { pubBtn.disabled = false; }
  });
  const load = () => loadCatalog().then(loadList).catch((error) => {
    empty.hidden = false;
    molisWorkRequest.show(empty.querySelector("p"),error,L("Functions 请求失败"));
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
    const id = params.get("rule") || records.find(rec => rec.function_key === params.get("key"))?.id;
    if (id) bench.dispatchEvent(new CustomEvent("molis-work:select-item", { detail: { itemId: id } }));
    else if (params.get("key")) showNote(L("找不到这条判断规则，请从列表重新选择。"), true);
  });
}
`;
