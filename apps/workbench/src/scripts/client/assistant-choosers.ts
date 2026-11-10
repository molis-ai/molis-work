/** Who carries the work, how the next round goes and which Character answers for it: the rules the side pane and the composer's controls share, and the Character cache. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_CHOOSERS_PART = String.raw`  let executors = [];
  const executorOffer = (id) => executors.find((one) => one.plugin_id === id && !one.problem) || null;
  const executorsHere = () => Boolean(project && executors.some((one) => !one.problem));
  const executorChoices = () => [{ id: "assistant", label: "助理", hint: "个人工作助理，使用你已授权的能力" }].concat(executors.filter((one) => !one.problem)
    .map((one) => ({ id: one.plugin_id, label: one.title, hint: "在这个项目里由它自己的 Agent 执行，补充和回答照常在这里发" })));
  const modeOffer = () => { const work = getWork(); return executorOffer(work ? work.executor.kind === "plugin" ? work.executor.plugin_id : "" : nextExec); };
  const modeRows = (offer) => offer.modes.map((mode) => ({ id: mode.id, label: L(mode.title) }));
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
  // Which Character carries the next round: the work's own choice, or one made here that the next Send brings along.
  // Only the Assistant's own project work has Characters (they are published per project); a plugin work picks its own.
  let nextChar = null, pendingChar;
  const chosenCharacter = () => { const work = getWork(); return work ? (pendingChar !== undefined ? pendingChar : work.character || null) : nextChar; };
  const allowsCharacter = () => { const work = getWork();
    return work ? work.executor.kind !== "plugin" && work.scope.kind === "project" : nextExec === "assistant" && nextScope === "project" && Boolean(project); };
  // The side pane and the composer list the same Characters; read once a minute per work (or for a new one), repainting when they arrive.
  const characterCache = new Map();
  const characterChoices = () => {
    const work = getWork(), key = work ? work.work_id : "new", held = characterCache.get(key);
    if (held && Date.now() - held.at < 60000) return held.choices;
    characterCache.set(key, { at: Date.now(), choices: held ? held.choices : null });
    api("/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : "")).then((res) => {
      characterCache.set(key, { at: Date.now(), choices: res.characters || [] }); paintSum(); paintAim();
    }).catch(() => { characterCache.set(key, { at: Date.now(), choices: [] }); });
    return held ? held.choices : null;
  };`;
