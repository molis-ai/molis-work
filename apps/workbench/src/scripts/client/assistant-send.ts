/** Frozen Send intent and receipts, inside the resident Assistant's existing client scope. */
export const ASSISTANT_SEND_CLIENT_SCRIPT = String.raw`
  const unsettled = new Map();
  const pendingKey = key => "molis.assistant.pending:" + key;
  const pendingSend = key => { if (unsettled.has(key)) return unsettled.get(key); try { return JSON.parse(store.get(pendingKey(key)) || "null"); } catch { return null; } };
  const forgetSend = key => { unsettled.delete(key); store.set(pendingKey(key), null); };
  const sendTarget = () => curId || json([project?.id, nextScope, nextExec, nextMode, nextChar]);
  const retainSent = (work) => {
    if (activeSend?.work === work.work_id && activeSend.draft !== undefined) work = { ...work, draft: activeSend.draft };
    const index = works.findIndex(row => row.work_id === work.work_id);
    if (index >= 0) works[index] = work; else works.unshift(work);
    paintList(); drawTabs();
  };
  compose.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(input.value || "").trim();
    if (!text || busy) return;
    const again = pendingSend(contextKey()), byPage = pageText === text;
    const body = { text, request_id: requestOverride || crypto.randomUUID(), context: pageContext(), materials: sendMaterials(), ...(byPage ? { written_by: "page" } : {}) };
    const character = curId ? pendingChar : nextChar || undefined;
    if (character !== undefined && canCharacter()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (curId) { body.work_id = curId; const target = receipts.target(); if (target) body.target = target; }
    else if (nextExec !== "assistant") {
      body.executor = nextExec;
      if (nextExec === "coding") { const session = codingSession(); if (session) body.coding_session_id = session; else body.mode = nextMode; }
    } else body.scope = nextScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    const intent = !requestOverride && again?.body.text === text ? { ...again, inputRevision:inputRev, sendKey:compose.dataset.uivSendKey, draft:undefined } : {
      body, work: curId, target: sendTarget(), route: host.route("/api/assistant/send"), character, inputRevision:inputRev, contextKey:contextKey(), newDraftKey:newDraftKey(), sendKey:compose.dataset.uivSendKey,
      files: files.slice(), selection:sel, removed: [...removed], joined: [...joined],
    };
    const settleInput = (phase, nextId) => { compose.dataset.uivResultKey = intent.sendKey || ""; if (!intent.work && nextId && intent.sendKey) compose.dataset.uivResultNextKey = intent.sendKey.slice(0, intent.sendKey.lastIndexOf(":") + 1) + uri(nextId); else delete compose.dataset.uivResultNextKey; compose.dataset.uivPhase = phase; };
    requestOverride = pageText = null;
    const here = () => sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
    const sameInput = () => (intent.work ? intent.draft === undefined : inputRev === intent.inputRevision) && String(input.value || "").trim() === text;
    const chooseSent = (work) => { moveDraftContext(work.work_id); curId = work.work_id; remember(); openTab(curId); };
    busy = true; activeSend = intent; syncSend(); problem = null; setPanel(true);
    closeStarts(); clearTimeout(draftTimer);
    unsettled.set(intent.contextKey, intent);
    store.set(pendingKey(intent.contextKey), draftJson(intent));
    let accepted = false;
    try {
      await draftWrite;
      const res = await api("/send", "POST", intent.body, intent.route);
      accepted = true; forgetSend(intent.contextKey);
      const visible = here();
      retainSent(res.work); takeMaterials(intent); settleInput("succeeded", res.work.work_id);
      if (store.get(intent.newDraftKey) === text) store.set(intent.newDraftKey, null);
      if (visible) {
        if (sameInput()) {
          clearTimeout(draftTimer); input.value = "";
        }
        chooseSent(res.work);
        if (pendingChar === intent.character) pendingChar = undefined;
        if (nextChar === intent.character) nextChar = null;
        if (String(input.value || "")) saveDraft(true);
        await reload();
      }
      if (res.work.executor?.kind === "coding") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: res.work.work_id, capability_id: "coding.runs.start", session_id: res.work.executor.session_id } }));
      // A supplement's fate is its receipt line in the thread; only an answer and words kept for the next round say more.
      const said = { answered: L("已作为回答发送"), queued: L("已保存，下一轮开始生效") }[res.outcome];
      if (visible && said) host.showToast?.(said);
    } catch (error) {
      if (accepted) { if (here()) host.showToast?.(error); return; }
      const unknown=error.code==="ui_host.outcome_unknown";if(!unknown)forgetSend(intent.contextKey);
      const data=error.body?.details||{},visible=here();
      if (data.work) retainSent(data.work);
      settleInput(unknown?"uncertain":"failed", data.work?.work_id);
      if (visible) {
        if (data.work) {
          if (sameInput() && store.get(intent.newDraftKey) === text) store.set(intent.newDraftKey, null);
          chooseSent(data.work);
          if (!sameInput()) saveDraft(true);
        }
        problem={...error,name:error.name,message:error.message+(unknown?"":"。"+L("输入已保留")),action:data.action};
        if (curId) await reload(); else render();
      } else host.showToast?.(error);
    } finally {
      activeSend = null;
      if (intent.draft !== undefined && intent.work) {
        const work = works.find(row => row.work_id === intent.work); if (work) work.draft = intent.draft;
        draftWrite = api("/works/" + uri(intent.work) + "/draft", "POST", { draft: intent.draft }, intent.route.slice(0, -5) + "/works/" + uri(intent.work) + "/draft")
          .catch(() => { /* the next edit retries the retained draft */ });
      }
      busy = false; syncSend(); poll();
    }
  });
`;

