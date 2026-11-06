// N14 · "this rule changed elsewhere" — three schemes on the rule editor (workbench page) and Feed's rule composer (plugin page).
// The markup of both pages is the product's own (./export.mjs), the look is the product's sheets; everything that happens is
// simulated: every rule, every save, the other party, and the failures. Nothing reads or writes a Home.
//   #s=A|B|C  &h=editor|feed  &st=<state>  &d=plain|full|empty  &l=zh|en  &t=light|dark   a state can be opened directly from the address.
(() => {
  const app = document.getElementById("app");
  const FRAG = window.RULE_FRAGMENTS;
  const SCHEMES = [["A", ["A 就地接住", "A Keep it in place"]], ["B", ["B 对比后决定", "B Compare, then decide"]], ["C", ["C 拦下来问", "C Stop and ask"]]];
  const HOSTS = [["editor", ["判断规则编辑器（工作台页面）", "Rule editor (workbench page)"]], ["feed", ["Feed 捕捉规则（插件页面）", "Feed capture rule (plugin page)"]]];
  const DATA = [["plain", ["常规", "Typical"]], ["full", ["最挤", "Crowded"]], ["empty", ["最空", "Sparse"]]];
  const BASE_STATES = [
    ["normal", ["正常编辑", "Editing normally"]],
    ["conflict", ["发生冲突", "Just collided"]],
    ["kept", ["未保存内容还在", "Unsaved work still here"]],
    ["loaded", ["已载入最新版", "Latest loaded"]],
    ["offline", ["重新载入失败（断网）", "Reload failed (offline)"]],
    ["deleted", ["这条规则已被删除", "Rule was deleted"]],
    ["second", ["连续第二次冲突", "Second collision in a row"]],
    ["clean", ["没有未保存内容", "Nothing unsaved"]],
    ["noop", ["别处只试跑过，内容没变", "Only a test run elsewhere"]],
    ["published", ["已在别处发布（补充）", "Published elsewhere (extra)"]],
  ];
  const statesOf = (scheme) => {
    if (scheme === "B") return [...BASE_STATES.slice(0, 2), ["compare", ["对比面板打开", "Compare sheet open"]], ...BASE_STATES.slice(2)];
    if (scheme === "C") return [...BASE_STATES.slice(0, 2), ["ask", ["对话框打开", "Dialog open"]], ...BASE_STATES.slice(2)];
    return BASE_STATES;
  };

  const initial = { scheme: "A", host: "editor", state: "normal", data: "plain", lang: "zh", theme: "light" };
  const fromHash = () => { const q = new URLSearchParams(location.hash.slice(1)); return { scheme: q.get("s"), host: q.get("h"), state: q.get("st"), data: q.get("d"), lang: q.get("l"), theme: q.get("t") }; };
  const S = { ...initial };
  for (const [key, value] of Object.entries(fromHash())) if (value) S[key] = value;
  const toHash = () => { history.replaceState(null, "", `#s=${S.scheme}&h=${S.host}&st=${S.state}&d=${S.data}&l=${S.lang}&t=${S.theme}`); };

  const P = window.molisParts(() => S.lang);
  const { esc, ic, btn, toast } = P;
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (S.lang === "zh" ? pair[0] : pair[1]);

  // ---------- Sample rules: what you loaded (base), what you have now (mine), what is there now (latest) ----------
  const criteria = (rows) => rows.map(([key, text]) => ({ key, text }));
  const LONG_ZH = "优先跟进与当前项目相关、需要我采取行动的消息。判断时先看发件人是不是正在沟通的客户、合作方或同事；再看消息里有没有明确的请求、截止时间或需要我确认的内容。\n如果消息提到付款失败、退款、账号被锁、数据丢失或服务中断，无论来自谁都算要跟进。\n广告、订阅通知、自动回复、活动邀请和重复内容可以忽略；只是分享链接、没有提问的，存起来以后再看。\n拿不准时选存起来，并在理由里写清楚缺什么信息。";
  const LONG_EN = "Prioritise messages tied to the current project that need me to act. First check whether the sender is a customer, partner or colleague I am talking to; then whether the message has a clear request, a deadline or something I must confirm.\nPayment failures, refunds, locked accounts, data loss and outages always count as follow-ups, whoever sends them.\nAds, subscription notices, auto-replies, event invitations and repeats can be ignored; links shared without a question are saved for later.\nWhen unsure, save it and say in the reason what is missing.";
  const versions = () => {
    const zh = S.lang === "zh", full = S.data === "full", empty = S.data === "empty";
    if (S.host === "editor") {
      const baseCrit = zh ? [["跟进", "需要我回复或采取行动"], ["存起来", "以后可能用到"], ["忽略", "广告或重复内容"]] : [["follow_up", "Needs my reply or action"], ["save", "May be useful later"], ["ignore", "Ads or repeats"]];
      const moreCrit = zh ? [["转交", "涉及退款或法务，转给负责人"]] : [["hand_off", "Refunds or legal: pass to the owner"]];
      const extraCrit = zh ? [["催办", "已经超过约定时间"], ["归档", "已经有结论的讨论"], ["标记风险", "可能影响交付或合同"]] : [["chase", "Past the agreed date"], ["archive", "Discussion already settled"], ["flag_risk", "May affect delivery or a contract"]];
      const baseText = zh ? "优先跟进与当前项目相关、需要我采取行动的消息；广告和重复内容可以忽略。" : "Prioritise messages tied to the current project that need me to act; ads and repeats can be ignored.";
      const base = { name: zh ? "筛选值得跟进的消息" : "Pick messages worth following up", instructions: full ? LONG_ZH_OR(zh) : baseText, criteria: criteria(baseCrit) };
      const mine = {
        name: full ? (zh ? "筛选值得跟进的客户与合作方消息，并标出需要今天处理的部分（第二版，给客服和销售一起用）" : "Pick customer and partner messages worth following up, and mark what must be handled today (second draft, shared with support and sales)") : zh ? "筛选值得跟进的客户消息" : "Pick customer messages worth following up",
        instructions: empty ? "" : base.instructions + (zh ? "\n付款问题和用户投诉一律算要跟进。" : "\nPayment problems and complaints always count."),
        criteria: full ? criteria([...baseCrit, ...extraCrit]) : base.criteria,
      };
      const latest = {
        name: full ? (zh ? "筛选值得跟进的消息（客服版，按紧急程度和负责人分开处理，别和销售线索混在一起）" : "Pick messages worth following up (support edition, split by urgency and owner, kept apart from sales leads)") : base.name,
        instructions: zh ? "优先跟进客户提到的问题和明确的请求；自动通知、广告和重复内容可以忽略。" + (full ? "\n" + LONG_ZH.slice(0, 120) + "……" : "") : "Prioritise problems and clear requests from customers; automatic notices, ads and repeats can be ignored." + (full ? "\n" + LONG_EN.slice(0, 180) + "…" : ""),
        criteria: criteria([...baseCrit, ...moreCrit]),
      };
      return { base, mine, latest };
    }
    const base = { name: zh ? "需要跟进的产品反馈" : "Product feedback to follow up", instructions: zh ? "用户反馈无法登录、付款失败或数据丢失；忽略日常通知和推广。" : "Users reporting login failures, failed payments or data loss; ignore routine notices and promotions." };
    const mine = {
      name: full ? (zh ? "需要跟进的用户反馈：登录、付款、数据丢失，以及所有提到退款和投诉的消息（客服每天早上看）" : "User feedback to follow up: login, payments, data loss, and anything about refunds or complaints (support reads it each morning)") : zh ? "需要跟进的用户反馈" : "User feedback to follow up",
      instructions: empty ? "" : base.instructions + (zh ? "\n提到退款的也算。" : "\nAnything about refunds counts too.") + (full ? "\n" + (zh ? LONG_ZH : LONG_EN) : ""),
    };
    const latest = {
      name: full ? (zh ? "需要跟进的产品反馈（只看登录和付款，别的先放着）" : "Product feedback to follow up (login and payments only for now)") : base.name,
      instructions: zh ? "用户反馈无法登录或付款失败；忽略日常通知、推广和自动回复。" : "Users reporting login failures or failed payments; ignore routine notices, promotions and auto-replies.",
    };
    return { base, mine, latest };
  };
  function LONG_ZH_OR(zh) { return zh ? LONG_ZH : LONG_EN; }
  const FIELDS = () => S.host === "editor"
    ? [{ id: "name", step: "look", label: L("名称", "Name") }, { id: "instructions", step: "fn", label: L("判断说明", "Judgment instructions") }, { id: "criteria", step: "fn", label: L("返回哪些结果", "Possible results") }]
    : [{ id: "name", label: L("规则名称", "Rule name") }, { id: "instructions", label: L("描述", "Description") }];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const showValue = (id, value) => id === "criteria" ? value.map((row) => `${row.key}: ${row.text}`).join("\n") : value;
  /** Who changed each field, against the version you loaded. */
  const whoChanged = () => {
    const { base, mine, latest } = V;
    return FIELDS().map((field) => {
      const yours = !same(M.cur[field.id], base[field.id]), theirs = !same(latest[field.id], base[field.id]);
      const differs = !same(M.cur[field.id], latest[field.id]);
      return { ...field, yours, theirs, differs, who: !differs ? null : yours && theirs ? "both" : yours ? "you" : "they" };
    });
  };

  // ---------- The page's working state ----------
  let V, M, timers = [];
  const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const startModel = () => {
    V = versions();
    const conflictLike = !["normal", "clean", "noop"].includes(S.state);
    M = {
      phase: S.state, cur: structuredClone(conflictLike ? V.mine : V.base), kept: {}, step: "fn", washed: new Set(), busy: false, dialog: null,
      armed: S.state === "normal", savedAs: null, readonly: false, discarded: false, previewed: false, savedText: "",
    };
    if (S.state === "kept") { M.step = "use"; M.cur.instructions = (M.cur.instructions || "") + L("\n转发过来的也要看。", "\nForwarded messages count too."); }
    if (S.state === "clean") { M.step = "use"; M.cur = structuredClone(V.latest); M.washed = new Set(whoChangedAgainstBase()); M.lookAt = whoChangedAgainstBase(); M.phase = "clean"; }
    if (S.state === "noop") M.savedText = L("已保存", "Saved");
    if (S.state === "normal") M.savedText = L("草稿自动保存", "Drafts save automatically");
    if (S.host === "feed" && S.state === "normal") M.cur = structuredClone(V.mine); // what is typed in Feed reaches the rule only when you press a button
    if (S.state === "loaded") {
      if (S.scheme === "A") applyLatest(false);
      if (S.scheme === "B") { const picks = defaultPicks(); for (const [id, which] of Object.entries(picks)) if (which !== "mine") M.cur[id] = structuredClone(V.latest[id]); M.undo = structuredClone(V.mine); M.phase = "merged"; M.washed = new Set(Object.keys(picks)); }
      if (S.scheme === "C") { M.cur = structuredClone(V.latest); M.washed = new Set(whoChangedAgainstBase()); M.savedText = L("已保存", "Saved"); }
    }
    if (S.scheme === "B" && S.state === "compare") { M.phase = "conflict"; M.dialog = "compare"; M.picks = defaultPicks(); }
    if (S.scheme === "C" && S.state === "ask") { M.phase = "conflict"; M.dialog = "ask"; }
    if (S.scheme === "C" && S.host === "feed" && S.state === "conflict") M.dialog = "ask"; // Feed only ever submits on a press, so C asks at once
    if (S.scheme === "C" && ["deleted", "second", "offline", "published"].includes(S.state)) M.dialog = "ask";
  };
  const whoChangedAgainstBase = () => FIELDS().filter((f) => !same(V.latest[f.id], V.base[f.id])).map((f) => f.id);

  /** Scheme A's reload: the latest version comes in; what only you changed stays; where both changed, yours waits under the field. */
  function applyLatest(animated = true) {
    const report = whoChanged(), next = structuredClone(M.cur);
    M.kept = {}; M.washed = new Set();
    let i = 0;
    for (const field of report) {
      if (field.who === "they") { next[field.id] = structuredClone(V.latest[field.id]); M.washed.add(field.id); }
      if (field.who === "both") { M.kept[field.id] = { value: structuredClone(M.cur[field.id]), swapped: false, i: i++, fresh: animated }; next[field.id] = structuredClone(V.latest[field.id]); M.washed.add(field.id); }
    }
    M.cur = next;
    M.phase = "loaded";
    M.keptYours = report.filter((f) => f.who === "you").map((f) => f.label);
    M.keptTheirs = report.filter((f) => f.who === "they").map((f) => f.label);
    M.lookAt = report.filter((f) => f.who === "they").map((f) => f.id);
    M.savedText = "";
  }
  function defaultPicks() { const picks = {}; for (const f of whoChanged()) if (f.differs) picks[f.id] = f.who === "you" ? "mine" : f.who === "they" ? "latest" : null; return picks; }

  // ---------- Frames ----------
  const barHtml = () => `<div class="workbench-bar" data-dock aria-label="${L("底栏", "Bottom bar")}"><div class="bar-start"><div class="plugin-picker"><button class="plugin-picker-trigger" type="button" aria-expanded="false" aria-label="${L("全部插件与 Dock", "All plugins and Dock")}"><span class="plugin-picker-all" aria-hidden="true">${ic("grid")}</span><span class="plugin-picker-current">${ic("rss")}<span>Feed</span></span>${ic("chevron-down")}</button></div><div class="dock-pins" role="toolbar" aria-label="${L("常驻插件", "Kept plugins")}">${[["home", "home", L("项目首页", "Project home")], ["pages", "note", "Pages"], ["feed", "rss", "Feed"]].map(([id, g, t]) => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" aria-label="${t}" title="${t}"${id === "feed" ? ' aria-current="page"' : ""}>${ic(g)}</button>`).join("")}</div></div>
    <div class="bar-center"><form class="assistant-composer bar-composer" aria-label="Molis Work Assistant" onsubmit="return false"><input class="assistant-composer-input" type="text" autocomplete="off" placeholder="${L("让助理做点什么…", "Ask the Assistant…")}" aria-label="${L("发给助理", "Message the Assistant")}"><button class="bar-composer-attach" type="button" aria-label="${L("添加文件、引用或能力", "Add files, references or capabilities")}">${ic("paperclip")}</button>${btn({ variant: "primary", size: "sm", only: true, icon: "send", label: L("发送", "Send"), disabled: true })}</form></div>
    <div class="bar-end"><section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${L("当前项目", "Current project")}"><div class="navigator-project-primary"><details class="navigator-project-menu"><summary class="navigator-project-selector" aria-label="${L("切换项目", "Switch project")}">${P.monogram("A")}<strong>${L("AI 产品观察", "AI product watch")}</strong>${ic("chevron-down")}</summary></details></div></section></div></div>`;
  const capabilityNav = () => `<nav class="settings-navigation settings-navigation--codex" aria-label="${L("能力服务", "Capability services")}"><a class="settings-nav-back" href="#" data-act="noop">${ic("back")}${L("返回工作台", "Back to workbench")}</a><div class="settings-project-identity"><strong>${L("能力", "Capabilities")}</strong><span>${L("系统服务", "System service")}</span></div><div class="settings-nav-body">${[["library", "grid", L("能力库", "Capability library")], ["history", "clock", L("调用记录", "Call history")]].map(([id, g, t]) => `<a href="#" data-act="noop"${id === "library" ? ' aria-current="page"' : ""}>${ic(g)}${t}</a>`).join("")}</div></nav>`;

  function mountEditor() {
    document.getElementById("css-settings").disabled = false;
    document.getElementById("css-workbench").disabled = true;
    document.getElementById("css-feed").disabled = true;
    document.body.className = "proto-on settings-page project-preferences-page global-preferences-page capabilities-page";
    document.body.dataset.settingsSection = "capabilities";
    app.innerHTML = `<header class="project-preferences-chrome"><span>${L("能力", "Capabilities")}</span><a href="#" data-act="noop" aria-label="${L("关闭能力服务", "Close capability services")}">${ic("x")}</a></header>
      <main class="settings-shell">${capabilityNav()}<div class="settings-content">${FRAG[S.lang].editor}</div></main>`;
    const bench = app.querySelector("[data-functions=workbench]");
    bench.setAttribute("data-settings-panel", "rules");
    bench.setAttribute("data-expanded", "true");
    bench.querySelector("[data-functions-stage-workspace]").hidden = false;
    bench.querySelector("[data-functions-empty]").hidden = true;
    bench.querySelector("[data-functions-kind-description]").textContent = L("结果选择：从你定义的结果中选出一个，例如跟进、保存或忽略。", "Choose a result: picks one of the results you define, such as follow up, save or ignore.");
    bench.querySelector("[data-functions-release-hint]").textContent = L("发布会锁定名称、规则和用途。确认试跑符合预期后再发布；发布不会自动启用页面判断。", "Publishing locks the name, rule and use. Publish once test runs look right; publishing does not turn on page judgments.");
    bench.querySelector("[data-functions-editor-status]").textContent = L("草稿", "Draft");
    bench.querySelector("[data-functions-criteria-hint]").textContent = L("至少两个结果。", "At least two results.");
    bench.querySelector("[data-functions-criteria-label]").textContent = L("返回哪些结果", "Possible results");
    bench.querySelector("[data-functions-map-panel]").hidden = true;
    bench.querySelector("[data-functions-add-criterion]").hidden = false;
    bench.querySelector("[data-functions-note]").hidden = true;
    bench.querySelector("[data-functions-key]").value = "pick_followups";
    bench.querySelector("[data-functions-preview-input]").value = L("你好，上周的发票还没收到，这周五前能发给我吗？", "Hi, I still haven't received last week's invoice. Could you send it by Friday?");
    const dest = bench.querySelector(".functions-dest"); dest.setAttribute("aria-pressed", "true");
    const footer = bench.querySelector(".functions-feedback");
    const slot = document.createElement("div"); slot.dataset.band = ""; footer.append(slot);
  }
  function mountFeed() {
    document.getElementById("css-settings").disabled = true;
    document.getElementById("css-workbench").disabled = false;
    document.getElementById("css-feed").disabled = false;
    document.body.className = "proto-on immersive-workbench";
    delete document.body.dataset.settingsSection;
    app.innerHTML = `<div class="proto-desk"><div class="proto-sheet">${FRAG[S.lang].feed}</div>${barHtml()}</div>`;
    const wb = app.querySelector("[data-feed-workbench]");
    wb.dataset.feedView = "rules";
    wb.hidden = false;
    const panel = app.querySelector("[data-feed-sources-dialog]");
    panel.hidden = false;
    panel.querySelector("h2").textContent = L("捕捉规则", "Capture rules");
    panel.querySelector("[data-feed-setup-description]").textContent = L("在这里写规则、预览，再决定哪些消息进入 Inbox。", "Write rules here, preview them, then decide what reaches Inbox.");
    panel.querySelectorAll("[data-feed-source-choices],[data-feed-source-setup]").forEach((n) => { n.hidden = true; });
    panel.querySelector("[data-feed-task-configs]").hidden = false;
    panel.querySelectorAll("[data-feed-task-config]").forEach((n) => { n.hidden = false; });
    panel.querySelectorAll("[data-feed-config-section]").forEach((n) => { n.hidden = n.dataset.feedConfigSection !== "rules"; });
    panel.querySelectorAll(".mw-form__footer").forEach((n) => { n.hidden = true; });
    const section = panel.querySelector("[data-feed-out-rules]");
    section.dataset.ruleMode = "natural";
    section.querySelectorAll("[data-feed-rule-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.feedRuleMode === "natural")));
    section.querySelectorAll("[data-feed-rule-field]").forEach((f) => { f.hidden = f.dataset.feedRuleField !== "natural"; });
    const slot = document.createElement("div"); slot.dataset.band = ""; section.querySelector(".feed-rule-actions").after(slot);
    section.querySelector("[data-feed-rule-composer]").scrollIntoView({ block: "start" });
  }

  // ---------- Painting the editable fields ----------
  const fieldEl = (id) => S.host === "editor"
    ? app.querySelector({ name: "[data-functions-name]", instructions: "[data-functions-instructions]" }[id] || "[data-functions-criteria]")
    : app.querySelector({ name: "[data-feed-out-rule-name]", instructions: "[data-feed-rule-instructions]" }[id]);
  const fieldBox = (id) => {
    if (S.host === "editor") return id === "name" ? app.querySelector(".functions-name") : id === "instructions" ? app.querySelector("[data-functions-instructions]").closest("label") : app.querySelector("[data-functions-criteria]");
    return fieldEl(id).closest("label");
  };
  const paintCriteria = (rows) => {
    const box = app.querySelector("[data-functions-criteria]");
    const now = [...box.querySelectorAll(".functions-criterion")].map((row) => ({ key: row.querySelector("[data-choice-key]").value, text: row.querySelector("[data-choice-description]").value }));
    if (same(now, rows)) return;
    box.innerHTML = rows.map((row) => `<div class="functions-criterion" data-choice-row="true"><input class="mw-input" data-choice-description autocomplete="off" aria-label="${L("选择此结果的条件", "When to choose this result")}" value="${esc(row.text)}"><input class="mw-input" data-choice-key spellcheck="false" autocomplete="off" aria-label="${L("结果标识", "Result key")}" value="${esc(row.key)}"><button class="mw-btn mw-btn--ghost mw-btn--icon-only" type="button" aria-label="${L("去掉结果", "Remove result")}" data-act="noop">${ic("x")}</button></div>`).join("");
  };
  function paintFields() {
    for (const field of FIELDS()) {
      if (field.id === "criteria") paintCriteria(M.cur.criteria);
      else { const el = fieldEl(field.id); if (el.value !== M.cur[field.id]) el.value = M.cur[field.id]; el.disabled = M.readonly; }
    }
    if (S.host === "editor") {
      app.querySelector("[data-functions-editor-title]").textContent = M.cur.name || L("判断", "Judgment");
      app.querySelector("[data-functions-editor-status]").textContent = M.readonly ? "v1" : L("草稿", "Draft");
      app.querySelector("[data-functions-delete]").hidden = M.readonly || M.phase === "deleted" || M.phase === "published";
      app.querySelector("[data-functions-publish]").hidden = M.readonly;
    }
  }
  const wash = () => {
    for (const id of M.washed) { const box = fieldBox(id); if (!box) continue; box.setAttribute("data-craft-new", ""); later(900, () => box.removeAttribute("data-craft-new")); }
    M.washed = new Set();
  };
  function paintKept() {
    app.querySelectorAll(".cand-kept").forEach((n) => n.remove());
    for (const [id, kept] of Object.entries(M.kept)) {
      const box = fieldBox(id); if (!box) continue;
      const shown = kept.swapped ? V.latest[id] : kept.value;
      const text = showValue(id, shown);
      const node = document.createElement("div");
      node.className = `cand-kept${kept.swapped ? " is-swapped" : ""}${kept.fresh ? "" : " is-settled"}`;
      node.style.setProperty("--i", kept.i);
      node.dataset.keptField = id;
      const long = text.length > 140 || text.split("\n").length > 3;
      const who = kept.swapped ? L("最新版", "Latest version") : L("你写的", "You wrote");
      node.innerHTML = `<div class="cand-kept__head"><span class="cand-kept__who">${who}</span>${btn({ variant: "ghost", size: "sm", label: kept.swapped ? L("换回", "Swap back") : L("放回", "Put back"), attrs: { "data-act": "kept-swap", "data-arg": id, "aria-label": `${kept.swapped ? L("换回最新版", "Swap back to the latest") : L("放回你写的", "Put back what you wrote")}：${FIELDS().find((f) => f.id === id).label}` } })}</div>
        <p class="cand-kept__text${text ? "" : " is-blank"}${kept.open ? " is-open" : ""}">${text ? esc(text) : L("你清空了这一栏", "You cleared this field")}</p>${long ? `<button type="button" class="cand-kept__more" data-act="kept-more" data-arg="${id}">${kept.open ? L("收起", "Show less") : L("看全部", "Show all")}</button>` : ""}`;
      box.after(node);
      kept.fresh = false;
    }
  }
  function paintSteps() {
    if (S.host !== "editor") return;
    const prev = app.querySelector("[data-functions-prev]"), next = app.querySelector("[data-functions-next]");
    app.querySelectorAll("[data-functions-col]").forEach((node) => { node.hidden = node.dataset.functionsCol !== M.step; });
    if (M.lookAt) M.lookAt = M.lookAt.filter((id) => FIELDS().find((f) => f.id === id)?.step !== M.step);
    app.querySelectorAll("[data-functions-step]").forEach((node) => {
      if (node.dataset.functionsStep === M.step) node.setAttribute("aria-current", "step"); else node.removeAttribute("aria-current");
      const flagged = [...Object.keys(M.kept).filter((id) => !M.kept[id].swapped), ...(M.lookAt || [])].some((id) => FIELDS().find((f) => f.id === id)?.step === node.dataset.functionsStep);
      if (flagged && node.dataset.functionsStep !== M.step) node.setAttribute("data-cand-dot", ""); else node.removeAttribute("data-cand-dot");
    });
    prev.hidden = M.step === "look";
    next.hidden = M.step === "use";
    next.textContent = M.step === "look" ? L("下一步：判断规则", "Next: judgment rules") : L("下一步：试跑与启用", "Next: test and activate");
    const owesAction = ["conflict", "kept", "offline", "second", "deleted", "published"].includes(M.phase);
    next.classList.toggle("mw-btn--primary", !owesAction);
    next.classList.toggle("mw-btn--secondary", owesAction);
  }

  // ---------- The band (A, B) and the status line ----------
  const PHRASE = () => {
    const rule = L("这条规则", "This rule");
    const feed = S.host === "feed";
    const stillHere = L("你写的都还在，还没存。", "What you wrote is still here, not saved yet.");
    return { rule, feed, stillHere };
  };
  const reloadBtn = (label = L("载入最新版", "Load latest")) => {
    const busy = M.busy;
    return `<button type="button" class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" id="band-primary" data-act="reload"${busy ? ' aria-busy="true"' : ""}>${busy === "spin" ? '<span class="mw-spinner" data-slot="spinner" aria-hidden="true"></span>' : ""}<span data-slot="button-label">${busy ? L("正在载入…", "Loading…") : label}</span></button>`;
  };
  const band = (tone, state, title, body, actions = "", extra = {}) => `<div class="mw-alert${tone ? ` mw-alert--${tone}` : ""} cand-alert${extra.settled ? " is-settled" : ""}" data-slot="alert" role="${extra.role || "status"}" tabindex="-1" data-band-node>
      ${state ? `<span class="cand-alert__mark mw-status mw-status--plain" data-slot="status" data-mw-state="${state}" aria-hidden="true"><span></span></span>` : ""}
      <div class="cand-alert__copy"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}</div>${actions ? `<div class="cand-alert__actions">${actions}</div>` : ""}</div>`;
  function bandHtml() {
    const { stillHere, feed } = PHRASE();
    const openCompare = (label) => btn({ variant: "primary", size: "sm", label, attrs: { id: "band-primary", "data-act": "open-compare" } });
    const primaryLoad = (label) => (S.scheme === "B" ? (M.busy ? reloadBtn() : openCompare(label || L("对比并决定", "Compare and decide"))) : reloadBtn());
    const saveNew = (variant = "ghost") => btn({ variant, size: "sm", label: feed ? L("用我写的另起一条", "Start fresh with mine") : L("存成新规则", "Save as new rule"), attrs: { "data-act": "save-new", ...(variant === "primary" ? { id: "band-primary" } : {}) } });
    switch (M.phase) {
      case "conflict":
      case "kept":
        return band("warning", "", L("这条规则在别处改过", "This rule changed elsewhere"), stillHere, primaryLoad());
      case "offline":
        return band("warning", "", L("最新版还没载入", "Couldn't load the latest version"), L("连接好像断了。你写的都还在，连上后再试一次。", "The connection seems down. What you wrote is still here; try again once you're back."), reloadBtn(L("再试一次", "Try again")));
      case "second":
        return band("warning", "", L("这条规则又被改了一次", "This rule changed again"), L("可能还有人在改它。你写的都还在，还没存。", "Someone may still be working on it. What you wrote is still here, not saved yet."), saveNew() + primaryLoad(S.scheme === "B" ? L("再对比一次", "Compare again") : undefined));
      case "deleted":
        return feed
          ? band("warning", "", L("这条规则的草稿已被删除", "This rule's draft was deleted"), L("你写的都还在。重新预览一次，草稿就会再建好。", "What you wrote is still here. Preview again and the draft is rebuilt."), btn({ variant: "primary", size: "sm", label: L("重新预览", "Preview again"), attrs: { id: "band-primary", "data-act": "preview" } }))
          : band("warning", "", L("这条规则已被删除", "This rule was deleted"), L("你写的都还在，可以存成一条新规则。", "What you wrote is still here. You can keep it as a new rule."), btn({ variant: "ghost", size: "sm", label: L("不要了", "Discard"), attrs: { "data-act": "discard" } }) + saveNew("primary"));
      case "published":
        return band("warning", "", L("这条规则已在别处发布为 v1", "This rule was published elsewhere as v1"), L("发布后不能再改。你写的都还在，可以用它另起一条。", "A published rule can't change. What you wrote is still here; you can start a new one with it."), (feed ? "" : btn({ variant: "ghost", size: "sm", label: L("查看 v1", "View v1"), attrs: { "data-act": "view-published" } })) + saveNew("primary"));
      case "viewing":
        return band("", "", L("这是已发布的 v1", "This is the published v1"), L("你写的还留着，可以用它另起一条。", "What you wrote is still kept; you can start a new one with it."), saveNew("primary"), { settled: true });
      case "clean":
        return band("", "", feed ? L("这条规则刚在别处改过，已换成最新版", "This rule just changed elsewhere, so you're on the latest now") : L("这条规则刚在别处改过，已换成最新版", "This rule just changed elsewhere, so you're on the latest now"), feed ? L("再预览一次，看看结果有没有变。", "Preview once more to see whether results changed.") : L("发布前看一眼。", "Take a look before you publish."),
          feed ? "" : btn({ variant: "ghost", size: "sm", label: L("看看改了什么", "See what changed"), attrs: { "data-act": "goto-change" } }));
      case "loaded": {
        const both = Object.keys(M.kept).filter((id) => !M.kept[id].swapped);
        const swapped = Object.keys(M.kept).filter((id) => M.kept[id].swapped);
        const names = both.map((id) => FIELDS().find((f) => f.id === id).label).join(L("、", ", "));
        const yours = (M.keptYours || []).join(L("、", ", "));
        const theirs = (M.keptTheirs || []).join(L("、", ", "));
        const lines = [];
        if (both.length) lines.push(L(`${names}两边都改了，你写的放在下面。`, `${names}: changed on both sides; yours is below.`));
        else if (swapped.length) lines.push(L("你写的已放回，已保存。", "What you wrote is back, and saved."));
        if (theirs) lines.push(L(`别处还改了${theirs}。`, `Also changed elsewhere: ${theirs}.`));
        if (yours) lines.push(L(`你改的${yours}留着。`, `Your edit to the ${yours.toLowerCase()} stays.`));
        if (feed) lines.push(L("再预览一次才能启用。", "Preview again before enabling it."));
        const settled = M.bandSettled;
        return band("success", "done", L("已载入最新版", "Latest version loaded"), lines.join(L("", " ")), btn({ variant: "ghost", size: "sm", only: true, icon: "x", label: L("收起提示", "Dismiss"), attrs: { "data-act": "dismiss-band" } }), { settled });
      }
      case "merged":
        return band("success", "done", L("已合好并保存", "Merged and saved"), feed ? L("再预览一次才能启用。", "Preview again before enabling it.") : "", btn({ variant: "ghost", size: "sm", label: L("撤销", "Undo"), attrs: { "data-act": "merge-undo" } }));
      case "savedNew":
        return band("success", "done", feed ? L("已用你写的另起一条", "Started fresh with what you wrote") : L("已存成新规则", "Saved as a new rule"), feed ? L("再预览一次才能启用。", "Preview again before enabling it.") : L("名字和内容都是你写的。", "The name and content are what you wrote."), btn({ variant: "ghost", size: "sm", only: true, icon: "x", label: L("收起提示", "Dismiss"), attrs: { "data-act": "dismiss-band" } }));
      default:
        return "";
    }
  }
  function paintBand() {
    const slot = app.querySelector("[data-band]");
    if (!slot) return;
    const html = S.scheme !== "C" && !M.bandGone ? bandHtml() : "";
    const key = `${M.phase}|${M.busy}|${html.length}`;
    if (slot.dataset.key !== key) { slot.innerHTML = html; slot.dataset.key = key; }
    slot.closest(".functions-feedback")?.classList.toggle("has-band", Boolean(html));
    if (html) M.bandSettled = true;
  }
  function paintStatus() {
    if (S.host !== "editor") {
      const status = app.querySelector("[data-feed-rule-status]");
      const pending = S.scheme === "C" && ["conflict", "kept", "offline", "second", "deleted", "published"].includes(M.phase);
      if (pending) { status.hidden = false; status.dataset.error = "true"; status.innerHTML = `${L("未保存 · 别处有新版", "Not saved · A newer version exists")} <button type="button" class="mw-btn mw-btn--link" data-slot="button" data-act="open-ask"><span data-slot="button-label">${L("处理", "Resolve")}</span></button>`; }
      else if (status.querySelector("[data-act=open-ask]")) { status.hidden = true; status.textContent = ""; }
      return;
    }
    const line = app.querySelector("[data-functions-save-status]");
    const owes = ["conflict", "kept", "offline", "second", "deleted", "published"].includes(M.phase);
    line.dataset.tone = owes ? "attention" : "done";
    // With a band up the band says it; two lines saying "not saved" is one too many.
    line.hidden = Boolean(app.querySelector("[data-band-node]"));
    if (owes && S.scheme === "C") {
      const word = M.phase === "deleted" ? L("未保存 · 这条规则已被删除", "Not saved · This rule was deleted") : M.phase === "published" ? L("未保存 · 已在别处发布", "Not saved · Published elsewhere") : L("未保存 · 别处有新版", "Not saved · A newer version exists");
      line.innerHTML = `${word}<button type="button" class="mw-btn mw-btn--link" data-slot="button" data-act="open-ask"><span data-slot="button-label">${L("处理", "Resolve")}</span></button>`;
      return;
    }
    if (owes) { line.textContent = L("未保存 · 自动保存已暂停", "Not saved · Auto-save paused"); return; }
    line.textContent = M.savedText || (M.phase === "loaded" ? L("这是最新版", "This is the latest version") : L("已保存", "Saved"));
  }

  // ---------- Dialogs: the compare sheet (B), the ask dialog (C), leaving (A, B) ----------
  // Lines the other side lacks are marked, but only when the two share something: a wholly different text would just be all yellow.
  const markedLines = (text, other) => { const mine = String(text).split("\n"), others = new Set(String(other).split("\n")); if (!mine.some((line) => others.has(line))) return esc(text); return mine.map((line) => others.has(line) ? esc(line) : `<mark>${esc(line)}</mark>`).join("\n"); };
  function compareSheet() {
    const rows = whoChanged().filter((f) => f.differs);
    const left = Object.values(M.picks || {}).filter((v) => v === null).length;
    const tag = { both: L("两边都改了", "Changed on both sides"), you: L("只有你改了", "Only you changed it"), they: L("只有别处改了", "Only changed elsewhere") };
    const side = (field, which, label, text, other) => `<button type="button" class="cand-merge__side" aria-pressed="${M.picks?.[field.id] === which}" data-act="pick" data-arg="${field.id}:${which}"><span class="cand-merge__label">${label}${ic("check")}</span><span class="cand-merge__text${text ? "" : " is-blank"}">${text ? markedLines(text, other) : L("你清空了这一栏", "You cleared this field")}</span></button>`;
    return `<dialog class="mw-sheet" data-slot="sheet" aria-labelledby="merge-title" data-proto-dialog><form method="dialog" class="mw-form mw-sheet__shell" onsubmit="return false">
      <header class="mw-form__header"><div><h2 id="merge-title">${L("对比两个版本", "Compare the two versions")}</h2><p>${L("只列出不一样的地方。选好后，你写的和最新版合成一份。", "Only what differs is listed. Choose, and the two become one.")}</p></div>${btn({ variant: "ghost", only: true, icon: "x", label: L("关闭", "Close"), cls: "mw-dialog__close", attrs: { "data-act": "dlg-close" } })}</header>
      <div class="mw-form__body">${rows.map((field) => { const mine = showValue(field.id, M.cur[field.id]), latest = showValue(field.id, V.latest[field.id]); return `<section class="cand-merge" aria-label="${esc(field.label)}"><div class="cand-merge__head"><span>${field.label}</span>${P.badge(field.who === "both" ? "warning" : "neutral", tag[field.who])}</div><div class="cand-merge__sides">${side(field, "latest", L("最新版", "Latest version"), latest, mine)}${side(field, "mine", L("你写的", "You wrote"), mine, latest)}</div></section>`; }).join("")}</div>
      <footer class="mw-form__footer"><div class="cand-merge__foot"><span class="cand-merge__left" role="status">${left ? L(`还有 ${left} 处要选`, `${left} left to choose`) : L("都选好了", "All chosen")}</span>${btn({ size: "sm", label: L("先不处理", "Not now"), attrs: { "data-act": "dlg-close" } })}${btn({ variant: "primary", size: "sm", label: L("用选中的内容继续", "Continue with these"), disabled: Boolean(left), attrs: { "data-act": "merge-apply" } })}</div></footer></form></dialog>`;
  }
  function askDialog() {
    const feed = S.host === "feed";
    const report = whoChanged().filter((f) => f.differs);
    const tag = { both: L("两边都改了", "Changed on both sides"), you: L("只有你改了", "Only you changed it"), they: L("只有别处改了", "Only changed elsewhere") };
    const list = `<ul class="proto-diff-list">${report.map((f) => `<li><span>${f.label}</span><small>${tag[f.who]}</small></li>`).join("")}</ul>`;
    const keep = feed ? L("先复制我写的", "Copy what I wrote first") : L("把我写的另存成一条新规则", "Keep what I wrote as a new rule");
    const check = `<label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" data-ask-keep ${M.askKeep === false ? "" : "checked"}><span>${keep}</span></label>`;
    const close = btn({ size: "sm", label: L("继续写", "Keep writing"), attrs: { "data-act": "dlg-close" } });
    let title = L("这条规则在别处改过", "This rule changed elsewhere"), body = "", foot = "";
    if (M.phase === "deleted") {
      title = feed ? L("这条规则的草稿已被删除", "This rule's draft was deleted") : L("这条规则已被删除", "This rule was deleted");
      body = `<p class="proto-ask-copy">${feed ? L("你写的都还在。重新预览一次，草稿就会再建好。", "What you wrote is still here. Preview again and the draft is rebuilt.") : L("你写的都还在，可以存成一条新规则。", "What you wrote is still here. You can keep it as a new rule.")}</p>`;
      foot = feed ? close + btn({ variant: "primary", size: "sm", label: L("重新预览", "Preview again"), attrs: { "data-act": "preview" } }) : btn({ size: "sm", label: L("不要了", "Discard"), attrs: { "data-act": "discard" } }) + btn({ variant: "primary", size: "sm", label: L("存成新规则", "Save as new rule"), attrs: { "data-act": "save-new" } });
    } else if (M.phase === "published") {
      title = L("这条规则已在别处发布为 v1", "This rule was published elsewhere as v1");
      body = `<p class="proto-ask-copy">${L("发布后不能再改。你写的都还在，可以用它另起一条。", "A published rule can't change. What you wrote is still here; you can start a new one with it.")}</p>`;
      foot = close + btn({ variant: "primary", size: "sm", label: feed ? L("用我写的另起一条", "Start fresh with mine") : L("存成新规则", "Save as new rule"), attrs: { "data-act": "save-new" } });
    } else {
      const failed = M.phase === "offline";
      if (M.phase === "second") title = L("这条规则又被改了一次", "This rule changed again");
      body = `${failed ? P.alert("warning", L("最新版还没载入", "Couldn't load the latest version"), L("连接好像断了。连上后再试一次。", "The connection seems down. Try again once you're back.")) : ""}<p class="proto-ask-copy">${M.phase === "second" ? L("可能还有人在改它。你写的都还在，还没存。", "Someone may still be working on it. What you wrote is still here, not saved yet.") : L("你写的都还在，还没存。载入最新版会替换编辑框里的内容。", "What you wrote is still here, not saved yet. Loading the latest replaces what's in the form.")}</p>${list}${check}`;
      foot = close + `<button type="button" class="mw-btn mw-btn--primary mw-btn--sm" data-slot="button" data-act="ask-load"${M.busy ? ' aria-busy="true"' : ""}>${M.busy === "spin" ? '<span class="mw-spinner" data-slot="spinner" aria-hidden="true"></span>' : ""}<span data-slot="button-label">${M.busy ? L("正在载入…", "Loading…") : failed ? L("再试一次", "Try again") : L("载入最新版", "Load latest")}</span></button>`;
    }
    return `<dialog class="mw-dialog" data-slot="dialog" aria-labelledby="ask-title" data-proto-dialog><form method="dialog" class="mw-form mw-dialog__shell" onsubmit="return false"><header class="mw-form__header"><div><h2 id="ask-title">${title}</h2></div></header><div class="mw-form__body">${body}</div><footer class="mw-form__footer">${foot}</footer></form></dialog>`;
  }
  const leaveDialog = () => `<dialog class="mw-dialog" data-slot="dialog" aria-labelledby="leave-title" data-proto-dialog><form method="dialog" class="mw-form mw-dialog__shell" onsubmit="return false"><header class="mw-form__header"><div><h2 id="leave-title">${L("你写的还没存", "What you wrote isn't saved")}</h2></div></header><div class="mw-form__body"><p class="proto-ask-copy">${L("这条规则在别处改过，所以这次没能存上。离开后，你写的就没有了。", "This rule changed elsewhere, so it couldn't save. If you leave, what you wrote is gone.")}</p></div><footer class="mw-form__footer">${btn({ size: "sm", label: L("不要了，回到列表", "Discard and go back"), attrs: { "data-act": "discard" } })}${btn({ variant: "primary", size: "sm", label: L("留在这里", "Stay here"), attrs: { "data-act": "dlg-close" } })}</footer></form></dialog>`;
  function paintDialog() {
    const open = document.querySelector("dialog[data-proto-dialog]");
    const html = M.dialog === "compare" ? compareSheet() : M.dialog === "ask" ? askDialog() : M.dialog === "leave" ? leaveDialog() : "";
    if (!html) { if (open) { open.close(); open.remove(); } return; }
    if (open && open.dataset.kind === M.dialog) {
      // Same dialog, new content: keep it open and keep the scroll position.
      const body = open.querySelector(".mw-form__body"), top = body?.scrollTop;
      const shell = open.querySelector("form");
      const next = document.createElement("div"); next.innerHTML = html;
      shell.replaceWith(next.querySelector("form"));
      const newBody = open.querySelector(".mw-form__body"); if (newBody && top) newBody.scrollTop = top;
      if (!open.contains(document.activeElement)) (open.querySelector('.cand-merge__side[aria-pressed="true"]') || open.querySelector(".mw-btn--primary:not([disabled])"))?.focus();
      return;
    }
    if (open) { open.close(); open.remove(); }
    const holder = document.createElement("div"); holder.innerHTML = html;
    const dialog = holder.firstElementChild; dialog.dataset.kind = M.dialog;
    document.body.append(dialog);
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); actions["dlg-close"](); });
    dialog.showModal();
    (dialog.querySelector('.cand-merge__side[aria-pressed="false"]:not(:has(~ [aria-pressed="true"]))') || dialog.querySelector(".mw-btn--primary:not([disabled])"))?.focus();
  }

  // ---------- Paint everything except the fields being typed in ----------
  function paint() {
    paintFields(); paintKept(); paintSteps(); paintBand(); paintStatus(); paintDialog(); wash();
    document.getElementById("note").textContent = NOTES();
  }
  const NOTES = () => {
    const feed = S.host === "feed";
    const typed = feed ? L("点「预览最近消息」", "press Preview") : L("在「判断说明」里打几个字", "type a few words into Instructions");
    const map = {
      normal: L(`[模拟] 试试：${typed}，这一次提交会碰到别处的改动。规则、别处的改动和时长都是假的。`, `[Simulated] Try it: ${typed}; that submission meets a change made elsewhere. The rule, the other change and the timings are made up.`),
      conflict: L("[模拟] 刚才的提交没存上。输入框可以继续打字，光标不动。", "[Simulated] The last submission didn't save. You can keep typing; the cursor stays."),
      compare: L("[模拟] 对比面板。标黄的行是两边不同的；产品里用平台的逐行比较。", "[Simulated] The compare sheet. Highlighted lines differ; the product uses the platform's line compare."),
      ask: L("[模拟] 自动保存碰到时只在状态行说；点发布、试跑或「处理」才弹这个。", "[Simulated] Auto-save only says so on the status line; publishing, testing or Resolve opens this."),
      kept: feed ? L("[模拟] 写到一半想离开：Feed 的输入本来就存在会话里，离开再回来还在。", "[Simulated] Mid-edit: Feed keeps its input in the session, so leaving and coming back keeps it.") : L("[模拟] 接着写、换了一步，内容都在。试试点「发布 v1」或左上角返回。", "[Simulated] Kept writing, changed step, nothing lost. Try Publish v1 or the back arrow."),
      loaded: L("[模拟] 载入后，你写的在字段下面。试试「放回」。", "[Simulated] After loading, what you wrote sits under the field. Try Put back."),
      offline: L("[模拟] 这次载入失败；再试一次会成功。", "[Simulated] This load failed; the next try succeeds."),
      deleted: L("[模拟] 现在的代码在这里会关掉编辑器、丢掉输入（client-records.ts 的 loadList），要改。", "[Simulated] Today's code closes the editor here and loses the input (loadList in client-records.ts); this changes that."),
      second: L("[模拟] 放回后自动保存又碰上了别处的改动。语气不升级，多给一条出路。", "[Simulated] After putting back, auto-save met another change. The tone doesn't escalate; there's one more way out."),
      clean: L("[模拟] 没有要保护的内容，所以直接换成最新版，并拦下这一次发布。", "[Simulated] Nothing to protect, so the latest comes straight in and this publish waits."),
      noop: L(`[模拟] 别处只试跑过一次或加了样例：内容没变，自动接上新版本再存，不打扰。试试：${typed}。`, `[Simulated] Elsewhere only ran a test or added a sample: nothing changed, so it reconnects and saves without a word. Try: ${typed}.`),
      published: L("[模拟] 补充状态：现在的后端在这里报另一种错。", "[Simulated] An extra state: today's backend returns a different error here."),
    };
    return map[S.state] || "";
  };

  // ---------- Actions ----------
  const focusPrimary = () => { const el = document.getElementById("band-primary"); if (el) el.focus(); };
  const nudge = () => { const el = app.querySelector("[data-band-node]"); if (!el) return; el.classList.remove("is-nudged"); void el.offsetWidth; el.classList.add("is-nudged"); };
  const afterLoad = () => {
    paint();
    const first = app.querySelector(".cand-kept button");
    app.querySelector("[data-band-node]")?.scrollIntoView({ block: "nearest" });
    if (first) { first.closest(".cand-kept").scrollIntoView({ block: "nearest" }); first.focus({ preventScroll: true }); }
    else app.querySelector("[data-band-node]")?.focus({ preventScroll: true });
  };
  function reload() {
    if (M.busy) return;
    M.busy = true; paint();
    later(250, () => { if (M.busy) { M.busy = "spin"; paint(); } });
    later(800, () => {
      M.busy = false;
      if (S.scheme === "B") { M.phase = "conflict"; M.picks = defaultPicks(); M.dialog = "compare"; paint(); return; }
      applyLatest(); M.previewed = false;
      if (S.host === "feed") { const out = app.querySelector("[data-feed-rule-preview]"), status = app.querySelector("[data-feed-rule-status]"); out.hidden = true; status.hidden = true; }
      M.bandSettled = false; M.bandGone = false; M.stepFromKept();
      afterLoad();
    });
  }
  function askLoad() {
    if (M.busy) return;
    const keep = document.querySelector("[data-ask-keep]")?.checked !== false;
    M.askKeep = keep; M.busy = true; paint();
    later(250, () => { if (M.busy) { M.busy = "spin"; paint(); } });
    later(800, () => {
      M.busy = false; M.dialog = null; M.cur = structuredClone(V.latest); M.phase = "loaded"; M.kept = {}; M.keptYours = []; M.bandGone = true;
      M.washed = new Set(whoChangedAgainstBase()); M.savedText = L("已保存", "Saved"); M.previewed = false;
      paint();
      toast(keep ? (S.host === "feed" ? L("已载入最新版，你写的已复制", "Latest loaded; what you wrote is copied") : L("已载入最新版，你写的存成了一条新规则", "Latest loaded; what you wrote is now a new rule")) : L("已载入最新版", "Latest version loaded"));
    });
  }
  function typed() {
    if (["conflict", "kept", "offline", "second", "deleted", "published"].includes(M.phase)) return;
    if (M.phase === "loaded" || M.phase === "savedNew" || M.phase === "merged" || M.phase === "clean") { M.bandGone = true; }
    const line = app.querySelector("[data-functions-save-status]");
    if (!line) return;
    M.savedText = L("有更改，等待保存…", "Changes waiting to save…"); line.textContent = M.savedText;
    clearTimers();
    later(280, () => {
      M.savedText = L("正在保存…", "Saving…"); line.textContent = M.savedText;
      later(350, () => {
        if (M.armed) { M.armed = false; M.phase = "conflict"; M.savedText = ""; M.bandSettled = false; paint(); return; }
        M.savedText = L("已保存", "Saved"); line.textContent = M.savedText; paint();
      });
    });
  }
  const actions = {
    noop() {},
    reload,
    "ask-load": askLoad,
    "open-ask"() { M.dialog = "ask"; paint(); },
    "open-compare"() { M.busy = false; reload(); },
    "dlg-close"() { M.dialog = null; paint(); document.querySelector("[data-act='open-ask'], #band-primary")?.focus(); },
    pick(arg) { const [id, which] = arg.split(":"); M.picks[id] = which; paint(); },
    "merge-apply"() {
      const before = structuredClone(M.cur);
      for (const [id, which] of Object.entries(M.picks)) if (which === "latest") M.cur[id] = structuredClone(V.latest[id]);
      M.undo = before; M.dialog = null; M.phase = "merged"; M.bandSettled = false; M.bandGone = false; M.savedText = L("已保存", "Saved"); M.washed = new Set(Object.keys(M.picks));
      paint(); app.querySelector("[data-band-node]")?.focus({ preventScroll: true });
    },
    "merge-undo"() { M.cur = M.undo; M.phase = "conflict"; M.bandSettled = false; M.savedText = ""; paint(); focusPrimary(); },
    "kept-swap"(id) {
      const kept = M.kept[id]; if (!kept) return;
      kept.swapped = !kept.swapped;
      M.cur[id] = structuredClone(kept.swapped ? kept.value : V.latest[id]);
      M.washed = new Set([id]); M.bandSettled = true;
      const line = app.querySelector("[data-functions-save-status]");
      paint();
      if (line) {
        line.textContent = L("正在保存…", "Saving…");
        later(350, () => { M.savedText = L("已保存", "Saved"); paintStatus(); });
      }
      app.querySelector(`.cand-kept[data-kept-field="${id}"] button`)?.focus({ preventScroll: true });
    },
    "kept-more"(id) { M.kept[id].open = !M.kept[id].open; paint(); app.querySelector(`.cand-kept[data-kept-field="${id}"] .cand-kept__more`)?.focus({ preventScroll: true }); },
    "dismiss-band"() { M.bandGone = true; paint(); (app.querySelector(".cand-kept button") || fieldEl("instructions"))?.focus({ preventScroll: true }); },
    "save-new"() {
      M.dialog = null; M.phase = "savedNew"; M.kept = {}; M.readonly = false; M.bandSettled = false; M.bandGone = S.scheme === "C"; M.savedText = L("已保存", "Saved");
      M.cur = structuredClone(V.mine);
      paint();
      if (S.scheme === "C") toast(S.host === "feed" ? L("已用你写的另起一条", "Started fresh with what you wrote") : L("已存成新规则", "Saved as a new rule"));
      else app.querySelector("[data-band-node]")?.focus({ preventScroll: true });
    },
    discard() {
      M.dialog = null; paintDialog();
      const bench = app.querySelector("[data-functions=workbench]");
      if (bench) {
        bench.setAttribute("data-expanded", "false");
        bench.querySelector("[data-functions-stage-workspace]").hidden = true;
        const rows = bench.querySelector("[data-functions-rows]");
        rows.innerHTML = `<article class="feed-stage-item"><button type="button" class="feed-stage-entry directory-list-row" data-act="noop"><span class="feed-stage-leading"><strong>${L("材料是否足够", "Is the material enough")}</strong></span><span class="mw-status mw-status--done feed-entry-status" data-mw-state="ready">v2</span></button></article><article class="feed-stage-item"><button type="button" class="feed-stage-entry directory-list-row" data-act="noop"><span class="feed-stage-leading"><strong>${L("判断紧急程度", "Judge urgency")}</strong></span><span class="mw-status mw-status--quiet feed-entry-status" data-mw-state="draft">${L("草稿", "Draft")}</span></button></article>`;
      }
      toast(L("已回到列表", "Back to the list"));
    },
    "view-published"() { M.phase = "viewing"; M.cur = structuredClone(V.latest); M.readonly = true; M.bandSettled = false; paint(); },
    "goto-change"() { M.step = "fn"; M.washed = new Set(whoChangedAgainstBase()); paint(); app.querySelector("[data-functions-col=fn] h2")?.focus(); },
    preview() { runFeedPreview(); },
  };
  function runFeedPreview() {
    const zh = S.lang === "zh";
    const rows = zh ? [["登录页点了没反应，试了三次", true], ["本周产品更新通知", false], ["付款成功了但订单还是未支付", true]] : [["Login page does nothing, tried three times", true], ["This week's product update", false], ["Paid, but the order still says unpaid", true]];
    const out = app.querySelector("[data-feed-rule-preview]");
    const status = app.querySelector("[data-feed-rule-status]");
    M.dialog = null;
    if (M.phase === "deleted" || M.phase === "savedNew" || M.phase === "loaded" || M.phase === "merged" || M.phase === "clean") { M.bandGone = true; M.phase = "normal"; }
    out.innerHTML = `<strong>${L(`最近 ${rows.length} 条消息的预览`, `Preview of the last ${rows.length} messages`)}</strong>${rows.map(([title, hit]) => `<div class="feed-rule-preview-row"><span>${esc(title)}</span><span class="feed-rule-preview-outcome" data-match="${hit}">${hit ? L("匹配", "Match") : L("不匹配", "No match")}</span></div>`).join("")}`;
    out.hidden = false; status.hidden = false; status.dataset.error = "false"; status.textContent = L("预览完成，未改变消息或 Inbox。", "Preview done; messages and Inbox are untouched.");
    M.previewed = true;
    paint();
  }
  function feedSubmit(isPreview) {
    if (["conflict", "kept", "offline", "second", "deleted", "published"].includes(M.phase)) { if (S.scheme === "C") { M.dialog = "ask"; paint(); } else { nudge(); focusPrimary(); } return; }
    if (M.armed) {
      M.armed = false; M.phase = "conflict"; M.bandSettled = false; M.cur = readFeed(); paint();
      if (S.scheme === "C") { M.dialog = "ask"; paint(); } else { app.querySelector("[data-band-node]")?.scrollIntoView({ block: "nearest" }); focusPrimary(); }
      return;
    }
    if (isPreview) { runFeedPreview(); return; }
    if (!M.previewed) { const status = app.querySelector("[data-feed-rule-status]"); status.hidden = false; status.dataset.error = "true"; status.textContent = L("请先用当前描述预览，再保存并启用。", "Preview with this description first, then save and enable."); return; }
    toast(L("规则已启用，将处理新消息和更新。", "Rule enabled. It handles new messages and updates."));
  }
  const readFeed = () => ({ name: fieldEl("name").value, instructions: fieldEl("instructions").value });

  // ---------- Events on the page ----------
  document.addEventListener("input", (event) => {
    if (!M) return;
    const el = event.target;
    if (el.matches?.("[data-functions-name]")) { M.cur.name = el.value; typed(); app.querySelector("[data-functions-editor-title]").textContent = el.value; }
    if (el.matches?.("[data-functions-instructions]")) { M.cur.instructions = el.value; typed(); }
    if (el.matches?.("[data-feed-out-rule-name]")) M.cur.name = el.value;
    if (el.matches?.("[data-feed-rule-instructions]")) M.cur.instructions = el.value;
  });
  document.addEventListener("click", (event) => {
    if (!M) return;
    const target = event.target.closest?.("[data-act], [data-functions-step], [data-functions-prev], [data-functions-next], [data-functions-publish], [data-functions-back], [data-functions-preview], [data-feed-rule-preview-run], [data-feed-out-rule-create]");
    if (!target) return;
    if (target.tagName === "A") event.preventDefault();
    if (target.dataset.act) { actions[target.dataset.act]?.(target.dataset.arg); return; }
    const order = ["look", "fn", "use"];
    if (target.dataset.functionsStep) { M.step = target.dataset.functionsStep; paint(); return; }
    if (target.hasAttribute("data-functions-prev")) { M.step = order[Math.max(0, order.indexOf(M.step) - 1)]; paint(); return; }
    if (target.hasAttribute("data-functions-next")) { M.step = order[Math.min(2, order.indexOf(M.step) + 1)]; paint(); return; }
    const owes = ["conflict", "kept", "offline", "second", "deleted", "published"].includes(M.phase);
    if (target.hasAttribute("data-functions-back")) {
      if (owes) { M.dialog = S.scheme === "C" ? "ask" : "leave"; paint(); return; }
      actions.discard(); return;
    }
    if (target.matches("[data-functions-publish], [data-functions-preview]")) {
      if (owes) { if (S.scheme === "C") { M.dialog = "ask"; paint(); } else { nudge(); focusPrimary(); } return; }
      toast(target.hasAttribute("data-functions-publish") ? L("已发布 v1（原型）", "Published v1 (prototype)") : L("试跑完成（原型）", "Test run done (prototype)"));
      return;
    }
    if (target.hasAttribute("data-feed-rule-preview-run")) { feedSubmit(true); return; }
    if (target.hasAttribute("data-feed-out-rule-create")) feedSubmit(false);
  });

  // ---------- Strip and start ----------
  const setOptions = (id, items, value) => { const sel = document.getElementById(id); sel.innerHTML = items.map(([v, label]) => `<option value="${v}">${T(label)}</option>`).join(""); sel.value = value; };
  function strip() {
    document.getElementById("p-title").textContent = L("过期提交 · N14", "Stale submit · N14");
    document.getElementById("p-scheme").textContent = L("方案", "Scheme");
    document.getElementById("p-host").textContent = L("页面", "Page");
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("p-data").textContent = L("数据", "Data");
    document.getElementById("p-lang").textContent = L("语言", "Language");
    document.getElementById("p-theme").textContent = L("外观", "Theme");
    document.querySelector("#reset [data-slot=button-label]").textContent = L("从头再来", "Start over");
    setOptions("scheme", SCHEMES, S.scheme);
    setOptions("host", HOSTS, S.host);
    setOptions("state", statesOf(S.scheme), S.state);
    setOptions("data", DATA, S.data);
    document.querySelectorAll("#lang [data-lang]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === S.lang)));
    document.querySelectorAll("#theme [data-theme-set]").forEach((b) => { b.textContent = b.dataset.themeSet === "light" ? L("浅", "Light") : L("深", "Dark"); b.setAttribute("aria-pressed", String(b.dataset.themeSet === S.theme)); });
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.dataset.resolvedTheme = S.theme;
  }
  function start() {
    clearTimers();
    document.querySelectorAll("dialog[data-proto-dialog]").forEach((d) => { d.close(); d.remove(); });
    document.querySelectorAll(".proto-toast").forEach((x) => x.remove());
    if (!statesOf(S.scheme).some(([id]) => id === S.state)) S.state = "conflict";
    toHash();
    strip();
    if (S.host === "editor") mountEditor(); else mountFeed();
    startModel();
    M.stepFromKept = () => { const first = Object.keys(M.kept)[0]; if (first && S.host === "editor") { const step = FIELDS().find((f) => f.id === first).step; if (step) M.step = step; } };
    paint();
    if (S.state === "loaded") { M.stepFromKept(); paint(); }
    app.querySelector("[data-band-node]")?.scrollIntoView({ block: "nearest" });
    app.querySelector(".cand-kept")?.scrollIntoView({ block: "nearest" });
    if (S.state === "normal" && S.host === "editor") fieldEl("instructions").focus({ preventScroll: true });
    if (S.scheme === "C" && S.state === "clean") toast(S.host === "feed" ? L("这条规则刚在别处改过，已换成最新版。再预览一次。", "This rule just changed elsewhere, so you're on the latest. Preview once more.") : L("这条规则刚在别处改过，已换成最新版。发布前看一眼。", "This rule just changed elsewhere, so you're on the latest. Take a look before you publish."));
    if (S.scheme === "C" && S.state === "loaded") toast(S.host === "feed" ? L("已载入最新版，你写的已复制", "Latest loaded; what you wrote is copied") : L("已载入最新版，你写的存成了一条新规则", "Latest loaded; what you wrote is now a new rule"));
  }
  for (const id of ["scheme", "host", "state", "data"]) document.getElementById(id).addEventListener("change", (e) => { S[id] = e.target.value; start(); });
  document.getElementById("lang").addEventListener("click", (e) => { const v = e.target.dataset.lang; if (v) { S.lang = v; start(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const v = e.target.dataset.themeSet; if (v) { S.theme = v; start(); } });
  document.getElementById("reset").addEventListener("click", () => { S.state = "normal"; start(); });
  window.addEventListener("hashchange", () => { const h = fromHash(); let changed = false; for (const [k, v] of Object.entries(h)) if (v && S[k] !== v) { S[k] = v; changed = true; } if (changed) start(); });
  start();
})();
