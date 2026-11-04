// 15 · 基础首页定样 — standalone prototype on sample data (data.js). Nothing calls a model or a Home.
(() => {
  const D = window.bhData;
  document.getElementById("icons").innerHTML = window.protoIcons;
  const KEY = "molis-proto.basic-home.v1";
  const fresh = () => ({ sch: "B", lang: "zh", theme: "light", fault: "none", done: {}, tab: "home", view: "auto", mdoc: true, refreshed: false });
  let S = load(), toastT, refreshT;
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const tr = (x) => (Array.isArray(x) ? x[S.lang === "en" ? 1 : 0] : x ?? "");
  const L = (zh, en) => (S.lang === "en" ? en : zh);
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const F = (f) => S.fault === f;
  const sim = () => `<span class="tag sim">${L("模拟", "Simulated")}</span>`;

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
    if (F("unreadable") && o.owner === "goals") return { ...o, state: "stale", time: ["2 小时前的值", "Value from 2 h ago"], ops: [{ id: "retry", t: ["再读一次", "Read again"], done: ["Goals 仍读不到（模拟）", "Goals still unreadable (simulated)"] }] };
    if (F("refresh") && S.refreshed && id === "run") return { ...o, who: ["Coding 在做 · 第 4 步，共 5 步", "Coding working · step 4 of 5"], step: { n: 4, of: 5 }, changed: true };
    return o;
  }
  const visible = (id) => { const o = D.objects[id]; return o && !(F("disabled") && o.owner === "inbox") && !F("empty"); };
  const STATE = () => ({ decide: L("要你决定", "Needs a decision"), accept: L("要你验收", "Needs review"), failed: L("失败", "Failed"), stale: L("读不到", "Can't read"), running: L("进行中", "In progress") });
  const stag = (o) => (["decide", "accept", "failed", "stale"].includes(o.state) ? `<span class="stag ${o.state}">${STATE()[o.state]}</span>` : "");
  const own = (pid, lg = "") => `<span class="own ${lg}" style="--hue:var(--h-${pid})">${ic(plugin(pid)?.icon || "package")}</span>`;

  // ---------- operations ----------
  function opBtn(id, op, i) { return `<button type="button" class="btn sm ${i === 0 ? "primary" : "sec"}" data-act="op" data-id="${id}" data-op="${op.id}">${esc(tr(op.t))}</button>`; }
  const moreBtn = (id) => `<button type="button" class="btn icon sm ghost" data-act="more" data-id="${id}" aria-label="${L("更多", "More")}">${ic("more", "sm")}</button>`;
  function receipt(id) {
    const op = (obj(id).ops || []).find((x) => x.id === S.done[id]);
    return `<div class="receipt" role="status">${ic("check", "sm")}<span>${esc(tr(op.done))}</span><span style="flex:1"></span>${op.undo ? `<button class="link" data-act="undo" data-id="${id}">${L("撤销", "Undo")}</button>` : ""}</div>`;
  }

  // ---------- row (decided form B: plugin tile leads) ----------
  function row(id, opts = {}) {
    const o = obj(id); if (!o) return "";
    if (S.done[id]) return receipt(id);
    const prim = (o.ops || [])[0];
    const judge = o.judge && !opts.compact ? `<span class="judge">${esc(tr(o.judge))}</span>` : "";
    const dup = o.dupOf && !opts.compact ? `<span class="tag">${L("同一件事 · Inbox", "Same matter · Inbox")}</span>` : "";
    const attr = o.attr ? `<span class="tag ${o.attr === "project" ? "out" : ""}">${o.attr === "project" ? L("本项目", "This project") : L("个人", "Personal")}</span>` : "";
    const time = opts.time ? `<span class="tt-time">${esc(opts.time)}</span>` : "";
    return `<div class="row2${o.changed ? " flash" : ""}${o.state === "stale" ? " stale" : ""}">${time}${own(o.owner, "lg")}<span class="tx"><strong><button class="link ttl" data-act="peek" data-id="${id}">${esc(tr(o.title))}</button></strong><span class="m">${stag(o) ? `<span class="m-tag">${stag(o)}</span>` : ""}<span>${esc(tr(o.time))}</span>·<span>${esc(tr(o.who))}</span></span></span><span class="rt">${attr}${dup}${judge}<span class="d-tag">${stag(o)}</span>${prim && !opts.noOp ? opBtn(id, prim, 0) : ""}${moreBtn(id)}</span></div>`;
  }

  // ---------- plugin cards ----------
  function pcardState(p) {
    if (p.undeclared) return "undeclared";
    if (F("empty")) return "empty";
    if (F("disabled") && p.id === "inbox") return "disabled";
    if (F("unreadable") && p.id === "goals") return "stale";
    return "ok";
  }
  function pcard(p, compact, shown = []) {
    const st = pcardState(p);
    const band = (extra = "") => `<div class="pband">${own(p.id)}<b>${esc(tr(p.name))}</b><span style="flex:1"></span>${extra}</div>`;
    if (st === "undeclared") return `<article class="pcard none">${band(`<span class="tag sim">${L("没有声明首页内容", "No home content declared")}</span>`)}<div class="pbody"><p class="fact">${L("这个插件没有说它在首页上放什么，所以只给打开。", "This plugin hasn't said what it shows on the home page, so only Open.")}</p><div class="pfoot"><button class="btn sm sec" data-act="open" data-pid="${p.id}">${esc(tr(p.open))}</button></div></div></article>`;
    if (st === "disabled") return `<article class="pcard off">${band(`<span class="tag">${L("已停用", "Off")}</span>`)}<div class="pbody"><p class="fact">${L("Inbox 已停用，它的内容都还在；启用后照常显示。这和「没有内容」不是一回事。", "Inbox is off; its content is kept and shows again once it's on. That's not the same as empty.")}</p><div class="pfoot"><button class="btn sm sec" data-act="enable">${L("启用", "Turn on")}</button></div></div></article>`;
    if (st === "empty") return `<article class="pcard" style="--hue:var(--h-${p.id})">${band()}<div class="pbody"><p class="fact">${L("还没有内容。", "Nothing here yet.")}</p><div class="pfoot"><button class="btn sm sec" data-act="start" data-pid="${p.id}">${ic("plus", "sm")}${esc(tr(p.start))}</button></div></div></article>`;
    const items = p.items.filter(visible).filter((id) => !shown.includes(id) && !shown.includes(D.objects[id].dupOf));
    const above = p.items.filter(visible).length - items.length;
    const staleNote = st === "stale" ? `<p class="note2 warn">${ic("alert", "sm")}${L("Goals 暂时读不到。下面是 2 小时前读到的内容，不是现在的。", "Goals can't be read right now. Below is what was read 2 hours ago, not the current state.")}</p>` : "";
    const ov = `<p class="pov">${esc(tr(p.overview))}${p.overviewNote ? `<span class="fact"> · ${esc(tr(p.overviewNote))}</span>` : ""}</p>`;
    if (compact) return `<article class="pcard compact${st === "stale" ? " is-stale" : ""}" style="--hue:var(--h-${p.id})">${band(st === "stale" ? `<span class="stag stale">${L("读不到", "Can't read")}</span>` : "")}<div class="pbody">${st === "stale" ? `<p class="fact">${L("2 小时前：", "2 h ago: ")}${esc(tr(p.overview))}</p>` : ov}<div class="pfoot"><button class="btn sm sec" data-act="open" data-pid="${p.id}">${esc(tr(p.open))}</button>${st === "stale" ? `<button class="btn sm ghost" data-act="retry">${L("再读一次", "Read again")}</button>` : ""}</div></div></article>`;
    return `<article class="pcard${st === "stale" ? " is-stale" : ""}" style="--hue:var(--h-${p.id})">${band(st === "stale" ? `<span class="stag stale">${L("读不到", "Can't read")}</span>` : "")}<div class="pbody">${staleNote}${ov}<div class="prows">${items.map((id) => row(id, { compact: true })).join("")}</div>${above ? `<p class="fact above">${ic("info", "sm")} ${L(`另有 ${above} 件在上面「等你」「接着做」里`, `${above} more listed above under Waiting and Continue`)}</p>` : ""}<div class="pfoot"><button class="btn sm sec" data-act="open" data-pid="${p.id}">${esc(tr(p.open))}</button>${st === "stale" ? `<button class="btn sm ghost" data-act="retry">${L("再读一次", "Read again")}</button>` : ""}</div></div></article>`;
  }

  // ---------- shared pieces ----------
  function startBox() {
    return `<section class="startbox"><h2>${L("从这里开始", "Start here")}</h2><p class="fact">${L("这个项目还没有内容。基础首页不用先配模型或生成简报。", "This project has nothing yet. The basic home doesn't need a model or a brief first.")}</p><div class="row3"><button class="btn primary" data-act="start" data-pid="materials">${ic("upload", "sm")}${L("带入资料", "Bring in material")}</button><button class="btn sec" data-act="start" data-pid="work">${ic("sparkles", "sm")}${L("开始一件工作", "Start a piece of work")}</button><button class="btn sec" data-act="start" data-pid="plugin">${ic("plus", "sm")}${L("添加插件", "Add a plugin")}</button></div></section>`;
  }
  function headHtml() {
    const d = L("11 月 4 日 周二", "Tue, Nov 4");
    let status = `<span class="fact">${ic("info", "sm")} ${L("基础首页只读各插件已有的内容，不调模型", "The basic home only reads what plugins already have; no model calls")}</span>`;
    if (F("refresh")) status = S.refreshed ? `<span class="fact upd">${ic("check", "sm")} ${L("更新了 1 处", "1 update")}</span>` : `<span class="fact upd">${ic("refresh", "sm spin")} ${L("正在更新…（已有内容不清空）", "Updating… (what's shown stays)")}</span>`;
    const back = (F("brief") || F("busy")) && S.view === "basic" ? `<button class="btn sm ghost" data-act="tobrief">${L("回到综合首页", "Back to comprehensive home")}</button>` : "";
    return `<header class="hhead"><div><time class="fact">${d}</time><h1>${esc(tr(D.project))}</h1></div><span style="flex:1"></span>${status}${back}</header>`;
  }
  const banner = () => (F("brieffail") ? `<div class="banner3 warn" role="status">${ic("alert", "sm")}<span>${L("Work Brief 的首页没能打开，先显示基础首页。你的内容和已打开的标签都在。", "Work Brief's home didn't open, so this is the basic home. Your content and open tabs are all still there.")}</span><span style="flex:1"></span><button class="btn sm sec" data-act="retrybrief">${L("再试一次", "Try again")}</button></div>` : "");
  const sameNote = () => (visible("inbox") && !S.done.inbox ? `<p class="fact samenote">${ic("info", "sm")} ${esc(tr(D.objects.inbox.sameNote))}</p>` : "");
  const hiddenNote = () => (F("disabled") ? `<p class="fact samenote">${ic("info", "sm")} ${L("Inbox 已停用，它的 1 件没算进来。", "Inbox is off; its 1 item isn't counted.")}</p>` : "");

  // ---------- option A: plugin card grid ----------
  function homeA() {
    return `${F("empty") ? startBox() : ""}<div class="pgrid">${D.plugins.map((p) => pcard(p, false)).join("")}</div>`;
  }
  // ---------- option B: waiting + continue, then plugins ----------
  function homeB() {
    const wait = D.waiting.filter(visible), cont = D.continueList.filter(visible);
    const waitSec = F("empty") ? "" : `<section class="hsec"><h2>${L("等你", "Waiting on you")} <span class="cntb">${wait.filter((id) => !S.done[id]).length}</span></h2>${wait.length ? `<div class="rows">${wait.map((id) => row(id)).join("")}</div>` : `<p class="fact">${L("没有等你的事。", "Nothing is waiting on you.")}</p>`}${sameNote()}${hiddenNote()}</section>`;
    const contSec = F("empty") ? startBox() : `<section class="hsec"><h2>${L("接着做", "Continue")}</h2><div class="rows">${cont.map((id) => row(id)).join("")}</div></section>`;
    // Decided 2026-11-04: B's two sections on top, then the full plugin card grid of A. Rows already shown above are not repeated in the cards.
    const shown = F("empty") ? [] : [...wait, ...cont];
    return `${waitSec}${contSec}<section class="hsec"><h2>${L("各插件", "Plugins")}</h2><div class="pgrid">${D.plugins.map((p) => pcard(p, false, shown)).join("")}</div></section>`;
  }
  // ---------- option C: today's activity + plugin column ----------
  function homeC() {
    const ev = D.timeline.filter(visible);
    const tl = F("empty") ? `<p class="fact">${L("今天还没有动静。", "Nothing has happened today yet.")}</p>${startBox()}` : `<div class="tl">${ev.slice().reverse().map((id) => row(id, { time: D.objects[id].at })).join("")}</div>${sameNote()}${hiddenNote()}`;
    const side = D.plugins.map((p) => {
      const st = pcardState(p);
      const line = st === "undeclared" ? L("没有声明首页内容", "No home content declared") : st === "disabled" ? L("已停用 · 内容都还在", "Off · content kept") : st === "empty" ? L("还没有内容", "Nothing yet") : st === "stale" ? L("读不到 · 2 小时前：", "Can't read · 2 h ago: ") + tr(p.overview) : tr(p.overview);
      const act = st === "disabled" ? `<button class="btn sm sec" data-act="enable">${L("启用", "Turn on")}</button>` : st === "empty" ? `<button class="btn sm sec" data-act="start" data-pid="${p.id}">${esc(tr(p.start))}</button>` : `<button class="btn sm ghost" data-act="open" data-pid="${p.id}">${L("打开", "Open")}</button>`;
      return `<li class="pli${st === "disabled" || st === "undeclared" ? " off" : ""}">${p.undeclared ? `<span class="own">${ic("package")}</span>` : own(p.id)}<span class="tx"><b>${esc(tr(p.name))}</b><span class="fact">${esc(line)}</span></span>${act}</li>`;
    }).join("");
    return `<div class="cgrid"><section class="hsec"><h2>${L("今天的动静", "Today")}</h2>${tl}</section><aside class="hsec pside"><h2>${L("插件", "Plugins")}</h2><ul class="plist">${side}</ul></aside></div>`;
  }

  // ---------- Work Brief's comprehensive home (simulated, same forms and facts) ----------
  function briefHome() {
    const b = D.brief;
    return `<header class="hhead"><div><time class="fact">${L("综合首页 · Work Brief 组织", "Comprehensive home · organised by Work Brief")}</time><h1>${esc(tr(b.title))}</h1></div><span style="flex:1"></span>${sim()}<button class="btn sm ghost" data-act="tobasic">${L("看基础首页", "See basic home")}</button></header>
      ${F("busy") ? `<p class="note2">${ic("info", "sm")}${L("你在写文稿时 Work Brief 装好了；首页换成了它，文稿没被打断。", "Work Brief finished installing while you wrote; the home changed to it and your page wasn't interrupted.")}</p>` : ""}
      <p class="lede">${esc(tr(b.lede))}</p>${b.sections.map((s) => `<section class="hsec"><h2>${esc(tr(s.h))}</h2><div class="rows">${s.items.filter(visible).map((id) => row(id)).join("")}</div></section>`).join("")}
      <p class="fact samenote">${ic("info", "sm")} ${L("Work Brief 用同一套行与卡片、同一份事实；在这里验收，基础首页和对话里也跟着变。", "Work Brief uses the same rows and cards and the same facts; review here and the basic home and the conversation change too.")}</p>`;
  }

  // ---------- tabs, pages doc, assistant ----------
  function tabs() {
    const dot = F("busy") && S.tab !== "home" ? `<span class="tdot" title="${L("首页换成了 Work Brief 的综合首页，回来时再看", "The home changed to Work Brief's; see it when you're back")}"></span>` : "";
    return `<div class="tabs3" role="tablist"><button role="tab" aria-selected="${S.tab === "home"}" data-act="tab" data-tab="home">${ic("home", "sm")}${L("首页", "Home")}${dot}</button><button role="tab" aria-selected="${S.tab === "pages"}" data-act="tab" data-tab="pages">${own("pages")}${L("发布说明", "Release notes")}</button></div>`;
  }
  function pagesDoc() {
    return `<div class="doc"><h1>${L("发布说明", "Release notes")}</h1><p class="fact">Pages · ${L("草稿，自动保存", "Draft, saved")}</p><div class="line" style="width:90%"></div><div class="line" style="width:76%"></div><h3>${L("已知问题", "Known issues")}</h3><div class="line" style="width:60%"></div><p class="caret">${L("手机上价格表第三列会掉行，", "On phones the third pricing column wraps,")}<span class="cur"></span></p></div>`;
  }
  function chat() {
    const card = (id) => {
      const o = obj(id); if (!visible(id)) return "";
      if (S.done[id]) return receipt(id);
      const prim = (o.ops || [])[0];
      return `<div class="card2" style="--hue:var(--h-${o.owner})"><div class="strip2">${own(o.owner)}<span>${esc(tr(plugin(o.owner).name))}</span><span class="fact">· ${esc(tr(o.time))}</span><span style="flex:1"></span>${stag(o)}</div><div class="inner"><div class="hd"><span class="tt">${esc(tr(o.title))}</span></div><p class="sum">${esc(tr(o.summary))}</p>${o.progress ? `<div class="prog"><span>${esc(tr(o.progress.label))} ${o.progress.done}/${o.progress.total}</span><span class="bar"><i style="width:${(o.progress.done / o.progress.total) * 100}%"></i></span></div>` : ""}<div class="ft">${prim ? opBtn(id, prim, 0) : ""}${moreBtn(id)}</div></div></div>`;
    };
    const ask = F("empty") ? `<div class="m2"><span class="av ai">AI</span><div class="body">${L("这个项目还空着。可以先带入资料，或者直接说你想做什么。", "This project is empty. Bring in material, or just say what you want to do.")}</div></div>` : `<div class="m2 me"><div class="bub">${L("今天有什么要我看的？", "Anything I should look at today?")}</div></div><div class="m2"><span class="av ai">AI</span><div class="body"><div>${L("有两件等你：", "Two things are waiting on you:")}</div>${card("goal")}${card("inbox")}${F("disabled") ? `<div class="fact">${L("Inbox 停用了，它的内容我看不到。", "Inbox is off, so I can't see its items.")}</div>` : ""}</div></div>`;
    return `<div class="ph2">${ic("sparkles", "sm")}${L("助理", "Assistant")}<span class="grow"></span>${sim()}</div><div class="conv">${ask}<p class="fact" style="text-align:center">${L("首页与对话里是同一份事实：一处验收，两处都收成回执。", "Home and conversation share one fact: review in one place and both turn into a receipt.")}</p></div><div class="comp"><div class="inrow"><textarea rows="1" placeholder="${L("原型不处理输入", "The prototype doesn't take input")}" aria-label="${L("发给助理", "Message the assistant")}" disabled></textarea><button class="btn sec" disabled>${L("发送", "Send")}</button></div></div>`;
  }
  function main() {
    if (S.tab === "pages") return pagesDoc();
    if (briefOn()) return `<div class="home s-B">${briefHome()}</div>`;
    const body = S.sch === "A" ? homeA() : S.sch === "B" ? homeB() : homeC();
    return `<div class="home s-B">${banner()}${headHtml()}${body}</div>`;
  }

  function render() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en"; document.documentElement.dataset.theme = S.theme;
    const P = { protoTitle: L("原型 · 模拟数据", "Prototype · sample data"), scheme: L("方案", "Option"), fault: L("情况", "Situation"), lang: L("语言", "Language"), theme: L("外观", "Theme"), light: L("浅", "Light"), dark: L("深", "Dark"), reset: L("重置", "Reset") };
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = P[n.dataset.t]));
    for (const b of document.querySelectorAll("#scheme button")) { const d = b.dataset.scheme === "B"; b.setAttribute("aria-pressed", b.dataset.scheme === S.sch); b.textContent = d ? "B ✓" : b.dataset.scheme; b.title = SCHEMES()[b.dataset.scheme] + (d ? L(" · 已定（2026-11-04）", " · decided (2026-11-04)") : ""); }
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    document.getElementById("fault").innerHTML = Object.entries(FAULTS()).map(([v, n]) => `<option value="${v}"${v === S.fault ? " selected" : ""}>${n}</option>`).join("");
    document.getElementById("app").innerHTML = `<div class="pathbar"><b>${esc(SCHEMES()[S.sch])}</b><span class="fact">${esc(FAULTS()[S.fault])}</span><span style="flex:1"></span><span class="seg side-tabs"><button data-act="mdoc" aria-pressed="${S.mdoc}">${L("首页", "Home")}</button><button data-act="mchat" aria-pressed="${!S.mdoc}">${L("助理", "Assistant")}</button></span></div><div class="work s-B${S.mdoc ? " show-doc" : ""}"><section class="pane2 docpane">${tabs()}<div class="wscroll">${main()}</div></section><section class="pane2 chat">${chat()}</section></div>`;
    save();
  }
  function toast(msg) { document.querySelector(".toast")?.remove(); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3200); }
  function setFault(f) {
    S = { ...S, fault: f, done: {}, tab: f === "busy" ? "pages" : "home", view: "auto", refreshed: false };
    clearTimeout(refreshT);
    if (f === "refresh") refreshT = setTimeout(() => { S.refreshed = true; render(); }, 1600);
    render();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set]");
    if (!b) return;
    if (b.dataset.scheme) { S.sch = b.dataset.scheme; return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    const a = b.dataset.act, id = b.dataset.id;
    if (a === "op") {
      const op = (obj(id).ops || []).find((x) => x.id === b.dataset.op);
      if (!op.done) return toast(L(`「${tr(op.t)}」打开到准确位置（模拟）`, `“${tr(op.t)}” opens at the exact spot (simulated)`));
      if (b.classList.contains("busy")) return;
      document.querySelectorAll(`[data-act=op][data-id="${id}"][data-op="${op.id}"]`).forEach((x) => { x.classList.add("busy"); x.textContent = L("正在做…", "Working…"); });
      return setTimeout(() => { if (op.id !== "retry") S.done[id] = op.id; else toast(tr(op.done)); render(); }, 650);
    }
    if (a === "undo") { delete S.done[id]; return render(); }
    if (a === "peek") return toast(L(`速览「${tr(obj(id).title)}」（模拟，样子见 03 定样）`, `Peek “${tr(obj(id).title)}” (simulated; see the 03 forms)`));
    if (a === "more") return toast(L("更多：打开到准确位置、速览、复制引用、放进、交给、挂到 Goal（模拟）", "More: open at spot, peek, copy reference, put in, hand to, attach to Goal (simulated)"));
    if (a === "open") return toast(L(`打开 ${tr(plugin(b.dataset.pid).name)}，首页留在原处（模拟）`, `Opens ${tr(plugin(b.dataset.pid).name)}; the home stays where it was (simulated)`));
    if (a === "start") return toast(L("开始（模拟）", "Start (simulated)"));
    if (a === "enable") return setFault("none");
    if (a === "retry") return toast(L("Goals 仍读不到，显示的还是 2 小时前的值（模拟）", "Goals still can't be read; still showing the 2-hour-old value (simulated)"));
    if (a === "retrybrief") return toast(L("还是打不开，留在基础首页（模拟）", "Still failing; staying on the basic home (simulated)"));
    if (a === "tobasic") { S.view = "basic"; return render(); }
    if (a === "tobrief") { S.view = "auto"; return render(); }
    if (a === "tab") { S.tab = b.dataset.tab; S.mdoc = true; return render(); }
    if (a === "mdoc") { S.mdoc = true; return render(); }
    if (a === "mchat") { S.mdoc = false; return render(); }
  });
  document.getElementById("fault").addEventListener("change", (e) => setFault(e.target.value));
  document.getElementById("reset").addEventListener("click", () => { S = fresh(); clearTimeout(refreshT); render(); });
  // ?sch=B&fault=empty&lang=en&theme=dark opens a given view (used for review screenshots).
  try { const q = new URLSearchParams(location.search); if (q.get("sch")) S.sch = q.get("sch"); if (q.get("fault")) S = { ...S, fault: q.get("fault"), done: {}, tab: q.get("fault") === "busy" ? "pages" : "home", view: "auto" }; if (q.get("lang")) S.lang = q.get("lang"); if (q.get("theme")) S.theme = q.get("theme"); } catch { /* no query */ }
  if (!FAULTS()[S.fault]) S.fault = "none";
  if (S.fault === "refresh" && !S.refreshed) refreshT = setTimeout(() => { S.refreshed = true; render(); }, 1600);
  render();
})();
