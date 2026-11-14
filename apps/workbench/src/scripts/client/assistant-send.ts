import { UI_HOST_CLIENT_CODES } from "@molis-ai/molis-work-contracts/platform/ui";
/**
 * One Send to the Host, whoever made it (the composer, a page's delegated words, search's 问助理), inside the resident Assistant's
 * client scope: the request, then what the page keeps of it. A Send whose outcome is unknown keeps its words and key across a
 * refresh, when the old key is read before anything new is sent (§7). What the composer shows of the
 * outcome is the composer's; the thread shows a problem only when it carries a way out (a link to settings, a cap to raise).
 * `extra` is the composer's key, delivery and materials (and `before`, the work's draft write the Send waits for), or a delegated
 * message's own key (`named`) and `written_by`.
 */
export const ASSISTANT_SEND_CLIENT_SCRIPT = String.raw`
  // A Send whose outcome was lost goes again as it went (W2-18-SEND-02): the same body (key, scope, context, materials) on the
  // same route, though the chooser or the page has moved on since; one per receiver, until the Host answers or refuses it.
  const lostSends = new Map();
  const unsent = key => { try { return JSON.parse(store.get(key) || "null") || {}; } catch { return {}; } };
  const forgetIntent = intent => {
    lostSends.delete(intent.body.request_id);
    if (unsent(intent.unsentKey).id === intent.body.request_id) store.set(intent.unsentKey, null);
  };
  const sendTarget = () => curId || JSON.stringify([project?.id, nextScope, nextExec, nextMode, nextChar]);
  const retainSent = (work) => {
    const index = works.findIndex(row => row.work_id === work.work_id);
    const cached = works[index];
    if (cached && (cached.draft_revision > work.draft_revision || writing.has(work.work_id))) work = { ...work, draft: cached.draft, draft_revision: cached.draft_revision };
    if (index >= 0) works[index] = work; else works.unshift(work);
    paintList(); drawTabs();
  };
  // 「请 AI 重新问」 on a closed question: the page names only the question; the Host writes the round and reads the draft (D5).
  const reaskQuestion = (work, round, question) => api("/send", "POST", { work_id: work.work_id, request_id: crypto.randomUUID(),
    written_by: "page", reask: { run_id: round.run_id, pending_id: question.pending_id } }).then(reload).then(poll, showError);
  async function acceptSent(res, intent) {
      forgetIntent(intent);
      const visible = sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
      retainSent(res.work); takeMaterials(intent, visible);
      if (visible) {
        if (!intent.work) handedOver = true; curId = res.work.work_id; remember(); openTab(curId);
        if (pendingChar === intent.character) pendingChar = undefined;
        if (nextChar === intent.character) nextChar = null;
        await reload();
      }
      const carrier = res.work.executor?.kind === "plugin" ? executorOffer(res.work.executor.plugin_id) : null;
      if (carrier) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: res.work.work_id, capability_id: carrier.capability_ids["run.start"], session_id: res.work.executor.session_id } }));
      // A supplement's fate is its receipt line in the thread, and words kept for the next turn the composer's status line.
      if (visible && res.outcome === "answered") host.showToast?.(readText("workbench.assistant-send.sent-answer"));
      // A lost Send that went again from another receiver went where it was first sent: the words in the box now are not its.
      return visible ? res : { ...res, elsewhere: true };
  }
  const recoveredWork = work => { if (!works.some(one => one.work_id === work.work_id)) retainSent(work); };
  const ownsReceipt = (res, intent) => res.submission_id === intent.body.submission_id;
  const contentOf = ({ request_id, submission_id, draft_revision, context, materials, ...content }) => JSON.stringify({ ...content,
    context: context && { ...context, captured_at: undefined }, materials: materials.map(({ material_id, ...material }) => material) });
  async function checkSent(intent, consumed) {
    const route = intent.route.replace(/\/send$/, "/requests/" + encodeURIComponent(intent.body.request_id));
    const result = await api("", "GET", undefined, route);
    if (result.state === "sent") {
      if (!ownsReceipt(result.result, intent)) { forgetIntent(intent); recoveredWork(result.result.work); return "not-sent"; }
      await acceptSent(result.result, intent);
    }
    return result.state === "sent" && !consumed ? "not-sent" : result.state;
  }
  // After refresh only the old key survived, not its attachment snapshot. Reading it never consumes the current draft.
  async function recoverSend(kept, unsentKey) {
    const check = async () => {
      const result = await api("", "GET", undefined, kept.route.replace(/\/send$/, "/requests/" + encodeURIComponent(kept.id)));
      if (result.state === "sent") recoveredWork(result.result.work);
      if (result.state === "sent") forgetIntent({ body: { request_id: kept.id }, unsentKey });
      return result.state;
    };
    let state;
    try { state = await check(); } catch { state = "unknown"; }
    if (state === "unknown") throw Object.assign(new Error(readText("workbench.assistant-send.not-confirmed-connection-dropped-reply-couldn-t-be")), {
      code: ${JSON.stringify(UI_HOST_CLIENT_CODES.outcomeUnknown)}, checkSend: () => check().then(state => state === "unknown" ? "unknown" : "not-sent") });
    return state === "sent";
  }
  async function post(text, extra = {}) {
    const target = sendTarget(), route = host.route("/api/assistant/send"), unsentKey = scoped("unsent") + ":" + encodeURIComponent(curId || "new"), kept = unsent(unsentKey);
    const pending = [...lostSends.values()].filter(one => one.body.text === text);
    let again = extra.named ? undefined : pending.find(one => one.target === target && one.route === route && one.body.submission_id === extra.request_id)
      || (!curId ? pending.find(one => !one.work && (one.target !== target || one.route !== route)) : undefined);
    const submission = extra.named || extra.request_id || crypto.randomUUID();
    let recovering = !again && !extra.named && kept.id && kept.work === (curId || null) && kept.target === target && kept.route === route;
    const body = { text, request_id: recovering ? kept.id : submission, submission_id: submission,
      context: pageContext(), materials: [...sendMaterials(), ...(extra.materials || [])], ...(extra.written_by ? { written_by: extra.written_by } : {}) };
    const character = curId ? pendingChar : nextChar || undefined;
    if (character !== undefined && allowsCharacter()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (curId) {
      body.work_id = curId;
      body.draft_revision = getWork()?.draft_revision;
      // Answering the round's question is its own target; the Host takes a way of delivering only with a supplement (K0b).
      const target = receipts.target();
      if (target) body.target = target;
      if (target !== "answer" && extra.delivery && extra.delivery !== "next-boundary") body.delivery = extra.delivery;
    } else if (nextExec !== "assistant") {
      body.executor = { kind: "plugin", plugin_id: nextExec };
      const session = executorSession(nextExec);
      if (session) body.executor_session_id = session; else if (nextMode) body.mode = nextMode;
    } else body.scope = nextScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    if (!again && !extra.named) again = pending.find(one => one.target === target && one.route === route && contentOf(one.body) === contentOf(body));
    if (again) recovering = false;
    const intent = again?.body.text === text ? again
      : { body, unsentKey, work: curId, target, route, character, files: files.slice(), selection: sel, removed: [...removed], joined: [...joined] };
    if (recovering) {
      if (await recoverSend(kept, unsentKey)) return { consumed: false };
      // The person may have changed receivers during the lookup; this click must not send to that new receiver.
      if (sendTarget() !== target || host.route("/api/assistant/send") !== route) return { consumed: false };
    }
    const consumed = intent.target === target && intent.route === route;
    const here = () => sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
    // The work a new work's Send made is where the words are now: the composer moves to it without writing them anywhere else.
    const chooseSent = (work) => { if (!intent.work) handedOver = true; curId = work.work_id; remember(); openTab(curId); };
    // A refused draft save has not submitted anything and must not discard an older uncertain request key.
    if (extra.before) { const revision = await extra.before; if (!again && typeof revision === "number") intent.body.draft_revision = revision; }
    problem = null; setPanel(true); scrollOwner()?.toLatest();
    lostSends.set(intent.body.request_id, intent);
    store.set(intent.unsentKey, JSON.stringify({ work: intent.work || null, text, id: intent.body.request_id, target: intent.target, route: intent.route }));
    try {
      const res = await api("/send", "POST", intent.body, intent.route);
      if (!ownsReceipt(res, intent)) { forgetIntent(intent); recoveredWork(res.work); return { consumed: false }; }
      return { ...await acceptSent(res, intent), consumed };
    } catch (error) {
      error.checkSend = () => checkSent(intent, consumed);
      if (![${JSON.stringify(UI_HOST_CLIENT_CODES.outcomeUnknown)}, "assistant.pending_request"].includes(error.code)) forgetIntent(intent);
      const data = error.body?.details || {}, visible = here();
      if (data.work) retainSent(data.work);
      if (visible) {
        if (data.work) chooseSent(data.work);
        if (data.action) problem = { ...error, name: error.name, message: error.message, action: data.action };
        if (curId) await reload(); else render();
      }
      throw error;
    } finally { poll(); }
  }
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
 * While the round waits on its one free-text question (the Host marks it `from_composer`: specs/ai-interaction-experience D34), the chip above the
 * input shows what the next Send does, with the default on it (「这次发送」, as before K3): answer the question, or add to the round. One click
 * switches it; the Host never decides it. When the round
 * waits on a questionnaire whose one text question is among others (the Host marks it `draft_from_composer` with that
 * field), the default is 「写进问卷」 instead: Send writes the words into the card's draft and hands nothing back (R4, D14).
 */
export const ASSISTANT_RECEIPTS_FACTORY_SCRIPT = String.raw`({ readText, shared, chip, api, work, reload, pact }) => {
  const CHOICES = { answer: "workbench.assistant-send.answer-questions-above", draft: "workbench.assistant-send.write-into-form", steer: "workbench.assistant-send.add-turn" };
  const NEXT = { answer: "workbench.assistant-send.switch-to-answer", draft: "workbench.assistant-send.switch-to-draft", steer: "workbench.assistant-send.switch-to-steer" };
  let asked = "", ask = null, choice = "answer", pacted = null, drawn = "", block = null;
  const question = (round) => {
    const waiting = round && round.phase === "awaiting-input" ? round.awaiting_input || [] : [];
    return waiting.find((item) => item.from_composer || item.draft_from_composer) || null;
  };
  const first = () => ask?.draft_from_composer ? "draft" : "answer";
  // The chip above the input: its words are the choice the next Send makes, and one click switches to the other.
  const label = () => { chip.textContent = readText(CHOICES[choice]); chip.title = readText(NEXT[choice === "steer" ? first() : "steer"]); };
  chip.addEventListener("click", () => { choice = choice === "steer" ? first() : "steer"; label(); });
  const lost = (error) => { throw error.code === ${JSON.stringify(UI_HOST_CLIENT_CODES.outcomeUnknown)} ? new Error(readText("workbench.assistant-send.not-confirmed-connection-dropped-reply-couldn-t-be")) : error; };
  const act = (round) => round && round.run_id ? {
    withdraw: (input_id) => api("/works/" + encodeURIComponent(work()) + "/control", "POST", { kind: "withdraw", run_id: round.run_id, input_id }).then(() => "", lost).finally(reload),
    correct: (about, text, key) => api("/send", "POST", { work_id: work(), text, about, request_id: key }).then((res) => res.outcome === "queued" ? readText("workbench.assistant-send.saved-takes-effect-next-turn") : "", lost).finally(reload),
  } : undefined;
  return {
    /** The receipt under one of the person's supplements, placed after it; none for anything else. The thread is its surface. */
    line(thread, node, put, turn, round) {
      const key = "receipt:" + turn.turn_id, line = shared.line(thread, turn, round, act(round));
      const drawn = [...node.children].find((child) => child.dataset.entry === key);
      if (!line) { drawn?.remove(); return; }
      // A note drawn again is a new node for the same turn: it replaces the one already there rather than adding another.
      if (drawn && drawn !== line) drawn.remove();
      line.dataset.entry = key; put(line);
    },
    /** Reads the round's question the composer can answer or fill; a new one starts at its default, and the chip shows only then. */
    paint(round) {
      ask = question(round); const id = ask ? ask.pending_id + ":" + ask.pending_revision : "";
      if (id !== asked) { asked = id; choice = first(); label(); }
      chip.hidden = !ask;
    },
    retitle: label,
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
