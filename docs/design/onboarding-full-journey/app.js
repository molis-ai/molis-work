// 04 · Onboarding full journey — standalone prototype. All data is sample data (data.js); timers stand in for reading,
// model calls and adoption. Nothing reads a folder, calls a model, stores a key or touches a Home.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.protoIcons;
  const app = document.getElementById("app");
  const KEY = "molis-proto.onboarding-full-journey.v1";

  const pickDefaults = () => Object.fromEntries(D.locations.flatMap((l) => l.children.map((c) => [c.id, c.pick])));
  const fresh = (keep = {}) => ({
    scheme: "A", scenario: "first", fault: "none", lang: "zh", theme: "light",
    ...keep,
    step: null, max: 0, goal: "", start: "materials", picks: pickDefaults(), open: { docs: true, dl: false, desk: false },
    detail: null, scanStopped: false, provider: "deepseek", keyTyped: false, checking: false, modelOk: null, keyRefused: false, deferred: false,
    read: "idle", readSig: null, delta: null, failCleared: false, retryIn: 0,
    answers: { audience: null, channel: null, review: null, cadence: null }, resChoice: null, depPreview: false,
    adopt: {}, adopting: false, adopted: false, work: "idle", laterGone: false,
    help: null, tipGone: false, view: "talk", focus: "main", origin: true, returned: false, wdPick: "website", wdOk: false, wdConsent: false, prepTab: "prep",
  });
  let S = null;
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.v === 1) return { ...fresh(), ...v.s }; } catch { /* preview without storage */ }
    return init(fresh());
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* preview without storage */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const fmt = (n) => n.toLocaleString(S.lang === "zh" ? "zh-CN" : "en-US");
  const st = (kind, text) => {
    const icon = { done: "status-done", fail: "status-blocked", todo: "dot", wait: "status-waiting" }[kind];
    return `<span class="st ${kind}">${kind === "run" ? '<span class="spin" aria-hidden="true"></span>' : ic(icon, "sm")}${text}</span>`;
  };
  const src = (kind, text) => `<span class="src ${kind}">${text}</span>`;
  const projName = () => (S.scenario === "addscene" ? "产品研究" : S.scenario === "fromhelp" ? "官网改版" : "AI 产品观察");
  const sceneName = () => L("每周 AI 产品观察", "Weekly AI product watch");

  // ---------- Journey model ----------
  function flow() {
    if (S.scenario === "fromhelp") return ["model", "workdir", "back"];
    if (S.start === "blank") return ["goal", "work"];
    let f = S.scenario === "addscene" ? ["goal", "materials", "ask", "plan", "adopt", "work"] : ["goal", "materials", "model", "read", "ask", "plan", "adopt", "work"];
    if (S.start === "goal") f = f.filter((x) => x !== "materials" && x !== "read");
    return f;
  }
  function init(s) {
    S = s;
    S.modelOk = S.scenario === "newproj" || S.scenario === "addscene";
    S.goal = S.scenario === "fromhelp" ? "" : D.goalSuggestions[0][0];
    if (S.scenario === "fromhelp") { S.step = "model"; S.origin = true; return S; }
    S.step = "goal";
    if (S.fault === "resume" && S.scenario !== "addscene") {
      S.modelOk = true; S.read = "done"; S.readSig = sig(); S.step = "ask"; S.max = flow().indexOf("ask");
    }
    if (S.fault === "resume" && S.scenario === "addscene") { S.step = "ask"; S.max = flow().indexOf("ask"); }
    return S;
  }
  const idx = (id) => flow().indexOf(id);
  function stepState(id) {
    const i = idx(id), cur = idx(S.step);
    if (id === S.step) return "cur";
    if (i < cur || i <= S.max) {
      if (i > cur) return "todo-reached";
      if (id === "model" && S.deferred) return "wait";
      if (id === "model" && (S.scenario === "newproj" || S.scenario === "addscene") && !S.keyRefused && !S.connected) return "reused";
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
  function next() { const f = flow(); const i = f.indexOf(S.step); if (i < f.length - 1) go(f[i + 1]); }
  function prev() { const f = flow(); const i = f.indexOf(S.step); if (i > 0) go(f[i - 1], { keep: true }); }

  // ---------- Materials ----------
  const all = () => D.locations.flatMap((l) => l.children.map((c) => ({ ...c, loc: l.id })));
  function counts() {
    let n = 0, img = 0, bad = 0, dup = 0, locs = new Set(), heavy = 0;
    for (const c of all()) {
      if (!S.picks[c.id]) continue;
      if (c.dupOf && S.picks[c.dupOf]) { dup += 1; continue; }
      const k = c.n || 1; n += k; locs.add(c.loc);
      if (c.kind === "image") img += k; if (c.kind === "unreadable") bad += k; if (c.heavy) heavy += 1;
    }
    return { n, img, bad, text: n - img - bad, dup, locs: locs.size, heavy };
  }
  function sig() { return all().filter((c) => S.picks[c.id]).map((c) => c.id).join(","); }
  function locPick(l) { const ch = l.children; const on = ch.filter((c) => S.picks[c.id]).length; return on === 0 ? "none" : on === ch.length ? "all" : "some"; }

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
      if (S.deferred) { S.read = "deferred"; S.readSig = sig(); return; }
      S.read = "gen";
      later(1400, () => { if (failing()) { S.read = "fail"; } else { S.read = "done"; S.readSig = sig(); } announce(S.read === "done" ? L("整理好了", "Summary ready") : L("整理没成功，材料已读好", "Summary failed; materials are read")); });
    });
  }
  function retryRead() { S.failCleared = true; S.read = "gen"; later(1300, () => { S.read = "done"; S.readSig = sig(); }); }
  function adoptItems() {
    const it = [];
    const proj = L("项目", "Project"), home = L("本机", "This Mac"), mine = L("本次", "This time");
    if (S.fault === "missing_dep") it.push({ id: "install", label: L("安装 Feed（Molis 官方，签名已验证）", "Install Feed (Molis official, signature verified)"), scope: home });
    if (S.scenario !== "addscene") it.push({ id: "project", label: L(`新建项目「${projName()}」`, `Create project “${projName()}”`), scope: proj });
    else it.push({ id: "keep", label: L("原有资料、成员和首页", "Existing materials, members and home"), scope: proj, keep: true });
    if (S.scenario !== "addscene" && S.start !== "goal") it.push({ id: "mat", label: S.read === "done" ? L(`带入 ${counts().n} 份材料、摘要和 3 条待办`, `Bring in ${counts().n} materials, the summary and 3 to-dos`) : L(`带入 ${counts().n} 份材料（摘要稍后整理）`, `Bring in ${counts().n} materials (summary later)`), scope: proj });
    it.push({ id: "brief", label: L("写项目说明", "Write the project description"), scope: proj });
    it.push({ id: "members", label: S.resChoice === "reuse" ? L("添加编辑；沿用已有的研究员", "Add the editor; keep the existing researcher") : L("添加研究员、编辑", "Add the researcher and editor"), scope: proj });
    it.push({ id: "feed", label: L("在本项目启用 Feed", "Turn on Feed in this project"), scope: proj });
    if (S.answers.cadence !== "ondemand") it.push({ id: "sched", label: L(`安排${cadenceText()}生成`, `Schedule a write-up ${cadenceText()}`), scope: proj });
    it.push({ id: "send", label: L("对外发送", "Sending outside"), scope: mine, off: true });
    return it;
  }
  function startAdopt() {
    S.adopting = true;
    const items = adoptItems().filter((x) => !x.off && !x.keep);
    items.forEach((x) => { if (S.adopt[x.id] !== "done") S.adopt[x.id] = "todo"; });
    let t = 300;
    for (const x of items) {
      if (S.adopt[x.id] === "done") continue;
      later(t, () => { S.adopt[x.id] = "run"; });
      t += 650;
      later(t, () => { S.adopt[x.id] = x.id === "sched" && S.fault === "adopt_partial" && !S.schedRetried ? "fail" : "done"; });
    }
    later(t + 50, () => { S.adopting = false; S.adopted = true; announce(L("采用结束", "Adoption finished")); });
  }
  function cadenceText() {
    return { weekly: L("每周一 9:00", "Mondays at 9:00"), biweekly: L("每两周一次", "every two weeks") }[S.answers.cadence || "weekly"] || L("每周一 9:00", "Mondays at 9:00");
  }
  function announce(msg) { document.getElementById("live").textContent = msg; }
  let toastTimer = null;
  function toast(msg) { document.querySelectorAll(".toast").forEach((x) => x.remove()); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.append(el); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3200); }

  // ---------- Help ----------
  const HELP = () => ({
    goal: [L("这一路会问什么", "What this will ask"), L("先说目的，我只问会影响结果、费用或权限的几件事。每一步都能退回来改；关掉窗口，下次打开从停下的地方接着走。也可以不建项目，直接在个人空间用。", "Say the goal first; I only ask what changes the result, cost or permissions. Every step can be revisited; close the window and the next visit picks up where you stopped. You can also skip the project and work in your personal space.")],
    materials: [L("读哪些、存在哪、怎么删", "What is read, where it lives, how to delete"), L("只读你勾选的文件；原文件不改。读到的文字存在这台 Mac 上这个项目里；整理时把选中文字交给你选的模型，图片只留引用。不想要了：设置 › 本机目录可以停止读取，设置 › 数据与存储可以导出或删除。", "Only ticked files are read; originals are not changed. Read text is stored on this Mac in this project; for the summary, the ticked text goes to the model you choose, images are kept as references only. To stop: Settings › Folders stops reading; Settings › Data and storage exports or deletes.")],
    model: [L("为什么要模型、费用怎么算", "Why a model, and what it costs"), L("读文件不用模型；整理摘要、补问和写方案要用。用的是你自己的账号，费用记在那个账号上；每次调用都能在「调用记录」里看到。这里和设置里的「模型」是同一份，改一处两边都变。", "Reading files needs no model; summarising, follow-up questions and the plan do. It runs on your own account and is billed there; every call shows in Call history. This is the same as Settings › Model — change one, both change.")],
    read: [L("摘要是怎么来的", "Where the summary comes from"), L("先把选中的文字读进来、存好，再交给模型整理。每句后面的小标记指向它来自哪份材料。整理失败不影响已读好的材料。", "Ticked text is read and saved first, then the model sums it up. The small tags after each line point to the material it came from. A failed summary does not affect what has been read.")],
    ask: [L("为什么问这几个", "Why these questions"), L("「给谁看」决定要不要连外部服务、要不要你授权发送；「多久一份」决定要不要排定时任务。别的我从材料里读到了，写在上面「已经知道」，不对就改。这里的回答只用于这一套做法，不会写成你的个人偏好。", "“Who reads it” decides whether an outside service and a send permission are needed; “how often” decides whether a schedule is set. The rest came from your materials and is listed under “Already known” — fix anything wrong. Answers apply to this way of working only, not to your personal defaults.")],
    plan: [L("采用会改什么", "What adopting changes"), L("现在什么都还没改。点采用后，每一项交给它真正的主人保存（模型在模型设置、成员在项目里、定时在 Schedule），一项一项显示结果。哪项没成就停在那项，已生效的不会重复建。", "Nothing has changed yet. Adopting hands each item to the place that really keeps it (model in model settings, members in the project, timing in Schedule) and shows the result one by one. If an item fails it stops there; what took effect is not created twice.")],
    adopt: [L("中途关掉会怎样", "What if I close it midway"), L("重新打开会从没完成的那项接着做。已生效的不会再建一次；结果不确定的那项会先核对再继续。", "Reopening continues from the unfinished item. What took effect is not created again; an item with an unknown result is checked before continuing.")],
    work: [L("配好了不等于做完了", "Set up is not the same as done"), L("上面的标签分开写「做法已配好」和「第一期还没写」。点开始后研究员和编辑才真正干活，写好了标签才变。", "The label keeps “set up” and “first issue not written” apart. The researcher and editor only work after you press Start; the label changes when the issue is written.")],
    workdir: [L("工作目录和资料文件夹有什么不同", "Working folder vs. material folders"), L("资料文件夹只读，用来参考；工作目录是 Coding 能改文件、跑命令的地方，一个项目只有一个。从资料里选一个当工作目录，要多给它「改」和「运行」两项授权。", "Material folders are read-only references; the working folder is where Coding may change files and run commands — one per project. Picking a material folder as the working folder adds the “change” and “run” permissions.")],
    origin: [L("Coding 为什么要这两项", "Why Coding needs these two"), L("Coding 要在一个文件夹里改代码（工作目录），还要一个模型来想怎么改。补齐以后回到这里，你写的那句还在输入框里。打开或关掉这段说明都不会改动任何设置。", "Coding changes code in one folder (the working folder) and needs a model to plan the change. After filling them in you come back here and your sentence is still in the input. Opening or closing this note changes no settings.")],
    back: [L("补齐的东西存在哪", "Where the filled-in items live"), L("模型存在设置 › 模型；工作目录存在项目设置 › 输入与输出。引导不另存一份。", "The model lives in Settings › Model; the working folder in Project settings › Inputs and output. The guide keeps no copy.")],
  });
  function helpBox(id) {
    if (S.help !== id) return "";
    const [h, p] = HELP()[id];
    const links = id === "materials" ? `<div class="acts"><button class="btn sm sec" data-act="toast" data-arg="${esc(L("会打开 设置 › 本机目录（原型不展开）", "Opens Settings › Folders (not built in the prototype)"))}">${L("本机目录", "Folders")}</button><button class="btn sm sec" data-act="toast" data-arg="${esc(L("会打开 设置 › 数据与存储（原型不展开）", "Opens Settings › Data and storage (not built in the prototype)"))}">${L("导出与删除", "Export and delete")}</button></div>` : "";
    return `<div class="help" role="region" aria-label="${esc(h)}"><h4>${ic("info", "sm")}<span class="grow">${h}</span><button class="btn icon sm ghost" data-act="help" data-arg="${id}" aria-label="${L("收起说明", "Close help")}">${ic("x", "sm")}</button></h4><p>${p}</p>${links}</div>`;
  }
  const helpBtn = (id) => `<button class="btn sm ghost" data-act="help" data-arg="${id}" aria-expanded="${S.help === id}" data-help-for="${id}">${ic("question", "sm")}${L("说明", "Help")}</button>`;

  // ---------- Step bodies (shared by all three options) ----------
  function head(title, lead, id) {
    return `<div class="hrow"><div class="grow"><h1 tabindex="-1">${title}</h1></div>${id ? helpBtn(id) : ""}</div>${lead ? `<p class="lead">${lead}</p>` : ""}${id ? helpBox(id) : ""}`;
  }
  function resumeBar() {
    if (S.fault !== "resume" || S.dismissResume || S.scenario === "fromhelp") return "";
    const c = counts();
    return `<div class="resume">${ic("history", "sm")}<span class="grow">${S.scenario === "addscene" ? L("接着上次的准备：停在「补几件事」，之前的回答都在。", "Picking up where you stopped: “A few questions”; earlier answers are kept.") : L(`接着上次的准备：停在「补几件事」。${c.locs} 个位置、${fmt(c.n)} 份材料和摘要都还在。`, `Picking up where you stopped: “A few questions”. ${c.locs} locations, ${fmt(c.n)} materials and the summary are all here.`)}</span><button class="btn sm sec" data-act="goto" data-arg="goal">${L("从第一步看起", "Review from the start")}</button><button class="btn icon sm ghost" data-act="dismiss-resume" aria-label="${L("关闭", "Close")}">${ic("x", "sm")}</button></div>`;
  }
  function footer(primary, opts = {}) {
    const back = idx(S.step) > 0 && !opts.noBack ? `<button class="btn sec" data-act="prev">${ic("back", "sm")}${L("返回", "Back")}</button>` : "";
    return `<div class="foot">${back}${opts.extra || ""}<span class="grow"></span>${opts.reason ? `<span class="fact">${opts.reason}</span>` : ""}${primary}</div>`;
  }

  function stepGoal() {
    const add = S.scenario === "addscene";
    const tip = S.scenario === "first" && !S.tipGone ? `<div class="tip">${ic("info", "sm")}<span class="grow">${L("第一次用：每一步都能退回来改，关掉窗口下次会接着走。", "First time: every step can be revisited, and closing the window keeps your place.")}</span><button class="btn sm sec" data-act="tip-gone">${L("知道了", "Got it")}</button></div>` : "";
    const starts = add ? "" : `<div class="box soft"><h3>${L("从哪里开始", "Where to start")}</h3><div class="choices" role="group">
      ${[["materials", "folder-open", L("从已有材料开始", "Start from materials you have"), L("选几个文件夹或文件，我先读一遍", "Pick folders or files; I read them first")], ["goal", "target", L("先说目标，材料以后补", "Goal first, materials later"), L("直接看方案，材料随时能加", "Go to the plan; add materials any time")], ["blank", "file", L("空白开始", "Start blank"), L("不读任何东西，建一个空项目", "Read nothing; create an empty project")]]
        .map(([k, i, a, b]) => `<button class="choice" data-act="start" data-arg="${k}" aria-pressed="${S.start === k}">${ic(i)}<span><strong>${a}</strong><span class="fact">${b}</span></span></button>`).join("")}
    </div>${S.scenario === "first" ? `<div class="acts" style="margin-top:10px"><button class="btn sm ghost" data-act="personal">${ic("user", "sm")}${L("先不建项目，在个人空间直接用", "Skip the project; work in my personal space")}</button></div>` : ""}</div>`;
    const empty = !S.goal.trim() && S.start !== "blank";
    return `<div class="stepbody">${tip}${head(add ? L("给「产品研究」加一套做法", "Add a way of working to 产品研究") : L("这次想做成什么？", "What do you want to get done?"), add ? L("项目里已有的资料、成员和首页都保留；新做法只补差异。", "Existing materials, members and home stay as they are; the new way of working only adds what differs.") : L("说一句就行。我按你的目的只问必要的几件事，边问边把做法拼出来。", "One sentence is enough. I ask only what your goal needs and assemble the way of working as we go."), "goal")}
      <textarea class="ask" id="goal" aria-label="${L("目的", "Goal")}" placeholder="${L("比如：每周跟踪 AI 产品，形成一份观察", "e.g. Track AI products weekly and write an observation")}">${esc(S.goal)}</textarea>
      <div class="pills" role="group" aria-label="${L("例子", "Examples")}">${D.goalSuggestions.map((g) => `<button class="pill" data-act="suggest" data-arg="${esc(g[0])}" aria-pressed="${S.goal === g[0]}">${T(g)}</button>`).join("")}</div>
      ${starts}
      ${footer(`<button class="btn primary" data-act="next" id="goal-next" ${empty ? "disabled" : ""}>${S.start === "blank" ? L("建空项目", "Create empty project") : L("继续", "Continue")}${ic("arrow", "sm")}</button>`, { reason: empty ? `<span id="goal-reason">${L("先写一句目的", "Write the goal first")}</span>` : "" })}</div>`;
  }

  function fileRow(c, l) {
    const name = T(c.name);
    let tag = "";
    if (c.kind === "image") tag = `<span class="tag">${L(`${c.n} 张图 · 只留引用`, `${c.n} images · kept as references`)}</span>`;
    else if (c.kind === "unreadable") tag = `<span class="tag warn">${L("读不了正文 · 原件保留", "Text unreadable · original kept")}</span>`;
    else if (c.kind === "longpdf") tag = `<span class="tag warn">${S.fullPdf ? L(`${c.pages} 页全读`, `All ${c.pages} pages`) : L(`${c.pages} 页 · 先读前 20 页`, `${c.pages} pages · first 20 read`)}</span>`;
    else if (c.dupOf && S.picks[c.dupOf] && S.picks[c.id]) tag = `<span class="tag">${L("重复，只算一次", "Duplicate, counted once")}</span>`;
    else if (c.n) tag = `<span class="fact">${L(`${c.n} 份`, `${c.n} items`)}</span>`;
    else tag = `<span class="fact">${c.size}</span>`;
    if (c.kind === "rest") return `<div class="fr"><input type="checkbox" data-act="pick" data-arg="${c.id}" ${S.picks[c.id] ? "checked" : ""} aria-label="${esc(name)}"><span class="nm" style="color:var(--muted)">${L(`其余 ${fmt(c.n)} 项没勾`, `${fmt(c.n)} more not ticked`)}</span><button class="btn sm ghost" data-act="toast" data-arg="${esc(L("大清单分页显示，可以搜索和逐项勾选（原型只演示这一行）", "Long lists page in, with search and per-item ticks (only this row in the prototype)"))}">${L("显示全部", "Show all")}</button></div>`;
    const detail = S.detail === c.id ? `<div class="note" style="margin:2px 0 6px 24px">${c.kind === "longpdf" ? `${L(`${c.pages} 页，默认先读前 20 页，避免一次交给模型太多。`, `${c.pages} pages; the first 20 are read by default so the model is not sent too much at once.`)}<div class="acts"><button class="btn sm sec" data-act="fullpdf">${S.fullPdf ? L("改回只读前 20 页", "Back to first 20 pages") : L("读全部 88 页", "Read all 88 pages")}</button></div>` : c.kind === "unreadable" ? L("Keynote 文件现在读不了正文。原件留在原处，项目里保留一条引用；可以导出成 PDF 再加进来。", "Keynote text can't be read yet. The original stays put and the project keeps a reference; export to PDF and add it to include the text.") : c.kind === "image" ? L("图片不读文字，只在项目里保留引用，可以随时打开原图。", "Images are not read as text; the project keeps references you can open any time.") : `${l.path}/${esc(name)} · ${c.size || ""}${c.dupOf ? ` · ${L("同一份文件也在别的位置，只算一次", "same file is in another location, counted once")}` : ""}`}</div>` : "";
    return `<div class="fr ${c.folder ? "" : ""}"><input type="checkbox" data-act="pick" data-arg="${c.id}" ${S.picks[c.id] ? "checked" : ""} aria-label="${esc(name)}">${ic(c.folder ? "folder" : c.kind === "image" ? "image" : "file", "sm")}<button class="nm" data-act="detail" data-arg="${c.id}" aria-expanded="${S.detail === c.id}">${esc(name)}</button>${tag}</div>${detail}`;
  }
  function stepMaterials() {
    const c = counts();
    const scanning = S.fault === "scanning";
    const narrowedHint = S.fault === "fail_timeout" && S.read === "fail" ? `<div class="note warn">${L("上次整理超时。取消勾选「Gartner AI Agents 2026.pdf」或少选一个位置再继续；已经读好的不用重读。", "Last summary timed out. Untick “Gartner AI Agents 2026.pdf” or drop a location, then continue; what was read is not read again.")}</div>` : "";
    const locs = D.locations.map((l) => {
      const p = locPick(l), open = S.open[l.id];
      const isScan = scanning && l.id === "dl" && !S.scanStopped;
      const count = isScan ? `<span class="st run"><span class="spin"></span>${L(`正在清点 · 已发现 ${fmt(l.scanFound)} 项`, `Listing · ${fmt(l.scanFound)} found`)}</span><button class="btn sm sec" data-act="scan-stop">${L("停止", "Stop")}</button>`
        : scanning && l.id === "dl" ? `<span class="st wait">${ic("pause", "sm")}${L(`已停止 · 保留已发现的 ${fmt(l.scanFound)} 项`, `Stopped · ${fmt(l.scanFound)} kept`)}</span><button class="btn sm sec" data-act="scan-resume">${L("继续清点", "Keep listing")}</button>`
        : `<span class="fact">${L(`${fmt(l.total)} 项`, `${fmt(l.total)} items`)}</span>`;
      return `<div class="loc"><div class="loc-h"><input type="checkbox" data-act="pick-loc" data-arg="${l.id}" ${p === "all" ? "checked" : ""} ${p === "some" ? 'data-mixed="1"' : ""} aria-label="${esc(T(l.name))}"><button class="twist" data-act="open" data-arg="${l.id}" aria-expanded="${!!open}" aria-label="${open ? L("收起", "Collapse") : L("展开", "Expand")} ${esc(T(l.name))}">${ic("chevron-right", "sm")}</button>${ic("folder")}<span class="nm"><strong>${esc(T(l.name))}</strong><span class="fact">${l.path}</span></span>${count}</div>
        ${open ? `<div class="loc-b">${l.children.map((ch) => fileRow(ch, l)).join("")}${isScan ? `<div class="fr"><span class="spin"></span><span class="nm" style="color:var(--muted)">${L("还在往下找，找到的会接着出现；已勾的可以先用", "Still looking; new items keep appearing, ticked ones can be used now")}</span></div>` : ""}</div>` : ""}</div>`;
    }).join("");
    const ignored = D.locations.reduce((a, l) => a + l.ignored, 0) + 22;
    const tally = `<div class="tally">${ic("check", "sm")}<span><b>${L(`已选 ${c.locs} 个位置 · ${fmt(c.n)} 份`, `${c.locs} locations · ${fmt(c.n)} items ticked`)}</b>${c.dup ? `<span class="fact"> · ${L(`重复 ${c.dup} 份只算一次`, `${c.dup} duplicates counted once`)}</span>` : ""}${scanning && !S.scanStopped ? `<span class="fact"> · ${L("「下载」还在清点，总数还不确定", "Downloads still listing; total not known yet")}</span>` : ""}</span><span class="grow"></span><button class="link" data-act="toast" data-arg="${esc(L(".DS_Store、隐藏文件、node_modules、.git 等默认不读；规则可以在设置 › 本机目录里查看和改", ".DS_Store, hidden files, node_modules, .git etc. are skipped by default; see and change the rule in Settings › Folders"))}">${L(`默认不读 ${ignored} 项`, `${ignored} skipped by default`)}</button></div>`;
    const add = S.scenario === "addscene";
    return `<div class="stepbody">${head(add ? L("要不要再加材料？", "Add more materials?") : L("带上哪些材料？", "Which materials should come along?"), add ? L("项目里已有的 3 个位置都在下面，已勾上；新做法会一起用。不加也行。", "The project's 3 locations are below, already ticked; the new way of working uses them too. Adding more is optional.") : L("可以同时选几个位置，也可以只勾其中几份。现在只看文件名，开始整理后才读正文。", "Pick several locations at once, or just a few items. Only names are listed now; text is read when the summary starts."), "materials")}
      ${narrowedHint}${locs}
      <div class="acts"><button class="btn sm sec" data-act="toast" data-arg="${esc(L("会打开系统的选文件夹窗口（原型不展开）", "Opens the system folder picker (not built in the prototype)"))}">${ic("plus", "sm")}${L("添加位置", "Add location")}</button><button class="btn sm sec" data-act="toast" data-arg="${esc(L("会打开系统的选文件窗口（原型不展开）", "Opens the system file picker (not built in the prototype)"))}">${ic("paperclip", "sm")}${L("单独选文件", "Pick files")}</button></div>
      ${tally}
      <div class="box soft"><h3>${ic("lock", "sm")}${L("读取说明", "About reading")}</h3><div class="fact" style="color:var(--ink-soft)">${L("只读勾选的；原文件不改。整理时把选中的文字交给你选的模型，图片只留引用。读到的内容存在这台 Mac 上这个项目里。", "Only ticked items are read; originals are not changed. For the summary, ticked text goes to the model you choose; images stay references. What is read is stored on this Mac in this project.")} <button class="link" data-act="help" data-arg="materials">${L("存在哪、怎么删", "Where, and how to delete")}</button></div></div>
      ${footer(`<button class="btn primary" data-act="next" ${c.n === 0 ? "disabled" : ""}>${add ? L("继续", "Continue") : S.modelOk ? L("开始整理", "Start the summary") : L("继续：选模型", "Continue: choose a model")}${ic("arrow", "sm")}</button>`, { reason: c.n === 0 ? L("至少勾一份", "Tick at least one") : scanning && !S.scanStopped ? L("先用已清点的继续", "Continue with what is listed") : "" })}</div>`;
  }

  function stepModel() {
    const fromHelp = S.scenario === "fromhelp";
    if (S.modelOk && !S.keyRefused) {
      return `<div class="stepbody">${head(L("用哪个模型？", "Which model?"), L("你已经有能用的模型，直接用它；要换也可以。", "You already have a working model; use it, or switch."), "model")}
        <div class="box"><div class="ln">${ic("sparkles")}<span class="nm">DeepSeek · deepseek-chat</span>${st("done", L("已连接", "Connected"))}${src("def", S.connected ? L("刚连上", "Just connected") : L("个人设置", "Personal settings"))}<button class="btn sm sec" data-act="model-change">${L("更换", "Switch")}</button></div></div>
        <p class="fact">${L("这里和设置里的「模型」是同一份；在这里改，设置里也会变。", "This is the same setting as Settings › Model; changing it here changes it there.")}</p>
        ${footer(`<button class="btn primary" data-act="next">${fromHelp ? L("继续", "Continue") : L("开始整理", "Start the summary")}${ic("arrow", "sm")}</button>`)}</div>`;
    }
    const refused = S.keyRefused ? `<div class="note err">${L("上次的密钥被 DeepSeek 拒绝了（401）。换一把密钥或换个提供方；材料已读好，回去后不用重读。", "DeepSeek refused the last key (401). Use another key or provider; materials are already read and won't be read again.")}</div>` : "";
    const checking = S.checking ? st("run", L("正在检查连接…", "Checking…")) : S.connected ? st("done", L("已连接 · 读到 3 个可用模型", "Connected · 3 models available")) : "";
    const lead = fromHelp ? L("Coding 想改代码前要先想怎么改，需要一个模型。连好以后自动回到这里的下一项。", "Coding needs a model to plan a change. Once connected you move on to the next item here.") : L("读文件不用模型，整理摘要要用。连好以后接着往下走，前面选的材料都在。", "Reading needs no model; the summary does. Once connected you carry on, and the materials you picked stay.");
    return `<div class="stepbody">${head(L("连一个模型", "Connect a model"), lead, "model")}${refused}
      <div class="box"><div class="frm">
        <label for="prov">${L("提供方", "Provider")}</label><select class="fld" id="prov" data-act="prov"><option value="deepseek" ${S.provider === "deepseek" ? "selected" : ""}>DeepSeek</option><option value="openai" ${S.provider === "openai" ? "selected" : ""}>OpenAI</option><option value="anthropic" ${S.provider === "anthropic" ? "selected" : ""}>Anthropic</option><option value="minimax" ${S.provider === "minimax" ? "selected" : ""}>MiniMax</option><option disabled>${L("本机模型（还不能用）", "On-device model (not available yet)")}</option></select>
        <label for="key">${L("密钥", "API key")}</label><input class="fld" id="key" type="password" autocomplete="off" placeholder="${L("粘贴密钥（原型不会保存）", "Paste key (the prototype does not keep it)")}">
      </div><p class="fact" style="margin:8px 0 0">${ic("lock", "sm")} ${L("密钥只存在这台 Mac 的钥匙串里，不进方案，也不随导出带走。", "The key is kept only in this Mac's Keychain — never in a plan or an export.")}</p>
      <div class="acts" style="margin-top:10px"><button class="btn sec" data-act="check" ${S.checking ? "disabled" : ""}>${L("检查连接", "Check connection")}</button>${checking}</div></div>
      ${!fromHelp ? `<div class="acts"><button class="btn sm ghost" data-act="defer">${L("先不连，带入材料稍后整理", "Skip for now; bring materials in and sum up later")}</button></div>` : ""}
      ${footer(`<button class="btn primary" data-act="model-done" ${S.connected ? "" : "disabled"}>${S.keyRefused ? L("回到整理", "Back to the summary") : fromHelp ? L("继续", "Continue") : L("开始整理", "Start the summary")}${ic("arrow", "sm")}</button>`, { reason: S.connected ? "" : L("先检查连接", "Check the connection first"), noBack: fromHelp })}</div>`;
  }

  function summaryHtml(old) {
    const cite = (t) => `<span class="cite">${ic("link", "sm")}${t}</span>`;
    const gart = S.picks.gartner;
    return `<div class="summary ${old ? "old" : ""}">
      <p><b>${L("背景", "Background")}</b> ${L("你从 9 月起每两周写一次 AI 产品观察，跟 14 个订阅源和几份行业报告。", "Since September you write an AI product observation every two weeks, following 14 feeds and a few industry reports.")} ${cite("订阅源.opml")} ${cite("2026-10 观察.md")}</p>
      <p><b>${L("进展", "Progress")}</b> ${L("10-27 那期写到一半，停在「代理产品定价」一节；周会上定了下一期加竞品表。", "The 10-27 issue stopped halfway at “agent pricing”; the weekly meeting agreed to add the competitor table next.")} ${cite("2026-10-27 观察.md")} ${cite("周会 10-28.md")}${gart ? ` ${cite("Gartner…pdf p.12")}` : ""}</p>
      <p><b>${L("下一步", "Next")}</b></p>
      <div class="ln">${ic("dot", "sm")}<span class="nm">${L("补完 10-27 那期的定价一节", "Finish the pricing section of the 10-27 issue")}</span>${cite("2026-10-27 观察.md")}</div>
      <div class="ln">${ic("dot", "sm")}<span class="nm">${L("竞品表加上 3 家新出的代理产品", "Add 3 new agent products to the competitor table")}</span>${cite("竞品表.xlsx")}</div>
      <div class="ln">${ic("dot", "sm")}<span class="nm">${L("访谈里李提到的「试用转付费」放进下期", "Put Li's “trial to paid” point from the interview in the next issue")}</span>${cite("访谈纪要-李.docx")}</div></div>`;
  }
  function stepRead() {
    const c = counts();
    const r = S.read;
    const p1done = r !== "reading" && r !== "idle";
    const phase1 = `<div class="phase ${p1done ? "done" : "run"}"><span class="ico">${p1done ? ic("check", "sm") : '<span class="spin"></span>'}</span><div class="bd"><strong>${p1done ? L(`读好了 ${fmt(c.n)} 份材料`, `${fmt(c.n)} materials read`) : L(`正在读 ${fmt(c.n)} 份材料…`, `Reading ${fmt(c.n)} materials…`)}</strong><p>${L(`文字 ${c.text} 份 · 图片 ${c.img} 张只留引用${c.bad ? ` · ${c.bad} 份读不了正文（原件还在）` : ""}`, `${c.text} text · ${c.img} images as references${c.bad ? ` · ${c.bad} unreadable (original kept)` : ""}`)}</p>${S.delta ? `<p>${[S.delta.added ? L(`补读 ${S.delta.added} 份`, `${S.delta.added} added`) : "", S.delta.removed ? L(`去掉 ${S.delta.removed} 份`, `${S.delta.removed} removed`) : ""].filter(Boolean).join(L("、", ", "))}${L("；其余沿用，没有重读。", "; the rest reused without reading again.")}</p>` : ""}</div></div>`;
    let phase2 = "";
    if (r === "reading") phase2 = `<div class="phase"><span class="ico">${ic("dot", "sm")}</span><div class="bd"><strong style="color:var(--muted)">${L("整理背景、进展和下一步", "Sum up background, progress and next steps")}</strong><p>${L("读完就开始", "Starts after reading")}</p></div></div>`;
    else if (r === "gen") phase2 = `<div class="phase run"><span class="ico"><span class="spin"></span></span><div class="bd"><strong>${L("正在用 DeepSeek 整理背景、进展和下一步", "DeepSeek is summing up background, progress and next steps")}</strong><p>${L("材料已经存好；这一步没成也不会丢。", "Materials are saved; nothing is lost if this step fails.")}</p><div class="acts"><button class="btn sm sec" data-act="toast" data-arg="${esc(L("已停止整理；材料保留，可以稍后再整理", "Summary stopped; materials kept, sum up later"))}">${L("停止", "Stop")}</button></div></div></div>`;
    else if (r === "deferred") phase2 = `<div class="phase"><span class="ico">${ic("status-waiting", "sm")}</span><div class="bd"><strong>${L("还没整理：没有连模型", "Not summed up yet: no model connected")}</strong><p>${L("材料已经读好，可以先带进项目；连上模型后在项目里接着整理。这里不会显示假的摘要。", "Materials are read and can go into the project now; connect a model later to sum up there. No placeholder summary is shown.")}</p><div class="acts"><button class="btn sm sec" data-act="goto" data-arg="model">${L("现在连模型", "Connect a model now")}</button></div></div></div>`;
    else if (r === "fail") {
      const F = {
        fail_auth: [L("DeepSeek 拒绝了这把密钥", "DeepSeek refused this key"), L("服务返回「密钥无效」。可能过期了，或复制时少了字符。材料已读好，不用重读。", "The service said “invalid key”. It may have expired or been copied short. Materials are read; no need to read again."), `<button class="btn sm primary" data-act="key-refused">${L("更新密钥", "Update key")}</button><button class="btn sm sec" data-act="key-refused">${L("换个模型", "Switch model")}</button>`, "HTTP 401 · invalid_api_key · call 7f3a-21c9"],
        fail_limit: [L("DeepSeek 暂时不让用：额度用完或请求太频繁", "DeepSeek is unavailable for now: quota used up or too many requests"), S.retryIn ? L(`${S.retryIn} 秒后自动重试（原型缩短了等待）…`, `Retrying in ${S.retryIn}s (shortened in the prototype)…`) : L("服务建议约 1 分钟后再试。材料已读好。", "The service suggests trying again in about a minute. Materials are read."), S.retryIn ? `<button class="btn sm sec" data-act="retry-cancel">${L("取消自动重试", "Cancel auto-retry")}</button>` : `<button class="btn sm primary" data-act="retry-wait">${L("1 分钟后自动重试", "Retry automatically in 1 min")}</button><button class="btn sm sec" data-act="key-refused">${L("换个模型", "Switch model")}</button>`, "HTTP 429 · rate_limit_exceeded · retry-after 60 · call 7f3a-21ca"],
        fail_timeout: [L("等了 90 秒没有返回", "No answer after 90 seconds"), L(`这次交给模型 ${c.text} 份文字、约 1.9 MB，其中「Gartner AI Agents 2026.pdf」就占了 1.1 MB。少选一点会快很多。`, `${c.text} text items, about 1.9 MB, went to the model; “Gartner AI Agents 2026.pdf” alone is 1.1 MB. Sending less will be much faster.`), `<button class="btn sm primary" data-act="narrow">${L("缩小范围", "Narrow the scope")}</button><button class="btn sm sec" data-act="retry">${L("原样重试", "Retry as is")}</button><button class="btn sm sec" data-act="key-refused">${L("换个模型", "Switch model")}</button>`, "timeout after 90s · request 1.9 MB · call 7f3a-21cb"],
      }[S.fault];
      phase2 = `<div class="phase fail" role="alert"><span class="ico">${ic("alert", "sm")}</span><div class="bd"><strong>${F[0]}</strong><p>${F[1]}</p><div class="acts">${F[2]}<button class="btn sm ghost" data-act="defer-after-fail">${L("先带着材料往下走", "Carry on with the materials")}</button></div><details class="tech"><summary>${L("技术细节", "Technical details")}</summary><code>${F[3]}</code></details></div></div>`;
    } else if (r === "done") phase2 = `<div class="phase done"><span class="ico">${ic("check", "sm")}</span><div class="bd"><strong>${L("整理好了", "Summed up")}${S.delta ? ` <span class="tag">${L("按新范围重新整理", "Redone for the new scope")}</span>` : ""}</strong><p>${L("每句后面的小标记是出处；不对的地方可以在项目里改。", "Tags after each line show the source; fix anything in the project later.")}</p></div></div><div class="box">${summaryHtml(false)}</div>`;
    const canGo = r === "done" || r === "deferred";
    return `<div class="stepbody">${head(r === "done" ? L("材料读好了，这是整理结果", "Materials read — here is the summary") : L("读取和整理", "Reading and summing up"), "", "read")}${phase1}${phase2}
      ${footer(`<button class="btn primary" data-act="next" ${canGo ? "" : "disabled"}>${L("继续：补几件事", "Continue: a few questions")}${ic("arrow", "sm")}</button>`, { reason: canGo ? "" : r === "fail" ? L("选上面一种处理方式", "Choose one of the options above") : L("整理完就能继续", "Continue once it is done") })}</div>`;
  }

  function stepAsk() {
    const a = S.answers;
    const known = [
      [L("目的", "Goal"), esc(S.goal || D.goalSuggestions[0][0]), src("ans", L("你的回答", "Your answer")), "goal"],
      [L("来源", "Sources"), L("14 个订阅源、Product Hunt", "14 feeds, Product Hunt"), src("mat", L("来自 订阅源.opml", "From 订阅源.opml")), "materials"],
      [L("写成什么", "Output"), L("一篇 Pages 文档，约 1,500 字", "One Pages document, about 1,500 words"), src("mat", L("照以前几期", "Like past issues")), null],
    ];
    if (S.scenario === "addscene") known[1] = [L("来源", "Sources"), L("项目里已有的 3 个位置", "The project's 3 locations"), src("def", L("项目资料", "Project materials")), "materials"];
    const pills = (key, opts) => `<div class="pills" role="radiogroup">${opts.map(([v, t]) => `<button class="pill" role="radio" data-act="answer" data-arg="${key}:${v}" aria-checked="${a[key] === v}">${t}</button>`).join("")}</div>`;
    let follow = "";
    if (a.audience === "team") follow = `<div class="box"><h3>${L("发到哪里？", "Where should it go?")}</h3>${pills("channel", [["slack", "Slack #ai-watch"], ["feishu", L("飞书群", "Feishu group")], ["none", L("先不发，只写好", "Don't send yet; just write it")]])}${a.channel === "slack" ? `<p class="fact" style="margin:8px 0 0">${L("要连 Slack。没连上只影响「发出去」这一步，写还是照常写。", "Needs Slack. If it isn't connected, only sending is affected; writing goes ahead.")}</p>` : ""}</div>`;
    if (a.audience === "public") follow = `<div class="box"><h3>${L("发布前要不要你先过目？", "Review before publishing?")}</h3>${pills("review", [["yes", L("每期我先看", "I review every issue")], ["no", L("不用", "No need")]])}<p class="fact" style="margin:8px 0 0">${L("对外发布要你另外授权；这里只记下意愿，采用时不会打开发布。", "Publishing needs a separate permission; this only records the wish and adopting does not turn publishing on.")}</p></div>`;
    return `<div class="stepbody">${resumeBar()}${head(L("还差几件事", "A few more things"), L("只问会影响结果、费用或权限的。已经知道的写在下面，来源可查，不对就改。", "Only what changes the result, cost or permissions. What I already know is below with its source — fix anything wrong."), "ask")}
      <div class="box"><h3>${L("已经知道", "Already known")}</h3>${known.map(([k, v, s, g]) => `<div class="ln"><span class="fact" style="width:64px">${k}</span><span class="nm">${v}</span>${s}${g ? `<button class="btn sm ghost" data-act="goto" data-arg="${g}">${L("改", "Edit")}</button>` : ""}</div>`).join("")}</div>
      <div class="box"><h3>${L("这份观察给谁看？", "Who reads it?")}</h3>${pills("audience", [["me", L("只给我自己", "Just me")], ["team", L("发到团队频道", "My team's channel")], ["public", L("公开发布", "Publish publicly")]])}</div>
      ${follow}
      <div class="box"><h3>${L("多久一份？", "How often?")}<span class="grow"></span><span class="fact">${L("时区 Asia/Shanghai（本机）", "Time zone Asia/Shanghai (this Mac)")}</span></h3>${pills("cadence", [["weekly", L("每周一 9:00", "Mondays at 9:00")], ["biweekly", L("每两周一次", "Every two weeks")], ["ondemand", L("先不定时，要时再写", "No schedule; write on request")]])}</div>
      ${footer(`<button class="btn primary" data-act="next">${L("看方案", "See the plan")}${ic("arrow", "sm")}</button>`, { extra: `<button class="btn ghost" data-act="skip-ask">${L("跳过，用默认", "Skip; use defaults")}</button>` })}</div>`;
  }

  function memberHtml(m) {
    const conflict = S.scenario === "addscene" && m.id === "res";
    const conf = conflict ? `<div class="note warn" style="margin:8px 0 0">${L("项目里已有「研究员」，给「竞品分析」用。", "The project already has a “Researcher”, used by “Competitor analysis”.")}<div class="acts"><button class="btn sm ${S.resChoice === "reuse" ? "primary" : "sec"}" data-act="res" data-arg="reuse">${L("沿用它（两套做法共用）", "Reuse it (shared by both)")}</button><button class="btn sm ${S.resChoice === "copy" ? "primary" : "sec"}" data-act="res" data-arg="copy">${L("另复制一个给新做法", "Copy one for the new way")}</button></div></div>` : "";
    return `<div class="member" style="--hue:${m.hue}"><span class="av">${T(m.av)}</span><div class="bd"><strong>${T(m.name)}</strong> ${m.existing ? `<span class="tag">${L("已有", "Existing")}</span>` : ""}<span class="fact">${T(m.role)}</span>${m.skill ? `<div class="chips"><span class="tag">${L("做法：", "Skill: ")}${T(m.skill)}</span><span class="tag">${L("能用：", "Can: ")}${T(m.can)}</span><span class="tag">${L("交出：", "Hands over: ")}${T(m.out)}</span></div>` : ""}${conf}</div>${m.existing ? "" : `<button class="btn sm sec" data-act="toast" data-arg="${esc(L("会在这里展开成员的职责、做法和资料范围（原型不展开）", "Expands the member's duties, skill and material scope here (not built in the prototype)"))}">${L("改", "Edit")}</button>`}</div>`;
  }
  function mapRows() {
    const c = counts();
    const a = S.answers;
    const rows = [
      [L("模型", "Model"), "DeepSeek · deepseek-chat", src(S.connected ? "ans" : "def", S.connected ? L("刚连上", "Just connected") : L("个人默认", "Personal default")), L("模型设置", "Model settings"), L("设置 › 模型", "Settings › Model")],
      [L("项目说明", "Project description"), L("草稿 3 段，可改", "3-paragraph draft, editable"), src("ans", L("回答 + 材料", "Answers + materials")), L("项目说明", "Project description"), L("项目设置 › 常规", "Project settings › General")],
      [L("项目资料", "Materials"), S.start === "goal" ? L("还没有", "None yet") : L(`${c.locs} 个位置 · ${fmt(c.n)} 份`, `${c.locs} locations · ${fmt(c.n)} items`), src("ans", L("本次选择", "This time")), L("项目资料", "Project materials"), L("资料 › 输入与输出", "Materials › Inputs and output")],
      [L("成员", "Members"), S.resChoice === "reuse" ? L("研究员（沿用）、编辑", "Researcher (reused), Editor") : L("研究员、编辑", "Researcher, Editor"), src("ans", L("方案", "Plan")), L("本项目成员", "Project members"), L("项目设置 › 成员", "Project settings › Members")],
      [L("记忆", "Memory"), L("跟个人设置走", "Follows personal settings"), src("def", L("个人默认", "Personal default")), L("记忆", "Memory"), L("项目设置 › 记忆", "Project settings › Memory")],
      [L("生成时间", "When to write"), a.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText(), src(a.cadence ? "ans" : "def", a.cadence ? L("你的回答", "Your answer") : L("默认", "Default")), "Schedule", L("设置 › 助理", "Settings › Assistant")],
      [L("主动程度", "Initiative"), L("写好后提醒一次", "One reminder when written"), src("def", L("个人默认", "Personal default")), L("个人助理", "Personal assistant"), L("设置 › 助理", "Settings › Assistant")],
      [L("对外发送", "Sending outside"), L("不开", "Off"), src("def", L("没有授权", "No permission")), "—", L("设置 › 授权", "Settings › Permissions")],
      [L("工作目录", "Working folder"), L("不需要", "Not needed"), src("def", L("这类工作用不到", "Not used by this work")), "—", L("资料 › 输入与输出", "Materials › Inputs and output")],
    ];
    return `<div class="tblwrap"><table class="map"><thead><tr><th>${L("设置", "Setting")}</th><th>${L("这次的值", "Value")}</th><th>${L("来自", "From")}</th><th>${L("保存到", "Saved in")}</th><th>${L("以后在哪改", "Change later in")}</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${r[0]}</td><td class="v">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td class="fact">${r[4]}</td></tr>`).join("")}</tbody></table></div>`;
  }
  function stepPlan() {
    const a = S.answers;
    const missing = S.fault === "missing_dep";
    const deps = `<div class="ln">${ic("note")}<span class="nm">Pages</span>${st("done", L("已装 · 本项目已启用", "Installed · on in this project"))}</div>
      <div class="ln">${ic("rows")}<span class="nm">${L("Feed（订阅源）", "Feed (subscriptions)")}</span>${missing ? `${st("wait", L("还没装", "Not installed"))}<button class="btn sm sec" data-act="dep-preview" aria-expanded="${S.depPreview}">${L("看看要什么权限", "See what it needs")}</button>` : st("done", L("已装 · 本项目将启用", "Installed · will be turned on here"))}</div>
      ${missing ? `<div class="fact" style="padding:0 8px 6px 32px">${L("缺它只影响「读订阅源」；其他步骤照常。采用时会先装它。", "Without it only “read feeds” is affected; the rest works. Adopting installs it first.")}</div>` : ""}
      ${missing && S.depPreview ? `<div class="note" style="margin:0 8px 8px 32px">${L("Feed · Molis 官方 · 签名已验证。要用：读你添加的订阅地址（联网）、在本项目存订阅条目。不读其他项目，不发送任何内容。", "Feed · Molis official · signature verified. Needs: read the feed addresses you add (network), store items in this project. It reads no other project and sends nothing.")}</div>` : ""}
      ${a.channel === "slack" ? `<div class="ln">${ic("link")}<span class="nm">${L("Slack 连接", "Slack connection")}</span>${st("todo", L("可选 · 没连", "Optional · not connected"))}<span class="fact">${L("只影响「发出去」", "Affects sending only")}</span><button class="btn sm sec" data-act="toast" data-arg="${esc(L("会在这里连接 Slack，授权后回到这一页（原型不展开）", "Connects Slack here and returns to this page after authorising (not built in the prototype)"))}">${L("连接", "Connect")}</button></div>` : ""}`;
    const add = S.scenario === "addscene";
    const label = add ? L(`采用：加 ${S.resChoice === "reuse" ? 1 : 2} 位成员、改 3 项设置，原有内容不动`, `Adopt: add ${S.resChoice === "reuse" ? 1 : 2} members, change 3 settings, keep the rest`) : L("采用：新建项目、加 2 位成员、改 4 项设置", "Adopt: new project, 2 members, 4 settings");
    const needRes = add && !S.resChoice;
    return `<div class="stepbody">${head(L(`「${sceneName()}」的做法`, `The “${sceneName()}” way of working`), L("这是草稿，现在什么都没改。哪里不合适直接改，或者回去改答案。", "This is a draft; nothing has changed yet. Edit anything here, or go back and change an answer."), "plan")}
      <div class="box"><h3>${ic("target", "sm")}${L("第一次能做成", "First result")}</h3><div class="ln"><span class="nm">${L("第一期：本周 AI 产品观察", "Issue 1: this week in AI products")}</span><span class="fact">${L("一篇 Pages 文档 · 约 10 分钟", "One Pages doc · about 10 min")}</span></div></div>
      <div class="box"><h3>${ic("user", "sm")}<span class="grow">${L("谁来做", "Who does it")}</span><span class="tag">${L("成员只属于这个项目，改它不影响别的项目", "Members belong to this project only")}</span></h3>${D.members.map(memberHtml).join("")}</div>
      <div class="box"><h3>${ic("package", "sm")}${L("要用到的插件和连接", "Plugins and connections used")}</h3>${deps}</div>
      <div class="box"><h3>${ic("clock", "sm")}${L("什么时候、做到哪一步", "When, and how far")}</h3>
        <div class="ln"><span class="nm">${L("生成", "Writing")}</span><span class="v">${a.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText()}</span></div>
        <div class="ln"><span class="nm">${L("写好以后", "When written")}</span><span>${L("提醒你一次", "Remind you once")}</span></div>
        <div class="ln"><span class="nm">${L("对外发送", "Sending outside")}</span>${st("todo", L("不开", "Off"))}<span class="fact">${L("没有你的授权；以后在设置里开", "No permission from you; turn on later in Settings")}</span></div></div>
      <div class="box"><h3>${ic("home", "sm")}${L("项目首页", "Project home")}</h3><div class="placeholder">${ic("info", "sm")}<span>${L("首页长什么样，等第 03 批「智能呈现」定样后补上（占位）。现在先用平台的基础首页，以后可以换，不影响别的步骤。", "The home page waits for batch 03's “intelligent surfaces” design (placeholder). The platform's basic home is used for now and can be swapped later without affecting other steps.")} <span class="tag sim">${L("占位", "Placeholder")}</span></span></div></div>
      <div class="box"><h3>${ic("settings", "sm")}${L("这些设置存在哪", "Where these settings live")}</h3>${mapRows()}<p class="fact" style="margin:8px 0 0">${L("引导和设置页读写同一份；这里只是草稿，采用后才写进去。", "The guide and settings read and write the same values; this is a draft until adopted.")}</p></div>
      ${footer(`<button class="btn primary" data-act="next" ${needRes ? "disabled" : ""}>${label}${ic("arrow", "sm")}</button>`, { reason: needRes ? L("先定研究员用哪个", "Decide on the researcher first") : "" })}</div>`;
  }

  function stepAdopt() {
    const items = adoptItems();
    const anyFail = items.some((x) => S.adopt[x.id] === "fail");
    const done = S.adopted;
    const rows = items.map((x) => {
      let s;
      if (x.off) s = `${st("todo", L("不开启", "Not turned on"))}<span class="fact">${L("没有授权", "No permission")}</span>`;
      else if (x.keep) s = st("done", L("没动", "Untouched"));
      else s = { skipped: st("wait", L("已跳过", "Skipped")), todo: st("todo", L("等待", "Waiting")), run: st("run", L("进行中", "In progress")), done: st("done", L("已生效", "Took effect")), fail: st("fail", L("没成", "Failed")) }[S.adopt[x.id] || "todo"];
      const fail = S.adopt[x.id] === "fail" ? `<div class="note err" style="margin:2px 8px 8px 32px">${L("Schedule 没有回应（等了 30 秒），安排没有建成，也不会重复建。其余已生效，可以先开始工作。", "Schedule did not answer (30 s); nothing was created and nothing will be duplicated. Everything else took effect — you can start working.")}<div class="acts"><button class="btn sm primary" data-act="sched-retry">${L("重试这一项", "Retry this item")}</button><button class="btn sm sec" data-act="sched-skip">${L("先跳过，以后在设置里补", "Skip; add it later in Settings")}</button></div></div>` : "";
      return `<div class="ln">${ic(x.id === "project" ? "folder" : x.id === "members" ? "user" : x.id === "sched" ? "clock" : x.id === "install" ? "download" : x.id === "send" ? "send" : "check", "sm")}<span class="nm">${x.label}</span><span class="tag">${x.scope}</span>${s}</div>${fail}`;
    }).join("");
    const title = !done ? L("正在采用", "Adopting") : anyFail ? L("大部分已生效，一项没成", "Mostly done; one item failed") : L("采用好了", "Adopted");
    return `<div class="stepbody">${head(title, L("每一项交给它真正的主人保存，逐项显示结果。", "Each item is saved by its real owner; results show one by one."), "adopt")}
      <div class="box">${rows}</div>
      <p class="fact">${L("中途关掉也没关系：重新打开会从没完成的那项接着做，已生效的不会再建一次。", "Closing midway is fine: reopening continues from the unfinished item and nothing that took effect is created twice.")}</p>
      ${footer(`<button class="btn primary" data-act="next" ${done ? "" : "disabled"}>${L("进入项目", "Open the project")}${ic("arrow", "sm")}</button>`, { noBack: true, reason: done ? "" : L("采用完就能进入", "Available when adoption finishes") })}</div>`;
  }

  function stepWorkdir() {
    const opts = [["website", "~/code/website", L("资料里的参考文件夹 · 有 git · 推荐", "A reference folder in materials · has git · suggested")], ["brand", "~/Design/brand-assets", L("资料里的参考文件夹 · 不是代码", "A reference folder in materials · not code")]];
    return `<div class="stepbody">${head(L("Coding 在哪个文件夹里工作？", "Which folder does Coding work in?"), L("项目资料里已经有这两个文件夹，选一个就行，不用重新找。", "The project's materials already include these two folders — pick one, no need to browse again."), "workdir")}
      <div class="choices" role="radiogroup">${opts.map(([k, p, d]) => `<button class="choice" role="radio" data-act="wd" data-arg="${k}" aria-checked="${S.wdPick === k}">${ic("folder")}<span><strong style="font-family:var(--mono);font-weight:500">${p}</strong><span class="fact">${d}</span></span></button>`).join("")}</div>
      <div class="acts"><button class="btn sm ghost" data-act="toast" data-arg="${esc(L("会打开系统的选文件夹窗口（原型不展开）", "Opens the system folder picker (not built in the prototype)"))}">${L("选别的文件夹", "Choose another folder")}</button></div>
      <div class="box soft"><h3>${ic("lock", "sm")}${L("要多给一项授权", "One more permission")}</h3><p style="margin:0 0 8px">${L(`现在资料只能读 ${S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets"}。设成工作目录后，Coding 能在里面改文件、运行命令；别的文件夹不受影响。`, `Materials can only read ${S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets"} now. As the working folder, Coding may change files and run commands in it; other folders are unaffected.`)}</p><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-act="wd-consent" ${S.wdConsent ? "checked" : ""}>${L("允许 Coding 在这个文件夹里改文件、运行命令", "Let Coding change files and run commands in this folder")}</label></div>
      ${footer(`<button class="btn primary" data-act="wd-done" ${S.wdConsent ? "" : "disabled"}>${L("用这个文件夹", "Use this folder")}${ic("arrow", "sm")}</button>`, { reason: S.wdConsent ? "" : L("勾选授权才能用", "Tick the permission to continue") })}</div>`;
  }
  function stepBack() {
    return `<div class="stepbody">${head(L("两项都补齐了", "Both are filled in"), L("回到 Coding，你写的那句还在输入框里。", "Back to Coding — your sentence is still in the input."), "back")}
      <div class="box"><div class="ln">${ic("sparkles", "sm")}<span class="nm">DeepSeek · deepseek-chat</span>${st("done", L("已连接", "Connected"))}<span class="fact">${L("存到 设置 › 模型", "Saved in Settings › Model")}</span></div>
      <div class="ln">${ic("folder", "sm")}<span class="nm" style="font-family:var(--mono)">${S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets"}</span>${st("done", L("可改、可运行", "Change and run"))}<span class="fact">${L("存到 项目设置 › 输入与输出", "Saved in Project settings › Inputs and output")}</span></div></div>
      ${footer(`<button class="btn primary" data-act="return">${ic("back", "sm")}${L("回到 Coding", "Back to Coding")}</button>`)}</div>`;
  }
  function stepBody(id) {
    return { goal: stepGoal, materials: stepMaterials, model: stepModel, read: stepRead, ask: stepAsk, plan: stepPlan, adopt: stepAdopt, workdir: stepWorkdir, back: stepBack }[id]();
  }

  // ---------- Shared side content ----------
  function stepsList() {
    return `<ol class="steps" aria-label="${L("准备步骤", "Steps")}">${flow().map((id, i) => {
      const s = stepState(id);
      const locked = S.adopted && idx(id) < idx("adopt");
      const clickable = !locked && (s === "done" || s === "reused" || s === "wait" || s === "todo-reached");
      const mark = s === "done" ? ic("check", "sm") : s === "reused" ? ic("history", "sm") : s === "wait" ? "!" : i + 1;
      const note = s === "reused" ? L("复用", "Reused") : s === "wait" ? L("待补", "To finish") : locked ? L("已采用", "Adopted") : "";
      return `<li class="${s === "cur" ? "cur" : s === "todo-reached" ? "" : s}"><button data-act="goto" data-arg="${id}" ${s === "cur" ? 'aria-current="step"' : ""} ${clickable || s === "cur" ? "" : "disabled"} ${locked ? `title="${L("已采用；以后在设置里改", "Adopted; change later in Settings")}"` : ""}><span class="dot">${mark}</span><span class="nm">${T(D.steps[id])}</span>${note ? `<span class="fact">${note}</span>` : ""}</button></li>`;
    }).join("")}</ol>`;
  }
  function draft(title) {
    const c = counts(), a = S.answers;
    const reached = (id) => idx(id) !== -1 && idx(id) < idx(S.step);
    const fl = (k) => (S.flash === k ? " flash" : "");
    const sec = (cap, body) => `<div class="sec"><div class="cap">${cap}</div>${body}</div>`;
    const pend = (t) => `<div class="pending">${t}</div>`;
    const parts = [];
    parts.push(sec(L("目的", "Goal"), S.goal ? `<div class="ln${fl("goal")}"><span class="nm">${esc(S.goal)}</span></div>` : pend(L("还没说", "Not yet"))));
    if (S.start !== "goal" && S.start !== "blank") parts.push(sec(L("材料", "Materials"), reached("materials") || S.step === "materials" ? `<div class="ln${fl("mat")}"><span class="nm">${L(`${c.locs} 个位置 · ${fmt(c.n)} 份`, `${c.locs} locations · ${fmt(c.n)} items`)}</span>${reached("materials") ? st("done", L("已选", "Picked")) : st("todo", L("在选", "Picking"))}</div>` : pend(L("还没选", "Not picked"))));
    parts.push(sec(L("模型", "Model"), S.modelOk && !S.keyRefused ? `<div class="ln"><span class="nm">DeepSeek</span>${src("def", S.connected ? L("刚连上", "Just connected") : L("个人设置", "Personal settings"))}</div>` : S.deferred ? `<div class="ln"><span class="nm">${L("稍后再连", "Later")}</span>${st("wait", L("待补", "To do"))}</div>` : pend(L("还没连", "Not connected"))));
    if (flow().includes("read")) parts.push(sec(L("整理", "Summary"), S.read === "done" ? `<div class="ln"><span class="nm">${L("背景、进展 · 3 条待办", "Background, progress · 3 to-dos")}</span>${st("done", L("好了", "Ready"))}</div>` : S.read === "fail" ? `<div class="ln"><span class="nm">${L("材料已读好", "Materials read")}</span>${st("fail", L("整理没成", "Summary failed"))}</div>` : S.read === "deferred" ? `<div class="ln"><span class="nm">${L("材料已读好", "Materials read")}</span>${st("wait", L("稍后整理", "Later"))}</div>` : S.read === "idle" ? pend(L("还没开始", "Not started")) : `<div class="ln"><span class="nm">${L("进行中", "In progress")}</span>${st("run", "")}</div>`));
    const aud = { me: L("只给自己", "Just me"), team: L("团队频道", "Team channel"), public: L("公开发布", "Public") }[a.audience];
    const cad = a.cadence ? (a.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText()) : null;
    parts.push(sec(L("回答", "Answers"), aud || cad ? `${aud ? `<div class="ln${fl("audience")}"><span class="nm">${L("给谁看", "Reader")}</span><span>${aud}</span></div>` : ""}${a.channel ? `<div class="ln${fl("channel")}"><span class="nm">${L("发到", "Send to")}</span><span>${{ slack: "Slack", feishu: L("飞书", "Feishu"), none: L("先不发", "Not yet") }[a.channel]}</span></div>` : ""}${cad ? `<div class="ln${fl("cadence")}"><span class="nm">${L("多久一份", "How often")}</span><span>${cad}</span></div>` : ""}` : pend(L("还没问到", "Not asked yet"))));
    parts.push(sec(L("方案", "Plan"), idx(S.step) >= idx("ask") && flow().includes("plan") ? `<div class="ln"><span class="nm">${L("研究员、编辑", "Researcher, Editor")}</span><span class="fact">${L("成员", "Members")}</span></div><div class="ln${fl("plugins")}"><span class="nm">Pages、Feed${a.channel === "slack" ? " · Slack" : ""}</span><span class="fact">${L("插件", "Plugins")}</span></div><div class="ln"><span class="nm">${L("基础首页", "Basic home")}</span><span class="tag sim">${L("占位", "Placeholder")}</span></div>` : pend(L("回答完就出来", "Appears after the questions"))));
    return `<div class="draft"><h2>${title || L("已准备", "Prepared so far")}</h2>${parts.join("")}<p class="fact" style="margin:0">${S.adopted ? L("已采用，各项已写进各自的设置。", "Adopted; each item is saved in its own settings.") : L("这些还只是草稿；采用前不改任何设置。", "Still a draft; no setting changes before you adopt.")}</p></div>`;
  }

  // ---------- Workbench frame (option C, landing, and the from-help origin page) ----------
  function bar(opts = {}) {
    const typed = S.scenario === "fromhelp" ? L("按品牌指南把首屏改成一句主张加一个主按钮", "Following the brand guide, make the hero one statement and one main button") : "";
    const ready = S.scenario === "fromhelp" && S.returned;
    const plug = opts.plugin || L("首页", "Home");
    return `<div class="bar"><div class="tray"><button class="switcher" data-act="toast" data-arg="${esc(L("插件切换（原型不展开）", "Plugin switcher (not built)"))}">${ic("grid", "sm")}<span>${plug}</span>${ic("chevron-down", "sm")}</button><button class="pin" aria-label="${L("个人助理", "Assistant")}">${ic("sparkles")}</button></div>
      <div class="composer ${typed ? "kept" : ""}">${typed ? `<span class="typed" title="${esc(typed)}">${esc(typed)}</span>` : `<span class="ph">${L("让助理做点什么，或按 ⌘K 搜索", "Ask the Assistant, or press ⌘K to search")}</span>`}<button class="send ${ready ? "ready" : ""}" aria-label="${L("发送", "Send")}" ${typed && !ready ? `title="${L("缺两项，补齐后可以发送", "Two items missing; fill them in to send")}" data-act="toast" data-arg="${esc(L("还缺模型和工作目录；点「补齐这两项」", "Still missing a model and a working folder; use “Fill in both”"))}"` : ready ? 'data-act="send"' : ""}>${ic("send", "sm")}</button></div>
      <div class="tray">${opts.side !== undefined ? `<button class="resident" data-act="side-toggle" aria-pressed="${!!opts.side}" aria-label="${L("右侧窗格", "Right pane")}">${ic("sidebar")}</button>` : ""}<span class="mono" aria-label="${esc(opts.proj || projName())}">${opts.mono || projName().slice(0, 1)}</span></div></div>`;
  }
  function frame({ tabs, main, side, sideTitle, plugin, mono, proj }) {
    const hasSide = side != null;
    const tabHtml = tabs.map((tb) => `<button class="tab" role="tab" aria-selected="${!!tb.on}" data-act="${tb.act || ""}" data-arg="${tb.arg || ""}">${tb.icon ? ic(tb.icon, "sm") : ""}<span>${tb.label}</span></button>`).join("");
    const winsel = hasSide ? `<span class="seg winsel" role="group"><button data-act="focus" data-arg="main" aria-pressed="${S.focus !== "side"}">${L("主区", "Main")}</button><button data-act="focus" data-arg="side" aria-pressed="${S.focus === "side"}">${L("右侧", "Right")}</button></span>` : "";
    return `<div class="wb"><div class="titlebar ${hasSide ? "" : "solo"}" data-focus="${S.focus}"><div class="strip main"><div class="tabs" role="tablist">${tabHtml}</div>${winsel}</div><span></span><div class="strip side">${hasSide ? `<span class="tab" aria-selected="true" style="max-width:none"><span>${sideTitle}</span></span>` : ""}</div></div>
      <div class="desk ${hasSide ? "" : "solo"}" data-focus="${S.focus}"><section class="pane main" aria-label="${L("主区", "Main")}">${main}</section>${hasSide ? `<div class="gutter"></div><section class="pane side" aria-label="${esc(sideTitle)}">${side}</section>` : ""}</div>
      ${bar({ plugin, mono, proj, side: hasSide ? true : undefined })}</div>`;
  }
  function landing() {
    if (S.personal) return `<div class="scroll"><div class="landing"><h1 tabindex="-1" style="margin:0;font-size:22px">${L("个人空间", "Personal space")}</h1><p class="lead" style="margin:0;color:var(--ink-soft)">${L("不用建项目，直接在下面说要做什么。以后想把某件事放进项目，再从这里开始准备。", "No project needed — say what you want below. When something should become a project, start preparing from here.")}</p><div class="hero-act">${ic("sparkles")}<div class="bd"><strong>${L("在下面的输入框说一句", "Say it in the box below")}</strong><span class="fact">${L("个人助理跨项目接着做", "The personal assistant carries on across projects")}</span></div></div></div></div>`;
    if (S.start === "blank") return `<div class="scroll"><div class="landing"><div class="hrow"><h1 tabindex="-1" style="margin:0;font-size:22px" class="grow">${L("未命名项目", "Untitled project")}</h1><span class="tag">${L("空项目", "Empty project")}</span></div><div class="hero-act">${ic("plus")}<div class="bd"><strong>${L("加点资料，或者直接说要做什么", "Add materials, or just say what to do")}</strong><span class="fact">${L("缺什么到时候再补，不用先填一整套设置", "Fill gaps when they come up; no full setup first")}</span></div><button class="btn sec" data-act="toast" data-arg="${esc(L("打开资料面板（原型不展开）", "Opens the materials panel (not built)"))}">${L("加资料", "Add materials")}</button></div></div></div>`;
    const w = S.work;
    const partial = Object.values(S.adopt).includes("fail");
    const status = w === "done" ? `<span class="tag" style="background:color-mix(in srgb,var(--green) 16%,transparent);color:var(--green)">${L("第一期已写好", "Issue 1 written")}</span>` : `<span class="tag">${L("做法已配好", "Set up")}</span><span class="tag warn">${L("第一期还没写", "Issue 1 not written")}</span>`;
    const run = w === "run1" ? st("run", L("研究员正在读 14 个订阅源和你的材料…", "The researcher is reading 14 feeds and your materials…")) : w === "run2" ? st("run", L("编辑正在写…（研究员交出 9 条变化）", "The editor is writing… (9 changes from the researcher)")) : "";
    const hero = w === "done" ? `<div class="hero-act" style="background:color-mix(in srgb,var(--green) 12%,var(--paper))">${ic("status-done")}<div class="bd"><strong>${L("第一期：本周 AI 产品观察", "Issue 1: this week in AI products")}</strong><span class="fact">${L("Pages 文档 · 1,620 字 · 9 条变化 · 引用 12 处", "Pages doc · 1,620 words · 9 changes · 12 citations")}</span></div><button class="btn primary" data-act="toast" data-arg="${esc(L("在 Pages 打开（原型不展开）", "Opens in Pages (not built)"))}">${L("在 Pages 打开", "Open in Pages")}</button></div>`
      : `<div class="hero-act">${ic("play")}<div class="bd"><strong>${L("开始第一期：本周 AI 产品观察", "Start issue 1: this week in AI products")}</strong><span class="fact">${run || L("研究员读订阅源，编辑写成 Pages 文档", "The researcher reads feeds; the editor writes a Pages doc")}</span></div><button class="btn primary" data-act="work-start" ${w !== "idle" ? "disabled" : ""}>${L("开始", "Start")}</button></div>`;
    const later = S.laterGone ? "" : `<div class="box soft"><h3><span class="grow">${L("以后再设也行", "These can wait")}</span><button class="btn sm ghost" data-act="later-gone">${L("不再显示", "Don't show again")}</button></h3><div class="later">
      ${[["database", L("记忆", "Memory"), L("跟个人设置走", "Follows personal settings")], ["link", L("能力与连接", "Capabilities and connections"), S.answers.channel === "slack" ? L("Slack 没连 · 只影响发送", "Slack not connected · sending only") : L("都已就绪", "All ready")], ["folder", L("工作目录", "Working folder"), L("这类工作不需要", "Not needed for this work")], ["settings", L("助理规则与用量", "Assistant rules and usage"), L("每月上限 ¥50 · 个人默认", "¥50 monthly cap · personal default")]].map(([i, a, b]) => `<div class="it">${ic(i, "sm")}<div class="bd"><strong>${a}</strong><span class="fact">${b}</span></div><button class="btn sm sec" data-act="toast" data-arg="${esc(L("打开对应设置（原型不展开）", "Opens that setting (not built)"))}">${L("去设置", "Open")}</button></div>`).join("")}</div></div>`;
    const carried = S.start === "materials" && S.scenario !== "addscene" ? `<div class="box"><h3>${L("带进来的", "Brought in")}</h3><div class="ln">${ic("folder-open", "sm")}<span class="nm">${L(`${fmt(counts().n)} 份材料`, `${fmt(counts().n)} materials`)}</span><button class="btn sm ghost" data-act="toast" data-arg="${esc(L("打开项目资料（原型不展开）", "Opens project materials (not built)"))}">${L("打开", "Open")}</button></div><div class="ln">${ic("note", "sm")}<span class="nm">${S.read === "done" ? L("摘要和 3 条待办", "Summary and 3 to-dos") : L("摘要还没整理", "Summary not done yet")}</span>${S.read === "done" ? `<button class="btn sm ghost" data-act="toast" data-arg="${esc(L("打开摘要（原型不展开）", "Opens the summary (not built)"))}">${L("打开", "Open")}</button>` : `<button class="btn sm sec" data-act="toast" data-arg="${esc(L("在项目里连模型后接着整理（原型不展开）", "Connect a model in the project and sum up (not built)"))}">${L("现在整理", "Sum up now")}</button>`}</div></div>` : "";
    return `<div class="scroll"><div class="landing">
      <div class="hrow"><div class="grow"><h1 tabindex="-1" style="margin:0;font-size:22px">${S.scenario === "addscene" ? "产品研究" : projName()}</h1><span class="fact">${S.scenario === "addscene" ? L(`新做法：${sceneName()}`, `New way of working: ${sceneName()}`) : sceneName()}</span></div><span class="acts">${status}</span>${helpBtn("work")}</div>${helpBox("work")}
      ${partial ? `<div class="note warn">${L("每周安排还没建成，第一期可以照常写。", "The weekly schedule isn't set yet; issue 1 can still be written.")}<div class="acts"><button class="btn sm sec" data-act="sched-retry-later">${L("重试安排", "Retry the schedule")}</button></div></div>` : ""}
      ${hero}${carried}${later}</div></div>`;
  }
  function codingOrigin() {
    const ok = S.returned;
    const top = `<div class="coding-top">${ic("code", "sm")}<span>${L("项目输出", "Project output")}</span><b>${ok ? (S.wdPick === "website" ? "website" : "brand-assets") : L("未设置", "Not set")}</b>${ok ? `<span>· main</span>` : ""}<span style="flex:1"></span>${ok ? st("done", L("可以开始", "Ready")) : ""}</div>`;
    const body = ok ? `<div class="coding-empty">${ic("status-done")}<h3>${L("可以开始了", "Ready to start")}</h3><p>${L("模型和工作目录都补齐了。你写的那句还在下面，按发送就开始。", "The model and working folder are set. Your sentence is still below — press Send to start.")}</p></div>`
      : `<div class="coding-empty"><h3 tabindex="-1">${L("还不能开始", "Can't start yet")}</h3><p>${L("Coding 要一个能改文件的工作目录，还要一个能用的模型。", "Coding needs a working folder it may change and a model it can use.")}</p>
        <div class="need"><div class="ln">${ic("sparkles", "sm")}<span class="nm">${L("模型", "Model")}</span>${S.modelOk ? st("done", "DeepSeek") : st("fail", L("没有可用的", "None available"))}</div><div class="ln">${ic("folder", "sm")}<span class="nm">${L("工作目录", "Working folder")}</span>${S.wdOk ? st("done", "website") : st("fail", L("没选", "Not chosen"))}</div></div>
        <div class="acts">${S.origin ? `<button class="btn primary" data-act="fill">${L("补齐这两项", "Fill in both")}</button>` : st("run", L("正在旁边补齐，你写的那句留着", "Filling in alongside; your sentence stays"))}${helpBtn("origin")}</div><div style="width:min(440px,100%);text-align:left">${helpBox("origin")}</div></div>`;
    return `${top}${body}`;
  }

  // ---------- Options ----------
  function topBar(where, right = "") {
    return `<div class="top"><span class="brand"><span class="mk">M</span>Molis Work</span><span class="where">${where}</span><span class="grow"></span>${right}<button class="btn sm ghost" data-act="toast" data-arg="${esc(L("已存草稿。下次打开从这一步接着走", "Draft saved. Next time you continue from this step"))}">${L("稍后再说", "Later")}</button></div>`;
  }
  const whereText = () => ({ first: L("首次使用", "First use"), newproj: L("新建项目", "New project"), addscene: L("产品研究 · 加一套做法", "产品研究 · add a way of working"), fromhelp: L("官网改版 · 为 Coding 补齐", "官网改版 · fill in for Coding") })[S.scenario];
  function optionA() {
    const f = flow(); const i = f.indexOf(S.step);
    const back = S.scenario === "fromhelp" ? `<button class="btn sm sec" data-act="return-early">${ic("back", "sm")}${L("回到 Coding", "Back to Coding")}<span class="wide">${L("（你写的已保留）", " (your text is kept)")}</span></button>` : "";
    return `<div class="app page">${topBar(whereText(), back)}<div class="A-body">
      <aside class="A-rail">${stepsList()}<div class="A-mini">${S.scenario !== "fromhelp" ? `<details><summary class="fact" style="cursor:pointer">${L("已准备的内容", "Prepared so far")}</summary><div style="margin-top:8px">${draft()}</div></details>` : ""}</div><div class="safe">${ic("lock", "sm")}<span>${L("只读你选的范围，原文件不改。采用前不改任何设置。", "Only what you pick is read; originals stay unchanged. No setting changes before you adopt.")}</span></div></aside>
      <main class="A-main"><div class="A-stepper" style="padding:12px 16px 0"><span>${i + 1} / ${f.length} · ${T(D.steps[S.step])}</span><span class="progress"><i style="width:${Math.round(((i + 1) / f.length) * 100)}%"></i></span></div><div class="scroll">${stepBody(S.step)}</div></main>
      <aside class="A-side scroll">${S.scenario === "fromhelp" ? `<div class="draft"><h2>${L("从哪来，回哪去", "Where you came from")}</h2><div class="sec"><div class="ln">${ic("code", "sm")}<span class="nm">Coding · 官网改版</span></div><div class="pending">${L("输入框里的那句已保留", "Your sentence in the input is kept")}</div></div></div>` : draft()}</aside></div></div>`;
  }
  function optionB() {
    const f = flow(); const cur = f.indexOf(S.step);
    const said = {
      goal: () => esc(S.goal),
      materials: () => { const c = counts(); return L(`${c.locs} 个位置 · ${fmt(c.n)} 份`, `${c.locs} locations · ${fmt(c.n)} items`); },
      model: () => (S.deferred ? L("先不连，稍后整理", "Later") : "DeepSeek"),
      read: () => null, ask: () => [S.answers.audience && { me: L("只给我自己", "Just me"), team: L("发到团队频道", "Team channel"), public: L("公开发布", "Publish") }[S.answers.audience], S.answers.cadence && (S.answers.cadence === "ondemand" ? L("要时再写", "On request") : cadenceText())].filter(Boolean).join(" · ") || L("用默认", "Defaults"),
      plan: () => L("采用", "Adopt"), adopt: () => null, workdir: () => (S.wdPick === "website" ? "~/code/website" : "~/Design/brand-assets"),
    };
    const asked = { goal: L("这次想做成什么？", "What do you want to get done?"), materials: L("带上哪些材料？", "Which materials should come along?"), model: L("用哪个模型？", "Which model?"), read: S.read === "done" ? L("读好了，整理出背景、进展和 3 条待办。", "Read — background, progress and 3 to-dos summed up.") : S.read === "deferred" ? L("材料读好了，摘要等连上模型再整理。", "Materials read; the summary waits for a model.") : L("材料读好了，整理没成。", "Materials read; the summary failed."), ask: L("还差几件事。", "A few more things."), plan: L("方案在右边，看看哪里要改。", "The plan is on the right — anything to change?"), adopt: L("采用好了。", "Adopted."), workdir: L("Coding 在哪个文件夹里工作？", "Which folder does Coding work in?") };
    const history = f.slice(0, cur).map((id) => {
      const a = said[id] && said[id]();
      return `<div class="msg"><span class="who">${L("助", "A")}</span><div class="bubble">${asked[id] || T(D.steps[id])}</div></div>${a ? `<div class="msg me"><div class="bubble">${a}<button class="link" data-act="goto" data-arg="${id}" ${S.adopted && idx(id) < idx("adopt") ? "disabled" : ""}>${L("改", "Edit")}</button></div></div>` : ""}`;
    }).join("");
    const intro = S.scenario === "fromhelp" ? `<div class="msg"><span class="who">${L("助", "A")}</span><div class="bubble">${L("Coding 还差两项，我们在这里补齐。你在 Coding 里写的那句留在输入框里。", "Coding needs two things; let's fill them in here. Your sentence in Coding stays in the input.")}</div></div>` : "";
    const thread = `<div class="B-thread"><div class="fact">${L(`第 ${cur + 1} 步，共 ${f.length} 步`, `Step ${cur + 1} of ${f.length}`)}</div>${intro}${history}<div class="msg"><span class="who">${L("助", "A")}</span><div class="card">${stepBody(S.step)}</div></div></div>`;
    const compose = `<div class="B-compose"><span class="ph">${L("也可以直接打字回答，或者说「这一步跳过」", "You can also type an answer, or say “skip this step”")}</span><button class="btn icon sm" aria-label="${L("发送", "Send")}">${ic("send", "sm")}</button></div>`;
    if (S.scenario === "fromhelp") return frame({ tabs: [{ label: "Coding", icon: "code", on: true }], main: codingOrigin(), side: `<div class="side-h"><h2>${L("个人助理", "Assistant")}</h2></div><div class="scroll">${thread}</div>`, sideTitle: L("个人助理", "Assistant"), plugin: "Coding", mono: "官" });
    const seg = `<span class="seg B-seg" role="group"><button data-act="view" data-arg="talk" aria-pressed="${S.view === "talk"}">${L("对话", "Conversation")}</button><button data-act="view" data-arg="draft" aria-pressed="${S.view === "draft"}">${L("方案", "Plan")}</button></span>`;
    return `<div class="app page">${topBar(whereText(), seg)}<div class="B-body" data-view="${S.view}"><section class="B-talk"><div class="scroll">${thread}</div>${compose}</section><aside class="B-draft"><div class="scroll">${draft(L("方案草稿", "Plan draft"))}</div></aside></div></div>`;
  }
  function optionC() {
    if (S.scenario === "fromhelp") {
      const side = `<div class="side-h"><h2>${L("为 Coding 补齐 2 项", "Fill in 2 items for Coding")}</h2><button class="btn icon sm ghost" data-act="return-early" aria-label="${L("关闭（你写的已保留）", "Close (your text is kept)")}">${ic("x", "sm")}</button></div><div class="scroll">${stepsList()}<div style="height:12px"></div>${stepBody(S.step)}</div>`;
      return frame({ tabs: [{ label: "Coding", icon: "code", on: true }], main: codingOrigin(), side, sideTitle: L("补齐", "Fill in"), plugin: "Coding", mono: "官" });
    }
    const first = S.scenario === "first" || S.scenario === "newproj";
    const homeLabel = first ? L("个人空间", "Personal space") : S.scenario === "addscene" ? L("产品研究", "产品研究") : L("首页", "Home");
    const prepLabel = L(`准备：${S.goal ? S.goal.slice(0, 10) + (S.goal.length > 10 ? "…" : "") : sceneName()}`, `Preparing: ${sceneName()}`);
    const onPrep = S.prepTab === "prep";
    const main = onPrep ? `<div class="scroll">${stepBody(S.step)}</div>` : `<div class="scroll"><div class="landing"><h1 tabindex="-1" style="margin:0;font-size:22px">${homeLabel}</h1><p class="fact">${L("准备放在旁边的标签里，随时切回去接着走；这里照常工作。", "Preparation stays in the tab next to this one; switch back any time. Work here as usual.")}</p></div></div>`;
    const side = `<div class="side-h"><h2>${L("准备清单", "Checklist")}</h2></div><div class="scroll">${stepsList()}<div style="height:12px"></div>${draft()}</div>`;
    return frame({ tabs: [{ label: homeLabel, icon: first ? "user" : "home", on: !onPrep, act: "prep-tab", arg: "home" }, { label: prepLabel, icon: "wand", on: onPrep, act: "prep-tab", arg: "prep" }], main, side, sideTitle: L("准备清单", "Checklist"), mono: first ? L("我", "Me") : "产", proj: homeLabel });
  }

  // ---------- Render ----------
  let focusAfter = null;
  let lastKey = null;
  function render() {
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    proto();
    let html;
    const landed = S.step === "work" || S.personal;
    if (S.scenario === "fromhelp" && (S.origin || S.returned)) html = frame({ tabs: [{ label: "Coding", icon: "code", on: true }], main: codingOrigin(), plugin: "Coding", mono: "官" });
    else if (landed) html = frame({ tabs: [{ label: S.personal ? L("个人空间", "Personal space") : S.scenario === "addscene" ? "产品研究" : projName(), icon: "home", on: true }], main: landing(), mono: S.personal ? L("我", "Me") : S.scenario === "addscene" ? "产" : projName().slice(0, 1), proj: projName() });
    else html = { A: optionA, B: optionB, C: optionC }[S.scheme]();
    const scrollEl = app.querySelector(".pane.main .scroll, .A-main .scroll, .B-talk .scroll");
    const keepScroll = scrollEl && !focusAfter ? scrollEl.scrollTop : 0;
    app.innerHTML = html;
    const key = `${S.scheme}|${S.scenario}|${S.step}|${S.origin}|${S.returned}`;
    if (key !== lastKey) app.querySelectorAll(".stepbody").forEach((x) => x.classList.add("enter"));
    lastKey = key;
    app.querySelectorAll("input[data-mixed]").forEach((x) => { x.indeterminate = true; });
    const ns = app.querySelector(".pane.main .scroll, .A-main .scroll, .B-talk .scroll");
    if (ns && keepScroll) ns.scrollTop = keepScroll;
    if (S.scheme === "B" && focusAfter && ns) ns.scrollTop = ns.scrollHeight;
    if (focusAfter === "h1") { const h = app.querySelector(".stepbody h1, .landing h1, .coding-empty h3"); if (h) h.focus({ preventScroll: S.scheme === "B" }); }
    else if (focusAfter) { const el = app.querySelector(focusAfter); if (el) el.focus(); }
    focusAfter = null;
    if (S.flash) setTimeout(() => { S.flash = null; }, 0);
    save();
  }
  function proto() {
    const P = (zh, en) => (S.lang === "zh" ? zh : en);
    document.getElementById("p-title").textContent = P("原型 · 模拟数据", "Prototype · sample data");
    document.getElementById("p-scheme").textContent = P("方案", "Option");
    document.getElementById("p-scenario").textContent = P("场景", "Scenario");
    document.getElementById("p-fault").textContent = P("状态", "State");
    document.getElementById("p-lang").textContent = P("语言", "Language");
    document.getElementById("p-theme").textContent = P("外观", "Theme");
    document.getElementById("reset").textContent = P("重置", "Reset");
    const [l, d] = document.querySelectorAll("#theme button"); l.textContent = P("浅", "Light"); d.textContent = P("深", "Dark");
    const sc = document.getElementById("scenario"); sc.innerHTML = D.scenarios.map(([k, t]) => `<option value="${k}" ${S.scenario === k ? "selected" : ""}>${T(t)}</option>`).join("");
    const fa = document.getElementById("fault"); fa.innerHTML = D.faults.map(([k, t]) => `<option value="${k}" ${S.fault === k ? "selected" : ""}>${T(t)}</option>`).join("");
    document.querySelectorAll("#scheme button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme));
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === S.lang));
    document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme));
  }
  function restart(keep) { clearTimers(); S = init(fresh(keep)); focusAfter = "h1"; render(); }

  // ---------- Events ----------
  document.getElementById("scheme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.scheme = b.dataset.scheme; S.help = null; render(); } });
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("scenario").addEventListener("change", (e) => restart({ scheme: S.scheme, lang: S.lang, theme: S.theme, fault: S.fault, scenario: e.target.value }));
  document.getElementById("fault").addEventListener("change", (e) => restart({ scheme: S.scheme, lang: S.lang, theme: S.theme, scenario: S.scenario, fault: e.target.value }));
  document.getElementById("reset").addEventListener("click", () => restart({ scheme: S.scheme, lang: S.lang, theme: S.theme }));

  app.addEventListener("input", (e) => {
    if (e.target.id === "goal") {
      S.goal = e.target.value; save();
      const btn = document.getElementById("goal-next"); const empty = !S.goal.trim() && S.start !== "blank";
      if (btn) btn.disabled = empty;
      const r = document.getElementById("goal-reason"); if (r) r.hidden = !empty;
    }
    if (e.target.id === "key") S.keyTyped = !!e.target.value;
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.act === "pick") { S.picks[t.dataset.arg] = t.checked; S.flash = "mat"; render(); }
    if (t.dataset.act === "pick-loc") { const l = D.locations.find((x) => x.id === t.dataset.arg); l.children.forEach((c) => { S.picks[c.id] = t.checked; }); S.flash = "mat"; render(); }
    if (t.dataset.act === "prov") { S.provider = t.value; S.connected = false; render(); }
    if (t.dataset.act === "wd-consent") { S.wdConsent = t.checked; render(); }
  });
  app.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.help) { const id = S.help; S.help = null; focusAfter = `[data-help-for="${id}"]`; render(); }
  });
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT" || b.tagName === "SELECT") return;
    const act = b.dataset.act, arg = b.dataset.arg;
    if (!act) return;
    const A = {
      next() {
        if (S.step === "goal" && S.start === "blank") { go("work"); return; }
        if (S.step === "materials" && S.scenario !== "addscene" && !S.modelOk && !S.deferred) { go("model"); return; }
        if (S.step === "materials" && flow().includes("read") && (S.modelOk || S.deferred)) { go("read"); return; }
        next();
      },
      prev, goto() { if (arg === "goal") S.dismissResume = true; go(arg, { keep: arg !== "read" }); },
      help() { const was = S.help === arg; S.help = was ? null : arg; if (was) focusAfter = `[data-help-for="${arg}"]`; },
      "tip-gone"() { S.tipGone = true; },
      suggest() { S.goal = arg; S.flash = "goal"; },
      start() { S.start = arg; },
      personal() { S.personal = true; focusAfter = "h1"; },
      open() { S.open[arg] = !S.open[arg]; focusAfter = `[data-act="open"][data-arg="${arg}"]`; },
      detail() { S.detail = S.detail === arg ? null : arg; focusAfter = `[data-act="detail"][data-arg="${arg}"]`; },
      fullpdf() { S.fullPdf = !S.fullPdf; },
      "scan-stop"() { S.scanStopped = true; toast(L("已停止清点，已发现的 812 项保留", "Listing stopped; the 812 found are kept")); },
      "scan-resume"() { S.scanStopped = false; },
      "model-change"() { S.modelOk = false; S.connected = false; },
      check() { S.checking = true; later(1100, () => { S.checking = false; S.connected = true; }); },
      "model-done"() { S.modelOk = true; S.keyRefused = false; S.deferred = false; if (S.read === "fail" || S.read === "deferred") { S.failCleared = true; S.read = "gen"; go("read", { keep: true }); later(1300, () => { S.read = "done"; S.readSig = sig(); }); } else next(); },
      defer() { S.deferred = true; go("read"); },
      "defer-after-fail"() { S.read = "deferred"; S.deferred = true; next(); },
      "key-refused"() { S.keyRefused = true; S.modelOk = false; S.connected = false; go("model", { keep: true }); },
      retry() { retryRead(); },
      "retry-wait"() { S.retryIn = 3; const tick = () => later(1000, () => { if (!S.retryIn) return; S.retryIn -= 1; if (S.retryIn === 0) retryRead(); else tick(); }); tick(); },
      "retry-cancel"() { S.retryIn = 0; clearTimers(); },
      narrow() { S.picks.gartner = false; S.failCleared = true; go("materials", { keep: true }); },
      answer() { const [k, v] = arg.split(":"); const had = S.answers[k] != null; S.answers[k] = v; if (k === "audience") { S.answers.channel = null; S.answers.review = null; } S.flash = k; if (had && S.max >= idx("plan")) toast(L("只更新了方案里相关的一项，其他不变", "Only the related part of the plan changed; the rest stays")); },
      "skip-ask"() { S.answers.audience = S.answers.audience || "me"; S.answers.cadence = S.answers.cadence || "ondemand"; next(); },
      res() { S.resChoice = arg; },
      "dep-preview"() { S.depPreview = !S.depPreview; },
      "sched-retry"() { S.schedRetried = true; S.adopt.sched = "run"; later(700, () => { S.adopt.sched = "done"; }); },
      "sched-skip"() { S.adopt.sched = "skipped"; toast(L("已跳过；在 设置 › 助理 里随时补上", "Skipped; add it any time in Settings › Assistant")); },
      "sched-retry-later"() { S.schedRetried = true; S.adopt.sched = "done"; toast(L("每周安排建好了", "Weekly schedule created")); },
      "work-start"() { S.work = "run1"; later(1400, () => { S.work = "run2"; }); later(2900, () => { S.work = "done"; announce(L("第一期写好了", "Issue 1 is written")); }); },
      "later-gone"() { S.laterGone = true; },
      "dismiss-resume"() { S.dismissResume = true; },
      fill() { S.origin = false; if (S.modelOk) S.step = "workdir"; focusAfter = "h1"; S.focus = "side"; },
      "return-early"() { S.origin = true; S.focus = "main"; focusAfter = "h1"; toast(L("准备进度已保留，下次接着补", "Progress kept; continue next time")); },
      wd() { S.wdPick = arg; },
      "wd-done"() { S.wdOk = true; next(); },
      return() { S.returned = true; S.origin = true; S.focus = "main"; toast(L("回到 Coding：你写的那句还在，按发送就开始", "Back in Coding: your sentence is still there — press Send")); focusAfter = ".composer .send"; },
      send() { toast(L("已发给 Coding（原型到此为止）", "Sent to Coding (the prototype ends here)")); },
      view() { S.view = arg; },
      focus() { S.focus = arg; },
      "prep-tab"() { S.prepTab = arg; },
      "side-toggle"() { toast(L("收起或打开右侧窗格（原型里保持打开）", "Collapses or opens the right pane (kept open in the prototype)")); },
      toast() { toast(arg); },
    };
    if (A[act]) { A[act](); if (act !== "toast" && act !== "side-toggle") render(); }
  });

  S = load();
  // Resume any simulated work that was in flight when the page was closed.
  if (S.read === "reading" || S.read === "gen") { S.read = "idle"; S.readSig = null; if (S.step === "read") enterRead(); }
  if (S.step === "adopt" && !S.adopted) startAdopt();
  if (S.work === "run1" || S.work === "run2") S.work = "idle";
  focusAfter = null;
  render();
  // Review hook for screenshots: jump to any state without clicking through.
  window.protoJump = (patch) => { clearTimers(); Object.assign(S, patch); render(); };
  window.protoFlow = () => flow();
})();
