/**
 * What draws the ranked actions: the context toolbar (the design system's page program) in this document, or, when what is in
 * hand sits in a split pane, the same toolbar in that pane's own document, driven by a message. It reads the plan the bus hands it and
 * never decides what is in hand. A fragment of the factory script in context-actions.ts: the pieces share its closure (host, L, bus,
 * choose, makeToolbar, ...) and are joined there.
 *
 * The bus meets only `bar`: `render` / `idle` / `pending` / `error` / `judgeFailed`, and the state it reads (`plan`, `shown`,
 * `published`, `pinned()`, `interacting()`, `clearWhenLeft`). The toolbar is shown once a selection has been steady for 350ms (the bus
 * asks at once, but nothing flickers while the person is still dragging), and a context that is only the person writing (`editing`) is
 * not shown by itself: ⌘. summons it.
 */
export const CONTEXT_BAR_SCRIPT = String.raw`  const toolbar = makeToolbar({
    translate: L, inset: { top: 54, bottom: 100 }, width: () => (host.width ? host.width() : innerWidth),
    choose: (key) => choose(key), assistant: (kind) => (kind === "bring" ? bringToAssistant() : askAssistant()),
    dismiss: () => bar.dismissAll(), hold: () => bar.leave(), settled: () => bar.leave(),
  });
  const live = document.createElement("div");
  live.className = "mw-sr-only"; live.setAttribute("data-context-actions-live", ""); live.setAttribute("aria-live", "polite");
  document.body.append(live);
  const basisOf = (out, rulesOnly) => {
    const judgment = out.judgment, fallback = out.receipt.fallback;
    return { text: rulesOnly ? L("按规则 · 判断中") : fallback === "timeout" ? L("判断超时 · 按规则") : fallback === "failed" ? L("判断失败 · 按规则")
        : judgment && judgment.basis === "jev" ? "Jev" : L("按规则"),
      title: judgment ? (judgment.model || "Jev") + " · " + Math.round(judgment.latency_ms) + "ms"
        : fallback === "unconfigured" ? L("未接判断模型：只按选区形状排序") : L("规则排序：只看选区形状，不看含义") };
  };
  // The plan as plain data for the toolbar: no function in it, so it crosses to a pane as it is.
  const viewOf = (out, rulesOnly, mine) => {
    const plan = out.plan, byKey = new Map(plan.candidates.map((item) => [item.key, item]));
    // Another plugin's action says whose it is.
    const other = (item) => (item.source.provider_id !== mine ? item.provider_title : "");
    const entry = (item) => ({ key: item.key, label: item.title, disabled: !item.available, note: item.available ? other(item) : item.reason || L("不可用") });
    return { context_id: plan.context_id, assistant: true, basis: basisOf(out, rulesOnly),
      actions: plan.primary.map((key) => { const item = byKey.get(key); return { key, label: item.title, hint: item.hint, emphasis: plan.emphasis === key, badge: other(item) }; }),
      more: [...plan.more.map((group) => ({ title: L(group.title), items: group.keys.map((key) => entry(byKey.get(key))) })),
        { title: L("全部操作（不依赖推荐）"), items: plan.candidates.map(entry) }] };
  };
  const bar = {
    shown: null,
    plan: null,
    // The last plan; it outlives the toolbar being put away, for the starters and for choosing after Esc.
    published: null,
    clearWhenLeft: false,
    announced: "",
    view: null,
    frame: null,
    summoned: "",
    timer: 0,
    paneHold: { interacting: false, pinned: [] },
    pinned() { return this.frame ? this.paneHold.pinned : toolbar.pinned(); },
    interacting() { return this.frame ? this.paneHold.interacting : Boolean(toolbar.busy()); },
    // The pointer or focus left the toolbar: what was meant to clear when they did, clears.
    leave() { if (this.clearWhenLeft && !this.interacting()) bus.set(null, null); },
    // Esc: these actions are not wanted for this passage.
    dismissAll() { (this.plan ? this.plan.primary : []).forEach((key) => { bus.dismiss(key); bus.signal(key, "ignored"); }); this.idle(); },
    // The pane draws its own toolbar from what it is sent.
    tell(frame, message) { frame.contentWindow.postMessage({ type: "workbench-context-view", ...message }, location.origin); },
    idle() {
      clearTimeout(this.timer);
      const frame = this.frame;
      this.plan = this.shown = this.view = this.frame = null; this.summoned = ""; this.paneHold = { interacting: false, pinned: [] };
      toolbar.hide();
      if (frame && frame.contentWindow) this.tell(frame, { op: "idle" });
    },
    // A new context: what was shown belongs to the one before.
    pending(focus) { if (this.shown && this.shown.context_id !== focus.context_id) this.idle(); },
    error(error) { host.showToast(error.message || L("暂时处理不了，请稍后重试"), true); },
    // The owner moved what it reported (a scroll): the toolbar follows without asking anything again.
    reanchor() { if (!this.frame) toolbar.place(); },
    // The judgment did not come: the basis note says so (the rules' actions stay).
    judgeFailed() { if (this.view) { this.view.basis = { text: L("判断失败 · 按规则"), title: "" }; this.push(); } },
    push(summon) {
      if (!this.view) return;
      const frame = bus.source && bus.source.frame;
      if (frame) { this.frame = frame; this.tell(frame, { op: "render", view: this.view, summon }); return; }
      this.frame = null;
      toolbar.show({ ...this.view, touch: coarse(), anchor: { rect: rectOf(() => bus.focus || {}), placement: ((bus.focus || {}).screen || {}).placement } });
    },
    render(out, focus, rulesOnly) {
      const plan = out.plan;
      if (!plan.candidates.some((item) => item.available)) { this.idle(); return; }
      this.plan = plan; this.published = plan; this.shown = { context_id: plan.context_id, primary: [...plan.primary] };
      this.view = viewOf(out, rulesOnly, focus.plugin_id);
      const words = plan.primary.map((key) => (plan.candidates.find((item) => item.key === key) || {}).title).filter(Boolean).join("、");
      if (!rulesOnly && words && words !== this.announced) { this.announced = words; live.textContent = L("可以做：") + words; }
      clearTimeout(this.timer);
      // Writing shows nothing by itself; a selection shows once it has been steady for a moment.
      if (focus.activity === "editing" && this.summoned !== plan.context_id) return;
      const seq = bus.seq, wait = Math.max(0, 350 - (Date.now() - bus.at));
      if (wait) this.timer = setTimeout(() => { if (seq === bus.seq) this.push(); }, wait); else this.push();
    },
    // ⌘. while writing: bring the toolbar up for the caret (a pane asks for it by message, then takes the focus itself).
    summon(fromPane) {
      if (!this.view || !bus.focus || bus.focus.activity !== "editing" || (!fromPane && !toolbar.hidden())) return false;
      this.summoned = this.view.context_id; this.push(true); if (!fromPane) toolbar.focus();
      return true;
    },
  };
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key === "." && bar.summon()) event.preventDefault(); });`;
