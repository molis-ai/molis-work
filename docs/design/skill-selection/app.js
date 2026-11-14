// Batch-41 prototype: skill selection — why a skill was used, changing the choice, and turning it off
// (specs: specs/prologue-strategies/skill.md SKL-01/02/11/16, specs/skill-packs/spec.md SKP-10).
// Fixed already (not asked again): three states per skill (off / auto / manual only, skill-packs §9); what you name with "/"
// comes first; a manual-only skill is never picked by AI; AI picks at most three and says why; a named skill that can't be
// used is never silently swapped; when several skills run, finished results stay and only what depends on a failure waits.
// The three options differ in WHERE the choice is shown and WHEN you can change it:
//   A  one quiet line above the reply; each skill is a button that opens "why" with the actions
//   B  a card under the reply that always shows the reason and the actions
//   C  told before sending (above the input, removable); after sending, the same line as A
// Every control is a component-board part from window.MW. Standalone review prototype: nothing is written anywhere.
(() => {
  const M = window.MW;
  const KEY = "molis-proto.skill-selection.v1";
  const DEF = { opt: "A", area: "assistant", st: "auto", lang: "zh", theme: "light" };
  const STATES = ["auto", "named", "unavailable", "partial", "none", "failed"];
  const T = {
    zh: {
      protoTitle: "技能选用 · 原型", tbd: "待定", opt: "方案", optA: "A 回复上方一行", optB: "B 回复下方的卡", optC: "C 发送前先告诉你",
      area: "位置", a_assistant: "助理", a_coding: "Coding", state: "状态", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      st_auto: "AI 自动选了一个", st_named: "你点名一个，AI 又补一个", st_unavailable: "你点名的用不了", st_partial: "几个里有一个失败", st_none: "没有合适的", st_failed: "改设置时保存失败",
      assistant: "助理", project: "项目：官网改版", used: "用了", willUse: "会用", noneUsed: "这一轮没用技能", pickOne: "选一个技能重做",
      o_auto: "自动选的", o_named: "你点名的", o_swapped: "你改选的",
      whyOf: "为什么用「{n}」", why: "依据", matched: "对上的", from: "来自", fromV: "「{p}」· 第 {v} 版", nowState: "现在", close: "关上",
      swap: "换一个重做", swapD: "用另一个技能把这一轮重做一遍", skip: "这次不用技能，重做", skipD: "只影响这一轮",
      toManual: "以后只在我点名时用", toManualD: "AI 不再自己选它；你用 / 点名时照常用", toOff: "在这个项目停用", toOffD: "点名也不能用；可以在「技能」里再打开",
      toAuto: "恢复成自动", toAutoD: "AI 可以按任务自己选它", details: "打开技能详情",
      candH: "换成哪一个", notPicked: "这次没选：{r}", back: "返回", noCand: "没有别的可用技能",
      sAuto: "自动", sManual: "仅手动", sOff: "已停用",
      t_state: "「{n}」改成{s}", undo: "撤销", t_redo: "按「{n}」把这一轮重做了", t_redoNone: "不用技能，把这一轮重做了", t_sim: "原型：{x}", sim_details: "打开设置里的技能详情", sim_connect: "打开连接设置",
      failT: "没能保存", failD: "「{n}」还是「{s}」，什么都没改。", retry: "重试",
      naT: "「{n}」现在用不了", naD: "它要用日历连接，这个项目还没连上。这一轮还没开始，也没有换成别的技能。", naConnect: "去连接日历", naUse: "改用「{n}」", naPlain: "不用技能，直接做",
      stepsLead: "这一轮用了 4 个技能，其中 1 个没做成。做完的都留着，只有等它的那一步停下了。",
      s_done: "做完了", s_failed: "没做成", s_waiting: "等上一步", s_running: "还在做", retryStep: "重新连接并重试", t_retried: "「{n}」做成了，等它的那一步接着做了",
      send: "发送", placeholder: "写点什么，/ 点名技能", remove: "这次不用「{n}」", changeBefore: "换一个", sent: "已发送",
      round: "第 3 轮", done: "已完成", f_model: "模型", f_role: "角色", f_methods: "技能", f_materials: "材料", roleV: "实现者 · v4", materialsV: "官网改版方案.md",
      me_auto: "帮我把这周的进展整理成周报", me_named: "按复盘的方式看一下这周，再出一份周报", me_unavailable: "出一份这次上线的发布说明", me_partial: "写周报，发到团队频道，更新项目进度，再通知相关的人", me_none: "把首页标题改短一点",
      c_auto: "给登录页补上表单校验的测试", c_named: "按代码评审的方式看一下这次改动，再补测试", c_unavailable: "按发布检查清单过一遍", c_partial: "补测试、跑一遍、更新变更记录，再通知评审人", c_none: "把这个变量改个名字",
    },
    en: {
      protoTitle: "Skill selection · prototype", tbd: "Undecided", opt: "Option", optA: "A One line above the reply", optB: "B A card under the reply", optC: "C Told before sending",
      area: "Where", a_assistant: "Assistant", a_coding: "Coding", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      st_auto: "AI picked one", st_named: "You named one, AI added one", st_unavailable: "The one you named can't be used", st_partial: "One of several failed", st_none: "Nothing fits", st_failed: "Saving a setting fails",
      assistant: "Assistant", project: "Project: Website redesign", used: "Used", willUse: "Will use", noneUsed: "No skill used this time", pickOne: "Pick a skill and redo",
      o_auto: "picked by AI", o_named: "named by you", o_swapped: "changed by you",
      whyOf: "Why “{n}” was used", why: "Reason", matched: "Matched", from: "From", fromV: "“{p}” · version {v}", nowState: "Now", close: "Close",
      swap: "Redo with another", swapD: "Runs this turn again with a different skill", skip: "Redo without a skill", skipD: "Only affects this turn",
      toManual: "Use only when I name it", toManualD: "AI stops picking it; naming it with / still works", toOff: "Turn off in this project", toOffD: "Can't be named either; turn it back on under Skills",
      toAuto: "Back to auto", toAutoD: "AI may pick it when a task fits", details: "Open skill details",
      candH: "Which one instead", notPicked: "Not picked this time: {r}", back: "Back", noCand: "No other skill is available",
      sAuto: "Auto", sManual: "Manual only", sOff: "Off",
      t_state: "“{n}” set to {s}", undo: "Undo", t_redo: "Redid this turn with “{n}”", t_redoNone: "Redid this turn without a skill", t_sim: "Prototype: {x}", sim_details: "opens the skill's details in Settings", sim_connect: "opens connection settings",
      failT: "Couldn't save", failD: "“{n}” is still “{s}”; nothing changed.", retry: "Retry",
      naT: "“{n}” can't be used right now", naD: "It needs a calendar connection, and this project has none. This turn hasn't started, and no other skill was swapped in.", naConnect: "Connect a calendar", naUse: "Use “{n}” instead", naPlain: "Do it without a skill",
      stepsLead: "This turn used 4 skills and 1 didn't finish. What finished is kept; only the step waiting on it has stopped.",
      s_done: "Done", s_failed: "Didn't finish", s_waiting: "Waiting on the step above", s_running: "Still working", retryStep: "Reconnect and retry", t_retried: "“{n}” finished, and the step waiting on it went on",
      send: "Send", placeholder: "Write something, / to name a skill", remove: "Don't use “{n}” this time", changeBefore: "Change", sent: "Sent",
      round: "Round 3", done: "Finished", f_model: "Model", f_role: "Role", f_methods: "Skills", f_materials: "Materials", roleV: "Implementer · v4", materialsV: "redesign-plan.md",
      me_auto: "Turn this week's progress into a weekly review", me_named: "Look at this week the way a retro would, then write a weekly review", me_unavailable: "Write release notes for this launch", me_partial: "Write the weekly review, post it to the team channel, update project progress, then notify the people involved", me_none: "Make the homepage title shorter",
      c_auto: "Add form validation tests for the sign-in page", c_named: "Look at this change the way a code review would, then add tests", c_unavailable: "Go through the release checklist", c_partial: "Add tests, run them, update the changelog, then notify the reviewer", c_none: "Rename this variable",
    },
  };
  // Skills by where they apply. `why` is the sentence shown as the reason; `hit` is what matched; `passed` is why it lost.
  const S = {
    assistant: {
      weekly: { name: { zh: "写周报", en: "Weekly review" }, pack: { zh: "写作包", en: "Writing pack" }, v: 3,
        why: { zh: "你要的是把一周的进展汇总成周报，正是它写明的用途。", en: "You asked to sum up a week as a weekly review, which is what it says it's for." },
        hit: { zh: "「周报」「这周的进展」", en: "“weekly review”, “this week's progress”" }, passed: { zh: "你点名了别的", en: "you named another" },
        reply: { zh: ["这周的周报：", ["完成：首页改版上线，转化页 A/B 开始跑", "进行中：定价页文案第二稿", "下周：收 A/B 数据，定价页定稿"]], en: ["This week's review:", ["Done: homepage redesign shipped; A/B test on the conversion page started", "In progress: second draft of pricing copy", "Next week: collect A/B data; finalise the pricing page"]] } },
      retro: { name: { zh: "项目复盘", en: "Project retro" }, pack: { zh: "写作包", en: "Writing pack" }, v: 2,
        why: { zh: "你用 / 点名了它。", en: "You named it with /." }, hit: { zh: "/项目复盘", en: "/project-retro" }, passed: { zh: "它用在一个阶段结束时，这次只是一周", en: "it's for the end of a phase, and this is one week" },
        reply: { zh: ["按复盘的方式看这一周：", ["做对的：先上线再调文案，省了一轮返工", "可以更好：A/B 的指标定晚了两天", "下次：开跑前先写下要看的数"]], en: ["This week, looked at as a retro:", ["Went well: shipping before polishing copy saved a round of rework", "Could be better: A/B metrics were set two days late", "Next time: write down the numbers to watch before starting"]] } },
      minutes: { name: { zh: "会议纪要", en: "Meeting minutes" }, pack: { zh: "写作包", en: "Writing pack" }, v: 1,
        why: { zh: "你改选了它。", en: "You changed to it." }, hit: { zh: "—", en: "—" }, passed: { zh: "这次没有会议内容", en: "there's no meeting to write up" },
        reply: { zh: ["按会议纪要的格式整理：", ["结论：首页改版已上线", "待办：定价页文案第二稿（负责人待定）"]], en: ["Arranged as meeting minutes:", ["Decision: homepage redesign is live", "To do: second draft of pricing copy (owner to be set)"]] } },
      release: { name: { zh: "发布说明", en: "Release notes" }, pack: { zh: "发布包", en: "Release pack" }, v: 4 },
      post: { name: { zh: "发到团队频道", en: "Post to team channel" } }, progress: { name: { zh: "更新项目进度", en: "Update project progress" } }, notify: { name: { zh: "通知相关的人", en: "Notify people involved" } },
    },
    coding: {
      weekly: { name: { zh: "补测试", en: "Add tests" }, pack: { zh: "工程包", en: "Engineering pack" }, v: 5,
        why: { zh: "你要给已有的页面补测试，正是它写明的用途。", en: "You asked for tests on an existing page, which is what it says it's for." },
        hit: { zh: "「补上测试」「表单校验」", en: "“add tests”, “form validation”" }, passed: { zh: "你点名了别的", en: "you named another" },
        reply: { zh: ["补了 6 条表单校验的测试，都通过：", ["空邮箱、格式不对的邮箱", "密码少于 8 位", "两次提交只发一次请求"]], en: ["Added 6 form validation tests, all passing:", ["Empty and malformed email", "Password shorter than 8", "Double submit sends one request"]] } },
      retro: { name: { zh: "代码评审", en: "Code review" }, pack: { zh: "工程包", en: "Engineering pack" }, v: 3,
        why: { zh: "你用 / 点名了它。", en: "You named it with /." }, hit: { zh: "/代码评审", en: "/code-review" }, passed: { zh: "它用来看别人的改动，这次是写新的", en: "it's for reading a change, and this is writing new code" },
        reply: { zh: ["按评审的方式看这次改动：", ["校验写在了组件里，建议抽到一处", "错误文案没有英文", "没有测试覆盖重复提交"]], en: ["This change, read as a review:", ["Validation lives in the component; move it to one place", "Error copy has no English", "Nothing tests a double submit"]] } },
      minutes: { name: { zh: "排查并修复", en: "Diagnose and fix" }, pack: { zh: "工程包", en: "Engineering pack" }, v: 2,
        why: { zh: "你改选了它。", en: "You changed to it." }, hit: { zh: "—", en: "—" }, passed: { zh: "这次没有报错要查", en: "there's no failure to look into" },
        reply: { zh: ["按排查的步骤走了一遍：", ["没有复现到报错", "顺手补了 2 条覆盖边界的测试"]], en: ["Went through it as a diagnosis:", ["Couldn't reproduce a failure", "Added 2 tests for the edges along the way"]] } },
      release: { name: { zh: "发布检查清单", en: "Release checklist" }, pack: { zh: "发布包", en: "Release pack" }, v: 4 },
      post: { name: { zh: "跑一遍测试", en: "Run the tests" } }, progress: { name: { zh: "更新变更记录", en: "Update changelog" } }, notify: { name: { zh: "通知评审人", en: "Notify reviewer" } },
    },
  };
  const PLAIN = { zh: ["直接做了，没有用技能：", ["已按你说的改好"]], en: ["Done directly, without a skill:", ["Changed as you asked"]] };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let P = (() => { try { return Object.assign(clone(DEF), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return clone(DEF); } })();
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private window: keep in memory */ } };
  const t = (k, v) => (T[P.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const L = (o) => (o && typeof o === "object" && !Array.isArray(o) ? o[P.lang] : o) ?? "";
  const esc = M.escapeHtml;
  const skill = (id) => S[P.area][id];
  const act = (a, v) => Object.assign({ "data-act": a }, v != null ? { "data-v": v } : {});
  const btn = (label, o = {}) => M.renderButton({ label, variant: o.variant || "secondary", size: o.size || "sm", icon: o.icon, iconOnly: o.iconOnly, disabled: o.disabled, attrs: o.attrs });
  const STATE_WORD = { auto: "sAuto", manual: "sManual", off: "sOff" };

  /* ---------- in-page state (memory only) ---------- */
  const freshUi = () => {
    const used = P.st === "auto" || P.st === "failed" ? [{ id: "weekly", origin: "auto" }]
      : P.st === "named" ? [{ id: "retro", origin: "named" }, { id: "weekly", origin: "auto" }]
      : [];
    return { used, states: { weekly: "auto", retro: "manual", minutes: "auto" }, open: null, cand: false, redo: false, fail: null, last: null,
      sent: P.opt !== "C", will: used.map((x) => x.id), connected: false, steps: { post: "failed", notify: "waiting" } };
  };
  let ui = freshUi();
  const candidates = () => ["weekly", "retro", "minutes"].filter((id) => !ui.used.some((x) => x.id === id) && ui.states[id] !== "off");

  /* ---------- the "why" panel (A and C; B shows the same content in its card) ---------- */
  function whyBody(id, origin) {
    const s = skill(id), st = ui.states[id];
    const fail = ui.fail === id ? M.renderAlert({ title: t("failT"), body: t("failD", { n: L(s.name), s: t(STATE_WORD[st]) }), tone: "danger", role: "alert", actions: [{ label: t("retry"), attrs: act("retry-save") }] }) : "";
    if (ui.cand) return candList();
    const item = (label, description, a, v, extra = {}) => M.renderMenuItem({ label, description, id: `sel-${a}-${id}`, iconName: extra.icon, danger: extra.danger, attrs: act(a, v) });
    const setting = st === "auto"
      ? item(t("toManual"), t("toManualD"), "set", id + ":manual", { icon: "user" }) + item(t("toOff"), t("toOffD"), "set", id + ":off", { icon: "pause" })
      : st === "manual" ? item(t("toAuto"), t("toAutoD"), "set", id + ":auto", { icon: "zap" }) + item(t("toOff"), t("toOffD"), "set", id + ":off", { icon: "pause" })
      : item(t("toAuto"), t("toAutoD"), "set", id + ":auto", { icon: "zap" });
    return `<dl>
        <dt>${esc(t("why"))}</dt><dd>${esc(origin === "named" ? L(skill("retro").why) : origin === "swapped" ? L(skill("minutes").why) : L(s.why))}</dd>
        ${origin === "auto" ? `<dt>${esc(t("matched"))}</dt><dd>${esc(L(s.hit))}</dd>` : ""}
        <dt>${esc(t("from"))}</dt><dd>${esc(t("fromV", { p: L(s.pack), v: s.v }))}</dd>
        <dt>${esc(t("nowState"))}</dt><dd>${esc(t(STATE_WORD[st]))}</dd></dl>${fail}<hr>
      ${M.renderMenu({ items: item(t("swap"), t("swapD"), "cand", null, { icon: "refresh" }) + item(t("skip"), t("skipD"), "redo", "", { icon: "x" }) })}<hr>
      ${M.renderMenu({ items: setting + M.renderMenuItem({ label: t("details"), iconName: "settings", attrs: act("sim", "details") }) })}`;
  }
  function candList() {
    const list = candidates();
    const items = list.map((id) => M.renderMenuItem({ label: L(skill(id).name), description: t("notPicked", { r: L(skill(id).passed) }), id: "sel-c-" + id, iconName: "zap", attrs: act("redo", id) })).join("");
    return `<p class="sel-sub">${esc(t("candH"))}</p>${list.length ? M.renderMenu({ items }) : `<p class="sel-sub">${esc(t("noCand"))}</p>`}
      <div>${btn(t("back"), { variant: "ghost", icon: "back", attrs: act("cand-back") })}</div>`;
  }
  const whyPanel = (id, origin) => `<div class="sel-why" role="dialog" aria-label="${esc(t("whyOf", { n: L(skill(id).name) }))}">
      <h4><span>${esc(ui.cand ? t("swap") : t("whyOf", { n: L(skill(id).name) }))}</span><span class="grow"></span>${btn(t("close"), { variant: "ghost", icon: "x", iconOnly: true, attrs: act("close") })}</h4>${whyBody(id, origin)}</div>`;
  // One skill this turn used: a bounded button with its name and where the choice came from; opens "why".
  const pick = ({ id, origin }) => `<span class="sel-pick">${M.renderButton({ label: L(skill(id).name) + " · " + t("o_" + origin), variant: "secondary", size: "sm", icon: "zap",
      attrs: Object.assign(act("open", id), { "aria-expanded": String(ui.open === id), "aria-haspopup": "dialog" }) })}${ui.open === id ? whyPanel(id, origin) : ""}</span>`;
  function line() {
    if (!ui.used.length) return `<div class="sel-line"><span>${esc(t("noneUsed"))}</span><span class="sel-pick">${btn(t("pickOne"), { variant: "ghost", icon: "zap", attrs: Object.assign(act("open", "none"), { "aria-expanded": String(ui.open === "none") }) })}${
      ui.open === "none" ? `<div class="sel-why" role="dialog" aria-label="${esc(t("pickOne"))}"><h4><span>${esc(t("pickOne"))}</span><span class="grow"></span>${btn(t("close"), { variant: "ghost", icon: "x", iconOnly: true, attrs: act("close") })}</h4>${candListFor()}</div>` : ""}</span></div>`;
    return `<div class="sel-line"><span>${esc(t("used"))}</span>${ui.used.map(pick).join("")}</div>`;
  }
  const candListFor = () => { const was = ui.cand; ui.cand = true; const html = candList().replace(/<div>[\s\S]*<\/div>$/, ""); ui.cand = was; return html; };

  /* ---------- option B: the card under the reply ---------- */
  function card() {
    if (!ui.used.length) return line();
    return ui.used.map(({ id, origin }) => { const s = skill(id); return `<div class="sel-card">
        <div class="sel-card__row">${M.icon("zap")}<strong>${esc(L(s.name))}</strong>${M.renderBadge({ label: t("o_" + origin), tone: origin === "auto" ? "info" : "neutral" })}<span class="grow"></span>
          <span class="sel-pick">${btn(t("swap"), { icon: "refresh", attrs: Object.assign(act("open", id), { "aria-expanded": String(ui.open === id) }) })}${ui.open === id ? whyPanel(id, origin) : ""}</span></div>
        <p>${esc(origin === "named" ? L(skill("retro").why) : origin === "swapped" ? L(skill("minutes").why) : L(s.why))}</p></div>`; }).join("");
  }

  /* ---------- states ---------- */
  function replyText() {
    const text = ui.used.length ? ui.used.map((x) => L(skill(x.id).reply)).filter(Boolean) : [PLAIN[P.lang]];
    return text.map(([lead, items]) => `<p>${esc(lead)}</p><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("");
  }
  const unavailable = () => M.renderAlert({ title: t("naT", { n: L(skill("release").name) }), body: t("naD"), tone: "warning", state: "unavailable", role: "status",
    actions: [{ label: t("naConnect"), variant: "primary", icon: "link", attrs: act("sim", "connect") }, { label: t("naUse", { n: L(skill("weekly").name) }), attrs: act("redo", "weekly") }, { label: t("naPlain"), attrs: act("redo", "") }] });
  function steps() {
    const row = (id, st, fact, extra = "") => `<li>${M.renderStatusMark({ label: t("s_" + st), tone: st === "done" ? "done" : st === "failed" ? "blocked" : st === "running" ? "progress" : "hold", state: st === "done" ? "done" : st === "failed" ? "blocked" : st === "running" ? "running" : "waiting" })}
        <span class="name">${esc(L(skill(id).name))}</span><span class="fact">${esc(fact)}</span>${extra}</li>`;
    const zh = P.lang === "zh";
    return `<p>${esc(t("stepsLead"))}</p><ul class="sel-steps">
      ${row("weekly", "done", zh ? "写好了，在下面" : "Written, below")}
      ${row("post", ui.steps.post, ui.steps.post === "done" ? (zh ? "已发出" : "Posted") : (zh ? "频道的连接过期了" : "The channel connection expired"), ui.steps.post === "failed" ? btn(t("retryStep"), { variant: "primary", icon: "refresh", attrs: act("retry-step") }) : "")}
      ${row("notify", ui.steps.notify, ui.steps.notify === "done" ? (zh ? "已通知 3 人" : "3 people notified") : (zh ? "发出以后才通知" : "Notifies once it's posted"))}
      ${row("progress", "running", zh ? "不用等，接着在做" : "Doesn't wait; carrying on")}</ul>${(() => { const [lead, items] = L(skill("weekly").reply); return `<p>${esc(lead)}</p><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`; })()}`;
  }
  function reply() {
    if (P.st === "unavailable" && !ui.redo) return `<div class="sel-reply">${unavailable()}</div>`;
    if (P.st === "partial") return `<div class="sel-reply">${steps()}</div>`;
    const top = P.opt === "B" ? "" : line(), bottom = P.opt === "B" ? card() : "";
    return `<div class="sel-reply${ui.redo ? " is-redo" : ""}">${top}${replyText()}${bottom}</div>`;
  }
  const mine = () => { const named = P.st === "named" ? "retro" : P.st === "unavailable" ? "release" : null;
    return `<div class="sel-me">${named ? `<span class="sel-chip">${M.icon("zap")}/${esc(L(skill(named).name))}</span>` : ""}<div class="bub">${esc(t((P.area === "coding" ? "c_" : "me_") + (P.st === "failed" ? "auto" : P.st)))}</div></div>`; };

  /* ---------- option C: told before sending ---------- */
  function composer() {
    const before = P.opt === "C" && !ui.sent && P.st !== "unavailable" && P.st !== "partial";
    const will = before ? `<div class="sel-will"><span>${esc(ui.will.length ? t("willUse") : t("noneUsed"))}</span>${ui.will.map((id) => `<span class="sel-chip">${M.icon("zap")}${esc(L(skill(id).name))}${
      M.renderButton({ label: t("remove", { n: L(skill(id).name) }), variant: "ghost", size: "sm", icon: "x", iconOnly: true, attrs: act("unwill", id) })}</span>`).join("")}</div>` : "";
    const text = before ? t((P.area === "coding" ? "c_" : "me_") + (P.st === "failed" ? "auto" : P.st)) : "";
    return `<div class="sel-composer">${will}<div class="sel-inrow">${M.renderTextarea({ value: text, placeholder: t("placeholder"), rows: 1, attrs: { "aria-label": t("placeholder") } })}${btn(t("send"), { variant: "primary", size: "md", icon: "send", attrs: act("send") })}</div></div>`;
  }

  function page() {
    const before = P.opt === "C" && !ui.sent && P.st !== "unavailable" && P.st !== "partial";
    const thread = before ? "" : `${mine()}${reply()}`;
    if (P.area === "coding") {
      const facts = before || P.st === "unavailable" && !ui.redo || P.st === "partial" ? "" : `<dl class="sel-facts"><dt>${esc(t("f_model"))}</dt><dd>MiniMax-M2</dd><dt>${esc(t("f_role"))}</dt><dd>${esc(t("roleV"))}</dd>
        <dt>${esc(t("f_methods"))}</dt><dd>${P.opt === "B" ? card() : line()}</dd><dt>${esc(t("f_materials"))}</dt><dd>${esc(t("materialsV"))}</dd></dl>`;
      const body = before ? "" : P.st === "unavailable" && !ui.redo || P.st === "partial" ? `<div class="sel-thread">${mine()}${reply()}</div>`
        : `<div class="sel-run">${M.renderStatusMark({ label: t("done"), tone: "done", state: "done" })}<strong>${esc(t("round"))}</strong></div>${facts}<div class="sel-thread">${mine()}<div class="sel-reply${ui.redo ? " is-redo" : ""}">${replyText()}</div></div>`;
      return `<section class="proto-sheet sel-sheet"><header class="sel-head">Coding<small>${esc(t("project"))}</small></header>${body}${composer()}</section>`;
    }
    return `<section class="proto-sheet sel-sheet"><header class="sel-head">${esc(t("assistant"))}<small>${esc(t("project"))}</small></header><div class="sel-thread">${thread}</div>${composer()}</section>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const options = STATES.map((k) => `<option value="${k}"${P.st === k ? " selected" : ""}>${esc(t("st_" + k))}</option>`).join("");
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${M.renderBadge({ label: t("tbd"), tone: "warning" })}
      <span class="proto-field">${esc(t("opt"))}${tg(t("opt"), "opt", [["A", t("optA")], ["B", t("optB")], ["C", t("optC")]])}</span>
      <span class="proto-field">${esc(t("area"))}${tg(t("area"), "area", [["assistant", t("a_assistant")], ["coding", t("a_coding")]])}</span>
      <label>${esc(t("state"))}<select class="mw-select" data-slot="select" id="state">${options}</select></label>
      <span class="proto-field">${esc(t("lang"))}${tg(t("lang"), "lang", [["zh", "中文"], ["en", "English"]])}</span>
      <span class="proto-field">${esc(t("theme"))}${tg(t("theme"), "theme", [["light", t("light")], ["dark", t("dark")]])}</span>
      ${M.renderButton({ label: t("reset"), variant: "ghost", icon: "undo", attrs: { id: "reset" } })}`;
  }
  function render() {
    const root = document.documentElement;
    root.lang = P.lang === "zh" ? "zh-CN" : "en";
    root.dataset.theme = P.theme;
    root.dataset.resolvedTheme = P.theme;
    renderStrip();
    const was = document.activeElement?.closest?.("[data-act]");
    const back = was ? `[data-act="${was.dataset.act}"]${was.dataset.v ? `[data-v="${was.dataset.v}"]` : ""}` : null;
    document.getElementById("app").innerHTML = page();
    ui.redo = ui.redo && P.st === "unavailable";
    // Opening "why" moves focus into it; closing or re-rendering puts it back on the same control when it is still there.
    const panel = document.querySelector("#app .sel-why");
    if (panel && was?.dataset.act === "open") panel.querySelector("button")?.focus();
    else if (back) document.querySelector(`#app ${back}`)?.focus();
  }

  /* ---------- actions ---------- */
  let timer = 0;
  const toast = (message, tone, action) => {
    const box = document.getElementById("toasts");
    box.innerHTML = M.renderToast({ message, tone, action });
    clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 4200);
  };
  // A setting change applies at once and can be undone from the toast; a failed write leaves the old state and says so in place.
  function setState(id, value) {
    if (P.st === "failed") { ui.fail = id; return render(); }
    ui.last = { id, prev: ui.states[id] };
    ui.states[id] = value; ui.fail = null; ui.open = null;
    render();
    toast(t("t_state", { n: L(skill(id).name), s: t(STATE_WORD[value]) }), "success", { label: t("undo"), attrs: act("undo-state") });
  }
  // Redoing the turn with another skill (or none) replaces what this turn used; the reply is drawn again.
  function redo(id) {
    ui.used = id ? [{ id, origin: P.st === "none" || P.st === "unavailable" ? "named" : "swapped" }] : [];
    ui.open = null; ui.cand = false; ui.redo = true;
    render();
    toast(id ? t("t_redo", { n: L(skill(id).name) }) : t("t_redoNone"), "success");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],#reset");
    if (!b) { if (ui.open && !e.target.closest(".sel-why")) { ui.open = null; ui.cand = false; render(); } return; }
    if (b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); ui = freshUi(); persist(); return render(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; if (b.dataset.set === "opt" || b.dataset.set === "area") ui = freshUi(); persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "open": ui.open = ui.open === v ? null : v; ui.cand = false; ui.fail = null; break;
      case "close": ui.open = null; ui.cand = false; break;
      case "cand": ui.cand = true; break;
      case "cand-back": ui.cand = false; break;
      case "redo": return redo(v || "");
      case "set": { const [id, value] = v.split(":"); return setState(id, value); }
      case "retry-save": { const id = ui.fail; P.st = "auto"; persist(); ui.fail = null; return setState(id, ui.states[id] === "auto" ? "manual" : "auto"); }
      case "undo-state": if (ui.last) { ui.states[ui.last.id] = ui.last.prev; ui.last = null; document.getElementById("toasts").innerHTML = ""; } break;
      case "retry-step": ui.steps = { post: "done", notify: "done" }; render(); return toast(t("t_retried", { n: L(skill("post").name) }), "success");
      case "unwill": ui.will = ui.will.filter((id) => id !== v); break;
      case "send": if (P.opt === "C" && !ui.sent) { ui.sent = true; ui.used = ui.used.filter((x) => ui.will.includes(x.id)); ui.redo = true; } break;
      case "sim": return toast(t("t_sim", { x: t("sim_" + v) }));
      default: return;
    }
    render();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ui.open) { ui.open = null; ui.cand = false; render(); } });
  document.addEventListener("change", (e) => { if (e.target.id === "state") { P.st = e.target.value; ui = freshUi(); persist(); render(); } });

  render();
})();
