// 25 / 26 · Running status, a part temporarily unavailable, update and rollback, install self-check, upgrade failure
// and recovery — the approved scheme A of each topic, rebuilt on the component board's real parts (2026-11-04).
// Frames are the product's own: the arrival frame and workbench bar (../_catalog/dist/arrival.css) and the settings
// page (../_catalog/dist/settings.css). Only the macOS menu bar and desktop are drawn by the prototype (they are the
// system's, not ours). Every version, task, component and file is sample data; nothing runs, upgrades, signs or touches a Home.
(() => {
  const app = document.getElementById("app");
  const KEY = "molis-proto.runtime-and-recovery.v2";

  const TOPICS = {
    run: { name: ["运行状态（25）", "Running status (25)"], scheme: ["菜单栏面板", "Menu bar panel"],
      states: [["resident", ["窗口关着，仍在运行", "Window closed, still running"]], ["woke", ["刚从睡眠醒来，错过 2 件", "Just woke, 2 missed"]], ["relaunch", ["退出后再打开", "Reopened after quitting"]], ["offline", ["没联网", "Offline"]], ["nomodel", ["模型连不上", "Model unreachable"]]] },
    owner: { name: ["某块暂不可用（25）", "A part unavailable (25)"], scheme: ["就地说明", "In place"],
      states: [["failed", ["升级没成功", "Upgrade failed"]], ["newer", ["数据来自更新的版本", "Data from a newer version"]], ["old", ["插件需要更新", "Plugin needs an update"]]] },
    update: { name: ["更新与回退（25）", "Update and rollback (25)"], scheme: ["设置 › 更新", "Settings › Update"],
      states: [["ready", ["新版已演练通过", "New version rehearsed"]], ["rehearsing", ["正在副本上演练", "Rehearsing on a copy"]], ["rfail", ["演练没通过", "Rehearsal failed"]], ["starting", ["重启后正在升级", "Upgrading at launch"]], ["rolled", ["已回到上一版", "Rolled back"]]] },
    install: { name: ["安装与自检（26）", "Install and self-check (26)"], scheme: ["开场时检查，只报问题", "Checked during the opening"],
      states: [["ok", ["全部通过", "All good"]], ["missing", ["缺一个组件", "One component missing"]], ["fixfail", ["修复没成功", "Repair failed"]]] },
    recover: { name: ["升级失败与恢复（26）", "Upgrade failure and recovery (26)"], scheme: ["不挡启动，进来后说", "Don't block, tell inside"],
      states: [["interrupted", ["上次升级没做完", "Last upgrade interrupted"]], ["crashed", ["上次意外退出", "Quit unexpectedly last time"]], ["export", ["导出诊断", "Export diagnostics"]]] },
  };

  const fresh = (keep = {}) => ({ topic: "run", state: "resident", lang: "zh", theme: "light", ...keep, panel: true, quitAsk: false, dlg: null, done: {}, fixing: false, fixed: false, phase: 0, saved: false, dock: false, skip: false, entered: false });
  let S;
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); S = v ? { ...fresh(), ...v } : fresh(); } catch { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* preview without storage */ } };

  const P = window.molisParts(() => S.lang);
  const { esc, ic, act, btn, choices, status, badge, alert, progress, monogram, row, rows, kind, barStatus, wordmark, caption, toast } = P;
  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (p) => (Array.isArray(p) ? (S.lang === "zh" ? p[0] : p[1]) : p);
  const diagId = (id = "D-7F3A21") => btn({ variant: "ghost", size: "sm", icon: "clipboard", label: id, aria: L(`复制诊断编号 ${id}`, `Copy diagnostic ID ${id}`), attrs: act("toast", L("诊断编号已复制", "Diagnostic ID copied")) });
  const actions = (...b) => `<div class="q-row">${b.join("")}</div>`;
  let timers = [];
  const later = (ms, fn) => { timers.push(setTimeout(() => { fn(); render(); }, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- Shared sample facts ----------
  const NEXT = () => [
    ["clock", "pink", L("AI 产品观察 · 第二期", "AI product watch · issue 2"), L("周一 9:00", "Mon 9:00")],
    ["sparkles", "purple", L("跟进：Anna 的报价", "Follow up: Anna's quote"), L("今天 17:00", "Today 17:00")],
    ["rss", "cyan", L("Feed 刷新 14 个订阅源", "Feed refreshes 14 sources"), L("每小时", "Hourly")],
  ];
  const MISSED = () => [["m1", "rss", "cyan", L("Feed 刷新", "Feed refresh"), "02:00"], ["m2", "clock", "pink", L("每日摘要", "Daily digest"), "07:00"]];

  // ---------- Frames: the product's arrival frame, workbench bar and settings page ----------
  const titlebar = () => `<header class="arrival-titlebar" data-region="titlebar"><span class="arrival-brand">${ic("brand")}${wordmark(' data-state="done"')}</span><span class="arrival-spacer"></span><nav class="arrival-tools"></nav></header>`;
  function workBar(active = "home", marks = {}) {
    const pins = [["home", "home", L("项目首页", "Project home")], ["pages", "note", "Pages"], ["feed", "rss", "Feed"]]; // three pins, as the product bar fits them at 1024
    return `<div class="workbench-bar" data-dock aria-label="${L("底栏", "Bottom bar")}">
      <div class="bar-start"><div class="plugin-picker"><button class="plugin-picker-trigger" type="button" aria-expanded="false" aria-label="${L("全部插件与 Dock", "All plugins and Dock")}"${P.attrs(act("toast", L("插件切换（原型不展开）", "Plugin switcher (not built)")))}><span class="plugin-picker-all" aria-hidden="true">${ic("grid")}</span><span class="plugin-picker-current">${ic("home")}<span>${L("项目首页", "Project home")}</span></span>${ic("chevron-down")}</button></div><div class="dock-pins" role="toolbar" aria-label="${L("常驻插件", "Kept plugins")}">${pins.map(([id, g, t]) => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}${marks[id] ? ` cand-pin-dot${marks[id] === "info" ? " is-info" : ""}` : ""}" aria-label="${t}${marks[id] ? ` · ${L("暂不可用", "Unavailable")}` : ""}" title="${t}"${active === id ? ' aria-current="page"' : ""}${P.attrs(act("open", id))}>${ic(g)}</button>`).join("")}</div></div>
      <div class="bar-center"><form class="assistant-composer bar-composer" aria-label="Molis Work Assistant" onsubmit="return false"><input class="assistant-composer-input" type="text" autocomplete="off" placeholder="${L("让助理做点什么…", "Ask the Assistant…")}" aria-label="${L("发给助理", "Message the Assistant")}"><button class="bar-composer-attach" type="button" aria-label="${L("添加文件、引用或能力", "Add files, references or capabilities")}">${ic("paperclip")}</button>${btn({ variant: "primary", size: "sm", only: true, icon: "send", label: L("发送", "Send"), disabled: true })}</form></div>
      <div class="bar-end"><section class="workspace-chrome project-island titlebar-chrome navigator-project" aria-label="${L("当前项目", "Current project")}"><div class="navigator-project-primary"><details class="navigator-project-menu"><summary class="navigator-project-selector" aria-label="${L("切换项目", "Switch project")}">${monogram("A")}<strong>${L("AI 产品观察", "AI product watch")}</strong>${ic("chevron-down")}</summary></details></div></section></div></div>`;
  }
  const wb = (content, o = {}) => ({ page: "arrival", html: `<div class="arrival" data-workspace data-screen="work">${titlebar()}<main class="arrival-stage"><div class="stage-single"><div class="stage-sheet"><div class="land-scroll" data-scroll>${content}</div></div></div></main>${workBar(o.active, o.marks)}</div>` });
  const primary = (label, a, disabled = false) => btn({ variant: "primary", size: "lg", label, key: "↵", cls: "ob-continue", disabled, attrs: { id: "primary", ...act(a), "aria-keyshortcuts": "Enter" } });
  // The opening, with the bar's middle saying what is happening (mw-bar-status).
  const opening = (status, end = "") => ({ page: "arrival", html: `<div class="arrival" data-workspace data-screen="opening"><header class="arrival-titlebar" data-region="titlebar"><span class="arrival-brand">${ic("brand")}</span><span class="arrival-spacer"></span></header>
    <main class="arrival-stage"><div class="stage-single"><div class="stage-sheet opening is-ready is-done" data-view="opening"><div class="opening-glow" aria-hidden="true"></div><div class="opening-copy"><div class="opening-caption">${caption()}</div><h1 class="ob-greeting-wordmark" id="ob-title" tabindex="-1">${wordmark(' data-state="done"')}</h1></div></div></div></main>
    <div class="workbench-bar arrival-bar" data-dock data-bar="welcome"><div class="bar-start"></div><div class="bar-center">${status}</div><div class="bar-end">${end}</div></div></div>` });
  function settings(active, body) {
    const groups = [[L("本机", "On this Mac"), [["appearance", "sun", L("界面与语言", "Interface & language")], ["directories", "folder", L("本机目录", "Local folders")]]],
      ["AI", [["models", "key", L("模型", "Models")], ["assistant", "message", L("助理", "Assistant")]]],
      [L("系统", "System"), [["update", "download", L("更新", "Update")], ["diagnostics", "bug", L("诊断", "Diagnostics")]]]];
    const nav = groups.map(([g, items]) => `<div class="settings-nav-group-label">${g}</div>${items.map(([id, g2, n]) => `<a href="#"${id === active ? ' aria-current="page"' : ""}${P.attrs(act("toast", L("原型只画了这一页", "Only this page is drawn")))}>${ic(g2)}${n}</a>`).join("")}`).join("");
    return { page: "settings", html: `<header class="project-preferences-chrome"><span>${L("全局设置", "Global settings")}</span><a href="#" aria-label="${L("关闭全局设置", "Close global settings")}"${P.attrs(act("toast", L("回到项目", "Back to the project")))}>${ic("x")}</a></header>
      <main class="settings-shell"><nav class="settings-navigation settings-navigation--codex" aria-label="${L("系统设置", "System settings")}"><a class="settings-nav-back" href="#"${P.attrs(act("toast", L("回到项目", "Back to the project")))}>${ic("arrow")} ${L("返回项目", "Return to project")}</a><div class="settings-nav-body">${nav}</div></nav>
      <div class="settings-content"><section class="settings-document" aria-labelledby="settings-title">${body}</section></div></main>` };
  }
  const setHead = (title, sub = "") => `<header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title" tabindex="-1">${title}</h1></div>${sub ? `<p>${sub}</p>` : ""}</header>`;
  const setRow = (title, sub, value) => `<section class="settings-setting-row"><div class="setting-copy"><strong>${title}</strong>${sub ? `<span>${sub}</span>` : ""}</div><div class="setting-value">${value}</div></section>`;
  const setState = (tone, text) => `<span class="settings-state settings-state--${tone}">${text}</span>`;
  function rollbackDialog() {
    return `<dialog class="mw-dialog" data-slot="dialog" aria-labelledby="dlg-title" data-proto-dialog><form method="dialog" class="mw-form mw-dialog__shell">
      <header class="mw-form__header"><div><h2 id="dlg-title">${L("回到 0.9.1？", "Go back to 0.9.1?")}</h2></div>${btn({ variant: "ghost", only: true, icon: "x", label: L("关闭", "Close"), cls: "mw-dialog__close", attrs: act("dlg-close") })}</header>
      <div class="mw-form__body">${rows([row({ icon: kind("package", "blue"), title: L("程序", "App"), end: "0.10.0 → 0.9.1" }), row({ icon: kind("database", "slate"), title: L("数据", "Data"), end: L("10-28 21:04 升级前的快照", "Snapshot before the 10-28 21:04 upgrade") })], "", "q-known")}
        ${alert("warning", L("10-28 之后写的会回到那时的样子", "Anything written after 10-28 returns to how it was"), "", `<label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" checked><span>${L("先把现在的数据另存一份", "Save a copy of current data first")}</span></label>`)}</div>
      <footer class="mw-form__footer">${btn({ size: "sm", label: L("取消", "Cancel"), attrs: act("dlg-close") })}${btn({ variant: "primary", size: "sm", label: L("回到 0.9.1", "Go back to 0.9.1"), attrs: act("rollback-do") })}</footer></form></dialog>`;
  }
  const brief = (top = "") => `<article class="mw-brief" data-slot="brief" aria-labelledby="land-title">${top}
    <div class="land-head">${monogram("A")}<h1 class="mw-brief__title" id="land-title" tabindex="-1">${L("AI 产品观察", "AI product watch")}</h1></div>
    <div class="mw-brief__cols"><section class="mw-brief__sec"><h2>${L("最近", "Recent")}</h2><div class="mw-brief__list">${row({ icon: kind("note", "green"), title: L("第一期观察", "Issue 1") })}${row({ icon: kind("check", "blue"), title: L("补完定价一节", "Finish pricing") })}</div></section>
    <section class="mw-brief__sec"><h2>${L("接下来", "Next")}</h2><div class="mw-brief__list">${NEXT().slice(0, 2).map(([i, h, n, t]) => row({ icon: kind(i, h), title: n, caption: t })).join("")}</div></section></div></article>`;

  // ---------- 25 · Running status (A: menu bar panel) ----------
  function runFacts() {
    const s = S.state;
    const missed = s === "woke" || s === "relaunch" ? MISSED().filter(([id]) => !S.done[id]) : [];
    const missedBox = missed.length
      ? alert("warning", s === "relaunch" ? L("18:02–20:40 没在运行，错过 2 件", "Not running 18:02–20:40 — 2 missed") : L("睡眠时错过 2 件", "2 missed during sleep"), "", rows(missed.map(([id, i, h, n, t]) => row({ icon: kind(i, h), title: n, caption: t, end: btn({ variant: "primary", size: "sm", label: L("现在做", "Run now"), attrs: act("missed-run", id) }) + btn({ size: "sm", label: L("跳过", "Skip"), attrs: act("missed-skip", id) }) })), "", "rr-inset"))
      : s === "woke" || s === "relaunch" ? alert("success", L("错过的都处理了", "Missed items handled")) : "";
    const checked = s === "relaunch" ? alert("success", L("已核对：Anna 已回复，不再提醒", "Checked: Anna replied — no reminder")) : "";
    const wait = s === "offline" ? alert("warning", L("没联网", "Offline"), L("要联网的 2 件先等着；本机的照常", "2 networked items wait; local work continues"))
      : s === "nomodel" ? alert("warning", L("DeepSeek 拒绝了密钥（401）", "DeepSeek refused the key (401)"), L("要模型的 2 件先等着", "2 items needing a model wait"), actions(btn({ size: "sm", label: L("换密钥", "Change key"), attrs: act("toast", L("打开 设置 › 模型", "Opens Settings › Model")) }))) : "";
    const waiting = (k) => (s === "offline" && k === 2) || (s === "nomodel" && k < 2);
    const next = `<section class="rr-sec"><h3>${L("接下来", "Next")}</h3>${rows(NEXT().map(([i, h, n, t], k) => row({ icon: kind(i, waiting(k) ? "mute" : h), title: n, end: waiting(k) ? status("wait", L("等着", "Waiting")) : `<span class="rr-fact">${t}</span>` })), "", "rr-inset")}</section>`;
    return { missedBox, checked, wait, next };
  }
  function run() {
    const f = runFacts();
    if (S.state === "relaunch") return wb(brief(`<div class="rr-stack">${f.missedBox}${f.checked}</div>`));
    const warn = S.state === "offline" || S.state === "nomodel";
    const quit = S.quitAsk ? alert("warning", L("退出后，这些不会运行", "After quitting, these won't run"), NEXT().map(([, , n, t]) => `${n} · ${t}`).join("<br>"), actions(btn({ size: "sm", label: L("取消", "Cancel"), attrs: act("quit-cancel") }), btn({ variant: "primary", size: "sm", label: L("退出", "Quit"), attrs: act("quit-do") }))) : "";
    const panel = S.panel ? `<div class="mw-popover rr-panel" role="dialog" aria-label="Molis Work">
      <header class="rr-panel__head">${ic("brand")}<strong>Molis Work</strong>${warn ? status("wait", S.state === "offline" ? L("没联网", "Offline") : L("模型连不上", "No model")) : status("done", L("运行中", "Running"))}</header>
      <div class="rr-stack">${f.missedBox}${f.wait}${f.next}${quit}</div>
      <footer class="rr-panel__foot">${btn({ variant: "primary", size: "sm", label: L("打开 Molis Work", "Open Molis Work"), attrs: act("toast", L("打开主窗口", "Opens the main window")) })}<span class="arrival-spacer"></span>${btn({ variant: "ghost", size: "sm", only: true, icon: "settings", label: L("设置", "Settings"), attrs: act("toast", L("打开 设置 › 诊断 › 后台任务", "Opens Settings › Diagnostics › Background tasks")) })}${btn({ size: "sm", icon: "x", label: L("退出", "Quit"), attrs: act("quit-ask") })}</footer></div>` : "";
    const dot = warn || f.missedBox.includes("mw-alert--warning");
    return { page: "desk", html: `<div class="mac-bar" role="presentation"><span class="mac-bar__app">Finder</span><span class="arrival-spacer"></span><button type="button" class="mac-bar__item${S.panel ? " is-on" : ""}${dot ? " cand-pin-dot" : ""}" aria-expanded="${S.panel}" aria-label="Molis Work"${P.attrs(act("panel"))}>${ic("brand")}</button><span class="mac-bar__item">${ic("globe")}</span><span class="mac-bar__time">${L("周二 09:41", "Tue 9:41")}</span></div><div class="mac-desk" aria-hidden="${S.panel}"></div>${panel}` };
  }

  // ---------- 25 · A part temporarily unavailable (A: in place) ----------
  function ownerCard() {
    const s = S.state;
    const E = (icon, _hue, title, body, acts) => `<div class="mw-empty" data-slot="empty"><span class="mw-empty__mark">${ic(icon)}</span><h2 tabindex="-1">${title}</h2><p>${body}</p><div class="mw-empty__actions">${acts}</div></div>`;
    if (s === "failed") return E("note", "green", L("Pages 暂不可用", "Pages is unavailable"), L("升级到 0.10.0 时，Pages 的数据没升级成功。数据原样留着，没有改动。", "Pages' data didn't upgrade to 0.10.0. The data is kept exactly as it was."), btn({ variant: "primary", size: "sm", label: L("回到上一版", "Go back a version"), attrs: act("dlg-open", "rollback") }) + btn({ size: "sm", label: L("发送诊断", "Send diagnostics"), attrs: act("goto-export") }) + diagId());
    if (s === "newer") return E("note", "green", L("Pages 暂不可用", "Pages is unavailable"), L("这份数据来自更新的版本（0.11）。这一版不读也不写，免得弄坏。", "This data comes from a newer version (0.11). This version neither reads nor writes it, so it stays safe."), btn({ variant: "primary", size: "sm", label: L("更新到最新版", "Update to the latest"), attrs: act("goto-update") }) + btn({ size: "sm", label: L("发送诊断", "Send diagnostics"), attrs: act("goto-export") }) + diagId("D-7F3A2C"));
    return E("rss", "cyan", L("Feed 需要更新", "Feed needs an update"), L("Feed 2.1 还不认识这一版的合同。更新到 2.3 就能用，订阅源都还在。", "Feed 2.1 doesn't know this version's contract. Update to 2.3 to use it; your sources are kept."), btn({ variant: "primary", size: "sm", label: L("更新 Feed", "Update Feed"), attrs: act("plugin-update") }));
  }
  function owner() {
    const s = S.state, who = s === "old" ? "feed" : "pages";
    const marks = { [who]: s === "old" ? "info" : "warn" };
    if (S.done.ownerFixed) return wb(alert("success", s === "old" ? L("Feed 已更新到 2.3", "Feed updated to 2.3") : L("已回到 0.9.1，Pages 照常可用", "Back on 0.9.1; Pages works again")), { active: who });
    if (S.dock === "home") {
      const plugins = `<section class="mw-brief__sec"><h2>${L("插件", "Plugins")}</h2><div class="mw-brief__list">${[["note", "green", "Pages", "pages"], ["check", "blue", "Todo", "todo"], ["rss", "cyan", "Feed", "feed"]].map(([i, h, n, id]) => row({ icon: kind(i, h), title: n, end: id === who ? (s === "old" ? badge("info", L("需要更新", "Needs update")) + btn({ variant: "primary", size: "sm", label: L("更新", "Update"), attrs: act("plugin-update") }) : badge("warning", L("暂不可用", "Unavailable"))) : status("done") })).join("")}</div></section>`;
      return wb(brief().replace("</article>", `${plugins}</article>`), { marks });
    }
    return wb(`<div class="rr-center">${ownerCard()}</div>`, { active: who, marks });
  }

  // ---------- 25 · Update and rollback (A: Settings › Update) ----------
  function update() {
    const s = S.state;
    if (s === "starting") {
      const steps = [L("程序", "App"), "Pages", "Todo", "Feed", L("助理", "Assistant")];
      const n = Math.min(S.phase, steps.length);
      return opening(n < steps.length ? barStatus({ spin: true, title: L(`正在升级到 0.10.0 · ${steps[n]}`, `Upgrading to 0.10.0 · ${steps[n]}`), caption: `${n + 1} / ${steps.length}` }) : barStatus({ icon: "check", title: L("升级完成", "Upgrade complete") }), n >= steps.length ? primary(L("进入", "Enter"), "toast") : "");
    }
    let state = "";
    if (s === "ready") state = alert("success", L("0.10.0 已用你数据的副本试过升级，通过了", "0.10.0 was rehearsed on a copy of your data and passed"), "", actions(btn({ variant: "primary", size: "sm", label: L("重启以更新", "Restart to update"), attrs: act("restart") }), btn({ size: "sm", label: L("稍后", "Later"), attrs: act("later") })));
    if (s === "rehearsing") state = alert("", L("正在用你数据的副本试升级 0.10.0", "Rehearsing 0.10.0 on a copy of your data"), L("可以照常用", "Keep working as usual"), progress(40 + S.phase * 20, 100, L("演练进度", "Rehearsal progress")));
    if (s === "rfail") state = alert("warning", L("0.10.0 在副本上没通过（Pages 的数据）", "0.10.0 failed on the copy (Pages' data)"), L("你仍在 0.9.2，什么都没变", "You're still on 0.9.2; nothing changed"), actions(btn({ size: "sm", label: L("发送诊断", "Send diagnostics"), attrs: act("goto-export") }), diagId("D-81C004")));
    if (s === "rolled") state = alert("success", L("已回到 0.9.1", "Back on 0.9.1"), L("0.10.0 先不再提示", "0.10.0 won't be offered again for now"), actions(btn({ size: "sm", label: L("撤销", "Undo"), attrs: act("toast", L("会再升级到 0.10.0（原型不展开）", "Would upgrade to 0.10.0 again (not built)")) })));
    const notes = s === "ready" ? `<section class="settings-section" aria-labelledby="notes-title"><h2 id="notes-title">${L("0.10.0 的变化", "What's in 0.10.0")}</h2><h3>${L("新功能", "New")}</h3><ul class="rr-list"><li>${L("Pages 支持表格", "Tables in Pages")}</li><li>${L("Feed 可按标签筛选", "Filter Feed by tag")}</li><li>${L("助理能读 PDF 里的图表", "The Assistant reads charts in PDFs")}</li></ul><h3>${L("要知道的", "Good to know")}</h3><ul class="rr-list"><li>${L("第一次打开 Pages 会整理一次索引，约 10 秒", "Pages re-indexes once on first open (~10 s)")}</li></ul></section>` : "";
    const back = s === "rolled" ? "" : `<section class="settings-section" aria-label="${L("回到上一版", "Go back a version")}">${setRow(L("回到上一版", "Go back a version"), L("0.9.1 · 10-28 升级前", "0.9.1 · before the 10-28 upgrade"), btn({ size: "sm", label: L("回到 0.9.1", "Go back"), attrs: act("dlg-open", "rollback") }))}</section>`;
    return settings("update", `${setHead(L("更新", "Update"))}<section class="settings-section" aria-label="${L("版本", "Version")}">${setRow(L("当前版本", "Current version"), "Molis Work", `<span class="setting-number">${s === "rolled" ? "0.9.1" : "0.9.2"}</span>`)}</section>${state}${notes}${back}`);
  }

  // ---------- 26 · Install and self-check (A: during the opening, only problems) ----------
  const COMPONENTS = ["host", "files", "voice", "sandbox", "web"];
  function install() {
    const done = S.phase >= COMPONENTS.length;
    let issue = "";
    if (done && S.state !== "ok" && !S.fixed && !S.skip) {
      issue = S.state === "fixfail" && S.done.tried
        ? alert("danger", L("修复没成功", "Repair didn't work"), L("只是转写用不了，其余照常", "Only transcription is off; everything else works"), actions(btn({ size: "sm", label: L("发送诊断", "Send diagnostics"), attrs: act("goto-export") }), btn({ size: "sm", label: L("先不用转写", "Skip transcription"), attrs: act("skip") }), diagId("D-5A01E2")))
        : alert("warning", L("转写音视频用不了：安装包里少了一个文件", "Transcription is unavailable: a file is missing from the package"), "", actions(btn({ variant: "primary", size: "sm", label: S.fixing ? L("修复中…", "Repairing…") : L("修复", "Repair"), disabled: S.fixing, attrs: act("fix") }), btn({ size: "sm", label: L("先不用转写", "Skip transcription"), attrs: act("skip") })));
    }
    const lang = choices(L("界面语言", "Interface language"), [{ label: "简体中文", on: S.lang === "zh", attrs: act("lang", "zh") }, { label: "English", on: S.lang === "en", attrs: act("lang", "en") }]);
    const exit = btn({ variant: "ghost", size: "lg", label: L("稍后", "Later"), cls: "arrival-back", attrs: act("toast", L("下次打开从这里接着", "Continues here next time")) });
    return { page: "arrival", html: `<div class="arrival" data-workspace data-screen="welcome">${titlebar()}
      <main class="arrival-stage"><div class="stage-single"><div class="stage-sheet welcome" data-view="welcome" data-step="language"><section class="welcome-q"><header class="ob-q q-head">${P.avatar(ic("sparkles"))}<h1 id="ob-title" tabindex="-1">${L("语言", "Language")}</h1></header>${lang}${issue}</section><aside class="welcome-scene" aria-hidden="true"><div class="ob-greeting"><strong lang="${S.lang}">${L("你好。", "Hello.")}</strong><span>Molis Work</span></div></aside></div></div></main>
      <div class="workbench-bar arrival-bar" data-dock data-bar="welcome"><div class="bar-start">${exit}</div><div class="bar-center">${done ? "" : barStatus({ spin: true, title: L("检查这台 Mac", "Checking this Mac"), caption: `${S.phase + 1} / ${COMPONENTS.length}` })}</div><div class="bar-end">${primary(L("继续", "Continue"), "toast")}</div></div></div>` };
  }

  // ---------- 26 · Upgrade failure and recovery (A: don't block, tell inside) ----------
  function exportPage() {
    const inc = [L("版本与平台", "Version and platform"), L("各部分的数据版本", "Data version of each part"), L("服务状态", "Service status"), L("最近 3 天的日志", "Last 3 days of logs"), L("崩溃记录 2 份", "2 crash records"), L("最近 50 次调用的编号与结果", "IDs and results of the last 50 calls")];
    const result = S.saved
      ? alert("success", "molis-diagnostics-2026-11-04.zip · 1.2 MB", L("你决定发给谁", "You decide who gets it"), actions(btn({ size: "sm", label: L("在访达中显示", "Show in Finder"), attrs: act("toast", L("打开访达（原型不展开）", "Opens Finder (not built)")) })))
      : actions(btn({ variant: "primary", size: "sm", label: L("存成文件", "Save as file"), attrs: act("save") }), btn({ size: "sm", label: L("先看看内容", "Preview contents"), attrs: act("toast", L("会列出每个文件（原型不展开）", "Lists each file (not built)")) }));
    return settings("diagnostics", `${setHead(L("诊断", "Diagnostics"))}<section class="settings-section" aria-labelledby="export-title"><h2 id="export-title">${L("导出诊断", "Export diagnostics")}</h2>${inc.map((n) => setRow(n, "", setState("success", L("包含", "Included")))).join("")}</section>
      ${alert("", L("不含：消息正文、文件内容、密钥、带用户名的路径", "Never included: message text, file contents, secrets, paths with your user name"))}${result}`);
  }
  function recover() {
    const s = S.state;
    if (s === "export") return exportPage();
    if (s === "interrupted" && !S.entered) {
      const n = Math.min(S.phase, 3);
      return opening(n < 3 ? barStatus({ spin: true, title: L("接着完成上次的升级", "Finishing the last upgrade"), caption: `${n + 1} / 3` }) : barStatus({ icon: "check", title: L("升级完成", "Upgrade complete") }), n >= 3 ? primary(L("进入", "Enter"), "enter") : "");
    }
    const card = s === "interrupted" ? alert("success", L("上次升级没做完，已接着完成到 0.10.0", "The interrupted upgrade finished: now on 0.10.0"), "", actions(btn({ size: "sm", label: L("知道了", "Got it"), attrs: act("dismiss") })))
      : alert("warning", L("上次 10:42 意外退出，已恢复", "Quit unexpectedly at 10:42 — recovered"), L("没写完的草稿都在", "Unfinished drafts are kept"), actions(btn({ size: "sm", label: L("发送诊断", "Send diagnostics"), attrs: act("goto-export") }), btn({ size: "sm", label: L("知道了", "Got it"), attrs: act("dismiss") }), diagId("D-C2410B")));
    return wb(brief(S.done.dismissed ? "" : `<div class="rr-stack">${card}</div>`));
  }

  // ---------- Render ----------
  function proto() {
    const t = TOPICS[S.topic];
    document.getElementById("p-title").textContent = L("原型 · 模拟数据", "Prototype · sample data");
    document.getElementById("p-topic").textContent = L("话题", "Topic");
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("p-scheme").textContent = `${L("已定方案 A", "Chosen: A")} · ${T(t.scheme)}`;
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
  function startTimers() {
    clearTimers();
    const counting = S.topic === "install" || (S.topic === "update" && (S.state === "starting" || S.state === "rehearsing")) || (S.topic === "recover" && S.state === "interrupted");
    if (!counting) return;
    const max = S.topic === "install" ? 5 : S.topic === "recover" ? 3 : S.state === "rehearsing" ? 3 : 5;
    for (let i = S.phase + 1; i <= max; i++) later((i - S.phase) * 650, () => { S.phase = Math.max(S.phase, i); });
  }
  const BODY = { arrival: "arrival-page immersive-workbench", desk: "arrival-page immersive-workbench rr-desk-page", settings: "settings-page project-preferences-page global-preferences-page" };
  let lastView = null;
  function render() {
    try { localStorage.setItem("molis-work:theme", S.theme); } catch { /* preview without storage */ }
    window.molisWorkPreferences?.sync();
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    proto();
    const view = { run, owner, update, install, recover }[S.topic]();
    // The product draws settings with its own stylesheet; switch sheets the way the product switches pages.
    document.getElementById("css-arrival").disabled = view.page === "settings";
    document.getElementById("css-settings").disabled = view.page !== "settings";
    document.body.className = `${BODY[view.page]} proto-on`;
    app.innerHTML = view.html + (S.dlg === "rollback" ? rollbackDialog() : "");
    app.querySelector("[data-proto-dialog]")?.showModal();
    const key = `${S.topic}|${S.state}|${view.page}`;
    if (key !== lastView) app.querySelector("h1[tabindex], .mw-empty h2")?.focus({ preventScroll: true });
    lastView = key;
    app.querySelectorAll(".opening-caption [data-caption]").forEach((c) => window.molisArrival?.mountCaption(c));
    save();
  }
  function reset(patch = {}) { clearTimers(); S = { ...fresh({ topic: S.topic, state: S.state, lang: S.lang, theme: S.theme }), ...patch }; render(); startTimers(); }

  document.getElementById("topic").addEventListener("change", (e) => reset({ topic: e.target.value, state: TOPICS[e.target.value].states[0][0] }));
  document.getElementById("state").addEventListener("change", (e) => reset({ state: e.target.value }));
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("reset").addEventListener("click", () => reset());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.quitAsk) { S.quitAsk = false; render(); return; }
    if (e.key === "Enter" && !["BUTTON", "INPUT", "SELECT", "A", "SUMMARY"].includes(e.target.tagName)) { const p = document.getElementById("primary"); if (p && !p.disabled) { e.preventDefault(); p.click(); } }
  });
  app.addEventListener("close", () => { if (S.dlg) { S.dlg = null; save(); } }, true);
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    e.preventDefault();
    const a = b.dataset.act, arg = b.dataset.arg;
    const A = {
      toast() { toast(arg); },
      panel() { S.panel = !S.panel; S.quitAsk = false; },
      "quit-ask"() { S.quitAsk = true; },
      "quit-cancel"() { S.quitAsk = false; },
      "quit-do"() { S.quitAsk = false; S.panel = false; toast(L("已退出（原型：再选「退出后再打开」看下次打开）", "Quit (prototype: pick “Reopened after quitting”)")); },
      "missed-run"() { S.done[arg] = "run"; toast(L("已开始，结果会出现在原处", "Started; the result appears where it belongs")); },
      "missed-skip"() { S.done[arg] = "skip"; },
      open() { S.dock = arg === "home" ? "home" : false; },
      "dlg-open"() { S.dlg = arg; },
      "dlg-close"() { S.dlg = null; },
      "rollback-do"() { S.dlg = null; if (S.topic === "owner") S.done.ownerFixed = true; else S.state = "rolled"; toast(L("已另存一份，并回到 0.9.1", "Saved a copy and went back to 0.9.1")); },
      "plugin-update"() { S.done.ownerFixed = true; },
      "goto-export"() { clearTimers(); S = { ...fresh({ lang: S.lang, theme: S.theme }), topic: "recover", state: "export" }; },
      "goto-update"() { clearTimers(); S = { ...fresh({ lang: S.lang, theme: S.theme }), topic: "update", state: "ready" }; },
      restart() { S.state = "starting"; S.phase = 0; render(); startTimers(); },
      later() { toast(L("下次打开时再提示", "Reminds you next launch")); },
      fix() { S.fixing = true; later(1200, () => { S.fixing = false; if (S.state === "fixfail") S.done.tried = true; else S.fixed = true; }); },
      skip() { S.skip = true; toast(L("转写先关着；在 设置 › 诊断 里随时修复", "Transcription is off; repair any time in Settings › Diagnostics")); },
      enter() { S.entered = true; },
      dismiss() { S.done.dismissed = true; },
      save() { S.saved = true; },
      lang() { S.lang = arg; },
    };
    if (A[a]) { A[a](); if (a !== "toast" && a !== "restart") render(); }
  });

  render(); startTimers();
  window.protoJump = (p) => { clearTimers(); Object.assign(S, p); render(); };
})();
