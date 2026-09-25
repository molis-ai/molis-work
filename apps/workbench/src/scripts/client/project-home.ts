import { HOME_SHORTCUTS_FACTORY_SCRIPT } from "./project-home-shortcuts.js";
import { createHomeFlow } from "../../home-flow.js";

/** Date cards, today's events, and the event dock. Shortcuts stay at the bottom of the day column. */
export const PROJECT_HOME_FACTORY_SCRIPT = `(host) => {
  const { getState, translate: L, route, openItem, openPlugin, openFeedSource, feedApi } = host;
  (${HOME_SHORTCUTS_FACTORY_SCRIPT})({ root: document.querySelector('[data-work-surface="home"]'), translate: L,
    projectKey: getState().project?.project_id || getState().snapshot.board.board_id });
  const home = document.querySelector('[data-work-surface="home"]');
  if (!home) return null;
  const homeFlow = (${createHomeFlow.toString()})();
  const locale = document.documentElement.lang || "zh-CN";
  const PLUGIN_ICON = { inbox: "inbox", feed: "rss", sessions: "terminal", goals: "target" };
  const PLUGIN_LABEL = { inbox: "Inbox", feed: "Feed", sessions: "Sessions", goals: "Goals" };
  let dayId = "";
  let dayPinned = false;
  let eventId = "";
  let sessions = [];
  let feedState = getState().feed || { inbox_entries: [], feed_items: [], sources: [] };
  let events = [];
  let days = [];
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const ico = (name) => '<svg aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
  const $ = (sel, root) => (root || home).querySelector(sel);
  const $$ = (sel, root) => [...(root || home).querySelectorAll(sel)];
  const labels = {
    todayEmpty: L("今天还没有事件走进来"),
    empty: L("这一天没有事件"),
    todaySum: L("今天接到 {n} 件事"),
    daySum: L("这一天有 {n} 件事"),
    authLead: L("有来源需要重新授权。"),
    emptyLead: L("接到的 Inbox、Session 和需要授权的来源会出现在这里。"),
  };
  const goalsOf = () => [...(getState().goals || []), ...(getState().archived_goals || []), ...(getState().trashed_goals || [])]
    .map((view) => ({ goal_id: view.goal.goal_id, title: view.goal.title }));
  const collect = () => {
    const now = new Date();
    const feed = feedState;
    days = homeFlow.buildHomeDays(now, locale);
    events = homeFlow.buildHomeEvents({
      now, locale,
      inbox: (feed.inbox_entries || []).map((entry) => ({
        ...entry,
        suggested_behavior_ids: entry.home_dock_suggested_behavior_ids || [],
      })),
      feedItems: (feed.feed_items || []).map((item) => ({
        item_id: item.item_id, title: item.title, summary: item.summary || null, body: item.body || null,
        source_id: item.source_id, source_kind: item.source_kind, source_label: item.source_label,
        imported_at: item.imported_at, source_created_at: item.source_created_at,
        author: item.author || null, url: item.url || null, linked_goal_id: item.linked_goal_id || null,
        suggested_behavior_ids: item.home_dock_suggested_behavior_ids || [],
      })),
      sources: (feed.sources || []).map((source) => ({
        source_id: source.source_id, name: source.name, kind: source.kind, status: source.status,
        last_sync_at: source.last_sync_at, last_error_code: source.last_error_code, last_outcome: source.last_outcome,
      })),
      sessions, goals: goalsOf(),
    });
    if (!dayPinned || !days.some((day) => day.id === dayId)) {
      dayId = homeFlow.civilKey(now);
      dayPinned = false;
    }
    if (eventId && !events.some((event) => event.id === eventId)) closeEvent();
  };
  const listOf = () => homeFlow.eventsOnDay(events, dayId);
  const current = () => events.find((event) => event.id === eventId) || null;
  const enter = (el) => {
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) { el?.classList.add("is-in"); return; }
    el.classList.remove("is-in");
    void el.offsetWidth;
    el.classList.add("is-in");
  };
  const dotsHTML = (list) => list.length
    ? list.slice(0, 4).map((event) => '<i data-k="' + event.kind + '"></i>').join("") + (list.length > 4 ? '<u></u>' : "")
    : "";
  const closeTalk = () => {
    const pop = $("[data-home-talk]");
    pop?.classList.remove("is-on");
    pop?.setAttribute("hidden", "");
    home.dataset.dock = "closed";
  };
  const closeEvent = () => {
    eventId = "";
    home.dataset.event = "off";
    closeTalk();
  };
  const placeTalk = () => {
    const pop = $("[data-home-talk]");
    const bar = $("[data-home-detail-act]");
    if (!pop || !bar || home.dataset.dock !== "open") return;
    pop.removeAttribute("hidden");
    const r = bar.getBoundingClientRect();
    const ar = home.getBoundingClientRect();
    pop.style.width = Math.round(r.width) + "px";
    pop.style.left = Math.round(r.left - ar.left) + "px";
    const gap = 8;
    pop.style.maxHeight = Math.round(Math.max(160, r.top - ar.top - gap - 8)) + "px";
    const h = pop.offsetHeight || 220;
    let top = r.top - ar.top - h - gap;
    if (top < 8) top = 8;
    pop.style.top = Math.round(top) + "px";
  };
  const renderDates = () => {
    const now = new Date();
    $("[data-home-month]").textContent = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(now);
    $("[data-home-dates]").innerHTML = days.map((day) =>
      '<button class="home-day" type="button" data-home-day="' + day.id + '">' +
      '<span class="home-day__n"><b>' + day.n + "</b><em>" + esc(day.w) + "</em>" + (day.today ? "<s></s>" : "") + "</span>" +
      '<span class="home-day__dots"></span></button>'
    ).join("");
    $$("[data-home-day]").forEach((btn) => {
      const on = btn.dataset.homeDay === dayId;
      const list = homeFlow.eventsOnDay(events, btn.dataset.homeDay);
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", String(on));
      btn.querySelector(".home-day__dots").innerHTML = dotsHTML(list);
    });
  };
  const renderHero = () => {
    const day = days.find((item) => item.id === dayId) || days.find((item) => item.today);
    const list = listOf();
    const summary = homeFlow.summarizeDay(day, list, labels);
    const stamp = day.id;
    const hero = $("[data-home-hero]");
    hero.className = "home-hero home-enter";
    hero.innerHTML =
      '<p class="home-hero__eyebrow">' + ico(day.today ? "sun" : "calendar") +
        esc(new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(stamp + "T12:00:00"))) +
        (day.today ? " · " + L("此刻") + " " + homeFlow.clockLabel(new Date()) : "") + "</p>" +
      '<h1 class="home-hero__date"><time data-home-date datetime="' + stamp + '">' +
        esc(new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(stamp + "T12:00:00"))) +
        "</time><span>" + esc(day.week) + "</span>" +
        (day.today ? '<b class="home-hero__today">' + L("今天") + "</b>" : "") + "</h1>" +
      '<h2 class="home-hero__sum">' + esc(summary.sum) + "</h2>" +
      '<p class="home-hero__lead">' + esc(summary.lead) + "</p>" +
      '<div class="home-hero__stats">' +
        (list.length
          ? "<span><b>" + list.length + "</b> " + L("件") + "</span>" +
            "<span><i></i>" + L("个人") + " <b>" + summary.me + "</b></span>" +
            '<span><i data-k="org"></i>' + L("组织") + " <b>" + summary.org + "</b></span>"
          : "<span>" + L("没有事件走进来") + "</span>") +
      "</div>";
    enter(hero);
  };
  const renderList = () => {
    const list = listOf();
    const rows = $("[data-home-list]");
    const day = days.find((item) => item.id === dayId);
    $("[data-home-list-count]").textContent = list.length ? String(list.length) : "";
    if (!list.length) {
      rows.innerHTML = '<p class="home-tl__empty">' + ico("calendar") + esc(L("这一天还空着。")) + "</p>";
      return;
    }
    const nowLabel = homeFlow.clockLabel(new Date());
    let html = "";
    let nowDrawn = false;
    list.forEach((event, index) => {
      if (day?.today && !nowDrawn && event.when > nowLabel) {
        html += '<div class="home-tl__now"><b></b><i></i><em><u></u><span>' + L("此刻") + " " + nowLabel + "</span></em></div>";
        nowDrawn = true;
      }
      html += '<button class="home-erow' + (index === 0 ? " is-first" : "") + (index === list.length - 1 ? " is-last" : "") + '"' +
        ' type="button" data-home-open-event="' + esc(event.id) + '" data-k="' + event.kind + '"' +
        ' style="--node: var(--plugin-' + event.plugin + ', var(--muted))">' +
        '<span class="home-erow__when">' + esc(event.when) + "</span>" +
        '<span class="home-erow__node"><i class="home-erow__dot"></i></span>' +
        '<span class="home-erow__main"><strong>' + esc(event.title) + "</strong>" +
          "<small>" + ico(event.kind === "org" ? "review" : "user") +
          (event.kind === "org" ? L("组织") : L("个人")) + " · " + esc(event.lead) + "</small></span>" +
        '<span class="home-erow__src">' + ico(PLUGIN_ICON[event.plugin] || event.icon) + esc(PLUGIN_LABEL[event.plugin] || event.plugin) + "</span>" +
        "</button>";
    });
    rows.innerHTML = html;
    $$("[data-home-open-event]").forEach((btn) => btn.classList.toggle("is-on", btn.dataset.homeOpenEvent === eventId));
  };
  const renderDetail = () => {
    const event = current();
    if (!event) return;
    $("[data-home-detail]").style.setProperty("--node", "var(--plugin-" + event.plugin + ", var(--muted))");
    $("[data-home-detail-head]").innerHTML =
      '<span class="home-detail__src">' + ico(PLUGIN_ICON[event.plugin] || event.icon) + esc(PLUGIN_LABEL[event.plugin] || event.plugin) + "</span>" +
      "<time>" + esc(event.when) + "</time>" +
      '<button class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" type="button" data-home-close-event aria-label="' + L("收起详情") + '">' + ico("x") + "</button>";
    $("[data-home-detail-body]").innerHTML =
      "<h2>" + esc(event.title) + "</h2>" +
      '<p class="home-detail__kind">' + ico(event.kind === "org" ? "review" : "user") +
        (event.kind === "org" ? L("组织事件") : L("个人事件")) + "</p>" +
      '<p class="home-detail__text">' + esc(event.text) + "</p>" +
      '<dl class="home-detail__facts">' + event.facts.map((fact) =>
        "<div><dt>" + esc(fact[0]) + "</dt><dd>" + esc(fact[1]) + "</dd></div>").join("") + "</dl>";
    const talkOn = home.dataset.dock === "open";
    const canDone = event.inbox && (event.inbox.status === "open" || event.inbox.status === "in_progress");
    const defaults = event.act === "reauth"
      ? ["feed.reauth", "home.ask"]
      : (canDone ? ["home.continue", "inbox.done"] : ["home.continue"]);
    const subjects = [];
    if (event.inbox) subjects.push("inbox_entry");
    if (event.act === "reauth") subjects.push("source");
    else if (event.plugin === "feed" || (event.open && event.open.plugin === "feed")) subjects.push("feed_item");
    if (event.plugin === "sessions") subjects.push("session");
    const catalog = getState().function_scenes?.dock_behaviors || [];
    const offered = catalog.length
      ? catalog.filter((row) => (row.subject_kinds || []).some((kind) => subjects.includes(kind)))
        .map((row) => row.behavior_id)
      : defaults;
    const kept = (event.suggested_behavior_ids || []).filter((id) => offered.includes(id) && id !== "home.talk");
    const picked = kept.length ? kept : defaults;
    const shown = picked.filter((id) => !(id === "feed.open" && picked.includes("home.continue")));
    const titleOf = (id) => {
      const row = catalog.find((item) => item.behavior_id === id);
      return L(row?.title || ({
        "feed.reauth": "重新授权",
        "home.ask": "问问怎么回事",
        "inbox.done": "做完了",
        "inbox.dismiss": "忽略",
        "feed.open": "打开",
        "home.continue": "接着做",
      })[id] || id);
    };
    const button = (id) => {
      const label = titleOf(id);
      if (id === "feed.reauth") return '<button class="mw-btn mw-btn--primary" type="button" data-home-behavior="feed.reauth" data-home-reauth>' + ico("link") + label + "</button>";
      if (id === "home.ask") return '<button class="mw-btn mw-btn--secondary" type="button" data-home-behavior="home.ask" data-home-ask>' + label + "</button>";
      if (id === "inbox.done") return '<button class="mw-btn mw-btn--secondary" type="button" data-home-behavior="inbox.done" data-home-done>' + ico("check") + label + "</button>";
      if (id === "inbox.dismiss") return '<button class="mw-btn mw-btn--ghost" type="button" data-home-behavior="inbox.dismiss" data-home-dismiss>' + label + "</button>";
      if (id === "feed.open") return '<button class="mw-btn mw-btn--primary" type="button" data-home-behavior="feed.open" data-home-continue>' + ico("arrow") + label + "</button>";
      return '<button class="mw-btn mw-btn--primary" type="button" data-home-behavior="home.continue" data-home-continue>' + ico("arrow") + label + "</button>";
    };
    const left = shown.map(button).join("");
    $("[data-home-detail-act]").innerHTML =
      '<div class="home-detail__act-left">' + left + "</div>" +
      '<button class="mw-btn mw-btn--ghost" type="button" data-home-open-talk aria-pressed="' + String(talkOn) + '">' +
      ico("message") + L("说一句") + "</button>";
    $("[data-home-talk-ctx]").textContent = event.title ? "· " + event.title : "";
    $("[data-home-talk-body]").textContent = L("说一句会打开这条工作对应的 Session。首页不另开一套聊天。");
  };
  const render = () => {
    collect();
    renderDates();
    renderHero();
    renderList();
    if (eventId) renderDetail();
    if (home.dataset.dock === "open") requestAnimationFrame(placeTalk);
  };
  const openEvent = (id) => {
    if (!events.some((event) => event.id === id)) return;
    eventId = id;
    home.dataset.event = "on";
    render();
  };
  const openTalk = () => {
    if (!current()) return;
    if (home.dataset.dock === "open") { closeTalk(); renderDetail(); return; }
    home.dataset.dock = "open";
    renderDetail();
    requestAnimationFrame(() => {
      placeTalk();
      $("[data-home-talk-form] textarea")?.focus();
    });
  };
  const continueEvent = (event) => {
    if (!event?.open) return;
    if (event.open.sourceId && openFeedSource) openFeedSource(event.open.sourceId);
    else if (openItem) openItem(event.open.plugin, event.open.itemId, event.open.title);
    else if (openPlugin) openPlugin(event.open.plugin);
  };
  const talkFromEvent = (event) => {
    const sessionEvent = event.plugin === "sessions" ? event : events.find((row) => row.plugin === "sessions");
    if (sessionEvent?.open && openItem) openItem("sessions", sessionEvent.open.itemId, sessionEvent.open.title);
    else if (openPlugin) openPlugin("sessions");
  };
  home.addEventListener("click", async (event) => {
    const dayBtn = event.target.closest("[data-home-day]");
    if (dayBtn) {
      dayId = dayBtn.dataset.homeDay;
      dayPinned = true;
      closeEvent();
      render();
      return;
    }
    const openEv = event.target.closest("[data-home-open-event]");
    if (openEv) { openEvent(openEv.dataset.homeOpenEvent); return; }
    if (event.target.closest("[data-home-close-event]")) { closeEvent(); render(); return; }
    if (event.target.closest("[data-home-open-talk]")) { openTalk(); return; }
    if (event.target.closest("[data-home-close-talk]")) { closeTalk(); renderDetail(); return; }
    if (event.target.closest("[data-home-continue]")) { continueEvent(current()); return; }
    if (event.target.closest("[data-home-reauth]") || event.target.closest("[data-home-ask]")) {
      continueEvent(current());
      return;
    }
    const inboxAct = event.target.closest("[data-home-done], [data-home-dismiss]");
    if (inboxAct) {
      const currentEvent = current();
      if (!currentEvent?.inbox || !feedApi) return;
      const button = inboxAct;
      button.disabled = true;
      const status = inboxAct.matches("[data-home-dismiss]") ? "dismissed" : "done";
      try {
        const result = await feedApi("/api/inbox/entries/" + encodeURIComponent(currentEvent.inbox.entry_id) + "/status", "POST", {
          status,
          expected_revision: currentEvent.inbox.revision,
        });
        const entries = feedState.inbox_entries;
        const index = entries?.findIndex((entry) => entry.entry_id === currentEvent.inbox.entry_id);
        if (entries && index >= 0) entries[index] = { ...entries[index], ...(result.entry || {}), status };
        collect();
        const remaining = listOf().filter((row) => row.id !== currentEvent.id);
        if (remaining[0]) openEvent(remaining[0].id);
        else { closeEvent(); render(); }
      } catch (error) {
        const act = $("[data-home-detail-act]");
        let note = $("[data-home-detail-error]");
        if (!note) {
          note = document.createElement("p");
          note.className = "home-detail__error";
          note.dataset.homeDetailError = "";
          act?.before(note);
        }
        note.textContent = error.message || L("Inbox 操作失败");
        button.disabled = false;
      }
      return;
    }
    if (!event.target.closest("[data-home-talk], [data-home-open-talk]") && home.dataset.dock === "open") {
      closeTalk();
      if (eventId) renderDetail();
    }
  });
  $("[data-home-talk-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    talkFromEvent(current());
  });
  document.addEventListener("keydown", (event) => {
    if (home.hidden) return;
    if (event.key === "Escape") {
      if (home.dataset.dock === "open") { closeTalk(); if (eventId) renderDetail(); }
      else if (eventId) { closeEvent(); render(); }
    }
  });
  addEventListener("resize", () => { if (home.dataset.dock === "open") placeTalk(); });
  const sync = async () => {
    try {
      const headers = globalThis.molisWorkControlHeaders?.() || {};
      const [feedResponse, sessionResponse] = await Promise.all([
        fetch(route("/api/feed"), { cache: "no-store", headers }),
        fetch(route("/api/sessions"), { cache: "no-store", headers }),
      ]);
      if (feedResponse.ok) {
        const snapshot = await feedResponse.json();
        feedState = {
          inbox_entries: snapshot.inbox_entries || [],
          feed_items: snapshot.feed_items || [],
          sources: snapshot.sources || [],
        };
      }
      const sessionResult = sessionResponse.ok ? await sessionResponse.json() : { sessions: [] };
      sessions = Array.isArray(sessionResult.sessions) ? sessionResult.sessions : [];
    } catch {
      sessions = [];
    }
    render();
  };
  render();
  sync();
  setInterval(() => {
    if (!document.hidden && document.body.dataset.desktopSurface === "home" && !home.hidden) render();
  }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  return { sync };
}`;
