/**
 * Send keeps original round materials when retrying; shortened previews cannot replace their bodies.
 * Reasking names the closed question; the Host writes the round and reads the draft (D5).
 * A supplement's receipt is its timeline line; only answers and next-round words get a toast.
 */
/** Frozen Send intent and receipts, inside the resident Assistant's existing client scope. */
export const ASSISTANT_SEND_CLIENT_SCRIPT = String.raw`
  const retryRound = async (last) => {
    const stamp = () => json([curId, inputRev, input.value, files]), id = curId, held = stamp();
    const here = () => stamp() === held;
    try {
      const mats = await Promise.all((last.materials || []).map(async (item) => {
        if (item.expired) throw new Error(L(EXPIRED_IMAGE));
        const { material } = await api(workUrl(id) + "/materials/" + uri(item.material_id) + "?run=" + uri(last.run_id));
        return { ...item, ...material };
      }));
      if (!here()) return;
      const { object, selection, source } = last.context || {};
      if (object && !mats.some(item => item.object && objectKey(item.object) === objectKey(object))) mats.push({ material_id: "retry-object", kind: "object", title: object.title || object.id, explicit: true, object, source });
      files = [...files.filter(item => !mats.some(one => one.material_id === item.material_id)), ...mats];
      sel = selection || null; removed.delete("selection");
      input.value = last.text; input.dispatchEvent(new Event("input", { bubbles: true })); paintMats(); input.focus();
    } catch (error) { if (here()) showError(error); }
  };
  const unsettled = new Map(), ui = compose.dataset;
  const settleSend = (key, phase, next) => {
    ui.uivResultKey = key || "";
    if (next && key) ui.uivResultNextKey = key.slice(0, key.lastIndexOf(":") + 1) + uri(next); else delete ui.uivResultNextKey;
    ui.uivPhase = phase;
  };
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
  const reaskQuestion = (work, round, question) => post("/send", { work_id: work.work_id, request_id: crypto.randomUUID(),
    written_by: "page", reask: { run_id: round.run_id, pending_id: question.pending_id } }).then(reload).then(poll, showError);
  onEl(compose, "submit", async (event) => {
    event.preventDefault();
    const text = words().trim();
    if (!text || busy) return;
    const into = curId && receipts.into(), fill = into && fills.get(into.pending_id);
    if (fill) {
      const owner = contextKey(), revision = inputRev, key = ui.uivSendKey, work = curId, route = host.route("/api/assistant/works/" + uri(work) + "/draft");
      busy = true; syncSend();
      try {
        await fill(into.draft_from_composer, text); settleSend(key, "succeeded");
        if (owner === contextKey() && revision === inputRev) { input.value = ""; saveDraft(true); }
        else if (owner !== contextKey()) {
          await draftWrite; const row = rowOf(work);
          if (row?.draft === text) { row.draft = ""; draftWrite = post("", { draft: "" }, route).catch(showError); }
        }
        host.showToast?.(L("已写进问卷；按「提交回答」才交回"));
      } catch (error) { settleSend(key, error.code === "ui_host.outcome_unknown" ? "uncertain" : "failed"); if (owner === contextKey()) showError(error); else host.showToast?.(error); }
      finally { busy = false; syncSend(); }
      return;
    }
    const again = pendingSend(contextKey()), byPage = pageText === text;
    const body = { text, request_id: requestOverride || crypto.randomUUID(), context: pageContext(), materials: sendMaterials(), ...(byPage ? { written_by: "page" } : {}) };
    const character = curId ? pendingChar : nextChar || undefined;
    if (character !== undefined && canCharacter()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (curId) { body.work_id = curId; const target = receipts.target(); if (target) body.target = target; }
    else if (nextExec !== "assistant") {
      body.executor = nextExec;
      if (nextExec === "coding") { const session = codingSession(); if (session) body.coding_session_id = session; else body.mode = nextMode; }
    } else body.scope = nextScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    const intent = !requestOverride && again?.body.text === text ? { ...again, inputRevision:inputRev, sendKey:ui.uivSendKey, draft:undefined } : {
      body, work: curId, target: sendTarget(), route: host.route("/api/assistant/send"), character, inputRevision:inputRev, contextKey:contextKey(), newDraftKey:newDraftKey(), sendKey:ui.uivSendKey,
      files: files.slice(), selection:sel, removed: [...removed], joined: [...joined],
    };
    requestOverride = pageText = null;
    const here = () => sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
    const sameInput = () => (intent.work ? intent.draft === undefined : inputRev === intent.inputRevision) && words().trim() === text;
    const chooseSent = (work) => { moveContext(work.work_id); curId = work.work_id; remember(); openTab(curId); };
    busy = true; activeSend = intent; syncSend(); problem = null; setPanel(true);
    closeStarts(); clearTimeout(draftTimer);
    unsettled.set(intent.contextKey, intent);
    store.set(pendingKey(intent.contextKey), draftJson(intent));
    let accepted = false;
    try {
      await draftWrite;
      const res = await post("/send", intent.body, intent.route);
      accepted = true; forgetSend(intent.contextKey);
      const visible = here();
      retainSent(res.work); takeMaterials(intent); settleSend(intent.sendKey, "succeeded", !intent.work && res.work.work_id);
      if (store.get(intent.newDraftKey) === text) store.set(intent.newDraftKey, null);
      if (visible) {
        if (sameInput()) {
          clearTimeout(draftTimer); input.value = "";
        }
        chooseSent(res.work);
        if (pendingChar === intent.character) pendingChar = undefined;
        if (nextChar === intent.character) nextChar = null;
        if (words()) saveDraft(true);
        await reload();
      }
      if (res.work.executor?.kind === "coding") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: res.work.work_id, capability_id: "coding.runs.start", session_id: res.work.executor.session_id } }));
      const said = { answered: L("已作为回答发送"), queued: L("已保存，下一轮开始生效") }[res.outcome];
      if (visible && said) host.showToast?.(said);
    } catch (error) {
      if (accepted) { if (here()) host.showToast?.(error); return; }
      const unknown=error.code==="ui_host.outcome_unknown";if(!unknown)forgetSend(intent.contextKey);
      const data=error.body?.details||{},visible=here();
      if (data.work) retainSent(data.work);
      settleSend(intent.sendKey, unknown?"uncertain":"failed", !intent.work && data.work?.work_id);
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
        const work = rowOf(intent.work); if (work) work.draft = intent.draft;
        draftWrite = post("", { draft: intent.draft }, intent.route.slice(0, -5) + workUrl(intent.work) + "/draft")
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
 * (`queued_inputs`), and what the latest round leaves open; one waiting is taken back through the same control.
 *
 * While the round waits on its one free-text question (the Host marks it `from_composer`: specs/ai-interaction-experience D34), the composer shows what the next Send does, with the default on
 * the chip: answer the question, or add to the round. One click switches it; the Host never decides it. When the round
 * waits on a questionnaire whose one text question is among others (the Host marks it `draft_from_composer` with that
 * field), the default is 「写进问卷」 instead: Send writes the words into the card's draft and hands nothing back (R4, D14).
 */
export const ASSISTANT_RECEIPTS_FACTORY_SCRIPT = String.raw`({ L, shared, chip, api, work, reload }) => {
  const CHOICES = { answer: "回答上面的问题", draft: "写进问卷", steer: "补充这一轮" };
  let asked = "", ask = null, choice = "answer";
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
    /** What is still open in the work, after its rounds (the tray); none when nothing is. Its queue is left out when not read. */
    tray(thread, put, view) {
      const round = view?.rounds.at(-1), tray = round ? shared.tray(thread, view.queued_inputs, round, act(round)) : null;
      if (tray) put(tray); else thread.querySelector(":scope > .mw-tray")?.remove();
    },
  };
}`;
