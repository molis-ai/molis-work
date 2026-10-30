/** Functions workbench, part of FUNCTIONS_CLIENT_FACTORY_SCRIPT joined in place: the palette, the map, criteria, route, samples, preview and uses painters. */
export const FUNCTIONS_CLIENT_RENDER_PART = `  const sourceLabel = (source) => source === "mcp" ? L("MCP") : source === "plugin" ? L("插件") : L("系统");
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
`;
