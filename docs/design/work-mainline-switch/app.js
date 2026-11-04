// 03 · 顶部事项切换定样 — standalone prototype on sample data (data.js). Nothing calls a model or a Home.
(() => {
  const D = window.mlData;
  document.getElementById("icons").innerHTML = window.protoIcons;
  const T = {
    zh: {
      protoTitle: "原型 · 模拟数据", scheme: "方案", lang: "语言", theme: "外观", light: "浅", dark: "深", reset: "重置", fault: "状态",
      f_none: "正常", f_empty: "还没有事项", f_many: "事项很多（14 件）",
      search: "找事项", newItem: "新建事项", organize: "整理主线", noItem: "不选事项", done: "已完成", recent: "最近切过", pinned: "固定",
      waitingYou: (n) => `${n} 件等你`, light2: "只起个名字", asGoal: "建成 Goal", asTodo: "建成待办", create: "建好", namePh: "这件事叫什么",
      things: "这件事的东西", materials: "项目资料", talk: "讨论", open: "在主区打开", side: "并排", removeRel: "从事项移出", gone: "已不在", denied: "无权查看",
      rel_source: "就是这件事", rel_put: "你放进来的", "rel_goal-material": "Goal 资料", rel_plugin: "挂在 Goal 上",
      putIn: "放进事项", markDone: "标完成", undo: "撤销", in: "在：", switched: (a) => `已切到「${a}」`, stillRunning: (a) => `「${a}」仍在后台跑`, back: (a) => `回到「${a}」`,
      doneMoved: (a) => `「${a}」收进已完成`, removed: (a) => `已从事项移出「${a}」，对象本身还在`, put: (a, b) => `已把「${a}」放进「${b}」`, created: (a) => `建好事项「${a}」`,
      orgTitle: "整理主线", orgSub: "拖动卡片调顺序或换组；也可以用键盘：选中后按 ↑↓ 移动，⌥↑↓ 换组。", addGroup: "加一组", delGroup: "删掉这组", merged: (a, b) => `删掉「${a}」，里面的事项并进「${b}」`, close: "关闭",
      sim: "模拟", goalReq: "完成要求", req1: "登录跳转修好并有回归用例", req2: "发布说明写好并过目", req3: "上线检查单逐项打勾",
      codingRun: "正在改 Hero.tsx · 第 3 步", todoBody: "访谈 01、02 已读；03 还没给", noneHint: "没选事项时，整个项目一份工作台，和现在一样。", proj: "项目", from: "来自",
      kGoal: "Goal", kDoc: "文稿", kCoding: "Coding 会话", kTalk: "讨论", kFile: "资料", kNote: "Shelf", kTodo: "待办",
    },
    en: {
      protoTitle: "Prototype · sample data", scheme: "Option", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset", fault: "State",
      f_none: "Normal", f_empty: "No items yet", f_many: "Many items (14)",
      search: "Find an item", newItem: "New item", organize: "Arrange mainline", noItem: "No item", done: "Done", recent: "Recent", pinned: "Pinned",
      waitingYou: (n) => `${n} waiting on you`, light2: "Just a name", asGoal: "As a Goal", asTodo: "As a to-do", create: "Create", namePh: "What is this work called",
      things: "In this item", materials: "Materials", talk: "Discussion", open: "Open in main", side: "Side by side", removeRel: "Take out of item", gone: "No longer there", denied: "No access",
      rel_source: "This item itself", rel_put: "You put it here", "rel_goal-material": "Goal material", rel_plugin: "Attached to the Goal",
      putIn: "Put in item", markDone: "Mark done", undo: "Undo", in: "In: ", switched: (a) => `Switched to “${a}”`, stillRunning: (a) => `“${a}” keeps running in the background`, back: (a) => `Back to “${a}”`,
      doneMoved: (a) => `“${a}” moved to Done`, removed: (a) => `Took “${a}” out of the item; the object itself stays`, put: (a, b) => `Put “${a}” in “${b}”`, created: (a) => `Created “${a}”`,
      orgTitle: "Arrange mainline", orgSub: "Drag cards to reorder or change group; or select one and press ↑↓ to move, ⌥↑↓ to change group.", addGroup: "Add group", delGroup: "Delete group", merged: (a, b) => `Deleted “${a}”; its items joined “${b}”`, close: "Close",
      sim: "Simulated", goalReq: "Requirements", req1: "Login redirect fixed, with a regression test", req2: "Release notes written and reviewed", req3: "Launch checklist ticked item by item",
      codingRun: "Editing Hero.tsx · step 3", todoBody: "Interviews 01 and 02 read; 03 not provided yet", noneHint: "With no item chosen, the whole project shares one workbench, as today.", proj: "Project", from: "From",
      kGoal: "Goal", kDoc: "Documents", kCoding: "Coding sessions", kTalk: "Discussion", kFile: "Materials", kNote: "Shelf", kTodo: "To-dos",
    },
  };
  const KEY = "molis-proto.work-mainline-switch.v1";
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const fresh = () => ({ scheme: "C", lang: "zh", theme: "light", fault: "none", current: null, prev: null, items: clone(D.items), groups: clone(D.groups), mainTab: {}, sideTab: "things", sideOpen: true, scopeOff: {}, recent: clone(D.recent), openGroups: [] });
  let S = load();
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const t = (k, ...a) => { const v = T[S.lang][k]; return typeof v === "function" ? v(...a) : v ?? k; };
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const kindIcon = { goal: "target", doc: "note", coding: "code", talk: "review", file: "file", note: "book", todo: "check" };
  const kindLabel = { goal: "kGoal", doc: "kDoc", coding: "kCoding", talk: "kTalk", file: "kFile", note: "kNote", todo: "kTodo" };
  const L = (o, k) => (S.lang === "en" && o[k + "En"] ? o[k + "En"] : o[k]);

  function items() {
    if (S.fault === "empty") return [];
    if (S.fault === "many") { const extra = []; for (let i = 1; i <= 8; i++) extra.push({ id: "x" + i, name: (S.lang === "zh" ? "零散的一件事 " : "Small task ") + i, group: i % 2 ? "next" : "wait", status: null, waiting: i === 3 ? 1 : 0, last: "—", tabs: [{ id: "d" + i, kind: "doc", title: "草稿 " + i, owner: "Pages" }], things: [] }); return [...S.items, ...extra]; }
    return S.items;
  }
  const item = (id) => items().find((i) => i.id === id);
  const live = () => items().filter((i) => !i.done);
  function ordered(group) { return live().filter((i) => i.group === group).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)); }

  // ---------- shell ----------
  function chip() {
    const c = item(S.current);
    const inner = c ? `<span class="ring ${c.status || "none"}" aria-hidden="true"></span><span class="nm">${esc(c.name)}</span>${c.waiting ? `<span class="wcount" aria-label="${t("waitingYou", c.waiting)}">${c.waiting}</span>` : ""}` : `${ic("grid", "sm")}<span class="nm proj">${esc(D.project)}</span>`;
    return `<button class="mlsw" data-act="menu" aria-haspopup="menu" aria-expanded="${!!pop}">${inner}${ic("chevron-down", "sm")}</button>`;
  }
  function mainTabs() { const c = item(S.current); return c ? c.tabs : [{ id: "home", kind: "home", title: S.lang === "zh" ? "项目首页" : "Project home" }, { id: "hero-none", kind: "coding", title: S.lang === "zh" ? "首页改版：换成新的首屏" : "首页改版：换成新的首屏" }]; }
  function sideTabs() { return [...(S.current ? [{ id: "things", title: t("things"), icon: "list" }] : []), { id: "materials", title: t("materials"), icon: "library" }, { id: "talk", title: t("talk"), icon: "review" }]; }
  function activeMain() { const tabs = mainTabs(), k = S.current || "_"; if (!tabs.some((x) => x.id === S.mainTab[k])) S.mainTab[k] = tabs[0].id; return S.mainTab[k]; }
  function activeSide() { const ids = sideTabs().map((x) => x.id); if (!ids.includes(S.sideTab)) S.sideTab = ids[0]; return S.sideTab; }
  function strip(which, tabs, active) {
    const html = tabs.map((tb) => `<button class="tab" role="tab" aria-selected="${tb.id === active}" data-act="tab" data-pane="${which}" data-id="${tb.id}">${ic(tb.icon || kindIcon[tb.kind] || "home", "sm")}<span>${esc(tb.title)}</span></button>`).join("");
    return `<div class="strip ${which}">${which === "main" ? `<div class="nav"><button aria-label="back">${ic("chevron-left", "sm")}</button><button aria-label="forward">${ic("chevron-right", "sm")}</button></div>` : ""}<div class="tabs" role="tablist">${html}</div><div class="tools"><button aria-label="new tab">${ic("plus")}</button>${which === "side" ? `<button data-act="side-close" aria-label="close">${ic("x")}</button>` : ""}</div></div>`;
  }
  function render() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en"; document.documentElement.dataset.theme = S.theme;
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = t(n.dataset.t)));
    for (const b of document.querySelectorAll("#scheme button")) b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme);
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    const f = document.getElementById("fault"); f.innerHTML = ["none", "empty", "many"].map((v) => `<option value="${v}"${v === S.fault ? " selected" : ""}>${t("f_" + v)}</option>`).join("");
    const am = activeMain(), as = activeSide(), solo = !S.sideOpen;
    document.getElementById("app").innerHTML = `
      <div class="titlebar${solo ? " solo" : ""}">${chip()}${strip("main", mainTabs(), am)}<span></span>${S.sideOpen ? strip("side", sideTabs(), as) : ""}</div>
      <div class="desk${solo ? " solo" : ""}"><section class="pane main focused">${objPage(mainTabs().find((x) => x.id === am))}</section><div class="gutter"></div><section class="pane side">${sideBody(as)}</section></div>
      ${bar()}`;
    save();
  }
  function bar() {
    const c = item(S.current), scope = c && !S.scopeOff[c.id] ? `<span class="scope">${ic("target", "sm")}${t("in")}${esc(c.name)}<button data-act="scope-off" aria-label="remove">${ic("x", "sm")}</button></span>` : "";
    return `<div class="bar"><div class="tray"><button class="switcher">${ic("grid", "sm")}<span>${c ? esc(c.tabs[0].owner) : "Coding"}</span>${ic("chevron-down", "sm")}</button><button class="pin">${ic("home")}</button><button class="pin" aria-current="page">${ic("target")}</button></div>
      <div class="composer">${scope}<span class="ph">${S.lang === "zh" ? "让助理做点什么，或按 ⌘K 搜索" : "Ask the Assistant, or press ⌘K to search"}</span><button class="send" aria-label="send">${ic("send", "sm")}</button></div>
      <div class="tray"><button class="resident" data-act="side-toggle" aria-pressed="${S.sideOpen}" aria-label="side">${ic("sidebar")}</button><span class="mono">网</span></div></div>`;
  }

  function objPage(tb) {
    if (!tb) return "";
    const c = item(S.current);
    const put = `<button class="btn sm sec" data-act="put-menu" data-title="${esc(tb.title)}" data-kind="${tb.kind}" data-owner="${esc(tb.owner || "")}">${ic("plus", "sm")}${t("putIn")}${ic("chevron-down", "sm")}</button>`;
    let body = `<div class="line" style="width:90%"></div><div class="line" style="width:76%"></div><div class="line" style="width:84%"></div>`;
    if (tb.kind === "goal") body = `<div class="fact" style="margin-bottom:6px">${t("goalReq")}</div>${[t("req1"), t("req2"), t("req3")].map((r, i) => `<div class="req"><span class="ring ${i === 0 ? "done" : i === 1 ? "progress" : "none"}"></span>${esc(r)}</div>`).join("")}`;
    if (tb.kind === "coding") body = `<div class="step"><span class="dotp"></span>${t("codingRun")}</div>` + body;
    if (tb.kind === "todo") body = `<p>${t("todoBody")}</p>` + body;
    if (tb.kind === "home") body = `<p class="fact">${t("noneHint")}</p>` + body;
    return `<div class="obj"><div class="kind">${ic(kindIcon[tb.kind] || "home", "sm")}${esc(tb.owner || t("proj"))}<span style="flex:1"></span>${tb.kind !== "home" ? put : ""}</div><h1>${esc(tb.title)}</h1>${body}</div><span class="tag sim simmark">${t("sim")}</span>`;
  }
  function sideBody(id) {
    if (id !== "things") return `<div class="empty"><h3>${id === "materials" ? t("materials") : t("talk")}</h3><span class="tag sim">${t("sim")}</span></div>`;
    const c = item(S.current); if (!c) return "";
    const groups = {};
    for (const th of c.things) (groups[th.kind] ||= []).push(th);
    const rows = Object.entries(groups).map(([k, list]) => `<div class="kh">${t(kindLabel[k])}</div>` + list.map((th) => {
      const idx = c.things.indexOf(th);
      if (th.gone) return `<div class="tr gone">${ic(th.gone === "denied" ? "lock" : "circle-alert")}<span class="nm"><strong>${th.gone === "denied" ? t("denied") : t("gone")}</strong><span class="fact">${t("rel_" + th.rel)}</span></span><span class="acts" style="opacity:1"><button class="btn sm sec" data-act="rel-remove" data-i="${idx}">${t("removeRel")}</button></span></div>`;
      return `<div class="tr">${ic(kindIcon[th.kind])}<span class="nm"><strong>${esc(th.title)}</strong><span class="fact">${esc(L(th, "owner"))} · ${t("rel_" + th.rel)}${th.running ? ` · <span class="run">${S.lang === "zh" ? "在跑" : "Running"}</span>` : ""}</span></span><span class="acts"><button class="btn sm sec" data-act="open-thing" data-i="${idx}">${t("open")}</button>${th.rel === "put" ? `<button class="btn icon sm ghost" data-act="rel-remove" data-i="${idx}" aria-label="${t("removeRel")}">${ic("x", "sm")}</button>` : ""}</span></div>`;
    }).join("")).join("");
    return `<div class="phead"><h2>${t("things")}</h2></div><div class="things" style="overflow:auto;flex:1">${rows}</div>`;
  }

  // ---------- menu ----------
  let pop = null;
  function closePop(restore = true) { if (!pop) return; const back = pop.back; pop.el.remove(); pop = null; document.querySelector(".mlsw")?.setAttribute("aria-expanded", "false"); if (restore && back && document.contains(back)) back.focus(); else if (restore) document.querySelector(".mlsw")?.focus(); }
  function place(el, anchor) {
    const phone = innerWidth <= 760; el.classList.toggle("sheet", phone);
    if (phone) return;
    const r = anchor.getBoundingClientRect(); let left = r.left, top = r.bottom + 6;
    left = Math.min(Math.max(8, left), innerWidth - el.offsetWidth - 8); if (top + el.offsetHeight > innerHeight - 8) top = Math.max(8, innerHeight - el.offsetHeight - 8);
    el.style.left = left + "px"; el.style.top = top + "px";
  }
  function row(i, extra = "") {
    const done = i.done;
    return `<button class="mi2" role="menuitem" data-act="switch" data-id="${i.id}" aria-current="${S.current === i.id}" ${extra}><span class="ring ${i.status || "none"}"></span><span class="nm"><strong>${i.pinned ? ic("pin", "sm") + " " : ""}${esc(i.name)}</strong><span class="fact">${i.source ? esc(S.lang === "en" && i.sourceEn ? i.sourceEn : i.source) + " · " : ""}${esc(L(i, "last"))}</span></span>${i.running ? `<span class="run"></span>` : ""}${i.waiting ? `<span class="wcount" aria-label="${t("waitingYou", i.waiting)}">${i.waiting}</span>` : ""}${!done && !i.source ? `<span class="btn sm ghost" role="button" data-act="mark-done" data-id="${i.id}" title="${t("markDone")}">${ic("check", "sm")}</span>` : ""}</button>`;
  }
  function menuHtml(q = "") {
    const match = (i) => !q || i.name.toLowerCase().includes(q.toLowerCase());
    const doneItems = items().filter((i) => i.done && match(i));
    let list = "";
    if (!items().length) list = `<div class="empty" style="padding:18px"><p>${S.lang === "zh" ? "这个项目还没有事项。起个名字就能建一件，正在做的东西放进去，切换时一起带走。" : "No items in this project yet. Give one a name; put what you are working on into it, and it all comes along when you switch."}</p></div>`;
    else if (S.scheme === "C" && !q) {
      const rec = S.recent.map(item).filter((i) => i && !i.done);
      list = `<div class="gh">${ic("history", "sm")}${t("recent")}</div>${rec.map((i) => row(i)).join("")}` + S.groups.map((g) => { const its = ordered(g.id), open = S.openGroups.includes(g.id); return `<button class="fold" data-act="fold" data-id="${g.id}" aria-expanded="${open}">${ic(open ? "chevron-down" : "chevron-right", "sm")}${esc(L(g, "name"))}<span class="fact">${its.length}</span><span style="flex:1"></span>${its.reduce((n, i) => n + (i.waiting || 0), 0) ? `<span class="wcount">${its.reduce((n, i) => n + (i.waiting || 0), 0)}</span>` : ""}</button>${open ? its.map((i) => row(i)).join("") : ""}`; }).join("");
    } else {
      list = S.groups.map((g) => { const its = ordered(g.id).filter(match); return its.length ? `<div class="gh">${esc(L(g, "name"))}<span class="grow"></span><span>${its.length}</span></div>${its.map((i) => row(i)).join("")}` : ""; }).join("");
    }
    if (doneItems.length) list += `<button class="fold" data-act="fold" data-id="done" aria-expanded="${S.openGroups.includes("done")}">${ic(S.openGroups.includes("done") ? "chevron-down" : "chevron-right", "sm")}${t("done")}<span class="fact">${doneItems.length}</span></button>${S.openGroups.includes("done") ? doneItems.map((i) => row(i)).join("") : ""}`;
    const head = `<label class="search" style="margin:4px 4px 6px">${ic("search", "sm")}<input data-act="mq" value="${esc(q)}" placeholder="${t("search")}" aria-label="${t("search")}"></label>`;
    const foot = `<div class="newrow" id="newrow" hidden><input id="newname" placeholder="${t("namePh")}" aria-label="${t("namePh")}"><span class="seg" id="newsrc"><button data-v="" aria-pressed="true">${t("light2")}</button><button data-v="Goal" aria-pressed="false">${t("asGoal")}</button><button data-v="待办" aria-pressed="false">${t("asTodo")}</button></span><button class="btn sm primary" data-act="create">${t("create")}</button></div>
      <div class="mlfoot"><button class="btn sm sec" data-act="new">${ic("plus", "sm")}${t("newItem")}</button><button class="btn sm sec" data-act="organize">${ic("rows", "sm")}${t("organize")}</button><span style="flex:1"></span>${S.current ? `<button class="btn sm ghost" data-act="none">${t("noItem")}</button>` : ""}</div>`;
    if (S.scheme === "B") return `<div class="mlmenu wide">${head}<div class="cols"><div class="body">${list}</div><div class="peek" id="peek">${peek(S.current || live()[0]?.id)}</div></div>${foot}</div>`;
    return `<div class="mlmenu">${head}<div class="body">${list}</div>${foot}</div>`;
  }
  function peek(id) {
    const i = item(id); if (!i) return "";
    return `<h4>${esc(i.name)}</h4><span class="fact">${esc(L(i, "last"))}</span><div class="fact" style="margin-bottom:4px">${S.lang === "zh" ? "切过去会打开" : "Switching opens"}</div>${i.tabs.map((tb) => `<div class="tr" style="display:flex;gap:8px;align-items:center;min-height:30px">${ic(kindIcon[tb.kind], "sm")}<span>${esc(tb.title)}</span></div>`).join("")}<div class="fact" style="margin:10px 0 4px">${t("things")} · ${i.things.length}</div>${i.things.slice(0, 5).map((th) => `<div style="display:flex;gap:8px;align-items:center;min-height:26px;font-size:12px">${ic(th.gone ? "circle-alert" : kindIcon[th.kind], "sm")}<span>${esc(th.gone ? (th.gone === "denied" ? t("denied") : t("gone")) : th.title)}</span></div>`).join("")}`;
  }
  function openMenu(anchor) {
    closePop(false);
    const el = document.createElement("div"); el.className = "pop ml"; el.setAttribute("role", "menu"); el.innerHTML = menuHtml(); el.style.padding = "0"; document.body.appendChild(el);
    pop = { el, back: anchor, q: "" }; place(el, anchor); anchor.setAttribute("aria-expanded", "true");
    el.querySelector("input").focus();
  }
  function refreshMenu() { if (!pop) return; const q = pop.q; pop.el.innerHTML = menuHtml(q); const inp = pop.el.querySelector('[data-act="mq"]'); inp.focus(); inp.setSelectionRange(q.length, q.length); place(pop.el, pop.back); }
  function putMenu(anchor, title, kind, owner) {
    closePop(false);
    const el = document.createElement("div"); el.className = "pop"; el.setAttribute("role", "menu");
    const its = live(); const cur = item(S.current);
    el.innerHTML = `<div class="cap">${t("putIn")}</div>${[...(cur ? [cur] : []), ...its.filter((i) => i !== cur)].map((i) => `<button class="mi" data-act="put" data-id="${i.id}" data-title="${esc(title)}" data-kind="${kind}" data-owner="${esc(owner)}"><span class="ring ${i.status || "none"}"></span><span>${esc(i.name)}</span>${i === cur ? `<small>${S.lang === "zh" ? "当前" : "Current"}</small>` : ""}</button>`).join("")}`;
    document.body.appendChild(el); pop = { el, back: anchor };
    const r = anchor.getBoundingClientRect(); el.style.left = Math.max(8, r.right - el.offsetWidth) + "px"; el.style.top = r.bottom + 6 + "px"; el.querySelector("button")?.focus();
  }

  // ---------- actions ----------
  let toastTimer, undoFn = null;
  function toast(msg, undo, extra = "") { document.querySelector(".toast")?.remove(); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.innerHTML = esc(msg) + extra + (undo ? `<button data-act="undo">${t("undo")}</button>` : ""); document.body.appendChild(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 5000); }
  function doSwitch(id) {
    const from = item(S.current);
    S.prev = S.current; S.current = id;
    if (id) { S.recent = [id, ...S.recent.filter((x) => x !== id)].slice(0, 3); if (!S.mainTab[id]) S.sideTab = "things"; S.sideOpen = true; }
    closePop(false); render(); document.querySelector(".mlsw")?.focus();
    const to = item(id);
    const run = from && from.running ? ` · ${t("stillRunning", from.name)}` : "";
    toast((to ? t("switched", to.name) : t("noItem")) + run, false, from ? `<button data-act="back-prev">${esc(t("back", from.name))}</button>` : "");
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set],#newsrc button");
    if (pop && !e.target.closest(".pop,.toast") && !(b && pop.back === b)) closePop(false);
    if (!b) return;
    if (b.dataset.scheme) { S.scheme = b.dataset.scheme; closePop(false); return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    if (b.closest("#newsrc")) { for (const x of b.parentNode.children) x.setAttribute("aria-pressed", x === b); return; }
    const a = b.dataset.act, v = b.dataset;
    switch (a) {
      case "menu": e.stopPropagation(); if (pop) return closePop(); return openMenu(b);
      case "switch": if (e.target.closest('[data-act="mark-done"]')) return; return doSwitch(v.id);
      case "back-prev": document.querySelector(".toast")?.remove(); return doSwitch(S.prev);
      case "none": return doSwitch(null);
      case "fold": { const i = S.openGroups.indexOf(v.id); if (i >= 0) S.openGroups.splice(i, 1); else S.openGroups.push(v.id); return refreshMenu(); }
      case "mark-done": { e.stopPropagation(); const it = S.items.find((x) => x.id === v.id); if (!it) return; it.done = true; it.status = "done"; undoFn = () => { it.done = false; it.status = null; }; refreshMenu(); save(); return toast(t("doneMoved", it.name), true); }
      case "new": { const r = pop.el.querySelector("#newrow"); r.hidden = false; r.querySelector("input").focus(); return; }
      case "create": { if (S.fault === "empty") S.fault = "none"; const name = pop.el.querySelector("#newname").value.trim() || (S.lang === "zh" ? "新的事项" : "New item"); const src = pop.el.querySelector('#newsrc [aria-pressed="true"]').dataset.v || null; const id = "n" + Date.now(); const kind = src === "Goal" ? "goal" : src === "待办" ? "todo" : "doc"; S.items.unshift({ id, name, group: "now", status: src ? "progress" : null, waiting: 0, source: src, sourceEn: src === "待办" ? "To-do" : src, last: S.lang === "zh" ? "刚建好" : "Just created", lastEn: "Just created", tabs: [{ id: "t" + id, kind, title: name, owner: src === "Goal" ? "Goals" : src ? "待办" : "Pages" }], things: src ? [{ kind, title: name, owner: src === "Goal" ? "Goals" : "待办", rel: "source" }] : [] }); doSwitch(id); return toast(t("created", name)); }
      case "organize": closePop(false); return organize();
      case "tab": if (v.pane === "main") S.mainTab[S.current || "_"] = v.id; else S.sideTab = v.id; break;
      case "side-toggle": S.sideOpen = !S.sideOpen; break;
      case "side-close": S.sideOpen = false; break;
      case "scope-off": S.scopeOff[S.current] = true; break;
      case "open-thing": { const c = item(S.current), th = c.things[+v.i]; if (!c.tabs.some((x) => x.title === th.title)) c.tabs.push({ id: "o" + Date.now(), kind: th.kind, title: th.title, owner: L(th, "owner") }); S.mainTab[c.id] = c.tabs.find((x) => x.title === th.title).id; break; }
      case "rel-remove": { const c = item(S.current), [th] = c.things.splice(+v.i, 1); undoFn = () => c.things.splice(+v.i, 0, th); render(); return toast(t("removed", th.title || t("denied")), true); }
      case "put-menu": e.stopPropagation(); return putMenu(b, v.title, v.kind, v.owner);
      case "put": { closePop(false); const it = item(v.id); if (!it.things.some((x) => x.title === v.title)) it.things.push({ kind: v.kind, title: v.title, owner: v.owner, rel: "put" }); render(); return toast(t("put", v.title, it.name)); }
      case "undo": if (undoFn) { undoFn(); undoFn = null; } document.querySelector(".toast")?.remove(); if (pop) refreshMenu(); break;
      case "org-close": document.querySelector(".cover")?.remove(); return;
      case "org-add": S.groups.push({ id: "g" + Date.now(), name: S.lang === "zh" ? "新的一组" : "New group" }); return organize();
      case "org-del": { const gi = S.groups.findIndex((g) => g.id === v.id); if (S.groups.length < 2) return; const g = S.groups[gi], into = S.groups[gi === 0 ? 1 : gi - 1]; S.items.forEach((i) => { if (i.group === g.id) i.group = into.id; }); S.groups.splice(gi, 1); organize(); return toast(t("merged", L(g, "name"), L(into, "name"))); }
      case "org-move": { const it = S.items.find((x) => x.id === v.id); moveItem(it, v.dir); return organize(v.id); }
      default: return;
    }
    render();
  });
  function moveItem(it, dir) {
    if (dir === "up" || dir === "down") { const same = S.items.filter((x) => x.group === it.group && !x.done); const i = same.indexOf(it), j = dir === "up" ? i - 1 : i + 1; if (j < 0 || j >= same.length) return; const a = S.items.indexOf(it), b = S.items.indexOf(same[j]); [S.items[a], S.items[b]] = [S.items[b], S.items[a]]; }
    else { const gi = S.groups.findIndex((g) => g.id === it.group), nj = gi + (dir === "left" ? -1 : 1); if (S.groups[nj]) it.group = S.groups[nj].id; }
    save();
  }
  function organize(focusId) {
    document.querySelector(".cover")?.remove();
    const pane = document.querySelector(".pane.main"), c = document.createElement("div"); c.className = "cover";
    c.innerHTML = `<div class="vhead"><strong>${t("orgTitle")}</strong><span style="flex:1"></span><button class="btn sm sec" data-act="org-add">${ic("plus", "sm")}${t("addGroup")}</button><button class="btn icon sm ghost" data-act="org-close" aria-label="${t("close")}">${ic("x", "sm")}</button></div>
      <p class="fact" style="padding:10px 24px 4px;margin:0">${t("orgSub")}</p>
      <div class="org">${S.groups.map((g) => `<div class="col" data-group="${g.id}"><h3><span contenteditable="true" spellcheck="false" data-rename="${g.id}">${esc(L(g, "name"))}</span><span class="fact">${ordered(g.id).length}</span><span style="flex:1"></span>${S.groups.length > 1 ? `<button class="btn icon sm ghost" data-act="org-del" data-id="${g.id}" aria-label="${t("delGroup")}">${ic("trash", "sm")}</button>` : ""}</h3>
        ${S.items.filter((i) => i.group === g.id && !i.done).map((i) => `<div class="card2" draggable="true" tabindex="0" data-card="${i.id}"><span class="ring ${i.status || "none"}"></span><span class="nm"><strong>${esc(i.name)}</strong><span class="fact">${esc(L(i, "last"))}</span></span>${i.waiting ? `<span class="wcount">${i.waiting}</span>` : ""}<span class="mv"><button class="btn icon sm ghost" data-act="org-move" data-id="${i.id}" data-dir="up" aria-label="up">${ic("chevron-down", "sm up")}</button><button class="btn icon sm ghost" data-act="org-move" data-id="${i.id}" data-dir="down" aria-label="down">${ic("chevron-down", "sm")}</button></span></div>`).join("")}</div>`).join("")}</div>`;
    pane.appendChild(c);
    (focusId ? c.querySelector(`[data-card="${focusId}"]`) : c.querySelector("button"))?.focus();
    let drag = null;
    c.addEventListener("dragstart", (e) => { drag = e.target.closest("[data-card]")?.dataset.card; e.target.classList.add("dragging"); });
    c.addEventListener("dragover", (e) => { const col = e.target.closest(".col"); if (col) { e.preventDefault(); c.querySelectorAll(".col").forEach((x) => x.classList.toggle("drop", x === col)); } });
    c.addEventListener("drop", (e) => { const col = e.target.closest(".col"); if (!col || !drag) return; e.preventDefault(); const it = S.items.find((x) => x.id === drag); it.group = col.dataset.group; const over = e.target.closest("[data-card]"); if (over && over.dataset.card !== drag) { const a = S.items.indexOf(it); S.items.splice(a, 1); S.items.splice(S.items.findIndex((x) => x.id === over.dataset.card), 0, it); } save(); organize(drag); });
    c.addEventListener("keydown", (e) => { const card = e.target.closest("[data-card]"); if (!card || !["ArrowUp", "ArrowDown"].includes(e.key)) return; e.preventDefault(); const it = S.items.find((x) => x.id === card.dataset.card); moveItem(it, e.altKey ? (e.key === "ArrowUp" ? "left" : "right") : e.key === "ArrowUp" ? "up" : "down"); organize(it.id); });
    c.addEventListener("focusout", (e) => { const id = e.target.dataset?.rename; if (id) { const g = S.groups.find((x) => x.id === id); g.name = g.nameEn = e.target.textContent.trim() || g.name; save(); } });
  }

  document.addEventListener("input", (e) => { if (e.target.dataset.act === "mq" && pop) { pop.q = e.target.value; refreshMenu(); } });
  document.addEventListener("mouseover", (e) => { if (S.scheme !== "B" || !pop) return; const r = e.target.closest(".mi2"); if (r) { const p = pop.el.querySelector("#peek"); if (p) p.innerHTML = peek(r.dataset.id); } });
  document.addEventListener("focusin", (e) => { if (S.scheme !== "B" || !pop) return; const r = e.target.closest(".mi2"); if (r) { const p = pop.el.querySelector("#peek"); if (p) p.innerHTML = peek(r.dataset.id); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (pop) { closePop(); e.preventDefault(); } else if (document.querySelector(".cover")) { document.querySelector(".cover").remove(); } return; }
    if ((e.metaKey || e.ctrlKey) && e.key === "\\") { e.preventDefault(); if (S.prev !== undefined) doSwitch(S.prev); return; }
    if (!pop) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { const its = [...pop.el.querySelectorAll(".mi2,.mi")]; if (!its.length) return; const i = its.indexOf(document.activeElement); its[(i + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length].focus(); e.preventDefault(); }
    if (e.key === "Enter" && e.target.id === "newname") pop.el.querySelector('[data-act="create"]').click();
    if (e.key === "Enter" && e.target.dataset.act === "mq") { const first = pop.el.querySelector(".mi2"); if (first) first.click(); }
  });
  document.getElementById("fault").addEventListener("change", (e) => { S.fault = e.target.value; if (S.fault === "empty") S.current = null; render(); });
  document.getElementById("reset").addEventListener("click", () => { const keep = { lang: S.lang, theme: S.theme }; S = { ...fresh(), ...keep }; closePop(false); document.querySelector(".cover")?.remove(); render(); });
  render();
})();
