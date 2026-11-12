import { icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { assistantComposerLabels } from "../../assistant-composer-labels.js";
import { ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT } from "./assistant-attachments.js";

/**
 * The input (unified-input-voice K3): the platform's composer (`window.molisComposer`) mounted in the Dock, one mount per receiver,
 * so a late outcome, upload or draft read of the last one is dropped. The island gives it who the next Send goes to, the scene
 * controls, the `/` commands and the upload; keys, menus, the attachment strip and the send lifecycle are the composer's. A part of
 * ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place.
 *
 * - Drafts stay the Assistant's (K3 补答 1, 6): a work's on the Host (`/works/:id/draft`), a new work's in this viewer's own
 *   storage, read and written through `draft.adapter`; the composer keeps no second copy. Switching receivers writes the words
 *   to the one they were for, then mounts the next with its own.
 * - The ways a supplement reaches a running turn are the Host's (K0b `delivery`): while a turn runs they are offered per the Host's
 *   word; with no turn running, 下一轮再做 is a real queue for a work that has run before (2026-11-09 audit fix), while a new work or
 *   one that never ran says why it cannot queue. What the next Send does about a waiting question is the receipt chip (ai-input-receipts
 *   §4.1), above the input, as before K3.
 * - After a new work's first Send the receiver becomes that work: the mount waits until the composer has settled the Send.
 */
export const ASSISTANT_COMPOSER_PART = String.raw`  /* Starting points for what is open (specs/archive/contextual-interaction §6.4.2): what the action directory offers for it,
     through the context row's controller — the row's own plan while something is in hand. Choosing one of those runs
     it as a click on the row would. With nothing offered, three plain questions that only fill the input. Pages do not
     list their own. */
  const plainStarters = () => [
    { label: readText("workbench.assistant-composer.summarize-page"), prompt: readText("workbench.assistant-composer.summarize-key-points-page") },
    { label: readText("workbench.assistant-composer.list-page-s-key-points"), prompt: readText("workbench.assistant-composer.list-key-points-page-one-one") },
    { label: readText("workbench.assistant-composer.what-could-come-next"), prompt: readText("workbench.assistant-composer.based-page-what-could-i-do-next") },
  ];
  const offered = {
    signature: "", request: "", answer: null, timer: 0,
    // Nothing (undefined) while the answer is on its way (briefly: rules only), then the items, possibly none.
    read(ctx) {
      const inHand = Boolean(sel && !removed.has("selection"));
      const signature = JSON.stringify([ctx.plugin_id, ctx.object || null, inHand]);
      // What is in hand changes with every selection: ask each time (the row answers from the plan it shows).
      // Kept while the same thing stays open, but asked again after a while: a plugin switched off drops out.
      const fresh = this.answer && Date.now() - this.answer.at < 15000;
      if (signature === this.signature && !inHand && (fresh || !this.answer)) return this.answer ? this.answer.items : undefined;
      if (signature !== this.signature) { this.signature = signature; this.answer = null; }
      const req = this.request = crypto.randomUUID();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (this.request === req && !this.answer) this.settle(req, "", []); }, 2000);
      document.dispatchEvent(new CustomEvent("molis:assistant-starters-request", { detail: { context:ctx, request_id: req } }));
      return this.answer ? this.answer.items : undefined;
    },
    settle(req, objectKey, items) {
      if (req !== this.request) return;
      const changed = !this.answer || JSON.stringify([this.answer.object_key, this.answer.items]) !== JSON.stringify([objectKey, items]);
      this.answer = { object_key: objectKey, items, at: Date.now() };
      if (!changed) return;
      // Answered while being read (the row's plan is at hand): the reader shows it; otherwise repaint the empty work.
      queueMicrotask(paintEmpty);
    },
  };
  document.addEventListener("molis:assistant-starters", (event) => {
    const detail = event.detail || {};
    const items = Array.isArray(detail.items) ? detail.items.filter((item) => item && typeof item.key === "string" && typeof item.label === "string") : [];
    offered.settle(detail.request_id, typeof detail.object_key === "string" ? detail.object_key : "", items);
  });
  const startersFor = () => {
    const ctx = pageCtx();
    if (!ctx) return [];
    const items = offered.read(ctx);
    if (items === undefined) return [];
    if (!items.length) return plainStarters();
    const objectKey = offered.answer.object_key;
    return items.map((item) => ({ label: item.label, hint: item.hint, kind: item.kind, key: item.key, object_key: objectKey }));
  };
  /** Puts words in the box as if they were typed, so the composer keeps them as the draft (a starter, a page's words, a retry). */
  const setWords = (text) => { input.value = text; window.molisFit?.(input); input.dispatchEvent(new Event("input", { bubbles: true })); };
  // A plain question fills the input; an offered action runs through the row, and nothing is typed for it.
  const useStarter = (starter) => {
    if (starter.key) {
      document.dispatchEvent(new CustomEvent("molis:assistant-starter-choose", { detail: { object_key: starter.object_key, key: starter.key } }));
      return false;
    }
    setWords(starter.prompt);
    return true;
  };

  /* ─── The input: the platform's composer ──────────────────────────────── */
  const composerWords = () => (${assistantComposerLabels.toString()})(readText, /Mac|iPhone|iPad/.test(navigator.platform));
  const words = composerWords();
  const upload = (${ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT})({ readText, api });
  /* “/”: what this work may use now and the methods it may follow, read again each time the person comes to the input (a plugin
     turned off or a method taken away meanwhile is gone from it); the last list stays until the new one is in, so the menu does not
     flicker. A method (how to do it) or a capability (what to use) chosen there goes with the next Send only, on the strip above the input. */
  let catalog = null, rows = { capabilities: [], methods: [] }, rowsIn = false;
  const readCatalog = () => catalog ||= Promise.all([api("/capabilities").then((res) => (res.capabilities || []).filter((row) => row.enabled), () => []),
    api("/methods").then((res) => res.methods || [], () => [])]).then(([capabilities, methods]) => { rows = { capabilities, methods }; rowsIn = true; })
    .finally(() => { catalog = null; });
  compose.addEventListener("focusin", (event) => { if (event.target.matches?.(".mw-composer__input") || !rowsIn) void readCatalog(); });
  compose.addEventListener("pointerenter", () => { if (!rowsIn) void readCatalog(); });
  // A "/" typed before the list has arrived opens the menu once it has: the composer opens it only when there is something to list.
  compose.addEventListener("input", (event) => {
    if (rowsIn || event.data !== "/" || !event.target.matches?.(".mw-composer__input")) return;
    void readCatalog().then(() => {
      const caret = input.selectionStart ?? input.value.length;
      if (document.activeElement === input && input.value.slice(0, caret).endsWith("/") && !compose.querySelector("[data-compose-menu]:not([hidden])"))
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "/", inputType: "insertText" }));
    });
  });
  const choose = (material, same) => () => {
    if (!files.some((file) => file.kind === material.kind && same(file))) files.push({ material_id: material.kind + "-" + crypto.randomUUID(), explicit: true, ...material });
    paintMats(); input.focus();
  };
  // Every method and capability is listed (the menu scrolls); the composer's "/" narrows them by the words typed after it.
  const commands = () => [
    // Each kind keeps the glyph Coding gives the same kind (its ＋), so a method or a capability looks the same wherever it is added.
    ...startersFor().map((starter) => ({ slash: readText("workbench.context-onboarding.begin"), icon: "sparkles", label: starter.label + (starter.kind ? " · " + starter.kind : ""), ...(starter.hint ? { hint: starter.hint } : {}),
      run: () => { if (useStarter(starter)) input.focus(); } })),
    /* A Skill is chosen by its exact reference from the shared catalog; a signed role by its default and installation. */
    ...rows.methods.filter((row) => row.kind !== "skill" || row.skill.user_invocable).map((row) => {
      if (row.kind === "skill") {
        const skill = row.skill, same = (ref) => ref && ref.install_id === skill.ref.install_id && ref.skill_id === skill.ref.skill_id;
        return { slash: readText("workbench.assistant-composer.method"), icon: "list", label: skill.name + " · " + skill.pack.title, hint: skill.description || skill.name, run: choose({ kind: "method", title: readText("workbench.assistant-composer.method-title", { name: skill.name }),
          method: { kind: "skill", ref: skill.ref } }, (file) => same(file.method.ref)) };
      }
      return { slash: readText("workbench.assistant-composer.role-material"), icon: "user", label: row.name + " · " + row.plugin_title, hint: row.summary || row.name, run: choose({ kind: "method", title: readText("workbench.assistant-composer.role-material-title", { name: row.name }),
        method: { kind: "role", method_id: row.method_id, version: row.version, default_ref: row.default_ref, installation: row.installation } },
        (file) => file.method.method_id === row.method_id && file.method.installation?.install_id === row.installation.install_id) };
    }),
    ...rows.capabilities.map((row) => {
      const title = row.provider + " · " + row.title;
      return { slash: readText("workbench.assistant-composer.use"), icon: "workflow", label: title, hint: row.description || title, run: choose({ kind: "capability", title: readText("workbench.assistant-composer.use-title", { title }),
        capability: { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, title } }, (file) => file.capability.capability_id === row.capability_id) };
    }),
    ...(project && document.documentElement.dataset.knowledgePicker === "1" ? [{ slash: readText("workbench.settings-agent-diagnostics.materials"), icon: "paperclip", label: readText("workbench.assistant-composer.choose-project-knowledge"), hint: readText("workbench.assistant-composer.several-once-their-text-goes-assistant"),
      run: () => document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: { request_id: "assistant:" + crypto.randomUUID(), max: 10 } })) }] : []),
  ];
  /** Who the next Send goes to: the work in front, named by its place first when that is not this page (#1919); else a new work. */
  const receiverNow = () => {
    const work = getWork();
    // With a page in front that takes words, the tag opens 「发给」 (O4), so the person can go back to it.
    const open = globalThis.molisBarReceivers?.front() ? openSendTo : openConversation;
    if (!work) return { open, icon: "sparkles", label: nextExec !== "assistant" && executorOffer(nextExec) ? executorOffer(nextExec).title : readText("workbench.common.assistant") };
    const where = work.scope?.project_id !== project?.id ? scopeLabel(work.scope, work.scope_title) : "";
    return { open, icon: "sparkles", label: work.reply_target ? readText("workbench.assistant-composer.original-comment-title", { title: work.reply_target.title }) : (where ? where + " · " : "") + work.title,
      reset: () => { void switchTo(null); input.focus(); }, resetLabel: readText("workbench.assistant-dock.start-new-work-instead") };
  };
  /* The choices that are the next Send's, in the bar only once they differ from the default and while the side pane, where they
     are chosen, is not shown: who carries a new work, the plugin session's mode, the Character. What the next Send does while the
     turn waits on its question is the receipt chip above the input (ai-input-receipts §4.1), not a control here. */
  const controlsNow = () => {
    const work = getWork(), list = [];
    // With the side pane shown, its summary (「谁来做」「方式」, the Character) is where these are chosen, as before K3: one place for
    // each choice, so the composer does not repeat them (implementation-plan §3.2's 「更多」 is the narrow composer's fold, not this).
    if (island.hasAttribute("data-side-shown")) return list;
    if (!work && executorsHere() && nextExec !== "assistant") list.push({ kind: "select", id: "executor", label: readText("workbench.assistant-dock.who-does"),
      options: executorChoices().map((one) => ({ value: one.id, label: one.label + (one.id === nextExec && executorSession(one.id) ? " · " + readText("workbench.assistant-island.session") : "") })), value: nextExec,
      change: (value) => { nextExec = value; nextMode = ""; if (value !== "assistant") nextChar = null; paintAim(); paintSum(); } });
    // A new work that continues a session open on the page runs in that session's own mode, shown once it is the work's.
    const offer = modeOffer();
    if (offer && offer.modes.length && (work || !executorSession(nextExec))) list.push({ kind: "select", id: "mode", label: readText(work ? "workbench.assistant-dock.mode-next-turn" : "workbench.assistant-island.mode-first-turn"),
      options: modeRows(offer).map((mode) => ({ value: mode.id, label: mode.label })), value: work ? work.executor.mode || offer.default_mode : nextMode || offer.default_mode,
      change: (value) => void applyMode(value) });
    const chosen = chosenCharacter();
    if (allowsCharacter() && chosen) {
      const key = (ref) => ref.artifact_id + "@" + ref.version, choices = (characterChoices() || []).filter((one) => one.available && key(one.reference) !== key(chosen));
      list.push({ kind: "select", id: "character", label: readText("workbench.assistant-dock.which-character-carries"), value: key(chosen),
        options: [{ value: "", label: readText("workbench.assistant-island.assistant-itself") }, { value: key(chosen), label: chosen.title }, ...choices.map((one) => ({ value: key(one.reference), label: one.title }))],
        change: (value) => {
          const one = (characterChoices() || []).find((choice) => key(choice.reference) === value), next = value === key(chosen) ? chosen : one ? { artifact_id: one.reference.artifact_id, version: one.reference.version, title: one.title } : null;
          if (getWork()) pendingChar = next; else nextChar = next;
          paintAim(); paintSum();
        } });
    }
    return list;
  };
  const deliveryNow = () => {
    const work = getWork();
    // An answer goes to the question, and words for the questionnaire into its draft: neither reaches the turn as a supplement.
    const answering = receipts.target() === "answer" || receipts.into();
    const why = { available: false, reason: readText("workbench.assistant-composer.this-send-answers-the-question-above-switch-to") };
    // 2026-11-09 audit fix (user decision): without a running turn, 下一轮再做 is a queue the next turn the person begins carries
    // (K0b's receipt says queued). A work that never ran has no round to wait behind; a new work is no work at all: say why.
    const session = work ? (work.executor.kind === "plugin" ? work.executor.session_id : work.session_id) : null;
    const queue = session ? { available: true } : { available: false, reason: work ? readText("workbench.assistant-composer.this-work-has-not-run-a-turn-yet") : readText("workbench.assistant-composer.there-is-no-work-to-queue-for-yet") };
    return { "next-boundary": { available: true },
      interrupt: answering ? why : { available: true },
      "after-run": answering ? why : queue };
  };
  let composer = null, mountedFor = null, draftHere = null, painted = "", sending = 0, handedOver = false, inFlight = null;
  /* One input (unified-input-voice §10.3, O2): a framed page in front that takes words (Coding's session) is the receiver; the
     bar mounts the composer on its options, and the Assistant's own parts around the box step aside while it is. */
  let boundPage = null, declined = null;
  // With the Assistant's thread open (or staged in its tab) the person is looking at it: the bar stays the Assistant's. So it does on
  // a page the person chose the Assistant over in 「发给」, until they pick the page again or another page comes to the front.
  const pageInFront = () => {
    const page = globalThis.molisBarReceivers?.front() || null;
    if (declined && page !== declined) declined = null;
    return (panel && !panel.hidden) || !page || page === declined ? null : page;
  };
  if (panel) new MutationObserver(() => syncComposer()).observe(panel, { attributes: true, attributeFilter: ["hidden"] });
  let worksArrived; const worksIn = new Promise((resolve) => { worksArrived = resolve; });
  /* A work's Send (going), edits made meanwhile (later), and each pending draft's text + save promise (writing).
     Edits persist immediately; the Host settles only the draft generation captured before the Send (B10-R3). */
  const going = new Map(), later = new Map(), writing = new Map();
  const draftAdapters = new Map();
  const draftFor = (id) => {
    const key = id || scoped("new-draft");
    if (!draftAdapters.has(key)) draftAdapters.set(key, makeDraft(id));
    return draftAdapters.get(key);
  };
  const makeDraft = (id) => {
    if (!id) { const key = scoped("new-draft"); return { read: async () => store.get(key) || "", write: async (text) => store.set(key, text || null) }; }
    const route = host.route("/api/assistant/works/" + encodeURIComponent(id) + "/draft");
    let unsaved = false;
    return {
      sent: async () => {}, // The Host settles the persistent draft together with the accepted input.
      // A work's draft comes with the list of works. While a Send is on its way the box holds only what was written after it: the
      // Host's draft is the Send's own words, or older ones, and is cleared when the Send lands.
      read: () => later.has(id) ? Promise.resolve(later.get(id)) : going.has(id) ? Promise.resolve("")
        : worksIn.then(() => writing.get(id)?.text ?? (works.find((work) => work.work_id === id) || {}).draft ?? ""),
      // Sending reuses the saved generation; every real edit below creates a new one, including retyping the same words.
      prepare(text) {
        const pending = writing.get(id), work = works.find(row => row.work_id === id);
        return pending?.text === text ? pending.promise : !pending && work?.draft === text && !unsaved
          ? Promise.resolve(work.draft_revision) : this.write(text);
      },
      write: (text) => {
        const editing = going.has(id), pending = writing.get(id), work = works.find((row) => row.work_id === id);
        if (editing) later.set(id, text);
        unsaved = true;
        if (work) work.draft = text;
        const run = (pending?.promise || Promise.resolve()).catch(() => undefined).then(() => api("", "POST", { draft: text }, route)).then(({ work: saved }) => {
          const cached = works.find(row => row.work_id === id);
          if (writing.get(id)?.promise === run) { unsaved = false; if (cached && cached.draft_revision <= saved.draft_revision) { cached.draft = saved.draft; cached.draft_revision = saved.draft_revision; cached.revision = Math.max(cached.revision, saved.revision); } }
          return saved.draft_revision;
        }), done = () => { if (writing.get(id)?.promise === run) writing.delete(id); };
        writing.set(id, { text, promise: run }); run.then(done, done);
        return run;
      },
    };
  };
  /** One Send from the composer: the work it is for is the one in front now, whatever the person opens while it is on its way. */
  const sendNow = async (sent) => {
    const id = curId, mine = { text: sent.text, mount: mountedFor };
    const before = id ? draftFor(id).prepare(sent.text) : undefined;
    sending += 1; inFlight = mine; if (id) going.set(id, mine);
    try {
      const outcome = await submit(sent, before);
      return outcome;
    } finally {
      sending -= 1; if (inFlight === mine) inFlight = null;
      if (id && going.get(id) === mine) {
        going.delete(id);
        later.delete(id);
      }
      setTimeout(syncComposer, 0);
    }
  };
  const shown = () => JSON.stringify([receiverNow().label, Boolean(getWork()), deliveryNow(), controlsNow().map((one) => [one.id, one.value, one.options])]);
  const assistantInputName = () => input.setAttribute("aria-label", words.input);
  let refreshComposerWords = assistantInputName;
  const mountPage = (target) => {
    mountedFor = target.key; boundPage = target; draftHere = null; painted = "";
    island.dataset.receiver = "page"; input.readOnly = false; input.placeholder = target.placeholder;
    // The page's own words, with the bar's where it gave none; its options are read live (getters kept), only the words are filled.
    const options = Object.defineProperties({}, Object.getOwnPropertyDescriptors(target.options));
    const labels = options.labels = {};
    refreshComposerWords = () => {
      const own = target.options.labels;
      Object.assign(labels, words, own, { adding: own.adding ?? words.adding, modes: { ...words.modes, ...own.modes } });
      input.setAttribute("aria-label", labels.input);
    };
    refreshComposerWords();
    // Its tag opens 「发给」; the page's own name and glyph, nothing else of what it said.
    options.receiver = () => { const named = target.options.receiver?.(); return named ? { label: named.label, ...(named.icon ? { icon: named.icon } : {}), open: openSendTo } : null; };
    composer = window.molisComposer(compose, options);
<<<<<<< HEAD
    target.bind(composer, input);
=======
    target.bind(composer, input, refreshComposerWords);
    keepGlyph(target);
>>>>>>> origin/main
  };
  const mountComposer = () => {
    island.removeAttribute("data-receiver"); paintAim(false);
    refreshComposerWords = assistantInputName; refreshComposerWords();
    mountedFor = curId || scoped("new-draft"); draftHere = draftFor(curId); painted = shown();
    composer = window.molisComposer(compose, { kind: "ai", entry: "assistant", labels: words, draft: { adapter: draftHere },
      receiver: receiverNow, delivery: deliveryNow, get controls() { return controlsNow(); }, get commands() { return commands(); },
      attachments: { accept: upload.accept, upload: (file) => upload.upload(file) }, onMaterials: () => paintMats(),
      near: () => { const page = pageObject(); return page ? { kind: page.object.kind, id: page.object.id, plugin_id: page.context.plugin_id } : null; },
      required: () => getWork()?.reply_target ? readText("workbench.assistant-island.return-original-comment-continue") : !String(input.value || "").trim() ? readText("workbench.assistant-composer.write-something-first") : null,
      stop: () => control("stop"),
      submit: sendNow });
    const work = getWork(); composer.setRunning(Boolean(work && isLive(work.state)));
  };
  /** Keeps the composer on the receiver in front; redrawn only when what it shows changed, so a poll never closes its menu. */
  function syncComposer() {
    if (!window.molisComposer) return;
    const page = pageInFront();
    // The person opened another receiver: the composer moves now, even with a Send on its way (its outcome is the Host's and the
    // thread's). A new work's first Send moving it to that work waits until the composer has settled the Send.
    if (mountedFor !== (page ? page.key : curId || scoped("new-draft")) && !(sending && handedOver && !page)) {
      // Destroy flushes captured edits, including typing before the shared script arrived.
      composer?.destroy(); boundPage?.bind(null); boundPage = null;
      handedOver = false; closeSendTo(false);
      return page ? mountPage(page) : mountComposer();
    }
    // The page says itself when what it shows changed (composer-parent.ts).
    if (page || sending) return;
    const work = getWork(); composer.setRunning(Boolean(work && isLive(work.state)));
    const now = shown();
    if (now !== painted) { painted = now; composer.refresh(); }
  }
  const asOutcome = (res, id) => res.consumed === false ? { state: "failed", message: readText("workbench.assistant-composer.the-original-send-is-confirmed-the-draft-here") } : ({ state: "sent", ...(res.elsewhere ? { elsewhere: true } : {}),...(res.outcome === "repeated" || res.outcome === "queued" ? { receipt: { input_id: "send." + id, replayed: res.outcome === "repeated", delivered: res.outcome === "queued" ? "queued" : "run" } } : {}) });
  async function submit(sent, before) {
    const text = sent.text.trim(), into = curId && receipts.into(), fill = into && fills.get(into.pending_id);
    if (fill && sent.materials.length) return { state: "failed", message: readText("workbench.assistant-composer.this-questionnaire-field-accepts-text-only-remove-the") };
    if (fill) return Promise.resolve(before).then(revision => fill(into.draft_from_composer, text, revision)).then(() => { host.showToast?.(readText("workbench.assistant-send.written-into-form-goes-back-only-when-press")); return { state: "sent" }; }, (error) => ({ state: "failed", message: error.message }));
    const { materials, over, positions } = upload.take(sent.materials);
    if (over.length) return { state: "failed", message: over[0].reason, unreadable: over };
    const asked = { request_id: sent.request_id, delivery: sent.delivery, materials, ...(before ? { before } : {}) };
    const outcome = (error) => ["ui_host.outcome_unknown", "assistant.pending_request"].includes(error.code) ? { state: "unknown", check: () => { sending += 1;
      return error.checkSend().finally(() => { sending -= 1; setTimeout(syncComposer, 0); }); } }
      : { state: "failed", message: error.message, unreadable: (error.body?.details?.unreadable || []).flatMap(one => positions.has(one.material_id) ? [{ index: positions.get(one.material_id), reason: one.reason }] : []) };
    return post(text, asked).then((res) => asOutcome(res, sent.request_id), outcome);
  }
  /** Words sent for the person by a page or by search, not typed in the box: what the person is writing stays where it is. */
  const say = (text, extra) => { sending += 1; return post(text, extra).catch((error) => { if (!String(input.value || "").trim()) setWords(text); showError(error); })
    .finally(() => { sending -= 1; syncComposer(); }); };
  // Files the side pane takes go where every file goes: onto the composer's strip, whose upload reads them; 待发送 names what
  // the strip carries (a read file as a picture or a file, a pick as the object it is), told again by the composer's onMaterials.
  // While a page in front has the bar, its box is the page's and may take no files at all: say so instead of dropping them.
  function addFiles(chosen) {
    if (boundPage) { host.showToast?.(L("文件没有加进去：现在底栏发给这一页，它不收文件。回到助理再添加。"), true); return; }
    composer?.attach(chosen);
  }
  globalThis.molisBarReceiverChanged = () => syncComposer();
  stripPending = () => (composer && !boundPage ? composer.materials() : []).map((one) => ({ kind: one.kind === "attachment" ? (upload.material(one.ref) || {}).kind || "file" : "object", title: one.title }));
  function pickFile() { compose.querySelector("[data-composer-add]")?.click(); }
  /* 「发给」 (one input, unified-input-voice §10.4, O4): with a page in front that takes words, the tag beside ＋ lists who the next
     Send can go to — this page's receiver, the Assistant (a new work or a recent one) and the page's other receivers — in the
     platform's menu, risen from the tag. What is in the box stays with the receiver it was written for (each keeps its own draft). */
  const sendToGlyphs = ${JSON.stringify({ sparkles: icon("sparkles"), check: icon("check") })};
  const glyphOf = (html) => { const shell = document.createElement("template"); shell.innerHTML = html; return shell.content.firstElementChild; };
<<<<<<< HEAD
  /* A page's glyph in 「发给」 comes from the same rendered sprite the side pane draws from (data-assistant-glyphs, the platform
     icons rendered once by SDK icon()): the page's icon name is checked by the frame bridge, so nothing the page wrote is drawn
     and the composer's own DOM is not read. A name the sprite does not hold gets no mark; the row still names the page. */
  const glyphSprite = island.querySelector("[data-assistant-glyphs]");
  const pageGlyph = (name) => {
    if (typeof name !== "string" || !/^[a-z0-9-]+$/.test(name) || !glyphSprite || !glyphSprite.content) return null;
    const found = glyphSprite.content.querySelector('[data-glyph="' + name + '"]'), holder = el("span", "assistant-glyph-icon");
    holder.setAttribute("aria-hidden", "true");
    if (found && found.firstElementChild) holder.append(found.firstElementChild.cloneNode(true));
    return holder.childElementCount ? holder : null;
  };
  const sendTo = el("div", "mw-menu assistant-send-to"); sendTo.dataset.assistantSendTo = ""; sendTo.setAttribute("role", "menu"); sendTo.setAttribute("aria-label", L("发给"));
=======
  const pageGlyphs = new WeakMap();
  // The page's glyph as its tag drew it (the composer draws only platform icons), kept for when the bar is the Assistant's.
  const keepGlyph = (page) => { const drawn = compose.querySelector(".mw-composer__to svg"); if (drawn) pageGlyphs.set(page, drawn.cloneNode(true)); };
  const sendTo = el("div", "mw-menu assistant-send-to"); sendTo.dataset.assistantSendTo = ""; sendTo.setAttribute("role", "menu"); sendTo.setAttribute("aria-label", readText("workbench.assistant-composer.send-to"));
>>>>>>> origin/main
  if (typeof sendTo.showPopover === "function") sendTo.popover = "manual";
  island.append(sendTo);
  const sendToOpen = () => sendTo.matches(":popover-open");
  const sendToTag = () => compose.querySelector("[data-composer-receiver]");
  const ago = (iso) => {
    const at = Date.parse(iso || ""), minutes = Math.round((at - Date.now()) / 60000);
    if (!Number.isFinite(at)) return "";
    const format = new Intl.RelativeTimeFormat(document.documentElement.lang || undefined, { numeric: "auto" });
    return Math.abs(minutes) < 60 ? format.format(minutes, "minute") : Math.abs(minutes) < 1440 ? format.format(Math.round(minutes / 60), "hour") : format.format(Math.round(minutes / 1440), "day");
  };
  const sendToItem = (mark, label, detail, on, pick) => {
    const item = el("button", "mw-menu__item mw-menu__item--described"); item.type = "button";
    item.setAttribute("role", "menuitemradio"); item.setAttribute("aria-checked", String(on));
    const named = el("span"); named.dataset.slot = "menu-item-label"; named.append(el("span", "", label), ...(detail ? [el("small", "mw-menu__desc", detail)] : []));
    item.append(...(mark ? [mark.cloneNode(true)] : []), named);
    if (on) { const tick = el("span", "mw-menu__shortcut"); tick.setAttribute("aria-hidden", "true"); tick.append(glyphOf(sendToGlyphs.check)); item.append(tick); }
    item.addEventListener("click", () => { closeSendTo(false); pick(); setTimeout(() => input.focus(), 0); });
    return item;
  };
  const sendToGroup = (label, items) => {
    const group = el("div", "mw-menu__group"), head = el("div", "mw-menu__label", label);
    group.setAttribute("role", "group"); group.setAttribute("aria-label", label); head.setAttribute("aria-hidden", "true");
    group.append(head, ...items);
    return group;
  };
  const paintSendTo = () => {
    const page = globalThis.molisBarReceivers?.front() || null, named = page?.options.receiver?.() || null;
    if (!page || !named) return false;
    const onPage = boundPage === page, mark = pageGlyph(named.icon), spark = glyphOf(sendToGlyphs.sparkles);
    const recent = works.filter((work) => !work.reply_target).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 3);
    const assistant = (id) => () => { declined = page; void switchTo(id); syncComposer(); };
    sendTo.replaceChildren(
      sendToGroup(readText("workbench.assistant-composer.this-page"), [sendToItem(mark, named.label, named.detail || "", onPage, () => { declined = null; syncComposer(); })]),
      sendToGroup(readText("workbench.common.assistant"), [sendToItem(spark, readText("workbench.assistant-composer.new-conversation"), readText("workbench.assistant-composer.ask-outside-session"), !onPage && !curId, assistant(null)),
        ...recent.map((work) => sendToItem(spark, work.title, ago(work.updated_at), !onPage && curId === work.work_id, assistant(work.work_id)))]),
      ...(named.others?.length ? [sendToGroup(readText("workbench.assistant-composer.other-sessions"), named.others.map((one) => sendToItem(mark, one.label, one.detail || "", false, () => named.choose?.(one.id))))] : []));
    return true;
  };
  function closeSendTo(back) {
    if (!sendToOpen()) return;
    sendTo.hidePopover(); sendToTag()?.setAttribute("aria-expanded", "false");
    if (back) (visible(sendToTag()) ? sendToTag() : input)?.focus();
  }
  function openSendTo() {
    if (sendToOpen()) { closeSendTo(true); return; }
    const tag = sendToTag();
    if (!tag || typeof sendTo.showPopover !== "function") return;
    if (!paintSendTo()) return;
    // Rises from the tag: its left edge under the tag's, as wide as the mockup's 300px, inside the window's 16px gutter.
    const box = tag.getBoundingClientRect(), width = Math.min(300, window.innerWidth - 32);
    sendTo.style.width = width + "px";
    sendTo.style.left = Math.round(Math.max(16, Math.min(box.left - 6, window.innerWidth - 16 - width))) + "px";
    sendTo.style.bottom = Math.round(window.innerHeight - box.top + 8) + "px";
    sendTo.showPopover(); tag.setAttribute("aria-expanded", "true");
    (sendTo.querySelector("[aria-checked=true]") || sendTo.querySelector("button"))?.focus();
  }
  sendTo.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeSendTo(true); return; }
    if (event.key === "Tab") { closeSendTo(false); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...sendTo.querySelectorAll("button")], at = items.indexOf(document.activeElement);
    event.preventDefault();
    items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  });
  document.addEventListener("pointerdown", (event) => {
    if (sendToOpen() && event.target?.nodeType === 1 && !sendTo.contains(event.target) && !sendToTag()?.contains(event.target)) closeSendTo(false);
  }, true);
  window.addEventListener("resize", () => closeSendTo(false));
  /* The conversation behind the receiver: its tag beside ＋ opens it, and so does ⌘↵ on an empty box (the work in front,
     or the list of works when a new one is next and there are others). */
  const openConversation = () => {
    if (getWork()) { setPanel(true); reload().then(poll); return true; }
    if (works.length) { setPanel(true); setWorks(true); return true; }
    return false;
  };
  compose.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    if (boundPage || !event.target.matches?.(".mw-composer__input") || String(event.target.value || "").trim() || compose.querySelector(".mw-composer__files")) return;
    if (openConversation()) event.preventDefault();
  }, true);
  // What opens from the island besides the composer's own menus, and the button focus returns to.
  const popovers = () => [[workNav, setWorks, worksToggle], [noticePop, setNotices, noticeBtn]];
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.nodeType !== 1 || island.contains(event.target)) return;
    for (const [pop, close] of popovers()) if (pop && !pop.hidden) close(false);
  });
  island.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const stop = () => { event.preventDefault(); event.stopPropagation(); }, put = ([pop, close, btnEl]) => pop && !pop.hidden && (stop(), close(false), (visible(btnEl) ? btnEl : input)?.focus(), true);
    const [worksOpen, notices] = popovers();
    if (put(worksOpen)) return;
    if (panel && !panel.hidden && !spacious() && drawerOpen) { stop(); drawerOpen = false; paintLayout(); sideToggle?.focus(); return; }
    put(notices);
  }, true);`;
