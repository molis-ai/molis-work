/**
 * The row of actions above the Assistant input, as the page draws it: the pill with its scope, the recommended buttons,
 * 更多 with its menu, the basis note and the row's own pointer, focus and keyboard handling. It reads the plan the bus
 * hands it and never decides what is in hand. A fragment of the factory script in context-actions.ts: the pieces share
 * its closure (host, L, root, el, bus, choose, ...) and are joined there in the order the text had before the split.
 */
export const CONTEXT_BAR_SCRIPT = String.raw`  const SCOPE = { word: L("一个词"), range: L("一段文字"), block: L("这一段"), blocks: L("几段内容"), objects: L("几份内容") };
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
  };`;

/** What the row's root element listens to (hover release, focus return, Escape and arrows), after the bus is defined. */
export const CONTEXT_BAR_EVENTS_SCRIPT = String.raw`  root.addEventListener("pointerleave", () => bar.release());
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
  });`;
