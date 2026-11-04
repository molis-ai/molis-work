// 36 · Role scope — scheme C, chosen by the user on 2026-11-04: a project's role follows your original until a section
// is changed here; that section becomes the project's own and can follow again. Every role action stays on the page
// it starts from (user, same day): choosing, making a default, editing, saving, comparing, restoring, adding and
// turning off happen in place — the editor is a drawer over the current page, confirmations and differences open inline.
// Frames are the product's own: the workbench bar and the Assistant's role chooser (../_catalog/dist/arrival.css), the
// global and project settings pages (../_catalog/dist/settings.css). Every role, version, project and task is sample
// data; nothing is saved, published or run. Schemes A and B are in this folder's history (commit bcc7b8537a).
(() => {
  const app = document.getElementById("app");
  const drawerEl = document.getElementById("drawer");
  const KEY = "molis-proto.role-scope.v2";

  const TOPICS = {
    pick: { name: ["任务里选角色", "Choosing for a task"],
      states: [["project", ["来自项目默认", "From the project default"]], ["once", ["这次换一个", "A different one this time"]], ["personal", ["个人工作（不在项目里）", "Personal work (no project)"]],
        ["exceed", ["要的工具这里没开放", "Needs a tool not open here"]], ["stopped", ["项目默认的角色已停用", "Project default turned off"]], ["pinned", ["进行中任务的版本不能用了", "A running task's version broke"]]] },
    project: { name: ["项目设置 › 角色", "Project settings › Roles"],
      states: [["inherit", ["沿用你的默认", "Using your default"]], ["override", ["本项目另选了", "The project's own choice"]], ["upstream", ["你的原件更新了", "Your original changed"]], ["stopped", ["默认的角色已停用", "Default role turned off"]]] },
    editor: { name: ["调整角色（抽屉）", "Adjusting a role (drawer)"],
      states: [["edit", ["改了做事方式", "Way of working edited"]], ["saved", ["已保存", "Saved"]], ["conflict", ["别处刚改过", "Changed elsewhere"]], ["history", ["版本与恢复", "Versions and restore"]], ["new", ["新建一个", "A new one"]]] },
    lib: { name: ["全局设置 › 角色", "Settings › Roles"],
      states: [["normal", ["有几个角色", "A few roles"]], ["empty", ["还没有角色", "No roles yet"]], ["stopped", ["停用一个在用的角色", "Turning off a role in use"]]] },
  };
  // What each view starts with; the drawer and inline panels open on top of it and close back to it.
  const fresh = (keep = {}) => ({ topic: "pick", state: "project", lang: "zh", theme: "light", ...keep,
    pop: true, mode: null, choice: undefined, done: {}, add: false, diff: false, stopAsk: false,
    drawer: null, from: null, dState: "clean", where: "project", text: null, name: "", hist: false, dDiff: false });
  const forTopic = (S0) => {
    if (S0.topic !== "editor") return S0;
    const st = S0.state;
    return { ...S0, drawer: st === "new" ? "new" : "rev", from: "project", dState: st === "edit" ? "dirty" : st === "saved" ? "saved" : st === "conflict" ? "conflict" : "clean", hist: st === "history" };
  };
  let S;
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); S = v ? { ...fresh(), ...v } : forTopic(fresh()); } catch { S = forTopic(fresh()); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* preview without storage */ } };

  const P = window.molisParts(() => S.lang);
  const { esc, ic, act, btn, status, badge, alert, avatar, monogram, row, toast } = P;
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (p) => (Array.isArray(p) ? (S.lang === "zh" ? p[0] : p[1]) : p);
  const actions = (...b) => `<div class="q-row">${b.join("")}</div>`;

  // ---------- Sample facts ----------
  const ROLES = {
    rev: { name: ["审稿人", "Reviewer"], ini: ["审", "Rv"], hue: "purple", v: 4, way: ["先核对每条说法的出处，再改结构和措辞。改动逐条列出原因；拿不准的标出来，不替作者下结论。", "Check the source of every claim first, then fix structure and wording. List each change with its reason; flag what you're unsure of instead of deciding for the author."] },
    res: { name: ["研究员", "Researcher"], ini: ["研", "Rs"], hue: "cyan", v: 2, way: ["先列来源，按可信度排；每条结论写清依据，没核实的单独列出。", "List sources first, ranked by trust; give the basis of each conclusion and list what isn't verified."] },
    code: { name: ["代码审查", "Code reviewer"], ini: ["码", "Cd"], hue: "blue", v: 6, way: ["先跑相关检查，再看改动；每条意见指到行，分清必须改和建议。", "Run the relevant checks first, then read the change; point each comment at a line and separate must-fix from suggestion."] },
    week: { name: ["周报写手", "Weekly writer"], ini: ["周", "Wk"], hue: "orange", v: 1, way: ["", ""] },
    mine1: { name: ["新角色", "New role"], ini: ["新", "Nw"], hue: "green", v: 1, way: ["", ""] },
  };
  const R = (id) => T(ROLES[id].name);
  const face = (id) => avatar(T(ROLES[id].ini), ROLES[id].hue);
  const PROJECT = () => L("AI 产品观察", "AI product watch");
  const OTHER = () => L("官网改版", "Website redesign");
  const q = (s) => L(`「${s}」`, `“${s}”`);
  const before = () => L("先核对每条说法的出处，再改结构和措辞。改动逐条列出原因。", "Check the source of every claim first, then fix structure and wording. List each change with its reason.");
  const added = () => L("拿不准的标出来，不替作者下结论。", "Flag what you're unsure of instead of deciding for the author.");

  function projectDefault() {
    if (S.done.projDefault !== undefined) return S.done.projDefault;
    if ((S.topic === "pick" || S.topic === "project") && S.state === "stopped") return "week";
    if (S.topic === "project" && S.state === "inherit") return null;
    return "rev";
  }
  const personalDefault = () => (S.done.myDefault !== undefined ? S.done.myDefault : S.topic === "lib" && S.state === "empty" && !S.done.created ? null : "res");
  const followed = () => S.done.refollow === true;

  // ---------- Frames ----------
  const titlebar = () => `<header class="arrival-titlebar" data-region="titlebar"><span class="arrival-brand">${ic("brand")}${P.wordmark(' data-state="done"')}</span><span class="arrival-spacer"></span><nav class="arrival-tools"></nav></header>`;
  function workBar(center) {
    const pins = [["home", "home", L("项目首页", "Project home")], ["pages", "note", "Pages"], ["feed", "rss", "Feed"]];
    const personal = S.state === "personal";
    return `<div class="workbench-bar" data-dock aria-label="${L("底栏", "Bottom bar")}">
      <div class="bar-start"><div class="plugin-picker"><button class="plugin-picker-trigger" type="button" aria-expanded="false" aria-label="${L("全部插件与 Dock", "All plugins and Dock")}"${P.attrs(act("toast", L("插件切换（原型不展开）", "Plugin switcher (not built)")))}><span class="plugin-picker-all" aria-hidden="true">${ic("grid")}</span><span class="plugin-picker-current">${ic("home")}<span>${personal ? L("个人", "Personal") : L("项目首页", "Project home")}</span></span>${ic("chevron-down")}</button></div><div class="dock-pins" role="toolbar" aria-label="${L("常驻插件", "Kept plugins")}">${pins.map(([id, g, t]) => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" aria-label="${t}" title="${t}"${id === "home" ? ' aria-current="page"' : ""}${P.attrs(act("toast", L("原型只画了这一页", "Only this page is drawn")))}>${ic(g)}</button>`).join("")}</div></div>
      ${center}
      <div class="bar-end"><section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${L("当前项目", "Current project")}"><div class="navigator-project-primary"><details class="navigator-project-menu"><summary class="navigator-project-selector" aria-label="${L("切换项目", "Switch project")}">${personal ? `${ic("user")}<strong>${L("个人", "Personal")}</strong>` : `${monogram("A")}<strong>${PROJECT()}</strong>`}${ic("chevron-down")}</summary></details></div></section></div></div>`;
  }
  const wb = (content, center) => ({ page: "arrival", html: `<div class="arrival" data-workspace data-screen="work">${titlebar()}<main class="arrival-stage"><div class="stage-single"><div class="stage-sheet"><div class="land-scroll" data-scroll>${content}</div></div></div></main>${workBar(center)}</div>` });
  const notDrawn = () => P.attrs(act("toast", L("原型只画了这一页", "Only this page is drawn")));
  function globalSettings(active, body) {
    const groups = [[L("本机", "On this Mac"), [["appearance", "sun", L("界面与语言", "Interface & language")], ["directories", "folder", L("本机目录", "Local folders")]]],
      ["AI", [["models", "key", L("模型", "Models")], ["assistant", "message", L("助理", "Assistant")], ["roles", "user", L("角色", "Roles")], ["prompts", "text", L("提示词", "Prompts")]]],
      [L("系统", "System"), [["update", "download", L("更新", "Update")], ["diagnostics", "bug", L("诊断", "Diagnostics")]]]];
    const nav = groups.map(([g, items]) => `<div class="settings-nav-group-label">${g}</div>${items.map(([id, g2, n]) => `<a href="#"${id === active ? ' aria-current="page"' : ""}${notDrawn()}>${ic(g2)}${n}</a>`).join("")}`).join("");
    return { page: "settings", body: "global", html: `<header class="project-preferences-chrome"><span>${L("全局设置", "Global settings")}</span><a href="#" aria-label="${L("关闭全局设置", "Close global settings")}"${notDrawn()}>${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex" aria-label="${L("系统设置", "System settings")}"><a class="settings-nav-back" href="#"${notDrawn()}>${ic("arrow")} ${L("返回项目", "Return to project")}</a><div class="settings-nav-body">${nav}</div></nav>
      <div class="settings-content"><section class="settings-document" aria-labelledby="settings-title">${body}</section></div></main>` };
  }
  function projectSettings(body) {
    const items = [["general", "tune", L("常规", "General")], ["workspaces", "folder", L("工作目录", "Folders")], ["guidance", "book", L("项目说明", "Description")], ["memory", "bookmark", L("项目记忆", "Project memory")], ["knowledge", "file", L("项目资料", "Materials")], ["plugins", "package", L("插件", "Plugins")], ["roles", "user", L("角色", "Roles")]];
    return { page: "settings", body: "project", html: `<header class="project-preferences-chrome"><span>${L("项目设置", "Project settings")}</span><a href="#" aria-label="${L("返回工作台", "Back to the workbench")}"${notDrawn()}>${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex project-settings-navigation" aria-label="${L("项目设置", "Project settings")}"><a class="settings-nav-back" href="#"${notDrawn()}>${ic("arrow")} ${L("返回工作台", "Back to the workbench")}</a>
      <div class="settings-project-identity"><strong>${PROJECT()}</strong><span>${L("项目设置", "Project settings")}</span></div>
      <div class="settings-nav-body">${items.map(([id, g, n]) => `<a href="#"${id === "roles" ? ' aria-current="page"' : ""}${id === "roles" ? "" : notDrawn()}>${ic(g)}${n}</a>`).join("")}</div></nav>
      <div class="settings-content"><section class="settings-document" aria-labelledby="settings-title">${body}</section></div></main>` };
  }
  const setHead = (title, sub = "") => `<header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title" tabindex="-1">${title}</h1></div>${sub ? `<p>${sub}</p>` : ""}</header>`;
  const setRow = (title, sub, value, cls = "") => `<section class="settings-setting-row${cls ? ` ${cls}` : ""}"><div class="setting-copy"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ""}</div><div class="setting-value">${value}</div></section>`;
  const setState = (tone, text) => `<span class="settings-state settings-state--${tone}">${text}</span>`;
  const section = (id, title, body, head = "") => `<section class="settings-section" aria-labelledby="${id}"><div class="rs-sec-head"><h2 id="${id}">${title}</h2>${head}</div>${body}</section>`;
  const select = (label, opts, value, a) => `<select class="mw-select" data-slot="select" aria-label="${esc(label)}"${a ? ` data-change="${a}"` : ""}>${opts.map(([v, n]) => `<option value="${v}"${v === value ? " selected" : ""}>${n}</option>`).join("")}</select>`;
  // An inline panel that opens under the thing that opened it.
  const inset = (body, cls = "") => `<div class="rs-inset${cls ? ` ${cls}` : ""}">${body}</div>`;
  const diffBox = (leftTitle, rightTitle) => `<div class="rs-diff"><section><h3>${leftTitle}</h3><p>${before()}</p></section><section><h3>${rightTitle}</h3><p>${before()}<mark>${added()}</mark></p></section></div>`;

  // [组件板新增] where the value comes from: the layers from nearest to farthest, the one in use marked.
  function ladderFor(proj, mine, off = "") {
    const layers = [{ k: L("任务里另选", "Picked in a task"), note: L("只管那一次", "That task only") }, { k: L("本项目", "This project"), value: proj, off }, { k: L("你的默认", "Your default"), value: mine }, { k: L("最后", "Otherwise"), value: L("助理自己", "The Assistant") }];
    layers.find((x) => x.value && !x.off).on = true;
    return `<ol class="cand-scope" aria-label="${L("新任务的角色从哪来", "Where a new task's role comes from")}">${layers.map((x) => `<li class="${x.on ? "is-on" : x.off ? "is-off" : x.value ? "is-under" : "is-empty"}"${x.on ? ' aria-current="true"' : ""}><span class="k">${x.k}</span><span class="v">${x.off || x.value || x.note || L("没设", "Not set")}</span></li>`).join("")}</ol>`;
  }

  // ---------- 1 · Choosing for a task: the Assistant's chooser beside the input ----------
  function pick() {
    const s = S.state, personal = s === "personal";
    const proj = personal ? null : projectDefault();
    const mine = personalDefault();
    const stoppedDefault = proj === "week";
    const fallback = personal || stoppedDefault ? mine : proj || mine;
    const chosen = S.choice !== undefined ? S.choice : s === "once" && !S.done.settled ? "res" : fallback;
    const isOnce = (S.choice !== undefined || (s === "once" && !S.done.settled)) && chosen !== fallback;
    const created = S.done.created ? ["mine1"] : [];
    const source = (id) => {
      if (id === null) return "";
      if (!personal && id === proj && !stoppedDefault) return badge("neutral", L("项目默认", "Project default"));
      if (id === mine) return badge("neutral", L("我的默认", "My default"));
      return "";
    };
    const note = (id) => (id === "rev" && !personal && !followed() ? L(" v5 · 本项目改过一节", " v5 · one section changed here") : id === "mine1" ? L(" v1 · 刚写的", " v1 · just written") : ` v${ROLES[id].v}`);
    const opt = (id, dis = "") => {
      const main = `<button type="button" class="assistant-starter rs-starter"${chosen === id && !S.mode ? ' aria-current="true"' : ""}${dis ? " disabled" : ""}${P.attrs(dis ? {} : act("choose", id ?? "none"))}>${id ? face(id) : `<span class="mw-avatar rs-self" data-slot="avatar">${ic("sparkles")}</span>`}<span class="rs-starter__copy"><strong>${id ? R(id) : L("助理自己", "The Assistant")}</strong><span class="assistant-material-origin">${id ? note(id) : L(" 不指定角色", " no role")}${dis ? ` · ${dis}` : ""}</span></span>${source(id)}</button>`;
      const tune = id && !dis && !S.mode ? btn({ variant: "ghost", size: "sm", only: true, icon: "edit", label: L(`调整${R(id)}`, `Adjust ${R(id)}`), cls: "rs-opt__tune", attrs: act("drawer", id) }) : "";
      return `<div class="rs-opt">${main}${tune}</div>`;
    };
    const ids = personal ? ["res", "rev", ...created] : ["rev", "res", ...created];
    const list = [opt(null), ...ids.map((id) => opt(id)), opt("code", s === "exceed" ? L("要用终端，助理这里没开放", "needs the terminal, not open here") : ""),
      ...(stoppedDefault ? [opt("week", L("已停用", "turned off"))] : [])].join("");
    const newRow = S.mode ? "" : `<button type="button" class="assistant-starter rs-starter rs-new"${P.attrs(act("drawer", "new"))}><span class="mw-avatar rs-add" data-slot="avatar">${ic("plus")}</span><span class="rs-starter__copy"><strong>${L("写一个新角色", "Write a new role")}</strong><span class="assistant-material-origin">${L(" 保存后直接用于这次", " used for this task once saved")}</span></span></button>`;
    const stopNote = stoppedDefault && !S.mode ? alert("warning", L(`本项目默认的${q(R("week"))}已停用`, `This project's default, ${q(R("week"))}, is turned off`), L(`这次由${q(R(mine))}（你的默认）来做。进行中的照常做完。`, `This task goes to ${q(R(mine))} (your default). Running ones finish as they are.`), actions(btn({ size: "sm", label: L("换一个默认", "Pick another default"), attrs: act("mode", "project") }), btn({ variant: "ghost", size: "sm", label: L("重新启用", "Turn it back on"), attrs: act("restart-week") }))) : "";
    const MODE = { project: L("选一个，作为本项目的默认", "Pick one as this project's default"), mine: L("选一个，作为你的默认", "Pick one as your default"), continue: L("「第二期观察」从下一轮起由谁来做", "Who carries “Issue 2 watch” from the next round") };
    const title = S.mode ? `<div class="rs-pop-mode"><p class="assistant-popover-title">${MODE[S.mode]}</p>${btn({ variant: "ghost", size: "sm", label: L("取消", "Cancel"), attrs: act("mode", "") })}</div>` : `<p class="assistant-popover-title">${L("这次由谁来做", "Who does this task")}</p>`;
    const srcText = chosen === null ? L("没有默认角色，由助理自己做", "No default role; the Assistant does it") : personal || stoppedDefault || (!proj && chosen === mine) ? L("来自你的默认", "From your default") : L("来自本项目默认", "From the project default");
    const foot = S.mode ? "" : isOnce
      ? `<div class="rs-pop-foot"><p>${ic("info")}<span>${L("只用于这一次", "Only for this task")}</span></p><div class="q-row">${personal ? "" : btn({ size: "sm", label: L("设为本项目默认", "Make it the project default"), attrs: act("make-default", "project") })}${btn({ variant: "ghost", size: "sm", label: L("设为我的默认", "Make it my default"), attrs: act("make-default", "mine") })}</div></div>`
      : `<div class="rs-pop-foot rs-pop-foot--row"><p>${ic("info")}<span>${srcText}</span></p>${btn({ variant: "link", size: "sm", label: L("改默认", "Change default"), attrs: act("mode", personal || stoppedDefault || (!proj && chosen === mine) ? "mine" : "project") })}</div>`;
    const pop = S.pop ? `<div class="assistant-popover rs-pop${S.mode ? " is-mode" : ""}" id="assistant-characters" role="group" aria-label="${L("这次由谁来做", "Who does this task")}">${title}${stopNote}<div class="rs-opts">${list}</div>${newRow}${foot}</div>` : "";
    const chip = `<button class="assistant-executor" type="button" data-assistant-character${isOnce ? " data-chosen" : ""} aria-haspopup="true" aria-expanded="${S.pop}" aria-controls="assistant-characters" title="${L("这次由谁来做", "Who does this task")}"${P.attrs(act("pop"))}><span data-assistant-character-label>${chosen ? R(chosen) : L("助理", "Assistant")}</span>${ic("chevron-up")}</button>`;
    const center = `<div class="bar-center rs-island" data-assistant-island>${pop}<form class="assistant-composer bar-composer" aria-label="Molis Work Assistant" onsubmit="return false"><span class="assistant-target"><button class="assistant-target-main" type="button" title="${L("下一次发送给哪项工作", "Where the next message goes")}"><span>${L("新工作", "New work")}</span></button></span>${chip}<input class="assistant-composer-input" type="text" autocomplete="off" value="${L("把这周的三篇稿子过一遍", "Go through this week's three drafts")}" aria-label="${L("发给助理", "Message the Assistant")}"><button class="bar-composer-attach" type="button" aria-label="${L("添加文件、引用或能力", "Add files, references or capabilities")}">${ic("plus")}</button>${btn({ variant: "primary", size: "sm", only: true, icon: "send", label: L("发送", "Send"), attrs: act("send") })}</form></div>`;

    const broken = s === "pinned" && !S.done.repicked;
    const running = row({ icon: face(S.done.repicked || "rev"), title: L("第二期观察", "Issue 2 watch"), caption: broken ? L("审稿人 v3 · 它要的「网页读取」已被撤销", "Reviewer v3 · the web reading it needs was revoked") : S.done.repicked ? L(`下一轮起由${R(S.done.repicked)} v${ROLES[S.done.repicked].v} 做 · 前几轮仍记 审稿人 v3`, `${R(S.done.repicked)} v${ROLES[S.done.repicked].v} from the next round · earlier rounds still say Reviewer v3`) : L("审稿人 v3 · 开始时的版本，做完前不换", "Reviewer v3 · the version it started with, kept until done"),
      end: broken ? status("wait", L("停在原处", "Stopped")) + btn({ variant: "primary", size: "sm", label: L("另选角色继续", "Continue with another role"), attrs: act("continue") }) : status("run", L("进行中", "Running")) });
    const done = row({ icon: face("res"), title: L("竞品定价表", "Competitor pricing"), caption: L("研究员 v2", "Researcher v2"), end: status("done") });
    const solo = row({ icon: face("res"), title: L("读书笔记整理", "Reading notes"), caption: L("研究员 v2 · 个人工作", "Researcher v2 · personal work"), end: status("done") });
    const head = personal ? `<div class="land-head"><span class="mw-avatar rs-me" data-slot="avatar">${ic("user")}</span><h1 class="mw-brief__title" id="land-title" tabindex="-1">${L("个人", "Personal")}</h1></div>` : `<div class="land-head">${monogram("A")}<h1 class="mw-brief__title" id="land-title" tabindex="-1">${PROJECT()}</h1></div>`;
    const brief = `<article class="mw-brief" data-slot="brief" aria-labelledby="land-title">${head}
      <div class="mw-brief__cols rs-one"><section class="mw-brief__sec"><h2>${L("最近的工作", "Recent work")}</h2><div class="mw-brief__list">${personal ? solo : running + done}</div></section></div>
      ${broken ? alert("warning", L("不会悄悄换成别的版本", "It won't switch versions on its own"), L("前几轮用 v3 做的记录照旧；另选的角色从下一轮开始。", "Rounds already done with v3 stay as they are; another role takes over from the next round.")) : ""}</article>`;
    return wb(brief, center);
  }

  // ---------- 2 · Project settings › Roles ----------
  function project() {
    const s = S.state, proj = projectDefault(), mine = personalDefault();
    const opts = [["inherit", L(`沿用我的默认（${R(mine)}）`, `Use my default (${R(mine)})`)], ["none", L("助理自己", "The Assistant")], ["rev", R("rev")], ["res", R("res")], ["code", R("code")]];
    let value, state = "";
    if (proj === "week") {
      value = select(L("新任务默认", "Default for new tasks"), [["week", L(`${R("week")}（已停用）`, `${R("week")} (turned off)`)], ...opts], "week", "proj-default");
      state = alert("warning", L(`${q(R("week"))}已停用，新任务现在由${q(R(mine))}（你的默认）来做`, `${q(R("week"))} is turned off; new tasks now go to ${q(R(mine))} (your default)`), L("进行中的照常做完。在上面换一个，或者重新启用它。", "Running ones finish as they are. Pick another above, or turn it back on."), actions(btn({ variant: "ghost", size: "sm", label: L("重新启用", "Turn it back on"), attrs: act("restart-week") })));
    } else if (proj) {
      value = select(L("新任务默认", "Default for new tasks"), opts, proj, "proj-default") + btn({ variant: "ghost", size: "sm", label: L("恢复沿用", "Use my default again"), attrs: act("proj-inherit") });
    } else value = select(L("新任务默认", "Default for new tasks"), opts, "inherit", "proj-default");
    const def = section("rs-default-title", L("默认由谁来做", "Who does it by default"),
      setRow(L("新任务默认", "Default for new tasks"), L("任务里换一个只管那一次，不改这里", "Changing it in a task only affects that task"), value)
      + `<div class="rs-ladder-row">${ladderFor(proj === "week" ? null : proj ? R(proj) : null, R(mine), proj === "week" ? L(`${R("week")}（已停用）`, `${R("week")} (off)`) : "")}</div>` + state);

    const up = s === "upstream";
    const upNote = up && !followed() && !S.done.keepOwn ? alert("warning", L(`你也改了${q(R("rev"))}的做事方式（原件 v5）`, `You also changed the way of working of ${q(R("rev"))} (original v5)`), L("本项目这一节用的是自己的版本，没有跟着变；「能用什么」照常跟随到了 v5。", "This project keeps its own version of that section; “What it can use” followed to v5 as usual."),
      actions(btn({ size: "sm", label: S.diff ? L("收起差异", "Hide the difference") : L("看差异", "See the difference"), attrs: { ...act("diff"), "aria-expanded": String(S.diff) } }), btn({ size: "sm", label: L("改为跟随", "Follow the original"), attrs: act("refollow") }), btn({ variant: "ghost", size: "sm", label: L("保持本项目的", "Keep this project's"), attrs: act("keep-own") }))
        + (S.diff ? inset(diffBox(L("本项目的", "This project's"), L("你的原件 v5", "Your original v5"))) : ""))
      : up && S.done.keepOwn ? alert("success", L("保持本项目的做事方式。原件这一节再改时会再提示。", "Keeping this project's way of working. You'll be told again if that section changes.")) : "";
    const members = [["rev", followed() ? L(`全部跟随你的原件 v${up ? 5 : 4}`, `Follows your original v${up ? 5 : 4}`) : L(`做事方式：本项目改过 · 能用什么：跟随原件 v${up ? 5 : 4}`, `Way of working: changed here · What it can use: follows v${up ? 5 : 4}`), followed() ? setState("neutral", L("跟随", "Following")) : setState("warning", L("改过一节", "One section changed")) + btn({ variant: "ghost", size: "sm", label: L("恢复跟随", "Follow again"), attrs: act("refollow") })],
      ["res", L("全部跟随你的原件 v2", "Follows your original v2"), setState("neutral", L("跟随", "Following"))],
      ...(S.done.addedCode ? [["code", L("全部跟随你的原件 v6 · 刚加入", "Follows your original v6 · just added"), setState("neutral", L("跟随", "Following"))]] : [])];
    const memberRow = ([id, cap, end]) => `<div class="settings-setting-row rs-member${S.done.flash === id ? " is-flash" : ""}"><div class="settings-record-title">${face(id)}<div><h3>${R(id)}</h3><p>${cap}</p></div></div><div class="setting-value">${end}${btn({ size: "sm", label: L("调整", "Adjust"), attrs: act("drawer", id) })}</div></div>`;
    const addPanel = S.add ? inset(`<p class="rs-inset__title">${L("从你的角色里加一个。加入后跟随原件，在这里改了哪一节才变成本项目的。", "Add one of your roles. It follows the original; a section becomes this project's only when you change it here.")}</p>${S.done.addedCode ? `<p class="rs-hint">${L("你的角色都在这个项目里了。", "All your roles are already here.")}</p>` : `<div class="settings-setting-row rs-member"><div class="settings-record-title">${face("code")}<div><h3>${R("code")}</h3><p>${L("v6 · 也用在 官网改版", "v6 · also used in Website redesign")}</p></div></div><div class="setting-value">${btn({ variant: "primary", size: "sm", label: L("加入", "Add"), attrs: act("add-code") })}</div></div>`}<div class="q-row">${btn({ variant: "ghost", size: "sm", icon: "plus", label: L("写一个新角色", "Write a new role"), attrs: act("drawer", "new") })}</div>`, "rs-inset--add") : "";
    const addBtn = btn({ size: "sm", icon: S.add ? "x" : "plus", label: S.add ? L("收起", "Close") : L("添加角色", "Add a role"), attrs: { ...act("add"), "aria-expanded": String(S.add) } });
    const sec = section("rs-members-title", L("本项目的角色", "Roles in this project"), `<p class="rs-hint">${L("项目里的角色默认跟随你的原件：原件出了新版本，新任务就用它。在这里改了哪一节，那一节就成了本项目自己的，随时可以恢复跟随。", "Roles here follow your original by default: when it gets a new version, new tasks use it. Change a section here and that section becomes this project's own; you can go back to following any time.")}</p>${addPanel}${upNote}${members.map(memberRow).join("")}`, addBtn);
    return projectSettings(setHead(L("角色", "Roles"), L("这个项目的任务默认由谁来做，以及项目里能选哪些角色。改这里不影响别的项目，也不改你的默认。", "Who does this project's tasks by default, and which roles can be chosen here. Changes here don't touch other projects or your own default.")) + def + sec);
  }

  // ---------- 3 · The role drawer: opened over whichever page you are on ----------
  function drawer() {
    const id = S.drawer, isNew = id === "new";
    const inProject = S.from === "project" || (S.from === "pick" && S.state !== "personal");
    const own = inProject && id === "rev" && !followed();
    const vNow = id === "rev" ? 4 : isNew ? 0 : ROLES[id].v;
    const dirty = S.dState === "dirty" || S.dState === "conflict";
    const saved = S.dState === "saved";
    const caption = isNew ? L("你的角色 · 还没保存", "Your role · not saved yet")
      : inProject ? (own ? L(`${PROJECT()} · 做事方式本项目改过，其余跟随你的原件 v${vNow}`, `${PROJECT()} · way of working changed here, the rest follows your original v${vNow}`) : L(`${PROJECT()} · 跟随你的原件 v${vNow}`, `${PROJECT()} · follows your original v${vNow}`))
        : L(`你的原件 · v${vNow} · ${id === "rev" ? 3 : 2} 个项目跟随`, `Your original · v${vNow} · followed by ${id === "rev" ? 3 : 2} projects`);
    const head = `<header class="mw-form__header rs-drawer__head"><div class="rs-drawer__title">${isNew ? `<span class="mw-avatar rs-add" data-slot="avatar">${ic("user")}</span>` : face(id)}<div><h2 id="drawer-title">${isNew ? L("新角色", "New role") : R(id)}</h2><p>${caption}</p></div></div>${btn({ variant: "ghost", only: true, icon: "x", label: L("关闭", "Close"), cls: "mw-dialog__close", attrs: act("drawer-close") })}</header>`;

    // Where a save goes: in a project, only this project (default) or your original; from your own list, the original.
    const where = inProject && !isNew ? `<div class="rs-where"><span class="rs-where__k">${L("改到", "Save to")}</span><span class="mw-toggle-group settings-segmented" data-slot="toggle-group" role="group" aria-label="${L("改到哪里", "Where the change goes")}">${[["project", L("只本项目", "This project only")], ["mine", L("我的原件", "My original")]].map(([w, n]) => `<button type="button" class="mw-toggle${S.where === w ? " is-current" : ""}" aria-pressed="${S.where === w}"${P.attrs(act("where", w))}>${n}</button>`).join("")}</span></div>` : "";
    const nv = id === "rev" ? 5 : vNow + 1;
    const impact = isNew ? (S.from === "pick" ? L("保存成 v1，直接用于这次任务；以后在别处也能选", "Saved as v1 and used for this task; choosable elsewhere later") : L("保存成 v1，成为你的角色；各项目都能选", "Saved as v1 as your role; every project can choose it"))
      : inProject ? (S.where === "mine" ? L(`原件成为 v${nv}；跟随它的项目新任务用 v${nv}；进行中的 1 件仍用 v${vNow}`, `Original becomes v${nv}; projects following it use v${nv} for new tasks; 1 running keeps v${vNow}`) : L(`这一节成为本项目自己的 v${nv}；原件和别的项目不变；进行中的 1 件仍用 v${vNow}`, `This section becomes the project's own v${nv}; your original and other projects unchanged; 1 running keeps v${vNow}`))
        : L(`原件成为 v${nv}；跟随它的项目新任务用 v${nv}（${OTHER()}改过这一节，不变）；进行中的仍用 v${vNow}`, `Original becomes v${nv}; following projects use v${nv} for new tasks (${OTHER()} changed this section and keeps it); running ones keep v${vNow}`);

    const savedNote = saved ? alert("success", isNew ? L(`已保存成 v1${S.from === "pick" ? "，这次由它来做" : ""}`, `Saved as v1${S.from === "pick" ? "; it does this task" : ""}`) : inProject && S.where === "project" ? L(`已保存，本项目的做事方式成为 v${nv}`, `Saved; this project's way of working is v${nv}`) : L(`已保存，原件成为 v${nv}`, `Saved; your original is v${nv}`), impact, actions(btn({ size: "sm", label: L("撤销", "Undo"), attrs: act("undo-save") }))) : "";
    const conflict = S.dState === "conflict" ? alert("danger", L(`${inProject ? "本项目的" : "你的"}${q(isNew ? "" : R(id))}刚在另一个窗口改过`, `${inProject ? "This project's" : "Your"} ${q(isNew ? "" : R(id))} was just changed in another window`), L("你的改动还在，没有保存，也没有盖掉那边的。", "Your edits are kept, not saved, and nothing over there was overwritten."),
      actions(btn({ size: "sm", label: S.dDiff ? L("收起差异", "Hide the difference") : L("看差异", "See the difference"), attrs: { ...act("d-diff"), "aria-expanded": String(S.dDiff) } }), btn({ variant: "primary", size: "sm", label: L("在新内容上保留我的改动", "Keep my edits on top of theirs"), attrs: act("merge") }), btn({ variant: "ghost", size: "sm", label: L("丢掉我的改动", "Drop my edits"), attrs: act("reload") }))
        + (S.dDiff ? inset(diffBox(L("那边的", "Theirs"), L("你的", "Yours"))) : "")) : "";

    const wayState = isNew ? "" : inProject ? (own ? setState("warning", L("本项目改过", "Changed here")) + btn({ variant: "ghost", size: "sm", label: L("恢复跟随", "Follow again"), attrs: act("refollow") }) : setState("neutral", L(`跟随原件 v${vNow}`, `Follows original v${vNow}`))) : "";
    const text = S.text !== null ? S.text : isNew ? "" : T(ROLES[id].way);
    const nameField = isNew ? `<label class="rs-field"><span class="rs-field__k">${L("名称", "Name")}</span><input class="mw-input" data-slot="input" data-name value="${esc(S.name)}" placeholder="${L("例如：审稿人", "e.g. Reviewer")}" autocomplete="off"></label>` : "";
    const way = `<section class="rs-dsec" aria-labelledby="d-way"><div class="rs-dsec__head"><h3 id="d-way">${L("做事方式", "Way of working")}</h3>${wayState}</div>${nameField}<label class="rs-field"><span class="mw-sr-only">${L("做事方式", "Way of working")}</span><textarea class="mw-input" data-slot="textarea" data-way rows="6" placeholder="${L("像交代给同事一样写：先做什么、怎样算做完、拿不准时怎么办。", "Write it as you'd brief a colleague: what to do first, what done looks like, what to do when unsure.")}">${esc(text)}</textarea></label></section>`;
    const tools = `<section class="rs-dsec" aria-labelledby="d-tools"><div class="rs-dsec__head"><h3 id="d-tools">${L("能用什么", "What it can use")}</h3>${isNew || !inProject ? "" : setState("neutral", L(`跟随原件 v${vNow}`, `Follows original v${vNow}`))}</div><label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" checked><span>${L("沿用任务选择的能力", "Use what the task allows")}</span></label>${P.note(L("选角色不会给任务加权限，只能在任务允许的范围里再收窄。", "Choosing a role never grants anything; it can only narrow what the task allows."), "shield")}</section>`;
    const versions = isNew ? "" : `<details class="mw-collapsible rs-versions" data-slot="collapsible"${S.hist ? " open" : ""}><summary${P.attrs(act("hist"))}>${L("版本", "Versions")} <span class="rr-fact">${L("3 个", "3")}</span></summary><div class="mw-collapsible__body">${[[`${inProject ? 5 : 4}`, inProject ? L("11-04 · 本项目改了做事方式", "11-04 · way of working changed here") : L("11-02 · 你改了做事方式", "11-02 · you changed the way of working"), true], [`${inProject ? 4 : 3}`, L("11-02 · 进行中的「第二期观察」在用", "11-02 · used by the running “Issue 2 watch”")], [`${inProject ? 3 : 2}`, "10-28"]].map(([v, cap, cur]) => `<div class="rs-ver${S.done.restored === v ? " is-flash" : ""}"><span><strong>v${v}</strong><small>${cap}</small></span>${cur ? setState("success", L("当前", "Current")) : btn({ size: "sm", label: L("恢复成这一版", "Restore this one"), attrs: act("restore", v) })}</div>`).join("")}${P.note(L("恢复会把那一版的内容保存成新的一版；进行中的任务不受影响。", "Restoring saves that version's content as a new version; running tasks are unaffected."), "history")}</div></details>`;
    const canSave = S.dState === "conflict" ? false : isNew ? Boolean(S.name.trim()) && Boolean(text.trim()) : dirty;
    const foot = `<footer class="mw-form__footer rs-drawer__foot">${(dirty || isNew) && !saved ? `<p class="rs-impact">${ic("info")}<span>${impact}</span></p>` : ""}${where && dirty && !saved ? where : ""}<div class="q-row rs-drawer__btns">${btn({ variant: "ghost", size: "sm", label: saved ? L("完成", "Done") : L("关闭", "Close"), attrs: act("drawer-close") })}${saved ? "" : btn({ variant: "primary", size: "sm", label: L("保存并使用", "Save and use"), disabled: !canSave, attrs: { ...act("save-do"), "data-save": "" } })}</div></footer>`;
    return `<form method="dialog" class="mw-form mw-drawer__shell" onsubmit="return false">${head}<div class="mw-form__body mw-scroll">${savedNote}${conflict}${way}${tools}${versions}</div>${foot}</form>`;
  }

  // ---------- 4 · Global settings › Roles (D track co-reviews) ----------
  function lib() {
    const s = S.state, mine = personalDefault();
    if (s === "empty" && !S.done.created) {
      const def = section("rs-mydef-title", L("默认由谁来做", "Who does it by default"), setRow(L("我的默认", "My default"), L("不在项目里的工作，和没有另选的项目", "Personal work, and projects that don't choose their own"), select(L("我的默认", "My default"), [["none", L("助理自己", "The Assistant")]], "none")));
      const empty = `<div class="mw-empty" data-slot="empty"><span class="mw-empty__mark">${ic("user")}</span><h2 tabindex="-1">${L("还没有自己的角色", "No roles of your own yet")}</h2><p>${L("写下你希望 AI 怎样做事；或者从 Codex、Claude Code 等本机 Agent 导入已有的规则。", "Write how you want the AI to work, or import rules you already have from Codex, Claude Code and other local agents.")}</p><div class="mw-empty__actions">${btn({ variant: "primary", size: "sm", icon: "plus", label: L("新建角色", "New role"), attrs: act("drawer", "new") })}${btn({ size: "sm", icon: "upload", label: L("从本机导入", "Import from this Mac"), attrs: act("toast", L("会就地列出本机 Agent 的规则（原型不展开）", "Lists local agents' rules in place (not built)")) })}</div></div>`;
      return globalSettings("roles", setHead(L("角色", "Roles"), L("你写的角色。各个项目怎样用，在 项目设置 › 角色 里定。", "Roles you write. How each project uses them is set in Project settings › Roles.")) + def + section("rs-mine-title", L("我的角色", "My roles"), empty));
    }
    const stopped = S.done.stoppedRev;
    const list = (S.done.created ? [["mine1", L("v1 · 刚写的", "v1 · just written")]] : []).concat([["rev", L("v4 · 3 个项目跟随（1 个改过一节）", "v4 · followed by 3 projects (1 changed a section)")], ["res", L("v2 · 2 个项目跟随", "v2 · followed by 2 projects")], ["code", L("v6 · 1 个项目跟随", "v6 · followed by 1 project")]]);
    const roleRow = ([id, cap]) => {
      const end = id === "rev" && stopped ? setState("warning", L("已停用", "Turned off")) + btn({ variant: "ghost", size: "sm", label: L("重新启用", "Turn back on"), attrs: act("unstop") })
        : id === "rev" && s === "stopped" && !S.stopAsk ? btn({ variant: "ghost", size: "sm", label: L("停用", "Turn off"), attrs: act("stop-ask") }) : "";
      const ask = id === "rev" && S.stopAsk ? inset(`<p class="rs-inset__title">${L(`停用${q(R("rev"))}会怎样`, `What turning off ${q(R("rev"))} does`)}</p>${[[L(`${PROJECT()}的默认`, `${PROJECT()}'s default`), L("新任务改由你的默认（研究员）做", "New tasks go to your default (Researcher)")], [L("进行中的 1 件", "1 running"), L("照常做完", "Finishes as is")], [L("做过的记录和各个版本", "Past records and versions"), L("都留着，可以重新启用", "All kept; you can turn it back on")]].map(([n, e]) => `<div class="rs-fact"><span>${n}</span><span class="rr-fact">${e}</span></div>`).join("")}<div class="q-row rs-inset__end">${btn({ variant: "ghost", size: "sm", label: L("取消", "Cancel"), attrs: act("stop-cancel") })}${btn({ variant: "primary", size: "sm", label: L("停用", "Turn off"), attrs: act("stop-do") })}</div>`, "rs-inset--confirm") : "";
      return `<div class="settings-setting-row rs-member${S.done.flash === id ? " is-flash" : ""}"><div class="settings-record-title">${face(id)}<div><h3>${R(id)}${id === mine ? ` ${badge("neutral", L("我的默认", "My default"))}` : ""}</h3><p>${cap}</p></div></div><div class="setting-value">${end}${btn({ size: "sm", label: L("调整", "Adjust"), attrs: act("drawer", id) })}</div></div>${ask}`;
    };
    const def = section("rs-mydef-title", L("默认由谁来做", "Who does it by default"), setRow(L("我的默认", "My default"), L("不在项目里的工作，和没有另选的项目", "Personal work, and projects that don't choose their own"), select(L("我的默认", "My default"), [["none", L("助理自己", "The Assistant")], ["rev", R("rev")], ["res", R("res")], ["code", R("code")], ...(S.done.created ? [["mine1", R("mine1")]] : [])], mine || "none", "my-default")));
    const mineSec = section("rs-mine-title", L("我的角色", "My roles"), list.map(roleRow).join(""), `<div class="q-row">${btn({ size: "sm", icon: "upload", label: L("从本机导入", "Import"), attrs: act("toast", L("会就地列出本机 Agent 的规则（原型不展开）", "Lists local agents' rules in place (not built)")) })}${btn({ variant: "primary", size: "sm", icon: "plus", label: L("新建", "New"), attrs: act("drawer", "new") })}</div>`);
    const sys = section("rs-sys-title", L("系统与插件带来的角色", "Roles from the system and plugins"), setRow(L("改组成它们的提示词", "Edit the prompts they're made of"), L("从下一轮执行开始生效，随时能恢复默认；它们能做什么仍由系统决定", "Takes effect from the next run and can be reset any time; what they can do is still up to the system"), btn({ size: "sm", label: L("打开提示词", "Open prompts"), attrs: act("toast", L("提示词是另一个设置页（原型不画）", "Prompts is another settings page (not drawn)")) })));
    return globalSettings("roles", setHead(L("角色", "Roles"), L("你写的角色。各个项目怎样用，在 项目设置 › 角色 里定。", "Roles you write. How each project uses them is set in Project settings › Roles.")) + def + mineSec + sys);
  }

  // ---------- Render ----------
  function proto() {
    const t = TOPICS[S.topic];
    document.getElementById("p-title").textContent = L("原型 · 模拟数据", "Prototype · sample data");
    document.getElementById("p-scheme").textContent = L("已定方案 C · 默认跟随，改了才覆盖 · 同页完成", "Chosen: C · follows until changed · all in place");
    document.getElementById("p-topic").textContent = L("画面", "View");
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("p-lang").textContent = L("语言", "Language");
    document.getElementById("p-theme").textContent = L("外观", "Theme");
    document.querySelector("#reset [data-slot=button-label]").textContent = L("从头再来", "Restart");
    const [l, d] = document.querySelectorAll("#theme .mw-toggle"); l.textContent = L("浅", "Light"); d.textContent = L("深", "Dark");
    document.getElementById("topic").innerHTML = Object.entries(TOPICS).map(([k, v]) => `<option value="${k}" ${k === S.topic ? "selected" : ""}>${T(v.name)}</option>`).join("");
    document.getElementById("state").innerHTML = t.states.map(([k, n]) => `<option value="${k}" ${k === S.state ? "selected" : ""}>${T(n)}</option>`).join("");
    const mark = (sel, on) => document.querySelectorAll(sel).forEach((b) => { const yes = on(b); b.setAttribute("aria-pressed", String(yes)); b.classList.toggle("is-current", yes); });
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
    // Keep focus on the control that was used: re-rendering in place must not throw the keyboard back to the top.
    const fa = document.activeElement, focusKey = fa?.dataset?.act ? `[data-act="${fa.dataset.act}"]${fa.dataset.arg ? `[data-arg="${CSS.escape(fa.dataset.arg)}"]` : ""}` : null;
    const view = { pick, project, editor: project, lib }[S.topic]();
    document.getElementById("css-arrival").disabled = view.page === "settings";
    document.getElementById("css-settings").disabled = view.page !== "settings";
    document.body.className = `${BODY[view.page === "settings" ? view.body : "arrival"]} proto-on`;
    app.innerHTML = view.html;
    // The drawer is one element that stays open across renders: only its content changes, so it never re-animates.
    if (S.drawer) { drawerEl.innerHTML = drawer(); if (!drawerEl.open) drawerEl.showModal(); } else if (drawerEl.open) drawerEl.close();
    const key = `${S.topic}|${S.state}`;
    if (key !== lastView && !S.drawer) app.querySelector("h1[tabindex], .mw-empty h2")?.focus({ preventScroll: true });
    else if (focusKey) (S.drawer ? drawerEl : app).querySelector(focusKey)?.focus({ preventScroll: true });
    lastView = key;
    save();
  }
  function reset(patch = {}) { S = forTopic({ ...fresh({ topic: S.topic, state: S.state, lang: S.lang, theme: S.theme }), ...patch }); render(); }
  const flash = (id) => { S.done.flash = id; setTimeout(() => { if (S.done.flash === id) { S.done.flash = null; save(); } }, 900); };

  document.getElementById("topic").addEventListener("change", (e) => reset({ topic: e.target.value, state: TOPICS[e.target.value].states[0][0] }));
  document.getElementById("state").addEventListener("change", (e) => reset({ state: e.target.value }));
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("reset").addEventListener("click", () => reset());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !S.drawer && S.topic === "pick") { if (S.mode) S.mode = null; else S.pop = false; render(); } });
  drawerEl.addEventListener("cancel", (e) => { e.preventDefault(); S.drawer = null; render(); });
  // Typing marks the draft as changed without re-rendering the field being typed in.
  drawerEl.addEventListener("input", (e) => {
    if (e.target.matches("[data-way]")) S.text = e.target.value;
    if (e.target.matches("[data-name]")) S.name = e.target.value;
    if (S.dState === "clean" || S.dState === "saved") S.dState = "dirty";
    const saveBtn = drawerEl.querySelector("[data-save]");
    const ready = S.dState !== "conflict" && (S.drawer !== "new" || (S.name.trim() && (S.text || "").trim()));
    if (saveBtn && ready && (saveBtn.disabled || !drawerEl.querySelector(".rs-impact"))) { saveBtn.disabled = false; if (!drawerEl.querySelector(".rs-impact")) { const field = e.target, at = field.selectionStart; render(); const again = drawerEl.querySelector(field.matches("[data-way]") ? "[data-way]" : "[data-name]"); again?.focus(); again?.setSelectionRange(at, at); return; } }
    if (saveBtn && !ready) saveBtn.disabled = true;
    save();
  });
  app.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-change]");
    if (!sel) return;
    const v = sel.value;
    if (sel.dataset.change === "proj-default") { S.done.projDefault = v === "inherit" ? null : v === "none" ? null : v; toast(v === "inherit" ? L("本项目改为沿用你的默认", "This project uses your default again") : L("本项目的新任务从现在起用它；进行中的不变", "New tasks here use it from now on; running ones are unchanged")); }
    if (sel.dataset.change === "my-default") { S.done.myDefault = v === "none" ? null : v; toast(L("你的默认已改。没有另选的项目，新任务跟着变", "Your default changed. Projects without their own choice follow it for new tasks")); }
    render();
  });
  const onClick = (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    const a = b.dataset.act, arg = b.dataset.arg;
    const A = {
      toast() { toast(arg); },
      pop() { S.pop = !S.pop; S.mode = null; },
      mode() { S.mode = arg || null; },
      choose() {
        const id = arg === "none" ? null : arg;
        if (S.mode === "project") { S.done.projDefault = id; S.mode = null; S.choice = undefined; S.done.settled = true; toast(L(`本项目的新任务默认由${id ? R(id) : "助理自己"}来做`, `New tasks here default to ${id ? R(id) : "the Assistant"}`)); return; }
        if (S.mode === "mine") { S.done.myDefault = id; S.mode = null; S.choice = undefined; S.done.settled = true; toast(L(`你的默认改为${id ? R(id) : "助理自己"}`, `Your default is now ${id ? R(id) : "the Assistant"}`)); return; }
        if (S.mode === "continue") { S.done.repicked = id || "res"; S.mode = null; S.pop = false; toast(L("从下一轮起由它接着做", "It takes over from the next round")); return; }
        S.choice = id;
      },
      "make-default"() {
        const id = S.choice !== undefined ? S.choice : "res";
        if (arg === "project") { S.done.projDefault = id; toast(L(`本项目的新任务默认由${id ? R(id) : "助理自己"}来做`, `New tasks here default to ${id ? R(id) : "the Assistant"}`)); }
        else { S.done.myDefault = id; toast(L(`你的默认改为${id ? R(id) : "助理自己"}；另选了默认的项目不受影响`, `Your default is now ${id ? R(id) : "the Assistant"}; projects with their own choice are unaffected`)); }
        S.choice = undefined; S.done.settled = true;
      },
      send() { S.pop = false; toast(L("已开始。这项工作固定用所选角色当前的版本", "Started. This work keeps the chosen role's current version")); },
      continue() { S.pop = true; S.mode = "continue"; },
      "restart-week"() { S.done.projDefault = "rev"; S.done.settled = true; toast(L("已重新启用（原型：默认换回审稿人演示）", "Turned back on (prototype: default shown as Reviewer)")); },
      "proj-inherit"() { S.done.projDefault = null; toast(L("本项目改为沿用你的默认", "This project uses your default again")); },
      refollow() { S.done.refollow = true; S.diff = false; flash("rev"); toast(L("做事方式恢复跟随原件；本项目改过的内容留在版本里，可以再恢复", "Way of working follows the original again; this project's edit is kept in its versions")); },
      "keep-own"() { S.done.keepOwn = true; S.diff = false; },
      diff() { S.diff = !S.diff; },
      add() { S.add = !S.add; },
      "add-code"() { S.done.addedCode = true; S.add = false; flash("code"); toast(L("代码审查已加入本项目，跟随你的原件", "Code reviewer joined this project, following your original")); },
      drawer() { S.drawer = arg; S.from = S.topic === "lib" ? "lib" : S.topic === "pick" ? "pick" : "project"; S.dState = "clean"; S.text = null; S.name = ""; S.where = "project"; S.hist = false; S.dDiff = false; },
      "drawer-close"() { S.drawer = null; },
      where() { S.where = arg; },
      hist() { S.hist = !S.hist; },
      "d-diff"() { S.dDiff = !S.dDiff; },
      merge() { S.dState = "dirty"; S.dDiff = false; toast(L("已读取那边的新内容，你的改动叠在上面，还没保存", "Loaded theirs with your edits on top; not saved yet")); },
      reload() { S.dState = "clean"; S.text = null; S.dDiff = false; toast(L("已读取新内容", "Loaded the new content")); },
      "save-do"() {
        S.dState = "saved";
        if (S.drawer === "new") { S.done.created = true; if (S.from === "pick") { S.choice = "mine1"; } flash("mine1"); }
        else if (S.drawer === "rev" && S.from !== "lib") S.done.refollow = S.where === "mine"; // saved to the original: this project follows it again
      },
      "undo-save"() { S.dState = "dirty"; toast(L("已撤销：回到保存前的内容，改动还在框里", "Undone: back to the previous content; your edits are still in the box")); },
      restore() { S.done.restored = arg; setTimeout(() => { S.done.restored = null; save(); }, 900); toast(L(`已把 v${arg} 的内容保存成新的一版；进行中的任务不变`, `v${arg}'s content saved as a new version; running tasks unchanged`)); },
      "stop-ask"() { S.stopAsk = true; },
      "stop-cancel"() { S.stopAsk = false; },
      "stop-do"() { S.stopAsk = false; S.done.stoppedRev = true; },
      unstop() { S.done.stoppedRev = false; },
    };
    if (A[a]) { A[a](); if (a !== "toast") render(); }
  };
  app.addEventListener("click", onClick);
  drawerEl.addEventListener("click", onClick);

  render();
  window.protoJump = (p) => { S = forTopic({ ...S, ...p }); render(); };
})();
