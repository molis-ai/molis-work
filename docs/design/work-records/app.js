// 21 · Work records: scope notice, keep & clean up, space, coverage & gaps — 2–3 options each, normal and failure states.
// Sample data only (data.js). Timers stand in for counting and cleaning. Nothing reads a Home, a database or the disk.
(() => {
  const D = window.protoData;
  document.getElementById("icons").innerHTML = window.protoIcons;
  const app = document.getElementById("app");
  const KEY = "molis-proto.work-records.v1";

  const fresh = () => ({
    block: "scope", opt: { scope: "A", clean: "A", space: "A", gaps: "B" }, state: { scope: "normal", clean: "normal", space: "normal", gaps: "normal" },
    lang: "zh", theme: "light",
    open: {}, uses: Object.fromEntries(D.uses.map((u) => [u.id, u.on])), paused: false,
    period: "keep", keepDays: 999, reminder: null, reminderDraft: "2", editingReminder: false,
    dlg: null, dlgRange: "before", dlgBefore: "2026-08-04", dlgProject: "all", dlgKinds: Object.fromEntries(D.kinds.map((k) => [k.id, true])),
    cleanRun: 0, popOpen: true, firstSeen: false, filter: "all", sel: null,
  });
  let S = load();
  function load() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.v === 1) return { ...fresh(), ...v.s }; } catch { /* preview without storage */ }
    return fresh();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify({ v: 1, s: S })); } catch { /* preview without storage */ } }

  const L = (zh, en) => (S.lang === "zh" ? zh : en);
  const T = (pair) => (Array.isArray(pair) ? (S.lang === "zh" ? pair[0] : pair[1]) : pair);
  const ic = (n, cls = "") => `<svg class="i ${cls}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const kind = (id) => D.kinds.find((k) => k.id === id);
  const tile = (k, cls = "") => `<span class="tile ${cls}" style="--hue:var(--hue-${k.hue})" aria-hidden="true">${ic(k.icon, "sm")}</span>`;
  const kchip = (k) => `<span class="kchip" style="--hue:var(--hue-${k.hue})">${ic(k.icon)}${T(k.name)}</span>`;
  const gb = (n) => `${n.toFixed(2)} GB`;
  const st = (code, el = "span", attrs = "") => { const s = D.statuses[code]; return `<${el} class="st ${s.tone}" ${attrs}>${T(s.name)}</${el}>`; };
  const block = () => D.blocks.find((b) => b.id === S.block);
  const opt = () => S.opt[S.block];
  const state = () => S.state[S.block];
  const toggle = (on, attrs = "") => `<button type="button" class="toggle" role="switch" aria-checked="${on}" ${attrs}></button>`;

  // ---------- Review strip ----------
  function strip() {
    const b = block();
    document.getElementById("p-title").textContent = L("原型 · 工作记录（第 21 批）", "Prototype · Work records (batch 21)");
    document.getElementById("p-block").textContent = L("块", "Block");
    document.getElementById("p-opt").textContent = L("方案", "Option");
    document.getElementById("p-state").textContent = L("状态", "State");
    document.getElementById("p-lang").textContent = L("语言", "Language");
    document.getElementById("p-theme").textContent = L("外观", "Theme");
    document.getElementById("reset").textContent = L("还原", "Reset");
    const sel = (id, items, cur) => { const el = document.getElementById(id); el.innerHTML = items.map((x) => `<option value="${x.id}" ${x.id === cur ? "selected" : ""}>${T(x.name)}${x.rec ? L("（推荐）", " (recommended)") : ""}</option>`).join(""); };
    sel("block", D.blocks, S.block);
    sel("opt", b.options, opt());
    sel("state", b.states, state());
    document.querySelectorAll("#lang button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.lang === S.lang)));
    document.querySelectorAll("#theme button").forEach((x) => { x.setAttribute("aria-pressed", String(x.dataset.themeSet === S.theme)); x.textContent = x.dataset.themeSet === "light" ? L("浅", "Light") : L("深", "Dark"); });
    document.documentElement.dataset.theme = S.theme;
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en";
    document.title = L("工作记录定样 · Molis Work 原型", "Work records review · Molis Work prototype");
  }

  // ---------- Settings sheet ----------
  function sheet(body, wide = false) {
    // Mirrors the real global settings list (apps/workbench/src/settings-sections.ts); 工作记录 sits after 记忆.
    const nav = [
      ["sun", L("界面与语言", "Interface & language")], ["folder", L("本机目录", "Local folders")], ["book", L("记忆", "Memory")], ["database", L("工作记录", "Work records"), true],
      ["sparkles", L("模型", "Models")], ["user", L("助理", "Assistant")], ["wand", L("提示词", "Prompts")], ["link", L("服务连接", "Connections")],
      ["history", L("调用记录", "Call history")], ["info", L("诊断", "Diagnostics")],
    ];
    const tabs = D.blocks.map((b) => `<button type="button" role="tab" data-block="${b.id}" aria-selected="${b.id === S.block}">${T(b.name)}</button>`).join("");
    return `<div class="sheet" role="dialog" aria-label="${L("设置", "Settings")}">
      <nav class="snav"><h2>${L("设置", "Settings")}</h2>${nav.map(([i, n, cur]) => `<button type="button" ${cur ? 'aria-current="page"' : "disabled"}>${ic(i)}${n}</button>`).join("")}</nav>
      <section class="smain">
        <header class="shead"><h1>${L("工作记录", "Work records")}</h1>${recBadge()}</header>
        <div class="subnav" role="tablist">${tabs}</div>
        <div class="sbody ${wide ? "wide" : ""}">${body}</div>
      </section></div>`;
  }
  function recBadge() {
    if (S.block === "scope" && state() === "paused") return `<span class="st warn">${L("已暂停", "Paused")}</span>`;
    if (S.block === "scope" && state() === "first") return `<span class="st info">${L("在读现有资料", "Reading what exists")}</span>`;
    if (S.block === "space" && state() === "disk") return `<span class="st err">${L("有记录没保存", "Some not saved")}</span>`;
    return `<span class="st ok">${L("记录中", "Recording")}</span>`;
  }

  // ---------- Block 1: what's recorded ----------
  function scopeStatus() {
    const s = state();
    if (s === "paused") return `<div class="status warn"><span class="dot amber"></span><div class="bd"><strong>${L("已暂停记录 · 截至 11 月 2 日 14:20", "Recording paused · up to Nov 2, 14:20")}</strong><span class="fact">${L("暂停期间做的事不会被记下；助理和评测看到的记录到这个时间为止。", "Nothing you do while paused is recorded; the assistant and evaluation see records up to this time.")}</span></div><button type="button" class="btn sm primary" data-act="resume">${L("继续记录", "Resume")}</button></div>`;
    if (s === "first") return `<div class="status"><span class="dot run"></span><div class="bd"><strong>${L("在读这个项目现有的资料 · 2,140 / 3,600", "Reading this project's existing material · 2,140 / 3,600")}</strong><span class="fact">${L("读到的算「原本就有」，不算你新做的。完整记录从今天开始；8 月 4 日以前的版本取不到。", "What is read counts as “already there”, not new work. Full records start today; versions before Aug 4 aren't available.")}</span><div class="progress"><i style="width:59%"></i></div></div><button type="button" class="btn sm sec" data-act="noop">${L("停止读取", "Stop reading")}</button></div>`;
    return `<div class="status"><span class="dot"></span><div class="bd"><strong>${L("记录中 · 完整记录从 10 月 12 日开始", "Recording · full records since Oct 12")}</strong><span class="fact">${L("更早的历史能取到 8 月 4 日以后的版本。", "Older history is available for versions after Aug 4.")}</span></div><button type="button" class="btn sm sec" data-act="pause">${ic("pause", "sm")}${L("暂停记录", "Pause")}</button></div>`;
  }
  function usesBox() {
    const evalOff = state() === "useoff";
    const rows = D.uses.map((u) => {
      const on = u.id === "eval" && evalOff ? false : S.uses[u.id];
      const fact = u.fixed ? L("只要在记录就能用", "Always available while recording") : u.na ? L("这一版没有这个功能", "Not available in this version") : u.id === "eval" && !on ? L("关着：评测读不到；已留的样本按样本自己的期限", "Off: evaluation can't read records; kept samples follow their own period") : u.id === "assist" ? L("按你给助理的回看范围", "Within the look-back window you set for the assistant") : u.id === "export" ? L("导出时你选范围", "You choose the range when exporting") : "";
      return `<div class="ln"><span class="nm">${T(u.name)}</span><span class="fact">${fact}</span>${toggle(on, `data-use="${u.id}" ${u.fixed || u.na ? "disabled" : ""}`)}</div>`;
    }).join("");
    return `<div class="box"><h3>${L("可以用在哪里", "Where records may be used")}<span class="grow"></span></h3>${rows}</div>`;
  }
  const lockLine = () => `<div class="lockline">${ic("lock", "sm")}${L("只存在这台 Mac 上，不上传。", "Stored on this Mac only. Nothing is uploaded.")}</div>`;
  function scopeA() {
    const rows = D.kinds.map((k) => {
      const open = !!S.open[k.id];
      return `<div><div class="ln click" data-open="${k.id}">${tile(k)}<span class="nm">${T(k.name)}</span><span class="fact hide-sm">${T(k.rec)}</span><button type="button" class="twist" aria-expanded="${open}" aria-label="${L("展开", "Expand")}">${ic("chevron-right", "sm")}</button></div>
        ${open ? `<div class="more"><div><b>${L("记", "Recorded")}</b>${T(k.rec)}</div><div class="no"><b>${L("不记", "Not recorded")}</b>${T(k.not)}</div></div>` : ""}</div>`;
    }).join("");
    return sheet(`${scopeStatus()}<div class="box"><h3>${L("记了什么", "What's recorded")}</h3>${rows}</div>${usesBox()}${lockLine()}`);
  }
  function scopeB() {
    const s = state();
    const ex = D.example;
    const steps = ex.steps.map((st0, i) => {
      const k = kind(st0.kind);
      const brk = s === "paused" && i === 3 ? `<div class="brk">${ic("pause", "sm")}${L("11-02 14:20 起暂停，后面两步没有记下", "Paused from Nov 2 14:20 — the next two steps were not recorded")}</div>` : "";
      const dim = s === "paused" && i >= 3 ? ' style="opacity:.4"' : "";
      const had = s === "first" && i === 0 ? ` <span class="tag">${L("原本就有", "Already there")}</span>` : "";
      return `${brk}<div class="ev"${dim}>${tile(k)}<span class="t">${st0.t}</span><span class="tx">${T(st0.text)}${had}</span>${kchip(k)}</div>`;
    }).join("");
    const skipped = ex.skipped.map((x) => `<div class="ln">${ic("eye")}<span class="fact">${T(x)}</span></div>`).join("");
    return sheet(`${scopeStatus()}
      <div class="box"><h3>${ic("history", "sm")}${T(ex.title)}</h3><div class="tl">${steps}</div></div>
      <div class="skipped"><div class="sec-h" style="margin-top:0">${L("这件事里没记的", "Not recorded in this work")}</div>${skipped}</div>
      <div class="box soft"><h3>${L("每类记什么、不记什么", "What each kind records")}</h3><div class="kchips">${D.kinds.map(kchip).join("")}</div></div>
      ${usesBox()}${lockLine()}`);
  }
  function scopeC() {
    const s = state();
    const paused = s === "paused", first = s === "first";
    const dot = paused ? "dot amber" : first ? "dot run" : "dot";
    const label = paused ? L("已暂停", "Paused") : first ? L("在读 59%", "Reading 59%") : L("记录中", "Recording");
    const card = !S.firstSeen && s === "normal" ? `<div class="firstcard"><span class="tile lg" style="--hue:var(--hue-blue)">${ic("database")}</span><div><strong>${L("这个项目的工作会被记下", "Work in this project is recorded")}</strong><p>${L("你的操作、AI 做的事、内容变化、后台任务和给你看过的建议。只存在这台 Mac 上。", "Your actions, what AI did, content changes, background tasks and suggestions shown to you. Stored on this Mac only.")}</p><div class="acts"><button type="button" class="btn sm primary" data-act="seen">${L("知道了", "Got it")}</button><button type="button" class="btn sm sec" data-act="toA">${L("看看记了什么", "See what's recorded")}</button></div></div></div>` : "";
    const pop = S.popOpen ? `<div class="pop" role="dialog" aria-label="${L("工作记录", "Work records")}">
        <div class="hd"><span class="${dot}"></span>${paused ? L("已暂停 · 截至 11-02 14:20", "Paused · up to Nov 2 14:20") : first ? L("在读现有资料 · 2,140 / 3,600", "Reading existing material · 2,140 / 3,600") : L("记录中 · 从 10 月 12 日起完整", "Recording · complete since Oct 12")}</div>
        ${first ? `<div class="progress" style="margin-top:0"><i style="width:59%"></i></div>` : ""}
        <div class="kchips">${D.kinds.map(kchip).join("")}</div>
        <div class="lockline">${ic("lock", "sm")}${L("只存在这台 Mac 上", "Stored on this Mac only")}</div>
        <div class="acts"><button type="button" class="btn sm sec" data-act="toA">${L("在设置里看", "Open in Settings")}</button><span class="grow"></span>${paused ? `<button type="button" class="btn sm primary" data-act="resume">${L("继续记录", "Resume")}</button>` : `<button type="button" class="btn sm ghost" data-act="pause">${ic("pause", "sm")}${L("暂停", "Pause")}</button>`}</div>
      </div>` : "";
    return `<div class="wb rel"><div class="main">${card}<div class="ph">${L("工作台主区（占位）", "Workbench main area (placeholder)")}</div></div>
      <div class="bar rel"><span class="mono">AI</span><div class="composer">${L("问助理，或输入 / 调用插件…", "Ask the assistant, or type / for plugins…")}</div>
      <button type="button" class="marker" aria-expanded="${S.popOpen}" data-act="pop"><span class="${dot}"></span><span class="lbl">${label}</span></button>${pop}</div></div>`;
  }

  // ---------- Block 2: keep & clean up ----------
  const periodDays = (p) => ({ keep: 9999, manual: 9999, 365: 365, 180: 180, 90: 90, 30: 30 })[p];
  function needsList(days) {
    return D.needs.map((n) => {
      const ok = days >= n.days;
      return `<div class="need ${ok ? "ok" : "lose"}">${ic(ok ? "check" : "alert")}<span>${T(n.name)}</span><span class="fact">${L(`需要 ${n.days} 天`, `Needs ${n.days} days`)} · ${ok ? L("保得住", "Kept") : L("会失去", "Will be lost")}</span></div>`;
    }).join("");
  }
  function cleanStateBox() {
    const s = state();
    if (s === "running") return `<div class="status"><span class="spin"></span><div class="bd"><strong>${L("正在清理 8 月 4 日以前的记录 · 62%", "Clearing records before Aug 4 · 62%")}</strong><span class="fact">${L("别的功能照常用；关掉窗口也会继续。", "Everything else keeps working; it continues if you close this window.")}</span><div class="progress"><i style="width:62%"></i></div></div></div>`;
    if (s === "partial") return `<div class="note err">${ic("circle-alert")}<div><b>${L("「官网改版」的记录没有清", "Records for “Website redesign” were not cleared")}</b><br>${L("那个项目正开着一个后台任务，记录被占用。其余项目已清理，释放 371 MB。", "A background task in that project was holding them. Other projects were cleared, 371 MB freed.")}<div class="acts"><button type="button" class="btn sm sec" data-act="noop">${ic("refresh", "sm")}${L("只重试这一项", "Retry just this one")}</button></div></div></div>`;
    if (s === "after") return `<div class="note">${ic("check")}<div><b>${L("已清理 8 月 4 日以前的记录 · 释放 412 MB", "Cleared records before Aug 4 · 412 MB freed")}</b><br>${L("这段时间在回看和评测里显示为「到期清除」，不会拿现在的内容顶替。原文、Pages 版本和已存的简报都还在。", "That period shows as “Cleared” in look-back and evaluation and is never replaced by current content. Originals, Pages versions and saved briefs remain.")}<div class="acts"><button type="button" class="btn sm sec" data-goto="gaps:cleared">${L("看缺口", "See gaps")}</button></div></div></div>`;
    return "";
  }
  function cleanA() {
    const s = state();
    const p = s === "short" ? "30" : S.period;
    const days = periodDays(p);
    const lose = D.needs.some((n) => days < n.days);
    const auto = `<div class="box"><h3>${L("自动清理", "Automatic clean-up")}</h3>
      <div class="ln"><span class="nm">${L("清理多久以前的记录", "Clear records older than")}</span><span class="grow"></span><select class="fld" id="period">${D.periods.map((x) => `<option value="${x.id}" ${x.id === p ? "selected" : ""}>${T(x.name)}</option>`).join("")}</select></div>
      ${p === "keep" || p === "manual" ? `<div class="fact" style="padding:2px 4px 6px">${p === "keep" ? L("默认一直保留，不会因为过了多少天就删。", "Kept by default — never deleted just because time passed.") : L("不会自动删；需要时在下面手动清理。", "Nothing is deleted automatically; clean up below when you want.")}</div>` : `<div style="padding:4px 4px 2px">${needsList(days)}</div>`}
      ${lose ? `<div class="note warn" style="margin-top:6px">${ic("alert")}<div>${L("这个期限比你开着的跨两个月比较和评测要用的短。保存后，到期的记录会被清掉，不会悄悄替你多留。", "This is shorter than your two-month comparison and evaluation need. After saving, older records are cleared — nothing is silently kept longer.")}<div class="acts"><button type="button" class="btn sm primary" data-act="noop">${L("仍然用 30 天", "Use 30 days anyway")}</button><button type="button" class="btn sm sec" data-act="keep">${L("改回一直保留", "Keep instead")}</button></div></div></div>` : ""}
      </div>`;
    const manual = `<div class="box"><h3>${L("手动清理", "Clean up now")}<span class="grow"></span><button type="button" class="btn sm sec" data-act="dlg">${ic("trash", "sm")}${L("选择要清理的记录…", "Choose records to clear…")}</button></h3>
      <div class="fact">${L("只清工作记录。原文、插件里的版本、已存的简报按各自的规则，不会一起删。", "Only work records are cleared. Originals, plugin versions and saved briefs follow their own rules and are not deleted.")}</div></div>`;
    return sheet(`${cleanStateBox()}${auto}${manual}${samplesBox()}`) + (s === "dialog" || S.dlg ? dialog() : "");
  }
  function samplesBox() {
    return `<div class="box soft"><h3>${ic("review", "sm")}${L("评测样本", "Evaluation samples")}<span class="grow"></span><span class="tag">${L("12 个", "12")}</span></h3><div class="fact">${L("你同意留作评测的样本有自己的期限（到 2027 年 1 月），不跟着上面的清理走；到期前会问你。", "Samples you agreed to keep for evaluation have their own period (until Jan 2027) and aren't affected by the clean-up above; you'll be asked before they expire.")}</div></div>`;
  }
  function cleanB() {
    const s = state();
    const total = 154; // days since first record (Jun 2 → Nov 3)
    const keep = s === "short" ? 30 : S.keepDays >= total ? total : S.keepDays;
    const pctGone = Math.max(0, (total - keep) / total * 100);
    const needB = D.needs.map((n, i) => { const left = Math.max(0, (total - n.days) / total * 100); const lose = keep < n.days; const top = 4 + (D.needs.length - 1 - i) * 17; return `<div class="need-b ${lose ? "lose" : ""}" style="left:${left}%;right:0;top:${top}px;height:${56 - top}px"></div><span class="need-l ${lose ? "lose" : ""}" style="right:calc(${100 - left}% + 6px);top:${top - 3}px">${T(n.name)}</span>`; });
    const axis = `<div class="axis">${needB.join("")}<div class="rail"></div><div class="gone" style="width:${pctGone}%"></div>
      <input type="range" id="keepRange" min="0" max="${total - 7}" value="${total - keep}" aria-label="${L("保留最近多少天", "Keep the last N days")}">
      <span class="lbl" style="left:0">${L("6 月 2 日 · 最早的记录", "Jun 2 · earliest")}</span><span class="lbl" style="right:0">${L("今天", "Today")}</span></div>`;
    const label = keep >= total ? L("一直保留（默认）", "Keep everything (default)") : L(`只留最近 ${keep} 天`, `Keep only the last ${keep} days`);
    const lose = D.needs.some((n) => keep < n.days);
    return sheet(`${cleanStateBox()}
      <div class="box"><h3>${L("保留到哪里", "How far back to keep")}<span class="grow"></span><b>${label}</b></h3>${axis}
        <div style="padding:4px 2px">${needsList(keep >= total ? 9999 : keep)}</div>
        ${lose ? `<div class="note warn">${ic("alert")}<div>${L("斜线部分会被清掉。上面标黄的用途会失去依据。", "The striped part will be cleared. The uses marked in amber above will lose their evidence.")}<div class="acts"><button type="button" class="btn sm primary" data-act="noop">${L("保存", "Save")}</button><button type="button" class="btn sm sec" data-act="keepB">${L("改回一直保留", "Keep everything")}</button></div></div></div>` : ""}
      </div>
      <div class="box"><h3>${L("清理某一段", "Clear a span")}<span class="grow"></span><button type="button" class="btn sm sec" data-act="dlg">${ic("trash", "sm")}${L("选一段时间…", "Choose a span…")}</button></h3><div class="fact">${L("只清工作记录，原文和简报不动。", "Only work records; originals and briefs are untouched.")}</div></div>
      ${samplesBox()}`) + (s === "dialog" || S.dlg ? dialog() : "");
  }
  function dialog() {
    const kinds = D.kinds.map((k) => `<label class="kchip" style="--hue:var(--hue-${k.hue});cursor:pointer"><input type="checkbox" data-dk="${k.id}" ${S.dlgKinds[k.id] ? "checked" : ""}>${T(k.name)}</label>`).join("");
    const n = Object.values(S.dlgKinds).filter(Boolean).length;
    const mb = Math.round(412 * n / D.kinds.length * (S.dlgProject === "all" ? 1 : 0.55));
    return `<div class="scrim"><div class="dlg" role="dialog" aria-label="${L("清理工作记录", "Clear work records")}">
      <h2>${L("清理工作记录", "Clear work records")}</h2>
      <div class="frm"><label>${L("时间", "When")}</label><div class="acts"><select class="fld" id="dlgRange"><option value="before" ${S.dlgRange === "before" ? "selected" : ""}>${L("早于", "Before")}</option><option value="span" ${S.dlgRange === "span" ? "selected" : ""}>${L("某一段", "A span")}</option></select><input class="fld" type="date" value="${S.dlgBefore}">${S.dlgRange === "span" ? `<span>–</span><input class="fld" type="date" value="2026-09-01">` : ""}</div>
      <label>${L("项目", "Project")}</label><select class="fld" id="dlgProject"><option value="all">${L("全部项目", "All projects")}</option>${D.byProject.map((p) => `<option value="${p.name}" ${S.dlgProject === p.name ? "selected" : ""}>${p.name}</option>`).join("")}</select>
      <label>${L("哪些", "Which")}</label><div class="kchips">${kinds}</div></div>
      <div class="preview"><div><b>${mb} MB</b> <span class="fact">${L(`约 ${Math.round(mb * 44).toLocaleString()} 条`, `about ${Math.round(mb * 44).toLocaleString()} records`)}</span></div></div>
      <div><div class="sec-h">${L("清掉以后", "After clearing")}</div>
        <div class="need lose">${ic("alert")}<span>${L("8 月的周报会标出依据已清除", "August reports will show their evidence as cleared")}</span></div>
        <div class="need lose">${ic("alert")}<span>${L("跨 8 月与 10 月的比较不能做了", "Comparing August with October is no longer possible")}</span></div>
        <div class="need ok">${ic("check")}<span>${L("原文、Pages 版本、已存的简报都还在", "Originals, Pages versions and saved briefs remain")}</span></div>
        <div class="need ok">${ic("check")}<span>${L("12 个评测样本按自己的期限留着", "12 evaluation samples stay under their own period")}</span></div></div>
      <div class="foot"><button type="button" class="btn sec" data-act="dlgx">${L("取消", "Cancel")}</button><button type="button" class="btn danger" data-act="dlgok" ${n ? "" : "disabled"}>${ic("trash", "sm")}${L(`清理 ${mb} MB`, `Clear ${mb} MB`)}</button></div>
    </div></div>`;
  }

  // ---------- Block 3: space ----------
  function spaceNums() {
    const s = state();
    const total = s === "over" ? D.space.overTotal : s === "near" ? 1.92 : D.space.total;
    const reminder = s === "near" || s === "over" ? D.space.nearReminder : S.reminder;
    return { s, total, reminder };
  }
  function spaceAlert() {
    const { s, total, reminder } = spaceNums();
    if (s === "near") return `<div class="note warn">${ic("alert")}<div><b>${L(`快到提醒线了：${gb(total)} / ${reminder} GB`, `Close to your reminder: ${gb(total)} / ${reminder} GB`)}</b><div class="acts"><button type="button" class="btn sm sec" data-goto="clean:normal">${L("去清理", "Clean up")}</button><button type="button" class="btn sm ghost" data-act="editRem">${L("改提醒线", "Change reminder")}</button></div></div></div>`;
    if (s === "over") return `<div class="note warn">${ic("alert")}<div><b>${L(`已超过提醒线：${gb(total)} / ${reminder} GB`, `Past your reminder: ${gb(total)} / ${reminder} GB`)}</b><br>${L("照常在记，不会自动删。", "Still recording; nothing is deleted automatically.")}<div class="acts"><button type="button" class="btn sm sec" data-goto="clean:normal">${L("去清理", "Clean up")}</button><button type="button" class="btn sm ghost" data-act="editRem">${L("改提醒线", "Change reminder")}</button></div></div></div>`;
    if (s === "disk") return `<div class="note err">${ic("circle-alert")}<div><b>${L("这台 Mac 剩余空间不足（0.6 GB）· 14:02 起有 37 条记录没能保存", "This Mac is low on space (0.6 GB) · 37 records since 14:02 could not be saved")}</b><br>${L("这段时间做的事已经照常生效，只是过程没记下；回看和评测里会标为「丢失」。", "The work itself took effect; only its record is missing. Look-back and evaluation will mark it as “Lost”.")}<div class="acts"><button type="button" class="btn sm sec" data-goto="gaps:issues">${L("看缺口", "See gaps")}</button><button type="button" class="btn sm ghost" data-goto="clean:normal">${L("清理", "Clean up")}</button></div></div></div>`;
    return "";
  }
  function reminderRow() {
    const { reminder } = spaceNums();
    if (S.editingReminder) return `<div class="reminder"><span>${L("到", "Remind me at")}</span><input class="fld num" id="remIn" inputmode="decimal" value="${S.reminderDraft}"><span>GB ${L("时提醒我", "")}</span><button type="button" class="btn sm primary" data-act="remSave">${L("保存", "Save")}</button><button type="button" class="btn sm ghost" data-act="remX">${L("取消", "Cancel")}</button></div>`;
    if (reminder == null) return `<div class="reminder"><span class="fact">${L("没设提醒线（默认不设上限）", "No reminder (no limit by default)")}</span><span class="grow"></span><button type="button" class="btn sm sec" data-act="editRem">${L("设提醒线", "Set a reminder")}</button></div>`;
    return `<div class="reminder"><span>${L(`到 ${reminder} GB 时提醒我`, `Remind me at ${reminder} GB`)}</span><span class="grow"></span><button type="button" class="btn sm ghost" data-act="editRem">${L("改", "Change")}</button><button type="button" class="btn sm ghost" data-act="remOff">${L("不提醒", "Turn off")}</button></div>`;
  }
  const remNote = () => `<div class="fact">${L("提醒线不是上限：到了只提醒，不会删记录。", "A reminder is not a limit: reaching it only reminds you, nothing is deleted.")}</div>`;
  const expiryLine = () => `<div class="ln"><span class="nm">${L("到期清理", "Automatic clean-up")}</span><span class="fact">${L("一直保留（默认）", "Keep (default)")}</span><button type="button" class="btn sm ghost" data-goto="clean:normal">${L("改", "Change")}</button></div>`;
  function bigNumber() {
    const { s, total } = spaceNums();
    if (s === "counting") return `<div class="acts"><span class="spin"></span><span>${L("正在计算占用…", "Counting space…")}</span><span class="fact">${L("上次 1.79 GB（11 月 2 日）", "Last 1.79 GB (Nov 2)")}</span></div><div class="skel" style="margin-top:10px"></div>`;
    return `<div class="bignum">${total.toFixed(2)}<small>GB</small></div><div class="fact">${L("工作记录占用 · 6 月 2 日以来 · 3 个项目", "Used by work records · since Jun 2 · 3 projects")}</div>`;
  }
  function spaceA() {
    const { s, total, reminder } = spaceNums();
    const scale = total / D.space.total;
    const segs = [...D.kinds.map((k) => ({ hue: k.hue, name: T(k.name), v: D.space.byKind[k.id] })), { hue: "slate", name: L("附件与图片", "Files & images"), v: D.space.byKind.files }];
    const bar = s === "counting" ? "" : `<div class="segbar">${segs.map((x) => `<i style="--hue:var(--hue-${x.hue});flex:${x.v}" title="${x.name}"></i>`).join("")}</div><div class="legend">${segs.map((x) => `<span style="--hue:var(--hue-${x.hue})">${x.name} ${(x.v * scale).toFixed(2)} GB</span>`).join("")}</div>`;
    const meter = reminder != null && s !== "counting" ? `<div class="meter ${s}"><i style="width:${Math.min(100, total / Math.max(reminder, total) * 100)}%"></i><b style="left:${Math.min(100, reminder / Math.max(reminder, total) * 100)}%"></b></div>` : "";
    return sheet(`${spaceAlert()}<div class="box">${bigNumber()}${bar}</div>
      <div class="box"><h3>${L("容量提醒", "Space reminder")}</h3>${reminderRow()}${meter}${remNote()}</div>
      <div class="box">${expiryLine()}</div>`);
  }
  function spaceB() {
    const { s, total, reminder } = spaceNums();
    const pts = D.trend.map((v) => v * total / D.space.total);
    const max = Math.max(...pts, reminder || 0) * 1.12;
    const w = 600, h = 140;
    const xy = (v, i) => `${(i / (pts.length - 1) * w).toFixed(1)},${(h - v / max * h).toFixed(1)}`;
    const line = pts.map(xy).join(" ");
    const remY = reminder ? (h - reminder / max * h).toFixed(1) : null;
    const svg = s === "counting" ? `<div class="skel" style="height:140px;border-radius:10px"></div>` : `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:140px;display:block" role="img" aria-label="${L("近 30 天占用", "Space over the last 30 days")}">
      <polygon points="0,${h} ${line} ${w},${h}" fill="color-mix(in srgb, var(--accent) 14%, transparent)"/>
      <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      ${remY ? `<line x1="0" x2="${w}" y1="${remY}" y2="${remY}" stroke="var(--amber)" stroke-dasharray="5 4" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` : ""}
      ${s === "disk" ? `<rect x="${w - 22}" y="0" width="22" height="${h}" fill="color-mix(in srgb, var(--red) 18%, transparent)"/>` : ""}
    </svg>`;
    const proj = reminder && s === "normal" ? "" : reminder && s === "near" ? L("按近 30 天的速度，大约 11 月 9 日到提醒线。", "At the last 30 days' pace, the reminder is reached around Nov 9.") : !reminder && s === "normal" ? L("近 30 天每天约多 40 MB。", "About 40 MB more per day over the last 30 days.") : "";
    return sheet(`${spaceAlert()}<div class="box">${bigNumber()}<div style="margin-top:10px">${svg}</div><div class="acts fact" style="justify-content:space-between;margin-top:4px"><span>${L("10 月 5 日", "Oct 5")}</span>${reminder ? `<span style="color:var(--amber)">--- ${L(`提醒线 ${reminder} GB`, `Reminder ${reminder} GB`)}</span>` : ""}<span>${L("今天", "Today")}</span></div>${proj ? `<div class="fact" style="margin-top:6px">${proj}</div>` : ""}</div>
      <div class="box"><h3>${L("容量提醒", "Space reminder")}</h3>${reminderRow()}${remNote()}</div>
      <div class="box">${expiryLine()}</div>`);
  }
  function spaceC() {
    const { s, total, reminder } = spaceNums();
    const open = S.open.storage !== false;
    const badge = s === "near" ? `<span class="st warn">${L("接近提醒线", "Near reminder")}</span>` : s === "over" ? `<span class="st warn">${L("超过提醒线", "Past reminder")}</span>` : s === "disk" ? `<span class="st err">${L("有记录没保存", "Some not saved")}</span>` : s === "counting" ? `<span class="spin"></span>` : "";
    const others = D.otherStorage.map((o) => `<div class="ln"><span class="nm">${T(o.name)}</span><span class="grow"></span><span class="fact" style="flex:none">${gb(o.gb)}</span><span style="width:24px"></span></div>`).join("");
    const detail = open ? `<div style="padding:4px 4px 10px 4px;display:flex;flex-direction:column;gap:10px">
        <div class="legend">${D.byProject.map((p) => `<span style="--hue:var(--hue-blue)">${p.name} ${gb(p.gb * total / D.space.total)}</span>`).join("")}</div>
        ${reminderRow()}${remNote()}${expiryLine()}</div>` : "";
    return sheet(`${spaceAlert()}<div class="box"><h3>${L("这台 Mac 上 Molis Work 的占用", "Molis Work storage on this Mac")}<span class="grow"></span><span class="fact">${L("剩余 ", "Free ")}${s === "disk" ? "0.6" : "182"} GB</span></h3>
      ${others}
      <div class="ln click" data-open="storage"><span class="nm">${L("工作记录", "Work records")}</span>${badge}<span class="grow"></span><span class="fact" style="flex:none">${s === "counting" ? "—" : gb(total)}${reminder ? ` / ${reminder} GB` : ""}</span><button type="button" class="twist" aria-expanded="${open}">${ic("chevron-right", "sm")}</button></div>
      ${detail}</div>`);
  }

  // ---------- Block 4: coverage & gaps ----------
  const srcName = (id) => (id === "*" ? L("全部来源", "All sources") : T(D.sources.find((x) => x.id === id).name));
  const kindLabel = (id) => (id === "*" ? L("全部种类", "All kinds") : T(kind(id).name));
  function gridState() {
    const g = JSON.parse(JSON.stringify(D.grid));
    for (const gap of D.gapSets[state()]) {
      if (gap.src === "*" || gap.st === "none") continue;
      g[gap.src][gap.kind] = gap.st;
    }
    return g;
  }
  function gapsHeader() {
    const s = state();
    const set = D.gapSets[s];
    const attn = set.filter((g) => !["none", "masked"].includes(g.st)).length;
    const none = set.filter((g) => g.st === "none").length;
    return `<div class="status ${attn && s === "issues" ? "warn" : ""}"><span class="dot ${attn && s === "issues" ? "amber" : ""}"></span><div class="bd"><strong>${s === "cleared" ? L("8 月 4 日以前的记录已清除", "Records before Aug 4 were cleared") : attn ? L(`${attn} 处需要注意`, `${attn} need attention`) : L("接上的地方都记全了", "Everything connected is complete")}</strong><span class="fact">${L(`完整记录从 ${s === "cleared" ? "8 月 4 日" : "10 月 12 日"}开始 · ${none} 处还没接入`, `Complete since ${s === "cleared" ? "Aug 4" : "Oct 12"} · ${none} not connected yet`)}</span></div></div>`;
  }
  function filters() {
    const f = [["all", L("全部", "All")], ["entry", L("入口", "Entries")], ["plugin", L("插件", "Plugins")], ["bg", L("后台", "Background")]];
    return `<div class="filters"><span class="seg">${f.map(([id, n]) => `<button type="button" data-filter="${id}" aria-pressed="${S.filter === id}">${n}</button>`).join("")}</span><select class="fld"><option>${L("全部版本", "All versions")}</option><option>${L("0.9.3 以后", "Since 0.9.3")}</option></select></div>`;
  }
  const visibleSources = () => D.sources.filter((x) => S.filter === "all" || x.kind === S.filter);
  function gapDetail(gap) {
    return `<div class="gb"><div><b>${L("影响", "Effect")}：</b>${T(gap.affects)}</div>${gap.act ? `<div class="acts"><button type="button" class="btn sm sec" ${gap.act[0] === "看占用" ? 'data-goto="space:disk"' : 'data-act="noop"'}>${T(gap.act)}</button></div>` : ""}</div>`;
  }
  function gapsA() {
    const g = gridState();
    const head = `<tr><th>${L("来源", "Source")}</th>${D.kinds.map((k) => `<th>${kchip(k)}</th>`).join("")}</tr>`;
    const rows = visibleSources().map((src) => `<tr><td class="src">${T(src.name)}</td>${D.kinds.map((k) => { const code = g[src.id][k.id]; const sel = S.sel === `${src.id}:${k.id}`; return `<td>${st(code, "button", `type="button" data-cell="${src.id}:${k.id}" class="st ${D.statuses[code].tone} ${sel ? "sel" : ""}"`)}</td>`; }).join("")}</tr>`).join("");
    let det = "";
    if (S.sel) {
      const [sid, kid] = S.sel.split(":");
      const gap = D.gapSets[state()].find((x) => x.src === sid && (x.kind === kid || x.kind === "*"));
      const code = g[sid][kid];
      det = `<div class="box"><h3>${srcName(sid)} · ${kindLabel(kid)}<span class="grow"></span>${st(code)}</h3>${gap ? `<div class="fact">${T(gap.span)} · ${T(gap.cause)}</div>${gapDetail(gap).replace('class="gb"', 'class="gb" style="padding:8px 0 0"')}` : `<div class="fact">${code === "na" ? L("这里本来就没有这类事。", "This kind of work doesn't happen here.") : L("从 10 月 12 日起完整。", "Complete since Oct 12.")}</div>`}</div>`;
    }
    const cleared = state() === "cleared" ? `<div class="note">${ic("info")}<div>${L("8 月 4 日以前：全部「到期清除」。表里是这之后的情况。", "Before Aug 4: everything is “Cleared”. The grid shows the period after that.")}</div></div>` : "";
    return sheet(`${gapsHeader()}${filters()}${cleared}<div class="gridwrap"><table class="cov">${head}${rows}</table></div>${det}
      <div class="legend" style="gap:6px">${Object.keys(D.statuses).map((c) => st(c)).join("")}</div>`, true);
  }
  function gapsB() {
    const set = D.gapSets[state()].filter((gap) => gap.src === "*" || visibleSources().some((x) => x.id === gap.src));
    const tone = (gap) => D.statuses[gap.st].tone;
    const card = (gap, i) => { const key = `gap${state()}${i}`; const open = !!S.open[key]; const k = gap.kind === "*" ? null : kind(gap.kind); return `<div class="gap ${tone(gap)}"><div class="gh" data-open="${key}">${k ? tile(k) : `<span class="tile">${ic("database", "sm")}</span>`}<span class="nm">${srcName(gap.src)}${k ? ` · ${T(k.name)}` : ""}</span>${st(gap.st)}<span class="fact grow">${T(gap.span)} · ${T(gap.cause)}</span><button type="button" class="twist" aria-expanded="${open}">${ic("chevron-right", "sm")}</button></div>${open ? gapDetail(gap) : ""}</div>`; };
    const attn = set.filter((g) => !["none"].includes(g.st));
    const none = set.filter((g) => g.st === "none");
    const g = gridState();
    let okCount = 0, naCount = 0;
    visibleSources().forEach((src) => D.kinds.forEach((k) => { const c = g[src.id][k.id]; if (c === "ok") okCount++; else if (c === "na" || c === "rule") naCount++; }));
    const okOpen = !!S.open.okList, naOpen = !!S.open.naList;
    const okList = okOpen ? `<div class="box" style="padding:6px 12px">${visibleSources().filter((src) => D.kinds.some((k) => g[src.id][k.id] === "ok")).map((src) => `<div class="ln"><span class="nm">${T(src.name)}</span><span class="grow"></span><span class="kchips">${D.kinds.filter((k) => g[src.id][k.id] === "ok").map((k) => tile(k)).join("")}</span></div>`).join("")}</div>` : "";
    return sheet(`${gapsHeader()}${filters()}
      ${attn.length ? `<div class="sec-h">${L("需要注意", "Needs attention")}</div>${attn.map(card).join("")}` : ""}
      ${none.length ? `<div class="sec-h">${L("还没接入", "Not connected yet")}</div>${none.map((x, i) => card(x, 100 + i)).join("")}` : ""}
      <div class="sec-h" style="cursor:pointer" data-open="okList">${ic(okOpen ? "chevron-down" : "chevron-right", "sm")}${L(`完整 · ${okCount} 处`, `Complete · ${okCount}`)}</div>${okList}
      <div class="sec-h" style="cursor:pointer" data-open="naList">${ic(naOpen ? "chevron-down" : "chevron-right", "sm")}${L(`不适用 · ${naCount} 处`, `Not applicable · ${naCount}`)}</div>
      ${naOpen ? `<div class="fact" style="padding:0 4px">${L("这些地方本来就没有这类事，比如命令行里没有「给你看的建议」。不算缺记录。", "This kind of work doesn't happen there — e.g. the command line shows no suggestions. Not a missing record.")}</div>` : ""}`);
  }
  function gapsC() {
    const s = state();
    const days = 30;
    const spans = { issues: { assistant: [{ a: 29, b: 29.6, tone: "err", i: 0 }], feed: [{ a: 27, b: 30, tone: "warn", i: 1 }], coding: [{ a: 28, b: 28.3, tone: "warn", i: 2 }] }, cleared: {}, normal: {} }[s];
    const lanes = visibleSources().map((src) => {
      const none = D.grid[src.id].ops === "none";
      const segs = (spans[src.id] || []).map((x) => `<i class="${x.tone} ${S.sel === `t${x.i}` ? "sel" : ""}" data-tsel="t${x.i}" style="left:${x.a / days * 100}%;width:max(6px,${(x.b - x.a) / days * 100}%)" title="${T(D.gapSets[s][x.i].cause)}"></i>`).join("");
      const cleared = s === "cleared" ? `<i class="info" style="left:0;width:18%" title="${L("到期清除", "Cleared")}"></i>` : "";
      return `<div class="lane"><span class="nm">${T(src.name)}</span><div class="bar ${none ? "none" : ""}">${none ? "" : cleared + segs}</div></div>`;
    }).join("");
    let det = "";
    if (S.sel && S.sel.startsWith("t")) { const gap = D.gapSets[s][Number(S.sel.slice(1))]; if (gap) det = `<div class="box"><h3>${srcName(gap.src)} · ${kindLabel(gap.kind)}<span class="grow"></span>${st(gap.st)}</h3><div class="fact">${T(gap.span)} · ${T(gap.cause)}</div>${gapDetail(gap).replace('class="gb"', 'class="gb" style="padding:8px 0 0"')}</div>`; }
    return sheet(`${gapsHeader()}${filters()}
      <div class="box"><div class="lanes">${lanes}</div><div class="ticks" style="margin-top:6px"><span></span><div><span>${L("10 月 5 日", "Oct 5")}</span><span>${L("10 月 19 日", "Oct 19")}</span><span>${L("今天", "Today")}</span></div></div></div>
      ${det || `<div class="fact">${L("点断开的那一段看原因。虚线是还没接入。", "Click a broken segment to see why. Dashed means not connected yet.")}</div>`}
      <div class="legend" style="gap:6px">${["ok", "lost", "off", "cut", "cleared", "none"].map((c) => st(c)).join("")}</div>`, true);
  }

  // ---------- Render & events ----------
  const VIEWS = { scope: { A: scopeA, B: scopeB, C: scopeC }, clean: { A: cleanA, B: cleanB }, space: { A: spaceA, B: spaceB, C: spaceC }, gaps: { A: gapsA, B: gapsB, C: gapsC } };
  function render() {
    strip();
    app.innerHTML = `<div class="rec-app"><div class="desk">${VIEWS[S.block][opt()]()}</div></div>`;
    save();
  }
  function goto(spec) { const [b, s] = spec.split(":"); S.block = b; S.state[b] = s; S.sel = null; S.dlg = null; render(); }
  function announce(msg) { document.getElementById("live").textContent = msg; }

  document.getElementById("block").addEventListener("change", (e) => { S.block = e.target.value; S.sel = null; render(); });
  document.getElementById("opt").addEventListener("change", (e) => { S.opt[S.block] = e.target.value; S.sel = null; render(); });
  document.getElementById("state").addEventListener("change", (e) => { S.state[S.block] = e.target.value; S.sel = null; S.dlg = e.target.value === "dialog" ? "open" : null; render(); });
  document.getElementById("lang").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.lang = b.dataset.lang; render(); } });
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { S.theme = b.dataset.themeSet; render(); } });
  document.getElementById("reset").addEventListener("click", () => { const keep = { lang: S.lang, theme: S.theme }; S = { ...fresh(), ...keep }; render(); });

  app.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest("[data-block]"); if (tab) { S.block = tab.dataset.block; S.sel = null; render(); return; }
    const g = t.closest("[data-goto]"); if (g) { goto(g.dataset.goto); return; }
    const use = t.closest("[data-use]"); if (use && !use.disabled) { S.uses[use.dataset.use] = !S.uses[use.dataset.use]; render(); return; }
    const f = t.closest("[data-filter]"); if (f) { S.filter = f.dataset.filter; render(); return; }
    const cell = t.closest("[data-cell]"); if (cell) { S.sel = S.sel === cell.dataset.cell ? null : cell.dataset.cell; render(); return; }
    const ts = t.closest("[data-tsel]"); if (ts) { S.sel = S.sel === ts.dataset.tsel ? null : ts.dataset.tsel; render(); return; }
    if (t.closest("input,select,label")) return;
    const o = t.closest("[data-open]"); if (o) { const k = o.dataset.open; S.open[k] = k === "storage" ? S.open[k] === false : !S.open[k]; render(); return; }
    const a = t.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "pause") { S.state.scope = "paused"; announce(L("已暂停记录", "Recording paused")); }
    else if (act === "resume") { S.state.scope = "normal"; announce(L("继续记录", "Recording resumed")); }
    else if (act === "seen") S.firstSeen = true;
    else if (act === "toA") { S.opt.scope = "A"; S.block = "scope"; }
    else if (act === "pop") S.popOpen = !S.popOpen;
    else if (act === "keep") { S.period = "keep"; S.state.clean = "normal"; }
    else if (act === "keepB") { S.keepDays = 999; S.state.clean = "normal"; }
    else if (act === "dlg") S.dlg = "open";
    else if (act === "dlgx") { S.dlg = null; if (S.state.clean === "dialog") S.state.clean = "normal"; }
    else if (act === "dlgok") { S.dlg = null; S.state.clean = "running"; render(); setTimeout(() => { if (S.state.clean === "running") { S.state.clean = "after"; render(); } }, 1800); return; }
    else if (act === "editRem") { S.editingReminder = true; S.reminderDraft = String(S.reminder || 2); }
    else if (act === "remX") S.editingReminder = false;
    else if (act === "remOff") { S.reminder = null; if (["near", "over"].includes(S.state.space)) S.state.space = "normal"; }
    else if (act === "remSave") { const v = parseFloat(document.getElementById("remIn").value); if (v > 0) { S.reminder = Math.round(v * 10) / 10; S.editingReminder = false; if (["near", "over"].includes(S.state.space)) S.state.space = "normal"; announce(L(`提醒线已设为 ${S.reminder} GB`, `Reminder set to ${S.reminder} GB`)); } }
    render();
  });
  app.addEventListener("change", (e) => {
    const t = e.target;
    if (t.id === "period") { S.period = t.value; S.state.clean = "normal"; render(); }
    else if (t.id === "dlgRange") { S.dlgRange = t.value; render(); }
    else if (t.id === "dlgProject") { S.dlgProject = t.value; render(); }
    else if (t.dataset.dk) { S.dlgKinds[t.dataset.dk] = t.checked; render(); }
  });
  app.addEventListener("input", (e) => { if (e.target.id === "keepRange") { S.keepDays = 154 - Number(e.target.value); if (S.state.clean === "short") S.state.clean = "normal"; const pos = e.target.selectionStart; render(); const r = document.getElementById("keepRange"); if (r) r.focus(); void pos; } });

  render();
})();
