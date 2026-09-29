import { HOME_OFFERS_FACTORY_SCRIPT } from "./home-offers.js";
import { HOME_TALK_FACTORY_SCRIPT } from "./home-talk.js";
import { HOME_SHORTCUTS_FACTORY_SCRIPT } from "./project-home-shortcuts.js";
import { createHomeFlow } from "../../home-flow.js";

/**
 * Today's heading, the day strip, the Goal in progress, the day's events that open in place, and the margin
 * (a note kept in this browser and the things at hand). One detail node moves into whichever row is open.
 */
export const PROJECT_HOME_FACTORY_SCRIPT = `(host) => {
  const { getState, translate: L, openItem, openPlugin, openTarget, feedApi, messageApi } = host;
  (${HOME_SHORTCUTS_FACTORY_SCRIPT})({ root: document.querySelector('[data-work-surface="home"]'), translate: L,
    projectKey: getState().project?.project_id || getState().snapshot.board.board_id });
  const home = document.querySelector('[data-work-surface="home"]');
  if (!home) return null;
  const homeFlow = (${createHomeFlow.toString()})();
  const locale = document.documentElement.lang || "zh-CN";
  const projectKey = getState().project?.project_id || getState().snapshot.board.board_id;
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
  const detailNode = $("[data-home-detail]");
  const detailHolder = $("[data-home-detail-holder]");
  const scroller = $("[data-home-scroll]");
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
  const closeEvent = () => {
    eventId = "";
    home.dataset.event = "off";
    closeTalk();
  };
  // The Talk sheet rises from the open event's action row. When that row is out of view (a smaller window, a
  // resize) it is brought into view first; the sheet never leaves the home.
  const placeTalk = (reveal) => {
    const pop = $("[data-home-talk]");
    const bar = $(".home-detail__primary") || $("[data-home-detail-act]");
    if (!pop || !bar || home.dataset.dock !== "open") return;
    pop.removeAttribute("hidden");
    const ar = home.getBoundingClientRect();
    let r = bar.getBoundingClientRect();
    if (reveal === true && scroller) {
      const sr = scroller.getBoundingClientRect();
      if (r.bottom > sr.bottom || r.top < sr.top + 160) { scroller.scrollTop += r.bottom - sr.bottom + 12; r = bar.getBoundingClientRect(); }
    }
    const width = Math.min(Math.max(280, r.width), ar.width - 16);
    pop.style.width = Math.round(width) + "px";
    pop.style.left = Math.round(Math.max(8, Math.min(r.left - ar.left, ar.width - width - 8))) + "px";
    const gap = 8;
    const anchor = Math.max(ar.top + 168, Math.min(r.top, ar.bottom - 8));
    pop.style.maxHeight = Math.round(Math.max(160, Math.min(520, anchor - ar.top - gap - 8))) + "px";
    // Anchor the compose row while asynchronous content or native details expand above it.
    pop.style.top = "auto";
    pop.style.bottom = Math.round(ar.bottom - anchor + gap) + "px";
  };
  const shortWeek = (id) => new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(id + "T12:00:00"));
  const renderDates = () => {
    $("[data-home-dates]").innerHTML = days.map((day) => {
      const list = homeFlow.eventsOnDay(events, day.id);
      const count = list.length ? " · " + L("{n} 件事").replace("{n}", String(list.length)) : "";
      return '<button class="home-day" type="button" data-home-day="' + day.id + '" aria-label="' + esc(day.week + " " + day.n + (day.today ? " · " + L("今天") : "") + count) + '">' +
        '<span class="home-day__w">' + esc(shortWeek(day.id)) + '</span><b class="home-day__n">' + day.n + '</b>' +
        (day.today ? '<em class="home-day__today">' + L("今天") + '</em>' : '<span class="home-day__dots">' + dotsHTML(list) + '</span>') + '</button>';
    }).join("");
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
    hero.className = "home-heading home-hero home-enter";
    const hour = new Date().getHours();
    const greeting = hour >= 5 && hour < 11 ? L("早上好") : hour >= 11 && hour < 13 ? L("中午好")
      : hour >= 13 && hour < 18 ? L("下午好") : hour >= 18 && hour < 23 ? L("晚上好") : L("夜深了");
    const date = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(new Date(stamp + "T12:00:00"));
    const sum = loadingEvents && !eventRows.length ? L("正在读取事项…") : eventIssues.length && !eventRows.length ? L("事项暂时无法完整读取") : summary.sum;
    hero.innerHTML =
      '<div class="home-heading__main"><h1>' + esc(day.today ? L("今天的工作") : L("{date}的工作").replace("{date}", date)) + '</h1>' +
      '<p class="home-heading__sub">' + (day.today ? '<span class="craft-greeting">' + esc(greeting) + '</span><i>·</i>' : '') +
        '<time data-home-date datetime="' + stamp + '">' + esc(L("{week}，{date}").replace("{week}", day.week).replace("{date}", date)) + '</time><i>·</i>' +
        '<span class="home-hero__sum">' + esc(sum) + '</span>' +
        (list.length ? '<i>·</i><span class="home-hero__lead">' + esc(summary.lead) + '</span>' : '') + '</p>' +
      '<div data-home-event-status role="status">' + eventIssues.map(issue => '<p>' + esc(issue) + '</p>').join('') +
      (eventIssues.length ? '<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-home-events-reload>' + L('重新读取') + '</button>' : '') + '</div></div>' +
      '<p class="home-month">' + ico("calendar") + esc(new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(new Date(stamp + "T12:00:00"))) + '</p>';
    $("[data-home-list-stats]").innerHTML = list.length
      ? L("个人") + ' <b>' + summary.me + '</b> · ' + L("组织") + ' <b>' + summary.org + '</b>'
      : '';
    if (dayChanged) enter(hero); else hero.classList.add("is-in");
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
      '<span class="home-focus__status' + (moving ? '' : ' is-attention') + '"><i></i>' + esc(moving ? L("进行中") : pick.status_label) + '</span></div>' +
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
      paint('<div class="home-start">' + (otherDay
          ? '<h3>' + L('这一天还没有事件') + '</h3><p>' + L('已有工作仍在，可以从当前目标继续，或从这里开始一件新的事。') + '</p>' +
            '<button type="button" class="mw-btn mw-btn--secondary home-start-today" data-home-today>' + ico("back") + L('回到今天') + '</button>'
          : '<h3>' + L('从这里开始') + '</h3><p>' + L('选一件想做的事，或继续已有的工作。') + '</p>') + '<div class="home-start-actions">' +
        starts.map(item => '<button type="button" class="home-start-action" data-home-start="' + item.plugin + '"><span class="home-erow__icon">' + ico(item.icon) + '</span><span><strong>' + L(item.title) + '</strong><small>' + L(item.copy) + '</small></span>' + ico('arrow') + '</button>').join('') +
        '<button type="button" class="mw-btn mw-btn--ghost home-start-browse" data-home-start="market">' + L('浏览更多工具') + ico('arrow') + '</button></div></div>');
      return;
    }
    const nowAt = Date.now(), nowLabel = homeFlow.clockLabel(new Date(nowAt));
    const nowLine = '<div class="home-tl__now"><span>' + L("此刻") + " " + nowLabel + "</span><u></u></div>";
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
    const slot = $("[data-home-slot]", rows);
    if (slot && detailNode.parentElement !== slot) slot.append(detailNode);
    if (!slot) parkDetail();
  };
  const renderDetail = () => {
    const event = current();
    if (!event) return;
    $("[data-home-detail-head]", detailNode).innerHTML =
      '<span class="home-detail__src">' + ico(event.icon) + esc(event.origin.title) + "</span>" +
      "<time>" + esc(event.when) + "</time>" +
      '<button class="mw-btn mw-btn--ghost mw-btn--icon-only mw-btn--sm" type="button" data-home-close-event aria-label="' + L("收起详情") + '">' + ico("x") + "</button>";
    $("[data-home-detail-body]", detailNode).innerHTML =
      "<h2>" + esc(event.title) + "</h2>" +
      '<p class="home-detail__kind">' + ico(event.kind === "org" ? "review" : "user") +
        (event.kind === "org" ? L("组织事件") : L("个人事件")) + "</p>" +
      '<p class="home-detail__text">' + esc(event.text) + "</p>" +
      '<dl class="home-detail__facts">' + event.facts.map((fact) =>
        "<div><dt>" + esc(fact[0]) + "</dt><dd>" + esc(fact[1]) + "</dd></div>").join("") + "</dl>";
    const talkOn = home.dataset.dock === "open";
    const left = event.open ? '<button class="mw-btn mw-btn--primary" type="button" data-home-open-target' + (opening === event.id ? ' disabled' : '') + '>' + ico("arrow") +
      esc(opening === event.id ? L('正在打开…') : L(event.open.label)) + '</button>' : '';
    const footer = $("[data-home-detail-act]", detailNode);
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
  // The things at hand: the plugins kept in the Dock, then the person's own shortcuts.
  const QUICK_CAPTIONS = { goals: "找到下一步", feed: "阅读与留下", inbox: "处理待办", sessions: "回到会话", pages: "继续写作", schedule: "看看安排", lingguang: "记下灵感", shelf: "放进来的材料" };
  const renderQuick = () => {
    const list = $("[data-home-quick]");
    const seen = new Set();
    const entries = [...document.querySelectorAll('[data-dock-pins] [data-dock-pin]')].map((pin) => pin.dataset.dockPin)
      .filter((id) => id && id !== "home" && !seen.has(id) && seen.add(id)).slice(0, 3)
      .map((id) => {
        const source = document.querySelector('[data-plugin-picker-popover] [data-plugin-id="' + id + '"]') || document.querySelector('[data-dock-pin="' + id + '"]');
        const name = (source?.textContent?.trim() || source?.getAttribute("title") || source?.getAttribute("aria-label") || id).replace(/^.*[：:]\s*/, "").trim();
        const glyph = source?.querySelector("use")?.getAttribute("href")?.replace("#icon-", "") || "grid";
        return { id, name, glyph };
      });
    const html = entries.map((entry) => '<li><button type="button" class="home-quick__item" data-home-quick-open="' + esc(entry.id) + '">' +
      '<span class="home-shortcut-icon">' + ico(entry.glyph) + '</span><span class="home-quick__text">' + esc(entry.name) +
      (QUICK_CAPTIONS[entry.id] ? '<small>' + esc(L(QUICK_CAPTIONS[entry.id])) + '</small>' : '') + '</span>' + ico("chevron-right") + '</button></li>').join("");
    if (list.dataset.html !== html) { list.innerHTML = html; list.dataset.html = html; }
  };
  // A private scratch note for this project, kept only in this browser.
  const noteKey = "molis-work:home-note:" + projectKey;
  const note = $("[data-home-note]"), noteState = $("[data-home-note-state]");
  const readNote = () => { try { return localStorage.getItem(noteKey) || ""; } catch { return ""; } };
  note.value = readNote();
  const showNoteState = (saved) => { noteState.textContent = saved ? L("已保存在此浏览器") : L("只在此浏览器保存"); };
  showNoteState(!!note.value);
  let noteTimer = 0;
  note.addEventListener("input", () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      try { if (note.value) localStorage.setItem(noteKey, note.value); else localStorage.removeItem(noteKey); showNoteState(!!note.value); }
      catch { noteState.textContent = L("此浏览器无法保存"); }
    }, 300);
  });
  const render = () => {
    collect();
    renderDates();
    renderHero();
    renderFocus();
    renderList();
    if (eventId) renderDetail();
    renderQuick();
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
      placeTalk(true);
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
    projectKey, openItem, openPlugin, layout: placeTalk });
  const offers = (${HOME_OFFERS_FACTORY_SCRIPT})({ root: home, current, translate: L, api: feedApi,
    projectKey, refresh: () => sync() });
  new ResizeObserver(placeTalk).observe($("[data-home-detail-act]"));
  scroller?.addEventListener("scroll", () => { if (home.dataset.dock === "open") placeTalk(); }, { passive: true });
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
    if (event.target.closest('[data-home-events-reload]')) { await sync(); return; }
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
      else if (eventId) { closeEvent(); render(); }
    }
  });
  addEventListener("resize", () => { if (home.dataset.dock === "open") placeTalk(true); });
  // Leaving Home folds the open event away; coming back shows the day as a list again.
  new MutationObserver(() => { if (document.body.dataset.desktopSurface !== "home" && eventId) { closeEvent(); render(); } })
    .observe(document.body, { attributes: true, attributeFilter: ["data-desktop-surface"] });
  const sync = () => {
    // A request still in flight must not hold the clock: the day turns over now, events follow when they arrive.
    if (syncInFlight) { refreshAgain = true; render(); return syncInFlight; }
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
        finally { loadingEvents = false; render(); }
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
