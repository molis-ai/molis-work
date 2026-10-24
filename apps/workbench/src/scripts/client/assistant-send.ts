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
  // 「请 AI 重新问」 on a closed question: the page names only the question; the Host writes the round and reads the draft (D5).
  const reaskQuestion = (work, round, question) => api("/send", "POST", { work_id: work.work_id, request_id: crypto.randomUUID(),
    written_by: "page", reask: { run_id: round.run_id, pending_id: question.pending_id } }).then(reload).then(poll, showError);
  compose.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = String(input.value || "").trim();
    if (!text || busy) return;
    const into = curId && receipts.into(), fill = into && fills.get(into.pending_id);
    if (fill) {
      await fill(into.draft_from_composer, text).then(() => { input.value = ""; saveDraft(true); syncSend(); host.showToast?.(L("已写进问卷；按「提交回答」才交回")); }, showError);
      return;
    }
    const again = unsettled.get(curId), byPage = pageText === text, kept = unsent();
    const body = { text, request_id: requestOverride || (kept.work === (curId || null) && kept.text === text ? kept.id : crypto.randomUUID()), context: pageContext(), materials: sendMaterials(), ...(byPage ? { written_by: "page" } : {}) };
    const character = curId ? pendingChar : nextChar || undefined;
    if (character !== undefined && allowsCharacter()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (curId) { body.work_id = curId; const target = receipts.target(); if (target) body.target = target; }
    else if (nextExec !== "assistant") {
      body.executor = { kind: "plugin", plugin_id: nextExec };
      const session = executorSession(nextExec);
      if (session) body.executor_session_id = session; else if (nextMode) body.mode = nextMode;
    } else body.scope = nextScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    const intent = !requestOverride && again?.body.text === text ? again : {
      body, work: curId, target: sendTarget(), route: host.route("/api/assistant/send"), character, inputRevision:inputRev,
      files: files.slice(), selection:sel, removed: [...removed], joined: [...joined],
    };
    requestOverride = pageText = null;
    const here = () => sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
    const sameInput = () => (intent.work ? intent.draft === undefined : inputRev === intent.inputRevision) && String(input.value || "").trim() === text;
    const chooseSent = (work) => { curId = work.work_id; remember(); openTab(curId); };
    busy = true; activeSend = intent; syncSend(); problem = null; setPanel(true); scrollOwner()?.toLatest();
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
      const carrier = res.work.executor?.kind === "plugin" ? executorOffer(res.work.executor.plugin_id) : null;
      if (carrier) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: res.work.work_id, capability_id: carrier.capability_ids["run.start"], session_id: res.work.executor.session_id } }));
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
        problem={...error,name:error.name,message:error.message+(unknown?"":L("。输入已保留")),action:data.action};
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
 * Under each supplement is the shared receipt (`host.receipts`, the design system's `createInputReceipts`, the same one
 * Coding shows): what the runtime's record says, and apart from it what the AI says. It changes in place and says each
 * change once on the page's status region. Words the Host wrote are the Host's notice. From it the person takes back a
 * supplement the round has not put in the context (the work's control), or sends a correction naming it (Send with
 * `about`; the receipt's key is its request id, so words resent after a lost answer count once). After the rounds, the shared
 * tray lists what is still open (§4.4, stage 3b-2c): what waits in the work's session, read only while no round is live
 * (`queued_inputs`), and what the latest round leaves open; one waiting is taken back through the same control. After the
 * tray comes the work's delivery note (receipts 3e-2a): the Host's record as it is, replaced whole only when its html changed,
 * so the step row binds it again; a supplement in it opens that supplement's receipt.
 *
 * While the round waits on its one free-text question (the Host marks it `from_composer`: specs/ai-interaction-experience D34), the composer shows what the next Send does, with the default on
 * the chip: answer the question, or add to the round. One click switches it; the Host never decides it. When the round
 * waits on a questionnaire whose one text question is among others (the Host marks it `draft_from_composer` with that
 * field), the default is 「写进问卷」 instead: Send writes the words into the card's draft and hands nothing back (R4, D14).
 */
export const ASSISTANT_RECEIPTS_FACTORY_SCRIPT = String.raw`({ L, shared, chip, api, work, reload, pact }) => {
  const CHOICES = { answer: "回答上面的问题", draft: "写进问卷", steer: "补充这一轮" };
  let asked = "", ask = null, choice = "answer", pacted = null, drawn = "", block = null;
  const question = (round) => {
    const waiting = round && round.phase === "awaiting-input" ? round.awaiting_input || [] : [];
    return waiting.find((item) => item.from_composer || item.draft_from_composer) || null;
  };
  const first = () => ask?.draft_from_composer ? "draft" : "answer";
  const label = () => { chip.textContent = L(CHOICES[choice]); chip.title = L("点一下改成：" + CHOICES[choice === "steer" ? first() : "steer"]); };
  chip.addEventListener("click", () => { choice = choice === "steer" ? first() : "steer"; label(); });
  const lost = (error) => { throw error.code === "ui_host.outcome_unknown" ? new Error(L("没确认送到：再按一次，同一条不会重复。")) : error; };
  const act = (round) => round && round.run_id ? {
    withdraw: (input_id) => api("/works/" + encodeURIComponent(work()) + "/control", "POST", { kind: "withdraw", run_id: round.run_id, input_id }).then(() => "", lost).finally(reload),
    correct: (about, text, key) => api("/send", "POST", { work_id: work(), text, about, request_id: key }).then((res) => res.outcome === "queued" ? L("已保存，下一轮开始生效") : "", lost).finally(reload),
  } : undefined;
  return {
    /** The receipt under one of the person's supplements, placed after it; none for anything else. The thread is its surface. */
    line(thread, node, put, turn, round) {
      const key = "receipt:" + turn.turn_id, line = shared.line(thread, turn, round, act(round));
      if (!line) { [...node.children].find((child) => child.dataset.entry === key)?.remove(); return; }
      line.dataset.entry = key; put(line);
    },
    /** Shows the chip while the round waits on a question the composer can answer or fill; a new one starts at its default. */
    paint(round) {
      ask = question(round); const id = ask ? ask.pending_id + ":" + ask.pending_revision : "";
      if (id !== asked) { asked = id; choice = first(); label(); }
      chip.hidden = !ask;
    },
    /** What the next Send does while the chip shows; nothing otherwise (the words go to the round as a supplement). */
    target: () => chip.hidden || choice === "draft" ? undefined : choice,
    /** The question whose draft the next Send fills instead. */
    into: () => !chip.hidden && choice === "draft" ? ask : null,
    /**
     * After the rounds are drawn: what is still open in the work (the tray; its queue left out when not read), and in the side
     * pane 「AI 记下的约定」 from the receipts just drawn, redrawn only when it reads differently so focus in it stays.
     */
    after(thread, put, view) {
      const round = view?.rounds.at(-1), tray = round ? shared.tray(thread, view.queued_inputs, round, act(round)) : null;
      if (tray) put(tray); else thread.querySelector(":scope > .mw-tray")?.remove();
      const note = view?.delivery_html || "";
      if (note !== drawn) {
        drawn = note; block?.remove(); block = null;
        if (note) {
          block = Object.assign(document.createElement("div"), { innerHTML: note }).firstChild;
          block.onclick = (e) => { const one = e.target.closest("[data-input]"); one && shared.link(thread, one.dataset.input)?.click(); };
        }
      }
      if (block) put(block);
      const kept = view ? shared.agreements(thread, view.rounds.map((one) => one.run_id)) : null, read = kept ? kept.textContent : "";
      if (read !== pacted) { pacted = read; pact(kept, kept ? String(kept.querySelectorAll("li").length) : ""); }
    },
  };
}`;
