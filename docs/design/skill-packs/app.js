// Batch-08 prototype: skill packs — install preview, enable / manual-only, and the shared catalog
// (spec: specs/skill-packs/spec.md; contract draft: specs/skill-packs/contract-design.md §5–§9).
// Fixed already: installing, importing or opening a skill never enables it; enabling only goes through
// skills.settings.set@1 and is kept per scope (project or personal space); upgrades keep "manual only".
// The three options differ in WHEN you enable and in how the catalog is laid out:
//   A  enable as the next step, in the same place, right after install — catalog grouped by pack, three-way choice per row
//   B  pick inside the install confirmation (switches default off)     — catalog grouped by pack, switch + "manual only"
//   C  install only lists; enable later in the catalog                  — catalog as list + detail
// Decided by the user 2026-11-04: A's enable step + C's catalog (option "AC", the default); A, B, C stay for comparison.
// Every control is a component-board part from window.MW. Standalone review prototype: nothing is written anywhere.
(() => {
  const M = window.MW;
  const D = window.SKILL_DATA;
  const KEY = "molis-proto.skill-packs.v2";
  const DEF = { opt: "AC", area: "install", st: "new", lang: "zh", theme: "light" };
  const AREA_STATES = { install: ["new", "upgrade", "bad"], import: ["found", "none"], manage: ["normal", "empty", "failed"] };
  const T = {
    zh: {
      protoTitle: "技能包 · 原型", tbd: "已定：A 的启用＋C 的目录", opt: "方案", optAC: "已定 A＋C", optA: "A 装完接着启用", optB: "B 确认时一并选", optC: "C 到目录里再开",
      area: "区域", a_install: "安装预览", a_import: "从本机导入", a_manage: "技能目录", state: "状态", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      st_new: "新装", st_upgrade: "升级 1.4 → 2.0", st_bad: "包有问题", st_found: "找到 3 个", st_none: "没找到", st_normal: "正常", st_empty: "还没有技能", st_failed: "保存失败",
      settings: "设置", tabPlugins: "插件", tabSkills: "技能", projectScope: "项目：{p}",
      // install review (existing panel, shortened) + the new skills block
      installTo: "安装到这个项目", signer: "acme.writing · 签名者 {s}", upgradeLine: "已装的是 {from}，装上后升级到 {to}；数据和你的启用设置都保留。",
      perms: "权限", permsNone: "不要求任何权限", effects: "它的代码能做的事", effectsNone: "没有代码，只有内容；不读写任何东西",
      pinned: "你已把这个发布者固定为 {n}", skillsH: "这个包带的技能（{n}）", skillsLead: "技能是一套做法，告诉助理或 Coding 某类事怎么做。它不带任何权限：用到的工具和连接，仍按你给的授权来。",
      notEnabled: "装上不等于启用：装好后它们都关着，不会被用。", pickLead: "装好后要用哪些？默认都关着；打开的会让 AI 按任务自己选用。",
      cancel: "取消", install: "同意并安装", installAndEnable: "安装并启用 {n} 个", repick: "重新选文件",
      badT: "这个包装不上", badD: "{why}。什么都没装，原来的也没动。",
      details: "看详情", whenUse: "什么时候用", whenNot: "什么时候不用", tools: "声明的工具（只是说明，不给权限）", files: "附带的文件", filesNone: "没有附带文件", bodyStart: "正文开头",
      appliesAssistant: "助理", appliesCoding: "Coding", appliesBoth: "助理和 Coding", runsScripts: "会执行脚本", uses: "用到：{c}", conn_calendar: "日历",
      ch_added: "新增", ch_body_changed: "正文变了", ch_resources_changed: "附带文件变了", ch_removed: "会移除", keptManual: "仅手动会保留", keptAuto: "照旧启用",
      roleRef: "参考", roleScript: "脚本 · 会执行", roleAsset: "素材",
      // the enable step / states
      sOff: "关", sAuto: "自动", sManual: "仅手动", stateLabel: "「{n}」怎么用",
      expOff: "关：不会被用。", expAuto: "自动：AI 按任务自己选用；你点名时优先用你点的。", expManual: "仅手动：只在你用 / 点名时用，AI 不会自己选。",
      doneT: "已装好「{n}」{v}", enableH: "在「{p}」里用哪些", enableLead: "现在都关着。选好就生效，以后也能在「技能」里改。", enableLeadUp: "升级不改你原来的设置；新增的技能关着。",
      later: "以后再说", finish: "完成", goCatalog: "去「技能」", cInstalled: "{k} 个技能都还没启用。到「技能」里选哪些要用。", cInstalledT: "已装好「{n}」{v}",
      enableAfter: "装好后启用", manualOnly: "仅手动点名",
      // catalog
      catLead: "装上的技能都在这里。打开以后，助理和 Coding 会按任务自己选用；改成仅手动，就只在你用 / 点名时用。", catSum: "共 {n} 个，在用 {on} 个",
      search: "找技能", fAll: "全部", fOn: "在用", fOff: "没启用", fNa: "用不了", importBtn: "从本机导入", market: "去插件市场", noMatch: "没有符合的技能",
      emptyT: "还没有技能", emptyD: "技能是一套做法，比如怎么写周报、怎么审合同。装一个技能包，或者把本机 Agent 里已有的技能导进来。",
      packMeta: "{v} · {pub} · {trust} · {scope}", trust_host: "随系统", trust_pinned: "固定的发布者", trust_home_local: "本机导入", scope_project: "装在这个项目", scope_home: "装在个人空间",
      packMore: "「{n}」的更多操作", lastUsed: "上次 {at} · {by} 用过", neverUsed: "还没用过", by_assistant: "助理", by_coding: "Coding",
      na_plugin_disabled: "插件「{p}」停用了，暂时用不了", na_publisher_revoked: "发布者已撤销，只能卸载", na_resource_invalid: "正文或附带文件缺失", na_requires_unmet: "缺少 {d}", na_connection_missing: "没有连接{d}，暂时用不了", na_native_only: "只有本地 Agent 能用：{d}",
      do_plugin_disabled: "启用插件", do_publisher_revoked: "卸载", do_resource_invalid: "重新安装", do_requires_unmet: "去添加", do_connection_missing: "去连接",
      keptNote: "设置保留为「{s}」，恢复后照旧", openBody: "打开全文", disablePack: "停用插件", uninstallPack: "卸载", back: "全部技能", howUse: "怎么用",
      failT: "没能保存", failD: "「{n}」还是「{s}」，什么都没改。", retry: "重试",
      t_state: "「{n}」改成{s}", undo: "撤销", t_enabled: "启用了 {k} 个技能", t_installed: "已安装「{n}」", t_imported: "已导入 {k} 个技能", t_sim: "原型：{x}",
      sim_body: "在侧栏打开正文", sim_pack: "在插件设置里停用或卸载整包", sim_fix: "去处理", sim_market: "打开插件市场",
      // import
      importH: "从本机导入技能", importLead: "把本机 Agent 或项目目录里已有的技能导进来，成为一个只有内容的技能包，和别的包一样管。导入的是现在这一份拷贝；原目录以后改了，可以再导入一次。",
      source: "来源", files_n: "{n} 个文件 · {s}", portable: "助理和 Coding 都能用", nativeOnly: "只有本地 Agent 能用：{w}", conflict: "已装过同名的，会升级成新版本",
      importTo: "导入到", scopeProject: "这个项目", scopeHome: "个人空间", importN: "导入 {n} 个", importNone: "选要导入的技能", enableAfterImport: "导入后启用",
      noneT: "没找到技能", noneD: "看的是 {p}。换一个来源，或者把技能放进这个目录再来。",
      kb: "{n} KB",
    },
    en: {
      protoTitle: "Skill packs · prototype", tbd: "Decided: A's enabling + C's catalog", opt: "Option", optAC: "Decided A+C", optA: "A Enable right after", optB: "B Pick while confirming", optC: "C Enable in catalog",
      area: "Area", a_install: "Install preview", a_import: "Import from this computer", a_manage: "Skill catalog", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      st_new: "New install", st_upgrade: "Upgrade 1.4 → 2.0", st_bad: "Broken package", st_found: "Found 3", st_none: "Found none", st_normal: "Normal", st_empty: "No skills yet", st_failed: "Save fails",
      settings: "Settings", tabPlugins: "Plugins", tabSkills: "Skills", projectScope: "Project: {p}",
      installTo: "Installs into this project", signer: "acme.writing · signed by {s}", upgradeLine: "{from} is installed; this upgrades it to {to}. Your data and skill settings stay.",
      perms: "Permissions", permsNone: "Asks for none", effects: "What its code can do", effectsNone: "No code, content only; reads and writes nothing",
      pinned: "You pinned this publisher as {n}", skillsH: "Skills in this package ({n})", skillsLead: "A skill is a way of doing something, telling the assistant or Coding how to handle a kind of task. It carries no permissions: the tools and connections it uses still follow what you've allowed.",
      notEnabled: "Installing doesn't enable them: they stay off and unused until you turn them on.", pickLead: "Which ones to use once installed? All off by default; the ones you turn on are picked by AI when a task fits.",
      cancel: "Cancel", install: "Agree and install", installAndEnable: "Install and enable {n}", repick: "Choose another file",
      badT: "This package can't be installed", badD: "{why}. Nothing was installed and nothing changed.",
      details: "Details", whenUse: "When to use", whenNot: "When not to use", tools: "Declared tools (a note, not a permission)", files: "Included files", filesNone: "No included files", bodyStart: "Start of the text",
      appliesAssistant: "Assistant", appliesCoding: "Coding", appliesBoth: "Assistant and Coding", runsScripts: "Runs scripts", uses: "Uses: {c}", conn_calendar: "calendar",
      ch_added: "New", ch_body_changed: "Text changed", ch_resources_changed: "Files changed", ch_removed: "Will be removed", keptManual: "Stays manual only", keptAuto: "Stays on",
      roleRef: "reference", roleScript: "script · runs", roleAsset: "asset",
      sOff: "Off", sAuto: "Auto", sManual: "Manual only", stateLabel: "How to use “{n}”",
      expOff: "Off: never used.", expAuto: "Auto: AI picks it when a task fits; what you name comes first.", expManual: "Manual only: used only when you name it with /; AI won't pick it.",
      doneT: "Installed “{n}” {v}", enableH: "Which to use in “{p}”", enableLead: "All off for now. Choices apply at once; you can change them later under Skills.", enableLeadUp: "The upgrade keeps your settings; new skills start off.",
      later: "Later", finish: "Done", goCatalog: "Go to Skills", cInstalled: "None of its {k} skills is on yet. Choose which to use under Skills.", cInstalledT: "Installed “{n}” {v}",
      enableAfter: "Enable once installed", manualOnly: "Manual only",
      catLead: "Every installed skill is here. Once on, the assistant and Coding pick them when a task fits; set one to manual only and it's used only when you name it with /.", catSum: "{n} in all, {on} in use",
      search: "Find a skill", fAll: "All", fOn: "In use", fOff: "Off", fNa: "Unavailable", importBtn: "Import from this computer", market: "Open plugin market", noMatch: "No skills match",
      emptyT: "No skills yet", emptyD: "A skill is a way of doing something, like writing a weekly review or reading a contract. Install a skill pack, or bring in the skills your local agents already have.",
      packMeta: "{v} · {pub} · {trust} · {scope}", trust_host: "built in", trust_pinned: "pinned publisher", trust_home_local: "imported here", scope_project: "in this project", scope_home: "in personal space",
      packMore: "More for “{n}”", lastUsed: "Last used {at} by {by}", neverUsed: "Not used yet", by_assistant: "the assistant", by_coding: "Coding",
      na_plugin_disabled: "Plugin “{p}” is turned off, so it can't be used for now", na_publisher_revoked: "Publisher revoked; it can only be uninstalled", na_resource_invalid: "Its text or files are missing", na_requires_unmet: "Missing {d}", na_connection_missing: "No {d} connection, so it can't be used for now", na_native_only: "Only local agents can use it: {d}",
      do_plugin_disabled: "Turn plugin on", do_publisher_revoked: "Uninstall", do_resource_invalid: "Reinstall", do_requires_unmet: "Add it", do_connection_missing: "Connect",
      keptNote: "Setting stays “{s}” and comes back with it", openBody: "Open full text", disablePack: "Turn plugin off", uninstallPack: "Uninstall", back: "All skills", howUse: "How to use",
      failT: "Couldn't save", failD: "“{n}” is still “{s}”; nothing changed.", retry: "Retry",
      t_state: "“{n}” set to {s}", undo: "Undo", t_enabled: "Enabled {k} skills", t_installed: "Installed “{n}”", t_imported: "Imported {k} skills", t_sim: "Prototype: {x}",
      sim_body: "opens the text in the side panel", sim_pack: "turn off or uninstall the whole pack in plugin settings", sim_fix: "goes to fix it", sim_market: "opens the plugin market",
      importH: "Import skills from this computer", importLead: "Bring in skills your local agents or project folders already have. They become a content-only skill pack, managed like any other. This copies them as they are now; if the folder changes later, import again.",
      source: "Source", files_n: "{n} files · {s}", portable: "Works for the assistant and Coding", nativeOnly: "Only local agents can use it: {w}", conflict: "Already installed; becomes a new version",
      importTo: "Import into", scopeProject: "This project", scopeHome: "Personal space", importN: "Import {n}", importNone: "Choose skills to import", enableAfterImport: "Enable once imported",
      noneT: "No skills found", noneD: "Looked in {p}. Pick another source, or put skills in that folder and try again.",
      kb: "{n} KB",
    },
  };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let P = (() => { try { return Object.assign(clone(DEF), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return clone(DEF); } })();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private window: keep in memory */ } };
  const t = (k, v) => (T[P.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const L = (o) => (o && typeof o === "object" ? o[P.lang] : o) ?? "";
  const esc = M.escapeHtml;
  const act = (a, v, extra) => Object.assign({ "data-act": a }, v != null ? { "data-v": v } : {}, extra || {});
  const btn = (label, o = {}) => M.renderButton({ label, variant: o.variant || "secondary", size: o.size, icon: o.icon, iconOnly: o.iconOnly, disabled: o.disabled, className: o.className, attrs: o.attrs });
  const badge = (label, tone) => M.renderBadge({ label, tone: tone || "neutral" });
  const kb = (bytes) => t("kb", { n: (bytes / 1000).toFixed(bytes < 10000 ? 1 : 0) });
  const STATE_WORD = { off: "sOff", auto: "sAuto", manual: "sManual" };
  const packOf = (id) => D.packs.find((p) => p.id === id);
  const allSkills = () => D.packs.flatMap((p) => p.skills.map((s) => ({ pack: p, s, key: p.id + "/" + s.id })));
  const find = (key) => allSkills().find((x) => x.key === key);

  /* ---------- in-page state (memory only) ---------- */
  const freshUi = () => {
    const states = {};
    for (const { key, s } of allSkills()) states[key] = s.state;
    // The install area shows the writing pack before it is installed: new installs start off; upgrades keep what was set.
    const pre = {};
    for (const s of packOf(D.install.pack).skills) pre[s.id] = { on: false, manual: false, state: P.st === "upgrade" ? (D.install.upgrade[s.id]?.kept || (D.install.upgrade[s.id]?.change === "added" ? "off" : s.state === "off" ? "off" : s.state)) : "off" };
    return { states, pre, step: "review", filter: "all", q: "", sel: "writing/weekly", detail: false, fail: null, last: null,
      src: "claude", picks: { commit: true, "review-pr": true }, pickOn: {}, scope: "project" };
  };
  let ui = freshUi();
  const unavailable = (s) => s.unavailable || null;
  // Decided (user 2026-11-04): "AC" = A's enable step right after install / import + C's list-and-detail catalog.
  const enableStep = () => P.opt === "A" || P.opt === "AC";
  const splitCatalog = () => P.opt === "C" || P.opt === "AC";
  const blocking = (s) => ["plugin_disabled", "publisher_revoked", "resource_invalid"].includes(unavailable(s)?.reason);

  /* ---------- shared parts ---------- */
  const mark = (name, extra = "") => `<span class="mw-mark sk-mark${extra}" aria-hidden="true">${M.icon(name)}</span>`;
  const applies = (a) => badge(t(a === "both" ? "appliesBoth" : a === "coding" ? "appliesCoding" : "appliesAssistant"), "info");
  const connWord = (c) => t("conn_" + c);
  function skillTags(s, extra = "") {
    const parts = [applies(s.applies)];
    if (s.resources?.some((r) => r.role === "script")) parts.push(badge(t("runsScripts"), "warning"));
    for (const c of s.connectors || []) parts.push(badge(t("uses", { c: "~~" + connWord(c) })));
    return `<span class="sk-tags">${parts.join("")}${extra}</span>`;
  }
  function skillDetails(s) {
    const files = s.resources?.length
      ? `<ul class="sk-files">${s.resources.map((r) => `<li><code>${esc(r.path)}</code><span>${esc(t(r.role === "script" ? "roleScript" : r.role === "asset" ? "roleAsset" : "roleRef"))} · ${esc(kb(r.bytes))}</span></li>`).join("")}</ul>`
      : `<p class="sk-muted">${esc(t("filesNone"))}</p>`;
    const body = `<dl class="sk-dl">
        <dt>${esc(t("whenUse"))}</dt><dd>${esc(L(s.when))}</dd>
        <dt>${esc(t("whenNot"))}</dt><dd>${esc(L(s.whenNot))}</dd>
        <dt>${esc(t("tools"))}</dt><dd><span class="sk-code-list">${s.tools.map((x) => `<code>${esc(x)}</code>`).join("")}</span></dd>
        <dt>${esc(t("files"))}</dt><dd>${files}</dd>
        <dt>${esc(t("bodyStart"))}</dt><dd><p class="sk-excerpt">${esc(L(s.excerpt))}</p></dd></dl>`;
    return M.renderCollapsible({ summary: t("details"), body, className: "sk-more" });
  }
  // The three-way choice (A, and C's detail as radios): the board's toggle group.
  const stateGroup = (key, name, current, disabled) => M.renderToggleGroup({
    label: t("stateLabel", { n: name }), className: "sk-state",
    items: ["off", "auto", "manual"].map((v) => ({ value: v, label: t(STATE_WORD[v]), current: current === v, attrs: Object.assign({ "data-state": key }, disabled ? { disabled: true } : {}) })),
  });
  // B: a switch (on = auto) plus a "manual only" checkbox that appears once it is on.
  const switchPair = (key, name, current, disabled, labels = {}) => `<span class="sk-pair">${current !== "off" ? M.renderCheckbox({ label: labels.manual || t("manualOnly"), checked: current === "manual", disabled, attrs: { "data-manual": key } }) : ""}${M.renderSwitch({ checked: current !== "off", disabled, attrs: { "data-switch": key, "aria-label": (labels.on || "") + name } })}</span>`;
  const explain = () => `<ul class="sk-explain"><li>${esc(t("expOff"))}</li><li>${esc(t("expAuto"))}</li><li>${esc(t("expManual"))}</li></ul>`;

  /* ---------- install preview (Settings → Plugins, the existing review panel) ---------- */
  function installRow(s) {
    const up = P.st === "upgrade" ? D.install.upgrade[s.id] || {} : {};
    const marks = (up.change ? badge(t("ch_" + up.change), up.change === "added" ? "success" : "info") : "") + (up.kept === "manual" ? badge(t("keptManual"), "neutral") : "");
    let end = "", under = "";
    if (P.opt === "B" && ui.step === "review") {
      const st = ui.pre[s.id].state;
      end = switchPair("pre:" + s.id, L(s.name), st, false, { on: t("enableAfter") + "：" });
    }
    if (enableStep() && ui.step === "enable") under = stateGroup("pre:" + s.id, L(s.name), ui.pre[s.id].state);
    return `<li class="mw-item sk-row">${mark("book")}<span class="sk-main"><strong>${esc(L(s.name))}</strong><small>${esc(L(s.desc))}</small>${skillTags(s, marks)}${under ? `<span class="sk-under">${under}</span>` : ""}</span>${end ? `<span class="mw-item__end">${end}</span>` : ""}${ui.step === "review" ? skillDetails(s) : ""}</li>`;
  }
  function removedRow() {
    const r = D.install.removed;
    return `<li class="mw-item sk-row" data-gone>${mark("minus")}<span class="sk-main"><strong>${esc(L(r.name))}</strong><span class="sk-tags">${applies(r.applies)}${badge(t("ch_removed"), "danger")}</span></span></li>`;
  }
  function installPanel() {
    const pack = packOf(D.install.pack);
    const head = `<header class="sk-review__head"><h3>${esc(L(pack.title))} · ${pack.version}</h3><span class="sk-muted">${esc(t("signer", { s: D.install.signer }))}</span></header>`;
    if (P.st === "bad") {
      return `<div class="sk-review">${head}<div class="mw-alert mw-alert--danger" data-slot="alert" role="alert"><strong>${esc(t("badT"))}</strong><p>${esc(t("badD", { why: L(D.install.bad) }))}</p><div class="sk-alert-actions">${btn(t("repick"), { size: "sm", attrs: act("sim", "repick") })}</div></div></div>`;
    }
    const skills = pack.skills;
    if (ui.step === "enable") {
      return `<div class="sk-review sk-review--step">${M.renderStatusMark({ label: t("doneT", { n: L(pack.title), v: pack.version }), tone: "done", state: "done" })}
        <h3 class="sk-h">${esc(t("enableH", { p: L(D.project) }))}</h3><p class="sk-lead">${esc(P.st === "upgrade" ? t("enableLeadUp") : t("enableLead"))}</p>${explain()}
        <ul class="mw-items sk-items">${skills.map(installRow).join("")}</ul>
        <div class="sk-actions">${btn(t("later"), { variant: "ghost", attrs: act("later") })}${btn(t("finish"), { variant: "primary", attrs: act("finish") })}</div></div>`;
    }
    if (ui.step === "done-c") {
      return `<div class="sk-review sk-review--step"><div class="mw-alert mw-alert--success" data-slot="alert" role="status"><strong>${esc(t("cInstalledT", { n: L(pack.title), v: pack.version }))}</strong><p>${esc(t("cInstalled", { k: skills.length }))}</p><div class="sk-alert-actions">${btn(t("goCatalog"), { size: "sm", variant: "primary", attrs: act("go-manage") })}</div></div></div>`;
    }
    const nOn = Object.values(ui.pre).filter((x) => x.state !== "off").length;
    const label = P.opt === "B" && nOn ? t("installAndEnable", { n: nOn }) : t("install");
    const lead = P.opt === "B" ? t("pickLead") : t("notEnabled");
    return `<div class="sk-review">${head}
      <p class="sk-muted">${esc(t("installTo"))}</p>
      ${P.st === "upgrade" ? `<p class="sk-line">${esc(t("upgradeLine", { from: D.install.from, to: pack.version }))}</p>` : ""}
      <section class="sk-group"><h4>${esc(t("perms"))}</h4><p class="sk-muted">${esc(t("permsNone"))}</p></section>
      <section class="sk-group sk-skills"><h4>${esc(t("skillsH", { n: skills.length }))}</h4><p class="sk-lead">${esc(t("skillsLead"))}</p>
        <p class="sk-lead sk-lead--strong">${M.icon(P.opt === "B" ? "switch" : "info")}<span>${esc(lead)}</span></p>
        <ul class="mw-items sk-items">${skills.map(installRow).join("")}${P.st === "upgrade" ? removedRow() : ""}</ul></section>
      <section class="sk-group"><h4>${esc(t("effects"))}</h4><p class="sk-muted">${esc(t("effectsNone"))}</p></section>
      <p class="sk-muted">${esc(t("pinned", { n: L(D.install.publisher) }))}</p>
      <div class="sk-actions">${btn(t("cancel"), { attrs: act("sim", "cancel") })}${btn(label, { variant: "primary", attrs: act("install", null, { id: "skInstall" }) })}</div></div>`;
  }

  /* ---------- import (Skills → Import from this computer) ---------- */
  function importPanel() {
    const src = D.importFrom.find((s) => s.id === ui.src);
    const srcGroup = M.renderToggleGroup({ label: t("source"), items: D.importFrom.map((s) => ({ value: s.id, label: L(s.label), current: s.id === ui.src, attrs: act("src", s.id) })) });
    const head = `<header class="sk-review__head"><h3>${esc(t("importH"))}</h3><p class="sk-lead">${esc(t("importLead"))}</p></header>
      <div class="sk-source"><span class="sk-h4">${esc(t("source"))}</span>${srcGroup}<code class="sk-path">${esc(src.path)}</code></div>`;
    if (ui.step === "enable" || ui.step === "done-c") return installPanelAfterImport();
    if (P.st === "none") return `<div class="sk-review">${head}${M.renderEmpty({ icon: "folder-open", title: t("noneT"), body: t("noneD", { p: src.path }) })}</div>`;
    const rows = D.candidates.map((c) => {
      const on = !!ui.picks[c.id];
      const tags = [c.compat === "portable" ? badge(t("portable"), "success") : badge(t("nativeOnly", { w: L(c.why) }), "warning")];
      if (c.scripts) tags.push(badge(t("runsScripts"), "warning"));
      if (c.conflict) tags.push(badge(t("conflict"), "info"));
      const enable = P.opt === "B" && on ? `<span class="sk-under">${switchPair("imp:" + c.id, c.name, ui.pickOn[c.id] || "off", c.compat !== "portable", { on: t("enableAfterImport") + "：" })}<span class="sk-muted sk-small">${esc(t("enableAfterImport"))}</span></span>` : "";
      return `<li class="mw-item sk-row">${mark(c.compat === "portable" ? "book" : "terminal")}<span class="sk-main"><strong><code class="sk-name">${esc(c.name)}</code></strong><small>${esc(L(c.desc))} · ${esc(t("files_n", { n: c.files, s: kb(c.bytes) }))}</small><span class="sk-tags">${tags.join("")}</span>${enable}</span><span class="mw-item__end">${M.renderCheckbox({ checked: on, attrs: { "data-pick": c.id, "aria-label": c.name } })}</span></li>`;
    }).join("");
    const n = Object.values(ui.picks).filter(Boolean).length;
    const scope = M.renderRadioGroup({ legend: t("importTo"), name: "sk-scope", className: "sk-scope", items: [{ value: "project", label: t("scopeProject"), checked: ui.scope === "project" }, { value: "home", label: t("scopeHome"), checked: ui.scope === "home" }] });
    return `<div class="sk-review">${head}<ul class="mw-items sk-items">${rows}</ul>${scope}
      ${P.opt !== "B" ? `<p class="sk-lead sk-lead--strong">${M.icon("info")}<span>${esc(t("notEnabled"))}</span></p>` : ""}
      <div class="sk-actions">${btn(t("cancel"), { attrs: act("area", "manage") })}${btn(n ? t("importN", { n }) : t("importNone"), { variant: "primary", disabled: !n, attrs: act("import") })}</div></div>`;
  }
  function installPanelAfterImport() {
    const picked = D.candidates.filter((c) => ui.picks[c.id]);
    if (ui.step === "done-c") return `<div class="sk-review sk-review--step"><div class="mw-alert mw-alert--success" data-slot="alert" role="status"><strong>${esc(t("t_imported", { k: picked.length }))}</strong><p>${esc(t("cInstalled", { k: picked.length }))}</p><div class="sk-alert-actions">${btn(t("goCatalog"), { size: "sm", variant: "primary", attrs: act("go-manage") })}</div></div></div>`;
    const rows = picked.map((c) => `<li class="mw-item sk-row">${mark(c.compat === "portable" ? "book" : "terminal")}<span class="sk-main"><strong><code class="sk-name">${esc(c.name)}</code></strong><small>${esc(L(c.desc))}</small>${c.compat !== "portable" ? `<span class="sk-tags">${badge(t("nativeOnly", { w: L(c.why) }), "warning")}</span>` : ""}<span class="sk-under">${stateGroup("imp:" + c.id, c.name, ui.pickOn[c.id] || "off")}</span></span></li>`).join("");
    return `<div class="sk-review sk-review--step">${M.renderStatusMark({ label: t("t_imported", { k: picked.length }), tone: "done", state: "done" })}
      <h3 class="sk-h">${esc(t("enableH", { p: L(D.project) }))}</h3><p class="sk-lead">${esc(t("enableLead"))}</p>${explain()}
      <ul class="mw-items sk-items">${rows}</ul><div class="sk-actions">${btn(t("later"), { variant: "ghost", attrs: act("later") })}${btn(t("finish"), { variant: "primary", attrs: act("finish") })}</div></div>`;
  }

  /* ---------- catalog ---------- */
  const visible = () => {
    const q = ui.q.trim().toLowerCase();
    return allSkills().filter(({ key, s, pack }) => {
      const st = ui.states[key], na = !!unavailable(s);
      if (ui.filter === "on" && (st === "off" || na)) return false;
      if (ui.filter === "off" && (st !== "off" || na)) return false;
      if (ui.filter === "na" && !na) return false;
      return !q || (L(s.name) + L(s.desc) + L(pack.title)).toLowerCase().includes(q);
    });
  };
  const counts = () => {
    const all = allSkills();
    return { all: all.length, on: all.filter((x) => ui.states[x.key] !== "off" && !unavailable(x.s)).length, off: all.filter((x) => ui.states[x.key] === "off" && !unavailable(x.s)).length, na: all.filter((x) => unavailable(x.s)).length };
  };
  function naLine(pack, s) {
    const u = unavailable(s);
    if (!u) return "";
    const d = u.reason === "connection_missing" ? connWord(u.detail) : L(u.detail);
    const text = t("na_" + u.reason, { p: L(pack.title), d });
    const fix = T[P.lang]["do_" + u.reason] ? btn(t("do_" + u.reason), { size: "sm", variant: "link", attrs: act("sim", "fix") }) : "";
    const kept = u.reason === "plugin_disabled" && ui.states[pack.id + "/" + s.id] !== "off" ? `<span class="sk-muted sk-small">${esc(t("keptNote", { s: t(STATE_WORD[ui.states[pack.id + "/" + s.id]]) }))}</span>` : "";
    return `<span class="sk-na">${M.renderStatusMark({ label: text, tone: blocking(s) ? "blocked" : "quiet", state: blocking(s) ? "blocked" : "unavailable" })}${fix}${kept}</span>`;
  }
  const usedLine = (s) => `<span class="sk-muted sk-small">${esc(s.lastUsed ? t("lastUsed", { at: s.lastUsed.at, by: t("by_" + s.lastUsed.by) }) : t("neverUsed"))}</span>`;
  function failLine(key, s) {
    if (ui.fail !== key) return "";
    return `<div class="mw-alert mw-alert--danger sk-fail" data-slot="alert" role="alert"><strong>${esc(t("failT"))}</strong><p>${esc(t("failD", { n: L(s.name), s: t(STATE_WORD[ui.states[key]]) }))}</p><div class="sk-alert-actions">${btn(t("retry"), { size: "sm", attrs: act("retry") })}</div></div>`;
  }
  function catRow({ key, s, pack }) {
    const st = ui.states[key], dis = blocking(s);
    const control = P.opt === "B" ? switchPair(key, L(s.name), st, dis) : stateGroup(key, L(s.name), st, dis);
    return `<li class="mw-item sk-row"${dis ? " data-off" : ""}>${mark("book")}<span class="sk-main"><strong>${esc(L(s.name))}</strong><small>${esc(L(s.desc))}</small>
      <span class="sk-tags">${applies(s.applies)}${s.resources?.some((r) => r.role === "script") ? badge(t("runsScripts"), "warning") : ""}${usedLine(s)}</span>${naLine(pack, s)}${failLine(key, s)}</span>
      <span class="mw-item__end">${control}</span>${skillDetails(s)}</li>`;
  }
  function packHead(pack) {
    const meta = t("packMeta", { v: pack.version, pub: L(pack.publisher), trust: t("trust_" + pack.trust), scope: t("scope_" + pack.scope) });
    return `<div class="sk-pack">${mark("package")}<span class="sk-pack__text"><strong>${esc(L(pack.title))}</strong><small>${esc(meta)}</small></span>${btn(t("packMore", { n: L(pack.title) }), { variant: "ghost", size: "sm", icon: "more", iconOnly: true, attrs: act("sim", "pack") })}</div>`;
  }
  function toolbar() {
    const c = counts();
    const filters = M.renderToggleGroup({ label: t("fAll"), className: "sk-filter", items: [["all", "fAll", c.all], ["on", "fOn", c.on], ["off", "fOff", c.off], ["na", "fNa", c.na]].map(([v, k, n]) => ({ value: v, label: `${t(k)} ${n}`, current: ui.filter === v, attrs: act("filter", v) })) });
    return `<div class="sk-toolbar"><span class="sk-search">${M.icon("search")}${M.renderInput({ type: "search", placeholder: t("search"), value: ui.q, attrs: { id: "skQ", "aria-label": t("search") } })}</span>${filters}<span class="sk-spacer"></span>${btn(t("importBtn"), { icon: "download", attrs: act("area", "import") })}</div>`;
  }
  function catalogHead() {
    const c = counts();
    return `<header class="sk-cat__head"><h2>${esc(t("tabSkills"))}</h2><p class="sk-lead">${esc(t("catLead"))}</p><p class="sk-muted sk-small">${esc(t("catSum", { n: c.all, on: c.on }))}</p></header>`;
  }
  function catalogGrouped() {
    const list = visible();
    const groups = D.packs.map((pack) => {
      const rows = list.filter((x) => x.pack.id === pack.id);
      return rows.length ? `<section class="sk-packgroup">${packHead(pack)}<ul class="mw-items sk-items">${rows.map(catRow).join("")}</ul></section>` : "";
    }).join("");
    return `${catalogHead()}${toolbar()}${groups || `<p class="sk-muted sk-nomatch">${esc(t("noMatch"))}</p>`}`;
  }
  // C: list on the left, everything about one skill on the right (narrow: one at a time).
  function catalogSplit() {
    const list = visible();
    if (!list.some((x) => x.key === ui.sel) && list.length) ui.sel = list[0].key;
    const rows = list.map(({ key, s, pack }) => {
      const st = ui.states[key], u = unavailable(s);
      const mk = u ? M.renderStatusMark({ label: t("fNa"), tone: blocking(s) ? "blocked" : "quiet", state: blocking(s) ? "blocked" : "unavailable" }) : M.renderStatusMark({ label: t(STATE_WORD[st]), tone: st === "off" ? "quiet" : st === "auto" ? "progress" : "idle", state: st === "off" ? "paused" : "ready" });
      return `<li class="mw-item sk-pick" role="button" tabindex="0"${key === ui.sel ? ' aria-current="true"' : ""} data-act="sel" data-v="${key}">${mark("book")}<span><strong>${esc(L(s.name))}</strong><small>${esc(L(pack.title))}</small></span><span class="mw-item__end">${mk}</span></li>`;
    }).join("");
    const left = `<div class="sk-split__list">${rows ? `<ul class="mw-items sk-items">${rows}</ul>` : `<p class="sk-muted sk-nomatch">${esc(t("noMatch"))}</p>`}</div>`;
    const cur = find(ui.sel);
    let right = "";
    if (cur) {
      const { key, s, pack } = cur, st = ui.states[key], dis = blocking(s);
      const radios = M.renderRadioGroup({ legend: t("howUse"), name: "sk-how", className: "sk-how", items: ["off", "auto", "manual"].map((v) => ({ value: v, label: t(v === "off" ? "expOff" : v === "auto" ? "expAuto" : "expManual"), checked: st === v })) });
      const files = s.resources?.length ? `<ul class="sk-files">${s.resources.map((r) => `<li><code>${esc(r.path)}</code><span>${esc(t(r.role === "script" ? "roleScript" : r.role === "asset" ? "roleAsset" : "roleRef"))} · ${esc(kb(r.bytes))}</span></li>`).join("")}</ul>` : `<p class="sk-muted">${esc(t("filesNone"))}</p>`;
      right = `<div class="sk-split__detail"${dis ? " data-off" : ""}>
        <button type="button" class="mw-btn mw-btn--ghost mw-btn--sm sk-back" data-act="unsel">${M.icon("chevron-left")}<span data-slot="button-label">${esc(t("back"))}</span></button>
        <header><h3>${esc(L(s.name))}</h3><p class="sk-lead">${esc(L(s.desc))}</p>${skillTags(s)}</header>
        ${naLine(pack, s)}${failLine(key, s)}
        <div class="sk-how-wrap" data-how="${key}"${dis ? " data-disabled" : ""}>${radios}</div>
        <dl class="sk-dl"><dt>${esc(t("whenUse"))}</dt><dd>${esc(L(s.when))}</dd><dt>${esc(t("whenNot"))}</dt><dd>${esc(L(s.whenNot))}</dd>
          <dt>${esc(t("tools"))}</dt><dd><span class="sk-code-list">${s.tools.map((x) => `<code>${esc(x)}</code>`).join("")}</span></dd><dt>${esc(t("files"))}</dt><dd>${files}</dd></dl>
        ${M.renderPreviewCard({ title: t("bodyStart"), body: L(s.excerpt), className: "sk-preview" })}
        <div class="sk-actions sk-actions--start">${btn(t("openBody"), { icon: "external", attrs: act("sim", "body") })}${usedLine(s)}</div>
        <div class="sk-packline">${packHead(pack)}<span class="sk-actions sk-actions--start">${btn(t("disablePack"), { size: "sm", attrs: act("sim", "pack") })}${btn(t("uninstallPack"), { size: "sm", variant: "ghost", attrs: act("sim", "pack") })}</span></div></div>`;
    }
    return `${catalogHead()}${toolbar()}<div class="sk-split"${ui.detail ? " data-detail" : ""}>${left}${right}</div>`;
  }
  function catalog() {
    if (P.st === "empty") return `${catalogHead()}${M.renderEmpty({ icon: "book", title: t("emptyT"), body: t("emptyD"), action: `<div class="sk-actions sk-actions--center">${btn(t("importBtn"), { icon: "download", attrs: act("area", "import") })}${btn(t("market"), { variant: "primary", attrs: act("sim", "market") })}</div>` })}`;
    return splitCatalog() ? catalogSplit() : catalogGrouped();
  }

  /* ---------- page ---------- */
  function page() {
    const onPlugins = P.area === "install";
    const tabs = M.renderTabs({ label: t("settings"), className: "sk-tabs", tabs: [{ id: "plugins", label: t("tabPlugins"), selected: onPlugins, attrs: act("area", "install") }, { id: "skills", label: t("tabSkills"), selected: !onPlugins, attrs: act("area", "manage") }] });
    const body = P.area === "install" ? installPanel() : P.area === "import" ? importPanel() : catalog();
    return `<div class="proto-sheet sk-sheet"><header class="sk-sheet__head"><h1>${esc(t("settings"))}</h1><span class="sk-muted">${esc(t("projectScope", { p: L(D.project) }))}</span></header>${tabs}<div class="sk-body${P.area === "manage" && splitCatalog() ? " sk-body--wide" : ""}">${body}</div></div>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const options = AREA_STATES[P.area].map((k) => `<option value="${k}"${P.st === k ? " selected" : ""}>${esc(t("st_" + k))}</option>`).join("");
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${M.renderBadge({ label: t("tbd"), tone: "success" })}
      <span class="proto-field">${esc(t("opt"))}${tg(t("opt"), "opt", [["AC", t("optAC")], ["A", t("optA")], ["B", t("optB")], ["C", t("optC")]])}</span>
      <span class="proto-field">${esc(t("area"))}${tg(t("area"), "area", [["install", t("a_install")], ["import", t("a_import")], ["manage", t("a_manage")]])}</span>
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
    if (!AREA_STATES[P.area].includes(P.st)) P.st = AREA_STATES[P.area][0];
    renderStrip();
    const focus = document.activeElement?.id === "skQ" ? document.activeElement.selectionStart : null;
    document.getElementById("app").innerHTML = page();
    if (focus != null) { const q = document.getElementById("skQ"); q?.focus(); q?.setSelectionRange(focus, focus); }
  }
  let timer;
  const toast = (message, tone, action) => {
    const box = document.getElementById("toasts");
    box.innerHTML = M.renderToast({ message, tone, action });
    clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 4200);
  };
  const go = (area, st) => { P.area = area; P.st = st || AREA_STATES[area][0]; ui = Object.assign(freshUi(), { states: ui.states }); persist(); render(); };

  // A catalog change applies at once (a write, like any setting); a failed write leaves the old state and says so in the row.
  function setState(key, value) {
    if (key.startsWith("pre:")) { ui.pre[key.slice(4)].state = value; return render(); }
    if (key.startsWith("imp:")) { ui.pickOn[key.slice(4)] = value; return render(); }
    const x = find(key);
    if (!x || ui.states[key] === value) return;
    if (P.st === "failed") { ui.fail = key; return render(); }
    ui.last = { key, prev: ui.states[key] };
    ui.states[key] = value; ui.fail = null;
    render();
    toast(t("t_state", { n: L(x.s.name), s: t(STATE_WORD[value]) }), "success", { label: t("undo"), attrs: act("undo-state") });
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],[data-state],#reset");
    if (!b || b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); ui = freshUi(); persist(); return render(); }
    if (b.dataset.set) {
      P[b.dataset.set] = b.dataset.v;
      if (b.dataset.set === "opt" || b.dataset.set === "area") { if (b.dataset.set === "area") P.st = AREA_STATES[P.area][0]; ui = freshUi(); }
      persist(); return render();
    }
    if (b.dataset.state) return setState(b.dataset.state, b.value);
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "area": return go(v);
      case "go-manage": return go("manage");
      case "install":
        if (enableStep()) { ui.step = "enable"; break; }
        if (P.opt === "C") { ui.step = "done-c"; break; }
        { const n = Object.values(ui.pre).filter((x) => x.state !== "off").length; go("manage"); return toast(n ? t("t_enabled", { k: n }) : t("t_installed", { n: L(packOf(D.install.pack).title) }), "success"); }
      case "import":
        if (enableStep()) { ui.step = "enable"; break; }
        if (P.opt === "C") { ui.step = "done-c"; break; }
        { const n = Object.values(ui.picks).filter(Boolean).length; go("manage"); return toast(t("t_imported", { k: n }), "success"); }
      case "finish": {
        const n = P.area === "import" ? Object.values(ui.pickOn).filter((s) => s && s !== "off").length : Object.values(ui.pre).filter((x) => x.state !== "off").length;
        go("manage"); return toast(t("t_enabled", { k: n }), "success");
      }
      case "later": return go("manage");
      case "src": ui.src = v; break;
      case "filter": ui.filter = v; break;
      case "sel": ui.sel = v; ui.detail = true; break;
      case "unsel": ui.detail = false; break;
      case "retry": ui.fail = null; P.st = "normal"; persist(); break;
      case "undo-state": if (ui.last) { ui.states[ui.last.key] = ui.last.prev; ui.last = null; document.getElementById("toasts").innerHTML = ""; } break;
      case "sim": return toast(t("t_sim", { x: t("sim_" + (v === "body" ? "body" : v === "pack" ? "pack" : v === "fix" ? "fix" : v === "market" ? "market" : "fix")) }));
      default: return;
    }
    render();
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "state") { P.st = el.value; ui = freshUi(); persist(); return render(); }
    if (el.dataset.switch) {
      const key = el.dataset.switch;
      return setState(key, el.checked ? "auto" : "off");
    }
    if (el.dataset.manual) return setState(el.dataset.manual, el.checked ? "manual" : "auto");
    if (el.dataset.pick) { ui.picks[el.dataset.pick] = el.checked; return render(); }
    if (el.name === "sk-scope") { ui.scope = el.value; return; }
    if (el.name === "sk-how") {
      const wrap = el.closest("[data-how]");
      if (wrap?.hasAttribute("data-disabled")) return render();
      if (wrap) setState(wrap.dataset.how, el.value);
    }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "skQ") { ui.q = e.target.value; render(); } });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mw-item[role=button]")) { e.preventDefault(); e.target.click(); }
  });

  render();
})();
