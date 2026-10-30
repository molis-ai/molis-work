import { ASSISTANT_REPLY_KIND } from "@molis-ai/molis-work-contracts/services/contextual";

/** The conversation: opening a thing, copying, questions, confirmations, operation cards, material chips, drawing each round and following the scroll. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_CONVERSATION_PART = String.raw`  /* ─── Showing a thing: the side panel previews it when it is there, otherwise it opens where it lives ─── */
  // The side panel claims the request (preventDefault); unclaimed, the object opens in its own surface as before.
  const sidePanelHere = () => document.body.hasAttribute("data-side-open");
  const sidePreview = (target) => !document.dispatchEvent(new CustomEvent("molis:side-open", { detail: { tab: "files", target, focus: false }, cancelable: true }));
  // Where it cannot open in place (the project chooser has no tabs), an item opens on its project's page.
  const openOnItsPage = (open, title, where) => { const url = new URL("/projects/" + encodeURIComponent(where) + "/", location.origin), desktop = new URLSearchParams(location.search).get("desktop");
    url.searchParams.set("openPlugin", open.surface); url.searchParams.set("openItem", open.id); url.searchParams.set("openTitle", title); if (desktop) url.searchParams.set("desktop", desktop); location.assign(url.pathname + url.search); };
  const showObject = (object) => {
    if (sidePreview({ subject: object.subject, title: object.title, open: object.open })) return;
    if (object.open && host.openItem) host.openItem(object.open.surface, object.open.id, object.title); else if (object.open) openOnItsPage(object.open, object.title, (view && view.work.scope.project_id) || "personal");
  };

  /* The Host draws text and code from raw words; only reading interactions live here. A copy answers on its button through
     the design system's one copy feedback; a refusal also says how to copy by hand. */
  const copyFrom = (button, text) => window.molisCopy?.(button, text, { done: L("已复制"), failed: L("复制失败") }).then((copied) => { if (!copied) host.showToast?.(L("没能复制，请手动选中文字")); });
  const bindText = (root) => {
    root.querySelectorAll(".assistant-code:not([data-bound])").forEach((figure) => {
      figure.dataset.bound = ""; const copy = figure.querySelector(".assistant-code-copy");
      copy.addEventListener("click", () => copyFrom(copy, () => figure.dataset.code));
      bindMore(figure); if (figure.dataset.paint) paintCode(figure);
    });
    root.querySelectorAll("[data-assistant-object]:not([data-bound])").forEach((button) => {
      button.dataset.bound = ""; const object = view.objects[Number(button.dataset.assistantObject)];
      if (!object || !host.openItem) { button.replaceWith(document.createTextNode("「" + button.textContent + "」")); return; }
      button.prepend(glyph(objectGlyph(object)));
      button.addEventListener("click", () => showObject(object));
    });
  };

  /* ─── Rendering, updated in place so reading and focus are never disturbed ─ */
  let follow = null; const scrollOwner = () => follow ||= window.molisFollow?.(thread, { onChange: () => paintJump() }), nearBottom = () => scrollOwner()?.state !== "detached";
  const keyed = (parent, attribute, key, create) => {
    let node = [...parent.children].find((child) => child.getAttribute(attribute) === key);
    if (!node) { node = create(); node.setAttribute(attribute, key); parent.append(node); }
    return node;
  };
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  /* Questions, action cards and next steps come drawn by the Host (in the person's language); the page binds them with the
     shared client. A node is redrawn only when its key changes, so what the person is typing stays put. */
  const ixClient = host.interaction, fills = new Map(); // fills: words from the composer into a card's draft (R4, assistant-send.ts)
  const drawn = (node, html, handlers, key = html) => {
    if (node.ixKey === key) return node.ix;
    node.ix?.destroy(); node.innerHTML = html || ""; node.ixKey = key;
    node.ix = ixClient(node, handlers); node.ixBase = JSON.stringify(node.ix.read());
    return node.ix;
  };
  const renderQuestion = (card, work, round, question) => {
    const path = "/works/" + encodeURIComponent(work.work_id), held = () => ({ pending_id: question.pending_id, values: client.read() }); let saving = 0;
    const client = drawn(card, question.html, {
      onAction: () => reaskQuestion(work, round, question),
      // A half-written answer is kept with the work, so a reload or another tab finds it.
      onChange: () => { clearTimeout(saving); saving = setTimeout(() => api(path + "/question-draft", "POST", held()).catch(() => undefined), 600); },
      onSubmit: async () => {
        const button = card.querySelector("[type=submit]"); if (!button || button.dataset.loading !== undefined) return;
        clearTimeout(saving); button.disabled = true; button.dataset.loading = ""; button.prepend(Object.assign(el("span", "mw-spinner"), { ariaHidden: "true" }));
        try { view = await api(path + "/answer", "POST", { ...held(), run_id: round.run_id, pending_revision: question.pending_revision }); render(); poll(); }
        catch (error) { if (error.body?.details?.errors) client.showErrors(error.body.details.errors, { focus: true }); else showError(error); }
        finally { button.disabled = false; delete button.dataset.loading; button.querySelector(".mw-spinner")?.remove(); }
      },
    }, question.pending_id + question.pending_revision + question.answerable);
    fills.set(question.pending_id, (field, text) => { const now = client.read()[field]; client.write({ [field]: now ? now + " " + text : text }); clearTimeout(saving); return api(path + "/question-draft", "POST", held()); });
  };
  const renderReview = (card, work, review) => {
    card.innerHTML = review.html;
    card.querySelectorAll("[data-assistant-review-glyph]").forEach((node) => node.replaceWith(glyph(node.dataset.assistantReviewGlyph)));
    bindText(card);
    const row = card.querySelector(".assistant-card-actions");
    const decide = async (decision) => {
      row.querySelectorAll("button").forEach((one) => { one.disabled = true; });
      try { view = await api("/works/" + encodeURIComponent(work.work_id) + "/reviews/" + encodeURIComponent(review.review_id), "POST", { decision }); render(); poll(); }
      catch (error) { showError(error); row.querySelectorAll("button").forEach((one) => { one.disabled = false; }); }
    };
    row.querySelectorAll("[data-assistant-decision]").forEach((button) => button.addEventListener("click", () => decide(button.dataset.assistantDecision)));
  };
  const renderCard = (node, work, card) => {
    node.dataset.status = card.status;
    const client = drawn(node, card.html, { onAction: async (id, button) => {
      // Keyboard use keeps its place: after the card redraws, focus lands on it rather than the page.
      const hadFocus = node.contains(document.activeElement), neighbour = node.nextElementSibling || node.previousElementSibling;
      const lock = (on) => node.querySelectorAll("[data-ix-action]").forEach((one) => { one.disabled = on; });
      lock(true);
      try {
        // "redo" only asks: the Assistant re-reads and offers a fresh card; nothing runs in this one's place.
        const next = await api("/works/" + encodeURIComponent(work.work_id) + "/cards/" + encodeURIComponent(card.card_id) + "/" + id, "POST", id === "run" ? { revision: card.revision, values: client.read() } : {});
        if (id === "redo") { await reload(); poll(); return; }
        if (view && view.work.work_id === work.work_id) view.cards = view.cards.map((one) => one.card_id === next.card_id ? next : one);
        if (next.status === "done") window.dispatchEvent(new CustomEvent("molis:assistant-effect", { detail: { work_id: work.work_id, capability_id: next.capability_id } }));
        // The next steps are the Host's: read the work again so a card that ran is no longer offered (FLOW-04).
        render(); void reload();
        // A card set aside leaves the list: focus moves to the next card, or back to the input when none is left.
        if (hadFocus) (node.isConnected ? node.querySelector("[data-ix-action], [data-ix-operation]") : (neighbour && neighbour.isConnected && neighbour.querySelector("button")) || input)?.focus();
      } catch (error) { showError(error); lock(false); if (hadFocus) button.focus(); }
    } });
  };
  /** A card no round proposed: a page put it in (it names the page in from), or its round is not one of this work's. */
  const pageCard = (card) => Boolean(card.from) || !card.run_id || !(view && view.rounds.some((round) => round.run_id === card.run_id));
  // Both round cards and page cards use the same Host-drawn view without deleting chronological siblings.
  const placeCard = (parent, work, card, put) => {
    const node = keyed(parent, "data-card", card.card_id, () => el("div"));
    renderCard(node, work, card);
    (put || ((one) => parent.append(one)))(node);
  };
  const renderCards = (parent, work, cards, put) => {
    const shown = cards.filter((card) => card.status !== "dismissed");
    [...parent.children].forEach((child) => { if (child.dataset.card && !shown.some((card) => card.card_id === child.dataset.card)) child.remove(); });
    shown.forEach((card) => placeCard(parent, work, card, put));
  };
  const FILE_GLYPH = [[/\.(png|jpe?g|gif|webp|heic|svg)$/i, "image"], [/\.(csv|tsv|xlsx?)$/i, "database"], [/\.(md|markdown|txt|log)$/i, "note"],
    [/\.(js|mjs|ts|tsx|py|json|ya?ml|html?|css|sh|go|rs|java|c|cpp|sql)$/i, "code"]];
  /**
   * Words the work keeps but the view leaves out (a page handed over from the side panel's browser, a pasted text, a
   * selection): read back when clicked and shown in the side panel as they were given, with the page they came from.
   */
  const readBack = (material, title) => {
    const workId = view && view.work && view.work.work_id;
    if (!workId || !material.material_id || !sidePanelHere() || !["text", "file", "selection"].includes(material.kind)) return null;
    return async () => {
      try {
        const { material: full } = await api("/works/" + encodeURIComponent(workId) + "/materials/" + encodeURIComponent(material.material_id));
        if (typeof full.text !== "string") { host.showToast?.(L("这份材料没有可以预览的正文")); return; }
        sidePreview({ preview: { title, media_type: "text/plain", text: full.text, truncated: Boolean(full.truncated), ...(full.url ? { source_url: full.url } : {}) } });
      } catch (error) { host.showToast?.(error, true); }
    };
  };
  /** A picture the work carried, shown in the side panel; one the app no longer holds (it restarted) is marked, not offered. */
  const readImage = (material, title) => {
    const workId = view && view.work && view.work.work_id;
    if (!workId || material.kind !== "image" || !material.material_id || material.expired || !sidePanelHere()) return null;
    return async () => {
      try {
        const { image } = await api("/works/" + encodeURIComponent(workId) + "/materials/" + encodeURIComponent(material.material_id) + "/image");
        sidePreview({ preview: { title, media_type: image.media_type, url: "data:" + image.media_type + ";base64," + image.data } });
      } catch (error) { host.showToast?.(error, true); }
    };
  };
  const EXPIRED_IMAGE = "应用重启后图片不再保留；需要时请重新添加这张图片";
  /** One thing a message carried: its kind at a glance, its name; an object opens where it lives. */
  const attachmentChip = (material) => {
    const title = String(material.title || "").replace(/^(图片|方法|用|引用)：/, "");
    const icon = material.kind === "image" ? "image" : material.kind === "method" || material.kind === "capability" ? "zap" : material.kind === "selection" || material.kind === "text" ? "text"
      : material.object ? kindGlyph(material.object.kind + " " + (material.source ? material.source.surface : "")) : (FILE_GLYPH.find(([pattern]) => pattern.test(title.replace(/（\d+ 页）$/, ""))) || [null, "file"])[1];
    const surf = material.source && material.source.surface && material.source.surface !== "page" ? material.source.surface : "";
    const named = material.object && surf ? { subject: { kind: material.object.kind, id: material.object.id }, title: material.object.title || title, open: { surface:surf, id: material.object.id } } : null;
    // A file's or a page's own words can only be previewed in the side panel; there is nowhere else to open them.
    const open = named ? () => showObject(named)
      : material.kind === "file" && material.text && sidePanelHere() ? () => { sidePreview({ preview: { title, media_type: "text/plain", text: material.text } }); }
      : readBack(material, title) || readImage(material, title);
    const chip = el(open ? "button" : "span", "assistant-attachment" + (material.draft ? " is-draft" : ""));
    if (open) { chip.type = "button"; chip.addEventListener("click", open); chip.setAttribute("aria-label", L("打开") + "：" + title); }
    chip.append(glyph(icon), el("span", "assistant-attachment-name", title + (material.draft ? L("（草稿）") : "") + (material.expired ? L("（已失效）") : "")));
    if (MATERIAL_KIND[material.kind]) chip.title = L(MATERIAL_KIND[material.kind]);
    if (material.expired) { chip.classList.add("is-expired"); chip.title = L(EXPIRED_IMAGE); }
    return chip;
  };
  const renderRound = (work, round) => {
    const node = keyed(thread, "data-round", round.run_id, () => el("section", "assistant-round"));
    const put = placer(node);
    // A later round begins with when it began, so a long work reads as a sequence of sittings.
    if (view && view.rounds.indexOf(round) > 0) {
      const stamp = keyed(node, "data-entry", "time", () => el("p", "assistant-round-time"));
      setText(stamp, when(round.started_at));
      put(stamp);
    }
    const entries = [];
    round.turns.forEach((turn, index) => entries.push({ key: "t:" + turn.turn_id, order: turn.sequence ?? index, turn }));
    const stepsShown = Boolean(round.steps && round.steps.length);
    round.activity.forEach((item, index) => { if (!(stepsShown && item.verb === "todo")) entries.push({ key: "a:" + item.call_id, order: item.sequence ?? (1000 + index), item }); });
    entries.sort((a, b) => a.order - b.order);
    // Which Agent ran this round, when the work changed hands.
    if (round.executor === "plugin") { const tag = keyed(node, "data-entry", "executor", () => el("p", "assistant-round-executor")); const carrier = getWork(); setText(tag, carrier && carrier.executor.kind === "plugin" ? L("由 {name} 执行", { name: carrier.executor.title }) : L("由执行方插件执行")); put(tag); }
    else if (round.character) { const tag = keyed(node, "data-entry", "executor", () => el("p", "assistant-round-executor")); setText(tag, L("由角色负责") + "：" + round.character.title + " v" + round.character.version); put(tag); }
    // What this round carried reads as a line under the person's own message; the side pane keeps the full list.
    let carried = null;
    if (round.materials && round.materials.length) {
      carried = keyed(node, "data-entry", "materials", () => el("div", "assistant-attachments"));
      const signature = JSON.stringify(round.materials.map((material) => [material.material_id, material.title, material.draft]));
      if (carried.dataset.signature !== signature) { carried.dataset.signature = signature; carried.replaceChildren(...round.materials.map(attachmentChip)); }
    }
    if (!round.turns.some((turn) => turn.kind === "user")) {
      const own = keyed(node, "data-entry", "task", () => el("div", "assistant-msg assistant-msg--user"));
      setText(own, round.text);
      put(own);
      if (carried) { put(carried); carried = null; }
    } else node.querySelector(':scope > [data-entry="task"]')?.remove();
    // The steps between two messages read as one quiet line that opens to each step (assistant-process.ts). A single step stays a line of its own.
    let run = [], anchor = "start";
    const flush = () => { if (run.length) proc.place(node, run, put, anchor); run = []; };
    entries.forEach((entry) => {
      if (entry.turn) {
        flush(); anchor = entry.key;
        const turn = entry.turn;
        // Words the Host wrote (a timed round, a work going on when its sub-tasks came back) are not shown as the person's; a supplement is the person's, whoever wrote the round.
        const kind = turn.kind === "user" ? (round.written_by === "host" && !turn.steer ? "host" : "user") : turn.kind === "assistant" ? "assistant" : "note";
        const bubble = keyed(node, "data-entry", entry.key, () => el("div", "assistant-msg assistant-msg--" + kind));
        // A reply is the Assistant's own object: what the person selects in it is in hand, named by the work it belongs to.
        const reply = kind === "assistant" && JSON.stringify({ plugin_id: "assistant", object: { kind: ${JSON.stringify(ASSISTANT_REPLY_KIND)}, id: work.work_id + ":" + round.run_id + ":" + turn.turn_id, title: work.title } });
        if (reply && bubble.getAttribute("data-assistant-context") !== reply) bubble.setAttribute("data-assistant-context", reply);
        if (bubble.dataset.text !== turn.text) {
          const had = bubble.dataset.text !== undefined; bubble.dataset.text = turn.text; // Only a reply still being written, seen arriving, shows its new words come in: never a reopen, a hidden page or the last update.
          if (kind === "assistant") { if (window.molisStreamText) window.molisStreamText(bubble, turn.html, { reveal: had && work.state === "running" && !document.hidden, grow: growCode }); else bubble.innerHTML = turn.html; bindText(bubble); } else bubble.textContent = turn.text;
        }
        put(bubble); receipts.line(thread, node, put, turn, round);
        if (kind === "assistant") {
          const copy = keyed(node, "data-entry", "copy:" + turn.turn_id, () => {
            const btnEl = el("button", "assistant-copy", L("复制")); btnEl.type = "button";
            btnEl.addEventListener("click", () => copyFrom(btnEl, () => bubble.dataset.text || ""));
            return btnEl;
          });
          put(copy);
        }
        // A long message of the person's folds after a few lines; the whole of it is one click away.
        if (kind === "user" && (turn.text.length > 240 || turn.text.split("\n").length > 6)) {
          if (!bubble.hasAttribute("data-unfolded")) bubble.setAttribute("data-folded", "");
          const more = keyed(node, "data-entry", "fold:" + turn.turn_id, () => {
            const btnEl = el("button", "assistant-msg-more"); btnEl.type = "button";
            btnEl.addEventListener("click", () => {
              const folded = bubble.hasAttribute("data-folded");
              bubble.toggleAttribute("data-folded", !folded); bubble.toggleAttribute("data-unfolded", folded);
              btnEl.textContent = folded ? L("收起") : L("展开全文");
            });
            return btnEl;
          });
          if (!more.textContent) more.textContent = bubble.hasAttribute("data-folded") ? L("展开全文") : L("收起");
          put(more);
        }
        if ((kind === "user" || kind === "host") && carried) { put(carried); carried = null; }
      } else run.push(entry.item);
    });
    flush(); proc.sweep(node);
    if (carried) put(carried);
    proc.memory(node, round.memories_used, put);
    const status = keyed(node, "data-entry", "status", () => el("p", "assistant-round-status")), phase = round.phase;
    status.dataset.phase = phase; status.dataset.mwState = ({starting:'starting',running:'running',compacting:'running',failed:'failed',stopped:'stopped',cancelled:'cancelled',paused:'paused','reconcile-required':'verify',unknown:'verify'})[phase] || 'idle';
    const ownStop = round.stop_reason && round.stop_reason !== "已停止" ? round.stop_reason : "";
    const retry = (phase === "running" || phase === "starting") && round.retry_wait ? round.retry_wait : null; retries.mark(status, retry);
    setText(status, retry ? retries.line(status) : phase === "running" || phase === "starting" || phase === "compacting" ? L("正在处理…")
      : phase === "failed" ? L("这一轮没有完成") + (round.stop_reason ? "：" + round.stop_reason : "")
      : phase === "stopped" || phase === "cancelled" ? (ownStop || L("这一轮已停止，已经发生的操作不会被撤回"))
      : phase === "paused" ? L("已暂停，点“继续”接着做")
      : phase === "reconcile-required" ? L("有操作的结果还没确认，请先核对")
      : phase === "unknown" ? L("这一轮的执行记录读不到，结果需要核对") : "");
    status.hidden = !status.textContent;
    put(status);
    const questions = round.awaiting_input || [];
    [...node.children].forEach((card) => { if (card.dataset.question && !questions.some((q) => q.pending_id === card.dataset.question)) card.remove(); });
    questions.forEach((question) => {
      const card = keyed(node, "data-question", question.pending_id, () => el("div"));
      renderQuestion(card, work, round, question);
      put(card);
    });
    renderCards(node, work, ((view && view.cards) || []).filter((card) => card.run_id === round.run_id && !pageCard(card)), put);
    return node;
  };`;
