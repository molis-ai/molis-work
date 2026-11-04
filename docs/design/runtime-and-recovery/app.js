// 25 / 26 · Running status, a part temporarily unavailable, update and rollback, install self-check, upgrade failure and recovery.
// Design prototype only: every version, task, component and file below is sample data. Nothing runs, upgrades, signs or touches a Home.
// Same rules as the approved 04 onboarding: the layout explains; words keep to the fact, the reason and the way out.
(() => {
  document.getElementById("icons").innerHTML = window.protoIcons;
  const app = document.getElementById("app");
  const KEY = "molis-proto.runtime-and-recovery.v1";

  const TOPICS = {
    run: { name: ["运行状态（25）", "Running status (25)"], schemes: [["a", ["菜单栏面板", "Menu bar panel"]], ["b", ["设置 › 运行", "Settings › Running"]]],
      states: [["resident", ["窗口关着，仍在运行", "Window closed, still running"]], ["woke", ["刚从睡眠醒来，错过 2 件", "Just woke, 2 missed"]], ["relaunch", ["退出后再打开", "Reopened after quitting"]], ["offline", ["没联网", "Offline"]], ["nomodel", ["模型连不上", "Model unreachable"]]] },
    owner: { name: ["某块暂不可用（25）", "A part unavailable (25)"], schemes: [["a", ["就地说明", "In place"]], ["b", ["顶部提示条", "Top strip"]]],
      states: [["failed", ["升级没成功", "Upgrade failed"]], ["newer", ["数据来自更新的版本", "Data from a newer version"]], ["old", ["插件需要更新", "Plugin needs an update"]]] },
    update: { name: ["更新与回退（25）", "Update and rollback (25)"], schemes: [["a", ["设置 › 更新", "Settings › Update"]], ["b", ["底栏提示", "Bottom-bar prompt"]]],
      states: [["ready", ["新版已演练通过", "New version rehearsed"]], ["rehearsing", ["正在副本上演练", "Rehearsing on a copy"]], ["rfail", ["演练没通过", "Rehearsal failed"]], ["starting", ["重启后正在升级", "Upgrading at launch"]], ["rolled", ["已回到上一版", "Rolled back"]]] },
    install: { name: ["安装与自检（26）", "Install and self-check (26)"], schemes: [["a", ["开场时检查，只报问题", "Checked during the opening"]], ["b", ["单独一步", "A step of its own"]]],
      states: [["ok", ["全部通过", "All good"]], ["missing", ["缺一个组件", "One component missing"]], ["fixfail", ["修复没成功", "Repair failed"]]] },
    recover: { name: ["升级失败与恢复（26）", "Upgrade failure and recovery (26)"], schemes: [["a", ["不挡启动，进来后说", "Don't block, tell inside"]], ["b", ["启动时先说", "Tell at launch"]]],
      states: [["interrupted", ["上次升级没做完", "Last upgrade interrupted"]], ["crashed", ["上次意外退出", "Quit unexpectedly last time"]], ["export", ["导出诊断", "Export diagnostics"]]] },
  };

  const fresh = (keep = {}) => ({ topic: "run", scheme: "a", state: "resident", lang: "zh", theme: "light", ...keep, panel: true, quitAsk: false, dlg: null, done: {}, fixing: false, fixed: false, phase: 0, saved: false, dock: false, skip: false, entered: false });
  let S;
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); S = v ? { ...fresh(), ...v } : fresh(); } catch { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* preview without storage */ } };

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (p) => (Array.isArray(p) ? (S.lang === "zh" ? p[0] : p[1]) : p);
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const tile = (icon, hue, cls = "") => `<span class="tile ${cls}" style="--hue:var(--hue-${hue})" aria-hidden="true">${ic(icon, "sm")}</span>`;
  const st = (kind, text = "") => `<span class="st ${kind}">${kind === "run" ? '<span class="spin" aria-hidden="true"></span>' : ic({ done: "status-done", fail: "status-blocked", wait: "status-waiting", todo: "dot" }[kind], "sm")}${text}</span>`;
  const BRAND_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.5" r="4.5"/><circle cx="8" cy="15.5" r="4.5"/><circle cx="16" cy="15.5" r="4.5"/></svg>`;
  const BRAND = `<span class="a-brand">${BRAND_SVG}Molis Work</span>`;
  const btn = (label, act, cls = "sec", arg = "") => `<button class="btn ${cls}" data-act="${act}" ${arg ? `data-arg="${arg}"` : ""}>${label}</button>`;
  const diagId = (id = "D-7F3A21") => `<button class="diag" data-act="toast" data-arg="${L("诊断编号已复制", "Diagnostic ID copied")}" title="${L("复制诊断编号", "Copy diagnostic ID")}">${ic("clipboard", "sm")}${id}</button>`;
  const box = (kind, icon, title, body = "", acts = "") => `<div class="bx ${kind}">${ic(icon, "sm")}<div class="bx-b"><b>${title}</b>${body ? `<p>${body}</p>` : ""}${acts ? `<div class="acts">${acts}</div>` : ""}</div></div>`;
  let toastT;
  function toast(m) { document.querySelectorAll(".toast").forEach((x) => x.remove()); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = m; document.body.append(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 2800); }
  let timers = [];
  const later = (ms, fn) => { timers.push(setTimeout(() => { fn(); render(); }, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- Shared sample facts ----------
  const NEXT = () => [
    ["clock", "rose", L("AI 产品观察 · 第二期", "AI product watch · issue 2"), L("周一 9:00", "Mon 9:00")],
    ["sparkles", "violet", L("跟进：Anna 的报价", "Follow up: Anna's quote"), L("今天 17:00", "Today 17:00")],
    ["rows", "teal", L("Feed 刷新 14 个订阅源", "Feed refreshes 14 sources"), L("每小时", "Hourly")],
  ];
  const MISSED = () => [
    ["m1", "rows", "teal", L("Feed 刷新", "Feed refresh"), "02:00"],
    ["m2", "clock", "rose", L("每日摘要", "Daily digest"), "07:00"],
  ];

  // ---------- Frames ----------
  function macbar(dot) {
    return `<div class="macbar" role="presentation"><span class="mb-app"><b></b>Finder</span><span class="mb-sp"></span>
      <button class="mb-ic ${S.panel ? "on" : ""}" data-act="panel" aria-expanded="${S.panel}" aria-label="Molis Work">${BRAND_SVG}${dot ? `<i class="mb-dot ${dot}"></i>` : ""}</button>
      <span class="mb-ic plain">${ic("globe", "sm")}</span><span class="mb-time">${L("周二 09:41", "Tue 9:41")}</span></div>`;
  }
  function dock(active, marks = {}) {
    const items = [["home", "home", "slate", L("首页", "Home")], ["pages", "note", "green", "Pages"], ["todo", "check", "blue", "Todo"], ["feed", "rows", "teal", "Feed"]];
    return `<div class="tray dk-tray">${items.map(([id, icn, hue, n]) => `<button class="dk" data-act="open" data-arg="${id}" ${active === id ? 'aria-current="page"' : ""}>${tile(icn, hue)}<span>${n}</span>${marks[id] ? `<i class="dk-dot ${marks[id]}" aria-label="${L("暂不可用", "Unavailable")}"></i>` : ""}</button>`).join("")}</div>`;
  }
  function wb(content, { tab = L("AI 产品观察", "AI product watch"), tabIcon = "home", active = "home", marks = {}, barExtra = "", sheetCls = "" } = {}) {
    return `<div class="arrival work ${S.topic === "run" && S.scheme === "a" ? "under-mac" : ""}" data-screen="work"><header class="a-title">${BRAND}<span class="a-tab">${ic(tabIcon, "sm")}<span>${tab}</span></span><span class="a-spacer"></span></header>
      <main class="a-stage"><div class="sheet ${sheetCls}"><div class="scroll">${content}</div>${S.dlg ? dialog() : ""}</div></main>
      <footer class="a-bar wbar">${dock(active, marks)}<div class="composer"><span class="ph">${L("让助理做点什么", "Ask the Assistant")}</span><button class="send" aria-label="${L("发送", "Send")}">${ic("send", "sm")}</button></div>${barExtra}<div class="tray"><span class="mono" aria-hidden="true">A</span></div></footer></div>`;
  }
  function arrivalFrame(inner, { bar = "", glow = true } = {}) {
    return `<div class="arrival" data-screen="welcome"><header class="a-title">${BRAND}<span class="a-spacer"></span></header>
      <main class="a-stage"><div class="sheet ${glow ? "glowing" : ""} ${inner.cls || ""}">${inner.html}</div></main>
      <footer class="a-bar">${bar}</footer></div>`;
  }
  const primary = (label, act, disabled = false) => `<button class="btn lg primary" id="primary" data-act="${act}" ${disabled ? "disabled" : ""} aria-keyshortcuts="Enter"><span>${label}</span><span class="kbd" aria-hidden="true">↵</span></button>`;
  const head = (title, help) => `<div class="w-head"><span class="g-av" aria-hidden="true">${ic("sparkles")}</span><h1 tabindex="-1">${title}</h1>${help ? `<button class="help-btn" data-act="toast" data-arg="${help}" aria-label="${L("说明", "Help")}">${ic("question", "sm")}</button>` : ""}</div>`;
  function settings(active, body) {
    const nav = [["general", "settings", L("常规", "General")], ["model", "sparkles", L("模型", "Model")], ["assistant", "user", L("助理", "Assistant")], ["running", "status-progress", L("运行", "Running")], ["update", "download", L("更新", "Update")], ["diag", "terminal", L("诊断", "Diagnostics")]];
    return `<div class="set"><nav class="set-nav" aria-label="${L("设置", "Settings")}">${nav.map(([id, icn, n]) => `<button class="sn" ${active === id ? 'aria-current="page"' : ""} data-act="toast" data-arg="${L("原型只画了这一页", "Only this page is drawn")}">${ic(icn, "sm")}<span>${n}</span></button>`).join("")}</nav><div class="set-body">${body}</div></div>`;
  }
  function dialog() {
    const d = S.dlg;
    if (d === "rollback") return `<div class="dlg-scrim"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-h">
      <h2 id="dlg-h">${L("回到 0.9.1？", "Go back to 0.9.1?")}</h2>
      <div class="rows">${[["package", "blue", L("程序", "App"), "0.10.0 → 0.9.1"], ["database", "slate", L("数据", "Data"), L("10-28 21:04 升级前的快照", "Snapshot before 10-28 21:04 upgrade")]].map(([i, h, k, v]) => `<div class="ln">${tile(i, h)}<span class="nm">${k}</span><span class="v">${v}</span></div>`).join("")}</div>
      ${box("warn", "alert", L("10-28 之后写的会回到那时的样子", "Anything written after 10-28 returns to how it was"), "", `<label class="ck"><input type="checkbox" checked> ${L("先把现在的数据另存一份", "Save a copy of current data first")}</label>`)}
      <div class="acts end">${btn(L("取消", "Cancel"), "dlg-close")}${btn(L("回到 0.9.1", "Go back to 0.9.1"), "rollback-do", "primary")}</div></div></div>`;
    if (d === "owner") return `<div class="dlg-scrim"><div class="dlg wide" role="dialog" aria-modal="true">${ownerCard()}<div class="acts end">${btn(L("关闭", "Close"), "dlg-close")}</div></div></div>`;
    if (d === "notes") return `<div class="pop-up" role="dialog" aria-label="${L("新版本", "New version")}">${updateCard(true)}</div>`;
    return "";
  }

  // ---------- 25 · Running status ----------
  function runFacts() {
    const s = S.state;
    const missed = (s === "woke" || s === "relaunch") ? MISSED().filter(([id]) => !S.done[id]) : [];
    const missedBox = missed.length ? `<div class="bx warn list"><div class="bx-h">${ic("history", "sm")}<b>${s === "relaunch" ? L("18:02–20:40 没在运行，错过 2 件", "Not running 18:02–20:40 — 2 missed") : L("睡眠时错过 2 件", "2 missed during sleep")}</b></div>
        ${missed.map(([id, i, h, n, t]) => `<div class="ln">${tile(i, h)}<span class="nm">${n}</span><span class="fact">${t}</span>${btn(L("现在做", "Run now"), "missed-run", "sm primary", id)}${btn(L("跳过", "Skip"), "missed-skip", "sm sec", id)}</div>`).join("")}</div>` : (s === "woke" || s === "relaunch") ? box("ok", "check", L("错过的都处理了", "Missed items handled")) : "";
    const checked = s === "relaunch" ? box("ok", "status-done", L("已核对：Anna 已回复，不再提醒", "Checked: Anna replied — no reminder")) : "";
    const wait = s === "offline" ? box("warn", "globe", L("没联网", "Offline"), L("要联网的 2 件先等着；本机的照常", "2 networked items wait; local work continues"))
      : s === "nomodel" ? box("warn", "alert", L("DeepSeek 拒绝了密钥（401）", "DeepSeek refused the key (401)"), L("要模型的 2 件先等着", "2 items needing a model wait"), btn(L("换密钥", "Change key"), "toast", "sm sec", L("打开 设置 › 模型", "Opens Settings › Model")))
      : "";
    const next = `<div class="grp"><h3>${L("接下来", "Next")}</h3><div class="panel">${NEXT().map(([i, h, n, t], k) => `<div class="ln ${(s === "offline" && k === 2) || (s === "nomodel" && k < 2) ? "is-wait" : ""}">${tile(i, h)}<span class="nm">${n}</span><span class="fact">${(s === "offline" && k === 2) || (s === "nomodel" && k < 2) ? L("等着", "Waiting") : t}</span></div>`).join("")}</div></div>`;
    return { missedBox, checked, wait, next };
  }
  function runPill() {
    return { resident: ["ok", L("运行中", "Running")], woke: ["ok", L("运行中", "Running")], relaunch: ["ok", L("运行中", "Running")], offline: ["warn", L("没联网", "Offline")], nomodel: ["warn", L("模型连不上", "No model")] }[S.state];
  }
  function runA() {
    if (S.state === "relaunch") {
      const f = runFacts();
      return `${macbar("")}${wb(`<div class="land"><header class="land-h"><span class="fm-mark xl">A</span><div class="land-t"><h1 tabindex="-1">${L("AI 产品观察", "AI product watch")}</h1></div></header>${f.missedBox}${f.checked}${f.next}</div>`)}`;
    }
    const f = runFacts(); const [pk, pt] = runPill();
    const quit = S.quitAsk ? `<div class="mp-quit">${box("warn", "alert", L("退出后，这些不会运行", "After quitting, these won't run"), NEXT().map(([, , n, t]) => `${n} · ${t}`).join("<br>"), `${btn(L("取消", "Cancel"), "quit-cancel", "sm sec")}${btn(L("退出", "Quit"), "quit-do", "sm primary")}`)}</div>` : "";
    const panel = S.panel ? `<div class="mpanel" role="dialog" aria-label="Molis Work">
      <div class="mp-h"><span class="mp-mark">${BRAND_SVG}</span><b>Molis Work</b><span class="pill ${pk}">${pk === "ok" ? '<i class="pdot"></i>' : ic("alert", "sm")}${pt}</span></div>
      ${f.missedBox}${f.wait}${f.next}
      <div class="mp-f">${btn(L("打开 Molis Work", "Open Molis Work"), "toast", "primary", L("打开主窗口", "Opens the main window"))}<button class="btn icon sec" data-act="toast" data-arg="${L("打开 设置 › 运行", "Opens Settings › Running")}" aria-label="${L("设置", "Settings")}">${ic("settings", "sm")}</button><button class="btn sec" data-act="quit-ask">${ic("x", "sm")}${L("退出", "Quit")}</button></div>${quit}</div>` : "";
    return `${macbar(pk === "warn" ? "warn" : f.missedBox ? "warn" : "")}<div class="desktop" aria-hidden="${S.panel}"><div class="wallpaper"></div></div>${panel}`;
  }
  function runB() {
    const f = runFacts(); const [pk, pt] = runPill();
    const sw = (on, label) => `<div class="ln"><span class="nm">${label}</span><button class="switch" role="switch" aria-checked="${on}" data-act="toast" data-arg="${L("原型不保存开关", "Switches aren't saved")}"><i></i></button></div>`;
    return wb(settings("running", `<header class="set-h"><h1 tabindex="-1">${L("运行", "Running")}</h1><span class="pill ${pk}">${pk === "ok" ? '<i class="pdot"></i>' : ic("alert", "sm")}${pt}</span></header>
      ${f.missedBox}${f.checked}${f.wait}${f.next}
      <div class="grp"><h3>${L("常驻", "Resident")}</h3><div class="panel">${sw(true, L("登录时启动", "Start at login"))}${sw(true, L("关掉窗口后继续运行", "Keep running when the window closes"))}</div></div>`), { tab: L("设置", "Settings"), tabIcon: "settings" });
  }

  // ---------- 25 · A part temporarily unavailable ----------
  function ownerCard() {
    const s = S.state;
    if (s === "failed") return `<div class="oc">${tile("note", "green", "xl")}<h2>${L("Pages 暂不可用", "Pages is unavailable")}</h2>${box("warn", "alert", L("升级到 0.10.0 时，Pages 的数据没升级成功", "Pages' data didn't upgrade to 0.10.0"), L("数据原样留着，没有改动", "The data is kept exactly as it was"))}<div class="acts">${btn(L("回到上一版", "Go back a version"), "dlg-open", "primary", "rollback")}${btn(L("发送诊断", "Send diagnostics"), "goto-export")}${diagId()}</div></div>`;
    if (s === "newer") return `<div class="oc">${tile("note", "green", "xl")}<h2>${L("Pages 暂不可用", "Pages is unavailable")}</h2>${box("info", "lock", L("这份数据来自更新的版本（0.11）", "This data comes from a newer version (0.11)"), L("这一版不读也不写，免得弄坏", "This version neither reads nor writes it, so it stays safe"))}<div class="acts">${btn(L("更新到最新版", "Update to the latest"), "goto-update", "primary")}${btn(L("发送诊断", "Send diagnostics"), "goto-export")}${diagId("D-7F3A2C")}</div></div>`;
    return `<div class="oc">${tile("rows", "teal", "xl")}<h2>${L("Feed 需要更新", "Feed needs an update")}</h2>${box("info", "package", L("Feed 2.1 还不认识这一版的合同", "Feed 2.1 doesn't know this version's contract"), L("更新到 2.3 就能用；订阅源都还在", "Update to 2.3 to use it; your sources are kept"))}<div class="acts">${btn(L("更新 Feed", "Update Feed"), "plugin-update", "primary")}</div></div>`;
  }
  function owner() {
    const s = S.state, who = s === "old" ? "feed" : "pages";
    const marks = { [who]: s === "old" ? "info" : "warn" };
    if (S.done.ownerFixed) return wb(`<div class="land narrow">${box("ok", "status-done", s === "old" ? L("Feed 已更新到 2.3", "Feed updated to 2.3") : L("已回到 0.9.1，Pages 照常可用", "Back on 0.9.1; Pages works again"))}</div>`, { active: who });
    const plugins = `<div class="grp"><h3>${L("插件", "Plugins")}</h3><div class="panel">${[["note", "green", "Pages", "pages"], ["check", "blue", "Todo", "todo"], ["rows", "teal", "Feed", "feed"]].map(([i, h, n, id]) => `<div class="ln">${tile(i, h)}<span class="nm">${n}</span>${id === who ? (s === "old" ? `<span class="tag">${L("需要更新", "Needs update")}</span>${btn(L("更新", "Update"), "plugin-update", "sm primary")}` : `<span class="tag warn">${L("暂不可用", "Unavailable")}</span>`) : st("done", "")}</div>`).join("")}</div></div>`;
    if (S.scheme === "a") {
      if (S.dock === "home") return wb(`<div class="land">${homeBody()}${plugins}</div>`, { marks });
      return wb(`<div class="land narrow center">${ownerCard()}</div>`, { tab: s === "old" ? "Feed" : "Pages", tabIcon: s === "old" ? "rows" : "note", active: who, marks });
    }
    const strip = `<div class="strip ${s === "old" ? "info" : "warn"}">${ic(s === "old" ? "package" : "alert", "sm")}<span>${s === "old" ? L("Feed 需要更新", "Feed needs an update") : L("Pages 暂不可用 · 其余都正常", "Pages is unavailable · everything else works")}</span>${btn(L("查看", "View"), "dlg-open", "sm sec", "owner")}</div>`;
    return wb(`${strip}<div class="land">${homeBody()}${plugins}</div>`, { marks: {} });
  }
  function homeBody() {
    return `<header class="land-h"><span class="fm-mark xl">A</span><div class="land-t"><h1 tabindex="-1">${L("AI 产品观察", "AI product watch")}</h1></div></header>
      <div class="grid2"><section class="tile-card"><h3>${L("最近", "Recent")}</h3><div class="row-link static">${tile("note", "green")}<span>${L("第一期观察", "Issue 1")}</span></div><div class="row-link static">${tile("check", "blue")}<span>${L("补完定价一节", "Finish pricing")}</span></div></section>
      <section class="tile-card"><h3>${L("接下来", "Next")}</h3>${NEXT().slice(0, 2).map(([i, h, n, t]) => `<div class="row-link static">${tile(i, h)}<span>${n}</span><span class="fact">${t}</span></div>`).join("")}</section></div>`;
  }

  // ---------- 25 · Update and rollback ----------
  const NOTES = () => `<div class="notes"><h3>${L("新功能", "New")}</h3><ul><li>${L("Pages 支持表格", "Tables in Pages")}</li><li>${L("Feed 可按标签筛选", "Filter Feed by tag")}</li><li>${L("助理能读 PDF 里的图表", "The Assistant reads charts in PDFs")}</li></ul><h3>${L("要知道的", "Good to know")}</h3><ul><li>${L("第一次打开 Pages 会整理一次索引，约 10 秒", "Pages re-indexes once on first open (~10 s)")}</li></ul></div>`;
  function updateCard(compact) {
    const s = S.state;
    const ver = `<div class="ver">${tile("package", "blue", "lg")}<div><b>Molis Work ${s === "rolled" ? "0.9.1" : "0.9.2"}</b><span>${L("当前版本", "Current version")}</span></div></div>`;
    let state = "";
    if (s === "ready") state = `${box("ok", "status-done", L("0.10.0 已用你数据的副本试过升级，通过了", "0.10.0 was rehearsed on a copy of your data and passed"), "", `${btn(L("重启以更新", "Restart to update"), "restart", "primary")}${btn(L("稍后", "Later"), "later")}`)}${NOTES()}`;
    if (s === "rehearsing") state = `<div class="bx info">${ic("refresh", "sm")}<div class="bx-b"><b>${L("正在用你数据的副本试升级 0.10.0", "Rehearsing 0.10.0 on a copy of your data")}</b><div class="bar"><i style="width:${40 + S.phase * 20}%"></i></div><p>${L("可以照常用", "Keep working as usual")}</p></div></div>`;
    if (s === "rfail") state = box("warn", "alert", L("0.10.0 在副本上没通过（Pages 的数据）", "0.10.0 failed on the copy (Pages' data)"), L("你仍在 0.9.2，什么都没变", "You're still on 0.9.2; nothing changed"), `${btn(L("发送诊断", "Send diagnostics"), "goto-export")}${diagId("D-81C004")}`);
    if (s === "rolled") state = box("ok", "status-done", L("已回到 0.9.1", "Back on 0.9.1"), L("0.10.0 先不再提示", "0.10.0 won't be offered again for now"), btn(L("撤销", "Undo"), "toast", "sec", L("会再升级到 0.10.0（原型不展开）", "Would upgrade to 0.10.0 again (not built)")));
    if (compact) return `${ver}${state}`;
    const back = s === "rolled" ? "" : `<div class="grp"><h3>${L("回到上一版", "Go back a version")}</h3><div class="panel"><div class="ln">${tile("history", "slate")}<span class="nm">0.9.1</span><span class="fact">${L("10-28 升级前", "Before 10-28 upgrade")}</span>${btn(L("回到 0.9.1", "Go back"), "dlg-open", "sm sec", "rollback")}</div></div></div>`;
    return `${ver}${state}${back}`;
  }
  function update() {
    if (S.state === "starting") {
      const steps = [L("程序", "App"), "Pages", "Todo", "Feed", L("助理", "Assistant")];
      const n = Math.min(S.phase, steps.length);
      return arrivalFrame({ cls: "opening", html: `<div class="opening-copy"><p class="caption">Amplify Ideas</p><h1 class="wordmark sm" tabindex="-1">Molis Work</h1><div class="upline" role="status">${n < steps.length ? `<span class="spin"></span>${L(`正在升级到 0.10.0 · ${steps[n]}`, `Upgrading to 0.10.0 · ${steps[n]}`)}<span class="fact">${n + 1}/${steps.length}</span>` : `${ic("check", "sm")}${L("升级完成", "Upgrade complete")}`}</div></div>` }, { bar: `<div class="bar-start"></div><div class="bar-center"></div><div class="bar-end">${n >= steps.length ? primary(L("进入", "Enter"), "toast") : ""}</div>` });
    }
    if (S.scheme === "a") return wb(settings("update", `<header class="set-h"><h1 tabindex="-1">${L("更新", "Update")}</h1></header>${updateCard(false)}`), { tab: L("设置", "Settings"), tabIcon: "settings" });
    const pill = S.state === "ready" ? `<button class="up-pill" data-act="notes" aria-expanded="${S.dlg === "notes"}">${ic("download", "sm")}${L("重启以更新", "Restart to update")}</button>` : S.state === "rfail" ? `<button class="up-pill warn" data-act="notes">${ic("alert", "sm")}${L("更新没通过", "Update failed")}</button>` : S.state === "rehearsing" ? `<span class="up-pill quiet"><span class="spin"></span>${L("准备更新", "Preparing")}</span>` : "";
    return wb(`<div class="land">${homeBody()}</div>`, { barExtra: pill });
  }

  // ---------- 26 · Install and self-check ----------
  const COMPONENTS = () => [["host", "terminal", "slate", L("本机服务", "Local service")], ["files", "file", "amber", L("读文件", "File reading")], ["voice", "play", "rose", L("转写音视频", "Audio & video transcription")], ["sandbox", "lock", "indigo", L("沙箱", "Sandbox")], ["web", "globe", "teal", L("网页抓取", "Web capture")]];
  function compState(id) {
    if (S.phase < COMPONENTS().findIndex(([c]) => c === id) + 1) return "run";
    if (id === "voice" && S.state !== "ok" && !S.fixed) return S.fixing ? "run" : S.skip ? "skip" : "fail";
    return "ok";
  }
  function compRows() {
    return COMPONENTS().map(([id, i, h, n]) => { const c = compState(id); return `<div class="ln ${c === "fail" ? "is-fail" : ""}">${tile(i, h)}<span class="nm">${n}</span>${c === "run" ? st("run") : c === "fail" ? `<span class="tag warn">${L("缺一个文件", "A file is missing")}</span>` : c === "skip" ? `<span class="tag">${L("先不用", "Off for now")}</span>` : st("done")}</div>`; }).join("");
  }
  function voiceIssue() {
    if (S.state === "ok" || S.fixed || S.skip) return "";
    if (S.state === "fixfail" && S.done.tried) return box("err", "alert", L("修复没成功", "Repair didn't work"), L("只是转写用不了，其余照常", "Only transcription is off; everything else works"), `${btn(L("发送诊断", "Send diagnostics"), "goto-export")}${btn(L("先不用转写", "Skip transcription"), "skip")}${diagId("D-5A01E2")}`);
    return box("warn", "alert", L("转写音视频用不了：安装包里少了一个文件", "Transcription is unavailable: a file is missing from the package"), "", `${btn(S.fixing ? L("修复中…", "Repairing…") : L("修复", "Repair"), "fix", "primary")}${btn(L("先不用转写", "Skip transcription"), "skip")}`);
  }
  function install() {
    const done = S.phase >= COMPONENTS().length;
    if (S.scheme === "a") {
      const issue = done ? voiceIssue() : "";
      const line = !done ? `<span class="chk-line"><span class="spin"></span>${L("检查这台 Mac", "Checking this Mac")}</span>` : "";
      return arrivalFrame({ cls: "welcome light", html: `<section class="w-left"><div class="w-col">${head(L("语言", "Language"))}<div class="opts col" role="radiogroup">${["简体中文", "English"].map((x, k) => `<button class="opt" role="radio" aria-checked="${k === (S.lang === "zh" ? 0 : 1)}">${tile("globe", k ? "teal" : "blue")}<span class="o-t">${x}</span><span class="o-dot"></span></button>`).join("")}</div>${issue}</div></section><aside class="w-right" aria-hidden="true"><div class="greet"><strong lang="${S.lang}">${L("你好。", "Hello.")}</strong></div></aside>` },
        { bar: `<div class="bar-start">${line}</div><div class="bar-center"></div><div class="bar-end">${primary(L("继续", "Continue"), "toast")}</div>` });
    }
    const allOk = done && (S.state === "ok" || S.fixed || S.skip);
    return arrivalFrame({ cls: "welcome", html: `<section class="w-left"><div class="w-col">${head(!done ? L("检查这台 Mac", "Checking this Mac") : allOk ? L("这台 Mac 准备好了", "This Mac is ready") : L("差一个组件", "One component missing"))}${done ? voiceIssue() : ""}</div></section><aside class="w-right"><div class="card comp">${compRows()}</div></aside>` },
      { bar: `<div class="bar-start"></div><div class="bar-center"></div><div class="bar-end">${primary(L("继续", "Continue"), "toast", !done)}</div>` });
  }

  // ---------- 26 · Upgrade failure and recovery ----------
  function exportPage() {
    const inc = [["package", "blue", L("版本与平台", "Version and platform")], ["database", "slate", L("各部分的数据版本", "Data version of each part")], ["status-progress", "green", L("服务状态", "Service status")], ["file", "amber", L("最近 3 天的日志", "Last 3 days of logs")], ["alert", "rose", L("崩溃记录 2 份", "2 crash records")], ["history", "violet", L("最近 50 次调用的编号与结果", "IDs and results of the last 50 calls")]];
    return wb(settings("diag", `<header class="set-h"><h1 tabindex="-1">${L("诊断", "Diagnostics")}</h1></header>
      <div class="grp"><h3>${L("导出诊断", "Export diagnostics")}</h3><div class="panel">${inc.map(([i, h, n]) => `<div class="ln">${tile(i, h)}<span class="nm">${n}</span>${st("done")}</div>`).join("")}</div></div>
      ${box("info", "lock", L("不含：消息正文、文件内容、密钥、带用户名的路径", "Never included: message text, file contents, secrets, paths with your user name"))}
      ${S.saved ? box("ok", "status-done", "molis-diagnostics-2026-11-04.zip · 1.2 MB", L("你决定发给谁", "You decide who gets it"), btn(L("在访达中显示", "Show in Finder"), "toast", "sec", L("打开访达（原型不展开）", "Opens Finder (not built)"))) : `<div class="acts">${btn(L("存成文件", "Save as file"), "save", "primary")}${btn(L("先看看内容", "Preview contents"), "toast", "sec", L("会列出每个文件（原型不展开）", "Lists each file (not built)"))}</div>`}`), { tab: L("设置", "Settings"), tabIcon: "settings" });
  }
  function recover() {
    const s = S.state;
    if (s === "export") return exportPage();
    if (S.scheme === "a") {
      if (s === "interrupted" && !S.entered) {
        const n = Math.min(S.phase, 3);
        return arrivalFrame({ cls: "opening", html: `<div class="opening-copy"><p class="caption">Amplify Ideas</p><h1 class="wordmark sm" tabindex="-1">Molis Work</h1><div class="upline" role="status">${n < 3 ? `<span class="spin"></span>${L("接着完成上次的升级", "Finishing the last upgrade")}<span class="fact">${n + 1}/3</span>` : `${ic("check", "sm")}${L("升级完成", "Upgrade complete")}`}</div></div>` }, { bar: `<div class="bar-start"></div><div class="bar-center"></div><div class="bar-end">${n >= 3 ? primary(L("进入", "Enter"), "enter") : ""}</div>` });
      }
      const card = s === "interrupted" ? box("ok", "status-done", L("上次升级没做完，已接着完成到 0.10.0", "The interrupted upgrade finished: now on 0.10.0"), "", btn(L("知道了", "Got it"), "dismiss", "sec"))
        : box("warn", "history", L("上次 10:42 意外退出，已恢复", "Quit unexpectedly at 10:42 — recovered"), L("没写完的草稿都在", "Unfinished drafts are kept"), `${btn(L("发送诊断", "Send diagnostics"), "goto-export")}${btn(L("知道了", "Got it"), "dismiss")}${diagId("D-C2410B")}`);
      return wb(`<div class="land">${S.done.dismissed ? "" : card}${homeBody()}</div>`);
    }
    const isInt = s === "interrupted";
    const choice = S.done.choice || "resume";
    const left = isInt ? `${head(L("上次升级没做完", "The last upgrade didn't finish"))}<div class="opts col" role="radiogroup">${[["resume", "refresh", "blue", L("接着完成到 0.10.0", "Finish to 0.10.0")], ["back", "history", "slate", L("全部退回 0.9.2", "Roll everything back to 0.9.2")]].map(([v, i, h, t]) => `<button class="opt" role="radio" aria-checked="${choice === v}" data-act="choose" data-arg="${v}">${tile(i, h)}<span class="o-t">${t}</span><span class="o-dot"></span></button>`).join("")}</div>`
      : `${head(L("上次意外退出了", "Molis Work quit unexpectedly"))}${box("ok", "status-done", L("已恢复，没写完的草稿都在", "Recovered; unfinished drafts are kept"))}<div class="acts">${btn(L("发送诊断", "Send diagnostics"), "goto-export")}${diagId("D-C2410B")}</div>`;
    const right = isInt ? `<div class="card comp">${[["package", "blue", L("程序", "App"), "done"], ["note", "green", "Pages", "done"], ["check", "blue", "Todo", "todo"], ["rows", "teal", "Feed", "todo"]].map(([i, h, n, k]) => `<div class="ln">${tile(i, h)}<span class="nm">${n}</span>${k === "done" ? `<span class="tag ok">0.10.0</span>` : `<span class="tag">0.9.2</span>`}</div>`).join("")}</div>` : `<div class="card comp">${[["note", "green", L("草稿：第二期观察", "Draft: issue 2")], ["check", "blue", L("Todo：3 项未同步", "Todo: 3 unsynced items")]].map(([i, h, n]) => `<div class="ln">${tile(i, h)}<span class="nm">${n}</span>${st("done", L("已恢复", "Recovered"))}</div>`).join("")}</div>`;
    return arrivalFrame({ cls: "welcome", html: `<section class="w-left"><div class="w-col">${left}</div></section><aside class="w-right">${right}</aside>` }, { bar: `<div class="bar-start"></div><div class="bar-center"></div><div class="bar-end">${primary(L("继续", "Continue"), "toast")}</div>` });
  }

  // ---------- Render ----------
  function proto() {
    const P = L;
    document.getElementById("p-title").textContent = P("原型 · 模拟数据", "Prototype · sample data");
    document.getElementById("p-topic").textContent = P("要定的", "Topic");
    document.getElementById("p-scheme").textContent = P("方案", "Option");
    document.getElementById("p-state").textContent = P("状态", "State");
    document.getElementById("p-lang").textContent = P("语言", "Language");
    document.getElementById("p-theme").textContent = P("外观", "Theme");
    document.getElementById("reset").textContent = P("从头再来", "Restart");
    const [l, d] = document.querySelectorAll("#theme button"); l.textContent = P("浅", "Light"); d.textContent = P("深", "Dark");
    const t = TOPICS[S.topic];
    document.getElementById("topic").innerHTML = Object.entries(TOPICS).map(([k, v]) => `<option value="${k}" ${k === S.topic ? "selected" : ""}>${T(v.name)}</option>`).join("");
    document.getElementById("scheme").innerHTML = t.schemes.map(([k, n], i) => `<button type="button" data-scheme="${k}" aria-pressed="${S.scheme === k}">${k.toUpperCase()} · ${T(n)}${i === 0 ? P("（推荐）", " (rec.)") : ""}</button>`).join("");
    document.getElementById("state").innerHTML = t.states.map(([k, n]) => `<option value="${k}" ${k === S.state ? "selected" : ""}>${T(n)}</option>`).join("");
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === S.lang));
    document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme));
  }
  function startTimers() {
    clearTimers();
    if ((S.topic === "install") || (S.topic === "update" && (S.state === "starting" || S.state === "rehearsing")) || (S.topic === "recover" && S.state === "interrupted" && S.scheme === "a")) {
      const max = S.topic === "install" ? 5 : S.topic === "recover" ? 3 : S.state === "rehearsing" ? 3 : 5;
      for (let i = S.phase + 1; i <= max; i++) later(i * 650 - S.phase * 650, () => { S.phase = Math.max(S.phase, i); });
    }
  }
  function render() {
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    proto();
    const view = { run: () => (S.scheme === "a" ? runA() : runB()), owner, update, install, recover }[S.topic]();
    app.innerHTML = view;
    app.querySelectorAll("[data-mixed]").forEach((x) => { x.indeterminate = true; });
    save();
  }
  function reset(patch = {}) { clearTimers(); S = { ...fresh({ topic: S.topic, scheme: S.scheme, state: S.state, lang: S.lang, theme: S.theme }), ...patch }; render(); startTimers(); }

  document.getElementById("topic").addEventListener("change", (e) => { const t = TOPICS[e.target.value]; reset({ topic: e.target.value, scheme: "a", state: t.states[0][0] }); });
  document.getElementById("state").addEventListener("change", (e) => reset({ state: e.target.value }));
  document.getElementById("scheme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) reset({ scheme: b.dataset.scheme }); });
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("reset").addEventListener("click", () => reset());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && (S.dlg || S.quitAsk)) { S.dlg = null; S.quitAsk = false; render(); return; }
    if (e.key === "Enter" && !["BUTTON", "INPUT", "SELECT"].includes(e.target.tagName)) { const p = document.getElementById("primary"); if (p && !p.disabled) { e.preventDefault(); p.click(); } }
  });
  app.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) { if (S.dlg && e.target.classList.contains("dlg-scrim")) { S.dlg = null; render(); } return; }
    const act = b.dataset.act, arg = b.dataset.arg;
    const A = {
      toast() { toast(arg); },
      panel() { S.panel = !S.panel; S.quitAsk = false; },
      "quit-ask"() { S.quitAsk = true; },
      "quit-cancel"() { S.quitAsk = false; },
      "quit-do"() { S.quitAsk = false; S.panel = false; toast(L("已退出（原型：再选「退出后再打开」看下次打开）", "Quit (prototype: pick “Reopened after quitting”)")); },
      "missed-run"() { S.done[arg] = "run"; toast(L("已开始，结果会出现在原处", "Started; the result appears where it belongs")); },
      "missed-skip"() { S.done[arg] = "skip"; },
      open() { S.dock = arg; if (S.topic === "owner" && arg === (S.state === "old" ? "feed" : "pages")) S.dock = false; },
      "dlg-open"() { S.dlg = arg; },
      "dlg-close"() { S.dlg = null; },
      "rollback-do"() { S.dlg = null; if (S.topic === "owner") S.done.ownerFixed = true; else S.state = "rolled"; toast(L("已回到 0.9.1", "Back on 0.9.1")); },
      "plugin-update"() { S.done.ownerFixed = true; },
      "goto-export"() { clearTimers(); S = { ...fresh({ lang: S.lang, theme: S.theme }), topic: "recover", scheme: "a", state: "export" }; },
      "goto-update"() { clearTimers(); S = { ...fresh({ lang: S.lang, theme: S.theme }), topic: "update", scheme: "a", state: "ready" }; },
      restart() { S.state = "starting"; S.phase = 0; S.dlg = null; render(); startTimers(); },
      later() { toast(L("下次打开时再提示", "Reminds you next launch")); },
      notes() { S.dlg = S.dlg === "notes" ? null : "notes"; },
      fix() { S.fixing = true; later(1200, () => { S.fixing = false; if (S.state === "fixfail") S.done.tried = true; else S.fixed = true; }); },
      skip() { S.skip = true; toast(L("转写先关着；在 设置 › 诊断 里随时修复", "Transcription is off; repair any time in Settings › Diagnostics")); },
      enter() { S.entered = true; },
      dismiss() { S.done.dismissed = true; },
      choose() { S.done.choice = arg; },
      save() { S.saved = true; },
    };
    if (A[act]) { A[act](); if (act !== "toast" && act !== "restart") render(); }
  });

  render(); startTimers();
  window.protoJump = (p) => { clearTimers(); Object.assign(S, p); render(); };
})();
