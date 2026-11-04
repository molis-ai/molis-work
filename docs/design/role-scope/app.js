// 36 · Role scope — where a role applies, where the value in use comes from, and how a change takes effect and is
// undone. Three schemes differ in one thing: how a project's role relates to your own original
// (A one copy, chosen in each place; B copied into the project; C follows the original until a section is changed).
// Frames are the product's own: the workbench bar and the Assistant's role chooser (../_catalog/dist/arrival.css),
// and the global and project settings pages (../_catalog/dist/settings.css). Every role, version, project and task is
// sample data; nothing is saved, published or run.
(() => {
  const app = document.getElementById("app");
  const KEY = "molis-proto.role-scope.v1";

  const SCHEMES = {
    A: ["一份角色，各处选用", "One role, chosen in each place"],
    B: ["复制进项目，各自演进", "Copied into the project"],
    C: ["默认跟随，改了才覆盖（推荐）", "Follows until changed (recommended)"],
  };
  const TOPICS = {
    pick: { name: ["任务里选角色", "Choosing for a task"],
      states: [["project", ["来自项目默认", "From the project default"]], ["once", ["这次换一个", "A different one this time"]], ["personal", ["个人工作（不在项目里）", "Personal work (no project)"]],
        ["exceed", ["要的工具这里没开放", "Needs a tool not open here"]], ["stopped", ["项目默认的角色已停用", "Project default turned off"]], ["pinned", ["进行中任务的版本不能用了", "A running task's version broke"]]] },
    project: { name: ["项目设置 › 角色", "Project settings › Roles"],
      states: [["inherit", ["沿用你的默认", "Using your default"]], ["override", ["本项目另选了", "The project's own choice"]], ["upstream", ["你的原件更新了", "Your original changed"]], ["stopped", ["默认的角色已停用", "Default role turned off"]]] },
    edit: { name: ["改角色并保存使用", "Edit and save"],
      states: [["edit", ["改了做事方式", "Way of working edited"]], ["saved", ["已保存", "Saved"]], ["conflict", ["别处刚改过", "Changed elsewhere"]], ["history", ["版本与恢复", "Versions and restore"]]] },
    lib: { name: ["全局设置 › 角色", "Settings › Roles"],
      states: [["normal", ["有几个角色", "A few roles"]], ["empty", ["还没有角色", "No roles yet"]], ["stopped", ["停用一个在用的角色", "Turning off a role in use"]]] },
  };

  const fresh = (keep = {}) => ({ scheme: "C", topic: "pick", state: "project", lang: "zh", theme: "light", ...keep, pop: true, choice: undefined, saved: null, dlg: null, done: {}, where: "project" });
  let S;
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); S = v ? { ...fresh(), ...v } : fresh(); } catch { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* preview without storage */ } };

  const P = window.molisParts(() => S.lang);
  const { esc, ic, act, btn, status, badge, alert, avatar, monogram, row, rows, toast } = P;
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (p) => (Array.isArray(p) ? (S.lang === "zh" ? p[0] : p[1]) : p);
  const actions = (...b) => `<div class="q-row">${b.join("")}</div>`;

  // ---------- Sample facts ----------
  const ROLES = {
    rev: { name: ["审稿人", "Reviewer"], ini: ["审", "Rv"], hue: "purple", v: 4, way: ["先核对每条说法的出处，再改结构和措辞。改动逐条列出原因；拿不准的标出来，不替作者下结论。", "Check the source of every claim first, then fix structure and wording. List each change with its reason; flag what you're unsure of instead of deciding for the author."] },
    res: { name: ["研究员", "Researcher"], ini: ["研", "Rs"], hue: "cyan", v: 2, way: ["先列来源，按可信度排；每条结论写清依据，没核实的单独列出。", "List sources first, ranked by trust; give the basis of each conclusion and list what isn't verified."] },
    code: { name: ["代码审查", "Code reviewer"], ini: ["码", "Cd"], hue: "blue", v: 6 },
    week: { name: ["周报写手", "Weekly writer"], ini: ["周", "Wk"], hue: "orange", v: 1 },
  };
  const R = (id) => T(ROLES[id].name);
  const face = (id) => avatar(T(ROLES[id].ini), ROLES[id].hue);
  const PROJECT = () => L("AI 产品观察", "AI product watch");
  const OTHERS = () => [L("官网改版", "Website redesign"), L("客户访谈", "Customer interviews")];
  const q = (s) => L(`「${s}」`, `“${s}”`);

  // Which default the project has, by topic and state (the personal default is always the Researcher).
  function projectDefault() {
    if (S.done.projDefault !== undefined) return S.done.projDefault;
    if ((S.topic === "pick" || S.topic === "project") && S.state === "stopped") return "week";
    if (S.topic === "project" && S.state === "inherit") return null;
    return "rev";
  }
  const personalDefault = () => (S.done.myDefault !== undefined ? S.done.myDefault : S.topic === "lib" && S.state === "empty" ? null : "res");

  // ---------- Frames ----------
  const titlebar = () => `<header class="arrival-titlebar" data-region="titlebar"><span class="arrival-brand">${ic("brand")}${P.wordmark(' data-state="done"')}</span><span class="arrival-spacer"></span><nav class="arrival-tools"></nav></header>`;
  function workBar(center) {
    const pins = [["home", "home", L("项目首页", "Project home")], ["pages", "note", "Pages"], ["feed", "rss", "Feed"]];
    const personal = S.state === "personal";
    return `<div class="workbench-bar" data-dock aria-label="${L("底栏", "Bottom bar")}">
      <div class="bar-start"><div class="plugin-picker"><button class="plugin-picker-trigger" type="button" aria-expanded="false" aria-label="${L("全部插件与 Dock", "All plugins and Dock")}"${P.attrs(act("toast", L("插件切换（原型不展开）", "Plugin switcher (not built)")))}><span class="plugin-picker-all" aria-hidden="true">${ic("grid")}</span><span class="plugin-picker-current">${ic("home")}<span>${personal ? L("个人", "Personal") : L("项目首页", "Project home")}</span></span>${ic("chevron-down")}</button></div><div class="dock-pins" role="toolbar" aria-label="${L("常驻插件", "Kept plugins")}">${pins.map(([id, g, t]) => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" aria-label="${t}" title="${t}"${id === "home" ? ' aria-current="page"' : ""}${P.attrs(act("toast", L("原型只画了这一页", "Only this page is drawn")))}>${ic(g)}</button>`).join("")}</div></div>
      ${center}
      <div class="bar-end"><section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${L("当前项目", "Current project")}"><div class="navigator-project-primary"><details class="navigator-project-menu"><summary class="navigator-project-selector" aria-label="${L("切换项目", "Switch project")}">${personal ? `${P.ic("user")}<strong>${L("个人", "Personal")}</strong>` : `${monogram("A")}<strong>${PROJECT()}</strong>`}${ic("chevron-down")}</summary></details></div></section></div></div>`;
  }
  const wb = (content, center) => ({ page: "arrival", html: `<div class="arrival" data-workspace data-screen="work">${titlebar()}<main class="arrival-stage"><div class="stage-single"><div class="stage-sheet"><div class="land-scroll" data-scroll>${content}</div></div></div></main>${workBar(center)}</div>` });

  function globalSettings(active, body) {
    const groups = [[L("本机", "On this Mac"), [["appearance", "sun", L("界面与语言", "Interface & language")], ["directories", "folder", L("本机目录", "Local folders")]]],
      ["AI", [["models", "key", L("模型", "Models")], ["assistant", "message", L("助理", "Assistant")], ["roles", "user", L("角色", "Roles")], ["prompts", "text", L("提示词", "Prompts")]]],
      [L("系统", "System"), [["update", "download", L("更新", "Update")], ["diagnostics", "bug", L("诊断", "Diagnostics")]]]];
    const nav = groups.map(([g, items]) => `<div class="settings-nav-group-label">${g}</div>${items.map(([id, g2, n]) => `<a href="#"${id === active ? ' aria-current="page"' : ""}${P.attrs(act("toast", L("原型只画了这一页", "Only this page is drawn")))}>${ic(g2)}${n}</a>`).join("")}`).join("");
    return { page: "settings", body: "global", html: `<header class="project-preferences-chrome"><span>${L("全局设置", "Global settings")}</span><a href="#" aria-label="${L("关闭全局设置", "Close global settings")}"${P.attrs(act("toast", L("回到项目", "Back to the project")))}>${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex" aria-label="${L("系统设置", "System settings")}"><a class="settings-nav-back" href="#"${P.attrs(act("toast", L("回到项目", "Back to the project")))}>${ic("arrow")} ${L("返回项目", "Return to project")}</a><div class="settings-nav-body">${nav}</div></nav>
      <div class="settings-content"><section class="settings-document" aria-labelledby="settings-title">${body}</section></div></main>` };
  }
  function projectSettings(body) {
    const items = [["general", "tune", L("常规", "General")], ["workspaces", "folder", L("工作目录", "Folders")], ["guidance", "book", L("项目说明", "Description")], ["memory", "bookmark", L("项目记忆", "Project memory")], ["knowledge", "file", L("项目资料", "Materials")], ["plugins", "package", L("插件", "Plugins")], ["roles", "user", L("角色", "Roles")]];
    return { page: "settings", body: "project", html: `<header class="project-preferences-chrome"><span>${L("项目设置", "Project settings")}</span><a href="#" aria-label="${L("返回工作台", "Back to the workbench")}"${P.attrs(act("goto", "pick"))}>${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex project-settings-navigation" aria-label="${L("项目设置", "Project settings")}"><a class="settings-nav-back" href="#"${P.attrs(act("goto", "pick"))}>${ic("arrow")} ${L("返回工作台", "Back to the workbench")}</a>
      <div class="settings-project-identity"><strong>${PROJECT()}</strong><span>${L("项目设置", "Project settings")}</span></div>
      <div class="settings-nav-body">${items.map(([id, g, n]) => `<a href="#"${id === "roles" ? ' aria-current="page"' : ""}${P.attrs(act(id === "roles" ? "goto" : "toast", id === "roles" ? "project" : L("原型只画了这一页", "Only this page is drawn")))}>${ic(g)}${n}</a>`).join("")}</div></nav>
      <div class="settings-content"><section class="settings-document" aria-labelledby="settings-title">${body}</section></div></main>` };
  }
  const setHead = (title, sub = "", extra = "") => `<header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title" tabindex="-1">${title}</h1>${extra}</div>${sub ? `<p>${sub}</p>` : ""}</header>`;
  const setRow = (title, sub, value, cls = "") => `<section class="settings-setting-row${cls ? ` ${cls}` : ""}"><div class="setting-copy"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ""}</div><div class="setting-value">${value}</div></section>`;
  const setState = (tone, text) => `<span class="settings-state settings-state--${tone}">${text}</span>`;
  const section = (id, title, body, head = "") => `<section class="settings-section" aria-labelledby="${id}"><div class="rs-sec-head"><h2 id="${id}">${title}</h2>${head}</div>${body}</section>`;
  const select = (label, opts, value, a) => `<select class="mw-select" data-slot="select" aria-label="${esc(label)}"${a ? ` data-change="${a}"` : ""}>${opts.map(([v, n]) => `<option value="${v}"${v === value ? " selected" : ""}>${n}</option>`).join("")}</select>`;

  // [组件板新增] where the value comes from: the layers from nearest to farthest, the one in use marked.
  function scopeLadder(layers, label) {
    return `<ol class="cand-scope" aria-label="${esc(label)}">${layers.map((x) => `<li class="${x.on ? "is-on" : x.off ? "is-off" : x.value ? "is-under" : "is-empty"}"${x.on ? ' aria-current="true"' : ""}><span class="k">${x.k}</span><span class="v">${x.off || x.value || x.note || L("没设", "Not set")}</span></li>`).join("")}</ol>`;
  }
  const ladderFor = (once, proj, mine, off = "") => {
    const layers = [{ k: L("任务里另选", "Picked in a task"), value: once, note: L("只管那一次", "That task only") }, { k: L("本项目", "This project"), value: proj, off, note: off }, { k: L("你的默认", "Your default"), value: mine }, { k: L("最后", "Otherwise"), value: L("助理自己", "The Assistant") }];
    layers.find((x) => x.value && !x.off).on = true;
    return scopeLadder(layers, L("新任务的角色从哪来", "Where a new task's role comes from"));
  };

  // ---------- 1 · Choosing for a task: the Assistant's chooser beside the input ----------
  function pick() {
    const s = S.state, personal = s === "personal";
    const proj = personal ? null : projectDefault();
    const mine = personalDefault();
    const stoppedDefault = proj === "week";
    const fallback = personal || stoppedDefault ? mine : proj || mine;
    const chosen = S.choice !== undefined ? S.choice : s === "once" ? "res" : fallback;
    const isOnce = S.choice !== undefined || s === "once";
    const source = (id) => {
      if (id === null) return "";
      if (!personal && id === proj && !stoppedDefault) return badge("neutral", L("项目默认", "Project default"));
      if (id === mine && (personal || !proj || stoppedDefault)) return badge("neutral", L("我的默认", "My default"));
      if (id === mine) return badge("neutral", L("我的默认", "My default"));
      return "";
    };
    const note = (id) => {
      if (S.scheme === "C" && id === "rev" && !personal) return L(" v5 · 本项目改过一节", " v5 · one section changed here");
      if (S.scheme === "B" && id === "rev" && !personal) return L(" 本项目 v2", " project v2");
      return ` v${ROLES[id].v}`;
    };
    const item = (id, dis = "") => `<button type="button" class="assistant-starter rs-starter"${chosen === id ? ' aria-current="true"' : ""}${dis ? " disabled" : ""}${P.attrs(dis ? {} : act("choose", id ?? "none"))}>${id ? face(id) : `<span class="mw-avatar rs-self" data-slot="avatar">${ic("sparkles")}</span>`}<span class="rs-starter__copy"><strong>${id ? R(id) : L("助理自己", "The Assistant")}</strong><span class="assistant-material-origin">${id ? note(id) : L(" 不指定角色", " no role")}${dis ? ` · ${dis}` : ""}</span></span>${source(id)}</button>`;
    const ids = personal ? ["res", "rev"] : ["rev", "res"];
    const list = [item(null), ...ids.map((id) => item(id)), item("code", s === "exceed" ? L("要用终端，助理这里没开放", "needs the terminal, not open here") : ""),
      ...(stoppedDefault ? [item("week", L("已停用", "turned off"))] : [])].join("");
    const stopNote = stoppedDefault && S.done.projDefault === undefined ? alert("warning", L(`本项目默认的${q(R("week"))}已停用`, `This project's default, ${q(R("week"))}, is turned off`), L(`新任务改由${mine ? q(R(mine)) + "（你的默认）" : "助理自己"}来做。进行中的照常做完。`, `New tasks go to ${mine ? q(R(mine)) + " (your default)" : "the Assistant"}. Running ones finish as they are.`), actions(btn({ size: "sm", label: L("换一个默认", "Pick another default"), attrs: act("goto", "project") }), btn({ variant: "ghost", size: "sm", label: L("重新启用", "Turn it back on"), attrs: act("restart-week") }))) : "";
    const scopeFoot = isOnce && chosen !== fallback
      ? `<div class="rs-pop-foot"><p>${ic("info")}<span>${L("只用于这一次", "Only for this task")}</span></p><div class="q-row">${personal ? "" : btn({ size: "sm", label: L("设为本项目默认", "Make it the project default"), attrs: act("make-default", "project") })}${btn({ variant: "ghost", size: "sm", label: L("设为我的默认", "Make it my default"), attrs: act("make-default", "mine") })}</div></div>`
      : `<div class="rs-pop-foot rs-pop-foot--row"><p>${ic("info")}<span>${chosen === null ? L("没有默认角色，由助理自己做", "No default role; the Assistant does it") : personal || (!proj && chosen === mine) || (stoppedDefault && chosen === mine) ? L("来自你的默认", "From your default") : L("来自本项目默认", "From the project default")}</span></p>${btn({ variant: "link", size: "sm", label: personal || (!proj && chosen === mine) || (stoppedDefault && chosen === mine) ? L("改我的默认", "Change my default") : L("改项目默认", "Change project default"), attrs: act("goto", personal || (!proj && chosen === mine) || (stoppedDefault && chosen === mine) ? "lib" : "project") })}</div>`;
    const pop = S.pop ? `<div class="assistant-popover rs-pop" id="assistant-characters" role="group" aria-label="${L("这次由谁来做", "Who does this task")}"><p class="assistant-popover-title">${L("这次由谁来做", "Who does this task")}</p>${stopNote}${list}${scopeFoot}</div>` : "";
    const chip = `<button class="assistant-executor" type="button" data-assistant-character${isOnce ? " data-chosen" : ""} aria-haspopup="true" aria-expanded="${S.pop}" aria-controls="assistant-characters" title="${L("这次由谁来做", "Who does this task")}"${P.attrs(act("pop"))}><span data-assistant-character-label>${chosen ? R(chosen) : L("助理", "Assistant")}</span>${ic("chevron-up")}</button>`;
    const center = `<div class="bar-center rs-island" data-assistant-island>${pop}<form class="assistant-composer bar-composer" aria-label="Molis Work Assistant" onsubmit="return false"><span class="assistant-target"><button class="assistant-target-main" type="button" title="${L("下一次发送给哪项工作", "Where the next message goes")}"><span>${L("新工作", "New work")}</span></button></span>${chip}<input class="assistant-composer-input" type="text" autocomplete="off" value="${L("把这周的三篇稿子过一遍", "Go through this week's three drafts")}" aria-label="${L("发给助理", "Message the Assistant")}"><button class="bar-composer-attach" type="button" aria-label="${L("添加文件、引用或能力", "Add files, references or capabilities")}">${ic("plus")}</button>${btn({ variant: "primary", size: "sm", only: true, icon: "send", label: L("发送", "Send"), attrs: act("send") })}</form></div>`;

    // The work list: running tasks keep the version they started with.
    const pinnedBroken = s === "pinned" && !S.done.repicked;
    const running = row({ icon: face("rev"), title: L("第二期观察", "Issue 2 watch"), caption: pinnedBroken ? L("审稿人 v3 · 它要的「网页读取」已被撤销", "Reviewer v3 · the web reading it needs was revoked") : S.done.repicked ? L(`改由${R(S.done.repicked)} v${ROLES[S.done.repicked].v} 接着做 · 前几轮的记录仍写 审稿人 v3`, `Continued by ${R(S.done.repicked)} v${ROLES[S.done.repicked].v} · earlier rounds still say Reviewer v3`) : L("审稿人 v3 · 开始时的版本，做完前不换", "Reviewer v3 · the version it started with, kept until done"),
      end: pinnedBroken ? status("wait", L("停在原处", "Stopped")) + btn({ variant: "primary", size: "sm", label: L("另选角色继续", "Continue with another role"), attrs: act("repick") }) : status("run", L("进行中", "Running")) });
    const done = row({ icon: face("res"), title: L("竞品定价表", "Competitor pricing"), caption: L("研究员 v2", "Researcher v2"), end: status("done") });
    const solo = row({ icon: face("res"), title: L("读书笔记整理", "Reading notes"), caption: L("研究员 v2 · 个人工作", "Researcher v2 · personal work"), end: status("done") });
    const head = personal ? `<div class="land-head"><span class="mw-avatar rs-me" data-slot="avatar">${ic("user")}</span><h1 class="mw-brief__title" id="land-title" tabindex="-1">${L("个人", "Personal")}</h1></div>` : `<div class="land-head">${monogram("A")}<h1 class="mw-brief__title" id="land-title" tabindex="-1">${PROJECT()}</h1></div>`;
    const top = S.done.toast ? "" : "";
    const brief = `<article class="mw-brief" data-slot="brief" aria-labelledby="land-title">${top}${head}
      <div class="mw-brief__cols rs-one"><section class="mw-brief__sec"><h2>${L("最近的工作", "Recent work")}</h2><div class="mw-brief__list">${personal ? solo : running + done}</div></section></div>
      ${pinnedBroken ? alert("warning", L("不会悄悄换成别的版本", "It won't switch versions on its own"), L("前几轮用 v3 做的记录照旧；选了别的角色，从下一轮开始用它。", "Rounds already done with v3 stay as they are; another role takes over from the next round.")) : ""}</article>`;
    return wb(brief, center);
  }

  // ---------- 2 · Project settings › Roles ----------
  function membersFor(s) {
    const sch = S.scheme, up = s === "upstream";
    if (sch === "A") return {
      hint: L("这里是你的角色在本项目的用法。内容只有一份：在这里改，就是改你的原件，用到它的项目都会变。要只给本项目用，就另存一份。", "These are your own roles, as used here. There is one copy: editing here edits your original, and every project using it changes. To keep a change to this project, save a separate copy."),
      rows: [["rev", L(`你的角色 v${up ? 5 : 4} · 也用在 ${OTHERS().join("、")}`, `Your role v${up ? 5 : 4} · also used in ${OTHERS().join(", ")}`), ""], ["res", L(`你的角色 v2 · 也用在 ${OTHERS()[1]}`, `Your role v2 · also used in ${OTHERS()[1]}`), ""]],
      up: up ? alert("", L(`你把${q(R("rev"))}改成了 v5`, `You changed ${q(R("rev"))} to v5`), L("本项目的新任务从现在起用 v5；进行中的「第二期观察」仍用 v3。", "New tasks here use v5 from now on; the running “Issue 2 watch” keeps v3.")) : "" };
    if (sch === "B") return {
      hint: L("角色加进项目时复制一份，成为本项目的成员。在这里改只改这一份，你的原件和别的项目都不变。", "A role is copied when it joins the project. Editing here changes only this copy; your original and other projects stay as they are."),
      rows: [["rev", L("本项目 v2 · 复制自你的「审稿人」v3", "Project v2 · copied from your Reviewer v3"), up ? badge("info", L("原件有 v4", "Original has v4")) : ""], ["res", L("本项目 v1 · 复制自你的「研究员」v2", "Project v1 · copied from your Researcher v2"), ""]],
      up: up && !S.done.adopted ? alert("", L(`你的${q(R("rev"))}更新到了 v4，本项目还是复制时的内容`, `Your ${q(R("rev"))} is now v4; this project still has the copied content`), L("要不要采用，你来定。采用后成为本项目 v3，进行中的任务不变。", "You decide whether to take it. Taking it makes project v3; running tasks are unchanged."), actions(btn({ size: "sm", label: L("看差异", "See the difference"), attrs: act("dlg-open", "diff") }), btn({ variant: "primary", size: "sm", label: L("采用到本项目", "Take it here"), attrs: act("adopt") }), btn({ variant: "ghost", size: "sm", label: L("先不用", "Not now"), attrs: act("adopt-skip") })))
        : S.done.adopted ? alert("success", S.done.adopted === "skip" ? L("先不采用。原件再更新时会再提示。", "Not taken. You'll be told again when the original changes.") : L("已采用，成为本项目 v3。进行中的「第二期观察」仍用 v2。", "Taken as project v3. The running “Issue 2 watch” keeps v2.")) : "" };
    const followed = S.done.refollow;
    return {
      hint: L("项目里的角色默认跟随你的原件：原件出了新版本，新任务就用它。在这里改了哪一节，那一节就成了本项目自己的，随时可以恢复跟随。", "Roles here follow your original by default: when it gets a new version, new tasks use it. Change a section here and that section becomes this project's own; you can go back to following any time."),
      rows: [["rev", followed ? L("全部跟随你的原件 v4", "Follows your original v4") : L("做事方式：本项目改过 · 能用什么：跟随原件 v4", "Way of working: changed here · What it can use: follows v4"), followed ? setState("neutral", L("跟随", "Following")) : setState("warning", L("改过一节", "One section changed")) + btn({ variant: "ghost", size: "sm", label: L("恢复跟随", "Follow again"), attrs: act("refollow") })],
        ["res", L("全部跟随你的原件 v2", "Follows your original v2"), setState("neutral", L("跟随", "Following"))]],
      up: up && !followed && !S.done.keepOwn ? alert("warning", L(`你也改了${q(R("rev"))}的做事方式（原件 v5）`, `You also changed the way of working of ${q(R("rev"))} (original v5)`), L("本项目这一节用的是自己的版本，没有跟着变；「能用什么」照常跟随到了 v5。", "This project keeps its own version of that section; “What it can use” followed to v5 as usual."), actions(btn({ size: "sm", label: L("看差异", "See the difference"), attrs: act("dlg-open", "diff") }), btn({ size: "sm", label: L("改为跟随", "Follow the original"), attrs: act("refollow") }), btn({ variant: "ghost", size: "sm", label: L("保持本项目的", "Keep this project's"), attrs: act("keep-own") })))
        : up && S.done.keepOwn ? alert("success", L("保持本项目的做事方式。原件这一节再改时会再提示。", "Keeping this project's way of working. You'll be told again if that section changes.")) : "" };
  }
  function project() {
    const s = S.state, proj = projectDefault(), mine = personalDefault();
    const opts = [["inherit", L(`沿用我的默认（${R(mine)}）`, `Use my default (${R(mine)})`)], ["none", L("助理自己", "The Assistant")], ["rev", R("rev")], ["res", R("res")], ["code", R("code")]];
    let value, state;
    if (proj === "week") {
      value = select(L("新任务默认", "Default for new tasks"), [["week", L(`${R("week")}（已停用）`, `${R("week")} (turned off)`)], ...opts], "week", "proj-default");
      state = alert("warning", L(`${q(R("week"))}已停用，新任务现在由${q(R(mine))}（你的默认）来做`, `${q(R("week"))} is turned off; new tasks now go to ${q(R(mine))} (your default)`), L("进行中的照常做完。换一个默认，或者重新启用它。", "Running ones finish as they are. Pick another default, or turn it back on."), actions(btn({ variant: "ghost", size: "sm", label: L("重新启用", "Turn it back on"), attrs: act("restart-week") })));
    } else if (proj) {
      value = select(L("新任务默认", "Default for new tasks"), opts, proj, "proj-default") + btn({ variant: "ghost", size: "sm", label: L("恢复沿用", "Use my default again"), attrs: act("proj-inherit") });
    } else {
      value = select(L("新任务默认", "Default for new tasks"), opts, "inherit", "proj-default");
    }
    const shown = proj === "week" ? null : proj;
    const def = section("rs-default-title", L("默认由谁来做", "Who does it by default"),
      setRow(L("新任务默认", "Default for new tasks"), L("任务里换一个只管那一次，不改这里", "Changing it in a task only affects that task"), value)
      + `<div class="rs-ladder-row">${ladderFor(null, shown ? R(shown) : null, R(mine), proj === "week" ? L(`${R("week")}（已停用）`, `${R("week")} (off)`) : "")}</div>` + (state || ""));
    const m = membersFor(s);
    const memberRow = ([id, cap, end]) => `<div class="settings-setting-row rs-member"><div class="settings-record-title">${face(id)}<div><h3>${R(id)}</h3><p>${cap}</p></div></div><div class="setting-value">${end}${btn({ size: "sm", label: L("编辑", "Edit"), attrs: act("goto", "edit") })}</div></div>`;
    const add = S.scheme === "A" ? L("从我的角色里选", "Choose from my roles") : S.scheme === "B" ? L("从我的角色复制进来", "Copy one of my roles in") : L("从我的角色添加", "Add one of my roles");
    const members = section("rs-members-title", L("本项目的角色", "Roles in this project"), `<p class="rs-hint">${m.hint}</p>${m.up}${m.rows.map(memberRow).join("")}`, btn({ size: "sm", icon: "plus", label: add, attrs: act("toast", L("会列出你的角色（原型不展开）", "Lists your roles (not built)")) }));
    return projectSettings(setHead(L("角色", "Roles"), L("这个项目的任务默认由谁来做，以及项目里能选哪些角色。改这里不影响别的项目，也不改你的默认。", "Who does this project's tasks by default, and which roles can be chosen here. Changes here don't touch other projects or your own default.")) + def + members + (S.dlg === "diff" ? diffDialog() : ""));
  }
  function diffDialog() {
    const before = L("先核对每条说法的出处，再改结构和措辞。改动逐条列出原因。", "Check the source of every claim first, then fix structure and wording. List each change with its reason.");
    const after = T(ROLES.rev.way);
    const B = S.scheme === "B";
    return `<dialog class="mw-dialog" data-slot="dialog" aria-labelledby="dlg-title" data-proto-dialog><form method="dialog" class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><div><h2 id="dlg-title">${L("做事方式的差异", "Way of working: the difference")}</h2></div>${btn({ variant: "ghost", only: true, icon: "x", label: L("关闭", "Close"), cls: "mw-dialog__close", attrs: act("dlg-close") })}</header>
      <div class="mw-form__body"><div class="rs-diff"><section><h3>${B ? L("本项目 v2", "Project v2") : L("本项目的", "This project's")}</h3><p>${before}</p></section><section><h3>${B ? L("你的原件 v4", "Your original v4") : L("你的原件 v5", "Your original v5")}</h3><p>${after.replace(before.slice(0, 8), before.slice(0, 8))}<mark>${L("拿不准的标出来，不替作者下结论。", "Flag what you're unsure of instead of deciding for the author.")}</mark></p></section></div></div>
      <footer class="mw-form__footer">${btn({ size: "sm", label: L("关闭", "Close"), attrs: act("dlg-close") })}${btn({ variant: "primary", size: "sm", label: B ? L("采用到本项目", "Take it here") : L("改为跟随", "Follow the original"), attrs: act(B ? "adopt" : "refollow") })}</footer></form></dialog>`;
  }

  // ---------- 3 · Edit a role and save it for use ----------
  function edit() {
    const s = S.state, sch = S.scheme;
    const where = sch === "A" ? L("你的角色 · v4 · 用在 3 个项目", "Your role · v4 · used in 3 projects") : sch === "B" ? L("本项目成员 · v2 · 复制自你的「审稿人」v3", "Project member · v2 · copied from your Reviewer v3") : (S.done.refollow ? L("本项目 · 跟随你的原件 v4", "This project · follows your original v4") : L("本项目 · 做事方式改过，其余跟随你的原件 v4", "This project · way of working changed here, the rest follows your original v4"));
    const saved = s === "saved" || S.saved;
    const savedNote = saved ? alert("success", sch === "A" ? L("已保存成 v5", "Saved as v5") : sch === "B" ? L("已保存成本项目 v3", "Saved as project v3") : S.saved === "mine" ? L("已改你的原件，成为 v5", "Your original is now v5") : L("已保存，本项目的做事方式成为 v5", "Saved; this project's way of working is v5"),
      sch === "A" ? L("用它的 3 个项目，新任务从现在起用 v5；进行中的「第二期观察」仍用 v4。", "New tasks in the 3 projects using it get v5 from now on; the running “Issue 2 watch” keeps v4.")
        : sch === "B" ? L("只改了本项目这一份；你的原件和别的项目不变。进行中的「第二期观察」仍用 v2。", "Only this project's copy changed; your original and other projects are unchanged. The running “Issue 2 watch” keeps v2.")
          : S.saved === "mine" ? L(`跟随它的项目（${PROJECT()}、${OTHERS()[0]}），新任务从现在起用 v5；进行中的仍用 v4。`, `Projects following it (${PROJECT()}, ${OTHERS()[0]}) use v5 for new tasks; running ones keep v4.`) : L("原件和别的项目不变；进行中的「第二期观察」仍用 v4。", "Your original and other projects are unchanged; the running “Issue 2 watch” keeps v4."),
      actions(btn({ size: "sm", label: L("撤销", "Undo"), attrs: act("undo-save") }))) : "";
    const conflict = s === "conflict" && !S.done.reloaded ? alert("danger", sch === "A" ? L("你的「审稿人」刚在「官网改版」的设置里改过", "Your Reviewer was just changed in Website redesign's settings") : L("本项目的「审稿人」刚在另一个窗口改过", "This project's Reviewer was just changed in another window"), L("你的改动还在，没有保存，也没有盖掉那边的。", "Your edits are kept, not saved, and nothing over there was overwritten."), actions(btn({ variant: "primary", size: "sm", label: L("看差异再保存", "Compare, then save"), attrs: act("dlg-open", "diff") }), btn({ size: "sm", label: L("读取新内容（丢掉我的改动）", "Load theirs (drop my edits)"), attrs: act("reload") }))) : "";
    const own = sch === "C" && !S.done.refollow;
    const wayHead = sch === "C" ? (own ? setState("warning", L("本项目改过", "Changed here")) + btn({ variant: "ghost", size: "sm", label: L("恢复跟随原件", "Follow the original"), attrs: act("refollow") }) : setState("neutral", L("跟随原件 v4", "Follows original v4"))) : "";
    const toolHead = sch === "C" ? setState("neutral", L("跟随原件 v4", "Follows original v4")) : "";
    const dirty = s === "edit" && !saved;
    const way = section("rs-way-title", L("做事方式", "Way of working"), `<label class="rs-field"><span class="mw-sr-only">${L("做事方式", "Way of working")}</span><textarea class="mw-input" data-slot="textarea" rows="5">${T(ROLES.rev.way)}</textarea></label>`, wayHead);
    const tools = section("rs-tools-title", L("能用什么", "What it can use"), `<label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" checked><span>${L("沿用任务选择的能力", "Use what the task allows")}</span></label>${P.note(L("选角色不会给任务加权限，只能在任务允许的范围里再收窄。", "Choosing a role never grants anything; it can only narrow what the task allows."), "shield")}`, toolHead);
    const history = s === "history" ? section("rs-history-title", L("版本", "Versions"), [
      [sch === "B" ? "3" : "5", L("11-04 · 你改了做事方式", "11-04 · you changed the way of working"), L("当前", "Current")],
      [sch === "B" ? "2" : "4", L("11-02 · 进行中的「第二期观察」在用", "11-02 · used by the running “Issue 2 watch”"), ""],
      [sch === "B" ? "1" : "3", sch === "B" ? L("10-28 · 从你的「审稿人」v3 复制进来", "10-28 · copied from your Reviewer v3") : L("10-28", "10-28"), ""]].map(([v, cap, cur]) => setRow(sch === "B" ? L(`本项目 v${v}`, `Project v${v}`) : `v${v}`, cap, cur ? setState("success", cur) : btn({ size: "sm", label: L("恢复成这一版", "Restore this version"), attrs: act("restore", v) }))).join("") + P.note(L("恢复会把那一版的内容保存成新的一版；进行中的任务不受影响。", "Restoring saves that version's content as a new version; running tasks are unaffected."), "history")) : "";
    const foot = `<footer class="settings-save-footer form-actions rs-savebar"><p class="rs-hint">${dirty ? L("有改动还没保存", "Unsaved changes") : saved ? L("已保存", "Saved") : ""}</p>${btn({ variant: "ghost", size: "sm", label: L("放弃改动", "Discard"), disabled: !dirty, attrs: act("toast", L("回到已保存的内容", "Back to the saved content")) })}${btn({ variant: "primary", size: "sm", label: L("保存并使用", "Save and use"), disabled: !dirty && s !== "conflict", attrs: act("dlg-open", "save") })}</footer>`;
    const back = `<a class="rs-back" href="#"${P.attrs(act("goto", "project"))}>${ic("chevron-left")}${L("角色", "Roles")}</a>`;
    return projectSettings(back + setHead(R("rev"), where, face("rev")) + savedNote + conflict + way + tools + history + foot + (S.dlg === "save" ? saveDialog() : S.dlg === "diff" ? diffDialog() : ""));
  }
  function saveDialog() {
    const sch = S.scheme;
    const facts = sch === "A" ? [["folder", "blue", L(`${PROJECT()}、${OTHERS().join("、")}`, `${PROJECT()}, ${OTHERS().join(", ")}`), L("新任务用 v5", "New tasks use v5")], ["clock", "slate", L("进行中的 2 件", "2 running"), L("仍用 v4", "Keep v4")]]
      : sch === "B" ? [["folder", "blue", PROJECT(), L("新任务用本项目 v3", "New tasks use project v3")], ["clock", "slate", L("进行中的 1 件", "1 running"), L("仍用 v2", "Keeps v2")], ["user", "purple", L("你的原件和别的项目", "Your original and other projects"), L("不变", "Unchanged")]]
        : S.where === "mine" ? [["user", "purple", L("你的原件", "Your original"), L("成为 v5", "Becomes v5")], ["folder", "blue", L(`跟随它的项目：${PROJECT()}、${OTHERS()[0]}`, `Projects following it: ${PROJECT()}, ${OTHERS()[0]}`), L("新任务用 v5", "New tasks use v5")], ["clock", "slate", L("进行中的 1 件", "1 running"), L("仍用 v4", "Keeps v4")]]
          : [["folder", "blue", PROJECT(), L("做事方式成为本项目自己的 v5", "Way of working becomes this project's own v5")], ["clock", "slate", L("进行中的 1 件", "1 running"), L("仍用 v4", "Keeps v4")], ["user", "purple", L("你的原件和别的项目", "Your original and other projects"), L("不变", "Unchanged")]];
    const choose = sch === "C" ? P.choices(L("改到哪里", "Where the change goes"), [{ label: L("只改本项目", "Only this project"), on: S.where === "project", attrs: act("where", "project") }, { label: L("改我的原件", "My original"), on: S.where === "mine", attrs: act("where", "mine") }]) : "";
    const title = sch === "A" ? L("保存成 v5？", "Save as v5?") : sch === "B" ? L("保存成本项目 v3？", "Save as project v3?") : L("保存到哪里？", "Where to save?");
    const extra = sch === "A" ? btn({ size: "sm", label: L("只给本项目：另存一份", "Just this project: save a copy"), attrs: act("toast", L("会另存成「审稿人（AI 产品观察）」，只有本项目选用", "Saves “Reviewer (AI product watch)”, chosen only here")) }) : "";
    return `<dialog class="mw-dialog" data-slot="dialog" aria-labelledby="dlg-title" data-proto-dialog><form method="dialog" class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><div><h2 id="dlg-title">${title}</h2></div>${btn({ variant: "ghost", only: true, icon: "x", label: L("关闭", "Close"), cls: "mw-dialog__close", attrs: act("dlg-close") })}</header>
      <div class="mw-form__body">${choose}${facts.map(([, , n, e]) => setRow(n, "", `<span class="rr-fact">${e}</span>`)).join("")}${P.note(L("每次保存都固定成一个版本，可以追溯，也可以恢复。", "Every save is fixed as a version you can trace and restore."), "history")}</div>
      <footer class="mw-form__footer">${btn({ size: "sm", label: L("取消", "Cancel"), attrs: act("dlg-close") })}${extra}${btn({ variant: "primary", size: "sm", label: L("保存并使用", "Save and use"), attrs: act("save-do") })}</footer></form></dialog>`;
  }

  // ---------- 4 · Global settings › Roles (D track co-reviews) ----------
  function lib() {
    const s = S.state, sch = S.scheme, mine = personalDefault();
    if (s === "empty" && !S.done.created) {
      const def = section("rs-mydef-title", L("默认由谁来做", "Who does it by default"), setRow(L("我的默认", "My default"), L("不在项目里的工作，和没有另选的项目", "Personal work, and projects that don't choose their own"), select(L("我的默认", "My default"), [["none", L("助理自己", "The Assistant")]], "none") + setState("neutral", L("没有角色可选", "No roles to choose"))));
      const empty = `<div class="mw-empty" data-slot="empty"><span class="mw-empty__mark">${ic("user")}</span><h2 tabindex="-1">${L("还没有自己的角色", "No roles of your own yet")}</h2><p>${L("写下你希望 AI 怎样做事；或者从 Codex、Claude Code 等本机 Agent 导入已有的规则。", "Write how you want the AI to work, or import rules you already have from Codex, Claude Code and other local agents.")}</p><div class="mw-empty__actions">${btn({ variant: "primary", size: "sm", icon: "plus", label: L("新建角色", "New role"), attrs: act("create") })}${btn({ size: "sm", icon: "upload", label: L("从本机导入", "Import from this Mac"), attrs: act("toast", L("会列出本机 Agent 的规则（原型不展开）", "Lists local agents' rules (not built)")) })}</div></div>`;
      return globalSettings("roles", setHead(L("角色", "Roles"), L("你写的角色。各个项目怎样用，在 项目设置 › 角色 里定。", "Roles you write. How each project uses them is set in Project settings › Roles.")) + def + section("rs-mine-title", L("我的角色", "My roles"), empty));
    }
    const used = (id) => (sch === "A" ? L(`v${ROLES[id].v} · 用在 ${id === "rev" ? 3 : 2} 个项目`, `v${ROLES[id].v} · used in ${id === "rev" ? 3 : 2} projects`) : sch === "B" ? L(`v${ROLES[id].v} · 复制进 ${id === "rev" ? 3 : 2} 个项目`, `v${ROLES[id].v} · copied into ${id === "rev" ? 3 : 2} projects`) : id === "rev" ? L("v4 · 3 个项目跟随（1 个改过一节）", "v4 · followed by 3 projects (1 changed a section)") : L(`v${ROLES[id].v} · ${2} 个项目跟随`, `v${ROLES[id].v} · followed by 2 projects`));
    const stopped = S.done.stoppedRev;
    const list = (S.done.created ? [["new", L("新角色", "New role"), L("草稿 · 还没用过", "Draft · not used yet")]] : []).concat([["rev", R("rev"), used("rev")], ["res", R("res"), used("res")], ["code", R("code"), sch === "C" ? L("v6 · 1 个项目跟随", "v6 · followed by 1 project") : L("v6 · 用在 1 个项目", "v6 · used in 1 project")]]);
    const roleRow = ([id, name, cap]) => `<div class="settings-setting-row rs-member"><div class="settings-record-title">${id === "new" ? `<span class="mw-avatar" data-slot="avatar">${ic("user")}</span>` : face(id)}<div><h3>${name}${id === mine ? ` ${badge("neutral", L("我的默认", "My default"))}` : ""}</h3><p>${cap}</p></div></div><div class="setting-value">${id === "rev" && stopped ? setState("warning", L("已停用", "Turned off")) + btn({ variant: "ghost", size: "sm", label: L("重新启用", "Turn back on"), attrs: act("unstop") }) : id === "rev" && s === "stopped" ? btn({ size: "sm", label: L("停用", "Turn off"), attrs: act("dlg-open", "stop") }) : ""}${btn({ size: "sm", label: L("编辑", "Edit"), attrs: act("goto", "edit") })}</div></div>`;
    const def = section("rs-mydef-title", L("默认由谁来做", "Who does it by default"), setRow(L("我的默认", "My default"), L("不在项目里的工作，和没有另选的项目", "Personal work, and projects that don't choose their own"), select(L("我的默认", "My default"), [["none", L("助理自己", "The Assistant")], ["rev", R("rev")], ["res", R("res")], ["code", R("code")]], mine || "none", "my-default")));
    const mineSec = section("rs-mine-title", L("我的角色", "My roles"), list.map(roleRow).join(""), `<div class="q-row">${btn({ size: "sm", icon: "upload", label: L("从本机导入", "Import"), attrs: act("toast", L("会列出本机 Agent 的规则（原型不展开）", "Lists local agents' rules (not built)")) })}${btn({ variant: "primary", size: "sm", icon: "plus", label: L("新建", "New"), attrs: act("create") })}</div>`);
    const sys = section("rs-sys-title", L("系统与插件带来的角色", "Roles from the system and plugins"), setRow(L("改组成它们的提示词", "Edit the prompts they're made of"), L("从下一轮执行开始生效，随时能恢复默认；它们能做什么仍由系统决定", "Takes effect from the next run and can be reset any time; what they can do is still up to the system"), btn({ size: "sm", label: L("打开提示词", "Open prompts"), attrs: act("toast", L("打开 设置 › 提示词", "Opens Settings › Prompts")) })));
    return globalSettings("roles", setHead(L("角色", "Roles"), L("你写的角色。各个项目怎样用，在 项目设置 › 角色 里定。", "Roles you write. How each project uses them is set in Project settings › Roles.")) + def + mineSec + sys + (S.dlg === "stop" ? stopDialog() : ""));
  }
  function stopDialog() {
    return `<dialog class="mw-dialog" data-slot="dialog" aria-labelledby="dlg-title" data-proto-dialog><form method="dialog" class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><div><h2 id="dlg-title">${L(`停用${q(R("rev"))}？`, `Turn off ${q(R("rev"))}?`)}</h2></div>${btn({ variant: "ghost", only: true, icon: "x", label: L("关闭", "Close"), cls: "mw-dialog__close", attrs: act("dlg-close") })}</header>
      <div class="mw-form__body">${[[L(`${PROJECT()}的默认`, `${PROJECT()}'s default`), L("新任务改由你的默认（研究员）做", "New tasks go to your default (Researcher)")], [L("进行中的 1 件", "1 running"), L("照常做完", "Finishes as is")], [L("做过的记录和各个版本", "Past records and versions"), L("都留着", "All kept")]].map(([n, e]) => setRow(n, "", `<span class="rr-fact">${e}</span>`)).join("")}</div>
      <footer class="mw-form__footer">${btn({ size: "sm", label: L("取消", "Cancel"), attrs: act("dlg-close") })}${btn({ variant: "primary", size: "sm", label: L("停用", "Turn off"), attrs: act("stop-do") })}</footer></form></dialog>`;
  }

  // ---------- Render ----------
  function proto() {
    const t = TOPICS[S.topic];
    document.getElementById("p-title").textContent = L("原型 · 模拟数据", "Prototype · sample data");
    document.getElementById("p-scheme").textContent = L("方案", "Scheme");
    document.getElementById("p-scheme-name").textContent = T(SCHEMES[S.scheme]);
    document.getElementById("p-topic").textContent = L("画面", "View");
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("p-lang").textContent = L("语言", "Language");
    document.getElementById("p-theme").textContent = L("外观", "Theme");
    document.querySelector("#reset [data-slot=button-label]").textContent = L("从头再来", "Restart");
    const [l, d] = document.querySelectorAll("#theme .mw-toggle"); l.textContent = L("浅", "Light"); d.textContent = L("深", "Dark");
    document.getElementById("topic").innerHTML = Object.entries(TOPICS).map(([k, v]) => `<option value="${k}" ${k === S.topic ? "selected" : ""}>${T(v.name)}</option>`).join("");
    document.getElementById("state").innerHTML = t.states.map(([k, n]) => `<option value="${k}" ${k === S.state ? "selected" : ""}>${T(n)}</option>`).join("");
    const mark = (sel, on) => document.querySelectorAll(sel).forEach((b) => { const yes = on(b); b.setAttribute("aria-pressed", String(yes)); b.classList.toggle("is-current", yes); });
    mark("#scheme .mw-toggle", (b) => b.dataset.scheme === S.scheme);
    mark("#lang .mw-toggle", (b) => b.dataset.lang === S.lang);
    mark("#theme .mw-toggle", (b) => b.dataset.themeSet === S.theme);
  }
  const BODY = { arrival: "arrival-page immersive-workbench", global: "settings-page project-preferences-page global-preferences-page", project: "settings-page project-preferences-page" };
  let lastView = null;
  function render() {
    try { localStorage.setItem("molis-work:theme", S.theme); } catch { /* preview without storage */ }
    window.molisWorkPreferences?.sync();
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    proto();
    const view = { pick, project, edit, lib }[S.topic]();
    // The product draws settings with its own stylesheet; switch sheets the way the product switches pages.
    document.getElementById("css-arrival").disabled = view.page === "settings";
    document.getElementById("css-settings").disabled = view.page !== "settings";
    document.body.className = `${BODY[view.page === "settings" ? view.body : "arrival"]} proto-on`;
    app.innerHTML = view.html;
    app.querySelector("[data-proto-dialog]")?.showModal();
    const key = `${S.topic}|${S.state}|${S.scheme}`;
    if (key !== lastView && !S.dlg) app.querySelector("h1[tabindex], .mw-empty h2")?.focus({ preventScroll: true });
    lastView = key;
    save();
  }
  function reset(patch = {}) { S = { ...fresh({ scheme: S.scheme, topic: S.topic, state: S.state, lang: S.lang, theme: S.theme }), ...patch }; render(); }

  document.getElementById("scheme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) reset({ scheme: b.dataset.scheme }); });
  document.getElementById("topic").addEventListener("change", (e) => reset({ topic: e.target.value, state: TOPICS[e.target.value].states[0][0] }));
  document.getElementById("state").addEventListener("change", (e) => reset({ state: e.target.value }));
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("reset").addEventListener("click", () => reset());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.pop && S.topic === "pick" && !S.dlg) { S.pop = false; render(); } });
  app.addEventListener("close", () => { if (S.dlg) { S.dlg = null; save(); } }, true);
  app.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-change]");
    if (!sel) return;
    const v = sel.value;
    if (sel.dataset.change === "proj-default") { S.done.projDefault = v === "inherit" ? null : v === "none" ? null : v; toast(v === "inherit" ? L("本项目改为沿用你的默认", "This project uses your default again") : L("本项目的新任务从现在起用它；进行中的不变", "New tasks here use it from now on; running ones are unchanged")); }
    if (sel.dataset.change === "my-default") { S.done.myDefault = v === "none" ? null : v; toast(L("你的默认已改。没有另选的项目，新任务跟着变", "Your default changed. Projects without their own choice follow it for new tasks")); }
    render();
  });
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    const a = b.dataset.act, arg = b.dataset.arg;
    const A = {
      toast() { toast(arg); },
      pop() { S.pop = !S.pop; },
      choose() { S.choice = arg === "none" ? null : arg; },
      "make-default"() {
        const id = S.choice !== undefined ? S.choice : "res";
        if (arg === "project") { S.done.projDefault = id; toast(L(`本项目的新任务默认由${id ? R(id) : "助理自己"}来做；在 项目设置 › 角色 里可以改回`, `New tasks here default to ${id ? R(id) : "the Assistant"}; change it back in Project settings › Roles`)); }
        else { S.done.myDefault = id; toast(L(`你的默认改为${id ? R(id) : "助理自己"}；另选了默认的项目不受影响`, `Your default is now ${id ? R(id) : "the Assistant"}; projects with their own choice are unaffected`)); }
        S.choice = undefined; if (S.state === "once") S.state = "project";
      },
      send() { S.pop = false; toast(L("已开始。这项工作固定用所选角色当前的版本", "Started. This work keeps the chosen role's current version")); },
      repick() { S.done.repicked = "res"; toast(L("从下一轮起改由研究员 v2 来做", "Researcher v2 takes over from the next round")); },
      "restart-week"() { S.done.projDefault = "rev"; toast(L("已重新启用（原型：默认换回审稿人演示）", "Turned back on (prototype: default shown as Reviewer)")); },
      goto() { const st = TOPICS[arg].states[0][0]; S = { ...fresh({ scheme: S.scheme, lang: S.lang, theme: S.theme }), topic: arg, state: st }; },
      "proj-inherit"() { S.done.projDefault = null; toast(L("本项目改为沿用你的默认", "This project uses your default again")); },
      refollow() { S.dlg = null; S.done.refollow = true; toast(L("做事方式恢复跟随原件；本项目改过的内容留在版本里，可以再恢复", "Way of working follows the original again; this project's edit is kept in its versions")); },
      "keep-own"() { S.done.keepOwn = true; },
      adopt() { S.dlg = null; S.done.adopted = "yes"; },
      "adopt-skip"() { S.done.adopted = "skip"; },
      "dlg-open"() { S.dlg = arg; },
      "dlg-close"() { S.dlg = null; },
      where() { S.where = arg; },
      "save-do"() { S.dlg = null; S.saved = S.scheme === "C" ? S.where : "yes"; S.state = "saved"; },
      "undo-save"() { S.saved = null; S.state = "edit"; toast(L("已撤销：回到上一版的内容，并保存成新的一版", "Undone: the previous content is saved as a new version")); },
      reload() { S.done.reloaded = true; toast(L("已读取新内容", "Loaded the new content")); },
      restore() { toast(L(`已把 v${arg} 的内容保存成新的一版；进行中的任务不变`, `v${arg}'s content saved as a new version; running tasks unchanged`)); },
      create() { S.done.created = true; toast(L("新建了一个草稿（原型不展开编辑）", "Created a draft (editing not built)")); },
      "stop-do"() { S.dlg = null; S.done.stoppedRev = true; },
      unstop() { S.done.stoppedRev = false; },
    };
    if (A[a]) { A[a](); if (a !== "toast") render(); }
  });

  render();
  window.protoJump = (p) => { Object.assign(S, p); render(); };
})();
