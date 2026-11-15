// Batch-41 prototype (item 2): writing your own skills in Settings → Skills (用户 2026-11-14: 做技能目录的写入功能，在设置里新建、修改自己的技能).
// Fixed already (not asked again): the catalog is the batch-08 layout (list on the left, one skill on the right, three states per
// skill); skills that come with the system or with an installed pack are read-only, and "make my own copy" starts a skill of yours
// from one; a saved skill is a new version; a new skill is off until you turn it on.
// The three options differ in HOW a new skill starts:
//   A  write it in place: the right side becomes the form
//   B  say what you want in one sentence, the assistant drafts every field, you review the same form
//   C  three steps (what it is / when to use it / how to do it), one screen each
// Every control is a component-board part from window.MW. Standalone review prototype: nothing is written anywhere.
(() => {
  const M = window.MW;
  const KEY = "molis-proto.skill-authoring.v1";
  const DEF = { opt: "A", st: "normal", lang: "zh", theme: "light" };
  const LIMIT = { name: 80, desc: 1024, lines: 500, chars: 20000 };
  const T = {
    zh: {
      protoTitle: "写自己的技能 · 原型", tbd: "待定", opt: "方案", optA: "A 就地写", optB: "B 先说一句，助理起草", optC: "C 分三步", state: "状态", st_normal: "正常", st_failed: "保存失败", st_empty: "还没有自己的技能",
      lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      settings: "设置", tabPlugins: "插件", tabSkills: "技能", scopeLine: "项目：官网改版", lead: "技能是 AI 做某类事的固定做法。你可以自己写，也可以拿现成的改一份。",
      newBtn: "新建技能", importBtn: "从本机导入", mine: "我的技能", mineMeta: "你写的 · 只在这台电脑", sys: "随系统自带", inst: "已安装",
      sOff: "关", sAuto: "自动", sManual: "仅手动", howUse: "怎么用它", expOff: "关：AI 不用，你也不能点名", expAuto: "自动：AI 按任务自己选", expManual: "仅手动：只在你用 / 点名时用",
      ver: "第 {v} 版", savedAt: "{at}保存", whenUse: "什么时候用", whenNot: "什么时候不用", forWhom: "给谁用", w_assistant: "助理", w_coding: "Coding", w_both: "助理和 Coding", where: "放在哪", sc_home: "个人空间（每个项目都能用）", sc_project: "只在这个项目",
      bodyStart: "正文开头", edit: "修改", copyMine: "改一份我的", del: "删除", back: "返回",
      roT: "这个技能不是你写的，不能直接改。", roD: "可以改一份放进「我的技能」，原来那个不受影响。",
      fNew: "新建技能", fEdit: "修改「{n}」", fCopy: "从「{n}」改一份",
      l_name: "名称", h_name: "列表里和 / 点名时看到的名字。", l_desc: "什么时候用它", h_desc: "AI 靠这段话决定要不要选它。写清楚是哪类任务、什么时机，例如：「要把一周的进展整理成周报时」。", l_not: "什么时候不用（可选）", h_not: "容易和它弄混、但该用别的做法的情况。",
      l_body: "怎么做", h_body: "写给 AI 的做法：先做什么、要问什么、产出什么样、怎样算做完。支持 Markdown。", more: "更多设置", l_hint: "点名时的提示（可选）", h_hint: "用 / 点名后，名字后面提示该写什么，例如：<要整理的时间范围>。",
      count: "{l} / {ml} 行 · {c} / {mc} 字", save: "保存", saveNew: "保存为新技能", saveVer: "保存为第 {v} 版", cancel: "放弃改动", next: "下一步", prev: "上一步", dirty: "有没保存的改动", clean: "没有改动",
      e_name: "要有名称。", e_nameLong: "名称最多 {n} 个字。", e_dup: "「我的技能」里已经有一个叫这个名字的。", e_desc: "要写什么时候用它，AI 才知道该不该选。", e_descLong: "最多 {n} 个字。", e_body: "要写怎么做。", e_bodyLong: "正文超过上限了：最多 {ml} 行、{mc} 字。把参考资料拆到附带文件里（从本机导入的技能可以带）。",
      leaveT: "「{n}」有没保存的改动。", leaveSave: "保存再走", leaveDrop: "放弃改动", leaveStay: "接着写",
      failT: "没能保存", failD: "你写的内容还在这里，什么都没丢；技能目录里没有变化。", retry: "重试",
      t_saved: "「{n}」保存为第 {v} 版", t_savedNew: "「{n}」已保存，现在是关着的", turnAuto: "设成自动", t_state: "「{n}」改成{s}", undo: "撤销", t_deleted: "删除了「{n}」", t_restored: "「{n}」恢复了", t_sim: "原型：{x}", sim_import: "打开「从本机导入」", sim_plugins: "打开插件设置",
      askT: "想让这个技能帮你做什么？", askD: "说一句就行。助理会起草名称、什么时候用和做法，你再改。", askPh: "例如：每周五把这个项目一周的进展整理成周报，先列完成的，再列卡住的，最后是下周计划", draft: "起草", writeSelf: "我自己写", drafting: "正在起草…", drafted: "助理起草的，保存前都可以改。", redraft: "重新起草",
      st1: "1 它是什么", st2: "2 什么时候用", st3: "3 怎么做",
      emptyT: "还没有自己的技能", emptyD: "新建一个，或者从左边现成的技能里改一份。", noSel: "从左边选一个技能",
      sample_n: "每周周报", sample_d: "要把这个项目一周的进展整理成周报时用，通常在周五，或者你说「出周报」时。", sample_not: "只想看某一天做了什么（直接问就行）；要写对外的发布说明。", sample_hint: "<时间范围，默认本周>",
      sample_b: "# 每周周报\n\n## 先弄清\n- 时间范围：没说就是本周一到今天。\n- 给谁看：没说就按团队内部。\n\n## 做法\n1. 列出这段时间完成的事，每条一句，写结果不写过程。\n2. 列出卡住的事：卡在哪、等谁、最晚什么时候要定。\n3. 列出下周计划，最多五条，按重要程度排。\n\n## 产出\n三段：完成、卡住、下周。每段用短句列表，不写客套话。\n\n## 怎样算做完\n- 每条都能对上一条记录或一次提交。\n- 卡住的每条都写了下一步。",
      atNow: "刚刚", atDay: "3 天前",
    },
    en: {
      protoTitle: "Writing your own skills · prototype", tbd: "To decide", opt: "Option", optA: "A Write in place", optB: "B Say it, the assistant drafts", optC: "C Three steps", state: "State", st_normal: "Normal", st_failed: "Saving fails", st_empty: "No skills of your own yet",
      lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      settings: "Settings", tabPlugins: "Plugins", tabSkills: "Skills", scopeLine: "Project: Website redesign", lead: "A skill is a fixed way for AI to do one kind of work. Write your own, or start from an existing one.",
      newBtn: "New skill", importBtn: "Import from this computer", mine: "My skills", mineMeta: "Written by you · this computer only", sys: "Comes with the system", inst: "Installed",
      sOff: "Off", sAuto: "Auto", sManual: "Manual only", howUse: "How to use it", expOff: "Off: AI doesn't use it and you can't name it", expAuto: "Auto: AI picks it when a task fits", expManual: "Manual only: used only when you name it with /",
      ver: "Version {v}", savedAt: "saved {at}", whenUse: "When to use", whenNot: "When not to use", forWhom: "For", w_assistant: "Assistant", w_coding: "Coding", w_both: "Assistant and Coding", where: "Where it lives", sc_home: "Personal space (every project)", sc_project: "This project only",
      bodyStart: "Start of the body", edit: "Edit", copyMine: "Make my own copy", del: "Delete", back: "Back",
      roT: "You didn't write this skill, so it can't be edited directly.", roD: "Make a copy under My skills; the original stays as it is.",
      fNew: "New skill", fEdit: "Edit “{n}”", fCopy: "A copy of “{n}”",
      l_name: "Name", h_name: "What you see in the list and when naming it with /.", l_desc: "When to use it", h_desc: "AI decides from this whether to pick it. Say which kind of task and when, for example: “when a week's progress needs to become a weekly review”.", l_not: "When not to use it (optional)", h_not: "Cases that look similar but call for something else.",
      l_body: "How to do it", h_body: "The method, written for AI: what to do first, what to ask, what the result looks like, what counts as done. Markdown works.", more: "More settings", l_hint: "Hint when naming it (optional)", h_hint: "Shown after the name when you use /, for example: <time range>.",
      count: "{l} / {ml} lines · {c} / {mc} characters", save: "Save", saveNew: "Save as a new skill", saveVer: "Save as version {v}", cancel: "Discard changes", next: "Next", prev: "Back", dirty: "Unsaved changes", clean: "No changes",
      e_name: "A name is needed.", e_nameLong: "At most {n} characters.", e_dup: "My skills already has one with this name.", e_desc: "Say when to use it, or AI can't tell whether to pick it.", e_descLong: "At most {n} characters.", e_body: "Say how to do it.", e_bodyLong: "The body is over the limit: at most {ml} lines and {mc} characters. Move reference material into attached files (an imported skill can carry them).",
      leaveT: "“{n}” has unsaved changes.", leaveSave: "Save and go", leaveDrop: "Discard", leaveStay: "Keep writing",
      failT: "Couldn't save", failD: "What you wrote is still here and nothing was lost; the catalog hasn't changed.", retry: "Retry",
      t_saved: "“{n}” saved as version {v}", t_savedNew: "“{n}” is saved and still off", turnAuto: "Set to auto", t_state: "“{n}” set to {s}", undo: "Undo", t_deleted: "Deleted “{n}”", t_restored: "“{n}” is back", t_sim: "Prototype: {x}", sim_import: "opens Import from this computer", sim_plugins: "opens plugin settings",
      askT: "What should this skill help you do?", askD: "One sentence is enough. The assistant drafts the name, when to use it and the method; you edit from there.", askPh: "For example: every Friday turn this project's week into a weekly review — what's done, what's stuck, then next week's plan", draft: "Draft it", writeSelf: "I'll write it myself", drafting: "Drafting…", drafted: "Drafted by the assistant; edit anything before saving.", redraft: "Draft again",
      st1: "1 What it is", st2: "2 When to use it", st3: "3 How to do it",
      emptyT: "No skills of your own yet", emptyD: "Create one, or make your own copy of a skill on the left.", noSel: "Pick a skill on the left",
      sample_n: "Weekly review", sample_d: "Use when a week of this project's progress needs to become a weekly review, usually on Friday or when you say “weekly review”.", sample_not: "You only want what happened on one day (just ask); you need release notes for the outside.", sample_hint: "<time range, this week by default>",
      sample_b: "# Weekly review\n\n## Find out first\n- Time range: this Monday to today unless told otherwise.\n- Audience: the team unless told otherwise.\n\n## Method\n1. List what was finished, one line each, as results not process.\n2. List what is stuck: where, waiting on whom, and the latest date to decide.\n3. List next week's plan, five items at most, by importance.\n\n## Result\nThree sections: done, stuck, next week. Short list items, no pleasantries.\n\n## Done when\n- Every item maps to a record or a commit.\n- Every stuck item names its next step.",
      atNow: "just now", atDay: "3 days ago",
    },
  };
  const B = (zh, en) => ({ zh, en });
  const seed = () => ({
    packs: [{ id: "mine", kind: "mine" }, { id: "plan", kind: "sys", title: B("规划与拆解", "Planning and breakdown") }, { id: "design", kind: "inst", title: B("设计与无障碍", "Design and accessibility") }],
    skills: [
      { id: "m1", pack: "mine", v: 2, at: "atDay", state: "auto", applies: "assistant", scope: "home", name: B("客户周会纪要", "Client weekly notes"), desc: B("开完客户周会，要把录音或笔记整理成纪要并列出待办时用。", "Use after the weekly client meeting, to turn a recording or notes into minutes with action items."), not: B("内部站会（太短，直接列待办）。", "Internal stand-ups (too short; just list the actions)."), hint: B("<会议材料>", "<meeting material>"),
        body: B("# 客户周会纪要\n\n1. 先列结论，再列分歧。\n2. 每条待办写负责人和日期。\n3. 客户原话用引号，不改写。", "# Client weekly notes\n\n1. Conclusions first, then disagreements.\n2. Every action has an owner and a date.\n3. Quote the client verbatim.") },
      { id: "p1", pack: "plan", v: 1, state: "auto", applies: "assistant", scope: "home", name: B("分析与决策", "Analyze and decide"), desc: B("从问题、证据和备选方案走到可追溯决定。要拆解这类目标、排出依赖和完成证据时使用。", "Turn questions, evidence and alternatives into a traceable decision. Use it when breaking this kind of goal into results with dependencies and evidence."), not: B("", ""), hint: B("", ""),
        body: B("# 分析与决策\n\n## 规划路径\n1. 明确决策问题和成功标准\n2. 确定数据与证据边界\n3. 形成可比较方案\n4. 记录决定、理由和复审触发条件", "# Analyze and decide\n\n## Planning path\n1. Define the decision and success criteria\n2. Set data and evidence boundaries\n3. Develop comparable choices\n4. Record decision, reasons and review triggers") },
      { id: "p2", pack: "plan", v: 1, state: "auto", applies: "assistant", scope: "home", name: B("构建与变更", "Build and change"), desc: B("把一项要做出来或要改的东西拆成能独立交付、验收的结果。", "Break something to be built or changed into results that can be delivered and accepted on their own."), not: B("", ""), hint: B("", ""), body: B("# 构建与变更\n\n## 规划路径\n1. 明确要改变的对象和验收标准\n2. …", "# Build and change\n\n## Planning path\n1. Define what changes and how it is accepted\n2. …") },
      { id: "d1", pack: "design", v: 1, state: "off", applies: "both", scope: "home", name: B("界面文字", "UX copy"), desc: B("写和改界面文字：按钮、标题、空状态、错误、确认。", "Write and revise interface text: buttons, headings, empty states, errors, confirmations."), not: B("写营销文章。", "Marketing articles."), hint: B("<要写或要改的界面文字>", "<the interface text>"), body: B("# 界面文字\n\n界面文字的任务是让人不用想就知道：这是什么、现在怎样、我能做什么。", "# UX copy\n\nInterface text lets people know without thinking: what this is, how it stands, what they can do.") },
    ],
  });
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let P = clone(DEF), D = seed();
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* A private window keeps nothing; the prototype starts from its defaults. */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* Same: nothing kept. */ } };
  const freshUi = () => ({ sel: P.st === "empty" ? "p1" : "m1", detail: false, form: null, leave: null, fail: false, ask: null, anim: false, last: null });
  let ui = freshUi();

  const t = (k, v) => (T[P.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const L = (o) => (o && typeof o === "object" ? o[P.lang] : o) ?? "";
  const esc = M.escapeHtml;
  const act = (a, v) => Object.assign({ "data-act": a }, v != null ? { "data-v": v } : {});
  const btn = (label, o = {}) => M.renderButton({ label, variant: o.variant || "secondary", size: o.size, icon: o.icon, disabled: o.disabled, attrs: o.attrs });
  const mark = (name) => `<span class="mw-mark sk-mark" aria-hidden="true">${M.icon(name)}</span>`;
  const WORD = { off: "sOff", auto: "sAuto", manual: "sManual" };
  const stateMark = (st) => M.renderStatusMark({ label: t(WORD[st]), tone: st === "off" ? "quiet" : "idle", state: st === "off" ? "paused" : "ready" });
  const skills = () => (P.st === "empty" ? D.skills.filter((s) => s.pack !== "mine") : D.skills);
  const find = (id) => D.skills.find((s) => s.id === id);
  const packOf = (s) => D.packs.find((p) => p.id === s.pack);
  const packTitle = (p) => (p.kind === "mine" ? t("mine") : L(p.title));
  const packMeta = (p) => t(p.kind === "mine" ? "mineMeta" : p.kind === "sys" ? "sys" : "inst");

  /* ---------- form ---------- */
  const blank = () => ({ id: null, from: null, step: 1, drafted: false, tried: false, name: "", desc: "", not: "", hint: "", body: "", applies: "assistant", scope: "home" });
  const formOf = (s, copy) => ({ id: copy ? null : s.id, from: copy ? s.id : null, step: 1, drafted: false, tried: false, name: L(s.name) + (copy ? (P.lang === "zh" ? "（我的）" : " (mine)") : ""), desc: L(s.desc), not: L(s.not), hint: L(s.hint), body: L(s.body), applies: s.applies, scope: s.scope });
  const sample = () => Object.assign(blank(), { drafted: true, name: t("sample_n"), desc: t("sample_d"), not: t("sample_not"), hint: t("sample_hint"), body: t("sample_b") });
  const dirty = () => {
    const f = ui.form; if (!f) return false;
    const base = f.id ? formOf(find(f.id)) : f.from ? formOf(find(f.from), true) : blank();
    return ["name", "desc", "not", "hint", "body", "applies", "scope"].some((k) => f[k] !== base[k]) || f.drafted;
  };
  const lines = (s) => (s ? s.split("\n").length : 0);
  function problems(f) {
    const p = {};
    if (!f.name.trim()) p.name = t("e_name"); else if (f.name.length > LIMIT.name) p.name = t("e_nameLong", { n: LIMIT.name });
    else if (D.skills.some((s) => s.pack === "mine" && s.id !== f.id && L(s.name).trim() === f.name.trim())) p.name = t("e_dup");
    if (!f.desc.trim()) p.desc = t("e_desc"); else if (f.desc.length > LIMIT.desc) p.desc = t("e_descLong", { n: LIMIT.desc });
    if (!f.body.trim()) p.body = t("e_body"); else if (lines(f.body) > LIMIT.lines || f.body.length > LIMIT.chars) p.body = t("e_bodyLong", { ml: LIMIT.lines, mc: LIMIT.chars });
    return p;
  }
  const field = (key, label, hint, control, err) => `<div class="au-field"><label for="au-${key}">${esc(label)}</label>${control}${err ? `<p class="au-err" id="au-${key}-err" role="alert">${esc(err)}</p>` : ""}<small>${esc(hint)}</small></div>`;
  const input = (key, f, err, max) => `<input class="mw-input" data-slot="input" id="au-${key}" data-f="${key}" value="${esc(f[key])}" maxlength="${max * 2}"${err ? ` data-bad aria-invalid="true" aria-describedby="au-${key}-err"` : ""}>`;
  const area = (key, f, err, rows, cls = "") => `<textarea class="mw-textarea ${cls}" data-slot="textarea" id="au-${key}" data-f="${key}" rows="${rows}"${err ? ` data-bad aria-invalid="true" aria-describedby="au-${key}-err"` : ""}>${esc(f[key])}</textarea>`;
  function form() {
    const f = ui.form, p = f.tried ? problems(f) : {}, isNew = !f.id, cur = f.id ? find(f.id) : null;
    const title = f.id ? t("fEdit", { n: L(cur.name) }) : f.from ? t("fCopy", { n: L(find(f.from).name) }) : t("fNew");
    const what = field("name", t("l_name"), t("h_name"), input("name", f, p.name, LIMIT.name), p.name);
    const whom = `<div class="au-row"><div class="au-field"><span class="au-label">${esc(t("forWhom"))}</span>${M.renderToggleGroup({ label: t("forWhom"), items: ["assistant", "coding", "both"].map((v) => ({ value: v, label: t("w_" + v), current: f.applies === v, attrs: act("applies", v) })) })}</div>
      ${isNew ? `<div class="au-field"><span class="au-label">${esc(t("where"))}</span>${M.renderToggleGroup({ label: t("where"), items: ["home", "project"].map((v) => ({ value: v, label: t("sc_" + v), current: f.scope === v, attrs: act("scope", v) })) })}</div>` : ""}</div>`;
    const when = field("desc", t("l_desc"), t("h_desc"), area("desc", f, p.desc, 3), p.desc) + field("not", t("l_not"), t("h_not"), area("not", f, null, 2));
    const count = `<div class="au-count"><span>${esc(t("h_body"))}</span><span${p.body ? " data-over" : ""} id="au-count">${esc(t("count", { l: lines(f.body), ml: LIMIT.lines, c: f.body.length, mc: LIMIT.chars }))}</span></div>`;
    const how = `<div class="au-field"><label for="au-body">${esc(t("l_body"))}</label>${area("body", f, p.body, 14, "au-body")}${p.body ? `<p class="au-err" id="au-body-err" role="alert">${esc(p.body)}</p>` : ""}${count}</div>`;
    const more = `<details class="au-more"${f.hint ? " open" : ""}><summary>${esc(t("more"))}</summary>${field("hint", t("l_hint"), t("h_hint"), input("hint", f, null, 80))}</details>`;
    const leave = ui.leave ? `<div class="au-leave" role="alertdialog" aria-label="${esc(t("dirty"))}"><span class="grow">${esc(t("leaveT", { n: f.name || t("fNew") }))}</span>${btn(t("leaveSave"), { size: "sm", variant: "primary", attrs: act("leave-save") })}${btn(t("leaveDrop"), { size: "sm", attrs: act("leave-drop") })}${btn(t("leaveStay"), { size: "sm", variant: "ghost", attrs: act("leave-stay") })}</div>` : "";
    const fail = ui.fail ? `<div class="mw-alert mw-alert--danger" data-slot="alert" role="alert"><strong>${esc(t("failT"))}</strong><p>${esc(t("failD"))}</p><div class="sk-alert-actions">${btn(t("retry"), { size: "sm", attrs: act("retry") })}</div></div>` : "";
    const drafted = f.drafted ? `<p class="au-drafted">${M.renderBadge({ label: t("drafted"), tone: "info" })}${btn(t("redraft"), { size: "sm", variant: "link", attrs: act("ask") })}</p>` : "";
    const saveLabel = isNew ? t("saveNew") : t("saveVer", { v: cur.v + 1 });
    const stepped = P.opt === "C" && isNew;
    const steps = stepped ? `<ol class="au-steps">${[1, 2, 3].map((n) => `<li${f.step === n ? ' aria-current="step"' : f.step > n ? " data-done" : ""}>${esc(t("st" + n))}</li>`).join("")}</ol>` : "";
    const body = stepped ? (f.step === 1 ? what + whom : f.step === 2 ? when : how + more) : what + when + whom + how + more;
    const foot = stepped && f.step < 3
      ? `${f.step > 1 ? btn(t("prev"), { attrs: act("step", f.step - 1) }) : ""}${btn(t("next"), { variant: "primary", attrs: act("step", f.step + 1) })}<span class="grow"></span>${btn(t("cancel"), { variant: "ghost", attrs: act("cancel") })}`
      : `${stepped ? btn(t("prev"), { attrs: act("step", 2) }) : ""}${btn(saveLabel, { variant: "primary", attrs: act("save") })}${btn(t("cancel"), { variant: "ghost", attrs: act("cancel") })}<span class="grow">${esc(t(dirty() ? "dirty" : "clean"))}</span>`;
    return `<div class="sk-split__detail au-form${ui.anim ? " sk-enter" : ""}"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm sk-back" data-act="cancel">${M.icon("chevron-left")}<span data-slot="button-label">${esc(t("back"))}</span></button>
      <header><h3 tabindex="-1">${esc(title)}</h3>${cur ? M.renderBadge({ label: t("ver", { v: cur.v }), tone: "neutral" }) : ""}</header>${leave}${fail}${steps}${drafted}${body}<div class="au-foot">${foot}</div></div>`;
  }
  function ask() {
    const a = ui.ask;
    return `<div class="sk-split__detail au-ask${ui.anim ? " sk-enter" : ""}"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm sk-back" data-act="cancel">${M.icon("chevron-left")}<span data-slot="button-label">${esc(t("back"))}</span></button>
      <h3 tabindex="-1">${esc(t("askT"))}</h3><p class="sk-lead">${esc(t("askD"))}</p>
      <textarea class="mw-textarea" data-slot="textarea" id="au-ask" placeholder="${esc(t("askPh"))}"${a.busy ? " disabled" : ""}>${esc(a.text)}</textarea>
      ${a.busy ? `<p class="au-drafting" role="status">${M.renderStatusMark({ label: t("drafting"), tone: "working", state: "running" })}</p>`
        : `<div class="sk-actions sk-actions--start">${btn(t("draft"), { variant: "primary", icon: "sparkle", attrs: act("draft") })}${btn(t("writeSelf"), { variant: "ghost", attrs: act("new-plain") })}</div>`}</div>`;
  }
  function detail() {
    const s = find(ui.sel);
    if (!s || !skills().includes(s)) return `<div class="sk-split__detail">${M.renderEmpty({ icon: "book", title: t(P.st === "empty" ? "emptyT" : "noSel"), body: P.st === "empty" ? t("emptyD") : "" })}</div>`;
    const pack = packOf(s), mine = pack.kind === "mine";
    const radios = M.renderRadioGroup({ legend: t("howUse"), name: "au-how", className: "sk-how", items: ["off", "auto", "manual"].map((v) => ({ value: v, label: t(v === "off" ? "expOff" : v === "auto" ? "expAuto" : "expManual"), checked: s.state === v })) });
    const top = mine ? `<div class="sk-actions sk-actions--start">${btn(t("edit"), { variant: "primary", icon: "pencil", attrs: act("edit", s.id) })}${btn(t("del"), { variant: "ghost", icon: "trash", attrs: act("del", s.id) })}</div>`
      : `<div class="au-readonly"><span class="grow"><strong>${esc(t("roT"))}</strong> ${esc(t("roD"))}</span>${btn(t("copyMine"), { icon: "copy", attrs: act("copy", s.id) })}</div>`;
    return `<div class="sk-split__detail${ui.anim ? " sk-enter" : ""}"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm sk-back" data-act="unsel">${M.icon("chevron-left")}<span data-slot="button-label">${esc(t("back"))}</span></button>
      <header><h3 tabindex="-1">${esc(L(s.name))}</h3><p class="sk-lead">${esc(L(s.desc))}</p><span class="sk-tags">${M.renderBadge({ label: t("w_" + s.applies), tone: "neutral" })}${M.renderBadge({ label: t("ver", { v: s.v }), tone: "neutral" })}${s.at ? `<span class="sk-muted sk-small">${esc(t("savedAt", { at: t(s.at) }))}</span>` : ""}</span></header>
      ${top}<div class="sk-how-wrap" data-how="${s.id}">${radios}</div>
      <dl class="sk-dl">${L(s.not) ? `<dt>${esc(t("whenNot"))}</dt><dd>${esc(L(s.not))}</dd>` : ""}<dt>${esc(t("where"))}</dt><dd>${esc(t("sc_" + s.scope))}</dd></dl>
      ${M.renderPreviewCard({ title: t("bodyStart"), body: L(s.body), className: "sk-preview" })}
      <div class="sk-packline"><div class="sk-pack">${mark(mine ? "user" : "package")}<span class="sk-pack__text"><strong>${esc(packTitle(pack))}</strong><small>${esc(packMeta(pack))}</small></span></div></div></div>`;
  }
  function page() {
    const tabs = M.renderTabs({ label: t("settings"), className: "sk-tabs", tabs: [{ id: "plugins", label: t("tabPlugins"), selected: false, attrs: act("sim", "plugins") }, { id: "skills", label: t("tabSkills"), selected: true }] });
    const groups = D.packs.map((p) => {
      const rows = skills().filter((s) => s.pack === p.id).map((s) => `<li class="mw-item sk-pick-item"><button type="button" class="sk-pick"${!ui.form && !ui.ask && s.id === ui.sel ? ' aria-current="true"' : ""} data-act="sel" data-v="${s.id}">${mark("book")}<span class="sk-pick__text"><strong>${esc(L(s.name))}</strong><small>${esc(packTitle(p))}</small></span><span class="sk-pick__end">${stateMark(s.state)}</span></button></li>`).join("");
      return rows ? `<ul class="mw-items sk-items">${rows}</ul>` : "";
    }).join("");
    const left = `<div class="sk-split__list"><div class="au-new">${btn(t("newBtn"), { variant: "primary", icon: "plus", attrs: act("new") })}${btn(t("importBtn"), { icon: "download", attrs: act("sim", "import") })}</div>${groups}</div>`;
    const right = ui.ask ? ask() : ui.form ? form() : detail();
    return `<div class="proto-sheet sk-sheet"><header class="sk-sheet__head"><h1>${esc(t("settings"))}</h1><span class="sk-muted">${esc(t("scopeLine"))}</span></header>${tabs}
      <div class="sk-body sk-body--wide"><header class="sk-cat__head"><h2>${esc(t("tabSkills"))}</h2><p class="sk-lead">${esc(t("lead"))}</p></header>
      <div class="sk-split"${ui.detail || ui.form || ui.ask ? " data-detail" : ""}>${left}${right}</div></div></div>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const options = ["normal", "failed", "empty"].map((k) => `<option value="${k}"${P.st === k ? " selected" : ""}>${esc(t("st_" + k))}</option>`).join("");
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${M.renderBadge({ label: t("tbd"), tone: "warning" })}
      <span class="proto-field">${esc(t("opt"))}${tg(t("opt"), "opt", [["A", t("optA")], ["B", t("optB")], ["C", t("optC")]])}</span>
      <label>${esc(t("state"))}<select class="mw-select" data-slot="select" id="state">${options}</select></label>
      <span class="proto-field">${esc(t("lang"))}${tg(t("lang"), "lang", [["zh", "中文"], ["en", "English"]])}</span>
      <span class="proto-field">${esc(t("theme"))}${tg(t("theme"), "theme", [["light", t("light")], ["dark", t("dark")]])}</span>
      ${btn(t("reset"), { variant: "ghost", icon: "undo", attrs: { id: "reset" } })}`;
  }
  function render(focus) {
    const root = document.documentElement;
    root.lang = P.lang === "zh" ? "zh-CN" : "en"; root.dataset.theme = P.theme; root.dataset.resolvedTheme = P.theme;
    renderStrip();
    const active = document.activeElement, id = active?.id, at = active?.selectionStart;
    document.getElementById("app").innerHTML = page();
    ui.anim = false;
    const target = focus ? document.querySelector(focus) : id ? document.getElementById(id) : null;
    if (target) { target.focus(); if (!focus && at != null && target.setSelectionRange) target.setSelectionRange(at, at); }
  }
  let timer;
  const toast = (message, tone, action) => {
    const box = document.getElementById("toasts");
    box.innerHTML = M.renderToast({ message, tone, action });
    clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 5200);
  };
  const heading = "#app .sk-split__detail h3";

  function save() {
    const f = ui.form; f.tried = true;
    const p = problems(f), first = ["name", "desc", "body"].find((k) => p[k]);
    if (first) { if (P.opt === "C" && !f.id) f.step = first === "name" ? 1 : first === "desc" ? 2 : 3; return render("#au-" + first); }
    if (P.st === "failed") { ui.fail = true; return render(heading); }
    ui.fail = false;
    const text = { name: B(f.name, f.name), desc: B(f.desc, f.desc), not: B(f.not, f.not), hint: B(f.hint, f.hint), body: B(f.body, f.body) };
    let s = f.id ? find(f.id) : null;
    if (s) { Object.assign(s, text, { v: s.v + 1, at: "atNow", applies: f.applies }); toast(t("t_saved", { n: f.name, v: s.v }), "success"); }
    else { s = Object.assign({ id: "m" + Date.now(), pack: "mine", v: 1, at: "atNow", state: "off", applies: f.applies, scope: f.scope }, text); D.skills.unshift(s); if (P.st === "empty") { P.st = "normal"; persist(); }
      toast(t("t_savedNew", { n: f.name }), "success", { label: t("turnAuto"), attrs: act("turn-auto", s.id) }); }
    ui.form = null; ui.leave = null; ui.sel = s.id; ui.detail = true; ui.anim = true;
    return s;
  }
  // Going elsewhere with unsaved changes asks once, in the form; nothing is lost by a stray click.
  const leaving = (then) => { if (ui.form && dirty()) { ui.leave = then; render(".au-leave .mw-btn"); return true; } return false; };
  const run = (then) => {
    ui.form = null; ui.ask = null; ui.leave = null; ui.fail = false;
    if (then.a === "sel") { ui.sel = then.v; ui.detail = true; } else if (then.a === "new") start(); else if (then.a === "copy") ui.form = formOf(find(then.v), true); else if (then.a === "edit") ui.form = formOf(find(then.v));
    ui.anim = true; render(then.a === "new" && P.opt === "B" ? "#au-ask" : heading);
  };
  const start = () => { if (P.opt === "B") ui.ask = { text: "", busy: false }; else ui.form = blank(); };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],#reset");
    if (!b || b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); D = seed(); ui = freshUi(); persist(); return render(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; if (b.dataset.set === "opt") ui = freshUi(); persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "sel": case "new": case "copy": case "edit": if (!leaving({ a, v })) run({ a, v }); return;
      case "unsel": ui.detail = false; return render();
      case "new-plain": ui.ask = null; ui.form = blank(); ui.anim = true; return render("#au-name");
      case "ask": ui.ask = { text: "", busy: false }; ui.form = null; ui.anim = true; return render("#au-ask");
      case "draft": ui.ask.text = document.getElementById("au-ask").value; ui.ask.busy = true; render();
        return void setTimeout(() => { if (!ui.ask?.busy) return; ui.ask = null; ui.form = sample(); ui.anim = true; render(heading); }, 900);
      case "applies": ui.form.applies = v; return render();
      case "scope": ui.form.scope = v; return render();
      case "step": if (Number(v) > ui.form.step) { ui.form.tried = true; const p = problems(ui.form); if ((ui.form.step === 1 && p.name) || (ui.form.step === 2 && p.desc)) return render(ui.form.step === 1 ? "#au-name" : "#au-desc"); ui.form.tried = false; }
        ui.form.step = Number(v); ui.anim = true; return render(heading);
      case "save": save(); return render(ui.form ? undefined : heading);
      case "retry": P.st = "normal"; persist(); save(); return render(heading);
      case "cancel": if (!leaving({ a: "sel", v: ui.sel })) run({ a: "sel", v: ui.sel }); return;
      case "leave-stay": ui.leave = null; return render("#au-name");
      case "leave-drop": return run(ui.leave);
      case "leave-save": { const then = ui.leave; ui.leave = null; if (save()) run(then.a === "sel" && then.v === ui.sel ? { a: "sel", v: ui.sel } : then); else render(); return; }
      case "del": { const s = find(v), at = D.skills.indexOf(s); D.skills.splice(at, 1); ui.last = { s, at }; ui.sel = D.skills[0].id; render(heading); return toast(t("t_deleted", { n: L(s.name) }), "success", { label: t("undo"), attrs: act("undo-del") }); }
      case "undo-del": if (ui.last) { D.skills.splice(ui.last.at, 0, ui.last.s); ui.sel = ui.last.s.id; const n = L(ui.last.s.name); ui.last = null; render(heading); toast(t("t_restored", { n }), "success"); } return;
      case "turn-auto": { const s = find(v); if (s) { s.state = "auto"; render(); toast(t("t_state", { n: L(s.name), s: t("sAuto") }), "success"); } return; }
      case "sim": return toast(t("t_sim", { x: t("sim_" + v) }));
      default:
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "state") { P.st = el.value; D = seed(); ui = freshUi(); persist(); return render(); }
    if (el.name === "au-how") { const s = find(el.closest("[data-how]").dataset.how), prev = s.state; s.state = el.value; render(); toast(t("t_state", { n: L(s.name), s: t(WORD[s.state]) }), "success", { label: t("undo"), attrs: act("undo-state") }); ui.last = { state: prev, id: s.id }; }
  });
  document.addEventListener("click", (e) => { if (e.target.closest('[data-act="undo-state"]') && ui.last?.id) { find(ui.last.id).state = ui.last.state; ui.last = null; document.getElementById("toasts").innerHTML = ""; render(); } });
  // Typing updates the draft and the counter without re-rendering, so the caret never jumps.
  document.addEventListener("input", (e) => {
    const k = e.target.dataset?.f; if (!k || !ui.form) return;
    ui.form[k] = e.target.value;
    if (k === "body") { const c = document.getElementById("au-count"); if (c) c.textContent = t("count", { l: lines(ui.form.body), ml: LIMIT.lines, c: ui.form.body.length, mc: LIMIT.chars }); }
    const note = document.querySelector(".au-foot .grow"); if (note && note.textContent) note.textContent = t(dirty() ? "dirty" : "clean");
    if (ui.form.tried && e.target.hasAttribute("data-bad") && !problems(ui.form)[k]) render();
  });
  window.addEventListener("beforeunload", (e) => { if (ui.form && dirty()) e.preventDefault(); });

  render();
})();
