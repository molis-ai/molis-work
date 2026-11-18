import { BUSINESS_HOST_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { CHARACTERS_CLIENT_PATH } from "../../characters/client-path.js";

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
  let nextChar, pendingChar, talkDraft = "";
  const roleKey = (ref) => !ref ? "" : ref.kind === "personal" ? "personal:" + ref.character_id : "project:" + ref.member_id;
  const chosenCharacter = () => { const work = getWork(); return work ? (pendingChar !== undefined ? pendingChar : work.character || null) : nextChar; };
  const allowsCharacter = () => { const work = getWork(); return work ? work.executor.kind !== "plugin" : nextExec === "assistant"; };
  const roleProject = () => { const scope = getWork()?.scope; return scope ? scope.project_id || null : nextScope === "project" ? project?.id || null : null; };
  const roleTarget = () => JSON.stringify([curId, roleProject(), curEvent, fresh, nextExec]);
  const roleButtonLabel = () => getWork()?.character_selection_required && pendingChar === undefined ? readText("workbench.assistant-dock.which-character-carries")
    : chosenCharacter()?.title || readText("workbench.assistant-island.role");
  const openRolePicker = () => {
    const at = roleTarget();
    const open = () => {
      if (!island.isConnected || !allowsCharacter() || at !== roleTarget()) return;
      const work = getWork(), required = work?.character_selection_required && pendingChar === undefined;
      island.dispatchEvent(new CustomEvent("molis-work:task-role-picker", { bubbles: true, detail: {
        target: at, project_id: roleProject(), required, new_work: !work,
        selection: required ? undefined : chosenCharacter()?.ref ?? (work ? null : nextChar),
      } }));
    };
    if (globalThis.molisWorkbenchPluginFactories?.characters) { open(); return; }
    const path = ${JSON.stringify(CHARACTERS_CLIENT_PATH)};
    const held = document.querySelector('script[src="' + path + '"]');
    const script = held || document.createElement("script");
    script.addEventListener("load", open, { once: true });
    script.addEventListener("error", () => { script.remove(); showError(new Error(readText("workbench.characters.request-failed"))); }, { once: true });
    if (!held) { script.src = path; script.dataset.charactersClient = ""; document.head.append(script); }
  };
  island.addEventListener("molis-work:task-role-picked", (event) => {
    const result = event.detail;
    if (result?.target !== roleTarget()) return;
    characterCache.clear();
    if ("character" in result) {
      if (getWork()) pendingChar = result.character; else nextChar = result.character;
    } else if (result.reset && !getWork()) nextChar = undefined;
    else return;
    paintAim(); paintSum();
  });
  const roleChoices = (catalog) => {
    if (!catalog) return [];
    const rows = catalog.in_project
      ? catalog.members.map((one) => ({ ...one, ref: { kind: "project", member_id: one.role.current.member_id }, character_id: one.role.current.original.character_id }))
      : catalog.originals.map((one) => ({ ...one, character_id: one.ref.character_id }));
    const tools = ${JSON.stringify(BUSINESS_HOST_TOOLS)};
    return rows.map((one) => ({ ref: one.ref, title: one.title, character_id: one.character_id,
      available: one.availability.available && (one.host_tools === null || one.host_tools.every(tool => tools.includes(tool))) }));
  };
  // The conversation menu holds one directory read per work (or scope for a new one) for up to a minute.
  const characterCache = new Map();
  const characterChoices = () => {
    const work = getWork(), scope = work?.scope.project_id ?? project?.id, key = work?.work_id || scope || "", held = characterCache.get(key);
    if (held && Date.now() - held.at < 60000) return held.choices;
    characterCache.set(key, { at: Date.now(), choices: held ? held.choices : null });
    const path = "/api/assistant/characters" + (work ? "?work=" + encodeURIComponent(work.work_id) : "");
    api("", "GET", undefined, (scope ? "/projects/" + encodeURIComponent(scope) : "") + path).then((res) => {
      characterCache.set(key, { at: Date.now(), choices: roleChoices(res.catalog) }); paintSum(); paintAim(); if (sendToOpen()) paintSendTo();
    }).catch(() => { characterCache.set(key, { at: Date.now(), choices: [] }); });
    return held ? held.choices : null;
  };
  const asChosen = (one) => one ? { ref: one.ref, title: one.title, character_id: one.character_id } : null;`;
