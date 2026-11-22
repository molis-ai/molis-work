// Batch-18 P1 prototype: which business data a Schedule task may read (plan: specs/proactive-assistant/schedule-task-reads.md).
// Decided already (coordinator 2026-11-04): ticking and writing happen on a platform-owned surface (plan §3.7 A);
// Schedule only shows the entry and the status. The user (2026-11-04) asked for no pop-ups, so the three options all
// stay in the page: D expands in place, E uses the workbench's own side panel, F is a list of switches that apply at once.
// Task editing is inline in the detail pane too (no form dialog). Every control is a component-board part from window.MW.
// The first round (dialog / sheet / popover) is in git history (commit 4d471c666e).
// Standalone review prototype, not product code: nothing is written anywhere.
(() => {
  const M = window.MW;
  const D = window.GRANT_DATA;
  const KEY = "molis-proto.schedule-task-grants.v2";
  const DEF = { area: "detail", opt: "F", st: "normal", open: true, lang: "zh", theme: "light" };
  const STATES = ["normal", "first", "nosource", "reconfirm", "provider", "revoked", "failed"];
  const T = {
    zh: {
      protoTitle: "定时任务能读的数据 · 原型", tbd: "已定：F 开关即生效", area: "区域", a_detail: "任务详情", a_new: "新建任务", opt: "方案", optD: "D 就地展开", optE: "E 平台侧栏", optF: "F 开关即生效", state: "状态", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      st_normal: "已允许 4 类", st_first: "刚建好，还没选", st_nosource: "没有可读的插件数据", st_reconfirm: "需要重新确认", st_provider: "一类的插件已停用", st_revoked: "撤回一类", st_failed: "失败",
      tasks: "定时任务", newBtn: "新建", dailyAt: "每天 {t}", next: "下次 {t}", notScheduled: "没有排上", enabled: "已启用", paused: "已暂停", needsRe: "需要重新确认", kData: "读数据", kFiles: "读文件",
      edit: "编辑", pause: "暂停", archive: "归档", instr: "说明", assistant: "助理", system: "系统",
      newTitle: "新建定时任务", fTitle: "标题", fTitlePh: "比如：每日简报", fIns: "要做什么", fInsPh: "写清楚要看什么、给出什么", fDaily: "每天", fTimeHint: "按这台电脑的时间。", fNotify: "有要紧的结果时提醒我", create: "创建", cancel: "取消",
      newReads: "建好之后，在这条任务里选它能读的数据（待办、Inbox、日程、目标……）。不选就只读项目文件。",
      reads: "能读的数据", readsNone: "还没选，只读项目文件", change: "修改", choose: "选择", reconfirm: "重新确认", done: "收起",
      wsHint: "只读项目文件的任务要先给这个项目选一个工作区。", wsLink: "选择工作区",
      justCreated: "任务建好了。选好它能读的数据，下一次运行就能读到。",
      kicker: "Molis Work · 只有你能改", slotLead: "只能读，不能改；只给「{t}」；随时可以撤回。",
      groupPlugins: "插件的数据", groupPlatform: "平台",
      newCap: "新：{c}", offTag: "已停用", allowNew: "允许",
      contains: "包含：{c}",
      sumNone: "没有改动", sumAdd: "允许读：{a}", sumRemove: "撤回：{r}。下一次运行起读不到。", sumBoth: "加上 {a}；撤回 {r}", sumRe: "确认 {n} 新的读取能力", sumEmpty: "一类都不勾：任务只读项目文件。",
      allow: "允许读取", confirmRevoke: "确认撤回", confirm: "确认", revokeAll: "全部撤回",
      liveOn: "已允许读「{n}」", liveOff: "已撤回「{n}」，下一次运行起读不到", liveRe: "已允许「{n}」新的读取能力", undo: "撤销",
      noSrcT: "这个项目里还没有能读的插件数据", noSrcD: "装了待办、Inbox、Jelly、Goals 这类插件后会出现在这里。项目资料仍可选。",
      saveFailT: "没能保存", saveFailD: "原来的授权没变，任务照旧按原来的范围读。", retry: "重试",
      statusFail: "暂时读不到这个任务能读什么", statusFailD: "到点照常按上次确认的范围读；只是这里显示不出来。",
      providerOff: "{n} 已停用，这一类暂时读不到；授权还在，插件回来就恢复。", needConfirm: "{n} 多了一项读取能力，确认前读不到。",
      panelTitle: "「{t}」能读的数据", panelTabs: "讨论", panelFiles: "文件", panelReads: "能读的数据", close: "关闭",
      revokedTurn: "你撤回了「待办」。下一次运行起读不到待办。",
      t_saved: "已更新：「{t}」能读 {n} 类", t_cleared: "已撤回：「{t}」只读项目文件", t_sim: "原型：{x}", t_created: "已创建「{t}」",
      archiveSim: "归档后，这个任务的读取授权一起清除",
      sep: "、",
    },
    en: {
      protoTitle: "Data a scheduled task may read · prototype", tbd: "Chosen: F switches apply at once", area: "Area", a_detail: "Task detail", a_new: "New task", opt: "Option", optD: "D Expand in place", optE: "E Platform side panel", optF: "F Switches apply at once", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      st_normal: "4 kinds allowed", st_first: "Just created, none chosen", st_nosource: "No plugin data to read", st_reconfirm: "Needs re-confirming", st_provider: "One kind's plugin is off", st_revoked: "Revoke one kind", st_failed: "Failure",
      tasks: "Scheduled tasks", newBtn: "New", dailyAt: "Daily at {t}", next: "Next {t}", notScheduled: "Not scheduled", enabled: "On", paused: "Paused", needsRe: "Re-confirm", kData: "Reads data", kFiles: "Reads files",
      edit: "Edit", pause: "Pause", archive: "Archive", instr: "Instructions", assistant: "Assistant", system: "System",
      newTitle: "New scheduled task", fTitle: "Title", fTitlePh: "e.g. Daily brief", fIns: "What to do", fInsPh: "Say what to look at and what to give back", fDaily: "Daily at", fTimeHint: "This computer's time.", fNotify: "Tell me when a result is important", create: "Create", cancel: "Cancel",
      newReads: "Once it's created, choose here what it may read (To-dos, Inbox, schedule, goals…). Without a choice it reads project files only.",
      reads: "Data it can read", readsNone: "None chosen; reads project files only", change: "Change", choose: "Choose", reconfirm: "Re-confirm", done: "Done",
      wsHint: "A task that reads only project files needs a workspace for this project first.", wsLink: "Choose a workspace",
      justCreated: "Task created. Choose what it may read and the next run can read it.",
      kicker: "Molis Work · only you can change this", slotLead: "Read only, never change; for “{t}” only; revoke any time.",
      groupPlugins: "Plugin data", groupPlatform: "Platform",
      newCap: "New: {c}", offTag: "Turned off", allowNew: "Allow",
      contains: "Includes: {c}",
      sumNone: "No changes", sumAdd: "Allow: {a}", sumRemove: "Revoke: {r}. From the next run it can't be read.", sumBoth: "Add {a}; revoke {r}", sumRe: "Confirm {n}'s new read ability", sumEmpty: "Nothing ticked: the task reads project files only.",
      allow: "Allow", confirmRevoke: "Revoke", confirm: "Confirm", revokeAll: "Revoke all",
      liveOn: "Now reads “{n}”", liveOff: "Revoked “{n}” — the next run can’t read it", liveRe: "Allowed “{n}” to read more", undo: "Undo",
      noSrcT: "No plugin data to read in this project yet", noSrcD: "Plugins such as To-dos, Inbox, Jelly and Goals show up here once installed. Project knowledge can still be chosen.",
      saveFailT: "Couldn't save", saveFailD: "Nothing changed: the task still reads what it read before.", retry: "Retry",
      statusFail: "Can't show what this task can read right now", statusFailD: "Runs still read what you last confirmed; only this display failed.",
      providerOff: "{n} is turned off, so this kind can't be read for now; the permission stays and comes back with the plugin.", needConfirm: "{n} has a new read ability; it stays unread until you confirm.",
      panelTitle: "What “{t}” can read", panelTabs: "Discussion", panelFiles: "Files", panelReads: "Readable data", close: "Close",
      revokedTurn: "You revoked To-dos. From the next run it can't read To-dos.",
      t_saved: "Updated: “{t}” can read {n} kinds", t_cleared: "Revoked: “{t}” reads project files only", t_sim: "Prototype: {x}", t_created: "Created “{t}”",
      archiveSim: "archiving also clears this task's read permissions",
      sep: ", ",
    },
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let P = (() => { try { return Object.assign(clone(DEF), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return clone(DEF); } })();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private window: keep in memory */ } };
  const t = (k, v) => (T[P.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const L = (o) => (o && typeof o === "object" ? o[P.lang] : o) ?? "";
  const esc = M.escapeHtml;
  const cat = (id) => D.categories.find((c) => c.id === id);
  const act = (a, v, extra) => Object.assign({ "data-act": a }, v != null ? { "data-v": v } : {}, extra || {});
  const btn = (label, o = {}) => M.renderButton({ label, variant: o.variant || "secondary", size: o.size, icon: o.icon, iconOnly: o.iconOnly, disabled: o.disabled, className: o.className, attrs: o.attrs });
  const names = (ids) => ids.map((id) => L(cat(id).name)).join(t("sep"));
  const title = () => L(D.task.title);

  /* ---------- state ---------- */
  const visibleCats = () => (P.st === "nosource" ? D.categories.filter((c) => c.platform) : D.categories);
  const freshUi = () => {
    const granted = ["first", "nosource"].includes(P.st) ? [] : clone(D.granted);
    // "Revoke one kind" opens with To-dos already switched off in D and E, so the revoke summary shows straight away.
    const draft = P.st === "revoked" && P.opt !== "F" ? granted.filter((id) => id !== "todo") : clone(granted);
    const base = { granted, draft, saveFailed: false, reconfirmed: false, revokedDone: false, live: null, prev: null, justCreated: P.st === "first" };
    // F has no draft: "Revoke one kind" shows the moment right after To-dos was switched off, with undo.
    if (P.st === "revoked" && P.opt === "F") Object.assign(base, { prev: clone(granted), granted: granted.filter((id) => id !== "todo"), live: { kind: "off", id: "todo" }, revokedDone: true });
    return base;
  };
  let ui = freshUi();
  const needsRe = () => P.st === "reconfirm" && !ui.reconfirmed && ui.granted.includes("jelly");
  const providerOff = (id) => P.st === "provider" && id === "jelly";
  const statusFailed = () => P.st === "failed" && P.opt !== "F" && !ui.saveFailed && !P.open;

  /* ---------- small parts ---------- */
  const mark = (c) => `<span class="mw-mark gr-mark"${c.hue ? ` data-hue="${c.hue}"` : ""} aria-hidden="true">${M.icon(c.icon)}</span>`;
  const tag = (c) => `<span class="mw-tag gr-tag"${c.hue ? ` data-hue="${c.hue}"` : ""}>${M.icon(c.icon)}<span>${esc(L(c.name))}</span></span>`;
  const status = (label, tone, state) => M.renderStatusMark({ label, tone, state });
  const alertBox = (tone, title_, body, actions) => `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status"><strong>${esc(title_)}</strong>${body ? `<p>${esc(body)}</p>` : ""}${actions ? `<div class="gr-alert-actions">${actions}</div>` : ""}</div>`;
  const kicker = () => `<span class="gr-kicker">${M.icon("shield")}${esc(t("kicker"))}</span>`;

  /* ---------- the category rows (platform side) ---------- */
  function rowStatus(c) {
    if (providerOff(c.id)) return status(t("offTag"), "quiet", "unavailable");
    if (needsRe() && c.newCap) return status(t("newCap", { c: L(c.newCap) }), "attention", "answer");
    return "";
  }
  // One kind = one item row: plugin mark, name, what it includes, and a switch (the board's mw-switch).
  function catRow(c, on) {
    const st = rowStatus(c);
    const caps = P.opt === "E" ? `<small class="gr-caps">${esc(t("contains", { c: L(c.caps).join(t("sep")) + (needsRe() && c.newCap ? t("sep") + L(c.newCap) : "") }))}</small>` : "";
    const allowNew = P.opt === "F" && needsRe() && c.newCap ? btn(t("allowNew"), { size: "sm", variant: "primary", attrs: act("reconfirm") }) : "";
    return `<li class="mw-item gr-row"${providerOff(c.id) ? " data-off" : ""}>${mark(c)}<span><strong>${esc(L(c.name))}</strong><small>${esc(L(c.includes))}</small>${caps}${st ? `<span class="gr-row__status">${st}</span>` : ""}</span>
      <span class="mw-item__end">${allowNew}${M.renderSwitch({ checked: on, attrs: { "data-tick": c.id, "aria-label": L(c.name) } })}</span></li>`;
  }
  function rows(list) {
    const draftOrLive = P.opt === "F" ? ui.granted : ui.draft;
    return `<ul class="mw-items gr-rows">${list.map((c) => catRow(c, draftOrLive.includes(c.id))).join("")}</ul>`;
  }
  function picker() {
    const cats = visibleCats();
    const plugins = cats.filter((c) => !c.platform), platform = cats.filter((c) => c.platform);
    const failed = ui.saveFailed ? alertBox("danger", t("saveFailT"), t("saveFailD"), btn(t("retry"), { size: "sm", icon: "refresh", attrs: act("retry") })) : "";
    const pluginPart = plugins.length ? `<div class="gr-group"><h4 class="gr-h">${esc(t("groupPlugins"))}</h4>${rows(plugins)}</div>`
      : M.renderEmpty({ icon: "database", title: t("noSrcT"), body: t("noSrcD"), className: "gr-empty" });
    return `${failed}${pluginPart}<div class="gr-group"><h4 class="gr-h">${esc(t("groupPlatform"))}</h4>${rows(platform)}</div>`;
  }

  /* ---------- D and E: change, then confirm ---------- */
  const diff = () => ({ add: ui.draft.filter((id) => !ui.granted.includes(id)), rem: ui.granted.filter((id) => !ui.draft.includes(id)) });
  function summary() {
    const { add, rem } = diff();
    if (needsRe() && !add.length && !rem.length) return { text: t("sumRe", { n: L(cat("jelly").name) }), label: t("confirm"), ok: true, tone: "" };
    if (!add.length && !rem.length) return { text: t("sumNone"), label: t("confirm"), ok: false, tone: "" };
    const empty = !ui.draft.length ? ` ${t("sumEmpty")}` : "";
    if (add.length && rem.length) return { text: t("sumBoth", { a: names(add), r: names(rem) }) + empty, label: t("confirm"), ok: true, tone: "warn" };
    if (rem.length) return { text: t("sumRemove", { r: names(rem) }) + empty, label: t("confirmRevoke"), ok: true, tone: "warn" };
    return { text: t("sumAdd", { a: names(add) }), label: t("allow"), ok: true, tone: "" };
  }
  function confirmBar() {
    const s = summary();
    const all = ui.granted.length ? btn(t("revokeAll"), { variant: "ghost", size: "sm", attrs: act("revokeall") }) : "";
    return `<div class="gr-bar"><div class="gr-sum" data-tone="${s.tone}" id="grSum" role="status">${esc(s.text)}</div>
      <div class="gr-bar__actions">${all}<span class="gr-spacer"></span>${btn(t("cancel"), { size: "sm", variant: "ghost", attrs: act("close") })}${btn(s.label, { size: "sm", variant: "primary", disabled: !s.ok, attrs: act("save", null, { id: "grSave" }) })}</div></div>`;
  }
  /* ---------- F: every switch applies at once; one quiet line says what happened, with undo ---------- */
  function liveLine() {
    if (!ui.live) return "";
    const { kind, id } = ui.live;
    const n = L(cat(id).name);
    const text = kind === "on" ? t("liveOn", { n }) : kind === "off" ? t("liveOff", { n }) : t("liveRe", { n });
    // The board's one toast with its action (mw-toast + mw-toast__action), set in place under the switches rather than floating:
    // words and the undo chip share one capsule, so their height and baseline line up at every width.
    return `<div class="gr-live">${M.renderToast({ message: text, tone: kind === "off" ? "neutral" : "success", action: kind === "re" ? undefined : { label: t("undo"), attrs: act("undo") } })}</div>`;
  }

  /* ---------- Schedule: the "can read" section in the detail ---------- */
  const tags = () => (ui.granted.length ? `<span class="gr-tags">${ui.granted.map((id) => tag(cat(id))).join("")}</span>` : `<span class="gr-muted">${M.icon("file")}${esc(t("readsNone"))}</span>`);
  function sectionNote() {
    if (needsRe()) return `<div class="gr-entry__note">${status(t("needConfirm", { n: L(cat("jelly").name) }), "attention", "answer")}</div>`;
    if (P.st === "provider") return `<div class="gr-entry__note">${status(t("providerOff", { n: L(cat("jelly").name) }), "quiet", "unavailable")}</div>`;
    return "";
  }
  function readsSection() {
    const head = `<div class="gr-sec__head"><h3 class="gr-h3">${esc(t("reads"))}</h3>`;
    if (statusFailed()) return `<section class="gr-sec">${head}</div>${alertBox("warning", t("statusFail"), t("statusFailD"), btn(t("retry"), { size: "sm", icon: "refresh", attrs: act("open") }))}</section>`;
    const ws = !ui.granted.length && !P.open ? `<div class="mw-alert mw-alert--warning" data-slot="alert" role="status"><span>${esc(t("wsHint"))} <a href="#ws" data-act="sim" data-v="ws">${esc(t("wsLink"))}</a></span></div>` : "";
    const fresh = ui.justCreated ? `<p class="gr-lead">${M.icon("sparkles")}${esc(t("justCreated"))}</p>` : "";
    if (P.opt === "F") {
      // F: the platform block is always there; no edit mode, no confirm button.
      return `<section class="gr-sec">${head}</div>${fresh}<div class="gr-slot">${kicker()}<p class="gr-slot__lead">${esc(t("slotLead", { t: title() }))}</p>${picker()}${liveLine()}</div>${sectionNote()}</section>`;
    }
    const openLabel = needsRe() ? t("reconfirm") : ui.granted.length ? t("change") : t("choose");
    const toggle = P.open
      ? (P.opt === "D" ? btn(t("done"), { size: "sm", variant: "ghost", attrs: act("close") }) : btn(openLabel, { size: "sm", variant: "secondary", attrs: act("open", null, { "aria-pressed": "true" }) }))
      : btn(openLabel, { size: "sm", variant: needsRe() ? "primary" : "secondary", attrs: act("open") });
    const summaryRow = `<div class="gr-entry__row">${tags()}${toggle}</div>`;
    // D: the same place opens into the platform block. E: the block lives in the workbench side panel instead.
    const inPlace = P.opt === "D" && P.open ? `<div class="gr-slot gr-slot--open">${kicker()}<p class="gr-slot__lead">${esc(t("slotLead", { t: title() }))}</p>${picker()}${confirmBar()}</div>` : "";
    return `<section class="gr-sec">${head}</div>${fresh}${P.opt === "D" && P.open ? "" : summaryRow}${inPlace}${sectionNote()}${ws}</section>`;
  }

  /* ---------- the workbench side panel (platform), option E ---------- */
  function sidePanel() {
    if (P.opt !== "E" || !P.open || P.area !== "detail") return "";
    // The workbench side panel already has tabs (discussion, browser, files, plugin views); the platform adds one.
    const tabs = M.renderTabs({ label: t("panelReads"), className: "gr-panel__tabs", tabs: [{ id: "discussion", label: t("panelTabs") }, { id: "files", label: t("panelFiles") }, { id: "reads", label: t("panelReads"), selected: true }] });
    return `<aside class="gr-panel" aria-labelledby="grPanelTitle">
      <header class="gr-panel__head">${tabs}<span class="gr-spacer"></span>${btn(t("close"), { variant: "ghost", size: "sm", icon: "x", iconOnly: true, attrs: act("close") })}</header>
      <div class="gr-panel__body">${kicker()}<h2 class="gr-panel__title" id="grPanelTitle">${esc(t("panelTitle", { t: title() }))}</h2><p class="gr-slot__lead">${esc(t("slotLead", { t: title() }))}</p>${picker()}</div>
      <footer class="gr-panel__foot">${confirmBar()}</footer></aside>`;
  }

  /* ---------- Schedule: list and detail (plugin side) ---------- */
  function taskRow(task, current) {
    const isBrief = task.id === D.task.id;
    const kind = isBrief ? (ui.granted.length ? "data" : "files") : task.kind;
    const st = isBrief && needsRe() ? status(t("needsRe"), "attention", "answer") : task.enabled === false ? status(t("paused"), "quiet", "paused") : status(t("enabled"), "progress", "ready");
    const when = task.day ? L(task.day) + " " + task.time : t("dailyAt", { t: task.time });
    const next = task.next ? t("next", { t: task.next }) : t("notScheduled");
    return `<li class="mw-item gr-task"${current ? ' aria-current="true"' : ""} role="button" tabindex="0" data-act="${isBrief ? "area" : "sim"}" data-v="${isBrief ? "detail" : "row"}"><span class="mw-mark gr-kind" title="${esc(kind === "data" ? t("kData") : t("kFiles"))}">${M.icon(kind === "data" ? "database" : "file")}</span><span><strong>${esc(L(task.title))}</strong><small>${esc(when)}</small><small class="gr-next">${esc(next)}</small></span><span class="mw-item__end">${st}</span></li>`;
  }
  function detail() {
    const turns = ui.justCreated ? [] : [
      `<article class="gr-turn"><header><small>${esc(t("instr"))}</small></header><p>${esc(L(D.task.instructions))}</p></article>`,
      `<article class="gr-turn"><header><small>${esc(t("assistant"))}</small><time>${D.run.when}</time></header><p>${esc(D.run[P.lang])}</p><p class="gr-basis">${M.icon("database")}${esc(L(D.run.basis))}</p></article>`,
    ];
    if (ui.revokedDone) turns.push(`<article class="gr-turn gr-turn--system"><header><small>${esc(t("system"))}</small><time>11-04 09:12</time></header><p>${esc(t("revokedTurn"))}</p></article>`,
      // The next run says plainly which kind it could not read (PWA-149) instead of leaving a silent gap.
      `<article class="gr-turn"><header><small>${esc(t("assistant"))}</small><time>11-05 08:00</time></header><p>${esc(L(D.run.revokedNote))}</p><p class="gr-basis">${M.icon("database")}${esc(L(D.run.basisAfter))}</p></article>`);
    return `<div class="gr-detail">
      <header class="gr-detail__bar"><span class="gr-detail__kicker">${status(t("dailyAt", { t: D.task.time }), "quiet")}${needsRe() ? status(t("needsRe"), "attention", "answer") : status(t("enabled"), "progress", "ready")}</span><span class="gr-spacer"></span>${btn(t("edit"), { variant: "ghost", size: "sm", attrs: act("sim", "edit") })}${btn(t("pause"), { variant: "ghost", size: "sm", attrs: act("sim", "pause") })}${btn(t("archive"), { variant: "ghost", size: "sm", attrs: act("sim", "archive") })}</header>
      <h1 class="gr-detail__title">${esc(title())}</h1><p class="gr-muted gr-small">${esc(t("next", { t: "11-05 08:00" }))}</p>
      ${readsSection()}
      ${turns.length ? `<div class="gr-thread">${turns.join("")}</div>` : ""}</div>`;
  }
  // New task: written in the detail pane, not a dialog. Data permissions are chosen right after it exists (they belong to the task).
  function newForm() {
    return `<div class="gr-detail"><form class="mw-form gr-newform" onsubmit="return false">
      <header class="mw-form__header"><div><h2>${esc(t("newTitle"))}</h2></div></header>
      <div class="mw-form__body">
        <label class="mw-field"><span class="mw-field__label">${esc(t("fTitle"))}</span><input class="mw-input" placeholder="${esc(t("fTitlePh"))}" value="${esc(title())}"></label>
        <label class="mw-field"><span class="mw-field__label">${esc(t("fIns"))}</span><textarea class="mw-textarea" rows="3" placeholder="${esc(t("fInsPh"))}">${esc(L(D.task.instructions))}</textarea></label>
        <label class="mw-field gr-time-field"><span class="mw-field__label">${esc(t("fDaily"))}</span><input class="mw-input" type="time" value="${D.task.time}"><small class="mw-field__hint">${esc(t("fTimeHint"))}</small></label>
        ${M.renderCheckbox({ label: t("fNotify"), checked: true })}
        <div class="mw-field"><span class="mw-field__label">${esc(t("reads"))}</span><p class="gr-lead gr-lead--quiet">${M.icon("database")}${esc(t("newReads"))}</p></div>
      </div>
      <footer class="mw-form__footer">${btn(t("cancel"), { variant: "ghost", attrs: act("area", "detail") })}${btn(t("create"), { variant: "primary", attrs: act("create") })}</footer>
    </form></div>`;
  }
  function page() {
    const brief = { id: D.task.id, title: D.task.title, time: D.task.time, enabled: true, next: "11-05 08:00" };
    const list = [brief, ...D.others].map((x) => taskRow(x, P.area === "detail" && x.id === D.task.id)).join("");
    const panel = sidePanel();
    return `<div class="gr-work${panel ? " gr-work--panel" : ""}"><div class="proto-sheet mw-layout-primitives gr-sheet"><div class="gr-split">
      <aside class="gr-list"><div class="gr-list__head"><strong>${esc(t("tasks"))}</strong>${btn(t("newBtn"), { variant: "ghost", size: "sm", icon: "plus", attrs: act("area", "new", P.area === "new" ? { "aria-pressed": "true" } : {}) })}</div><ul class="mw-items gr-tasks">${list}</ul></aside>
      ${P.area === "new" ? newForm() : detail()}</div></div>${panel}</div>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const options = STATES.map((k) => `<option value="${k}"${P.st === k ? " selected" : ""}>${esc(t("st_" + k))}</option>`).join("");
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${M.renderBadge({ label: t("tbd"), tone: "success" })}
      <span class="proto-field">${esc(t("opt"))}${tg(t("opt"), "opt", [["D", t("optD")], ["E", t("optE")], ["F", t("optF")]])}</span>
      <span class="proto-field">${esc(t("area"))}${tg(t("area"), "area", [["detail", t("a_detail")], ["new", t("a_new")]])}</span>
      <label>${esc(t("state"))}<select class="mw-select" data-slot="select" id="state">${options}</select></label>
      <span class="proto-field">${esc(t("lang"))}${tg(t("lang"), "lang", [["zh", "中文"], ["en", "English"]])}</span>
      <span class="proto-field">${esc(t("theme"))}${tg(t("theme"), "theme", [["light", t("light")], ["dark", t("dark")]])}</span>
      ${btn(t("reset"), { variant: "ghost", icon: "undo", attrs: { id: "reset" } })}`;
  }
  function render() {
    const root = document.documentElement;
    root.lang = P.lang === "zh" ? "zh-CN" : "en";
    root.dataset.theme = P.theme;
    root.dataset.resolvedTheme = P.theme;
    renderStrip();
    document.getElementById("app").innerHTML = page();
  }
  let timer;
  const toast = (message, tone) => { const box = document.getElementById("toasts"); box.innerHTML = M.renderToast({ message, tone }); clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 2600); };
  // D and E: a switch only changes the draft — update the summary and button in place, no re-render (no replayed motion).
  function draftTick(id, on) {
    ui.draft = on ? [...new Set([...ui.draft, id])] : ui.draft.filter((x) => x !== id);
    const s = summary(), sum = document.getElementById("grSum"), save = document.getElementById("grSave");
    if (sum) { sum.textContent = s.text; sum.dataset.tone = s.tone; }
    if (save) { save.disabled = !s.ok; const lab = save.querySelector("[data-slot=button-label]"); if (lab) lab.textContent = s.label; }
  }
  // F: a switch is the write. A failed write puts the switch back and says so in the block.
  function liveTick(id, on) {
    if (P.st === "failed") { ui.saveFailed = true; render(); return; }
    ui.prev = clone(ui.granted);
    ui.granted = on ? [...new Set([...ui.granted, id])] : ui.granted.filter((x) => x !== id);
    if (!on && id === "todo") ui.revokedDone = true;
    ui.live = { kind: on ? "on" : "off", id }; ui.justCreated = false;
    render();
  }
  function commit() {
    if (P.st === "failed") { ui.saveFailed = true; return render(); }
    const before = ui.granted;
    ui.granted = clone(ui.draft); ui.reconfirmed = true; ui.saveFailed = false; ui.justCreated = false; P.open = false; persist();
    if (before.includes("todo") && !ui.granted.includes("todo")) ui.revokedDone = true;
    render();
    toast(ui.granted.length ? t("t_saved", { t: title(), n: ui.granted.length }) : t("t_cleared", { t: title() }), "success");
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],#reset");
    if (!b || b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); ui = freshUi(); persist(); return render(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; if (b.dataset.set === "opt") { P.open = true; ui = freshUi(); } persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "open": if (P.open && P.opt === "E") { P.open = false; } else { P.open = true; ui.draft = clone(ui.granted); ui.saveFailed = false; } persist(); break;
      case "close": P.open = false; ui.draft = clone(ui.granted); persist(); break;
      case "save": return commit();
      case "revokeall": ui.draft = []; break;
      case "reconfirm": ui.reconfirmed = true; ui.live = { kind: "re", id: "jelly" }; break;
      case "undo": if (ui.prev) { ui.granted = ui.prev; ui.prev = null; ui.live = null; ui.revokedDone = false; } break;
      case "retry": ui.saveFailed = false; break;
      case "create": P.area = "detail"; P.st = "first"; P.open = true; ui = freshUi(); persist(); render(); return toast(t("t_created", { t: title() }), "success");
      case "area": P.area = v; persist(); break;
      case "sim": return toast(t("t_sim", { x: v === "archive" ? t("archiveSim") : b.textContent.trim() || v }));
      default: return;
    }
    render();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "state") { P.st = e.target.value; P.area = "detail"; P.open = P.st !== "failed" || P.opt === "F"; ui = freshUi(); persist(); return render(); }
    const id = e.target.dataset.tick;
    if (!id) return;
    if (P.opt === "F") liveTick(id, e.target.checked); else draftTick(id, e.target.checked);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mw-item[role=button]")) { e.preventDefault(); e.target.click(); }
    if (e.key === "Escape" && P.open && P.opt !== "F") { P.open = false; ui.draft = clone(ui.granted); persist(); render(); }
  });

  render();
})();
