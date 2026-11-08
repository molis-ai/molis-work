/**
 * One Send to the Host, whoever made it (the composer, a page's delegated words, search's 问助理), inside the resident Assistant's
 * client scope: the request, then what the page keeps of it. A Send whose outcome is unknown keeps its words and key across a
 * refresh, so the same words go again under the same key and the Host starts nothing twice (§7). What the composer shows of the
 * outcome is the composer's; the thread shows a problem only when it carries a way out (a link to settings, a cap to raise).
 * `extra` is the composer's key, delivery and materials (and `before`, the work's draft write the Send waits for), or a delegated
 * message's own key (`named`) and `written_by`.
 */
export const ASSISTANT_SEND_CLIENT_SCRIPT = String.raw`
  // A Send whose outcome was lost goes again as it went (W2-18-SEND-02): the same body (key, scope, context, materials) on the
  // same route, though the chooser or the page has moved on since; one per receiver, until the Host answers or refuses it.
  const lostSends = new Map();
  const unsent = () => { try { return JSON.parse(store.get(scoped("unsent")) || "null") || {}; } catch { return {}; } };
  const sendTarget = () => curId || JSON.stringify([project?.id, nextScope, nextExec, nextMode, nextChar]);
  const retainSent = (work) => {
    const index = works.findIndex(row => row.work_id === work.work_id);
    if (index >= 0) works[index] = work; else works.unshift(work);
    paintList(); drawTabs();
  };
  // 「请 AI 重新问」 on a closed question: the page names only the question; the Host writes the round and reads the draft (D5).
  const reaskQuestion = (work, round, question) => api("/send", "POST", { work_id: work.work_id, request_id: crypto.randomUUID(),
    written_by: "page", reask: { run_id: round.run_id, pending_id: question.pending_id } }).then(reload).then(poll, showError);
  async function post(text, extra = {}) {
    const again = extra.named ? undefined : lostSends.get(curId || null), kept = unsent(), unsentKey = scoped("unsent");
    const body = { text, request_id: extra.named || (kept.work === (curId || null) && kept.text === text ? kept.id : extra.request_id || crypto.randomUUID()),
      context: pageContext(), materials: [...sendMaterials(), ...(extra.materials || [])], ...(extra.written_by ? { written_by: extra.written_by } : {}) };
    const character = curId ? pendingChar : nextChar || undefined;
    if (character !== undefined && allowsCharacter()) body.character = character ? { artifact_id: character.artifact_id, version: character.version } : null;
    if (curId) {
      body.work_id = curId;
      // Answering the round's question is its own target; the Host takes a way of delivering only with a supplement (K0b).
      const target = receipts.target();
      if (target) body.target = target; else if (extra.delivery && extra.delivery !== "next-boundary") body.delivery = extra.delivery;
    } else if (nextExec !== "assistant") {
      body.executor = { kind: "plugin", plugin_id: nextExec };
      const session = executorSession(nextExec);
      if (session) body.executor_session_id = session; else if (nextMode) body.mode = nextMode;
    } else body.scope = nextScope === "project" && project ? { kind: "project", project_id: project.id } : { kind: "personal" };
    const intent = again?.body.text === text ? again
      : { body, work: curId, target: sendTarget(), route: host.route("/api/assistant/send"), character, files: files.slice(), selection: sel, removed: [...removed], joined: [...joined] };
    const here = () => sendTarget() === intent.target && host.route("/api/assistant/send") === intent.route;
    // The work a new work's Send made is where the words are now: the composer moves to it without writing them anywhere else.
    const chooseSent = (work) => { if (!intent.work) handedOver = true; curId = work.work_id; remember(); openTab(curId); };
    problem = null; setPanel(true); scrollOwner()?.toLatest();
    lostSends.set(intent.work || null, intent);
    store.set(unsentKey, JSON.stringify({ work: intent.work || null, text, id: intent.body.request_id }));
    try {
      // Everything the Send is for was read above; it goes once the work's draft write before it has been answered.
      if (extra.before) await extra.before.catch(() => undefined);
      const res = await api("/send", "POST", intent.body, intent.route);
      lostSends.delete(intent.work || null); store.set(unsentKey, null);
      const visible = here();
      retainSent(res.work);
      if (visible) {
        takeMaterials(intent); chooseSent(res.work);
        if (pendingChar === intent.character) pendingChar = undefined;
        if (nextChar === intent.character) nextChar = null;
        await reload();
      }
      const carrier = res.work.executor?.kind === "plugin" ? executorOffer(res.work.executor.plugin_id) : null;
      if (carrier) window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: res.work.work_id, capability_id: carrier.capability_ids["run.start"], session_id: res.work.executor.session_id } }));
      // A supplement's fate is its receipt line in the thread, and words kept for the next turn the composer's status line.
      if (visible && res.outcome === "answered") host.showToast?.(L("已作为回答发送"));
      // A lost Send that went again from another receiver went where it was first sent: the words in the box now are not its.
      return visible ? res : { ...res, elsewhere: true };
    } catch (error) {
      if (error.code !== "ui_host.outcome_unknown") { lostSends.delete(intent.work || null); store.set(unsentKey, null); }
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
 * While the round waits on its one free-text question (the Host marks it `from_composer`: specs/ai-interaction-experience D34), the composer shows what the next Send does, with the default in
 * its 「这次发送」 control: answer the question, or add to the round. The person switches it; the Host never decides it. When the round
 * waits on a questionnaire whose one text question is among others (the Host marks it `draft_from_composer` with that
 * field), the default is 「写进问卷」 instead: Send writes the words into the card's draft and hands nothing back (R4, D14).
 */
export const ASSISTANT_RECEIPTS_FACTORY_SCRIPT = String.raw`({ L, shared, api, work, reload, pact }) => {
  const CHOICES = { answer: "回答上面的问题", draft: "写进问卷", steer: "补充这一轮" };
  let asked = "", ask = null, choice = "answer", pacted = null, drawn = "", block = null;
  const question = (round) => {
    const waiting = round && round.phase === "awaiting-input" ? round.awaiting_input || [] : [];
    return waiting.find((item) => item.from_composer || item.draft_from_composer) || null;
  };
  const first = () => ask?.draft_from_composer ? "draft" : "answer";
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
    /** Reads the round's question the composer can answer or fill; a new one starts at its default. */
    paint(round) {
      ask = question(round); const id = ask ? ask.pending_id + ":" + ask.pending_revision : "";
      if (id !== asked) { asked = id; choice = first(); }
    },
    /** The two things the next Send can do while the round waits on that question, and which one it does now; null otherwise. */
    choices: () => ask ? { options: [first(), "steer"], value: choice } : null,
    label: (one) => CHOICES[one],
    choose: (one) => { if (ask && (one === first() || one === "steer")) choice = one; },
    /** What the next Send does while there is a question; nothing otherwise (the words go to the round as a supplement). */
    target: () => !ask || choice === "draft" ? undefined : choice,
    /** The question whose draft the next Send fills instead. */
    into: () => ask && choice === "draft" ? ask : null,
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
