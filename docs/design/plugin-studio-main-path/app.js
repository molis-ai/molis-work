// 03 · 创作台主路径定样 — a scripted, clickable slice from idea to continued use. Nothing calls a model, a Home or a real
// installer; every build, trial, install and the installed plugin are simulated.
(() => {
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const KEY = "molis-proto.plugin-studio-main-path.v1";
  const STAGES = 8; // 0 prep · 1 idea · 2 plan · 3 build · 4 trial · 5 install · 6 use · 7 iterate
  const BUILD = 5;  // build sub-steps
  const fresh = () => ({ scheme: "A", lang: "zh", theme: "light", fault: "none", step: 0, view: 0, cfg: false, q1: null, q2: null, cand: "c1",
    combo: null, aiPending: false, aiStale: false, bsub: 0, bdec: null, bctl: null, bfix: false, resumed: false, pointing: false, pin: null, rev: 1, revWhat: null, moved: false, defectFixed: false, afix: false, aview: null,
    installFixed: false, installing: false, installed: false, side: false, drawer: false, iterRev: 0, adopted: false, marks: {} });
  let S = load(), timer = null;
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const own = (h, i) => `<span class="own" style="--hue:var(--h-${h})">${ic(i)}</span>`;
  const OWN = { goals: own("goals", "target"), inbox: own("inbox", "inbox"), self: own("coding", "sparkles") };

  // ---------- copy ----------
  const STAGE_NAMES = () => [L("准备", "Set up"), L("想法", "Idea"), L("方案", "Design"), L("构建", "Build"), L("试用", "Try"), L("安装", "Install"), L("使用", "Use"), L("再改", "Revise")];
  const IDEA = () => L("每周例会前导入参会名单，开会时一键签到；会后看谁没到，在 Goals 里给「团队例会」记一条。",
    "Import the attendee list before the weekly meeting, check people in with one tap, and afterwards log who was missing on the “Team meeting” goal in Goals.");
  const PEOPLE = [["王一", "产品"], ["李青", "产品"], ["陈默", "设计"], ["赵安", "研发"], ["孙晴", "研发"], ["周舟", "研发"], ["吴桐", "运营"], ["郑远", "运营"]];
  const faults = () => [["none", L("正常", "Normal")], ["config", L("缺模型配置", "No model set")], ["timeout", L("构建时模型超时", "Model timeout in build")],
    ["buildfail", L("构建失败", "Build fails")], ["acceptfail", L("界面验收没过", "UI check fails")], ["interrupt", L("构建中断后重开", "Reopened after interruption")], ["defect", L("试用发现缺陷", "Trial finds a defect")],
    ["installfail", L("安装失败", "Install fails")]];
  const caption = () => [L("进入：先看缺什么", "Open: check what's missing"), L("① 说想法、答两个问题", "① Describe it, answer two questions"),
    L("② 选一个方案", "② Pick a design"), L("③ 构建，中途定一件事", "③ Build, decide one thing"), L("④ 试用并指着改", "④ Try it, point to fix"),
    L("⑤ 看权限并安装", "⑤ Review access, install"), L("⑥ 关掉创作台单独用", "⑥ Close the studio, use it"), L("⑦ 从已装版本再改", "⑦ Revise from the installed version")][S.step];

  // ---------- derived facts ----------
  const combo = () => S.cand === "c3";
  function comboSteps() {
    if (S.combo) return S.combo;
    return [{ id: "k1", t: L("收进会议邀请", "Take in the meeting invite"), cap: "inbox", who: "ai" }, { id: "k2", t: L("生成签到表并签到", "Make the sheet, check people in"), cap: "self", who: "ai" },
      { id: "k3", t: L("会后给 Goals 记一条", "Log on the goal afterwards"), cap: "goals", who: "ai" }, { id: "k4", t: L("提醒没到的人", "Remind people who missed it"), cap: "gap", who: "ai" }];
  }
  const capChip = (c) => c === "inbox" ? `<span class="cap">${OWN.inbox}Inbox · ${L("收进来", "Take in")}</span>`
    : c === "goals" ? `<span class="cap">${OWN.goals}Goals · ${L("记一条进展", "Log progress")}</span>`
    : c === "self" ? `<span class="cap new">${OWN.self}${L("新做 · 这个插件", "New · this plugin")}</span>`
    : `<span class="cap gap">${ic("alert", "sm")}${L("缺口：没有能发提醒的连接", "Gap: no connection that can send reminders")}</span>`;
  function buildSteps() {
    return [[L("读方案和名单样例", "Read the design and sample list"), L("产出：3 个页面、5 种状态的清单", "Made: list of 3 pages, 5 states")],
      [L("搭界面", "Lay out the screens"), L("产出：名单页、签到页、会后汇总", "Made: list, check-in, summary")],
      [L("接数据：签到记录存进插件自己的表", "Wire data: check-ins in the plugin's own table"), S.bdec ? L(`按你定的「${S.bdec === "dept" ? "按部门分组" : "按姓名排"}」`, `As you chose: “${S.bdec === "dept" ? "group by team" : "sort by name"}”`) : L("要你定一件事", "Needs one decision")],
      [L("接能力：Goals · 记一条进展", "Wire capability: Goals · Log progress"), combo() ? L("Inbox · 收进来 也接上；提醒是缺口，先跳过", "Inbox · Take in too; reminders are a gap, skipped") : L("只在你选的目标上记", "Only on the goal you pick")],
      [L("自查：三种宽度截图、动作真调一次", "Self-check: three widths, call each action once"), L("在隔离的试用项目里", "In an isolated trial project")]];
  }
  const bFault = () => (S.fault === "timeout" && S.bsub === 3 && !S.bfix ? "timeout" : S.fault === "buildfail" && S.bsub === 4 && !S.bfix ? "fail" : null);
  const bWaiting = () => S.bsub === 2 && !S.bdec;
  const bDone = () => S.bsub >= BUILD;
  const aFail = () => S.step === 3 && bDone() && S.fault === "acceptfail" && !S.afix;
  const bRunning = () => S.step === 3 && !bDone() && !bWaiting() && !bFault() && !S.bctl && !(S.fault === "interrupt" && !S.resumed);
  function tick() {
    clearInterval(timer); timer = null;
    if (!bRunning()) return;
    timer = setInterval(() => { if (!bRunning()) { clearInterval(timer); timer = null; return; } S.bsub++; render(); }, 1100);
  }

  // ---------- shared stage surfaces (same in every option) ----------
  function qHtml() {
    const q = (k, title, why, opts) => `<div class="q"><div class="qt">${title}</div><div class="opt">${opts.map(([v, l]) => `<button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="ans" data-k="${k}" data-v="${v}" aria-pressed="${S[k] === v}">${l}</button>`).join("")}</div><div class="why">${ic("info", "sm")} ${why}</div></div>`;
    return q("q1", L("签到由谁来点？", "Who checks people in?"), L("会改变要不要做手机界面和每人登录", "Decides whether it needs a phone layout and per-person sign-in"), [["host", L("主持人一人点", "The host")], ["self", L("每人自己点", "Each person")]])
      + q("q2", L("没到的人要不要记到 Goals？", "Log who missed it in Goals?"), L("记的话会用到一个已有能力：Goals · 记一条进展", "Logging uses an existing capability: Goals · Log progress"), [["yes", L("记一条", "Log it")], ["no", L("不记", "Don't")]]);
  }
  function prep() {
    const miss = S.fault === "config" && !S.cfg;
    const row = (ok, t, f) => `<div class="perm">${kitRing(ok ? "done" : "decide")}<div class="tx"><div>${t}</div><div class="fact">${f}</div></div></div>`;
    return `<h2>${L("做一个能装进工作台的插件", "Make a plugin you can install")}</h2>
      <p class="lead">${L("你说想法，创作台出几个方案、搭界面、接上已有能力；在试用项目里用过、你点头后才安装。", "Describe it; the studio offers designs, builds the screens and wires existing capabilities. It installs only after you've tried it in a trial project and said yes.")}</p>
      <div class="box">${row(!miss, L("模型", "Model"), miss ? L("还没选", "Not chosen") : "MiniMax-M2 · " + L("经 Prologue", "via Prologue"))}${row(true, L("试用项目", "Trial project"), L("隔离的，试用数据不进正式记录", "Isolated; trial data never becomes real records"))}${row(true, L("可以组合的能力", "Capabilities to combine"), L("目录里 23 个公开动作（来自 9 个插件）", "23 public actions in the catalog (from 9 plugins)"))}</div>
      ${miss ? `<div class="box warn"><div class="bh">${ic("alert", "sm")}${L("还没选模型", "No model chosen")}</div><div class="fact">${L("在这里选一个就行；你写好的想法会留着，选完接着做。", "Pick one here; anything you've written stays and you carry on.")}</div><div class="row3"><select aria-label="${L("模型", "Model")}"><option>MiniMax-M2</option><option>Claude Sonnet</option></select><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="cfg">${L("用这个", "Use this")}</button></div></div>` : ""}
      <div class="row3"><button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="go" data-n="1" ${miss ? "disabled" : ""}>${L("开始", "Start")}</button><button class="mw-btn mw-btn--ghost mw-btn--md" data-slot="button" data-act="sim" data-l="${L("组合已有能力", "Combine existing capabilities")}">${ic("workflow", "sm")}${L("从已有能力拼一个", "Combine existing ones")}</button></div>`;
  }
  function idea() {
    const asked = S.step >= 1;
    return `<h2>${L("想做什么", "What should it do")}</h2>
      <textarea class="idea" id="ideatxt" aria-label="${L("想法", "Idea")}" placeholder="${L("比如：……", "For example: …")}">${asked ? esc(IDEA()) : ""}</textarea>
      <div class="row3"><span class="fact">${L("材料", "Materials")}</span><span class="cap">${ic("file", "sm")}${L("参会名单样例.xlsx · 项目资料", "attendees-sample.xlsx · Materials")}</span><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="sim" data-l="${L("附上材料", "Attach")}">${ic("paperclip", "sm")}${L("附上", "Attach")}</button></div>
      ${S.scheme === "A" ? `<div class="fact">${ic("review", "sm")} ${L("助理在左边问了两个会改变做法的问题。", "The assistant asked two questions on the left that change the approach.")}</div>` : `<div class="lh">${L("两个会改变做法的问题", "Two questions that change the approach")}</div>${qHtml()}`}
      <div class="row3"><button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="go" data-n="2" ${S.q1 && S.q2 ? "" : "disabled"}>${L("出方案", "Show designs")}</button><span class="fact">${S.q1 && S.q2 ? "" : L("答完两个问题再出方案", "Answer both first")}</span></div>`;
  }
  function sketch(kind) {
    const k = { c1: "grid-template-rows:14px 1fr 1fr 1fr", c2: "grid-template-columns:1fr 1fr 1fr;grid-template-rows:1fr 1fr", c3: "grid-template-columns:1fr 1fr;grid-template-rows:14px 1fr" }[kind];
    const n = { c1: '<i class="hi"></i><i></i><i></i><i></i>', c2: '<i class="hi"></i><i></i><i class="hi"></i><i></i><i></i><i></i>', c3: '<i class="hi" style="grid-column:span 2"></i><i></i><i></i>' }[kind];
    return `<div class="sketch" style="${k}">${n}</div>`;
  }
  function plan() {
    const C = [["c1", L("签到表", "Check-in sheet"), [L("一张名单，点名字旁边就签上", "One list; tap beside a name"), L("主持人在电脑上用", "Host uses it on a computer"), L("会后一页汇总", "One-page summary after")], [capChip("self"), capChip("goals")]],
      ["c2", L("门口卡片墙", "Door card wall"), [L("大号名字卡，平板放门口", "Big name cards on a tablet"), L("每人自己点自己", "Each person taps their own"), L("要做窄屏和防误触", "Needs narrow layout, mis-tap guard")], [capChip("self"), capChip("goals")]],
      ["c3", L("组合：从邀请到跟进", "Combined: invite to follow-up"), [L("收到会议邀请就生成名单", "Invite creates the list"), L("会后自动记到 Goals", "Logs to Goals afterwards"), L("提醒没到的人：还缺连接", "Reminders: connection missing")], [capChip("inbox"), capChip("self"), capChip("goals"), capChip("gap")]]];
    const cards = C.map(([id, name, pts, caps]) => `<div class="cand" role="option" aria-selected="${S.cand === id}">${sketch(id)}<div class="cb"><strong>${name}</strong><ul>${pts.map((p) => `<li>${p}</li>`).join("")}</ul><div class="caps">${caps.join("")}</div><span style="flex:1"></span><button class="mw-btn mw-btn--sm ${S.cand === id ? "mw-btn--primary" : "mw-btn--secondary"}" data-slot="button" data-act="cand" data-v="${id}">${S.cand === id ? ic("check", "sm") + L("选了这个", "Chosen") : L("选这个", "Choose")}</button></div></div>`).join("");
    const states = L("空名单 · 导入中 · 签到中 · 会后汇总 · 导入失败", "Empty list · Importing · Checking in · Summary · Import failed");
    return `<h2>${L("三个方案", "Three designs")}</h2><p class="lead">${L("差别在谁来点、在哪用、接哪些已有能力。选一个，下面能改。", "They differ in who checks in, where, and which capabilities they use. Pick one and adjust below.")}</p>
      <div class="cands" role="listbox" aria-label="${L("方案", "Designs")}">${cards}</div>
      <div class="box"><div class="bh">${ic("frame", "sm")}${L("这个方案的关键状态", "Key states in this design")}</div><div class="fact">${states}</div></div>
      ${combo() ? comboBox() : ""}
      <div class="row3"><button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="go" data-n="3">${L("采用这个方案并开始构建", "Use this design and build")}</button><span class="fact">${combo() ? L("缺口不挡构建：那一步先空着，试用时会跳过并标出来", "The gap doesn't block: that step stays empty and is marked in the trial") : ""}</span></div>`;
  }
  // Real breakpoint (reproduction-2026-11 §2): the UI check timed out although the feature works once the meeting is selected.
  function acceptBox() {
    const seen = S.aview === "seen";
    return `<div class="box err"><div class="bh">${ic("circle-alert", "sm")}${L("界面验收有 1 条没过：导入名单后应当看到完整名单", "1 UI check failed: the full list should show after importing")}</div>
      <div class="fact">${L("功能自查 6/6 通过。验收在导入后等了 20 秒没看到名单；这个界面要先选中会议才显示名单，可能是验收写得太死，也可能是界面该直接打开这场会议。", "Feature self-check passed 6/6. The check waited 20 s after import and saw no list; this screen only shows the list once the meeting is selected, so either the check is too strict or the screen should open the meeting directly.")}</div>
      ${seen ? `<div class="fact">${ic("check", "sm")} ${L("你在试用里确认过：选中会议后 8 个人都在。", "You confirmed in the trial: all 8 people show once the meeting is selected.")}</div>` : ""}
      <div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="afix" data-k="ui">${L("改界面：导入后直接打开这场会议", "Change the screen: open the meeting after import")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="afix" data-k="check">${L("改验收：选中会议后应有完整名单", "Change the check: list after selecting the meeting")}</button>${seen ? "" : `<button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="aview">${L("先在试用里看一眼", "Look in the trial first")}</button>`}</div>
      <div class="fact">${L("这条没过之前不能安装；改哪一边都会重新验收，其他 4 条的结果保留。", "Install stays unavailable until this passes; either change re-runs this check and keeps the other 4 results.")}</div></div>`;
  }
  function comboBox() {
    const st = comboSteps();
    const rows = st.map((x, i) => `<div class="bitem${x.cap === "gap" ? " ask" : ""}"><span class="who ${x.who === "ai" ? "ai" : "hu"}" title="${x.who === "ai" ? L("助理加的", "Added by assistant") : L("你改的", "Edited by you")}">${x.who === "ai" ? "AI" : L("你", "You")}</span><span class="tx">${i + 1}. ${esc(x.t)}</span>${capChip(x.cap)}<button class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only" data-slot="button" data-act="up" data-i="${i}" aria-label="${L("上移", "Move up")}" ${i ? "" : "disabled"}>${ic("chevron-down", "sm up")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only" data-slot="button" data-act="rm" data-i="${i}" aria-label="${L("删掉这一步", "Remove step")}">${ic("x", "sm")}</button></div>`).join("");
    return `<div class="box"><div class="bh">${ic("workflow", "sm")}${L("步骤与用到的能力", "Steps and capabilities")}<span style="flex:1"></span><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="ai-edit" ${S.aiPending ? "disabled" : ""}>${S.aiPending ? `${kitRing("running")}${L("助理在改", "Assistant editing")}` : ic("sparkles", "sm") + L("让助理调整", "Ask the assistant")}</button></div>
      <div class="fact">${L("你和助理改的是同一份草稿；每步写着谁改的。缺口不编造已有动作。", "You and the assistant edit the same draft; each step shows who changed it. Gaps never pretend an action exists.")}</div>
      <div class="blist">${rows}</div>
      ${S.aiStale ? `<div class="box warn"><div class="bh">${ic("alert", "sm")}${L("助理的改动是按你修改前的草稿做的，没有直接套用", "The assistant's edit was based on the draft before your change, so it wasn't applied")}</div><div class="row3"><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="ai-apply">${L("看差异后套用", "Review and apply")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="ai-drop">${L("不要了", "Discard")}</button></div></div>` : ""}</div>`;
  }
  function build() {
    const steps = buildSteps(), f = bFault();
    const intr = S.fault === "interrupt" && !S.resumed;
    const rows = steps.map(([t, p], i) => {
      const cur = i === S.bsub && !bDone(), fail = cur && f, wait = cur && bWaiting();
      const rg = i < S.bsub ? "done" : fail ? "failed" : wait ? "decide" : cur ? (S.bctl === "stopped" || intr ? "stale" : "running") : "none";
      return `<div class="bstep${cur ? (fail ? " fail" : " cur") : ""}">${kitRing(rg)}<div class="tx"><strong>${t}</strong><span class="fact">${i <= S.bsub ? p : ""}</span></div>${i < S.bsub ? `<span class="mw-status stag partial">${L("完成", "Done")}</span>` : ""}</div>`;
    }).join("");
    let box = "";
    if (intr) box = `<div class="box warn"><div class="bh">${ic("history", "sm")}${L("创作台上次在构建第 3 步时关掉了", "The studio closed during build step 3")}</div><div class="fact">${L("前两步的结果都在。接着做之前先核对第 3 步有没有已经写进试用项目，不会重复写。", "The first two steps are kept. Before continuing it checks whether step 3 already wrote to the trial project, so nothing is written twice.")}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="resume-intr">${L("核对后接着做", "Check and continue")}</button></div></div>`;
    else if (f === "timeout") box = `<div class="box err"><div class="bh">${ic("clock", "sm")}${L("模型 90 秒没回应", "The model didn't respond for 90 seconds")}</div><div class="fact">${L("前三步的结果都在。可以重试这一步，或者换个模型接着做。", "The first three steps are kept. Retry this step or switch model and continue.")}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="bfix">${L("重试这一步", "Retry this step")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="bfix">${L("换个模型重试", "Switch model and retry")}</button></div></div>`;
    else if (f === "fail") box = `<div class="box err"><div class="bh">${ic("circle-alert", "sm")}${L("自查没过：调 Goals · 记一条进展 被拒了", "Self-check failed: Goals · Log progress was refused")}</div><div class="fact">${L("方案里没声明这个权限。改动没有采用；前面四步的结果留着。", "The design didn't declare this permission. Nothing was adopted; the first four steps are kept.")}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="bfix">${L("把权限加进方案再自查", "Add the permission and re-check")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="sim" data-l="${L("看调用记录", "See the call log")}">${L("看调用记录", "See the call log")}</button></div></div>`;
    else if (bWaiting()) box = S.scheme === "A" ? `<div class="fact">${ic("review", "sm")} ${L("等你在左边定一件事。", "Waiting for one decision on the left.")}</div>` : decideBox();
    else if (S.bctl === "stopping") box = `<div class="box"><div class="bh">${kitRing("running")}${L("正在停止…", "Stopping…")}</div></div>`;
    else if (S.bctl === "stopped") box = `<div class="box"><div class="bh">${L("已停止", "Stopped")}</div><div class="fact">${L(`完成的 ${S.bsub} 步留着；点继续从第 ${S.bsub + 1} 步接着做。`, `The ${S.bsub} finished steps are kept; continue from step ${S.bsub + 1}.`)}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="bresume">${L("继续", "Continue")}</button></div></div>`;
    else if (aFail()) box = acceptBox();
    else if (bDone()) box = `<div class="box"><div class="bh">${ic("check", "sm")}${L("构建完了，自查 6/6 通过", "Built; self-check 6/6 passed")}</div><div class="fact">${L("还没有安装。先在试用项目里用一遍。", "Not installed yet. Try it in the trial project first.")}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="go" data-n="4">${L("去试用", "Try it")}</button></div></div>`;
    const ctl = bRunning() ? `<button class="mw-btn mw-btn--danger mw-btn--sm" data-slot="button" data-act="bstop">${L("停止", "Stop")}</button>` : "";
    return `<div style="display:flex;align-items:center;gap:8px"><h2>${L("构建", "Building")}</h2><span class="mw-status stag ${bRunning() ? "running" : f || aFail() ? "failed" : bWaiting() ? "decide" : bDone() ? "partial" : ""}">${bRunning() ? L(`第 ${S.bsub + 1} 步，共 ${BUILD} 步`, `Step ${S.bsub + 1} of ${BUILD}`) : f ? L("失败", "Failed") : aFail() ? L("验收没过", "Check failed") : bWaiting() ? L("等你定", "Needs you") : bDone() ? L("完成", "Done") : intr ? L("中断", "Interrupted") : L("已停止", "Stopped")}</span><span style="flex:1"></span>${ctl}</div>
      <p class="lead">${L("界面、数据和能力一起接；每一步写着产出了什么。", "Screens, data and capabilities are wired together; each step says what it made.")}</p><div class="blist">${rows}</div>${box}`;
  }
  function decideBox() {
    return `<div class="box warn"><div class="bh">${ic("question", "sm")}${L("名单按部门分组，还是按姓名排？", "Group the list by team, or sort by name?")}</div><div class="fact">${L("8 个人来自 4 个部门；分组的话汇总也按部门。", "8 people from 4 teams; grouping also groups the summary.")}</div><div class="opt"><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="bdec" data-v="dept">${L("按部门分组", "Group by team")}</button><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="bdec" data-v="name">${L("按姓名排", "Sort by name")}</button></div></div>`;
  }
  function trial() {
    const defect = S.fault === "defect" && !S.defectFixed;
    const groups = S.bdec === "name" ? [["", PEOPLE.slice().sort((a, b) => a[0].localeCompare(b[0], "zh"))]] : ["产品", "设计", "研发", "运营"].map((d) => [d, PEOPLE.filter((p) => p[1] === d)]);
    const dn = { 产品: L("产品", "Product"), 设计: L("设计", "Design"), 研发: L("研发", "Engineering"), 运营: L("运营", "Ops") };
    const left = S.moved;
    const PIN = { mark: [L("「签到」这一列", "the “Check in” column"), L("签到按钮放到名字左边，扫一眼就知道谁还没签。", "Put the check-in button left of the name so I can see who's missing at a glance.")],
      group: [L("部门标题", "the team heading"), L("部门标题后面写上已签几个人。", "Show how many are checked in after each team heading.")],
      sess: [L("会议列表", "the meeting list"), L("会议按日期倒着排，最近的在上面。", "Sort meetings newest first.")],
      table: [L("名单", "the list"), L("名单行高再紧一点。", "Make the rows a little tighter.")] };
    const what = S.revWhat ? PIN[S.revWhat] : null;
    const btn = (n) => `<button class="mw-btn mw-btn--sm ${S.marks[n] ? "mw-btn--primary" : "mw-btn--secondary"}" data-slot="button" data-act="mark" data-n="${n}" data-pt="mark">${S.marks[n] ? ic("check", "sm") + L("已签", "In") : L("签到", "Check in")}</button>`;
    const rows = groups.map(([d, ps]) => `${d ? `<tr><th colspan="3" data-pt="group">${dn[d]}</th></tr>` : ""}${ps.map(([n]) => `<tr>${left ? `<td style="width:90px">${btn(n)}</td><td>${n}</td>` : `<td>${n}</td><td style="width:90px">${btn(n)}</td>`}<td class="fact">${S.marks[n] ? "09:0" + (n.charCodeAt(0) % 9) : ""}</td></tr>`).join("")}`).join("");
    const pin = S.pin ? `<div class="box" style="border-color:var(--accent)"><div class="bh"><span class="pin" style="position:static">1</span>${L("你指着", "You pointed at ")}${PIN[S.pin][0]}</div><textarea class="idea" style="min-height:56px" id="pintxt" aria-label="${L("要怎么改", "What to change")}">${esc(PIN[S.pin][1])}</textarea><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="revise">${L("只改这里", "Change just this")}</button><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="unpin">${L("取消", "Cancel")}</button></div></div>` : "";
    const revBox = what ? `<div class="box"><div class="bh">${ic("git-compare", "sm")}${L(`修订 r${S.rev} · 只改了${what[0]}`, `Revision r${S.rev} · only changed ${what[0]}`)}<span style="flex:1"></span><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="undo-rev">${L("撤回这次修订", "Undo this revision")}</button></div>${S.revWhat === "mark" ? `<div class="diffbox"><div><h4>${L("之前", "Before")}</h4>${L("名字 · 签到按钮", "Name · Check-in button")}</div><div><h4>${L("现在", "Now")}</h4>${L("签到按钮 · 名字", "Check-in button · Name")}</div></div>` : `<div class="fact">${esc(PIN[S.revWhat][1])} <span class="mw-badge mw-badge--neutral tag-sim" data-slot="badge">${L("原型只画出签到列这一种修订", "The prototype only draws the column change")}</span></div>`}<div class="checks"><div>${ic("check", "sm")}${L("分组、导入、会后汇总没动（自查对过）", "Grouping, import and summary unchanged (checked)")}</div><div>${ic("check", "sm")}${L("三种宽度截图重新对过", "Re-checked at three widths")}</div></div></div>` : "";
    const defBox = defect ? `<div class="box err"><div class="bh">${ic("circle-alert", "sm")}${L("试用发现：导入 200 人的名单，第 51 人以后没显示", "Trial found: importing 200 people, everyone after #51 is missing")}</div><div class="fact">${L("用的是项目资料里的真实大名单。这一项没过，不能安装。", "Using the real large list from Materials. This fails, so it can't be installed.")}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="fixdefect">${L("让助理修这一处", "Ask the assistant to fix this")}</button></div></div>` : "";
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h2>${L("试用", "Try it")}</h2><span class="mw-badge mw-badge--neutral tag-sim" data-slot="badge">${L("试用数据 · 不进正式记录", "Trial data · not real records")}</span></div>
      <div class="trial${S.pointing ? " pointing" : ""}"><div class="tb">${OWN.self}<strong>${L("会议签到", "Meeting check-in")}</strong><span class="fact">r${S.rev}</span><span class="grow"></span><button class="mw-btn mw-btn--sm ${S.pointing ? "mw-btn--primary" : "mw-btn--secondary"}" data-slot="button" data-act="point" aria-pressed="${S.pointing}">${ic("target", "sm")}${L("指着改", "Point to change")}</button></div>
        <div class="tbody"><div class="sess"><div class="s" aria-current="true" data-pt="sess"><strong>${L("周一例会", "Monday meeting")}</strong><div class="fact">11-03 · ${Object.keys(S.marks).length}/8 ${L("已签", "in")}</div></div><div class="s" data-pt="sess"><strong>${L("产品评审", "Product review")}</strong><div class="fact">11-05 · ${L("未开始", "Not started")}</div></div></div>
        <div><table class="names" data-pt="table"><tbody>${rows}</tbody></table></div></div></div>
      <div class="checks"><div>${ic("check", "sm")}${L("真实接通：Goals · 记一条进展（写在试用项目里）", "Really wired: Goals · Log progress (in the trial project)")}</div>${combo() ? `<div style="color:var(--amber)">${ic("alert", "sm")}${L("提醒没到的人：缺连接，试用里跳过", "Reminders: connection missing, skipped in the trial")}</div>` : ""}</div>
      ${pin}${revBox}${defBox}
      <div class="row3"><button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="go" data-n="5" ${defect ? "disabled" : ""}>${L("试用没问题，去安装", "Looks right, install")}</button><span class="fact">${defect ? L("修好上面这一处才能安装", "Fix the item above first") : L("点「指着改」再点界面上的地方，说要怎么改", "Use “Point to change”, click a spot, say what to change")}</span></div>`;
  }
  function install() {
    const fail = S.fault === "installfail" && !S.installFixed && S.installed === "failed";
    const perm = (i, t, f) => `<div class="perm">${ic(i, "sm")}<div class="tx"><div>${t}</div><div class="fact">${f}</div></div></div>`;
    if (S.installed === true) return `<h2>${L("装好了", "Installed")}</h2><div class="receipt">${ic("check", "sm")}<span>${L("「会议签到」v1 已装进项目「网站改版」", "“Meeting check-in” v1 is installed in project “网站改版”")}</span></div><p class="lead">${L("关掉创作台也能从工作台的插件列表打开；重启后照样在。", "Open it from the workbench plugin list even with the studio closed; it survives restarts.")}</p><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="go" data-n="6">${L("关掉创作台，打开它", "Close the studio and open it")}</button></div>`;
    return `<h2>${L("安装前看一眼", "Before installing")}</h2><p class="lead">${L("它装上以后能做这些，别的都不能：", "Once installed it can do these and nothing else:")}</p>
      <div class="box">${perm("database", L("读写自己的签到记录", "Read and write its own check-ins"), L("存在本项目里，卸载时一起删", "Kept in this project; removed on uninstall"))}${perm("target", L("调用 Goals · 记一条进展", "Call Goals · Log progress"), L("只在本项目，记到你选的目标上", "This project only, on the goal you pick"))}${combo() ? perm("inbox", L("调用 Inbox · 收进来", "Call Inbox · Take in"), L("只读会议邀请", "Meeting invites only")) : ""}${perm("globe", L("联网", "Network"), L("不联网", "None"))}</div>
      <div class="row3"><span class="ver">v1 · ${L("试用 r", "trial r")}${S.rev}</span><span class="fact">${L("本机构建，没有发布者签名：装的时候会再确认一次", "Built locally, unsigned: you'll confirm once more")}</span></div>
      ${fail ? `<div class="box err"><div class="bh">${ic("circle-alert", "sm")}${L("安装没通过：动作「签到」声明了，但找不到处理它的代码", "Install failed: the “Check in” action is declared but has no handler")}</div><div class="fact">${L("什么都没装上；草稿和试用结果都留着。修好这一处再装。", "Nothing was installed; the draft and trial results are kept. Fix this and install again.")}</div><div class="row3"><button class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="fixinstall">${L("回构建修这一处", "Fix it in Build")}</button></div></div>` : ""}
      <div class="row3"><button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="install" ${S.installing ? "disabled" : ""}>${S.installing ? `${kitRing("running")}${L("正在安装…", "Installing…")}` : L("安装 v1", "Install v1")}</button></div>`;
  }
  function use() {
    const n = Object.keys(S.marks).length || 7;
    return `<div class="banner3 ok">${ic("check", "sm")}<span class="grow">${L("创作台已关。这是装好的 v1；数据在本项目里，重启后照样在。", "The studio is closed. This is installed v1; data is in this project and survives restarts.")}</span><span class="mw-badge mw-badge--neutral tag-sim" data-slot="badge">${L("模拟的工作台", "Simulated workbench")}</span></div>
      <div class="surf" style="max-width:none"><div class="shellmock"><div class="bar">${OWN.self}<strong>${L("会议签到", "Meeting check-in")}</strong><span class="ver live">v1</span><span style="flex:1"></span><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="go" data-n="7">${ic("edit", "sm")}${L("在创作台里改它", "Revise in the studio")}</button></div>
        <div class="surf" style="max-width:none"><div class="used"><div class="row2">${kitRing("done")}<div class="tx"><strong>${L("周一例会", "Monday meeting")} · 11-03</strong><span class="m"><span>${n}/8 ${L("已签", "checked in")}</span><span>${L("已记到 Goals「团队例会」", "Logged on goal “Team meeting”")}</span></span></div></div><div class="row2">${kitRing("none")}<div class="tx"><strong>${L("产品评审", "Product review")} · 11-05</strong><span class="m"><span>${L("名单已导入，未开始", "List imported, not started")}</span></span></div></div></div></div></div></div>`;
  }
  function iterate() {
    if (S.adopted) return `<h2>${L("v1.1 已在用", "v1.1 is live")}</h2><div class="receipt">${ic("check", "sm")}<span>${L("已采用 v1.1；之前的签到记录都在（2 场、15 条）", "Adopted v1.1; earlier check-ins are all kept (2 meetings, 15 records)")}</span></div><div class="row3"><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="sim" data-l="${L("回到 v1", "Go back to v1")}">${L("回到 v1", "Go back to v1")}</button></div>`;
    return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><h2>${L("从已装的 v1 改", "Revising installed v1")}</h2><span class="ver">${L("草稿", "Draft")} v1.1</span><span class="ver live">${L("在用", "Live")} v1</span></div>
      <p class="lead">${L("改的是草稿；v1 照常在用，采用之前什么都不变。", "You're editing a draft; v1 keeps running and nothing changes until you adopt.")}</p>
      <div class="box"><div class="bh">${ic("git-compare", "sm")}${L("和 v1 比", "Compared with v1")}</div><div class="checks"><div>${ic("plus", "sm")}${L("会后汇总加「导出没到的人」", "Summary gets “Export who missed it”")}</div><div>${ic("edit", "sm")}${L("签到列窄一点", "Narrower check-in column")}</div></div><div class="fact">${ic("database", "sm")} ${L("签到记录的形状没变：旧记录原样保留，不用改。", "Check-in records keep their shape: old records stay as they are.")}</div></div>
      <div class="row3">${S.iterRev ? `<span class="mw-status stag partial">${L("试用通过", "Trial passed")}</span><button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="adopt">${L("采用 v1.1", "Adopt v1.1")}</button>` : `<button class="mw-btn mw-btn--primary mw-btn--md" data-slot="button" data-act="itertrial">${L("试用 v1.1", "Try v1.1")}</button>`}<button class="mw-btn mw-btn--ghost mw-btn--md" data-slot="button" data-act="sim" data-l="${L("放弃草稿", "Discard draft")}">${L("放弃草稿", "Discard draft")}</button></div>`;
  }
  const SURF = [prep, idea, plan, build, trial, install, use, iterate];

  // ---------- assistant conversation (A: left column; B/C: drawer) ----------
  function msgs() {
    const o = [], me = (x) => o.push(`<div class="mm me"><div class="bub">${esc(x)}</div></div>`), ai = (x) => o.push(`<div class="mm"><span class="who ai">AI</span><div class="bd">${x}</div></div>`);
    ai(L("这里能做出能装进工作台的插件。说说想做什么，附上手头的材料更好。", "This makes plugins you can install. Tell me what it should do; attach materials if you have them."));
    if (S.step >= 1) { me(IDEA()); ai(`<div>${L("先问两个会改变做法的问题：", "Two questions that change the approach:")}</div>${S.scheme === "A" ? qHtml() : `<div class="fact">${L("问题在页面上。", "They're on the page.")}</div>`}`); }
    if (S.step >= 2) ai(L("出了三个方案，差别在谁来点、在哪用、接哪些已有能力。第三个把邀请和跟进也接上了，不过提醒还缺连接。", "Three designs; they differ in who checks in, where, and which capabilities. The third also wires invites and follow-up, but reminders lack a connection."));
    if (S.step >= 3) { ai(L("开始构建。每一步写着产出了什么，可以随时停。", "Building. Each step says what it made; stop any time.")); if (S.bsub >= 2) ai(S.bdec ? `<div class="mini">${ic("check", "sm")}${L(`你定了「${S.bdec === "dept" ? "按部门分组" : "按姓名排"}」`, `You chose “${S.bdec === "dept" ? "group by team" : "sort by name"}”`)}</div>` : S.scheme === "A" ? decideBox() : `<div class="fact">${L("有一件事等你在页面上定。", "One decision waits on the page.")}</div>`); }
    if (S.step >= 4) ai(L("构建完了。在试用项目里用一遍：点「指着改」再点界面，告诉我哪里不对，我只改那一处。", "Built. Try it in the trial project: use “Point to change”, click a spot, tell me what's wrong, and I'll change only that."));
    if (S.revWhat) ai(S.revWhat === "mark" ? L("签到列挪到了名字左边，别的没动。", "Moved the check-in column left of the name; nothing else changed.") : L("只改了你指的那一处，别的没动。", "Changed only the spot you pointed at; nothing else."));
    if (S.step >= 5) ai(L("装之前看一眼它能做什么。", "Before installing, here's what it can do."));
    if (S.step >= 7) ai(L("从 v1 开了一份草稿 v1.1。说要改什么就行，v1 照常在用。", "Opened draft v1.1 from v1. Tell me what to change; v1 keeps running."));
    return o.join("");
  }
  const convo = () => `<div class="scroll" id="conv"><div class="msgs">${msgs()}</div></div><div class="say"><textarea id="say" rows="1" placeholder="${L("对创作助理说…", "Tell the studio assistant…")}" aria-label="${L("对创作助理说", "Tell the studio assistant")}"></textarea><button class="mw-btn mw-btn--primary mw-btn--md mw-btn--icon-only" data-slot="button" data-act="say" aria-label="${L("发送", "Send")}">${ic("send", "sm")}</button></div>`;

  // ---------- spec board (C) ----------
  function board() {
    const it = (cls, ring, t, go, f = "") => `<button class="bitem${cls}" data-act="view" data-n="${go}" style="text-align:left">${ring ? `${kitRing(ring)}` : ""}<span class="tx">${t}</span>${f}</button>`;
    const sec = (t, body) => `<div class="bsec"><div class="bt">${t}</div>${body}</div>`;
    const s = S.step;
    return `<div class="scroll"><div class="board">
      ${sec(L("想法与范围", "Idea and scope"), s >= 1 ? it("", "done", esc(IDEA()), 1) + it(S.q1 ? "" : " ask", S.q1 ? "done" : "decide", L("谁来点：", "Who checks in: ") + (S.q1 ? (S.q1 === "host" ? L("主持人", "Host") : L("每人", "Each person")) : L("待答", "to answer")), 1) + it(S.q2 ? "" : " ask", S.q2 ? "done" : "decide", L("记到 Goals：", "Log in Goals: ") + (S.q2 ? (S.q2 === "yes" ? L("记", "Yes") : L("不记", "No")) : L("待答", "to answer")), 1) : it(" ghost", "", L("还没写", "Not written yet"), 1))}
      ${sec(L("方案", "Design"), s >= 2 ? it("", "done", { c1: L("签到表", "Check-in sheet"), c2: L("门口卡片墙", "Door card wall"), c3: L("组合：从邀请到跟进", "Combined: invite to follow-up") }[S.cand], 2) : it(" ghost", "", L("还没选", "Not chosen"), 2))}
      ${sec(L("步骤与能力", "Steps and capabilities"), s >= 2 ? (combo() ? comboSteps() : [{ t: L("签到", "Check in"), cap: "self" }, { t: L("会后记一条", "Log afterwards"), cap: "goals" }]).map((x) => it(x.cap === "gap" ? " ask" : "", x.cap === "gap" ? "decide" : "done", esc(x.t), 2, capChip(x.cap))).join("") : it(" ghost", "", L("选了方案后出现", "Appears after choosing"), 2))}
      ${sec(L("构建", "Build"), s >= 3 ? it(bWaiting() ? " ask" : "", bDone() ? "done" : bFault() ? "failed" : bWaiting() ? "decide" : "running", bDone() ? L("自查 6/6 通过", "Self-check 6/6") : bWaiting() ? L("等你定：名单怎么排", "Needs you: list order") : L(`第 ${Math.min(S.bsub + 1, BUILD)} 步，共 ${BUILD} 步`, `Step ${Math.min(S.bsub + 1, BUILD)} of ${BUILD}`), 3) : it(" ghost", "", L("还没开始", "Not started"), 3))}
      ${sec(L("试用与修订", "Trial and revisions"), s >= 4 ? it("", "done", L("试用版 r", "Trial r") + S.rev + (S.moved ? L(" · 签到列挪到左边", " · check-in column moved") : ""), 4) + (S.fault === "defect" && !S.defectFixed ? it(" ask", "failed", L("51 人以后没显示", "Missing after #51"), 4) : "") : it(" ghost", "", L("构建后试用", "After build"), 4))}
      ${sec(L("权限与版本", "Access and versions"), s >= 5 ? it("", S.installed === true ? "done" : "none", S.installed === true ? L("v1 已装", "v1 installed") : L("v1 待装", "v1 to install"), 5) + (s >= 7 ? it("", S.adopted ? "done" : "running", S.adopted ? L("v1.1 在用", "v1.1 live") : L("草稿 v1.1", "Draft v1.1"), 7) : "") : it(" ghost", "", L("试用后安装", "After trial"), 5))}
    </div></div>`;
  }

  // ---------- frames per option ----------
  function stepper(thin) {
    const n = STAGE_NAMES();
    return `<nav class="stepper${thin ? " thin" : ""}" aria-label="${L("阶段", "Stages")}">${n.map((x, i) => `${i ? '<span class="sep"></span>' : ""}<button data-act="view" data-n="${i}" ${i > S.step ? "disabled" : ""} class="${i < S.step ? "done" : ""}" ${i === S.view ? 'aria-current="step"' : ""}>${i < S.step ? ic("check", "sm") : `${kitRing(i === S.step ? (S.step === 3 && bRunning() ? "running" : "decide") : "none")}`}${x}</button>`).join("")}</nav>`;
  }
  const surf = () => (S.view === 6 ? use() : `<div class="surf">${SURF[S.view]()}</div>`);
  const viewing = () => (S.view < S.step ? `<div class="banner3 warn">${ic("eye", "sm")}<span class="grow">${L("在看之前的阶段；改这里会让后面的阶段按新内容重做", "Viewing an earlier stage; changes here redo the later stages")}</span><button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="view" data-n="${S.step}">${L("回到当前", "Back to current")}</button></div>` : "");
  function head() {
    const side = S.scheme === "A" ? [L("对话", "Chat"), L("阶段", "Stage")] : S.scheme === "C" ? [L("规格板", "Spec board"), L("阶段", "Stage")] : null;
    return `<div class="shead">${OWN.self}<h1><span class="pre">${L("插件创作台", "Plugin studio")} · </span>${L("会议签到", "Meeting check-in")}</h1>${S.installed === true ? '<span class="ver live">v1</span>' : `<span class="ver">${L("草稿", "Draft")}</span>`}<span class="grow"></span>${side ? `<span class="mw-toggle-group mswitch" data-slot="toggle-group" data-seg-thumb role="group">${side.map((l, i) => `<button data-act="side" data-v="${i === 0}" aria-pressed="${S.side === (i === 0)}">${l}</button>`).join("")}</span>` : ""}${S.scheme !== "A" ? `<button class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="drawer" aria-expanded="${S.drawer}">${ic("sparkles", "sm")}<span class="lbl">${L("问助理", "Ask")}</span></button>` : ""}<button class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only" data-slot="button" data-act="sim" data-l="${L("关掉创作台", "Close the studio")}" aria-label="${L("关掉", "Close")}">${ic("x", "sm")}</button></div>`;
  }
  function frame() {
    if (S.scheme === "A") return `${head()}<div class="cols a${S.side ? " show-side" : ""}"><section class="col side">${convo()}</section><section class="col main">${stepper(true)}${viewing()}<div class="scroll">${surf()}</div></section></div>`;
    if (S.scheme === "B") {
      return `${head()}${stepper(false)}${viewing()}<div class="cols b"><section class="col main"><div class="scroll">${surf()}</div><div class="navrow"><button class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="view" data-n="${Math.max(0, S.view - 1)}" ${S.view ? "" : "disabled"}>${ic("chevron-left", "sm")}${L("上一阶段", "Previous")}</button><span class="fact">${L(`第 ${S.view + 1} 阶段，共 ${STAGES} 个`, `Stage ${S.view + 1} of ${STAGES}`)}</span><span style="width:90px"></span></div></section></div>${drawer()}`;
    }
    return `${head()}<div class="cols c${S.side ? " show-side" : ""}"><section class="col side">${board()}</section><section class="col main">${viewing()}<div class="scroll">${surf()}</div></section></div>${drawer()}`;
  }
  const drawer = () => (S.drawer ? `<div class="drawer" role="dialog" aria-label="${L("创作助理", "Studio assistant")}"><div class="dh">${ic("sparkles", "sm")}${L("创作助理", "Studio assistant")}<span style="flex:1"></span><button class="mw-btn mw-btn--ghost mw-btn--sm mw-btn--icon-only" data-slot="button" data-act="drawer" aria-label="${L("关掉", "Close")}">${ic("x", "sm")}</button></div>${convo()}</div>` : "");

  function render() {
    const conv = document.getElementById("conv"), atBottom = conv ? conv.scrollHeight - conv.scrollTop - conv.clientHeight < 40 : true, st = conv?.scrollTop;
    const say = document.getElementById("say")?.value;
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en"; document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.resolvedTheme = S.theme;
    const P = { protoTitle: L("原型 · 模拟数据", "Prototype · sample data"), scheme: L("方案", "Option"), step: L("剧本", "Script"), prev: L("上一步", "Back"), next: L("下一步", "Next"), fault: L("情况", "Situation"), lang: L("语言", "Language"), theme: L("外观", "Theme"), light: L("浅", "Light"), dark: L("深", "Dark"), reset: L("重置", "Reset") };
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = P[n.dataset.t]));
    for (const b of document.querySelectorAll("#scheme button")) b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme);
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    document.getElementById("fault").innerHTML = faults().map(([v, l]) => `<option value="${v}"${v === S.fault ? " selected" : ""}>${l}</option>`).join("");
    document.getElementById("stepcap").textContent = `${S.step}/7 · ${caption()}`;
    document.getElementById("app").innerHTML = `<div class="studio s-B">${S.view === 6 ? use() : frame()}</div>`;
    const nc = document.getElementById("conv"); if (nc) nc.scrollTop = atBottom || st == null ? nc.scrollHeight : st;
    if (say) document.getElementById("say").value = say;
    const cur = document.querySelector(".stepper [aria-current=step]"); if (cur) cur.parentElement.scrollLeft = cur.offsetLeft - 40;
    save(); tick();
  }

  // ---------- script driver ----------
  function goStep(n) {
    n = Math.max(0, Math.min(STAGES - 1, n));
    if (n < S.step) S = { ...fresh(), scheme: S.scheme, lang: S.lang, theme: S.theme, fault: S.fault };
    while (S.step < n) {
      const s = S.step;
      if (s === 0 && S.fault === "config") S.cfg = true;
      if (s === 1) { S.q1 = S.q1 || "host"; S.q2 = S.q2 || "yes"; }
      if (s === 3) { S.bsub = BUILD; S.bdec = S.bdec || "dept"; S.bfix = true; S.resumed = true; S.bctl = null; S.afix = true; }
      if (s === 4) { if (S.rev < 2) { S.rev = 2; S.revWhat = "mark"; S.moved = true; } S.pin = null; S.pointing = false; S.defectFixed = true; if (!Object.keys(S.marks).length) PEOPLE.slice(0, 7).forEach(([p]) => (S.marks[p] = 1)); }
      if (s === 5) { S.installed = true; S.installFixed = true; S.installing = false; }
      S.step++;
    }
    S.view = S.step; S.drawer = S.scheme === "A" ? false : S.drawer;
    render();
  }
  let toastT;
  function toast(m) { document.querySelector(".mw-toast")?.remove(); const el = document.createElement("div"); el.className = "mw-toast"; el.setAttribute("role", "status"); el.textContent = m; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3200); }
  document.addEventListener("click", (e) => {
    if (S.pointing) { const p = e.target.closest("[data-pt]"); if (p && !e.target.closest("[data-act=point]")) { e.preventDefault(); e.stopPropagation(); S.pin = p.dataset.pt; S.pointing = false; return render(); } }
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set]");
    if (!b || b.disabled) return;
    if (b.dataset.scheme) { S.scheme = b.dataset.scheme; S.drawer = false; S.side = false; return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    const { act } = b.dataset, n = +b.dataset.n, i = +b.dataset.i;
    switch (act) {
      case "go": return goStep(n);
      case "view": S.view = Math.min(n, S.step); S.side = false; return render();
      case "side": S.side = b.dataset.v === "true"; return render();
      case "drawer": S.drawer = !S.drawer; return render();
      case "cfg": S.cfg = true; render(); return toast(L("用 MiniMax-M2；想法没丢", "Using MiniMax-M2; your idea is kept"));
      case "ans": S[b.dataset.k] = b.dataset.v; return render();
      case "cand": S.cand = b.dataset.v; S.aiStale = false; return render();
      case "up": { const st = comboSteps().slice(); [st[i - 1], st[i]] = [{ ...st[i], who: "hu" }, st[i - 1]]; S.combo = st; if (S.aiPending) { S.aiPending = "stale"; } return render(); }
      case "rm": { const st = comboSteps().filter((_, k) => k !== i); S.combo = st; if (S.aiPending) S.aiPending = "stale"; return render(); }
      case "ai-edit": S.aiPending = true; render(); setTimeout(() => { if (S.aiPending === "stale") { S.aiStale = true; } else { const st = comboSteps().slice(); st.splice(2, 0, { id: "k5", t: L("开会前一天发名单给主持人", "Send the list to the host the day before"), cap: "self", who: "ai" }); S.combo = st; toast(L("助理加了一步", "The assistant added a step")); } S.aiPending = false; render(); }, 2200); return;
      case "ai-apply": { const st = comboSteps().slice(); st.push({ id: "k5", t: L("开会前一天发名单给主持人", "Send the list to the host the day before"), cap: "self", who: "ai" }); S.combo = st; S.aiStale = false; return render(); }
      case "ai-drop": S.aiStale = false; return render();
      case "bdec": S.bdec = b.dataset.v; S.bsub = 3; return render();
      case "bstop": S.bctl = "stopping"; render(); setTimeout(() => { S.bctl = "stopped"; render(); }, 1200); return;
      case "bresume": S.bctl = null; return render();
      case "bfix": S.bfix = true; S.bsub++; return render();
      case "aview": S.aview = "seen"; render(); return toast(L("试用项目里：选中「周会」后名单 8 人都在", "In the trial project: all 8 people show once the meeting is selected"));
      case "afix": S.afix = true; render(); return toast(b.dataset.k === "ui" ? L("改了界面，重新验收：5/5 通过", "Screen changed and re-checked: 5/5 passed") : L("改了这条验收，重新验收：5/5 通过", "Check changed and re-run: 5/5 passed"));
      case "resume-intr": S.resumed = true; S.bsub = 2; render(); return toast(L("核对过：第 3 步没写进去，从第 3 步接着做", "Checked: step 3 hadn't written anything; continuing from step 3"));
      case "point": S.pointing = !S.pointing; S.pin = null; return render();
      case "unpin": S.pin = null; return render();
      case "revise": S.revWhat = S.pin; if (S.pin === "mark") S.moved = true; S.pin = null; S.rev++; return render();
      case "undo-rev": if (S.revWhat === "mark") S.moved = false; S.revWhat = null; S.rev--; return render();
      case "mark": if (S.marks[b.dataset.n]) delete S.marks[b.dataset.n]; else S.marks[b.dataset.n] = 1; return render();
      case "fixdefect": S.defectFixed = true; S.rev++; render(); return toast(L(`修订 r${S.rev}：名单改成滚动加载，200 人都在`, `Revision r${S.rev}: list now loads as you scroll; all 200 shown`));
      case "install": S.installing = true; render(); setTimeout(() => { S.installing = false; S.installed = S.fault === "installfail" && !S.installFixed ? "failed" : true; render(); }, 1300); return;
      case "fixinstall": S.installFixed = true; S.installed = false; render(); return toast(L("补上了处理器，自查通过；可以再装", "Handler added, self-check passed; install again"));
      case "itertrial": S.iterRev = 1; render(); return toast(L("v1.1 在试用项目里过了一遍", "v1.1 ran through the trial project"));
      case "adopt": S.adopted = true; return render();
      case "say": { const v = document.getElementById("say").value.trim(); if (!v) return; document.getElementById("say").value = ""; return toast(L("（原型只演示剧本；这句没有处理。）", "(The prototype only plays the script; this wasn't handled.)")); }
      case "sim": return toast(`「${b.dataset.l}」（${L("模拟", "simulated")}）`);
    }
  }, true);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (S.pointing || S.pin) { S.pointing = false; S.pin = null; render(); } else if (S.drawer) { S.drawer = false; render(); } }
    if (e.key === "Enter" && !e.shiftKey && e.target.id === "say" && !e.isComposing) { e.preventDefault(); document.querySelector('[data-act="say"]').click(); }
  });
  document.getElementById("prev").addEventListener("click", () => goStep(S.step - 1));
  document.getElementById("next").addEventListener("click", () => goStep(S.step + 1));
  document.getElementById("fault").addEventListener("change", (e) => { S = { ...fresh(), scheme: S.scheme, lang: S.lang, theme: S.theme, fault: e.target.value }; render(); });
  document.getElementById("reset").addEventListener("click", () => { S = { ...fresh(), lang: S.lang, theme: S.theme, scheme: S.scheme }; render(); });
  render();
})();
