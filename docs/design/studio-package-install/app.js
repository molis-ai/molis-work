// 47 · 创作台做的插件怎样安装、升级和恢复 — clickable review prototype (option C, chosen 2026-11-21: the confirmation sits
// inside the studio's Install stage, drawn by Molis Work). Sample data only: nothing is built, signed, installed or read; timers
// stand in for the install. The plugin is 「会议签到」 from the studio main path sample (../plugin-studio-main-path).
//
// The contract behind the layout:
// - The studio only produces an install package signed on this Mac. Whether it is installed, and with which permissions, is
//   confirmed on a region Molis Work itself draws inside the stage (the install sheet). The studio page cannot draw into it,
//   pre-set its switches or press its button.
// - One screen, no scrolling: who made it and where it goes (the sheet's head), what it always needs, what is the person's
//   choice (each a switch, off until switched on, with what being off costs), what it does in the background.
// - Progress and the outcome take the sheet's own place: three steps, then 「装好了」, or what went wrong and that nothing changed.
// - A damaged install is said where the person opens the plugin (decided in batch 25) and put back with one press: the same
//   version with the permissions already agreed asks for no second confirmation.
// Board parts from ../kit: mw-btn, mw-switch, mw-badge, mw-toast, mw-toggle-group, the state ring. Layout in proto.css.
(() => {
  const K = window.mwKit;
  const KEY = "molis-proto.studio-package-install.v2";
  const fresh = () => ({ case: "first", lang: "zh", theme: "light" });
  let S = load() || fresh();
  let P = freshFlow();
  function freshFlow() { return { view: S.case === "damaged" ? "plugin" : "studio", phase: "idle", step: 0, grants: { goals: false, net: false, model: false }, pane: "stage", retried: false }; }
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === 2 ? { ...fresh(), ...v.s } : null; } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 2, s: S })); } catch { /* a preview without storage */ } }
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

  const REQUIRED = () => [
    { icon: "database", tint: "blue", name: L("保存签到记录", "Save check-in records"), note: home() ? L("所有项目共用一份", "One copy for all projects") : L("只留在这个项目", "Stays in this project") },
    { icon: "file", tint: "plain", name: L("读你导入的名单", "Read the list you import"), note: L("只读你选的那份", "Only the file you pick") },
  ];
  const OPTIONAL = () => [
    { id: "goals", icon: "target", tint: "green", name: L("在 Goals 里记缺席", "Note absences in Goals"), on: L("会后自动记一条", "Adds a note after each meeting"), off: L("不开就自己记", "Off: you add it yourself") },
    { id: "net", icon: "globe", tint: "amber", tag: L("联网", "Online"), name: L("联网读会议时间", "Fetch the meeting time"), on: L("只连 calendar.example.com", "Only calendar.example.com"), off: L("不开就手填时间", "Off: you type the time") },
    ...(upgrade() ? [{ id: "model", icon: "sparkles", tint: "accent", tag: L("新", "New"), name: L("用模型归类原因", "Group reasons with a model"), on: L("会用你的模型额度", "Uses your model allowance"), off: L("不开只列原话", "Off: reasons listed as written") }] : []),
  ];
  const granted = () => OPTIONAL().filter((item) => P.grants[item.id]).length;
  const STEPS = () => (restore() ? [L("取回安装包", "Fetch package"), L("装回去", "Put back"), L("启动", "Start")]
    : [L("检查安装包", "Check package"), upgrade() ? L("换上 1.1.0", "Switch to 1.1.0") : home() ? L("装进个人空间", "Install") : L("装进项目", "Install"), L("启动", "Start")]);
  const failsAt = () => (P.retried ? -1 : S.case === "blocked" ? 0 : S.case === "rollback" ? 2 : -1);

  // ---------- board parts ----------
  const btn = (variant, label, attrs = {}, o = {}) => K.renderButton({ variant, size: o.size || "md", label, loading: o.loading, disabled: o.disabled, attrs });
  const badge = (label, tone) => K.renderBadge({ label, tone });
  const ring = (state, size) => K.renderStateRing({ state, size });
  function toast(message, o = {}) {
    const host = document.getElementById("toasts");
    host.innerHTML = K.renderToast({ message, tone: o.error ? "danger" : "success" });
    announce(message);
    clearTimeout(toast.t); toast.t = setTimeout(() => { host.innerHTML = ""; }, o.ms || 2800);
  }

  // ---------- the install sheet: Molis Work's own region inside the stage ----------
  const chip = (icon, text, tone) => `<span class="ps-chip${tone ? " ps-chip--" + tone : ""}">${ic(icon)}<span>${esc(text)}</span></span>`;
  const mark = (icon, tint) => `<span class="ps-mark ps-mark--${tint}" aria-hidden="true">${ic(icon)}</span>`;
  function head() {
    const versions = upgrade() ? `<span class="ps-ver">1.0.0</span><span class="ps-arrow" aria-hidden="true">${ic("arrow")}</span><span class="ps-ver ps-ver--new">1.1.0</span>` : `<span class="ps-ver ps-ver--new">1.0.0</span>`;
    return `<div class="ps-head"><span class="ps-app" aria-hidden="true">${ic("clipboard")}</span>
      <div class="ps-id"><div class="ps-name"><strong>${esc(NAME())}</strong>${versions}</div>
        <div class="ps-chips">${chip("user", L("你做的 · 这台 Mac", "Made by you · this Mac"))}${home() ? chip("home", L("装进个人空间 · 所有项目共用", "Into your personal space · all projects")) : chip("folder", L(`装进「${PROJECT()}」`, `Into “${PROJECT()}”`))}${upgrade() ? chip("check", L("46 条记录都保留", "All 46 records kept"), "green") : ""}</div></div></div>`;
  }
  const band = () => `<div class="ps-band"><span class="ps-band__by">${ic("shield")}<strong>${esc(L("Molis Work 安装确认", "Molis Work install confirmation"))}</strong></span><span class="ps-band__note">${esc(L("这一块创作台改不了", "The studio can't change this part"))}</span></div>`;
  function tiles() {
    const busy = P.phase === "working";
    const need = REQUIRED().map((item) => `<li class="ps-tile ps-tile--fixed">${mark(item.icon, item.tint)}<span class="ps-tile__copy"><strong>${esc(item.name)}</strong><span>${esc(item.note)}</span></span><span class="ps-lock" title="${esc(L("必需", "Required"))}">${ic("lock")}<span class="mw-sr-only">${esc(L("必需", "Required"))}</span></span></li>`).join("");
    const pick = OPTIONAL().map((item) => {
      const on = P.grants[item.id];
      return `<li><label class="ps-tile ps-tile--pick" data-on="${on}">${mark(item.icon, item.tint)}<span class="ps-tile__copy"><strong>${esc(item.name)}${item.tag ? `<em class="ps-tag ps-tag--${item.tint}">${esc(item.tag)}</em>` : ""}</strong><span>${esc(on ? item.on : item.off)}</span></span>
        <span class="mw-switch"><input type="checkbox" role="switch" data-act="grant" data-v="${item.id}"${on ? " checked" : ""}${busy ? " disabled" : ""}><span class="mw-switch__track" aria-hidden="true"></span></span></label></li>`;
    }).join("");
    return `<div class="ps-grid"><section aria-labelledby="ps-need"><h4 id="ps-need">${esc(L("一定要用", "Always needed"))}</h4><ul class="ps-tiles">${need}</ul>
        <p class="ps-strip">${ic("clock")}<span>${esc(L("后台：每周一 9:00 提醒你导入名单", "Background: a Monday 9:00 import reminder"))}</span></p></section>
      <section aria-labelledby="ps-pick"><h4 id="ps-pick">${esc(L("你来决定", "Your choice"))}<span>${esc(L("以后可在设置里改", "Change later in Settings"))}</span></h4><ul class="ps-tiles">${pick}</ul></section></div>`;
  }
  function progress(failed) {
    return `<ol class="ps-steps" aria-label="${esc(L("进度", "Progress"))}">${STEPS().map((name, index) => {
      const state = failed === index ? "failed" : index < P.step || P.phase === "done" ? "done" : index === P.step && P.phase === "working" ? "doing" : "idle";
      return `<li data-state="${state}">${ring(state, 16)}<span>${esc(name)}</span></li>`;
    }).join("")}</ol>`;
  }
  function foot() {
    if (P.phase === "working") return `<div class="ps-foot">${progress(-1)}</div>`;
    const count = OPTIONAL().length;
    return `<div class="ps-foot"><span class="ps-sum" aria-live="polite">${esc(L(`必需 ${REQUIRED().length} 项 · 可选开了 ${granted()}/${count}`, `${REQUIRED().length} required · ${granted()} of ${count} optional on`))}</span>
      <span class="ps-acts">${btn("ghost", upgrade() ? L("先不升级", "Not now") : L("先不装", "Not now"), { "data-act": "later" })}${btn("primary", upgrade() ? L("同意并升级", "Agree and upgrade") : L("同意并安装", "Agree and install"), { "data-act": "confirm", "data-primary": "" })}</span></div>`;
  }
  function outcome() {
    if (P.phase === "done") {
      const off = OPTIONAL().length - granted();
      return `<div class="ps-result ps-result--ok" tabindex="-1" data-focus><span class="ps-result__ring">${ring("done", 44)}</span>
        <h3>${esc(upgrade() ? L("已升级到 1.1.0", "Upgraded to 1.1.0") : L("装好了", "Installed"))}</h3>
        <p>${esc(upgrade() ? L("46 条记录都在，接着用就行。", "All 46 records are there. Carry on.") : home() ? L("每个项目的底栏里都能打开它。", "Open it from the bottom bar of any project.") : L(`在「${PROJECT()}」底栏的插件里打开它。`, `Open it from the plugins in “${PROJECT()}”’s bottom bar.`))}</p>
        <div class="ps-chips ps-chips--center">${chip("shield", L(`必需 ${REQUIRED().length} 项`, `${REQUIRED().length} required`))}${chip("tune", off ? L(`可选还有 ${off} 项没开`, `${off} optional still off`) : L("可选都开了", "All optional on"), off ? "" : "green")}</div>
        <div class="ps-acts">${btn("primary", L(`打开${NAME()}`, `Open ${NAME()}`), { "data-act": "open", "data-primary": "" })}${btn("secondary", L("管理权限", "Manage permissions"), { "data-act": "manage" })}</div></div>`;
    }
    const rollback = S.case === "rollback";
    return `<div class="ps-result ps-result--bad" role="alert" tabindex="-1" data-focus><span class="ps-result__ring">${ring("failed", 44)}</span>
      <h3>${esc(rollback ? L("升级没成功，已回到 1.0.0", "Upgrade failed; back on 1.0.0") : L("没装上", "Not installed"))}</h3>
      <p>${esc(rollback ? L("1.1.0 启动不了。46 条记录没动，1.0.0 照常能用。", "1.1.0 wouldn't start. Your 46 records are untouched and 1.0.0 works as usual.") : L("安装包里少了处理「签到」的代码。什么都没装，数据没动。", "The package is missing the code that handles check-ins. Nothing was installed; no data changed."))}</p>
      ${progress(failsAt())}
      <div class="ps-acts">${btn("primary", L("回构建去修", "Fix it in Build"), { "data-act": "fix", "data-primary": "" })}${btn("secondary", L("再试一次", "Try again"), { "data-act": "again" })}</div></div>`;
  }
  function sheet() {
    const settled = P.phase === "done" || P.phase === "failed";
    return `<section class="ps" data-phase="${P.phase}" aria-label="${esc(L("Molis Work 安装确认", "Molis Work install confirmation"))}">${band()}${head()}${settled ? outcome() : (upgrade() ? `<p class="ps-news">${ic("plus")}<span>${esc(L("1.1.0 新增：会后汇总缺席原因", "New in 1.1.0: absence reasons summed up"))}</span></p>` : "") + tiles() + foot()}</section>`;
  }

  // ---------- the studio (layout decided in batch 03: the conversation on the left, the current stage on the right) ----------
  const STAGES = () => [L("准备", "Prepare"), L("想法", "Idea"), L("方案", "Plan"), L("构建", "Build"), L("试用", "Trial"), L("安装", "Install"), L("使用", "Use"), L("再改", "Revise")];
  function chat() {
    const said = upgrade()
      ? [[0, L("会后帮我汇总大家缺席的原因。", "After a meeting, sum up why people were absent.")], [1, L("加好了，试用 3 个场景都通过。这是 1.1.0，多一项可选权限。", "Added; all 3 trial cases pass. This is 1.1.0, with one more optional permission.")], [1, L("右边由 Molis Work 请你确认，1.0.0 在那之前照常用。", "Molis Work asks you to confirm on the right; 1.0.0 keeps working until then.")]]
      : [[0, L("试用没问题，可以装了。", "The trial looks right. Let's install it.")], [1, L("安装包打好了，在这台 Mac 上签了名。", "The package is ready and signed on this Mac.")], [1, L("装不装、给哪些权限由你定：右边是 Molis Work 的确认，我改不了。", "Whether to install and what to allow is yours to decide: the confirmation on the right is Molis Work's, and I can't change it.")]];
    return `<div class="proto-thread" role="log" aria-label="${L("和创作助理的对话", "Conversation with the studio assistant")}">${said.map(([ai, text]) => `<p class="proto-say${ai ? " is-ai" : ""}">${esc(text)}</p>`).join("")}</div>
      <div class="proto-compose"><input class="mw-input" type="text" placeholder="${L("接着说要改什么…", "Say what to change next…")}" aria-label="${L("给创作助理留言", "Message the studio assistant")}"><button type="button" class="mw-btn mw-btn--secondary mw-btn--md mw-btn--icon" data-slot="button" data-act="noop" aria-label="${L("发送", "Send")}">${ic("send")}</button></div>`;
  }
  function studio() {
    const current = P.phase === "done" ? 6 : 5;
    const steps = STAGES().map((name, index) => `<li${index === current ? ' aria-current="step"' : ""} class="${index < current ? "is-done" : ""}">${index < current ? ic("check") : `<i>${index + 1}</i>`}<span>${esc(name)}</span></li>`).join("");
    const title = upgrade() ? L(`把${NAME()}升到 1.1.0`, `Upgrade ${NAME()} to 1.1.0`) : home() ? L("装进你的个人空间", "Install in your personal space") : L(`装进「${PROJECT()}」`, `Install in “${PROJECT()}”`);
    return `<div class="proto-studio" data-pane="${P.pane}">
      <header class="proto-studio__head"><span class="proto-studio__mark">${ic("wand")}</span><h1>${L("插件创作台", "Plugin studio")} · ${esc(NAME())}</h1>${badge(P.phase === "done" ? (upgrade() ? L("1.1.0 在用", "1.1.0 in use") : L("1.0.0 在用", "1.0.0 in use")) : upgrade() ? L("1.1.0 待装", "1.1.0 to install") : L("1.0.0 待装", "1.0.0 to install"), P.phase === "done" ? "success" : "neutral")}
        <span class="proto-studio__switch mw-toggle-group" data-slot="toggle-group" role="group" aria-label="${L("看对话还是阶段", "Conversation or stage")}">${[["chat", L("对话", "Chat")], ["stage", L("阶段", "Stage")]].map(([v, n]) => `<button type="button" class="mw-toggle" data-slot="toggle" aria-pressed="${P.pane === v}" data-act="pane" data-v="${v}">${n}</button>`).join("")}</span></header>
      <ol class="proto-steps" aria-label="${L("阶段", "Stages")}">${steps}</ol>
      <div class="proto-cols"><aside class="proto-chat">${chat()}</aside><main class="proto-main"><div class="proto-stage"><h2>${esc(title)}</h2>${sheet()}</div></main></div></div>`;
  }

  // ---------- the plugin's own place: a damaged install is said here, by Molis Work, and put back in place ----------
  function pluginPlace() {
    const ok = P.phase === "done" || !restore();
    const rows = [[L("王敏", "Min Wang"), true], [L("李航", "Hang Li"), true], [L("陈晓", "Xiao Chen"), false], [L("赵一", "Yi Zhao"), true]];
    const body = ok
      ? `<div class="proto-plugin__body"><h2>${L("本周例会 · 11 月 23 日", "This week's meeting · Nov 23")}</h2><ul class="proto-names">${rows.map(([n, here]) => `<li><span>${esc(n)}</span>${badge(here ? L("已到", "Here") : L("没到", "Absent"), here ? "success" : "warning")}</li>`).join("")}</ul></div>`
      : `<div class="ps-recover" tabindex="-1" data-focus><section class="ps ps--narrow" data-phase="${P.phase}">${band().replace(esc(L("Molis Work 安装确认", "Molis Work install confirmation")), esc(L("Molis Work", "Molis Work"))).replace(esc(L("这一块创作台改不了", "The studio can't change this part")), "")}
          <div class="ps-result ps-result--warn"><span class="ps-result__ring">${ring(P.phase === "working" ? "doing" : "blocked", 44)}</span>
            <h3>${esc(P.phase === "working" ? L("正在装回 1.0.0", "Putting 1.0.0 back") : L(`${NAME()}暂时打不开`, `${NAME()} can't open right now`))}</h3>
            <p>${esc(L("安装文件坏了，已让它停下。46 条记录还在。", "Its installed files are damaged, so it was stopped. Your 46 records are still there."))}</p>
            <div class="ps-chips ps-chips--center">${chip("database", L("46 条记录都在", "46 records safe"), "green")}${chip("shield", L("权限照原来的", "Permissions unchanged"))}</div>
            ${P.phase === "working" ? progress(-1) : `<div class="ps-acts">${btn("primary", L("装回 1.0.0", "Put 1.0.0 back"), { "data-act": "confirm", "data-primary": "" })}${btn("ghost", L("卸载", "Uninstall"), { "data-act": "noop" })}</div>`}</div></section></div>`;
    return `<div class="proto-plugin"><header class="proto-plugin__head"><span class="proto-studio__mark">${ic("clipboard")}</span><h1>${esc(NAME())}</h1>${ok ? "" : badge(L("暂不可用", "Unavailable"), "warning")}<span class="proto-grow"></span>${btn("ghost", L("在创作台里再改", "Revise in the studio"), { "data-act": "studio" }, { size: "sm" })}</header>${body}</div>`;
  }

  // ---------- the prototype bar ----------
  const CASE_NAMES = { first: ["第一次安装（装进项目）", "First install (into the project)"], home: ["装进个人空间（所有项目共用）", "Into the personal space (shared)"], upgrade: ["升级到 1.1.0（多一项可选权限）", "Upgrade to 1.1.0 (one more optional)"],
    blocked: ["安装没通过（什么都没装）", "Install rejected (nothing installed)"], rollback: ["升级没成功（已回到 1.0.0）", "Upgrade failed (back on 1.0.0)"], damaged: ["安装文件坏了（恢复）", "Installed files damaged (recover)"] };
  function bar() {
    document.getElementById("p-title").textContent = L("47 · 创作台做的插件：安装、升级、恢复", "47 · Studio-made plugins: install, upgrade, recover");
    document.getElementById("p-case").textContent = L("情形", "Case");
    document.getElementById("case").innerHTML = Object.entries(CASE_NAMES).map(([v, n]) => `<option value="${v}"${S.case === v ? " selected" : ""}>${L(...n)}</option>`).join("");
    document.getElementById("lang").innerHTML = [["zh", "中"], ["en", "EN"]].map(([v, n]) => `<button type="button" class="mw-toggle" data-slot="toggle" aria-pressed="${S.lang === v}" data-act="lang" data-v="${v}">${n}</button>`).join("");
    document.getElementById("theme").innerHTML = [["light", L("浅", "Light")], ["dark", L("深", "Dark")]].map(([v, n]) => `<button type="button" class="mw-toggle" data-slot="toggle" aria-pressed="${S.theme === v}" data-act="theme" data-v="${v}">${n}</button>`).join("");
    document.querySelector("#reset [data-slot=button-label]").textContent = L("重来", "Start over");
  }

  // ---------- render ----------
  function render(quiet) {
    document.documentElement.lang = S.lang === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.resolvedTheme = S.theme;
    bar();
    const app = document.getElementById("app");
    app.dataset.view = P.view;
    app.innerHTML = P.view === "plugin" ? pluginPlace() : studio();
    if (!quiet) app.querySelector("[data-focus]")?.focus({ preventScroll: true });
  }
  function advance() {
    if (failsAt() === P.step) {
      P.phase = "failed"; render();
      return announce(S.case === "rollback" ? L("升级没成功，已回到 1.0.0", "Upgrade failed; back on 1.0.0") : L("没装上", "Not installed"));
    }
    P.step += 1;
    if (P.step < 3) { render(true); return later(520, advance); }
    P.phase = "done"; render();
    return restore() ? toast(L("装回来了，46 条记录都在", "It's back, with all 46 records")) : announce(upgrade() ? L("已升级到 1.1.0", "Upgraded to 1.1.0") : L("装好了", "Installed"));
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act]");
    if (!target || target.matches("input")) return;
    if (target.tagName === "A") event.preventDefault();
    const act = target.dataset.act, v = target.dataset.v;
    switch (act) {
      case "lang": S.lang = v; save(); return render(true);
      case "theme": S.theme = v; save(); return render(true);
      case "pane": P.pane = v; return render(true);
      case "confirm": P.phase = "working"; P.step = 0; render(true); return later(520, advance);
      case "again": P.retried = true; P.phase = "idle"; P.step = 0; return render();
      case "later": return toast(L("先放着：安装包留在创作台，随时回来装", "Kept for later: the package stays in the studio"));
      case "fix": return toast(L("回到「构建」，助理接着修（原型只演到这里）", "Back in Build; the assistant carries on fixing (the prototype stops here)"));
      case "manage": return toast(L("打开 设置 › 插件（原型不展开）", "Opens Settings › Plugins (not played out here)"));
      case "studio": P.view = "studio"; return render();
      case "open": P.view = "plugin"; return render();
      case "noop": return toast(L("原型里这一处不展开", "Not played out in this prototype"));
      default: return undefined;
    }
  });
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (target.id === "case") { S.case = target.value; save(); clearTimers(); P = freshFlow(); return render(); }
    if (target.dataset.act === "grant") {
      // Update in place so the switch keeps its transition and the focus stays on it.
      const item = OPTIONAL().find((entry) => entry.id === target.dataset.v), tile = target.closest(".ps-tile");
      P.grants[item.id] = target.checked; tile.dataset.on = String(target.checked);
      tile.querySelector(".ps-tile__copy > span").textContent = target.checked ? item.on : item.off;
      const count = OPTIONAL().length;
      document.querySelector(".ps-sum").textContent = L(`必需 ${REQUIRED().length} 项 · 可选开了 ${granted()}/${count}`, `${REQUIRED().length} required · ${granted()} of ${count} optional on`);
    }
    return undefined;
  });
  document.getElementById("reset").addEventListener("click", () => { clearTimers(); const keep = { lang: S.lang, theme: S.theme }; S = { ...fresh(), ...keep }; save(); P = freshFlow(); render(); });
  // For screenshots only: jump straight to a state.
  window.protoJump = (s, p) => { clearTimers(); S = { ...S, ...s }; P = { ...freshFlow(), ...p }; render(); };
  render();
})();
