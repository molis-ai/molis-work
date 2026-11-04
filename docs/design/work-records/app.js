// 21 · Work records, rebuilt on the component board's real parts (2026-11-04): the four options the user chose
// (scope A, clean A, space A, gaps B) with every normal and failure state. All markup mirrors the mw-* renderers in
// packages/plugin-sdk/src/ui and packages/design-system/src/primitives; styles come from mw.css (a snapshot of the board).
// Sample data only (data.js). Timers stand in for counting and cleaning. Nothing reads a Home, a database or the disk.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.mwSprite;
  const app = document.getElementById("app");
  const KEY = "molis-proto.work-records.v3";

  const fresh = () => ({
    block: "scope", state: { scope: "normal", clean: "normal", space: "normal", gaps: "normal" }, lang: "zh", theme: "light", cat: false,
    open: {}, uses: Object.fromEntries(D.uses.map((u) => [u.id, u.on])),
    period: "keep", reminder: null, reminderDraft: 2, editingReminder: false,
    dlg: false, dlgRange: "before", dlgProject: "all", dlgKinds: Object.fromEntries(D.kinds.map((k) => [k.id, true])), filter: "all",
  });
  let S = load();
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.v === 3) return { ...fresh(), ...v.s }; } catch { /* preview without storage */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 3, s: S })); } catch { /* preview without storage */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const block = () => D.blocks.find((b) => b.id === S.block);
  const state = () => { const b = block(); return b.states.some((x) => x.id === S.state[b.id]) ? S.state[b.id] : b.states[0].id; };
  const kind = (id) => D.kinds.find((k) => k.id === id);
  const gb = (n) => `${n.toFixed(2)} GB`;

  // ---------- The board's parts (same markup as the mw-* renderers) ----------
  const ic = (n) => `<svg aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (label, { v = "secondary", icon, attrs = "", disabled = false } = {}) =>
    `<button type="button" class="mw-btn mw-btn--${v} mw-btn--sm" data-slot="button" data-cat="Button"${disabled ? " disabled" : ""} ${attrs}>${icon ? ic(icon) : ""}<span data-slot="button-label">${label}</span></button>`;
  const iconBtn = (label, icon, attrs = "", cls = "") =>
    `<button type="button" class="mw-btn mw-btn--ghost mw-btn--icon mw-btn--icon-only${cls ? ` ${cls}` : ""}" data-slot="button" aria-label="${esc(label)}" ${attrs}>${ic(icon)}<span class="mw-sr-only">${label}</span></button>`;
  const status = (label, tone, ring) =>
    `<span class="mw-status mw-status--${tone}" data-slot="status" data-cat="Status mark">${ring ? window.mwRings[ring] : ""}<span>${label}</span></span>`;
  const st = (code) => status(T(D.statuses[code].name), D.statuses[code].tone);
  const badge = (label, tone = "neutral") => `<span class="mw-badge mw-badge--${tone}" data-slot="badge" data-cat="Badge">${label}</span>`;
  const alert = (tone, title, body = "", actions = "") =>
    `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status" data-cat="Alert"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}${actions ? `<div class="mw-ix-actions">${actions}</div>` : ""}</div>`;
  const sw = (on, attrs = "", disabled = false) =>
    `<span class="mw-switch" data-slot="switch" data-cat="Switch"><input type="checkbox" role="switch"${on ? " checked" : ""}${disabled ? " disabled" : ""} ${attrs}><span class="mw-switch__track" aria-hidden="true"></span></span>`;
  const select = (attrs, options) => `<select class="mw-select" data-slot="select" data-cat="Select" ${attrs}>${options}</select>`;
  const opts = (list, cur) => list.map(([v, n]) => `<option value="${v}"${v === cur ? " selected" : ""}>${n}</option>`).join("");
  const setting = (id, title, note, control) =>
    `<div class="mw-setting" data-cat="Settings Row"><div><strong id="${id}">${title}</strong>${note ? `<p>${note}</p>` : ""}</div><div>${control}</div></div>`;
  const settings = (rows) => `<div class="mw-settings">${rows}</div>`;
  const item = (mark, title, meta, end, extra = "", attrs = "") =>
    `<li class="mw-item" data-cat="Item Row" ${attrs}>${mark}<span><strong>${title}</strong><small>${meta}</small></span><span class="mw-item__end">${end}</span></li>${extra ? `<li class="wr-more">${extra}</li>` : ""}`;
  const card = (title, desc, action, body) =>
    `<article class="mw-card" data-slot="card" data-cat="Card"><header class="mw-card__header"><div><h2 class="mw-card__title">${title}</h2>${desc ? `<p class="mw-card__description">${desc}</p>` : ""}</div>${action || ""}</header><div class="mw-card__panel">${body}</div></article>`;
  const progress = (pct, label) => `<div class="mw-progress" data-slot="progress" data-cat="Progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${esc(label)}"><span style="width:${pct}%"></span></div>`;
  const spinner = (label) => `<span class="mw-spinner" data-slot="spinner" data-cat="Spinner" role="status" aria-label="${esc(label)}">${window.mwRings.running}</span>`;
  const collapsible = (summary, body, open, key) =>
    `<details class="mw-collapsible" data-slot="collapsible" data-cat="Collapsible" data-key="${key}"${open ? " open" : ""}><summary>${summary}</summary><div class="mw-collapsible__body">${body}</div></details>`;
  const NEW_KIND = () => L("种类色标记：组件板的 Mark 是中性色；五类记录要一眼分开（界面通用规则 11-03），用五种 --mark-* 色", "Kind-coloured mark: the board's Mark is neutral; five record kinds must read apart (UI rule 11-03), using the five --mark-* tones");
  const NEW_BAR = () => L("分类条：Meter 与 Progress 只显示一个数；占用要按五类记录分段看，带图例", "Category bar: Meter and Progress show one value; usage splits by the five record kinds, with a legend");
  const kindMark = (k) => `<span class="mw-mark wr-kind" style="--wr-hue:var(--mark-${k.hue});--wr-fill:var(--mark-${k.hue}-fill)" data-new="${esc(NEW_KIND())}" aria-hidden="true">${ic(k.icon)}</span>`;
  const plainMark = (icon) => `<span class="mw-mark" data-cat="Mark" aria-hidden="true">${ic(icon)}</span>`;

  // ---------- Review strip ----------
  function strip() {
    const b = block();
    document.getElementById("p-title").textContent = L("原型 · 工作记录（第 21 批）", "Prototype · Work records (batch 21)");
    document.getElementById("p-block").textContent = L("块", "Block");
    document.getElementById("p-opt").textContent = L(`方案：${T(b.chosenName)}（用户已定）`, `Option: ${T(b.chosenName)} (chosen)`);
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("reset").textContent = L("还原", "Reset");
    const cb = document.getElementById("cat");
    cb.textContent = L("标出组件", "Show components");
    cb.setAttribute("aria-pressed", String(S.cat));
    document.body.classList.toggle("cat", S.cat);
    document.getElementById("block").innerHTML = D.blocks.map((x) => `<option value="${x.id}"${x.id === b.id ? " selected" : ""}>${T(x.name)}</option>`).join("");
    document.getElementById("state").innerHTML = b.states.map((x) => `<option value="${x.id}"${x.id === state() ? " selected" : ""}>${T(x.name)}</option>`).join("");
    document.querySelectorAll("#lang button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === S.lang)));
    document.querySelectorAll("#theme button").forEach((x) => { x.setAttribute("aria-pressed", String(x.dataset.themeSet === S.theme)); x.textContent = x.dataset.themeSet === "light" ? L("浅色", "Light") : L("深色", "Dark"); });
    const root = document.documentElement;
    root.dataset.theme = S.theme; root.dataset.resolvedTheme = S.theme;
    root.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.title = L("工作记录定样 · Molis Work 原型", "Work records review · Molis Work prototype");
  }

  // ---------- The global settings page (same shell as apps/workbench/src/settings-renderer.ts) ----------
  function page(body) {
    const groups = [
      [L("本机", "On this Mac"), [["sun", L("界面与语言", "Interface & language")], ["folder", L("本机目录", "Local folders")]]],
      [L("个人", "Personal"), [["bookmark", L("记忆", "Memory")], ["database", L("工作记录", "Work records"), true]]],
      ["AI", [["key", L("模型设置", "Models")], ["message", L("助理", "Assistant")], ["user", L("角色", "Role")], ["text", L("提示词", "Prompts")]]],
      [L("工具与接入", "Tools and connections"), [["terminal", L("AI 与执行工具", "AI & execution tools")], ["book", L("能力库", "Capability library")], ["link", L("服务连接", "Service connections")], ["shield", L("对外接入", "External access")], ["workflow", L("调用记录", "Call history")]]],
      [L("系统", "System"), [["bug", L("诊断", "Diagnostics")]]],
    ];
    const nav = `<nav class="settings-navigation settings-navigation--codex" aria-label="${L("系统设置", "System settings")}">
      <a class="settings-nav-back" href="#">${ic("arrow")} ${L("返回项目", "Return to project")}</a>
      <div class="settings-nav-body">${groups.map(([g, items]) => `<div class="settings-nav-group-label">${g}</div>${items.map(([i, n, cur]) => `<a href="#"${cur ? ' aria-current="page"' : ""}>${ic(i)}${n}</a>`).join("")}`).join("")}</div></nav>`;
    const tabs = `<div class="mw-tabs" data-slot="tabs" data-cat="Tabs"><div class="mw-tabs__list" role="tablist" aria-label="${L("工作记录", "Work records")}">${D.blocks.map((b) => `<button type="button" class="mw-tabs__tab${b.id === S.block ? " is-active" : ""}" role="tab" aria-selected="${b.id === S.block}" data-tab="${b.id}">${T(b.name)}</button>`).join("")}</div></div>`;
    return `<header class="project-preferences-chrome"><span>${L("全局设置", "Global settings")}</span><a href="#" aria-label="${L("关闭全局设置", "Close global settings")}">${ic("x")}</a></header>
      <main class="settings-shell">${nav}<div class="settings-content"><section class="settings-document wr-page" aria-labelledby="wr-title">
        <header class="settings-page-heading"><h1 id="wr-title">${L("工作记录", "Work records")}</h1><p>${L("这台 Mac 记下的工作过程：你做了什么、AI 做了什么、内容怎么变的。用来回看、给助理参考和评测效果；只存在本机。", "What happened in your work, recorded on this Mac: what you did, what AI did and how content changed. Used for look-back, the assistant and evaluation; stored on this Mac only.")}</p></header>
        ${tabs}<div class="wr-block">${body}</div></section></div></main>`;
  }

  // ---------- Block 1 · What's recorded (A, category list) ----------
  function recordingRow() {
    const s = state();
    if (s === "paused") return setting("wr-rec", L("记录已暂停", "Recording paused"), L("截至 11 月 2 日 14:20。暂停期间做的事不会被记下。", "Up to Nov 2, 14:20. Nothing done while paused is recorded."), `${status(L("已暂停", "Paused"), "hold")}${btn(L("继续记录", "Resume"), { v: "primary", attrs: 'data-act="resume"' })}`);
    if (s === "first") return setting("wr-rec", L("在读这个项目现有的资料", "Reading this project's existing material"), L("读到的算「原本就有」，不算你新做的。", "What is read counts as “already there”, not new work."), `${status("2,140 / 3,600", "progress", "running")}${btn(L("停止读取", "Stop reading"), { attrs: 'data-act="noop"' })}`);
    return setting("wr-rec", L("记录工作过程", "Record work"), L("完整记录从 10 月 12 日开始；更早的历史能取到 8 月 4 日以后的版本。", "Complete since Oct 12; older history goes back to versions after Aug 4."), `${status(L("记录中", "Recording"), "done")}${btn(L("暂停记录", "Pause"), { icon: "pause", attrs: 'data-act="pause"' })}`);
  }
  function scopeView() {
    const s = state();
    const top = s === "paused" ? alert("warning", L("已暂停记录", "Recording paused"), L("助理和评测看到的记录到 11 月 2 日 14:20 为止。", "The assistant and evaluation see records up to Nov 2, 14:20."))
      : s === "first" ? `${alert("info", L("首次接入：在读现有资料 · 59%", "First connect: reading what exists · 59%"), L("完整记录从今天开始；8 月 4 日以前的版本取不到。", "Complete records start today; versions before Aug 4 aren't available."))}${progress(59, L("已读 59%", "59% read"))}` : "";
    const kinds = D.kinds.map((k) => {
      const open = !!S.open[k.id];
      const more = open ? `<div><b>${L("记", "Recorded")}</b>${T(k.rec)}</div><div><b>${L("不记", "Not recorded")}</b>${T(k.not)}</div>` : "";
      return item(kindMark(k), T(k.name), T(k.rec), iconBtn(open ? L("收起", "Collapse") : L("展开", "Expand"), open ? "chevron-down" : "chevron-right", `aria-expanded="${open}" data-open="${k.id}"`), more);
    }).join("");
    const uses = D.uses.map((u) => {
      const on = u.id === "eval" && s === "useoff" ? false : S.uses[u.id];
      const note = u.fixed ? L("只要在记录就能用", "Always available while recording") : u.na ? L("这一版没有这个功能", "Not available in this version")
        : u.id === "eval" && !on ? L("关着：评测读不到；已留的样本按样本自己的期限", "Off: evaluation can't read records; kept samples follow their own period")
        : u.id === "assist" ? L("按你给助理的回看范围", "Within the look-back window you set for the assistant") : u.id === "export" ? L("导出时你选范围", "You choose the range when exporting") : "";
      return setting(`wr-use-${u.id}`, T(u.name), note, sw(on, `data-use="${u.id}" aria-labelledby="wr-use-${u.id}"`, u.fixed || u.na));
    }).join("");
    return `${top}${settings(recordingRow())}
      <section><h2>${L("记了什么", "What's recorded")}</h2><ul class="mw-items">${kinds}</ul></section>
      <section><h2>${L("可以用在哪里", "Where records may be used")}</h2>${settings(uses)}</section>
      <p class="wr-lock">${ic("lock")}${L("只存在这台 Mac 上，不上传。", "Stored on this Mac only. Nothing is uploaded.")}</p>`;
  }

  // ---------- Block 2 · Keep & clean up (A, period + manual) ----------
  const periodDays = (p) => ({ keep: 9999, manual: 9999, 365: 365, 180: 180, 90: 90, 30: 30 })[p];
  function cleanTop() {
    const s = state();
    if (s === "running") return `${alert("info", L("正在清理 8 月 4 日以前的记录 · 62%", "Clearing records before Aug 4 · 62%"), L("别的功能照常用；关掉窗口也会继续。", "Everything else keeps working; it continues if you close this window."))}${progress(62, L("已清理 62%", "62% cleared"))}`;
    if (s === "partial") return alert("danger", L("「官网改版」的记录没有清", "Records for “Website redesign” were not cleared"), L("那个项目正开着一个后台任务，记录被占用。其余项目已清理，释放 371 MB。", "A background task in that project was holding them. Other projects were cleared, 371 MB freed."), btn(L("只重试这一项", "Retry just this one"), { icon: "refresh", attrs: 'data-act="noop"' }));
    if (s === "after") return alert("success", L("已清理 8 月 4 日以前的记录 · 释放 412 MB", "Cleared records before Aug 4 · 412 MB freed"), L("这段时间在回看和评测里显示为「到期清除」，不会拿现在的内容顶替。原文、Pages 版本和已存的简报都还在。", "That period shows as “Cleared” in look-back and evaluation and is never replaced by current content. Originals, Pages versions and saved briefs remain."), btn(L("看缺口", "See gaps"), { attrs: 'data-goto="gaps:cleared"' }));
    return "";
  }
  function cleanView() {
    const s = state();
    const p = s === "short" ? "30" : S.period;
    const days = periodDays(p);
    const lose = D.needs.some((n) => days < n.days);
    const period = setting("wr-period", L("清理多久以前的记录", "Clear records older than"),
      p === "keep" ? L("默认一直保留，不会因为过了多少天就删。", "Kept by default — never deleted just because time passed.") : p === "manual" ? L("不会自动删；需要时在下面手动清理。", "Nothing is deleted automatically; clean up below when you want.") : "",
      select('id="period" aria-labelledby="wr-period"', opts(D.periods.map((x) => [x.id, T(x.name)]), p)));
    const needs = p === "keep" || p === "manual" ? "" : `<ul class="mw-items">${D.needs.map((n) => { const ok = days >= n.days; return item(plainMark(ok ? "check" : "alert"), T(n.name), L(`需要最近 ${n.days} 天的记录`, `Needs the last ${n.days} days`), status(ok ? L("保得住", "Kept") : L("会失去", "Will be lost"), ok ? "done" : "attention")); }).join("")}</ul>`;
    const warn = lose ? alert("warning", L("这个期限比报告和比较要用的短", "This period is shorter than reports and comparisons need"), L("保存后，到期的记录会被清掉，不会悄悄替你多留。", "After saving, older records are cleared — nothing is silently kept longer."),
      btn(L("仍然用 30 天", "Use 30 days anyway"), { v: "primary", attrs: 'data-act="noop"' }) + btn(L("改回一直保留", "Keep instead"), { attrs: 'data-act="keep"' })) : "";
    return `${cleanTop()}
      <section><h2>${L("自动清理", "Automatic clean-up")}</h2>${settings(period)}${needs}${warn}</section>
      <section><h2>${L("手动清理", "Clean up now")}</h2>${settings(setting("wr-manual", L("选择要清理的记录", "Choose records to clear"), L("只清工作记录。原文、插件里的版本、已存的简报按各自的规则，不会一起删。", "Only work records. Originals, plugin versions and saved briefs follow their own rules."), btn(L("选择…", "Choose…"), { icon: "trash", attrs: 'data-act="dlg"' })))}</section>
      <section><h2>${L("评测样本", "Evaluation samples")}</h2>${settings(setting("wr-samples", L("留作评测的样本", "Samples kept for evaluation"), L("有自己的期限（到 2027 年 1 月），不跟着上面的清理走；到期前会问你。", "Have their own period (until Jan 2027) and aren't affected by the clean-up above; you'll be asked before they expire."), badge(L("12 个", "12"))))}</section>
      ${s === "dialog" || S.dlg ? dialog() : ""}`;
  }
  function dialog() {
    const n = Object.values(S.dlgKinds).filter(Boolean).length;
    const mb = Math.round(412 * n / D.kinds.length * (S.dlgProject === "all" ? 1 : 0.55));
    const field = (label, control) => `<label class="mw-field" data-slot="field"><span class="mw-field__label">${label}</span>${control}</label>`;
    const when = `<div class="mw-ix-actions">${select('id="dlgRange"', opts([["before", L("早于", "Before")], ["span", L("某一段", "A span")]], S.dlgRange))}<input class="mw-input" data-slot="input" data-cat="Date Picker" type="date" value="2026-08-04">${S.dlgRange === "span" ? `<input class="mw-input" data-slot="input" type="date" value="2026-09-01">` : ""}</div>`;
    const kinds = `<fieldset class="mw-check-group" data-slot="checkbox-group" data-cat="Checkbox Group"><legend>${L("哪些记录", "Which records")}</legend>${D.kinds.map((k) => `<label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" data-dk="${k.id}"${S.dlgKinds[k.id] ? " checked" : ""}><span>${T(k.name)}</span></label>`).join("")}</fieldset>`;
    const impact = `<ul class="wr-impact">
      <li class="lose">${ic("alert")}<span>${L("8 月的周报会标出依据已清除", "August reports will show their evidence as cleared")}</span></li>
      <li class="lose">${ic("alert")}<span>${L("跨 8 月与 10 月的比较不能做了", "Comparing August with October is no longer possible")}</span></li>
      <li class="ok">${ic("check")}<span>${L("原文、Pages 版本、已存的简报都还在", "Originals, Pages versions and saved briefs remain")}</span></li>
      <li class="ok">${ic("check")}<span>${L("12 个评测样本按自己的期限留着", "12 evaluation samples stay under their own period")}</span></li></ul>`;
    return `<dialog class="mw-dialog" data-slot="dialog" data-cat="Dialog" aria-labelledby="wr-dlg-title" data-wr-dialog>
      <form method="dialog" class="mw-form mw-dialog__shell">
        <header class="mw-form__header"><div><h2 id="wr-dlg-title">${L("清理工作记录", "Clear work records")}</h2><p>${L("先看会清掉多少、会影响什么，再决定。", "See how much and what it affects before deciding.")}</p></div>${iconBtn(L("关闭", "Close"), "x", 'data-act="dlgx"', "mw-dialog__close")}</header>
        <div class="mw-form__body wr-dialog-body">
          ${field(L("时间", "When"), when)}
          ${field(L("项目", "Project"), select('id="dlgProject"', opts([["all", L("全部项目", "All projects")], ...D.byProject.map((x) => [x.name, x.name])], S.dlgProject)))}
          ${kinds}
          <div class="wr-size"><strong>${mb} MB</strong><span>${L(`约 ${(mb * 44).toLocaleString()} 条`, `about ${(mb * 44).toLocaleString()} records`)}</span></div>
          ${impact}
        </div>
        <footer class="mw-form__footer">${btn(L("取消", "Cancel"), { v: "ghost", attrs: 'data-act="dlgx"' })}${btn(L(`清理 ${mb} MB`, `Clear ${mb} MB`), { v: "danger", icon: "trash", attrs: 'data-act="dlgok"', disabled: !n })}</footer>
      </form></dialog>`;
  }

  // ---------- Block 3 · Space (A, number + category bar) ----------
  function spaceNums() {
    const s = state();
    return { s, total: s === "over" ? D.space.overTotal : s === "near" ? 1.92 : D.space.total, reminder: s === "near" || s === "over" ? D.space.nearReminder : S.reminder };
  }
  function spaceTop() {
    const { s, total, reminder } = spaceNums();
    const acts = btn(L("去清理", "Clean up"), { attrs: 'data-goto="clean:normal"' }) + btn(L("改提醒线", "Change reminder"), { v: "ghost", attrs: 'data-act="editRem"' });
    if (s === "near") return alert("warning", L(`快到提醒线了：${gb(total)} / ${reminder} GB`, `Close to your reminder: ${gb(total)} / ${reminder} GB`), "", acts);
    if (s === "over") return alert("warning", L(`已超过提醒线：${gb(total)} / ${reminder} GB`, `Past your reminder: ${gb(total)} / ${reminder} GB`), L("照常在记，不会自动删。", "Still recording; nothing is deleted automatically."), acts);
    if (s === "disk") return alert("danger", L("这台 Mac 剩余空间不足（0.6 GB）· 14:02 起有 37 条记录没能保存", "This Mac is low on space (0.6 GB) · 37 records since 14:02 were not saved"), L("这段时间做的事已经照常生效，只是过程没记下；回看和评测里会标为「丢失」。", "The work itself took effect; only its record is missing. Look-back and evaluation mark it as “Lost”."), btn(L("看缺口", "See gaps"), { attrs: 'data-goto="gaps:issues"' }) + btn(L("清理", "Clean up"), { v: "ghost", attrs: 'data-goto="clean:normal"' }));
    return "";
  }
  function spaceView() {
    const { s, total, reminder } = spaceNums();
    const scale = total / D.space.total;
    const segs = [...D.kinds.map((k) => ({ hue: `var(--mark-${k.hue})`, name: T(k.name), v: D.space.byKind[k.id] })), { hue: "var(--muted)", name: L("附件与图片", "Files & images"), v: D.space.byKind.files }];
    const bar = s === "counting" ? "" : `<div data-new="${esc(NEW_BAR())}"><div class="wr-seg" role="img" aria-label="${L("按种类的占用", "Usage by kind")}">${segs.map((x) => `<i style="--wr-hue:${x.hue};flex:${x.v}"></i>`).join("")}</div><ul class="wr-legend">${segs.map((x) => `<li style="--wr-hue:${x.hue}">${x.name} <b>${(x.v * scale).toFixed(2)} GB</b></li>`).join("")}</ul></div>`;
    const stat = s === "counting"
      ? `<article class="mw-stat" data-cat="Stat"><p>${L("工作记录占用", "Used by work records")}</p><div class="mw-ix-actions">${spinner(L("正在计算", "Counting"))}<span>${L("正在计算…上次 1.79 GB（11 月 2 日）", "Counting… last 1.79 GB (Nov 2)")}</span></div></article>`
      : `<article class="mw-stat" data-cat="Stat"><p>${L("工作记录占用", "Used by work records")}</p><strong>${total.toFixed(2)}<small>GB</small></strong><p class="mw-stat__delta">${L("6 月 2 日以来 · 3 个项目", "Since Jun 2 · 3 projects")}</p>${bar}</article>`;
    const on = reminder != null || S.editingReminder;
    const value = S.editingReminder ? S.reminderDraft : reminder;
    const num = `<div class="mw-number" data-slot="number-field" data-cat="Number Field">${iconBtn(L("减少", "Decrease"), "minus", 'data-step="-0.5"')}<input class="mw-input" data-slot="input" type="number" id="remIn" value="${value}" min="0.5" step="0.5" aria-label="GB">${iconBtn(L("增加", "Increase"), "plus", 'data-step="0.5"')}</div>`;
    const remCtl = on ? `${num}<span class="wr-sub">GB</span>${S.editingReminder ? btn(L("保存", "Save"), { v: "primary", attrs: 'data-act="remSave"' }) : ""}${sw(true, 'data-act="remToggle" aria-labelledby="wr-rem"')}` : sw(false, 'data-act="remToggle" aria-labelledby="wr-rem"');
    const remRow = setting("wr-rem", L("用量到这个数时提醒我", "Remind me when usage reaches"), on ? L("提醒线不是上限：到了只提醒，不会删记录。", "A reminder is not a limit: reaching it only reminds you, nothing is deleted.") : L("默认不设：没有上限，也不提醒。", "Off by default: no limit and no reminder."), remCtl);
    const meter = reminder != null && s !== "counting" && !S.editingReminder
      ? setting("wr-meter", L(`已到提醒线的 ${Math.round(total / reminder * 100)}%`, `${Math.round(total / reminder * 100)}% of the reminder`), "", `<meter class="mw-meter" data-slot="meter" data-cat="Meter" min="0" max="${reminder}" value="${Math.min(total, reminder)}" aria-labelledby="wr-meter">${total}/${reminder}</meter>`) : "";
    const expiry = setting("wr-expiry", L("到期清理", "Automatic clean-up"), L("一直保留（默认）。和提醒线分开设。", "Keep (default). Set separately from the reminder."), btn(L("去设置", "Change"), { attrs: 'data-goto="clean:normal"' }));
    return `${spaceTop()}${stat}
      <section><h2>${L("容量提醒", "Space reminder")}</h2>${settings(remRow + meter)}</section>
      <section><h2>${L("清理", "Clean-up")}</h2>${settings(expiry)}</section>`;
  }

  // ---------- Block 4 · Coverage & gaps (B, gaps first) ----------
  const srcName = (id) => (id === "*" ? L("全部来源", "All sources") : T(D.sources.find((x) => x.id === id).name));
  const visibleSources = () => D.sources.filter((x) => S.filter === "all" || x.kind === S.filter);
  function gridState() {
    const g = JSON.parse(JSON.stringify(D.grid));
    for (const gap of D.gapSets[state()]) if (gap.src !== "*" && gap.st !== "none") g[gap.src][gap.kind] = gap.st;
    return g;
  }
  function gapsView() {
    const s = state();
    const set = D.gapSets[s].filter((gap) => gap.src === "*" || visibleSources().some((x) => x.id === gap.src));
    const all = D.gapSets[s];
    const attnAll = all.filter((g) => !["none", "masked"].includes(g.st)).length;
    const none = all.filter((g) => g.st === "none").length;
    const head = s === "cleared" ? alert("info", L("8 月 4 日以前的记录已清除", "Records before Aug 4 were cleared"), L(`那段时间在回看和评测里显示为「到期清除」· ${none} 处还没接入`, `That period shows as “Cleared” in look-back and evaluation · ${none} not connected yet`))
      : attnAll ? alert("warning", L(`${attnAll} 处需要注意`, `${attnAll} need attention`), L(`完整记录从 10 月 12 日开始 · ${none} 处还没接入`, `Complete since Oct 12 · ${none} not connected yet`))
      : settings(setting("wr-cov", L("接上的地方都记全了", "Everything connected is complete"), L(`完整记录从 10 月 12 日开始 · ${none} 处还没接入`, `Complete since Oct 12 · ${none} not connected yet`), status(L("完整", "Complete"), "done")));
    const f = [["all", L("全部", "All")], ["entry", L("入口", "Entries")], ["plugin", L("插件", "Plugins")], ["bg", L("后台", "Background")]];
    const filter = `<div class="wr-filter"><div class="mw-toggle-group" data-slot="toggle-group" data-cat="Toggle Group" role="group" aria-label="${L("来源", "Sources")}">${f.map(([id, n]) => `<button type="button" class="mw-toggle${S.filter === id ? " is-current" : ""}" aria-pressed="${S.filter === id}" data-filter="${id}">${n}</button>`).join("")}</div>${select('aria-label="' + L("版本", "Version") + '"', opts([["all", L("全部版本", "All versions")], ["093", L("0.9.3 以后", "Since 0.9.3")]], "all"))}</div>`;
    const row = (gap, key) => {
      const open = !!S.open[key];
      const k = gap.kind === "*" ? null : kind(gap.kind);
      const more = open ? `<div><b>${L("影响", "Effect")}</b>${T(gap.affects)}</div>${gap.act ? `<div class="mw-ix-actions">${btn(T(gap.act), { attrs: gap.act[0] === "看占用" ? 'data-goto="space:disk"' : 'data-act="noop"' })}</div>` : ""}` : "";
      return item(k ? kindMark(k) : plainMark("database"), `${srcName(gap.src)}${k ? ` · ${T(k.name)}` : ""}`, `${T(gap.span)} · ${T(gap.cause)}`, st(gap.st) + iconBtn(open ? L("收起", "Collapse") : L("展开", "Expand"), open ? "chevron-down" : "chevron-right", `aria-expanded="${open}" data-open="${key}"`), more);
    };
    const attn = set.filter((g) => g.st !== "none"), notYet = set.filter((g) => g.st === "none");
    const g = gridState();
    const okRows = visibleSources().filter((src) => D.kinds.some((k) => g[src.id][k.id] === "ok"));
    let okCount = 0, naCount = 0;
    visibleSources().forEach((src) => D.kinds.forEach((k) => { const c = g[src.id][k.id]; if (c === "ok") okCount++; else if (c === "na" || c === "rule") naCount++; }));
    const okBody = `<ul class="mw-items">${okRows.map((src) => item(plainMark("check"), T(src.name), D.kinds.filter((k) => g[src.id][k.id] === "ok").map((k) => T(k.name)).join(L("、", ", ")), "")).join("")}</ul>`;
    const naBody = `<p class="wr-sub">${L("这些地方本来就没有这类事，比如命令行里没有「给你看的建议」。不算缺记录。", "This kind of work doesn't happen there — e.g. the command line shows no suggestions. Not a missing record.")}</p>`;
    return `${head}${filter}
      ${attn.length ? `<section><h2>${L("需要注意", "Needs attention")}</h2><ul class="mw-items">${attn.map((x, i) => row(x, `gap-${s}-${i}`)).join("")}</ul></section>` : ""}
      ${notYet.length ? `<section><h2>${L("还没接入", "Not connected yet")}</h2><ul class="mw-items">${notYet.map((x, i) => row(x, `none-${s}-${i}`)).join("")}</ul></section>` : ""}
      <section>${collapsible(L(`完整 · ${okCount} 处`, `Complete · ${okCount}`), okBody, !!S.open.okList, "okList")}${collapsible(L(`不适用 · ${naCount} 处`, `Not applicable · ${naCount}`), naBody, !!S.open.naList, "naList")}</section>`;
  }

  // ---------- Render & events ----------
  const VIEWS = { scope: scopeView, clean: cleanView, space: spaceView, gaps: gapsView };
  function render() {
    strip();
    app.innerHTML = page(VIEWS[S.block]());
    const seen = new Set(); // 「标出组件」时同一种新增只在第一处写理由
    app.querySelectorAll("[data-new]").forEach((el) => { if (seen.has(el.dataset.new)) el.classList.add("rep"); seen.add(el.dataset.new); });
    const dlg = app.querySelector("[data-wr-dialog]");
    if (dlg && !dlg.open) { try { dlg.showModal(); } catch { dlg.setAttribute("open", ""); } }
    save();
  }
  function goto(spec) { const [b, s] = spec.split(":"); S.block = b; S.state[b] = s; S.dlg = false; render(); }
  function announce(msg) { document.getElementById("live").textContent = msg; }

  document.getElementById("block").addEventListener("change", (e) => { S.block = e.target.value; S.dlg = false; render(); });
  document.getElementById("state").addEventListener("change", (e) => { S.state[S.block] = e.target.value; S.dlg = false; render(); });
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("cat").addEventListener("click", () => { S.cat = !S.cat; render(); });
  document.getElementById("reset").addEventListener("click", () => { S = { ...fresh(), lang: S.lang, theme: S.theme }; render(); });

  app.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("a[href='#']")) { e.preventDefault(); return; }
    const tab = t.closest("[data-tab]"); if (tab) { S.block = tab.dataset.tab; S.dlg = false; render(); return; }
    const g = t.closest("[data-goto]"); if (g) { goto(g.dataset.goto); return; }
    const f = t.closest("[data-filter]"); if (f) { S.filter = f.dataset.filter; render(); return; }
    const step = t.closest("[data-step]"); if (step) { const v = Math.max(0.5, Number(S.editingReminder ? S.reminderDraft : (spaceNums().reminder ?? 2)) + Number(step.dataset.step)); S.reminderDraft = v; S.editingReminder = true; render(); return; }
    const o = t.closest("[data-open]"); if (o) { S.open[o.dataset.open] = !S.open[o.dataset.open]; render(); return; }
    const a = t.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "pause") { S.state.scope = "paused"; announce(L("已暂停记录", "Recording paused")); }
    else if (act === "resume") { S.state.scope = "normal"; announce(L("继续记录", "Recording resumed")); }
    else if (act === "keep") { S.period = "keep"; S.state.clean = "normal"; }
    else if (act === "dlg") S.dlg = true;
    else if (act === "dlgx") { e.preventDefault(); S.dlg = false; if (S.state.clean === "dialog") S.state.clean = "normal"; }
    else if (act === "dlgok") { e.preventDefault(); S.dlg = false; S.state.clean = "running"; render(); setTimeout(() => { if (S.state.clean === "running") { S.state.clean = "after"; render(); } }, 1800); return; }
    else if (act === "editRem") { S.block = "space"; S.editingReminder = true; S.reminderDraft = spaceNums().reminder ?? 2; }
    else if (act === "remSave") { const v = parseFloat(document.getElementById("remIn").value); if (v > 0) { S.reminder = Math.round(v * 10) / 10; S.editingReminder = false; if (["near", "over"].includes(S.state.space)) S.state.space = "normal"; announce(L(`提醒线已设为 ${S.reminder} GB`, `Reminder set to ${S.reminder} GB`)); } }
    else if (act === "noop") return;
    else return;
    render();
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "period") { S.period = t.value; S.state.clean = "normal"; }
    else if (t.id === "dlgRange") S.dlgRange = t.value;
    else if (t.id === "dlgProject") S.dlgProject = t.value;
    else if (t.dataset.dk) S.dlgKinds[t.dataset.dk] = t.checked;
    else if (t.dataset.use) S.uses[t.dataset.use] = t.checked;
    else if (t.dataset.act === "remToggle") {
      if (t.checked) { S.editingReminder = true; S.reminderDraft = 2; }
      else { S.reminder = null; S.editingReminder = false; if (["near", "over"].includes(S.state.space)) S.state.space = "normal"; }
    } else if (t.id === "remIn") { S.reminderDraft = Number(t.value) || 2; S.editingReminder = true; }
    else return;
    render();
  });
  app.addEventListener("toggle", (e) => { const d = e.target; if (d.matches && d.matches("details[data-key]")) { S.open[d.dataset.key] = d.open; save(); } }, true);
  app.addEventListener("cancel", (e) => { if (e.target.matches("[data-wr-dialog]")) { e.preventDefault(); S.dlg = false; if (S.state.clean === "dialog") S.state.clean = "normal"; render(); } }, true);

  render();
})();
