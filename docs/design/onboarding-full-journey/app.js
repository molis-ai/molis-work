// 04 · Onboarding full journey, rebuilt on the component board's real parts (2026-11-04).
// The frame, controls and motion are the product's own: ../_catalog/dist/arrival.css, the icon sprite, and the
// arrival motion (window.molisArrival). Only the parts the catalog lacks live in proto.css, marked 「组件板新增」.
// Layout and choices are exactly the approved second version; all data is sample data (data.js), timers stand in for
// reading, model calls and adoption. Nothing reads a folder, calls a model, stores a key or touches a Home.
(() => {
  const D = window.protoData;
  const app = document.getElementById("app");
  const KEY = "molis-proto.onboarding-full-journey.v4";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pickDefaults = () => Object.fromEntries(D.locations.flatMap((l) => l.children.map((c) => [c.id, c.pick])));
  const fresh = (keep = {}) => ({
    scenario: "first", fault: "none", lang: "zh", theme: "light",
    ...keep,
    step: null, max: 0, typed: false, look: "light", density: "standard", goal: "", start: "materials", picks: pickDefaults(), open: { docs: true, dl: false, desk: false },
    detail: null, scanStopped: false, provider: "deepseek", checking: false, connected: false, modelOk: null, keyRefused: false, deferred: false,
    read: "idle", readSig: null, delta: null, failCleared: false, retryIn: 0, fullPdf: false,
    answers: { audience: null, channel: null, review: null, cadence: null }, resChoice: null, depPreview: false,
    adopt: {}, adopting: false, adopted: false, schedRetried: false, work: "idle", personal: false,
    dismissResume: false, origin: true, returned: false, wdPick: "website", wdOk: false, wdConsent: false, flash: null,
  });
  let S = null;
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.v === 4) return { ...fresh(), ...v.s }; } catch { /* preview without storage */ }
    return init(fresh());
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 4, s: S })); } catch { /* preview without storage */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const fmt = (n) => n.toLocaleString(S.lang === "zh" ? "zh-CN" : "en-US");
  const projName = () => (S.scenario === "addscene" ? "产品研究" : S.scenario === "fromhelp" ? "官网改版" : "AI 产品观察");
  const sceneName = () => L("每周 AI 产品观察", "Weekly AI product watch");
  const goalText = () => S.goal.trim() || T(D.goalSuggestions[0]);
  const SHORT = { lang: ["语言", "Language"], look: ["外观", "Look"], goal: ["目的", "Goal"], materials: ["材料", "Materials"], model: ["模型", "Model"], read: ["整理", "Summary"], ask: ["补问", "Questions"], plan: ["方案", "Plan"], adopt: ["采用", "Adopt"], workdir: ["文件夹", "Folder"], back: ["回去", "Return"] };

  // ---------- Catalog parts (../_catalog/parts.js: the component board's markup) ----------
  const P = window.molisParts(() => S.lang);
  const { esc, ic, attrs, act, btn, choices, status, badge, alert, spinner, progress, collapsible, avatar, monogram, row, rows, note, kind, ring } = P;

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
    S.step = id;
    S.max = Math.max(S.max, idx(id));
    if (id === "read" && !opts.keep) enterRead();
    if (id === "adopt" && !S.adopted && !S.adopting) startAdopt();
    focusAfter = "h1";
  }
  function arrive() { S.step = "work"; focusAfter = "h1"; }
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
    if (S.fault === "missing_dep") it.push({ id: "install", icon: "download", hue: "purple", label: L("安装 Feed", "Install Feed") });
    if (S.scenario !== "addscene") it.push({ id: "project", icon: "folder", hue: "blue", label: L(`新建项目「${projName()}」`, `Create “${projName()}”`) });
    else it.push({ id: "keep", icon: "lock", hue: "slate", label: L("原有资料、成员和首页不动", "Existing materials, members and home untouched"), keep: true });
    if (S.scenario !== "addscene" && S.start !== "goal") it.push({ id: "mat", icon: "folder-open", hue: "orange", label: S.read === "done" ? L(`带入 ${counts().n} 份材料和摘要`, `Bring in ${counts().n} materials and the summary`) : L(`带入 ${counts().n} 份材料`, `Bring in ${counts().n} materials`) });
    it.push({ id: "brief", icon: "note", hue: "green", label: L("写项目说明", "Write the description") });
    it.push({ id: "members", icon: "user", hue: "indigo", label: S.resChoice === "reuse" ? L("加编辑，沿用研究员", "Add editor, reuse researcher") : L("加研究员和编辑", "Add researcher and editor") });
    it.push({ id: "feed", icon: "rss", hue: "cyan", label: L("启用 Feed", "Turn on Feed") });
    if (S.answers.cadence !== "ondemand") it.push({ id: "sched", icon: "clock", hue: "pink", label: L(`安排${cadenceText()}`, `Schedule ${cadenceText()}`) });
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
  const toast = P.toast;

  // ---------- Help: one tap away (mw-hint), never on the page ----------
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
  const hint = (id) => P.hint(id, HELP()[id]);
  // The assistant asks: its mark sits beside every question. No caption — the mark is the company.
  const head = (title, id) => `<header class="ob-q q-head">${avatar(ic("sparkles"))}<h1 id="ob-title" tabindex="-1">${title}</h1>${id ? hint(id) : ""}</header>`;

  // ---------- The project taking shape (「组件板新增」 draft card in the product's .ob-right) ----------
  const NOW = { goal: ["goal"], materials: ["mat"], model: ["model"], read: ["sum"], ask: ["audience", "cadence"], plan: ["who", "home"] };
  function forming() {
    const c = counts(), a = S.answers, now = NOW[S.step] || [];
    const reached = (id) => idx(id) !== -1 && idx(id) <= idx(S.step);
    const R = [];
    const add = (key, icon, hue, k, v, extra = "") => R.push({ key, icon, hue, k, v, extra });
    add("goal", "target", "blue", L("目的", "Goal"), S.goal.trim() ? esc(S.goal) : "");
    if (S.start === "materials") add("mat", "folder", "orange", L("材料", "Materials"), reached("materials") ? L(`${fmt(c.n)} 份`, `${fmt(c.n)} items`) : "");
    if (S.scenario !== "addscene") add("model", "sparkles", "purple", L("模型", "Model"), S.modelOk && !S.keyRefused ? "DeepSeek" : S.deferred ? L("稍后", "Later") : "");
    if (flow().includes("read")) add("sum", "note", "green", L("整理", "Summary"), { done: L("3 条待办", "3 to-dos"), deferred: L("稍后", "Later") }[S.read] || "", S.read === "reading" || S.read === "gen" ? spinner() : S.read === "fail" ? status("wait") : "");
    const aud = { me: L("自己", "Me"), team: a.channel === "slack" ? "Slack" : a.channel === "feishu" ? L("飞书", "Feishu") : L("团队", "Team"), public: L("公开", "Public") }[a.audience];
    add("audience", "send", "cyan", L("给谁看", "Reader"), aud || "");
    add("cadence", "clock", "pink", L("多久", "How often"), a.cadence ? (a.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText()) : "");
    const team = idx("ask") !== -1 && idx(S.step) >= idx("ask");
    add("who", "user", "indigo", L("谁来做", "Who"), team ? `<span class="cand-avatars">${D.members.filter((m) => !m.existing).map((m) => avatar(T(m.av), m.hue)).join("")}</span>` : "");
    add("home", "home", "slate", L("首页", "Home"), team ? badge("neutral", L("占位", "Placeholder")) : "");
    const filled = R.filter((r) => r.v).length;
    const title = S.scenario === "addscene" ? "产品研究" : S.goal.trim() ? projName() : "";
    return `<div class="cand-draft" role="region" aria-label="${L(`项目草稿，已就绪 ${filled} / ${R.length}`, `Project draft, ${filled} of ${R.length} ready`)}">
      <div class="cand-draft__head">${title ? monogram(title.slice(0, 1)) : `<span class="project-monogram is-empty" aria-hidden="true">${ic("plus")}</span>`}<strong class="${title ? "" : "is-ph"}">${title || L("新项目", "New project")}</strong>${ring(filled, R.length)}</div>
      ${R.map((r) => `<div class="cand-draft__row${now.includes(r.key) ? " is-now" : ""}${S.flash === r.key ? " is-flash" : ""}">${kind(r.icon, r.v || now.includes(r.key) ? r.hue : "mute")}<span class="k">${r.k}</span><span class="v">${r.v || '<span class="slot"></span>'}</span>${r.extra}</div>`).join("")}</div>`;
  }
  function codingMini(ready) {
    const typed = L("按品牌指南把首屏改成一句主张加一个主按钮", "Make the hero one statement and one main button, per the brand guide");
    return `<div class="coding-mini" role="img" aria-label="${L("Coding：你写的那句留在输入框里", "Coding: your sentence stays in the input")}">
      ${rows([row({ icon: kind("sparkles", "purple"), title: L("模型", "Model"), end: S.modelOk ? status("done", "DeepSeek") : status("fail", "—") }),
        row({ icon: kind("folder", "orange"), title: L("工作目录", "Working folder"), end: S.wdOk ? status("done", S.wdPick === "website" ? "website" : "brand-assets") : status("fail", "—") })])}
      <div class="q-goal"><div class="q-row"><span style="flex:1;min-width:0">${esc(typed)}</span>${btn({ variant: "primary", size: "sm", only: true, icon: "send", label: L("发送", "Send"), disabled: !ready })}</div></div></div>`;
  }

  // ---------- Steps ----------
  const split = (left, right, view) => `<div class="stage-single"><div class="stage-sheet welcome onboard" data-ob-view="${view}"><section class="welcome-q ob-left" data-scroll>${progressTop()}${left}</section><div class="welcome-scene"><section class="ob-right" data-scroll>${right}</section></div></div></div>`;
  function stepLang() {
    return { welcome: "language",
      left: `${head(L("语言", "Language"))}${choices(L("界面语言", "Interface language"), [{ label: "简体中文", on: S.lang === "zh", attrs: act("lang-set", "zh") }, { label: "English", on: S.lang === "en", attrs: act("lang-set", "en") }])}`,
      right: `<div class="ob-greeting"><strong lang="${S.lang}">${L("你好。", "Hello.")}</strong><span>Molis Work</span></div>`,
      primary: { label: L("继续", "Continue"), act: "next" } };
  }
  const miniRow = (g, w, s) => `<div class="ob-mini-row"><i>${ic(g)}</i><span><b style="width:${w}%"></b><s style="width:${s}%"></s></span></div>`;
  function stepLook() {
    return { welcome: "appearance",
      left: `${head(L("外观", "Appearance"))}${choices(L("主题", "Theme"), [["light", L("浅色", "Light"), "sun"], ["dark", L("深色", "Dark"), "moon"], ["system", L("跟随系统", "System"), "system"]].map(([v, t, i]) => ({ label: t, icon: i, on: S.look === v, attrs: act("look-set", v) })))}
        <p class="welcome-label">${L("界面密度", "Density")}</p>${choices(L("界面密度", "Density"), [["standard", L("标准", "Standard"), "rows"], ["compact", L("紧凑", "Compact"), "list"]].map(([v, t, i]) => ({ label: t, icon: i, on: S.density === v, attrs: act("density-set", v) })))}`,
      right: `<div class="ob-mini"><div class="ob-mini-surface"><b class="ob-mini-title"></b>${miniRow("target", 62, 40)}${miniRow("rss", 48, 58)}${miniRow("note", 70, 36)}</div><div class="ob-mini-bar"><span class="ob-mini-dock"><i></i><i class="is-on"></i><i></i></span><span class="ob-mini-composer"><i></i><em></em></span><span class="ob-mini-avatar"></span></div></div>`,
      primary: { label: L("继续", "Continue"), act: "next" } };
  }
  function stepGoal() {
    const add = S.scenario === "addscene";
    const empty = !S.goal.trim() && S.start !== "blank";
    const title = add ? L("这套做法要做成什么？", "What should this way of working do?") : S.scenario === "first" ? L("你想先做成什么？", "What would you like to get done first?") : L("新项目要做成什么？", "What should the new project do?");
    const starts = add ? "" : choices(L("从哪里开始", "Where to start"), [["materials", L("从已有材料", "From materials"), "folder-open"], ["goal", L("先说目标", "Goal first"), "target"], ["blank", L("空白", "Blank"), "file"]].map(([v, t, i]) => ({ label: t, icon: i, on: S.start === v, attrs: act("start", v) })));
    return {
      left: `${head(title, "goal")}
        <div class="q-goal"><input class="mw-input" data-slot="input" id="goal" autocomplete="off" aria-label="${L("目的", "Goal")}" placeholder="${L("每周跟踪 AI 产品，形成一份观察", "Track AI products weekly and write an observation")}" value="${esc(S.goal)}">
        <div class="q-row" role="group" aria-label="${L("例子", "Examples")}">${D.goalSuggestions.map((g) => btn({ size: "sm", icon: "plus", label: T(g), attrs: act("suggest", T(g)) })).join("")}</div></div>
        ${starts}${S.scenario === "first" ? `<div>${btn({ variant: "link", size: "sm", label: L("先不建项目", "Skip the project for now"), attrs: act("personal") })}</div>` : ""}`,
      right: forming(),
      primary: { label: S.start === "blank" ? L("建空项目", "Create empty project") : L("继续", "Continue"), act: "next", disabled: empty, reason: L("先写一句目的", "Write the goal first") },
    };
  }
  const extOf = (name) => { const d = name.lastIndexOf("."); return (d > 0 ? name.slice(d + 1) : "txt").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || "txt"; };
  const fileKind = (c, name) => (c.folder ? `<span class="mw-file-kind" data-slot="file-kind">${ic(c.kind === "image" ? "image" : "folder")}</span>` : `<span class="mw-file-kind mw-file-kind--${extOf(name)}" data-slot="file-kind">${extOf(name).toUpperCase()}</span>`);
  function fileRow(c, l) {
    const name = T(c.name);
    if (c.kind === "rest") return `<li class="mw-file-row" data-slot="file-row"><label class="mw-file-row__label"><input class="mw-check" data-slot="checkbox" type="checkbox"${attrs({ ...act("pick", c.id), checked: !!S.picks[c.id] })}><span class="mw-file-row__name">${L(`其余 ${fmt(c.n)} 项`, `${fmt(c.n)} more`)}</span></label>${btn({ size: "sm", variant: "ghost", label: L("显示", "Show"), attrs: act("toast", L("大清单分页显示，可以搜索、逐项勾选（原型不展开）", "Long lists page in with search (not built)")) })}</li>`;
    let tag;
    if (c.kind === "image") tag = badge("neutral", L(`${c.n} 张 · 只留引用`, `${c.n} · references`));
    else if (c.kind === "unreadable") tag = badge("warning", L("读不了正文", "Text unreadable"));
    else if (c.kind === "longpdf") tag = badge("warning", S.fullPdf ? L(`全读 ${c.pages} 页`, `All ${c.pages} pages`) : L("读前 20 页", "First 20 pages"));
    else if (c.dupOf && S.picks[c.dupOf] && S.picks[c.id]) tag = badge("neutral", L("重复", "Duplicate"));
    else tag = `<span class="mw-file-row__size">${c.n ? fmt(c.n) : c.size}</span>`;
    const detail = S.detail === c.id ? `<li class="mw-file-row__detail">${c.kind === "longpdf" ? `${L(`共 ${c.pages} 页，默认先读前 20 页。`, `${c.pages} pages; the first 20 are read by default.`)}<div class="q-row">${btn({ size: "sm", label: S.fullPdf ? L("只读前 20 页", "First 20 only") : L(`读全部 ${c.pages} 页`, `Read all ${c.pages}`), attrs: act("fullpdf") })}</div>` : c.kind === "unreadable" ? L("Keynote 正文现在读不了，原件留在原处；导出成 PDF 再加进来就能读。", "Keynote text can't be read; the original stays. Export to PDF to include it.") : c.kind === "image" ? L("图片不读文字，项目里只留引用。", "Images aren't read as text; references are kept.") : `<code>${l.path}/${esc(name)}</code>${c.dupOf ? ` · ${L("另一个位置也有，只算一次", "also elsewhere, counted once")}` : ""}`}</li>` : "";
    return `<li class="mw-file-row" data-slot="file-row"><span class="mw-file-row__label"><label class="mw-file-row__label"><input class="mw-check" data-slot="checkbox" type="checkbox"${attrs({ ...act("pick", c.id), checked: !!S.picks[c.id], "aria-label": name })}>${fileKind(c, name)}</label><button type="button" class="mw-btn mw-btn--link mw-btn--sm mw-file-row__name"${attrs({ ...act("detail", c.id), "aria-expanded": String(S.detail === c.id) })}>${esc(name)}</button></span>${tag}</li>${detail}`;
  }
  function stepMaterials() {
    const c = counts();
    const scanning = S.fault === "scanning";
    const add = S.scenario === "addscene";
    const narrowed = S.fault === "fail_timeout" && S.read === "fail" ? alert("warning", "", S.picks.gartner ? L("上次整理超时。少勾一点再继续，读好的不会重读。", "The last summary timed out. Tick less and continue; nothing read is read again.") : L("上次整理超时，已去掉「Gartner AI Agents 2026.pdf」（1.1 MB）。读好的不会重读。", "The last summary timed out; “Gartner AI Agents 2026.pdf” (1.1 MB) is now unticked. Nothing read is read again.")) : "";
    const groups = D.locations.map((l) => {
      const p = locPick(l), open = S.open[l.id];
      const isScan = scanning && l.id === "dl" && !S.scanStopped;
      const count = isScan ? `${status("run", `${fmt(l.scanFound)}…`)}${btn({ size: "sm", label: L("停止", "Stop"), attrs: act("scan-stop") })}`
        : scanning && l.id === "dl" ? `${status("wait", fmt(l.scanFound))}${btn({ size: "sm", label: L("继续", "Resume"), attrs: act("scan-resume") })}`
        : `<span class="mw-file-group__count">${fmt(l.total)}</span>`;
      const fold = btn({ variant: "ghost", size: "sm", only: true, icon: open ? "chevron-down" : "chevron-right", label: `${open ? L("收起", "Collapse") : L("展开", "Expand")} ${esc(T(l.name))}`, attrs: { ...act("open", l.id), "aria-expanded": String(!!open) } });
      return `<section class="mw-file-group" data-slot="file-group"><div class="mw-file-group__head"><label class="mw-file-group__pick" style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;cursor:pointer"><input class="mw-check" data-slot="checkbox" type="checkbox"${attrs({ ...act("pick-loc", l.id), checked: p === "all", "data-mixed": p === "some", "aria-label": T(l.name) })}><span class="mw-file-group__ic">${ic("folder")}</span><span class="mw-file-group__text"><strong>${esc(T(l.name))}</strong><small>${l.path}</small></span></label>${count}${fold}</div>
        ${open ? `<ul class="mw-file-list">${l.children.map((ch) => fileRow(ch, l)).join("")}${isScan ? `<li class="mw-file-row">${spinner()}<span class="mw-file-row__name" style="color:var(--muted)">${L("还在往下找…", "Still looking…")}</span></li>` : ""}</ul>` : ""}</section>`;
    }).join("");
    return {
      left: `${head(add ? L("还要加材料吗？", "Add more materials?") : L("带上哪些材料？", "Which materials come along?"), "materials")}${narrowed}
        <div class="q-count"><strong>${fmt(c.n)}</strong><span>${L(`份 · ${c.locs} 个位置`, `items · ${c.locs} locations`)}</span>${c.dup ? badge("neutral", L(`重复 ${c.dup} 份只算一次`, `${c.dup} duplicates counted once`)) : ""}</div>
        <div class="q-row">${btn({ icon: "plus", label: L("添加位置", "Add location"), attrs: act("toast", L("会打开系统的选文件夹窗口（原型不展开）", "Opens the folder picker (not built)")) })}${btn({ icon: "paperclip", label: L("添加文件", "Add files"), attrs: act("toast", L("会打开系统的选文件窗口（原型不展开）", "Opens the file picker (not built)")) })}</div>
        <div class="ob-notes">${note(L("只读勾选的，原文件不改", "Only ticked items are read; originals stay unchanged"), "shield")}</div>`,
      right: `<div role="group" aria-label="${L("材料", "Materials")}">${groups}</div>`,
      primary: { label: add ? L("继续", "Continue") : S.modelOk ? L("开始整理", "Start the summary") : L("继续", "Continue"), act: "next", disabled: c.n === 0, reason: L("至少勾一份", "Tick at least one") },
    };
  }
  function stepModel() {
    const fromHelp = S.scenario === "fromhelp";
    const ok = S.modelOk && !S.keyRefused;
    const live = ok || S.connected;
    const c = counts();
    const from = fromHelp ? [kind("code", "blue", "is-lg"), "Coding"] : [kind("folder", "orange", "is-lg"), L(`${fmt(c.n)} 份材料`, `${fmt(c.n)} materials`)];
    const right = `<div class="cand-bridge" role="img" aria-label="${live ? L("已连上模型", "Model connected") : L("还没有模型", "No model yet")}"><div class="cand-bridge__node">${from[0]}<span>${from[1]}</span></div><div class="cand-bridge__wire${live ? " is-live" : ""}"></div><div class="cand-bridge__node${live ? "" : " is-off"}">${kind(live ? "sparkles" : "question", live ? "purple" : "mute", "is-lg")}<span>${live ? "DeepSeek" : L("模型", "Model")}</span></div></div>`;
    if (ok) {
      return { right,
        left: `${head(L("用这个模型", "Use this model"), "model")}${rows([row({ icon: kind("sparkles", "purple"), title: "DeepSeek", caption: "deepseek-chat", end: status("done") + btn({ size: "sm", label: L("更换", "Switch"), attrs: act("model-change") }) })], "", "q-known")}`,
        primary: { label: fromHelp ? L("继续", "Continue") : L("开始整理", "Start the summary"), act: "next" } };
    }
    const refused = S.keyRefused ? alert("danger", "", L("上次的密钥被拒绝了（401）。换一把，或换个提供方；材料不用重读。", "The last key was refused (401). Use another key or provider; materials aren't read again.")) : "";
    return { right,
      left: `${head(L("连一个模型", "Connect a model"), "model")}${refused}
        <div class="q-col"><label class="mw-field" data-slot="field"><span class="mw-field__label">${L("提供方", "Provider")}</span><select class="mw-select" data-slot="select" id="prov" data-act="prov">${["deepseek:DeepSeek", "openai:OpenAI", "anthropic:Anthropic", "minimax:MiniMax"].map((p) => { const [v, t] = p.split(":"); return `<option value="${v}"${S.provider === v ? " selected" : ""}>${t}</option>`; }).join("")}</select></label>
          <label class="mw-field" data-slot="field"><span class="mw-field__label">${L("密钥", "API key")}</span><input class="mw-input" data-slot="input" id="key" type="password" autocomplete="off" placeholder="sk-…"></label>
          <div class="q-row">${btn({ label: L("检查连接", "Check"), disabled: S.checking, attrs: act("check") })}${S.checking ? status("run", L("检查中", "Checking")) : S.connected ? status("done", L("已连接", "Connected")) : ""}</div></div>
        <div class="ob-notes">${note(L("密钥只存在这台 Mac 的钥匙串里", "The key stays in this Mac's Keychain"), "lock")}</div>
        ${!fromHelp ? `<div>${btn({ variant: "link", size: "sm", label: L("先不连", "Not now"), attrs: act("defer") })}</div>` : ""}`,
      primary: { label: S.keyRefused ? L("回到整理", "Back to the summary") : fromHelp ? L("继续", "Continue") : L("开始整理", "Start the summary"), act: "model-done", disabled: !S.connected, reason: L("先检查连接", "Check the connection first") } };
  }
  function summaryHtml() {
    const cite = (t) => badge("neutral", t);
    return `<div class="ob-stage-head"><h2>${L("整理结果", "Summary")}</h2><span>${L("每句带出处", "each line cites its source")}</span></div>
      <section class="summary-sec">${kind("history", "blue")}<div><h3>${L("背景", "Background")}</h3><p>${L("你从 9 月起每两周写一次 AI 产品观察，跟 14 个订阅源和几份行业报告。", "Since September you write an AI product observation every two weeks, following 14 feeds and a few reports.")} ${cite("订阅源.opml")}</p></div></section>
      <section class="summary-sec">${kind("activity", "orange")}<div><h3>${L("进展", "Progress")}</h3><p>${L("10-27 那期停在「代理产品定价」；周会定了下期加竞品表。", "The 10-27 issue stopped at “agent pricing”; next issue adds the competitor table.")} ${cite("周会 10-28.md")}${S.picks.gartner ? ` ${cite("Gartner p.12")}` : ""}</p></div></section>
      <section class="summary-sec">${kind("check", "green")}<div><h3>${L("下一步", "Next")}</h3><ul><li><span>${L("补完定价一节", "Finish the pricing section")}</span>${cite("10-27 观察.md")}</li><li><span>${L("竞品表加 3 家", "Add 3 to the competitor table")}</span>${cite("竞品表.xlsx")}</li><li><span>${L("放进「试用转付费」", "Add “trial to paid”")}</span>${cite("访谈纪要-李.docx")}</li></ul></div></section>`;
  }
  // The product's two-phase list (.ob-phase, state ring from data-mw-state).
  const phase = (state, name, sub = "", end = "") => `<li class="ob-phase is-${state === "done" ? "done" : state === "todo" ? "todo" : "progress"}"><span class="ob-phase__mark" data-mw-state="${{ done: "done", run: "running", fail: "failed", wait: "waiting", todo: "idle" }[state]}"></span><span class="ob-phase__text"><strong>${name}</strong>${sub ? `<small>${sub}</small>` : ""}</span>${end ? `<span class="q-row">${end}</span>` : ""}</li>`;
  function stepRead() {
    const c = counts(), r = S.read;
    const p1 = r !== "reading" && r !== "idle";
    let failBlock = "";
    if (r === "fail") {
      const FS = {
        fail_auth: [L("密钥被拒绝了", "The key was refused"), L("可能过期了，或复制时少了字符。", "It may have expired or been copied short."), btn({ variant: "primary", size: "sm", label: L("更新密钥", "Update key"), attrs: act("key-refused") }), "HTTP 401 · invalid_api_key · call 7f3a-21c9"],
        fail_limit: [L("额度用完或请求太频繁", "Quota used up or too many requests"), S.retryIn ? L(`${S.retryIn} 秒后自动重试…`, `Retrying in ${S.retryIn}s…`) : L("约 1 分钟后能再试。", "Try again in about a minute."), S.retryIn ? btn({ size: "sm", label: L("取消", "Cancel"), attrs: act("retry-cancel") }) : btn({ variant: "primary", size: "sm", label: L("1 分钟后重试", "Retry in 1 min"), attrs: act("retry-wait") }) + btn({ size: "sm", label: L("换个模型", "Switch model"), attrs: act("key-refused") }), "HTTP 429 · rate_limit_exceeded · retry-after 60"],
        fail_timeout: [L("等了 90 秒没有返回", "No answer after 90 s"), L("这次约 1.9 MB，其中一份 PDF 占 1.1 MB。", "About 1.9 MB was sent; one PDF is 1.1 MB."), btn({ variant: "primary", size: "sm", label: L("少选一点", "Send less"), attrs: act("narrow") }) + btn({ size: "sm", label: L("重试", "Retry"), attrs: act("retry") }), "timeout 90s · request 1.9 MB · call 7f3a-21cb"],
      };
      const F = FS[S.fault] || FS.fail_timeout;
      failBlock = alert("danger", F[0], F[1], `<div class="q-row">${F[2]}${btn({ variant: "ghost", size: "sm", label: L("先往下走", "Carry on"), attrs: act("defer-after-fail") })}</div>${collapsible(L("技术细节", "Details"), `<code>${F[3]}</code>`)}`);
    }
    const delta = S.delta ? badge("neutral", `${[S.delta.added ? `+${S.delta.added}` : "", S.delta.removed ? `−${S.delta.removed}` : ""].filter(Boolean).join(" ")} · ${L("其余未重读", "rest reused")}`) : "";
    const s2 = r === "gen" ? "run" : r === "done" ? "done" : r === "fail" ? "fail" : r === "deferred" ? "wait" : "todo";
    const left = `${head(r === "done" ? L("整理好了", "Summed up") : r === "fail" ? L("整理没成", "The summary failed") : L("读取与整理", "Reading and summing up"), "read")}
      <ol class="ob-phases" role="list">${phase(p1 ? "done" : "run", L(`读 ${fmt(c.n)} 份`, `Read ${fmt(c.n)}`), "", p1 ? delta || (c.bad ? badge("warning", L(`${c.bad} 份读不了`, `${c.bad} unreadable`)) : "") : "")}
      ${phase(s2, r === "deferred" ? L("稍后整理", "Summary later") : L("整理", "Sum up"), "", r === "gen" ? btn({ size: "sm", label: L("停止", "Stop"), attrs: act("toast", L("已停止整理；材料保留", "Stopped; materials kept")) }) : r === "deferred" ? btn({ size: "sm", label: L("连模型", "Connect"), attrs: act("goto", "model") }) : "")}</ol>${failBlock}`;
    let card;
    if (r === "done") card = summaryHtml();
    else if (r === "fail" || r === "deferred") card = `<div class="kept">${kind("folder-open", "orange", "is-lg")}<strong>${L(`${fmt(c.n)} 份材料都已存好`, `${fmt(c.n)} materials saved`)}</strong><div class="q-row">${badge("neutral", `${L("文本", "Text")} ${c.text}`)}${badge("neutral", `${L("图片", "Images")} ${c.img}`)}${c.bad ? badge("warning", `${L("读不了", "Unreadable")} ${c.bad}`) : ""}</div></div>`;
    else card = `<div class="summary-skel" aria-hidden="true">${[52, 40, 30].map((w, i) => `<section class="summary-sec">${kind("note", "mute")}<div class="summary-skel"><span class="mw-skeleton" data-slot="skeleton" style="width:${w}%"></span><span class="mw-skeleton" data-slot="skeleton" style="width:${[88, 70, 80][i]}%"></span><span class="mw-skeleton" data-slot="skeleton" style="width:${[64, 50, 58][i]}%"></span></div></section>`).join("")}</div>`;
    const canGo = r === "done" || r === "deferred";
    return { left, right: `<div role="region" aria-label="${L("整理结果", "Summary")}" aria-busy="${r === "reading" || r === "gen"}">${card}</div>`,
      primary: { label: L("继续", "Continue"), act: "next", disabled: !canGo, reason: r === "fail" ? L("先选一种处理方式", "Choose an option first") : L("整理完就能继续", "Continue once done") } };
  }
  function stepAsk() {
    const a = S.answers;
    const known = [
      ["target", "blue", esc(goalText()), "goal"],
      S.scenario === "addscene" ? ["folder", "orange", L("项目里已有的 3 个位置", "The project's 3 locations"), "materials"] : ["rss", "orange", L("14 个订阅源", "14 feeds"), S.start === "materials" ? "materials" : null],
      ["note", "green", L("Pages 文档 · 约 1,500 字", "Pages doc · ~1,500 words"), null],
    ];
    const group = (key, label, opts) => `<fieldset class="q-fieldset"><legend>${label}</legend>${choices(label, opts.map(([v, t]) => ({ label: t, on: a[key] === v, attrs: act("answer", `${key}:${v}`) })))}</fieldset>`;
    let follow = "";
    if (a.audience === "team") follow = group("channel", L("发到哪里？", "Where?"), [["slack", "Slack"], ["feishu", L("飞书", "Feishu")], ["none", L("先不发", "Not yet")]]);
    if (a.audience === "public") follow = group("review", L("发布前你先过目？", "Review before publishing?"), [["yes", L("要", "Yes")], ["no", L("不用", "No")]]) + `<div class="ob-notes">${note(L("对外发布要另外授权，采用时不会打开", "Publishing needs a separate permission; adopting doesn't turn it on"), "shield")}</div>`;
    const resume = S.fault === "resume" && !S.dismissResume ? alert("", L("接着上次的继续。", "Picking up where you stopped."), "", `<div class="q-row">${btn({ size: "sm", label: L("从头看", "From the start"), attrs: act("goto", "goal") })}${btn({ variant: "ghost", size: "sm", only: true, icon: "x", label: L("关闭", "Close"), attrs: act("dismiss-resume") })}</div>`) : "";
    return {
      left: `${resume}${head(L("还差几件事", "A few more things"), "ask")}
        ${rows(known.map(([i, h, v, g]) => row({ icon: kind(i, h), title: v, end: g ? btn({ variant: "ghost", size: "sm", only: true, icon: "edit", label: L("改", "Edit"), attrs: act("goto", g) }) : "" })), L("已经知道", "Already known"), "q-known")}
        ${group("audience", L("给谁看？", "Who reads it?"), [["me", L("我自己", "Just me")], ["team", L("团队", "My team")], ["public", L("公开", "Public")]])}
        ${follow}
        ${group("cadence", L("多久一份？", "How often?"), [["weekly", L("每周一 9:00", "Mondays 9:00")], ["biweekly", L("每两周", "Every 2 weeks")], ["ondemand", L("要时再写", "On request")]])}
        <div>${btn({ variant: "link", size: "sm", label: L("用默认", "Use defaults"), attrs: act("skip-ask") })}</div>`,
      right: forming(),
      primary: { label: L("看方案", "See the plan"), act: "next" },
    };
  }
  function memberRow(m) {
    const conflict = S.scenario === "addscene" && m.id === "res";
    const conf = conflict ? alert("warning", L("项目里已有「研究员」", "A Researcher already exists"), "", choices(L("研究员", "Researcher"), [{ label: L("沿用", "Reuse"), on: S.resChoice === "reuse", attrs: act("res", "reuse") }, { label: L("复制一个", "Copy"), on: S.resChoice === "copy", attrs: act("res", "copy") }])) : "";
    return row({ icon: avatar(T(m.av), m.hue), title: T(m.name), caption: T(m.role), end: m.existing ? badge("neutral", L("已有", "Existing")) : btn({ variant: "ghost", size: "sm", only: true, icon: "edit", label: L("改", "Edit"), attrs: act("toast", L("成员编辑等第 03 批的助理路径（占位）", "Member editing waits for batch 03 (placeholder)")) }) }) + conf;
  }
  function mapTable() {
    const c = counts(), a = S.answers;
    const R = [
      ["sparkles", "purple", L("模型", "Model"), "DeepSeek", L("设置 › 模型", "Settings › Model")],
      ["note", "green", L("项目说明", "Description"), L("草稿 3 段", "3 paragraphs"), L("项目设置 › 常规", "Project › General")],
      ["folder", "orange", L("资料", "Materials"), S.start === "goal" ? "—" : L(`${fmt(c.n)} 份`, `${fmt(c.n)} items`), L("资料 › 输入与输出", "Materials › Inputs")],
      ["user", "indigo", L("成员", "Members"), S.resChoice === "reuse" ? L("沿用研究员 · 编辑", "Reused · Editor") : L("研究员 · 编辑", "Researcher · Editor"), L("项目设置 › 成员", "Project › Members")],
      ["database", "slate", L("记忆", "Memory"), L("跟个人设置", "Personal"), L("项目设置 › 记忆", "Project › Memory")],
      ["clock", "pink", L("生成", "When"), a.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText(), L("设置 › 助理", "Settings › Assistant")],
      ["send", "cyan", L("对外发送", "Sending"), L("不开", "Off"), L("设置 › 授权", "Settings › Permissions")],
    ];
    return `<table class="mw-table" data-slot="table"><thead><tr><th>${L("设置", "Setting")}</th><th>${L("这次", "Value")}</th><th>${L("以后在", "Change in")}</th></tr></thead><tbody>${R.map((r) => `<tr><td><span class="q-row">${kind(r[0], r[1])}${r[2]}</span></td><td>${r[3]}</td><td style="color:var(--muted)">${r[4]}</td></tr>`).join("")}</tbody></table>`;
  }
  function stepPlan() {
    const a = S.answers, missing = S.fault === "missing_dep", add = S.scenario === "addscene";
    const needRes = add && !S.resChoice;
    const items = adoptItems();
    const deps = [row({ icon: kind("note", "green"), title: "Pages", end: status("done") }),
      row({ icon: kind("rss", "cyan"), title: "Feed", caption: missing && S.depPreview ? L("Molis 官方 · 签名已验证。读你添加的订阅地址（联网），在本项目存条目。不读其他项目，不发送内容。", "Molis official · verified. Reads the feed addresses you add (network), stores items here. Reads no other project, sends nothing.") : "", end: missing ? badge("warning", L("未安装 · 采用时先装", "Not installed · adopt installs it")) + btn({ size: "sm", label: L("权限", "Permissions"), attrs: { ...act("dep-preview"), "aria-expanded": String(S.depPreview) } }) : status("done") })];
    if (a.channel === "slack") deps.push(row({ icon: kind("link", "slate"), title: "Slack", end: badge("neutral", L("没连 · 只影响发送", "Not connected · sending only")) + btn({ size: "sm", label: L("连接", "Connect"), attrs: act("toast", L("会在这里连接 Slack（原型不展开）", "Connects Slack here (not built)")) }) }));
    const label = add ? L("采用", "Adopt") : L("采用并新建项目", "Adopt and create");
    return {
      left: `${head(L(`「${sceneName()}」`, `“${sceneName()}”`), "plan")}
        ${rows([row({ icon: kind("target", "blue", "is-lg"), title: L("第一期：本周 AI 产品观察", "Issue 1: this week in AI"), caption: L("约 10 分钟", "~10 min") })], "", "q-known")}
        ${rows(items.map((x) => row({ icon: kind(x.icon, x.off ? "mute" : x.hue), title: x.label, end: x.off ? badge("neutral", L("不开", "Off")) : x.keep ? status("done") : "" })), L("采用会做的事", "What adopting does"), "q-known")}`,
      right: `<div role="region" aria-label="${L("方案", "Plan")}">
        <section class="scene-sec"><h3>${L("谁来做", "Who")}</h3>${rows(D.members.map(memberRow), "", "scene-list")}</section>
        <section class="scene-sec"><h3>${L("插件", "Plugins")}</h3>${rows(deps, "", "scene-list")}</section>
        <section class="scene-sec"><h3>${L("首页", "Home")}</h3>${rows([row({ icon: kind("home", "mute"), title: L("等第 03 批定样", "Waits for batch 03"), end: badge("neutral", L("占位", "Placeholder")) })], "", "scene-list")}</section>
        <section class="scene-sec"><h3>${L("设置", "Settings")}</h3>${mapTable()}</section></div>`,
      primary: { label, act: "next", disabled: needRes, reason: L("先定研究员", "Decide on the researcher first") },
    };
  }
  function stepAdopt() {
    const items = adoptItems();
    const anyFail = items.some((x) => S.adopt[x.id] === "fail");
    const live = items.filter((x) => !x.off && !x.keep);
    const n = live.filter((x) => S.adopt[x.id] === "done").length;
    const done = S.adopted;
    const list = items.map((x) => {
      const st = S.adopt[x.id] || "todo";
      const end = x.off ? badge("neutral", L("不开", "Off")) : x.keep ? status("done") : { skipped: status("wait", L("跳过", "Skipped")), todo: status("todo"), run: status("run"), done: status("done"), fail: status("fail", L("没成", "Failed")) }[st];
      const fail = st === "fail" ? alert("danger", "", L("Schedule 30 秒没回应，没建成，也不会重复建。", "Schedule didn't answer in 30 s; nothing was created or duplicated."), `<div class="q-row">${btn({ variant: "primary", size: "sm", label: L("重试", "Retry"), attrs: act("sched-retry") })}${btn({ size: "sm", label: L("跳过", "Skip"), attrs: act("sched-skip") })}</div>`) : "";
      return row({ icon: kind(x.icon, x.off || st === "todo" ? "mute" : x.hue), title: x.label, end }) + fail;
    });
    return {
      left: `${head(!done ? L("正在采用", "Adopting") : anyFail ? L("差一项", "One item left") : L("都办好了", "All done"), "adopt")}
        <div>${ring(n, live.length, anyFail ? "is-fail" : done ? "is-ok" : "", true)}</div>`,
      right: `<div role="region" aria-label="${L("采用结果", "Results")}" aria-busy="${!done}">${rows(list, "", "scene-list")}</div>`,
      primary: { label: L("进入项目", "Open the project"), act: "next", disabled: !done, reason: L("采用完就能进入", "Available when done") },
      prev: false,
    };
  }
  function stepWorkdir() {
    const p = S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets";
    return {
      left: `${head(L("Coding 在哪个文件夹里干活？", "Which folder does Coding work in?"), "workdir")}
        ${choices(L("工作目录", "Working folder"), [{ label: "~/code/website", icon: "git-branch", on: S.wdPick === "website", attrs: act("wd", "website") }, { label: "~/Design/brand-assets", icon: "folder", on: S.wdPick === "brand", attrs: act("wd", "brand") }])}
        <label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" data-act="wd-consent"${S.wdConsent ? " checked" : ""}><span>${L(`允许 Coding 在 <code>${p}</code> 里改文件、运行命令`, `Let Coding change files and run commands in <code>${p}</code>`)}</span></label>`,
      right: codingMini(false),
      primary: { label: L("用这个文件夹", "Use this folder"), act: "wd-done", disabled: !S.wdConsent, reason: L("先勾选授权", "Tick the permission first") },
    };
  }
  function stepBack() {
    return {
      left: `${head(L("补齐了", "All set"), "back")}${rows([row({ icon: kind("sparkles", "purple"), title: "DeepSeek", end: status("done") }), row({ icon: kind("folder", "orange"), title: `<code>${S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets"}</code>`, end: status("done") })], "", "q-known")}`,
      right: codingMini(true),
      primary: { label: L("回到 Coding", "Back to Coding"), act: "return" },
    };
  }
  const STEPS = { lang: stepLang, look: stepLook, goal: stepGoal, materials: stepMaterials, model: stepModel, read: stepRead, ask: stepAsk, plan: stepPlan, adopt: stepAdopt, workdir: stepWorkdir, back: stepBack };

  // ---------- The arrival frame (the product's own markup) ----------
  const { wordmark, caption } = P;
  const titlebar = (opening, tools = "") => `<header class="arrival-titlebar" data-region="titlebar"><span class="arrival-brand">${ic("brand")}${opening ? "" : wordmark(' data-state="done"')}</span><span class="arrival-spacer"></span><nav class="arrival-tools" aria-label="${L("全局", "Everywhere")}">${tools}</nav></header>`;
  function stepper() {
    const steps = flow().filter((x) => x !== "opening");
    const cur = steps.indexOf(S.step);
    return `<nav aria-label="${L(`第 ${cur + 1} 步，共 ${steps.length} 步`, `Step ${cur + 1} of ${steps.length}`)}"><ol class="cand-steps">${steps.map((id, i) => {
      const s = stepState(id);
      const locked = S.adopted && flow().includes("adopt") && idx(id) < idx("adopt");
      const can = !locked && s !== "cur" && s !== "todo";
      const cls = s === "done" || s === "reached" ? "is-done" : s === "wait" ? "is-wait" : "";
      return `<li class="${cls}"><button type="button" data-act="goto" data-arg="${id}"${can ? "" : " disabled"}${s === "cur" ? ' aria-current="step"' : ""}><span class="dot">${cls === "is-done" ? ic("check") : s === "wait" ? "!" : i + 1}</span><span class="name">${T(SHORT[id])}</span></button></li>`;
    }).join("")}</ol></nav>`;
  }
  function progressTop() {
    const steps = flow().filter((x) => x !== "opening"); const cur = steps.indexOf(S.step);
    return cur < 0 ? "" : `<div class="cand-progress" aria-hidden="true"><span>${cur + 1}/${steps.length} · ${T(SHORT[S.step])}</span>${progress(cur + 1, steps.length, "")}</div>`;
  }
  const primaryBtn = (p) => `${p.disabled && p.reason ? `<span class="mw-sr-only" id="primary-why">${p.reason}</span>` : ""}${btn({ variant: "primary", size: "lg", label: p.label, key: "↵", cls: "ob-continue", disabled: p.disabled, attrs: { id: "primary", "data-act": p.act, "aria-keyshortcuts": "Enter", "aria-describedby": p.disabled && p.reason ? "primary-why" : undefined, title: p.disabled ? p.reason : undefined } })}`;
  function immersive() {
    if (S.step === "opening") {
      return `<div class="arrival" data-workspace data-screen="opening">${titlebar(true)}
        <main class="arrival-stage"><div class="stage-single"><div class="stage-sheet opening${S.typed ? " is-ready is-done" : ""}" data-view="opening"><div class="opening-glow" aria-hidden="true"></div><div class="opening-copy"><div class="opening-caption">${caption()}</div><h1 class="ob-greeting-wordmark" id="ob-title" tabindex="-1">${wordmark(S.typed ? ' data-state="done"' : "")}</h1></div></div></div></main>
        <div class="workbench-bar arrival-bar" data-dock data-bar="welcome" aria-label="${L("底栏", "Bottom bar")}"><div class="bar-start">${btn({ variant: "ghost", size: "lg", label: L("稍后", "Later"), cls: "arrival-back", attrs: act("exit") })}</div><div class="bar-center"></div><div class="bar-end">${primaryBtn({ label: L("开始", "Begin"), act: "next" })}</div></div></div>`;
    }
    const d = STEPS[S.step]();
    const steps = flow();
    const prevId = steps[steps.indexOf(S.step) - 1];
    const prev = d.prev !== false && prevId && prevId !== "opening" ? btn({ variant: "secondary", size: "lg", icon: "back", label: L("上一步", "Back"), attrs: act("prev") }) : "";
    const exit = S.scenario === "first" ? btn({ variant: "ghost", size: "lg", label: L("稍后", "Later"), cls: "arrival-back", attrs: act("exit") })
      : S.scenario === "fromhelp" ? (S.step === "back" ? "" : btn({ variant: "ghost", size: "lg", icon: "back", label: "Coding", cls: "arrival-back", attrs: act("return-early") }))
      : btn({ variant: "ghost", size: "lg", icon: "back", label: L("项目", "Projects"), cls: "arrival-back", attrs: act("exit") });
    const themeTool = d.welcome ? `<span class="arrival-theme">${btn({ variant: "ghost", label: L("切换主题", "Switch theme"), icon: "switch", attrs: act("theme-toggle") })}</span>` : "";
    const stage = d.welcome
      ? `<div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="${d.welcome}"><section class="welcome-q">${progressTop()}${d.left}</section><aside class="welcome-scene" aria-hidden="true">${d.right}</aside></div></div>`
      : split(d.left, d.right, S.step);
    return `<div class="arrival" data-workspace data-screen="welcome">${titlebar(false, themeTool)}
      <main class="arrival-stage" data-plugin-stage>${stage}</main>
      <div class="workbench-bar arrival-bar" data-dock data-bar="welcome" aria-label="${L("底栏", "Bottom bar")}"><div class="bar-start">${exit}</div><div class="bar-center">${stepper()}</div><div class="bar-end">${prev}${primaryBtn(d.primary)}</div></div></div>`;
  }

  // ---------- After arriving: the workbench bar and the project brief (home is a placeholder until 03) ----------
  function workBar() {
    const typed = S.scenario === "fromhelp" ? L("按品牌指南把首屏改成一句主张加一个主按钮", "Make the hero one statement and one main button, per the brand guide") : "";
    const ready = S.scenario === "fromhelp" && S.returned;
    const plug = S.scenario === "fromhelp" ? ["code", "Coding", "coding"] : ["home", L("项目首页", "Project home"), "home"];
    const pins = S.scenario === "fromhelp" ? [["home", "home", L("项目首页", "Project home")], ["coding", "code", "Coding"]] : [["home", "home", L("项目首页", "Project home")], ["feed", "rss", "Feed"], ["pages", "note", "Pages"]];
    const mono = S.personal ? L("我", "Me") : S.scenario === "fromhelp" ? "官" : projName().slice(0, 1);
    const name = S.personal ? L("个人空间", "Personal space") : S.scenario === "fromhelp" ? "官网改版" : projName();
    return `<div class="workbench-bar" data-dock aria-label="${L("底栏", "Bottom bar")}">
      <div class="bar-start"><div class="plugin-picker"><button class="plugin-picker-trigger" type="button" aria-expanded="false" aria-label="${L("全部插件与 Dock", "All plugins and Dock")}" data-act="toast" data-arg="${esc(L("插件切换（原型不展开）", "Plugin switcher (not built)"))}"><span class="plugin-picker-all" aria-hidden="true">${ic("grid")}</span><span class="plugin-picker-current">${ic(plug[0])}<span>${plug[1]}</span></span>${ic("chevron-down")}</button></div><div class="dock-pins" role="toolbar" aria-label="${L("常驻插件", "Kept plugins")}">${pins.map(([id, g, t]) => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" aria-label="${t}" title="${t}"${id === plug[2] ? ' aria-current="page"' : ""}${attrs(act("toast", L("切换插件（原型不展开）", "Switches plugin (not built)")))}>${ic(g)}</button>`).join("")}</div></div>
      <div class="bar-center"><form class="assistant-composer bar-composer" aria-label="Molis Work Assistant" onsubmit="return false"><input class="assistant-composer-input" type="text" autocomplete="off" placeholder="${L("让助理做点什么…", "Ask the Assistant…")}" aria-label="${L("发给助理", "Message the Assistant")}" value="${esc(typed)}"><button class="bar-composer-attach" type="button" aria-label="${L("添加文件、引用或能力", "Add files, references or capabilities")}">${ic("paperclip")}</button>${btn({ variant: "primary", size: "sm", only: true, icon: "send", label: L("发送", "Send"), disabled: !ready && !!typed ? false : !ready, attrs: typed && !ready ? act("toast", L("还缺模型和工作目录", "Still missing a model and a folder")) : ready ? act("send") : {} })}</form></div>
      <div class="bar-end"><section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${L("当前项目", "Current project")}"><div class="navigator-project-primary"><details class="navigator-project-menu"><summary class="navigator-project-selector" aria-label="${L("切换项目", "Switch project")}">${monogram(mono)}<strong>${esc(name)}</strong>${ic("chevron-down")}</summary></details></div></section></div></div>`;
  }
  function landing() {
    if (S.personal) return `<article class="mw-brief" data-slot="brief"><div class="land-head">${avatar(ic("user"), "indigo")}<h1 class="mw-brief__title" tabindex="-1">${L("个人空间", "Personal space")}</h1></div><p class="mw-brief__desc">${L("在下面说要做什么就行。", "Just say what you need below.")}</p></article>`;
    if (S.start === "blank") return `<article class="mw-brief" data-slot="brief"><div class="land-head">${monogram("未")}<h1 class="mw-brief__title" tabindex="-1">${L("未命名项目", "Untitled project")}</h1></div>
      <div class="mw-empty" data-slot="empty"><span class="mw-empty__mark">${ic("folder-open")}</span><h2>${L("从这里开始", "Start here")}</h2><p>${L("加资料，或者在下面直接说要做什么。", "Add materials, or just say what to do below.")}</p><div class="mw-empty__actions">${btn({ icon: "folder-open", label: L("加资料", "Add materials"), attrs: act("toast", L("打开资料（原型不展开）", "Opens materials (not built)")) })}${btn({ icon: "sparkles", label: L("直接说要做什么", "Say what to do"), attrs: act("toast", L("把光标放进下面的输入框", "Focus the input below")) })}</div></div></article>`;
    const w = S.work, c = counts();
    const partial = S.adopt.sched === "fail";
    const seg = (i, text) => { const s = w === "done" ? "done" : (w === "run1" && i === 0) || (w === "run2" && i === 1) ? "doing" : (w === "run2" && i === 0) ? "done" : "todo"; return `<li data-s="${s}" style="--i:${i}" title="${esc(text)}"><span class="mw-goal-track__bar"></span><span class="mw-goal-track__name">${text}</span></li>`; };
    const doneCount = w === "done" ? 3 : w === "run2" ? 1 : 0;
    const st = w === "done" ? status("done", L("第一期已写好", "Issue 1 written")) : w !== "idle" ? status("run", L("在写第一期", "Writing issue 1")) : status("todo", L("准备好了", "Ready"));
    const link = (icon, hue, title, msg) => `<button type="button" class="mw-dir-row mw-dir-row--meta directory-list-row" data-slot="directory-row"${attrs(act("toast", msg))}><span class="mw-dir-row__icon">${kind(icon, hue)}</span><span class="mw-dir-row__copy"><span class="mw-dir-row__headline"><strong>${title}</strong></span></span>${ic("chevron-right")}</button>`;
    return `<article class="mw-brief" data-slot="brief" aria-labelledby="land-title">
      <div class="land-head">${monogram(projName().slice(0, 1))}<div><h1 class="mw-brief__title" id="land-title" tabindex="-1">${projName()}</h1><p class="q-row"><span class="q-row">${ic("folder")}${S.start === "goal" ? "—" : fmt(c.n)}</span><span class="q-row">${ic("user")}2</span><span class="q-row">${ic("clock")}${S.answers.cadence === "ondemand" ? L("要时", "On request") : cadenceText()}</span></p></div><span class="q-row">${st}${hint("work")}</span></div>
      ${partial ? alert("warning", "", L("每周安排还没建成。", "The weekly schedule isn't set yet."), `<div class="q-row">${btn({ size: "sm", label: L("重试", "Retry"), attrs: act("sched-retry-later") })}</div>`) : ""}
      <section class="mw-brief__focus"><header><span class="mw-brief__focus-label">${L("第一期", "Issue 1")}</span><span class="mw-brief__focus-count"><b>${doneCount}</b> / 3</span>${w === "done" ? btn({ variant: "primary", size: "sm", label: L("打开", "Open"), attrs: act("toast", L("在 Pages 打开（原型不展开）", "Opens in Pages (not built)")) }) : btn({ variant: "primary", size: "sm", icon: "play", label: L("开始", "Start"), disabled: w !== "idle", attrs: act("work-start") })}</header>
        <h2>${L("本周 AI 产品观察", "This week in AI products")}</h2>
        <ol class="mw-goal-track" data-slot="goal-track" role="img" aria-label="${doneCount} / 3">${seg(0, L("研究员读 14 个订阅源", "Researcher reads 14 feeds"))}${seg(1, L("编辑写成 Pages 文档", "Editor writes a Pages doc"))}${seg(2, L("你过目", "You review"))}</ol></section>
      <div class="mw-brief__cols">
        <section class="mw-brief__sec"><h2>${L("带进来的", "Brought in")}</h2><div class="mw-brief__list">${link("folder-open", "orange", S.start === "goal" ? L("还没有材料", "No materials yet") : L(`${fmt(c.n)} 份材料`, `${fmt(c.n)} materials`), L("打开项目资料（原型不展开）", "Opens materials (not built)"))}${link("note", "green", S.read === "done" ? L("摘要 · 3 条待办", "Summary · 3 to-dos") : L("摘要待整理", "Summary pending"), L("打开摘要（原型不展开）", "Opens the summary (not built)"))}</div></section>
        <section class="mw-brief__sec"><h2>${L("团队", "Team")}</h2><div class="mw-brief__list">${D.members.map((m) => row({ icon: avatar(T(m.av), m.hue), title: T(m.name) })).join("")}</div></section>
      </div>
      ${collapsible(`${L("以后再设", "Set up later")} · 4`, `<div class="mw-brief__list">${[["database", "slate", L("记忆", "Memory")], ["link", "cyan", L("能力与连接", "Capabilities")], ["folder", "orange", L("工作目录", "Working folder")], ["settings", "purple", L("助理规则与用量", "Assistant rules and usage")]].map(([i, h, t]) => link(i, h, t, L("打开对应设置（原型不展开）", "Opens that setting (not built)"))).join("")}</div>`)}
      <div class="ob-notes">${note(`${L("首页其余部分等第 03 批", "The rest of the home waits for batch 03")} · ${L("占位", "Placeholder")}`, "home")}</div></article>`;
  }
  function codingOrigin() {
    const ok = S.returned;
    return `<div class="coding-origin"><header class="ob-q q-head">${kind("code", "blue", "is-lg")}<h1 tabindex="-1">${ok ? L("可以开始了", "Ready to start") : L("还不能开始", "Can't start yet")}</h1>${ok ? "" : hint("origin")}</header>
      ${rows([row({ icon: kind("sparkles", "purple"), title: L("模型", "Model"), end: S.modelOk ? status("done", "DeepSeek") : status("fail", L("没有", "None")) }), row({ icon: kind("folder", "orange"), title: L("工作目录", "Working folder"), end: S.wdOk ? status("done", S.wdPick === "website" ? "website" : "brand-assets") : status("fail", L("没选", "Not chosen")) })], "", "q-known")}
      ${ok ? "" : `<div>${btn({ variant: "primary", size: "lg", label: L("补齐这两项", "Fill in both"), attrs: act("fill") })}</div>`}</div>`;
  }
  function workFrame(kindOf) {
    return `<div class="arrival" data-workspace data-screen="work">${titlebar(false)}
      <main class="arrival-stage"><div class="stage-single"><div class="stage-sheet"><div class="land-scroll" data-scroll>${kindOf === "coding" ? codingOrigin() : landing()}</div></div></div></main>${workBar()}</div>`;
  }

  // ---------- Render ----------
  let focusAfter = null, lastKey = null;
  function applyLook() {
    const theme = S.look === "system" ? "system" : S.theme;
    try { localStorage.setItem("molis-work:theme", theme); localStorage.setItem("molis-work:density", S.density); } catch { /* preview without storage */ }
    window.molisWorkPreferences?.sync();
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
  }
  function render() {
    applyLook();
    proto();
    const kindOf = S.scenario === "fromhelp" && (S.origin || S.returned) ? "coding" : S.step === "work" || S.personal ? "landing" : "journey";
    const key = `${S.scenario}|${S.step}|${kindOf}`;
    const moved = key !== lastKey;
    const sel = "[data-scroll]";
    const keep = !moved ? [...app.querySelectorAll(sel)].map((x) => x.scrollTop) : null;
    const openHint = app.querySelector(".mw-hint__tooltip:popover-open")?.id;
    app.innerHTML = kindOf === "journey" ? immersive() : workFrame(kindOf);
    document.body.dataset.arrival = kindOf === "journey" ? "onboard" : "work";
    if (keep) [...app.querySelectorAll(sel)].forEach((x, i) => { if (keep[i]) x.scrollTop = keep[i]; });
    if (openHint && !moved) document.getElementById(openHint)?.showPopover?.();
    lastKey = key;
    app.querySelectorAll("input[data-mixed]").forEach((x) => { x.indeterminate = true; });
    if (moved && !reduced) window.molisArrival?.cascade(app.querySelectorAll(".welcome-q > *, .ob-left > *"), { max: 8 });
    if (focusAfter === "h1") { const h = app.querySelector("#ob-title, .mw-brief__title, .coding-origin h1"); if (h) h.focus({ preventScroll: false }); }
    else if (focusAfter) { const el = app.querySelector(focusAfter); if (el) el.focus(); }
    focusAfter = null;
    S.flash = null;
    if (S.step === "opening" && kindOf === "journey") playOpening();
    save();
  }
  let typing = null;
  function finishTyping() {
    typing = null; S.typed = true;
    const mark = app.querySelector(".ob-greeting-wordmark .mw-wordmark");
    window.molisArrival?.settleWordmark(mark);
    app.querySelector(".opening")?.classList.add("is-done", "is-ready"); save();
  }
  function playOpening() {
    const arrival = window.molisArrival;
    arrival?.mountCaption(app.querySelector(".opening-caption [data-caption]"));
    if (S.typed || !arrival) { finishTyping(); return; }
    typing = arrival.typeWordmark(app.querySelector(".ob-greeting-wordmark .mw-wordmark"), { pace: "ritual", delay: 400, onDone: () => { typing = null; S.typed = true; app.querySelector(".opening")?.classList.add("is-done", "is-ready"); save(); } });
  }
  function proto() {
    const P = (zh, en) => (S.lang === "zh" ? zh : en);
    document.getElementById("p-title").textContent = P("原型 · 模拟数据", "Prototype · sample data");
    document.getElementById("p-scenario").textContent = P("场景", "Scenario");
    document.getElementById("p-fault").textContent = P("状态", "State");
    document.getElementById("p-lang").textContent = P("语言", "Language");
    document.getElementById("p-theme").textContent = P("外观", "Theme");
    document.getElementById("reset").querySelector("[data-slot=button-label]").textContent = P("从头再来", "Restart");
    const [l, d] = document.querySelectorAll("#theme .mw-toggle"); l.textContent = P("浅", "Light"); d.textContent = P("深", "Dark");
    document.getElementById("scenario").innerHTML = D.scenarios.map(([k, t]) => `<option value="${k}" ${S.scenario === k ? "selected" : ""}>${T(t)}</option>`).join("");
    document.getElementById("fault").innerHTML = D.faults.map(([k, t]) => `<option value="${k}" ${S.fault === k ? "selected" : ""}>${T(t)}</option>`).join("");
    const mark = (sel, on) => document.querySelectorAll(sel).forEach((b) => { const yes = on(b); b.setAttribute("aria-pressed", String(yes)); b.classList.toggle("is-current", yes); });
    mark("#lang .mw-toggle", (b) => b.dataset.lang === S.lang);
    mark("#theme .mw-toggle", (b) => b.dataset.themeSet === (S.look === "dark" || (S.look !== "light" && S.theme === "dark") ? "dark" : "light"));
  }
  function restart(keep) { clearTimers(); typing = null; S = init(fresh(keep)); focusAfter = "h1"; lastKey = null; render(); }

  // ---------- Events ----------
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; S.look = S.theme; render(); } });
  document.getElementById("scenario").addEventListener("change", (e) => restart({ lang: S.lang, theme: S.theme, fault: S.fault, scenario: e.target.value }));
  document.getElementById("fault").addEventListener("change", (e) => restart({ lang: S.lang, theme: S.theme, scenario: S.scenario, fault: e.target.value }));
  document.getElementById("reset").addEventListener("click", () => restart({ lang: S.lang, theme: S.theme, scenario: S.scenario, fault: S.fault }));

  app.addEventListener("input", (e) => {
    if (e.target.id !== "goal") return;
    S.goal = e.target.value;
    const b = document.getElementById("primary"); const empty = !S.goal.trim() && S.start !== "blank";
    if (b) b.disabled = empty;
    const r = app.querySelector(".cand-draft__row"); const v = r?.querySelector(".v");
    if (v) v.innerHTML = S.goal.trim() ? esc(S.goal) : '<span class="slot"></span>';
    const fh = app.querySelector(".cand-draft__head strong"); if (fh && S.scenario !== "addscene") { fh.textContent = S.goal.trim() ? projName() : L("新项目", "New project"); fh.classList.toggle("is-ph", !S.goal.trim()); }
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
    if (typing && !e.metaKey && !e.ctrlKey) { typing.skip?.(); finishTyping(); if (e.key === "Enter") e.preventDefault(); return; }
    if (e.key !== "Enter" || e.isComposing || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest(".proto")) return;
    if (["BUTTON", "A", "TEXTAREA", "SELECT", "SUMMARY"].includes(t.tagName) || (t.tagName === "INPUT" && t.type === "checkbox")) return;
    const p = document.getElementById("primary");
    if (p && !p.disabled) { e.preventDefault(); p.click(); }
  });
  app.addEventListener("click", (e) => {
    if (typing) { typing.skip?.(); finishTyping(); if (!e.target.closest("#primary")) return; }
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    const a = b.dataset.act, arg = b.dataset.arg;
    const A = {
      next() { if (S.step === "opening") S.typed = true; advance(); },
      prev: back,
      goto() { if (arg === "goal") S.dismissResume = true; go(arg, { keep: arg !== "read" }); },
      exit() { toast(L("已存草稿，下次从这里接着走", "Draft saved; you continue from here next time")); },
      "lang-set"() { S.lang = arg; },
      "look-set"() { S.look = arg; if (arg !== "system") S.theme = arg; },
      "density-set"() { S.density = arg; },
      "theme-toggle"() { S.theme = document.documentElement.dataset.resolvedTheme === "dark" ? "light" : "dark"; S.look = S.theme; },
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
      return() { S.returned = true; S.origin = true; toast(L("你写的那句还在，按发送就开始", "Your sentence is still there — press Send")); focusAfter = ".bar-composer .mw-btn--primary"; },
      send() { toast(L("已发给 Coding（原型到此为止）", "Sent to Coding (the prototype ends here)")); },
      toast() { toast(arg); },
    };
    if (A[a]) { A[a](); if (a !== "toast" && a !== "exit") render(); }
  });

  S = load();
  if (S.read === "reading" || S.read === "gen") { S.read = "idle"; S.readSig = null; if (S.step === "read") enterRead(); }
  if (S.step === "adopt" && !S.adopted) startAdopt();
  if (S.work === "run1" || S.work === "run2") S.work = "idle";
  render();
  window.protoJump = (patch) => { clearTimers(); Object.assign(S, patch); render(); };
  window.protoFlow = () => flow();
})();
