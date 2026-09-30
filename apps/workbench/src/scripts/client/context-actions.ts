/**
 * What can be done with what the person has in hand (specs/contextual-interaction §3, §4, §6.3): the row of actions
 * right above the Assistant input.
 *
 * A surface raises `molis:surface-focus` whenever its focus changes. The Host ranks the actions the directory offers
 * for it, by rules at once and by the judgment shortly after; the row shows them without moving what the person is
 * pointing at, and never shows a ranking for a context that is no longer current. A click hands the choice back to
 * the page that owns the object (`molis:assistant-context-action-chosen`), which prepares it through the Host and
 * shows a preview before anything is written. A split pane is its own document: it forwards its focus here and
 * receives the choice back.
 */
export const CONTEXT_ACTIONS_FACTORY_SCRIPT = String.raw`(host) => {
  const L = host.translate;
  const embedded = window.parent !== window && document.body.hasAttribute("data-pane-embedded");
  const ownPane = embedded ? new URL(location.href).searchParams.get("workbenchPane") || "pane" : "main";
  const post = (path, body, signal) => fetch(host.route(path), { method: "POST", headers: host.headers(), body: JSON.stringify(body), signal })
    .then(async (response) => {
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(value.error || L("暂时处理不了，请稍后重试")), { code: value.code });
      return value;
    });
  const requestId = () => (crypto.randomUUID ? crypto.randomUUID() : "cx-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  const quoted = (focus) => focus.targets.map((target) => target.text).join("\n\n").slice(0, 20000);
  const assistantDetail = (focus, text) => ({ new: true, text, source: { surface: focus.plugin_id, title: focus.object.title || "" },
    materials: [{ title: L("选中的内容") + (focus.object.title ? " · " + focus.object.title : ""), text: quoted(focus) }] });

  // In the document that owns the surface: hand the choice to the page. Nobody taking it means no page here can run
  // it yet; the Assistant then gets the words and the material, and the person sends it if they want.
  const deliver = (focus, candidate) => {
    const id = requestId();
    const event = new CustomEvent("molis:assistant-context-action-chosen", { cancelable: true, detail: {
      plugin_id: focus.plugin_id, context_id: focus.context_id, key: candidate.key, offer_id: candidate.offer_id,
      apply: candidate.apply, intent: candidate.intent, title: candidate.title,
      prepare: () => post("/api/contextual/prepare", { pane_id: ownPane, focus, key: candidate.key, request_id: id }),
    } });
    window.dispatchEvent(event);
    return event.defaultPrevented ? null : assistantDetail(focus, L("请帮我处理这段内容：") + candidate.title);
  };

  if (embedded) {
    let shown = null;
    document.addEventListener("molis:surface-focus", (event) => {
      shown = event.detail && typeof event.detail === "object" ? event.detail : null;
      parent.postMessage({ type: "workbench-surface-focus", focus: shown }, location.origin);
    });
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent || event.origin !== location.origin || !event.data || event.data.type !== "workbench-context-action-chosen") return;
      if (!shown || !event.data.candidate || event.data.context_id !== shown.context_id) return;
      const fallback = deliver(shown, event.data.candidate);
      if (fallback) parent.postMessage({ type: "workbench-assistant-open", detail: fallback }, location.origin);
    });
    window.addEventListener("pagehide", () => parent.postMessage({ type: "workbench-surface-focus", focus: null }, location.origin));
    return null;
  }

  const root = document.querySelector("[data-assistant-context-actions]");
  if (!root) return null;
  const el = (tag, attrs, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([name, value]) => {
      if (name === "class") node.className = value; else if (name === "text") node.textContent = value; else node.setAttribute(name, value);
    });
    children.forEach((child) => { if (child) node.append(child); });
    return node;
  };
  const live = el("div", { class: "context-actions-live", "aria-live": "polite" });
  document.body.append(live);
  const openAssistant = (detail) => document.dispatchEvent(new CustomEvent("molis:assistant-open", { detail }));
  const visible = (node) => Boolean(node && node.isConnected && node.getClientRects().length && !node.closest("[hidden]"));
  const SCOPE = { word: L("一个词"), range: L("一段文字"), block: L("这一段"), blocks: L("几段内容"), objects: L("几份内容") };
  const FORM = { suggest: L("有一条建议"), options: L("给你几个方向"), preview: L("可以先看预览"), compare: L("可以并排比较") };

  const bar = {
    buttons: new Map(),
    hover: new Set(),
    shown: null,
    plan: null,
    held: null,
    menu: null,
    announced: "",
    returnTo: null,
    pinned() {
      const keys = new Set(this.hover);
      const active = document.activeElement;
      if (active && root.contains(active) && active.dataset.key) keys.add(active.dataset.key);
      return [...keys];
    },
    interacting() { return root.matches(":hover") || root.contains(document.activeElement); },
    idle() {
      this.closeMenu(); this.plan = null; this.shown = null; this.held = null; this.hover.clear(); this.buttons.clear();
      root.dataset.state = "idle"; root.dataset.pending = "false"; root.replaceChildren();
    },
    // A new context: what is on the row belongs to the previous one, so it rests (and cannot be clicked) until the
    // candidates for this one arrive a moment later. Nothing shows when the row was empty.
    pending(focus) {
      this.closeMenu();
      if (root.dataset.state !== "active" || !root.querySelector(".context-actions-scope")) return;
      root.dataset.pending = "true";
      this.scope(focus);
    },
    error(error) {
      this.idle();
      root.dataset.state = "active";
      root.replaceChildren(el("div", { class: "context-actions-pill" }, el("span", { class: "context-actions-note", text: error.message || L("暂时处理不了，请稍后重试") })));
    },
    scope(focus) {
      const pill = root.querySelector(".context-actions-pill");
      const first = focus.targets[0];
      const where = focus.surroundings && focus.surroundings.heading_path.length ? focus.surroundings.heading_path[focus.surroundings.heading_path.length - 1] : "";
      const label = focus.activity === "editing" ? L("正在写的这段")
        : focus.activity === "completed" ? L("刚完成：") + (first ? first.text.slice(0, 12) : "")
        : focus.activity === "comparing" ? L("比较") + " " + focus.targets.length
        : focus.granularity === "word" ? "「" + (first ? first.text.slice(0, 10) : "") + "」"
        : (SCOPE[focus.granularity] || "") + (focus.granularity === "blocks" || focus.granularity === "objects" ? "（" + focus.targets.length + "）" : "") + (where ? " · " + where : "");
      let chip = pill.querySelector(".context-actions-scope");
      if (!chip) {
        const close = el("button", { type: "button", "aria-label": L("收起这些建议"), title: L("收起（这段内容不再推荐）") });
        close.innerHTML = '<svg aria-hidden="true"><use href="#icon-x"></use></svg>';
        close.addEventListener("click", () => { (this.plan ? this.plan.primary : []).forEach((key) => bus.dismiss(key)); this.idle(); });
        chip = el("span", { class: "context-actions-scope" }, el("span"), close);
        pill.prepend(chip);
      }
      chip.firstElementChild.textContent = label;
      chip.title = first ? first.text.slice(0, 120) : "";
    },
    render(out, focus, rulesOnly) {
      const draw = () => this.draw(out, focus, rulesOnly);
      // Never move what the person is pointing at or typing in: a same-context update waits until they leave the row.
      if (this.shown && this.shown.context_id === out.plan.context_id && this.interacting()) { this.held = draw; return; }
      draw();
    },
    release() { const held = this.held; this.held = null; if (held && !this.interacting()) held(); },
    draw(out, focus, rulesOnly) {
      const plan = out.plan;
      this.plan = plan;
      const available = plan.candidates.filter((item) => item.available);
      if (!available.length) { this.idle(); return; }
      root.dataset.state = "active";
      root.dataset.pending = "false";
      if (!root.querySelector(".context-actions-pill")) root.replaceChildren(el("div", { class: "context-actions-pill" }));
      const pill = root.querySelector(".context-actions-pill");
      const byKey = new Map(plan.candidates.map((item) => [item.key, item]));
      const owners = new Map();
      available.forEach((item) => owners.set(item.provider_title, (owners.get(item.provider_title) || 0) + 1));
      const owner = [...owners.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const sameContext = Boolean(this.shown && this.shown.context_id === plan.context_id);
      this.scope(focus);
      const next = [pill.querySelector(".context-actions-scope")];
      plan.primary.forEach((key, slot) => {
        const candidate = byKey.get(key);
        let button = this.buttons.get(key);
        if (!button) {
          button = el("button", { class: "context-action", type: "button", "data-key": key });
          button.addEventListener("click", () => choose(key));
          button.addEventListener("pointerenter", () => this.hover.add(key));
          button.addEventListener("pointerleave", () => this.hover.delete(key));
          this.buttons.set(key, button);
          if (sameContext) button.dataset.arriving = "true";
        }
        button.replaceChildren(el("span", { text: candidate.title }));
        if (candidate.provider_title !== owner) button.append(el("span", { class: "context-action-kind", text: candidate.provider_title }));
        button.dataset.emphasis = String(plan.emphasis === key);
        button.dataset.slot = String(slot);
        button.title = candidate.hint;
        next.push(button);
      });
      [...this.buttons.keys()].forEach((key) => { if (!plan.primary.includes(key)) { this.buttons.get(key).remove(); this.buttons.delete(key); this.hover.delete(key); } });
      let more = pill.querySelector(".context-actions-more");
      if (!more) {
        const toggle = el("button", { class: "context-action", type: "button", "data-more": "", "aria-haspopup": "menu", "aria-expanded": "false", text: L("更多") });
        toggle.addEventListener("click", () => this.toggleMenu());
        more = el("span", { class: "context-actions-more" }, toggle);
      }
      next.push(more);
      if (plan.assistant) {
        let ask = pill.querySelector(".context-actions-assistant");
        if (!ask) {
          ask = el("button", { class: "context-action context-actions-assistant", type: "button" });
          ask.addEventListener("click", () => askAssistant());
        }
        const words = L("助理：") + (FORM[plan.assistant.form] || L("有一条建议"));
        ask.replaceChildren(el("span", { class: "context-actions-long", text: words }), el("span", { class: "context-actions-short", text: L("助理") }));
        ask.setAttribute("aria-label", words);
        next.push(ask);
      }
      let basis = pill.querySelector(".context-actions-basis");
      if (!basis) basis = el("span", { class: "context-actions-basis" }, el("span"));
      const judgment = out.judgment;
      const fallback = out.receipt.fallback;
      basis.dataset.basis = plan.basis;
      basis.dataset.pending = String(rulesOnly);
      basis.firstElementChild.textContent = rulesOnly ? L("按规则 · 判断中")
        : fallback === "unconfigured" ? L("按规则") : fallback === "timeout" ? L("判断超时 · 按规则") : fallback === "failed" ? L("判断失败 · 按规则")
        : judgment && judgment.basis === "jev" ? "Jev" : L("按规则");
      basis.title = judgment ? (judgment.model || "Jev") + " · " + Math.round(judgment.latency_ms) + "ms"
        : fallback === "unconfigured" ? L("未接判断模型：只按选区形状排序") : L("规则排序：只看选区形状，不看含义");
      next.push(basis);
      pill.replaceChildren(...next);
      this.shown = { context_id: plan.context_id, primary: [...plan.primary] };
      if (this.menu) this.fillMenu();
      const words = plan.primary.map((key) => byKey.get(key).title).join("、");
      if (!rulesOnly && words && words !== this.announced) { this.announced = words; live.textContent = L("可以做：") + words; }
      document.dispatchEvent(new CustomEvent("molis:assistant-context-actions", { detail: { context_id: plan.context_id, plan } }));
    },
    toggleMenu() {
      if (this.menu) { this.closeMenu(); return; }
      const wrap = root.querySelector(".context-actions-more");
      if (!wrap) return;
      this.menu = el("div", { class: "context-actions-menu", role: "menu" });
      wrap.append(this.menu);
      this.fillMenu();
      // Keep the menu on screen: it opens right-aligned to “更多” and shifts when that would cross an edge.
      const rect = this.menu.getBoundingClientRect();
      if (rect.left < 8) this.menu.style.right = (rect.left - 8) + "px";
      wrap.querySelector("[data-more]").setAttribute("aria-expanded", "true");
      const first = this.menu.querySelector("button:not([disabled])");
      if (first) first.focus();
    },
    // Removing the menu blurs its focused item, whose focusout closes the menu again: forget it before removing it.
    closeMenu() {
      const menu = this.menu;
      this.menu = null;
      if (menu) menu.remove();
      const toggle = root.querySelector("[data-more]");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    },
    fillMenu() {
      if (!this.menu || !this.plan) return;
      const byKey = new Map(this.plan.candidates.map((item) => [item.key, item]));
      // With one provider, naming it on every line says nothing; an unavailable action always says why.
      const single = new Set(this.plan.candidates.map((candidate) => candidate.provider_title)).size === 1;
      const item = (candidate) => {
        const note = candidate.available ? (single ? "" : candidate.provider_title) : candidate.reason || L("不可用");
        const button = el("button", candidate.available ? { type: "button", role: "menuitem" } : { type: "button", role: "menuitem", disabled: "" },
          el("span", { text: candidate.title }), note ? el("small", { text: note }) : null);
        button.title = candidate.hint;
        button.addEventListener("click", () => { this.closeMenu(); choose(candidate.key); });
        return button;
      };
      const parts = [];
      // Primary actions the row cannot show at this width lead the menu.
      const hidden = this.plan.primary.filter((key) => { const button = this.buttons.get(key); return button && getComputedStyle(button).display === "none"; });
      if (hidden.length) { parts.push(el("h4", { text: L("推荐") })); hidden.forEach((key) => parts.push(item(byKey.get(key)))); }
      this.plan.more.forEach((group) => { parts.push(el("h4", { text: L(group.title) })); group.keys.forEach((key) => parts.push(item(byKey.get(key)))); });
      parts.push(el("hr"), el("h4", { text: L("全部操作（不依赖推荐）") }));
      const providers = new Map();
      this.plan.candidates.forEach((candidate) => providers.set(candidate.provider_title, [...(providers.get(candidate.provider_title) || []), candidate]));
      providers.forEach((list, title) => { if (!single) parts.push(el("h4", { text: title })); list.forEach((candidate) => parts.push(item(candidate))); });
      this.menu.replaceChildren(...parts);
    },
  };

  const bus = {
    focus: null,
    source: null,
    seq: 0,
    timer: 0,
    rulesTimer: 0,
    flush: null,
    judging: null,
    dismissed: new Map(),
    recent: [],
    request(focus) {
      return { pane_id: this.source.pane, focus, recent: this.recent.slice(0, 3), pinned: bar.pinned(),
        ...(bar.shown ? { previous: bar.shown } : {}), dismissed: [...(this.dismissed.get(focus.context_id) || [])] };
    },
    report(source, focus) {
      if (!focus) { if (this.source && this.source.pane === source.pane) this.set(null, null); return; }
      if (!focus.context_id || !focus.object || !Array.isArray(focus.targets)) return;
      this.set(focus, source);
    },
    set(focus, source) {
      if (focus && this.focus && focus.context_id === this.focus.context_id && this.source && source && this.source.pane === source.pane) return;
      const leaving = this.source, previous = this.focus;
      this.focus = focus; this.source = focus ? source : null;
      clearTimeout(this.timer);
      clearTimeout(this.rulesTimer);
      if (this.judging) this.judging.abort();
      this.judging = null;
      const seq = ++this.seq;
      if (!focus) {
        if (leaving) post("/api/contextual/cancel", { pane_id: leaving.pane }).catch(() => undefined);
        bar.idle();
        return;
      }
      // Every keystroke is a new context while writing: the row stays as it is (no dimming) and nothing is asked
      // until the typing pauses. A selection is shown by rules at once and judged almost at once.
      const writing = focus.activity === "editing";
      if (!(writing && previous && previous.activity === "editing" && previous.object.id === focus.object.id)) bar.pending(focus);
      const rules = () => post("/api/contextual/candidates", this.request(focus)).then((out) => {
        if (seq !== this.seq || !this.focus || out.plan.context_id !== this.focus.context_id) return;
        bar.render(out, focus, true);
      }).catch((error) => { if (seq === this.seq) bar.error(error); });
      this.flush = () => { clearTimeout(this.rulesTimer); this.flush = null; rules(); };
      if (writing) this.rulesTimer = setTimeout(() => this.flush && this.flush(), 400); else this.flush();
      this.timer = setTimeout(() => this.judge(seq, focus), writing ? 900 : 350);
    },
    async judge(seq, focus) {
      const controller = new AbortController();
      this.judging = controller;
      try {
        const out = await post("/api/contextual/judge", this.request(focus), controller.signal);
        if (seq !== this.seq || !this.focus || out.plan.context_id !== this.focus.context_id) return;
        bar.render(out, focus, false);
      } catch (error) {
        if (error && error.name === "AbortError") return;
        if (seq === this.seq) { const basis = root.querySelector(".context-actions-basis"); if (basis) { basis.dataset.pending = "false"; basis.firstElementChild.textContent = L("判断失败 · 按规则"); } }
      } finally { if (this.judging === controller) this.judging = null; }
    },
    dismiss(key) {
      if (!this.focus) return;
      const keys = this.dismissed.get(this.focus.context_id) || new Set();
      keys.add(key);
      this.dismissed.set(this.focus.context_id, keys);
      while (this.dismissed.size > 50) this.dismissed.delete(this.dismissed.keys().next().value);
    },
  };

  const choose = (key) => {
    const focus = bus.focus, source = bus.source, plan = bar.plan;
    const candidate = plan && plan.candidates.find((item) => item.key === key);
    // Clicked while the row still showed the moment before the last keystroke: bring it up to date instead of acting.
    if (focus && plan && plan.context_id !== focus.context_id) { if (bus.flush) bus.flush(); return; }
    if (!focus || !source || !candidate || !candidate.available) return;
    bus.recent = [candidate.title, ...bus.recent.filter((title) => title !== candidate.title)].slice(0, 3);
    if (source.frame) {
      source.frame.contentWindow.postMessage({ type: "workbench-context-action-chosen", context_id: focus.context_id, candidate }, location.origin);
      return;
    }
    const fallback = deliver(focus, candidate);
    if (fallback) openAssistant(fallback);
  };
  const askAssistant = () => {
    const focus = bus.focus, plan = bar.plan;
    if (!focus || !plan || !plan.assistant) return;
    const titles = plan.assistant.keys.map((key) => (plan.candidates.find((item) => item.key === key) || {}).title).filter(Boolean);
    const words = plan.assistant.form === "compare" ? L("帮我并排比较这几处内容的相同点、不同点和冲突。")
      : plan.assistant.form === "options" ? L("这段内容可以往哪几个方向走？可以考虑：") + titles.join("、")
      : L("帮我看看这段内容，") + (titles[0] ? L("先从「") + titles[0] + L("」开始。") : "");
    openAssistant(assistantDetail(focus, words));
  };

  document.addEventListener("molis:surface-focus", (event) => {
    const focus = event.detail && typeof event.detail === "object" ? event.detail : null;
    bus.report({ pane: ownPane, element: event.target instanceof Element ? event.target : null, frame: null }, focus);
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || !event.data || typeof event.data.type !== "string") return;
    const frame = [...document.querySelectorAll("iframe[data-pane-owner]")].find((node) => node.contentWindow === event.source);
    if (!frame) return;
    if (event.data.type === "workbench-surface-focus") bus.report({ pane: frame.dataset.paneOwner || "pane", element: frame, frame }, event.data.focus || null);
    else if (event.data.type === "workbench-assistant-open" && event.data.detail) openAssistant(event.data.detail);
  });
  // A place change, or the surface going out of sight, voids what was in hand there.
  document.addEventListener("molis-work:place-changed", () => bus.set(null, null));
  setInterval(() => { if (bus.source && bus.source.element && !visible(bus.source.element)) bus.set(null, null); }, 800);

  root.addEventListener("pointerleave", () => bar.release());
  root.addEventListener("focusin", (event) => { if (!root.contains(event.relatedTarget)) bar.returnTo = event.relatedTarget instanceof HTMLElement ? event.relatedTarget : null; });
  root.addEventListener("focusout", (event) => { if (!root.contains(event.relatedTarget)) { bar.closeMenu(); bar.release(); } });
  // A click in the row never takes the focus from the editor, so the selection stays where it is.
  root.addEventListener("mousedown", (event) => { if (event.target.closest("button")) event.preventDefault(); });
  document.addEventListener("pointerdown", (event) => { if (bar.menu && !root.contains(event.target)) bar.closeMenu(); });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "." && root.dataset.state === "active") {
      const first = root.querySelector(".context-action");
      if (first) { event.preventDefault(); bar.returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null; first.focus(); }
    }
  });
  root.addEventListener("keydown", (event) => {
    const inMenu = Boolean(bar.menu && bar.menu.contains(document.activeElement));
    const items = [...root.querySelectorAll(inMenu ? ".context-actions-menu button:not([disabled])" : ".context-action, .context-actions-scope button")];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      event.preventDefault();
      if (bar.menu) { bar.closeMenu(); root.querySelector("[data-more]").focus(); return; }
      if (bar.returnTo && bar.returnTo.isConnected) bar.returnTo.focus(); else document.activeElement.blur();
      return;
    }
    const forward = inMenu ? "ArrowDown" : "ArrowRight", back = inMenu ? "ArrowUp" : "ArrowLeft";
    if (event.key === forward && index >= 0) { event.preventDefault(); items[(index + 1) % items.length].focus(); }
    if (event.key === back && index >= 0) { event.preventDefault(); items[(index - 1 + items.length) % items.length].focus(); }
  });
  return { current: () => bus.focus, plan: () => bar.plan };
}`;
