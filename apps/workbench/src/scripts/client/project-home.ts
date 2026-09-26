import { HOME_OFFERS_FACTORY_SCRIPT } from "./home-offers.js";
import { HOME_TALK_FACTORY_SCRIPT } from "./home-talk.js";
import { HOME_SHORTCUTS_FACTORY_SCRIPT } from "./project-home-shortcuts.js";
import { createHomeFlow } from "../../home-flow.js";

/** Date cards, today's events, and the event dock. Shortcuts stay at the bottom of the day column. */
export const PROJECT_HOME_FACTORY_SCRIPT = `(host) => {
  const { getState, translate: L, openItem, openPlugin, openTarget, feedApi, messageApi } = host;
  (${HOME_SHORTCUTS_FACTORY_SCRIPT})({ root: document.querySelector('[data-work-surface="home"]'), translate: L,
    projectKey: getState().project?.project_id || getState().snapshot.board.board_id });
  const home = document.querySelector('[data-work-surface="home"]');
  if (!home) return null;
  const homeFlow = (${createHomeFlow.toString()})();
  const locale = document.documentElement.lang || "zh-CN";
  let dayId = "";
  let dayPinned = false;
  let eventId = "";
  let eventRows = [], eventWindow = null, eventIssues = [], loadingEvents = true, syncInFlight = null, refreshAgain = false;
  let opening = '', navigationError = '';
  let events = [];
  let days = [];
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const ico = (name) => '<svg aria-hidden="true"><use href="#icon-' + esc(document.getElementById('icon-' + name) ? name : 'inbox') + '"></use></svg>';
  const $ = (sel, root) => (root || home).querySelector(sel);
  const $$ = (sel, root) => [...(root || home).querySelectorAll(sel)];
  const labels = {
    todayEmpty: L("今天还没有事件走进来"),
    empty: L("这一天没有事件"),
    todaySum: L("今天接到 {n} 件事"),
    daySum: L("这一天有 {n} 件事"),
    attentionLead: L("有事项需要处理。"),
    emptyLead: L("插件提供的新事项和待处理事项会出现在这里。"),
  };
  const collect = () => {
    const now = new Date();
    days = homeFlow.buildHomeDays(now, locale);
    events = homeFlow.projectHomeEvents({ now, locale, events: eventRows });
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
  const closeTalk = (returnToTrigger = false) => {
    const pop = $("[data-home-talk]");
    const restoreFocus = returnToTrigger || pop?.contains(document.activeElement);
    pop?.classList.remove("is-on");
    pop?.setAttribute("hidden", "");
    home.dataset.dock = "closed";
    if (restoreFocus) requestAnimationFrame(() => { if (home.dataset.dock === "closed" && eventId) $("[data-home-open-talk]")?.focus(); });
  };
  // On a wide home the detail column is part of the page: the top item opens there until the person closes it.
  let eventDismissed = false;
  const autoOpenEvent = () => {
    if (eventId || eventDismissed || home.hidden || home.getBoundingClientRect().width < 1080) return;
    const first = listOf()[0];
    if (first) openEvent(first.id);
  };
  const closeEvent = () => {
    eventId = "";
    home.dataset.event = "off";
    closeTalk();
  };
  const placeTalk = () => {
    const pop = $("[data-home-talk]");
    const bar = $(".home-detail__primary") || $("[data-home-detail-act]");
    if (!pop || !bar || home.dataset.dock !== "open") return;
    pop.removeAttribute("hidden");
    const r = bar.getBoundingClientRect();
    const ar = home.getBoundingClientRect();
    pop.style.width = Math.round(r.width) + "px";
    pop.style.left = Math.round(r.left - ar.left) + "px";
    const gap = 8;
    pop.style.maxHeight = Math.round(Math.max(160, Math.min(520, r.top - ar.top - gap - 8))) + "px";
    // Anchor the compose row while asynchronous content or native details expand above it.
    pop.style.top = "auto";
    pop.style.bottom = Math.round(ar.bottom - r.top + gap) + "px";
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
    const dayChanged = hero.dataset.day !== dayId;
    hero.dataset.day = dayId;
    hero.className = "home-hero home-enter";
    const hour = new Date().getHours();
    const [greeting, daylight] = hour >= 5 && hour < 11 ? [L("早上好"), "yellow"] : hour >= 11 && hour < 13 ? [L("中午好"), "orange"]
      : hour >= 13 && hour < 18 ? [L("下午好"), "orange"] : hour >= 18 && hour < 23 ? [L("晚上好"), "indigo"] : [L("夜深了"), "purple"];
    hero.innerHTML =
      (day.today ? '<p class="craft-greeting" style="--craft-daylight: var(--hue-' + daylight + '-fill)">' + esc(greeting) + "</p>" : "") +
      '<h1 class="home-hero__date"><time data-home-date datetime="' + stamp + '">' +
        esc(new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(stamp + "T12:00:00"))) +
        "</time><span>" + esc(day.week) + "</span>" +
        (day.today ? '<b class="home-hero__today">' + L("今天") + "</b>" : "") + "</h1>" +
      '<h2 class="home-hero__sum">' + esc(loadingEvents && !eventRows.length ? L("正在读取事项…") : eventIssues.length && !eventRows.length ? L("事项暂时无法完整读取") : summary.sum) + "</h2>" +
      '<p class="home-hero__lead">' + esc(summary.lead) + "</p>" +
      '<div data-home-event-status role="status">' + eventIssues.map(issue => '<p>' + esc(issue) + '</p>').join('') +
      (eventIssues.length ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-events-reload>' + L('重新读取') + '</button>' : '') + '</div>' +
      (list.length ? '<p class="home-hero__stats"><span>' + L("个人") + ' <b>' + summary.me + '</b></span><span>' + L("组织") + ' <b>' + summary.org + '</b></span></p>' : '');
    if (dayChanged) enter(hero); else hero.classList.add("is-in");
  };
  const renderList = () => {
    const list = listOf();
    const rows = $("[data-home-list]");
    const day = days.find((item) => item.id === dayId);
    $("[data-home-list-count]").textContent = list.length ? String(list.length) : "";
    if (!list.length) {
      if (loadingEvents || eventIssues.length) {
        rows.innerHTML = '<p class="home-tl__empty" role="status">' + esc(L(loadingEvents ? '正在读取事项…' : '部分事项暂不可读取，请重新读取。')) + '</p>';
        return;
      }
      const starts = [
        { plugin: 'goals', title: '推进一个目标', copy: '明确要做成什么，接着往下走。', icon: 'target' },
        { plugin: 'pages', title: '写一份文档', copy: '把思路写下来，逐步整理成作品。', icon: 'file' },
        { plugin: 'lingguang', title: '记下一点灵感', copy: '还没想清楚，也可以先留下。', icon: 'idea' },
      ].filter(item => document.querySelector('[data-plugin-id="' + item.plugin + '"]'));
      rows.innerHTML = '<div class="home-start"><h3>' + L('从这里开始') + '</h3><p>' + L('选一件想做的事，或继续已有的工作。') + '</p><div class="home-start-actions">' +
        starts.map(item => '<button type="button" class="home-start-action" data-home-start="' + item.plugin + '">' + ico(item.icon) + '<span><strong>' + L(item.title) + '</strong><small>' + L(item.copy) + '</small></span>' + ico('arrow') + '</button>').join('') +
        '<button type="button" class="mw-btn mw-btn--ghost home-start-browse" data-home-start="market">' + L('浏览更多工具') + ico('arrow') + '</button></div></div>';
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
        ' data-home-subject-kind="' + esc(event.subject.kind) + '" data-home-subject-id="' + esc(event.subject.id) + '"' +
        ' style="--node: var(--plugin-' + event.plugin + ', var(--muted))">' +
        '<span class="home-erow__when">' + esc(event.when) + "</span>" +
        '<span class="home-erow__node"><i class="home-erow__dot"></i></span>' +
        '<span class="home-erow__main"><strong>' + esc(event.title) + "</strong>" +
          "<small>" + ico(event.kind === "org" ? "review" : "user") +
          (event.kind === "org" ? L("组织") : L("个人")) + " · " + esc(event.lead) + "</small></span>" +
        '<span class="home-erow__src">' + ico(event.icon) + esc(event.origin.title) + "</span>" +
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
      '<span class="home-detail__src">' + ico(event.icon) + esc(event.origin.title) + "</span>" +
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
    const left = event.open ? '<button class="mw-btn mw-btn--primary" type="button" data-home-open-target' + (opening === event.id ? ' disabled' : '') + '>' + ico("arrow") +
      esc(opening === event.id ? L('正在打开…') : L(event.open.label)) + '</button>' : '';
    const footer = $("[data-home-detail-act]");
    if (!$(".home-detail__primary", footer)) footer.innerHTML =
      '<div data-home-offers></div><p data-home-navigation-error role="alert" hidden></p><div class="home-detail__primary"><div class="home-detail__act-left"></div>' +
      '<button class="mw-btn mw-btn--ghost" type="button" data-home-open-talk>' + ico("message") + L("说一句") + "</button></div>";
    const leftNode = $(".home-detail__act-left", footer);
    const mode = JSON.stringify([event.id, event.open, opening === event.id]);
    if (leftNode.dataset.mode !== mode) { leftNode.innerHTML = left; leftNode.dataset.mode = mode; }
    $("[data-home-open-talk]", footer).setAttribute("aria-pressed", String(talkOn));
    const error = $('[data-home-navigation-error]', footer); error.hidden = !navigationError; error.innerHTML = navigationError ? esc(navigationError) + ' <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-events-reload>' + L('重新读取') + '</button>' : '';
    offers.render();
    $("[data-home-talk-ctx]").textContent = event.title ? "· " + event.title : "";
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
    navigationError = '';
    home.dataset.event = "on";
    render();
  };
  const openTalk = () => {
    if (!current()) return;
    if (home.dataset.dock === "open") { closeTalk(); renderDetail(); return; }
    home.dataset.dock = "open";
    renderDetail();
    talk.open();
    requestAnimationFrame(() => {
      placeTalk();
      $("[data-home-talk-form] textarea")?.focus();
    });
  };
  const openEventTarget = async () => {
    const event = current(); if (!event?.open || !eventWindow || opening) return;
    opening = event.id; navigationError = ''; renderDetail();
    try {
      const result = await feedApi('/api/home/events/open', 'POST', { window: eventWindow, source: event.source, event_id: event.event_id, target: event.open });
      if (current()?.id === event.id) openTarget?.(result.target);
    } catch (error) { if (current()?.id === event.id) navigationError = error.message || L('无法打开事项，请重新读取'); }
    finally { opening = ''; if (current()?.id === event.id) renderDetail(); }
  };
  const talk = (${HOME_TALK_FACTORY_SCRIPT})({ root: home, current, translate: L, prepareApi: feedApi, messageApi,
    projectKey: getState().project?.project_id || getState().snapshot.board.board_id, openItem, openPlugin, layout: placeTalk });
  const offers = (${HOME_OFFERS_FACTORY_SCRIPT})({ root: home, current, translate: L, api: feedApi,
    projectKey: getState().project?.project_id || getState().snapshot.board.board_id, refresh: () => sync() });
  new ResizeObserver(placeTalk).observe($("[data-home-detail-act]"));
  home.addEventListener("click", async (event) => {
    const start = event.target.closest('[data-home-start]');
    if (start) { openPlugin?.(start.dataset.homeStart); return; }
    if (event.target.closest('[data-home-events-reload]')) { await sync(); return; }
    const dayBtn = event.target.closest("[data-home-day]");
    if (dayBtn) {
      dayId = dayBtn.dataset.homeDay;
      dayPinned = true;
      closeEvent();
      render();
      autoOpenEvent();
      return;
    }
    const openEv = event.target.closest("[data-home-open-event]");
    if (openEv) { openEvent(openEv.dataset.homeOpenEvent); return; }
    if (event.target.closest("[data-home-close-event]")) { eventDismissed = true; closeEvent(); render(); return; }
    if (event.target.closest("[data-home-open-talk]")) { openTalk(); return; }
    if (event.target.closest("[data-home-close-talk]")) { closeTalk(true); renderDetail(); return; }
    if (event.target.closest("[data-home-open-target]")) { await openEventTarget(); return; }
    if (!event.composedPath().includes($("[data-home-talk]")) && !event.target.closest("[data-home-open-talk]") && home.dataset.dock === "open") {
      closeTalk();
      if (eventId) renderDetail();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (home.hidden) return;
    if (event.key === "Escape") {
      if (home.dataset.dock === "open") { closeTalk(true); if (eventId) renderDetail(); }
      else if (eventId) { eventDismissed = true; closeEvent(); render(); }
    }
  });
  addEventListener("resize", () => { if (home.dataset.dock === "open") placeTalk(); });
  const sync = () => {
    if (syncInFlight) { refreshAgain = true; return syncInFlight; }
    syncInFlight = (async () => {
      do {
        refreshAgain = false;
        const window = homeFlow.buildHomeWindow(new Date());
        loadingEvents = true; render();
        try {
          const result = await feedApi('/api/home/events', 'POST', window);
          eventRows = result.events; eventIssues = result.issues; eventWindow = window;
          collect(); offers.refresh();
        } catch (error) { eventRows = []; eventWindow = null; eventIssues = [error.message || L('暂时无法读取事项')]; }
        finally { loadingEvents = false; render(); autoOpenEvent(); }
      } while (refreshAgain);
    })().finally(() => { syncInFlight = null; });
    return syncInFlight;
  };
  render();
  sync();
  setInterval(() => {
    if (!document.hidden && document.body.dataset.desktopSurface === "home" && !home.hidden) sync();
  }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
  return { sync };
}`;
