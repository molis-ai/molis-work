// 04 · Onboarding full journey, drawn in the immersive arrival frame Molis Work shows when it first opens.
// Layout explains; words are kept to the question, the answer and what is essential (privacy, failures).
// All data is sample data (data.js); timers stand in for reading, model calls and adoption.
// Nothing reads a folder, calls a model, stores a key or touches a Home.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.protoIcons;
  const app = document.getElementById("app");
  const KEY = "molis-proto.onboarding-full-journey.v3";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pickDefaults = () => Object.fromEntries(D.locations.flatMap((l) => l.children.map((c) => [c.id, c.pick])));
  const fresh = (keep = {}) => ({
    scenario: "first", fault: "none", lang: "zh", theme: "light",
    ...keep,
    step: null, max: 0, typed: false, look: "light", goal: "", start: "materials", picks: pickDefaults(), open: { docs: true, dl: false, desk: false },
    detail: null, scanStopped: false, provider: "deepseek", checking: false, connected: false, modelOk: null, keyRefused: false, deferred: false,
    read: "idle", readSig: null, delta: null, failCleared: false, retryIn: 0, fullPdf: false,
    answers: { audience: null, channel: null, review: null, cadence: null }, resChoice: null, depPreview: false,
    adopt: {}, adopting: false, adopted: false, schedRetried: false, work: "idle", personal: false,
    help: null, dismissResume: false, origin: true, returned: false, wdPick: "website", wdOk: false, wdConsent: false, flash: null,
  });
  let S = null;
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.v === 3) return { ...fresh(), ...v.s }; } catch { /* preview without storage */ }
    return init(fresh());
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 3, s: S })); } catch { /* preview without storage */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (n) => n.toLocaleString(S.lang === "zh" ? "zh-CN" : "en-US");
  const st = (kind, text) => {
    const icon = { done: "status-done", fail: "status-blocked", todo: "dot", wait: "status-waiting" }[kind];
    return `<span class="st ${kind}">${kind === "run" ? '<span class="spin" aria-hidden="true"></span>' : ic(icon, "sm")}${text}</span>`;
  };
  const tile = (icon, hue, cls = "") => `<span class="tile ${cls}" style="--hue:var(--hue-${hue})" aria-hidden="true">${ic(icon, "sm")}</span>`;
  const projName = () => (S.scenario === "addscene" ? "产品研究" : S.scenario === "fromhelp" ? "官网改版" : "AI 产品观察");
  const sceneName = () => L("每周 AI 产品观察", "Weekly AI product watch");
  const goalText = () => S.goal.trim() || T(D.goalSuggestions[0]);
  const BRAND = `<span class="a-brand"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4.5"/><circle cx="8" cy="15.5" r="4.5"/><circle cx="16" cy="15.5" r="4.5"/></svg>Molis Work</span>`;
  const SHORT = { lang: ["语言", "Language"], look: ["外观", "Look"], goal: ["目的", "Goal"], materials: ["材料", "Materials"], model: ["模型", "Model"], read: ["整理", "Summary"], ask: ["补问", "Questions"], plan: ["方案", "Plan"], adopt: ["采用", "Adopt"], workdir: ["文件夹", "Folder"], back: ["回去", "Return"] };

  // ---------- Journey model ----------
  function journey() {
    if (S.start === "blank") return ["goal"];
    let f = S.scenario === "addscene" ? ["goal", "materials", "ask", "plan", "adopt"] : ["goal", "materials", "model", "read", "ask", "plan", "adopt"];
    if (S.start === "goal") f = f.filter((x) => x !== "materials" && x !== "read");
    return f;
  }
  function flow() {
    if (S.scenario === "fromhelp") return ["model", "workdir", "back"];
    return S.scenario === "first" ? ["opening", "lang", "look", ...journey()] : journey();
  }
  function init(s) {
    S = s;
    S.modelOk = S.scenario === "newproj" || S.scenario === "addscene";
    if (S.scenario === "fromhelp") { S.step = "model"; S.origin = true; return S; }
    S.step = S.scenario === "first" ? "opening" : "goal";
    if (S.fault === "resume") {
      S.typed = true; S.goal = T(D.goalSuggestions[0]);
      if (S.scenario !== "addscene") { S.modelOk = true; S.read = "done"; S.readSig = sig(); }
      S.step = "ask"; S.max = flow().indexOf("ask");
    }
    return S;
  }
  const idx = (id) => flow().indexOf(id);
  function stepState(id) {
    const i = idx(id), cur = idx(S.step);
    if (id === S.step) return "cur";
    if (i < cur || i <= S.max) {
      if (i > cur) return "reached";
      if (id === "model" && S.deferred) return "wait";
      if (id === "read" && (S.read === "fail" || S.deferred)) return "wait";
      return "done";
    }
    return "todo";
  }
  function go(id, opts = {}) {
    S.step = id; S.help = null;
    S.max = Math.max(S.max, idx(id));
    if (id === "read" && !opts.keep) enterRead();
    if (id === "adopt" && !S.adopted && !S.adopting) startAdopt();
    focusAfter = "h1";
  }
  function arrive() { S.step = "work"; S.help = null; focusAfter = "h1"; }
  function advance() {
    if (S.step === "goal" && S.start === "blank") { arrive(); return; }
    if (S.step === "materials" && flow().includes("read") && (S.modelOk || S.deferred)) { go("read"); return; }
    const f = flow(), i = f.indexOf(S.step);
    if (i < f.length - 1) go(f[i + 1]); else arrive();
  }
  function back() { const f = flow(), i = f.indexOf(S.step); if (i > 0) go(f[i - 1], { keep: true }); }

  // ---------- Materials ----------
  const all = () => D.locations.flatMap((l) => l.children.map((c) => ({ ...c, loc: l.id })));
  function counts() {
    let n = 0, img = 0, bad = 0, dup = 0; const locs = new Set();
    for (const c of all()) {
      if (!S.picks[c.id]) continue;
      if (c.dupOf && S.picks[c.dupOf]) { dup += 1; continue; }
      const k = c.n || 1; n += k; locs.add(c.loc);
      if (c.kind === "image") img += k; if (c.kind === "unreadable") bad += k;
    }
    return { n, img, bad, text: n - img - bad, dup, locs: locs.size };
  }
  function sig() { return all().filter((c) => S.picks[c.id]).map((c) => c.id).join(","); }
  function locPick(l) { const on = l.children.filter((c) => S.picks[c.id]).length; return on === 0 ? "none" : on === l.children.length ? "all" : "some"; }

  // ---------- Simulated work ----------
  let timers = [];
  const later = (ms, fn) => { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); render(); }, ms); timers.push(t); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const failing = () => S.fault.startsWith("fail_") && !S.failCleared;
  function enterRead() {
    if (!S.modelOk && !S.deferred) return;
    const now = sig();
    if (S.read === "done" && S.readSig === now) return;
    if (S.readSig && S.readSig !== now) {
      const before = new Set(S.readSig.split(",")), after = new Set(now.split(","));
      S.delta = { added: [...after].filter((x) => !before.has(x)).length, removed: [...before].filter((x) => !after.has(x)).length };
    }
    S.read = "reading";
    later(900, () => {
      S.readSig = sig();
      if (S.deferred) { S.read = "deferred"; return; }
      S.read = "gen";
      later(1400, () => { S.read = failing() ? "fail" : "done"; if (S.read === "done") S.readSig = sig(); announce(S.read === "done" ? L("整理好了", "Summary ready") : L("整理没成功，材料已读好", "Summary failed; materials are read")); });
    });
  }
  function retryRead() { S.failCleared = true; S.read = "gen"; later(1300, () => { S.read = "done"; S.readSig = sig(); }); }
  function cadenceText() {
    return { weekly: L("每周一 9:00", "Mondays 9:00"), biweekly: L("每两周", "Every 2 weeks") }[S.answers.cadence || "weekly"] || L("每周一 9:00", "Mondays 9:00");
  }
  function adoptItems() {
    const it = [];
    if (S.fault === "missing_dep") it.push({ id: "install", icon: "download", hue: "violet", label: L("安装 Feed", "Install Feed") });
    if (S.scenario !== "addscene") it.push({ id: "project", icon: "folder", hue: "blue", label: L(`新建项目「${projName()}」`, `Create “${projName()}”`) });
    else it.push({ id: "keep", icon: "lock", hue: "slate", label: L("原有资料、成员和首页不动", "Existing materials, members and home untouched"), keep: true });
    if (S.scenario !== "addscene" && S.start !== "goal") it.push({ id: "mat", icon: "folder-open", hue: "amber", label: S.read === "done" ? L(`带入 ${counts().n} 份材料和摘要`, `Bring in ${counts().n} materials and the summary`) : L(`带入 ${counts().n} 份材料`, `Bring in ${counts().n} materials`) });
    it.push({ id: "brief", icon: "note", hue: "green", label: L("写项目说明", "Write the description") });
    it.push({ id: "members", icon: "user", hue: "indigo", label: S.resChoice === "reuse" ? L("加编辑，沿用研究员", "Add editor, reuse researcher") : L("加研究员和编辑", "Add researcher and editor") });
    it.push({ id: "feed", icon: "rows", hue: "teal", label: L("启用 Feed", "Turn on Feed") });
    if (S.answers.cadence !== "ondemand") it.push({ id: "sched", icon: "clock", hue: "rose", label: L(`安排${cadenceText()}`, `Schedule ${cadenceText()}`) });
    it.push({ id: "send", icon: "send", hue: "slate", label: L("对外发送", "Sending outside"), off: true });
    return it;
  }
  function startAdopt() {
    S.adopting = true;
    const items = adoptItems().filter((x) => !x.off && !x.keep);
    items.forEach((x) => { if (S.adopt[x.id] !== "done") S.adopt[x.id] = "todo"; });
    let t = 350;
    for (const x of items) {
      if (S.adopt[x.id] === "done") continue;
      later(t, () => { S.adopt[x.id] = "run"; });
      t += 650;
      later(t, () => { S.adopt[x.id] = x.id === "sched" && S.fault === "adopt_partial" && !S.schedRetried ? "fail" : "done"; });
    }
    later(t + 50, () => { S.adopting = false; S.adopted = true; announce(L("采用结束", "Adoption finished")); });
  }
  function announce(msg) { document.getElementById("live").textContent = msg; }
  let toastTimer = null;
  function toast(msg) { document.querySelectorAll(".toast").forEach((x) => x.remove()); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.append(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3200); }

  // ---------- Help: the longer explanations live one tap away, never on the page ----------
  const HELP = () => ({
    goal: L("先说目的，我只问会影响结果、费用或权限的几件事。每一步都能从底栏回去改；关掉窗口，下次从这里接着走。也可以不建项目，直接在个人空间用。", "Say the goal; I only ask what changes the result, cost or permissions. Revisit any step from the bar; close the window and you continue from here. You can also skip the project and use your personal space."),
    materials: L("只读勾选的，原文件不改。读到的文字存在这台 Mac 的这个项目里；整理时把选中文字交给你选的模型，图片只留引用。隐藏文件、node_modules、.git 默认不读。停止读取在 设置 › 本机目录，导出或删除在 设置 › 数据与存储。", "Only ticked items are read; originals stay unchanged. Read text is stored on this Mac in this project; for the summary, ticked text goes to your model, images stay references. Hidden files, node_modules and .git are skipped. Stop reading in Settings › Folders; export or delete in Settings › Data and storage."),
    model: L("读文件不用模型；整理、补问和方案要用。用你自己的账号，费用记在那里，每次调用都在「调用记录」里。这里和 设置 › 模型 是同一份。密钥只存在这台 Mac 的钥匙串里，不进方案，也不随导出带走。", "Reading needs no model; the summary, questions and plan do. It runs on your own account, billed there; every call shows in Call history. Same setting as Settings › Model. The key stays in this Mac's Keychain — never in a plan or export."),
    read: L("先把选中的文字读进来、存好，再交给模型整理。每句后面的标记指向出处。整理失败不影响已读好的材料。", "Ticked text is read and saved first, then summed up. Each line's tag points to its source. A failed summary doesn't affect what's read."),
    ask: L("「给谁看」决定要不要连外部服务、要不要授权发送；「多久一份」决定要不要排定时。回答只用于这套做法，不写成你的个人偏好。", "“Who reads it” decides outside services and send permission; “how often” decides a schedule. Answers apply to this way of working only."),
    plan: L("现在什么都没改。采用后每一项交给它真正的主人保存，一项一项出结果；哪项没成就停在那项，已生效的不重复建。", "Nothing has changed yet. Adopting hands each item to its real owner, one result at a time; a failure stops there and nothing is created twice."),
    adopt: L("中途关掉没关系：重新打开从没完成的那项接着做，结果不确定的先核对。", "Closing midway is fine: reopening continues from the unfinished item and checks any uncertain one first."),
    work: L("「做法已配好」不等于第一期写好了。点开始后研究员和编辑才干活。", "Set up isn't the same as written. The researcher and editor start when you press Start."),
    workdir: L("资料文件夹只读；工作目录是 Coding 能改文件、跑命令的地方，一个项目一个。", "Material folders are read-only; the working folder is where Coding may change files and run commands — one per project."),
    origin: L("Coding 要一个能改的文件夹，还要一个模型来想怎么改。补齐后回来，你写的那句还在。", "Coding needs a folder it may change and a model to plan with. Your sentence is kept while you fill them in."),
    back: L("模型存在 设置 › 模型；工作目录存在 项目设置 › 输入与输出。", "The model lives in Settings › Model; the folder in Project settings › Inputs and output."),
  });
  const helpBtn = (id) => `<button class="help-btn" data-act="help" data-arg="${id}" aria-expanded="${S.help === id}" data-help-for="${id}" aria-label="${L("说明", "Help")}">${ic("question", "sm")}</button>`;
  const helpBox = (id) => (S.help === id ? `<div class="help-pop" role="note">${HELP()[id]}</div>` : "");
  // The assistant asks: its mark sits beside every question. No caption — the mark is the company.
  const head = (title, id) => `<div class="w-head"><span class="g-av" aria-hidden="true">${ic("sparkles")}</span><h1 tabindex="-1">${title}</h1>${id ? helpBtn(id) : ""}</div>${id ? helpBox(id) : ""}`;
  const safe = (text) => `<p class="safe">${ic("lock", "sm")}<span>${text}</span></p>`;

  // ---------- The project taking shape (right side of the conversation steps) ----------
  const NOW = { goal: ["goal"], materials: ["mat"], model: ["model"], read: ["sum"], ask: ["audience", "cadence"], plan: ["who", "home"] };
  function forming() {
    const c = counts(), a = S.answers, now = NOW[S.step] || [];
    const reached = (id) => idx(id) !== -1 && idx(id) <= idx(S.step);
    const R = [];
    const row = (key, icon, hue, k, v, extra = "") => R.push({ key, icon, hue, k, v, extra });
    row("goal", "target", "blue", L("目的", "Goal"), S.goal.trim() ? esc(S.goal) : "");
    if (S.start === "materials") row("mat", "folder", "amber", L("材料", "Materials"), reached("materials") ? L(`${fmt(c.n)} 份`, `${fmt(c.n)} items`) : "");
    if (S.scenario !== "addscene") row("model", "sparkles", "violet", L("模型", "Model"), S.modelOk && !S.keyRefused ? "DeepSeek" : S.deferred ? L("稍后", "Later") : "");
    if (flow().includes("read")) row("sum", "note", "green", L("整理", "Summary"), { done: L("3 条待办", "3 to-dos"), deferred: L("稍后", "Later") }[S.read] || "", S.read === "reading" || S.read === "gen" ? '<span class="spin"></span>' : S.read === "fail" ? ic("alert", "sm warn-ic") : "");
    const aud = { me: L("自己", "Me"), team: a.channel === "slack" ? "Slack" : a.channel === "feishu" ? L("飞书", "Feishu") : L("团队", "Team"), public: L("公开", "Public") }[a.audience];
    row("audience", "send", "teal", L("给谁看", "Reader"), aud || "");
    row("cadence", "clock", "rose", L("多久", "How often"), a.cadence ? (a.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText()) : "");
    const team = idx("ask") !== -1 && idx(S.step) >= idx("ask");
    row("who", "user", "indigo", L("谁来做", "Who"), team ? `<span class="avs">${D.members.filter((m) => !m.existing).map((m) => `<span style="--hue:${m.hue}" title="${esc(T(m.name))}">${T(m.av)}</span>`).join("")}</span>` : "");
    row("home", "home", "slate", L("首页", "Home"), team ? `<span class="tag sim">${L("占位", "Placeholder")}</span>` : "");
    const filled = R.filter((r) => r.v).length;
    const pct = Math.round((filled / R.length) * 100);
    const title = S.scenario === "addscene" ? "产品研究" : S.goal.trim() ? projName() : "";
    return `<div class="forming" role="region" aria-label="${L(`项目草稿，已就绪 ${filled} / ${R.length}`, `Project draft, ${filled} of ${R.length} ready`)}">
      <div class="fm-head"><span class="fm-mark ${title ? "" : "empty"}" aria-hidden="true">${title ? title.slice(0, 1) : ic("plus")}</span><b class="${title ? "" : "ph"}">${title || L("新项目", "New project")}</b>
        <span class="ring" style="--p:${pct}" aria-hidden="true"><span>${filled}/${R.length}</span></span></div>
      <div class="fm-rows">${R.map((r) => `<div class="fm-row ${now.includes(r.key) ? "is-now" : ""} ${r.v ? "is-set" : ""} ${S.flash === r.key ? "flash" : ""}">${tile(r.icon, r.v || now.includes(r.key) ? r.hue : "mute")}<span class="k">${r.k}</span><span class="v">${r.v || '<span class="slot"></span>'}</span>${r.extra}</div>`).join("")}</div></div>`;
  }
  function codingMini(ready) {
    const typed = L("按品牌指南把首屏改成一句主张加一个主按钮", "Make the hero one statement and one main button, per the brand guide");
    return `<div class="cmini" role="img" aria-label="${L("Coding：你写的那句留在输入框里", "Coding: your sentence stays in the input")}"><div class="pg">
      <div class="ln">${tile("sparkles", "violet")}<span class="nm">${L("模型", "Model")}</span>${S.modelOk ? st("done", "DeepSeek") : st("fail", "—")}</div>
      <div class="ln">${tile("folder", "amber")}<span class="nm">${L("工作目录", "Working folder")}</span>${S.wdOk ? st("done", S.wdPick === "website" ? "website" : "brand-assets") : st("fail", "—")}</div></div>
      <div class="cp"><span>${esc(typed)}</span><i class="${ready ? "ready" : ""}">${ic("send", "sm")}</i></div></div>`;
  }

  // ---------- Steps ----------
  const radio = (act, val, cur, label, icon, hue) => `<button class="opt" role="radio" aria-checked="${cur === val}" data-act="${act}" data-arg="${val}">${icon ? tile(icon, hue) : ""}<span class="o-t">${label}</span><span class="o-dot" aria-hidden="true"></span></button>`;
  function stepLang() {
    return { light: true, decor: true,
      left: `${head(L("语言", "Language"))}<div class="opts col" role="radiogroup" aria-label="${L("语言", "Language")}">${radio("lang-set", "zh", S.lang, "简体中文", "globe", "blue")}${radio("lang-set", "en", S.lang, "English", "globe", "teal")}</div>`,
      right: `<div class="greet"><strong lang="${S.lang}">${L("你好。", "Hello.")}</strong></div>`,
      primary: { label: L("继续", "Continue"), act: "next" } };
  }
  function stepLook() {
    return { light: true, decor: true,
      left: `${head(L("外观", "Appearance"))}<div class="opts col" role="radiogroup" aria-label="${L("外观", "Appearance")}">${radio("look-set", "light", S.look, L("浅色", "Light"), "sun", "amber")}${radio("look-set", "dark", S.look, L("深色", "Dark"), "moon", "indigo")}${radio("look-set", "system", S.look, L("跟随系统", "System"), "settings", "slate")}</div>`,
      right: `<div class="mini"><div class="mini-s"><b></b>${[[62, 40, "blue"], [48, 58, "amber"], [70, 36, "green"]].map(([w, s2, h]) => `<div class="mini-r"><i style="--hue:var(--hue-${h})"></i><span><b style="width:${w}%"></b><s style="width:${s2}%"></s></span></div>`).join("")}</div><div class="mini-bar"><i></i><em></em><u></u></div></div>`,
      primary: { label: L("继续", "Continue"), act: "next" } };
  }
  function stepGoal() {
    const add = S.scenario === "addscene";
    const empty = !S.goal.trim() && S.start !== "blank";
    const title = add ? L("这套做法要做成什么？", "What should this way of working do?") : S.scenario === "first" ? L("你想先做成什么？", "What would you like to get done first?") : L("新项目要做成什么？", "What should the new project do?");
    const starts = add ? "" : `<div class="opts seg3" role="radiogroup" aria-label="${L("从哪里开始", "Where to start")}">
      ${radio("start", "materials", S.start, L("从已有材料", "From materials"), "folder-open", "amber")}${radio("start", "goal", S.start, L("先说目标", "Goal first"), "target", "blue")}${radio("start", "blank", S.start, L("空白", "Blank"), "file", "slate")}</div>`;
    return {
      left: `${head(title, "goal")}
        <div class="ask-box"><input class="big-input" id="goal" autocomplete="off" aria-label="${L("目的", "Goal")}" placeholder="${L("每周跟踪 AI 产品，形成一份观察", "Track AI products weekly and write an observation")}" value="${esc(S.goal)}">
        <div class="chips-row" role="group" aria-label="${L("例子", "Examples")}">${D.goalSuggestions.map((g) => `<button class="chip" data-act="suggest" data-arg="${esc(T(g))}">${ic("plus", "sm")}${T(g)}</button>`).join("")}</div></div>
        ${starts}${S.scenario === "first" ? `<button class="quiet-link" data-act="personal">${L("先不建项目", "Skip the project for now")}${ic("arrow", "sm")}</button>` : ""}`,
      right: forming(),
      primary: { label: S.start === "blank" ? L("建空项目", "Create empty project") : L("继续", "Continue"), act: "next", disabled: empty, reason: L("先写一句目的", "Write the goal first") },
    };
  }
  function fileRow(c, l) {
    const name = T(c.name);
    let tag = "";
    if (c.kind === "image") tag = `<span class="tag">${L(`${c.n} 张 · 只留引用`, `${c.n} · references`)}</span>`;
    else if (c.kind === "unreadable") tag = `<span class="tag warn">${L("读不了正文", "Text unreadable")}</span>`;
    else if (c.kind === "longpdf") tag = `<span class="tag warn">${S.fullPdf ? L(`全读 ${c.pages} 页`, `All ${c.pages} pages`) : L("读前 20 页", "First 20 pages")}</span>`;
    else if (c.dupOf && S.picks[c.dupOf] && S.picks[c.id]) tag = `<span class="tag">${L("重复", "Duplicate")}</span>`;
    else tag = `<span class="fact">${c.n ? fmt(c.n) : c.size}</span>`;
    if (c.kind === "rest") return `<div class="fr rest"><input type="checkbox" data-act="pick" data-arg="${c.id}" ${S.picks[c.id] ? "checked" : ""} aria-label="${esc(name)}"><span class="nm">${L(`其余 ${fmt(c.n)} 项`, `${fmt(c.n)} more`)}</span><button class="btn sm sec" data-act="toast" data-arg="${esc(L("大清单分页显示，可以搜索、逐项勾选（原型不展开）", "Long lists page in with search (not built)"))}">${L("显示", "Show")}</button></div>`;
    const detail = S.detail === c.id ? `<div class="fr-detail">${c.kind === "longpdf" ? `<span>${L(`共 ${c.pages} 页，默认先读前 20 页。`, `${c.pages} pages; the first 20 are read by default.`)}</span><button class="btn sm sec" data-act="fullpdf">${S.fullPdf ? L("只读前 20 页", "First 20 only") : L(`读全部 ${c.pages} 页`, `Read all ${c.pages}`)}</button>` : c.kind === "unreadable" ? L("Keynote 正文现在读不了，原件留在原处；导出成 PDF 再加进来就能读。", "Keynote text can't be read; the original stays. Export to PDF to include it.") : c.kind === "image" ? L("图片不读文字，项目里只留引用。", "Images aren't read as text; references are kept.") : `<code>${l.path}/${esc(name)}</code>${c.dupOf ? ` · ${L("另一个位置也有，只算一次", "also elsewhere, counted once")}` : ""}`}</div>` : "";
    return `<div class="fr"><input type="checkbox" data-act="pick" data-arg="${c.id}" ${S.picks[c.id] ? "checked" : ""} aria-label="${esc(name)}">${ic(c.folder ? "folder" : c.kind === "image" ? "image" : "file", "sm")}<button class="nm" data-act="detail" data-arg="${c.id}" aria-expanded="${S.detail === c.id}">${esc(name)}</button>${tag}</div>${detail}`;
  }
  function stepMaterials() {
    const c = counts();
    const scanning = S.fault === "scanning";
    const add = S.scenario === "addscene";
    const narrowed = S.fault === "fail_timeout" && S.read === "fail" ? `<div class="alert warn">${ic("alert", "sm")}<span>${S.picks.gartner ? L("上次整理超时。少勾一点再继续，读好的不会重读。", "The last summary timed out. Tick less and continue; nothing read is read again.") : L("上次整理超时，已去掉「Gartner AI Agents 2026.pdf」（1.1 MB）。读好的不会重读。", "The last summary timed out; “Gartner AI Agents 2026.pdf” (1.1 MB) is now unticked. Nothing read is read again.")}</span></div>` : "";
    const locs = D.locations.map((l) => {
      const p = locPick(l), open = S.open[l.id];
      const isScan = scanning && l.id === "dl" && !S.scanStopped;
      const count = isScan ? `<span class="st run"><span class="spin"></span>${fmt(l.scanFound)}…</span><button class="btn sm sec" data-act="scan-stop">${L("停止", "Stop")}</button>`
        : scanning && l.id === "dl" ? `<span class="st wait">${ic("pause", "sm")}${fmt(l.scanFound)}</span><button class="btn sm sec" data-act="scan-resume">${L("继续", "Resume")}</button>`
        : `<span class="count-badge">${fmt(l.total)}</span>`;
      return `<div class="loc ${p !== "none" ? "on" : ""}"><div class="loc-h"><input type="checkbox" data-act="pick-loc" data-arg="${l.id}" ${p === "all" ? "checked" : ""} ${p === "some" ? 'data-mixed="1"' : ""} aria-label="${esc(T(l.name))}"><button class="twist" data-act="open" data-arg="${l.id}" aria-expanded="${!!open}" aria-label="${open ? L("收起", "Collapse") : L("展开", "Expand")} ${esc(T(l.name))}">${ic("chevron-right", "sm")}</button>${tile("folder", "amber")}<span class="nm"><strong>${esc(T(l.name))}</strong><span class="fact">${l.path}</span></span>${count}</div>
        ${open ? `<div class="loc-b">${l.children.map((ch) => fileRow(ch, l)).join("")}${isScan ? `<div class="fr"><span class="spin"></span><span class="nm" style="color:var(--muted)">${L("还在往下找…", "Still looking…")}</span></div>` : ""}</div>` : ""}</div>`;
    }).join("");
    return {
      left: `${head(add ? L("还要加材料吗？", "Add more materials?") : L("带上哪些材料？", "Which materials come along?"), "materials")}${narrowed}
        <div class="count"><b>${fmt(c.n)}</b><span>${L(`份 · ${c.locs} 个位置`, `items · ${c.locs} locations`)}</span>${c.dup ? `<em>${L(`重复 ${c.dup} 份只算一次`, `${c.dup} duplicates counted once`)}</em>` : ""}</div>
        <div class="acts"><button class="btn sec" data-act="toast" data-arg="${esc(L("会打开系统的选文件夹窗口（原型不展开）", "Opens the folder picker (not built)"))}">${ic("plus", "sm")}${L("添加位置", "Add location")}</button><button class="btn sec" data-act="toast" data-arg="${esc(L("会打开系统的选文件窗口（原型不展开）", "Opens the file picker (not built)"))}">${ic("paperclip", "sm")}${L("添加文件", "Add files")}</button></div>
        ${safe(L("只读勾选的，原文件不改", "Only ticked items are read; originals stay unchanged"))}`,
      right: `<div class="card tree" role="group" aria-label="${L("材料", "Materials")}">${locs}</div>`,
      primary: { label: add ? L("继续", "Continue") : S.modelOk ? L("开始整理", "Start the summary") : L("继续", "Continue"), act: "next", disabled: c.n === 0, reason: L("至少勾一份", "Tick at least one") },
    };
  }
  function stepModel() {
    const fromHelp = S.scenario === "fromhelp";
    const ok = S.modelOk && !S.keyRefused;
    const live = ok || S.connected;
    const c = counts();
    const from = fromHelp ? [tile("code", "blue", "lg"), "Coding"] : [tile("folder", "amber", "lg"), L(`${fmt(c.n)} 份材料`, `${fmt(c.n)} materials`)];
    const right = `<div class="bridge" role="img" aria-label="${live ? L("已连上模型", "Model connected") : L("还没有模型", "No model yet")}"><div class="node">${from[0]}<b>${from[1]}</b></div><div class="wire ${live ? "live" : ""}"></div><div class="node ${live ? "" : "off"}">${live ? tile("sparkles", "violet", "lg") : `<span class="tile lg ghost">?</span>`}<b>${live ? "DeepSeek" : L("模型", "Model")}</b></div></div>`;
    if (ok) {
      return { right,
        left: `${head(L("用这个模型", "Use this model"), "model")}<div class="panel"><div class="ln">${tile("sparkles", "violet")}<span class="nm">DeepSeek · deepseek-chat</span>${st("done", "")}<button class="btn sm sec" data-act="model-change">${L("更换", "Switch")}</button></div></div>`,
        primary: { label: fromHelp ? L("继续", "Continue") : L("开始整理", "Start the summary"), act: "next" } };
    }
    const refused = S.keyRefused ? `<div class="alert err">${ic("alert", "sm")}<span>${L("上次的密钥被拒绝了（401）。换一把，或换个提供方；材料不用重读。", "The last key was refused (401). Use another key or provider; materials aren't read again.")}</span></div>` : "";
    return { right,
      left: `${head(L("连一个模型", "Connect a model"), "model")}${refused}
        <div class="panel form"><label class="fl"><span>${L("提供方", "Provider")}</span><select class="fld" id="prov" data-act="prov"><option value="deepseek" ${S.provider === "deepseek" ? "selected" : ""}>DeepSeek</option><option value="openai" ${S.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="anthropic" ${S.provider === "anthropic" ? "selected" : ""}>Anthropic</option><option value="minimax" ${S.provider === "minimax" ? "selected" : ""}>MiniMax</option></select></label>
          <label class="fl"><span>${L("密钥", "API key")}</span><input class="fld" id="key" type="password" autocomplete="off" placeholder="sk-…"></label>
          <div class="acts"><button class="btn sec" data-act="check" ${S.checking ? "disabled" : ""}>${L("检查连接", "Check")}</button>${S.checking ? st("run", "") : S.connected ? st("done", L("已连接", "Connected")) : ""}</div></div>
        ${safe(L("密钥只存在这台 Mac 的钥匙串里", "The key stays in this Mac's Keychain"))}
        ${!fromHelp ? `<button class="quiet-link" data-act="defer">${L("先不连", "Not now")}${ic("arrow", "sm")}</button>` : ""}`,
      primary: { label: S.keyRefused ? L("回到整理", "Back to the summary") : fromHelp ? L("继续", "Continue") : L("开始整理", "Start the summary"), act: "model-done", disabled: !S.connected, reason: L("先检查连接", "Check the connection first") } };
  }
  function summaryHtml() {
    const cite = (t) => `<span class="cite">${t}</span>`;
    return `<div class="summary">
      <section>${tile("history", "blue")}<div><h3>${L("背景", "Background")}</h3><p>${L("你从 9 月起每两周写一次 AI 产品观察，跟 14 个订阅源和几份行业报告。", "Since September you write an AI product observation every two weeks, following 14 feeds and a few reports.")} ${cite("订阅源.opml")}</p></div></section>
      <section>${tile("status-progress", "amber")}<div><h3>${L("进展", "Progress")}</h3><p>${L("10-27 那期停在「代理产品定价」；周会定了下期加竞品表。", "The 10-27 issue stopped at “agent pricing”; next issue adds the competitor table.")} ${cite("周会 10-28.md")}${S.picks.gartner ? ` ${cite("Gartner p.12")}` : ""}</p></div></section>
      <section>${tile("check", "green")}<div><h3>${L("下一步", "Next")}</h3>
        <ul class="todo"><li><span>${L("补完定价一节", "Finish the pricing section")}</span>${cite("10-27 观察.md")}</li><li><span>${L("竞品表加 3 家", "Add 3 to the competitor table")}</span>${cite("竞品表.xlsx")}</li><li><span>${L("放进「试用转付费」", "Add “trial to paid”")}</span>${cite("访谈纪要-李.docx")}</li></ul></div></section></div>`;
  }
  function stepRead() {
    const c = counts(), r = S.read;
    const p1 = r !== "reading" && r !== "idle";
    const phase = (state, icon, hue, text, sub = "") => `<div class="phase2 ${state}">${state === "run" ? '<span class="tile run"><span class="spin"></span></span>' : tile(icon, hue)}<span class="nm">${text}</span>${sub}</div>`;
    let failBlock = "";
    if (r === "fail") {
      const FS = {
        fail_auth: [L("密钥被拒绝了", "The key was refused"), L("可能过期了，或复制时少了字符。", "It may have expired or been copied short."), `<button class="btn primary" data-act="key-refused">${L("更新密钥", "Update key")}</button>`, "HTTP 401 · invalid_api_key · call 7f3a-21c9"],
        fail_limit: [L("额度用完或请求太频繁", "Quota used up or too many requests"), S.retryIn ? L(`${S.retryIn} 秒后自动重试…`, `Retrying in ${S.retryIn}s…`) : L("约 1 分钟后能再试。", "Try again in about a minute."), S.retryIn ? `<button class="btn sec" data-act="retry-cancel">${L("取消", "Cancel")}</button>` : `<button class="btn primary" data-act="retry-wait">${L("1 分钟后重试", "Retry in 1 min")}</button><button class="btn sec" data-act="key-refused">${L("换个模型", "Switch model")}</button>`, "HTTP 429 · rate_limit_exceeded · retry-after 60"],
        fail_timeout: [L("等了 90 秒没有返回", "No answer after 90 s"), L("这次约 1.9 MB，其中一份 PDF 占 1.1 MB。", "About 1.9 MB was sent; one PDF is 1.1 MB."), `<button class="btn primary" data-act="narrow">${L("少选一点", "Send less")}</button><button class="btn sec" data-act="retry">${L("重试", "Retry")}</button>`, "timeout 90s · request 1.9 MB · call 7f3a-21cb"],
      };
      const F = FS[S.fault] || FS.fail_timeout;
      failBlock = `<div class="alert err block" role="alert">${ic("alert", "sm")}<div><b>${F[0]}</b><p>${F[1]}</p><div class="acts">${F[2]}<button class="btn ghost" data-act="defer-after-fail">${L("先往下走", "Carry on")}</button></div><details class="tech"><summary>${L("技术细节", "Details")}</summary><code>${F[3]}</code></details></div></div>`;
    }
    const delta = S.delta ? `<span class="tag">${[S.delta.added ? `+${S.delta.added}` : "", S.delta.removed ? `−${S.delta.removed}` : ""].filter(Boolean).join(" ")} · ${L("其余未重读", "rest reused")}</span>` : "";
    const s2 = r === "gen" ? "run" : r === "done" ? "done" : r === "fail" ? "fail" : r === "deferred" ? "wait" : "todo";
    const left = `${head(r === "done" ? L("整理好了", "Summed up") : r === "fail" ? L("整理没成", "The summary failed") : L("读取与整理", "Reading and summing up"), "read")}
      <div class="phases">${phase(p1 ? "done" : "run", "check", "green", L(`读 ${fmt(c.n)} 份`, `Read ${fmt(c.n)}`), p1 ? delta || (c.bad ? `<span class="tag warn">${L(`${c.bad} 份读不了`, `${c.bad} unreadable`)}</span>` : "") : "")}
      ${phase(s2, { fail: "alert", wait: "status-waiting", done: "check" }[s2] || "note", { fail: "red", wait: "amber", done: "green" }[s2] || "mute", r === "deferred" ? L("稍后整理", "Summary later") : L("整理", "Sum up"), r === "gen" ? `<button class="btn sm sec" data-act="toast" data-arg="${esc(L("已停止整理；材料保留", "Stopped; materials kept"))}">${L("停止", "Stop")}</button>` : r === "deferred" ? `<button class="btn sm sec" data-act="goto" data-arg="model">${L("连模型", "Connect")}</button>` : "")}</div>${failBlock}`;
    let card;
    if (r === "done") card = summaryHtml();
    else if (r === "fail" || r === "deferred") card = `<div class="kept">${tile("folder-open", "amber", "xl")}<b>${L(`${fmt(c.n)} 份材料都已存好`, `${fmt(c.n)} materials saved`)}</b><div class="mini-stats"><span>${ic("file", "sm")}${c.text}</span><span>${ic("image", "sm")}${c.img}</span>${c.bad ? `<span class="warn">${ic("alert", "sm")}${c.bad}</span>` : ""}</div></div>`;
    else card = `<div class="skel" aria-hidden="true">${["blue", "amber", "green"].map((h, i) => `<div class="sk-sec">${tile("dot", h)}<div><i style="width:${[52, 40, 30][i]}%"></i><i style="width:${[88, 70, 80][i]}%"></i><i style="width:${[64, 50, 58][i]}%"></i></div></div>`).join("")}</div>`;
    const canGo = r === "done" || r === "deferred";
    return { left, right: `<div class="card" role="region" aria-label="${L("整理结果", "Summary")}" aria-busy="${r === "reading" || r === "gen"}">${card}</div>`,
      primary: { label: L("继续", "Continue"), act: "next", disabled: !canGo, reason: r === "fail" ? L("先选一种处理方式", "Choose an option first") : L("整理完就能继续", "Continue once done") } };
  }
  function stepAsk() {
    const a = S.answers;
    const known = [
      ["target", "blue", esc(goalText()), "goal"],
      S.scenario === "addscene" ? ["folder", "amber", L("项目里已有的 3 个位置", "The project's 3 locations"), "materials"] : ["rows", "amber", L("14 个订阅源", "14 feeds"), S.start === "materials" ? "materials" : null],
      ["note", "green", L("Pages 文档 · 约 1,500 字", "Pages doc · ~1,500 words"), null],
    ];
    const group = (key, label, opts) => `<fieldset class="q"><legend>${label}</legend><div class="opts pills" role="radiogroup">${opts.map(([v, t]) => `<button class="opt pill2" role="radio" data-act="answer" data-arg="${key}:${v}" aria-checked="${a[key] === v}">${t}</button>`).join("")}</div></fieldset>`;
    let follow = "";
    if (a.audience === "team") follow = group("channel", L("发到哪里？", "Where?"), [["slack", "Slack"], ["feishu", L("飞书", "Feishu")], ["none", L("先不发", "Not yet")]]);
    if (a.audience === "public") follow = group("review", L("发布前你先过目？", "Review before publishing?"), [["yes", L("要", "Yes")], ["no", L("不用", "No")]]) + safe(L("对外发布要另外授权，采用时不会打开", "Publishing needs a separate permission; adopting doesn't turn it on"));
    const resume = S.fault === "resume" && !S.dismissResume ? `<div class="alert info">${ic("history", "sm")}<span>${L("接着上次的继续。", "Picking up where you stopped.")}</span><button class="btn sm sec" data-act="goto" data-arg="goal">${L("从头看", "From the start")}</button><button class="btn icon sm ghost" data-act="dismiss-resume" aria-label="${L("关闭", "Close")}">${ic("x", "sm")}</button></div>` : "";
    return {
      left: `${resume}${head(L("还差几件事", "A few more things"), "ask")}
        <div class="panel known" aria-label="${L("已经知道", "Already known")}">${known.map(([i, h, v, g]) => `<div class="ln">${tile(i, h)}<span class="nm">${v}</span>${g ? `<button class="btn icon sm ghost" data-act="goto" data-arg="${g}" aria-label="${L("改", "Edit")}">${ic("edit", "sm")}</button>` : ""}</div>`).join("")}</div>
        ${group("audience", L("给谁看？", "Who reads it?"), [["me", L("我自己", "Just me")], ["team", L("团队", "My team")], ["public", L("公开", "Public")]])}
        ${follow}
        ${group("cadence", L("多久一份？", "How often?"), [["weekly", L("每周一 9:00", "Mondays 9:00")], ["biweekly", L("每两周", "Every 2 weeks")], ["ondemand", L("要时再写", "On request")]])}
        <button class="quiet-link" data-act="skip-ask">${L("用默认", "Use defaults")}${ic("arrow", "sm")}</button>`,
      right: forming(),
      primary: { label: L("看方案", "See the plan"), act: "next" },
    };
  }
  function memberHtml(m) {
    const conflict = S.scenario === "addscene" && m.id === "res";
    const conf = conflict ? `<div class="alert warn inline">${ic("alert", "sm")}<span>${L("项目里已有「研究员」", "A Researcher already exists")}</span><span class="seg2"><button data-act="res" data-arg="reuse" aria-pressed="${S.resChoice === "reuse"}">${L("沿用", "Reuse")}</button><button data-act="res" data-arg="copy" aria-pressed="${S.resChoice === "copy"}">${L("复制一个", "Copy")}</button></span></div>` : "";
    return `<div class="member" style="--hue:${m.hue}"><span class="av">${T(m.av)}</span><div class="bd"><strong>${T(m.name)}</strong><span class="fact">${T(m.role)}</span>${conf}</div>${m.existing ? `<span class="tag">${L("已有", "Existing")}</span>` : `<button class="btn icon sm ghost" data-act="toast" data-arg="${esc(L("成员编辑等第 03 批的助理路径（占位）", "Member editing waits for batch 03 (placeholder)"))}" aria-label="${L("改", "Edit")}">${ic("edit", "sm")}</button>`}</div>`;
  }
  function mapRows() {
    const c = counts(), a = S.answers;
    const rows = [
      ["sparkles", "violet", L("模型", "Model"), "DeepSeek", L("设置 › 模型", "Settings › Model")],
      ["note", "green", L("项目说明", "Description"), L("草稿 3 段", "3 paragraphs"), L("项目设置 › 常规", "Project › General")],
      ["folder", "amber", L("资料", "Materials"), S.start === "goal" ? "—" : L(`${fmt(c.n)} 份`, `${fmt(c.n)} items`), L("资料 › 输入与输出", "Materials › Inputs")],
      ["user", "indigo", L("成员", "Members"), S.resChoice === "reuse" ? L("沿用研究员 · 编辑", "Reused · Editor") : L("研究员 · 编辑", "Researcher · Editor"), L("项目设置 › 成员", "Project › Members")],
      ["database", "slate", L("记忆", "Memory"), L("跟个人设置", "Personal"), L("项目设置 › 记忆", "Project › Memory")],
      ["clock", "rose", L("生成", "When"), a.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText(), L("设置 › 助理", "Settings › Assistant")],
      ["send", "teal", L("对外发送", "Sending"), L("不开", "Off"), L("设置 › 授权", "Settings › Permissions")],
    ];
    return `<div class="tblwrap"><table class="map"><thead><tr><th>${L("设置", "Setting")}</th><th>${L("这次", "Value")}</th><th>${L("以后在", "Change in")}</th></tr></thead><tbody>${rows.map((r) => `<tr><td><span class="td-k">${tile(r[0], r[1])}${r[2]}</span></td><td class="v">${r[3]}</td><td class="fact">${r[4]}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function stepPlan() {
    const a = S.answers, missing = S.fault === "missing_dep", add = S.scenario === "addscene";
    const needRes = add && !S.resChoice;
    const items = adoptItems();
    const deps = `<div class="ln">${tile("note", "green")}<span class="nm">Pages</span>${st("done", "")}</div>
      <div class="ln">${tile("rows", "teal")}<span class="nm">Feed</span>${missing ? `<span class="tag warn">${L("未安装 · 采用时先装", "Not installed · adopt installs it")}</span><button class="btn sm sec" data-act="dep-preview" aria-expanded="${S.depPreview}">${L("权限", "Permissions")}</button>` : st("done", "")}</div>
      ${missing && S.depPreview ? `<div class="fr-detail">${L("Molis 官方 · 签名已验证。读你添加的订阅地址（联网），在本项目存条目。不读其他项目，不发送内容。", "Molis official · verified. Reads the feed addresses you add (network), stores items here. Reads no other project, sends nothing.")}</div>` : ""}
      ${a.channel === "slack" ? `<div class="ln">${tile("link", "slate")}<span class="nm">Slack</span><span class="tag">${L("没连 · 只影响发送", "Not connected · sending only")}</span><button class="btn sm sec" data-act="toast" data-arg="${esc(L("会在这里连接 Slack（原型不展开）", "Connects Slack here (not built)"))}">${L("连接", "Connect")}</button></div>` : ""}`;
    const label = add ? L("采用", "Adopt") : L("采用并新建项目", "Adopt and create");
    return {
      left: `${head(L(`「${sceneName()}」`, `“${sceneName()}”`), "plan")}
        <div class="quest-mini">${tile("target", "blue", "lg")}<div><b>${L("第一期：本周 AI 产品观察", "Issue 1: this week in AI")}</b><span>${L("约 10 分钟", "~10 min")}</span></div></div>
        <ol class="will">${items.map((x) => `<li class="${x.off ? "off" : x.keep ? "keep" : ""}">${tile(x.icon, x.off ? "mute" : x.hue)}<span>${x.label}</span>${x.off ? `<span class="tag">${L("不开", "Off")}</span>` : ""}</li>`).join("")}</ol>`,
      right: `<div class="card plan" role="region" aria-label="${L("方案", "Plan")}">
        <section><h3>${L("谁来做", "Who")}</h3>${D.members.map(memberHtml).join("")}</section>
        <section><h3>${L("插件", "Plugins")}</h3><div class="panel">${deps}</div></section>
        <section><h3>${L("首页", "Home")}</h3><div class="placeholder">${ic("home", "sm")}<span>${L("等第 03 批定样", "Waits for batch 03")}</span><span class="tag sim">${L("占位", "Placeholder")}</span></div></section>
        <section><h3>${L("设置", "Settings")}</h3>${mapRows()}</section></div>`,
      primary: { label, act: "next", disabled: needRes, reason: L("先定研究员", "Decide on the researcher first") },
    };
  }
  function stepAdopt() {
    const items = adoptItems();
    const anyFail = items.some((x) => S.adopt[x.id] === "fail");
    const live = items.filter((x) => !x.off && !x.keep);
    const n = live.filter((x) => S.adopt[x.id] === "done").length;
    const pct = Math.round((n / live.length) * 100);
    const rows = items.map((x) => {
      const s = x.off ? `<span class="tag">${L("不开", "Off")}</span>` : x.keep ? st("done", "") : { skipped: st("wait", L("跳过", "Skipped")), todo: '<span class="slot sm"></span>', run: st("run", ""), done: st("done", ""), fail: st("fail", L("没成", "Failed")) }[S.adopt[x.id] || "todo"];
      const fail = S.adopt[x.id] === "fail" ? `<div class="alert err inline">${ic("alert", "sm")}<span>${L("Schedule 30 秒没回应，没建成，也不会重复建。", "Schedule didn't answer in 30 s; nothing was created or duplicated.")}</span><button class="btn sm primary" data-act="sched-retry">${L("重试", "Retry")}</button><button class="btn sm sec" data-act="sched-skip">${L("跳过", "Skip")}</button></div>` : "";
      const state = S.adopt[x.id] || "todo";
      return `<div class="ln ${state === "run" ? "is-run" : ""} ${state === "todo" && !x.keep && !x.off ? "is-todo" : ""} ${x.off ? "off" : ""}">${tile(x.icon, x.off ? "mute" : x.hue)}<span class="nm">${x.label}</span>${s}</div>${fail}`;
    }).join("");
    const done = S.adopted;
    return {
      left: `${head(!done ? L("正在采用", "Adopting") : anyFail ? L("差一项", "One item left") : L("都办好了", "All done"), "adopt")}
        <div class="big-ring ${anyFail ? "fail" : done ? "ok" : ""}" style="--p:${pct}" role="img" aria-label="${n} / ${live.length}"><div><b>${n}</b><span>/ ${live.length}</span></div></div>`,
      right: `<div class="card" role="region" aria-label="${L("采用结果", "Results")}" aria-busy="${!done}">${rows}</div>`,
      primary: { label: L("进入项目", "Open the project"), act: "next", disabled: !done, reason: L("采用完就能进入", "Available when done") },
      prev: false,
    };
  }
  function stepWorkdir() {
    const p = S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets";
    return {
      left: `${head(L("Coding 在哪个文件夹里干活？", "Which folder does Coding work in?"), "workdir")}
        <div class="opts col" role="radiogroup">${radio("wd", "website", S.wdPick, `<code>~/code/website</code>`, "git-branch", "green")}${radio("wd", "brand", S.wdPick, `<code>~/Design/brand-assets</code>`, "folder", "amber")}</div>
        <label class="consent"><input type="checkbox" data-act="wd-consent" ${S.wdConsent ? "checked" : ""}><span>${L(`允许 Coding 在 <code>${p}</code> 里改文件、运行命令`, `Let Coding change files and run commands in <code>${p}</code>`)}</span></label>`,
      right: codingMini(false),
      primary: { label: L("用这个文件夹", "Use this folder"), act: "wd-done", disabled: !S.wdConsent, reason: L("先勾选授权", "Tick the permission first") },
    };
  }
  function stepBack() {
    return {
      left: `${head(L("补齐了", "All set"), "back")}<div class="panel"><div class="ln">${tile("sparkles", "violet")}<span class="nm">DeepSeek</span>${st("done", "")}</div><div class="ln">${tile("folder", "amber")}<span class="nm"><code>${S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets"}</code></span>${st("done", "")}</div></div>`,
      right: codingMini(true),
      primary: { label: L("回到 Coding", "Back to Coding"), act: "return" },
    };
  }
  const STEPS = { lang: stepLang, look: stepLook, goal: stepGoal, materials: stepMaterials, model: stepModel, read: stepRead, ask: stepAsk, plan: stepPlan, adopt: stepAdopt, workdir: stepWorkdir, back: stepBack };

  // ---------- The immersive frame ----------
  function stepper() {
    const steps = flow().filter((x) => x !== "opening");
    const cur = steps.indexOf(S.step);
    return `<nav class="stepper" aria-label="${L(`第 ${cur + 1} 步，共 ${steps.length} 步`, `Step ${cur + 1} of ${steps.length}`)}"><ol>${steps.map((id, i) => {
      const s = stepState(id);
      const locked = S.adopted && flow().includes("adopt") && idx(id) < idx("adopt");
      const can = !locked && s !== "cur" && s !== "todo";
      return `<li class="sp ${s === "reached" ? "done" : s}"><button data-act="goto" data-arg="${id}" ${can ? "" : "disabled"} ${s === "cur" ? 'aria-current="step"' : ""}><span class="sp-dot">${s === "done" || s === "reached" ? ic("check", "sm") : s === "wait" ? "!" : i + 1}</span><span class="sp-name">${T(SHORT[id])}</span></button></li>`;
    }).join("")}</ol></nav>`;
  }
  const primaryBtn = (p) => `${p.disabled && p.reason ? `<span class="sr" id="primary-why">${p.reason}</span>` : ""}<button class="btn lg primary" id="primary" data-act="${p.act}" ${p.disabled ? `disabled aria-describedby="primary-why" title="${esc(p.reason || "")}"` : ""} aria-keyshortcuts="Enter"><span>${p.label}</span><span class="kbd" aria-hidden="true">↵</span></button>`;
  function immersive() {
    if (S.step === "opening") {
      return `<div class="arrival ${S.typed ? "ready" : ""}" data-screen="opening"><header class="a-title">${BRAND}</header>
        <main class="a-stage"><div class="sheet glowing opening ${enterCls}"><div class="opening-copy"><p class="caption">Amplify Ideas</p><h1 class="wordmark" tabindex="-1" aria-label="Molis Work"><span class="wm-text">${S.typed || reduced ? "Molis Work" : ""}</span><span class="caret" aria-hidden="true"></span></h1></div></div></main>
        <footer class="a-bar"><div class="bar-start"></div><div class="bar-center"></div><div class="bar-end">${primaryBtn({ label: L("开始", "Begin"), act: "next" })}</div></footer></div>`;
    }
    const d = STEPS[S.step]();
    const steps = flow();
    const prevId = steps[steps.indexOf(S.step) - 1];
    const prev = d.prev !== false && prevId && prevId !== "opening" ? `<button class="btn lg sec" data-act="prev" aria-label="${L("上一步", "Back")}">${ic("back", "sm")}</button>` : "";
    const exit = S.scenario === "first" ? `<button class="exit" data-act="exit">${L("稍后", "Later")}</button>`
      : S.scenario === "fromhelp" ? (S.step === "back" ? "" : `<button class="exit" data-act="return-early">${ic("back", "sm")}Coding</button>`)
      : `<button class="exit" data-act="exit">${ic("back", "sm")}${L("项目", "Projects")}</button>`;
    const themeTool = S.step === "lang" || S.step === "look" ? `<button class="a-tool" data-act="theme-toggle" aria-label="${L("切换主题", "Switch theme")}">${ic(S.theme === "dark" ? "sun" : "moon", "sm")}</button>` : "";
    const visible = steps.filter((x) => x !== "opening");
    const cur = visible.indexOf(S.step);
    return `<div class="arrival" data-screen="welcome" data-step="${S.step}"><header class="a-title">${BRAND}<span class="a-spacer"></span>${themeTool}</header>
      <main class="a-stage"><div class="sheet glowing welcome ${d.light ? "light" : ""} ${enterCls}"><section class="w-left ${enterStep ? "enter" : ""}"><div class="w-col"><div class="w-progress" aria-hidden="true"><span>${cur + 1}/${visible.length} · ${T(SHORT[S.step])}</span><i><b style="width:${Math.round(((cur + 1) / visible.length) * 100)}%"></b></i></div>${d.left}</div></section><aside class="w-right ${enterStep ? "enter" : ""}" ${d.decor ? 'aria-hidden="true"' : ""}>${d.right}</aside></div></main>
      <footer class="a-bar"><div class="bar-start">${exit}</div><div class="bar-center">${stepper()}</div><div class="bar-end">${prev}${primaryBtn(d.primary)}</div></footer></div>`;
  }

  // ---------- After arriving: the workbench frame (home is a placeholder until 03) ----------
  function workBar() {
    const typed = S.scenario === "fromhelp" ? L("按品牌指南把首屏改成一句主张加一个主按钮", "Make the hero one statement and one main button, per the brand guide") : "";
    const ready = S.scenario === "fromhelp" && S.returned;
    const plug = S.scenario === "fromhelp" ? "Coding" : L("首页", "Home");
    const mono = S.personal ? L("我", "Me") : S.scenario === "fromhelp" ? "官" : projName().slice(0, 1);
    return `<footer class="a-bar wbar"><div class="tray"><button class="switcher" data-act="toast" data-arg="${esc(L("插件切换（原型不展开）", "Plugin switcher (not built)"))}">${ic("grid", "sm")}<span>${plug}</span>${ic("chevron-down", "sm")}</button><button class="pin" aria-label="${L("个人助理", "Assistant")}">${ic("sparkles")}</button></div>
      <div class="composer ${typed ? "kept" : ""}">${typed ? `<span class="typed" title="${esc(typed)}">${esc(typed)}</span>` : `<span class="ph">${L("让助理做点什么", "Ask the Assistant")}</span>`}<button class="send ${ready ? "ready" : ""}" aria-label="${L("发送", "Send")}" ${typed && !ready ? `data-act="toast" data-arg="${esc(L("还缺模型和工作目录", "Still missing a model and a folder"))}"` : ready ? 'data-act="send"' : ""}>${ic("send", "sm")}</button></div>
      <div class="tray"><span class="mono" aria-hidden="true">${mono}</span></div></footer>`;
  }
  function landing() {
    if (S.personal) return `<div class="land"><header class="land-h">${tile("user", "indigo", "xl")}<div class="land-t"><h1 tabindex="-1">${L("个人空间", "Personal space")}</h1></div></header><div class="say"><span class="g-av" aria-hidden="true">${ic("sparkles")}</span><span>${L("在下面说要做什么就行。", "Just say what you need below.")}</span></div></div>`;
    if (S.start === "blank") return `<div class="land"><header class="land-h">${tile("file", "slate", "xl")}<div class="land-t"><h1 tabindex="-1">${L("未命名项目", "Untitled project")}</h1></div></header><div class="grid2"><button class="add-card" data-act="toast" data-arg="${esc(L("打开资料（原型不展开）", "Opens materials (not built)"))}">${tile("folder-open", "amber", "lg")}<b>${L("加资料", "Add materials")}</b></button><button class="add-card" data-act="toast" data-arg="${esc(L("把光标放进下面的输入框", "Focus the input below"))}">${tile("sparkles", "violet", "lg")}<b>${L("直接说要做什么", "Say what to do")}</b></button></div></div>`;
    const w = S.work;
    const partial = S.adopt.sched === "fail";
    const c = counts();
    const stage = (i, icon, hue, text) => {
      const state = w === "done" ? "done" : (w === "run1" && i === 0) || (w === "run2" && i === 1) ? "run" : (w === "run2" && i === 0) ? "done" : "";
      return `<li class="${state}">${state === "run" ? '<span class="tile run"><span class="spin"></span></span>' : state === "done" ? tile("check", "green") : tile(icon, hue)}<span>${text}</span></li>`;
    };
    const status = w === "done" ? `<span class="pill ok">${ic("check", "sm")}${L("第一期已写好", "Issue 1 written")}</span>` : w !== "idle" ? `<span class="pill run"><span class="spin"></span>${L("在写第一期", "Writing issue 1")}</span>` : `<span class="pill">${L("准备好了", "Ready")}</span>`;
    return `<div class="land">
      <header class="land-h"><span class="fm-mark xl" aria-hidden="true">${projName().slice(0, 1)}</span><div class="land-t"><h1 tabindex="-1">${projName()}</h1><div class="stats"><span>${ic("folder", "sm")}${S.start === "goal" ? "—" : fmt(c.n)}</span><span>${ic("user", "sm")}2</span><span>${ic("clock", "sm")}${S.answers.cadence === "ondemand" ? L("要时", "On request") : cadenceText()}</span></div></div>${status}${helpBtn("work")}</header>${helpBox("work")}
      ${partial ? `<div class="alert warn">${ic("alert", "sm")}<span>${L("每周安排还没建成。", "The weekly schedule isn't set yet.")}</span><button class="btn sm sec" data-act="sched-retry-later">${L("重试", "Retry")}</button></div>` : ""}
      <section class="quest ${w}">
        <div class="quest-top"><span class="q-badge">${ic(w === "done" ? "check" : "target", "sm")}</span><h2>${L("第一期：本周 AI 产品观察", "Issue 1: this week in AI products")}</h2>${w === "done" ? `<button class="btn primary" data-act="toast" data-arg="${esc(L("在 Pages 打开（原型不展开）", "Opens in Pages (not built)"))}">${L("打开", "Open")}</button>` : `<button class="btn primary" data-act="work-start" ${w !== "idle" ? "disabled" : ""}>${ic("play", "sm")}${L("开始", "Start")}</button>`}</div>
        <ol class="stages">${stage(0, "rows", "teal", L("研究员读 14 个订阅源", "Researcher reads 14 feeds"))}${stage(1, "edit", "indigo", L("编辑写成 Pages 文档", "Editor writes a Pages doc"))}${stage(2, "eye", "blue", L("你过目", "You review"))}</ol>
      </section>
      <div class="grid2">
        <section class="tile-card"><h3>${L("带进来的", "Brought in")}</h3>
          <button class="row-link" data-act="toast" data-arg="${esc(L("打开项目资料（原型不展开）", "Opens materials (not built)"))}">${tile("folder-open", "amber")}<span>${S.start === "goal" ? L("还没有材料", "No materials yet") : L(`${fmt(c.n)} 份材料`, `${fmt(c.n)} materials`)}</span>${ic("chevron-right", "sm")}</button>
          <button class="row-link" data-act="toast" data-arg="${esc(L("打开摘要（原型不展开）", "Opens the summary (not built)"))}">${tile("note", "green")}<span>${S.read === "done" ? L("摘要 · 3 条待办", "Summary · 3 to-dos") : L("摘要待整理", "Summary pending")}</span>${ic("chevron-right", "sm")}</button></section>
        <section class="tile-card"><h3>${L("团队", "Team")}</h3>${D.members.map((m) => `<div class="row-link static"><span class="av sm" style="--hue:${m.hue}">${T(m.av)}</span><span>${T(m.name)}</span></div>`).join("")}</section>
      </div>
      <details class="later-box"><summary>${ic("settings", "sm")}<span>${L("以后再设", "Set up later")}</span><span class="count-badge">4</span>${ic("chevron-down", "sm chev")}</summary>
        <div class="later-rows">${[["database", "slate", L("记忆", "Memory")], ["link", "teal", L("能力与连接", "Capabilities")], ["folder", "amber", L("工作目录", "Working folder")], ["settings", "violet", L("助理规则与用量", "Assistant rules and usage")]].map(([i, h, t]) => `<button class="row-link" data-act="toast" data-arg="${esc(L("打开对应设置（原型不展开）", "Opens that setting (not built)"))}">${tile(i, h)}<span>${t}</span>${ic("chevron-right", "sm")}</button>`).join("")}</div></details>
      <p class="ph-note">${ic("home", "sm")}<span>${L("首页其余部分等第 03 批", "The rest of the home waits for batch 03")}</span><span class="tag sim">${L("占位", "Placeholder")}</span></p></div>`;
  }
  function codingOrigin() {
    const ok = S.returned;
    return `<div class="land narrow"><header class="land-h">${tile("code", "blue", "xl")}<div class="land-t"><h1 tabindex="-1">${ok ? L("可以开始了", "Ready to start") : L("还不能开始", "Can't start yet")}</h1></div>${ok ? "" : helpBtn("origin")}</header>${ok ? "" : helpBox("origin")}
      <div class="panel"><div class="ln">${tile("sparkles", "violet")}<span class="nm">${L("模型", "Model")}</span>${S.modelOk ? st("done", "DeepSeek") : st("fail", L("没有", "None"))}</div><div class="ln">${tile("folder", "amber")}<span class="nm">${L("工作目录", "Working folder")}</span>${S.wdOk ? st("done", S.wdPick === "website" ? "website" : "brand-assets") : st("fail", L("没选", "Not chosen"))}</div></div>
      ${ok ? "" : `<button class="btn lg primary self-start" data-act="fill"><span>${L("补齐这两项", "Fill in both")}</span></button>`}</div>`;
  }
  function workFrame(kind) {
    const name = kind === "coding" ? "官网改版 · Coding" : S.personal ? L("个人空间", "Personal space") : projName();
    return `<div class="arrival work" data-screen="work"><header class="a-title">${BRAND}<span class="a-tab">${ic(kind === "coding" ? "code" : S.personal ? "user" : "home", "sm")}<span>${name}</span></span><span class="a-spacer"></span></header>
      <main class="a-stage"><div class="sheet ${enterCls}"><div class="scroll">${kind === "coding" ? codingOrigin() : landing()}</div></div></main>${workBar()}</div>`;
  }

  // ---------- Render ----------
  let focusAfter = null, lastKey = null, lastKind = null, enterCls = "", enterStep = false;
  function render() {
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    proto();
    const kind = S.scenario === "fromhelp" && (S.origin || S.returned) ? "coding" : S.step === "work" || S.personal ? "landing" : "journey";
    const key = `${S.scenario}|${S.step}|${kind}`;
    enterStep = key !== lastKey;
    enterCls = kind !== lastKind ? (kind === "journey" && lastKind === "coding" ? "over" : "enter") : "";
    const sel = ".w-left, .w-right, .sheet > .scroll, .card, .welcome";
    const keep = !enterStep ? [...app.querySelectorAll(sel)].map((x) => x.scrollTop) : null;
    app.innerHTML = kind === "coding" ? workFrame("coding") : kind === "landing" ? workFrame("landing") : immersive();
    if (keep) [...app.querySelectorAll(sel)].forEach((x, i) => { if (keep[i]) x.scrollTop = keep[i]; });
    lastKey = key; lastKind = kind;
    app.querySelectorAll("input[data-mixed]").forEach((x) => { x.indeterminate = true; });
    if (focusAfter === "h1") { const h = app.querySelector(".w-head h1, .land h1, .wordmark"); if (h) h.focus({ preventScroll: false }); }
    else if (focusAfter) { const el = app.querySelector(focusAfter); if (el) el.focus(); }
    focusAfter = null;
    S.flash = null;
    if (S.step === "opening" && kind === "journey" && !S.typed) typeWordmark();
    save();
  }
  let typing = null;
  function finishTyping() {
    clearInterval(typing); typing = null; S.typed = true;
    const t = app.querySelector(".wm-text"); if (t) t.textContent = "Molis Work";
    app.querySelector(".arrival")?.classList.add("ready"); save();
  }
  function typeWordmark() {
    if (reduced) { finishTyping(); return; }
    if (typing) clearInterval(typing);
    const full = "Molis Work"; let i = 0;
    const t = app.querySelector(".wm-text");
    setTimeout(() => {
      typing = setInterval(() => { i += 1; if (t) t.textContent = full.slice(0, i); if (i >= full.length) { clearInterval(typing); typing = null; setTimeout(finishTyping, 260); } }, 85);
    }, 380);
  }
  function proto() {
    const P = (zh, en) => (S.lang === "zh" ? zh : en);
    document.getElementById("p-title").textContent = P("原型 · 模拟数据", "Prototype · sample data");
    document.getElementById("p-scenario").textContent = P("场景", "Scenario");
    document.getElementById("p-fault").textContent = P("状态", "State");
    document.getElementById("p-lang").textContent = P("语言", "Language");
    document.getElementById("p-theme").textContent = P("外观", "Theme");
    document.getElementById("reset").textContent = P("从头再来", "Restart");
    const [l, d] = document.querySelectorAll("#theme button"); l.textContent = P("浅", "Light"); d.textContent = P("深", "Dark");
    document.getElementById("scenario").innerHTML = D.scenarios.map(([k, t]) => `<option value="${k}" ${S.scenario === k ? "selected" : ""}>${T(t)}</option>`).join("");
    document.getElementById("fault").innerHTML = D.faults.map(([k, t]) => `<option value="${k}" ${S.fault === k ? "selected" : ""}>${T(t)}</option>`).join("");
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === S.lang));
    document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme));
  }
  function restart(keep) { clearTimers(); if (typing) { clearInterval(typing); typing = null; } S = init(fresh(keep)); focusAfter = "h1"; lastKind = null; render(); }

  // ---------- Events ----------
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; S.look = S.theme; render(); } });
  document.getElementById("scenario").addEventListener("change", (e) => restart({ lang: S.lang, theme: S.theme, fault: S.fault, scenario: e.target.value }));
  document.getElementById("fault").addEventListener("change", (e) => restart({ lang: S.lang, theme: S.theme, scenario: S.scenario, fault: e.target.value }));
  document.getElementById("reset").addEventListener("click", () => restart({ lang: S.lang, theme: S.theme, scenario: S.scenario, fault: S.fault }));

  app.addEventListener("input", (e) => {
    if (e.target.id !== "goal") return;
    S.goal = e.target.value;
    const btn = document.getElementById("primary"); const empty = !S.goal.trim() && S.start !== "blank";
    if (btn) btn.disabled = empty;
    const row = app.querySelector(".fm-row"); const v = row?.querySelector(".v");
    if (v) v.innerHTML = S.goal.trim() ? esc(S.goal) : '<span class="slot"></span>';
    row?.classList.toggle("is-set", !!S.goal.trim());
    const fh = app.querySelector(".fm-head b"); if (fh && S.scenario !== "addscene") { fh.textContent = S.goal.trim() ? projName() : L("新项目", "New project"); fh.classList.toggle("ph", !S.goal.trim()); }
    save();
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.act === "pick") { S.picks[t.dataset.arg] = t.checked; S.flash = "mat"; render(); }
    if (t.dataset.act === "pick-loc") { const l = D.locations.find((x) => x.id === t.dataset.arg); l.children.forEach((c) => { S.picks[c.id] = t.checked; }); S.flash = "mat"; render(); }
    if (t.dataset.act === "prov") { S.provider = t.value; S.connected = false; render(); }
    if (t.dataset.act === "wd-consent") { S.wdConsent = t.checked; render(); }
  });
  document.addEventListener("keydown", (e) => {
    if (typing && !e.metaKey && !e.ctrlKey) { finishTyping(); if (e.key === "Enter") e.preventDefault(); return; }
    if (e.key === "Escape" && S.help) { const id = S.help; S.help = null; focusAfter = `[data-help-for="${id}"]`; render(); return; }
    if (e.key !== "Enter" || e.isComposing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest(".proto")) return;
    if (["BUTTON", "A", "TEXTAREA", "SELECT", "SUMMARY"].includes(t.tagName) || (t.tagName === "INPUT" && t.type === "checkbox")) return;
    const p = document.getElementById("primary");
    if (p && !p.disabled) { e.preventDefault(); p.click(); }
  });
  app.addEventListener("click", (e) => {
    if (typing) { finishTyping(); if (!e.target.closest("#primary")) return; }
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    const act = b.dataset.act, arg = b.dataset.arg;
    const A = {
      next() { if (S.step === "opening") S.typed = true; advance(); },
      prev: back,
      goto() { if (arg === "goal") S.dismissResume = true; go(arg, { keep: arg !== "read" }); },
      help() { const was = S.help === arg; S.help = was ? null : arg; if (was) focusAfter = `[data-help-for="${arg}"]`; },
      exit() { toast(L("已存草稿，下次从这里接着走", "Draft saved; you continue from here next time")); },
      "lang-set"() { S.lang = arg; },
      "look-set"() { S.look = arg; S.theme = arg === "dark" ? "dark" : "light"; },
      "theme-toggle"() { S.theme = S.theme === "dark" ? "light" : "dark"; S.look = S.theme; },
      suggest() { S.goal = arg; S.flash = "goal"; focusAfter = "#primary"; },
      start() { S.start = arg; },
      personal() { S.personal = true; focusAfter = "h1"; },
      open() { S.open[arg] = !S.open[arg]; focusAfter = `[data-act="open"][data-arg="${arg}"]`; },
      detail() { S.detail = S.detail === arg ? null : arg; focusAfter = `[data-act="detail"][data-arg="${arg}"]`; },
      fullpdf() { S.fullPdf = !S.fullPdf; },
      "scan-stop"() { S.scanStopped = true; toast(L("已停止清点，已找到的保留", "Stopped; what was found is kept")); },
      "scan-resume"() { S.scanStopped = false; },
      "model-change"() { S.modelOk = false; S.connected = false; },
      check() { S.checking = true; later(1100, () => { S.checking = false; S.connected = true; }); },
      "model-done"() { S.modelOk = true; S.keyRefused = false; S.deferred = false; S.flash = "model"; if (S.read === "fail" || S.read === "deferred") { S.failCleared = true; S.read = "gen"; go("read", { keep: true }); later(1300, () => { S.read = "done"; S.readSig = sig(); }); } else advance(); },
      defer() { S.deferred = true; go("read"); },
      "defer-after-fail"() { S.read = "deferred"; S.deferred = true; advance(); },
      "key-refused"() { S.keyRefused = true; S.modelOk = false; S.connected = false; go("model", { keep: true }); },
      retry() { retryRead(); },
      "retry-wait"() { S.retryIn = 3; const tick = () => later(1000, () => { if (!S.retryIn) return; S.retryIn -= 1; if (S.retryIn === 0) retryRead(); else tick(); }); tick(); },
      "retry-cancel"() { S.retryIn = 0; clearTimers(); },
      narrow() { S.picks.gartner = false; S.open.dl = true; S.failCleared = true; go("materials", { keep: true }); },
      answer() { const [k, v] = arg.split(":"); const had = S.answers[k] != null; S.answers[k] = v; if (k === "audience") { S.answers.channel = null; S.answers.review = null; } S.flash = k === "channel" || k === "review" ? "audience" : k; if (had && S.max >= idx("plan")) toast(L("方案里只改了这一项", "Only this part of the plan changed")); },
      "skip-ask"() { S.answers.audience = S.answers.audience || "me"; S.answers.cadence = S.answers.cadence || "ondemand"; advance(); },
      res() { S.resChoice = arg; },
      "dep-preview"() { S.depPreview = !S.depPreview; },
      "sched-retry"() { S.schedRetried = true; S.adopt.sched = "run"; later(700, () => { S.adopt.sched = "done"; }); },
      "sched-skip"() { S.adopt.sched = "skipped"; toast(L("已跳过；在 设置 › 助理 里随时补上", "Skipped; add it any time in Settings › Assistant")); },
      "sched-retry-later"() { S.schedRetried = true; S.adopt.sched = "done"; toast(L("每周安排建好了", "Weekly schedule created")); },
      "work-start"() { S.work = "run1"; later(1400, () => { S.work = "run2"; }); later(2900, () => { S.work = "done"; announce(L("第一期写好了", "Issue 1 is written")); }); },
      "dismiss-resume"() { S.dismissResume = true; },
      fill() { S.origin = false; S.step = S.modelOk ? "workdir" : "model"; focusAfter = "h1"; },
      "return-early"() { S.origin = true; focusAfter = "h1"; toast(L("进度和你写的那句都留着", "Progress and your sentence are kept")); },
      wd() { S.wdPick = arg; },
      "wd-done"() { S.wdOk = true; advance(); },
      return() { S.returned = true; S.origin = true; toast(L("你写的那句还在，按发送就开始", "Your sentence is still there — press Send")); focusAfter = ".composer .send"; },
      send() { toast(L("已发给 Coding（原型到此为止）", "Sent to Coding (the prototype ends here)")); },
      toast() { toast(arg); },
    };
    if (A[act]) { A[act](); if (act !== "toast" && act !== "exit") render(); }
  });

  S = load();
  if (S.read === "reading" || S.read === "gen") { S.read = "idle"; S.readSig = null; if (S.step === "read") enterRead(); }
  if (S.step === "adopt" && !S.adopted) startAdopt();
  if (S.work === "run1" || S.work === "run2") S.work = "idle";
  render();
  window.protoJump = (patch) => { clearTimers(); Object.assign(S, patch); render(); };
  window.protoFlow = () => flow();
})();
