// Risk plugin prototype (batch 17), rebuilt on the component board's real parts (2026-11-04).
// The user chose: record B (two columns, facts on the right) + C (opens in the side panel), overview A (grouped by status),
// review A (a review section in the record, with the brief's risk section beside it). Only those are drawn here.
// Every control comes from window.MW (the plugin SDK's ui renderers and the design system's), plus the board's collab parts
// (mw-who, mw-owner, mw-sources, mw-brought). Standalone review prototype, not product code.
(() => {
  const M = window.MW;
  const D = window.RISK_DATA;
  const KEY = "molis-proto.risk-plugin.v2";
  const DEF = { area: "overview", open: "B", st: { record: "normal", overview: "normal", review: "normal" }, lang: "zh", theme: "light" };
  const STATES = {
    record: ["normal", "unlinked", "new", "gone", "conflict", "closed", "readonly", "failed"],
    overview: ["normal", "unlinked", "closed", "nomatch", "partial", "empty", "failed"],
    review: ["normal", "none", "changed", "quiet", "failed", "paused", "stopped", "briefold", "briefgap"],
  };
  const T = {
    zh: {
      protoTitle: "风险插件定样 · 原型", chosen: "已定：记录 B + C · 总览 A · 复查 A", area: "区域", openAs: "记录怎么打开", openB: "B 整页两栏", openC: "C 侧栏打开", state: "状态", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      a_record: "风险记录", a_overview: "总览", a_review: "复查",
      st_record_normal: "正常", st_record_unlinked: "没关联 Goal", st_record_new: "记一条新风险", st_record_gone: "关联对象已删除或无权查看", st_record_conflict: "保存时别人刚改过", st_record_closed: "已关闭", st_record_readonly: "只能查看", st_record_failed: "读不到这条风险",
      st_overview_normal: "正常", st_overview_unlinked: "只看没关联 Goal 的", st_overview_closed: "含已关闭", st_overview_nomatch: "筛选没有结果", st_overview_partial: "部分关联读不到", st_overview_empty: "还没有风险", st_overview_failed: "读取失败",
      st_review_normal: "已安排，上次无事", st_review_none: "没安排复查", st_review_changed: "到期：有变化要你定", st_review_quiet: "到期：没有变化", st_review_failed: "到期：复查没完成", st_review_paused: "已暂停", st_review_stopped: "风险关闭，复查停止", st_review_briefold: "简报是旧版本", st_review_briefgap: "简报：风险来源读不到",
      plugin: "风险", overview: "项目风险", s_open: "打开", s_mitigating: "缓解中", s_accepted: "已接受", s_closed: "已关闭",
      impact: "影响", like: "可能性", high: "高", med: "中", low: "低", owner: "负责人", status: "状态", desc: "说明", plan: "处置办法", links: "关联", review: "复查", activity: "进展", updated: "更新于 {t}", facts: "要点",
      edit: "编辑", save: "保存", cancel: "取消", back: "项目风险", newRisk: "记一条风险", record: "记下", titleL: "标题", titlePh: "一句话说清楚可能出什么事", descPh: "为什么会发生、会影响什么", planPh: "打算怎么处理（可以以后再写）", optional: "可以以后再写",
      f_status: "范围", f_active: "未关闭", f_all: "全部", f_closed: "已关闭", f_impact: "影响", f_owner: "负责人", f_goal: "关联 Goal", any: "全部", noGoal: "没关联 Goal", count: "{n} 条",
      noPlan: "还没写处置办法", addPlan: "写处置办法", noLinks: "还没关联 Goal", linkGoal: "关联 Goal", addLink: "关联", standalone: "风险可以不关联 Goal，单独记着。",
      ty_goal: "Goal", ty_session: "Coding 会话", ty_feed: "Feed", ty_artifact: "成果",
      gone_deleted: "已删除", gone_noaccess: "无权查看", gone_unread: "读不到", goneName: "（看不到名字）",
      conflictT: "林夏 11-03 14:20 刚改过处置办法", conflictD: "你的修改没有保存，两份都在下面。", theirs: "现在的版本", yours: "你的草稿", useTheirs: "用现在的版本", mergeMine: "在现在的版本上接着改",
      closedT: "这条风险已关闭", closedD: "{who} {when} 关闭。关闭后不再复查。", reopen: "重新打开", roT: "你只能查看", roD: "修改这个项目的风险要有授权。", askAccess: "去设置里看授权",
      failT: "读不到这条风险", failD: "风险插件这次没有响应。这条风险还在，只是现在看不到。", retry: "重试", lastOk: "上次读到：{t}",
      ovFailT: "读不到这个项目的风险", ovFailD: "这不代表没有风险。其他插件照常可用。上次读到：11-04 09:12", emptyT: "这个项目还没有记下风险", emptyD: "想到可能出问题的事就记一条。简报或助理提到的风险不会自动登记。", nomatchT: "没有符合筛选的风险", nomatchD: "换个条件，或清除筛选看全部。", clearF: "清除筛选",
      partialT: "有 1 个关联的 Goal 读不到", partialD: "风险本身照常显示。", showClosed: "已关闭 {n} 条",
      nextReview: "下次复查 {d}", by: "{who} 安排 · 经日程", reschedule: "改期", pause: "暂停", resume: "恢复", cancelReview: "取消复查", paused: "已暂停", noReview: "没有安排复查", noReviewD: "确实需要跟进时再安排；不填也可以。", addReview: "安排复查",
      rv_when: "什么时候", rv_3d: "3 天后", rv_1w: "1 周后", rv_2w: "2 周后", rv_pick: "选日期", rv_note: "到时候看什么（可不填）", rv_ok: "安排", rv_hint: "到期由助理读这条风险和关联的资料，结果并进简报；没有变化就不打扰你。",
      results: "复查结果", assistant: "助理", res_quiet: "没有新变化（没有打扰你）", res_fail: "复查没完成", res_failD: "供应商公告读不到（Feed 没响应）。没有当成「没有变化」，11-05 再试。", retryNow: "现在重试",
      res_note: "读了供应商回复、Feed 公告和 Coding 会话", res_change: "有变化，要你定：供应商只能延到 12 月 31 日", res_changeD: "切换还差约 40%。建议在处置办法里加上：12 月 20 日前完成切换。", adopt: "加进处置办法", dismiss: "不采纳", adopted: "已加进处置办法", dismissed: "没有采纳", undo: "撤回", notified: "已按你的通知设置提醒过一次",
      stoppedT: "复查已停止", stoppedD: "这条风险已关闭，11-10 的复查已取消。",
      brief: "简报", briefOf: "Atlas 迁移 · {t}", briefOwner: "简报由 Work Brief 管；这里只放风险这一段", briefRisk: "风险", briefOther: "目标进展、交付和下一步（略）",
      oldT: "这是 11-01 09:00 的简报", oldD: "之后风险有变化：1 条新登记，1 条更新。", refresh: "刷新简报", gapT: "风险来源这次读不到", gapD: "这一段没有更新。不代表没有风险；其他段照常。", nextStep: "下一步：", openOverview: "打开项目风险", potential: "潜在 · 未登记", register: "登记为风险", thenNow: "当时 {a} · 现在 {b}", isNew: "新登记",
      fromGoal: "Goals", concern: "顾虑", concernText: "v2 停用可能让同步中断，影响要求 2「同步不中断」。", cites: "引用风险", expand: "展开成整页", close: "关闭", reqs: "要求", req1: "所有客户的数据同步到 v3 接口", req2: "切换期间同步不中断", req3: "旧接口调用量降到 0",
      t_updated: "已更新", t_saved: "已保存", t_scheduled: "已安排复查：{d}", t_cancelled: "已取消复查", t_paused: "复查已暂停", t_resumed: "复查已恢复", t_sim: "原型：这里会打开「{n}」", t_recorded: "已记下", t_adopted: "已加进处置办法", t_refreshed: "简报已刷新", t_retry: "原型：会重新读取",
      closeHint: "已关闭（停止后续复查）",
    },
    en: {
      protoTitle: "Risk plugin samples · prototype", chosen: "Chosen: record B + C · overview A · review A", area: "Area", openAs: "Record opens as", openB: "B Full page", openC: "C Side panel", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      a_record: "Risk record", a_overview: "Overview", a_review: "Review",
      st_record_normal: "Normal", st_record_unlinked: "Not linked to a Goal", st_record_new: "Record a new risk", st_record_gone: "Linked item deleted or no access", st_record_conflict: "Someone just changed it", st_record_closed: "Closed", st_record_readonly: "View only", st_record_failed: "Can't read this risk",
      st_overview_normal: "Normal", st_overview_unlinked: "Only risks with no Goal", st_overview_closed: "Including closed", st_overview_nomatch: "Filter finds nothing", st_overview_partial: "Some links unreadable", st_overview_empty: "No risks yet", st_overview_failed: "Read failed",
      st_review_normal: "Scheduled, last one quiet", st_review_none: "No review scheduled", st_review_changed: "Due: a change needs you", st_review_quiet: "Due: nothing changed", st_review_failed: "Due: review didn't finish", st_review_paused: "Paused", st_review_stopped: "Risk closed, review stopped", st_review_briefold: "Brief is an old version", st_review_briefgap: "Brief: risk source unreadable",
      plugin: "Risks", overview: "Project risks", s_open: "Open", s_mitigating: "Mitigating", s_accepted: "Accepted", s_closed: "Closed",
      impact: "Impact", like: "Likelihood", high: "High", med: "Medium", low: "Low", owner: "Owner", status: "Status", desc: "Description", plan: "Response plan", links: "Linked to", review: "Review", activity: "Activity", updated: "Updated {t}", facts: "Key facts",
      edit: "Edit", save: "Save", cancel: "Cancel", back: "Project risks", newRisk: "Record a risk", record: "Record", titleL: "Title", titlePh: "In one sentence, what could go wrong", descPh: "Why it might happen and what it affects", planPh: "How you plan to handle it (can come later)", optional: "Can come later",
      f_status: "Show", f_active: "Not closed", f_all: "All", f_closed: "Closed", f_impact: "Impact", f_owner: "Owner", f_goal: "Linked Goal", any: "Any", noGoal: "No Goal", count: "{n}",
      noPlan: "No response plan yet", addPlan: "Write a response plan", noLinks: "Not linked to a Goal yet", linkGoal: "Link a Goal", addLink: "Link", standalone: "A risk can stand on its own without a Goal.",
      ty_goal: "Goal", ty_session: "Coding session", ty_feed: "Feed", ty_artifact: "Artifact",
      gone_deleted: "Deleted", gone_noaccess: "No access", gone_unread: "Can't read", goneName: "(name not visible)",
      conflictT: "Lin Xia changed the response plan at 11-03 14:20", conflictD: "Your edit was not saved; both versions are below.", theirs: "Current version", yours: "Your draft", useTheirs: "Keep the current version", mergeMine: "Continue on the current version",
      closedT: "This risk is closed", closedD: "Closed by {who} on {when}. Closed risks are not reviewed.", reopen: "Reopen", roT: "View only", roD: "Changing this project's risks needs permission.", askAccess: "See permissions in Settings",
      failT: "Can't read this risk", failD: "The risk plugin didn't respond. The risk is still there; it just can't be shown now.", retry: "Retry", lastOk: "Last read: {t}",
      ovFailT: "Can't read this project's risks", ovFailD: "This doesn't mean there are no risks. Other plugins work as usual. Last read: 11-04 09:12", emptyT: "No risks recorded for this project yet", emptyD: "Record one when something could go wrong. Risks mentioned in a brief or by the assistant are not recorded automatically.", nomatchT: "No risks match these filters", nomatchD: "Try other filters, or clear them to see all.", clearF: "Clear filters",
      partialT: "1 linked Goal can't be read", partialD: "The risks themselves show as usual.", showClosed: "{n} closed",
      nextReview: "Next review {d}", by: "Set by {who} · via Schedule", reschedule: "Reschedule", pause: "Pause", resume: "Resume", cancelReview: "Cancel review", paused: "Paused", noReview: "No review scheduled", noReviewD: "Schedule one only when it really needs following up.", addReview: "Schedule review",
      rv_when: "When", rv_3d: "In 3 days", rv_1w: "In 1 week", rv_2w: "In 2 weeks", rv_pick: "Pick a date", rv_note: "What to check (optional)", rv_ok: "Schedule", rv_hint: "When due, the assistant reads this risk and its linked material; the result goes into the brief, and you're not disturbed if nothing changed.",
      results: "Review results", assistant: "Assistant", res_quiet: "Nothing new (you weren't disturbed)", res_fail: "Review didn't finish", res_failD: "The vendor notice couldn't be read (Feed didn't respond). Not counted as “no change”; retrying 11-05.", retryNow: "Retry now",
      res_note: "Read the vendor reply, the Feed notice and the Coding session", res_change: "Changed, needs you: the vendor can only extend to 31 December", res_changeD: "The switch is about 40% short. Suggest adding to the response plan: finish the switch by 20 December.", adopt: "Add to response plan", dismiss: "Dismiss", adopted: "Added to the response plan", dismissed: "Not adopted", undo: "Undo", notified: "You were notified once, per your settings",
      stoppedT: "Review stopped", stoppedD: "This risk is closed; the 11-10 review was cancelled.",
      brief: "Brief", briefOf: "Atlas migration · {t}", briefOwner: "The brief belongs to Work Brief; only its risk section is shown here", briefRisk: "Risks", briefOther: "Goal progress, deliveries and next steps (omitted)",
      oldT: "This is the 11-01 09:00 brief", oldD: "Risks have changed since: 1 new, 1 updated.", refresh: "Refresh brief", gapT: "The risk source couldn't be read this time", gapD: "This section wasn't updated. It doesn't mean there are no risks; other sections are fine.", nextStep: "Next: ", openOverview: "Open project risks", potential: "Possible · not recorded", register: "Record as a risk", thenNow: "Then {a} · now {b}", isNew: "New",
      fromGoal: "Goals", concern: "Concern", concernText: "Retiring v2 could break sync, affecting requirement 2 “sync never stops”.", cites: "Cites risk", expand: "Expand to full page", close: "Close", reqs: "Requirements", req1: "All customers sync through the v3 API", req2: "Sync never stops during the switch", req3: "Calls to the old API drop to 0",
      t_updated: "Updated", t_saved: "Saved", t_scheduled: "Review scheduled: {d}", t_cancelled: "Review cancelled", t_paused: "Review paused", t_resumed: "Review resumed", t_sim: "Prototype: this would open “{n}”", t_recorded: "Recorded", t_adopted: "Added to the response plan", t_refreshed: "Brief refreshed", t_retry: "Prototype: would read again",
      closeHint: "Closed (stops further reviews)",
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.st) return Object.assign(clone(DEF), v); } catch (e) { /* storage unavailable: defaults */ } return clone(DEF); };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable: keep in memory */ } };
  let P = load();
  let risks = clone(D.risks);
  const freshUi = () => ({ sel: "r1", filter: { status: "active", impact: "", owner: "", goal: "" }, pop: null, editPlan: false, draft: "", newT: "", briefFresh: false, answered: "", rvWhen: "rv_1w" });
  let ui = freshUi();

  const esc = M.escapeHtml;
  const t = (k, v) => { let s = T[P.lang][k] ?? T.zh[k] ?? k; if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, b); return s; };
  const L = (o) => (o ? o[P.lang] ?? o.zh : "");
  const risk = (id) => risks.find((r) => r.id === id);
  const person = (id) => D.people[id];

  /* ---------- board parts ---------- */
  const act = (a, v, more) => ({ "data-act": a, ...(v === undefined ? {} : { "data-v": v }), ...more });
  const button = (label, o = {}) => M.renderButton({ label, variant: o.variant ?? "secondary", size: "sm", icon: o.icon, iconOnly: o.iconOnly, disabled: o.disabled, attrs: o.attrs });
  const badge = (label, tone) => M.renderBadge({ label, tone });
  const alert = (tone, title, body, actions = "") => `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status"><strong>${esc(title)}</strong>${body ? `<p>${esc(body)}</p>` : ""}${actions ? `<div class="rk-alert-actions">${actions}</div>` : ""}</div>`;
  const items = (rows) => `<ul class="mw-items">${rows.join("")}</ul>`;
  const item = (lead, title, sub, end = "", attrs = "") => `<li class="mw-item"${attrs}>${lead}<span><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${end ? `<span class="mw-item__end">${end}</span>` : ""}</li>`;
  const mark = (name) => `<span class="mw-mark">${M.icon(name)}</span>`;
  // People are round, the assistant is square (the board's collab faces).
  const who = (id) => { const p = person(id); return p.ai ? `<span class="mw-who" data-kind="ai" data-assistant role="img" aria-label="${esc(L(p))}">${M.icon("sparkles")}</span>` : `<span class="mw-who" data-kind="person" role="img" aria-label="${esc(L(p))}">${esc(L(p.ini))}</span>`; };
  const owner = (id) => `<span class="mw-owner"><span class="mw-owner__faces">${who(id)}</span><span>${esc(L(person(id)))}</span></span>`;
  const STATUS = { open: ["attention", "answer"], mitigating: ["progress", "doing"], accepted: ["hold", "paused"], closed: ["done", "done"] };
  const status = (s) => M.renderStatusMark({ label: t("s_" + s), tone: STATUS[s][0], state: STATUS[s][1] });
  const LEVEL_TONE = { high: "danger", med: "warning", low: "neutral" };
  const level = (k, l) => badge(`${t(k)} ${t(l)}`, LEVEL_TONE[l]);
  const LV = { low: 1, med: 2, high: 3 };
  const sev = (im, lk) => { const s = LV[im] + LV[lk]; return s >= 5 ? "hi" : s === 4 ? "mid" : "lo"; };
  // Component-board addition: the impact × likelihood mini grid (see README).
  const mm = (r, big) => { let h = ""; for (const im of ["high", "med", "low"]) for (const lk of ["low", "med", "high"]) h += `<i${r.impact === im && r.like === lk ? ` data-on="${sev(im, lk)}"` : ""}></i>`; return `<span class="rk-mm${big ? " rk-mm--big" : ""}" role="img" aria-label="${esc(`${t("impact")} ${t(r.impact)}, ${t("like")} ${t(r.like)}`)}">${h}</span>`; };
  const TYPE_ICON = { goal: "target", session: "code", feed: "rss", artifact: "file" };
  const linkName = (l) => (l.kind === "goal" ? L(D.goals[l.id]) : L(D.objects[l.id]));
  const linkType = (l) => (l.kind === "goal" ? "goal" : D.objects[l.id].type);
  const goneMark = (g) => M.renderStatusMark({ label: t("gone_" + g), tone: g === "noaccess" ? "hold" : "blocked", state: g === "noaccess" ? "reauth" : "unavailable" });
  const linkRow = (l, gone) => gone
    ? item(mark(gone === "noaccess" ? "lock" : "circle-alert"), gone === "deleted" ? linkName(l) : t("goneName"), t("ty_" + linkType(l)), goneMark(gone))
    : item(mark(TYPE_ICON[linkType(l)]), linkName(l), t("ty_" + linkType(l)), button(linkName(l), { variant: "ghost", icon: "external", iconOnly: true, attrs: act("peek", undefined, { "data-name": linkName(l) }) }));
  const anchored = (inner, pop) => `<span class="rk-anchor">${inner}${pop || ""}</span>`;

  /* ---------- overview A: grouped by status ---------- */
  const goneFor = (st) => (st === "partial" ? { g2: "unread" } : {});
  function filtered() {
    const f = ui.filter;
    return risks.filter((r) => (f.status === "all" || (f.status === "active" ? r.status !== "closed" : r.status === "closed"))
      && (!f.impact || r.impact === f.impact) && (!f.owner || r.owner === f.owner)
      && (!f.goal || (f.goal === "none" ? !r.links.some((l) => l.kind === "goal") : r.links.some((l) => l.kind === "goal" && l.id === f.goal))));
  }
  const select = (label, key, val, opts) => `<label class="rk-filter"><span>${esc(label)}</span><select class="mw-select" data-slot="select" data-filter="${key}">${opts.map(([v, text]) => `<option value="${v}"${v === val ? " selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  function filterBar(n) {
    const f = ui.filter;
    return `<div class="rk-filters">${M.renderToggleGroup({ label: t("f_status"), items: ["active", "all", "closed"].map((s) => ({ value: s, label: t("f_" + s), current: f.status === s, attrs: act("fstatus", s) })) })}
      ${select(t("f_impact"), "impact", f.impact, [["", t("any")], ["high", t("high")], ["med", t("med")], ["low", t("low")]])}
      ${select(t("f_owner"), "owner", f.owner, [["", t("any")], ...["me", "lin", "zhou"].map((p) => [p, L(person(p))])])}
      ${select(t("f_goal"), "goal", f.goal, [["", t("any")], ["none", t("noGoal")], ...Object.keys(D.goals).map((g) => [g, L(D.goals[g])])])}
      <span class="rk-count">${esc(t("count", { n }))}</span></div>`;
  }
  function row(r, gone = {}) {
    const goals = r.links.filter((l) => l.kind === "goal");
    const lost = goals.find((l) => gone[l.id]);
    const sub = lost ? t("gone_" + gone[lost.id]) : goals.length ? L(D.goals[goals[0].id]) + (goals.length > 1 ? ` +${goals.length - 1}` : "") : t("noGoal");
    const end = `${lost ? goneMark(gone[lost.id]) : ""}${r.review && r.status !== "closed" ? `<span class="rk-due">${M.icon("clock")}${r.review.next}</span>` : ""}${who(r.owner)}`;
    return item(`<span class="mw-mark">${mm(r)}</span>`, L(r.title), sub, end, ` role="button" tabindex="0" data-act="open" data-id="${r.id}"`);
  }
  function overviewBody() {
    const st = P.st.overview;
    if (st === "failed") return alert("danger", t("ovFailT"), t("ovFailD"), button(t("retry"), { icon: "refresh", attrs: act("retry") }));
    if (st === "empty") return M.renderEmpty({ icon: "risk", title: t("emptyT"), body: t("emptyD"), action: button(t("newRisk"), { variant: "primary", icon: "plus", attrs: act("new") }) });
    const list = filtered(), gone = goneFor(st);
    const top = `${filterBar(list.length)}${st === "partial" ? alert("warning", t("partialT"), t("partialD")) : ""}`;
    if (!list.length) return top + M.renderEmpty({ icon: "filter", title: t("nomatchT"), body: t("nomatchD"), action: button(t("clearF"), { attrs: act("clearf") }) });
    const groups = ["open", "mitigating", "accepted"].map((s) => [s, list.filter((r) => r.status === s)]).filter(([, l]) => l.length);
    const closed = list.filter((r) => r.status === "closed");
    const sections = groups.map(([s, l]) => `<section class="rk-group"><h3 class="rk-h">${status(s)}<span class="rk-count">${l.length}</span></h3>${items(l.map((r) => row(r, gone)))}</section>`).join("");
    const closedPart = closed.length ? `<details class="mw-collapsible rk-closed" data-slot="collapsible"${ui.filter.status === "closed" ? " open" : ""}><summary>${esc(t("showClosed", { n: closed.length }))}</summary><div class="mw-collapsible__body">${items(closed.map((r) => row(r, gone)))}</div></details>` : "";
    return top + sections + closedPart;
  }
  const overviewPage = () => frame(t("overview"), L(D.project), button(t("newRisk"), { variant: "primary", icon: "plus", attrs: act("new") }), overviewBody());

  /* ---------- record ---------- */
  function recCtx() {
    const st = P.area === "record" ? P.st.record : "normal";
    const id = P.area === "review" ? "r1" : st === "unlinked" ? "r2" : st === "closed" ? "r6" : st === "normal" ? ui.sel : "r1";
    return { st, r: risk(id), ro: st === "readonly" || st === "closed", gone: st === "gone" ? { s1: "deleted", f1: "noaccess" } : {}, conflict: st === "conflict" };
  }
  function statusCtl(r, c) {
    if (c.ro) return status(r.status);
    const open = ui.pop === "status";
    const menu = open ? `<div class="rk-pop">${M.renderMenu({ items: ["open", "mitigating", "accepted", "closed"].map((s) => M.renderMenuItem({ label: s === "closed" ? t("closeHint") : t("s_" + s), checked: r.status === s, attrs: act("setst", s) })).join("") })}</div>` : "";
    return anchored(`<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm rk-status-btn" data-slot="button" data-act="pop" data-v="status" aria-haspopup="menu" aria-expanded="${open}">${status(r.status)}${M.icon("chevron-down")}</button>`, menu);
  }
  const sec = (k, body, extra = "") => `<section class="rk-sec"><div class="rk-sec__head"><h3 class="rk-h">${esc(t(k))}</h3>${extra}</div>${body}</section>`;
  const prose = (text) => (text ? `<p class="rk-prose">${esc(text)}</p>` : `<p class="rk-muted">—</p>`);
  function banner(c) {
    if (c.st === "closed") return alert("info", t("closedT"), t("closedD", { who: L(person(c.r.closed.who)), when: c.r.closed.when }), button(t("reopen"), { attrs: act("toast", "t_updated") }));
    if (c.st === "readonly") return alert("warning", t("roT"), t("roD"), button(t("askAccess"), { icon: "lock", attrs: act("peek", undefined, { "data-name": t("askAccess") }) }));
    return "";
  }
  function planBlock(r, c) {
    if (c.conflict) {
      const mine = P.lang === "zh" ? "1. 本周把同步客户端切到 v3\n2. 准备回退方案：切换失败时退回 v2" : "1. Switch the sync client to v3 this week\n2. Prepare a fallback: return to v2 if the switch fails";
      return sec("plan", `${alert("warning", t("conflictT"), t("conflictD"))}<div class="rk-pair">${M.renderPreviewCard({ title: t("theirs"), body: L(r.plan) })}${M.renderPreviewCard({ title: t("yours"), body: mine })}</div><div class="rk-actions">${button(t("useTheirs"), { attrs: act("toast", "t_updated") })}${button(t("mergeMine"), { variant: "primary", attrs: act("editplan") })}</div>`);
    }
    if (ui.editPlan) return sec("plan", `${M.renderTextarea({ value: ui.draft, rows: 4, placeholder: t("planPh"), attrs: { id: "planTa", "aria-label": t("plan") } })}<div class="rk-actions">${button(t("save"), { variant: "primary", attrs: act("saveplan") })}${button(t("cancel"), { attrs: act("cancelplan") })}</div>`);
    const txt = L(r.plan);
    if (!txt) return sec("plan", `<div class="rk-line"><span class="rk-muted">${esc(t("noPlan"))}</span>${c.ro ? "" : button(t("addPlan"), { icon: "plus", attrs: act("editplan") })}</div>`);
    return sec("plan", prose(txt), c.ro ? "" : button(t("edit"), { variant: "ghost", icon: "edit", attrs: act("editplan") }));
  }
  function linksBlock(r, c) {
    const goals = r.links.filter((l) => l.kind === "goal");
    const none = goals.length ? "" : alert("info", t("noLinks"), t("standalone"), c.ro ? "" : button(t("linkGoal"), { icon: "target", attrs: act("peek", undefined, { "data-name": t("linkGoal") }) }));
    const add = c.ro || !goals.length ? "" : button(t("addLink"), { variant: "ghost", icon: "link", attrs: act("peek", undefined, { "data-name": t("linkGoal") }) });
    return sec("links", `${none}${r.links.length ? items(r.links.map((l) => linkRow(l, c.gone[l.id]))) : ""}`, add);
  }
  const LOG_ICON = { plan: "edit", review: "sparkles", status: "switch", created: "plus" };
  function logBlock(r, opts = {}) {
    const entries = r.log.filter((e) => !opts.noReview || e.kind !== "review");
    return sec("activity", `<ul class="mw-sources rk-log">${entries.map((e) => `<li class="mw-source"><span class="mw-source__icon">${M.icon(LOG_ICON[e.kind] || "dot")}</span><span><span class="mw-source__meta">${esc(`${e.when} · ${L(person(e.who))}`)}</span>${esc(L(e.text))}</span></li>`).join("")}</ul>`);
  }

  /* review section (record and review area) */
  const reviewMode = () => (P.area === "review" ? P.st.review : "normal");
  function reviewPop() {
    if (ui.pop !== "review") return "";
    const when = M.renderToggleGroup({ label: t("rv_when"), items: ["rv_3d", "rv_1w", "rv_2w", "rv_pick"].map((k) => ({ value: k, label: t(k), current: ui.rvWhen === k, attrs: act("rvwhen", k) })) });
    return M.renderPopover({ preview: true, className: "rk-pop rk-pop--form", body: `<span class="rk-label">${esc(t("rv_when"))}</span>${when}${M.renderInput({ placeholder: t("rv_note"), attrs: { "aria-label": t("rv_note") } })}<p class="rk-muted">${esc(t("rv_hint"))}</p><div class="rk-actions">${button(t("rv_ok"), { variant: "primary", attrs: act("rvok") })}${button(t("cancel"), { attrs: act("pop", "") })}</div>` });
  }
  function reviewCard(r, c, compact) {
    const m = reviewMode();
    if (m === "stopped" || r.status === "closed") return alert("info", t("stoppedT"), m === "stopped" ? t("stoppedD") : t("closedD", { who: L(person(r.closed?.who || "me")), when: r.closed?.when || "" }));
    const rv = m === "none" ? null : r.review;
    if (!rv) return items([item(mark("clock"), t("noReview"), t("noReviewD"), c.ro ? "" : anchored(button(t("addReview"), { icon: "plus", attrs: act("pop", "review") }), reviewPop()))]);
    const isPaused = m === "paused" || rv.paused;
    const head = items([item(mark("clock"), t("nextReview", { d: rv.next }), compact ? "" : `${L(rv.note)} · ${t("by", { who: L(person(rv.by)) })}`, isPaused ? M.renderStatusMark({ label: t("paused"), tone: "hold", state: "paused" }) : "")]);
    if (compact || c.ro) return head;
    return `${head}<div class="rk-actions">${anchored(button(t("reschedule"), { attrs: act("pop", "review") }), reviewPop())}${isPaused ? button(t("resume"), { icon: "play", attrs: act("rvresume") }) : button(t("pause"), { icon: "pause", attrs: act("rvpause") })}${button(t("cancelReview"), { variant: "ghost", attrs: act("rvcancel") })}</div>`;
  }
  const quietEntry = (when, text) => `<li class="mw-source"><span class="mw-source__icon">${M.icon("sparkles")}</span><span><span class="mw-source__meta">${esc(`${when} · ${t("assistant")}`)}</span>${esc(text)}</span></li>`;
  // The board's "AI 带来的东西" card: a reply you can click, folded into one line once answered.
  function broughtChange() {
    const done = ui.answered;
    return `<article class="mw-brought"${done ? " data-answered" : ""}><p class="mw-brought__by">${who("ai")}<b>${esc(t("assistant"))}</b><span>11-04 09:00</span></p><div class="mw-brought__card"><p class="mw-brought__note">${M.icon("history")}${esc(t("res_note"))}</p><div class="mw-brought__fold"><div><div class="mw-brought__body"><h4>${esc(t("res_change"))}</h4><p>${esc(t("res_changeD"))}</p></div><div class="mw-brought__answers">${button(t("adopt"), { variant: "primary", attrs: act("answer", "adopted") })}${button(t("dismiss"), { attrs: act("answer", "dismissed") })}</div></div></div>${done ? `<p class="mw-brought__result">${M.icon("check")}<span>${esc(t(done))}</span>${button(t("undo"), { variant: "ghost", attrs: act("answer", "") })}</p>` : ""}</div></article><p class="rk-muted rk-note">${M.icon("bell")}${esc(t("notified"))}</p>`;
  }
  function results() {
    const m = reviewMode();
    const latest = m === "changed" ? broughtChange() : m === "failed" ? alert("danger", t("res_fail"), t("res_failD"), button(t("retryNow"), { icon: "refresh", attrs: act("retry") })) : "";
    const list = `<ul class="mw-sources rk-log">${m === "quiet" ? quietEntry("11-04 09:00", t("res_quiet")) : ""}${quietEntry("11-01 09:00", L(risk("r1").log[1].text))}</ul>`;
    return `<h4 class="rk-sub">${esc(t("results"))}</h4>${latest}${list}`;
  }
  function reviewBlock(r, c, compact) {
    const showRes = r.id === "r1" && P.area === "review" && !["none", "stopped"].includes(reviewMode());
    return sec("review", `${reviewCard(r, c, compact)}${showRes ? results() : ""}`);
  }

  /* record B: two columns, facts on the right */
  const backLink = () => M.renderButton({ label: t("back"), variant: "link", size: "sm", icon: "chevron-left", attrs: act("area", "overview") });
  const frame = (title, description, action, panel, className = "") => M.renderFrame({ title, description, action, panel, className: `rk-frame ${className}` });
  function factsCard(r, c) {
    return M.renderCard({ title: t("facts"), className: "rk-facts", body: `<dl class="rk-dl"><dt>${esc(t("status"))}</dt><dd>${statusCtl(r, c)}</dd><dt>${esc(t("impact"))} × ${esc(t("like"))}</dt><dd class="rk-mmrow">${mm(r, true)}<span>${level("impact", r.impact)}${level("like", r.like)}</span></dd><dt>${esc(t("owner"))}</dt><dd>${owner(r.owner)}</dd></dl>` });
  }
  function recordB(c) {
    const r = c.r;
    const main = `${banner(c)}${sec("desc", prose(L(r.desc)))}${planBlock(r, c)}${logBlock(r)}`;
    const side = `${factsCard(r, c)}${linksBlock(r, c)}${reviewBlock(r, c)}`;
    return `<div class="rk-back">${backLink()}</div>${frame(L(r.title), `${t("plugin")} · ${L(D.project)} · ${t("updated", { t: r.updated })}`, "", `<div class="rk-two"><div class="rk-col">${main}</div><aside class="rk-col rk-side">${side}</aside></div>`)}`;
  }
  /* record C: opens in the side panel beside the Goal it came from */
  function recordCompact(c) {
    const r = c.r;
    const head = `<div class="rk-chead">${statusCtl(r, c)}${mm(r)}<span class="rk-muted">${esc(t("updated", { t: r.updated }))}</span></div><div class="rk-kv">${level("impact", r.impact)}${level("like", r.like)}${owner(r.owner)}</div>`;
    return `${banner(c)}${head}${sec("desc", prose(L(r.desc)))}${planBlock(r, c)}${linksBlock(r, c)}${reviewBlock(r, c, true)}${logBlock(r)}`;
  }
  function goalContext() {
    const r1 = risk("r1");
    const reqs = `<ol class="rk-reqs"><li>${esc(t("req1"))}</li><li>${esc(t("req2"))}</li><li>${esc(t("req3"))}</li></ol>`;
    const concern = `<p class="rk-prose">${esc(t("concernText"))}</p><div class="rk-line"><span class="rk-muted">${esc(t("cites"))}</span>${M.renderButton({ label: L(r1.title), variant: "link", size: "sm", icon: "risk", attrs: act("peekrisk") })}</div>`;
    return frame(L(D.goals.g1), `${t("fromGoal")} · ${L(D.project)}`, "", `${sec("reqs", reqs)}${sec("concern", concern)}`, "rk-dim");
  }
  function recordPage() {
    const c = recCtx();
    if (c.st === "failed") return frame(t("plugin"), L(D.project), "", alert("danger", t("failT"), t("failD"), `${button(t("retry"), { icon: "refresh", attrs: act("retry") })}${backLink()}`));
    if (c.st === "new") return newForm();
    if (P.open === "B") return recordB(c);
    const tools = `${button(t("expand"), { variant: "ghost", icon: "maximize", iconOnly: true, attrs: act("expand") })}${button(t("close"), { variant: "ghost", icon: "x", iconOnly: true, attrs: act("area", "overview") })}`;
    return `<div class="rk-peek"><div class="proto-sheet mw-layout-primitives rk-peek__main">${goalContext()}</div><aside class="proto-sheet mw-layout-primitives rk-peek__side">${frame(L(c.r.title), t("plugin"), tools, recordCompact(c), "rk-frame--side")}</aside></div>`;
  }
  function newForm() {
    const levels = (k) => `<div class="mw-field" data-slot="field"><span class="mw-field__label">${esc(t(k))}</span>${M.renderToggleGroup({ label: t(k), items: ["high", "med", "low"].map((l) => ({ value: l, label: t(l), current: l === "med" })) })}</div>`;
    const field = (label, control, hint) => `<label class="mw-field" data-slot="field"><span class="mw-field__label">${esc(label)}${hint ? `<small>${esc(hint)}</small>` : ""}</span>${control}</label>`;
    const body = `<div class="rk-form">${field(t("titleL"), M.renderInput({ value: ui.newT, placeholder: t("titlePh"), attrs: { id: "newT" } }))}
      <div class="rk-form__row">${levels("impact")}${levels("like")}${field(t("owner"), M.renderSelect ? `<select class="mw-select" data-slot="select">${["me", "lin", "zhou"].map((p) => `<option>${esc(L(person(p)))}</option>`).join("")}</select>` : "")}</div>
      ${field(t("desc"), M.renderTextarea({ rows: 3, placeholder: t("descPh") }))}
      ${field(t("plan"), M.renderTextarea({ rows: 3, placeholder: t("planPh") }), t("optional"))}
      ${sec("links", alert("info", t("noLinks"), t("standalone"), button(t("linkGoal"), { icon: "target", attrs: act("peek", undefined, { "data-name": t("linkGoal") }) })))}
      <div class="rk-actions rk-actions--end">${button(t("cancel"), { attrs: act("area", "overview") })}${button(t("record"), { variant: "primary", disabled: !ui.newT.trim(), attrs: act("donew") })}</div></div>`;
    return `<div class="rk-back">${backLink()}</div>${frame(t("newRisk"), L(D.project), "", body)}`;
  }

  /* ---------- review A: the record's review section, with the brief's risk section beside it ---------- */
  function reviewMain() {
    const c = recCtx(), r = c.r;
    const head = `<div class="rk-kv">${statusCtl(r, c)}${level("impact", r.impact)}${level("like", r.like)}${owner(r.owner)}</div>`;
    return frame(L(r.title), `${t("plugin")} · ${L(D.project)} · ${t("updated", { t: r.updated })}`, "", `${head}${reviewBlock(r, c)}${planBlock(r, c)}${logBlock(r, { noReview: true })}`);
  }
  function briefPane() {
    const m = P.st.review, old = m === "briefold" && !ui.briefFresh;
    const list = old ? D.brief.oldItems : D.brief.items;
    let body;
    if (m === "briefgap") body = alert("danger", t("gapT"), t("gapD"), button(t("retry"), { icon: "refresh", attrs: act("retry") }));
    else {
      body = `<ul class="rk-brief">${list.map((it) => {
        const r = risk(it.risk);
        let change = L(it.change), tags = it.isNew ? badge(t("isNew"), "info") : "";
        if (it.risk === "r1" && !old && m === "changed") { change = t("res_changeD"); tags += badge(t("res_change").split(/[：:]/)[0], "warning"); }
        if (it.risk === "r1" && !old && m === "failed") { tags += badge(t("res_fail"), "danger"); change = `${L(D.brief.oldItems[0].change)} ${t("res_failD")}`; }
        const thenNow = old && it.risk === "r1" ? `<p class="rk-muted">${esc(t("thenNow", { a: t("s_open"), b: t("s_" + r.status) }))}</p>` : "";
        return `<li><div class="rk-line">${M.renderButton({ label: L(r.title), variant: "link", size: "sm", icon: "risk", attrs: act("open", undefined, { "data-id": r.id }) })}${tags}</div><p class="rk-prose">${esc(change)}</p><p class="rk-muted"><b>${esc(t("nextStep"))}</b>${esc(L(it.next))}</p>${thenNow}</li>`;
      }).join("")}</ul>`;
      if (!old) body += `<div class="rk-potential"><div class="rk-line">${badge(t("potential"), "neutral")}<span class="rk-muted">${M.icon("code")}${esc(L(D.objects[D.brief.potential.src]))}</span></div><p class="rk-prose">${esc(L(D.brief.potential.text))}</p>${button(t("register"), { icon: "plus", attrs: act("new") })}</div>`;
    }
    const top = old ? alert("warning", t("oldT"), t("oldD"), button(t("refresh"), { icon: "refresh", attrs: act("refresh") })) : "";
    const when = old ? D.brief.old.when : D.brief.now.when;
    return frame(t("brief"), t("briefOf", { t: when }), "", `<p class="rk-muted">${esc(t("briefOwner"))}</p>${top}${sec("briefRisk", body, M.renderButton({ label: t("openOverview"), variant: "link", size: "sm", attrs: act("area", "overview") }))}<p class="rk-muted rk-stub">${esc(t("briefOther"))}</p>`, "rk-frame--side");
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const options = STATES[P.area].map((k) => `<option value="${k}"${P.st[P.area] === k ? " selected" : ""}>${esc(t(`st_${P.area}_${k}`))}</option>`).join("");
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${badge(t("chosen"), "success")}
      <span class="proto-field">${esc(t("area"))}${tg(t("area"), "area", ["overview", "record", "review"].map((a) => [a, t("a_" + a)]))}</span>
      ${P.area === "record" ? `<span class="proto-field">${esc(t("openAs"))}${tg(t("openAs"), "open", [["B", t("openB")], ["C", t("openC")]])}</span>` : ""}
      <label>${esc(t("state"))}<select class="mw-select" data-slot="select" id="state">${options}</select></label>
      <span class="proto-field">${esc(t("lang"))}${tg(t("lang"), "lang", [["zh", "中文"], ["en", "English"]])}</span>
      <span class="proto-field">${esc(t("theme"))}${tg(t("theme"), "theme", [["light", t("light")], ["dark", t("dark")]])}</span>
      ${button(t("reset"), { variant: "ghost", icon: "undo", attrs: { id: "reset" } })}`;
  }
  function render() {
    const root = document.documentElement;
    root.lang = P.lang === "zh" ? "zh-CN" : "en";
    root.dataset.theme = P.theme;
    root.dataset.resolvedTheme = P.theme;
    renderStrip();
    let page;
    if (P.area === "overview") page = `<div class="proto-sheet mw-layout-primitives">${overviewPage()}</div>`;
    else if (P.area === "record") page = P.open === "C" && !["failed", "new"].includes(P.st.record) ? recordPage() : `<div class="proto-sheet mw-layout-primitives rk-wide">${recordPage()}</div>`;
    else page = `<div class="rk-peek"><div class="proto-sheet mw-layout-primitives rk-peek__main">${reviewMain()}</div><aside class="proto-sheet mw-layout-primitives rk-peek__side">${briefPane()}</aside></div>`;
    document.getElementById("app").innerHTML = page;
    const ta = document.getElementById("planTa"); if (ta) ta.addEventListener("input", (e) => { ui.draft = e.target.value; });
    const nt = document.getElementById("newT"); if (nt) nt.addEventListener("input", (e) => { ui.newT = e.target.value; const b = document.querySelector('[data-act="donew"]'); if (b) b.disabled = !ui.newT.trim(); });
  }
  let timer;
  const toast = (message, tone) => { const box = document.getElementById("toasts"); box.innerHTML = M.renderToast({ message, tone }); clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 2400); };
  function presetOverview(st) { ui.filter = { status: st === "closed" ? "all" : "active", impact: st === "nomatch" ? "low" : "", owner: st === "nomatch" ? "zhou" : "", goal: st === "unlinked" ? "none" : "" }; }
  function logEntry(r, kind, text) { r.log.unshift({ when: `${D.today} ${new Date().toTimeString().slice(0, 5)}`, who: "me", kind, text }); r.updated = D.today; }
  const cur = () => recCtx().r;

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],#reset");
    if (!b) { if (ui.pop && !e.target.closest(".rk-pop")) { ui.pop = null; render(); } return; }
    if (b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); risks = clone(D.risks); ui = freshUi(); persist(); return render(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; ui.pop = null; ui.editPlan = false; if (b.dataset.set === "area" && b.dataset.v === "overview") presetOverview(P.st.overview); persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "pop": ui.pop = ui.pop === v ? null : v || null; break;
      case "open": ui.sel = b.dataset.id; P.area = "record"; P.st.record = "normal"; ui.pop = null; ui.editPlan = false; persist(); break;
      case "area": P.area = v; ui.pop = null; ui.editPlan = false; if (v === "overview") { P.st.overview = "normal"; presetOverview("normal"); } persist(); break;
      case "new": P.area = "record"; P.st.record = "new"; ui.newT = ""; persist(); break;
      case "donew": { const id = "n" + Date.now(); risks.unshift({ id, impact: "med", like: "med", status: "open", owner: "me", updated: D.today, title: { zh: ui.newT, en: ui.newT }, desc: { zh: "", en: "" }, plan: { zh: "", en: "" }, links: [], review: null, log: [{ when: D.today, who: "me", kind: "created", text: { zh: "记下这条风险", en: "Recorded this risk" } }] }); ui.sel = id; P.st.record = "normal"; persist(); render(); return toast(t("t_recorded"), "success"); }
      case "setst": { const r = cur(), from = r.status; r.status = v; if (v === "closed") { r.closed = { when: D.today, who: "me" }; r.review = null; } logEntry(r, "status", { zh: `状态 ${T.zh["s_" + from]} → ${T.zh["s_" + v]}`, en: `Status ${T.en["s_" + from]} → ${T.en["s_" + v]}` }); ui.pop = null; render(); return toast(t("t_updated"), "success"); }
      case "editplan": ui.editPlan = true; ui.draft = L(cur().plan); break;
      case "cancelplan": ui.editPlan = false; break;
      case "saveplan": { const r = cur(); r.plan = { zh: ui.draft, en: ui.draft }; logEntry(r, "plan", { zh: "改了处置办法", en: "Edited the response plan" }); ui.editPlan = false; if (P.st.record === "conflict") P.st.record = "normal"; render(); return toast(t("t_saved"), "success"); }
      case "rvwhen": ui.rvWhen = v; break;
      case "rvok": { const r = cur(), d = "11-11"; r.review = Object.assign({ note: { zh: "", en: "" }, by: "me" }, r.review || {}, { next: d, paused: false }); if (P.area === "review" && P.st.review === "none") P.st.review = "normal"; ui.pop = null; persist(); render(); return toast(t("t_scheduled", { d }), "success"); }
      case "rvpause": cur().review.paused = true; if (P.area === "review") P.st.review = "paused"; render(); return toast(t("t_paused"));
      case "rvresume": cur().review.paused = false; if (P.area === "review") P.st.review = "normal"; render(); return toast(t("t_resumed"));
      case "rvcancel": cur().review = null; if (P.area === "review") P.st.review = "none"; render(); return toast(t("t_cancelled"));
      case "answer": { ui.answered = v; if (v === "adopted") { const r = risk("r1"); r.plan = { zh: `${D.risks[0].plan.zh}\n3. 12 月 20 日前完成切换`, en: `${D.risks[0].plan.en}\n3. Finish the switch by 20 December` }; } else if (!v) risk("r1").plan = clone(D.risks[0].plan); render(); return v === "adopted" ? toast(t("t_adopted"), "success") : undefined; }
      case "refresh": ui.briefFresh = true; render(); return toast(t("t_refreshed"), "success");
      case "fstatus": ui.filter.status = v; break;
      case "clearf": ui.filter = { status: "active", impact: "", owner: "", goal: "" }; if (["nomatch", "unlinked"].includes(P.st.overview)) P.st.overview = "normal"; persist(); break;
      case "peek": return toast(t("t_sim", { n: b.dataset.name }));
      case "peekrisk": P.open = "C"; P.st.record = "normal"; ui.sel = "r1"; persist(); break;
      case "expand": P.open = "B"; persist(); break;
      case "retry": return toast(t("t_retry"));
      case "toast": return toast(t(v), "success");
      default: return;
    }
    render();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".mw-item[role=button]")) { e.preventDefault(); e.target.click(); }
    if (e.key === "Escape" && ui.pop) { ui.pop = null; render(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "state") { P.st[P.area] = e.target.value; if (P.area === "overview") presetOverview(e.target.value); if (P.area === "review") { risks = clone(D.risks); ui.briefFresh = false; ui.answered = ""; } ui.pop = null; ui.editPlan = false; persist(); return render(); }
    const f = e.target.dataset.filter;
    if (f) { ui.filter[f] = e.target.value; render(); }
  });

  presetOverview(P.st.overview);
  render();
})();
