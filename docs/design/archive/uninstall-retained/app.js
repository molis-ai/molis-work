// 27 · 卸载后留下的项目（BL-915）— clickable review prototype. Sample data only: nothing is installed, read or deleted; a timer
// stands in for the uninstall. Drawn on the real 插件 settings page (settings-shell, settings-section, the 插件 page's folds,
// rows and action row from ./dist/plugins.css) with board parts from ../kit: mw-btn (with its loading ring), mw-alert, the alert
// dialog (mw-dialog--alert, as the page's own `ask`), mw-dialog, mw-toast with an action, settings-form-error.
//
// What every option shares (the contract, not the layout):
// - The uninstall answers `retained` only when something stayed behind; nothing kept is the plain 「已卸载」 the page shows today.
// - One row per kind of thing kept, with the reason in the person's words; no path, id, reference or secret.
// - A clean-up that did not finish keeps the row, stopped, with 「重试卸载」 under its first choice (B27-UN-04).
(() => {
  const K = window.mwKit;
  const KEY = "molis-proto.uninstall-retained.v1";
  const fresh = () => ({ plan: "A", case: "kept", lang: "zh", theme: "light" });
  let S = load() || fresh();
  let P = freshFlow();
  function freshFlow() { return { phase: "idle", dialog: null, retry: false, dismissed: false }; }
  function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return v && v.v === 1 ? { ...fresh(), ...v.s } : null; } catch { return null; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* a preview without storage */ } }
  let timers = [];
  const later = (ms, fn) => { const t = setTimeout(() => { timers = timers.filter((x) => x !== t); fn(); }, ms); timers.push(t); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- words ----------
  const L = (zh, en) => (S.lang === "en" ? en : zh);
  const esc = K.escapeHtml;
  const ic = (name) => K.icon(name);
  const announce = (m) => { document.getElementById("live").textContent = m; };
  const NAME = "Example notes";
  const KIND = {
    home_library: ["database", ["它的个人库", "Its library"]],
    owner_files: ["folder", ["它存的文件", "Files it saved"]],
    network_credential: ["key", ["它用的联网凭据", "Network credentials it used"]],
    installation_binding: ["link", ["连接账号的绑定", "Account connections"]],
    task_grant: ["shield", ["交给它的任务授权", "Task permissions given to it"]],
    declared_rule: ["tune", ["它带来的判断规则", "Judgment rules it brought"]],
  };
  const REASON = {
    ownership_unverified: ["核实不了是不是它的，为稳妥没有删", "Couldn't confirm it was this plugin's, so it was left in place"],
    other_holder: ["别处（另一个项目或个人空间）的同一个插件还在用", "The same plugin elsewhere (another project or your personal space) still uses it"],
    inventory_unavailable: ["有的资料读不了，没法确认还有没有在用，先留着", "Some data couldn't be read to check whether it's still in use, so it was kept"],
  };
  const CASES = {
    kept: [{ kind: "home_library", reason: "ownership_unverified" }, { kind: "installation_binding", reason: "other_holder" }],
    inventory: [{ kind: "installation_binding", reason: "inventory_unavailable" }],
    clean: [],
    failed: null,
  };
  const kept = () => CASES[S.case] || [];
  const heavy = () => kept().some((item) => item.reason !== "other_holder");
  const keptCount = (n) => L(`有 ${n} 项留下了`, n === 1 ? "1 thing was left in place" : `${n} things were left in place`);

  // ---------- board parts ----------
  const btn = (variant, label, attrs = {}, o = {}) => K.renderButton({ variant, size: o.size || "sm", label, loading: o.loading, disabled: o.disabled, attrs });
  const keptList = () => `<ul class="proto-kept">${kept().map((item) => `<li>${ic(KIND[item.kind][0])}<strong>${esc(L(...KIND[item.kind][1]))}</strong><span>${esc(L(...REASON[item.reason]))}</span></li>`).join("")}</ul>`;
  const rest = () => `<p class="proto-gone">${esc(L("其余数据已经删除。", "Everything else was deleted."))}</p>`;
  const failure = () => L("它已经停下，不再运行。存它文件的文件夹有一处指向这个空间之外，为稳妥没有删；处理好后点「重试卸载」，仍按「删除数据」做完。",
    "It has stopped and no longer runs. A folder holding its files points outside this space, so nothing there was deleted. Once that's sorted, choose Retry uninstall; it still finishes as Delete data.");

  function toast(message, o = {}) {
    const host = document.getElementById("toasts");
    host.innerHTML = K.renderToast({ message, tone: o.error ? "danger" : "success", action: o.action ? { label: o.action.label, attrs: { "data-act": o.action.act } } : undefined });
    announce(message);
    clearTimeout(toast.t); toast.t = setTimeout(() => { host.innerHTML = ""; }, o.ms || 2600);
  }

  // ---------- page frame ----------
  function settingsPage(content) {
    const nav = [
      [L("项目", "Project")], ["info", L("概况", "Overview")], ["package", L("插件", "Plugins"), true], ["user", L("角色", "Characters")], ["folder", L("目录", "Folders")],
      [L("本机", "This Mac")], ["sun", L("界面与语言", "Interface & language")], ["link", L("服务连接", "Service connections")],
    ];
    return `<header class="project-preferences-chrome"><span>${L("项目设置", "Project settings")}</span><a href="#" data-act="noop" aria-label="${L("关闭设置", "Close settings")}">${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex" aria-label="${L("设置", "Settings")}"><a class="settings-nav-back" href="#" data-act="noop">${ic("arrow")} ${L("返回项目", "Back to project")}</a><div class="settings-nav-body">${nav.map((n) => (n.length === 1 ? `<div class="settings-nav-group-label">${n[0]}</div>` : `<a href="#" data-act="noop"${n[2] ? ' aria-current="page"' : ""}>${ic(n[0])}${n[1]}</a>`)).join("")}</div></nav>
      <div class="settings-content">${content}</div></main>`;
  }

  // ---------- the 插件 page ----------
  const chevron = `<span class="settings-advanced-chevron" aria-hidden="true">${ic("chevron-down")}</span>`;
  function hostRow() {
    return `<li><details class="settings-advanced plugin-trust-item"><summary><span class="setting-copy"><strong>Goals · 3.4.0</strong><span>${L("随 Molis Work 提供 · 运行中", "Comes with Molis Work · Running")}</span></span>${chevron}</summary></details></li>`;
  }
  function pluginRow() {
    const pending = P.phase === "failed" || (P.retry && P.phase === "working");
    const busy = P.phase === "working" && S.plan !== "C";
    const state = pending ? L("已卸载（没清理完）", "Uninstalled (clean-up unfinished)") : L("运行中", "Running");
    const actions = pending
      ? (S.plan === "A"
        ? K.renderAlert({ tone: "danger", role: "alert", rise: true, title: L("卸载没做完", "The uninstall didn't finish"), body: failure(),
          actions: [{ variant: "primary", label: L("重试卸载", "Retry uninstall"), loading: busy, attrs: { "data-act": "retry", "data-primary": "" } }] })
        : `<div class="plugin-trust-actions">${btn("secondary", L("重试卸载", "Retry uninstall"), { "data-act": "retry" }, { loading: busy })}</div>`)
      : `<div class="plugin-trust-actions">${btn("secondary", L("停用", "Turn off"), { "data-act": "noop" }, { disabled: busy })}${btn("ghost", L("卸载并保留数据", "Uninstall, keep data"), { "data-act": "noop" }, { disabled: busy })}${btn("ghost", L("卸载并删除数据", "Uninstall, delete data"), { "data-act": "ask" }, { loading: busy })}</div>`;
    return `<li><details class="settings-advanced plugin-trust-item" open><summary><span class="setting-copy"><strong>${NAME} · 1.2.0</strong><span>${L("你固定的发布者", "A publisher you pinned")} · Acme · ${state}</span></span>${chevron}</summary>
      <div class="plugin-trust-body">
        <span class="settings-muted">io.acme.notes · 3f9a1c07b2d4</span>
        ${pending && S.plan !== "A" ? `<span class="settings-form-error">${L("上次卸载（删除数据）没有清理完，可以重试", "The last uninstall (delete data) didn't finish its clean-up; you can retry")}</span>` : ""}
        <div class="plugin-trust-group"><strong>${L("权限", "Permissions")}</strong><ul class="plugin-trust-rows"><li><span>${L("保存数据", "Save data")}</span><span class="settings-muted">${L("必需", "Required")}</span></li><li><span>${L("联网：api.acme.example", "Network: api.acme.example")}</span><span class="settings-muted">${L("已开启", "On")}</span></li></ul></div>
        ${actions}
      </div></details></li>`;
  }
  function resultRow() {
    const n = kept().length;
    return `<li class="proto-result" tabindex="-1" data-focus>${K.renderAlert({ tone: heavy() ? "warning" : "info", rise: true, title: `${L(`已卸载 ${NAME}`, `${NAME} is uninstalled`)} · ${keptCount(n)}`,
      body: "", actions: [{ variant: "secondary", label: L("知道了", "Got it"), attrs: { "data-act": "dismiss" } }] }).replace("</strong>", `</strong>${keptList()}${rest()}`)}</li>`;
  }
  function homeList() {
    if (P.phase !== "done") return pluginRow();
    if (S.plan === "A" && kept().length && !P.dismissed) return resultRow();
    return `<li class="settings-muted">${L("个人空间里没有插件", "No plugins in your personal space")}</li>`;
  }
  function page() {
    const topError = P.phase === "failed" && S.plan === "B" ? `<p class="settings-form-error" role="alert">${esc(failure())}</p>` : "";
    return `<section class="settings-document plugin-trust-settings" aria-labelledby="plugin-trust-title">
      <header class="settings-page-heading"><h1 id="plugin-trust-title">${L("插件", "Plugins")}</h1><p>${L("这个项目里装着的插件：谁签的名、要了哪些权限、在后台做什么，以及你给过它们的同意。", "The plugins installed in this project: who signed them, the permissions they asked for, what they do in the background, and what you've agreed to.")}</p></header>
      ${topError}
      <section class="settings-section" aria-labelledby="t-installed"><h2 id="t-installed">${L("已安装的插件", "Installed plugins")}</h2><ul class="plugin-trust-list">${hostRow()}</ul></section>
      <section class="settings-section" aria-labelledby="t-home"><h2 id="t-home">${L("个人空间里的插件", "Plugins in your personal space")}</h2>
        <p class="settings-muted">${L("这些插件在你的个人空间里运行，所有项目共用同一份；这里改它的权限，对每个项目都生效。", "These run in your personal space and every project shares them; a permission changed here changes for every project.")}</p>
        <ul class="plugin-trust-list">${homeList()}</ul></section>
    </section>`;
  }

  // ---------- dialogs ----------
  function dialog() {
    if (P.dialog === "ask") {
      const working = P.phase === "working";
      return `<dialog class="mw-dialog mw-dialog--alert" data-slot="alert-dialog" aria-labelledby="d-title"><form class="mw-form mw-dialog__shell" method="dialog">
        <header class="mw-form__header"><div><h2 id="d-title">${L("卸载这个插件？", "Uninstall this plugin?")}</h2><p>${esc(L(`${NAME} 会被卸载，它的数据一并删除，不能恢复。`, `${NAME} will be uninstalled and its data deleted. This can't be undone.`))}</p></div></header>
        <footer class="mw-form__footer">${K.renderButton({ variant: "secondary", size: "md", label: L("取消", "Cancel"), disabled: working, attrs: { "data-act": "close" } })}${K.renderButton({ variant: "danger", size: "md", label: working ? L("正在卸载…", "Uninstalling…") : L("卸载并删除数据", "Uninstall, delete data"), loading: working, attrs: { "data-act": "confirm", "data-primary": "" } })}</footer></form></dialog>`;
    }
    if (P.dialog === "result") {
      return `<dialog class="mw-dialog mw-dialog--alert" data-slot="alert-dialog" aria-labelledby="d-title"><form class="mw-form mw-dialog__shell" method="dialog">
        <header class="mw-form__header"><div><h2 id="d-title">${esc(L(`已卸载 ${NAME}`, `${NAME} is uninstalled`))}</h2><p>${esc(keptCount(kept().length))}${L("，其余数据已经删除。", ". Everything else was deleted.")}</p></div></header>
        <div class="mw-form__body">${keptList()}</div>
        <footer class="mw-form__footer">${K.renderButton({ variant: "primary", size: "md", label: L("完成", "Done"), attrs: { "data-act": "close", "data-primary": "" } })}</footer></form></dialog>`;
    }
    if (P.dialog === "failed") {
      return `<dialog class="mw-dialog mw-dialog--alert" data-slot="alert-dialog" aria-labelledby="d-title"><form class="mw-form mw-dialog__shell" method="dialog">
        <header class="mw-form__header"><div><h2 id="d-title">${L("卸载没做完", "The uninstall didn't finish")}</h2><p>${esc(failure())}</p></div></header>
        <footer class="mw-form__footer">${K.renderButton({ variant: "secondary", size: "md", label: L("关闭", "Close"), attrs: { "data-act": "close" } })}${K.renderButton({ variant: "primary", size: "md", label: L("重试卸载", "Retry uninstall"), loading: P.phase === "working", attrs: { "data-act": "retry", "data-primary": "" } })}</footer></form></dialog>`;
    }
    if (P.dialog === "detail") {
      return `<dialog class="mw-dialog" data-slot="dialog" aria-labelledby="d-title"><form class="mw-form mw-dialog__shell" method="dialog">
        <header class="mw-form__header"><div><h2 id="d-title">${L("卸载后留下的", "Left in place")}</h2><p>${esc(L(`${NAME} 已卸载，其余数据已经删除。`, `${NAME} is uninstalled; everything else was deleted.`))}</p></div></header>
        <div class="mw-form__body">${keptList()}</div>
        <footer class="mw-form__footer">${K.renderButton({ variant: "primary", size: "md", label: L("知道了", "Got it"), attrs: { "data-act": "close", "data-primary": "" } })}</footer></form></dialog>`;
    }
    return "";
  }

  // ---------- the prototype bar ----------
  const PLANS = { A: ["A 就地结果（推荐）", "A In place (recommended)"], B: ["B 轻提示 + 查看", "B Toast + view"], C: ["C 确认框转结果", "C Dialog turns into result"] };
  const CASE_NAMES = { kept: ["留下两项", "Two left in place"], inventory: ["读不全，留一项", "Couldn't read all, one kept"], clean: ["什么都没留下", "Nothing left"], failed: ["清理没做完（出错）", "Clean-up unfinished (error)"] };
  const NOTES = {
    A: ["结果就留在刚才点的那一行：不打断、不会自己消失，「知道了」收起。什么都没留下时只有「已卸载」轻提示，和今天一样。出错也在这一行就地说、就地重试。",
      "The result stays where you clicked: no interruption, it doesn't vanish, Got it folds it. With nothing left there is only the Uninstalled toast, as today. An error is said and retried in the same row."],
    B: ["行直接消失，轻提示说「有 N 项留下了」并带「查看」，多留 8 秒；点开才看到明细。出错沿用今天的页顶错误与行内「重试卸载」。代价：提示一过就找不回明细。",
      "The row goes at once; a toast says N things were left with View, for 8 seconds; the list opens on demand. An error keeps today's page-top message and Retry in the row. Cost: once the toast is gone the list can't be found again."],
    C: ["确认框不关，按钮转圈，完成后同一个框里给结果与「完成」；出错在框里说并给「重试卸载」。代价：要多点一次才回到页面，什么都没留下时也直接关框给轻提示。",
      "The confirm dialog stays: its button spins, then the same dialog shows the result with Done; an error is said there with Retry. Cost: one more click back to the page; with nothing left it just closes with a toast."],
  };
  function bar() {
    document.getElementById("p-title").textContent = L("27 · 卸载后留下的项目（BL-915）", "27 · What an uninstall left in place (BL-915)");
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
  function render() {
    document.documentElement.lang = S.lang === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.theme = S.theme; document.documentElement.dataset.resolvedTheme = S.theme;
    bar();
    document.getElementById("app").innerHTML = settingsPage(page()) + dialog();
    const open = document.querySelector("#app dialog");
    if (open) { open.showModal(); (open.querySelector("[data-primary]:not(:disabled)") || open.querySelector("button:not(:disabled)"))?.focus(); }
    else document.querySelector("[data-focus]")?.focus();
  }

  function finish() {
    if (S.case === "failed" && !P.retry) {
      P.phase = "failed";
      if (S.plan === "C") P.dialog = "failed"; else P.dialog = null;
      if (S.plan === "B") toast(L("卸载没做完，可以重试", "The uninstall didn't finish; you can retry"), { error: true, ms: 5000 });
      render(); return;
    }
    const n = S.case === "failed" ? 0 : kept().length;
    P.phase = "done";
    if (!n) { P.dialog = null; render(); toast(L(`已卸载 ${NAME}`, `${NAME} is uninstalled`)); return; }
    if (S.plan === "A") { P.dialog = null; render(); announce(`${L(`已卸载 ${NAME}`, `${NAME} is uninstalled`)} · ${keptCount(n)}`); return; }
    if (S.plan === "B") { P.dialog = null; render(); toast(`${L(`已卸载 ${NAME}`, `${NAME} is uninstalled`)} · ${keptCount(n)}`, { action: { act: "detail", label: L("查看", "View") }, ms: 8000 }); return; }
    P.dialog = "result"; render();
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-act]");
    if (!target) return;
    event.preventDefault();
    const act = target.dataset.act, v = target.dataset.v;
    switch (act) {
      case "ask": P.dialog = "ask"; render(); return;
      case "close": P.dialog = null; render(); return;
      case "confirm":
        P.phase = "working";
        if (S.plan !== "C") P.dialog = null;
        render(); later(900, finish); return;
      case "retry":
        P.retry = true; P.phase = "working"; P.dialog = S.plan === "C" ? "failed" : null;
        render(); later(900, finish); return;
      case "dismiss": P.dismissed = true; render(); return;
      case "detail": document.getElementById("toasts").innerHTML = ""; P.dialog = "detail"; render(); return;
      case "lang": S.lang = v; save(); render(); return;
      case "theme": S.theme = v; save(); render(); return;
      default: return;
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "plan") S.plan = event.target.value;
    else if (event.target.id === "case") S.case = event.target.value;
    else return;
    save(); clearTimers(); P = freshFlow(); document.getElementById("toasts").innerHTML = ""; render();
  });
  document.addEventListener("cancel", (event) => { if (event.target.matches("#app dialog")) { event.preventDefault(); if (P.phase !== "working") { P.dialog = null; render(); } } }, true);
  document.getElementById("reset").addEventListener("click", () => { clearTimers(); P = freshFlow(); document.getElementById("toasts").innerHTML = ""; render(); });

  window.__protoState = () => JSON.parse(JSON.stringify({ S, P }));
  render();
})();
