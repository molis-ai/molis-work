/** Who carries the work, how the next round goes and which Character answers for it: the three pop-up choices and the Character cache. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_CHOOSERS_PART = String.raw`  const execBtn = island.querySelector("[data-assistant-executor]");
  const executorLabel = island.querySelector("[data-assistant-executor-label]");
  const execsPop = island.querySelector("[data-assistant-executors]");
  let executors = [];
  const executorOffer = (id) => executors.find((one) => one.plugin_id === id && !one.problem) || null;
  const executorsHere = () => Boolean(project && executors.some((one) => !one.problem));
  const executorChoices = () => [{ id: "assistant", label: "助理", hint: "个人工作助理，使用你已授权的能力" }].concat(executors.filter((one) => !one.problem)
    .map((one) => ({ id: one.plugin_id, label: one.title, hint: "在这个项目里由它自己的 Agent 执行，补充和回答照常在这里发" })));
  const modeButton = island.querySelector("[data-assistant-mode]");
  const modeLabel = island.querySelector("[data-assistant-mode-label]");
  const modesPop = island.querySelector("[data-assistant-modes]");
  const modeOffer = () => { const work = getWork(); return executorOffer(work ? work.executor.kind === "plugin" ? work.executor.plugin_id : "" : nextExec); };
  const modeRows = (offer) => offer.modes.map((mode) => ({ id: mode.id, label: L(mode.title) }));
  const setModes = (open) => {
    if (!modesPop) return;
    modesPop.hidden = !open;
    modeButton?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const work = getWork();
    const offer = modeOffer(); if (!offer) { modesPop.hidden = true; return; }
    const chosen = work ? work.executor && work.executor.mode || offer.default_mode : nextMode || offer.default_mode;
    modesPop.replaceChildren(el("p", "assistant-popover-title", L(work ? "下一轮的方式（与插件自己的页面同一设置）" : "第一轮的方式")));
    modeRows(offer).forEach((mode) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (chosen === mode.id) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", mode.label));
      item.addEventListener("click", async () => { setModes(false); await applyMode(mode.id); input.focus(); });
      modesPop.append(item);
    });
    (modesPop.querySelector("[aria-current]") || modesPop.querySelector("button"))?.focus();
  };
  /** A new plugin work's first round, or an open work's next one: the session's own setting, the same one its page shows. */
  async function applyMode(id) {
    const work = getWork();
    if (!work) { nextMode = id; paintAim(); paintSum(); return; }
    try {
      view = await api("/works/" + encodeURIComponent(work.work_id) + "/mode", "POST", { mode: id }); render();
      const offer = modeOffer(); if (offer) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: offer.capability_ids["session.update"], session_id: view.work.executor.session_id } }));
    }
    catch (error) { showError(error); }
  }
  // The choice is made against what is saved now, not what this panel last read.
  modeButton?.addEventListener("click", async () => { if (!modesPop.hidden) { setModes(false); return; } if (curId) await reload().catch(() => {}); setModes(true); });
  // Which Character carries the next round: the work's own choice, or one made here that the next Send brings along.
  // Only the Assistant's own project work has Characters (they are published per project); a plugin work picks its own.
  const charBtn = island.querySelector("[data-assistant-character]");
  const characterLabel = island.querySelector("[data-assistant-character-label]");
  const charsPop = island.querySelector("[data-assistant-characters]");
  let nextChar = null, pendingChar;
  const chosenCharacter = () => { const work = getWork(); return work ? (pendingChar !== undefined ? pendingChar : work.character || null) : nextChar; };
  const allowsCharacter = () => { const work = getWork();
    return work ? work.executor.kind !== "plugin" && work.scope.kind === "project" : nextExec === "assistant" && nextScope === "project" && Boolean(project); };
  const setChars = async (open) => {
    if (!charsPop) return;
    charsPop.hidden = !open;
    charBtn?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    const work = getWork(), chosen = chosenCharacter();
    charsPop.replaceChildren(el("p", "assistant-popover-title", L("由哪个角色负责（从下一轮开始）")));
    let choices = [];
    try { choices = (await api("/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : ""))).characters; }
    catch (error) { const note=el("p","assistant-material-origin");molisWorkRequest.show(note,error);charsPop.append(note); }
    const pick = (value) => { setChars(false); if (work) pendingChar = value; else nextChar = value; paintAim(); input.focus(); };
    const own = el("button", "assistant-starter"); own.type = "button";
    if (!chosen) own.setAttribute("aria-current", "true");
    own.append(el("strong", "", L("助理自己")), el("span", "assistant-material-origin", " " + L("不指定角色")));
    own.addEventListener("click", () => pick(null));
    charsPop.append(own);
    choices.forEach((choice) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      const same = chosen && chosen.artifact_id === choice.reference.artifact_id && chosen.version === choice.reference.version;
      if (same) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", choice.title), el("span", "assistant-material-origin", " v" + choice.reference.version + (choice.available ? "" : " · " + (choice.reason || L("当前不可用")))));
      // An unavailable version is shown with why, and cannot be chosen: nothing runs under a name it is not.
      if (!choice.available) item.disabled = true;
      else item.addEventListener("click", () => pick({ artifact_id: choice.reference.artifact_id, version: choice.reference.version, title: choice.title }));
      charsPop.append(item);
    });
    if (!choices.length) charsPop.append(el("p", "assistant-material-origin", L("这个项目里还没有你发布的 Character；在 Characters 里新建并发布后就能选择。")));
    (charsPop.querySelector("[aria-current]") || charsPop.querySelector("button:not([disabled])"))?.focus();
  };
  charBtn?.addEventListener("click", async () => { if (!charsPop.hidden) { setChars(false); return; } if (curId) await reload().catch(() => {}); await setChars(true); });
  // The side pane lists the same Characters; read once a minute per work (or for a new one), repainting when they arrive.
  const characterCache = new Map();
  const characterChoices = () => {
    const work = getWork(), key = work ? work.work_id : "new", held = characterCache.get(key);
    if (held && Date.now() - held.at < 60000) return held.choices;
    characterCache.set(key, { at: Date.now(), choices: held ? held.choices : null });
    api("/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : "")).then((res) => {
      characterCache.set(key, { at: Date.now(), choices: res.characters || [] }); paintSum();
    }).catch(() => { characterCache.set(key, { at: Date.now(), choices: [] }); });
    return held ? held.choices : null;
  };
  const setExecs = (open) => {
    if (!execsPop) return;
    execsPop.hidden = !open;
    execBtn?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    execsPop.replaceChildren(el("p", "assistant-popover-title", L("由谁来做")));
    void loadExecutors();
    executorChoices().forEach((one) => {
      const item = el("button", "assistant-starter"); item.type = "button";
      if (one.id === nextExec) item.setAttribute("aria-current", "true");
      item.append(el("strong", "", L(one.label)), el("span", "assistant-material-origin", " " + L(one.hint)));
      item.addEventListener("click", () => { nextExec = one.id; nextMode = ""; setExecs(false); paintAim(); paintSum(); input.focus(); });
      execsPop.append(item);
    });
    (execsPop.querySelector("[aria-current]") || execsPop.querySelector("button"))?.focus();
  };`;
