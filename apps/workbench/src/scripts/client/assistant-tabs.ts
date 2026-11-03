/** The tab strip: drawing it and its keys, the new-messages pill, and a new work's empty conversation. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_TABS_PART = String.raw`  /* ─── Tabs ─────────────────────────────────────────────────────────────── */
  // A tab's mark says at a glance which work waits on the person, which runs, and which has news not yet seen.
  const markOf = (work) => !work ? "" : WAITING.has(work.state) || urgentWorks.has(work.work_id) ? "waiting" : work.state === "running" ? "running"
    : unreadWorks.has(work.work_id) ? "unread" : work.state === "failed" ? "failed" : "";
  const MARK_LABEL = { waiting: "等你", running: "进行中", unread: "有新结果", failed: "没有完成" }; const tabMark = (mark, work) => { const node = el("span", "assistant-tab-mark"); if (mark) node.dataset.mwState = mark === "waiting" ? (work && WAITING.has(work.state) ? ringState(work.state) : "answer") : mark; node.setAttribute("aria-hidden", "true"); return node; };
  const workById = (id) => works.find((work) => work.work_id === id) || (view && view.work.work_id === id ? view.work : null);
  function drawTabs() {
    if (!tabsEl) return;
    const focused = tabsEl.contains(document.activeElement) ? document.activeElement.closest("[data-tab]")?.dataset.tab : null;
    const ids = tabs.slice();
    tabsEl.replaceChildren();
    const tab = (id, title, mark, closable) => {
      const wrap = el("div", "assistant-tab"); wrap.dataset.tab = id;
      if (mark) wrap.dataset.mark = mark;
      const cur = id === (curId || "new");
      if (cur) wrap.setAttribute("data-current", "");
      const main = el("button", "assistant-tab-main"); main.type = "button"; main.setAttribute("role", "tab");
      main.setAttribute("aria-selected", String(cur)); main.tabIndex = cur ? 0 : -1;
      main.setAttribute("aria-controls", "assistant-side");
      main.append(tabMark(mark, workById(id)), el("span", "assistant-tab-title", title));
      main.title = title + (mark ? " · " + L(MARK_LABEL[mark]) : "");
      main.addEventListener("click", () => { if (id === "new") void switchTo(null); else void switchTo(id); });
      wrap.append(main);
      if (id !== "new") wrap.addEventListener("auxclick", (event) => { if (event.button !== 1) return; event.preventDefault(); closeTab(id); });
      if (closable) {
        const close = el("button", "assistant-tab-close", "×"); close.type = "button"; close.tabIndex = -1;
        close.setAttribute("aria-label", L("关闭标签") + "：" + title);
        close.title = L("关闭标签（工作仍在“全部工作”里）");
        close.addEventListener("click", (event) => { event.stopPropagation(); if (id === "new") void switchTo(tabs[tabs.length - 1] || null); else closeTab(id); });
        wrap.append(close);
      }
      tabsEl.append(wrap);
    };
    ids.forEach((id) => { const work = workById(id); tab(id, work ? work.title : L("正在读取…"), markOf(work), true); });
    if (!curId) tab("new", L("新工作"), "", ids.length > 0);
    const cur = tabsEl.querySelector("[data-current]");
    if (cur) {
      const left = cur.offsetLeft, right = left + cur.offsetWidth;
      if (left < tabsEl.scrollLeft) tabsEl.scrollLeft = left; else if (right > tabsEl.scrollLeft + tabsEl.clientWidth) tabsEl.scrollLeft = right - tabsEl.clientWidth;
    }
    if (focused) tabsEl.querySelector('[data-tab="' + focused + '"] .assistant-tab-main')?.focus();
  }
  // Left and right move between tabs, as in any tab list; Delete closes the focused one.
  tabsEl?.addEventListener("keydown", (event) => {
    const items = [...tabsEl.querySelectorAll(".assistant-tab-main")];
    const at = items.indexOf(document.activeElement);
    if (at < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); items[(at + (event.key === "ArrowRight" ? 1 : -1) + items.length) % items.length].focus(); }
    if (event.key === "Delete") { const id = items[at].closest("[data-tab]")?.dataset.tab; if (id && id !== "new") { event.preventDefault(); closeTab(id); } }
  });

  /* A pill at the foot of the conversation: news that arrived while reading above. What waits is in the row above the input. */
  const jump = island.querySelector("[data-assistant-jump]");
  let unseen = false;
  const paintJump = () => {
    if (!jump) return;
    if (unseen && !nearBottom()) {
      jump.textContent = "↓ " + L("新消息");
      jump.onclick = () => { unseen = false; scrollOwner()?.toLatest(); paintJump(); }; jump.hidden = false; return;
    }
    unseen = false; jump.hidden = true;
  };
  thread.addEventListener("scroll", () => { if (nearBottom()) unseen = false; paintJump(); }, { passive: true });
  /* A new work's conversation is where to begin: this page's starting points and the works to go back to. */
  const emptyList = island.querySelector("[data-assistant-empty-list]");
  function paintEmpty() {
    if (!emptyList || curId) return;
    const starters = startersFor();
    const recent = works.filter((work) => !work.archived && !work.delegated_by).slice().sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 3);
    const signature = JSON.stringify([starters.map((one) => [one.label, one.key || "", one.kind || ""]), recent.map((work) => [work.work_id, work.title, work.state, markOf(work)])]);
    if (emptyList.dataset.signature === signature) return;
    emptyList.dataset.signature = signature;
    const parts = [];
    if (starters.length) {
      parts.push(el("p", "assistant-empty-title", L("从这一页开始")));
      starters.forEach((starter) => {
        const btnEl = el("button", "assistant-start"); btnEl.type = "button";
        btnEl.append(el("span", "assistant-start-title", starter.label));
        if (starter.kind) btnEl.append(el("span", "assistant-start-state", starter.kind));
        if (starter.hint) btnEl.title = starter.hint;
        btnEl.addEventListener("click", () => { if (useStarter(starter)) input.focus(); });
        parts.push(btnEl);
      });
    }
    if (recent.length) {
      parts.push(el("p", "assistant-empty-title", L("继续最近的工作")));
      recent.forEach((work) => {
        const btnEl = el("button", "assistant-start assistant-start--work"); btnEl.type = "button";
        const mark = markOf(work); if (mark) btnEl.dataset.mark = mark;
        btnEl.append(el("span", "assistant-tab-mark"), el("span", "assistant-start-title", work.title), el("span", "assistant-start-state", stateLabel(work.state)));
        btnEl.addEventListener("click", () => { void switchTo(work.work_id); });
        parts.push(btnEl);
      });
    }
    parts.push(el("p", "assistant-empty-hint", L("输入 @ 引用项目里的内容，/ 用一个能力或方法；文件和图片可以直接拖进输入框。")));
    emptyList.replaceChildren(...parts);
  }`;