/**
 * The person's words to a round under way, in the Assistant (specs/ai-input-receipts §3.3, §4.1, §4.2; D14).
 *
 * Under each supplement is the shared receipt (`host.receipts`, the design system's `createInputReceipts`, the same one
 * Coding shows): what the runtime's record says, and apart from it what the AI says. It changes in place and says each
 * change once on the page's status region. Words the Host wrote are the Host's notice.
 *
 * While the round waits on its one free-text question (the Host marks it `from_composer`: specs/ai-interaction-experience D34), the composer shows what the next Send does, with the default on
 * the chip: answer the question, or add to the round. One click switches it; the Host never decides it. The interaction
 * line's 「写进问卷」 replaces the answer state here, and only here (D14).
 */
export const ASSISTANT_RECEIPTS_FACTORY_SCRIPT = String.raw`({ L, shared, chip }) => {
  const CHOICES = { answer: ["回答上面的问题", "点一下改成：补充这一轮"], steer: ["补充这一轮", "点一下改成：回答上面的问题"] };
  let asked = "", choice = "answer";
  const question = (round) => {
    const waiting = round && round.phase === "awaiting-input" ? round.awaiting_input || [] : [];
    return waiting.find((item) => item.from_composer) || null;
  };
  const label = () => { chip.textContent = L(CHOICES[choice][0]); chip.title = L(CHOICES[choice][1]); };
  chip.addEventListener("click", () => { choice = choice === "answer" ? "steer" : "answer"; label(); });
  return {
    /** The receipt under one of the person's supplements, placed after it; none for anything else. */
    line(node, put, turn, round) {
      const key = "receipt:" + turn.turn_id, line = shared.line(turn, round);
      if (!line) { [...node.children].find((child) => child.dataset.entry === key)?.remove(); return; }
      line.dataset.entry = key; put(line);
    },
    /** Shows the chip while the round waits on its one free-text question; a new question starts at answering it. */
    paint(round) {
      const ask = question(round), id = ask ? ask.pending_id + ":" + ask.pending_revision : "";
      if (id !== asked) { asked = id; choice = "answer"; label(); }
      chip.hidden = !ask;
    },
    /** What the next Send does while the chip shows; nothing otherwise (the words go to the round as a supplement). */
    target: () => chip.hidden ? undefined : choice,
  };
}`;
