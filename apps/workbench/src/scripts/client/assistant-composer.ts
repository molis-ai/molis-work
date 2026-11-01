import { ASSISTANT_MENTION_FACTORY_SCRIPT } from "./assistant-mention.js";

/** The input's menus: starting points, / for abilities and methods, @ for references, closing the pop-ups, More, and choosing, pasting or dropping files. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
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
  // A plain question fills the input; an offered action runs through the row, and nothing is typed for it.
  const useStarter = (starter) => {
    if (starter.key) {
      document.dispatchEvent(new CustomEvent("molis:assistant-starter-choose", { detail: { object_key: starter.object_key, key: starter.key } }));
      return false;
    }
    input.value = starter.prompt; typed = true; syncSend(); saveDraft(false);
    return true;
  };
  const starterLabel = (starter) => starter.label + (starter.kind ? " · " + starter.kind : "");
  /* “/”: pick a capability this work may really use now (or one of this page's starters); nothing runs by picking. */
  let capabilityRows = null;
  const loadCapabilityRows = async () => {
    if (capabilityRows) return capabilityRows;
    try { capabilityRows = ((await api("/capabilities")).capabilities || []).filter((row) => row.enabled); } catch { capabilityRows = []; }
    return capabilityRows;
  };
  let methodRows = null, slashSeq = 0;
  const loadMethodRows = async () => {
    if (methodRows) return methodRows;
    try { methodRows = (await api("/methods")).methods || []; } catch { methodRows = []; }
    return methodRows;
  };
  const slashOpen = () => startPop && !startPop.hidden && startPop.dataset.mode === "slash";
  async function setSlash(query) {
    if (!startPop) return;
    const q = String(query || "").trim().toLowerCase(), mine = ++slashSeq;
    const starters = startersFor().filter((starter) => !q || starter.label.toLowerCase().includes(q));
    const rows = (await loadCapabilityRows()).filter((row) => !q || [row.title, row.provider, row.description].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 8);
    const methods = (await loadMethodRows()).filter((row) => !q || [row.name, row.plugin_title, row.summary].some((text) => String(text || "").toLowerCase().includes(q))).slice(0, 5);
    if (mine !== slashSeq || !String(input.value || "").startsWith("/")) return;
    startPop.dataset.mode = "slash";
    startPop.hidden = false;
    startPop.replaceChildren(el("p", "assistant-popover-title", L("用一个方法或能力，或这样开始")));
    starters.forEach((starter) => {
      const btnEl = el("button", "assistant-starter", starterLabel(starter)); btnEl.type = "button";
      if (starter.hint) btnEl.title = starter.hint;
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", () => {
        if (starter.key) { input.value = slashDraft || ""; slashDraft = null; syncSend(); saveDraft(false); }
        closeSlash();
        if (useStarter(starter)) input.focus();
      });
      startPop.append(btnEl);
    });
    // A method (how to do it) or a capability (what to use), chosen here, goes with this round only, once.
    const pick = (label, hint, prefix, same, material) => {
      const btnEl = el("button", "assistant-starter", label); btnEl.type = "button";
      btnEl.title = hint;
      btnEl.addEventListener("mousedown", (event) => event.preventDefault());
      btnEl.addEventListener("click", () => {
        if (!files.some((file) => file.kind === material.kind && same(file))) files.push({ material_id: prefix + crypto.randomUUID(), explicit: true, ...material });
        input.value = slashDraft || ""; slashDraft = null; typed = true; syncSend(); saveDraft(false); closeSlash(); paintMats(); input.focus();
      });
      startPop.append(btnEl);
    };
    methods.forEach((row) => {
      const label = L(row.kind === "role" ? "角色资料" : "方法") + "：" + row.name;
      pick(label + " · " + row.plugin_title, row.summary || row.name, "method-",
        (file) => file.method.method_id === row.method_id && file.method.installation?.install_id === row.installation?.install_id,
        { kind: "method", title: label, method: { method_id: row.method_id, version: row.version, ...(row.default_ref ? { default_ref: row.default_ref, installation: row.installation } : {}) } });
    });
    rows.forEach((row) => {
      const title = row.provider + " · " + row.title;
      pick(L("用") + "：" + title, row.description || title, "cap-", (file) => file.capability.capability_id === row.capability_id,
        { kind: "capability", title: L("用") + "：" + title, capability: { capability_id: row.capability_id, version: row.version, provider_id: row.provider_id, title } });
    });
    if (!starters.length && !rows.length && !methods.length) startPop.append(el("p", "assistant-material-origin", L("没有匹配的能力；换个词，或直接说要做什么")));
  }
  function closeSlash() { if (startPop && startPop.dataset.mode === "slash") { delete startPop.dataset.mode; startPop.hidden = true; } }
  /* “@”: the system search's hits, brought along as references (assistant-mention.ts). */
  const mention = (${ASSISTANT_MENTION_FACTORY_SCRIPT})({ L, el, pop: startPop, field: input,
    search: (query) => molisWorkRequest(host.route("/api/search/query"), { body: { query, scope: "all", limit: 8 }, fallback: L("搜索暂时不可用，请稍后重试") }),
    pick: (hit) => {
      if (!files.some((file) => file.reference && file.object && file.object.kind === hit.subject.kind && file.object.id === hit.subject.id)) {
        files.push({ material_id: "ref-" + crypto.randomUUID(), kind: "object", title: hit.title, explicit: true, reference: { hit_id: hit.hit_id },
          object: { kind: hit.subject.kind, id: hit.subject.id, title: hit.title }, source: { surface: (hit.open && hit.open.surface) || hit.plugin_id, plugin_id: hit.plugin_id, title: hit.plugin_title },
          text: hit.snippet || "" });
      }
      typed = true; syncSend(); saveDraft(false); paintMats();
    } });
  const mentionOpen = mention.isOpen, mentionAt = mention.at;
  function closeMention() { mention.close(); }
  function setMention(found) { mention.open(found); }
  function closeStarts() { if (startPop) { delete startPop.dataset.mode; startPop.hidden = true; } }
  input.addEventListener("blur", () => setTimeout(() => { if (!island.contains(document.activeElement) || document.activeElement === input) return; closeStarts(); }, 0));
  // What opens from the island, and the button focus returns to.
  const popovers = () => [[workNav, setWorks, worksToggle], [morePop, setMore, attach], [execsPop, setExecs, execBtn], [modesPop, setModes, modeButton], [charsPop, setChars, charBtn], [noticePop, setNotices, noticeBtn]];
  document.addEventListener("pointerdown", (event) => {
    if (event.target?.nodeType !== 1 || island.contains(event.target)) return;
    closeStarts(); for (const [pop, close] of popovers()) if (pop && !pop.hidden) close(false);
  });
  island.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const stop = () => { event.preventDefault(); event.stopPropagation(); }, put = ([pop, close, btnEl]) => pop && !pop.hidden && (stop(), close(false), (visible(btnEl) ? btnEl : attach)?.focus(), true);
    const [worksOpen, moreOpen, ...choosers] = popovers();
    if (put(worksOpen)) return;
    if (panel && !panel.hidden && !spacious() && drawerOpen) { stop(); drawerOpen = false; paintLayout(); sideToggle?.focus(); return; }
    if (put(moreOpen)) return;
    if (startPop && !startPop.hidden) { stop(); closeStarts(); }
    choosers.forEach(put);
  }, true);
  /* Files the person adds, picked, pasted or dropped: one path (assistant-attachments.ts). */
  function addFiles(chosen) { return attachments.add(chosen); }
  const morePop = island.querySelector("[data-assistant-more]");
  const moreItem = (label, value, run) => {
    const row = el("button", "assistant-more-item"); row.type = "button";
    row.append(el("span", "assistant-more-label", label));
    if (value) row.append(el("span", "assistant-more-value", value));
    row.addEventListener("click", run);
    return row;
  };
  /** Starts “@” or “/” in the input as if typed; words already there wait aside while “/” picks, and come back after. */
  let slashDraft = null;
  const insertTrigger = (mark) => {
    const value = String(input.value || "");
    if (mark === "/") { if (value.trim() && !value.startsWith("/")) slashDraft = value; input.value = "/"; }
    else input.value = value + (value && !/\s$/.test(value) ? " " : "") + mark;
    input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const paintMore = () => {
    if (!morePop) return;
    const rows = [...(compose.dataset.crowded === "chips" ? [noticeBtn] : []).filter((btnEl) => btnEl && !btnEl.hidden).map((btnEl) => moreItem(btnEl.title, btnEl.textContent.trim(), () => { setMore(false); btnEl.click(); })),
      moreItem(L("添加文件或图片…"), L("也可以拖入、粘贴"), () => { setMore(false); fileInput?.click(); }), ...(project && document.documentElement.dataset.knowledgePicker === "1" ? [moreItem(L("选择项目资料…"), L("可多选，读原文给助理"), () => { setMore(false); document.dispatchEvent(new CustomEvent("molis-work:knowledge-pick", { detail: { request_id: "assistant:" + crypto.randomUUID(), max: 10 } })); })] : []),
      moreItem(L("引用项目里的内容"), "@", () => { setMore(false); insertTrigger("@"); }),
      moreItem(L("用一个能力或方法"), "/", () => { setMore(false); insertTrigger("/"); })];
    morePop.replaceChildren(...rows);
  };
  function setMore(open) {
    if (!morePop) return;
    morePop.hidden = !open;
    attach?.setAttribute("aria-expanded", String(open));
    if (open) { closeStarts(); paintMore(); morePop.querySelector("button")?.focus(); }
  }
  attach?.addEventListener("click", () => setMore(Boolean(morePop && morePop.hidden)));
  fileInput?.addEventListener("change", () => {
    const chosen = [...(fileInput.files || [])];
    fileInput.value = "";
    void addFiles(chosen);
  });
  // A picture pasted or dropped on the composer is added the same way; pasted text stays text.
  const pastedName = (file) => file.name && file.name !== "image.png" ? file
    : new File([file], L("粘贴的图片") + "." + ((file.type.split("/")[1] || "png").replace("jpeg", "jpg")), { type: file.type });
  input.addEventListener("paste", (event) => {
    const pasted = [...(event.clipboardData?.files || [])];
    if (!pasted.length) return;
    event.preventDefault();
    void addFiles(pasted.map(pastedName));
  });
  compose?.addEventListener("dragover", (event) => { if ([...(event.dataTransfer?.types || [])].includes("Files")) event.preventDefault(); });
  if (compose) window.molisDropZone?.(compose, (on) => { if (on) compose.dataset.dropping = "true"; else delete compose.dataset.dropping; });
  compose?.addEventListener("drop", (event) => {
    const dropped = [...(event.dataTransfer?.files || [])];
    if (!dropped.length) return;
    event.preventDefault();
    void addFiles(dropped);
  });`;
