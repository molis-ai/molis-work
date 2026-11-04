// Batch-18 P1 prototype: which business data a Schedule task may read (plan: specs/proactive-assistant/schedule-task-reads.md).
// Decided already (coordinator 2026-11-04): ticking and writing happen on a platform confirmation surface (plan §3.7 A);
// Schedule only shows the entry row and status. What is open here is the surface's shape: A centred dialog,
// B right-hand sheet, C popover anchored to the row. Every control is a component-board part from window.MW.
// Standalone review prototype, not product code: nothing is written anywhere.
(() => {
  const M = window.MW;
  const D = window.GRANT_DATA;
  const KEY = "molis-proto.schedule-task-grants.v1";
  const DEF = { area: "form", opt: "A", st: "normal", surface: true, lang: "zh", theme: "light" };
  const STATES = ["normal", "first", "nosource", "reconfirm", "provider", "revoked", "failed"];
  const T = {
    zh: {
      protoTitle: "定时任务能读的数据 · 原型", tbd: "待定：确认面 A／B／C", area: "区域", a_form: "任务表单", a_list: "任务列表", opt: "确认面", optA: "A 对话框", optB: "B 侧板", optC: "C 弹层", state: "状态", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      st_normal: "已授权 4 类", st_first: "还没选（只读项目文件）", st_nosource: "没有可读的插件数据", st_reconfirm: "需要重新确认", st_provider: "一类的插件已停用", st_revoked: "撤回一类", st_failed: "失败",
      // Schedule (plugin) — the existing form, plus one row
      newTask: "新建定时任务", editTask: "编辑定时任务", formHelp: "到点后助理按你写的说明做一次，结果留在这条任务里。", fTitle: "标题", fIns: "要做什么", fInsHint: "写清楚要看什么、给出什么。", fDaily: "每天", fTimeHint: "按这台电脑的时间。", fNotify: "有要紧的结果时提醒我", save: "保存", create: "创建", cancel: "取消", close: "关闭",
      reads: "能读的数据", readsHint: "只能读，不能改；只给这一个任务，可随时撤回。",
      readsNone: "没有选，只读项目文件", readsNoneHint: "选了能读的数据，就不再需要工作区。", choose: "选择能读的数据", change: "修改", reconfirm: "重新确认",
      wsHint: "读文件的任务要先给这个项目选一个工作区。", wsLink: "选择工作区",
      needConfirm: "{n} 有新的读取能力，确认前读不到", providerOff: "{n} 已停用，这一类暂时读不到", statusFail: "暂时读不到这个任务的授权状态", statusFailD: "到点照常按上次确认的范围读；这里只是显示不出来。", retry: "重试",
      // list and detail
      tasks: "定时任务", newBtn: "新建", dailyAt: "每天 {t}", next: "下次 {t}", notScheduled: "没有排上", enabled: "已启用", paused: "已暂停", needsRe: "需要重新确认", kData: "读数据", kFiles: "读文件",
      edit: "编辑", pause: "暂停", archive: "归档", readsLine: "能读", instr: "说明", assistant: "助理", system: "系统", revokedTurn: "你撤回了「待办」。下一次运行起读不到待办。", archiveSim: "原型：归档后，这个任务的读取授权一起清除",
      // platform surface
      kicker: "Molis Work · 只有你能确认", sTitle: "「{t}」能读哪些数据", sDesc: "Schedule 请你为这个定时任务选能读的数据。任务在没人看着时运行，只能读你勾上的这些。",
      groupPlugins: "插件的数据", groupPlatform: "平台", knowledgeNote: "默认不勾", contains: "包含：{c}", newCapTag: "新：{c}",
      offTag: "已停用", footNote: "只能读，不能改 · 只给「{t}」 · 可随时撤回",
      sumNone: "没有改动", sumAdd: "允许读：{a}", sumRemove: "撤回：{r}。下一次运行起读不到。", sumBoth: "加上 {a}；撤回 {r}", sumRe: "确认 {n} 新的读取能力", sumEmpty: "一类都不勾：任务只读项目文件。",
      allow: "允许读取", confirmRevoke: "确认撤回", confirm: "确认", revokeAll: "全部撤回",
      noSrcT: "这个项目里还没有能读的插件数据", noSrcD: "装了待办、Inbox、Jelly、Goals 这类插件后会出现在这里。项目资料仍可勾选。",
      saveFailT: "没能保存", saveFailD: "原来的授权没变，任务照旧按原来的范围读。",
      listFailT: "读不到能选的数据", listFailD: "这次没拿到插件清单。不代表没有可读的数据。",
      t_saved: "已更新：「{t}」能读 {n} 类", t_cleared: "已撤回：「{t}」只读项目文件", t_sim: "原型：{x}",
      sep: "、",
    },
    en: {
      protoTitle: "Data a scheduled task may read · prototype", tbd: "Open: surface A / B / C", area: "Area", a_form: "Task form", a_list: "Task list", opt: "Surface", optA: "A Dialog", optB: "B Sheet", optC: "C Popover", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      st_normal: "4 kinds allowed", st_first: "None chosen (project files only)", st_nosource: "No plugin data to read", st_reconfirm: "Needs re-confirming", st_provider: "One kind's plugin is off", st_revoked: "Revoke one kind", st_failed: "Failure",
      newTask: "New scheduled task", editTask: "Edit scheduled task", formHelp: "When it's time, the assistant follows your instructions once and leaves the result in this task.", fTitle: "Title", fIns: "What to do", fInsHint: "Say what to look at and what to give back.", fDaily: "Daily at", fTimeHint: "This computer's time.", fNotify: "Tell me when a result is important", save: "Save", create: "Create", cancel: "Cancel", close: "Close",
      reads: "Data it can read", readsHint: "Read only, never change. For this task only; revoke any time.",
      readsNone: "None chosen; reads project files only", readsNoneHint: "Once it can read data, it no longer needs a workspace.", choose: "Choose data to read", change: "Change", reconfirm: "Re-confirm",
      wsHint: "A task that reads files needs a workspace for this project first.", wsLink: "Choose a workspace",
      needConfirm: "{n} has a new read ability; it stays unread until you confirm", providerOff: "{n} is turned off; this kind can't be read for now", statusFail: "Can't show this task's permissions right now", statusFailD: "Runs still read what you last confirmed; only this display failed.", retry: "Retry",
      tasks: "Scheduled tasks", newBtn: "New", dailyAt: "Daily at {t}", next: "Next {t}", notScheduled: "Not scheduled", enabled: "On", paused: "Paused", needsRe: "Re-confirm", kData: "Reads data", kFiles: "Reads files",
      edit: "Edit", pause: "Pause", archive: "Archive", readsLine: "Reads", instr: "Instructions", assistant: "Assistant", system: "System", revokedTurn: "You revoked To-dos. From the next run it can't read To-dos.", archiveSim: "Prototype: archiving also clears this task's read permissions",
      kicker: "Molis Work · only you can confirm", sTitle: "What can “{t}” read?", sDesc: "Schedule asks you to choose what this scheduled task may read. It runs when nobody is watching and can only read what you tick.",
      groupPlugins: "Plugin data", groupPlatform: "Platform", knowledgeNote: "Off by default", contains: "Includes: {c}", newCapTag: "New: {c}",
      offTag: "Turned off", footNote: "Read only · for “{t}” only · revoke any time",
      sumNone: "No changes", sumAdd: "Allow: {a}", sumRemove: "Revoke: {r}. From the next run it can't be read.", sumBoth: "Add {a}; revoke {r}", sumRe: "Confirm {n}'s new read ability", sumEmpty: "Nothing ticked: the task reads project files only.",
      allow: "Allow", confirmRevoke: "Revoke", confirm: "Confirm", revokeAll: "Revoke all",
      noSrcT: "No plugin data to read in this project yet", noSrcD: "Plugins such as To-dos, Inbox, Jelly and Goals show up here once installed. Project knowledge can still be ticked.",
      saveFailT: "Couldn't save", saveFailD: "Nothing changed: the task still reads what it read before.",
      listFailT: "Can't load what can be read", listFailD: "The plugin list didn't come back this time. That doesn't mean there's nothing to read.",
      t_saved: "Updated: “{t}” can read {n} kinds", t_cleared: "Revoked: “{t}” reads project files only", t_sim: "Prototype: {x}",
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
  const baseGrant = () => (["first", "nosource"].includes(P.st) ? [] : clone(D.granted));
  let ui;
  const freshUi = () => {
    const granted = baseGrant();
    // "Revoke one kind" opens with To-dos already unticked, so the revoke summary shows straight away.
    const draft = P.st === "revoked" ? granted.filter((id) => id !== "todo") : clone(granted);
    return { granted, draft, saveFailed: false, listFailed: false, reconfirmed: false, revokedDone: false };
  };
  ui = freshUi();
  const needsRe = () => P.st === "reconfirm" && !ui.reconfirmed && ui.granted.includes("jelly");
  const providerOff = (id) => P.st === "provider" && id === "jelly";
  const kindOf = () => (ui.granted.length ? "data" : "files");

  /* ---------- small parts ---------- */
  const mark = (c) => `<span class="mw-mark gr-mark"${c.hue ? ` data-hue="${c.hue}"` : ""} aria-hidden="true">${M.icon(c.icon)}</span>`;
  const tag = (c) => `<span class="mw-tag gr-tag"${c.hue ? ` data-hue="${c.hue}"` : ""}>${M.icon(c.icon)}<span>${esc(L(c.name))}</span></span>`;
  const status = (label, tone, state) => M.renderStatusMark({ label, tone, state });
  const alertBox = (tone, title_, body, actions) => `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status"><strong>${esc(title_)}</strong>${body ? `<p>${esc(body)}</p>` : ""}${actions ? `<div class="gr-alert-actions">${actions}</div>` : ""}</div>`;

  /* ---------- Schedule: the entry row (plugin side) ---------- */
  function entryRow(compact) {
    let value, action, note = "";
    if (P.st === "failed" && !ui.saveFailed && P.area === "list") {
      return `<div class="gr-entry gr-entry--fail">${alertBox("warning", t("statusFail"), t("statusFailD"), btn(t("retry"), { size: "sm", icon: "refresh", attrs: act("sim", "retry") }))}</div>`;
    }
    if (!ui.granted.length) {
      value = `<span class="gr-muted">${M.icon("file")}${esc(t("readsNone"))}</span>`;
      action = btn(t("choose"), { size: "sm", icon: "database", attrs: act("surface", "open", { id: "grEntryBtn" }) });
    } else {
      value = `<span class="gr-tags">${ui.granted.map((id) => tag(cat(id))).join("")}</span>`;
      action = needsRe()
        ? btn(t("reconfirm"), { size: "sm", variant: "primary", attrs: act("surface", "open", { id: "grEntryBtn" }) })
        : btn(t("change"), { size: "sm", variant: compact ? "ghost" : "secondary", attrs: act("surface", "open", { id: "grEntryBtn" }) });
      if (needsRe()) note = status(t("needConfirm", { n: L(cat("jelly").name) }), "attention", "answer");
      else if (P.st === "provider") note = status(t("providerOff", { n: L(cat("jelly").name) }), "quiet", "unavailable");
    }
    return `<div class="gr-entry"><div class="gr-entry__row"><div class="gr-entry__value">${value}</div>${action}</div>${note ? `<div class="gr-entry__note">${note}</div>` : ""}</div>`;
  }

  function formDialog() {
    const editing = P.area === "list" || P.st !== "first";
    const hintWs = !ui.granted.length ? `<div class="mw-alert mw-alert--warning" data-slot="alert" role="status"><span>${esc(t("wsHint"))} <a href="#ws" data-act="sim" data-v="ws">${esc(t("wsLink"))}</a></span></div>` : "";
    return `<dialog class="mw-dialog mw-dialog--form gr-form" open aria-labelledby="grFormTitle">
      <form class="mw-form mw-dialog__shell" onsubmit="return false">
        <header class="mw-form__header"><div><h2 id="grFormTitle">${esc(editing ? t("editTask") : t("newTask"))}</h2><p>${esc(t("formHelp"))}</p></div>${btn(t("close"), { variant: "ghost", icon: "x", iconOnly: true, attrs: act("sim", "close") })}</header>
        <div class="mw-form__body">
          <label class="mw-field"><span class="mw-field__label">${esc(t("fTitle"))}</span><input class="mw-input" value="${esc(title())}"></label>
          <label class="mw-field"><span class="mw-field__label">${esc(t("fIns"))}</span><textarea class="mw-textarea" rows="3">${esc(L(D.task.instructions))}</textarea><small class="mw-field__hint">${esc(t("fInsHint"))}</small></label>
          <label class="mw-field"><span class="mw-field__label">${esc(t("fDaily"))}</span><input class="mw-input gr-time" type="time" value="${D.task.time}"><small class="mw-field__hint">${esc(t("fTimeHint"))}</small></label>
          <div class="mw-field gr-reads"><span class="mw-field__label">${esc(t("reads"))}</span>${entryRow(false)}<small class="mw-field__hint">${esc(ui.granted.length ? t("readsHint") : `${t("readsNoneHint")} ${t("readsHint")}`)}</small></div>
          ${M.renderCheckbox({ label: t("fNotify"), checked: true })}
          ${hintWs}
        </div>
        <footer class="mw-form__footer">${btn(t("cancel"), { attrs: act("sim", "cancel") })}${btn(editing ? t("save") : t("create"), { variant: "primary", attrs: act("sim", "save") })}</footer>
      </form>
    </dialog>`;
  }

  /* ---------- the platform surface ---------- */
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
  const footNote = () => `<span class="gr-foot-note">${M.icon("shield")}${esc(t("footNote", { t: title() }))}</span>`;
  function footer() {
    const s = summary();
    const revokeAll = ui.granted.length ? btn(t("revokeAll"), { variant: "ghost", size: P.opt === "C" ? "sm" : undefined, attrs: act("revokeall") }) : "";
    return `<div class="gr-sum" data-tone="${s.tone}" id="grSum" role="status">${esc(s.text)}</div>
      <div class="gr-foot-actions">${revokeAll}<span class="gr-spacer"></span>${btn(t("cancel"), { size: P.opt === "C" ? "sm" : undefined, attrs: act("surface", "close") })}${btn(s.label, { variant: "primary", size: P.opt === "C" ? "sm" : undefined, disabled: !s.ok, attrs: act("save", null, { id: "grSave" }) })}</div>`;
  }
  function catStatus(c) {
    if (providerOff(c.id)) return status(t("offTag"), "quiet", "unavailable");
    if (needsRe() && c.newCap) return status(t("newCapTag", { c: L(c.newCap) }), "attention", "answer");
    if (c.platform) return `<span class="gr-muted gr-small">${esc(t("knowledgeNote"))}</span>`;
    return "";
  }
  // A: option cards (the board's mw-ix-option, several picks → aria-pressed)
  const optionCard = (c) => {
    const on = ui.draft.includes(c.id);
    return `<button type="button" class="mw-ix-option gr-opt" aria-pressed="${on}" data-act="tick" data-v="${c.id}"${providerOff(c.id) ? ' data-off=""' : ""}>
      <span class="mw-ix-option__top">${mark(c)}<span class="mw-ix-option__title">${esc(L(c.name))}</span><span class="mw-ix-option__check" aria-hidden="true">${M.icon("check")}</span></span>
      <span class="mw-ix-option__desc">${esc(L(c.includes))}</span>${catStatus(c) ? `<span class="gr-opt__status">${catStatus(c)}</span>` : ""}</button>`;
  };
  // B: item rows with a switch and the read abilities written out
  const switchRow = (c) => {
    const on = ui.draft.includes(c.id);
    const caps = L(c.caps).join(t("sep")) + (needsRe() && c.newCap ? `${t("sep")}${L(c.newCap)}` : "");
    return `<li class="mw-item gr-row">${mark(c)}<span><strong>${esc(L(c.name))}</strong><small>${esc(L(c.includes))}</small><small class="gr-caps">${esc(t("contains", { c: caps }))}</small>${catStatus(c) ? `<span class="gr-row__status">${catStatus(c)}</span>` : ""}</span>
      <span class="mw-item__end">${M.renderSwitch({ checked: on, attrs: { "data-tick": c.id, "aria-label": L(c.name) } })}</span></li>`;
  };
  // C: compact checkbox rows
  const checkRow = (c) => `<label class="mw-check-row gr-check">${`<input class="mw-check" data-slot="checkbox" type="checkbox" data-tick="${c.id}"${ui.draft.includes(c.id) ? " checked" : ""}>`}<span class="gr-check__text"><span class="gr-check__name">${mark(c)}<b>${esc(L(c.name))}</b>${catStatus(c)}</span><small>${esc(L(c.includes))}</small></span></label>`;

  function surfaceBody() {
    if (P.st === "failed" && ui.listFailed) return alertBox("danger", t("listFailT"), t("listFailD"), btn(t("retry"), { size: "sm", icon: "refresh", attrs: act("relist") }));
    const cats = visibleCats();
    const plugins = cats.filter((c) => !c.platform), platform = cats.filter((c) => c.platform);
    const draw = (list) => P.opt === "A" ? `<div class="mw-ix-options gr-opts" role="group">${list.map(optionCard).join("")}</div>`
      : P.opt === "B" ? `<ul class="mw-items gr-rows">${list.map(switchRow).join("")}</ul>`
      : `<div class="gr-checks">${list.map(checkRow).join("")}</div>`;
    const failed = ui.saveFailed ? alertBox("danger", t("saveFailT"), t("saveFailD"), btn(t("retry"), { size: "sm", icon: "refresh", attrs: act("save") })) : "";
    const pluginPart = plugins.length ? `<section class="gr-group"><h3 class="gr-h">${esc(t("groupPlugins"))}</h3>${draw(plugins)}</section>`
      : M.renderEmpty({ icon: "database", title: t("noSrcT"), body: t("noSrcD"), className: "gr-empty" });
    return `${failed}${pluginPart}<section class="gr-group"><h3 class="gr-h">${esc(t("groupPlatform"))}</h3>${draw(platform)}</section>`;
  }
  const head = () => `<span class="gr-kicker">${M.icon("shield")}${esc(t("kicker"))}</span>`;
  function surface() {
    // In the list, "failed" means the task's permission status could not be read: there is no entry button to open from.
    if (!P.surface || (P.area === "list" && P.st === "failed")) return "";
    const titleId = "grSurfaceTitle";
    if (P.opt === "C") {
      return `<div class="mw-popover gr-pop" id="grPop" role="dialog" aria-labelledby="${titleId}">${head()}<h2 class="gr-pop__title" id="${titleId}">${esc(t("sTitle", { t: title() }))}</h2><div class="gr-pop__body">${surfaceBody()}</div><footer class="gr-pop__foot">${footer()}${footNote()}</footer></div>`;
    }
    const cls = P.opt === "A" ? "mw-dialog mw-dialog--form gr-surface gr-surface--a" : "mw-sheet gr-surface gr-surface--b";
    return `<div class="gr-scrim gr-scrim--surface" data-act="surface" data-v="close"></div><dialog class="${cls}" open aria-labelledby="${titleId}">
      <form class="mw-form ${P.opt === "A" ? "mw-dialog__shell" : "mw-sheet__shell"}" onsubmit="return false">
        <header class="mw-form__header"><div>${head()}<h2 id="${titleId}">${esc(t("sTitle", { t: title() }))}</h2><p>${esc(t("sDesc"))}</p></div>${btn(t("close"), { variant: "ghost", icon: "x", iconOnly: true, attrs: act("surface", "close") })}</header>
        <div class="mw-form__body">${surfaceBody()}</div>
        <footer class="mw-form__footer gr-foot">${footer()}${footNote()}</footer>
      </form></dialog>`;
  }

  /* ---------- Schedule: list and detail (plugin side) ---------- */
  function taskRow(task, current) {
    const isBrief = task.id === D.task.id;
    const kind = isBrief ? kindOf() : task.kind;
    const st = isBrief && needsRe() ? status(t("needsRe"), "attention", "answer") : task.enabled === false ? status(t("paused"), "quiet", "paused") : status(t("enabled"), "progress", "ready");
    const when = `${task.day ? L(task.day) + " " + task.time : t("dailyAt", { t: task.time })} · ${task.next ? t("next", { t: task.next }) : t("notScheduled")}`;
    return `<li class="mw-item gr-task"${current ? ' aria-current="true"' : ""} role="button" tabindex="0" data-act="sim" data-v="row"><span class="mw-mark gr-kind" title="${esc(kind === "data" ? t("kData") : t("kFiles"))}">${M.icon(kind === "data" ? "database" : "file")}</span><span><strong>${esc(L(task.title))}</strong><small>${esc(when)}</small></span><span class="mw-item__end">${st}</span></li>`;
  }
  function listPage() {
    const brief = { id: D.task.id, title: D.task.title, time: D.task.time, enabled: true, next: "11-05 08:00" };
    const rows = [brief, ...D.others].map((x) => taskRow(x, x.id === D.task.id)).join("");
    const turns = [
      `<article class="gr-turn"><header><small>${esc(t("instr"))}</small></header><p>${esc(L(D.task.instructions))}</p></article>`,
      `<article class="gr-turn"><header><small>${esc(t("assistant"))}</small><time>${D.run.when}</time></header><p>${esc(D.run[P.lang])}</p><p class="gr-basis">${M.icon("database")}${esc(L(D.run.basis))}</p></article>`,
    ];
    if (ui.revokedDone) turns.push(`<article class="gr-turn gr-turn--system"><header><small>${esc(t("system"))}</small><time>11-04 09:12</time></header><p>${esc(t("revokedTurn"))}</p></article>`,
      // The next run says plainly which kind it could not read (PWA-149) instead of leaving a silent gap.
      `<article class="gr-turn"><header><small>${esc(t("assistant"))}</small><time>11-05 08:00</time></header><p>${esc(L(D.run.revokedNote))}</p><p class="gr-basis">${M.icon("database")}${esc(L(D.run.basisAfter))}</p></article>`);
    const readsLine = `<div class="gr-readsline"><span class="gr-readsline__label">${esc(t("readsLine"))}</span>${entryRow(true)}</div>`;
    const detail = `<div class="gr-detail">
      <header class="gr-detail__bar"><span class="gr-detail__kicker">${status(t("dailyAt", { t: D.task.time }), "quiet")}${needsRe() ? status(t("needsRe"), "attention", "answer") : status(t("enabled"), "progress", "ready")}</span><span class="gr-spacer"></span>${btn(t("edit"), { variant: "ghost", size: "sm", attrs: act("area", "form") })}${btn(t("pause"), { variant: "ghost", size: "sm", attrs: act("sim", "pause") })}${btn(t("archive"), { variant: "ghost", size: "sm", attrs: act("sim", "archive") })}</header>
      <h1 class="gr-detail__title">${esc(title())}</h1><p class="gr-muted gr-small">${esc(t("next", { t: "11-05 08:00" }))}</p>
      ${readsLine}
      <div class="gr-thread">${turns.join("")}</div></div>`;
    return `<div class="proto-sheet mw-layout-primitives gr-sheet"><div class="gr-split">
      <aside class="gr-list"><div class="gr-list__head"><strong>${esc(t("tasks"))}</strong>${btn(t("newBtn"), { variant: "ghost", size: "sm", icon: "plus", attrs: act("sim", "new") })}</div><ul class="mw-items gr-tasks">${rows}</ul></aside>
      ${detail}</div></div>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const options = STATES.map((k) => `<option value="${k}"${P.st === k ? " selected" : ""}>${esc(t("st_" + k))}</option>`).join("");
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${M.renderBadge({ label: t("tbd"), tone: "warning" })}
      <span class="proto-field">${esc(t("opt"))}${tg(t("opt"), "opt", [["A", t("optA")], ["B", t("optB")], ["C", t("optC")]])}</span>
      <span class="proto-field">${esc(t("area"))}${tg(t("area"), "area", [["form", t("a_form")], ["list", t("a_list")]])}</span>
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
    const behind = listPage();
    const form = P.area === "form" ? `<div class="gr-scrim"></div>${formDialog()}` : "";
    document.getElementById("app").innerHTML = behind + form + surface();
    placePopover();
  }
  // C: the popover sits under the button that opened it (the form's row, or the detail's "Reads" line).
  function placePopover() {
    const pop = document.getElementById("grPop");
    if (!pop) return;
    const anchors = [...document.querySelectorAll("#grEntryBtn")];
    const anchor = anchors[anchors.length - 1];
    const vw = window.innerWidth, vh = window.innerHeight, w = Math.min(380, vw - 16);
    pop.style.width = `${w}px`;
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.right - w, vw - w - 8));
    const below = r.bottom + 6, room = vh - below - 12;
    if (room >= 320 || r.top < vh / 2) { pop.style.top = `${below}px`; pop.style.maxHeight = `${Math.max(240, room)}px`; pop.style.bottom = "auto"; }
    else { pop.style.top = "auto"; pop.style.bottom = `${vh - r.top + 6}px`; pop.style.maxHeight = `${r.top - 60}px`; }
    pop.style.left = `${left}px`;
  }
  let timer;
  const toast = (message, tone) => { const box = document.getElementById("toasts"); box.innerHTML = M.renderToast({ message, tone }); clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 2600); };
  // Ticking only changes the draft: update the pressed state and the footer in place, no re-render (no replayed motion).
  function tick(id, on) {
    ui.draft = on ? [...new Set([...ui.draft, id])] : ui.draft.filter((x) => x !== id);
    const card = document.querySelector(`.gr-opt[data-v="${id}"]`); if (card) card.setAttribute("aria-pressed", String(on));
    const s = summary(), sum = document.getElementById("grSum"), save = document.getElementById("grSave");
    if (sum) { sum.textContent = s.text; sum.dataset.tone = s.tone; }
    if (save) { save.disabled = !s.ok; const lab = save.querySelector("[data-slot=button-label]"); if (lab) lab.textContent = s.label; }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],#reset");
    if (!b) { if (P.surface && P.opt === "C" && !e.target.closest("#grPop") && !e.target.closest(".proto-strip")) { P.surface = false; persist(); render(); } return; }
    if (b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); ui = freshUi(); persist(); return render(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "surface": P.surface = v === "open"; if (v === "open") { ui.draft = clone(ui.granted); ui.saveFailed = false; } persist(); break;
      case "tick": tick(v, b.getAttribute("aria-pressed") !== "true"); return;
      case "revokeall": ui.draft = []; render(); return;
      case "save": {
        if (P.st === "failed") { ui.saveFailed = true; break; }
        const before = ui.granted;
        ui.granted = clone(ui.draft); ui.reconfirmed = true; ui.saveFailed = false; P.surface = false; persist();
        if (before.includes("todo") && !ui.granted.includes("todo")) ui.revokedDone = true;
        render();
        return toast(ui.granted.length ? t("t_saved", { t: title(), n: ui.granted.length }) : t("t_cleared", { t: title() }), "success");
      }
      case "relist": ui.listFailed = false; break;
      case "area": P.area = v; P.surface = false; persist(); break;
      case "sim": return toast(t("t_sim", { x: v === "archive" ? t("archiveSim") : b.textContent.trim() || v }));
      default: return;
    }
    render();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "state") { P.st = e.target.value; P.surface = true; ui = freshUi(); if (P.st === "failed") ui.listFailed = P.area === "form"; persist(); return render(); }
    const id = e.target.dataset.tick;
    if (id) tick(id, e.target.checked);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && P.surface) { P.surface = false; persist(); render(); }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mw-item[role=button]")) { e.preventDefault(); e.target.click(); }
  });
  window.addEventListener("resize", placePopover);

  if (P.st === "failed") ui.listFailed = P.area === "form";
  render();
})();
