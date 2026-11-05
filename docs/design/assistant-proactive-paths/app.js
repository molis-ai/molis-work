// 03 · 助理三条路径定样 — scripted, clickable slices for #1730 (PWA-141～147): quiet preparation with only necessary
// interruptions, observing a new proactive rule before enabling it, and item-by-item review with partial rework.
// Nothing calls a model or a Home; every source, judgement, usage figure and check result is simulated.
(() => {
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const KEY = "molis-proto.assistant-proactive-paths.v1";
  const STEPS = { 1: 7, 2: 7, 3: 6 };
  const FAULTS = { 1: ["none", "revoked", "quiet"], 2: ["none", "budget", "expired", "revoked"], 3: ["none", "stale", "wrongobj", "selfclaim", "cond"] };
  const DECIDED = { 1: "A", 2: "A", 3: "B" }; // 用户 2026-11-03 选定
  const fresh = () => ({ path: 1, sch: { ...DECIDED }, lang: "zh", theme: "light", step: 0, fault: "none", open: false,
    budget: null, seen: false, marked: false, adopted: false, enabled: false, dec: {}, accepted: false, focus: null, mdoc: false });
  let S = load(), toastT;
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sch = () => S.sch[S.path];
  const F = (f) => S.fault === f;
  const sim = () => `<span class="mw-badge mw-badge--neutral tag-sim" data-slot="badge">${L("模拟", "Simulated")}</span>`;
  const own = (h, i) => `<span class="own" style="--hue:var(--h-${h})">${ic(i)}</span>`;

  // ---------- copy ----------
  const PATHS = () => ({ 1: L("安静准备，必要时才提醒", "Prepare quietly, interrupt only when needed"), 2: L("先观察试用，再决定启用", "Observe a trial before enabling"), 3: L("多项交付，部分退回再复核", "Several deliverables, partial return, re-check") });
  const SCHEMES = () => ({
    1: { A: L("A 任务条里看准备", "A Prep on the task strip"), B: L("B 准备记录贴在会议稿旁", "B Prep log beside the meeting doc"), C: L("C 只在简报里汇总", "C Only summarised in the brief") },
    2: { A: L("A 规则页里试用与回看", "A Trial and review on the rule page"), B: L("B 试用作为一项后台任务", "B Trial as a background task"), C: L("C 到点交一份回看报告", "C A review report when due") },
    3: { A: L("A 交付卡里逐项看", "A Item by item in the result card"), B: L("B 要求与成果对照", "B Requirements beside the work"), C: L("C 在成果上批注", "C Annotate the work") },
  });
  const CAPS = () => ({
    1: [L("开始：委托你准备周会", "Start: you asked for meeting prep"), L("① 普通更新：竞品文章", "① Routine update: competitor article"), L("② 普通更新：上周纪要改了", "② Routine update: last week's notes"), L("③ 同一条从别处又来", "③ The same item arrives again"), L("④ 缺一个要你给的数字", "④ A figure only you can give"), L("⑤ 9:30 约定简报", "⑤ The 9:30 brief you asked for"), L("⑥ 简报还没看", "⑥ Brief not opened yet")],
    2: [L("开始：新写了一条做法", "Start: a new rule draft"), L("① 开始观察试用", "① Start the trial"), L("② 试用第 2 天", "② Trial, day 2"), L("③ 回看样本", "③ Review samples"), L("④ 指出一条误判，改做法", "④ Flag a misjudgement, revise"), L("⑤ 正式启用", "⑤ Turn it on"), L("⑥ 启用之后", "⑥ After enabling")],
    3: [L("开始：交办一份三项要求的报告", "Start: a report with three requirements"), L("① 第 1 轮交回，逐项核", "① Round 1 back, checked per item"), L("② 你逐项审", "② You review per item"), L("③ 第 2 轮在补", "③ Round 2 in progress"), L("④ 第 2 轮交回，只重核受影响的", "④ Round 2 back, only affected items re-checked"), L("⑤ 你认可最后一项", "⑤ You accept the last item")],
  });
  const FAULT_NAMES = () => ({ none: L("正常", "Normal"), revoked: L("中途撤掉一个来源", "A source is revoked midway"), quiet: L("勿扰时段里出现缺口", "A gap during quiet hours"),
    budget: L("试用预算用完", "Trial budget runs out"), expired: L("试用到期没反馈", "Trial ends without feedback"),
    stale: L("证据过期", "Evidence goes stale"), wrongobj: L("核错了版本", "Wrong version checked"), selfclaim: L("只有执行者自述", "Only the worker's own claim"), cond: L("你改了完成条件", "You change the completion terms") });

  // ---------- path 1: quiet preparation ----------
  function p1Events() {
    const ev = [
      { at: 1, src: L("Feed · 竞品降价 15% 的文章", "Feed · article: competitor cuts price 15%"), prep: L("议程加一条「竞品降价」，附原文链接", "Add “Competitor price cut” to the agenda with the link"), note: L("不通知：不改变会上要定的事", "No notice: doesn't change what the meeting decides"), eff: L("准备稿 r2", "Prep draft r2"), kind: "quiet" },
      { at: 2, src: L("Pages · 上周纪要改了一行", "Pages · one line of last week's notes changed"), prep: L("跟进表里「投放复盘」改成已完成", "Mark “Ad review” done in the follow-ups"), note: L("不通知：普通更新", "No notice: routine update"), eff: L("准备稿 r3", "Prep draft r3"), kind: "quiet" },
      { at: 3, src: L("Inbox · 同一篇竞品文章（同事转来）", "Inbox · the same article, forwarded by a colleague"), prep: L("认出是同一条，不再改", "Recognised as the same item; nothing changed"), note: L("不通知：重复来源", "No notice: duplicate source"), eff: L("没有变化", "No change"), kind: "dup" },
      { at: 4, src: L("Dataset · 投放预算表缺 11 月", "Dataset · ad budget sheet has no November figure"), prep: L("其余照常准备；这一项空着并标出来", "Everything else is prepared; this item is left empty and marked"), note: F("quiet") && !S.budget ? L("先不问：勿扰到 8:00，8:00 再问；简报 9:30 照常", "Not yet: quiet hours until 8:00; asks at 8:00, brief at 9:30 as agreed") : L("请你补：会上要定「是否加投放」，没有这个数字定不了", "Asks you: the meeting decides on more ad spend and can't without it"), eff: S.budget ? L(`你给了 ${S.budget}，准备稿 r4`, `You gave ${S.budget}; prep draft r4`) : L("等你补", "Waiting for you"), kind: "ask" },
      { at: 5, src: L("约定：会前 30 分钟发简报", "Agreement: brief 30 minutes before"), prep: L("把 r4 整理成一页简报", "Turn r4 into a one-page brief"), note: L("按约定送达，不因前面没通知而省掉", "Delivered as agreed; not skipped because earlier updates were quiet"), eff: L("已送达 9:30", "Delivered 9:30"), kind: "brief" },
    ];
    if (F("revoked")) ev.splice(2, 0, { at: 2, src: L("你撤掉了 Feed 的读取", "You revoked reading from Feed"), prep: L("之后不再读 Feed；①那条保留，标明来源已撤权", "Feed isn't read from now on; item ① stays, marked as from a revoked source"), note: L("不通知：你刚做的操作", "No notice: you just did this"), eff: L("准备照常，少一个来源", "Prep continues with one fewer source"), kind: "rev" });
    return ev.filter((e) => e.at <= S.step);
  }
  const p1Asking = () => S.step >= 4 && !S.budget && !(F("quiet") && S.step === 4);
  function judgeRows(list) {
    return list.map((e) => `<div class="jrow ${e.kind}"><div class="jsrc">${ic(e.kind === "ask" ? "question" : e.kind === "brief" ? "clock" : e.kind === "dup" ? "refresh" : e.kind === "rev" ? "lock" : "check", "sm")}<span>${esc(e.src)}</span></div>
      <dl class="kv j"><dt>${L("准备", "Prepare")}</dt><dd>${esc(e.prep)}</dd><dt>${L("通知", "Notify")}</dt><dd>${esc(e.note)}</dd><dt>${L("实际", "Result")}</dt><dd>${esc(e.eff)}</dd></dl></div>`).join("");
  }
  function p1Doc() {
    const r = S.step >= 4 && S.budget ? 4 : S.step >= 2 ? 3 : S.step >= 1 ? 2 : 1;
    const mark = (from, txt) => (S.step >= from ? `<span class="chg">${txt}</span>` : "");
    const rows = [
      `<li>${L("上周跟进：投放复盘", "Follow-up: ad review")} ${S.step >= 2 ? `<span class="mw-status stag partial">${L("已完成", "Done")}</span>${mark(2, "r3")}` : `<span class="mw-status stag">${L("进行中", "Open")}</span>`}</li>`,
      S.step >= 1 ? `<li>${L("竞品降价 15%", "Competitor price cut 15%")}${F("revoked") && S.step >= 2 ? ` <span class="fact">${L("来源已撤权", "source revoked")}</span>` : ""}${mark(1, "r2")}</li>` : "",
      `<li>${L("是否加投放", "More ad spend?")} ${S.step >= 4 ? (S.budget ? `<span class="fact">${L("11 月预算", "Nov budget")} ${esc(S.budget)}</span>${mark(4, "r4")}` : `<span class="mw-status stag accept">${L("缺 11 月预算", "Needs Nov budget")}</span>`) : ""}</li>`,
    ].join("");
    const log = sch() === "B" ? `<aside class="plog"><div class="lh">${ic("history", "sm")}${L("准备记录", "Prep log")} · ${L("不打扰", "quiet")}</div>${judgeRows(p1Events()) || `<p class="fact">${L("还没有更新", "No updates yet")}</p>`}</aside>` : "";
    return `<div class="docwrap${log ? " withlog" : ""}"><article class="doc"><div class="fact">${L("周会 · 11月5日 10:00", "Weekly meeting · Nov 5, 10:00")} · ${L("准备稿", "Prep draft")} r${r}</div><h1>${L("周会准备", "Meeting prep")}</h1><h3>${L("议程", "Agenda")}</h3><ul class="agenda">${rows}</ul></article>${log}</div>`;
  }
  function p1Chat() {
    const out = [];
    out.push(me(L("以后每次周会前帮我把材料准备好，会前半小时给我一页简报。", "Before each weekly meeting, prepare the materials and give me a one-page brief 30 minutes before.")));
    out.push(ai(`<div>${L("好。平时有更新我直接改准备稿，不逐条打扰你；要你定的才来问。", "OK. Routine updates go straight into the prep draft without pinging you; I'll only ask what needs you.")}</div>`));
    if (S.step >= 4 && (!(F("quiet")) || S.step >= 5 || S.budget)) out.push(ai(askCard()));
    else if (S.step >= 4 && F("quiet")) out.push(`<div class="mini" style="justify-content:center">${ic("clock", "sm")}${L("勿扰到 8:00；有一个要你补的数字，8:00 再问", "Quiet until 8:00; one figure to ask at 8:00")}</div>`);
    if (S.step >= 5) out.push(ai(briefCard()));
    return out.join("");
  }
  function askCard() {
    if (S.budget) return `<div class="mini">${ic("check", "sm")}${L(`11 月预算：${S.budget}，已写进准备稿`, `November budget: ${S.budget}, added to the prep draft`)}</div>`;
    return `<div class="decide"><div class="q">${ic("question", "sm")} ${L("11 月投放预算是多少？", "What's the November ad budget?")}</div><div class="fact">${L("会上要定「是否加投放」，预算表里没有 11 月；别的都准备好了。", "The meeting decides on more ad spend and the sheet has no November figure; everything else is ready.")}</div><div class="opts"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="budget" data-v="8 万">8 万</button><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="budget" data-v="12 万">12 万</button><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="budget" data-v="${L("会上再说", "Decide at the meeting")}">${L("会上再说", "Decide at the meeting")}</button></div></div>`;
  }
  function briefCard() {
    const n = p1Events().filter((e) => e.kind === "quiet").length;
    const unseen = S.step >= 6 && !S.seen;
    return `<div class="card2" style="--hue:var(--h-goals);max-width:none"><div class="strip2">${own("goals", "clock")}<span>${L("周会简报", "Meeting brief")}</span><span class="fact">· 9:30</span><span style="flex:1"></span><span class="mw-status stag ${unseen ? "" : "partial"}">${unseen ? L("未查看", "Not opened") : L("已送达", "Delivered")}</span></div>
      <div class="inner"><div>${L("三项议程；竞品降价已附原文；投放复盘已完成；", "Three agenda items; competitor article linked; ad review done; ")}${S.budget ? L(`11 月预算 ${S.budget}。`, `Nov budget ${S.budget}.`) : L("11 月预算还空着。", "Nov budget still empty.")}</div>
      ${sch() === "C" ? `<div class="fact">${ic("history", "sm")} ${L(`准备期间更新了 ${n} 处，都没打扰你`, `Updated ${n} times while preparing, without pinging you`)} · <button class="link" data-act="open-log">${L("看准备记录", "See the prep log")}</button></div>` : ""}
      ${unseen ? `<div class="fact">${ic("info", "sm")} ${L("没看不算拒绝；简报和准备稿都留在原处。", "Not opening it isn't a refusal; the brief and draft stay where they are.")}</div>` : ""}
      <div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="seen">${L("打开简报", "Open the brief")}</button></div></div></div>`;
  }
  function p1Task() {
    if (sch() !== "A" || S.step < 1) return null;
    const ev = p1Events(), q = ev.filter((e) => e.kind === "quiet").length;
    return { title: L("周会准备", "Meeting prep"), state: p1Asking() ? "wait" : "running", line: p1Asking() ? L("要你补 11 月预算", "Needs the November budget") : L(`安静准备 · 已更新 ${q} 处`, `Preparing quietly · ${q} updates`), body: judgeRows(ev) };
  }

  // ---------- path 2: observe a new rule ----------
  const p2Stopped = () => (F("budget") && S.step >= 2) || (F("expired") && S.step >= 4 && !S.marked);
  const p2Samples = () => [
    { k: "do", src: L("邮件 · 客户 A：「下周三前能给一版报价吗？」", "Email · Client A: “Can we get a quote by next Wednesday?”"), why: L("提出具体要求和期限", "A concrete request with a deadline"), would: L("准备报价草稿，周一请你过目", "Draft a quote; ask you to review on Monday") },
    { k: "do", src: L("邮件 · 客户 A：「谢谢，收到」", "Email · Client A: “Thanks, received”"), why: L("把回复当成了要跟进", "Treated a reply as needing follow-up"), would: L("准备后续材料", "Prepare follow-up material"), wrong: true },
    { k: "skip", src: L("Inbox · 客户 B 的周报", "Inbox · Client B's weekly report"), why: L("不在「客户 A」范围", "Outside the “Client A” scope"), would: L("不处理", "Nothing") },
    { k: "unsure", src: L("邮件 · 客户 A，附件「需求v3.pdf」", "Email · Client A with attachment “requirements v3.pdf”"), why: L("附件没读到，正文只有「见附件」", "Attachment not read; body only says “see attached”"), would: L("无法判断", "Can't tell") },
  ];
  function p2Rule() {
    const r = S.adopted ? 2 : 1;
    const state = S.enabled ? L("已启用", "On") : p2Stopped() ? (F("budget") ? L("试用已停 · 预算用完", "Trial stopped · budget used") : L("试用结束 · 没有启用", "Trial ended · not enabled")) : S.step >= 1 ? L("观察试用中 · 不会动手", "Observing · won't act") : L("草稿 · 没启用", "Draft · off");
    const cfg = `<dl class="kv"><dt>${L("来源", "Sources")}</dt><dd>${L("Inbox、邮件", "Inbox, email")}${F("revoked") && S.step >= 2 ? ` · <s>${L("邮件", "email")}</s> ${L("已撤权，停止读取", "revoked, no longer read")}` : ""}</dd><dt>${L("范围", "Scope")}</dt><dd>${L("项目「客户 A」", "Project “Client A”")}</dd><dt>${L("时段", "Period")}</dt><dd>${L("3 天（到 11月7日）", "3 days (to Nov 7)")}</dd><dt>${L("预算", "Budget")}</dt><dd>20k tokens · ${L("已用", "used")} ${F("budget") && S.step >= 2 ? "20k" : S.step >= 2 ? "6.2k" : "0"}</dd></dl>`;
    const counts = S.step >= 2 ? `<div class="cnts"><span><b>3</b> ${L("会准备", "would prepare")}</span><span><b>9</b> ${L("不处理", "would skip")}</span><span><b>2</b> ${L("无法判断", "can't tell")}</span><span class="fact">${L("看过 14 条", "14 items seen")}</span></div>` : "";
    const trial = S.step >= 1 ? `<section class="sect"><h3>${L("观察试用", "Trial")}</h3>${cfg}<p class="fact">${L("试用只记下「当时会怎么判断」，不接单、不改内容、不逐条通知；你直接交办的事照常做。", "The trial only records what it would have decided: no tasks taken, nothing changed, no notices. Work you hand off directly goes on as usual.")}</p>${counts}${p2Stopped() ? `<div class="box warn"><div class="bh">${ic("pause", "sm")}${F("budget") ? L("预算用完，试用停了", "Budget used up; trial stopped") : L("到期了，你还没回看", "The trial ended before you reviewed it")}</div><div class="fact">${F("budget") ? L("已用 20k 如实记下；看过的样本都能回看。要继续就加预算。", "20k used is recorded as is; every sample seen can be reviewed. Add budget to continue.") : L("没反馈不会自动启用。样本留着，随时可以回看。", "No feedback means it stays off. Samples are kept for review.")}</div></div>` : ""}</section>` : "";
    const review = S.step >= 3 && sch() === "A" ? reviewHtml() : "";
    return `<article class="doc"><div class="fact">${L("设置 › 助理 › 主动做法", "Settings › Assistant › Proactive rules")}</div><h1>${L("客户回复后准备后续材料", "Prepare follow-ups when a client replies")}</h1>
      <div class="rrow"><span class="mw-status stag ${S.enabled ? "partial" : p2Stopped() ? "stale" : S.step >= 1 ? "running" : ""}">${state}</span><span class="fact">${L("做法版本", "Version")} r${r}</span></div>
      <p class="rule">${L("发现「客户 A」在邮件或 Inbox 里回复时，准备下一步需要的材料，等我过目。", "When Client A replies by email or in Inbox, prepare what the next step needs and wait for my review.")}${S.adopted ? `<ins>${L("只有对方提出具体要求时才准备。", " Only when they make a concrete request.")}</ins>` : ""}</p>
      ${trial}${review}${S.step >= 5 ? enableHtml() : ""}${S.step === 0 ? `<div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="next">${L("先观察试用 3 天", "Observe for 3 days first")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="sim" data-l="${L("直接启用", "Turn on now")}">${L("直接启用", "Turn on now")}</button></div>` : ""}</article>`;
  }
  function reviewHtml() {
    const rows = p2Samples().map((x, i) => `<div class="srow ${x.k}${x.wrong && S.marked ? " flagged" : ""}"><span class="mw-status stag ${x.k === "do" ? "running" : x.k === "unsure" ? "accept" : ""}">${x.k === "do" ? L("会准备", "Would prepare") : x.k === "skip" ? L("不处理", "Skip") : L("无法判断", "Can't tell")}</span>
      <div class="tx"><strong>${esc(x.src)}</strong><span class="fact">${L("当时判断", "Why")}：${esc(x.why)} · ${L("会做", "Would do")}：${esc(x.would)} · r1</span></div>
      ${x.k === "do" ? (x.wrong && S.marked ? `<span class="fact">${L("你标了误判", "You flagged it")}</span>` : `<button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="mark" data-i="${i}">${L("这条判错了", "Wrong call")}</button>`) : ""}</div>`).join("");
    const draft = S.marked ? `<div class="box"><div class="bh">${ic("edit", "sm")}${L("按你的反馈改出来的草案", "Draft change from your feedback")}</div><div class="fact">${L("加一句：只有对方提出具体要求时才准备。", "Add: only when they make a concrete request.")}</div><div class="row3">${S.adopted ? `<span class="mini">${ic("check", "sm")}${L("已采用 r2", "Adopted r2")}</span>` : `<button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="adopt">${L("采用 r2", "Adopt r2")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="sim" data-l="${L("再试 3 天", "Try 3 more days")}">${L("用 r2 再试 3 天", "Try r2 for 3 more days")}</button>`}</div></div>` : "";
    return `<section class="sect"><h3>${L("回看", "Review")}</h3><p class="fact">${L("每条都对着当时的来源和做法版本；误判、漏判、无法判断分开看。", "Each is checked against the source and rule version at the time; wrong, missed and unclear calls are kept apart.")}</p>${rows}
      <div class="box warn"><div class="bh">${ic("eye", "sm")}${L("没看到的", "Not covered")}</div><div class="fact">${L("2 封邮件的附件没读到；这两条不算已经检查过。", "Attachments of 2 emails weren't read; those two don't count as checked.")}</div></div>${draft}</section>`;
  }
  function enableHtml() {
    if (!S.enabled) return `<section class="sect"><h3>${L("正式启用", "Turn on")}</h3><p class="fact">${L("启用前先核对现在的情况和授权：试用期里的 3 个「会准备」不补做、不补通知，只看现在还成立的。", "Before turning on it re-checks the current facts and access: the 3 trial candidates aren't replayed or notified; only what still holds now counts.")}</p><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="enable">${L("核对后启用 r" + (S.adopted ? 2 : 1), "Check and turn on r" + (S.adopted ? 2 : 1))}</button></div></section>`;
    return `<section class="sect"><h3>${L("已启用", "On")}</h3><div class="receipt">${ic("check", "sm")}<span>${L("核对过：现在只有「下周三前给报价」还成立，开始准备，周一请你过目。另外 2 条试用候选没有补做。", "Checked: only “quote by next Wednesday” still holds; preparing it for your review on Monday. The other 2 trial candidates weren't replayed.")}</span></div><p class="fact">${L("试用的结论不算你认可过，也不算做完过。", "Trial results don't count as your approval or as work done.")}</p></section>`;
  }
  function p2Chat() {
    const out = [me(L("帮我加一条：客户 A 回复了就准备后续材料。", "Add a rule: when Client A replies, prepare follow-ups."))];
    out.push(ai(`<div>${L("写好了草稿。要不要先观察几天，看它会不会判错或打扰太多？试用期间它不会动手。", "Drafted. Want to observe it for a few days first to see if it misjudges or interrupts too much? It won't act during the trial.")}</div>`));
    if (S.step >= 2) out.push(me(L("把合同第 3 节改一下发我。", "Revise section 3 of the contract and send it to me.")), ai(`<div>${L("在改，这件是你直接交办的，不受试用影响。", "On it — you handed this off directly, so the trial doesn't affect it.")}</div>`));
    if (sch() === "C" && S.step >= 3) out.push(ai(`<div class="card2" style="--hue:var(--h-inbox);max-width:none"><div class="strip2">${own("inbox", "eye")}<span>${L("试用回看", "Trial review")}</span><span style="flex:1"></span><span class="mw-status stag accept">${L("等你看", "For you")}</span></div><div class="inner"><div>${L("3 会准备 · 9 不处理 · 2 无法判断；1 条可能判错，2 封附件没读到。", "3 prepare · 9 skip · 2 unclear; 1 may be wrong, 2 attachments unread.")}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="open-review">${L("打开回看", "Open the review")}</button></div></div></div>`));
    return out.join("");
  }
  function p2Task() {
    if (sch() !== "B" || S.step < 1) return null;
    const line = S.enabled ? L("已启用", "On") : p2Stopped() ? L("试用已停", "Trial stopped") : S.step >= 3 ? L("可以回看了", "Ready to review") : L("观察中 · 第 2 天 · 不动手", "Observing · day 2 · not acting");
    return { title: L("试用：客户回复后准备材料", "Trial: follow-ups on client reply"), state: S.enabled ? "done" : p2Stopped() ? "stale" : S.step >= 3 ? "wait" : "running", line, body: S.step >= 3 ? reviewHtml() : `<p class="fact">${line}</p>` };
  }

  // ---------- path 3: item-by-item review ----------
  function p3Items() {
    const r = S.step >= 4 ? 2 : 1;
    const it = [
      { id: "facts", t: L("事实梳理", "Facts"), need: L("每条有出处", "Every point sourced") },
      { id: "compare", t: L("方案比较", "Option comparison"), need: L("结论带来源", "Conclusions sourced") },
      { id: "advice", t: L("执行建议", "Recommendations"), need: L("给出下一步与负责人", "Next steps and owners") },
    ];
    const set = (x, st, ev, ver, how) => Object.assign(x, { st, ev, ver, how });
    if (S.step < 1) return it.map((x) => set(x, "none", L("还没交回", "Not back yet"), "—", ""));
    const [f, c, a] = it;
    set(f, "pass", L("6 个来源逐条对过", "6 sources checked one by one"), "r1", L("对出处", "Source check"));
    if (F("selfclaim")) set(f, "unver", L("只有「已核对」这句话，没有可查的结果", "Only a “checked” claim, no result to inspect"), "r1", L("执行者自述", "Worker's claim"));
    set(c, "unver", L("第 2、3 条结论没有来源", "Conclusions 2 and 3 have no source"), "r1", L("对出处", "Source check"));
    set(a, "missing", L("没有交", "Not delivered"), "—", "");
    if (S.dec.facts === "ok") f.you = "ok";
    if (S.dec.compare === "back") c.you = "back";
    if (S.step >= 4) {
      if (F("stale")) set(f, "stale", L("来源「行业报告」在 r1 之后更新了，要重看", "Source “industry report” changed after r1; re-check"), "r1", L("对出处", "Source check"));
      else if (f.st === "pass") f.kept = true;
      set(c, F("wrongobj") ? "unver" : "pass", F("wrongobj") ? L("核的是 r1，不是这次交的 r2", "r1 was checked, not the r2 just delivered") : L("补了 3 个来源", "3 sources added"), F("wrongobj") ? "r1" : "r2", L("对出处", "Source check"));
      if (F("cond")) set(a, "dropped", L("你把这项从完成条件里去掉了（11月4日）", "You removed this from the completion terms (Nov 4)"), "—", "");
      else set(a, S.accepted ? "pass" : "review", L("写了 4 条下一步，各有负责人", "4 next steps, each with an owner"), "r2", L("等你看", "Needs your review"));
    }
    if (S.accepted && a.st === "pass") a.you = "ok";
    it.round = r;
    return it;
  }
  const ST3 = () => ({ none: ["", L("—", "—")], pass: ["partial", L("通过", "Passed")], unver: ["failed", L("未验证", "Unverified")], missing: ["failed", L("缺", "Missing")], stale: ["stale", L("要重看", "Re-check")], review: ["accept", L("等你看", "Your review")], dropped: ["stale", L("条件已改", "Terms changed")] });
  function p3Summary(it) {
    const need = it.filter((x) => x.st !== "dropped"), ok = need.filter((x) => x.st === "pass").length;
    const done = ok === need.length;
    return `<div class="sumrow"><span class="mw-status stag ${done ? "partial" : "accept"}">${done ? L("全部满足", "All met") : L(`${ok}/${need.length} 项满足`, `${ok}/${need.length} met`)}</span><span class="fact">${L("执行", "Run")}：${S.step >= 1 ? L("成功", "succeeded") : "—"} · ${L("要求核验", "Checks")}：${ok}/${need.length} · ${L("你认可", "Your approval")}：${it.filter((x) => x.you === "ok").length}/${need.length}</span></div>`;
  }
  function p3Row(x, compact) {
    const [cls, lab] = ST3()[x.st];
    const acts = S.step === 2 && x.st !== "none" ? (x.id === "facts" && x.st === "pass" ? (S.dec.facts ? `<span class="mini">${ic("check", "sm")}${L("你认可了", "Accepted")}</span>` : `<button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="dec" data-id="facts" data-v="ok">${L("认可", "Accept")}</button>`) : x.id === "compare" ? (S.dec.compare ? `<span class="mini">${ic("back", "sm")}${L("已退回", "Returned")}</span>` : `<button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="dec" data-id="compare" data-v="back">${L("退回：要来源", "Return: needs sources")}</button>`) : "") : S.step >= 5 && x.st === "review" && !S.accepted ? `<button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="accept">${L("认可", "Accept")}</button>` : "";
    return `<div class="req${S.focus === x.id ? " on" : ""}" data-act="focus" data-id="${x.id}"><div class="rh"><strong>${esc(x.t)}</strong><span class="mw-status stag ${cls}">${lab}</span>${x.you === "ok" ? `<span class="who hu">${L("你", "You")}</span>` : ""}${x.you === "back" && S.step < 4 ? `<span class="fact">${L("退回中", "Returned")}</span>` : ""}</div>
      ${compact ? "" : `<div class="fact">${L("要求", "Needs")}：${esc(x.need)}</div>`}<div class="fact">${L("依据", "Evidence")}：${esc(x.ev)}${x.ver !== "—" ? ` · ${L("核的版本", "Version checked")} ${x.ver}${x.how ? " · " + esc(x.how) : ""}` : ""}${x.kept ? ` · ${L("未受影响，沿用 r1 的结论", "unaffected; r1 result kept")}` : ""}</div>${acts ? `<div class="row3">${acts}</div>` : ""}</div>`;
  }
  function p3Changes() {
    if (S.step < 4) return "";
    return `<div class="box"><div class="bh">${ic("git-compare", "sm")}${L("第 2 轮改了什么", "What round 2 changed")}</div><ul class="chg-list"><li>${L("方案比较：第 2、3 条补了 3 个来源", "Comparison: 3 sources added for conclusions 2 and 3")}</li>${F("cond") ? `<li>${L("执行建议：按你改的完成条件不再要求（这是条件变更，不算修好）", "Recommendations: no longer required by your changed terms (a change of terms, not a fix)")}</li>` : `<li>${L("执行建议：新写了 4 条", "Recommendations: 4 new steps written")}</li>`}<li>${F("stale") ? L("事实梳理：来源更新了，标成要重看", "Facts: a source changed, marked for re-check") : L("事实梳理：没动，沿用你认可过的结论", "Facts: untouched; your earlier acceptance stands")}</li></ul></div>`;
  }
  function p3Doc() {
    const it = p3Items(), r = S.step >= 4 ? 2 : 1;
    const ann = (id, txt) => (sch() === "C" && S.step >= 1 ? `<button class="anno ${S.focus === id ? "on" : ""}" data-act="focus" data-id="${id}">${ic("review", "sm")}${esc(txt)}</button>` : "");
    const sec = (id, h, body) => `<section class="rsec${(sch() !== "A" && S.focus === id) ? " hl" : ""}" id="sec-${id}"><h3>${h}</h3>${body}${ann(id, (() => { const x = it.find((y) => y.id === id); return ST3()[x.st][1] + " · " + x.ev; })())}</section>`;
    const body = S.step < 1 ? `<p class="fact">${L("还在写。", "Still writing.")}</p>` : [
      sec("facts", L("一、事实梳理", "1. Facts"), `<div class="line"></div><div class="line"></div><p class="fact">${L("6 个出处", "6 sources")}</p>`),
      sec("compare", L("二、方案比较", "2. Comparison"), `<div class="line"></div><p>${L("结论 2：迁移到 B 成本最低", "Conclusion 2: moving to B costs least")}${S.step >= 4 && !F("wrongobj") ? ` <sup class="src">[7]</sup>` : ` <span class="gap">${L("无来源", "unsourced")}</span>`}</p><p>${L("结论 3：A 的停机时间最短", "Conclusion 3: A has the least downtime")}${S.step >= 4 && !F("wrongobj") ? ` <sup class="src">[8][9]</sup>` : ` <span class="gap">${L("无来源", "unsourced")}</span>`}</p>`),
      sec("advice", L("三、执行建议", "3. Recommendations"), S.step >= 4 && !F("cond") ? `<div class="line"></div><div class="line"></div>` : `<p class="gap">${F("cond") && S.step >= 4 ? L("已从完成条件里去掉", "Removed from the completion terms") : L("这一节还没有", "Not written yet")}</p>`),
    ].join("");
    const left = sch() === "B" && S.step >= 1 ? `<aside class="reqs"><div class="lh">${L("要求", "Requirements")} · r${r}</div>${p3Summary(it)}${it.map((x) => p3Row(x, true)).join("")}</aside>` : "";
    const top = sch() === "C" && S.step >= 1 ? `<div class="annsum">${p3Summary(it)}</div>` : "";
    return `<div class="docwrap${left ? " withreqs" : ""}">${left}<article class="doc"><div class="fact">Pages · ${L("报告", "Report")} r${S.step >= 1 ? r : 0}</div><h1>${L("客户 A 迁移方案研究", "Client A migration study")}</h1>${top}${body}${sch() !== "A" ? p3Changes() : ""}</article></div>`;
  }
  function p3Chat() {
    const out = [me(L("写一份客户 A 的迁移方案研究：事实梳理、方案比较（结论要有来源）、执行建议。", "Write a Client A migration study: facts, an option comparison (sourced conclusions), and recommendations."))];
    if (S.step >= 1) {
      const it = p3Items();
      const card = sch() === "A" ? `<div class="card2" style="--hue:var(--h-goals);max-width:none"><div class="strip2">${own("goals", "note")}<span>${L("报告", "Report")} r${it.round}</span><span style="flex:1"></span>${sim()}</div><div class="inner">${p3Summary(it)}${it.map((x) => p3Row(x)).join("")}${p3Changes()}</div></div>` : "";
      out.push(ai(`<div>${S.step >= 4 ? L("第 2 轮交回。只重核了受影响的部分：", "Round 2 is back. Only the affected parts were re-checked:") : L("第 1 轮交回。逐项核了一遍，不是三项都满足：", "Round 1 is back. Checked item by item — not all three are met:")}</div>${card}${sch() !== "A" ? `<div class="fact">${ic("info", "sm")} ${sch() === "B" ? L("逐项结果在左边的要求栏里。", "Per-item results are in the requirements column.") : L("逐项结果批注在报告上。", "Per-item results are annotated on the report.")}</div>` : ""}`));
    }
    if (S.step >= 3) out.push(`<div class="mini" style="justify-content:center">${ic("review", "sm")}${L("你的退回已送达 · 送达不等于已解决", "Your return was delivered · delivered isn't resolved")}</div>`);
    if (S.step === 3) out.push(ai(`<div>${L("在补方案比较的来源、写执行建议；事实梳理你认可过，不动它。", "Adding sources to the comparison and writing recommendations; your accepted facts stay untouched.")}</div>`));
    if (S.step >= 5 && S.accepted) out.push(ai(`<div class="receipt">${ic("check", "sm")}<span>${L("三项都满足：执行成功、核验通过，你认可了事实梳理和执行建议。", "All three met: run succeeded, checks passed, and you accepted the facts and recommendations.")}</span></div>`));
    return out.join("");
  }

  // ---------- shared chrome ----------
  function me(txt) { return `<div class="m2 me"><div class="bub">${esc(txt)}</div></div>`; }
  function ai(html) { return `<div class="m2"><span class="av ai">AI</span><div class="body">${html}</div></div>`; }
  function task() { return S.path === 1 ? p1Task() : S.path === 2 ? p2Task() : null; }
  function chatPane() {
    const tk = task();
    const strip = tk ? `<div class="tstrip"><button data-act="list" aria-expanded="${S.open}">${ic("list", "sm")}${kitRing(({ wait: "accept", running: "running", done: "done", stale: "stale" })[tk.state])}<span class="cnt"><b>${esc(tk.title)}</b></span><span class="fact tl">${esc(tk.line)}</span><span style="flex:1"></span>${ic(S.open ? "chevron-down" : "chevron-right", "sm")}</button></div>` : "";
    const panel = tk && S.open ? `<div class="tlist tdet2" role="region" aria-label="${esc(tk.title)}"><div class="lh">${esc(tk.title)}<span style="flex:1"></span>${sim()}</div>${tk.body}</div>` : "";
    const conv = S.path === 1 ? p1Chat() : S.path === 2 ? p2Chat() : p3Chat();
    return `<div class="ph2">${ic("sparkles", "sm")}${L("助理", "Assistant")}<span class="grow"></span>${sim()}</div>${strip}<div class="conv" id="conv">${conv}</div>${panel}
      <div class="comp"><div class="inrow"><textarea rows="1" placeholder="${L("原型只演剧本；用顶上的「下一步」推进", "Scripted prototype; use Next above")}" aria-label="${L("发给助理", "Message the assistant")}" disabled></textarea><button class="mw-btn mw-btn--secondary mw-btn--md" data-slot="button" disabled>${L("发送", "Send")}</button></div></div>`;
  }
  function workPane() {
    const title = S.path === 1 ? L("周会准备", "Meeting prep") : S.path === 2 ? L("主动做法", "Proactive rule") : L("报告", "Report");
    const body = S.path === 1 ? p1Doc() : S.path === 2 ? p2Rule() : p3Doc();
    const logOpen = S.path === 1 && sch() === "C" && S.focus === "log" ? `<div class="box" style="margin:0 24px 16px">${judgeRows(p1Events())}</div>` : "";
    const rev = S.path === 2 && sch() === "C" && S.focus === "review" && S.step >= 3 ? `<div style="padding:0 36px 24px">${reviewHtml()}</div>` : "";
    return `<div class="ph2">${ic(S.path === 2 ? "settings" : "note", "sm")}${title}<span class="grow"></span>${sim()}</div><div class="wscroll">${body}${logOpen}${rev}</div>`;
  }
  function render() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en"; document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.resolvedTheme = S.theme;
    const P = { protoTitle: L("原型 · 模拟数据", "Prototype · sample data"), path: L("路径", "Path"), scheme: L("方案", "Option"), step: L("剧本", "Script"), prev: L("上一步", "Back"), next: L("下一步", "Next"), fault: L("情况", "Situation"), lang: L("语言", "Language"), theme: L("外观", "Theme"), light: L("浅", "Light"), dark: L("深", "Dark"), reset: L("重置", "Reset") };
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = P[n.dataset.t]));
    for (const b of document.querySelectorAll("#path button")) { b.setAttribute("aria-pressed", +b.dataset.path === S.path); b.title = PATHS()[b.dataset.path]; }
    for (const b of document.querySelectorAll("#scheme button")) { b.setAttribute("aria-pressed", b.dataset.scheme === sch()); const d = DECIDED[S.path] === b.dataset.scheme; b.textContent = d ? `${b.dataset.scheme} ✓` : b.dataset.scheme; b.title = SCHEMES()[S.path][b.dataset.scheme] + (d ? L(" · 已定（2026-11-03）", " · decided (2026-11-03)") : ""); }
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    document.getElementById("fault").innerHTML = FAULTS[S.path].map((v) => `<option value="${v}"${v === S.fault ? " selected" : ""}>${FAULT_NAMES()[v]}</option>`).join("");
    document.getElementById("stepcap").textContent = `${S.step}/${STEPS[S.path] - 1} · ${CAPS()[S.path][S.step]}`;
    document.getElementById("app").innerHTML = `<div class="pathbar"><b>${S.path} · ${esc(PATHS()[S.path])}</b><span class="fact">${esc(SCHEMES()[S.path][sch()])}</span><span style="flex:1"></span><span class="mw-toggle-group side-tabs" data-slot="toggle-group" data-seg-thumb role="group"><button data-act="mdoc" aria-pressed="${S.mdoc}">${L("工作区", "Work")}</button><button data-act="mchat" aria-pressed="${!S.mdoc}">${L("助理", "Assistant")}</button></span></div><div class="work s-B${S.mdoc ? " show-doc" : ""}"><section class="pane2 docpane">${workPane()}</section><section class="pane2 chat">${chatPane()}</section></div>`;
    const c = document.getElementById("conv"); if (c) c.scrollTop = c.scrollHeight;
    save();
  }
  function toast(m) { document.querySelector(".mw-toast")?.remove(); const el = document.createElement("div"); el.className = "mw-toast"; el.setAttribute("role", "status"); el.textContent = m; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3200); }
  function goStep(n) {
    n = Math.max(0, Math.min(STEPS[S.path] - 1, n));
    if (n < S.step) S = { ...fresh(), path: S.path, sch: S.sch, lang: S.lang, theme: S.theme, fault: S.fault };
    while (S.step < n) {
      const s = S.step;
      if (S.path === 1 && s === 4 && !S.budget) S.budget = "8 万";
      if (S.path === 2 && s === 3 && !S.marked) S.marked = true;
      if (S.path === 2 && s === 4) S.adopted = true;
      if (S.path === 2 && s === 5) S.enabled = true;
      if (S.path === 3 && s === 2) S.dec = { facts: "ok", compare: "back" };
      S.step++;
    }
    if (S.path === 1 && S.step === 6) S.seen = false;
    render();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-path],[data-scheme],[data-lang],[data-theme-set]");
    if (!b) return;
    if (b.dataset.path) { S = { ...fresh(), sch: S.sch, lang: S.lang, theme: S.theme, path: +b.dataset.path }; return render(); }
    if (b.dataset.scheme) { S.sch = { ...S.sch, [S.path]: b.dataset.scheme }; S.open = false; S.focus = null; return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    const { act } = b.dataset;
    switch (act) {
      case "next": return goStep(S.step + 1);
      case "list": S.open = !S.open; return render();
      case "budget": S.budget = b.dataset.v; render(); return toast(L("写进准备稿了；不用再回到对话里确认", "Added to the prep draft; no need to confirm again"));
      case "seen": S.seen = true; render(); return toast(L("打开了简报（模拟）", "Opened the brief (simulated)"));
      case "open-log": S.focus = S.focus === "log" ? null : "log"; return render();
      case "open-review": S.focus = "review"; return render();
      case "mark": S.marked = true; return render();
      case "adopt": S.adopted = true; render(); return toast(L("采用了 r2；试用里的旧判断不改写", "Adopted r2; earlier trial judgements stay as they were"));
      case "enable": if (S.step < 5) return; S.enabled = true; return render();
      case "dec": S.dec = { ...S.dec, [b.dataset.id]: b.dataset.v }; return render();
      case "accept": S.accepted = true; return render();
      case "focus": S.focus = S.focus === b.dataset.id ? null : b.dataset.id; render(); document.getElementById("sec-" + b.dataset.id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); return;
      case "mdoc": S.mdoc = true; return render();
      case "mchat": S.mdoc = false; return render();
      case "sim": return toast(`「${b.dataset.l}」（${L("模拟", "simulated")}）`);
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.open) { S.open = false; render(); document.querySelector('[data-act="list"]')?.focus(); } });
  document.getElementById("prev").addEventListener("click", () => goStep(S.step - 1));
  document.getElementById("next").addEventListener("click", () => goStep(S.step + 1));
  document.getElementById("fault").addEventListener("change", (e) => { const st = S.step; S = { ...fresh(), path: S.path, sch: S.sch, lang: S.lang, theme: S.theme, fault: e.target.value }; goStep(st); });
  document.getElementById("reset").addEventListener("click", () => { S = { ...fresh(), lang: S.lang, theme: S.theme, path: S.path, sch: S.sch }; render(); });
  if (!FAULTS[S.path].includes(S.fault)) S.fault = "none";
  render();
})();
