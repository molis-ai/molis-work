// Work Brief core prototype (batch 19), rebuilt on the component board's real parts (2026-11-04).
// The user chose option A for all four parts (home, versions, sources, next steps); only those are drawn here.
// Every control comes from window.MW — the plugin SDK's `@molis-ai/molis-work-plugin-sdk/ui` renderers and the design system's
// menu/popover/interaction renderers (docs/design/component-board/build.mjs). Standalone review prototype, not product code.
(() => {
  const M = window.MW;
  const W = window.WB;
  const KEY = "molis-proto.work-brief-core.v2";
  const DEF = { area: "home", st: { home: "normal", version: "current", source: "normal", next: "normal" }, lang: "zh", theme: "light" };
  const STATES = {
    home: ["normal", "basic", "empty", "fail", "noauth", "refreshing", "loadfail"],
    version: ["current", "old", "conflict", "delta", "gap", "first"],
    source: ["normal", "stale", "fail", "noauth", "owner"],
    next: ["normal", "stale", "running", "partial", "revoked", "handled"],
  };
  const T = {
    zh: {
      protoTitle: "Work Brief 定样 · 原型", chosen: "已定：四块都是方案 A", area: "区域", state: "状态", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      a_home: "首页", a_version: "版本", a_source: "来源", a_next: "下一步",
      st_home_normal: "正常", st_home_basic: "没装 Work Brief（基础首页）", st_home_empty: "新项目，还没有内容", st_home_fail: "一个来源读不到", st_home_noauth: "定时简报没被授权读待办", st_home_refreshing: "后台刷新中", st_home_loadfail: "综合首页没打开",
      st_version_current: "看当前版本", st_version_old: "看旧版本（已分享）", st_version_conflict: "再生成和你的修改冲突", st_version_delta: "刷新后有变化", st_version_gap: "旧版本的依据已取不到", st_version_first: "第一份，没有历史",
      st_source_normal: "正常", st_source_stale: "来源过期", st_source_fail: "来源读不到", st_source_noauth: "没有读取授权", st_source_owner: "你口述的数字",
      st_next_normal: "正常", st_next_stale: "对象已变，选项失效", st_next_running: "交给助理，进行中", st_next_partial: "部分完成", st_next_revoked: "授权已撤回", st_next_handled: "都处理过了",
      brief: "项目简报", basicHome: "项目首页", asOf: "截至 {t}", refresh: "刷新", refreshing: "正在刷新", versions: "版本",
      pulse: "各来源", now: "现在怎么样", attention: "要你处理", changes: "和上次比", nextH: "下一步",
      p_ok: "正常", p_moving: "有变化", p_waiting: "等你", p_blocked: "卡住了", p_na: "无数据", p_fail: "读不到", p_noauth: "未授权", p_stale: "过期",
      reply: "回复", decide: "去决定",
      v_current: "当前", v_shared: "已分享 · 固定", v_label: "第 {v} 版", v_open: "查看",
      oldT: "你在看第 2 版（11-01，已分享）", oldD: "已分享的版本固定不变，之后的刷新没有改它。", gapT: "你在看第 1 版（10-28）", backCur: "回到当前版本", then: "当时", nowT: "现在", nowIs: "现在：", thenNow: "当时／现在",
      firstT: "这是第一份", noHistory: "还没有别的版本。下次刷新会生成第 2 版，这一版保持不变。",
      deltaT: "刷新完成", deltaD: "和第 2 版比：+1 风险、1 项要求达成、逾期 1→2。第 2 版保持不变。", changed: "变了", added: "新增",
      gapNote: "这条依据已经取不到（原消息已被删除）。保留当时的文字，没有用现在的内容替代。", gapNoteT: "依据已取不到",
      conflictCount: "再生成提案：1 处和你的修改冲突", conflictT: "重新生成的这句和你改过的不一样", conflictD: "你改过的句子不会被直接覆盖，选一个再继续。", mine: "你改的", theirs: "新生成的", keepMine: "保留我的", useNew: "用新的", mergeEdit: "合并后再改",
      basisLine: "读了 {n} 个来源，截至 09:00", basisMissing: "缺：{m}", src: "依据", srcFrom: "{p} · 截至 {t}", yest: "昨天 18:00",
      failT: "{p} 这次读不到", failNote: "这一条没有更新；不代表没有内容。", noauthT: "没有读{p}", noauthNote: "这份简报的定时任务没被授权读{p}。", grant: "去勾选授权", staleT: "{p} 的数据过期了", staleNote: "数据是{t}的，之后没刷新到。",
      ownerTag: "你口述的，未核对", ownerClaim: "云费用比预算高约 15%。", ownerFrom: "你 11-03 在对话里说的，没有连接可以核对",
      retry: "重试",
      kicker: "下一步 · {p}", kickerA: "下一步 · 交给助理", onTarget: "作用于", waitBadge: "等你决定", skip: "暂不", writeOwn: "自己写一个下一步…", add: "添加",
      staleBadge: "已失效", staleOpt: "这项已经变了：「扩充压测数据」周远已经认领。旧的选项不能再点。", reprepare: "按新状态重新准备",
      runBadge: "助理在做", running: "读了供应商公告和停用日期，正在起草。",
      doneBadge: "已完成", doneN1: "已回复合规组", doneN1D: "回复和附件在 Inbox 的对话里。", doneOther: "已完成", doneOtherD: "回执在原插件里。", openIt: "打开",
      failBadge: "没完成", failedN3: "起草没完成：供应商公告读不到。", revokedBadge: "不能做", revoked: "你对 Inbox 的授权已撤回，这一项现在不能做。", seeAuth: "去看授权",
      skipBadge: "暂不", skipped: "暂不，可以在「已放下」里找回。", undo: "撤回",
      emptyT: "这个项目还没有可以综合的内容", emptyD: "插件里有了内容，首页才有东西可说。这不是读取失败。", e1: "带入资料", e2: "添加插件", e3: "开始第一件工作",
      basicNote: "基础首页：各插件自己给的概览和继续入口，不用模型，不生成简报。", basicOpt: "装上 Work Brief 可以看到综合简报（可选）", cont: "继续",
      loadfailT: "综合首页这次没打开", loadfailD: "先显示基础首页。你的工作和插件内容都在。",
      t_sim: "原型：这里会打开「{n}」", t_grant: "原型：会打开平台的授权确认（18 批定的按任务勾选）", t_done: "已完成", t_sent: "已交给助理", t_ref: "已刷新，生成第 4 版；旧版本不变", t_resolved: "已处理冲突", t_skip: "已放下，可以找回", t_added: "已加进下一步",
    },
    en: {
      protoTitle: "Work Brief samples · prototype", chosen: "Chosen: option A for all four", area: "Area", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      a_home: "Home", a_version: "Versions", a_source: "Sources", a_next: "Next steps",
      st_home_normal: "Normal", st_home_basic: "No Work Brief (basic home)", st_home_empty: "New project, nothing yet", st_home_fail: "One source unreadable", st_home_noauth: "Scheduled brief can't read to-dos", st_home_refreshing: "Refreshing in background", st_home_loadfail: "Brief home failed to open",
      st_version_current: "Current version", st_version_old: "Old version (shared)", st_version_conflict: "Regeneration conflicts with your edit", st_version_delta: "Changes after refresh", st_version_gap: "Old version's source gone", st_version_first: "First one, no history",
      st_source_normal: "Normal", st_source_stale: "Source out of date", st_source_fail: "Source unreadable", st_source_noauth: "No permission to read", st_source_owner: "Number you told us",
      st_next_normal: "Normal", st_next_stale: "Item changed, option invalid", st_next_running: "With the assistant", st_next_partial: "Partly done", st_next_revoked: "Permission revoked", st_next_handled: "All handled",
      brief: "Project brief", basicHome: "Project home", asOf: "As of {t}", refresh: "Refresh", refreshing: "Refreshing", versions: "Versions",
      pulse: "Sources", now: "Where things stand", attention: "Needs you", changes: "Since last time", nextH: "Next steps",
      p_ok: "Fine", p_moving: "Changed", p_waiting: "Your turn", p_blocked: "Blocked", p_na: "No data", p_fail: "Unreadable", p_noauth: "No permission", p_stale: "Out of date",
      reply: "Reply", decide: "Decide",
      v_current: "Current", v_shared: "Shared · fixed", v_label: "Version {v}", v_open: "View",
      oldT: "You're reading version 2 (11-01, shared)", oldD: "A shared version is fixed. Later refreshes didn't change it.", gapT: "You're reading version 1 (10-28)", backCur: "Back to current", then: "Then", nowT: "Now", nowIs: "Now: ", thenNow: "Then / Now",
      firstT: "This is the first one", noHistory: "No other versions yet. The next refresh makes version 2; this one stays as it is.",
      deltaT: "Refreshed", deltaD: "Since version 2: +1 risk, 1 requirement met, overdue 1→2. Version 2 is unchanged.", changed: "Changed", added: "New",
      gapNote: "This source can't be read any more (the message was deleted). The text from then is kept; today's content isn't swapped in.", gapNoteT: "Source gone",
      conflictCount: "Regeneration proposal: 1 conflict with your edits", conflictT: "The regenerated sentence differs from your edit", conflictD: "Your edit isn't overwritten. Pick one to go on.", mine: "Your edit", theirs: "Regenerated", keepMine: "Keep mine", useNew: "Use new", mergeEdit: "Merge, then edit",
      basisLine: "Read {n} sources, as of 09:00", basisMissing: "Missing: {m}", src: "Basis", srcFrom: "{p} · as of {t}", yest: "yesterday 18:00",
      failT: "{p} couldn't be read this time", failNote: "This part wasn't updated. It doesn't mean there's nothing there.", noauthT: "{p} not read", noauthNote: "This brief's scheduled task has no permission to read {p}.", grant: "Grant permission", staleT: "{p} data is out of date", staleNote: "It's from {t}; it hasn't refreshed since.",
      ownerTag: "Told by you, not verified", ownerClaim: "Cloud spend is about 15% over budget.", ownerFrom: "You said this in chat on 11-03; there's no connection to check it",
      retry: "Retry",
      kicker: "Next step · {p}", kickerA: "Next step · for the assistant", onTarget: "On", waitBadge: "Your call", skip: "Not now", writeOwn: "Write your own next step…", add: "Add",
      staleBadge: "No longer valid", staleOpt: "This changed: Zhou Yuan already took “grow load-test data”. The old option can't be used.", reprepare: "Prepare again for the new state",
      runBadge: "Assistant working", running: "Read the vendor notice and the retirement date; drafting now.",
      doneBadge: "Done", doneN1: "Replied to compliance", doneN1D: "The reply and attachment are in the Inbox thread.", doneOther: "Done", doneOtherD: "The receipt is in the owning plugin.", openIt: "Open",
      failBadge: "Didn't finish", failedN3: "Draft didn't finish: the vendor notice couldn't be read.", revokedBadge: "Can't do", revoked: "Your permission for Inbox was revoked; this can't be done now.", seeAuth: "See permissions",
      skipBadge: "Not now", skipped: "Set aside; find it again under Set aside.", undo: "Undo",
      emptyT: "Nothing to bring together for this project yet", emptyD: "Once plugins have content, the home page has something to say. This isn't a read failure.", e1: "Bring in material", e2: "Add a plugin", e3: "Start the first piece of work",
      basicNote: "Basic home: each plugin's own overview and continue links. No model, no brief.", basicOpt: "Install Work Brief for a combined brief (optional)", cont: "Continue",
      loadfailT: "The brief home didn't open this time", loadfailD: "The basic home is shown. Your work and plugin content are all there.",
      t_sim: "Prototype: this would open “{n}”", t_grant: "Prototype: would open the platform's permission confirmation (per-task grants from batch 18)", t_done: "Done", t_sent: "Handed to the assistant", t_ref: "Refreshed as version 4; older versions unchanged", t_resolved: "Conflict resolved", t_skip: "Set aside; you can find it again", t_added: "Added to next steps",
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.st) return Object.assign(clone(DEF), v); } catch (e) { /* storage unavailable: defaults */ } return clone(DEF); };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable: keep in memory */ } };
  let P = load();
  const freshUi = () => ({ view: "then", pop: null, res: {}, resolved: false, refreshedAt: null });
  let ui = freshUi();

  const esc = M.escapeHtml;
  const t = (k, v) => { let s = T[P.lang][k] ?? T.zh[k] ?? k; if (v) for (const [a, b] of Object.entries(v)) s = s.replace(new RegExp(`\\{${a}\\}`, "g"), b); return s; };
  const L = (o) => (o ? o[P.lang] ?? o.zh : "");
  const S = (id) => W.sources[id];
  const O = (id) => W.objects[id];
  const st = () => P.st[P.area];
  const list = (items) => items.join(P.lang === "zh" ? "、" : ", ");
  const paren = (s) => (P.lang === "zh" ? `（${s}）` : ` (${s})`);

  // Board parts. `act` puts the prototype's own hook on a part; nothing else is added to the board's markup.
  const act = (a, v, more) => ({ "data-act": a, ...(v === undefined ? {} : { "data-v": v }), ...more });
  const button = (label, o = {}) => M.renderButton({ label, variant: o.variant ?? "secondary", size: "sm", icon: o.icon, iconOnly: o.iconOnly, loading: o.loading, disabled: o.disabled, attrs: o.attrs });
  const badge = (label, tone) => M.renderBadge({ label, tone });
  // The plugin that owns a fact leads it: the presentation forms' owner tile, in the platform-assigned cool hue (DESIGN.md → Plugin identity).
  const tile = (src) => `<span class="wb-owner" style="--presentation-hue:var(--hue-${S(src).hue});--presentation-soft:var(--hue-${S(src).hue}-soft)"><span class="mw-presentation__owner" aria-hidden="true">${M.icon(S(src).icon)}</span></span>`;
  const mark = tile;
  const plug = (src) => `<span class="wb-plug">${tile(src)}<span>${esc(L(S(src)))}</span></span>`;
  // The board's alert; its recovery buttons go in the alert's own action row.
  const alert = (tone, title, body, actions = []) => M.renderAlert({ title, body: body || undefined, tone, actions });
  const abtn = (label, o = {}) => ({ label, variant: o.variant ?? "secondary", size: "sm", icon: o.icon, attrs: o.attrs });
  const items = (rows) => `<ul class="mw-items">${rows.join("")}</ul>`;
  const item = (lead, title, sub, end = "") => `<li class="mw-item">${lead}<span><strong>${esc(title)}</strong>${sub ? `<small>${esc(sub)}</small>` : ""}</span>${end ? `<span class="mw-item__end">${end}</span>` : ""}</li>`;
  const plainMark = (name) => `<span class="mw-mark">${M.icon(name)}</span>`;

  /* ---------- sources ---------- */
  function srcState(id) {
    const a = P.area, s = st();
    if ((a === "home" || a === "source") && s === "fail" && id === "inbox") return "fail";
    if ((a === "home" || a === "source") && s === "noauth" && id === "todo") return "noauth";
    if (a === "source" && s === "stale" && id === "coding") return "stale";
    return "ok";
  }
  const readMark = (s) => s === "fail" ? M.renderStatusMark({ label: t("p_fail"), tone: "blocked", state: "unavailable" })
    : s === "noauth" ? M.renderStatusMark({ label: t("p_noauth"), tone: "attention", state: "reauth" })
    : M.renderStatusMark({ label: t("p_stale"), tone: "quiet", state: "stale" });
  // One meaning per colour: grey at rest, mist blue moving, amber your turn, red cannot go on. Nothing else on the page is warm.
  const PULSE = { ok: { tone: "idle", state: "ready" }, moving: { tone: "progress", state: "unread" }, waiting: { tone: "attention", state: "answer" }, blocked: { tone: "blocked", state: "blocked" }, na: { tone: "quiet", state: "idle" } };
  const pulseOf = (id) => (srcState(id) === "ok" ? M.renderStatusMark({ label: t("p_" + S(id).pulse), ...PULSE[S(id).pulse] }) : readMark(srcState(id)));
  const srcGap = (id) => {
    const s = srcState(id), p = L(S(id));
    if (s === "fail") return alert("danger", t("failT", { p }), t("failNote"), [abtn(t("retry"), { icon: "refresh", attrs: act("sim", undefined, { "data-n": t("retry") }) })]);
    if (s === "noauth") return alert("warning", t("noauthT", { p }), t("noauthNote", { p }), [abtn(t("grant"), { icon: "lock", attrs: act("grant") })]);
    if (s === "stale") return alert("info", t("staleT", { p }), t("staleNote", { t: t("yest") }));
    return "";
  };
  const claimBlocked = (c) => c.refs.map((r) => O(r).src).find((s) => srcState(s) === "fail" || srcState(s) === "noauth");
  // Footnote marker after a sentence (component-board addition) opening the board's preview card in a popover.
  function footnotes(c, idx) {
    return c.refs.map((r, i) => {
      const k = `${c.id}-${i}`, open = ui.pop === k, o = O(r), stale = srcState(o.src) === "stale";
      const card = open ? M.renderPopover({ preview: true, className: "wb-pop", body: `${M.renderPreviewCard({ title: L(o), body: t("srcFrom", { p: L(S(o.src)), t: stale ? t("yest") : S(o.src).asOf }) })}<div class="wb-pop-foot">${plug(o.src)}${stale ? readMark("stale") : ""}${button(t("v_open"), { variant: "ghost", attrs: act("sim", undefined, { "data-n": L(o) }) })}</div>` }) : "";
      return `<span class="wb-anchor"><button type="button" class="wb-fn" data-act="pop" data-v="${k}" aria-expanded="${open}" aria-label="${esc(t("src"))} ${idx}.${i + 1}"${stale ? " data-stale" : ""}>${idx}.${i + 1}</button>${card}</span>`;
    }).join("");
  }
  function basisLine() {
    const ids = Object.keys(W.sources);
    const miss = ids.filter((i) => ["fail", "noauth"].includes(srcState(i))).map((i) => L(S(i)) + paren(t("p_" + srcState(i))));
    return `<p class="wb-basis">${M.icon("info")}<span>${esc(t("basisLine", { n: ids.length - miss.length }) + (miss.length ? " · " + t("basisMissing", { m: list(miss) }) : ""))}</span></p>`;
  }

  /* ---------- versions ---------- */
  const vst = () => (P.area === "version" ? st() : "current");
  const viewingOld = () => vst() === "old" || vst() === "gap";
  const curVersion = () => (vst() === "first" ? 1 : viewingOld() ? (vst() === "gap" ? 1 : 2) : ui.refreshedAt ? 4 : 3);
  function versionCtl() {
    const cur = curVersion(), open = ui.pop === "ver";
    const tag = viewingOld() ? (vst() === "gap" ? "" : t("v_shared")) : t("v_current");
    const rows = vst() === "first" ? `<p class="wb-pop-note">${esc(t("noHistory"))}</p>` : items(W.versions.map((v) => item(plainMark("history"), t("v_label", { v: v.v }), `${v.when} · ${L(v.delta)}`,
      v.v === cur ? badge(v.tag === "shared" ? t("v_shared") : t("v_current"), "info") : `${v.tag === "shared" ? badge(t("v_shared"), "neutral") : ""}${button(t("v_open"), { variant: "ghost", attrs: act("pickv", v.v) })}`)));
    const pop = open ? M.renderPopover({ preview: true, className: "wb-pop wb-pop--end", body: rows }) : "";
    return `<span class="wb-anchor">${button(`${t("v_label", { v: cur })}${tag ? " · " + tag : ""}`, { icon: "history", attrs: act("pop", "ver", { "aria-expanded": String(open), "aria-haspopup": "dialog" }) })}${pop}</span>`;
  }
  function versionBanner() {
    const s = vst();
    if (viewingOld()) {
      const thenNow = M.renderToggleGroup({ label: t("thenNow"), items: [{ value: "then", label: t("then"), current: ui.view === "then", attrs: act("view", "then") }, { value: "now", label: t("nowT"), current: ui.view === "now", attrs: act("view", "now") }] });
      return `${alert("info", s === "gap" ? t("gapT") : t("oldT"), t("oldD"), [abtn(t("backCur"), { attrs: act("state", "current") })])}<div class="wb-thennow">${thenNow}</div>`;
    }
    if (s === "delta") return alert("info", t("deltaT"), t("deltaD"));
    if (s === "conflict" && !ui.resolved) return alert("warning", t("conflictCount"), "");
    if (s === "first") return alert("info", t("firstT"), t("noHistory"));
    return "";
  }
  function conflictBlock() {
    return `<div class="wb-conflict"><p class="wb-conflict__title">${M.icon("circle-alert")}<span>${esc(t("conflictT"))}</span></p><p class="wb-muted">${esc(t("conflictD"))}</p>
      <div class="wb-conflict__pair">${M.renderPreviewCard({ title: t("mine"), body: L(W.edit.mine) })}${M.renderPreviewCard({ title: t("theirs"), body: L(W.edit.theirs) })}</div>
      <div class="wb-actions">${button(t("keepMine"), { variant: "primary", attrs: act("resolve") })}${button(t("useNew"), { attrs: act("resolve") })}${button(t("mergeEdit"), { variant: "ghost", attrs: act("resolve") })}</div></div>`;
  }

  /* ---------- claims ---------- */
  function claimHtml(c, idx, old) {
    const blocked = claimBlocked(c);
    if (blocked && !old) return `<li class="wb-claim">${srcGap(blocked)}</li>`;
    if (c.id === "c1" && vst() === "conflict" && !ui.resolved) return `<li class="wb-claim">${conflictBlock()}</li>`;
    let text = L(c.text), after = "";
    if (old) {
      if (!c.old) return "";
      text = L(c.old);
      if (ui.view === "now" && L(c.old) !== L(c.text)) after = `<p class="wb-now" data-craft-turn><strong>${esc(t("nowIs"))}</strong>${esc(L(c.text))}</p>`;
      if (c.id === "c4" && vst() === "gap") after += alert("info", t("gapNoteT"), t("gapNote"));
    }
    const fresh = vst() === "delta" && !old;
    const tag = fresh && c.old && L(c.old) !== L(c.text) ? badge(t("changed"), "info") : fresh && !c.old ? badge(t("added"), "info") : "";
    const staleSrc = c.refs.map((r) => O(r).src).find((s) => srcState(s) === "stale");
    return `<li class="wb-claim"${tag ? " data-craft-new" : ""}><div class="wb-claim__text">${tag}${esc(text)}${footnotes(c, idx)}</div>${staleSrc && !old ? srcGap(staleSrc) : ""}${after}</li>`;
  }
  function ownerClaim() {
    if (!(P.area === "source" && st() === "owner")) return "";
    return `<li class="wb-claim"><div class="wb-claim__text">${badge(t("ownerTag"), "neutral")}${esc(t("ownerClaim"))}</div><p class="wb-muted">${esc(t("ownerFrom"))}</p></li>`;
  }
  const claimsList = () => `<ol class="wb-claims">${W.claims.map((c, i) => claimHtml(c, i + 1, viewingOld())).join("")}${ownerClaim()}</ol>${basisLine()}`;

  /* ---------- next steps: the board's operation card ---------- */
  const nst = () => (P.area === "next" ? st() : "normal");
  function nextState(n) {
    const s = nst();
    if (s === "stale" && n.id === "n2") return "stale";
    if (s === "running" && n.id === "n3") return "running";
    if (s === "partial") return n.id === "n1" ? "done" : n.id === "n3" ? "failed" : "";
    if (s === "revoked" && n.id === "n1") return "revoked";
    if (s === "handled") return n.id === "n2" ? "skipped" : "done";
    return ui.res[n.id] || "";
  }
  const firstOpen = () => (W.next.find((n) => !nextState(n)) || {}).id;
  const conflictOpen = () => vst() === "conflict" && !ui.resolved;
  function nextCard(n) {
    const x = nextState(n), o = O(n.obj);
    const view = {
      id: `wb-${n.id}`,
      kicker: n.act === "assistant" ? t("kickerA") : t("kicker", { p: L(S(o.src)) }),
      title: L(n.text),
      target: { prefix: t("onTarget"), label: `${L(S(o.src))} · ${L(o)}`, changed: x === "stale" },
      impact: L(n.why),
    };
    const own = { id: "do", label: L(n.btn), variant: n.id === firstOpen() && !conflictOpen() ? "primary" : "secondary", icon: n.act === "assistant" ? "sparkles" : S(o.src).icon, attrs: act("do", n.id) };
    const skip = { id: "skip", label: t("skip"), variant: "ghost", attrs: act("skip", n.id) };
    // A suggestion is not waiting on the person: no amber here. Amber stays with 要你处理 and the sources that wait for you.
    if (!x) Object.assign(view, { actions: [skip, own] });
    if (x === "stale") Object.assign(view, { badge: { label: t("staleBadge"), tone: "quiet", state: "stale" }, status: { text: t("staleOpt") }, recovery: [{ id: "reprepare", label: t("reprepare"), variant: "secondary", attrs: act("sim", undefined, { "data-n": t("reprepare") }) }] });
    if (x === "running") Object.assign(view, { badge: { label: t("runBadge"), tone: "progress", state: "generating" }, status: { text: t("running"), busy: true } });
    if (x === "done") Object.assign(view, { badge: { label: t("doneBadge"), tone: "done", state: "done" }, result: { title: n.id === "n1" ? t("doneN1") : t("doneOther"), body: n.id === "n1" ? t("doneN1D") : t("doneOtherD"), actions: [{ id: "open", label: t("openIt"), variant: "secondary", attrs: act("sim", undefined, { "data-n": L(o) }) }] } });
    if (x === "failed") Object.assign(view, { badge: { label: t("failBadge"), tone: "failed", state: "failed" }, status: { text: t("failedN3"), tone: "failed" }, recovery: [{ id: "retry", label: t("retry"), variant: "secondary", icon: "refresh", attrs: act("sim", undefined, { "data-n": t("retry") }) }] });
    if (x === "revoked") Object.assign(view, { badge: { label: t("revokedBadge"), tone: "quiet", state: "reauth" }, status: { text: t("revoked"), tone: "waiting" }, recovery: [{ id: "auth", label: t("seeAuth"), variant: "secondary", icon: "lock", attrs: act("grant") }] });
    if (x === "skipped") Object.assign(view, { badge: { label: t("skipBadge"), tone: "quiet", state: "paused" }, status: { text: t("skipped") }, recovery: [{ id: "undo", label: t("undo"), variant: "ghost", icon: "undo", attrs: act("unskip", n.id) }] });
    return M.renderInteractionOperation(view);
  }
  const ownStep = () => `<div class="wb-own">${M.renderInput({ placeholder: t("writeOwn"), attrs: { "aria-label": t("writeOwn") } })}${button(t("add"), { icon: "plus", attrs: act("added") })}</div>`;
  const nextSection = () => `<div class="wb-next">${W.next.map(nextCard).join("")}</div>${ownStep()}`;

  /* ---------- page ---------- */
  const sec = (k, body) => `<section class="wb-sec" aria-labelledby="wb-${k}"><h3 class="wb-h" id="wb-${k}">${esc(t(k))}</h3>${body}</section>`;
  const pulseRow = () => `<ul class="wb-pulse">${Object.keys(W.sources).map((id) => `<li>${plug(id)}${pulseOf(id)}</li>`).join("")}</ul>`;
  const attentionRows = () => items(W.attention.map((a) => item(mark(O(a.obj).src), L(a.text), `${L(S(O(a.obj).src))} · ${L(O(a.obj))}`, `${M.renderStatusMark({ label: t("waitBadge"), tone: "attention", state: "answer" })}${button(a.kind === "decide" ? t("decide") : t("reply"), { attrs: act("sim", undefined, { "data-n": L(O(a.obj)) }) })}`)));
  const CHANGE_ICON = { add: "plus", done: "check", worse: "arrow" };
  const changeRows = () => items(W.changes.map((c) => item(plainMark(CHANGE_ICON[c.kind]), L(c.text), `${L(S(O(c.obj).src))} · ${L(O(c.obj))}`)));
  function headerActions() {
    const refreshing = P.area === "home" && st() === "refreshing";
    return `<div class="wb-head-actions">${versionCtl()}${button(refreshing ? t("refreshing") : t("refresh"), { icon: "refresh", loading: refreshing, attrs: act("refresh") })}</div>`;
  }
  const frame = (title, description, action, panel) => M.renderFrame({ title, description, action, panel, className: "wb-frame" });
  function briefPage() {
    const banner = versionBanner();
    const body = `${banner}${sec("pulse", pulseRow())}${sec("now", claimsList())}${viewingOld() ? "" : sec("attention", attentionRows()) + sec("changes", changeRows()) + sec("nextH", nextSection())}`;
    return frame(t("brief"), `${L(W.project)} · ${t("asOf", { t: ui.refreshedAt || "11-04 09:00" })}`, headerActions(), body);
  }
  function emptyPage() {
    const actions = `<div class="mw-empty__actions">${["e1", "e2", "e3"].map((k, i) => button(t(k), { variant: i ? "secondary" : "primary", attrs: act("sim", undefined, { "data-n": t(k) }) })).join("")}</div>`;
    return frame(t("brief"), L(W.project), headerActions(), M.renderEmpty({ icon: "note", title: t("emptyT"), body: t("emptyD"), action: actions }));
  }
  function basicPage() {
    const cards = W.basicPlugins.map((id) => M.renderCard({
      title: L(S(id)), description: L(S(id).fact), action: mark(id),
      body: items(Object.keys(W.objects).filter((o) => O(o).src === id).slice(0, 2).map((o) => item("", L(O(o)), ""))),
      footer: button(t("cont"), { icon: "chevron-right", attrs: act("sim", undefined, { "data-n": L(S(id)) }) }),
    })).join("");
    const fail = st() === "loadfail" ? alert("danger", t("loadfailT"), t("loadfailD"), [abtn(t("retry"), { icon: "refresh", attrs: act("sim", undefined, { "data-n": t("retry") }) })]) : "";
    const opt = st() === "basic" ? `<p class="wb-basis">${M.icon("package")}${M.renderButton({ label: t("basicOpt"), variant: "link", size: "sm", attrs: act("sim", undefined, { "data-n": "Work Brief" }) })}</p>` : "";
    return frame(t("basicHome"), L(W.project), "", `${fail}<p class="wb-muted">${esc(t("basicNote"))}</p><div class="wb-cards">${cards}</div>${opt}`);
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const options = STATES[P.area].map((k) => `<option value="${k}"${st() === k ? " selected" : ""}>${esc(t(`st_${P.area}_${k}`))}</option>`).join("");
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${badge(t("chosen"), "success")}
      <span class="proto-field">${esc(t("area"))}${tg(t("area"), "area", ["home", "version", "source", "next"].map((a) => [a, t("a_" + a)]))}</span>
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
    const basic = P.area === "home" && (st() === "basic" || st() === "loadfail");
    const empty = P.area === "home" && st() === "empty";
    document.getElementById("app").innerHTML = `<div class="proto-sheet mw-layout-primitives">${basic ? basicPage() : empty ? emptyPage() : briefPage()}</div>`;
  }
  let timer;
  const toast = (message, tone) => { const box = document.getElementById("toasts"); box.innerHTML = M.renderToast({ message, tone }); clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 2400); };
  function setState(v) { P.st[P.area] = v; ui = Object.assign(freshUi(), {}); persist(); }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],#reset");
    if (!b) { if (ui.pop && !e.target.closest(".wb-pop")) { ui.pop = null; render(); } return; }
    if (b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); ui = freshUi(); persist(); return render(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; ui.pop = null; persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "pop": ui.pop = ui.pop === v ? null : v; break;
      case "sim": return toast(t("t_sim", { n: b.dataset.n }));
      case "grant": return toast(t("t_grant"));
      case "view": ui.view = v; break;
      case "state": P.area = "version"; setState(v); break;
      case "pickv": P.area = "version"; setState(v === "3" ? "current" : v === "1" ? "gap" : "old"); break;
      case "resolve": ui.resolved = true; render(); return toast(t("t_resolved"), "success");
      case "refresh": ui.refreshedAt = "11-04 " + new Date().toTimeString().slice(0, 5); ui.pop = null; render(); return toast(t("t_ref"), "success");
      case "do": { const n = W.next.find((x) => x.id === v); ui.res[v] = n.act === "assistant" ? "running" : "done"; render(); return toast(n.act === "assistant" ? t("t_sent") : t("t_done"), "success"); }
      case "skip": ui.res[v] = "skipped"; render(); return toast(t("t_skip"));
      case "unskip": delete ui.res[v]; if (nst() === "handled") P.st.next = "normal"; break;
      case "added": return toast(t("t_added"), "success");
      default: return;
    }
    render();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ui.pop) { ui.pop = null; render(); } });
  document.addEventListener("change", (e) => { if (e.target.id === "state") { setState(e.target.value); render(); } });

  render();
})();
