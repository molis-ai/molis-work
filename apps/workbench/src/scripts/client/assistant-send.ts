/** Frozen Send intent and receipts, inside the resident Assistant's existing client scope. */
export const ASSISTANT_SEND_CLIENT_SCRIPT = String.raw`
  const unsettled = new Map();
  const sendTarget = () => currentId || JSON.stringify([project && project.id, newScope, newExecutor, newMode, newCharacter]);
  const rememberSentWork = (work) => {
    if (activeSend?.work === work.work_id && activeSend.draft !== undefined) work = { ...work, draft: activeSend.draft };
    const index = works.findIndex(row => row.work_id === work.work_id);
    if (index >= 0) works[index] = work; else works.unshift(work);
    paintWorks(); paintTabs();
  };
  composer.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(input.value || "").trim();
    if (!text || busy) return;
    const again = unsettled.get(currentId), byPage = pageText === text;
    const body = { text, request_id: requestOverride || crypto.randomUUID(), context: pageContext(), materials: sendMaterials(), ...(byPage ? { written_by: "page" } : {}) };
    const character = currentId ? pendingCharacter : newCharacter || undefined;
    if (character !== undefined && characterAllowed()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (currentId) body.work_id = currentId;
    else if (newExecutor !== "assistant") {
      body.executor = newExecutor;
      if (newExecutor === "coding") { const session = openCodingSession(); if (session) body.coding_session_id = session; else body.mode = newMode; }
    } else body.scope = newScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    const intent = !requestOverride && again && again.body.text === text ? again : {
      body, work: currentId, target: sendTarget(), route: host.route("/api/assistant/send"), character, inputRevision,
      files: files.slice(), selection, removed: [...removed], joined: [...joined],
    };
    requestOverride = pageText = null;
    const here = () => sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
    const unchangedInput = () => (intent.work ? intent.draft === undefined : inputRevision === intent.inputRevision) && String(input.value || "").trim() === text;
    const selectSentWork = (work) => { currentId = work.work_id; remember(); openTab(currentId); };
    busy = true; activeSend = intent; syncSend(); problem = null; setPanel(true);
    setStarters(false); if (materialsList) setMaterials(false); clearTimeout(draftTimer);
    unsettled.set(intent.work, intent);
    try {
      await draftWrite;
      const result = await api("/send", "POST", intent.body, intent.route);
      unsettled.delete(intent.work);
      const visible = here();
      rememberSentWork(result.work);
      if (visible) {
        consumeMaterials(intent);
        if (unchangedInput()) {
          clearTimeout(draftTimer); input.value = "";
          if (store.get(NEW_DRAFT_KEY) === text) store.set(NEW_DRAFT_KEY, null);
        }
        selectSentWork(result.work);
        if (pendingCharacter === intent.character) pendingCharacter = undefined;
        if (newCharacter === intent.character) newCharacter = null;
        if (String(input.value || "")) saveDraft(true);
        await refresh();
      }
      if (result.work.executor && result.work.executor.kind === "coding") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: result.work.work_id, capability_id: "coding.runs.start", session_id: result.work.executor.session_id } }));
      if (visible && result.outcome === "steered") host.showToast?.(L("已补充到正在进行的这一轮"));
      if (visible && result.outcome === "answered") host.showToast?.(L("已作为回答发送"));
    } catch (error) {
      const unknown=error.code==="ui_host.outcome_unknown";if(!unknown)unsettled.delete(intent.work);
      const data=error.body?.details||{},visible=here();
      if (data.work) rememberSentWork(data.work);
      if (visible) {
        if (data.work) {
          if (unchangedInput() && store.get(NEW_DRAFT_KEY) === text) store.set(NEW_DRAFT_KEY, null);
          selectSentWork(data.work);
          if (!unchangedInput()) saveDraft(true);
        }
        problem={...error,name:error.name,message:error.message+(unknown?"":"。"+L("输入已保留")),action:data.action};
        if (currentId) await refresh(); else render();
      } else host.showToast?.(error);
    } finally {
      activeSend = null;
      if (intent.draft !== undefined && intent.work) {
        const work = works.find(row => row.work_id === intent.work); if (work) work.draft = intent.draft;
        draftWrite = api("/works/" + encodeURIComponent(intent.work) + "/draft", "POST", { draft: intent.draft }, intent.route.slice(0, -5) + "/works/" + encodeURIComponent(intent.work) + "/draft")
          .catch(() => { /* the next edit retries the retained draft */ });
      }
      busy = false; syncSend(); schedule();
    }
  });
`;
