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
      if (!response.ok) throw Object.assign(new Error(value.error || L("暂时处理不了，请稍后重试")), { code: value.code, status: response.status });
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
      apply: candidate.apply, intent: candidate.intent, title: candidate.title, object: focus.object, ...(candidate.scope ? { scope: candidate.scope } : {}),
      prepare: () => post("/api/contextual/prepare", { pane_id: ownPane, focus, key: candidate.key, request_id: id }),
    } });
    window.dispatchEvent(event);
    return event.defaultPrevented ? null : assistantDetail(focus, L("请帮我处理这段内容：") + candidate.title);
  };

  // Any surface that declares its object (data-assistant-context) gets a fragment context from a plain DOM selection,
  // so a plugin without an editor needs no code of its own (spec §10 P2 ②). Editors that report their own focus
  // (contenteditable, or data-surface-focus="own") and form fields are left to themselves.
  (() => {
    let timer = 0, reported = null;
    const hash = (text) => { let h = 0x811c9dc5; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
    const isWord = (text) => { const t = text.trim(); return Boolean(t) && !/\s/.test(t) && (/[㐀-鿿]/.test(t) ? t.length <= 8 : t.length <= 32); };
    const roleOf = (node) => {
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      const block = el && el.closest("h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, p");
      if (!block) return "paragraph";
      if (/^H[1-6]$/.test(block.tagName)) return "heading";
      if (block.tagName === "LI") return block.querySelector('input[type="checkbox"]') ? "task" : "list";
      if (block.tagName === "TD" || block.tagName === "TH") return "table";
      if (block.tagName === "BLOCKQUOTE") return "quote";
      if (block.tagName === "PRE") return "code";
      return "paragraph";
    };
    const headingPath = (root, node) => {
      const stack = [];
      root.querySelectorAll("h1, h2, h3, h4").forEach((heading) => {
        if (!(heading.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) return;
        const level = Number(heading.tagName.slice(1));
        while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
        stack.push({ level, text: heading.textContent.trim().slice(0, 120) });
      });
      return stack.map((item) => item.text).filter(Boolean).slice(-6);
    };
    const own = (node) => {
      const el = node && (node.nodeType === 1 ? node : node.parentElement);
      return !el || Boolean(el.closest('[contenteditable=""], [contenteditable="true"], input, textarea, select, [data-surface-focus="own"], [data-assistant-island], [data-assistant-context-actions]'));
    };
    const read = () => {
      const selection = getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount || own(selection.anchorNode) || own(selection.focusNode)) return null;
      const anchor = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
      const root = anchor && anchor.closest("[data-assistant-context]");
      if (!root || !root.contains(selection.focusNode)) return null;
      let context;
      try { context = JSON.parse(root.getAttribute("data-assistant-context") || "{}"); } catch { return null; }
      const object = context && context.object;
      if (!context.plugin_id || !object || typeof object.kind !== "string" || typeof object.id !== "string") return null;
      const parts = selection.toString().split(/\n+/).map((part) => part.trim()).filter(Boolean);
      if (!parts.length) return null;
      const role = roleOf(selection.anchorNode);
      const clip = (text) => text.length > 2000 ? { text: text.slice(0, 2000), truncated: true } : { text };
      const granularity = parts.length > 1 ? "blocks" : isWord(parts[0]) ? "word" : "range";
      const targets = parts.slice(0, 8).map((part) => ({ kind: "text_range", role: parts.length > 1 ? "paragraph" : role, ...clip(part) }));
      const heading_path = headingPath(root, selection.getRangeAt(0).startContainer);
      return { root, focus: { context_id: "dom:" + context.plugin_id + ":" + object.id + ":" + hash(parts.join("\n")), plugin_id: context.plugin_id,
        activity: "selecting", granularity, object: { kind: object.kind, id: object.id, ...(object.version !== undefined ? { version: object.version } : {}), ...(object.title ? { title: String(object.title) } : {}) },
        targets, surroundings: { heading_path }, ...(context.unsaved ? { unsaved: true } : {}),
        ...(context.goal && typeof context.goal.id === "string" && context.goal.id ? { goal: { id: context.goal.id, title: String(context.goal.title || "") } } : {}) } };
    };
    const flush = () => {
      const next = read();
      if (next) { reported = next.root; next.root.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: next.focus })); }
      else if (reported) { const root = reported; reported = null; if (root.isConnected) root.dispatchEvent(new CustomEvent("molis:surface-focus", { bubbles: true, detail: null })); }
    };
    document.addEventListener("selectionchange", () => { clearTimeout(timer); timer = setTimeout(flush, 120); });
  })();

  // A surface opened an item (the workbench's molis-work:select-item) but did not name it: name it from what the
  // plugins declare as their search sources (surface → kind), so its text can be acted on like any declared object.
  (() => {
    let surfaces = null;
    const known = () => surfaces || (surfaces = fetch(host.route("/api/contextual/surfaces"), { headers: host.headers() })
      .then((response) => response.ok ? response.json() : { surfaces: {} }).then((value) => value.surfaces || {}).catch(() => { surfaces = null; return {}; }));
    const read = (node) => { try { return JSON.parse(node.getAttribute("data-assistant-context") || "null"); } catch { return null; } };
    const namedItself = (context) => Boolean(context && context.object && context.named_by !== "workbench");
    document.addEventListener("molis-work:select-item", (event) => {
      const surface = event.target;
      if (!(surface instanceof Element) || !surface.hasAttribute("data-work-surface")) return;
      const itemId = event.detail && typeof event.detail.itemId === "string" ? event.detail.itemId : "";
      // After the plugin's own handler, which may name the object itself.
      setTimeout(async () => {
        if (!itemId) {
          const own = read(surface);
          if (own && own.named_by === "workbench") { delete own.object; delete own.named_by; surface.setAttribute("data-assistant-context", JSON.stringify(own)); }
          return;
        }
        if (namedItself(read(surface))) return;
        const entry = (await known())[surface.getAttribute("data-work-surface")];
        // Read again: a plugin still loading the item (a reload) names it while the surfaces are read, and its naming stands.
        const own = read(surface);
        if (!entry || !surface.isConnected || namedItself(own)) return;
        surface.setAttribute("data-assistant-context", JSON.stringify({ ...(own || {}), plugin_id: (own && own.plugin_id) || entry.plugin_id,
          object: { kind: entry.kind, id: itemId }, named_by: "workbench" }));
      }, 250);
    }, true);
  })();

  if (embedded) {
    let shown = null;
    document.addEventListener("molis:surface-focus", (event) => {
      shown = event.detail && typeof event.detail === "object" ? event.detail : null;
      parent.postMessage({ type: "workbench-surface-focus", focus: shown }, location.origin);
    });
    // A menu in this pane that shows the row's plan (Pages' writing menu) chooses through the row in the top document.
    document.addEventListener("molis:assistant-context-action-choose", (event) => {
      const detail = event.detail || {};
      if (shown && detail.context_id === shown.context_id && typeof detail.key === "string") parent.postMessage({ type: "workbench-context-action-choose", context_id: detail.context_id, key: detail.key }, location.origin);
    });
    window.addEventListener("message", (event) => {
      if (event.source !== window.parent || event.origin !== location.origin || !event.data) return;
      // The row's plan for this pane's context, for the menus here that show the same actions.
      if (event.data.type === "workbench-context-plan" && event.data.plan) {
        document.dispatchEvent(new CustomEvent("molis:assistant-context-actions", { detail: { context_id: event.data.plan.context_id, plan: event.data.plan } }));
        return;
      }
      if (event.data.type !== "workbench-context-action-chosen") return;
      if (!shown || !event.data.candidate || event.data.context_id !== shown.context_id) return;
      const fallback = deliver(shown, event.data.candidate);
      if (fallback) parent.postMessage({ type: "workbench-context-action-unhandled", context_id: shown.context_id, key: event.data.candidate.key, detail: fallback }, location.origin);
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
    // The last plan published for the menus that show the same actions; it outlives the row being put away.
    published: null,
    held: null,
    clearWhenLeft: false,
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
        close.addEventListener("click", () => { (this.plan ? this.plan.primary : []).forEach((key) => { bus.dismiss(key); bus.signal(key, "ignored"); }); this.idle(); });
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
    release() {
      if (this.clearWhenLeft && !this.interacting()) { bus.set(null, null); return; }
      const held = this.held; this.held = null; if (held && !this.interacting()) held();
    },
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
        // Read out as “action (plugin)”, not the two words run together.
        button.setAttribute("aria-label", candidate.provider_title !== owner ? candidate.title + "（" + candidate.provider_title + "）" : candidate.title);
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
      this.published = plan;
      document.dispatchEvent(new CustomEvent("molis:assistant-context-actions", { detail: { context_id: plan.context_id, plan } }));
      // A split pane's own menus show the same plan: send it to the pane whose surface this context is.
      if (bus.source && bus.source.frame) bus.source.frame.contentWindow?.postMessage({ type: "workbench-context-plan", plan }, location.origin);
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
        button.setAttribute("aria-label", note ? candidate.title + "（" + note + "）" : candidate.title);
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
      // “Nothing in hand” only clears what that same surface put there, not what another surface reported since.
      if (!focus) { if (this.source && this.source.pane === source.pane && (!this.source.element || !source.element || this.source.element === source.element)) this.set(null, null); return; }
      if (!focus.context_id || !focus.object || !Array.isArray(focus.targets)) return;
      this.set(focus, source);
    },
    set(focus, source, force) {
      // The person is reaching for the row (pointer on it, or its focus) as what they had in hand lapses — a finished
      // step's moment passing, say: keep it until they leave. A surface that went away is cleared regardless.
      if (!focus && !force && this.focus && bar.interacting()) { bar.clearWhenLeft = true; return; }
      bar.clearWhenLeft = false;
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
    // What the person did with an offered action, for the memory to count (its capability and title, never the content).
    // Nothing waits on it and nothing breaks without it.
    signal(key, signal) {
      if (!this.focus || !this.source) return;
      post("/api/contextual/signal", { pane_id: this.source.pane, focus: this.focus, key, signal, event_id: requestId() }).catch(() => undefined);
    },
    dismiss(key) {
      if (!this.focus) return;
      const keys = this.dismissed.get(this.focus.context_id) || new Set();
      keys.add(key);
      this.dismissed.set(this.focus.context_id, keys);
      while (this.dismissed.size > 50) this.dismissed.delete(this.dismissed.keys().next().value);
    },
  };

  const choose = (key, plan = bar.plan) => {
    const focus = bus.focus, source = bus.source;
    const candidate = plan && plan.candidates.find((item) => item.key === key);
    // Clicked while the row still showed the moment before the last keystroke: bring it up to date instead of acting.
    if (focus && plan && plan.context_id !== focus.context_id) { if (bus.flush) bus.flush(); return; }
    if (!focus || !source || !candidate || !candidate.available) return;
    bus.recent = [candidate.title, ...bus.recent.filter((title) => title !== candidate.title)].slice(0, 3);
    bus.signal(key, "accepted");
    const prepared = () => post("/api/contextual/prepare", { pane_id: source.pane, focus, key: candidate.key, request_id: requestId() });
    // What the workbench shows itself: a word looked up across the project opens in the search palette.
    if (candidate.action.capability_id === "search.query" && host.openSearch) {
      prepared().then((offer) => host.openSearch(offer.input && offer.input.query)).catch((error) => bar.error(error));
      return;
    }
    // A write goes to the Assistant as a prepared card: the person sees what it will do, and confirms it there.
    if (candidate.apply === "record") {
      prepared().then((offer) => suggestCard(focus, candidate, offer)).catch((error) => bar.error(error));
      return;
    }
    if (source.frame) {
      source.frame.contentWindow.postMessage({ type: "workbench-context-action-chosen", context_id: focus.context_id, candidate }, location.origin);
      return;
    }
    // No page here takes it (several objects, or a surface without its own handler): the Assistant gets it as a
    // prepared card too; only when even that fails does it get the words and the material.
    const fallback = deliver(focus, candidate);
    if (fallback) prepared().then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(fallback));
  };
  // The card carries the exact action and its complete input; the Assistant checks it against what it may use in that
  // work and runs it only when the person clicks. The person's click here places it (POST /api/assistant/cards) and the
  // panel opens on that work. Where the route is missing, the same card goes as a page message (a plain suggestion).
  const suggestCard = async (focus, candidate, offer) => {
    const material = { title: L("选中的内容") + (focus.object.title ? " · " + focus.object.title : ""), text: quoted(focus) };
    const summary = offer.summary || candidate.hint;
    const message_id = requestId();
    const source = { surface: focus.plugin_id, title: focus.object.title || "" };
    const card = { title: candidate.title, summary, reference: offer.action, input: offer.input,
      ...(offer.editable ? { editable: offer.editable } : {}), ...(offer.missing ? { missing: offer.missing } : {}),
      source_object: focus.object, materials: [material] };
    try {
      const placed = await post("/api/assistant/cards", { message_id, source, card });
      openAssistant({ work_id: placed.work_id });
    } catch (error) {
      if (!(error && (error.status === 404 || error.status === 405))) throw error;
      window.dispatchEvent(new CustomEvent("molis:assistant-message", { detail: {
        message_id, purpose: "suggest", source, object: focus.object, text: candidate.title + "：" + summary, materials: [material], card } }));
    }
  };
  // The split pane's page did not take the choice: same as here, a card, else the words and the material.
  const unhandled = (contextId, key, detail) => {
    const focus = bus.focus, source = bus.source, plan = bar.plan;
    const candidate = plan && plan.candidates.find((item) => item.key === key);
    if (!focus || !source || !candidate || focus.context_id !== contextId) { openAssistant(detail); return; }
    post("/api/contextual/prepare", { pane_id: source.pane, focus, key, request_id: requestId() })
      .then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(detail));
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

  // Where to start in a new work (spec §6.4.2): what the directory offers for the whole object open now, by rules
  // only (no judgment for opening a page), or the row's own plan while something is in hand. The Assistant shows
  // them and hands a click back here, so it runs exactly as a click on the row would.
  const starters = {
    focus: null,
    plan: null,
    // A plugin switched off or a grant withdrawn shows within this long; choosing checks again anyway.
    at: 0,
    seq: 0,
    focusFor(context) {
      const object = context && context.object;
      if (!object || typeof object.kind !== "string" || typeof object.id !== "string" || !object.kind || !object.id) return null;
      const text = typeof context.draft_text === "string" && context.draft_text.trim() ? context.draft_text : object.title || "";
      return { context_id: ("start:" + object.kind + ":" + object.id + ":" + (object.version === undefined ? "" : String(object.version))).slice(0, 240),
        plugin_id: String(context.plugin_id || ""), activity: "browsing", granularity: "object",
        object: { kind: object.kind, id: object.id, ...(object.version !== undefined ? { version: object.version } : {}), ...(object.title ? { title: String(object.title) } : {}) },
        targets: [{ kind: "object", role: "object", text: String(text).slice(0, 4000) }] };
    },
    // Another plugin's action says whose it is, as on the row.
    items(plan, pluginId) {
      const byKey = new Map(plan.candidates.map((item) => [item.key, item]));
      return plan.primary.concat(...plan.more.map((group) => group.keys)).map((key) => byKey.get(key))
        .filter((item) => item && item.available).slice(0, 4)
        .map((item) => ({ key: item.key, label: item.title, hint: item.hint, ...(item.source.provider_id !== pluginId ? { kind: item.provider_title } : {}) }));
    },
    // Each answer names the request it answers, so the Assistant never shows one for what was open before.
    answer(requestId, objectKey, items) {
      document.dispatchEvent(new CustomEvent("molis:assistant-starters", { detail: { request_id: requestId, object_key: objectKey, items } }));
    },
    request(context, requestId) {
      const inHand = bar.plan || bar.published;
      if (bus.focus && inHand && inHand.context_id === bus.focus.context_id) { this.answer(requestId, bus.focus.context_id, this.items(inHand, bus.focus.plugin_id)); return; }
      const focus = this.focusFor(context);
      if (!focus || !focus.plugin_id) { this.answer(requestId, "", []); return; }
      if (this.plan && this.focus && this.focus.context_id === focus.context_id && Date.now() - this.at < 15000) { this.answer(requestId, focus.context_id, this.items(this.plan, focus.plugin_id)); return; }
      const seq = ++this.seq;
      post("/api/contextual/candidates", { pane_id: "assistant-start", focus }).then((out) => {
        if (seq !== this.seq) return;
        this.focus = focus; this.plan = out.plan; this.at = Date.now();
        this.answer(requestId, focus.context_id, this.items(out.plan, focus.plugin_id));
      }).catch(() => { if (seq === this.seq) this.answer(requestId, focus.context_id, []); });
    },
    choose(objectKey, key) {
      if (bus.focus && bus.focus.context_id === objectKey) { chooseFrom(objectKey, key); return; }
      const focus = this.focus, plan = this.plan;
      const candidate = focus && plan && focus.context_id === objectKey ? plan.candidates.find((item) => item.key === key) : null;
      // Shown a moment ago but gone or switched off since: say why instead of doing nothing.
      if (!candidate || !candidate.available) { bar.error(new Error(candidate ? candidate.reason || L("不可用") : L("这个动作已不在当前内容的候选里"))); return; }
      bus.recent = [candidate.title, ...bus.recent.filter((title) => title !== candidate.title)].slice(0, 3);
      const prepared = () => post("/api/contextual/prepare", { pane_id: "assistant-start", focus, key, request_id: requestId() });
      if (candidate.action.capability_id === "search.query" && host.openSearch) {
        prepared().then((offer) => host.openSearch(offer.input && offer.input.query)).catch((error) => bar.error(error));
        return;
      }
      if (candidate.apply === "record") { prepared().then((offer) => suggestCard(focus, candidate, offer)).catch((error) => bar.error(error)); return; }
      // The page that has this object open takes it when it can (Pages runs it on the whole document); else a card.
      const fallback = deliver(focus, { ...candidate, scope: "object" });
      if (fallback) prepared().then((offer) => suggestCard(focus, candidate, offer)).catch(() => openAssistant(fallback));
    },
  };
  document.addEventListener("molis:assistant-starters-request", (event) => {
    const detail = event.detail || {};
    starters.request(detail.context, typeof detail.request_id === "string" ? detail.request_id : "");
  });
  document.addEventListener("molis:assistant-starter-choose", (event) => {
    const detail = event.detail || {};
    if (typeof detail.object_key === "string" && typeof detail.key === "string") starters.choose(detail.object_key, detail.key);
  });

  document.addEventListener("molis:surface-focus", (event) => {
    const focus = event.detail && typeof event.detail === "object" ? event.detail : null;
    bus.report({ pane: ownPane, element: event.target instanceof Element ? event.target : null, frame: null }, focus);
  });
  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin || !event.data || typeof event.data.type !== "string") return;
    const frame = [...document.querySelectorAll("iframe[data-pane-owner]")].find((node) => node.contentWindow === event.source);
    if (!frame) return;
    if (event.data.type === "workbench-surface-focus") bus.report({ pane: frame.dataset.paneOwner || "pane", element: frame, frame }, event.data.focus || null);
    else if (event.data.type === "workbench-context-action-unhandled" && event.data.detail) unhandled(event.data.context_id, event.data.key, event.data.detail);
    else if (event.data.type === "workbench-context-action-choose" && bus.source && bus.source.frame === frame) chooseFrom(event.data.context_id, event.data.key);
  });
  // A menu that shows the same plan (Pages' writing menu) chooses exactly as a click on the row does, also after the
  // person put the row away for this passage.
  const chooseFrom = (contextId, key) => {
    if (!bus.focus || bus.focus.context_id !== contextId || typeof key !== "string") return;
    choose(key, bar.plan || bar.published);
  };
  document.addEventListener("molis:assistant-context-action-choose", (event) => {
    const detail = event.detail || {};
    if (bus.source && !bus.source.frame) chooseFrom(detail.context_id, detail.key);
  });
  // A place change, or the surface going out of sight, voids what was in hand there.
  document.addEventListener("molis-work:place-changed", () => bus.set(null, null, true));
  setInterval(() => { if (bus.source && bus.source.element && !visible(bus.source.element)) bus.set(null, null, true); }, 800);

  root.addEventListener("pointerleave", () => bar.release());
  // Where Escape goes back to: the element focus came from, outside the row. Focus arriving from nowhere (a menu item
  // just removed on closing the menu) keeps the place remembered before.
  root.addEventListener("focusin", (event) => {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && from.isConnected && !root.contains(from)) bar.returnTo = from;
  });
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
