// 03 · 按需帮助定样 — one plugin page (Schedule, "new scheduled task") drawn three ways for VUX-55～57 and ONB-47～48:
// where help opens, how it closes back to its entry, which facts stay on the page while it is closed, and how a step
// chosen inside help hands over to preparation and comes back with the work intact. Nothing calls a model or a Home;
// the provider check, the costs and the recipients are simulated.
(() => {
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const KEY = "molis-proto.on-demand-help.v1";
  const SCENES = ["missing", "ready", "first", "helpfail", "prepclosed"];
  const fresh = () => ({ scheme: "A", lang: "zh", theme: "light", scene: "missing", help: null, sideOpen: false, focus: "main",
    notes: false, model: false, prep: null, sideForHelp: false, prepLeft: false, tipSkipped: false, tipOpen: false, helpRetried: false,
    form: { name: "", when: "mon9", what: "", to: "" } });
  let S = load(), pop = null, toastT;
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const sim = () => `<span class="mw-badge mw-badge--neutral tag-sim" data-slot="badge">${L("模拟", "Simulated")}</span>`;
  const btn = (variant, label, attrs = "", icon = "", size = "sm") => `<button type="button" class="mw-btn mw-btn--${variant} mw-btn--${size}" data-slot="button" ${attrs}>${icon ? ic(icon, "sm") : ""}<span class="lbl">${label}</span></button>`;

  // ---------- copy ----------
  const T = () => ({
    protoTitle: L("按需帮助 · 原型", "On-demand help · prototype"), scheme: L("方案", "Scheme"), scene: L("情况", "Case"),
    reopen: L("重新打开这一页", "Reopen this page"), lang: L("语言", "Language"), theme: L("外观", "Theme"), light: L("浅", "Light"), dark: L("深", "Dark"), reset: L("重置", "Reset"), notes: L("标出组件板新增", "Mark board additions"),
  });
  // The parts this page adds to the component board carry data-board-new; the strip toggle outlines them (README lists why).
  const NEW_EN = { "按钮按下态": "Button pressed state", "每次运行会": "Each-run facts", "帮助内容": "Help content", "帮助卡片": "Help card" };
  const isNew = (name) => `data-board-new="${S.lang === "zh" ? name : NEW_EN[name]}"`;
  const SCHEMES = () => ({ A: L("A 就近卡片，长的转右栏", "A Card beside the entry, long help moves to the side"), B: L("B 右栏里的帮助标签", "B A help tab in the side pane"), C: L("C 就地展开", "C Opens in place") });
  const SCENE_NAMES = () => ({ missing: L("新建任务，还没连模型", "New task, no model yet"), ready: L("已有配置，直接用", "Already set up"), first: L("第一次打开这一页", "First time on this page"),
    helpfail: L("帮助内容读不到", "Help can't be loaded"), prepclosed: L("补配置中途关掉了", "Preparation closed midway") });
  const WHEN = () => [["mon9", L("每周一 09:00", "Mondays 09:00")], ["daily18", L("每天 18:00", "Daily 18:00")], ["first1", L("每月 1 日 10:00", "1st of each month 10:00")]];
  const sample = () => ({ name: L("周报", "Weekly report"), what: L("把本周 Pages「周会纪要」整理成一页周报：本周完成、下周计划、需要谁拍板。", "Turn this week's Pages “Meeting notes” into a one-page report: done this week, next week's plan, what needs a decision."), to: L("团队 3 人（team@example.com）", "The team, 3 people (team@example.com)") });

  // help topics: the page, and the one field whose meaning people ask about
  const TOPICS = () => ({
    page: { title: L("定时任务", "Scheduled tasks"), sections: [
      { id: "what", h: L("这是什么", "What it is"), body: `<p>${L("到了你定的时间，助理按你写的要求做一件事，做完把结果放回这个项目；要发出去的，按你填的对象发。", "At the time you set, the assistant does one thing as you described, puts the result back in this project, and sends it to the people you named.")}</p>` },
      { id: "eg", h: L("例子", "Examples"), body: `<ul><li>${L("每周一 9:00 把周会纪要整理成周报发给团队", "Every Monday 9:00, turn the meeting notes into a report for the team")}</li><li>${L("每天 18:00 汇总今天 Inbox 里要回的邮件", "Every day 18:00, list today's Inbox mail that needs a reply")}</li></ul>` },
      { id: "how", h: L("怎么写「做什么」", "Writing “What to do”"), body: `<p>${L("写清要读什么、交出什么、给谁看。读的范围只到你在这里给的材料。", "Say what to read, what to hand back and for whom. It only reads the material you give here.")}</p>` },
      { id: "who", h: L("以谁的身份运行", "Whose permission it runs with"), body: `<p>${L("用你的授权，但只限这个任务给出的范围：读这一份 Pages、发给这 3 个人。你在设置里撤掉授权，下一次就不会运行，并在这里写明原因。", "Yours, limited to what this task names: this Pages document and these 3 people. Revoke it in Settings and the next run doesn't happen; this page says why.")}</p>` },
      { id: "adv", h: L("高级", "Advanced"), body: `<details class="mw-collapsible" data-slot="collapsible"><summary>${L("时区、错过的时间、失败重试", "Time zone, missed runs, retries")}</summary><div class="mw-collapsible__body"><ul><li>${L("按本机时区（Asia/Shanghai）。", "Uses this computer's time zone (Asia/Shanghai).")}</li><li>${L("电脑睡着错过了，醒来补跑一次，不连补多次。", "If the computer was asleep, it runs once on waking, not once per missed time.")}</li><li>${L("失败自动再试一次；再失败就停下，在这里说哪一步没成。", "A failure is retried once; after that it stops and this page says which step failed.")}</li></ul></div></details>` },
    ] },
  });

  // ---------- facts that stay on the page (VUX-56) ----------
  function factsHtml() {
    const modelRow = S.model
      ? `<div class="fact-row ok"><span class="ico">${ic("sparkles", "sm")}</span><span class="tx">${L("用 MiniMax-M3 写周报", "Writes the report with MiniMax-M3")}<small>${L("约每次 ¥0.02，按服务商计费", "about ¥0.02 a run, billed by the provider")}</small></span></div>`
      : `<div class="fact-row warn"><span class="ico">${ic("alert", "sm")}</span><span class="tx">${L("还没连接写文字用的模型", "No text model connected yet")}<small>${L("只影响按时运行，可以先存草稿", "Only running on time is affected; you can save a draft")}</small></span>${btn("secondary", L("连接模型", "Connect a model"), `data-act="prep" data-from="facts"`)}</div>`;
    return `<section class="facts" ${isNew("每次运行会")} aria-label="${L("每次运行会做的事", "What each run does")}"><h3>${L("每次运行会", "Each run will")}</h3>
      <div class="fact-row"><span class="ico">${ic("note", "sm")}</span><span class="tx">${L("读取 Pages「周会纪要」", "Read Pages “Meeting notes”")}<small>${L("只读这一份", "only this one")}</small></span></div>
      ${modelRow}
      <div class="fact-row out"><span class="ico">${ic("mail", "sm")}</span><span class="tx">${L("发邮件给 3 人", "Email 3 people")}<small>${L("会发到项目外，发出后收不回", "leaves the project and can't be recalled")}</small></span></div></section>`;
  }

  // ---------- help bodies ----------
  // 「还差一步」: the one place in help that leads into preparation (VUX-57). The card keeps it under the scrolling
  // text so it is never below the fold; the side pane and the in-place form show it at the end of the text.
  const nextHtml = () => (S.model ? "" : `<div class="next"><h4>${L("要按时运行，还差一步", "One step before it can run on time")}</h4><p class="fact">${L("看帮助不会改任何设置。选这一项才去连接模型；连好回到这里，你写的都在。", "Reading help changes nothing. Choose this to connect a model; you come back here with everything you wrote.")}</p><div>${btn("primary", L("连接模型", "Connect a model"), `data-act="prep" data-from="help"`, "sparkles")}</div></div>`);
  const failed = () => S.scene === "helpfail" && !S.helpRetried;
  function helpBody(topic, focusId, withNext = true) {
    if (failed()) {
      return `<div class="mw-empty mw-empty--error" data-slot="empty"><span class="mw-empty__mark">${ic("circle-alert")}</span><strong>${L("帮助没读出来", "Help didn't load")}</strong><p>${L("这一页照常能用；每次运行会做的事一直写在表单下面。", "This page still works; what each run does stays listed under the form.")}</p><div class="mw-empty__actions">${btn("secondary", L("再试一次", "Try again"), `data-act="help-retry"`, "refresh")}</div></div>`;
    }
    const t = TOPICS()[topic];
    return `<div class="hc" ${isNew("帮助内容")}>${t.sections.map((s) => `<section id="h-${s.id}" class="${s.id === focusId ? "hl" : ""}"><h4>${s.h}</h4>${s.body}</section>`).join("")}${withNext ? nextHtml() : ""}</div>`;
  }
  const helpTitle = (topic) => (topic === "who" ? L("帮助 · 以谁的身份运行", "Help · Whose permission") : L("帮助 · 定时任务", "Help · Scheduled tasks"));
  const helpHead = (closeAct, topic = "page") => `<div class="hhead">${ic("question", "sm")}<strong>${helpTitle(topic)}</strong><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only" data-slot="button" data-act="${closeAct}" aria-label="${L("关闭帮助", "Close help")}">${ic("x", "sm")}</button></div>`;

  // ---------- page ----------
  function tipHtml() {
    if (S.scene !== "first" || S.tipSkipped) return "";
    return `<div class="tip" role="status">${ic("idea", "sm")}<span class="tx">${L("第一次用定时任务？看一个现成的例子，1 分钟。", "First scheduled task? See a ready example — one minute.")}</span>${btn("secondary", L("看例子", "See example"), `data-act="tip-see"`)}${btn("ghost", L("跳过", "Skip"), `data-act="tip-skip"`)}</div>`;
  }
  function inline(topic) {
    if (S.scheme !== "C" || !S.help || S.help.topic !== topic) return "";
    if (topic === "who") return `<div class="hinline small" id="help-region" role="region" aria-label="${L("帮助", "Help")}">${helpHead("help-close", "who")}<div class="hc" ${isNew("帮助内容")}>${TOPICS().page.sections.find((x) => x.id === "who").body}</div></div>`;
    return `<div class="hinline" id="help-region" role="region" aria-label="${L("帮助", "Help")}">${helpHead("help-close")}${helpBody("page")}</div>`;
  }
  function page() {
    const f = S.form, smp = sample();
    const helpOpen = !!S.help && (S.scheme !== "B" || S.sideOpen);
    const whoOpen = helpOpen && S.help.topic === "who";
    const prepNote = S.scene === "prepclosed" && S.prepLeft && !S.model
      ? `<div class="mw-alert mw-alert--warning" data-slot="alert" role="status"><strong>${L("连接模型还没做完", "Connecting a model isn't finished")}</strong><p>${L("选好的服务商「MiniMax」留着，接着做只差检查连接。", "Your chosen provider “MiniMax” is kept; only the connection check is left.")}</p><div class="acts">${btn("secondary", L("接着连接", "Continue connecting"), `data-act="prep" data-from="resume"`)}</div></div>` : "";
    return `<div class="sch">
      <div class="phead"><span class="own">${ic("timer", "sm")}</span><h2>${L("定时任务", "Scheduled tasks")}</h2><span class="grow"></span>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm help-btn" data-slot="button" ${isNew("按钮按下态")} data-act="help" data-topic="page" id="help-entry" aria-expanded="${helpOpen && S.help.topic === "page"}" aria-controls="help-region">${ic("question", "sm")}<span class="lbl">${L("帮助", "Help")}</span></button></div>
      <div class="crumb"><button class="link" data-act="sim" data-l="${L("回到列表", "Back to list")}">${L("定时任务", "Scheduled tasks")}</button>${ic("chevron-right", "sm")}<span>${L("新建", "New")}</span></div>
      <div class="body" id="sch-body"><div class="inner">
        ${tipHtml()}${prepNote}${inline("page")}
        <form onsubmit="return false" aria-label="${L("新建定时任务", "New scheduled task")}">
          <div class="row2">
            <label class="mw-field"><span class="lab">${L("名称", "Name")}</span><input class="mw-input" data-f="name" value="${esc(f.name)}" placeholder="${esc(smp.name)}"></label>
            <label class="mw-field"><span class="lab">${L("什么时候", "When")}</span><select class="mw-select" data-f="when">${WHEN().map(([v, l]) => `<option value="${v}"${v === f.when ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
          </div>
          <label class="mw-field"><span class="lab">${L("做什么", "What to do")}</span><textarea class="mw-textarea" data-f="what" placeholder="${esc(smp.what)}">${esc(f.what)}</textarea></label>
          <label class="mw-field"><span class="lab">${L("发给谁", "Send to")}</span><input class="mw-input" data-f="to" value="${esc(f.to)}" placeholder="${esc(smp.to)}"></label>
          <div class="mw-field"><span class="lab">${L("以谁的身份运行", "Runs with whose permission")}<button type="button" class="mw-btn mw-btn--link" data-slot="button" data-act="help" data-topic="who" id="who-entry" aria-expanded="${whoOpen}" aria-controls="help-region">${L("了解此项", "About this")}</button></span>
            <select class="mw-select" aria-label="${L("以谁的身份运行", "Runs with whose permission")}"><option>${L("我（只限这个任务给出的范围）", "Me (only what this task names)")}</option></select></div>
          ${inline("who")}
          ${factsHtml()}
          <div class="acts">${btn("primary", L("保存并启用", "Save and turn on"), `data-act="save" id="save"${S.model ? "" : " disabled aria-describedby=\"save-why\""}`, "", "md")}${btn("secondary", L("存为草稿", "Save as draft"), `data-act="draft"`, "", "md")}${S.model ? "" : `<span class="why" id="save-why">${L("连接模型后才能启用", "Turn on after connecting a model")}</span>`}</div>
        </form>
      </div></div></div>`;
  }

  // ---------- side pane (B, and A's “continue in the side pane”) ----------
  function sideBody() {
    if (S.help && S.sideOpen) {
      const ctx = S.help.topic === "who" ? L("正在看：以谁的身份运行", "Looking at: whose permission it runs with") : L("正在看：新建定时任务", "Looking at: new scheduled task");
      return `<div class="hside" id="help-region" role="region" aria-label="${L("帮助", "Help")}">${helpHead("help-close")}<div class="ctx">${ctx}</div>${helpBody("page", S.help.topic === "who" ? "who" : null)}</div>`;
    }
    return `<div class="empty"><h3>${L("Shelf", "Shelf")}</h3><p>${L("右栏放你手边要用的东西。", "The side pane holds what you keep at hand.")}</p></div>`;
  }

  // ---------- frame ----------
  function tabs(which) {
    const list = which === "main"
      ? [{ id: "home", title: L("项目首页", "Project home"), icon: "home" }, { id: "sch", title: L("新建定时任务", "New scheduled task"), icon: "timer", group: "Schedule" }]
      : (S.help && S.sideOpen ? [{ id: "help", title: L("帮助", "Help"), icon: "question" }] : []).concat([{ id: "shelf", title: "Shelf", icon: "book" }]);
    const active = which === "main" ? "sch" : list[0].id;
    const html = list.map((tb) => {
      const t = `<button class="tab${tb.id === "home" ? " home" : ""}" role="tab" aria-selected="${tb.id === active}"${tb.id === "home" ? ` aria-label="${esc(tb.title)}"` : ""}>${ic(tb.icon, "sm")}<span>${esc(tb.title)}</span>${tb.id === "help" ? `<span class="x" data-act="help-close" role="button" aria-label="${L("关闭帮助", "Close help")}">${ic("x", "sm")}</span>` : ""}</button>`;
      return tb.group ? `<span class="group" style="--hue:var(--hue-orange)"><span class="chip">${tb.group}</span>${t}</span>` : t;
    }).join("");
    const win = `<span class="mw-toggle-group winsel" data-slot="toggle-group" data-seg-thumb role="group"><button data-act="focus" data-v="main" aria-pressed="${S.focus === "main"}">${L("主区", "Main")}</button><button data-act="focus" data-v="side" aria-pressed="${S.focus === "side"}">${L("右栏", "Side")}</button></span>`;
    return `<div class="strip ${which}">${which === "main" ? `<div class="nav"><button aria-label="back">${ic("chevron-left", "sm")}</button><button aria-label="forward">${ic("chevron-right", "sm")}</button></div>` : ""}<div class="tabs" role="tablist">${html}</div><div class="tools">${win}<button aria-label="${L("新标签", "New tab")}">${ic("plus")}</button>${which === "side" ? `<button data-act="side-close" aria-label="${L("关闭右栏", "Close side pane")}">${ic("x")}</button>` : ""}</div></div>`;
  }
  function bar() {
    return `<div class="bar"><div class="tray"><button class="switcher">${ic("grid", "sm")}<span>Schedule</span>${ic("chevron-down", "sm")}</button><button class="pin" aria-label="${L("项目首页", "Project home")}">${ic("home")}</button><button class="pin" aria-current="page" aria-label="Schedule">${ic("timer")}</button></div>
      <div class="composer"><span class="ph">${L("问助理，或输入 / 找命令", "Ask the assistant, or type / for commands")}</span><button class="send" aria-label="send">${ic("send", "sm")}</button></div>
      <div class="tray"><button class="resident" data-act="side-toggle" aria-pressed="${S.sideOpen}" aria-label="${L("右栏", "Side pane")}">${ic("sidebar")}</button><span class="mono" role="button" tabindex="0">${L("例", "T")}</span></div></div>`;
  }
  function prepHtml() {
    if (!S.prep) return "";
    const step = S.prep.step, origin = S.prep.from === "help" ? L("从帮助", "From help") : L("从这一页", "From this page");
    const body = step === "done"
      ? `<h1>${L("模型连好了", "The model is connected")}</h1><p class="why2">${L("MiniMax-M3 已保存到设置 › 模型，所有插件用同一份。回到定时任务，你写的内容都还在，现在可以启用了。", "MiniMax-M3 is saved in Settings › Models and shared by every plugin. Back on the scheduled task, everything you wrote is still there and it can be turned on.")}</p>`
      : `<h1>${L("连接一个写文字用的模型", "Connect a text model")}</h1><p class="why2">${L("定时任务要用它来写周报。只补这一步，别的设置不动。", "The scheduled task uses it to write the report. Only this step; nothing else is changed.")}</p>
        <div class="choices">${["MiniMax", "DeepSeek", "OpenAI"].map((p) => `<button type="button" class="mw-choice" data-slot="choice" data-act="pick-provider" data-v="${p}" aria-pressed="${S.prep.provider === p}"><span class="mw-choice__label">${p}</span></button>`).join("")}</div>
        ${S.prep.provider ? `<label class="mw-field"><span class="lab">${L("密钥", "Key")} ${sim()}</span><input class="mw-input" value="••••••••••••" readonly aria-label="${L("密钥（模拟）", "Key (simulated)")}"></label>` : ""}
        <div class="keep">${ic("check", "sm")} ${L("定时任务里写的「名称、做什么、发给谁」都留着；中途关掉，这一步的进度也留着。", "Name, what to do and recipients on the task are kept; close midway and this step's progress is kept too.")}</div>`;
    const primary = step === "done" ? btn("primary", L("回到定时任务", "Back to the scheduled task"), `data-act="prep-back" id="prep-primary"`, "back", "lg")
      : btn("primary", L("检查连接", "Check connection"), `data-act="prep-check" id="prep-primary"${S.prep.provider ? "" : " disabled"}`, "", "lg");
    return `<div class="prep" role="dialog" aria-modal="true" aria-label="${L("连接模型", "Connect a model")}"><div class="top">${btn("ghost", L("定时任务", "Scheduled tasks"), `data-act="prep-leave"`, "back")}<span class="grow"></span><span class="fact">${origin} · ${L("补齐 1 项", "1 thing to add")}</span><span class="mw-badge mw-badge--neutral tag-sim tag-reuse" data-slot="badge">${L("复用 04 定样的沉浸式框架", "Reuses the 04 immersive frame")}</span></div>
      <div class="paper">${body}</div><div class="foot"><span class="fact">${step === "done" ? "" : L("Esc 或左上角回到定时任务，进度留着", "Esc or top left goes back; progress is kept")}</span>${primary}</div></div>`;
  }

  function render() {
    const tt = T();
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    // The board's theme client reads molis-work:theme when it starts; keep it in step so it doesn't fall back to the system.
    try { localStorage.setItem("molis-work:theme", S.theme); } catch { /* no storage */ }
    document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.resolvedTheme = S.theme;
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = tt[n.dataset.t]));
    for (const b of document.querySelectorAll("#scheme button")) b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme);
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    document.querySelector("#notes button").setAttribute("aria-pressed", S.notes);
    document.documentElement.toggleAttribute("data-show-new", S.notes);
    document.getElementById("schemecap").textContent = SCHEMES()[S.scheme];
    const sel = document.getElementById("scene"); sel.innerHTML = SCENES.map((v) => `<option value="${v}"${v === S.scene ? " selected" : ""}>${esc(SCENE_NAMES()[v])}</option>`).join("");
    const scroll = document.getElementById("sch-body")?.scrollTop ?? 0;
    const solo = !S.sideOpen;
    document.getElementById("app").innerHTML = `<div class="titlebar${solo ? " solo" : ""}" data-focus="${S.focus}">${tabs("main")}<span class="gutter-t"></span>${tabs("side")}</div>
      <div class="desk${solo ? " solo" : ""}" data-focus="${S.focus}"><section class="pane main${S.focus === "main" ? " focused" : ""}" aria-label="${L("主区", "Main")}">${page()}</section><div class="gutter" aria-hidden="true"></div><section class="pane side${S.focus === "side" ? " focused" : ""}" aria-label="${L("右栏", "Side pane")}">${sideBody()}</section></div>${bar()}${prepHtml()}`;
    const body = document.getElementById("sch-body"); if (body) body.scrollTop = scroll;
    save();
  }

  // ---------- A: the card beside its entry ----------
  function dropPop() { if (!pop) return; pop.el.remove(); pop = null; roomForSheet(0); }
  function closePop(restore = true) { if (!pop) return; const back = pop.back; dropPop(); S.help = null; if (restore) document.getElementById(back)?.focus(); syncExpanded(); save(); }
  // On a phone the card is a sheet over the lower page. The page gets that much extra room at its end, so the facts
  // and 「保存并启用」 can still be scrolled above the sheet while it is open (VUX-56).
  function roomForSheet(px) {
    const body = document.getElementById("sch-body"); if (!body) return;
    body.style.paddingBottom = px ? `calc(var(--help-sheet-gap) + ${px}px)` : "";
    body.style.scrollPaddingBottom = px ? px + "px" : "";
  }
  function openPop(topic, anchorId) {
    dropPop();
    const anchor = document.getElementById(anchorId);
    const el = document.createElement("div"); el.className = "hpop"; el.id = "help-region"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", L("帮助", "Help"));
    const short = topic === "who";
    el.setAttribute("data-board-new", S.lang === "zh" ? "帮助卡片" : NEW_EN["帮助卡片"]);
    el.innerHTML = `${helpHead("help-close", topic)}${short ? `<div class="hc" ${isNew("帮助内容")}>${TOPICS().page.sections.find((x) => x.id === "who").body}</div>` : helpBody("page", null, false)}${short || failed() ? "" : nextHtml()}<div class="hfoot"><span class="grow fact">Esc ${L("关闭", "closes")}</span>${btn("ghost", L("在右栏继续看", "Keep reading in the side pane"), `data-act="help-to-side" aria-label="${L("在右栏继续看", "Keep reading in the side pane")}"`, "sidebar")}</div>`;
    document.body.appendChild(el);
    // Beside the form column when there is room, so the card never covers the fields or the facts under them
    // (VUX-56); otherwise under its entry. On a phone the stylesheet turns it into a sheet above the bar.
    const r = anchor.getBoundingClientRect(), col = document.querySelector(".sch .inner")?.getBoundingClientRect();
    const room = col ? innerWidth - 8 - (col.right + 16) : 0;
    if (innerWidth > 760 && room >= 300 && room < el.offsetWidth) el.style.width = room + "px"; // narrower card rather than covering the form
    const w = el.offsetWidth, h = el.offsetHeight;
    let left = topic === "page" ? r.right - w : r.left, top = r.bottom + 6;
    if (col && innerWidth > 760 && col.right + 16 + w <= innerWidth - 8) { left = Math.max(col.right + 16, topic === "page" ? r.right - w : 0); top = topic === "page" ? r.bottom + 6 : r.top - 8; }
    if (top + h > innerHeight - 84) top = Math.max(48, innerHeight - 84 - h);
    left = Math.min(Math.max(8, left), innerWidth - w - 8);
    el.style.left = left + "px"; el.style.top = top + "px";
    if (innerWidth <= 760) { const b = document.getElementById("sch-body")?.getBoundingClientRect(); if (b) roomForSheet(Math.max(0, b.bottom - el.getBoundingClientRect().top)); }
    pop = { el, back: anchorId }; S.help = { topic, back: anchorId };
    syncExpanded(); save();
    el.setAttribute("tabindex", "-1"); el.focus();
  }
  function syncExpanded() {
    for (const id of ["help-entry", "who-entry"]) {
      const b = document.getElementById(id); if (!b) continue;
      b.setAttribute("aria-expanded", String(!!S.help && S.help.back === id && (S.scheme !== "B" || S.sideOpen)));
    }
  }

  // ---------- open / close for all schemes ----------
  function openHelp(topic, anchorId) {
    if (S.help && S.help.topic === topic && S.help.back === anchorId) return closeHelp();
    if (S.scheme === "A") { render(); return openPop(topic, anchorId); }
    S.help = { topic, back: anchorId };
    if (S.scheme === "B") { if (!S.sideOpen) S.sideForHelp = true; S.sideOpen = true; if (innerWidth <= 760) S.focus = "side"; }
    render();
    const region = document.getElementById("help-region");
    if (region) { region.setAttribute("tabindex", "-1"); region.focus({ preventScroll: S.scheme === "C" && topic === "page" ? false : true }); }
    if (S.scheme === "B" && topic === "who") document.getElementById("h-who")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function closeHelp() {
    if (pop) return closePop(true);
    if (!S.help) return;
    const back = S.help.back; S.help = null; putSideBack();
    render(); document.getElementById(back)?.focus();
  }

  // The side pane goes back to how it was before help opened it: closed if help opened it, otherwise left with its own tabs.
  function putSideBack() { if (S.sideForHelp) { S.sideOpen = false; S.sideForHelp = false; } S.focus = "main"; }

  // ---------- toast ----------
  function toast(msg) { document.querySelector(".mw-toast")?.remove(); const el = document.createElement("div"); el.className = "mw-toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3600); }

  // ---------- scenes ----------
  function applyScene(scene) {
    const keepTip = S.tipSkipped;
    S = { ...fresh(), scheme: S.scheme, lang: S.lang, theme: S.theme, scene, tipSkipped: scene === "first" ? false : keepTip };
    const smp = sample();
    if (scene !== "first") S.form = { name: smp.name, when: "mon9", what: smp.what, to: smp.to };
    if (scene === "ready") S.model = true;
    if (scene === "prepclosed") { S.prepLeft = true; }
    dropPop();
  }

  // Leaving preparation early keeps its progress and the task's draft (ONB-48); focus goes back to where it started.
  function leavePrep() { S.prepLeft = !!S.prep?.provider; const back = S.prep?.back; S.prep = null; if (S.prepLeft) S.scene = "prepclosed"; render(); (back === "facts" ? document.querySelector(".facts [data-act=prep]") : document.getElementById(back) || document.getElementById("help-entry"))?.focus(); }

  // ---------- events ----------
  document.addEventListener("input", (e) => { const k = e.target.dataset?.f; if (k) { S.form[k] = e.target.value; save(); } });
  document.addEventListener("change", (e) => {
    if (e.target.id === "scene") { applyScene(e.target.value); return render(); }
    const k = e.target.dataset?.f; if (k) { S.form[k] = e.target.value; save(); }
  });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set],[data-notes],#reset,#reopen");
    if (pop && !e.target.closest(".hpop") && !(b && (b.id === pop.back))) closePop(false);
    if (!b || b.disabled) return;
    if (b.id === "reset") { try { localStorage.removeItem(KEY); } catch { /* ignore */ } S = fresh(); applyScene("missing"); return render(); }
    if (b.id === "reopen") { dropPop(); S.prep = null; if (S.help) putSideBack(); S.help = null; render(); return toast(S.scene === "first" && S.tipSkipped ? L("重新打开：跳过的提示不再出现，「帮助」还在右上角", "Reopened: the skipped tip stays away; Help is still top right") : L("重新打开了这一页，填过的内容还在", "Reopened; what you filled in is still there")); }
    if (b.dataset.notes) { S.notes = !S.notes; return render(); }
    if (b.dataset.scheme) { dropPop(); S.scheme = b.dataset.scheme; S.help = null; S.sideOpen = false; S.focus = "main"; return render(); }
    if (b.dataset.lang) {
      dropPop();
      // The example text follows the language; anything the person typed stays as typed.
      const before = sample(); S.lang = b.dataset.lang; const after = sample();
      for (const k of ["name", "what", "to"]) if (S.form[k] === before[k]) S.form[k] = after[k];
      S.help = null; return render();
    }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; const had = pop && S.help; dropPop(); const h = S.help; render(); if (had) openPop(h.topic, h.back); return; }
    const a = b.dataset.act;
    switch (a) {
      case "help": e.preventDefault(); return openHelp(b.dataset.topic, b.id);
      case "help-close": e.stopPropagation(); return closeHelp();
      case "help-retry": S.helpRetried = true; if (pop) { const h = S.help; dropPop(); return openPop(h.topic, h.back); } return render();
      case "help-to-side": { const h = S.help; dropPop(); S.help = h; if (!S.sideOpen) S.sideForHelp = true; S.sideOpen = true; if (innerWidth <= 760) S.focus = "side"; render(); const r = document.getElementById("help-region"); r?.setAttribute("tabindex", "-1"); r?.focus(); return; }
      case "tip-skip": S.tipSkipped = true; render(); document.getElementById("help-entry")?.focus(); return toast(L("不再提示；随时点「帮助」都能找回", "Won't show again; Help is always there"));
      case "tip-see": { const smp = sample(); S.form = { name: smp.name, when: "mon9", what: smp.what, to: smp.to }; S.tipSkipped = true; render(); return toast(L("已填好一个例子，可以照着改", "An example is filled in; edit it as you like")); }
      case "prep": dropPop(); S.prep = { step: 1, from: b.dataset.from, provider: S.scene === "prepclosed" ? "MiniMax" : null, back: b.dataset.from === "facts" ? "facts" : S.help?.back || "help-entry" }; if (S.help) putSideBack(); S.help = null; render(); document.querySelector(".prep [data-act=pick-provider]")?.focus(); return;
      case "pick-provider": S.prep.provider = b.dataset.v; render(); document.getElementById("prep-primary")?.focus(); return;
      case "prep-check": S.prep.step = "done"; render(); document.getElementById("prep-primary")?.focus(); return;
      case "prep-back": S.prep = null; S.model = true; S.prepLeft = false; render(); document.getElementById("save")?.focus(); return toast(L("已连接 MiniMax-M3，回到刚才的定时任务", "MiniMax-M3 connected; back on your scheduled task"));
      case "prep-leave": return leavePrep();
      case "save": return toast(L("已启用「" + (S.form.name || sample().name) + "」，下次 11月10日 周一 09:00", "“" + (S.form.name || sample().name) + "” is on; next run Mon Nov 10, 09:00"));
      case "draft": return toast(L("已存为草稿，不会按时运行", "Saved as a draft; it won't run on time"));
      case "side-toggle": S.sideOpen = !S.sideOpen; S.sideForHelp = false; if (!S.sideOpen) { if (S.help && !pop) S.help = null; S.focus = "main"; } return render();
      case "side-close": S.sideOpen = false; S.sideForHelp = false; S.focus = "main"; if (S.help && !pop) { const back = S.help.back; S.help = null; render(); return document.getElementById(back)?.focus(); } return render();
      case "focus": S.focus = b.dataset.v; return render();
      case "sim": return toast(b.dataset.l + L("（原型里不走）", " (not in this prototype)"));
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (S.prep) { e.preventDefault(); return leavePrep(); }
    if (S.help) { e.preventDefault(); closeHelp(); }
  });
  addEventListener("resize", () => { if (pop) { const h = S.help; dropPop(); openPop(h.topic, h.back); } });

  let stored = null; try { stored = localStorage.getItem(KEY); } catch { /* no storage */ }
  if (!stored) applyScene("missing");
  // ?lang= may have changed the language since the example was filled in; the example follows it.
  { const cur = S.lang; S.lang = cur === "zh" ? "en" : "zh"; const other = sample(); S.lang = cur; const now = sample();
    for (const k of ["name", "what", "to"]) if (S.form[k] === other[k]) S.form[k] = now[k]; }
  // A reload starts with help closed; what was typed and the scene are kept.
  S.help = null; S.prep = null; if (S.sideForHelp) { S.sideOpen = false; S.sideForHelp = false; }
  render();
})();
