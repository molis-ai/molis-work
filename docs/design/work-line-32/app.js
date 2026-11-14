// 第 32 批定样 — 事项线外壳、事件登记、事件卡、后台任务面板、回应与去处、结果回流。
// 剧本式的可点原型：不连 Home、不调模型，任务状态全是模拟的。
(() => {
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const KEY = "molis-proto.work-line-32.v1";
  const fresh = () => ({ scheme: "E", dlg: false, tabs: [], lang: "zh", theme: "light", fault: "none", step: 0, side: null, focus: null, task: null, panel: false,
    to: "assistant", dest: {}, by: {}, decided: null, accepted: false, online: false, stopped: {}, checks: {}, retried: false, att: [] });
  let S = load(), draft = null, lastTab = null, menu = null, beat = 2, beatT = null, toastT = null, seen = new Set(), firstDraw = true;
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const zh = () => S.lang === "zh";
  const tx = (pair) => (Array.isArray(pair) ? pair[zh() ? 0 : 1] : pair);
  const q = (s) => (zh() ? `「${s}」` : `“${s}”`);
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const btn = (label, act, o = {}) => `<button type="button" class="mw-btn mw-btn--${o.v ?? "secondary"} mw-btn--sm" data-slot="button" data-act="${act}"${o.id ? ` data-id="${o.id}"` : ""}${o.val ? ` data-v="${o.val}"` : ""}${o.aria ? ` aria-label="${esc(o.aria)}"` : ""}>${o.icon ? ic(o.icon, "sm") : ""}${label ? `<span data-slot="button-label">${esc(label)}</span>` : ""}</button>`;
  const iconBtn = (icon, act, label, id = "") => `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon" data-slot="button" data-act="${act}" data-id="${id}" aria-label="${esc(label)}" title="${esc(label)}">${ic(icon, "sm")}</button>`;

  // ---------- 谁在线上登记 ----------
  const SRC = {
    assistant: { n: ["助理", "Assistant"], icon: "sparkles", hue: "blue" }, coding: { n: ["Coding", "Coding"], icon: "code", hue: "purple" },
    todo: { n: ["待办", "Todo"], icon: "check", hue: "green" }, feed: { n: ["Feed", "Feed"], icon: "rss", hue: "orange" },
    inbox: { n: ["Inbox", "Inbox"], icon: "inbox", hue: "mint" }, char: { n: ["文案编辑", "Copy editor"], icon: "user", hue: "pink" },
  };
  const PEERS = { assistant: ["助理", "Assistant"], char: ["文案编辑", "Copy editor"], char2: ["用研助手", "Research aide"] };
  const peerName = (k) => tx(PEERS[k] ?? PEERS.assistant);
  const own = (src) => `<span class="own" style="--hue:var(--hue-${SRC[src].hue})">${ic(SRC[src].icon)}</span>`;

  // 手边：「＋」里的 Shelf、灵光、项目资料，选一项就附在这句话上
  const HAND = [
    { g: ["Shelf", "Shelf"], items: [{ icon: "image", n: ["旧版定价截图", "Old pricing screenshot"] }, { icon: "columns", n: ["竞品定价对比表", "Competitor pricing table"] }] },
    { g: ["灵光", "Sparks"], items: [{ icon: "idea", n: ["年付打八折？", "20% off yearly?"] }] },
    { g: ["项目资料", "Materials"], items: [{ icon: "note", n: ["用户访谈", "User interviews"] }, { icon: "note", n: ["品牌用语表", "Brand wording"] }] },
  ];
  const MORE_TABS = [["竞品对比", "Competitor notes"], ["发布检查清单", "Launch checklist"], ["首页横幅", "Home banner"]];

  // ---------- 剧本 ----------
  const SAY = [null,
    { u: ["把定价页改成三档，发布前给我看一眼。", "Make the pricing page three tiers and show me before launch."], task: "k1", def: { kind: "new" },
      a: ["好，交给 Coding 去改，改完先给你看。", "On it. Coding will make the change and I'll show you first."] },
    { u: ["顺便查一下，上周访谈里谁提过价格？", "Also, who mentioned pricing in last week's interviews?"], task: "k2", def: { kind: "none" },
      a: ["我去翻访谈记录，查到告诉你。", "I'll go through the interview notes and tell you."] },
    { u: ["发布前检查里的链接，帮我都点一遍。", "Click through every link in the launch checklist for me."], task: "k3", def: { kind: "event", id: "todo1" },
      a: ["好，12 个链接我挨个点，结果记到那条待办上。", "Sure. I'll check all 12 links and note the result on that to-do."] },
    { from: "k2", a: ["查到了：访谈 02 说「专业版有点贵」，访谈 03 问有没有年付。都在项目资料「用户访谈」里。", "Found it: interview 02 said “Pro is a bit pricey”, and interview 03 asked about yearly billing. Both are in Materials › User interviews."] },
    { from: "k1", a: ["定价页有一处要你定：企业版写价格，还是写「联系我们」？", "The pricing page needs one decision from you: show a price for Enterprise, or “Contact us”?"],
      fail: ["定价页没改完：390 宽度下第三档还是掉到下一行。改动没有提交，前两步的结果留着。", "The pricing page didn't finish: at 390 the third tier still wraps. Nothing was committed; the first two steps are kept."] },
    { from: "k1", auto: true, a: ["定价页改好了，三种宽度都核对过。发布说明里的定价段我也照着改了。首页横幅不在这次交办里，要改的话你说一声。", "The pricing page is done and checked at all three widths. I also updated the pricing paragraph in the release notes. The home banner wasn't part of this request, so tell me if you want it changed."] },
  ];
  const STEPS = [["开始：线上只有插件登记的事件", "Start: only events plugins registered"], ["① 说一件值得跟的事", "① Something worth following"], ["② 随口问一件", "② A quick aside"],
    ["③ 为线上已有的事件办", "③ For an event already on the line"], ["④ 结果回到助理", "④ A result returns"], ["⑤ 任务要你定", "⑤ A task needs you"], ["⑥ 办完，助理接着推进", "⑥ Done, the assistant carries on"]];
  const FAULTS = { none: ["正常", "Normal"], queue: ["排队（同时只跑 1 项）", "Queued (one at a time)"], fail: ["任务失败", "A task fails"], offline: ["断线后核对", "Disconnect and reconcile"], source: ["一个来源读不到", "One source unreadable"] };
  const offline = () => S.fault === "offline" && !S.online && S.step >= 2;

  function tasks() {
    const st = S.step, queue = S.fault === "queue", list = [];
    const add = (id, since, o) => { if (st >= since) list.push({ id, since, dest: S.dest[id] ?? SAY[since].def, by: S.by[id] ?? "assistant", ...o }); };
    add("k1", 1, { title: ["定价页改成三档", "Pricing page in three tiers"], who: "coding",
      steps: [["读现有定价页", "Read the current page"], ["改成三档布局", "Lay out three tiers"], ["三种宽度截图核对", "Check screenshots at three widths"], ["交回", "Hand back"]],
      cur: st <= 1 ? 0 : st <= 4 ? 1 : st === 5 ? 2 : 3,
      state: st >= 6 ? "done" : st === 5 ? (S.fault === "fail" ? (S.retried ? "running" : "failed") : S.decided ? "running" : "wait") : "running" });
    add("k2", 2, { title: ["查访谈里谁提过价格", "Who mentioned pricing"], who: "peer", steps: [["读访谈记录", "Read the notes"], ["汇总", "Summarise"]],
      cur: st >= 3 ? 1 : 0, state: st >= 4 ? "done" : queue ? "queued" : "running" });
    add("k3", 3, { title: ["把发布页链接点一遍", "Check every launch link"], who: "peer", steps: [["打开发布页", "Open the launch page"], ["逐个点链接", "Click each link"]],
      cur: st >= 5 ? 1 : 0, state: st >= 6 ? "done" : queue && st < 4 ? "queued" : "running" });
    for (const k of list) {
      if (S.stopped[k.id] && k.state !== "done") k.state = "stopped";
      if (offline() && ["running", "queued"].includes(k.state)) k.state = "unknown";
    }
    return list;
  }
  const RING = { queued: "waiting", running: "running", wait: "decide", done: "done", failed: "failed", stopped: "stale", unknown: "stale" };
  const STATE = { queued: ["排队", "Queued"], running: ["在办", "Working"], wait: ["等你决定", "Needs your decision"], done: ["办完了", "Done"], failed: ["失败", "Failed"], stopped: ["已停止", "Stopped"], unknown: ["状态待核对", "To be reconciled"] };
  const whoName = (k) => (k.who === "coding" ? "Coding" : peerName(k.by));
  function stepLine(k) {
    if (k.state === "queued") return tx(["排队：本机同时只跑 1 项", "Queued: one task at a time on this device"]);
    if (k.state === "unknown") return tx(["最后更新 09:41，重连后先核对", "Last update 09:41; reconciled after reconnect"]);
    if (k.state === "wait") return tx(["企业版写价格，还是「联系我们」？", "Enterprise: a price or “Contact us”?"]);
    if (k.state === "failed") return tx(["截图核对没过：390 宽第三档掉行", "Screenshot check failed: tier 3 wraps at 390"]);
    if (k.state === "stopped") return tx(["已停止，做完的部分留着", "Stopped; finished parts are kept"]);
    if (k.state === "done") return tx(["已交回", "Handed back"]);
    return tx(k.steps[k.cur]);
  }

  function events() {
    const ts = tasks(), noFeed = S.fault === "source";
    const ev = [
      { id: "feed1", src: "feed", place: "occurred", title: ["竞品上线了新定价", "A competitor shipped new pricing"], sum: ["昨天", "Yesterday"] },
      { id: "inbox1", src: "inbox", place: "occurred", title: ["法务回信：条款可以用", "Legal replied: terms are fine"], sum: ["09:12", "09:12"] },
      { id: "cod1", src: "coding", place: "occurred", title: ["修复移动端导航", "Fix mobile navigation"], sum: ["10:02 完成", "Done 10:02"], state: "done" },
      { id: "todo1", src: "todo", place: "today", title: ["发布前检查", "Launch checklist"], sum: ["今天截止", "Due today"] },
      { id: "inbox2", src: "inbox", place: "today", title: ["回复报价单", "Reply to the quote"], sum: ["等你回 · 周五前", "Needs your reply · by Fri"], wait: true },
      { id: "todo2", src: "todo", place: "today", title: ["回访三位试用用户", "Follow up with three trial users"], sum: ["明天", "Tomorrow"] },
    ].filter((e) => !(noFeed && e.src === "feed"));
    for (const k of ts) if (k.dest.kind === "new") ev.push({ id: "ev_" + k.id, src: k.by === "assistant" ? "assistant" : "char", made: k.id, title: k.title, place: k.state === "done" ? "occurred" : "active", sum: null });
    for (const e of ev) {
      e.tasks = ts.filter((k) => (k.dest.kind === "new" && e.made === k.id) || (k.dest.kind === "event" && k.dest.id === e.id));
      const has = (s) => e.tasks.some((k) => k.state === s), live = e.tasks.filter((k) => k.state !== "done");
      if (e.tasks.length) {
        e.state = has("failed") ? "failed" : has("wait") ? "wait" : has("unknown") ? "stale" : has("running") ? "running" : has("queued") ? "queued" : has("stopped") ? "stale" : "done";
        if (e.made) e.sum = live.length ? (e.state === "wait" ? ["等你决定", "Needs your decision"] : e.state === "failed" ? ["没办成", "Failed"] : [stepLine(live[0]), stepLine(live[0])]) : S.accepted ? ["已验收", "Accepted"] : ["办完了 · 等你验收", "Done · needs review"];
        if (e.made && !live.length && !S.accepted) { e.state = "wait"; e.review = true; e.place = "active"; } // 等你的排在「现在」旁边，不沉到已办里
        if (!e.made && !live.length && e.id === "todo1") e.sum = ["12 个链接都通 · 今天截止", "All 12 links work · due today"];
      }
      if (e.wait) e.state = "wait";
      e.needsYou = e.state === "wait";
    }
    return ev;
  }
  const destLabel = (d) => d.kind === "new" ? tx(["新事件", "New event"]) : d.kind === "none" ? tx(["不属于事件 · 在后台任务里", "Not on the line · in background tasks"])
    : tx(["为", "For "]) + q(tx(events().find((e) => e.id === d.id)?.title ?? ["事件", "event"])) + tx(["办", ""]);

  // ---------- 画 ----------
  const ring = (kind) => window.kitRing(kind);
  function evHtml(e) {
    const st = e.state === "queued" ? "running" : e.state ?? "", live = e.tasks.filter((k) => k.state !== "done");
    let tk = "";
    if (live.length) {
      if (S.scheme === "A" || S.scheme === "D" || S.scheme === "E") tk = `<span class="tk">${ring(RING[live[0].state])}${live.length > 1 ? live.length : ""}</span>`;
      else if (S.scheme === "B") tk = `<span class="tk">${live.map((k) => `<i class="${k.state === "wait" ? "y" : k.state === "queued" ? "q" : ""}"></i>`).join("")}</span>`;
      else tk = `<span class="tk">${ring(RING[live[0].state])}${tx([`${live.length} 项`, `${live.length}`])}</span>`;
    } else if (e.state === "done") tk = `<span class="tk">${ring("done")}</span>`;
    const isNew = !seen.has(e.id) && !firstDraw; seen.add(e.id);
    return `<button type="button" class="wl-ev${isNew ? " fresh" : ""}" data-act="focus" data-id="${e.id}" data-state="${st}" aria-current="${S.focus === e.id}" title="${esc(SRC[e.src] ? tx(SRC[e.src].n) : "")} · ${esc(tx(e.title))}">${own(e.src)}<span class="nm">${esc(tx(e.title))}</span>${e.sum ? `<small>${esc(tx(e.sum))}</small>` : ""}${tk}</button>`;
  }
  function lineHtml() {
    const ev = events(), past = ev.filter((e) => e.place === "occurred"), act = ev.filter((e) => e.place === "active"), next = ev.filter((e) => e.place === "today");
    const waits = ev.filter((e) => e.needsYou).length;
    const issue = S.fault === "source" ? `<button type="button" class="wl-ev issue" data-act="reload">${ic("circle-alert", "sm")}<span class="nm">${tx(["Feed 读不到 · 重试", "Feed unreadable · retry"])}</span></button>` : "";
    const head = `<button type="button" class="wl-head" data-act="menu" data-id="head" aria-haspopup="menu">${ic("folder", "sm")}<span class="nm">${tx(["网站改版 v2", "Website v2"])}</span>${waits ? `<span class="wl-count" title="${tx(["等你", "Needs you"])}">${waits}</span>` : ""}${ic("chevron-down", "sm")}</button>`;
    return `<div class="wl-track"><div class="wl-wing past">${head}<div class="wl-run">${issue}${past.map(evHtml).join("")}${act.map(evHtml).join("")}</div></div>
      <span class="wl-now">${tx(["现在", "Now"])}</span>
      <div class="wl-wing next"><div class="wl-run">${next.map(evHtml).join("")}</div><span class="wl-wlabel">${tx(["接下来", "Next"])}</span></div></div>
      <div class="wl-slot${S.scheme === "E" ? " bar-center" : ""}">${S.scheme === "E" && S.dlg ? dialogHtml() + floatHtml() : ""}${stackHtml()}${capHtml()}</div>`;
  }
  function capHtml() {
    const joined = S.scheme === "A" && panelShown() && !S.focus && !S.task;
    const cur = S.scheme === "E" && S.dlg && S.focus ? events().find((e) => e.id === S.focus) : null;
    const line = draft ?? (S.step < 3 ? tx(SAY[S.step + 1].u) : "");
    const atts = S.att.length ? `<div class="wl-atts" role="list" aria-label="${tx(["附上的", "Attached"])}">${S.att.map((a, i) => `<span class="wl-att" role="listitem">${ic(a.icon, "sm")}<span>${esc(tx(a.n))}</span><button type="button" data-act="unatt" data-id="${i}" aria-label="${tx(["移除", "Remove"])}">${ic("x", "sm")}</button></span>`).join("")}</div>` : "";
    const ph = cur ? tx(["关于这件事，对", "About this event, tell "]) + esc(peerName(S.to)) + tx(["说…", "…"]) : tx(["对", "Say something to "]) + esc(peerName(S.to)) + tx(["说点什么…", "…"]);
    return `<div class="wl-cap${joined ? " joined" : ""}">${atts}
      <button type="button" class="wl-cbtn" data-act="menu" data-id="hand" aria-haspopup="menu" aria-label="${tx(["手边", "At hand"])}" title="${tx(["手边：Shelf、灵光、资料", "At hand: Shelf, sparks, materials"])}">${ic("plus")}</button>
      <button type="button" class="wl-to" data-act="menu" data-id="to" data-to="${S.to === "assistant" ? "assistant" : "char"}" aria-haspopup="menu" title="${tx(["发给", "Send to"])}">${S.to === "assistant" ? ic("sparkles", "sm") : `<span class="who hu">${esc(peerName(S.to).slice(0, 1))}</span>`}<span>${esc(peerName(S.to))}</span>${ic("chevron-down", "sm")}</button>
      <textarea id="msg" rows="1" placeholder="${ph}">${esc(line)}</textarea>
      <button type="button" class="wl-cbtn go" data-act="send" aria-label="${tx(["发送", "Send"])}">${ic("arrow")}</button></div>`;
  }
  const panelShown = () => tasks().length > 0;
  // 方案 D：助理对话框右上角的图标，点开后任务浮窗贴在对话框右边；工作面不让位
  let hdExtra = "";
  const floatMode = () => (S.scheme !== "D" && S.scheme !== "E" ? null : S.task ? "task" : S.panel ? "list" : null);
  function tasksIcon() {
    const live = tasks().filter((k) => k.state !== "done"), you = live.filter((k) => k.state === "wait").length;
    const lead = live.find((k) => k.state === "wait") ?? live.find((k) => k.state === "failed") ?? live[0];
    return `<button type="button" class="wl-tico" data-act="panel" aria-expanded="${!!floatMode()}" data-you="${you > 0}" data-bad="${live.some((k) => k.state === "failed")}" data-off="${offline()}" title="${tx(["后台任务", "Background tasks"])}" aria-label="${tx(["后台任务", "Background tasks"])}${live.length ? " " + live.length : ""}">${offline() ? ic("circle-alert", "sm") : lead ? ring(RING[lead.state]) : ic("activity", "sm")}${live.length ? `<b>${live.length}</b>` : ""}</button>`;
  }
  function floatHtml() {
    const mode = floatMode(); if (!mode) return "";
    const cls = `wl-tfloat${S.scheme === "E" && S.dlg ? " dlg" : ""}`;
    if (mode === "task") return `<div class="${cls}">${cardHtml(false, "task")}</div>`;
    const ts = tasks(), live = ts.filter((k) => k.state !== "done"), done = ts.filter((k) => k.state === "done");
    return `<div class="${cls}"><article class="wl-card" role="dialog" aria-label="${tx(["后台任务", "Background tasks"])}"><header class="ch">${ic("activity")}<span class="tt">${tx(["后台任务", "Background tasks"])}</span><span class="wl-pline" style="width:auto;height:auto;padding:0;pointer-events:none">${ts.length ? countsHtml(ts) : ""}</span>${iconBtn("x", "fclose", tx(["关闭", "Close"]))}</header>
      <div class="cb" style="padding:6px;gap:0">${ts.length ? live.map((k) => rowHtml(k)).join("") + (done.length ? `<div class="wl-lh">${tx(["刚交回的", "Just handed back"])}</div>${done.map((k) => rowHtml(k)).join("")}` : "") : `<div class="wl-empty">${tx(["没有在办的任务。能放到后台办的，说完就会出现在这里。", "Nothing running. Work that can go to the background shows up here."])}</div>`}</div>${bannerHtml()}</article></div>`;
  }
  function rowHtml(k, inCard = false) {
    const serve = inCard ? "" : k.dest.kind === "none" ? `<span class="wl-serve none"><span>${tx(["不属于事件", "No event"])}</span></span>`
      : `<span class="wl-serve">${ic("link", "sm")}<span>${esc(tx(k.dest.kind === "new" ? k.title : events().find((e) => e.id === k.dest.id)?.title ?? k.title))}</span></span>`;
    const ctl = ["running", "queued", "wait"].includes(k.state) ? btn(tx(["停止", "Stop"]), "stop", { id: k.id }) : k.state === "failed" ? btn(tx(["重试", "Retry"]), "retry", { id: k.id }) : "";
    return `<div class="wl-trow${k.state === "done" ? " done" : ""}"><button type="button" class="main" data-act="task" data-id="${k.id}">${ring(RING[k.state])}<span class="tx"><strong>${esc(tx(k.title))}</strong><span class="fact">${esc(whoName(k))} · ${esc(stepLine(k))}</span></span>${serve}</button>${ctl}</div>`;
  }
  function countsHtml(ts) {
    const run = ts.filter((k) => ["running", "queued", "unknown"].includes(k.state)).length, you = ts.filter((k) => k.state === "wait").length, bad = ts.filter((k) => k.state === "failed").length;
    return [run ? `<span><b>${run}</b> ${tx(["在办", "working"])}</span>` : "", you ? `<span class="you"><b>${you}</b> ${tx(["等你", "need you"])}</span>` : "", bad ? `<span style="color:var(--red)"><b>${bad}</b> ${tx(["失败", "failed"])}</span>` : "",
      !run && !you && !bad ? `<span>${tx(["都办完了", "All done"])}</span>` : ""].filter(Boolean).join(`<span class="fact">·</span>`);
  }
  const bannerHtml = () => offline() ? `<div class="wl-pbanner">${ic("circle-alert", "sm")}<span class="grow">${tx(["断线了，状态停在 09:41", "Disconnected; states as of 09:41"])}</span>${btn(tx(["重连", "Reconnect"]), "reconnect")}</div>` : "";
  function panelHtml(joined) {
    const ts = tasks(); if (!ts.length) return "";
    const live = ts.filter((k) => k.state !== "done"), lead = live.find((k) => k.state === "wait") ?? live.find((k) => k.state === "failed") ?? live[0] ?? ts[ts.length - 1];
    const open = S.panel && !S.focus && !S.task;
    return `<section class="wl-panel${joined ? " joined" : ""}" aria-label="${tx(["后台任务", "Background tasks"])}">
      <button type="button" class="wl-pline" data-act="panel" aria-expanded="${open}">${ring(RING[lead.state])}${countsHtml(ts)}<span class="cur">${esc(tx(lead.title))} · ${esc(stepLine(lead))}</span>${ic("chevron-up", "sm chev")}</button>
      ${open ? `<div class="wl-plist">${live.map((k) => rowHtml(k)).join("")}${ts.some((k) => k.state === "done") ? `<div class="wl-lh">${tx(["刚交回的", "Just handed back"])}</div>${ts.filter((k) => k.state === "done").map((k) => rowHtml(k)).join("")}` : ""}</div>` : ""}${bannerHtml()}</section>`;
  }
  function replyHtml() {
    if (S.step < 1 || ((S.focus || S.task) && (S.scheme === "A" || (S.scheme === "B" && S.task)))) return "";
    const say = SAY[S.step], who = say.from ? tasks().find((k) => k.id === say.from)?.by ?? "assistant" : S.by[say.task] ?? "assistant";
    const k = say.task ? tasks().find((x) => x.id === say.task) : null;
    const text = S.step === 5 && S.fault === "fail" ? say.fail : say.a;
    const hd = `<div class="hd">${who === "assistant" ? `<span class="who ai">AI</span>` : `<span class="who hu">${esc(peerName(who).slice(0, 1))}</span>`}<span>${esc(peerName(who))}</span>${say.from ? `<span class="wl-from">${ic("refresh", "sm")}${tx(["任务交回：", "Returned: "])}${esc(tx(tasks().find((x) => x.id === say.from).title))}</span>` : ""}<span class="grow"></span>${hdExtra}${S.scheme === "E" ? iconBtn("chevron-up", "dlg", tx(["展开对话", "Open the conversation"])) : iconBtn("message", "side", tx(["看全部对话", "Whole conversation"]), "chat")}</div>`;
    if (beat === 0) return `<div class="wl-reply" role="status">${hd}<span class="wl-dots"><i></i><i></i><i></i></span></div>`;
    const dest = k && beat >= 2 ? `<div class="wl-dest">${ic(k.dest.kind === "none" ? "list" : "pin", "sm")}<span>${tx(["放到：", "Placed: "])}</span><b>${esc(destLabel(k.dest))}${k.dest.kind === "new" ? " · " + esc(q(tx(k.title))) : ""}</b><span class="grow"></span>${btn(tx(["改", "Change"]), "menu", { id: "dest:" + k.id })}</div>` : "";
    const auto = say.auto ? `<div class="wl-auto">${ic("zap", "sm")}${tx(["在你交办的范围内自己接着做了 · 第 1 次，最多 3 次", "Carried on within your request · 1 of 3 automatic rounds"])}</div>` : "";
    const act = S.step === 5 && S.fault !== "fail" && !S.decided ? `<div class="cf">${btn(tx(["去定", "Decide"]), "focus", { v: "primary", id: "ev_k1" })}</div>` : "";
    return `<div class="wl-reply" role="status">${hd}<p>${esc(tx(text))}</p>${dest}${auto}${act}</div>`;
  }
  // 方案 E（整体版）：展开时就是产品里的助理对话框（同一套面板、标签、消息的类名与样式），任务图标在它右上角
  const peerOf = (i) => { const say = SAY[i]; return say.task ? S.by[say.task] ?? "assistant" : tasks().find((k) => k.id === say.from)?.by ?? "assistant"; };
  function roundHtml(i) {
    const say = SAY[i], latest = i === S.step, k = say.task ? tasks().find((x) => x.id === say.task) : null;
    const text = i === 5 && S.fault === "fail" ? say.fail : say.a;
    const from = say.from ? `<span class="wl-from">${ic("refresh", "sm")}${tx(["任务交回：", "Returned: "])}${esc(tx(tasks().find((x) => x.id === say.from).title))}</span>` : "";
    const dest = k && (!latest || beat >= 2) ? `<div class="wl-dest">${ic(k.dest.kind === "none" ? "list" : "pin", "sm")}<span>${tx(["放到：", "Placed: "])}</span><b>${esc(destLabel(k.dest))}${k.dest.kind === "new" ? " · " + esc(q(tx(k.title))) : ""}</b><span class="grow"></span>${btn(tx(["改", "Change"]), "menu", { id: "dest:" + k.id })}</div>` : "";
    const auto = say.auto ? `<div class="wl-auto">${ic("zap", "sm")}${tx(["在你交办的范围内自己接着做了 · 第 1 次，最多 3 次", "Carried on within your request · 1 of 3 automatic rounds"])}</div>` : "";
    const act = i === 5 && latest && S.fault !== "fail" && !S.decided && S.focus !== "ev_k1" ? `<div class="cf">${btn(tx(["去定", "Decide"]), "focus", { v: "primary", id: "ev_k1" })}</div>` : "";
    const bad = i === 5 && latest && S.fault === "fail" && !S.retried ? `<div class="cf">${btn(tx(["重试这一步", "Retry this step"]), "retry", { v: "primary", id: "k1" })}${btn(tx(["看任务", "See the task"]), "task", { id: "k1" })}</div>` : "";
    const body = latest && beat === 0 ? `<span class="wl-dots"><i></i><i></i><i></i></span>` : `${from}<p>${esc(tx(text))}</p>${dest}${auto}${act}${bad}`;
    return `<div class="assistant-round">${say.u ? `<div class="assistant-msg assistant-msg--user">${esc(tx(say.u))}</div>` : ""}<div class="assistant-msg assistant-msg--assistant wl-amsg">${body}</div></div>`;
  }
  function dialogHtml() {
    const evs = events(), cur = S.focus ? evs.find((e) => e.id === S.focus) : null;
    const tab = (id, label, icon, on, closable) => `<div class="assistant-tab"${on ? " data-current" : ""}><button type="button" class="assistant-tab-main" role="tab" aria-selected="${on}" data-act="tab" data-id="${id}">${icon}<span class="assistant-tab-title">${esc(label)}</span></button>${closable ? `<button type="button" class="assistant-tab-close" data-act="tabclose" data-id="${id}" aria-label="${tx(["关闭", "Close"])}">${ic("x", "sm")}</button>` : ""}</div>`;
    const face = (p) => (p === "assistant" ? ic("sparkles", "sm") : `<span class="who hu">${esc(peerName(p).slice(0, 1))}</span>`);
    const peers = ["assistant"]; for (let i = 1; i <= S.step; i++) if (!peers.includes(peerOf(i))) peers.push(peerOf(i)); if (!peers.includes(S.to)) peers.push(S.to);
    const unread = S.step && peerOf(S.step) !== S.to && SAY[S.step].from ? peerOf(S.step) : null; // 别的对话里刚有任务交回
    const tabs = peers.map((p) => tab("peer:" + p, peerName(p), face(p) + (unread === p ? `<i class="wl-udot" title="${tx(["有新的交回", "A result came back"])}"></i>` : ""), !cur && S.to === p, false)).join("")
      + S.tabs.map((id) => { const e = evs.find((x) => x.id === id); return e ? tab(id, tx(e.title), own(e.src), S.focus === id, true) : ""; }).join("");
    const rounds = [];
    for (let i = 1; i <= S.step; i++) {
      const k = SAY[i].task || SAY[i].from;
      if (cur ? !(cur.made === k || cur.tasks.some((x) => x.id === k)) : peerOf(i) !== S.to) continue;
      rounds.push(roundHtml(i));
    }
    const head = cur ? `<div class="wl-evcard"><div class="fact">${esc(tx(SRC[cur.src].n))}${cur.sum ? " · " + esc(tx(cur.sum)) : ""}</div>${cardInner("focus").body}</div>` : "";
    const empty = !rounds.length && !cur ? `<div class="assistant-empty"><strong>${S.to === "assistant" ? tx(["个人工作助理", "Your work assistant"]) : esc(peerName(S.to))}</strong><p>${S.to === "assistant" ? tx(["说要办的事。能放到后台办的，我接下来就去办，办完回到这里。", "Say what needs doing. What can run in the background, I take away and bring back here."]) : tx(["和它的对话单独一条。交给它办的事，办完回到这里，不回到助理那边。", "This is its own conversation. What you hand to it comes back here, not to the assistant."])}</p></div>` : "";
    return `<section class="assistant-panel" data-side="closed" aria-label="${esc(peerName(S.to))}"><header class="assistant-tabbar"><div class="assistant-tabs" role="tablist">${tabs}</div><span class="assistant-tabbar-actions">${tasksIcon()}<button type="button" class="dock-window-action" data-act="dlg" aria-label="${tx(["收起", "Minimise"])}" title="${tx(["收起", "Minimise"])}">${ic("chevron-down")}</button></span></header>
      <div class="assistant-body"><div class="assistant-main"><div class="assistant-thread" role="log">${head}${rounds.join("")}${empty}</div></div></div></section>`;
  }
  function stackHtml() {
    const card = S.scheme === "A" ? cardHtml() : S.scheme === "B" && S.task ? cardHtml() : "";
    if (S.scheme === "A") return `<div class="wl-stack">${card}${replyHtml()}${panelHtml(!card)}</div>`;
    if (S.scheme === "E") {
      if (S.dlg) return "";
      hdExtra = tasksIcon();
      const peek = replyHtml() || (tasks().length ? `<div class="wl-reply"><div class="hd"><span class="who ai">AI</span><span>${esc(peerName(S.to))}</span><span class="grow"></span>${hdExtra}${iconBtn("chevron-up", "dlg", tx(["展开对话", "Open the conversation"]))}</div></div>` : "");
      hdExtra = "";
      return `<div class="wl-stack">${peek}${floatHtml()}</div>`;
    }
    if (S.scheme === "D") {
      hdExtra = tasksIcon();
      const dialog = S.focus && S.side !== "card" ? cardHtml(false, "focus") : replyHtml() || (tasks().length ? `<div class="wl-reply"><div class="hd"><span class="who ai">AI</span><span>${esc(peerName(S.to))}</span><span class="grow"></span>${hdExtra}</div></div>` : "");
      hdExtra = "";
      return `<div class="wl-stack">${dialog}${floatHtml()}</div>`;
    }
    if (S.scheme === "B") {
      const ts = tasks(), chips = ts.length ? `<div class="wl-chips" role="group" aria-label="${tx(["后台任务", "Background tasks"])}">${ts.map((k) => `<button type="button" class="wl-tchip" data-act="task" data-id="${k.id}" data-state="${k.state}">${ring(RING[k.state])}<span>${esc(tx(k.title))}</span><small>${esc(k.state === "running" ? stepLine(k) : tx(STATE[k.state]))}</small></button>`).join("")}</div>` : "";
      return `<div class="wl-stack">${card}${replyHtml()}${chips}${offline() ? `<section class="wl-panel">${bannerHtml()}</section>` : ""}</div>`;
    }
    const ts = tasks(), live = ts.filter((k) => k.state !== "done");
    const right = `<section class="wl-panel" aria-label="${tx(["后台任务", "Background tasks"])}"><div class="ph">${ic("activity", "sm")}${tx(["后台任务", "Background tasks"])}<span class="grow"></span>${ts.length ? countsHtml(ts) : ""}</div>${ts.length ? `<div class="wl-plist">${live.map((k) => rowHtml(k)).join("")}${ts.filter((k) => k.state === "done").map((k) => rowHtml(k)).join("")}</div>` : `<div class="wl-empty">${tx(["没有在办的任务。能放到后台办的，说完就会出现在这里。", "Nothing running. Work that can go to the background shows up here."])}</div>`}${bannerHtml()}</section>`;
    const left = replyHtml() || `<div class="wl-reply"><div class="hd"><span class="who ai">AI</span>${esc(peerName(S.to))}</div><p class="fact">${tx(["说一件事，回应先出现在这里。", "Say something; the reply shows up here first."])}</p></div>`;
    return `<div class="wl-stack wide"><div class="wl-deck">${left}${right}</div></div>`;
  }

  // ---------- 事件卡与任务卡 ----------
  function taskRows(e) { return e.tasks.length ? `<div class="wl-sec"><h4>${tx(["背后的任务", "Tasks behind it"])}</h4>${e.tasks.map((k) => rowHtml(k, true)).join("")}</div>` : ""; }
  function decideHtml() {
    if (S.decided) return `<div class="wl-decide answered"><span class="q">${tx(["企业版写价格，还是写「联系我们」？", "Enterprise: a price, or “Contact us”?"])}</span><span class="fact">${tx(["你定了：", "You chose: "])}${S.decided === "contact" ? tx(["写「联系我们」", "“Contact us”"]) : tx(["写价格", "Show a price"])} · ${tx(["只作用于这件事", "applies to this only"])}</span></div>`;
    return `<div class="wl-decide"><span class="q">${tx(["企业版写价格，还是写「联系我们」？", "Enterprise: a price, or “Contact us”?"])}</span><span class="fact">${tx(["旧版写的是「联系我们」；写价格要再等法务确认，晚半天左右。", "The old page says “Contact us”; a price needs legal sign-off, about half a day."])}</span><div class="cf">${btn(tx(["写「联系我们」", "“Contact us”"]), "decide", { v: "primary", val: "contact" })}${btn(tx(["写价格", "Show a price"]), "decide", { val: "price" })}</div></div>`;
  }
  function reviewHtml() {
    const tier = (k) => `<span class="mw-badge mw-badge--${k === 0 ? "success" : k === 1 ? "neutral" : "warning"}" data-slot="badge">${[tx(["机器核过", "Machine-checked"]), tx(["自述", "Self-reported"]), tx(["等你认可", "Needs your OK"])][k]}</span>`;
    const req = (name, k) => `<div class="wl-req">${ring(k === 0 ? "done" : k === 2 && !S.accepted ? "accept" : "done")}<span class="nm">${name}</span>${S.accepted && k === 2 ? tier(0).replace(tx(["机器核过", "Machine-checked"]), tx(["你已认可", "You accepted"])) : tier(k)}</div>`;
    return `<div class="wl-sec"><h4>${tx(["逐项对照 · 所核版本 v3", "Item by item · checked version v3"])}</h4>${req(tx(["三档并排，1440／1024／390 都不掉行", "Three tiers side by side at 1440 / 1024 / 390"]), 0)}${req(tx(["企业版写「联系我们」", "Enterprise says “Contact us”"]), 1)}${req(tx(["发布前给你看一眼", "You see it before launch"]), 2)}</div>
      <div class="cf">${S.accepted ? `<span class="fact">${tx(["已验收 · 认可记在 v3 上", "Accepted · recorded against v3"])}</span>` : btn(tx(["认可", "Accept"]), "accept", { v: "primary" }) + btn(tx(["再改改", "Revise"]), "sim")}${btn(tx(["打开定价页", "Open the page"]), "sim", { icon: "external" })}</div>`;
  }
  function eventBody(e) {
    if (e.made) {
      const k = tasks().find((x) => x.id === e.made);
      return `<div class="quote">${esc(tx(SAY[k.since].u))}</div>${k.state === "wait" || (S.decided && k.state !== "done") ? decideHtml() : ""}${k.state === "failed" ? `<div class="mw-alert mw-alert--danger" data-slot="alert" role="alert"><div>${esc(stepLine(k))}。${tx(["改动没有提交。", "Nothing was committed."])}</div></div>` : ""}${e.review || S.accepted ? reviewHtml() : ""}${taskRows(e)}`;
    }
    if (e.id === "todo1") {
      const items = [["文案过一遍", "Proofread the copy"], ["定价页核对", "Check the pricing page"], ["发布页链接都能点", "Every launch link works"]];
      return `<div class="wl-sec"><h4>${tx(["清单", "Checklist"])}</h4>${items.map((it, i) => `<button type="button" class="wl-check" role="checkbox" aria-checked="${!!S.checks[i]}" data-act="check" data-id="${i}"><span class="box">${S.checks[i] ? ic("check", "sm") : ""}</span><span>${tx(it)}</span></button>`).join("")}</div>${taskRows(e)}<div class="cf">${e.tasks.length ? "" : btn(tx(["让助理办", "Ask the assistant"]), "sim", { icon: "sparkles" })}${btn(tx(["在待办里打开", "Open in Todo"]), "sim", { icon: "external" })}</div>`;
    }
    const sum = { feed1: ["对手把入门档降到每月 9 美元，专业档不变。", "They cut the starter tier to $9 a month; Pro is unchanged."], inbox1: ["法务确认新版条款可以直接用，附了修订稿。", "Legal confirmed the new terms can be used as is; a revision is attached."],
      cod1: ["Coding 会话已结束：改了 3 个文件，测试通过。", "The Coding session ended: 3 files changed, tests pass."], inbox2: ["供应商在等报价单的回复，周五前要给。", "The vendor is waiting for a reply to the quote, due Friday."], todo2: ["三位试用用户，各约 15 分钟。", "Three trial users, about 15 minutes each."] }[e.id];
    return `<p style="margin:0;line-height:1.65">${tx(sum)}</p><div class="cf">${e.id === "inbox2" ? btn(tx(["让助理起草回复", "Draft a reply"]), "sim", { v: "primary", icon: "sparkles" }) : ""}${btn(tx(["在", "Open in "]) + tx(SRC[e.src].n) + tx(["里打开", ""]), "sim", { icon: "external" })}</div>`;
  }
  function cardInner(only) {
    if (only === "task" && !S.task) return "";
    if (S.task && only !== "focus") {
      const k = tasks().find((x) => x.id === S.task); if (!k) return "";
      const steps = k.steps.map((s, i) => `<div class="wl-step ${k.state === "done" || i < k.cur ? "" : i === k.cur ? "cur" : "todo"}">${k.state === "done" || i < k.cur ? ring("done") : i === k.cur ? ring(RING[k.state]) : ring("none")}<span>${tx(s)}</span></div>`).join("");
      return { icon: `<span class="own" style="--hue:var(--hue-${k.who === "coding" ? "purple" : "blue"})">${ic(k.who === "coding" ? "code" : "sparkles")}</span>`, title: tx(k.title), sub: tx(STATE[k.state]),
        body: `<dl class="wl-kv"><dt>${tx(["谁在办", "Who"])}</dt><dd>${esc(whoName(k))}${k.who === "coding" ? tx(["（助理交给它）", " (handed over by the assistant)"]) : ""}</dd><dt>${tx(["为哪个事件", "For event"])}</dt><dd style="display:flex;gap:6px;align-items:center;white-space:nowrap">${esc(destLabel(k.dest))}${btn(tx(["改", "Change"]), "menu", { id: "dest:" + k.id })}</dd><dt>${tx(["结果回给", "Returns to"])}</dt><dd>${esc(peerName(k.by))}</dd></dl>
          <div class="wl-sec"><h4>${tx(["步骤", "Steps"])}</h4>${steps}</div><div class="cf">${["running", "queued", "wait"].includes(k.state) ? btn(tx(["停止", "Stop"]), "stop", { id: k.id }) + btn(tx(["补充一句", "Add a note"]), "sim") : ""}${k.state === "failed" ? btn(tx(["重试这一步", "Retry this step"]), "retry", { v: "primary", id: k.id }) : ""}${k.who === "coding" ? btn(tx(["在 Coding 里打开", "Open in Coding"]), "sim", { icon: "external" }) : ""}</div>` };
    }
    const e = events().find((x) => x.id === S.focus); if (!e) return "";
    return { icon: own(e.src), title: tx(e.title), sub: `${tx(SRC[e.src].n)}${e.sum ? " · " + tx(e.sum) : ""}`, body: eventBody(e) };
  }
  function cardHtml(inSide = false, only = S.scheme === "D" && inSide ? "focus" : undefined) {
    const c = cardInner(only); if (!c) return "";
    const inFloat = only === "task";
    return `<article class="wl-card" role="dialog" aria-label="${esc(c.title)}"><header class="ch">${c.icon}<span class="tt">${esc(c.title)}</span><span class="fact" style="white-space:nowrap">${esc(c.sub)}</span>${inFloat ? iconBtn("back", "tolist", tx(["回到任务列表", "Back to the list"])) : hdExtra}${inSide || inFloat ? "" : iconBtn("sidebar", "park", tx(["停到侧边", "Park in the side panel"]))}${iconBtn("x", inFloat ? "fclose" : "close", tx(["关闭", "Close"]))}</header><div class="cb">${c.body}</div></article>`;
  }
  const cardInSide = () => (S.focus || S.task) && (S.side === "card" || (S.scheme === "C" && !S.task) || (S.scheme === "C" && S.task));
  function sideHtml() {
    const tab = cardInSide() ? "card" : S.side; if (!tab) return "";
    const tabs = [["card", tx(["卡", "Card"]), !!(S.focus || S.task)], ["chat", tx(["对话", "Conversation"]), true], ["web", tx(["浏览器", "Browser"]), true]].filter((x) => x[2]);
    let body = "";
    if (tab === "card") body = cardHtml(true);
    else if (tab === "chat") {
      const out = [];
      for (let i = 1; i <= S.step; i++) {
        const say = SAY[i]; if (say.u) out.push(`<div class="wl-msg me"><span class="bub">${esc(tx(say.u))}</span></div>`);
        out.push(`<div class="wl-msg"><span class="who ai">AI</span><span class="tx">${say.from ? `<span class="wl-from">${ic("refresh", "sm")}${tx(["任务交回", "Returned"])}</span> ` : ""}${esc(tx(i === 5 && S.fault === "fail" ? say.fail : say.a))}</span></div>`);
      }
      body = out.join("") || `<div class="wl-empty">${tx(["还没有对话。", "No conversation yet."])}</div>`;
    } else body = `<div class="wl-empty">${tx(["（原型：别的侧边页不在这次定样里）", "(Prototype: other side pages are outside this specimen)"])}</div>`;
    return `<aside class="pane wl-side"><div class="shead"><span class="mw-toggle-group" data-slot="toggle-group" data-seg-thumb role="group">${tabs.map(([k, n]) => `<button type="button" data-act="side" data-id="${k}" aria-pressed="${tab === k}">${n}</button>`).join("")}</span><span style="flex:1"></span>${iconBtn("x", "side", tx(["收起侧边", "Close side panel"]), "")}</div><div class="sbody">${body}</div></aside>`;
  }
  function topHtml() {
    const pins = [["goals", "target", "Goals"], ["pages", "note", "Pages"], ["todo", "check", tx(SRC.todo.n)], ["coding", "code", "Coding"], ["feed", "rss", "Feed"], ["inbox", "inbox", "Inbox"]];
    const named = S.scheme === "B" || S.scheme === "D" || S.scheme === "E";
    return `<div class="wl-pins" role="toolbar" aria-label="${tx(["固定的插件", "Pinned plugins"])}">${pins.map(([k, i, n]) => `<button type="button" class="wl-pin${named && k === "pages" ? " named" : ""}" data-act="sim" data-label="${n}" aria-current="${k === "pages"}" aria-label="${n}" title="${n}">${ic(i)}${named && k === "pages" ? `<span>${n}</span>` : ""}</button>`).join("")}</div>
      <span class="sepv"></span><div class="tabs" role="tablist">${[["定价页", "Pricing page"], ["发布说明", "Release notes"], ["用户访谈", "User interviews"]].map((n, i) => `<button type="button" class="tab" role="tab" aria-selected="${i === 0}" data-act="sim" data-label="${tx(n)}">${ic("note", "sm")}<span>${tx(n)}</span><span class="x">${ic("x", "sm")}</span></button>`).join("")}</div>
      <button type="button" class="more" data-act="menu" data-id="tabs" aria-haspopup="menu" aria-label="${tx(["其余 3 个标签", "3 more tabs"])}" title="${tx(["其余 3 个标签", "3 more tabs"])}">+3</button>
      <div class="tools">${iconBtn("sidebar", "side", tx(["侧边", "Side panel"]), S.side || cardInSide() ? "" : "chat")}<span class="mono">Y</span></div>`;
  }
  function render(keep = true) {
    document.body.classList.toggle("immersive-workbench", S.scheme === "E");
    const d = document.documentElement; d.lang = zh() ? "zh-CN" : "en"; d.dataset.theme = S.theme; d.dataset.resolvedTheme = S.theme;
    const P = { protoTitle: ["定样 · 模拟数据", "Specimen · sample data"], scheme: ["方案", "Option"], step: ["剧本", "Script"], prev: ["上一步", "Back"], next: ["下一步", "Next"], fault: ["情况", "Situation"], lang: ["语言", "Language"], theme: ["外观", "Theme"], light: ["浅", "Light"], dark: ["深", "Dark"], reset: ["重置", "Reset"] };
    for (const el of document.querySelectorAll("[data-t]")) el.textContent = tx(P[el.dataset.t]);
    for (const b of document.querySelectorAll("#scheme button")) b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme);
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    document.getElementById("stepcap").textContent = tx(STEPS[S.step]);
    const f = document.getElementById("fault"); f.innerHTML = Object.entries(FAULTS).map(([k, v]) => `<option value="${k}"${k === S.fault ? " selected" : ""}>${tx(v)}</option>`).join("");
    const dock = S.scheme === "B" && S.focus && !S.task && S.side !== "card" ? `<div class="wl-dock">${cardHtml()}</div>` : "";
    if (S.scheme === "C" && (S.focus || S.task)) S.side = "card";
    const scroll = document.querySelector(".wl-plist")?.scrollTop ?? 0;
    const trackAt = document.querySelector(".wl-track")?.scrollLeft ?? 0;
    const threadAt = document.querySelector(".assistant-thread")?.scrollTop ?? 0;
    const hadDlg = !!document.querySelector(".assistant-panel"), hadFloat = !!document.querySelector(".wl-tfloat"), hadPeek = !!document.querySelector(".wl-stack .wl-reply");
    document.getElementById("app").innerHTML = `<header class="wl-top">${topHtml()}</header>
      <div class="wl-stage"><div class="wl-main"><section class="pane"><div class="wl-doc"><h1>${tx(["定价页", "Pricing page"])}</h1><p class="fact">Pages · ${tx(["网站改版 v2", "Website v2"])}</p>${"<div class='ln'></div><div class='ln'></div><div class='ln s'></div>".repeat(4)}</div></section>${dock}</div>${sideHtml()}</div>
      <footer class="wl-line" aria-label="${tx(["事项线", "Work line"])}">${lineHtml()}</footer>`;
    const pl = document.querySelector(".wl-plist"); if (pl && keep) pl.scrollTop = scroll;
    const stack = document.querySelector(".wl-stack"), stage = document.querySelector(".wl-stage");
    // 让位只算常驻的部分（后台任务面板）；回应与卡是浮在工作面上的，不推版面。
    const stay = S.scheme === "C" ? stack : document.querySelector(".wl-stack .wl-panel, .wl-stack .wl-chips");
    stage.style.setProperty("--yield", `${stay && stay.offsetHeight ? stay.offsetHeight + 8 : 0}px`);
    const tf = document.querySelector(".wl-tfloat"), host = document.querySelector(".assistant-panel") ?? stack; // 右边放不下时，浮窗叠到对话框上
    if (tf && host) tf.classList.toggle("over", innerWidth - host.getBoundingClientRect().right < 350);
    if (tf && tf.classList.contains("dlg") && !tf.classList.contains("over") && !matchMedia("(max-width:760px)").matches) { // 浮窗的上沿对齐对话框的上沿，紧挨着右上角的图标
      const slot = document.querySelector(".wl-slot"); tf.style.bottom = `${slot.offsetHeight + 8 + host.offsetHeight - tf.offsetHeight}px`;
    }
    const th = document.querySelector(".assistant-thread"); // 主对话停在最新一句；事件标签换了一个就从事件卡的顶上看起，同一个标签里重画不动
    if (th) { th.scrollTop = !S.focus ? th.scrollHeight : S.focus === lastTab ? threadAt : 0; lastTab = S.focus; }
    const tabsEl = document.querySelector(".assistant-tabs"), curTab = tabsEl?.querySelector("[data-current]"); // 标签多了横向滑，当前的那个始终看得见
    if (curTab) tabsEl.scrollLeft = Math.max(0, curTab.offsetLeft + curTab.offsetWidth - tabsEl.clientWidth + 12);
    if (tabsEl) { const fade = () => tabsEl.classList.toggle("more", tabsEl.scrollLeft + tabsEl.clientWidth < tabsEl.scrollWidth - 4); fade(); tabsEl.addEventListener("scroll", fade, { passive: true }); }
    // 已经开着的面板、浮窗、回应框重画时不再重放进场动效
    if (hadDlg) document.querySelector(".assistant-panel")?.classList.add("wl-still");
    if (hadFloat) tf?.querySelector(".wl-card")?.classList.add("wl-still");
    if (hadPeek && keep) document.querySelector(".wl-stack .wl-reply")?.classList.add("wl-still");
    const pastRun = document.querySelector(".wl-wing.past .wl-run"); if (pastRun) pastRun.scrollLeft = pastRun.scrollWidth;
    if (matchMedia("(max-width:760px)").matches) {
      const track = document.querySelector(".wl-track"), now = document.querySelector(".wl-now");
      track.scrollLeft = firstDraw ? now.offsetLeft - track.offsetLeft - track.clientWidth / 2 + now.offsetWidth / 2 : trackAt;
    }
    grow();
    firstDraw = false; menu = null; save();
  }
  // 输入框随内容长高，最多五行，再多就在框里滚；长高时线和工作面都不动
  function grow() {
    const m = document.getElementById("msg"); if (!m) return; m.style.height = "36px"; m.style.height = `${Math.min(116, Math.max(36, m.scrollHeight))}px`;
    const wide = !matchMedia("(max-width:760px)").matches, slot = document.querySelector(".wl-slot"), line = document.querySelector(".wl-line");
    document.documentElement.style.setProperty("--line-h", `${wide ? slot.offsetHeight + 20 : line.offsetHeight}px`);
  }
  document.addEventListener("input", (e) => { if (e.target.id === "msg") { draft = e.target.value; grow(); } });
  function toast(msg) { document.querySelector(".mw-toast")?.remove(); const el = document.createElement("div"); el.className = "mw-toast"; el.setAttribute("role", "status"); el.style.cssText = "position:fixed;left:50%;top:52px;transform:translateX(-50%);z-index:60"; el.textContent = msg; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2600); }
  function goStep(n, animate = true) {
    n = Math.max(0, Math.min(6, n));
    if (n < S.step) { S = { ...fresh(), scheme: S.scheme, lang: S.lang, theme: S.theme, fault: S.fault, to: S.to }; seen = new Set(); firstDraw = true; }
    while (S.step < n) {
      S.step++; const say = SAY[S.step];
      if (say.task) S.by[say.task] = S.to;
      if (S.step === 6 && !S.decided && S.fault !== "fail") S.decided = "contact";
      if (S.step === 6 && S.fault === "fail") S.retried = true;
    }
    S.focus = null; if (S.scheme !== "E") S.task = null; if (S.side === "card") S.side = null;
    clearTimeout(beatT);
    if (!animate || n === 0) { beat = 2; return render(); }
    beat = SAY[n].from ? 1 : 0; render();
    const nextBeat = () => { beat++; render(); if (beat < 2) beatT = setTimeout(nextBeat, 700); };
    beatT = setTimeout(nextBeat, SAY[n].from ? 0 : 650);
  }
  function openMenu(anchor, id) {
    document.querySelector(".wl-menu")?.remove(); if (menu === id) { menu = null; return; } menu = id;
    const item = (label, act, o = {}) => `<button type="button" class="mw-menu__item${o.desc ? " mw-menu__item--described" : ""}" role="menuitem" data-act="${act}" data-id="${o.id ?? ""}" data-v="${o.val ?? ""}"${o.off ? ' aria-disabled="true"' : ""}>${o.icon ? ic(o.icon, "sm") : ""}<span>${esc(label)}${o.desc ? `<span class="mw-menu__desc">${esc(o.desc)}</span>` : ""}</span>${o.on ? `<span class="mw-menu__check">${ic("check", "sm")}</span>` : ""}</button>`;
    const group = (label, items) => `<div class="mw-menu__group" role="group"><div class="mw-menu__label" aria-hidden="true">${esc(label)}</div>${items}</div>`;
    let html = "";
    if (id === "to") html = group(tx(["发给", "Send to"]), item(peerName("assistant"), "to", { val: "assistant", icon: "sparkles", on: S.to === "assistant" })) + group("Character", item(peerName("char"), "to", { val: "char", icon: "user", on: S.to === "char" }) + item(peerName("char2"), "to", { val: "char2", icon: "user", on: S.to === "char2" })
      + item(tx(["Claude Code 评审员", "Claude Code reviewer"]), "noop", { icon: "terminal", off: true, desc: tx(["本机导入，只能在终端里用", "Imported locally; terminal only"]) }));
    else if (id === "head") {
      const w = events().filter((e) => e.needsYou);
      html = group(tx(["等你", "Needs you"]), w.length ? w.map((e) => item(tx(e.title), "focus", { id: e.id, icon: SRC[e.src].icon, desc: e.sum ? tx(e.sum) : "" })).join("") : item(tx(["现在没有等你的", "Nothing needs you"]), "noop", { off: true }))
        + group(tx(["事项", "Work items"]), item(tx(["网站改版 v2（整个项目）", "Website v2 (whole project)"]), "noop", { on: true, icon: "folder" }) + item(tx(["切换事项", "Switch work item"]), "noop", { off: true, desc: tx(["第二片（第 36 批）做", "Comes in the second slice"]) }));
    } else if (id === "hand") {
      html = HAND.map((h, gi) => group(tx(h.g), h.items.map((it, ii) => item(tx(it.n), "att", { id: gi + ":" + ii, icon: it.icon, on: S.att.some((a) => a.n[0] === it.n[0]) })).join(""))).join("")
        + group(tx(["这台电脑", "This computer"]), item(tx(["选文件…", "Choose files…"]), "sim", { icon: "upload" }));
    } else if (id === "tabs") {
      html = group(tx(["没显示出来的标签", "Tabs that don't fit"]), MORE_TABS.map((n) => item(tx(n), "sim", { icon: "note" })).join(""));
    } else {
      const kid = id.split(":")[1], k = tasks().find((x) => x.id === kid), ev = events().filter((e) => !e.made || e.made !== kid);
      html = group(tx(["放到", "Place"]), item(tx(["新事件", "New event"]), "place", { id: kid, val: "new", icon: "plus", on: k.dest.kind === "new", desc: tx(["在线上多一项，办的过程跟着它", "Adds an item to the line"]) })
        + item(tx(["不属于事件", "Not on the line"]), "place", { id: kid, val: "none", icon: "list", on: k.dest.kind === "none", desc: tx(["只在后台任务里", "Only in background tasks"]) }))
        + group(tx(["为线上的事件办", "For an event on the line"]), ev.filter((e) => e.place !== "occurred").map((e) => item(tx(e.title), "place", { id: kid, val: "event:" + e.id, icon: SRC[e.src].icon, on: k.dest.kind === "event" && k.dest.id === e.id })).join(""));
    }
    const el = document.createElement("div"); el.className = "mw-menu wl-menu"; el.dataset.slot = "menu"; el.setAttribute("role", "menu"); el.innerHTML = html; document.body.appendChild(el);
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    el.style.position = "fixed"; el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`; el.style.top = `${r.top - h - 6 > 48 ? r.top - h - 6 : r.bottom + 6}px`;
    el.querySelector("[role=menuitem]:not([aria-disabled])")?.focus();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set]");
    if (!b) { if (!e.target.closest(".wl-menu")) { document.querySelector(".wl-menu")?.remove(); menu = null; } return; }
    if (b.dataset.scheme) { S.scheme = b.dataset.scheme; S.side = S.side === "card" ? null : S.side; return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    const id = b.dataset.id, act = b.dataset.act;
    if (b.getAttribute("aria-disabled") === "true") return;
    if (act !== "menu") document.querySelector(".wl-menu")?.remove();
    switch (act) {
      case "menu": return openMenu(b, id);
      case "send": draft = null; S.att = []; if (S.step < 3) return goStep(S.step + 1); return toast(tx(["（原型只演示剧本里的三句；后面用「下一步」）", "(The prototype plays three scripted lines; use Next after that)"]));
      case "focus": if (S.scheme === "E") { S.focus = id; S.dlg = true; if (!S.tabs.includes(id)) S.tabs.push(id); return render(); }
        if (S.scheme !== "D") S.task = null; S.focus = S.focus === id ? null : id; if ((S.scheme === "A" || S.scheme === "D") && S.side === "card") S.side = null; return render();
      case "task": S.task = S.task === id ? null : id; if (S.scheme === "C") S.side = "card"; if (S.scheme === "D" || S.scheme === "E") S.panel = true; return render();
      case "close": S.focus = null; if (S.scheme !== "D") S.task = null; if (S.side === "card") S.side = null; return render();
      case "park": S.side = "card"; return render();
      case "side": if (!id) { S.side = null; S.focus = S.scheme === "C" ? null : S.focus; if (S.scheme === "C") S.task = null; } else S.side = id; if (id && id !== "card" && S.scheme === "C") { S.focus = null; S.task = null; } return render();
      case "panel": if (S.scheme === "D" || S.scheme === "E") { const was = !!floatMode(); S.task = null; S.panel = !was; return render(); } S.panel = !S.panel; S.focus = null; S.task = null; return render();
      case "tolist": S.task = null; S.panel = true; return render();
      case "dlg": S.dlg = !S.dlg; return render();
      case "tab": if (id.startsWith("peer:")) { S.to = id.slice(5); S.focus = null; } else S.focus = id; return render();
      case "att": { const [gi, ii] = id.split(":").map(Number), it = HAND[gi].items[ii], at = S.att.findIndex((a) => a.n[0] === it.n[0]); if (at >= 0) S.att.splice(at, 1); else S.att.push(it); return render(); }
      case "unatt": S.att.splice(Number(id), 1); return render();
      case "tabclose": S.tabs = S.tabs.filter((x) => x !== id); if (S.focus === id) S.focus = null; return render();
      case "fclose": S.task = null; S.panel = false; return render();
      case "to": S.to = b.dataset.v; return render();
      case "place": { const v = b.dataset.v; S.dest[id] = v === "new" ? { kind: "new" } : v === "none" ? { kind: "none" } : { kind: "event", id: v.split(":")[1] }; if (S.focus === "ev_" + id && v !== "new") S.focus = null; render(); return toast(tx(["已改：", "Changed: "]) + destLabel(S.dest[id])); }
      case "decide": S.decided = b.dataset.v; render(); return toast(tx(["收到，任务接着办", "Got it; the task continues"]));
      case "accept": S.accepted = true; return render();
      case "stop": S.stopped[id] = true; render(); return toast(tx(["已停止；停下之后才回来的结果不会再写入", "Stopped; results that arrive later are not applied"]));
      case "retry": S.retried = true; delete S.stopped[id]; return render();
      case "check": S.checks[id] = !S.checks[id]; return render();
      case "reconnect": S.online = true; render(); return toast(tx(["重连了：核对过，两项还在办，没有重复派出", "Reconnected: reconciled, two still running, nothing re-dispatched"]));
      case "reload": return toast(tx(["重试了，Feed 还是读不到；其余来源照常显示", "Retried; Feed is still unreadable, other sources show as usual"]));
      case "sim": return toast(`${b.dataset.label ?? b.textContent.trim()}${tx(["（原型不做）", " (not in the prototype)"])}`);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (document.querySelector(".wl-menu")) { document.querySelector(".wl-menu").remove(); menu = null; } else if (floatMode()) { S.task = null; S.panel = false; render(); } else if (S.scheme === "E" && S.dlg) { S.dlg = false; render(); } else if (S.focus || S.task) { S.focus = null; S.task = null; if (S.side === "card") S.side = null; render(); } else if (S.panel) { S.panel = false; render(); } }
    if (e.key === "Enter" && !e.shiftKey && e.target.id === "msg" && !e.isComposing) { e.preventDefault(); document.querySelector('[data-act="send"]').click(); }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.target.classList?.contains("wl-ev")) { const all = [...document.querySelectorAll(".wl-ev")], i = all.indexOf(e.target) + (e.key === "ArrowLeft" ? -1 : 1); all[i]?.focus(); }
  });
  document.getElementById("prev").addEventListener("click", () => goStep(S.step - 1, false));
  document.getElementById("next").addEventListener("click", () => goStep(S.step + 1));
  document.getElementById("fault").addEventListener("change", (e) => { S.fault = e.target.value; S.online = false; S.retried = false; render(); });
  document.getElementById("reset").addEventListener("click", () => { S = { ...fresh(), lang: S.lang, theme: S.theme, scheme: S.scheme }; draft = null; seen = new Set(); firstDraw = true; beat = 2; render(false); });
  render(false);
})();
