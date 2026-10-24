import { HOME_OFFERS_FACTORY_SCRIPT } from "./home-offers.js";
import { HOME_SHORTCUTS_FACTORY_SCRIPT } from "./project-home-shortcuts.js";
import { createHomeFlow } from "../../home-flow.js";

/**
 * Today's heading, the day strip, the Goal in progress, the day's events that open in place, and the margin
 * (the things at hand). One detail node moves into whichever row is open.
 */
export const PROJECT_HOME_FACTORY_SCRIPT = `(host) => {
  const { getState, translate: L, openItem, openPlugin, openTarget, api } = host;
  (${HOME_SHORTCUTS_FACTORY_SCRIPT})({ root: document.querySelector('[data-work-surface="home"]'), translate: L,
    projectKey: getState().project?.project_id || getState().snapshot.board.project_id });
  const home = document.querySelector('[data-work-surface="home"]');
  if (!home) return null;
  const homeFlow = (${createHomeFlow.toString()})();
  const locale = document.documentElement.lang || "zh-CN";
  const projectKey = getState().project?.project_id || getState().snapshot.board.project_id;
  let dayId = "";
  let dayPinned = false;
  let eventId = "";
  let eventRows = [], eventWindow = null, eventIssues = [], loadingEvents = true, syncInFlight = null, refreshAgain = false;
  let opening = '', navigationError = '';
  const issueText=value=>typeof value==='string'?value:molisWorkRequest.text(value);
  let events = [];
  let days = [];
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const writeHTML = (node, html) => {
    if (!node || node.dataset.html === html) return false;
    node.innerHTML = html;
    node.dataset.html = html;
    return true;
  };
  const ico = (name) => '<svg aria-hidden="true"><use href="#icon-' + esc(document.getElementById('icon-' + name) ? name : 'inbox') + '"></use></svg>';
  const $ = (sel, root) => (root || home).querySelector(sel);
  const $$ = (sel, root) => [...(root || home).querySelectorAll(sel)];
  const detailNode = $("[data-home-detail]");
  const detailHolder = $("[data-home-detail-holder]");
  const labels = {
    todayEmpty: L("今天还没有事件走进来"),
    empty: L("这一天没有事件"),
    todaySum: (n) => L("今天接到 {n} 件事", { n }),
    daySum: (n) => L("这一天有 {n} 件事", { n }),
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
  const closeEvent = () => {
    eventId = "";
    home.dataset.event = "off";
  };
  const shortWeek = (id) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(id + "T12:00:00"));
  const renderDates = () => {
    writeHTML($("[data-home-dates]"), days.map((day) => {
      const list = homeFlow.eventsOnDay(events, day.id);
      const count = list.length ? " · " + L("{n} 件事", { n: list.length }) : "";
      return '<button class="home-day" type="button" data-home-day="' + day.id + '" aria-label="' + esc(day.week + " " + day.n + (day.today ? " · " + L("今天") : "") + count) + '">' +
        '<span class="home-day__w">' + esc(shortWeek(day.id)) + '</span><b class="home-day__n">' + day.n + '</b>' +
        (day.today ? '<em class="home-day__today">' + L("今天") + '</em>' : '<span class="home-day__dots">' + dotsHTML(list) + '</span>') + '</button>';
    }).join(""));
    $$("[data-home-day]").forEach((btn) => {
      const on = btn.dataset.homeDay === dayId;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    $("[data-home-today]").setAttribute("aria-pressed", String(dayId === homeFlow.civilKey(new Date())));
  };
  const renderHero = () => {
    const day = days.find((item) => item.id === dayId) || days.find((item) => item.today);
    const list = listOf();
    const summary = homeFlow.summarizeDay(day, list, labels);
    const stamp = day.id;
    const hero = $("[data-home-hero]");
    const dayChanged = hero.dataset.day !== dayId;
    hero.dataset.day = dayId;
    if (dayChanged) { hero.className = "home-heading home-hero home-enter"; enter(hero); }
    const hour = new Date().getHours();
    const greeting = hour >= 5 && hour < 11 ? L("早上好") : hour >= 11 && hour < 13 ? L("中午好")
      : hour >= 13 && hour < 18 ? L("下午好") : hour >= 18 && hour < 23 ? L("晚上好") : L("夜深了");
    const date = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(stamp + "T12:00:00"));
    const sum = loadingEvents && !eventRows.length ? L("正在读取事项…") : eventIssues.length && !eventRows.length ? L("事项暂时无法完整读取") : summary.sum;
    const html =
      '<div class="home-heading__main"><h1>' + esc(day.today ? L("今天的工作") : L("{date}的工作").replace("{date}", date)) + '</h1>' +
      '<p class="home-heading__sub">' + (day.today ? '<span class="craft-greeting">' + esc(greeting) + '</span><i>·</i>' : '') +
        '<time data-home-date datetime="' + stamp + '">' + esc(L("{week}，{date}").replace("{week}", day.week).replace("{date}", date)) + '</time><i>·</i>' +
        '<span class="home-hero__sum">' + esc(sum) + '</span>' +
        (list.length ? '<i>·</i><span class="home-hero__lead">' + esc(summary.lead) + '</span>' : '') + '</p>' +
      '<div data-home-event-status role="status">' + eventIssues.map(issue => '<p>' + esc(issueText(issue)) + '</p>').join('') +
      (eventIssues.length ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-events-reload>' + L('重新读取') + '</button>' : '') + '</div></div>' +
      '<p class="home-month">' + ico("calendar") + esc(new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(stamp + "T12:00:00"))) + '</p>';
    if (writeHTML(hero, html)) {
      const problems=[...hero.querySelectorAll('[data-home-event-status] p')];eventIssues.forEach((issue,index)=>{if(typeof issue!=='string' && problems[index])molisWorkRequest.show(problems[index],issue);});
    }
    writeHTML($("[data-home-list-stats]"), list.length
      ? L("个人") + ' <b>' + summary.me + '</b> · ' + L("组织") + ' <b>' + summary.org + '</b>'
      : '');
    if (!dayChanged) hero.classList.add("is-in");
  };
  // The Goal in progress: the project's active Goal while it is moving, otherwise the first moving Goal, otherwise
  // the first waiting on a decision. Nothing is shown when no Goal is in play.
  const flatGoals = () => {
    const out = [];
    const walk = (items) => (items || []).forEach((item) => { out.push(item); walk(item.children); });
    walk(getState().goals);
    return out;
  };
  let focusGoalId = "";
  const renderFocus = () => {
    const card = $("[data-home-focus]");
    const goals = flatGoals();
    const active = goals.find((item) => item.goal.goal_id === getState().active_goal_id);
    const pick = (active && active.status === "in_progress" ? active : null)
      || goals.find((item) => item.status === "in_progress")
      || goals.find((item) => item.status === "waiting_user");
    if (!pick) { card.hidden = true; card.innerHTML = ""; focusGoalId = ""; return; }
    focusGoalId = pick.goal.goal_id;
    const children = pick.children || [];
    const done = children.filter((child) => child.status === "completed").length;
    const progress = children.length
      ? '<span class="home-focus__progress"><span class="home-focus__bar"><span style="width:' + Math.round(done / children.length * 100) + '%"></span></span>' +
        esc(L("{done} / {total} 个子目标已完成").replace("{done}", String(done)).replace("{total}", String(children.length))) + '</span>'
      : '';
    const moving = pick.status === "in_progress";
    const html = '<div class="home-focus__top"><span>' + ico("target") + esc(moving ? L("正在推进") : L("等你决定")) + '</span>' +
      '<span class="home-focus__status' + (moving ? '' : ' is-attention') + '" data-mw-state="' + (moving ? 'doing' : 'approval') + '">' + esc(moving ? L("进行中") : pick.status_label) + '</span></div>' +
      '<h2 id="home-focus-title">' + esc(pick.goal.title) + '</h2>' +
      (pick.goal.outcome ? '<p>' + esc(pick.goal.outcome) + '</p>' : '') +
      '<div class="home-focus__bottom"><button class="mw-btn mw-btn--primary" type="button" data-home-focus-open>' + esc(moving ? L("继续这个目标") : L("去做决定")) + ico("arrow") + '</button>' + progress + '</div>' +
      '<div class="home-focus__art" aria-hidden="true"><span class="home-focus__sheet is-back"></span><span class="home-focus__sheet is-front"><i></i><i></i><i></i>' +
        '<b>' + ico("check") + '<i></i></b><b>' + ico("check") + '<i></i></b><b class="is-open">' + ico("circle") + '<i></i></b></span></div>';
    if (card.dataset.html !== html) { card.innerHTML = html; card.dataset.html = html; }
    card.hidden = false;
  };
  let arrivedAs = null, paintedRows = null;
  const parkDetail = () => { if (detailNode.parentElement !== detailHolder) detailHolder.append(detailNode); };
  const renderList = () => {
    const list = listOf();
    const rows = $("[data-home-list]");
    const day = days.find((item) => item.id === dayId);
    // Rows arrive once per day shown: the first load and a change of day play the cascade. A refresh or a click
    // leaves identical rows untouched and redraws changed ones quietly.
    const arrival = dayId + (list.length ? "" : ":empty");
    const paint = (html) => {
      if (html !== paintedRows) {
        parkDetail();
        rows.toggleAttribute("data-arrive", arrival !== arrivedAs);
        rows.innerHTML = html;
        paintedRows = html;
      }
      arrivedAs = arrival;
    };
    $("[data-home-list-count]").textContent = list.length ? String(list.length) : "";
    if (!list.length) {
      parkDetail();
      if (loadingEvents || eventIssues.length) {
        // An error names what happened and offers the retry right where the events would be.
        paint('<p class="home-tl__empty' + (loadingEvents ? ' mw-loading' : '') + '" role="status">' + esc(L(loadingEvents ? '正在读取事项…' : '部分事项暂不可读取，请重新读取。')) + '</p>' +
          (loadingEvents ? '' : '<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm home-tl__retry" data-home-events-reload>' + ico('refresh') + L('重新读取') + '</button>'));
        return;
      }
      // An empty day keeps the ways to start something; another day also offers the way back to today.
      const otherDay = !day?.today;
      const starts = [
        { plugin: 'goals', title: '推进一个目标', copy: '明确要做成什么，接着往下走。', icon: 'target' },
        { plugin: 'pages', title: '写一份文档', copy: '把思路写下来，逐步整理成作品。', icon: 'file' },
        { plugin: 'lingguang', title: '记下一点灵感', copy: '还没想清楚，也可以先留下。', icon: 'idea' },
      ].filter(item => document.querySelector('[data-plugin-id="' + item.plugin + '"]'));
      // The ways to start are one row of small buttons; the sentence of each is its hint.
      const chip = (attrs, glyph, label, hint) => '<button type="button" class="home-start-action" ' + attrs + (hint ? ' title="' + esc(L(hint)) + '"' : '') + '>' + ico(glyph) + '<span>' + esc(L(label)) + '</span></button>';
      paint('<div class="home-start"><p class="home-start__lead">' + (otherDay
          ? '<b>' + L('这一天还没有事件') + '</b>' + L('已有工作仍在，可以从当前目标继续，或从这里开始一件新的事。')
          : L('选一件想做的事，或继续已有的工作。')) + '</p><div class="home-start-actions">' +
        (otherDay ? chip('data-home-today', 'back', '回到今天') : '') +
        starts.map(item => chip('data-home-start="' + item.plugin + '"', item.icon, item.title, item.copy)).join('') +
        chip('data-home-start="market"', 'grid', '浏览更多工具') + '</div></div>');
      return;
    }
    const nowAt = Date.now();
    const nowLine = '<div class="home-tl__now" data-home-now><span></span><u></u></div>';
    let html = "";
    let nowDrawn = false;
    list.forEach((event) => {
      if (day?.today && !nowDrawn && event.at > nowAt) {
        html += nowLine;
        nowDrawn = true;
      }
      const open = event.id === eventId;
      html += '<div class="home-erow-wrap' + (open ? ' is-open' : '') + '">' +
        '<button class="home-erow' + (open ? ' is-on' : '') + '" type="button" data-home-open-event="' + esc(event.id) + '" data-k="' + event.kind + '"' +
        ' data-home-subject-kind="' + esc(event.subject.kind) + '" data-home-subject-id="' + esc(event.subject.id) + '" aria-expanded="' + open + '">' +
        '<time class="home-erow__when">' + esc(event.when) + "</time>" +
        '<span class="home-erow__icon">' + ico(event.icon) + '</span>' +
        '<span class="home-erow__main"><strong>' + esc(event.title) + "</strong>" +
          "<small>" + (event.kind === "org" ? L("组织") : L("个人")) + " · " + esc(event.lead) + '<span class="home-erow__src"> · ' + esc(event.origin.title) + "</span></small></span>" +
        '<span class="home-erow__chev">' + ico("chevron-down") + '</span>' +
        "</button>" + (open ? '<div class="home-erow__slot" data-home-slot></div>' : '') + '</div>';
    });
    // Everything today has already happened: "now" comes after the last of it.
    if (day?.today && !nowDrawn) html += nowLine;
    paint(html);
    const nowNode = $("[data-home-now] span", rows);
    if (nowNode) nowNode.textContent = L("此刻") + " " + homeFlow.clockLabel(new Date(nowAt));
    const slot = $("[data-home-slot]", rows);
    if (slot && detailNode.parentElement !== slot) slot.append(detailNode);
    if (!slot) parkDetail();
  };
  const renderDetail = () => {
    const event = current();
    if (!event) return;
    writeHTML($("[data-home-detail-head]", detailNode),
      '<span class="home-detail__src">' + ico(event.icon) + esc(event.origin.title) + "</span>" +
      "<time>" + esc(event.when) + "</time>" +
      '<button class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" type="button" data-home-close-event aria-label="' + L("收起详情") + '">' + ico("x") + "</button>");
    writeHTML($("[data-home-detail-body]", detailNode),
      "<h2>" + esc(event.title) + "</h2>" +
      '<p class="home-detail__kind">' + ico(event.kind === "org" ? "review" : "user") +
        (event.kind === "org" ? L("组织事件") : L("个人事件")) + "</p>" +
      '<p class="home-detail__text">' + esc(event.text) + "</p>" +
      '<dl class="home-detail__facts">' + event.facts.map((fact) =>
        "<div><dt>" + esc(fact[0]) + "</dt><dd>" + esc(fact[1]) + "</dd></div>").join("") + "</dl>");
    const left = event.open ? '<button class="mw-btn mw-btn--primary" type="button" data-home-open-target' + (opening === event.id ? ' disabled' : '') + '>' + ico("arrow") +
      esc(opening === event.id ? L('正在打开…') : L(event.open.label)) + '</button>' : '';
    const footer = $("[data-home-detail-act]", detailNode);
    if (!$(".home-detail__primary", footer)) footer.innerHTML =
      '<div data-home-offers></div><p data-home-navigation-error role="alert" hidden></p><div class="home-detail__primary"><div class="home-detail__act-left"></div>' +
      "</div>";
    const leftNode = $(".home-detail__act-left", footer);
    const mode = JSON.stringify([event.id, event.open, opening === event.id]);
    if (leftNode.dataset.mode !== mode) { leftNode.innerHTML = left; leftNode.dataset.mode = mode; }
    const error = $('[data-home-navigation-error]', footer); error.hidden = !navigationError; error.innerHTML = navigationError ? esc(issueText(navigationError)) + ' <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-events-reload>' + L('重新读取') + '</button>' : '';
    if(navigationError && typeof navigationError!=='string'){const retry=error.querySelector('button');molisWorkRequest.show(error,navigationError);if(retry)error.append(retry);}
    offers.render();
  };
  // The things at hand: the plugins kept in the Dock, then the person's own shortcuts.
  const QUICK_CAPTIONS = { goals: "找到下一步", feed: "阅读与留下", inbox: "处理待办", pages: "继续写作", schedule: "看看安排", lingguang: "记下灵感" };
  const renderQuick = () => {
    const list = $("[data-home-quick]");
    const seen = new Set();
    const entries = [...document.querySelectorAll('[data-dock-pins] [data-dock-pin]')].map((pin) => pin.dataset.dockPin)
      .filter((id) => id && id !== "home" && !seen.has(id) && seen.add(id)).slice(0, 3)
      .map((id) => {
        const source = document.querySelector('[data-plugin-picker-popover] [data-plugin-id="' + id + '"]') || document.querySelector('[data-dock-pin="' + id + '"]');
        // A switcher entry is a name plus one line of hint; only the name is the shortcut's title.
        const name = (source?.querySelector("span")?.textContent?.trim() || source?.textContent?.trim() || source?.getAttribute("title") || source?.getAttribute("aria-label") || id).replace(/^.*[：:]\s*/, "").trim();
        const glyph = source?.querySelector("use")?.getAttribute("href")?.replace("#icon-", "") || "grid";
        return { id, name, glyph };
      });
    const html = entries.map((entry) => '<li><button type="button" class="home-quick__item" data-home-quick-open="' + esc(entry.id) + '">' +
      '<span class="home-shortcut-icon">' + ico(entry.glyph) + '</span><span class="home-quick__text">' + esc(entry.name) +
      (QUICK_CAPTIONS[entry.id] ? '<small>' + esc(L(QUICK_CAPTIONS[entry.id])) + '</small>' : '') + '</span>' + ico("chevron-right") + '</button></li>').join("");
    if (list.dataset.html !== html) { list.innerHTML = html; list.dataset.html = html; }
  };
  const render = () => {
    collect();
    renderDates();
    renderHero();
    renderFocus();
    renderList();
    if (eventId) renderDetail();
    renderQuick();
  };
  const openEvent = (id) => {
    if (!events.some((event) => event.id === id)) return;
    eventId = id;
    navigationError = '';
    home.dataset.event = "on";
    render();
  };
  const openEventTarget = async () => {
    const event = current(); if (!event?.open || !eventWindow || opening) return;
    opening = event.id; navigationError = ''; renderDetail();
    try {
      const result = await api('/api/home/events/open', 'POST', { window: eventWindow, source: event.source, event_id: event.event_id, target: event.open });
      if (current()?.id === event.id) openTarget?.(result.target);
    } catch (error) { if (current()?.id === event.id) navigationError=error; }
    finally { opening = ''; if (current()?.id === event.id) renderDetail(); }
  };
  const offers = (${HOME_OFFERS_FACTORY_SCRIPT})({ root: home, current, translate: L, api: api,
    projectKey, refresh: () => sync() });
  home.addEventListener("click", async (event) => {
    const start = event.target.closest('[data-home-start]');
    if (start) { openPlugin?.(start.dataset.homeStart); return; }
    const quick = event.target.closest('[data-home-quick-open]');
    if (quick) { openPlugin?.(quick.dataset.homeQuickOpen); return; }
    if (event.target.closest('[data-home-focus-open]')) {
      const item = flatGoals().find((goal) => goal.goal.goal_id === focusGoalId);
      if (item) openItem?.("goals", item.goal.goal_id, item.goal.title);
      return;
    }
    if (event.target.closest('[data-home-events-reload]')) { await sync(true); return; }
    if (event.target.closest('[data-home-today]')) {
      dayId = homeFlow.civilKey(new Date());
      dayPinned = false;
      closeEvent();
      render();
      return;
    }
    const dayBtn = event.target.closest("[data-home-day]");
    if (dayBtn) {
      dayId = dayBtn.dataset.homeDay;
      dayPinned = true;
      closeEvent();
      render();
      return;
    }
    const openEv = event.target.closest("[data-home-open-event]");
    if (openEv) {
      if (openEv.dataset.homeOpenEvent === eventId) { closeEvent(); render(); openEv.isConnected && openEv.focus(); }
      else openEvent(openEv.dataset.homeOpenEvent);
      return;
    }
    if (event.target.closest("[data-home-close-event]")) {
      const id = eventId; closeEvent(); render();
      $$("[data-home-open-event]").find((row) => row.dataset.homeOpenEvent === id)?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-home-open-target]")) { await openEventTarget(); return; }
  });
  document.addEventListener("keydown", (event) => {
    if (home.hidden) return;
    if (event.key === "Escape" && eventId) { closeEvent(); render(); }
  });
  // Leaving Home folds the open event away; coming back shows the day as a list again.
  new MutationObserver(() => { if (document.body.dataset.desktopSurface !== "home" && eventId) { closeEvent(); render(); } })
    .observe(document.body, { attributes: true, attributeFilter: ["data-desktop-surface"] });
  let syncVisible = false;
  const sync = (visible = false) => {
    // A request still in flight must not hold the clock: the day turns over now, events follow when they arrive.
    syncVisible = syncVisible || visible;
    if (syncInFlight) { refreshAgain = true; render(); return syncInFlight; }
    syncInFlight = (async () => {
      do {
        const showLoading = syncVisible || !eventWindow;
        syncVisible = false;
        refreshAgain = false;
        // Draw the new day before asking. Loading replaces the day only the first time, or when the person asks again.
        if (showLoading) loadingEvents = true;
        render();
        const window = homeFlow.buildHomeWindow(new Date());
        try {
          const result = await api('/api/home/events', 'POST', window);
          eventRows = result.events; eventIssues = result.issues; eventWindow = window;
          collect(); offers.refresh();
        } catch (error) {
          if (showLoading) { eventRows = []; eventWindow = null; eventIssues = [error]; }
        } finally { loadingEvents = false; render(); }
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
