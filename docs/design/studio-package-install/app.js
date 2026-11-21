// 47 · 创作台做的插件怎样安装、升级和恢复 — clickable review prototype. Sample data only: nothing is built, signed, installed or
// read; timers stand in for the install. The plugin is 「会议签到」 from the studio main path sample (../plugin-studio-main-path).
//
// What every option shares (the contract, not the layout):
// - The studio only produces an install package signed on this Mac. Whether it is installed, and with which permissions, is
//   confirmed on a surface Molis Work itself draws: the same confirmation as for a package someone else made. The studio page
//   cannot show, pre-tick or press it.
// - The confirmation says, in plain words: who made it, where it is installed (this project, or the personal space every project
//   shares), what it must be allowed to do, what is optional (each a switch, off until switched on), what it keeps doing in the
//   background, and for an upgrade what changed and that the data is kept.
// - A failed install installs nothing; a failed upgrade goes back to the version in use with its data untouched; a damaged
//   install stops the plugin, keeps its data and offers reinstalling the saved package or uninstalling.
// Board parts from ../kit: mw-btn, mw-alert, mw-dialog, mw-switch, mw-toast, mw-empty, mw-badge, mw-toggle-group; the 插件 settings
// page's own rows from ./dist/plugins.css. Layout only in proto.css.
(() => {
  const K = window.mwKit;
  const KEY = "molis-proto.studio-package-install.v1";
  const fresh = () => ({ plan: "A", case: "first", lang: "zh", theme: "light" });
  let S = load() || fresh();
  let P = freshFlow();
  function freshFlow() { return { view: S.case === "damaged" ? "plugin" : "studio", phase: "idle", dialog: null, grants: { goals: false, net: false, model: false }, pane: "stage", retried: false }; }
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === 1 ? { ...fresh(), ...v.s } : null; } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* a preview without storage */ } }
  let timers = [];
  const later = (ms, fn) => { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms); timers.push(t); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; clearTimeout(toast.t); const host = document.getElementById("toasts"); if (host) host.innerHTML = ""; };

  // ---------- words ----------
  const L = (zh, en) => (S.lang === "en" ? en : zh);
  const esc = K.escapeHtml;
  const ic = (name) => K.icon(name);
  const announce = (m) => { document.getElementById("live").textContent = m; };
  const NAME = () => L("会议签到", "Meeting check-in");
  const PROJECT = () => L("团队例会", "Team weekly");
  const upgrade = () => S.case === "upgrade" || S.case === "rollback";
  const home = () => S.case === "home";
  const restore = () => S.case === "damaged";
  const version = () => (upgrade() ? "1.1.0" : "1.0.0");
  const where = () => (home() ? L("你的个人空间", "your personal space") : L(`项目「${PROJECT()}」`, `the project “${PROJECT()}”`));

  // What it asks for, in the person's words. `wide` ones reach out of the project or spend money.
  const REQUIRED = () => [
    ["database", L("保存它自己的签到记录", "Save its own check-in records"), home() ? L("存在个人空间里，所有项目看到的是同一份", "Kept in your personal space; every project sees the same records") : L("只留在这个项目里", "Kept in this project only")],
    ["file", L("读你导入的参会名单", "Read the attendee list you import"), L("只读你选给它的那一份文件", "Only the one file you pick for it")],
  ];
  const OPTIONAL = () => [
    { id: "goals", icon: "target", name: L("在 Goals 里记一条", "Add a note in Goals"), why: L("会后把没到的人记到「团队例会」", "After a meeting, note who was absent under “Team weekly”"), off: L("不开：会后要你自己去 Goals 里记", "Off: you note absences in Goals yourself") },
    { id: "net", icon: "globe", name: L("联网读取会议时间", "Go online for the meeting time"), why: L("只连 calendar.example.com，自动填好这周例会的时间", "Only calendar.example.com, to fill in this week's meeting time"), off: L("不开：时间要你手填", "Off: you type the time in") },
    ...(upgrade() ? [{ id: "model", icon: "sparkles", fresh: true, name: L("用模型整理缺席原因", "Use a model to sum up absence reasons"), why: L("把大家填的原因归成几类；会用到你配置的模型额度", "Groups the reasons people gave; uses your configured model allowance"), off: L("不开：只列出原话，不归类", "Off: reasons are listed as written") }] : []),
  ];
  const granted = () => OPTIONAL().filter((item) => P.grants[item.id]).length;

  // ---------- board parts ----------
  const btn = (variant, label, attrs = {}, o = {}) => K.renderButton({ variant, size: o.size || "md", label, loading: o.loading, disabled: o.disabled, attrs });
  const badge = (label, tone) => K.renderBadge({ label, tone });
  function toast(message, o = {}) {
    const host = document.getElementById("toasts");
    host.innerHTML = K.renderToast({ message, tone: o.error ? "danger" : "success" });
    announce(message);
    clearTimeout(toast.t); toast.t = setTimeout(() => { host.innerHTML = ""; }, o.ms || 2800);
  }
  const switchRow = (item) => `<li class="proto-grant"><span class="proto-grant__mark">${ic(item.icon)}</span><span class="proto-grant__copy"><span>${esc(item.name)}${item.fresh ? " " + badge(L("1.1.0 新要的", "New in 1.1.0"), "info") : ""}</span><span class="settings-muted">${esc(item.why)}</span>${P.grants[item.id] ? "" : `<span class="settings-muted">${esc(item.off)}</span>`}</span>
    <span class="mw-switch"><input type="checkbox" role="switch" aria-label="${esc(item.name)}" data-act="grant" data-v="${item.id}"${P.grants[item.id] ? " checked" : ""}${P.phase === "working" ? " disabled" : ""}><span class="mw-switch__track" aria-hidden="true"></span></span></li>`;
  const factRow = ([icon, head, note]) => `<li class="proto-grant"><span class="proto-grant__mark">${ic(icon)}</span><span class="proto-grant__copy"><span>${esc(head)}</span><span class="settings-muted">${esc(note)}</span></span></li>`;
  const group = (title, rows) => `<div class="plugin-trust-group"><strong>${esc(title)}</strong><ul class="plugin-trust-rows">${rows.join("")}</ul></div>`;

  // The confirmation itself: one body, wherever the option puts it.
  function consent() {
    if (restore()) {
      return `<div class="plugin-trust-review">
        <p class="proto-lead">${esc(L(`用创作台里保存的 1.0.0 安装包重新装一遍。权限照你原来给的，签到记录原样留着。`, `Reinstalls from the 1.0.0 package the studio kept. Permissions stay as you set them and the check-in records stay as they are.`))}</p>
        ${group(L("不会变的", "What stays the same"), [factRow(["database", L("签到记录", "Check-in records"), L("46 条，都在", "46 records, all there")]), factRow(["shield", L("权限", "Permissions"), L("照原来的：必需 2 项，可选开了 1 项", "As before: 2 required, 1 optional switched on")])])}
      </div>`;
    }
    const head = upgrade()
      ? `<p class="proto-lead">${esc(L("现在装着 1.0.0。装上后升级到 1.1.0，原来的 46 条签到记录都保留。", "1.0.0 is installed. This upgrades it to 1.1.0 and keeps all 46 check-in records."))}</p>
         ${group(L("和 1.0.0 相比", "Compared with 1.0.0"), [factRow(["plus", L("新增：会后汇总缺席原因", "New: a summary of absence reasons after a meeting"), L("其余用法不变", "Everything else works as before")]), factRow(["shield", L("多要一项可选权限", "Asks for one more optional permission"), L("下面标着「1.1.0 新要的」，不开也能升级", "Marked “New in 1.1.0” below; the upgrade works without it")])])}`
      : "";
    return `<div class="plugin-trust-review">
      <ul class="proto-facts">
        <li>${ic("user")}<span>${esc(L("谁做的", "Made by"))}</span><strong>${esc(L("你，在这台 Mac 上（本机签名）", "You, on this Mac (signed here)"))}</strong></li>
        <li>${ic(home() ? "home" : "folder")}<span>${esc(L("装在哪里", "Installed in"))}</span><strong>${esc(home() ? L("你的个人空间：所有项目共用同一份", "Your personal space: every project shares it") : L(`项目「${PROJECT()}」：只有这个项目能用`, `The project “${PROJECT()}”: only this project can use it`))}</strong></li>
      </ul>
      ${head}
      ${group(L("它一定要用的", "What it must be allowed to do"), REQUIRED().map(factRow))}
      ${group(L("你可以选的（现在不开，以后也能在 设置 › 插件 里开）", "Your choice (leave off now; switch on later in Settings › Plugins)"), OPTIONAL().map(switchRow))}
      ${group(L("它在后台会做的", "What it keeps doing in the background"), [factRow(["clock", L("每周一 9:00 提醒你导入名单", "Reminds you every Monday 9:00 to import the list"), L("不用额外权限", "Needs no extra permission")])])}
    </div>`;
  }
  const consentTitle = () => (restore() ? L(`重新安装 ${NAME()} 1.0.0？`, `Reinstall ${NAME()} 1.0.0?`) : upgrade() ? L(`把 ${NAME()} 升级到 1.1.0？`, `Upgrade ${NAME()} to 1.1.0?`) : L(`安装 ${NAME()} 1.0.0？`, `Install ${NAME()} 1.0.0?`));
  const consentGo = () => (P.phase === "working" ? (restore() ? L("正在重新安装…", "Reinstalling…") : upgrade() ? L("正在升级…", "Upgrading…") : L("正在安装…", "Installing…")) : restore() ? L("重新安装", "Reinstall") : upgrade() ? L("同意并升级", "Agree and upgrade") : L("同意并安装", "Agree and install"));
  const consentActions = (size) => `${btn("secondary", L("取消", "Cancel"), { "data-act": "cancel" }, { size, disabled: P.phase === "working" })}${btn("primary", consentGo(), { "data-act": "confirm", "data-primary": "" }, { size, loading: P.phase === "working" })}`;

  // ---------- results (the same words in every option) ----------
  function doneAlert(back) {
    const off = OPTIONAL().length - granted();
    const title = restore() ? L(`${NAME()} 已恢复`, `${NAME()} is back`) : upgrade() ? L(`已升级到 1.1.0`, `Upgraded to 1.1.0`) : L(`已装进${where()}`, `Installed in ${where()}`);
    const body = restore() ? L("46 条签到记录都在，权限照原来的。", "All 46 check-in records are there; permissions are as before.")
      : `${upgrade() ? L("46 条签到记录都在。", "All 46 check-in records are there. ") : L("在底栏的插件里打开它。", "Open it from the plugins in the bottom bar. ")}${off ? L(`有 ${off} 项可选权限没开，相关功能先不可用，随时可以在 设置 › 插件 里打开。`, `${off} optional permission${off === 1 ? " is" : "s are"} off, so those features wait; switch them on any time in Settings › Plugins.`) : ""}`;
    return K.renderAlert({ tone: "success", state: "done", rise: true, title, body, attrs: { tabindex: "-1", "data-focus": "" },
      actions: [{ variant: "primary", label: L(`打开${NAME()}`, `Open ${NAME()}`), attrs: { "data-act": "open" } }, ...(back ? [{ variant: "secondary", label: L("回到创作台", "Back to the studio"), attrs: { "data-act": "studio" } }] : [{ variant: "ghost", label: L("去设置里管理", "Manage in Settings"), attrs: { "data-act": "settings" } }])] });
  }
  function failAlert(back) {
    const rollback = S.case === "rollback";
    const title = rollback ? L("升级没成功，已回到 1.0.0", "The upgrade didn't work; you're back on 1.0.0") : L("没装上：安装包没通过检查", "Not installed: the package didn't pass its check");
    const body = rollback ? L("1.1.0 装上后启动不了，Molis Work 把它换回了 1.0.0。你的 46 条签到记录没有动，1.0.0 照常能用。", "1.1.0 wouldn't start after it was installed, so Molis Work put 1.0.0 back. Your 46 check-in records weren't touched and 1.0.0 works as usual.")
      : L("包里说它能「签到」，但找不到处理签到的那段代码。什么都没装上，也没有改动任何数据。", "The package says it can “check in”, but the code that handles check-ins is missing. Nothing was installed and no data changed.");
    return K.renderAlert({ tone: "danger", role: "alert", rise: true, title, body, attrs: { tabindex: "-1", "data-focus": "" },
      actions: [{ variant: "primary", label: back ? L("回创作台去修", "Fix it in the studio") : L("回到构建去修", "Go back to Build and fix it"), attrs: { "data-act": "fix" } }, { variant: "secondary", label: L("再试一次", "Try again"), attrs: { "data-act": "again" } }] });
  }

  // ---------- the studio (layout decided in batch 03: the conversation on the left, the current stage on the right) ----------
  const STAGES = () => [L("准备", "Prepare"), L("想法", "Idea"), L("方案", "Plan"), L("构建", "Build"), L("试用", "Trial"), L("安装", "Install"), L("使用", "Use"), L("再改", "Revise")];
  function chat() {
    const said = restore()
      ? [[1, L("会议签到的安装文件坏了，它已经停下。我这里还留着 1.0.0 的安装包，可以原样装回去。", "Meeting check-in's installed files are damaged and it has stopped. I still have the 1.0.0 package and can put it back as it was.")]]
      : upgrade()
        ? [[0, L("会后帮我汇总一下大家缺席的原因。", "After a meeting, sum up why people were absent.")], [1, L("加好了，试用里 3 个场景都通过。这是 1.1.0：比 1.0.0 多一项可选权限（用模型归类原因）。", "Added; all 3 trial cases pass. This is 1.1.0: one more optional permission than 1.0.0 (a model to group the reasons).")], [1, L("1.0.0 现在照常在用。要换成 1.1.0，由 Molis Work 让你确认一次。", "1.0.0 keeps working for now. Switching to 1.1.0 is confirmed once with Molis Work.")]]
        : [[0, L("试用没问题，可以装了。", "The trial looks right. Let's install it.")], [1, L(`好。我把它打成了一份安装包，在这台 Mac 上签了名，要装进${where()}。`, `Done. I've made it into an install package, signed on this Mac, to go into ${where()}.`)], [1, L("装不装、给它哪些权限，不由我决定：Molis Work 会让你自己确认，和装别人做的插件是同一个确认。", "Whether to install it, and with which permissions, isn't mine to decide: Molis Work asks you directly, with the same confirmation as for anyone else's plugin.")]];
    return `<div class="proto-thread" role="log" aria-label="${L("和创作助理的对话", "Conversation with the studio assistant")}">${said.map(([ai, text]) => `<p class="proto-say${ai ? " is-ai" : ""}">${esc(text)}</p>`).join("")}</div>
      <div class="proto-compose"><input class="mw-input" type="text" placeholder="${L("接着说要改什么…", "Say what to change next…")}" aria-label="${L("给创作助理留言", "Message the studio assistant")}"><button type="button" class="mw-btn mw-btn--secondary mw-btn--md mw-btn--icon" data-slot="button" data-act="noop" aria-label="${L("发送", "Send")}">${ic("send")}</button></div>`;
  }
  function packageCard() {
    const rows = [
      [L("来自", "From"), L("这台 Mac（你做的）", "This Mac (made by you)")],
      [L("要装到", "Goes into"), home() ? L("你的个人空间", "Your personal space") : L(`项目「${PROJECT()}」`, `Project “${PROJECT()}”`)],
      [L("检查", "Checks"), L("自查 12 项、界面验收 3 项都通过", "12 self-checks and 3 screen checks passed")],
    ];
    return `<section class="proto-package" aria-label="${L("安装包", "Install package")}"><header>${ic("package")}<strong>${esc(NAME())} · ${version()}</strong>${upgrade() ? badge(L("现在用的是 1.0.0", "1.0.0 in use"), "neutral") : ""}</header>
      <dl>${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`;
  }
  function stage() {
    const title = restore() ? L(`把 ${NAME()} 装回去`, `Put ${NAME()} back`) : upgrade() ? L("升级到 1.1.0", "Upgrade to 1.1.0") : home() ? L("装进你的个人空间", "Install in your personal space") : L(`装进项目「${PROJECT()}」`, `Install in “${PROJECT()}”`);
    const lead = restore() ? L("安装文件坏了，数据没坏。装回去以后和原来一样。", "The installed files are damaged; the data isn't. Once it's back, it works as before.")
      : L("创作台只负责打好安装包。装不装、给哪些权限，由 Molis Work 让你确认。", "The studio only makes the package. Molis Work asks you whether to install it and with which permissions.");
    let body;
    if (P.phase === "done") body = doneAlert(false);
    else if (P.phase === "failed") body = failAlert(false) + packageCard();
    else if (S.plan === "C") {
      body = `${packageCard()}<section class="proto-trusted" aria-labelledby="trusted-title"><header><span class="proto-trusted__by">${ic("shield")}${esc(L("这一块由 Molis Work 显示，创作台改不了", "Shown by Molis Work; the studio can't change this part"))}</span><h3 id="trusted-title">${esc(consentTitle())}</h3></header>
        ${consent()}<div class="plugin-trust-actions">${consentActions("md")}</div></section>`;
    } else {
      const go = S.plan === "A" ? (restore() ? L("重新安装…", "Reinstall…") : upgrade() ? L("升级…", "Upgrade…") : L("安装…", "Install…")) : L("去 设置 › 插件 确认", "Confirm in Settings › Plugins");
      const hint = S.plan === "A" ? L("点了以后 Molis Work 会弹出确认，列出它能做的每件事。", "Molis Work then opens its confirmation, listing everything the plugin may do.") : L("会打开项目设置的「插件」页，在那里确认；装好后可以一键回来。", "Opens the Plugins page of project settings to confirm there; one click brings you back.");
      body = `${packageCard()}<div class="proto-go">${btn("primary", go, { "data-act": "review", "data-primary": "" })}<span class="settings-muted">${esc(hint)}</span></div>`;
    }
    return `<div class="proto-stage"><h2>${esc(title)}</h2><p class="proto-lead">${esc(lead)}</p>${body}</div>`;
  }
  function studio() {
    const current = upgrade() || restore() ? 7 : 5;
    const steps = STAGES().map((name, index) => `<li${index === current ? ' aria-current="step"' : ""} class="${index < current ? "is-done" : ""}">${index < current ? ic("check") : `<i>${index + 1}</i>`}<span>${esc(name)}</span></li>`).join("");
    return `<div class="proto-studio" data-pane="${P.pane}">
      <header class="proto-studio__head"><span class="proto-studio__mark">${ic("wand")}</span><h1>${L("插件创作台", "Plugin studio")} · ${esc(NAME())}</h1>${badge(upgrade() ? L("1.1.0 草稿", "1.1.0 draft") : restore() ? L("1.0.0 已装（停下了）", "1.0.0 installed (stopped)") : L("1.0.0 待装", "1.0.0 to install"), restore() ? "warning" : "neutral")}
        <span class="proto-studio__switch mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${L("看对话还是阶段", "Conversation or stage")}">${[["chat", L("对话", "Chat")], ["stage", L("阶段", "Stage")]].map(([v, n]) => `<button type="button" class="mw-toggle" data-slot="toggle" aria-pressed="${P.pane === v}" data-act="pane" data-v="${v}">${n}</button>`).join("")}</span></header>
      <ol class="proto-steps" aria-label="${L("阶段", "Stages")}">${steps}</ol>
      <div class="proto-cols"><aside class="proto-chat">${chat()}</aside><main class="proto-main">${stage()}</main></div></div>`;
  }

  // ---------- 设置 › 插件 (option B, and where every option manages it afterwards) ----------
  const chevron = `<span class="settings-advanced-chevron" aria-hidden="true">${ic("chevron-down")}</span>`;
  function settingsPage(content) {
    const nav = [
      [L("项目", "Project")], ["info", L("概况", "Overview")], ["package", L("插件", "Plugins"), true], ["user", L("角色", "Characters")], ["folder", L("目录", "Folders")],
      [L("本机", "This Mac")], ["sun", L("界面与语言", "Interface & language")], ["link", L("服务连接", "Service connections")],
    ];
    return `<div class="proto-settings settings-page project-preferences-page"><header class="project-preferences-chrome"><span>${L("项目设置", "Project settings")}</span><a href="#" data-act="studio" aria-label="${L("关闭设置", "Close settings")}">${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex" aria-label="${L("设置", "Settings")}"><a class="settings-nav-back" href="#" data-act="studio">${ic("arrow")} ${L("返回项目", "Back to project")}</a><div class="settings-nav-body">${nav.map((n) => (n.length === 1 ? `<div class="settings-nav-group-label">${n[0]}</div>` : `<a href="#" data-act="noop"${n[2] ? ' aria-current="page"' : ""}>${ic(n[0])}<span>${n[1]}</span></a>`)).join("")}</div></nav>
      <div class="settings-content">${content}</div></main></div>`;
  }
  function installedRow() {
    const has = restore() || upgrade() || (P.phase === "done" && !home());
    if (!has) return "";
    const v = P.phase === "done" && upgrade() ? "1.1.0" : P.phase === "done" || !upgrade() ? version() : "1.0.0";
    const broken = restore() && P.phase !== "done";
    const state = broken ? L("停下了", "Stopped") : L("运行中", "Running");
    const extra = broken
      ? `<span class="settings-form-error">${esc(L("它的安装文件损坏了，已经停下。签到记录还在。", "Its installed files are damaged and it has stopped. The check-in records are still there."))}</span>
         <div class="plugin-trust-actions">${btn("primary", L("重新安装 1.0.0", "Reinstall 1.0.0"), { "data-act": "review" }, { size: "sm" })}${btn("ghost", L("卸载并保留数据", "Uninstall, keep data"), { "data-act": "noop" }, { size: "sm" })}${btn("ghost", L("卸载并删除数据", "Uninstall, delete data"), { "data-act": "noop" }, { size: "sm" })}</div>`
      : `<div class="plugin-trust-actions">${btn("secondary", L("停用", "Turn off"), { "data-act": "noop" }, { size: "sm" })}${btn("ghost", L("卸载并保留数据", "Uninstall, keep data"), { "data-act": "noop" }, { size: "sm" })}${btn("ghost", L("卸载并删除数据", "Uninstall, delete data"), { "data-act": "noop" }, { size: "sm" })}</div>`;
    return `<li><details class="settings-advanced plugin-trust-item"${broken || P.phase === "done" ? " open" : ""}><summary><span class="setting-copy"><strong>${esc(NAME())} · ${v}</strong><span>${L("你在这台 Mac 上做的", "Made by you on this Mac")} · ${state}</span></span>${chevron}</summary>
      <div class="plugin-trust-body">${extra}</div></details></li>`;
  }
  function settings() {
    const reviewing = P.phase === "review" || P.phase === "working";
    const handoff = reviewing
      ? `<div class="plugin-trust-preview" tabindex="-1" data-focus><div class="plugin-trust-review"><span class="settings-muted">${ic("wand")} ${esc(L("从插件创作台送来", "Sent from the plugin studio"))}</span><h3>${esc(consentTitle())}</h3></div>${consent()}<div class="plugin-trust-actions">${consentActions("md")}</div></div>`
      : P.phase === "done" ? doneAlert(true) : P.phase === "failed" ? failAlert(true) : "";
    const homeList = home() && P.phase === "done"
      ? `<li><details class="settings-advanced plugin-trust-item" open><summary><span class="setting-copy"><strong>${esc(NAME())} · 1.0.0</strong><span>${L("你在这台 Mac 上做的", "Made by you on this Mac")} · ${L("运行中", "Running")}</span></span>${chevron}</summary></details></li>`
      : `<li class="settings-muted">${L("个人空间里没有插件", "No plugins in your personal space")}</li>`;
    return settingsPage(`<section class="settings-document plugin-trust-settings" aria-labelledby="plugin-trust-title">
      <header class="settings-page-heading"><h1 id="plugin-trust-title">${L("插件", "Plugins")}</h1><p>${L("这个项目里装着的插件：谁签的名、要了哪些权限、在后台做什么，以及你给过它们的同意。", "The plugins installed in this project: who signed them, the permissions they asked for, what they do in the background, and what you've agreed to.")}</p></header>
      <section class="settings-section" aria-labelledby="t-install"><h2 id="t-install">${L("安装插件", "Install a plugin")}</h2>
        <p class="settings-muted">${L("选一个安装包，或者接着确认从别处送来的安装。", "Choose a package, or finish confirming one sent from elsewhere.")}</p>
        <div class="plugin-trust-actions proto-start">${btn("secondary", L("选择安装包…", "Choose a package…"), { "data-act": "noop" }, { size: "sm" })}</div>${handoff}</section>
      <section class="settings-section" aria-labelledby="t-installed"><h2 id="t-installed">${L("已安装的插件", "Installed plugins")}</h2><ul class="plugin-trust-list"><li><details class="settings-advanced plugin-trust-item"><summary><span class="setting-copy"><strong>Goals · 3.4.0</strong><span>${L("随 Molis Work 提供 · 运行中", "Comes with Molis Work · Running")}</span></span>${chevron}</summary></details></li>${installedRow()}</ul></section>
      <section class="settings-section" aria-labelledby="t-home"><h2 id="t-home">${L("个人空间里的插件", "Plugins in your personal space")}</h2><ul class="plugin-trust-list">${homeList}</ul></section>
    </section>`);
  }

  // ---------- the plugin's own place (a damaged install is said where the person meets it: decided in batch 25) ----------
  function pluginPlace() {
    const ok = P.phase === "done" || !restore();
    const rows = [[L("王敏", "Min Wang"), true], [L("李航", "Hang Li"), true], [L("陈晓", "Xiao Chen"), false], [L("赵一", "Yi Zhao"), true]];
    const body = ok
      ? `<div class="proto-plugin__body"><h2>${L("本周例会 · 11 月 23 日", "This week's meeting · Nov 23")}</h2><ul class="proto-names">${rows.map(([n, here]) => `<li><span>${esc(n)}</span>${badge(here ? L("已到", "Here") : L("没到", "Absent"), here ? "success" : "warning")}</li>`).join("")}</ul></div>`
      : K.renderEmpty({ icon: "circle-alert", title: L(`${NAME()}暂时打不开`, `${NAME()} can't open right now`), body: L("它的安装文件损坏了，Molis Work 已经让它停下。你的 46 条签到记录还在，没有丢。", "Its installed files are damaged, so Molis Work has stopped it. Your 46 check-in records are still there."),
        action: `<div class="proto-empty-actions">${btn("primary", L("重新安装 1.0.0…", "Reinstall 1.0.0…"), { "data-act": "review", "data-primary": "" })}${btn("secondary", L("卸载…", "Uninstall…"), { "data-act": "settings" })}</div>` });
    return `<div class="proto-plugin"><header class="proto-plugin__head"><span class="proto-studio__mark">${ic("clipboard")}</span><h1>${esc(NAME())}</h1>${ok ? "" : badge(L("暂不可用", "Unavailable"), "warning")}<span class="proto-grow"></span>${btn("ghost", L("在创作台里再改", "Revise in the studio"), { "data-act": "studio" }, { size: "sm" })}</header>${body}</div>`;
  }

  // ---------- option A: Molis Work's own dialog over the studio ----------
  function dialog() {
    if (P.dialog !== "consent") return "";
    return `<dialog class="mw-dialog proto-consent" data-slot="dialog" aria-labelledby="d-title"><form class="mw-form mw-dialog__shell" method="dialog">
      <header class="mw-form__header"><div><h2 id="d-title">${esc(consentTitle())}</h2><p>${esc(L("Molis Work 的安装确认。下面是它能做的每一件事。", "Molis Work's install confirmation. This is everything it may do."))}</p></div></header>
      <div class="mw-form__body plugin-trust-settings">${consent()}</div>
      <footer class="mw-form__footer">${consentActions("md")}</footer></form></dialog>`;
  }

  // ---------- the prototype bar ----------
  const PLANS = { A: ["A 就地弹出确认（推荐）", "A Confirm in place (recommended)"], B: ["B 去 设置 › 插件 确认", "B Confirm in Settings › Plugins"], C: ["C 确认嵌在安装阶段里", "C Confirmation inside the Install stage"] };
  const CASE_NAMES = { first: ["第一次安装（装进项目）", "First install (into the project)"], home: ["装进个人空间（所有项目共用）", "Into the personal space (shared)"], upgrade: ["升级到 1.1.0（多一项可选权限）", "Upgrade to 1.1.0 (one more optional)"],
    blocked: ["安装没通过（什么都没装）", "Install rejected (nothing installed)"], rollback: ["升级没成功（已回到 1.0.0）", "Upgrade failed (back on 1.0.0)"], damaged: ["安装文件坏了（恢复）", "Installed files damaged (recover)"] };
  const NOTES = {
    A: ["点「安装…」后，Molis Work 在创作台上弹出自己的确认框（和 设置 › 插件 里是同一份内容），确认完留在创作台看回执。好处：不离开正在做的事，一步到位；确认框是外壳的，创作台动不了它。代价：内容多时框里要滚动，手机上占满一屏。",
      "Install… opens Molis Work's own confirmation over the studio (the same content as Settings › Plugins); afterwards you stay in the studio with the receipt. Good: you don't leave what you're doing; the dialog is the shell's, out of the studio's reach. Cost: a long confirmation scrolls inside the dialog and fills a phone screen."],
    B: ["点了以后打开 设置 › 插件，在那里确认，装好后一键回创作台。好处：和从文件安装是同一个地方，不新增任何界面。代价：要离开创作台再回来，来回两次跳转；出错时要回创作台才能修。",
      "Opens Settings › Plugins and confirms there; one click returns to the studio. Good: the same place as installing from a file, no new surface. Cost: you leave the studio and come back, two jumps; a failure is fixed back in the studio."],
    C: ["确认直接摆在安装阶段里，标着「由 Molis Work 显示」。好处：不弹框、不跳转，地方最大。代价：这一块和创作台自己的内容挨在一起，只靠一行标记区分谁画的；要为插件页面里嵌一块外壳区域新做一套机制。",
      "The confirmation sits inside the Install stage, marked “Shown by Molis Work”. Good: no dialog, no jump, the most room. Cost: it sits right next to the studio's own content with only a label to tell who draws it, and embedding a shell region in a plugin page needs a new mechanism."],
  };
  function bar() {
    document.getElementById("p-title").textContent = L("47 · 创作台做的插件：安装、升级、恢复", "47 · Studio-made plugins: install, upgrade, recover");
    document.getElementById("p-plan").textContent = L("方案", "Option");
    document.getElementById("p-case").textContent = L("情形", "Case");
    document.getElementById("plan").innerHTML = Object.entries(PLANS).map(([v, n]) => `<option value="${v}"${S.plan === v ? " selected" : ""}>${L(...n)}</option>`).join("");
    document.getElementById("case").innerHTML = Object.entries(CASE_NAMES).map(([v, n]) => `<option value="${v}"${S.case === v ? " selected" : ""}>${L(...n)}</option>`).join("");
    document.getElementById("lang").innerHTML = [["zh", "中"], ["en", "EN"]].map(([v, n]) => `<button type="button" class="mw-toggle" data-slot="toggle" aria-pressed="${S.lang === v}" data-act="lang" data-v="${v}">${n}</button>`).join("");
    document.getElementById("theme").innerHTML = [["light", L("浅", "Light")], ["dark", L("深", "Dark")]].map(([v, n]) => `<button type="button" class="mw-toggle" data-slot="toggle" aria-pressed="${S.theme === v}" data-act="theme" data-v="${v}">${n}</button>`).join("");
    document.querySelector("#reset [data-slot=button-label]").textContent = L("重来", "Start over");
    document.getElementById("note").textContent = L(...NOTES[S.plan]);
  }

  // ---------- render ----------
  function render(keepScroll) {
    document.documentElement.lang = S.lang === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.resolvedTheme = S.theme;
    bar();
    const app = document.getElementById("app");
    const scroller = app.querySelector("dialog .mw-form__body, .proto-main, .settings-content");
    const top = keepScroll && scroller ? scroller.scrollTop : 0;
    app.dataset.view = P.view;
    app.innerHTML = (P.view === "settings" ? settings() : P.view === "plugin" ? pluginPlace() : studio()) + dialog();
    const open = app.querySelector("dialog");
    if (open) open.showModal();
    if (keepScroll) { const next = app.querySelector("dialog .mw-form__body, .proto-main, .settings-content"); if (next) next.scrollTop = top; return; }
    if (open) (open.querySelector("[data-primary]:not(:disabled)") || open.querySelector("button:not(:disabled)"))?.focus();
    else { const target = app.querySelector("[data-focus]"); if (target) { target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest" }); } }
  }

  function finish() {
    const fails = (S.case === "blocked" || S.case === "rollback") && !P.retried;
    P.phase = fails ? "failed" : "done"; P.dialog = null;
    if (restore() && P.phase === "done" && S.plan !== "B") P.view = "plugin";
    render();
    const said = P.phase === "failed" ? (S.case === "rollback" ? L("升级没成功，已回到 1.0.0", "The upgrade didn't work; back on 1.0.0") : L("没装上", "Not installed")) : restore() ? L(`${NAME()} 已恢复`, `${NAME()} is back`) : upgrade() ? L("已升级到 1.1.0", "Upgraded to 1.1.0") : L("已安装", "Installed");
    if (P.phase === "done") toast(said); else announce(said);
  }
  function review() {
    P.phase = "review";
    if (S.plan === "A") P.dialog = "consent";
    else if (S.plan === "B") P.view = "settings";
    else P.view = "studio";
    P.pane = "stage"; render();
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act]");
    if (!target || target.matches("input")) return;
    if (target.tagName === "A") event.preventDefault();
    const act = target.dataset.act, v = target.dataset.v;
    switch (act) {
      case "lang": S.lang = v; save(); return render(true);
      case "theme": S.theme = v; save(); return render(true);
      case "pane": P.pane = v; return render();
      case "review": return review();
      case "cancel": P.phase = "idle"; P.dialog = null; if (S.plan === "B") P.view = restore() ? "settings" : "studio"; return render();
      case "confirm": event.preventDefault(); P.phase = "working"; render(true); return later(1300, finish);
      case "again": P.retried = true; P.phase = "idle"; return review();
      case "fix": P.phase = "idle"; P.view = "studio"; render(); return toast(L("回到了创作台的「构建」，助理会接着修（原型只演到这里）", "Back in the studio's Build stage; the assistant carries on fixing (the prototype stops here)"));
      case "studio": P.view = "studio"; if (P.phase !== "done" && P.phase !== "failed") P.phase = S.plan === "C" && restore() ? "review" : "idle"; return render();
      case "settings": P.view = "settings"; return render();
      case "open": P.view = "plugin"; return render();
      case "noop": return toast(L("原型里这一处不展开", "Not played out in this prototype"));
      default: return undefined;
    }
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "plan") { S.plan = target.value; save(); clearTimers(); P = freshFlow(); return render(); }
    if (target.id === "case") { S.case = target.value; save(); clearTimers(); P = freshFlow(); return render(); }
    if (target.dataset.act === "grant") { P.grants[target.dataset.v] = target.checked; render(true); document.querySelector(`[data-act=grant][data-v=${target.dataset.v}]`)?.focus(); }
    return undefined;
  });
  document.addEventListener("cancel", (event) => { if (event.target.matches?.("dialog")) { event.preventDefault(); if (P.phase !== "working") { P.phase = "idle"; P.dialog = null; render(); } } }, true);
  document.getElementById("reset").addEventListener("click", () => { clearTimers(); const keep = { lang: S.lang, theme: S.theme }; S = { ...fresh(), ...keep }; save(); P = freshFlow(); render(); });
  // For screenshots only: jump straight to a state.
  window.protoJump = (s, p) => { clearTimers(); S = { ...S, ...s }; P = { ...freshFlow(), ...p }; render(); };
  render();
})();
