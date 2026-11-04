// 15 · 基础首页定样 — standalone prototype drawn with the component board's own parts (../kit/kit.js: renderButton,
// renderStatusMark, renderBadge, renderAlert, renderStateRing, renderToggleGroup, the mw-card, mw-tabs, mw-empty, mw-spinner
// and mw-toast markup, the icon sprite and the visual foundation client script). All data is sample data (data.js);
// nothing calls a model or a Home.
(() => {
  const D = window.bhData;
  const K = window.mwKit;
  document.getElementById("icons").innerHTML = window.mwKitSprite;

  const KEY = "molis-proto.basic-home.v2";
  const fresh = () => ({ sch: "B", lang: "zh", fault: "none", done: {}, tab: "home", view: "auto", chat: false, refreshed: false });
  let S = load(), toastT, refreshT, lastView = "";
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ ...S, busy: null })); } catch { /* storage unavailable: keep in memory */ } }
  const tr = (x) => (Array.isArray(x) ? x[S.lang === "en" ? 1 : 0] : x ?? "");
  const L = (zh, en) => (S.lang === "en" ? en : zh);
  const esc = K.escapeHtml;
  const F = (f) => S.fault === f;

  // ---------- the shared parts ----------
  const ic = (n, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (label, o = {}) => K.renderButton({
    label, variant: o.v || "secondary", size: "sm", icon: o.icon, iconOnly: o.iconOnly, loading: o.loading, disabled: o.disabled, className: o.cls,
    attrs: { "data-act": o.act, "data-id": o.id, "data-op": o.op, "data-pid": o.pid, "data-tab": o.tab, title: o.title },
  });
  const badge = (label, tone = "neutral") => K.renderBadge({ label, tone });
  const seg = (label, items) => K.renderToggleGroup({ label, items }).replace('data-slot="toggle-group"', 'data-slot="toggle-group" data-seg-thumb');
  const sim = () => badge(L("模拟", "Simulated"));

  const SCHEMES = () => ({ A: L("A 插件卡片表", "A Plugin card grid"), B: L("B 先等你和接着做，再插件卡片表", "B Waiting and continue first, then the plugin card grid"), C: L("C 今天的动静加插件栏", "C Today's activity with a plugin column") });
  const FAULTS = () => ({
    none: L("正常", "Normal"), empty: L("新项目，还没有内容", "New project, nothing yet"), unreadable: L("Goals 读不到", "Goals can't be read"),
    disabled: L("Inbox 已停用", "Inbox is turned off"), refresh: L("后台在刷新", "Refreshing in the background"),
    brief: L("装上了 Work Brief", "Work Brief installed"), brieffail: L("Work Brief 的首页打不开", "Work Brief's home fails"),
    busy: L("写文稿时装好了 Work Brief", "Work Brief finished installing while you write"),
  });
  const plugin = (id) => D.plugins.find((p) => p.id === id);
  const briefOn = () => (F("brief") || F("busy")) && S.view !== "basic";

  // ---------- objects with situation overrides ----------
  function obj(id) {
    const o = D.objects[id]; if (!o) return null;
    if (F("unreadable") && o.owner === "goals") return { ...o, state: "stale", time: ["2 小时前的值", "Value from 2 h ago"], ops: [{ id: "retry", t: ["再读一次", "Read again"] }] };
    if (F("refresh") && S.refreshed && id === "run") return { ...o, who: ["Coding 在做 · 第 4 步，共 5 步", "Coding working · step 4 of 5"], step: { n: 4, of: 5 }, changed: true };
    return o;
  }
  const visible = (id) => { const o = D.objects[id]; return o && !(F("disabled") && o.owner === "inbox") && !F("empty"); };
  // Object state → the shared status mark (ring family + tone); the words stay the caller's own.
  const STATE = () => ({
    decide: [L("要你决定", "Needs a decision"), "answer", "attention"], accept: [L("要你验收", "Needs review"), "approval", "attention"],
    failed: [L("失败", "Failed"), "failed", "blocked"], stale: [L("读不到", "Can't read"), "stale", "quiet"],
  });
  const stag = (o) => { const s = STATE()[o.state]; return s ? K.renderStatusMark({ label: s[0], state: s[1], tone: s[2] }) : ""; };
  const hueOf = (pid) => (plugin(pid)?.undeclared ? "none" : pid);
  const tile = (pid, sm = "") => `<span class="ptile ${sm}" data-hue="${hueOf(pid)}">${ic(plugin(pid)?.icon || "package")}</span>`;

  // ---------- operations ----------
  const opBtn = (id, op, i) => btn(tr(op.t), { v: i === 0 ? "primary" : "secondary", act: "op", id, op: op.id, loading: S.busy === `${id}:${op.id}` });
  const moreBtn = (id) => btn(L("更多", "More"), { v: "ghost", icon: "more", iconOnly: true, act: "more", id });
  function receipt(id) {
    const op = (obj(id).ops || []).find((x) => x.id === S.done[id]);
    return `<div class="receipt" role="status">${ic("check", "sm")}<span class="grow ell">${esc(tr(op.done))}</span>${op.undo ? btn(L("撤销", "Undo"), { v: "ghost", act: "undo", id }) : ""}</div>`;
  }

  // ---------- row (decided form B: the plugin tile leads) ----------
  // One filled primary per decision (DESIGN Buttons): a row in 等你 is a decision waiting on you, so its operation is primary;
  // elsewhere the row's operation is secondary and the page keeps its weight on what waits.
  function row(id, opts = {}) {
    const o = obj(id); if (!o) return "";
    if (S.done[id]) return receipt(id);
    const prim = (o.ops || [])[0];
    const judge = o.judge && !opts.compact ? `<span class="judge">${esc(tr(o.judge))}</span>` : "";
    const dup = o.dupOf && !opts.compact ? badge(L("同一件事 · Inbox", "Same matter · Inbox")) : "";
    const attr = o.attr ? badge(o.attr === "project" ? L("本项目", "This project") : L("个人", "Personal"), o.attr === "project" ? "info" : "neutral") : "";
    const time = opts.clock ? `<span class="t">${esc(o.at)}</span>` : "";
    const tag = stag(o);
    return `<div class="row${o.changed ? " is-landed" : ""}${o.state === "stale" ? " is-stale" : ""}">${time}${tile(o.owner)}<span class="tx"><button type="button" class="ttl" data-act="peek" data-id="${id}">${esc(tr(o.title))}</button><span class="meta">${tag ? `<span class="m-tag">${tag}</span>` : ""}<span>${esc(tr(o.time))}</span><span class="by">· ${esc(tr(o.who))}</span></span></span><span class="rt">${attr}${dup}${judge}${tag ? `<span class="d-tag">${tag}</span>` : ""}${prim ? opBtn(id, prim, opts.primary ? 0 : 1) : ""}${moreBtn(id)}</span></div>`;
  }
  const list = (ids, opts) => `<div class="list">${ids.map((id) => row(id, opts)).join("")}</div>`;

  // ---------- plugin cards ----------
  function pcardState(p) {
    if (p.undeclared) return "undeclared";
    if (F("empty")) return "empty";
    if (F("disabled") && p.id === "inbox") return "disabled";
    if (F("unreadable") && p.id === "goals") return "stale";
    return "ok";
  }
  function pcard(p, shown = []) {
    const st = pcardState(p);
    const off = st === "undeclared" || st === "disabled";
    const band = (extra = "") => `<header class="pband">${tile(p.id, "sm")}<b>${esc(tr(p.name))}</b><span class="grow"></span>${extra}</header>`;
    const card = (head, body) => `<article class="mw-card pcard${off ? " is-off" : ""}" data-hue="${hueOf(p.id)}">${head}<div class="pbody">${body}</div></article>`;
    const open = btn(tr(p.open), { act: "open", pid: p.id });
    if (st === "undeclared") return card(band(badge(L("没有声明首页内容", "No home content declared"))), `<p class="pov">${L("这个插件没有说它在首页上放什么，所以只给打开。", "This plugin hasn't said what it shows on the home page, so only Open.")}</p><div class="pfoot">${open}</div>`);
    if (st === "disabled") return card(band(K.renderStatusMark({ label: L("已停用", "Off"), state: "disabled", tone: "hold" })), `<p class="pov">${L("Inbox 已停用，它的内容都还在；启用后照常显示。这和「没有内容」不是一回事。", "Inbox is off; its content is kept and shows again once it's on. That's not the same as empty.")}</p><div class="pfoot">${btn(L("启用", "Turn on"), { act: "enable" })}</div>`);
    if (st === "empty") return card(band(), `<p class="pov">${L("还没有内容。", "Nothing here yet.")}</p><div class="pfoot">${btn(tr(p.start), { icon: "plus", act: "start", pid: p.id })}</div>`);
    const items = p.items.filter(visible).filter((id) => !shown.includes(id) && !shown.includes(D.objects[id].dupOf));
    const above = p.items.filter(visible).length - items.length;
    const stale = st === "stale" ? K.renderAlert({ tone: "warning", title: L("Goals 暂时读不到", "Goals can't be read right now"), body: L("下面是 2 小时前读到的内容，不是现在的。", "Below is what was read 2 hours ago, not the current state.") }) : "";
    const ov = `<p class="pov">${esc(tr(p.overview))}${p.overviewNote ? `<span class="faint"> · ${esc(tr(p.overviewNote))}</span>` : ""}</p>`;
    const rows = items.length ? `<div class="prows">${items.map((id) => row(id, { compact: true })).join("")}</div>` : "";
    const aboveNote = above ? `<p class="note">${ic("info", "sm")}${L(`另有 ${above} 件在上面「等你」「接着做」里`, `${above} more listed above under Waiting and Continue`)}</p>` : "";
    const retry = st === "stale" ? btn(L("再读一次", "Read again"), { v: "ghost", icon: "refresh", act: "retry" }) : "";
    return card(band(st === "stale" ? K.renderStatusMark({ label: L("读不到", "Can't read"), state: "stale", tone: "quiet" }) : ""), `${stale}${ov}${rows}${aboveNote}<div class="pfoot">${open}${retry}</div>`);
  }

  // ---------- shared pieces ----------
  const startBox = () => `<section class="start"><div class="mw-empty"><span class="mw-empty__mark">${K.icon("sparkles")}</span><strong>${L("从这里开始", "Start here")}</strong><p>${L("这个项目还没有内容。基础首页不用先配模型或生成简报。", "This project has nothing yet. The basic home doesn't need a model or a brief first.")}</p><div class="mw-empty__actions">${btn(L("带入资料", "Bring in material"), { v: "primary", icon: "upload", act: "start" })}${btn(L("开始一件工作", "Start a piece of work"), { icon: "sparkles", act: "start" })}${btn(L("添加插件", "Add a plugin"), { icon: "plus", act: "start" })}</div></div></section>`;
  function headHtml() {
    let status = `<span class="facts">${ic("info", "sm")}${L("基础首页只读各插件已有的内容，不调模型", "The basic home only reads what plugins already have; no model calls")}</span>`;
    if (F("refresh")) status = S.refreshed
      ? `<span class="facts">${K.renderStateRing({ state: "done", size: 14 })}${L("更新了 1 处", "1 update")}</span>`
      : `<span class="facts"><span class="mw-spinner" data-ring-mounted aria-hidden="true">${K.renderStateRing({ state: "running" })}</span>${L("正在更新…（已有内容不清空）", "Updating… (what's shown stays)")}</span>`;
    const back = (F("brief") || F("busy")) && S.view === "basic" ? btn(L("回到综合首页", "Back to comprehensive home"), { v: "ghost", act: "tobrief" }) : "";
    return `<header class="hhead"><div><time class="cap">${L("11 月 4 日 周二", "Tue, Nov 4")}</time><h1>${esc(tr(D.project))}</h1></div><span class="grow"></span>${status}${back}</header>`;
  }
  const banner = () => (F("brieffail") ? `<div class="banner tone-wait" role="status">${ic("circle-alert", "sm")}<span class="grow">${L("Work Brief 的首页没能打开，先显示基础首页。你的内容和已打开的标签都在。", "Work Brief's home didn't open, so this is the basic home. Your content and open tabs are all still there.")}</span>${btn(L("再试一次", "Try again"), { act: "retrybrief" })}</div>` : "");
  const sameNote = () => (visible("inbox") && !S.done.inbox ? `<p class="note">${ic("info", "sm")}${esc(tr(D.objects.inbox.sameNote))}</p>` : "");
  const hiddenNote = () => (F("disabled") ? `<p class="note">${ic("info", "sm")}${L("Inbox 已停用，它的 1 件没算进来。", "Inbox is off; its 1 item isn't counted.")}</p>` : "");
  const sec = (h, body, i) => `<section class="hsec rise" style="--i:${i}"><h2 class="hsec__h">${h}</h2>${body}</section>`;

  // ---------- option A: plugin card grid ----------
  const homeA = () => `${F("empty") ? startBox() : ""}<div class="pgrid rise">${D.plugins.map((p) => pcard(p)).join("")}</div>`;
  // ---------- option B (decided 2026-11-04): waiting + continue, then the full plugin card grid of A ----------
  function homeB() {
    const wait = D.waiting.filter(visible), cont = D.continueList.filter(visible);
    const n = wait.filter((id) => !S.done[id]).length;
    const waitSec = F("empty") ? "" : sec(`${L("等你", "Waiting on you")} ${badge(String(n), n ? "warning" : "neutral")}`, `${wait.length ? list(wait, { primary: true }) : `<p class="note">${L("没有等你的事。", "Nothing is waiting on you.")}</p>`}${sameNote()}${hiddenNote()}`, 0);
    const contSec = F("empty") ? startBox() : sec(L("接着做", "Continue"), list(cont), 1);
    // Rows already shown above are not repeated in the cards.
    const shown = F("empty") ? [] : [...wait, ...cont];
    return `${waitSec}${contSec}${sec(L("各插件", "Plugins"), `<div class="pgrid">${D.plugins.map((p) => pcard(p, shown)).join("")}</div>`, 2)}`;
  }
  // ---------- option C: today's activity + plugin column ----------
  function homeC() {
    const ev = D.timeline.filter(visible);
    const tl = F("empty") ? `<p class="note">${L("今天还没有动静。", "Nothing has happened today yet.")}</p>${startBox()}` : `${list(ev.slice().reverse(), { clock: true })}${sameNote()}${hiddenNote()}`;
    const side = D.plugins.map((p) => {
      const st = pcardState(p);
      const line = st === "undeclared" ? L("没有声明首页内容", "No home content declared") : st === "disabled" ? L("已停用 · 内容都还在", "Off · content kept") : st === "empty" ? L("还没有内容", "Nothing yet") : st === "stale" ? L("读不到 · 2 小时前：", "Can't read · 2 h ago: ") + tr(p.overview) : tr(p.overview);
      const act = st === "disabled" ? btn(L("启用", "Turn on"), { act: "enable" }) : st === "empty" ? btn(tr(p.start), { act: "start", pid: p.id }) : btn(L("打开", "Open"), { v: "ghost", act: "open", pid: p.id });
      return `<div class="row${st === "disabled" || st === "undeclared" ? " is-off" : ""}">${tile(p.id)}<span class="tx"><b class="ell">${esc(tr(p.name))}</b><span class="meta"><span>${esc(line)}</span></span></span>${act}</div>`;
    }).join("");
    return `<div class="cgrid">${sec(L("今天的动静", "Today"), tl, 0)}${sec(L("插件", "Plugins"), `<div class="list plist">${side}</div>`, 1)}</div>`;
  }

  // ---------- Work Brief's comprehensive home (simulated, same forms and facts) ----------
  function briefHome() {
    const b = D.brief;
    return `<header class="hhead"><div><time class="cap">${L("综合首页 · Work Brief 组织", "Comprehensive home · organised by Work Brief")}</time><h1>${esc(tr(b.title))}</h1></div><span class="grow"></span>${sim()}${btn(L("看基础首页", "See basic home"), { v: "ghost", act: "tobasic" })}</header>
      ${F("busy") ? `<div class="banner tone-info" role="status">${ic("info", "sm")}<span class="grow">${L("你在写文稿时 Work Brief 装好了；首页换成了它，文稿没被打断。", "Work Brief finished installing while you wrote; the home changed to it and your page wasn't interrupted.")}</span></div>` : ""}
      <p class="lede">${esc(tr(b.lede))}</p>${b.sections.map((s, i) => sec(esc(tr(s.h)), list(s.items.filter(visible)), i)).join("")}
      <p class="note">${ic("info", "sm")}${L("Work Brief 用同一套行与卡片、同一份事实；在这里验收，基础首页和对话里也跟着变。", "Work Brief uses the same rows and cards and the same facts; review here and the basic home and the conversation change too.")}</p>`;
  }

  // ---------- tabs, pages doc, assistant ----------
  function tabs() {
    const dot = F("busy") && S.tab !== "home" ? `<span class="tdot" title="${L("首页换成了 Work Brief 的综合首页，回来时再看", "The home changed to Work Brief's; see it when you're back")}"></span>` : "";
    const tab = (id, label, mark) => `<button type="button" role="tab" class="mw-tabs__tab${S.tab === id ? " is-active" : ""}" aria-selected="${S.tab === id}" data-act="tab" data-tab="${id}">${mark}${label}${id === "home" ? dot : ""}</button>`;
    return `<div class="tabbar"><div class="mw-tabs__list" role="tablist">${tab("home", L("首页", "Home"), ic("home", "sm"))}${tab("pages", L("发布说明", "Release notes"), tile("pages", "sm"))}</div></div>`;
  }
  const pagesDoc = () => `<div class="doc"><h1>${L("发布说明", "Release notes")}</h1><p class="cap">Pages · ${L("草稿，自动保存", "Draft, saved")}</p><div class="line" style="width:90%"></div><div class="line" style="width:76%"></div><h3>${L("已知问题", "Known issues")}</h3><div class="line" style="width:60%"></div><p>${L("手机上价格表第三列会掉行，", "On phones the third pricing column wraps,")}<span class="cur"></span></p></div>`;
  function chat() {
    const card = (id) => {
      const o = obj(id); if (!visible(id)) return "";
      if (S.done[id]) return receipt(id);
      const prim = (o.ops || [])[0];
      return `<article class="mw-card ccard" data-hue="${o.owner}"><header class="pband">${tile(o.owner, "sm")}<b>${esc(tr(plugin(o.owner).name))}</b><span class="cap ell">· ${esc(tr(o.time))}</span><span class="grow"></span>${stag(o)}</header><div class="mw-card__panel"><span class="tt">${esc(tr(o.title))}</span><p class="sum">${esc(tr(o.summary))}</p>${o.progress ? `<div class="meter"><span>${esc(tr(o.progress.label))} ${o.progress.done}/${o.progress.total}</span><span class="bar"><i style="width:${(o.progress.done / o.progress.total) * 100}%"></i></span></div>` : ""}<div class="acts">${prim ? opBtn(id, prim, 0) : ""}${moreBtn(id)}</div></div></article>`;
    };
    const who = `<span class="who">${ic("sparkles", "sm")}${L("助理", "Assistant")}</span>`;
    const conv = F("empty")
      ? `<div class="ai">${who}<p>${L("这个项目还空着。可以先带入资料，或者直接说你想做什么。", "This project is empty. Bring in material, or just say what you want to do.")}</p></div>`
      : `<div class="you">${L("今天有什么要我看的？", "Anything I should look at today?")}</div><div class="ai">${who}<p>${L("有两件等你：", "Two things are waiting on you:")}</p>${card("goal")}${card("inbox")}${F("disabled") ? `<p class="note">${L("Inbox 停用了，它的内容我看不到。", "Inbox is off, so I can't see its items.")}</p>` : ""}</div>`;
    return `<header class="chat-head">${L("助理", "Assistant")}<span class="grow"></span>${sim()}</header><div class="conv">${conv}<p class="note" style="justify-content:center;text-align:center">${L("首页与对话里是同一份事实：一处验收，两处都收成回执。", "Home and conversation share one fact: review in one place and both turn into a receipt.")}</p></div><div class="compose"><div class="box"><textarea rows="1" placeholder="${L("原型不处理输入", "The prototype doesn't take input")}" aria-label="${L("发给助理", "Message the assistant")}" disabled></textarea><div class="box__foot">${btn(L("发送", "Send"), { icon: "send", iconOnly: true, disabled: true })}</div></div></div>`;
  }
  function main() {
    if (S.tab === "pages") return pagesDoc();
    if (briefOn()) return `<div class="home">${briefHome()}</div>`;
    const body = S.sch === "A" ? homeA() : S.sch === "B" ? homeB() : homeC();
    return `<div class="home">${banner()}${headHtml()}${body}</div>`;
  }

  // ---------- prototype strip ----------
  function proto() {
    const schemes = seg(L("方案", "Option"), ["A", "B", "C"].map((x) => ({ value: x, label: x + (x === "B" ? " ✓" : ""), current: x === S.sch, attrs: { "data-proto": "sch", title: SCHEMES()[x] + (x === "B" ? L(" · 已定（2026-11-04）", " · decided (2026-11-04)") : "") } })));
    const lang = seg(L("语言", "Language"), [["zh", "中"], ["en", "EN"]].map(([v, l]) => ({ value: v, label: l, current: S.lang === v, attrs: { "data-proto": "lang" } })));
    const theme = document.documentElement.dataset.theme || "system";
    const themes = seg(L("外观", "Theme"), [["light", L("浅", "Light")], ["dark", L("深", "Dark")], ["system", L("跟随", "Auto")]].map(([v, l]) => ({ value: v, label: l, current: theme === v, attrs: { "data-theme-option": v } })));
    document.getElementById("proto").innerHTML = `<b>${L("原型 · 模拟数据", "Prototype · sample data")}</b>
      <label>${L("方案", "Option")}${schemes}</label><span class="sname">${esc(SCHEMES()[S.sch])}${S.sch === "B" ? L(" · 已定", " · decided") : ""}</span>
      <label>${L("情况", "Situation")}<select id="p-fault">${Object.entries(FAULTS()).map(([v, n]) => `<option value="${v}"${v === S.fault ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
      <label>${L("语言", "Language")}${lang}</label><label>${L("外观", "Theme")}${themes}</label>
      ${btn(L("重置", "Reset"), { v: "ghost", act: "reset" })}`;
  }

  function render() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    proto();
    const view = `${S.sch}|${S.fault}|${S.tab}|${S.view}`;
    const switcher = `<div class="switch-narrow">${seg(L("显示", "Show"), [["home", L("首页", "Home")], ["chat", L("助理", "Assistant")]].map(([v, l]) => ({ value: v, label: l, current: (v === "chat") === S.chat, attrs: { "data-act": "mview" } })))}</div>`;
    const app = document.getElementById("app");
    app.className = `desk${S.chat ? " show-chat" : ""}${view !== lastView ? " is-arriving" : ""}`;
    app.innerHTML = `${switcher}<section class="sheet docpane">${tabs()}<div class="scroll">${main()}</div></section><section class="sheet chat">${chat()}</section>`;
    lastView = view;
    save();
  }
  function toast(msg, state) {
    const slot = document.getElementById("toast"); clearTimeout(toastT);
    slot.innerHTML = `<div class="mw-toast${state === "failed" ? " is-error" : ""}" role="status"${state ? ` data-mw-state="${state}" data-ring-mounted` : ""}>${state ? K.renderStateRing({ state }) : ""}<span>${esc(msg)}</span></div>`;
    toastT = setTimeout(() => { slot.innerHTML = ""; }, 3200);
  }
  function setFault(f) {
    S = { ...S, fault: f, done: {}, busy: null, tab: f === "busy" ? "pages" : "home", view: "auto", refreshed: false };
    clearTimeout(refreshT);
    if (f === "refresh") refreshT = setTimeout(() => { S.refreshed = true; render(); }, 1600);
    render();
  }

  const ACT = {
    op: (b) => {
      const id = b.dataset.id, op = (obj(id).ops || []).find((x) => x.id === b.dataset.op);
      if (op.id === "retry") return ACT.retry();
      if (!op.done) return toast(L(`「${tr(op.t)}」打开到准确位置（模拟）`, `“${tr(op.t)}” opens at the exact spot (simulated)`));
      if (S.busy) return;
      S.busy = `${id}:${op.id}`; render();
      setTimeout(() => { S.busy = null; S.done[id] = op.id; render(); }, 650);
    },
    undo: (b) => { delete S.done[b.dataset.id]; render(); },
    peek: (b) => toast(L(`速览「${tr(obj(b.dataset.id).title)}」（模拟，样子见 03 定样）`, `Peek “${tr(obj(b.dataset.id).title)}” (simulated; see the 03 forms)`)),
    more: () => toast(L("更多：打开到准确位置、速览、复制引用、放进、交给、挂到 Goal（模拟）", "More: open at spot, peek, copy reference, put in, hand to, attach to Goal (simulated)")),
    open: (b) => toast(L(`打开 ${tr(plugin(b.dataset.pid).name)}，首页留在原处（模拟）`, `Opens ${tr(plugin(b.dataset.pid).name)}; the home stays where it was (simulated)`)),
    start: () => toast(L("开始（模拟）", "Start (simulated)")),
    enable: () => setFault("none"),
    retry: () => toast(L("Goals 仍读不到，显示的还是 2 小时前的值（模拟）", "Goals still can't be read; still showing the 2-hour-old value (simulated)"), "failed"),
    retrybrief: () => toast(L("还是打不开，留在基础首页（模拟）", "Still failing; staying on the basic home (simulated)"), "failed"),
    tobasic: () => { S.view = "basic"; render(); },
    tobrief: () => { S.view = "auto"; render(); },
    tab: (b) => { S.tab = b.dataset.tab; S.chat = false; render(); },
    mview: (b) => { S.chat = b.getAttribute("value") === "chat"; render(); },
    reset: () => { S = fresh(); clearTimeout(refreshT); render(); },
  };
  document.addEventListener("click", (e) => {
    const p = e.target.closest("[data-proto]");
    if (p) { S[p.dataset.proto] = p.getAttribute("value"); render(); return; }
    if (e.target.closest("[data-theme-option]")) { setTimeout(proto, 0); return; }
    const el = e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const f = ACT[el.dataset.act];
    if (f) { e.preventDefault(); f(el); }
  });
  document.addEventListener("change", (e) => { if (e.target.id === "p-fault") setFault(e.target.value); });

  // ?sch=B&fault=empty&lang=en&theme=dark&chat=1 opens a given view (used for review screenshots).
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("sch")) S.sch = q.get("sch");
    if (q.get("fault")) S = { ...S, fault: q.get("fault"), done: {}, tab: q.get("fault") === "busy" ? "pages" : "home", view: "auto" };
    if (q.get("lang")) S.lang = q.get("lang");
    if (q.get("chat")) S.chat = q.get("chat") === "1";
    if (q.get("theme")) { try { localStorage.setItem("molis-work:theme", q.get("theme")); } catch { /* storage unavailable */ } document.documentElement.dataset.theme = q.get("theme"); document.documentElement.dataset.resolvedTheme = q.get("theme"); }
  } catch { /* no query */ }
  if (!FAULTS()[S.fault]) S.fault = "none";
  S.busy = null;
  if (S.fault === "refresh" && !S.refreshed) refreshT = setTimeout(() => { S.refreshed = true; render(); }, 1600);
  render();
  // The visual foundation client: theme choices, press give, segmented thumb travel, the running ring.
  const client = document.createElement("script"); client.textContent = window.mwKitClient; document.body.appendChild(client);
})();
