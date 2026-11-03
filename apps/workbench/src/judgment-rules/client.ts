import { FUNCTIONS_CLIENT_RENDER_PART } from "./client-render.js";
import { FUNCTIONS_CLIENT_RECORDS_PART } from "./client-records.js";
import { FUNCTIONS_CLIENT_EVENTS_PART } from "./client-events.js";

/**
 * Functions workbench: purpose, rules, then preview and activation. The factory body is one scope: this file holds the setup and the
 * readers, the three sibling files hold the rest as parts joined in place, in order.
 */
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
${FUNCTIONS_CLIENT_RENDER_PART}${FUNCTIONS_CLIENT_RECORDS_PART}${FUNCTIONS_CLIENT_EVENTS_PART}`;
