/** The tab strip: drawing it and its keys, the new-messages pill, and a new work's empty conversation. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_TABS_PART = String.raw`  /* ─── Tabs ─────────────────────────────────────────────────────────────── */
  // The main conversation (specs/work-line §3.2): one standing work per counterpart, the Assistant's first. With no work in front
  // the dialog shows it; a press on ＋ starts a separate work instead (fresh), which becomes an event on the line. Declared as
  // functions, so the script above this part may call them.
  // Only this place's: the list holds the works of every project, and another project's main conversation is not this one's.
  function mineHere(work) { return project ? work.scope?.kind === "project" && work.scope.project_id === project.id : work.scope?.kind === "personal"; }
  function mains() { return works.filter((work) => work.main && !work.archived && mineHere(work)).sort((a, b) => Number(Boolean(a.character)) - Number(Boolean(b.character))); }
  function mainId() { return mains().find((work) => nextChar && !fresh ? work.character?.artifact_id === nextChar.artifact_id : !work.character)?.work_id || null; }
  function startFresh() { fresh = true; if (curId || curEvent) return showWork(null); drawTabs(); render(); }
  // A tab's mark says at a glance which work waits on the person, which runs, and which has news not yet seen.
  const markOf = (work) => !work ? "" : WAITING.has(work.state) || urgentWorks.has(work.work_id) ? "waiting" : work.state === "running" ? "running"
    : unreadWorks.has(work.work_id) ? "unread" : work.state === "failed" ? "failed" : "";
  const MARK_LABEL = { waiting: "workbench.assistant-tabs.needs", running: "workbench.assistant-tabs.progress", unread: "workbench.assistant-tabs.new-results", failed: "workbench.assistant-tabs.not-finished" }; const tabMark = (mark, work) => { const node = el("span", "assistant-tab-mark"); if (mark) node.dataset.mwState = mark === "waiting" ? (work && WAITING.has(work.state) ? ringState(work.state) : "answer") : mark; node.setAttribute("aria-hidden", "true"); return node; };
  const workById = (id) => works.find((work) => work.work_id === id) || (view && view.work.work_id === id ? view.work : null);
  function drawTabs() {
    if (!tabsEl) return;
    const focused = tabsEl.contains(document.activeElement) ? document.activeElement.closest("[data-tab]")?.dataset.tab : null;
    // The main conversations lead and stay (one per counterpart, the Assistant's first even before its first message); then the open works.
    const lead = mains(), own = lead.find((work) => !work.character), said = eventTabs.map((one) => aboutEvent(one.subject));
    const ids = tabs.filter((id) => !workById(id)?.main && !said.some((work) => work?.work_id === id));
    // A Character chosen in 「发给」 that has no conversation yet has its tab from the choice on (WLN-40); its first words open the conversation.
    const talk = !curId && !curEvent && !fresh && nextChar ? nextChar : null;
    const front = curEvent ? "event:" + curEvent : curId || (fresh ? "new" : talk ? "talk" : "main");
    tabsEl.replaceChildren();
    const tab = (id, title, mark, closable, owner, work = workById(id)) => {
      const wrap = el("div", "assistant-tab"); wrap.dataset.tab = id;
      if (mark) wrap.dataset.mark = mark;
      const cur = id === front;
      if (id === "main" || workById(id)?.main) wrap.dataset.main = "";
      // A Character's own conversation says so: the reply left above the input when the dialog is closed is marked as its (WLN-40).
      if (workById(id)?.character) wrap.dataset.character = "";
      if (cur) wrap.setAttribute("data-current", "");
      const main = el("button", "assistant-tab-main"); main.type = "button"; main.setAttribute("role", "tab");
      main.setAttribute("aria-selected", String(cur)); main.tabIndex = cur ? 0 : -1;
      main.setAttribute("aria-controls", "assistant-side");
      // An event's tab leads with its owner's mark, as on the line.
      if (owner) { const shell = document.createElement("template"); shell.innerHTML = owner; if (shell.content.firstElementChild) main.append(shell.content.firstElementChild); }
      main.append(tabMark(mark, work), el("span", "assistant-tab-title", title));
      main.title = title + (mark ? " · " + globalThis.t.text(MARK_LABEL[mark]) : "");
      main.addEventListener("click", () => { if (id === "main") void talkTo(null); else if (id.startsWith("event:")) void showEvent(id.slice(6)); else if (id !== "new" && id !== "talk") void switchTo(id); });
      wrap.append(main);
      if (id !== "new") wrap.addEventListener("auxclick", (event) => { if (event.button !== 1) return; event.preventDefault(); closeTab(id); });
      if (closable) {
        const close = el("button", "assistant-tab-close", "×"); close.type = "button"; close.tabIndex = -1;
        close.setAttribute("aria-label", globalThis.t.text("workbench.assistant-tabs.close-tab-named", { title }));
        close.title = globalThis.t.text("workbench.assistant-tabs.close-tab-work-stays-all-work");
        close.addEventListener("click", (event) => { event.stopPropagation(); if (id === "new") { fresh = false; void switchTo(tabs[tabs.length - 1] || null); } else if (id === "talk") void talkTo(null); else closeTab(id); });
        wrap.append(close);
      }
      tabsEl.append(wrap);
    };
    tab(own ? own.work_id : "main", globalThis.t.text("workbench.assistant-tabs.main-conversation"), markOf(own), false);
    lead.filter((work) => work.character).forEach((work) => tab(work.work_id, work.character.title, markOf(work), false));
    if (talk) tab("talk", talk.title, "", true);
    ids.forEach((id) => { const work = workById(id); tab(id, work ? work.title : globalThis.t.text("workbench.assistant-tabs.loading"), markOf(work), true); });
    eventTabs.forEach((one, at) => tab("event:" + one.key, one.title, markOf(said[at]), true, one.mark, said[at]));
    if (!curId && !curEvent && fresh) tab("new", globalThis.t.text("workbench.assistant-tabs.new-work"), "", true);
    // The line marks the event whose tab is in front; the main conversation is "now", which marks none.
    host.lineFocus?.(curEvent ? eventOf()?.subject || null : curId ? { kind: WORK_KIND, id: curId } : null);
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
      jump.textContent = "↓ " + globalThis.t.text("workbench.assistant-tabs.new-messages");
      jump.onclick = () => { unseen = false; scrollOwner()?.toLatest(); paintJump(); }; jump.hidden = false; return;
    }
    unseen = false; jump.hidden = true;
  };
  thread.addEventListener("scroll", () => { if (nearBottom()) unseen = false; paintJump(); }, { passive: true });
  /* A new work's conversation is where to begin: this page's starting points and the works to go back to. */
  const emptyList = island.querySelector("[data-assistant-empty-list]");
  function paintEmpty() {
    if (!emptyList || curId || curEvent) return;
    const starters = startersFor();
    const recent = works.filter((work) => !work.archived && !work.delegated_by).slice().sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))).slice(0, 3);
    const signature = JSON.stringify([starters.map((one) => [one.label, one.key || "", one.kind || ""]), recent.map((work) => [work.work_id, work.title, work.state, markOf(work)])]);
    if (emptyList.dataset.signature === signature) return;
    emptyList.dataset.signature = signature;
    const parts = [];
    if (starters.length) {
      parts.push(el("p", "assistant-empty-title", globalThis.t.text("workbench.assistant-tabs.start-page")));
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
      parts.push(el("p", "assistant-empty-title", globalThis.t.text("workbench.assistant-tabs.continue-recent-work")));
      recent.forEach((work) => {
        const btnEl = el("button", "assistant-start assistant-start--work"); btnEl.type = "button";
        const mark = markOf(work); if (mark) btnEl.dataset.mark = mark;
        btnEl.append(el("span", "assistant-tab-mark"), el("span", "assistant-start-title", work.title), el("span", "assistant-start-state", stateLabel(work.state)));
        btnEl.addEventListener("click", () => { void switchTo(work.work_id); });
        parts.push(btnEl);
      });
    }
    parts.push(el("p", "assistant-empty-hint", globalThis.t.text("workbench.assistant-tabs.type-bring-project-content-use-capability-method-drop")));
    emptyList.replaceChildren(...parts);
  }

  /* ─── Events of the work line as tabs (specs/work-line §4.4) ───────────── */
  // An event's tab: its card on top and the conversation about it below — the latest work the person said in this tab (it
  // \`serves\` the event), or none yet. Which events are open is this page's own. An event that is one of the Assistant's own
  // works is that work's tab. (Declarations, so the parts above may name them.)
  function eventKey(subject) { return subject.kind + ":" + subject.id; }
  function eventOf(key = curEvent) { return eventTabs.find((one) => one.key === key) || null; }
  function aboutEvent(subject) {
    return works.filter((work) => !work.archived && !work.main && !work.delegated_by && (work.serves || []).some((one) => one.kind === subject.kind && one.id === subject.id))
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
  }
  function showEvent(key) { return showWork(aboutEvent(eventOf(key).subject)?.work_id || null, key); }
  function openEvent(event) {
    setPanel(true);
    if (event.subject.kind === WORK_KIND) return switchTo(event.subject.id);
    const key = eventKey(event.subject), had = eventOf(key);
    if (had) Object.assign(had, event); else eventTabs.push({ key, ...event });
    while (eventTabs.length > MAX_TABS) eventTabs.splice(eventTabs.findIndex((one) => one.key !== key && one.key !== curEvent), 1);
    return showEvent(key);
  }
  // Closing an event's tab goes back to now: the main conversation.
  function closeEvent(key) { eventTabs = eventTabs.filter((one) => one.key !== key); if (curEvent === key) { fresh = false; void showWork(null); } else drawTabs(); }
  // What a page hands over is about its object, not the main conversation (WLN-33): the object's event when the line shows it
  // (its tab, and the conversation already about it), a work of its own otherwise — which stands on the line as its own event.
  function aboutObject(object) {
    const event = object ? host.lineEvent?.({ kind: object.kind, id: object.id }) : null;
    return event ? openEvent(event) : startFresh();
  }
  // The card of the event in front (WLN-08, WLN-09): an event's tab, or a work of the Assistant's own that stands on the line. The
  // line draws it — who registered it, the display the platform composes from what its owner declared, the tasks done for it —
  // as it draws the same card parked in the side panel. Nothing here knows a kind of event or a plugin.
  const eventCard = el("div", "assistant-event-card"); eventCard.dataset.assistantEventCard = "";
  let cardFor = null, cardHandle = null;
  function eventSurface(put) {
    const tab = host.lineCard ? eventOf() : null, work = !tab && host.lineCard && curId ? workById(curId) : null;
    const own = work && !work.main ? host.lineEvent?.({ kind: WORK_KIND, id: curId }) : null;
    const about = tab ? { subject: tab.subject, title: tab.title, mark: tab.mark, composed: true } : own ? { ...own, composed: false } : null, key = about ? eventKey(about.subject) : null;
    if (key !== cardFor) { cardHandle?.destroy(); cardHandle = null; cardFor = key; if (about) cardHandle = host.lineCard(eventCard, about); }
    if (cardHandle) put(eventCard); else eventCard.remove();
  }
  // 「发给」 a counterpart (WLN-40): the Assistant (null) or a Character. Its standing main conversation comes in front; a Character
  // not spoken to yet is kept as the one the next Send goes to, with a draft of its own, and the Host opens its conversation then.
  function talkTo(ref) {
    const standing = ref ? mains().find((work) => work.character?.artifact_id === ref.artifact_id) : null;
    fresh = false; nextChar = ref && !standing ? ref : null;
    if (nextChar) { nextScope = "project"; nextExec = "assistant"; }
    return switchTo(standing ? standing.work_id : null).then(() => { drawTabs(); paintAim(); paintSum(); input.focus(); });
  }
  /* ─── Where a handed-out task went (WLN-32) ────────────────────────────── */
  // Under the reply that handed a task to the background: where it stands on the work line, with 「改」. The line draws the row
  // (the event's name is the line's) and 「改」 opens the task's card in the background-task panel, where it can go elsewhere.
  const ownKeys = (child) => child.line_event ? [WORK_KIND + ":" + child.work_id] : (child.serves || []).map(eventKey).sort();
  function placedRows(work, rounds, at, put) {
    const handed = host.linePlaced && work && view.delegated ? view.delegated.filter((child) => !child.taken_back) : [];
    // (at -1: before the rounds are drawn, the rows of tasks this conversation no longer hands out go.)
    if (at < 0) { [...thread.children].forEach((node) => { if (node.dataset.placedTask && !handed.some((child) => child.work_id === node.dataset.placedTask)) node.remove(); }); return; }
    const from = rounds[at].started_at, until = rounds[at + 1]?.started_at;
    handed.filter((child) => child.created_at >= from && (!until || child.created_at < until)).forEach((child) => {
      const row = keyed(thread, "data-placed-task", child.work_id, () => el("div", "assistant-placed"));
      const html = host.linePlaced({ subject: { kind: WORK_KIND, id: child.work_id }, title: child.title, serves: child.serves || [], own: Boolean(child.line_event) });
      if (row.shown !== html) { row.innerHTML = html; row.shown = html; }
      put(row);
    });
  }
  /* ─── A task waits on the person (WLN-06) ──────────────────────────────── */
  // In a main conversation at now, the platform's own row for each task done for an event on the line that waits on the person:
  // written at once, with no model, where the conversation stood when this page first heard it wait; folded once it no longer
  // waits. 「去处理」 opens the event's tab; nothing opens or takes the caret by itself.
  let waitingNow = [], waitingShown = "";
  const waitingHere = () => Boolean(host.lineWaiting) && !curEvent && (!curId || Boolean(workById(curId)?.main));
  function waitingRows(work, rounds, at, put) {
    // (Without a placer: the rows are read again, and those of tasks this page no longer shows here go.)
    if (!put) {
      waitingNow = waitingHere() ? host.lineWaiting() : [];
      waitingShown = JSON.stringify(waitingNow.map((row) => [row.key, row.settled]));
      [...thread.children].forEach((node) => { if (node.dataset.waitingTask && !waitingNow.some((row) => row.key === node.dataset.waitingTask)) node.remove(); });
      return;
    }
    const from = at < 0 ? "" : rounds[at].started_at, until = rounds[at + 1]?.started_at;
    waitingNow.filter((row) => row.at >= from && (!until || row.at < until)).forEach((one) => {
      const row = keyed(thread, "data-waiting-task", one.key, () => el("div", "assistant-waiting"));
      if (row.shown !== one.html) { row.innerHTML = one.html; row.shown = one.html; }
      put(row);
    });
  }
  thread.addEventListener("click", (event) => {
    const row = event.target.closest && event.target.closest("[data-place-change]")?.closest("[data-placed-task]");
    if (row) { event.stopPropagation(); host.linePlace?.({ kind: WORK_KIND, id: row.dataset.placedTask }); return; }
    const go = event.target.closest && event.target.closest("[data-waiting-go]");
    if (go) { event.stopPropagation(); host.lineWaitingGo?.(go.dataset.waitingGo); }
  });
  // The task table says a task of this conversation stands somewhere else now (changed here or anywhere): read the work again.
  function placedMoved(event) {
    // (A work of the Assistant's own gets its card once the line has read it.)
    if (!cardFor && curId && !curEvent) eventSurface(placer(thread));
    // A task came to wait on the person, or no longer does: the line takes the table first, then the rows are drawn again.
    if (host.lineWaiting) setTimeout(() => {
      if (waitingHere() && JSON.stringify(host.lineWaiting().map((row) => [row.key, row.settled])) !== waitingShown) render();
    }, 0);
    const table = event.detail?.tasks, handed = curId && view?.delegated;
    if (!table || !handed) return;
    if (handed.some((child) => { const task = table.tasks.find((one) => one.subject.kind === WORK_KIND && one.subject.id === child.work_id); return task && String(task.serves.map(eventKey).sort()) !== String(ownKeys(child)); })) void reload();
  }
  document.addEventListener("molis-work:attention", placedMoved);`;
