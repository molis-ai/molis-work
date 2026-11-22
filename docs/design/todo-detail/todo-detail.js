/* 待办详情页的可点原型。一份状态 S，每次动作后整页重画；标题和说明在输入时不重画（不丢光标）。
   地址参数：?do=<状态> 直接进某个状态；&w=1440|1024|820|390；&theme=dark；&lang=en；&bare 只留窗口（截图用）；&still 关掉动效（截图用）。
   不是产品代码：数据是写死的，「今天」固定为 2026-11-24 周二 10:20。 */
(() => {
  const K = window.mwKit;
  const $ = (s, r = document) => r.querySelector(s);
  const q = new URLSearchParams(location.search);
  const root = document.documentElement;
  const bare = q.has("bare");
  const still = q.has("still");
  if (bare) root.dataset.bare = "";
  if (still) root.dataset.still = "";
  let LANG = q.get("lang") === "en" ? "en" : "zh";
  let W = Number(q.get("w")) || 1440;
  const t = (zh, en) => (LANG === "en" ? en : zh);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const I = (n, c = "") => `<svg class="td-i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (o) => K.renderButton({ size: "md", ...o });

  /* —— 日期 —— */
  const NOW = new Date(2026, 10, 24, 10, 20);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const at = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const plus = (n) => { const d = new Date(NOW); d.setDate(d.getDate() + n); return key(d); };
  const TODAY = key(NOW);
  const diff = (k) => Math.round((at(k) - at(TODAY)) / 864e5);
  const WD = () => t(["周日", "周一", "周二", "周三", "周四", "周五", "周六"], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const md = (k) => { const d = at(k); return t(`${d.getMonth() + 1}月${d.getDate()}日`, `${MON[d.getMonth()]} ${d.getDate()}`); };
  const wd = (k) => WD()[at(k).getDay()];
  const rel = (k) => { const n = diff(k); return n === 0 ? t("今天", "Today") : n === 1 ? t("明天", "Tomorrow") : n === -1 ? t("昨天", "Yesterday") : ""; };
  /* 一句话里的日子：今天、明天，或者「周四」 */
  const day = (k) => rel(k) || (Math.abs(diff(k)) < 7 ? wd(k) : md(k));
  /* 属性栏里的值：周四 11月26日 18:00 */
  const full = (k, time) => `${rel(k) || wd(k)}${t(" ", ", ")}${md(k)}${time ? ` ${time}` : ""}`;
  const friday = () => plus(((5 - NOW.getDay() + 7) % 7) || 7);
  const monday = () => plus(((8 - NOW.getDay()) % 7) || 7);

  /* —— 数据 —— */
  const POOL = () => [
    { id: "p1", title: t("和财务确认 Q4 折扣底线", "Confirm the Q4 discount floor with finance"), status: "doing" },
    { id: "p2", title: t("更新 Q4 报价单", "Update the Q4 quote"), status: "open" },
    { id: "p3", title: t("准备续约合同模板", "Prepare the renewal contract template"), status: "open" },
    { id: "p4", title: t("约王总下周面谈", "Book a meeting with Mr. Wang next week"), status: "waiting" },
    { id: "p5", title: t("整理 Q3 回款情况", "Summarise Q3 collections"), status: "done" },
  ];
  const fullTodo = () => ({
    title: t("给王总回电话，确认 Q4 报价的最终折扣", "Call Mr. Wang back to confirm the final Q4 discount"),
    notes: t("王总上周五来电，问 Q4 续约能不能在 92 折的基础上再让 2 个点。\n回电前先和财务确认底线；如果只能到 91 折，带上延长账期的备选方案。", "Mr. Wang called last Friday asking whether the Q4 renewal could go 2 points below the 8% discount.\nCheck the floor with finance first; if 9% is the limit, bring longer payment terms as the alternative."),
    status: "doing", waiting: { who: "", what: "", follow: "" },
    due: plus(2), dueTime: "18:00", planned: plus(1), remind: { d: plus(2), t: "09:00" },
    place: "project", important: false, doneAt: "",
    sources: [{ kind: "inbox", title: t("王总来电留言", "Voicemail from Mr. Wang"), when: t("11月20日 16:42", "Nov 20, 16:42"),
      reason: t("他在留言里请你周四下班前回电。", "He asks you to call back before the end of Thursday."),
      excerpt: t("Q4 的报价我们内部过了一遍，折扣还想再谈一下，麻烦周四下班前回我个电话。", "We went through the Q4 quote internally and would like to talk about the discount again. Please call me back before the end of Thursday.") }],
    links: [{ id: "p1", rel: "blocked_by" }, { id: "p2", rel: "related" }],
    history: [
      { when: t("今天 10:12", "Today 10:12"), text: t("你改了截止日期、截止时间", "You changed the due date and time"), undo: true },
      { when: t("昨天 17:30", "Yesterday 17:30"), text: t("你改为进行中", "You set it to Active") },
      { when: t("昨天 17:28", "Yesterday 17:28"), text: t("助理关联了「和财务确认 Q4 折扣底线」", "The Assistant linked “Confirm the Q4 discount floor with finance”") },
      { when: t("11月20日 16:50", "Nov 20, 16:50"), text: t("你改了说明", "You changed the description") },
      { when: t("11月20日 16:45", "Nov 20, 16:45"), text: t("助理创建", "The Assistant created it") },
    ],
  });
  const emptyTodo = () => ({
    title: t("订周五团建的餐厅", "Book the restaurant for Friday's team dinner"), notes: "",
    status: "open", waiting: { who: "", what: "", follow: "" }, due: "", dueTime: "", planned: "", remind: null,
    place: "unassigned", important: false, doneAt: "", sources: [{ kind: "manual", when: t("今天 09:40", "Today 09:40") }], links: [],
    history: [{ when: t("今天 09:40", "Today 09:40"), text: t("你创建", "You created it"), undo: true, create: true }],
  });
  const ST = () => ({
    open: { name: t("待处理", "To process"), desc: t("还没开始", "Not started yet"), tone: "idle", ring: "idle" },
    doing: { name: t("进行中", "Active"), desc: t("正在做", "Being worked on"), tone: "progress", ring: "doing" },
    waiting: { name: t("等待他人", "Waiting on others"), desc: t("交出去了，在等对方", "Handed over, waiting for a reply"), tone: "hold", ring: "waiting" },
    done: { name: t("已完成", "Completed"), desc: t("做完了", "Finished"), tone: "done", ring: "done" },
    cancelled: { name: t("已取消", "Cancelled"), desc: t("不做了，留着备查", "Dropped, kept for reference"), tone: "quiet", ring: "cancelled" },
  });
  const PLACE = () => ({
    personal: { name: t("个人空间", "Personal space"), desc: t("只和你有关，不属于哪个项目", "Yours alone, not part of a project"), icon: "user" },
    project: { name: t("项目「官网改版」", "Project “Website redesign”"), desc: t("和这个项目的事放在一起", "Kept with this project's work"), icon: "folder" },
    unassigned: { name: t("暂未归类", "Not placed yet"), desc: t("先放着，之后再归类", "Leave it for now, place it later"), icon: "circle" },
  });
  const REL = () => ({ blocked_by: t("要等它先完成", "Waits for it"), blocks: t("它在等这件", "It waits for this"), related: t("相关", "Related") });

  let S;
  const fresh = (todo = fullTodo()) => { S = { d: todo, pop: null, save: "saved", toast: null, alert: false, dialog: false, hist: false, work: null, chip: false, arrive: "", cal: null, rel: "blocked_by", titleBad: false, typed: "" }; };
  const closed = () => S.d.status === "done" || S.d.status === "cancelled";
  const log = (zh, en) => { S.d.history.forEach((h) => { h.undo = false; }); S.d.history.unshift({ when: t("刚刚", "Just now"), text: t(zh, en), undo: true }); };

  /* —— 窗口骨架（示意，照底栏第十三版简画）—— */
  const top = () => `<div class="td-top">
    <span class="td-top-k td-top-nav">${I("chevron-left")}</span><span class="td-top-k td-top-nav">${I("chevron-right")}</span>
    <span class="td-top-place">${I("home", "s")}<span>${t("官网改版", "Website redesign")} ›</span> <b>${t("Q4 续约", "Q4 renewal")}</b></span>
    <span class="td-top-ear">${I("check", "s")}${t("待办", "Todos")}</span>
    <span class="td-top-k">${I("plus")}</span><span class="td-grow"></span>
    <span class="td-top-k">${I("sidebar")}</span><span class="td-top-k td-top-nav">${I("columns")}</span></div>`;
  const foot = () => `<div class="td-foot" aria-hidden="true">
    <div class="td-foot-acct"><span class="td-avatar">${t("测", "T")}</span><span class="td-grow"><b>${t("测试账号", "Test account")}</b><small>${t("个人版", "Personal")}</small></span>${I("inbox")}${I("grid")}${I("settings")}</div>
    <div class="td-foot-in"><span class="${S.typed ? "typed" : ""}"><span class="td-cut td-grow">${S.typed ? esc(S.typed) : t("对「Q4 续约」说一句，或输入 / 开始一件事", "Say something about “Q4 renewal”, or type / to start")}</span></span>
      <span>${I("plus", "s")}${S.chip ? `<span class="td-foot-chip">${I("check", "xs")}<span class="td-cut">${t("待办", "Todo")}「${esc(S.d.title)}」</span></span>` : ""}<span class="td-grow"></span><small>${t("给", "To")} ✦ ${t("助理", "Assistant")}</small>${I("mic", "s")}<i class="td-foot-send${S.chip ? " on" : ""}">${I("send", "s")}</i></span></div>
    <div class="td-foot-card"><i class="td-foot-dot"></i><span class="td-grow td-cut"><b>${t("定稿续约邮件", "Finalise the renewal email")}</b><small class="td-cut">${t("开头用哪一版？", "Which opening?")}</small></span>${btn({ variant: "secondary", size: "sm", label: t("打开", "Open") })}</div>
  </div>`;

  /* —— 头部：是什么、现在怎样、能做什么 —— */
  const stateBtn = () => { const s = ST()[S.d.status]; return `<button type="button" class="mw-status mw-status--${s.tone} td-state" data-act="pop" data-pop="status" aria-haspopup="menu" aria-expanded="${S.pop === "status"}"${S.arrive === "state" ? " data-pop" : ""} aria-label="${t("状态", "Status")}：${s.name}">${K.renderStateRing({ state: s.ring })}<span>${s.name}</span>${I("chevron-down", "xs")}</button>`; };
  const facts = () => {
    const d = S.d, out = [];
    if (d.status === "done") return [`<span class="td-fact">${d.doneAt || t("今天 10:20", "Today 10:20")} ${t("完成", "completed")}</span>`];
    if (d.status === "cancelled") return [`<span class="td-fact quiet">${t("今天 10:20 取消", "Cancelled today 10:20")}</span>`];
    if (d.due) {
      const n = diff(d.due), when = `${day(d.due)}${d.dueTime ? ` ${d.dueTime}` : ""}`;
      if (n < 0) out.push(K.renderStatusMark({ label: t(`已逾期 ${-n} 天`, `${-n} days overdue`), tone: "blocked", icon: "circle-alert", className: "td-flag" }), `<span class="td-fact quiet">${t("原定", "Was due")} ${full(d.due, d.dueTime)}</span>`);
      else if (n === 0) out.push(K.renderStatusMark({ label: t(`${when} 截止`, `Due ${when.toLowerCase()}`), tone: "attention", icon: "clock", className: "td-flag" }));
      else out.push(`<span class="td-fact">${I("calendar", "s")}${t(`${when} 截止`, `Due ${when}`)}</span>`, `<span class="td-fact quiet">${t(`还有 ${n} 天`, `${n} days left`)}</span>`);
    }
    if (d.planned) out.push(`<span class="td-fact quiet" data-opt>${t(`计划${day(d.planned)}做`, `Planned for ${day(d.planned).toLowerCase()}`)}</span>`);
    if (!out.length) out.push(`<span class="td-fact quiet">${t("还没定日期", "No dates yet")}</span>`);
    return out;
  };
  const acts = () => {
    if (closed()) return btn({ variant: "ghost", icon: "undo", label: t("重新打开", "Reopen"), attrs: { "data-act": "status", "data-v": "open" } }) + (S.d.status === "done" ? btn({ variant: "secondary", icon: "archive", label: t("归档", "Archive"), attrs: { "data-act": "archive" } }) : "");
    const review = S.work && S.work.state === "review";
    return (S.work ? "" : btn({ variant: "secondary", icon: "sparkles", label: t("交给助理推进", "Hand to the Assistant"), attrs: { "data-act": "delegate" } }))
      + btn({ variant: review ? "secondary" : "primary", icon: "check", label: t("完成", "Complete"), attrs: { "data-act": "status", "data-v": "done" } });
  };
  const moreBtn = (cls) => K.renderButton({ variant: "ghost", size: "icon", icon: "more", iconOnly: true, label: t("更多操作", "More"), className: cls, attrs: { "data-act": "pop", "data-pop": "more", "aria-haspopup": "menu", "aria-expanded": String(S.pop === "more") } });
  const head = () => `<header class="td-head">
    <div class="td-titlebox"><div class="td-title" id="title" role="textbox" aria-label="${t("要做什么", "What to do")}" contenteditable="plaintext-only" spellcheck="false" data-placeholder="${t("要做什么", "What to do")}"${closed() ? " data-closed" : ""}${S.titleBad ? ' aria-invalid="true"' : ""}>${esc(S.d.title)}</div>
    ${S.titleBad ? `<p class="td-title-error" role="alert">${I("circle-alert", "s")}${t("标题不能是空的", "The title cannot be empty")}</p>` : ""}</div>
    <div class="td-line">${stateBtn()}${S.d.important ? K.renderStatusMark({ label: t("重要", "Important"), tone: "idle", icon: "flag", className: "td-flag" }) : ""}${facts().join("")}</div>
    <div class="td-acts">${acts()}${moreBtn("td-more-head")}</div>
  </header>`;

  /* —— 「现在」块：在等谁；助理在办什么 —— */
  const waitBlock = () => { const w = S.d.waiting; return `<section class="td-now" data-kind="hold"${S.arrive === "wait" ? "" : ' style="animation:none"'}>
    <div class="td-now-h">${K.renderStatusMark({ label: t("在等", "Waiting on"), tone: "hold", state: "waiting" })}<span class="td-fact quiet">${t("记下在等谁、等什么，到跟进日会排进「今天」", "Note who and what you are waiting for; it shows under Today on the follow-up day")}</span></div>
    <div class="td-wait">
      <input class="mw-input" id="who" data-f="who" value="${esc(w.who)}" maxlength="80" aria-label="${t("在等谁", "Waiting on")}" placeholder="${t("在等谁，例如：小李", "Who, e.g. Li")}">
      <input class="mw-input" data-f="what" value="${esc(w.what)}" maxlength="200" aria-label="${t("等什么", "Waiting for")}" placeholder="${t("等什么，例如：确认预算", "What, e.g. budget sign-off")}">
      ${btn({ variant: "ghost", icon: "calendar", label: w.follow ? t(`${day(w.follow)}跟进`, `Follow up ${day(w.follow).toLowerCase()}`) : t("哪天跟进", "Follow up on"), attrs: { "data-act": "pop", "data-pop": "follow", "aria-expanded": String(S.pop === "follow") } })}
    </div></section>`; };
  const workBlock = () => {
    const w = S.work, review = w.state === "review", done = w.state === "done";
    const mark = review ? K.renderStatusMark({ label: t("等你确认", "Needs your OK"), tone: "attention", state: "approval" }) : done ? K.renderStatusMark({ label: t("已完成", "Completed"), tone: "done", state: "done" }) : K.renderStatusMark({ label: t("进行中", "Active"), tone: "progress", state: "running" });
    const step = review ? t("提纲写好了，3 点", "Outline ready, 3 points") : done ? t("你确认过了", "You confirmed it") : t("第 2 步 · 对照上次的报价", "Step 2 · comparing with the last quote");
    const go = review ? btn({ variant: "primary", size: "sm", label: t("去确认", "Review"), attrs: { "data-act": "confirm" } }) : done ? "" : btn({ variant: "ghost", size: "sm", label: t("继续推进", "Continue"), attrs: { "data-act": "continue" } });
    const out = w.state === "running" ? "" : `<div class="td-out"><span class="td-tag" data-k="draft">${t("草稿", "Draft")}</span><button type="button" class="td-cut" data-act="stub">${t("回电提纲：先说底线，再给账期方案", "Call outline: the floor first, then payment terms")}</button><span class="td-grow"></span><small>${t("助理 · 刚刚", "Assistant · just now")}</small></div>`;
    return `<section class="td-now" data-kind="${review ? "you" : "ai"}"${S.arrive === "work" ? "" : ' style="animation:none"'}>
      <div class="td-work">${I("sparkles", "s")}${mark}<span class="td-cut">${t("起草回电提纲", "Draft the call outline")}</span><small>${step}</small><span class="td-grow"></span>${go}</div>${out}</section>`;
  };

  /* —— 来源、关联、修改记录 —— */
  const KIND = () => ({ inbox: "Inbox", assistant: t("助理", "Assistant"), material: t("材料", "Material") });
  const sources = () => {
    const xs = S.d.sources, real = xs.filter((s) => s.kind !== "manual");
    if (!real.length) return `<section class="td-sec"><h2 class="td-sec-h">${t("来源", "Source")}</h2><p class="td-manual">${I("edit", "s")}${t(`你在${xs[0].when} 手动记下`, `You wrote it down, ${xs[0].when.toLowerCase()}`)}</p></section>`;
    return `<section class="td-sec"><h2 class="td-sec-h">${t("来源", "Source")}<em>${real.length}</em></h2>${real.map((s) => `<article class="td-src">
      <div class="td-src-h"><span class="td-tag" data-k="${s.kind}">${KIND()[s.kind]}</span>${K.renderButton({ variant: "link", label: s.title, attrs: { "data-act": "stub", title: t("打开原条目", "Open the original") } })}<span class="td-grow"></span><time>${s.when}</time></div>
      <p>${esc(s.reason)}</p><blockquote>${esc(s.excerpt)}</blockquote></article>`).join("")}</section>`;
  };
  const links = () => {
    const pool = POOL(), xs = S.d.links.map((l) => ({ ...l, ...pool.find((p) => p.id === l.id) }));
    const add = btn({ variant: "ghost", size: "sm", icon: "plus", label: t("关联一件待办", "Link a todo"), attrs: { "data-act": "pop", "data-pop": "link", "aria-expanded": String(S.pop === "link") } });
    const rows = xs.map((l) => { const s = ST()[l.status]; return `<div class="td-row"><span class="td-tag" data-k="${l.rel}">${REL()[l.rel]}</span>${K.renderButton({ variant: "link", label: l.title, attrs: { "data-act": "stub" } })}<span class="td-grow"></span><small>${K.renderStateRing({ state: s.ring })}${s.name}</small>${K.renderButton({ variant: "ghost", size: "icon", icon: "x", iconOnly: true, label: t("去掉这项关联", "Remove this link"), className: "td-x", attrs: { "data-act": "unlink", "data-id": l.id } })}</div>`; }).join("");
    return `<section class="td-sec"><h2 class="td-sec-h">${t("关联", "Links")}${xs.length ? `<em>${xs.length}</em>` : ""}<span class="td-grow"></span>${add}</h2>${xs.length ? `<div class="td-rows">${rows}</div>` : `<p class="td-none">${t("还没有关联。要等别的事先做完，或者和别的事有关，可以连起来。", "No links yet. Connect it to a todo it waits for or relates to.")}</p>`}</section>`;
  };
  const history = () => { const xs = S.d.history; return `<details class="td-hist" id="hist"${S.hist ? " open" : ""}><summary>${I("chevron-right", "xs")}${t("修改记录", "History")}<span>${xs.length}${t(" 条", "")} · ${t("最近：", "Latest: ")}${esc(xs[0].text)} · ${xs[0].when}</span></summary>
    <ol>${xs.map((h) => `<li class="${h.undone ? "undone" : ""}"><time>${h.when}</time><span>${esc(h.text)}${h.undone ? t("（已撤销）", " (undone)") : ""}</span>${h.undo && !h.undone ? K.renderButton({ variant: "link", label: h.create ? t("撤销创建", "Undo create") : t("撤销", "Undo"), attrs: { "data-act": "revert" } }) : "<i></i>"}</li>`).join("")}</ol></details>`; };

  /* —— 属性栏 —— */
  const prop = (name, icon, label, value, cls = "") => `<button type="button" class="td-prop" data-act="pop" data-pop="${name}" aria-haspopup="dialog" aria-expanded="${S.pop === name}">${I(icon)}<span class="td-prop-n">${label}</span><span class="td-prop-v ${value ? cls : "unset"}">${value || t("未定", "Not set")}</span>${I("chevron-down", "xs")}</button>`;
  const rail = () => { const d = S.d, late = d.due && diff(d.due) < 0 && !closed(); return `<aside class="td-rail" aria-label="${t("时间与归属", "Dates and place")}">
    <div class="td-rail-g"><div class="td-rail-l">${t("时间", "Dates")}</div>
      ${prop("due", "calendar", t("截止", "Due"), d.due ? full(d.due, d.dueTime) : "", late ? "late" : "")}
      ${prop("planned", "target", t("计划做", "Planned"), d.planned ? full(d.planned) : "")}
      ${prop("remind", "bell", t("提醒", "Reminder"), d.remind ? full(d.remind.d, d.remind.t) : "")}</div>
    <div class="td-rail-g"><div class="td-rail-l">${t("归属", "Place")}</div>
      ${prop("place", PLACE()[d.place].icon, t("放在", "Put in"), PLACE()[d.place].name)}
      <p class="td-seen">${I("lock", "s")}${t("只有你和获授权的助理能看到", "Only you and assistants you allow can see it")}</p>
      <label class="td-prop sw">${I("flag")}<span class="td-prop-n">${t("重要", "Important")}</span><span class="td-grow"></span><span class="mw-switch"><input type="checkbox" role="switch" data-act="important"${d.important ? " checked" : ""} aria-label="${t("重要", "Important")}"><span class="mw-switch__track"></span></span></label></div>
  </aside>`; };

  /* —— 浮层 —— */
  const item = (o) => `<button type="button" class="mw-menu__item mw-menu__item--described" role="menuitemradio" aria-checked="${o.on}" data-act="${o.act}" data-v="${o.v}">${o.lead}<span data-slot="menu-item-label"><span>${o.label}</span></span>${o.on ? I("check", "s tick") : ""}<span class="mw-menu__desc">${o.desc}</span></button>`;
  const statusMenu = () => { const s = ST(), one = (v) => item({ act: "status", v, on: S.d.status === v, lead: `<span class="td-menu-ring">${K.renderStateRing({ state: s[v].ring })}</span>`, label: s[v].name, desc: s[v].desc });
    return `<div class="td-pop mw-menu" id="pop" role="menu" aria-label="${t("状态", "Status")}"><div class="mw-menu__group">${["open", "doing", "waiting"].map(one).join("")}</div><div class="mw-menu__group">${["done", "cancelled"].map(one).join("")}</div></div>`; };
  const placeMenu = () => { const p = PLACE(); return `<div class="td-pop mw-menu" id="pop" role="menu" aria-label="${t("放在", "Put in")}">${["personal", "project", "unassigned"].map((v) => item({ act: "place", v, on: S.d.place === v, lead: I(p[v].icon), label: p[v].name, desc: p[v].desc })).join("")}</div>`; };
  const moreMenu = () => `<div class="td-pop mw-menu" id="pop" role="menu" aria-label="${t("更多操作", "More")}"><div class="mw-menu__group">
    ${K.renderMenuItem({ label: t("归档", "Archive"), iconName: "archive", disabled: !closed(), description: closed() ? t("收进「已完成」里，随时能取回", "Moves it out of the way; you can restore it") : t("完成或取消后才能归档", "Complete or cancel it first"), attrs: { "data-act": "archive" } })}
    ${K.renderMenuItem({ label: t("重新读取", "Reload"), iconName: "refresh", description: t("读最新的内容，没保存的输入会丢掉", "Reads the latest; unsaved input is dropped"), attrs: { "data-act": "reload" } })}</div>
    <div class="mw-menu__group">${K.renderMenuItem({ label: t("删除", "Delete"), iconName: "trash", danger: true, attrs: { "data-act": "askdelete" } })}</div></div>`;
  const calendar = (selected) => {
    const { y, m } = S.cal, start = new Date(y, m, 1), off = (start.getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), rows = Math.ceil((off + days) / 7);
    start.setDate(1 - off);
    let body = "";
    for (let r = 0; r < rows; r++) { body += "<tr>"; for (let c = 0; c < 7; c++) { const d = new Date(start); d.setDate(start.getDate() + r * 7 + c); const k = key(d); body += `<td class="${d.getMonth() !== m ? "mw-calendar__outside" : ""}${selected === k ? " is-selected" : ""}"${k === TODAY ? ' aria-current="date"' : ""}><button type="button" class="mw-calendar__day" data-act="day" data-v="${k}">${d.getDate()}</button></td>`; } body += "</tr>"; }
    const nav = (step, icon, label) => K.renderButton({ variant: "ghost", size: "icon", icon, iconOnly: true, label, attrs: { "data-act": "cal", "data-v": step } });
    return `<section class="mw-calendar" data-slot="calendar"><header class="mw-calendar__header"><span>${t(`${y}年${m + 1}月`, `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m]} ${y}`)}</span><div class="mw-group">${nav(-1, "chevron-left", t("上个月", "Previous month"))}${nav(1, "chevron-right", t("下个月", "Next month"))}</div></header>
      <table class="mw-calendar__grid"><thead><tr>${t(["一", "二", "三", "四", "五", "六", "日"], ["M", "T", "W", "T", "F", "S", "S"]).map((w) => `<th>${w}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></section>`;
  };
  const datePop = (name) => {
    const d = S.d, cur = name === "due" ? d.due : name === "planned" ? d.planned : name === "remind" ? (d.remind ? d.remind.d : "") : d.waiting.follow;
    const time = name === "due" ? d.dueTime : name === "remind" ? (d.remind ? d.remind.t : "") : null;
    const qk = (label, k, tm) => `<button type="button" class="mw-menu__item" data-act="quick" data-v="${k}"${tm ? ` data-t="${tm}"` : ""}><span data-slot="menu-item-label">${label}</span><small>${tm ? "" : Math.abs(diff(k)) < 2 ? wd(k) : md(k)}</small></button>`;
    const quick = name === "remind"
      ? qk(t("今晚 20:00", "Tonight 20:00"), TODAY, "20:00") + qk(t("明早 9:00", "Tomorrow 9:00"), plus(1), "09:00") + (d.due ? qk(t("截止当天 9:00", "On the due day, 9:00"), d.due, "09:00") : "")
      : (name === "follow" ? "" : qk(t("今天", "Today"), TODAY)) + qk(t("明天", "Tomorrow"), plus(1)) + qk(t("本周五", "This Friday"), friday()) + qk(t("下周一", "Next Monday"), monday());
    const clock = time === null ? "" : `<hr><div class="td-time"><label for="time">${t("时间", "Time")}</label><div class="td-time-row"><input class="mw-input" id="time" value="${time || ""}" placeholder="--:--" inputmode="numeric" maxlength="5" aria-label="${t("时间", "Time")}">${["09:00", "12:00", "18:00"].map((v) => `<button type="button" class="mw-toggle${time === v ? " is-current" : ""}" data-act="time" data-v="${v}" aria-pressed="${time === v}">${v}</button>`).join("")}</div>${name === "due" ? `<small>${t("可不填，不填就是全天", "Optional; empty means all day")}</small>` : ""}</div>`;
    const hint = name === "remind" ? `<hr><p class="td-pop-hint">${t("到时间会在底栏提醒你。Molis Work 关着时不会按时提醒，打开后会补上。", "You are reminded in the bottom bar. Nothing arrives while Molis Work is closed; missed ones show when you open it.")}</p>` : "";
    return `<div class="td-pop mw-popover td-date" id="pop" role="dialog" aria-label="${{ due: t("截止", "Due"), planned: t("计划做", "Planned"), remind: t("提醒", "Reminder"), follow: t("哪天跟进", "Follow up on") }[name]}">${quick}<hr>${calendar(cur)}${clock}${hint}
      <div class="td-pop-foot">${cur ? btn({ variant: "ghost", size: "sm", label: t("清除", "Clear"), attrs: { "data-act": "clear" } }) : "<i></i>"}${btn({ variant: "secondary", size: "sm", label: t("好", "Done"), attrs: { "data-act": "closepop" } })}</div></div>`;
  };
  const linkPop = () => { const r = REL(), linked = new Set(S.d.links.map((l) => l.id)), xs = POOL().filter((p) => !linked.has(p.id));
    return `<div class="td-pop mw-popover td-link" id="pop" role="dialog" aria-label="${t("关联一件待办", "Link a todo")}">
      <div class="mw-toggle-group" data-slot="toggle-group" role="radiogroup" aria-label="${t("关系", "Relation")}">${Object.keys(r).map((v) => `<button type="button" class="mw-toggle${S.rel === v ? " is-current" : ""}" role="radio" aria-checked="${S.rel === v}" data-act="rel" data-v="${v}">${r[v]}</button>`).join("")}</div>
      <label class="mw-input-group">${I("search")}<input class="mw-input" type="search" id="lq" placeholder="${t("搜索待办", "Search todos")}" aria-label="${t("搜索待办", "Search todos")}"></label>
      <div class="td-link-list" role="listbox">${xs.map((p) => `<button type="button" class="mw-menu__item" role="option" data-act="link" data-v="${p.id}"><span class="td-menu-ring">${K.renderStateRing({ state: ST()[p.status].ring })}</span><span data-slot="menu-item-label">${esc(p.title)}</span><small>${ST()[p.status].name}</small></button>`).join("")}</div></div>`; };
  const pop = () => { const p = S.pop; if (!p) return ""; return `<div class="td-pop-scrim" data-act="closepop"></div>` + (p === "status" ? statusMenu() : p === "place" ? placeMenu() : p === "more" ? moreMenu() : p === "link" ? linkPop() : datePop(p)); };
  const dialog = () => (S.dialog ? `<div class="td-scrim"><div class="td-dialog" role="alertdialog" aria-modal="true" aria-labelledby="dh"><h2 id="dh">${t("永久删除这件待办？", "Delete this todo for good?")}</h2><p>${t(`「${esc(S.d.title)}」删除后不能撤销，修改记录也会一起删掉。`, `“${esc(S.d.title)}” cannot be brought back, and its history goes with it.`)}</p><div class="td-dialog-acts">${btn({ variant: "ghost", label: t("取消", "Cancel"), attrs: { "data-act": "canceldelete" } })}${btn({ variant: "danger", label: t("删除", "Delete"), attrs: { "data-act": "delete" } })}</div></div></div>` : "");
  const toast = () => (S.toast ? `<div class="td-toast">${K.renderToast({ message: S.toast.msg, tone: S.toast.tone || "success", ...(S.toast.undo ? { action: { label: t("撤销", "Undo"), attrs: { "data-act": "undotoast" } } } : {}) })}</div>` : "");
  const saveChip = () => ({ saved: `${I("check", "xs")}${t("已保存", "Saved")}`, saving: t("保存中…", "Saving…"), unsaved: t("尚未保存", "Not saved yet") }[S.save]);

  const page = () => `<div class="td-page" id="page">
    <div class="td-bar">${btn({ variant: "ghost", size: "sm", icon: "chevron-left", label: t("待办", "Todos"), attrs: { "data-act": "back", title: t("返回待办列表", "Back to todos") } })}<span class="td-grow"></span>
      <span class="td-save" id="save" data-s="${S.save}" role="status">${saveChip()}</span>
      ${moreBtn("td-more-bar")}</div>
    <div class="td-scroll"><div class="td-wrap">
      ${S.alert ? `<div class="td-alert">${K.renderAlert({ title: t("这件待办刚在别处改过", "This todo was just changed elsewhere"), body: t("你刚输入的还在这里，没有保存。把要留的内容复制出来，再重新读取。", "What you typed is still here and has not been saved. Copy what you need, then reload."), tone: "warning", role: "alert", actions: [{ variant: "secondary", size: "sm", label: t("重新读取", "Reload"), attrs: { "data-act": "reload" } }] })}</div>` : ""}
      ${head()}
      <div class="td-main">
        ${S.d.status === "waiting" ? waitBlock() : ""}${S.work ? workBlock() : ""}
        <div class="td-notesbox" id="notes" role="textbox" aria-multiline="true" aria-label="${t("说明", "Description")}" contenteditable="plaintext-only" data-placeholder="${t("补充细节、背景、下一步", "Details, background, next step")}">${esc(S.d.notes)}</div>
        ${sources()}${links()}${history()}
      </div>
      ${rail()}
    </div></div>${pop()}${dialog()}${toast()}</div>`;

  /* —— 画、放浮层 —— */
  const win = $("#win");
  let scale = 1;
  const fit = () => {
    if (bare && !q.get("w")) W = window.innerWidth;
    win.style.setProperty("--w", `${W}px`);
    win.toggleAttribute("data-narrow", W <= 600);
    win.toggleAttribute("data-mid", W > 600 && W <= 1100);
    scale = bare ? 1 : Math.min(1, (window.innerWidth - 40) / W);
    $("#fit").style.setProperty("--z", String(scale));
  };
  const placePop = () => {
    const el = $("#pop"), pg = $("#page"); if (!el) return;
    const a = [...pg.querySelectorAll(`[data-pop="${S.pop}"]`)].find((x) => x.offsetParent); if (!a) return;
    const pr = pg.getBoundingClientRect(), ar = a.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight, w = pg.clientWidth, h = pg.clientHeight;
    const l = (ar.left - pr.left) / scale, r = (ar.right - pr.left) / scale, right = (l + r) / 2 > w / 2;
    const left = Math.max(8, Math.min(w - pw - 8, right ? r - pw : l));
    let topPx = (ar.bottom - pr.top) / scale + 6;
    if (topPx + ph > h - 8) { const up = (ar.top - pr.top) / scale - ph - 6; if (up >= 8) { topPx = up; el.dataset.up = ""; } else topPx = Math.max(8, h - ph - 8); }
    el.style.left = `${left}px`; el.style.top = `${topPx}px`; el.style.setProperty("--ox", right ? "100%" : "0%");
  };
  const render = () => { win.innerHTML = top() + `<div class="td-sheet">${page()}</div>` + foot(); placePop(); S.arrive = ""; };
  const say = (a, b) => { const s = $("#step"); if (s) { s.textContent = a; $("#say").textContent = b; } };
  let saveTimer = 0;
  const saved = () => { clearTimeout(saveTimer); if (still) { S.save = "saved"; return; } S.save = "saving"; saveTimer = setTimeout(() => { S.save = "saved"; const el = $("#save"); if (el) { el.dataset.s = "saved"; el.innerHTML = saveChip(); } }, 600); };
  const typing = () => { S.save = "unsaved"; const el = $("#save"); el.dataset.s = "unsaved"; el.innerHTML = saveChip(); clearTimeout(saveTimer); saveTimer = setTimeout(() => { S.save = "saving"; el.innerHTML = saveChip(); saveTimer = setTimeout(() => { S.save = "saved"; el.dataset.s = "saved"; el.innerHTML = saveChip(); }, 500); }, 600); };
  let toastTimer = 0;
  const note = (msg, undo, tone) => { S.toast = { msg, undo, tone }; clearTimeout(toastTimer); if (!still) toastTimer = setTimeout(() => { S.toast = null; const el = $(".td-toast"); if (el) el.remove(); }, 5000); };
  const openCal = (k) => { const d = k ? at(k) : NOW; S.cal = { y: d.getFullYear(), m: d.getMonth() }; };

  /* —— 动作 —— */
  let before = null;
  const setStatus = (v) => {
    const d = S.d, s = ST();
    before = { status: d.status, doneAt: d.doneAt };
    d.status = v; S.pop = null; S.arrive = v === "waiting" ? "wait" : "state";
    if (v === "done") { d.doneAt = t("今天 10:20", "Today 10:20"); note(t(`已完成「${d.title}」`, `Completed “${d.title}”`), true); }
    else if (before.status === "done" || before.status === "cancelled") note(t(`已重新打开「${d.title}」`, `Reopened “${d.title}”`), true);
    else note(t(`已改为${s[v].name}`, `Set to ${s[v].name}`), true);
    log(`你改为${s[v].name}`, `You set it to ${s[v].name}`); saved(); render();
    if (v === "waiting") { const who = $("#who"); if (who) who.focus(); }
  };
  const setDate = (name, k, tm) => {
    const d = S.d;
    if (name === "due") { d.due = k; if (tm !== undefined) d.dueTime = tm; if (!k) d.dueTime = ""; log("你改了截止日期", "You changed the due date"); }
    else if (name === "planned") { d.planned = k; log("你改了计划日期", "You changed the planned date"); }
    else if (name === "remind") { d.remind = k ? { d: k, t: tm || (d.remind && d.remind.t) || "09:00" } : null; log("你改了提醒", "You changed the reminder"); }
    else { d.waiting.follow = k; log("你改了跟进日", "You changed the follow-up day"); }
    if (k) openCal(k);
    saved();
  };
  const ACT = {
    back: () => { say(t("返回", "Back"), "回到待办列表（列表不在这次原型里）。没保存的输入会先保存，保存不了就留在这页。"); },
    stub: () => { say("打开", "在产品里这会打开那条原条目、那件待办或那份草稿；原型里不跳。"); },
    pop: (el) => { const p = el.dataset.pop; S.pop = S.pop === p ? null : p; if (S.pop && ["due", "planned", "remind", "follow"].includes(p)) { const d = S.d; openCal(p === "due" ? d.due : p === "planned" ? d.planned : p === "remind" ? (d.remind && d.remind.d) : d.waiting.follow); } render(); const lq = $("#lq"); if (lq) lq.focus(); },
    closepop: () => { S.pop = null; render(); },
    status: (el) => setStatus(el.dataset.v),
    place: (el) => { S.d.place = el.dataset.v; S.pop = null; log("你改了归属", "You changed where it lives"); saved(); note(t(`已移到${PLACE()[S.d.place].name}`, `Moved to ${PLACE()[S.d.place].name}`), true); render(); },
    important: (el) => { S.d.important = el.checked; log("你改了重要", "You changed Important"); saved(); setTimeout(render, still ? 0 : 180); },
    quick: (el) => { const name = S.pop; setDate(name, el.dataset.v, el.dataset.t); if (name === "planned" || name === "follow" || el.dataset.t) S.pop = null; render(); },
    day: (el) => { const name = S.pop; setDate(name, el.dataset.v); if (name === "planned" || name === "follow") S.pop = null; render(); },
    cal: (el) => { const d = new Date(S.cal.y, S.cal.m + Number(el.dataset.v), 1); S.cal = { y: d.getFullYear(), m: d.getMonth() }; render(); },
    time: (el) => { const d = S.d; if (S.pop === "due") { if (!d.due) d.due = TODAY; d.dueTime = d.dueTime === el.dataset.v ? "" : el.dataset.v; } else { d.remind = { d: (d.remind && d.remind.d) || TODAY, t: el.dataset.v }; } saved(); render(); },
    clear: () => { setDate(S.pop, ""); S.pop = null; render(); },
    rel: (el) => { S.rel = el.dataset.v; render(); },
    link: (el) => { const p = POOL().find((x) => x.id === el.dataset.v); S.d.links.push({ id: p.id, rel: S.rel }); S.pop = null; log(`你关联了「${p.title}」`, `You linked “${p.title}”`); saved(); render(); },
    unlink: (el) => { S.d.links = S.d.links.filter((l) => l.id !== el.dataset.id); log("你去掉了一项关联", "You removed a link"); saved(); note(t("已去掉这项关联", "Link removed"), true); render(); },
    revert: () => { const h = S.d.history[0]; h.undone = true; h.undo = false; note(t("已撤销", "Undone")); render(); },
    undotoast: () => { if (before) { S.d.status = before.status; S.d.doneAt = before.doneAt; before = null; } S.toast = null; S.arrive = "state"; render(); },
    delegate: () => { S.chip = true; S.typed = t("帮我推进这件待办", "Help me move this todo forward"); S.work = { state: "running" }; S.arrive = "work"; render(); say("交给助理推进", "这件待办连同它的说明、日期、来源一起交给底部的助理；页面上多出一块「助理在办什么」，头部那个按钮让位给它。助理办到要你点头时，这一块变成琥珀色，「去确认」成为这一屏唯一的主按钮。"); },
    continue: () => { S.work = { state: "review" }; S.arrive = "work"; S.chip = false; S.typed = ""; render(); say("助理等你确认", "助理写好了草稿，等你点头。这时这一屏的主按钮是「去确认」，「完成」退成次要按钮。"); },
    confirm: () => { S.work = { state: "done" }; render(); say("确认了", "草稿留在这件待办上，随时能打开。主按钮回到「完成」。"); },
    archive: () => { S.pop = null; note(t("已归档", "Archived"), true); render(); },
    reload: () => { const lang = LANG; fresh(); LANG = lang; note(t("已读到最新的", "Reloaded"), false); render(); },
    askdelete: () => { S.pop = null; S.dialog = true; render(); },
    canceldelete: () => { S.dialog = false; render(); },
    delete: () => { S.dialog = false; note(t(`已删除「${S.d.title}」`, `Deleted “${S.d.title}”`)); render(); say("删除", "删除后回到待办列表（列表不在这次原型里）。"); },
  };
  win.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]");
    if (S.pop && !e.target.closest("#pop") && !(el && el.dataset.act === "pop")) { S.pop = null; if (!el || el.dataset.act === "closepop") { render(); return; } }
    if (!el || (el.matches("input[type=checkbox]"))) return;
    ACT[el.dataset.act](el);
  });
  win.addEventListener("change", (e) => {
    if (e.target.matches("[data-act=important]")) ACT.important(e.target);
    if (e.target.id === "time") { const v = e.target.value.trim(), ok = /^([01]?\d|2[0-3]):[0-5]\d$/.test(v); if (ok || !v) { const d = S.d, tm = v ? v.padStart(5, "0") : ""; if (S.pop === "due") d.dueTime = tm; else if (d.remind && tm) d.remind.t = tm; saved(); render(); } }
  });
  win.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "title") { S.d.title = el.textContent.replace(/\n/g, " "); typing(); }
    else if (el.id === "notes") { S.d.notes = el.innerText; typing(); }
    else if (el.dataset.f) { S.d.waiting[el.dataset.f] = el.value; typing(); }
    else if (el.id === "lq") { const v = el.value.trim().toLowerCase(); win.querySelectorAll(".td-link-list > button").forEach((b) => { b.hidden = Boolean(v) && !b.textContent.toLowerCase().includes(v); }); }
  });
  win.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (S.dialog) { S.dialog = false; render(); } else if (S.pop) { const p = S.pop; S.pop = null; render(); const a = $(`#page [data-pop="${p}"]`); if (a) a.focus(); } else if (e.target.blur) e.target.blur(); }
    if (e.key === "Enter" && e.target.id === "title") { e.preventDefault(); e.target.blur(); }
  });
  win.addEventListener("focusout", (e) => {
    if (e.target.id !== "title") return;
    const bad = !S.d.title.trim();
    if (bad !== S.titleBad) { S.titleBad = bad; render(); if (bad) $("#title").focus(); }
  });
  win.addEventListener("toggle", (e) => { if (e.target.id === "hist") S.hist = e.target.open; }, true);

  /* —— 各个状态（上面的按钮、?do=） —— */
  const caret = (el) => { el.focus(); const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
  const DO = {
    view: ["看一条待办", "第一眼三样：这件事是什么（大标题）、现在什么状态（标题下面的状态片和截止）、接下来能做什么（右上「完成」和「交给助理推进」）。日期和归属在右边一块浅底里；来源、关联、修改记录在正文下面。", () => {}],
    title: ["改标题", "标题就是一行能直接改的字：鼠标移上去有浅底，点进去有雾蓝框，停手就自动保存，右上角说「尚未保存 → 保存中 → 已保存」。", () => { S.save = "unsaved"; }, () => caret($("#title"))],
    "title-empty": ["标题不能空", "标题清空后离开，框变红、下面说原因，其他输入都留着，不会被保存成空的。", () => { S.d.title = ""; S.titleBad = true; S.save = "unsaved"; }],
    notes: ["改说明", "说明直接写在标题下面，像文档，不是一个灰色输入框。", () => { S.save = "unsaved"; }, () => caret($("#notes"))],
    status: ["换状态", "点状态片，菜单从它下面长出来：上面三种是「还在办」，下面两种是「结束了」。每种一句人话说明，当前的打勾。", () => { S.pop = "status"; }],
    waiting: ["等待他人", "改成「等待他人」后，标题下面多出一块：在等谁、等什么、哪天跟进，光标直接落在「在等谁」。别的状态没有这一块。", () => { S.d.status = "waiting"; S.d.waiting = { who: t("小李", "Li"), what: t("确认折扣的底线", "the discount floor"), follow: plus(1) }; S.d.history.unshift({ when: t("刚刚", "Just now"), text: t("你改为等待他人", "You set it to Waiting on others"), undo: true }); S.d.history[1].undo = false; }],
    due: ["定截止日期", "点「截止」那一行：先是四个最常用的日子，再是月历，最后是时间（可不填）。点一下就生效，不用另按保存。", () => { S.pop = "due"; openCal(S.d.due); }],
    planned: ["定计划日期", "「计划做」是你打算哪天动手，只选日子，点一下就关。", () => { S.pop = "planned"; openCal(S.d.planned); }],
    remind: ["定提醒", "提醒给三个常用时间；下面一句话说清提醒在哪出现、应用关着会怎样。", () => { S.pop = "remind"; openCal(S.d.remind.d); }],
    place: ["换放在哪", "三个去处各带一句说明；下面那行小字说谁能看到它。", () => { S.pop = "place"; }],
    important: ["标重要", "打开右边的开关，标题下面多一枚「重要」。", () => { S.d.important = true; }],
    delegate: ["交给助理推进", "这件待办连同它的说明、日期、来源一起交给底部的助理；页面上多出一块「助理在办什么」，头部那个按钮让位给它。", () => { S.chip = true; S.typed = t("帮我推进这件待办", "Help me move this todo forward"); S.work = { state: "running" }; }],
    review: ["助理等你确认", "助理办到要你点头时，这一块变成琥珀色（琥珀色只表示「该你了」），「去确认」成为这一屏唯一的主按钮，「完成」退成次要按钮。", () => { S.work = { state: "review" }; }],
    done: ["已完成", "完成后：状态片变绿，标题变淡，右上换成「重新打开」和「归档」，这一屏不再有主按钮。底部提示能撤销。", () => { S.d.status = "done"; S.d.doneAt = t("今天 10:20", "Today 10:20"); S.d.history.unshift({ when: t("刚刚", "Just now"), text: t("你改为已完成", "You set it to Completed"), undo: true }); S.d.history[1].undo = false; S.toast = { msg: t(`已完成「${S.d.title}」`, `Completed “${S.d.title}”`), undo: true }; }],
    overdue: ["已逾期", "过了截止日：标题下面一枚红色「已逾期 2 天」，右边那一行的日期也变红。", () => { S.d.due = plus(-2); S.d.planned = ""; S.d.remind = null; S.d.status = "open"; }],
    empty: ["什么都还没填", "只有一个标题的待办：日期都是「未定」，来源说是你手动记下的，关联给一句怎么用，都不留大片空白。", () => { const lang = LANG; fresh(emptyTodo()); LANG = lang; }],
    link: ["加关联", "点「关联一件待办」：先选关系，再搜或点一件，点了就连上。", () => { S.pop = "link"; }],
    history: ["修改记录", "平时收成一行，只说最近一次；点开是每一次改动，最近一次能撤销。", () => { S.hist = true; }],
    more: ["更多操作", "不常用的收在右上角：归档（没完成时灰着，并说为什么）、重新读取、删除。", () => { S.pop = "more"; }],
    conflict: ["别处改过", "保存时发现这件待办在别处改过：页面顶上说清发生了什么、你的输入还在、下一步点哪。", () => { S.alert = true; S.save = "unsaved"; S.d.notes += t("\n王总助理说周三下午也可以。", "\nHis assistant says Wednesday afternoon works too."); }],
    delete: ["删除前确认", "删除不能撤销，所以先问一句；危险的那一步是红色按钮。", () => { S.dialog = true; }],
  };
  const go = (name) => { const [a, b, set, after] = DO[name] || DO.view; fresh(); set(); render(); say(a, b); if (after) after(); document.querySelectorAll("#states [data-do]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.do === name))); cur = name; };
  let cur = q.get("do") || "view";

  /* —— 原型外框的控制 —— */
  const setTheme = (v) => { root.dataset.resolvedTheme = v; root.dataset.theme = v; document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === v))); };
  const states = $("#states");
  if (states) {
    states.innerHTML = Object.keys(DO).map((k) => `<button type="button" class="mw-toggle" data-do="${k}" aria-pressed="false">${DO[k][0]}</button>`).join("");
    states.addEventListener("click", (e) => { const b = e.target.closest("[data-do]"); if (b) go(b.dataset.do); });
    $("#width").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; W = Number(b.value); e.currentTarget.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fit(); go(cur); });
    $("#theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setTheme(b.value); });
    $("#lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; LANG = b.value; e.currentTarget.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); go(cur); });
    document.querySelectorAll("#width button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.value) === W)));
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === LANG)));
  }
  setTheme(q.get("theme") === "dark" ? "dark" : "light");
  window.addEventListener("resize", () => { fit(); placePop(); });
  fit();
  go(cur);
})();
