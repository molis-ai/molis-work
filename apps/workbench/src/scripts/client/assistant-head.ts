/** What the conversation column is about: the one line over the conversation and its keys, the new-messages pill, and a new work's empty conversation. A part of ASSISTANT_ISLAND_FACTORY_SCRIPT, joined in place. */
export const ASSISTANT_HEAD_PART = String.raw`  /* ─── What the conversation is about ───────────────────────────────────── */
  // The main conversation (specs/work-line §3.2): one standing work per counterpart, the Assistant's first. With no work in front
  // the conversation column shows it; 另起一件 starts a separate work instead (fresh), which becomes an event. Declared as
  // functions, so the script above this part may call them.
  // Only this place's: the list holds the works of every project, and another project's main conversation is not this one's.
  function mineHere(work) { return project ? work.scope?.kind === "project" && work.scope.project_id === project.id : work.scope?.kind === "personal"; }
  function mains() { return works.filter((work) => work.main && !work.archived && mineHere(work)).sort((a, b) => Number(Boolean(a.character)) - Number(Boolean(b.character))); }
  function mainId() { return mains().find((work) => !work.character_selection_required && (nextChar && !fresh ? roleKey(work.character?.ref) === roleKey(nextChar.ref) : !work.character))?.work_id || null; }
  function startFresh() { askAssistant(); fresh = true; nextChar = undefined; talkDraft = ""; if (curId || curEvent) return showWork(null); drawHead(); render(); }
  // A work's mark says at a glance which waits on the person, which runs, and which has news not yet seen (the list of works).
  const markOf = (work) => !work ? "" : WAITING.has(work.state) || urgentWorks.has(work.work_id) ? "waiting" : work.state === "running" ? "running"
    : unreadWorks.has(work.work_id) ? "unread" : work.state === "failed" ? "failed" : "";
  const tabMark = (mark, work) => { const node = el("span", "assistant-tab-mark"); if (mark) node.dataset.mwState = mark === "waiting" ? (work && WAITING.has(work.state) ? ringState(work.state) : "answer") : mark; node.setAttribute("aria-hidden", "true"); return node; };
  const workById = (id) => works.find((work) => work.work_id === id) || (view && view.work.work_id === id ? view.work : null);
  // The one line over the conversation (§4「底栏第十三版」第 3 条, POLISH-66): what the words are said to — the event (its owner's
  // mark, its name, who registered it), a work of the Assistant's own, or the main conversation with the Assistant or a Character in
  // this project. It stays while the words scroll, and names the same thing as the input's hint and the page in front.
  const headMark = island.querySelector("[data-assistant-head-mark]"), headTitle = island.querySelector("[data-assistant-head-title]"), headNote = island.querySelector("[data-assistant-head-note]");
  const pageTakes = island.querySelector("[data-assistant-page-takes]");
  const sparkle = island.querySelector("[data-assistant-glyphs]")?.content.querySelector('[data-glyph="sparkles"]')?.innerHTML || "";
  let headShown = "";
  function drawHead() {
    const work = curId ? workById(curId) : null, about = eventOf(), talk = !curId && !curEvent && !fresh && nextChar ? nextChar : null;
    const own = !about && work && !work.main ? host.lineEvent?.({ kind: WORK_KIND, id: curId }) : null;
    const place = project ? project.title || readText("workbench.assistant-island.project") : readText("workbench.assistant-island.personal");
    // An event: its state mark as the lists draw it now, its name, then who registered it and where it is kept.
    const live = about ? host.lineEvent?.(about.subject) : null;
    // (An event put back from the side panel after a reload comes without its name, WLN-28: the line names it.)
    const said = about ? { mark: (live || about).mark, title: live?.title || about.title, note: [live?.owner || about.owner, place].filter(Boolean).join(" · ") }
      : own ? { mark: own.mark, title: own.title, note: stateLabel(work.state) }
      : work && !work.main ? { mark: sparkle, title: work.title, note: stateLabel(work.state) }
      : fresh && !curId ? { mark: sparkle, title: readText("workbench.assistant-tabs.new-work"), note: place }
      : { mark: work?.character || talk ? "" : sparkle, who: work?.character?.title || talk?.title || "", title: work?.character?.title || talk?.title || readText("workbench.common.assistant"), note: readText("workbench.assistant-head.main-in", { place }) };
    const next = JSON.stringify(said);
    // Which conversation this is, for whoever reads the page (the event's key, the work's id, a new work, or the main conversation).
    if (headTitle) headTitle.parentElement.dataset.about = curEvent ? "event:" + curEvent : curId && !(work && work.main) ? curId : fresh && !curId ? "new" : "main";
    if (headTitle && next !== headShown) {
      headShown = next;
      if (said.who) { headMark.replaceChildren(el("span", "work-reply-who", Array.from(said.who)[0] || "")); } else headMark.innerHTML = said.mark;
      headTitle.textContent = said.title; headTitle.title = said.title; headNote.textContent = said.note; headNote.title = said.note;
    }
    // The page in front takes the words itself (a Coding session): its conversation is not repeated here; 改成问助理 makes the Assistant the receiver.
    const page = island.dataset.receiver === "page";
    if (pageTakes) pageTakes.hidden = !page;
    island.querySelector(".assistant-main")?.toggleAttribute("data-page-takes", page);
    // The foot marks the event the conversation is about; the main conversation marks none.
    host.lineFocus?.(curEvent ? eventOf()?.subject || null : curId ? { kind: WORK_KIND, id: curId } : null);
    host.lineConversation?.({ unread: false });
  }
  // The conversation column's 「…」: 另起一件 and 全部工作.
  const moreKey = island.querySelector("[data-assistant-more]"), moreMenu = island.querySelector("[data-assistant-more-menu]");
  const setMore = (open, back) => { if (!moreMenu || moreMenu.hidden === !open) return; moreMenu.hidden = !open; moreKey.setAttribute("aria-expanded", String(open)); if (open) moreMenu.querySelector("[role=menuitem]")?.focus(); else if (back) moreKey.focus(); };
  moreKey?.addEventListener("click", () => setMore(moreMenu.hidden));
  moreMenu?.addEventListener("click", () => setMore(false));
  moreMenu?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMore(false, true); return; }
    if (event.key === "Tab") { setMore(false); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const items = [...moreMenu.querySelectorAll("[role=menuitem]")], at = items.indexOf(document.activeElement);
    event.preventDefault(); items[(at + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  });
  document.addEventListener("pointerdown", (event) => { if (moreMenu && !moreMenu.hidden && event.target?.nodeType === 1 && !moreMenu.contains(event.target) && !moreKey.contains(event.target)) setMore(false); }, true);
  island.querySelector("[data-assistant-ask-assistant]")?.addEventListener("click", () => { askAssistant(); input.focus(); });

  /* A pill at the foot of the conversation: news that arrived while reading above. What waits is in the row above the input. */
  const jump = island.querySelector("[data-assistant-jump]");
  let unseen = false;
  const paintJump = () => {
    if (!jump) return;
    if (unseen && !nearBottom()) {
      jump.textContent = "↓ " + readText("workbench.assistant-tabs.new-messages");
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
    const signature = JSON.stringify([project?.id || "", starters.map((one) => [one.label, one.key || "", one.kind || ""]), recent.map((work) => [work.work_id, work.title, work.state, markOf(work)])]);
    if (emptyList.dataset.signature === signature) return;
    emptyList.dataset.signature = signature;
    const parts = [];
    if (starters.length) {
      parts.push(el("p", "assistant-empty-title", readText("workbench.assistant-tabs.start-page")));
      starters.forEach((starter) => {
        const btnEl = el("button", "assistant-start"); btnEl.type = "button";
        btnEl.append(el("span", "assistant-start-title", starter.label));
        if (starter.kind) btnEl.append(el("span", "assistant-start-state", starter.kind));
        if (starter.hint) btnEl.title = starter.hint;
        btnEl.addEventListener("click", () => { if (useStarter(starter)) input.focus(); });
        parts.push(btnEl);
      });
    }
    if (project?.id) {
      const auto = el("button", "assistant-start"); auto.type = "button"; auto.dataset.automationOpen = project.id;
      auto.append(el("span", "assistant-start-title", readText("workbench.automation.title")));
      parts.push(auto);
    }
    if (recent.length) {
      parts.push(el("p", "assistant-empty-title", readText("workbench.assistant-tabs.continue-recent-work")));
      recent.forEach((work) => {
        const btnEl = el("button", "assistant-start assistant-start--work"); btnEl.type = "button";
        const mark = markOf(work); if (mark) btnEl.dataset.mark = mark;
        btnEl.append(el("span", "assistant-tab-mark"), el("span", "assistant-start-title", work.title), el("span", "assistant-start-state", stateLabel(work.state)));
        btnEl.addEventListener("click", () => { void switchTo(work.work_id); });
        parts.push(btnEl);
      });
    }
    parts.push(el("p", "assistant-empty-hint", readText("workbench.assistant-tabs.type-bring-project-content-use-capability-method-drop")));
    emptyList.replaceChildren(...parts);
  }

  /* ─── The event the conversation is about (specs/work-line §4.4) ──────── */
  // With an event in front the conversation column is the conversation about it — the latest work the person said about it (it
  // \`serves\` the event), or none yet — and the information column says what is known about it. Which events were opened is this
  // page's own. An event that is one of the Assistant's own works is that work. (Declarations, so the parts above may name them.)
  function eventKey(subject) { return subject.kind + ":" + subject.id; }
  function eventOf(key = curEvent) { return eventTabs.find((one) => one.key === key) || null; }
  function aboutEvent(subject) {
    return works.filter((work) => !work.archived && !work.main && !work.delegated_by && (work.serves || []).some((one) => one.kind === subject.kind && one.id === subject.id))
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))[0] || null;
  }
  function showEvent(key) { if (curEvent !== key) nextChar = undefined; return showWork(aboutEvent(eventOf(key).subject)?.work_id || null, key); }
  // \`quiet\`: its page came in front (a tab pressed), so the conversation follows without opening or taking the words from that page.
  function openEvent(event, quiet) {
    if (!quiet) { askAssistant(); setPanel(true); }
    if (event.subject.kind === WORK_KIND) return switchTo(event.subject.id);
    const key = eventKey(event.subject), had = eventOf(key);
    if (had) Object.assign(had, event); else eventTabs.push({ key, ...event });
    while (eventTabs.length > MAX_EVENTS) eventTabs.splice(eventTabs.findIndex((one) => one.key !== key && one.key !== curEvent), 1);
    return showEvent(key);
  }
  // Putting an event away (its information was parked in the side panel) goes back to now: the main conversation.
  function closeEvent(key) { eventTabs = eventTabs.filter((one) => one.key !== key); if (curEvent === key) { fresh = false; void showWork(null); } else drawHead(); }
  // What a page hands over is about its object, not the main conversation (WLN-33): the object's event when the line shows it
  // (the conversation already about it), a work of its own otherwise — which is then an event of its own.
  function aboutObject(object) {
    const event = object ? host.lineEvent?.({ kind: object.kind, id: object.id }) : null;
    return event ? openEvent(event) : startFresh();
  }
  // What is known about the event in front (WLN-08, WLN-09), at the head of the information column: an event, or a work of the
  // Assistant's own that is an event. The foot draws it — what is asked of the person, who registered it, the display the platform
  // composes from what its owner declared, the tasks done for it — as it draws the same parked in the side panel. Nothing here
  // knows a kind of event or a plugin.
  const eventCard = island.querySelector("[data-assistant-event-card]");
  let cardFor = null, cardHandle = null;
  function eventSurface() {
    const front = host.lineCard && eventCard ? eventOf() : null, work = !front && host.lineCard && eventCard && curId ? workById(curId) : null;
    const own = work && !work.main ? host.lineEvent?.({ kind: WORK_KIND, id: curId }) : null;
    const about = front ? { subject: front.subject, title: front.title, mark: front.mark, composed: true } : own ? { ...own, composed: false } : null, key = about ? eventKey(about.subject) : null;
    if (key !== cardFor) { cardHandle?.destroy(); cardHandle = null; cardFor = key; if (about) cardHandle = host.lineCard(eventCard, about); }
  }
  // 「发给」 a counterpart (WLN-40): the Assistant (null) or a Character. Its standing main conversation comes in front; a Character
  // not spoken to yet is kept as the one the next Send goes to, with a draft of its own, and the Host opens its conversation then.
  function talkTo(ref) {
    const standing = ref ? mains().find((work) => roleKey(work.character?.ref) === roleKey(ref.ref)) : null;
    fresh = false; nextChar = ref && !standing ? ref : null;
    talkDraft = roleKey(nextChar?.ref);
    if (nextChar) { nextScope = project ? "project" : "personal"; nextExec = "assistant"; }
    return switchTo(standing ? standing.work_id : null).then(() => { drawHead(); paintAim(); paintSum(); input.focus(); });
  }
  /* ─── Where a handed-out task went (WLN-32) ────────────────────────────── */
  // Under the reply that handed a task to the background: which event it is done for, with 「改」. The foot draws the row
  // (the event's name is the line's) and 「改」 opens the task's card in the information column's place, where it can go elsewhere.
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
  // waits. 「去处理」 opens the event; nothing opens or takes the caret by itself.
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
    // (A work of the Assistant's own gets its information once the line has read it.)
    if (!cardFor && curId && !curEvent) { eventSurface(); drawHead(); }
    // A task came to wait on the person, or no longer does: the line takes the table first, then the rows are drawn again.
    if (host.lineWaiting) setTimeout(() => {
      if (waitingHere() && JSON.stringify(host.lineWaiting().map((row) => [row.key, row.settled])) !== waitingShown) render();
    }, 0);
    const table = event.detail?.tasks, handed = curId && view?.delegated;
    if (!table || !handed) return;
    if (handed.some((child) => { const task = table.tasks.find((one) => one.subject.kind === WORK_KIND && one.subject.id === child.work_id); return task && String(task.serves.map(eventKey).sort()) !== String(ownKeys(child)); })) void reload();
  }
  document.addEventListener("molis-work:attention", placedMoved);`;
