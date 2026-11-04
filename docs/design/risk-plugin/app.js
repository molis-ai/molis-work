// Risk plugin prototype (batch 17): risk record, project overview, review. Standalone review prototype, not product code.
(() => {
  const D = window.RISK_DATA;
  const KEY = "molis-proto.risk-plugin.v1";
  const DEF = { area: "overview", scheme: { record: "A", overview: "A", review: "A" }, st: { record: "normal", overview: "normal", review: "normal" }, lang: "zh", theme: "light" };
  const STATES = {
    record: ["normal", "unlinked", "new", "gone", "conflict", "closed", "readonly", "failed"],
    overview: ["normal", "unlinked", "closed", "nomatch", "partial", "empty", "failed"],
    review: ["normal", "none", "changed", "quiet", "failed", "paused", "stopped", "briefold", "briefgap"],
  };
  const T = {
    zh: {
      protoTitle: "风险插件定样 · 原型", area: "区域", scheme: "方案", state: "状态", lang: "语言", theme: "主题", light: "浅", dark: "深", reset: "重置",
      a_record: "风险记录", a_overview: "总览", a_review: "复查",
      st_record_normal: "正常", st_record_unlinked: "没关联 Goal", st_record_new: "记一条新风险", st_record_gone: "关联对象已删除或无权查看", st_record_conflict: "保存时别人刚改过", st_record_closed: "已关闭", st_record_readonly: "只能查看", st_record_failed: "读不到这条风险",
      st_overview_normal: "正常", st_overview_unlinked: "只看没关联 Goal 的", st_overview_closed: "含已关闭", st_overview_nomatch: "筛选没有结果", st_overview_partial: "部分关联读不到", st_overview_empty: "还没有风险", st_overview_failed: "读取失败",
      st_review_normal: "已安排，上次无事", st_review_none: "没安排复查", st_review_changed: "到期：有变化要你定", st_review_quiet: "到期：没有变化", st_review_failed: "到期：复查没完成", st_review_paused: "已暂停", st_review_stopped: "风险关闭，复查停止", st_review_briefold: "简报是旧版本", st_review_briefgap: "简报：风险来源读不到",
      sc_record_A: "整页文档", sd_record_A: "一栏从上读到下：标题与状态、四项要点、说明、处置、关联、复查、进展。各段分开装在容器里。",
      sc_record_B: "两栏 · 要点在右", sd_record_B: "左边读说明、处置与进展；右边一块要点面板：状态、影响 × 可能性小格、负责人、关联、复查。和 03 定的「主人领头」一致。",
      sc_record_C: "侧栏打开", sd_record_C: "从 Goal、会话、简报里点开时在右侧打开，不离开原来的页面；需要时展开成整页（展开后是方案 A 或 B 的样子）。",
      sc_overview_A: "按状态分组", sd_overview_A: "上面一行筛选，下面按 打开 / 缓解中 / 已接受 分组；已关闭默认收起。",
      sc_overview_B: "影响 × 可能性 + 列表", sd_overview_B: "左边 3 × 3 小格看分布，点一格就筛出那一格；右边按严重程度排的列表。",
      sc_overview_C: "按 Goal 分组 + 右侧详情", sd_overview_C: "左边按关联的 Goal 分组，「没关联 Goal」单独一组放最前；右边直接看选中那条。",
      sc_review_A: "详情里的复查段", sd_review_A: "复查是风险详情里单独的一段：下次时间、要看什么、改期 / 暂停 / 取消，下面是历次结果。右边是简报里的风险段。",
      sc_review_B: "复查进时间线", sd_review_B: "下次复查钉在进展时间线顶上；每次结果作为时间线里的一条，和改状态、改处置排在一起。右边是简报里的风险段。",
      sc_review_C: "总览里的复查清单", sd_review_C: "总览多一个「复查」视图，所有风险的复查按 要你看 / 已安排 / 最近完成 排；详情里只留一行下次时间。右边是简报里的风险段。",
      plugin: "风险", overview: "项目风险", s_open: "打开", s_mitigating: "缓解中", s_accepted: "已接受", s_closed: "已关闭",
      impact: "影响", like: "可能性", high: "高", med: "中", low: "低", owner: "负责人", status: "状态", desc: "说明", plan: "处置办法", links: "关联", review: "复查", activity: "进展", updated: "更新于",
      edit: "编辑", save: "保存", cancel: "取消", back: "项目风险", newRisk: "记一条风险", record: "记下", titlePh: "一句话说清楚可能出什么事", descPh: "为什么会发生、会影响什么", planPh: "打算怎么处理（可以以后再写）",
      f_active: "未关闭", f_all: "全部", f_closed: "已关闭", f_impact: "影响", f_owner: "负责人", f_goal: "关联 Goal", any: "全部", noGoal: "没关联 Goal", count: "{n} 条",
      noPlan: "还没写处置办法", addPlan: "写处置办法", noLinks: "还没关联 Goal", linkGoal: "关联 Goal", addLink: "关联", standalone: "风险可以不关联 Goal，单独记着。",
      gone_deleted: "已删除", gone_noaccess: "无权查看", gone_unread: "读不到",
      conflictT: "林夏 11-03 14:20 刚改过处置办法，你的修改没有保存。", theirs: "现在的版本", yours: "你的草稿", useTheirs: "用现在的版本", mergeMine: "在现在的版本上接着改",
      closedT: "{who} {when} 关闭了这条风险。关闭后不再复查。", reopen: "重新打开", roT: "你只能查看：修改这个项目的风险要有授权。", askAccess: "去设置里看授权",
      failT: "读不到这条风险", failD: "风险插件这次没有响应。这条风险还在，只是现在看不到。", retry: "重试", lastOk: "上次读到：{t}",
      ovFailT: "读不到这个项目的风险", ovFailD: "这不代表没有风险。其他插件照常可用。", emptyT: "这个项目还没有记下风险", emptyD: "想到可能出问题的事就记一条。简报或助理提到的风险不会自动登记。", nomatchT: "没有符合筛选的风险", clearF: "清除筛选",
      partialT: "有 1 个关联的 Goal 读不到，风险本身照常显示。", showClosed: "已关闭 {n} 条", hideClosed: "收起已关闭",
      nextReview: "下次复查", by: "{who} 安排 · 经日程", reschedule: "改期", pause: "暂停", resume: "恢复", cancelReview: "取消复查", paused: "已暂停", noReview: "没有安排复查", noReviewD: "确实需要跟进时再安排；不填也可以。", addReview: "安排复查",
      rv_when: "什么时候", rv_3d: "3 天后", rv_1w: "1 周后", rv_2w: "2 周后", rv_pick: "选日期", rv_note: "到时候看什么（可不填）", rv_ok: "安排", rv_hint: "到期由助理读这条风险和关联的资料，结果并进简报；没有变化就不打扰你。",
      results: "复查结果", res_quiet: "没有新变化（没有打扰你）", res_fail: "复查没完成", res_failD: "供应商公告读不到（Feed 没响应）。没有当成「没有变化」，11-05 再试。", res_change: "有变化，要你定",
      res_changeD: "供应商回复：只能延到 12 月 31 日。切换还差约 40%。", res_suggest: "建议在处置办法里加上：12 月 20 日前完成切换。", adopt: "加进处置办法", dismiss: "不采纳", notified: "已按你的通知设置提醒过一次",
      stoppedT: "这条风险已关闭，11-10 的复查已取消。", retryNow: "现在重试",
      rvTab: "复查", rkTab: "风险", rvNeed: "要你看", rvPlanned: "已安排", rvDone: "最近完成",
      brief: "简报", briefOf: "Atlas 迁移 · {t}", briefOwner: "简报由 Work Brief 管；这里只放风险这一段", briefRisk: "风险", briefOther: "目标进展、交付和下一步（略）",
      oldBanner: "这是 {t} 的简报。之后风险有变化：1 条新登记，1 条更新。", refresh: "刷新简报", gapT: "风险来源这次读不到，这一段没有更新。", gapD: "不代表没有风险；其他段照常。", nextStep: "下一步", openOverview: "打开项目风险", potential: "潜在 · 未登记", register: "登记为风险", thenNow: "当时 {a} · 现在 {b}", isNew: "新",
      fromGoal: "Goals", concern: "顾虑", concernText: "v2 停用可能让同步中断，影响要求 2「同步不中断」。", cites: "引用风险", expand: "展开成整页", reqs: "要求", req1: "所有客户的数据同步到 v3 接口", req2: "切换期间同步不中断", req3: "旧接口调用量降到 0",
      t_updated: "已更新", t_saved: "已保存", t_scheduled: "已安排复查：{d}", t_cancelled: "已取消复查", t_paused: "复查已暂停", t_resumed: "复查已恢复", t_sim: "原型：这里会打开「{n}」", t_recorded: "已记下", t_adopted: "已加进处置办法", t_refreshed: "简报已刷新",
      closeHint: "关闭后停止后续复查", noEdit: "你没有修改的授权",
    },
    en: {
      protoTitle: "Risk plugin samples · prototype", area: "Area", scheme: "Option", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      a_record: "Risk record", a_overview: "Overview", a_review: "Review",
      st_record_normal: "Normal", st_record_unlinked: "Not linked to a Goal", st_record_new: "Record a new risk", st_record_gone: "Linked item deleted or no access", st_record_conflict: "Someone just changed it", st_record_closed: "Closed", st_record_readonly: "View only", st_record_failed: "Can't read this risk",
      st_overview_normal: "Normal", st_overview_unlinked: "Only risks with no Goal", st_overview_closed: "Including closed", st_overview_nomatch: "Filter finds nothing", st_overview_partial: "Some links unreadable", st_overview_empty: "No risks yet", st_overview_failed: "Read failed",
      st_review_normal: "Scheduled, last one quiet", st_review_none: "No review scheduled", st_review_changed: "Due: a change needs you", st_review_quiet: "Due: nothing changed", st_review_failed: "Due: review didn't finish", st_review_paused: "Paused", st_review_stopped: "Risk closed, review stopped", st_review_briefold: "Brief is an old version", st_review_briefgap: "Brief: risk source unreadable",
      sc_record_A: "Single document", sd_record_A: "Read top to bottom: title and status, four key facts, description, response, links, review, activity. Each part in its own container.",
      sc_record_B: "Two columns · facts on the right", sd_record_B: "Description, response and activity on the left; a facts panel on the right: status, impact × likelihood grid, owner, links, review. Matches the owner-led form chosen in batch 03.",
      sc_record_C: "Opens in the side panel", sd_record_C: "Opened from a Goal, session or brief, it slides in on the right without leaving that page; expand to a full page (option A or B) when needed.",
      sc_overview_A: "Grouped by status", sd_overview_A: "Filters on top; groups for Open / Mitigating / Accepted below; Closed folded by default.",
      sc_overview_B: "Impact × likelihood + list", sd_overview_B: "A 3 × 3 grid on the left shows the spread; click a cell to filter to it. The list on the right is sorted by severity.",
      sc_overview_C: "Grouped by Goal + detail", sd_overview_C: "Grouped by linked Goal, with “No Goal” first as its own group; the selected risk shows on the right.",
      sc_review_A: "Review section in the record", sd_review_A: "Review is its own section of the record: next date, what to check, reschedule / pause / cancel, then past results. The brief's risk section is on the right.",
      sc_review_B: "Reviews in the timeline", sd_review_B: "The next review is pinned at the top of the activity timeline; each result is a timeline entry next to status and response changes. The brief's risk section is on the right.",
      sc_review_C: "Review list in the overview", sd_review_C: "The overview gains a “Reviews” view listing every risk's reviews as Needs you / Scheduled / Recently done; the record keeps one line for the next date. The brief's risk section is on the right.",
      plugin: "Risks", overview: "Project risks", s_open: "Open", s_mitigating: "Mitigating", s_accepted: "Accepted", s_closed: "Closed",
      impact: "Impact", like: "Likelihood", high: "High", med: "Medium", low: "Low", owner: "Owner", status: "Status", desc: "Description", plan: "Response plan", links: "Linked to", review: "Review", activity: "Activity", updated: "Updated",
      edit: "Edit", save: "Save", cancel: "Cancel", back: "Project risks", newRisk: "Record a risk", record: "Record", titlePh: "In one sentence, what could go wrong", descPh: "Why it might happen and what it affects", planPh: "How you plan to handle it (can come later)",
      f_active: "Not closed", f_all: "All", f_closed: "Closed", f_impact: "Impact", f_owner: "Owner", f_goal: "Linked Goal", any: "Any", noGoal: "No Goal", count: "{n}",
      noPlan: "No response plan yet", addPlan: "Write a response plan", noLinks: "Not linked to a Goal yet", linkGoal: "Link a Goal", addLink: "Link", standalone: "A risk can stand on its own without a Goal.",
      gone_deleted: "Deleted", gone_noaccess: "No access", gone_unread: "Can't read",
      conflictT: "Lin Xia changed the response plan at 11-03 14:20. Your edit was not saved.", theirs: "Current version", yours: "Your draft", useTheirs: "Keep the current version", mergeMine: "Continue editing on the current version",
      closedT: "{who} closed this risk on {when}. Closed risks are not reviewed.", reopen: "Reopen", roT: "View only: changing this project's risks needs permission.", askAccess: "See permissions in Settings",
      failT: "Can't read this risk", failD: "The risk plugin didn't respond. The risk is still there; it just can't be shown now.", retry: "Retry", lastOk: "Last read: {t}",
      ovFailT: "Can't read this project's risks", ovFailD: "This doesn't mean there are no risks. Other plugins work as usual.", emptyT: "No risks recorded for this project yet", emptyD: "Record one when something could go wrong. Risks mentioned in a brief or by the assistant are not recorded automatically.", nomatchT: "No risks match these filters", clearF: "Clear filters",
      partialT: "1 linked Goal can't be read; the risks themselves show as usual.", showClosed: "{n} closed", hideClosed: "Hide closed",
      nextReview: "Next review", by: "Set by {who} · via Schedule", reschedule: "Reschedule", pause: "Pause", resume: "Resume", cancelReview: "Cancel review", paused: "Paused", noReview: "No review scheduled", noReviewD: "Schedule one only when it really needs following up.", addReview: "Schedule review",
      rv_when: "When", rv_3d: "In 3 days", rv_1w: "In 1 week", rv_2w: "In 2 weeks", rv_pick: "Pick a date", rv_note: "What to check (optional)", rv_ok: "Schedule", rv_hint: "When due, the assistant reads this risk and its linked material; the result goes into the brief, and you're not disturbed if nothing changed.",
      results: "Review results", res_quiet: "Nothing new (you weren't disturbed)", res_fail: "Review didn't finish", res_failD: "The vendor notice couldn't be read (Feed didn't respond). Not counted as “no change”; retrying 11-05.", res_change: "Changed; needs you",
      res_changeD: "Vendor replied: they can only extend to 31 December. The switch is about 40% short.", res_suggest: "Suggest adding to the response plan: finish the switch by 20 December.", adopt: "Add to response plan", dismiss: "Dismiss", notified: "You were notified once, per your settings",
      stoppedT: "This risk is closed; the 11-10 review was cancelled.", retryNow: "Retry now",
      rvTab: "Reviews", rkTab: "Risks", rvNeed: "Needs you", rvPlanned: "Scheduled", rvDone: "Recently done",
      brief: "Brief", briefOf: "Atlas migration · {t}", briefOwner: "The brief belongs to Work Brief; only its risk section is shown here", briefRisk: "Risks", briefOther: "Goal progress, deliveries and next steps (omitted)",
      oldBanner: "This is the {t} brief. Risks have changed since: 1 new, 1 updated.", refresh: "Refresh brief", gapT: "The risk source couldn't be read this time; this section wasn't updated.", gapD: "This doesn't mean there are no risks; other sections are fine.", nextStep: "Next", openOverview: "Open project risks", potential: "Possible · not recorded", register: "Record as a risk", thenNow: "Then {a} · now {b}", isNew: "New",
      fromGoal: "Goals", concern: "Concern", concernText: "Retiring v2 could break sync, affecting requirement 2 “sync never stops”.", cites: "Cites risk", expand: "Expand to full page", reqs: "Requirements", req1: "All customers sync through the v3 API", req2: "Sync never stops during the switch", req3: "Calls to the old API drop to 0",
      t_updated: "Updated", t_saved: "Saved", t_scheduled: "Review scheduled: {d}", t_cancelled: "Review cancelled", t_paused: "Review paused", t_resumed: "Review resumed", t_sim: "Prototype: this would open “{n}”", t_recorded: "Recorded", t_adopted: "Added to the response plan", t_refreshed: "Brief refreshed",
      closeHint: "Closing stops further reviews", noEdit: "You don't have permission to edit",
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.scheme && v.st) return Object.assign(clone(DEF), v); } catch (e) { /* storage unavailable: defaults */ } return clone(DEF); };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable: keep in memory */ } };
  let P = load();
  let risks = clone(D.risks);
  const freshUi = () => ({ sel: "r1", filter: { status: "active", impact: "", owner: "", goal: "", cell: "" }, pop: null, editPlan: false, draft: "", newT: "", rvTab: "rk", briefFresh: false, adopted: false, showClosed: false });
  let ui = freshUi();

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const t = (k, v) => { let s = (T[P.lang][k] ?? T.zh[k] ?? k); if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, b); return s; };
  const L = (o) => (o ? (o[P.lang] ?? o.zh) : "");
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"/></svg>`;
  const risk = (id) => risks.find((r) => r.id === id);
  const who = (id) => D.people[id];
  const LV = { low: 1, med: 2, high: 3 };
  const sev = (r) => { const s = LV[r.impact] + LV[r.like]; return s >= 5 ? "hi" : s === 4 ? "mid" : "lo"; };
  const av = (id) => { const p = who(id); return `<span class="av ${p.ai ? "ai" : ""}" title="${esc(L(p))}">${esc(L(p.ini))}</span>`; };
  const stTag = (s) => `<span class="st st-${s}"><i></i>${t("s_" + s)}</span>`;
  const lvTag = (k, l) => `<span class="lv lv-${l}">${t(k)} <b>${t(l)}</b></span>`;
  const lvOnly = (l) => `<span class="lv lv-${l}"><b>${t(l)}</b></span>`;
  const mm = (r, big) => { let h = ""; for (const im of ["high", "med", "low"]) for (const lk of ["low", "med", "high"]) { const on = r.impact === im && r.like === lk; h += `<i class="${on ? "on " + sev(r) : ""}"></i>`; } return `<span class="mm ${big ? "big" : ""}" title="${t("impact")} ${t(r.impact)} · ${t("like")} ${t(r.like)}" aria-label="${t("impact")} ${t(r.impact)}, ${t("like")} ${t(r.like)}">${h}</span>`; };
  const TYPE_IC = { goal: "target", session: "code", feed: "inbox", artifact: "file", risk: "alert" };
  const linkName = (l) => (l.kind === "goal" ? L(D.goals[l.id]) : L(D.objects[l.id]));
  const linkType = (l) => (l.kind === "goal" ? "goal" : D.objects[l.id].type);
  const chip = (l, gone) => {
    if (gone) return `<span class="chip gone ${gone}" title="${t("gone_" + gone)}">${ic(gone === "noaccess" ? "lock" : gone === "deleted" ? "trash" : "circle-alert", "sm")}<span class="nm">${gone === "noaccess" || gone === "unread" ? t("gone_" + gone) : esc(linkName(l))}</span>${gone === "deleted" ? `<small>${t("gone_deleted")}</small>` : ""}</span>`;
    return `<button type="button" class="chip" data-act="peek" data-name="${esc(linkName(l))}">${ic(TYPE_IC[linkType(l)], "sm")}<span class="nm">${esc(linkName(l))}</span></button>`;
  };
  const riskChip = (r) => `<button type="button" class="chip rchip" data-act="open" data-id="${r.id}"><span class="sd ${sev(r)}"></span><span class="nm">${esc(L(r.title))}</span></button>`;

  /* ---------- overview ---------- */
  const goneFor = (st) => (st === "partial" ? { g2: "unread" } : {});
  function filtered() {
    const f = ui.filter;
    return risks.filter((r) => (f.status === "all" || (f.status === "active" ? r.status !== "closed" : r.status === "closed"))
      && (!f.impact || r.impact === f.impact) && (!f.owner || r.owner === f.owner)
      && (!f.goal || (f.goal === "none" ? !r.links.some((l) => l.kind === "goal") : r.links.some((l) => l.kind === "goal" && l.id === f.goal)))
      && (!f.cell || `${r.impact}|${r.like}` === f.cell));
  }
  const sel = (name, val, opts) => `<label class="fsel"><span>${t(name)}</span><select data-filter="${name}">${opts.map(([v, lab]) => `<option value="${v}" ${v === val ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select></label>`;
  function filterBar(n) {
    const f = ui.filter;
    return `<div class="fbar">
      <span class="seg" role="group">${["active", "all", "closed"].map((s) => `<button type="button" data-act="fstatus" data-v="${s}" aria-pressed="${f.status === s}">${t("f_" + s)}</button>`).join("")}</span>
      ${sel("f_impact", f.impact, [["", t("any")], ["high", t("high")], ["med", t("med")], ["low", t("low")]])}
      ${sel("f_owner", f.owner, [["", t("any")], ...["me", "lin", "zhou"].map((p) => [p, L(who(p))])])}
      ${sel("f_goal", f.goal, [["", t("any")], ["none", t("noGoal")], ...Object.keys(D.goals).map((g) => [g, L(D.goals[g])])])}
      <span class="fact cnt">${t("count", { n })}</span>
    </div>`;
  }
  function row(r, opts = {}) {
    const goals = r.links.filter((l) => l.kind === "goal");
    const gone = opts.gone || {};
    const g = goals.find((l) => gone[l.id]) || goals[0];
    const gchip = g ? chip(g, gone[g.id]) + (goals.length > 1 ? `<span class="more">+${goals.length - 1}</span>` : "") : `<span class="nog">${t("noGoal")}</span>`;
    return `<div class="rrow ${r.status === "closed" ? "isclosed" : ""}" role="button" tabindex="0" data-act="${opts.inline ? "pick" : "open"}" data-id="${r.id}" ${opts.inline && ui.sel === r.id ? 'aria-selected="true"' : ""}>
      ${stTag(r.status)}${mm(r)}
      <strong class="rt">${esc(L(r.title))}</strong>
      <span class="rg">${gchip}</span>
      ${r.review && r.status !== "closed" ? `<span class="rv fact">${ic("clock", "sm")}${r.review.next}</span>` : `<span class="rv"></span>`}
      ${av(r.owner)}
    </div>`;
  }
  function ovState(body) {
    const st = P.st.overview;
    if (st === "failed") return `<div class="blank err">${ic("circle-alert")}<h3>${t("ovFailT")}</h3><p>${t("ovFailD")}</p><div class="acts"><button class="btn sec sm" data-act="toast" data-msg="retry">${ic("refresh", "sm")}${t("retry")}</button><span class="fact">${t("lastOk", { t: "11-04 09:12" })}</span></div></div>`;
    if (st === "empty") return `<div class="blank">${ic("alert")}<h3>${t("emptyT")}</h3><p>${t("emptyD")}</p><div class="acts"><button class="btn primary sm" data-act="new">${ic("plus", "sm")}${t("newRisk")}</button></div></div>`;
    return body;
  }
  function ovList(list, gone, inline) {
    if (!list.length) return `<div class="blank sm"><h3>${t("nomatchT")}</h3><div class="acts"><button class="btn sec sm" data-act="clearf">${t("clearF")}</button></div></div>`;
    return list.map((r) => row(r, { gone, inline })).join("");
  }
  function overviewA() {
    const list = filtered(); const gone = goneFor(P.st.overview);
    if (!list.length) return ovList(list);
    const groups = ["open", "mitigating", "accepted", "closed"].map((s) => [s, list.filter((r) => r.status === s)]).filter(([, l]) => l.length);
    return groups.map(([s, l]) => `<section class="grp"><h4>${stTag(s)}<span class="fact">${l.length}</span></h4><div class="box flush">${l.map((r) => row(r, { gone })).join("")}</div></section>`).join("");
  }
  function matrix() {
    const all = risks.filter((r) => ui.filter.status === "all" || (ui.filter.status === "active" ? r.status !== "closed" : r.status === "closed"));
    let h = `<div class="mx"><span class="ax y">${t("impact")}</span><div class="cells">`;
    for (const im of ["high", "med", "low"]) {
      h += `<span class="tick">${t(im)}</span>`;
      for (const lk of ["low", "med", "high"]) {
        const n = all.filter((r) => r.impact === im && r.like === lk).length; const key = `${im}|${lk}`; const s = LV[im] + LV[lk];
        h += `<button type="button" class="cell ${s >= 5 ? "hi" : s === 4 ? "mid" : "lo"} ${n ? "has" : ""}" data-act="cell" data-v="${key}" aria-pressed="${ui.filter.cell === key}" aria-label="${t("impact")} ${t(im)} · ${t("like")} ${t(lk)}: ${n}">${n || ""}</button>`;
      }
    }
    h += `<span></span>${["low", "med", "high"].map((l) => `<span class="tick x">${t(l)}</span>`).join("")}`;
    return h + `</div><span class="ax x">${t("like")}</span></div>`;
  }
  function overviewB() {
    const list = filtered().sort((a, b) => LV[b.impact] + LV[b.like] - (LV[a.impact] + LV[a.like]));
    return `<div class="ovb"><aside>${matrix()}${ui.filter.cell ? `<button class="btn ghost sm" data-act="cell" data-v="${ui.filter.cell}">${ic("x", "sm")}${t("clearF")}</button>` : ""}</aside><div class="box flush">${ovList(list, goneFor(P.st.overview))}</div></div>`;
  }
  function overviewC() {
    const list = filtered(); const gone = goneFor(P.st.overview);
    if (!ui.filter.status || !list.find((r) => r.id === ui.sel)) ui.sel = list[0]?.id || ui.sel;
    const groups = [["none", list.filter((r) => !r.links.some((l) => l.kind === "goal"))], ...Object.keys(D.goals).map((g) => [g, list.filter((r) => r.links.some((l) => l.kind === "goal" && l.id === g))])].filter(([, l]) => l.length);
    const left = list.length ? groups.map(([g, l]) => `<section class="grp"><h4>${g === "none" ? `<span class="nog strong">${t("noGoal")}</span>` : gone[g] ? chip({ kind: "goal", id: g }, gone[g]) : `<span class="gname">${ic("target", "sm")}${esc(L(D.goals[g]))}</span>`}<span class="fact">${l.length}</span></h4><div class="box flush">${l.map((r) => row(r, { gone, inline: true })).join("")}</div></section>`).join("") : ovList(list);
    const r = risk(ui.sel);
    return `<div class="ovc"><div class="lcol">${left}</div><div class="rcol">${list.length && r ? recordCompact(r, {}) : ""}</div></div>`;
  }
  function overviewPane() {
    const sc = P.scheme.overview; const st = P.st.overview; const n = filtered().length;
    const body = sc === "A" ? overviewA() : sc === "B" ? overviewB() : overviewC();
    const showBar = st !== "failed" && st !== "empty";
    return paneHead(t("overview"), `<button class="btn primary sm" data-act="new">${ic("plus", "sm")}${t("newRisk")}</button>`)
      + `<div class="pbody ov ov-${sc}">${showBar ? filterBar(n) : ""}${st === "partial" ? `<div class="note warn">${ic("circle-alert", "sm")}${t("partialT")}</div>` : ""}${ovState(body)}</div>`;
  }

  /* ---------- record ---------- */
  function recCtx() {
    const st = P.st.record;
    const id = st === "unlinked" ? "r2" : st === "closed" ? "r6" : (st === "normal" ? ui.sel : "r1");
    return { st, r: risk(id), ro: st === "readonly" || st === "closed", gone: st === "gone" ? { s1: "deleted", f1: "noaccess" } : {}, conflict: st === "conflict" };
  }
  const popWrap = (inner, pop) => `<span class="popwrap">${inner}${pop || ""}</span>`;
  function statusCtl(r, c) {
    if (c.ro) return stTag(r.status);
    const open = ui.pop === "status";
    const pop = open ? `<div class="pop" role="menu">${["open", "mitigating", "accepted", "closed"].map((s) => `<button type="button" role="menuitemradio" aria-checked="${r.status === s}" data-act="setst" data-v="${s}">${stTag(s)}${s === "closed" ? `<small>${t("closeHint")}</small>` : ""}${r.status === s ? ic("check", "sm") : ""}</button>`).join("")}</div>` : "";
    return popWrap(`<button type="button" class="stbtn" data-act="pop" data-v="status" aria-expanded="${open}">${stTag(r.status)}${ic("chevron-down", "sm")}</button>`, pop);
  }
  const secH = (k, extra = "") => `<h3 class="sh">${t(k)}${extra}</h3>`;
  function planBlock(r, c) {
    if (c.conflict) return `<div class="box">${secH("plan")}<div class="note warn">${ic("circle-alert", "sm")}${t("conflictT")}</div><div class="cmp"><div><span class="fact">${t("theirs")}</span><p class="pre">${esc(L(r.plan))}</p></div><div><span class="fact">${t("yours")}</span><p class="pre mine">${esc(P.lang === "zh" ? "1. 本周把同步客户端切到 v3\n2. 准备回退方案：切换失败时退回 v2" : "1. Switch the sync client to v3 this week\n2. Prepare a fallback: return to v2 if the switch fails")}</p></div></div><div class="acts"><button class="btn sec sm" data-act="toast" data-msg="t_updated">${t("useTheirs")}</button><button class="btn primary sm" data-act="editplan">${t("mergeMine")}</button></div></div>`;
    if (ui.editPlan) return `<div class="box">${secH("plan")}<textarea class="ta" id="planTa" rows="4" placeholder="${t("planPh")}">${esc(ui.draft)}</textarea><div class="acts"><button class="btn primary sm" data-act="saveplan">${t("save")}</button><button class="btn sec sm" data-act="cancelplan">${t("cancel")}</button></div></div>`;
    const txt = L(r.plan);
    const edit = c.ro ? "" : `<button class="btn ghost sm" data-act="editplan">${ic("edit", "sm")}${t("edit")}</button>`;
    return `<div class="box">${secH("plan", txt ? edit : "")}${txt ? `<p class="pre">${esc(txt)}</p>` : `<div class="empty-line"><span class="fact">${t("noPlan")}</span>${c.ro ? "" : `<button class="btn sec sm" data-act="editplan">${ic("plus", "sm")}${t("addPlan")}</button>`}</div>`}</div>`;
  }
  function linksBlock(r, c) {
    const goals = r.links.filter((l) => l.kind === "goal");
    const add = c.ro ? "" : `<button class="btn ghost sm" data-act="toast" data-msg="t_sim" data-name="${t("linkGoal")}">${ic("link", "sm")}${t("addLink")}</button>`;
    const nog = goals.length ? "" : `<div class="note info">${ic("info", "sm")}<span>${t("noLinks")} · ${t("standalone")}</span>${c.ro ? "" : `<button class="btn sec sm" data-act="toast" data-msg="t_sim" data-name="${t("linkGoal")}">${ic("target", "sm")}${t("linkGoal")}</button>`}</div>`;
    return `<div class="box">${secH("links", add)}${nog}<div class="chips">${r.links.map((l) => chip(l, c.gone[l.id])).join("")}</div></div>`;
  }
  const descBlock = (r) => `<div class="box">${secH("desc")}${L(r.desc) ? `<p>${esc(L(r.desc))}</p>` : `<span class="fact">—</span>`}</div>`;
  function logBlock(r, opts = {}) {
    const items = r.log.filter((e) => !opts.noReview || e.kind !== "review");
    return `<div class="box">${secH("activity")}${opts.pinned || ""}<ol class="tl">${opts.extra || ""}${items.map((e) => `<li class="k-${e.kind}">${av(e.who)}<div><span class="fact">${e.when} · ${esc(L(who(e.who)))}</span><p>${esc(L(e.text))}</p></div></li>`).join("")}</ol></div>`;
  }
  function factStrip(r, c) {
    return `<div class="facts4"><div><span class="fact">${t("status")}</span>${statusCtl(r, c)}</div><div><span class="fact">${t("impact")}</span>${lvOnly(r.impact)}</div><div><span class="fact">${t("like")}</span>${lvOnly(r.like)}</div><div><span class="fact">${t("owner")}</span><span class="ow">${av(r.owner)}${esc(L(who(r.owner)))}</span></div></div>`;
  }
  function banner(c) {
    if (P.st.record === "closed") return `<div class="note">${ic("check", "sm")}<span>${t("closedT", { who: L(who(c.r.closed.who)), when: c.r.closed.when })}</span><button class="btn sec sm" data-act="toast" data-msg="t_updated">${t("reopen")}</button></div>`;
    if (P.st.record === "readonly") return `<div class="note">${ic("lock", "sm")}<span>${t("roT")}</span><button class="btn sec sm" data-act="toast" data-msg="t_sim" data-name="${t("askAccess")}">${t("askAccess")}</button></div>`;
    return "";
  }

  /* review pieces (shared by record and review area) */
  function reviewMode() { return P.area === "review" ? P.st.review : "normal"; }
  function reviewCard(r, c, compact) {
    const m = reviewMode();
    if (m === "stopped" || r.status === "closed") return `<div class="rvc muted">${ic("check", "sm")}<span>${m === "stopped" ? t("stoppedT") : t("closedT", { who: L(who(r.closed?.who || "me")), when: r.closed?.when || "" })}</span></div>`;
    const rv = m === "none" ? null : r.review;
    const open = ui.pop === "review";
    const pop = open ? `<div class="pop rvpop"><span class="fact">${t("rv_when")}</span><div class="seg wide">${["rv_3d", "rv_1w", "rv_2w", "rv_pick"].map((k, i) => `<button type="button" data-act="rvpick" data-v="${k}" aria-pressed="${i === 1}">${t(k)}</button>`).join("")}</div><input class="in" placeholder="${t("rv_note")}"><p class="fact">${t("rv_hint")}</p><div class="acts"><button class="btn primary sm" data-act="rvok">${t("rv_ok")}</button><button class="btn sec sm" data-act="pop" data-v="">${t("cancel")}</button></div></div>` : "";
    if (!rv) return `<div class="rvc empty"><div>${ic("clock", "sm")}<b>${t("noReview")}</b></div><span class="fact">${t("noReviewD")}</span>${c.ro ? "" : popWrap(`<button class="btn sec sm" data-act="pop" data-v="review">${ic("plus", "sm")}${t("addReview")}</button>`, pop)}</div>`;
    const isPaused = m === "paused" || rv.paused;
    const btns = c.ro ? "" : `<div class="acts">${popWrap(`<button class="btn sec sm" data-act="pop" data-v="review">${t("reschedule")}</button>`, pop)}${isPaused ? `<button class="btn sec sm" data-act="rvresume">${ic("play", "sm")}${t("resume")}</button>` : `<button class="btn sec sm" data-act="rvpause">${ic("pause", "sm")}${t("pause")}</button>`}<button class="btn ghost sm" data-act="rvcancel">${t("cancelReview")}</button></div>`;
    return `<div class="rvc ${isPaused ? "paused" : ""}"><div class="rvh">${ic("clock", "sm")}<b>${t("nextReview")} ${rv.next}</b>${isPaused ? `<span class="tag">${t("paused")}</span>` : ""}</div>${compact ? "" : `<p class="fact">${esc(L(rv.note))} · ${t("by", { who: L(who(rv.by)) })}</p>`}${compact ? "" : btns}</div>`;
  }
  function resultItem(kind) {
    if (kind === "changed") return `<div class="res need">${av("ai")}<div><span class="fact">11-04 09:00 · ${t("res_change")}</span><p>${t("res_changeD")}</p>${ui.adopted ? `<p class="fact">${ic("check", "sm")}${t("t_adopted")}</p>` : `<div class="sug">${ic("sparkles", "sm")}<span>${t("res_suggest")}</span></div><div class="acts"><button class="btn primary sm" data-act="adopt">${t("adopt")}</button><button class="btn sec sm" data-act="toast" data-msg="t_updated">${t("dismiss")}</button></div>`}<p class="fact">${ic("info", "sm")}${t("notified")}</p></div></div>`;
    if (kind === "failed") return `<div class="res fail">${av("ai")}<div><span class="fact">11-04 09:00 · ${t("res_fail")}</span><p>${t("res_failD")}</p><div class="acts"><button class="btn sec sm" data-act="toast" data-msg="retry">${ic("refresh", "sm")}${t("retryNow")}</button></div></div></div>`;
    if (kind === "quiet") return `<div class="res quiet">${av("ai")}<div><span class="fact">11-04 09:00</span><p>${t("res_quiet")}</p></div></div>`;
    return "";
  }
  function currentResults() {
    const m = reviewMode();
    const latest = m === "changed" ? resultItem("changed") : m === "failed" ? resultItem("failed") : m === "quiet" ? resultItem("quiet") : "";
    const old = `<div class="res quiet">${av("ai")}<div><span class="fact">11-01 09:00</span><p>${esc(L(risk("r1").log[1].text))}</p></div></div>`;
    return latest + old;
  }
  function reviewBlock(r, c) {
    const showRes = r.id === "r1" && P.area === "review" && reviewMode() !== "none";
    return `<div class="box">${secH("review")}${reviewCard(r, c)}${showRes ? `<h4 class="sub">${t("results")}</h4><div class="ress">${currentResults()}</div>` : ""}</div>`;
  }

  function newForm() {
    return `<div class="doc"><button class="link back" data-act="area" data-v="overview">${ic("chevron-left", "sm")}${t("back")}</button>
      <input class="in big" id="newT" placeholder="${t("titlePh")}" value="${esc(ui.newT)}">
      <div class="facts4 form"><div><span class="fact">${t("status")}</span>${stTag("open")}</div>
      ${["impact", "like"].map((k) => `<div><span class="fact">${t(k)}</span><span class="seg">${["high", "med", "low"].map((l) => `<button type="button" aria-pressed="${l === "med"}">${t(l)}</button>`).join("")}</span></div>`).join("")}
      <div><span class="fact">${t("owner")}</span><select class="in"><option>${L(who("me"))}</option><option>${L(who("lin"))}</option><option>${L(who("zhou"))}</option></select></div></div>
      <div class="box">${secH("desc")}<textarea class="ta" rows="3" placeholder="${t("descPh")}"></textarea></div>
      <div class="box">${secH("plan")}<textarea class="ta" rows="3" placeholder="${t("planPh")}"></textarea></div>
      <div class="box">${secH("links")}<div class="note info">${ic("info", "sm")}<span>${t("standalone")}</span><button class="btn sec sm" data-act="toast" data-msg="t_sim" data-name="${t("linkGoal")}">${ic("target", "sm")}${t("linkGoal")}</button></div></div>
      <div class="acts end"><button class="btn sec" data-act="area" data-v="overview">${t("cancel")}</button><button class="btn primary" data-act="donew" ${ui.newT.trim() ? "" : "disabled"}>${t("record")}</button></div></div>`;
  }
  const failBlock = () => `<div class="blank err">${ic("circle-alert")}<h3>${t("failT")}</h3><p>${t("failD")}</p><div class="acts"><button class="btn sec sm" data-act="toast" data-msg="retry">${ic("refresh", "sm")}${t("retry")}</button><button class="btn ghost sm" data-act="area" data-v="overview">${t("back")}</button></div></div>`;
  const titleRow = (r) => `<h1 class="rtitle">${esc(L(r.title))}</h1><p class="fact">${t("updated")} ${r.updated}</p>`;
  function recordA(c) {
    const r = c.r;
    return `<div class="doc"><button class="link back" data-act="area" data-v="overview">${ic("chevron-left", "sm")}${t("back")}</button>${titleRow(r)}${banner(c)}${factStrip(r, c)}${descBlock(r)}${planBlock(r, c)}${linksBlock(r, c)}${reviewBlock(r, c)}${logBlock(r)}</div>`;
  }
  function factsPanel(r, c) {
    return `<aside class="fpanel"><div class="frow"><span class="fact">${t("status")}</span>${statusCtl(r, c)}</div>
      <div class="frow col"><span class="fact">${t("impact")} × ${t("like")}</span><div class="mmrow">${mm(r, true)}<div>${lvTag("impact", r.impact)}${lvTag("like", r.like)}</div></div></div>
      <div class="frow"><span class="fact">${t("owner")}</span><span class="ow">${av(r.owner)}${esc(L(who(r.owner)))}</span></div>
      ${linksBlock(r, c)}${reviewBlock(r, c)}</aside>`;
  }
  function recordB(c) {
    const r = c.r;
    return `<div class="twocol"><div class="main"><button class="link back" data-act="area" data-v="overview">${ic("chevron-left", "sm")}${t("back")}</button>${titleRow(r)}${banner(c)}${descBlock(r)}${planBlock(r, c)}${logBlock(r)}</div>${factsPanel(r, c)}</div>`;
  }
  function recordCompact(r, c) {
    c = Object.assign({ ro: false, gone: {} }, c);
    return `<div class="compact"><div class="chead">${statusCtl(r, c)}${mm(r)}<span class="fact">${t("updated")} ${r.updated}</span></div><h2 class="rtitle sm">${esc(L(r.title))}</h2>
      <div class="kv"><span>${lvTag("impact", r.impact)}${lvTag("like", r.like)}</span><span class="ow">${av(r.owner)}${esc(L(who(r.owner)))}</span></div>
      ${descBlock(r)}${planBlock(r, c)}${linksBlock(r, c)}<div class="box">${secH("review")}${reviewCard(r, c, true)}</div></div>`;
  }
  function goalContext() {
    const r1 = risk("r1");
    return paneHead(L(D.goals.g1), "", "target", t("fromGoal"), "goals") + `<div class="pbody dim"><div class="doc"><div class="box">${secH("reqs")}<ol class="reqs"><li>${t("req1")}</li><li>${t("req2")}</li><li>${t("req3")}</li></ol></div><div class="box">${secH("concern")}<div class="concern"><p>${t("concernText")}</p><span class="fact">${t("cites")}</span> ${riskChip(r1)}</div></div></div></div>`;
  }
  function recordPane() {
    const c = recCtx(); const sc = P.scheme.record;
    if (sc === "C") {
      const side = c.st === "failed" ? failBlock() : c.st === "new" ? newForm() : `${banner(c)}${recordCompactFull(c)}`;
      return { main: goalContext(), side: paneHead(t("plugin"), `<button class="btn ghost sm icon" title="${t("expand")}" data-act="toast" data-msg="t_sim" data-name="${t("expand")}">${ic("maximize", "sm")}</button><button class="btn ghost sm icon" title="${t("cancel")}" data-act="area" data-v="overview">${ic("x", "sm")}</button>`) + `<div class="pbody">${side}</div>` };
    }
    const body = c.st === "failed" ? failBlock() : c.st === "new" ? newForm() : sc === "A" ? recordA(c) : recordB(c);
    return { main: paneHead(c.st === "new" ? t("newRisk") : t("plugin"), "") + `<div class="pbody">${body}</div>` };
  }
  const recordCompactFull = (c) => recordCompact(c.r, c) + logBlock(c.r);

  /* ---------- review area ---------- */
  function briefPane() {
    const m = P.st.review; const old = m === "briefold" && !ui.briefFresh;
    const items = old ? D.brief.oldItems : D.brief.items;
    const when = old ? D.brief.old.when : D.brief.now.when;
    let sect;
    if (m === "briefgap") sect = `<div class="note err">${ic("circle-alert", "sm")}<div><b>${t("gapT")}</b><p class="fact">${t("gapD")}</p></div></div>`;
    else {
      sect = items.map((it) => {
        const r = risk(it.risk);
        let change = L(it.change); let tags = it.isNew ? `<span class="tag out">${t("isNew")}</span>` : "";
        if (it.risk === "r1" && !old) {
          if (m === "changed") { change = t("res_changeD"); tags += `<span class="tag warn">${t("res_change")}</span>`; }
          if (m === "failed") { tags += `<span class="tag err">${t("res_fail")}</span>`; change = L(D.brief.oldItems[0].change) + " " + t("res_failD"); }
        }
        const thenNow = old && it.risk === "r1" ? `<span class="fact">${t("thenNow", { a: t("s_open"), b: t("s_" + r.status) })}</span>` : "";
        return `<div class="bitem"><div class="bh">${riskChip(r)}${tags}</div><p>${esc(change)}</p><p class="fact"><b>${t("nextStep")}</b> ${esc(L(it.next))}</p>${thenNow}</div>`;
      }).join("");
      if (!old) sect += `<div class="bitem pot"><div class="bh"><span class="tag sim">${t("potential")}</span>${chip({ kind: "obj", id: D.brief.potential.src })}</div><p>${esc(L(D.brief.potential.text))}</p><div class="acts"><button class="btn sec sm" data-act="new">${ic("plus", "sm")}${t("register")}</button></div></div>`;
    }
    const top = old ? `<div class="note warn">${ic("history", "sm")}<span>${t("oldBanner", { t: D.brief.old.when })}</span><button class="btn sec sm" data-act="refresh">${ic("refresh", "sm")}${t("refresh")}</button></div>` : "";
    return paneHead(t("brief"), "", "note", t("briefOf", { t: when }), "brief") + `<div class="pbody"><p class="fact owner-note">${t("briefOwner")}</p>${top}<div class="box">${secH("briefRisk", `<button class="link sm" data-act="area" data-v="overview">${t("openOverview")}</button>`)}${sect}</div><div class="box stub"><span class="fact">${t("briefOther")}</span></div></div>`;
  }
  function reviewMain() {
    const sc = P.scheme.review; const r = risk("r1"); const c = { ro: false, gone: {} };
    if (sc === "A") return paneHead(t("plugin"), "") + `<div class="pbody"><div class="doc"><h1 class="rtitle">${esc(L(r.title))}</h1><div class="kv">${statusCtl(r, c)}${lvTag("impact", r.impact)}${lvTag("like", r.like)}<span class="ow">${av(r.owner)}${esc(L(who(r.owner)))}</span></div>${reviewBlock(r, c)}${planBlock(r, c)}${logBlock(r, { noReview: true })}</div></div>`;
    if (sc === "B") {
      const m = P.st.review;
      const pinned = `<div class="pinrv">${reviewCard(r, c)}</div>`;
      const latest = m === "changed" ? `<li class="k-review hl">${resultItem("changed")}</li>` : m === "failed" ? `<li class="k-review hl">${resultItem("failed")}</li>` : m === "quiet" ? `<li class="k-review q">${resultItem("quiet")}</li>` : "";
      return paneHead(t("plugin"), "") + `<div class="pbody"><div class="doc"><h1 class="rtitle">${esc(L(r.title))}</h1><div class="kv">${statusCtl(r, c)}${lvTag("impact", r.impact)}${lvTag("like", r.like)}<span class="ow">${av(r.owner)}${esc(L(who(r.owner)))}</span></div>${planBlock(r, c)}${logBlock(r, { pinned, extra: latest })}</div></div>`;
    }
    // C: overview with a Reviews view
    const m = P.st.review;
    const r4 = risk("r4");
    const need = m === "changed" ? `<div class="rvrow">${riskChip(r)}${resultItem("changed")}</div>` : m === "failed" ? `<div class="rvrow">${riskChip(r)}${resultItem("failed")}</div>` : "";
    const plannedList = [r4, r].filter((x) => x.review && !(x.id === "r1" && (m === "none" || m === "stopped")));
    const planned = plannedList.map((x) => `<div class="rrow rvl">${stTag(x.status)}<strong class="rt">${esc(L(x.title))}</strong><span class="rv fact">${ic("clock", "sm")}${x.review.next}${x.id === "r1" && m === "paused" ? ` · ${t("paused")}` : ""}</span>${av(x.review.by)}<button class="btn ghost sm" data-act="open" data-id="${x.id}">${t("reschedule")}</button></div>`).join("");
    const done = `<div class="rvrow">${riskChip(r)}${m === "quiet" ? resultItem("quiet") : ""}<div class="res quiet">${av("ai")}<div><span class="fact">11-01 09:00</span><p>${esc(L(r.log[1].text))}</p></div></div></div>`;
    return paneHead(t("overview"), "") + `<div class="pbody"><div class="tabs2"><button type="button" aria-pressed="false" data-act="area" data-v="overview">${t("rkTab")}</button><button type="button" aria-pressed="true">${t("rvTab")}</button></div>
      ${need ? `<section class="grp"><h4>${t("rvNeed")}</h4><div class="box">${need}</div></section>` : ""}
      ${m === "stopped" ? `<div class="note">${ic("check", "sm")}${t("stoppedT")}</div>` : ""}
      <section class="grp"><h4>${t("rvPlanned")}<span class="fact">${plannedList.length}</span></h4><div class="box flush">${planned}</div></section>
      <section class="grp"><h4>${t("rvDone")}</h4><div class="box">${done}</div></section></div>`;
  }

  /* ---------- shell ---------- */
  function paneHead(title, right, icon = "alert", sub, hue = "risk") {
    return `<header class="phd"><span class="own h-${hue}">${ic(icon, "sm")}</span><b>${esc(title)}</b><span class="fact">${esc(sub || L(D.project))}</span><span class="grow"></span>${right}</header>`;
  }
  function render() {
    document.documentElement.lang = P.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = P.theme;
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll("#area button").forEach((b) => { b.textContent = t("a_" + b.dataset.area); b.setAttribute("aria-pressed", P.area === b.dataset.area); });
    document.querySelectorAll("#scheme button").forEach((b) => b.setAttribute("aria-pressed", P.scheme[P.area] === b.dataset.scheme));
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", P.lang === b.dataset.lang));
    document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", P.theme === b.dataset.themeSet));
    const s = document.getElementById("state");
    s.innerHTML = STATES[P.area].map((k) => `<option value="${k}" ${P.st[P.area] === k ? "selected" : ""}>${t(`st_${P.area}_${k}`)}</option>`).join("");
    const sc = P.scheme[P.area];
    let panes;
    if (P.area === "overview") panes = { main: overviewPane() };
    else if (P.area === "record") panes = recordPane();
    else panes = { main: reviewMain(), side: briefPane() };
    document.getElementById("app").innerHTML = `<div class="schemenote"><span class="tag sim">${t("scheme")} ${sc}</span><b>${t(`sc_${P.area}_${sc}`)}</b><span>${t(`sd_${P.area}_${sc}`)}</span></div>
      <div class="ws ${panes.side ? "two" : ""} ${P.area === "record" && sc === "C" ? "peek" : ""}"><section class="pane main">${panes.main}</section>${panes.side ? `<aside class="pane side">${panes.side}</aside>` : ""}</div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
    const ta = document.getElementById("planTa"); if (ta) ta.addEventListener("input", (e) => { ui.draft = e.target.value; });
    const nt = document.getElementById("newT"); if (nt) nt.addEventListener("input", (e) => { ui.newT = e.target.value; const b = document.querySelector('[data-act="donew"]'); if (b) b.disabled = !ui.newT.trim(); });
  }
  let toastTimer;
  function toast(msg) { const el = document.getElementById("toast"); if (!el) return; el.textContent = msg; el.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("on"), 2400); }
  function presetOverview(st) {
    ui.filter = { status: st === "closed" ? "all" : "active", impact: st === "nomatch" ? "low" : "", owner: st === "nomatch" ? "zhou" : "", goal: st === "unlinked" ? "none" : "", cell: "" };
    ui.showClosed = st === "closed";
  }
  function logEntry(r, kind, text) { r.log.unshift({ when: `${D.today} ${new Date().toTimeString().slice(0, 5)}`, who: "me", kind, text }); r.updated = D.today; }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-area],[data-scheme],[data-lang],[data-theme-set],#reset");
    if (!b) { if (ui.pop && !e.target.closest(".pop")) { ui.pop = null; render(); } return; }
    if (b.disabled) return;
    if (b.dataset.area) { P.area = b.dataset.area; ui.pop = null; persist(); return render(); }
    if (b.dataset.scheme) { P.scheme[P.area] = b.dataset.scheme; ui.pop = null; persist(); return render(); }
    if (b.dataset.lang) { P.lang = b.dataset.lang; persist(); return render(); }
    if (b.dataset.themeSet) { P.theme = b.dataset.themeSet; persist(); return render(); }
    if (b.id === "reset") { P = clone(DEF); risks = clone(D.risks); ui = freshUi(); persist(); return render(); }
    const a = b.dataset.act; const v = b.dataset.v;
    const c = P.area === "record" ? recCtx() : null;
    const cur = () => (P.area === "record" ? c.r : P.area === "overview" ? risk(ui.sel) : risk("r1"));
    switch (a) {
      case "pop": ui.pop = ui.pop === v ? null : (v || null); break;
      case "open": ui.sel = b.dataset.id; P.area = "record"; P.st.record = "normal"; ui.pop = null; ui.editPlan = false; persist(); break;
      case "pick": ui.sel = b.dataset.id; break;
      case "area": P.area = v; ui.pop = null; ui.editPlan = false; if (v === "overview") { P.st.overview = "normal"; presetOverview("normal"); } persist(); break;
      case "new": P.area = "record"; P.st.record = "new"; ui.newT = ""; persist(); break;
      case "donew": { const id = "n" + Date.now(); risks.unshift({ id, impact: "med", like: "med", status: "open", owner: "me", updated: D.today, title: { zh: ui.newT, en: ui.newT }, desc: { zh: "", en: "" }, plan: { zh: "", en: "" }, links: [], review: null, log: [{ when: D.today, who: "me", kind: "created", text: { zh: "记下这条风险", en: "Recorded this risk" } }] }); ui.sel = id; P.st.record = "normal"; persist(); render(); return toast(t("t_recorded")); }
      case "setst": { const r = cur(); const from = r.status; r.status = v; if (v === "closed") { r.closed = { when: D.today, who: "me" }; if (r.review) r.review = null; } logEntry(r, "status", { zh: `状态 ${T.zh["s_" + from]} → ${T.zh["s_" + v]}`, en: `Status ${T.en["s_" + from]} → ${T.en["s_" + v]}` }); ui.pop = null; render(); return toast(t("t_updated")); }
      case "editplan": ui.editPlan = true; ui.draft = L(cur().plan); break;
      case "cancelplan": ui.editPlan = false; break;
      case "saveplan": { const r = cur(); r.plan = { zh: ui.draft, en: ui.draft }; logEntry(r, "plan", { zh: "改了处置办法", en: "Edited the response plan" }); ui.editPlan = false; if (P.st.record === "conflict") P.st.record = "normal"; render(); return toast(t("t_saved")); }
      case "rvpick": b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); return;
      case "rvok": { const r = cur(); const d = P.lang === "zh" ? "11-11" : "11-11"; r.review = Object.assign({ note: { zh: "", en: "" }, by: "me" }, r.review || {}, { next: d, paused: false }); if (P.area === "review" && P.st.review === "none") P.st.review = "normal"; ui.pop = null; persist(); render(); return toast(t("t_scheduled", { d })); }
      case "rvpause": cur().review.paused = true; if (P.area === "review") P.st.review = "paused"; render(); return toast(t("t_paused"));
      case "rvresume": cur().review.paused = false; if (P.area === "review") P.st.review = "normal"; render(); return toast(t("t_resumed"));
      case "rvcancel": cur().review = null; if (P.area === "review") P.st.review = "none"; render(); return toast(t("t_cancelled"));
      case "adopt": { const r = risk("r1"); ui.adopted = true; r.plan = { zh: L(r.plan) + "\n3. 12 月 20 日前完成切换", en: L(r.plan) + "\n3. Finish the switch by 20 December" }; render(); return toast(t("t_adopted")); }
      case "refresh": ui.briefFresh = true; render(); return toast(t("t_refreshed"));
      case "fstatus": ui.filter.status = v; ui.filter.cell = ""; break;
      case "cell": ui.filter.cell = ui.filter.cell === v ? "" : v; break;
      case "clearf": ui.filter = { status: "active", impact: "", owner: "", goal: "", cell: "" }; if (["nomatch", "unlinked"].includes(P.st.overview)) P.st.overview = "normal"; persist(); break;
      case "peek": return toast(t("t_sim", { n: b.dataset.name }));
      case "toast": return toast(b.dataset.msg === "retry" ? (P.lang === "zh" ? "原型：会重新读取" : "Prototype: would read again") : t(b.dataset.msg, { n: b.dataset.name || "" }));
      default: return;
    }
    render();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".rrow[role=button]")) { e.preventDefault(); e.target.click(); }
    if (e.key === "Escape" && ui.pop) { ui.pop = null; render(); }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "state") { P.st[P.area] = e.target.value; if (P.area === "overview") presetOverview(e.target.value); if (P.area === "review") { risks = clone(D.risks); ui.briefFresh = false; ui.adopted = false; } ui.pop = null; ui.editPlan = false; persist(); return render(); }
    const f = e.target.dataset.filter;
    if (f) { ui.filter[{ f_impact: "impact", f_owner: "owner", f_goal: "goal" }[f]] = e.target.value; render(); }
  });

  document.getElementById("icons").innerHTML = window.protoIcons;
  presetOverview(P.st.overview);
  render();
})();
