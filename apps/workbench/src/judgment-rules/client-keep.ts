/**
 * Functions workbench, part of FUNCTIONS_CLIENT_FACTORY_SCRIPT joined in place: keeping what you wrote when the rule changed elsewhere
 * (docs/design/rule-stale-reload, plan A; the page's decisions are specs/action-input-contracts §2.7). A refused write reads the
 * latest record and lands in one state: changed back (saved again, silently), nothing unsaved (the latest comes in and this press
 * waits), or something unsaved (an alert with one way on; the form and the cursor stay). Loading the latest keeps what only you
 * changed and puts yours under each field both sides changed, to put back. The state is plain variables of the factory's scope: the
 * served script is minified, and names of its own cost nothing there.
 */
export const FUNCTIONS_CLIENT_KEEP_PART = `  const bandEl = bench.querySelector("[data-functions-band]");
  const leaveBox = bench.querySelector("[data-functions-leave]");
  const KEEP_FIELDS = [
    { id: "name", step: "look", label: L("名称") }, { id: "route", step: "look", label: L("在哪里使用结果") },
    { id: "instructions", step: "fn", label: L("判断说明") }, { id: "criteria", step: "fn", label: L("返回哪些结果") }, { id: "function_key", step: "fn", label: L("函数 key") },
  ];
  const OWES = ["conflict", "offline", "second", "deleted", "published"];
  const KEEP_STORE = "molis-work:functions-keep:";
  const SWAP = "[data-functions-kept-swap]", KEPT = "[data-functions-kept]", LABEL = "[data-slot=button-label]";
  /** The last record saved or loaded: what "you changed" and "changed elsewhere" are measured against. */
  let base = null;
  // The one state in the feedback slot, and what it holds: your definition, the latest record, the rows kept under fields.
  let phase = "", keptRows = {}, toLook = [], changedIds = [], yoursLabels = [], theirsLabels = [], wasLoaded = false, mineDef = null, latestRec = null, waiting = false, afterLeave = null;
  const reset = () => { phase = ""; keptRows = {}; toLook = []; changedIds = []; yoursLabels = []; theirsLabels = []; wasLoaded = false; mineDef = null; latestRec = null; waiting = false; afterLeave = null; };
  const owes = () => OWES.includes(phase);
  const holding = () => owes() || phase === "viewing";
  const fieldOf = (id) => KEEP_FIELDS.find((field) => field.id === id);
  const labelOf = (id) => fieldOf(id)?.label || id;
  const stepOf = (id) => fieldOf(id)?.step;
  const template = (name) => bench.querySelector('template[data-functions-keep="' + name + '"]')?.content.firstElementChild;
  const alertEl = () => bandEl.querySelector(".mw-alert");
  const hold = (node) => node?.focus({ preventScroll: true });
  const routeOf = (rec) => ({ scene_id: rec.scene_id || null, scene_version: rec.scene_version || null, scene_provider_id: rec.scene_provider_id || null,
    subject_kinds: [...(rec.subject_kinds || [])].sort(), scene_map: rec.scene_map || {}, action_map: rec.action_map || {} });
  const recDef = (rec) => ({ name: rec.name, route: routeOf(rec), instructions: rec.instructions, criteria: rec.criteria, function_key: rec.function_key });
  const formDef = () => ({ name: nameInput.value, route: routeOf({ ...sceneRef(), subject_kinds: readKinds(), scene_map: sceneMap(), action_map: actionMap() }),
    instructions: promptInput.value, criteria: readCriteria(), function_key: keyInput.value });
  const asRecord = (rec, def) => {
    const out = { ...rec };
    for (const [id, value] of Object.entries(def)) if (id === "route") Object.assign(out, value); else out[id] = value;
    return out;
  };
  const norm = (value) => JSON.stringify(value ?? null, (key, item) => typeof item === "string" ? item.trim()
    : item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : 1)) : item);
  const same = (a, b) => norm(a) === norm(b);
  /** Something of yours not saved yet: the form's definition differs from what was last saved (a sample typed is not a definition). */
  const unsaved = () => dirty && !(base && same(formDef(), recDef(base)));
  const textOf = (id, value) => {
    if (id === "criteria") return Array.isArray(value) ? value.map((row) => typeof row === "string" ? row : row.key + (row.description ? ": " + row.description : "")).join("\\n")
      : [value?.true_description, value?.false_description].filter(Boolean).join("\\n");
    if (id === "route") return [destTitle(value), ...Object.entries(value.scene_map || {}).map(([key, option]) => key + " → " + optionTitle(optionOf(option, value.scene_id || "")))].join("\\n");
    return String(value || "");
  };
  const boxOf = (id) => id === "criteria" ? critEl : id === "route" ? bench.querySelector("[data-functions-destinations]")
    : (id === "name" ? nameInput : id === "instructions" ? promptInput : keyInput).closest("label");
  const land = (id) => { const box = boxOf(id); if (box) globalThis.molisCraft?.land?.(box, "field"); };
  const store = () => {
    if (!sel) return;
    try {
      if (holding()) sessionStorage.setItem(KEEP_STORE + sel.id, JSON.stringify({ phase, base, mine: mineDef }));
      else sessionStorage.removeItem(KEEP_STORE + sel.id);
    } catch { /* Storage may be off; what you wrote stays on the page. */ }
  };
  const forget = (id) => { try { sessionStorage.removeItem(KEEP_STORE + id); } catch { /* Nothing kept. */ } };
  /** The alert's title and body name the version as {version}; the text is in the title (or its last span, beside a mark), the p and the
   *  button labels. A title holding a mark has children and is left alone, so the mark stays. */
  const withVersion = (rec) => (alert) => alert.querySelectorAll("strong, .mw-alert__title > span:last-child, p, [data-slot=button-label]").forEach((node) => { if (!node.childElementCount) node.textContent =node.textContent.replace("{version}", "v" + (rec?.version || 1)); });
  /** The slot is a live region that stays; only what is inside it changes. */
  const show = (next, fill) => {
    phase = next; waiting = false;
    const alert = next && template(next);
    bandEl.replaceChildren(...(alert ? [alert.cloneNode(true)] : []));
    if (alert) fill?.(bandEl.firstElementChild);
    const nextBtn = bench.querySelector("[data-functions-next]");
    nextBtn.classList.toggle("mw-btn--primary", !owes()); nextBtn.classList.toggle("mw-btn--secondary", owes());
    saveStatus.hidden = owes();
  };
  const enter = (next, fill) => { show(next, fill); store(); };
  const toBand = () => hold(bandEl.querySelector(".mw-alert:not(.mw-alert--success) .mw-btn--primary:not([disabled])") || alertEl());
  /** A press the alert has to answer first: it hops once and the focus goes to its way on (not while it is loading). */
  const blocked = () => {
    if (!owes()) return false;
    const alert = alertEl();
    if (alert) { alert.classList.remove("is-nudged"); void alert.offsetWidth; alert.classList.add("is-nudged"); hold(alert.querySelector(".mw-btn--primary:not([disabled])")); }
    return true;
  };
  /** Before the pressed button is disabled or replaced, the focus moves to its alert, so it never falls to the page. */
  const busy = (button) => {
    hold(alertEl());
    waiting = true;
    const spin = template("busy")?.cloneNode(true);
    if (!spin || !button) return;
    spin.querySelector(LABEL).textContent = button.textContent.trim();
    button.replaceWith(spin);
  };
  const failed = (error) => { if (!error?.keepEdits) showNote(error, true); };
  const answered = (error) => Object.assign(error && typeof error === "object" ? error : new Error(String(error)), { keepEdits: true });
  const getRule = async (id) => (await req("GET", "/api/functions/" + encodeURIComponent(id))).function;

  const fitFolds = () => bench.querySelectorAll(KEPT).forEach((node) => {
    const more = node.querySelector("[data-functions-kept-more]"), text = node.querySelector(".mw-kept__text");
    // Only a drawn row can be measured; the step it is on measures it again when it shows (setStep).
    if (!more || !text || !text.getClientRects().length) return;
    more.hidden = !text.classList.contains("is-open") && text.scrollHeight <= text.clientHeight + 1;
  });
  addEventListener("resize", fitFolds);
  const paintDots = () => {
    toLook = toLook.filter((id) => stepOf(id) !== activeStep);
    const flagged = [...Object.keys(keptRows).filter((id) => !keptRows[id].swapped), ...toLook].map(stepOf);
    bench.querySelectorAll("[data-functions-step]").forEach((node) => {
      const number = node.querySelector("span"), dot = number.querySelector(".mw-step-dot");
      const want = node.dataset.functionsStep !== activeStep && flagged.includes(node.dataset.functionsStep);
      if (want && !dot) number.append(template("dot").cloneNode(true));
      if (!want) dot?.remove();
    });
  };
  const fillKept = (node, id, row) => {
    const text = textOf(id, row.swapped ? recDef(latestRec)[id] : row.value), swap = node.querySelector(SWAP), body = node.querySelector(".mw-kept__text");
    node.classList.toggle("is-swapped", row.swapped);
    node.querySelector(".mw-kept__who").textContent = row.swapped ? L("最新版") : L("你写的");
    swap.querySelector(LABEL).textContent = row.swapped ? L("换回") : L("放回");
    swap.setAttribute("aria-label", row.swapped ? L("换回最新版：{field}", { field: labelOf(id) }) : L("放回你写的：{field}", { field: labelOf(id) }));
    body.textContent = text || L("你清空了这一栏"); body.classList.toggle("is-blank", !text);
  };
  const paintKept = () => {
    bench.querySelectorAll(KEPT).forEach((node) => node.remove());
    Object.entries(keptRows).forEach(([id, row], index) => {
      const box = boxOf(id), node = template("kept")?.cloneNode(true);
      if (!box || !node) return;
      node.dataset.functionsKept = id; node.style.setProperty("--i", String(index));
      fillKept(node, id, row);
      box.after(node);
      if (id === "function_key") box.closest("details")?.setAttribute("open", "");
    });
    fitFolds();
  };
  const paintLoaded = () => {
    const body = bandEl.querySelector(".mw-alert--success p");
    if (!body || phase !== "loaded") return;
    const ids = Object.keys(keptRows), open = ids.filter((id) => !keptRows[id].swapped), join = (labels) => labels.join(L("、"));
    body.textContent = [open.length ? L("{fields}两边都改了，你写的就在它下面。", { fields: join(open.map(labelOf)) }) : ids.length ? L("你写的已放回。") : "",
      theirsLabels.length ? L("别处还改了{fields}。", { fields: join(theirsLabels) }) : "",
      yoursLabels.length ? L("你改的{fields}留着。", { fields: join(yoursLabels) }) : ""].filter(Boolean).join("\\n");
  };
  /** Puts one field's value into the form, the way a person would have. */
  const put = (id, value) => {
    if (id === "name") { nameInput.value = value; titleEl.textContent = value; }
    else if (id === "instructions") promptInput.value = value;
    else if (id === "function_key") keyInput.value = value;
    else if (id === "criteria") { sel = { ...sel, criteria: value }; renderCriteria(sel); paintPalette(sel); renderMap(sel); }
    else { sel = { ...sel, ...value }; renderRoute(sel); paintPalette(sel); renderMap(sel); void paintUses(sel); }
  };

  /** The rule is gone: unsaved work stays, with a way to keep it; otherwise the editor closes and says why. */
  const gone = () => {
    if (unsaved() || owes()) { mineDef = mineDef || formDef(); enter("deleted"); return; }
    if (sel) forget(sel.id);
    reset(); enter(""); closeEditor(); showNote(L("这条规则已被删除"), false);
  };
  const toPublished = (latest) => {
    if (!unsaved() && !owes()) { fillEditor(latest); latestRec = latest; enter("settled", withVersion(latest)); return; }
    latestRec = latest; mineDef = mineDef || formDef(); enter("published", withVersion(latest));
  };
  /** A refused write, read again (specs/action-input-contracts §2.7): "retry" when only the version moved, true when answered here. */
  const recover = async (error) => {
    const code = String(error?.code || "").replace("functions.", ""), rec = sel;
    if (!rec || !["draft_stale", "not_found", "published_immutable", "sample_not_found"].includes(code)) return null;
    if (code === "not_found") { gone(); return true; }
    let latest;
    try { latest = await getRule(rec.id); }
    catch (failure) {
      if (sel?.id !== rec.id) return true;
      if (failure?.code === "functions.not_found") gone(); else if (code === "sample_not_found") throw failure; else { mineDef = formDef(); enter("offline"); }
      return true;
    }
    if (sel?.id !== rec.id) return true;
    if (code === "sample_not_found") { sel = { ...sel, samples: latest.samples }; renderSamples(sel); }
    else if (latest.status === "published") toPublished(latest);
    else if (same(recDef(latest), recDef(base))) { sel = { ...sel, updated_at: latest.updated_at }; base = latest; return "retry"; }
    else if (!unsaved() && !owes()) {
      // Nothing unsaved: the latest comes straight in, and the press that met it waits for one more.
      const look = KEEP_FIELDS.map((field) => field.id).filter((id) => !same(recDef(latest)[id], recDef(base)[id]));
      fillEditor(latest); toLook = look; changedIds = look; enter("clean"); look.forEach(land); paintDots();
    }
    else { mineDef = formDef(); latestRec = latest; enter(wasLoaded ? "second" : "conflict"); }
    return true;
  };
  const withKeep = async (run, again = true) => {
    try { return await run(); }
    catch (error) {
      const outcome = await recover(error);
      if (outcome === "retry" && again) return withKeep(run, false);
      throw outcome ? answered(error) : error;
    }
  };
  /** The latest version comes into the form: what only you changed stays (and is saved), yours waits under each field both changed. */
  const loadLatest = (latest) => {
    const mine = mineDef || formDef(), was = recDef(base), now = recDef(latest), merged = {}, rows = {}, look = [], yours = [], theirs = [];
    for (const { id, label } of KEEP_FIELDS) {
      if (same(mine[id], now[id])) continue;
      const byYou = !same(mine[id], was[id]), elsewhere = !same(now[id], was[id]);
      if (byYou && elsewhere) { rows[id] = { value: mine[id], swapped: false }; look.push(id); }
      else if (byYou) { merged[id] = mine[id]; yours.push(label); }
      else { look.push(id); theirs.push(label); }
    }
    fillEditor(asRecord(latest, merged)); base = latest;
    reset(); wasLoaded = true; keptRows = rows; toLook = look; yoursLabels = yours; theirsLabels = theirs; latestRec = latest;
    dirty = Object.keys(merged).length > 0;
    enter("loaded", paintLoaded);
    paintKept(); look.forEach(land);
    const first = Object.keys(rows)[0];
    if (first && stepOf(first) !== activeStep) setStep(stepOf(first)); else paintDots();
    const swap = bench.querySelector(KEPT + " " + SWAP);
    if (swap) swap.focus(); else hold(alertEl());
    if (dirty) { editRevision++; void saveDraft().catch(failed); }
  };
  const reload = async (button) => {
    if (waiting || !sel) return;
    const rec = sel;
    if (phase !== "viewing") mineDef = formDef();
    busy(button);
    let latest;
    try { latest = await getRule(rec.id); }
    catch (error) {
      if (sel?.id !== rec.id) return;
      if (error?.code === "functions.not_found") gone(); else enter("offline");
      hold(alertEl());
      return;
    }
    if (sel?.id !== rec.id) return;
    if (latest.status === "published") { toPublished(latest); toBand(); } else loadLatest(latest);
  };
  /** Keeps what you wrote as a rule of its own: create, then write the rest. Not the original key unless you changed it here. */
  const saveNew = async (button) => {
    const from = base || sel, mine = phase === "viewing" ? mineDef : formDef(), oldId = sel?.id;
    if (!from || waiting) return;
    busy(button);
    let created;
    try { created = (await req("POST", "/api/functions", { primitive: prim(from), name: mine.name })).function; }
    catch (error) { enter(phase, withVersion(latestRec)); toBand(); showNote(error, true); return; }
    const patch = asRecord({}, mine);
    if (same(mine.function_key, from.function_key)) delete patch.function_key;
    if (oldId) forget(oldId);
    reset(); rememberRecord(created);
    try {
      remember((await req("POST", "/api/functions/" + encodeURIComponent(created.id), { ...patch, ...revisionOf(created) })).function);
      dirty = false; enter("saved-new"); toBand();
    } catch (error) {
      // The new rule is the current one; the form still holds what you wrote, and saving again goes to it. The alert the focus was
      // on is gone, so the focus goes to the new rule's name.
      remember(created); fillEditor(asRecord(created, mine)); base = created; dirty = true; enter(""); nameInput.focus(); showNote(error, true);
    }
  };
  /** Gives up what could not be saved, then goes where the person was going. */
  const drop = (go) => { if (sel) forget(sel.id); reset(); dirty = false; clearTimeout(saveTick); saveTick = 0; enter(""); go(); };
  /** Leaving with work that could not be saved asks once; staying is the default (the dialog's form answers with its button's value). */
  const leaving = (go) => {
    if (!holding()) return go();
    afterLeave = go; leaveBox.returnValue = ""; leaveBox.showModal();
  };
  leaveBox.addEventListener("close", () => { if (leaveBox.returnValue === "discard") drop(afterLeave || (() => {})); else if (owes()) toBand(); });
  /** Opening a rule whose conflict was left unresolved (the page was reloaded) brings back what you wrote. */
  const restore = (rec) => {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEEP_STORE + rec.id) || "null"); } catch { saved = null; }
    if (!saved?.mine || !saved.base || rec.status === "published") return;
    fillEditor(asRecord({ ...rec, updated_at: saved.base.updated_at }, saved.mine)); base = saved.base;
    mineDef = saved.mine; wasLoaded = saved.phase === "second"; dirty = true;
    enter(wasLoaded ? "second" : "conflict");
  };
  bandEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-functions-keep-act]");
    if (!button || button.disabled) return;
    const act = button.dataset.functionsKeepAct;
    if (act === "reload") void reload(button);
    else if (act === "save-new") void saveNew(button);
    else if (act === "discard") drop(() => { closeEditor(); void loadList().catch(failed); });
    else if (act === "view" && latestRec) { const latest = latestRec, mine = mineDef || formDef(); fillEditor(latest); latestRec = latest; mineDef = mine; enter("viewing", withVersion(latest)); toBand(); }
    else if (act === "goto") { setStep(stepOf(changedIds[0]) || "fn", true); changedIds.forEach(land); }
    else if (act === "dismiss") { enter(""); hold(bench.querySelector(SWAP) || promptInput); }
  });
  form.addEventListener("click", (event) => {
    const swap = event.target.closest(SWAP), more = event.target.closest("[data-functions-kept-more]");
    const node = (swap || more)?.closest(KEPT), id = node?.dataset.functionsKept, row = id && keptRows[id];
    if (!row) return;
    event.stopPropagation();
    if (more) {
      const open = node.querySelector(".mw-kept__text").classList.toggle("is-open");
      more.setAttribute("aria-expanded", String(open));
      more.querySelector(LABEL).textContent = open ? L("收起") : L("看全部");
      fitFolds();
      // Folding a text that fits takes this way away, and the focus was on it: it moves to the row's own button.
      if (more.hidden) node.querySelector(SWAP)?.focus();
      return;
    }
    row.swapped = !row.swapped;
    put(id, row.swapped ? row.value : recDef(latestRec)[id]);
    fillKept(node, id, row); fitFolds(); land(id); paintDots(); paintLoaded();
    queueSave(true);
  }, true);
`;
