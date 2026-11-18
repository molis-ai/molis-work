/** Who carries the work, how the next round goes and which Character answers for it: the rules the side pane and the composer's controls share, and the Character cache. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_CHOOSERS_PART = String.raw`  let executors = [];
  const executorOffer = (id) => executors.find((one) => one.plugin_id === id && !one.problem) || null;
  const executorsHere = () => Boolean(project && executors.some((one) => !one.problem));
  const executorChoices = () => [{ id: "assistant", label: readText("workbench.assistant-choosers.default-assistant"), hint: readText("workbench.assistant-choosers.assistant-hint") }].concat(executors.filter((one) => !one.problem)
    .map((one) => ({ id: one.plugin_id, label: one.title, hint: readText("workbench.assistant-choosers.plugin-executor-hint") })));
  const modeOffer = () => { const work = getWork(); return executorOffer(work ? work.executor.kind === "plugin" ? work.executor.plugin_id : "" : nextExec); };
  const modeRows = (offer) => offer.modes.map((mode) => ({ id: mode.id, label: mode.title, mode: true }));
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
  // Which role carries the next round: the work's own choice, or one made here that the next Send brings along (a stable choice,
  // { ref, title, character_id }; the Host pins its version). Project work picks among the project's roles, personal work among the
  // person's own; a plugin work picks its own.
  let nextChar = null, pendingChar;
  const roleKey = (ref) => !ref ? "" : ref.kind === "personal" ? "personal:" + ref.character_id : "project:" + ref.member_id;
  const chosenCharacter = () => { const work = getWork(); return work ? (pendingChar !== undefined ? pendingChar : work.character || null) : nextChar; };
  const allowsCharacter = () => { const work = getWork(); return work ? work.executor.kind !== "plugin" : nextExec === "assistant"; };
  // Why a role cannot be chosen, in the person's words; Characters gives the reason as a code.
  const roleReason = (code) => code === "disabled" || code === "original_disabled" || code === "unsaved" ? readText("workbench.assistant-choosers.role-reason-" + code) : readText("workbench.assistant-island.unavailable-now");
  // One read gives the roles here (roles.list): each marked as the project's default or the person's, with whether it can be chosen.
  const roleChoices = (catalog) => {
    if (!catalog) return [];
    const project = catalog.defaults.project, personal = catalog.defaults.personal;
    const tag = (ref) => roleKey(ref) === roleKey(project && project.kind !== "assistant" ? project : null) ? readText("workbench.assistant-choosers.project-default")
      : !project && roleKey(ref) === roleKey(personal) ? readText("workbench.assistant-choosers.my-default") : "";
    const rows = catalog.in_project
      ? catalog.members.map((one) => ({ ref: { kind: "project", member_id: one.role.current.member_id }, title: one.title, character_id: one.role.current.original.character_id, availability: one.availability }))
      : catalog.originals.map((one) => ({ ref: one.ref, title: one.title, character_id: one.ref.character_id, availability: one.availability }));
    return rows.map((one) => ({ ref: one.ref, title: one.title, character_id: one.character_id, tag: tag(one.ref), available: one.availability.available,
      reason: one.availability.available ? "" : roleReason(one.availability.reason) }));
  };
  // The side pane and the composer list the same roles; read once a minute per work (or for a new one), repainting when they arrive.
  const characterCache = new Map();
  const characterChoices = () => {
    const work = getWork(), key = work ? work.work_id : "new", held = characterCache.get(key);
    if (held && Date.now() - held.at < 60000) return held.choices;
    characterCache.set(key, { at: Date.now(), choices: held ? held.choices : null });
    api("/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : "")).then((res) => {
      characterCache.set(key, { at: Date.now(), choices: roleChoices(res.catalog) }); paintSum(); paintAim(); if (sendToOpen()) paintSendTo();
    }).catch(() => { characterCache.set(key, { at: Date.now(), choices: [] }); });
    return held ? held.choices : null;
  };
  const asChosen = (one) => one ? { ref: one.ref, title: one.title, character_id: one.character_id } : null;`;
