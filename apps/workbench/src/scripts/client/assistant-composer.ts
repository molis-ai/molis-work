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
 * - The ways a supplement reaches a running turn are the Host's (K0b `delivery`): offered only while a turn runs, not while the
 *   next Send answers its question.
 * - After a new work's first Send the receiver becomes that work: the mount waits until the composer has settled the Send.
 */
export const ASSISTANT_COMPOSER_PART = String.raw`  /* Starting points for what is open (specs/archive/contextual-interaction §6.4.2): what the action directory offers for it,
     through the context row's controller — the row's own plan while something is in hand. Choosing one of those runs
     it as a click on the row would. With nothing offered, three plain questions that only fill the input. Pages do not
     list their own. */
  const plainStarters = () => [
    { label: L("总结这一页"), prompt: L("总结这一页的要点") },
    { label: L("列出这一页的要点"), prompt: L("把这一页的要点逐条列出来") },
    { label: L("下一步可以做什么"), prompt: L("根据这一页，下一步可以做什么？") },
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
  const words = (${assistantComposerLabels.toString()})(L, /Mac|iPhone|iPad/.test(navigator.platform), compose?.dataset.composerNext || L("补充"));
  const upload = (${ASSISTANT_ATTACHMENTS_FACTORY_SCRIPT})({ L, api });
  /* “/”: what this work may use now and the methods it may follow, read once, when the person first comes to the input. A method
     (how to do it) or a capability (what to use) chosen there goes with the next Send only, on the strip above the input. */
  let catalog = null, rows = { capabilities: [], methods: [] }, rowsIn = false;
  const readCatalog = () => catalog ||= Promise.all([api("/capabilities").then((res) => (res.capabilities || []).filter((row) => row.enabled), () => []),
    api("/methods").then((res) => res.methods || [], () => [])]).then(([capabilities, methods]) => { rows = { capabilities, methods }; rowsIn = true; });
  compose.addEventListener("focusin", () => void readCatalog());
  compose.addEventListener("pointerenter", () => void readCatalog());
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
    ...startersFor().map((starter) => ({ slash: L("开始"), label: starter.label + (starter.kind ? " · " + starter.kind : ""), ...(starter.hint ? { hint: starter.hint } : {}),
      run: () => { if (useStarter(starter)) input.focus(); } })),
    ...rows.methods.map((row) => {
      const title = L(row.kind === "role" ? "角色资料" : "方法") + "：" + row.name;
      return { slash: L(row.kind === "role" ? "角色资料" : "方法"), label: row.name + " · " + row.plugin_title, hint: row.summary || row.name, run: choose({ kind: "method", title,
        method: { method_id: row.method_id, version: row.version, ...(row.default_ref ? { default_ref: row.default_ref, installation: row.installation } : {}) } },
        (file) => file.method.method_id === row.method_id && file.method.installation?.install_id === row.installation?.install_id) };
    }),
    ...rows.capabilities.map((row) => {
      const title = row.provider + " · " + row.title;
      return { slash: L("用"), label: title, hint: row.description || title, run: choose({ kind: "capability", title: L("用") + "：" + title,
        capability: { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, title } }, (file) => file.capability.capability_id === row.capability_id) };
    }),
    ...(project && document.documentElement.dataset.knowledgePicker === "1" ? [{ slash: L("资料"), label: L("选择项目资料…"), hint: L("可多选，读原文给助理"),
      run: () => document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: { request_id: "assistant:" + crypto.randomUUID(), max: 10 } })) }] : []),
  ];
  /** Who the next Send goes to: the work in front, named by its place first when that is not this page (#1919); else a new work. */
  const receiverNow = () => {
    const work = getWork();
    if (!work) return { open: openConversation, label: nextExec !== "assistant" && executorOffer(nextExec) ? executorOffer(nextExec).title : L("助理") };
    const where = work.scope?.project_id !== project?.id ? scopeLabel(work.scope, work.scope_title) : "";
    return { open: openConversation, label: work.reply_target ? L("原评论：{title}", { title: work.reply_target.title }) : (where ? where + " · " : "") + work.title,
      reset: () => { void switchTo(null); input.focus(); }, resetLabel: L("改为开始新工作") };
  };
  /* The choices that are the next Send's, in the bar only once they differ from the default and while the side pane, where they
     are chosen, is not shown: what the Send does while the turn waits on its question, who carries a new work, the plugin
     session's mode, the Character. */
  const controlsNow = () => {
    const work = getWork(), list = [], asking = receipts.choices();
    if (asking) list.push({ kind: "select", id: "answer", label: L("这次发送"), options: asking.options.map((one) => ({ value: one, label: L(receipts.label(one)) })), value: asking.value,
      change: (value) => { receipts.choose(value); syncComposer(); } });
    // With the side pane shown, its summary (「谁来做」「方式」, the Character) is where these are chosen, as before K3: one place for
    // each choice, so the composer does not repeat them (implementation-plan §3.2's 「更多」 is the narrow composer's fold, not this).
    if (island.hasAttribute("data-side-shown")) return list;
    if (!work && executorsHere() && nextExec !== "assistant") list.push({ kind: "select", id: "executor", label: L("由谁来做"),
      options: executorChoices().map((one) => ({ value: one.id, label: L(one.label) + (one.id === nextExec && executorSession(one.id) ? " · " + L("当前会话") : "") })), value: nextExec,
      change: (value) => { nextExec = value; nextMode = ""; if (value !== "assistant") nextChar = null; paintAim(); paintSum(); } });
    // A new work that continues a session open on the page runs in that session's own mode, shown once it is the work's.
    const offer = modeOffer();
    if (offer && offer.modes.length && (work || !executorSession(nextExec))) list.push({ kind: "select", id: "mode", label: L(work ? "下一轮的方式" : "第一轮的方式"),
      options: modeRows(offer).map((mode) => ({ value: mode.id, label: mode.label })), value: work ? work.executor.mode || offer.default_mode : nextMode || offer.default_mode,
      change: (value) => void applyMode(value) });
    const chosen = chosenCharacter();
    if (allowsCharacter() && chosen) {
      const key = (ref) => ref.artifact_id + "@" + ref.version, choices = (characterChoices() || []).filter((one) => one.available && key(one.reference) !== key(chosen));
      list.push({ kind: "select", id: "character", label: L("由哪个角色负责"), value: key(chosen),
        options: [{ value: "", label: L("助理自己") }, { value: key(chosen), label: chosen.title }, ...choices.map((one) => ({ value: key(one.reference), label: one.title }))],
        change: (value) => {
          const one = (characterChoices() || []).find((choice) => key(choice.reference) === value), next = value === key(chosen) ? chosen : one ? { artifact_id: one.reference.artifact_id, version: one.reference.version, title: one.title } : null;
          if (getWork()) pendingChar = next; else nextChar = next;
          paintAim(); paintSum();
        } });
    }
    return list;
  };
  const deliveryNow = () => {
    // An answer goes to the question, and words for the questionnaire into its draft: neither reaches the turn as a supplement.
    const why = receipts.target() === "answer" || receipts.into() ? { available: false, reason: L("这次发送是回答上面的问题；改成「补充这一轮」才能选") } : { available: true };
    return { "next-boundary": { available: true }, interrupt: why, "after-run": why };
  };
  let composer = null, mountedFor = null, draftHere = null, painted = "", sending = 0, handedOver = false, inFlight = null;
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
  const shown = () => JSON.stringify([receiverNow().label, Boolean(getWork()), controlsNow().map((one) => [one.id, one.value, one.options])]);
  const mountComposer = () => {
    mountedFor = curId || scoped("new-draft"); draftHere = draftFor(curId); painted = shown();
    composer = window.molisComposer(compose, { kind: "ai", entry: "assistant", labels: words, draft: { adapter: draftHere },
      receiver: receiverNow, delivery: deliveryNow, get controls() { return controlsNow(); }, get commands() { return commands(); },
      attachments: { accept: upload.accept, upload: (file) => upload.upload(file) }, onMaterials: () => paintMats(),
      near: () => { const page = pageObject(); return page ? { kind: page.object.kind, id: page.object.id, plugin_id: page.context.plugin_id } : null; },
      required: () => getWork()?.reply_target ? L("请回到原评论继续回复") : !String(input.value || "").trim() ? L("写一句话再发") : null,
      stop: () => control("stop"),
      submit: sendNow });
    const work = getWork(); composer.setRunning(Boolean(work && isLive(work.state)));
  };
  /** Keeps the composer on the receiver in front; redrawn only when what it shows changed, so a poll never closes its menu. */
  function syncComposer() {
    if (!window.molisComposer) return;
    // The person opened another receiver: the composer moves now, even with a Send on its way (its outcome is the Host's and the
    // thread's). A new work's first Send moving it to that work waits until the composer has settled the Send.
    if (mountedFor !== (curId || scoped("new-draft")) && !(sending && handedOver)) {
      // Destroy flushes captured edits, including typing before the shared script arrived.
      composer?.destroy();
      handedOver = false;
      return mountComposer();
    }
    if (sending) return;
    const work = getWork(); composer.setRunning(Boolean(work && isLive(work.state)));
    const now = shown();
    if (now !== painted) { painted = now; composer.refresh(); }
  }
  const asOutcome = (res, id) => res.consumed === false ? { state: "failed", message: L("已核对原发送；这里的草稿还没发出") } : ({ state: "sent", ...(res.elsewhere ? { elsewhere: true } : {}),...(res.outcome === "repeated" || res.outcome === "queued" ? { receipt: { input_id: "send." + id, replayed: res.outcome === "repeated", delivered: res.outcome === "queued" ? "queued" : "run" } } : {}) });
  async function submit(sent, before) {
    const text = sent.text.trim(), into = curId && receipts.into(), fill = into && fills.get(into.pending_id);
    if (fill && sent.materials.length) return { state: "failed", message: L("问卷这里只能写文字；请移除附件，或改为补充这一轮") };
    if (fill) return Promise.resolve(before).then(revision => fill(into.draft_from_composer, text, revision)).then(() => { host.showToast?.(L("已写进问卷；按「提交回答」才交回")); return { state: "sent" }; }, (error) => ({ state: "failed", message: error.message }));
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
  function addFiles(chosen) { composer?.attach(chosen); }
  stripPending = () => (composer ? composer.materials() : []).map((one) => ({ kind: one.kind === "attachment" ? (upload.material(one.ref) || {}).kind || "file" : "object", title: one.title }));
  function pickFile() { compose.querySelector("[data-composer-add]")?.click(); }
  /* The conversation behind the receiver: its name on the receiver row opens it, and so does ⌘↵ on an empty box (the work in front,
     or the list of works when a new one is next and there are others). */
  const openConversation = () => {
    if (getWork()) { setPanel(true); reload().then(poll); return true; }
    if (works.length) { setPanel(true); setWorks(true); return true; }
    return false;
  };
  compose.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    if (!event.target.matches?.(".mw-composer__input") || String(event.target.value || "").trim() || compose.querySelector(".mw-composer__files")) return;
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
