/** Functions workbench, part of FUNCTIONS_CLIENT_FACTORY_SCRIPT joined in place: the palette, the map, criteria, route, samples, preview and uses painters. */
export const FUNCTIONS_CLIENT_RENDER_PART = `  const sourceLabel = (source) => source === "mcp" ? "MCP" : source === "plugin" ? globalThis.t.text("workbench.client-render.plugin") : globalThis.t.text("workbench.client-render.system");
  const addPalette = (beh, parent) => {
    const row = document.createElement("div");
    row.className = "functions-palette-row";
    const body = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = optionTitle(beh);
    const meta = document.createElement("small");
    const bits = [sourceLabel(beh.source)];
    if (beh.plugin_title && beh.source !== "system") bits.push(beh.plugin_title);
    if (beh.hint) bits.push(beh.hint);
    meta.textContent = bits.join(" · ");
    body.append(title, meta);
    const effect = document.createElement("span");
    effect.className = "functions-effect";
    effect.dataset.effect = beh.effect;
    effect.textContent = beh.effect === "write" ? globalThis.t.text("workbench.client-render.changes-data-when-executed") : globalThis.t.text("workbench.client-render.read-only");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "mw-btn mw-btn--ghost";
    add.dataset.paletteAdd = beh.option_id;
    add.textContent = globalThis.t.text("workbench.client-render.add");
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
    const fresh = hints(dst, kinds).filter((row) => row && !used.has(row.option_id))
      .filter((row) => !query || [row.title, row.hint, row.plugin_title, row.option_id].join(" ").toLocaleLowerCase().includes(query));
    if (!fresh.length) {
      const hint = document.createElement("p");
      hint.className = "functions-hint";
      hint.textContent = query ? globalThis.t.text("workbench.client-render.no-matching-capabilities-try-different-search") : !dst && !kinds.length ? globalThis.t.text("workbench.client-render.choose-use-subject-see-relevant-capabilities") : globalThis.t.text("workbench.client-render.no-actions-add-they-may-already-be-included");
      paletteEl.append(hint);
      return;
    }
    const head = document.createElement("strong");
    head.textContent = globalThis.t.text("workbench.client-render.add-actions");
    paletteEl.append(head);
    if (dst === "agent.mcp") {
      const groups = new Map();
      fresh.forEach((row) => {
        const label = row.source === "system" ? globalThis.t.text("workbench.client-render.system") : sourceLabel(row.source) + " · " + row.plugin_title;
        const listItems = groups.get(label) || [];
        listItems.push(row);
        groups.set(label, listItems);
      });
      groups.forEach((groupItems, label) => {
        const group = document.createElement("div");
        group.className = "functions-option-group";
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
    mapPanel.querySelector("[data-functions-map-title]").textContent = globalThis.t.text(agentDest ? "workbench.client-render.capabilities-recommended-each-result" : "workbench.client-render.map-results-page-actions");
    mapPanel.querySelector("[data-functions-map-hint]").textContent = globalThis.t.text(agentDest
      ? "workbench.client-render.recommend-capability-each-result-return-judgment-alone-recommend"
      : "workbench.client-render.map-every-result-action-before-activating-page");
    const pool = agentDest ? hints(dst, readKinds()) : (dest.option_ids || []).map(id => optionOf(id));
    const map = agentDest ? rec.action_map || {} : rec.scene_map || {};
    const rows = kind === "noul"
      ? [
        { key: "true", label: globalThis.t.text("workbench.client-render.true") },
        { key: "false", label: globalThis.t.text("workbench.client-render.false") },
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
      empty.textContent = globalThis.t.text(agentDest ? "workbench.client-render.return-judgment-only" : "workbench.client-render.choose-matching-action");
      select.append(empty);
      pool.forEach((beh) => {
        const option = document.createElement("option");
        option.value = agentDest ? actionRef(beh.action_ref) : beh.option_id;
        option.textContent = beh.title + (agentDest ? " · " + beh.plugin_title + " · v" + beh.action_ref.version : "")
          + (beh.availability?.available === false ? " · " + beh.availability.reason : "");
        option.disabled = beh.availability?.available === false;
        select.append(option);
      });
      const current = agentDest ? actionRef(map[row.key]) : map[row.key] || row.key;
      if (current && ![...select.options].some(option => option.value === current)) {
        const missing = document.createElement("option");
        missing.value = current;
        missing.textContent = globalThis.t.text("workbench.client-render.original-action-unavailable-choose-again");
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
      critLabel.textContent = globalThis.t.text("workbench.client-render.when-true");
      const wrap = document.createElement("div");
      wrap.className = "functions-noul-fields";
      wrap.innerHTML = '<label class="functions-field">' + globalThis.t.text("workbench.client-render.when-true") + '<textarea class="mw-input" data-noul-true rows="2"></textarea></label>'
        + '<label class="functions-field">' + globalThis.t.text("workbench.client-render.when-false") + '<textarea class="mw-input" data-noul-false rows="2"></textarea></label>';
      wrap.querySelector("[data-noul-true]").value = rec.criteria?.true_description || "";
      wrap.querySelector("[data-noul-false]").value = rec.criteria?.false_description || "";
      critEl.append(wrap);
    } else if (kind === "score") {
      critLabel.textContent = globalThis.t.text("workbench.client-render.levels");
      const levels = Array.isArray(rec.criteria) && rec.criteria.length ? rec.criteria : ["", ""];
      levels.forEach((level) => addScoreRow(level));
    } else {
      critLabel.textContent = globalThis.t.text("workbench.client-render.possible-results");
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
    const destinations = [{ destination_id: "", kind: "none", title: globalThis.t.text("workbench.client-render.standalone"), when: globalThis.t.text("workbench.client-render.write-test-rules-without-connecting-page-yet") }, ...cat.destinations];
    const chosen = destOf(dst, rec);
    if (dst && !cat.destinations.includes(chosen)) destinations.push(chosen);
    destinations.forEach(destination => {
      const btnEl = document.createElement("button");
      btnEl.type = "button"; btnEl.className = "functions-dest";
      btnEl.dataset.functionsDestination = destination.destination_id; btnEl.dataset.kind = destination.kind;
      if (destination.scene_version) btnEl.dataset.sceneVersion = String(destination.scene_version);
      if (destination.provider_id) btnEl.dataset.sceneProvider = destination.provider_id;
      const title = document.createElement("strong"); title.textContent = destination.title + (destination.scene_version ? " · v" + destination.scene_version : "");
      const hint = document.createElement("small"); hint.textContent = destination.availability?.available === false ? destination.availability.reason : (destination.when || "");
      btnEl.append(title, hint); list.append(btnEl);
    });
    for (const kindId of kindSet) if (![...bench.querySelectorAll("[data-functions-source]")].some(node => node.dataset.functionsSource === kindId)) {
      const label = document.createElement("label"); label.className = "functions-chip";
      const input = document.createElement("input"); input.type = "checkbox"; input.className = "mw-check"; input.dataset.functionsSource = kindId;
      const text = document.createElement("span"); text.textContent = kindId + " · " + globalThis.t.text("workbench.client-render.original-subject-type");
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
    destinationHint.textContent = destOf(dst)?.availability?.available === false ? (destOf(dst).availability.reason) : dst === "agent.mcp"
      ? globalThis.t.text("workbench.client-render.returns-suggestion-agent-without-running-tools-calls-depend")
      : dst === "feed.capture" ? globalThis.t.text("workbench.client-render.after-publishing-select-function-feed-task-s-capture")
      : dst ? globalThis.t.text("workbench.client-render.results-suggest-page-actions-activate-project-after-publishing")
      : globalThis.t.text("workbench.client-render.save-test-without-binding-page-published-functions-can");
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
      load.textContent = sample.label || globalThis.t.text("workbench.client-render.load");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mw-btn mw-btn--ghost mw-btn--icon-only";
      remove.dataset.sampleRemove = "true";
      remove.setAttribute("aria-label", globalThis.t.text("workbench.client-render.remove-sample"));
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
    if (peek.outcome === "needs_review") title.textContent = globalThis.t.text("workbench.client-render.needs-review");
    else if (kind === "choice") title.textContent = globalThis.t.text("workbench.client-render.picked") + " " + outputLabel(rec, peek.choice || "");
    else if (kind === "noul") title.textContent = globalThis.t.text("workbench.client-render.probability") + " " + Number(peek.noul ?? 0).toFixed(2);
    else title.textContent = globalThis.t.text("workbench.client-render.judged") + " " + String(peek.score ?? "");
    const model = document.createElement("small");
    model.textContent = peek.model ? "model " + peek.model : "";
    head.append(title, model);
    lastPreview.append(head);
    const hint = document.createElement("small");
    hint.textContent = globalThis.t.text("workbench.client-render.probability-not-accuracy");
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
    const head = document.createElement("strong"); head.textContent = globalThis.t.text("workbench.client-render.usage-status"); usagesEl.append(head);
    const line = (text) => { const p = document.createElement("p"); p.textContent = globalThis.t.text(text); usagesEl.append(p); return p; };
    if (rec.status !== "published") {
      line("workbench.client-render.draft-not-active-places-can-configure-will-appear");
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
        const state = own ? (active ? "workbench.client-render.enabled" : "workbench.client-render.switched-off") : aim.binding?.enabled ? "workbench.client-render.another-rule-use" : "workbench.client-render.check-not-enabled-yet";
        section.append(summary);
        const detail = document.createElement("p");
        detail.textContent = destTitle({ scene_id: aim.scene_id, scene_version: aim.scene_version, scene_provider_id: aim.provider_id }) + " · " + state; section.append(detail);
        const availability = active ? aim.configuration_availability : aim.availability;
        if (!aim.availability.available) {
          const reason = document.createElement("p"); reason.textContent = aim.availability.reason; section.append(reason);
        }
        const btnEl = document.createElement("button"); btnEl.type = "button"; btnEl.className = "mw-btn mw-btn--secondary";
        btnEl.textContent = globalThis.t.text(active ? "workbench.client-render.deactivate" : aim.binding && !own ? "workbench.client-render.use" : "workbench.client-render.enable-here");
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
        const state = row.availability?.available === false ? row.availability.reason : row.enabled === false ? "workbench.client-render.switched-off" : row.enabled === true ? "workbench.client-render.enabled" : "";
        if (state) summary.append(document.createTextNode(" · " + state));
        usagesEl.append(summary);
      });
      if (!targets.length && !usages.length) line(rec.scene_id === "agent.mcp"
        ? "workbench.client-render.published-authorized-agents-returns-judgment-recommended-capabil"
        : rec.scene_id ? "workbench.client-render.scope-has-no-places-configure-create-rule-matching"
        : "workbench.client-render.no-consuming-scene-bound-scope-so-can-be");
    } catch (error) {
      if(current()) { const status=document.createElement("p");molisWorkRequest.show(status,error,globalThis.t.text("workbench.client-render.couldn-t-load-where-actually-used-please-retry"));usagesEl.append(status); }
    }
  };
`;
