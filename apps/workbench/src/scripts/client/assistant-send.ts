/** Frozen Send intent and receipts, inside the resident Assistant's existing client scope. */
export const ASSISTANT_SEND_CLIENT_SCRIPT = String.raw`
  const unsettled = new Map(), UNSENT_KEY = "molis.assistant.unsent";
  // The one Send whose outcome is unknown, kept across a refresh so the same words go again under the same key (§7).
  const unsent = () => { try { return JSON.parse(store.get(UNSENT_KEY) || "null") || {}; } catch { return {}; } };
  const sendTarget = () => curId || JSON.stringify([project?.id, nextScope, nextExec, nextMode, nextChar]);
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
    const again = unsettled.get(curId), byPage = pageText === text, kept = unsent();
    const body = { text, request_id: requestOverride || (kept.work === (curId || null) && kept.text === text ? kept.id : crypto.randomUUID()), context: pageContext(), materials: sendMaterials(), ...(byPage ? { written_by: "page" } : {}) };
    const character = curId ? pendingChar : nextChar || undefined;
    if (character !== undefined && allowsCharacter()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (curId) { body.work_id = curId; const target = receipts.target(); if (target) body.target = target; }
    else if (nextExec !== "assistant") {
      body.executor = nextExec;
      if (nextExec === "coding") { const session = codingSession(); if (session) body.coding_session_id = session; else body.mode = nextMode; }
    } else body.scope = nextScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    const intent = !requestOverride && again?.body.text === text ? again : {
      body, work: curId, target: sendTarget(), route: host.route("/api/assistant/send"), character, inputRevision:inputRev,
      files: files.slice(), selection:sel, removed: [...removed], joined: [...joined],
    };
    requestOverride = pageText = null;
    const here = () => sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
    const sameInput = () => (intent.work ? intent.draft === undefined : inputRev === intent.inputRevision) && String(input.value || "").trim() === text;
    const chooseSent = (work) => { curId = work.work_id; remember(); openTab(curId); };
    busy = true; activeSend = intent; syncSend(); problem = null; setPanel(true);
    closeStarts(); clearTimeout(draftTimer);
    unsettled.set(intent.work, intent); store.set(UNSENT_KEY, JSON.stringify({ work: intent.work || null, text, id: intent.body.request_id }));
    try {
      await draftWrite;
      const res = await api("/send", "POST", intent.body, intent.route);
      unsettled.delete(intent.work); store.set(UNSENT_KEY, null);
      const visible = here();
      retainSent(res.work);
      if (visible) {
        takeMaterials(intent);
        if (sameInput()) {
          clearTimeout(draftTimer); input.value = "";
          if (store.get(NEW_DRAFT_KEY) === text) store.set(NEW_DRAFT_KEY, null);
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
      const unknown=error.code==="ui_host.outcome_unknown";if(!unknown){unsettled.delete(intent.work);store.set(UNSENT_KEY,null);}
      const data=error.body?.details||{},visible=here();
      if (data.work) retainSent(data.work);
      if (visible) {
        if (data.work) {
          if (sameInput() && store.get(NEW_DRAFT_KEY) === text) store.set(NEW_DRAFT_KEY, null);
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
        draftWrite = api("/works/" + encodeURIComponent(intent.work) + "/draft", "POST", { draft: intent.draft }, intent.route.slice(0, -5) + "/works/" + encodeURIComponent(intent.work) + "/draft")
          .catch(() => { /* the next edit retries the retained draft */ });
      }
      busy = false; syncSend(); poll();
    }
  });
`;

/**
 * The person's words to a round under way, in the Assistant (specs/ai-input-receipts §3.3, §4.1, §4.2; D14).
 *
 * Under each supplement, one line says only what the runtime's own input record says (sent, in the model's context, read,
 * not read by the end of the round, taken back), never that the model followed it. A supplement sent while the round
 * waits on a question says the question still waits. A changed state replaces the line, so the thread's live region
 * (`role=log`, additions) reads it out. Words the Host wrote are the Host's notice and have no line.
 *
 * While the round waits on its one free-text question, the composer shows what the next Send does, with the default on
 * the chip: answer the question, or add to the round. One click switches it; the Host never decides it. The interaction
 * line's 「写进问卷」 replaces the answer state here, and only here (D14).
 */
export const ASSISTANT_RECEIPTS_FACTORY_SCRIPT = String.raw`({ L, el, chip }) => {
  const WORDS = { received: "已送达", applied: "已放进上下文，等 AI 回应", read: "AI 已读到", unread: "这一轮结束时 AI 没读到，留给下一轮", withdrawn: "已撤回" };
  const CHOICES = { answer: ["回答上面的问题", "点一下改成：补充这一轮"], steer: ["补充这一轮", "点一下改成：回答上面的问题"] };
  let asked = "", choice = "answer";
  const question = (round) => {
    const waiting = round && round.phase === "awaiting-input" ? round.awaiting_input || [] : [];
    return waiting.length === 1 && waiting[0].allows_free_text && !(waiting[0].questions || []).length ? waiting[0] : null;
  };
  const label = () => { chip.textContent = L(CHOICES[choice][0]); chip.title = L(CHOICES[choice][1]); };
  chip.addEventListener("click", () => { choice = choice === "answer" ? "steer" : "answer"; label(); });
  return {
    /** The line under one of the person's supplements, placed after it; none for anything else. */
    line(node, put, turn, round) {
      const key = "receipt:" + turn.turn_id, old = [...node.children].find((child) => child.dataset.entry === key);
      if (turn.kind !== "user" || !turn.steer) { old?.remove(); return; }
      const state = turn.steer.state, waits = (round.awaiting_input || []).length && (state === "received" || state === "applied");
      const words = L(waits ? "已补充到这一轮；上面的问题仍在等你" : WORDS[state] || WORDS.received);
      if (old && old.textContent === words) { put(old); return; }
      old?.remove();
      const small = el("small", "assistant-receipt", words);
      small.dataset.entry = key; small.title = L("读到不代表已遵循，也不撤销先前操作；补充要求不代替回答问题。");
      put(small);
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
