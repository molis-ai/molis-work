// Work Brief core prototype (batch 19): home, versions, sources, next steps. Standalone review prototype, not product code.
(() => {
  const W = window.WB;
  const KEY = "molis-proto.work-brief-core.v1";
  const DEF = { area: "home", scheme: { home: "A", version: "A", source: "A", next: "A" }, st: { home: "normal", version: "current", source: "normal", next: "normal" }, lang: "zh", theme: "light" };
  const STATES = {
    home: ["normal", "basic", "empty", "fail", "noauth", "refreshing", "loadfail"],
    version: ["current", "old", "conflict", "delta", "gap", "first"],
    source: ["normal", "stale", "fail", "noauth", "owner"],
    next: ["normal", "stale", "running", "partial", "revoked", "handled"],
  };
  const T = {
    zh: {
      protoTitle: "Work Brief 定样 · 原型", area: "区域", scheme: "方案", state: "状态", lang: "语言", theme: "主题", light: "浅", dark: "深", reset: "重置",
      a_home: "首页", a_version: "版本", a_source: "来源", a_next: "下一步",
      st_home_normal: "正常", st_home_basic: "没装 Work Brief（基础首页）", st_home_empty: "新项目，还没有内容", st_home_fail: "一个来源读不到", st_home_noauth: "定时简报没被授权读待办", st_home_refreshing: "后台刷新中", st_home_loadfail: "综合首页没打开",
      st_version_current: "看当前版本", st_version_old: "看旧版本（已分享）", st_version_conflict: "再生成和你的修改冲突", st_version_delta: "刷新后有变化", st_version_gap: "旧版本的依据已取不到", st_version_first: "第一份，没有历史",
      st_source_normal: "正常", st_source_stale: "来源过期", st_source_fail: "来源读不到", st_source_noauth: "没有读取授权", st_source_owner: "你口述的数字",
      st_next_normal: "正常", st_next_stale: "对象已变，选项失效", st_next_running: "交给助理，进行中", st_next_partial: "部分完成", st_next_revoked: "授权已撤回", st_next_handled: "都处理过了",
      sc_home_A: "一页简报", sd_home_A: "一栏读下来：各来源的红黄绿、现在怎么样、要你处理的、和上次比、下一步。",
      sc_home_B: "状态页 · 分页签", sd_home_B: "概览／要你处理／下一步／变化 分页签，没有内容的页签不出；概览里是各来源的状态格。",
      sc_home_C: "插件领头的卡片墙", sd_home_C: "上面一段综合说明，下面每个插件一张卡（插件名领头，延续 03 定的「插件领头」）。",
      sc_version_A: "版本条 + 当时／现在", sd_version_A: "标题旁一个版本按钮列出历次版本；看旧版本时可切「当时／现在」，变了的句子下面标出现在的样子。",
      sc_version_B: "历史侧栏", sd_version_B: "「历史」在右侧打开，每个版本一行带变化摘要；选中就看那一版，冲突也在这里逐处处理。",
      sc_version_C: "左右对照", sd_version_C: "看旧版本、刷新或冲突时，正文改成左右两栏对照，变了的句子标出来。",
      sc_source_A: "句后角标", sd_source_A: "每句话后面带小编号，点开看来自哪个插件的哪一条、截至什么时候；页尾一条依据说明读了什么、缺什么。",
      sc_source_B: "右侧依据栏", sd_source_B: "右边一栏按插件列出读了哪些、截至何时、哪些读不到；点一句话，栏里亮出它的依据。",
      sc_source_C: "来源条 + 句后名片", sd_source_C: "顶上一条来源覆盖（读了几个、缺几个）；每句话下面直接放它引用的对象名片。",
      sc_next_A: "选项卡片", sd_next_A: "每个下一步一张卡：对谁做、为什么、一个真实动作或交给助理，另有「暂不」和自己写。",
      sc_next_B: "挂在结论上", sd_next_B: "下一步放在它影响的那句话下面，可以勾选；底部一条把勾选和补充一起交给助理。",
      sc_next_C: "紧凑行 + 补充框", sd_next_C: "下一步是几行（状态 · 做什么 · 对象 · 动作），下面一个框写补充或换个做法。",
      brief: "项目简报", basicHome: "项目首页", asOf: "截至 {t}", refresh: "刷新", refreshing: "正在刷新…", history: "历史", compare: "对照",
      pulse: "各来源", now: "现在怎么样", attention: "要你处理", changes: "和上次比", nextH: "下一步", overview: "概览",
      p_g: "正常", p_y: "注意", p_r: "要处理", p_na: "无数据", p_fail: "读不到", p_noauth: "未授权", p_stale: "过期", p_owner: "口述",
      reply: "回复", decide: "去决定", open: "打开",
      v_current: "当前", v_shared: "已分享 · 固定", v_label: "第 {v} 版", oldBanner: "你在看第 2 版（11-01，已分享，固定不变）。之后的刷新没有改它。", backCur: "回到当前版本", then: "当时", nowT: "现在", nowIs: "现在：", noHistory: "还没有别的版本。下次刷新会生成第 2 版，这一版保持不变。",
      deltaBanner: "刷新完成：和第 2 版比 +1 风险、1 项要求达成、逾期 1→2。第 2 版保持不变。", changed: "变了", added: "新增",
      gapNote: "这条依据已经取不到（原消息已被删除）。保留当时的文字，没有用现在的内容替代。",
      conflictT: "重新生成的这句和你改过的不一样", mine: "你改的", theirs: "新生成的", keepMine: "保留我的", useNew: "用新的", mergeEdit: "合并后再改", conflictCount: "再生成提案：1 处和你的修改冲突",
      resolved: "已处理", versions: "版本",
      basisLine: "读了 {n} 个来源，截至 09:00", basisMissing: "缺：{m}", src: "依据", srcFrom: "来自 {p} · 截至 {t}",
      failNote: "{p} 这次读不到，这一条没有更新；不代表没有内容。", noauthNote: "没有读{p}：这份简报的定时任务没被授权读{p}。", grant: "去勾选授权", staleNote: "{p} 的数据是 {t} 的，之后没刷新到。", ownerTag: "你口述的，未核对", ownerClaim: "云费用比预算高约 15%。", ownerFrom: "你 11-03 在对话里说的，没有连接可以核对",
      retry: "重试", coverage: "来源覆盖",
      skip: "暂不", writeOwn: "自己写一个下一步…", handOver: "交给助理", picked: "已选 {n} 项", addNote: "补一句（可不填）", moreOrDiff: "补充，或换个做法…", send: "发送",
      staleOpt: "这项已经变了：「扩充压测数据」周远已经认领。", reprepare: "按新状态重新准备", running: "助理在起草…", runningD: "读了供应商公告和停用日期，正在写", done: "已完成", doneN1: "已回复合规组", openIt: "打开", failedN3: "起草没完成：供应商公告读不到", revoked: "你对 Inbox 的授权已撤回，这一项现在不能做。", seeAuth: "去看授权", skipped: "暂不，可以在「已放下」里找回", undo: "撤回",
      emptyT: "这个项目还没有可以综合的内容", emptyD: "插件里有了内容，首页才有东西可说。这不是读取失败。", e1: "带入资料", e2: "添加插件", e3: "开始第一件工作",
      basicNote: "基础首页：各插件自己给的概览和继续入口，不用模型，不生成简报。", basicOpt: "装上 Work Brief 可以看到综合简报（可选）", cont: "继续", loadfailT: "综合首页这次没打开，先显示基础首页。你的工作和插件内容都在。",
      t_sim: "原型：这里会打开「{n}」", t_grant: "原型：会打开平台的授权确认（18 批定的按任务勾选）", t_done: "已完成", t_sent: "已交给助理", t_ref: "已刷新，生成第 4 版；旧版本不变", t_resolved: "已处理冲突", t_skip: "已放下，可以找回",
    },
    en: {
      protoTitle: "Work Brief samples · prototype", area: "Area", scheme: "Option", state: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      a_home: "Home", a_version: "Versions", a_source: "Sources", a_next: "Next steps",
      st_home_normal: "Normal", st_home_basic: "No Work Brief (basic home)", st_home_empty: "New project, nothing yet", st_home_fail: "One source unreadable", st_home_noauth: "Scheduled brief can't read to-dos", st_home_refreshing: "Refreshing in background", st_home_loadfail: "Brief home failed to open",
      st_version_current: "Current version", st_version_old: "Old version (shared)", st_version_conflict: "Regeneration conflicts with your edit", st_version_delta: "Changes after refresh", st_version_gap: "Old version's source gone", st_version_first: "First one, no history",
      st_source_normal: "Normal", st_source_stale: "Source out of date", st_source_fail: "Source unreadable", st_source_noauth: "No permission to read", st_source_owner: "Number you told us",
      st_next_normal: "Normal", st_next_stale: "Item changed, option invalid", st_next_running: "With the assistant", st_next_partial: "Partly done", st_next_revoked: "Permission revoked", st_next_handled: "All handled",
      sc_home_A: "One-page brief", sd_home_A: "Read top to bottom: each source's red/amber/green, where things stand, what needs you, since last time, next steps.",
      sc_home_B: "Status page · tabs", sd_home_B: "Tabs for Overview / Needs you / Next / Changes; empty tabs don't show. Overview has a status tile per source.",
      sc_home_C: "Plugin-led card wall", sd_home_C: "A short summary on top, then one card per plugin, led by the plugin's name (the owner-led form chosen in batch 03).",
      sc_version_A: "Version button + then/now", sd_version_A: "A version button by the title lists every version; on an old one, switch Then / Now and see what each changed sentence says today.",
      sc_version_B: "History side panel", sd_version_B: "History opens on the right, one row per version with what changed; pick one to read it. Conflicts are resolved there too.",
      sc_version_C: "Side-by-side compare", sd_version_C: "For old versions, refreshes and conflicts the body becomes two columns, with changed sentences marked.",
      sc_source_A: "Footnote markers", sd_source_A: "Small numbers after each sentence; click to see which plugin item it came from and when. A line at the end says what was read and what's missing.",
      sc_source_B: "Basis rail on the right", sd_source_B: "A right rail lists what was read per plugin, as of when, and what couldn't be read; click a sentence to light up its sources.",
      sc_source_C: "Coverage strip + chips", sd_source_C: "A coverage strip on top (how many read, how many missing); each sentence shows the item chips it cites right under it.",
      sc_next_A: "Option cards", sd_next_A: "One card per next step: on what, why, one real action or hand to the assistant; plus Not now and write your own.",
      sc_next_B: "Attached to the claim", sd_next_B: "Next steps sit under the sentence they affect, as checkboxes; a bar at the bottom hands the picks and your note to the assistant.",
      sc_next_C: "Compact rows + note box", sd_next_C: "Next steps are rows (state · what · item · action), with a box below to add something or suggest another way.",
      brief: "Project brief", basicHome: "Project home", asOf: "As of {t}", refresh: "Refresh", refreshing: "Refreshing…", history: "History", compare: "Compare",
      pulse: "Sources", now: "Where things stand", attention: "Needs you", changes: "Since last time", nextH: "Next steps", overview: "Overview",
      p_g: "Fine", p_y: "Watch", p_r: "Act", p_na: "No data", p_fail: "Unreadable", p_noauth: "No permission", p_stale: "Out of date", p_owner: "Told by you",
      reply: "Reply", decide: "Decide", open: "Open",
      v_current: "Current", v_shared: "Shared · fixed", v_label: "Version {v}", oldBanner: "You're reading version 2 (11-01, shared, fixed). Later refreshes didn't change it.", backCur: "Back to current", then: "Then", nowT: "Now", nowIs: "Now: ", noHistory: "No other versions yet. The next refresh makes version 2; this one stays as it is.",
      deltaBanner: "Refreshed: since version 2, +1 risk, 1 requirement met, overdue 1→2. Version 2 is unchanged.", changed: "Changed", added: "New",
      gapNote: "This source can't be read any more (the message was deleted). The text from then is kept; today's content isn't swapped in.",
      conflictT: "The regenerated sentence differs from your edit", mine: "Your edit", theirs: "Regenerated", keepMine: "Keep mine", useNew: "Use new", mergeEdit: "Merge, then edit", conflictCount: "Regeneration proposal: 1 conflict with your edits",
      resolved: "Resolved", versions: "Versions",
      basisLine: "Read {n} sources, as of 09:00", basisMissing: "Missing: {m}", src: "Basis", srcFrom: "From {p} · as of {t}",
      failNote: "{p} couldn't be read this time; this part wasn't updated. It doesn't mean there's nothing there.", noauthNote: "{p} not read: this brief's scheduled task has no permission to read {p}.", grant: "Grant permission", staleNote: "{p} data is from {t}; it hasn't refreshed since.", ownerTag: "Told by you, not verified", ownerClaim: "Cloud spend is about 15% over budget.", ownerFrom: "You said this in chat on 11-03; there's no connection to check it",
      retry: "Retry", coverage: "Coverage",
      skip: "Not now", writeOwn: "Write your own next step…", handOver: "Hand to the assistant", picked: "{n} picked", addNote: "Add a note (optional)", moreOrDiff: "Add something, or suggest another way…", send: "Send",
      staleOpt: "This changed: Zhou Yuan already took “grow load-test data”.", reprepare: "Prepare again for the new state", running: "The assistant is drafting…", runningD: "Read the vendor notice and the retirement date; writing now", done: "Done", doneN1: "Replied to compliance", openIt: "Open", failedN3: "Draft didn't finish: the vendor notice couldn't be read", revoked: "Your permission for Inbox was revoked; this can't be done now.", seeAuth: "See permissions", skipped: "Not now; find it again under Set aside", undo: "Undo",
      emptyT: "Nothing to bring together for this project yet", emptyD: "Once plugins have content, the home page has something to say. This isn't a read failure.", e1: "Bring in material", e2: "Add a plugin", e3: "Start the first piece of work",
      basicNote: "Basic home: each plugin's own overview and continue links. No model, no brief.", basicOpt: "Install Work Brief for a combined brief (optional)", cont: "Continue", loadfailT: "The brief home didn't open this time, so the basic home is shown. Your work and plugin content are all there.",
      t_sim: "Prototype: this would open “{n}”", t_grant: "Prototype: would open the platform's permission confirmation (per-task grants from batch 18)", t_done: "Done", t_sent: "Handed to the assistant", t_ref: "Refreshed as version 4; older versions unchanged", t_resolved: "Conflict resolved", t_skip: "Set aside; you can find it again",
    },
  };

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && v.scheme && v.st) return Object.assign(clone(DEF), v); } catch (e) { /* storage unavailable: defaults */ } return clone(DEF); };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { /* storage unavailable: keep in memory */ } };
  let P = load();
  const freshUi = () => ({ tab: "overview", view: "then", hl: null, pop: null, side: false, sel: 3, picked: { n1: true, n3: true }, res: {}, resolved: false, refreshedAt: null });
  let ui = freshUi();

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const t = (k, v) => { let s = T[P.lang][k] ?? T.zh[k] ?? k; if (v) for (const [a, b] of Object.entries(v)) s = s.replace(new RegExp(`\\{${a}\\}`, "g"), b); return s; };
  const L = (o) => (o ? o[P.lang] ?? o.zh : "");
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"/></svg>`;
  const S = (id) => W.sources[id];
  const O = (id) => W.objects[id];
  const st = () => P.st[P.area];

  // Effective state of each source for the current area/state.
  function srcState(id) {
    const a = P.area, s = st();
    if ((a === "home" || a === "source") && s === "fail" && id === "inbox") return "fail";
    if ((a === "home" || a === "source") && s === "noauth" && id === "todo") return "noauth";
    if (a === "source" && s === "stale" && id === "coding") return "stale";
    return "ok";
  }
  const pulseOf = (id) => { const s = srcState(id); return s === "ok" ? S(id).pulse : s; };
  const own = (id) => `<span class="own" style="--hue:${P.theme === "dark" ? S(id).dhue : S(id).hue}">${ic(S(id).icon, "sm")}</span>`;
  const ownName = (id) => `<span class="ownname">${own(id)}${esc(L(S(id)))}</span>`;
  const chip = (oid) => `<button type="button" class="chip" data-act="sim" data-n="${esc(L(O(oid)))}">${own(O(oid).src)}<span class="nm">${esc(L(O(oid)))}</span></button>`;
  const light = (p) => `<span class="pl pl-${p}"><i></i>${t("p_" + p)}</span>`;
  const isEmpty = () => P.area === "home" && st() === "empty";
  const isBasic = () => P.area === "home" && (st() === "basic" || st() === "loadfail");

  /* ---------- sources ---------- */
  const srcGap = (id) => {
    const s = srcState(id); const p = L(S(id));
    if (s === "fail") return `<div class="gap err">${ic("circle-alert", "sm")}<span>${t("failNote", { p })}</span><button class="btn sec sm" data-act="sim" data-n="${t("retry")}">${ic("refresh", "sm")}${t("retry")}</button></div>`;
    if (s === "noauth") return `<div class="gap warn">${ic("lock", "sm")}<span>${t("noauthNote", { p })}</span><button class="btn sec sm" data-act="grant">${t("grant")}</button></div>`;
    if (s === "stale") return `<div class="gap">${ic("history", "sm")}<span>${t("staleNote", { p, t: P.lang === "zh" ? "昨天 18:00" : "yesterday 18:00" })}</span></div>`;
    return "";
  };
  const claimBlocked = (c) => c.refs.map((r) => O(r).src).find((s) => srcState(s) !== "ok" && srcState(s) !== "stale");
  function refsMarkup(c, idx) {
    const sc = P.scheme.source;
    if (sc === "A") return c.refs.map((r, i) => { const k = `${c.id}-${i}`; const open = ui.pop === k; const o = O(r); return `<span class="popwrap"><button type="button" class="fn ${srcState(o.src) === "stale" ? "stale" : ""}" data-act="pop" data-v="${k}" aria-expanded="${open}" aria-label="${t("src")} ${idx}.${i + 1}">${idx}.${i + 1}</button>${open ? `<div class="pop srcpop">${chip(r)}<span class="fact">${t("srcFrom", { p: L(S(o.src)), t: srcState(o.src) === "stale" ? (P.lang === "zh" ? "昨天 18:00" : "yesterday 18:00") : S(o.src).asOf })}</span>${srcState(o.src) === "stale" ? `<span class="pl pl-stale"><i></i>${t("p_stale")}</span>` : ""}</div>` : ""}</span>`; }).join("");
    if (sc === "C") return "";
    return "";
  }
  function claimHtml(c, idx, opts = {}) {
    const blocked = claimBlocked(c);
    if (blocked && !opts.old) return `<li class="claim gapc">${srcGap(blocked)}</li>`;
    const sc = P.scheme.source;
    const vs = P.scheme.version;
    let text = L(c.text);
    let after = "";
    const vst = P.area === "version" ? st() : "current";
    if (c.id === "c1" && vst === "conflict" && !ui.resolved && vs !== "B") return `<li class="claim">${conflictBlock(vs === "C")}</li>`;
    if (opts.old) {
      text = c.old ? L(c.old) : null;
      if (!text) return "";
      if (vs === "A" && ui.view === "now" && L(c.old) !== L(c.text)) after = `<div class="nowis"><b>${t("nowIs")}</b>${esc(L(c.text))}</div>`;
      if (c.id === "c4" && vst === "gap") after += `<div class="gap">${ic("circle-alert", "sm")}<span>${t("gapNote")}</span></div>`;
    }
    const mark = vst === "delta" && !opts.old && c.old && L(c.old) !== L(c.text) ? `<span class="tag out">${t("changed")}</span>` : vst === "delta" && !opts.old && !c.old ? `<span class="tag out">${t("added")}</span>` : "";
    const hl = sc === "B" && ui.hl === c.id;
    const chips = sc === "C" ? `<div class="cchips">${c.refs.map(chip).join("")}</div>` : "";
    const staleSrc = c.refs.map((r) => O(r).src).find((s) => srcState(s) === "stale");
    return `<li class="claim ${hl ? "hl" : ""}" ${sc === "B" ? `data-act="hl" data-v="${c.id}" tabindex="0" role="button"` : ""}><p>${mark}${esc(text)}${refsMarkup(c, idx)}</p>${chips}${staleSrc && sc !== "A" ? srcGap(staleSrc) : ""}${after}${opts.extra || ""}</li>`;
  }
  function ownerClaim() {
    if (!(P.area === "source" && st() === "owner")) return "";
    return `<li class="claim owner"><p><span class="tag sim">${t("ownerTag")}</span>${t("ownerClaim")}</p><span class="fact">${t("ownerFrom")}</span></li>`;
  }
  function basisLine() {
    const ids = Object.keys(W.sources);
    const miss = ids.filter((i) => ["fail", "noauth"].includes(srcState(i))).map((i) => P.lang === "zh" ? `${L(S(i))}（${t("p_" + srcState(i))}）` : `${L(S(i))} (${t("p_" + srcState(i))})`);
    return `<div class="basis">${ic("info", "sm")}<span>${t("basisLine", { n: ids.length - miss.length })}${miss.length ? " · " + t("basisMissing", { m: miss.join(P.lang === "zh" ? "、" : ", ") }) : ""}</span></div>`;
  }
  function coverageStrip() {
    return `<div class="cov"><span class="fact">${t("coverage")}</span>${Object.keys(W.sources).map((id) => `<span class="covp s-${srcState(id)}">${own(id)}${esc(L(S(id)))}${srcState(id) !== "ok" ? ` · ${t("p_" + srcState(id))}` : ""}</span>`).join("")}<span class="fact cnt">${t("asOf", { t: "09:00" })}</span></div>`;
  }
  function basisRail() {
    const want = ui.hl ? W.claims.find((c) => c.id === ui.hl).refs : [];
    return `<aside class="rail"><h4>${t("src")}</h4>${Object.keys(W.sources).map((id) => {
      const s = srcState(id); const objs = Object.keys(W.objects).filter((o) => O(o).src === id);
      return `<div class="rsrc s-${s}"><div class="rh">${ownName(id)}<span class="fact">${s === "ok" ? S(id).asOf : s === "stale" ? (P.lang === "zh" ? "昨天 18:00" : "yest. 18:00") : ""}</span>${s !== "ok" ? light(s) : ""}</div>${s === "fail" || s === "noauth" ? srcGap(id) : objs.map((o) => `<div class="robj ${want.includes(o) ? "on" : ""}">${chip(o)}</div>`).join("")}</div>`;
    }).join("")}</aside>`;
  }

  /* ---------- versions ---------- */
  const vst = () => (P.area === "version" ? st() : "current");
  const viewingOld = () => vst() === "old" || vst() === "gap";
  function versionCtl() {
    const vs = P.scheme.version; const s = vst();
    const cur = s === "first" ? 1 : viewingOld() ? (s === "gap" ? 1 : 2) : ui.refreshedAt ? 4 : 3;
    const tag = viewingOld() ? (s === "gap" ? "" : t("v_shared")) : t("v_current");
    if (vs === "A") {
      const open = ui.pop === "ver";
      const list = s === "first" ? `<p class="fact pad">${t("noHistory")}</p>` : W.versions.map((v) => `<button type="button" data-act="pickv" data-v="${v.v}" aria-checked="${v.v === cur}" role="menuitemradio"><b>${t("v_label", { v: v.v })}</b><span class="fact">${v.when}${v.tag === "shared" ? " · " + t("v_shared") : ""}</span><small>${esc(L(v.delta))}</small></button>`).join("");
      return `<span class="popwrap"><button type="button" class="verbtn" data-act="pop" data-v="ver" aria-expanded="${open}">${ic("history", "sm")}${t("v_label", { v: cur })}<span class="fact">${tag}</span>${ic("chevron-down", "sm")}</button>${open ? `<div class="pop verpop" role="menu">${list}</div>` : ""}</span>`;
    }
    if (vs === "B") return `<button type="button" class="btn sec sm" data-act="side" aria-pressed="${ui.side}">${ic("history", "sm")}${t("history")} · ${t("v_label", { v: cur })}</button>`;
    return `<span class="verlbl">${ic("history", "sm")}${t("v_label", { v: cur })} <span class="fact">${tag}</span></span><button type="button" class="btn sec sm" data-act="cmp" aria-pressed="${viewingOld() || s === "delta"}">${ic("columns", "sm")}${t("compare")}</button>`;
  }
  function versionBanner() {
    const s = vst(); const vs = P.scheme.version;
    if (viewingOld()) return `<div class="note warn">${ic("history", "sm")}<span>${s === "gap" ? (P.lang === "zh" ? "你在看第 1 版（10-28）。" : "You're reading version 1 (10-28).") : t("oldBanner")}</span>${vs === "A" ? `<span class="seg"><button type="button" data-act="view" data-v="then" aria-pressed="${ui.view === "then"}">${t("then")}</button><button type="button" data-act="view" data-v="now" aria-pressed="${ui.view === "now"}">${t("nowT")}</button></span>` : ""}<button class="btn sec sm" data-act="state" data-v="current">${t("backCur")}</button></div>`;
    if (s === "delta") return `<div class="note info">${ic("refresh", "sm")}<span>${t("deltaBanner")}</span></div>`;
    if (s === "conflict" && !ui.resolved) return `<div class="note warn">${ic("circle-alert", "sm")}<span>${t("conflictCount")}</span>${vs === "B" && !ui.side ? `<button class="btn sec sm" data-act="side">${t("history")}</button>` : ""}</div>`;
    if (s === "first") return `<div class="note">${ic("info", "sm")}<span>${t("noHistory")}</span></div>`;
    return "";
  }
  function conflictBlock(cols) {
    return `<div class="conf ${cols ? "cols" : ""}"><span class="fact">${ic("circle-alert", "sm")}${t("conflictT")}</span><div class="cmp2"><div class="mine"><span class="fact">${t("mine")}</span><p>${esc(L(W.edit.mine))}</p></div><div class="theirs"><span class="fact">${t("theirs")}</span><p>${esc(L(W.edit.theirs))}</p></div></div><div class="acts"><button class="btn primary sm" data-act="resolve">${t("keepMine")}</button><button class="btn sec sm" data-act="resolve">${t("useNew")}</button><button class="btn ghost sm" data-act="resolve">${t("mergeEdit")}</button></div></div>`;
  }
  function historySide() {
    const s = vst(); const cur = viewingOld() ? (s === "gap" ? 1 : 2) : 3;
    const conflict = s === "conflict" && !ui.resolved ? `<div class="box"><h4 class="sh">${t("conflictCount")}</h4>${conflictBlock(false)}</div>` : "";
    const rows = s === "first" ? `<p class="fact">${t("noHistory")}</p>` : W.versions.map((v) => `<button type="button" class="vrow" data-act="pickv" data-v="${v.v}" aria-current="${v.v === cur}"><div><b>${t("v_label", { v: v.v })}</b>${v.tag === "current" ? `<span class="tag out">${t("v_current")}</span>` : v.tag === "shared" ? `<span class="tag">${t("v_shared")}</span>` : ""}</div><span class="fact">${v.when}</span><small>${esc(L(v.delta))}</small></button>`).join("");
    return paneHead(t("history"), `<button class="btn ghost sm icon" data-act="side" title="${t("history")}">${ic("x", "sm")}</button>`, "history") + `<div class="pbody">${conflict}<div class="box flush">${rows}</div></div>`;
  }
  function compareView() {
    const s = vst(); const left = s === "gap" ? 1 : 2; const right = 3;
    const rows = W.claims.map((c) => {
      const o = c.old ? L(c.old) : ""; const n = L(c.text); const diff = o !== n;
      return `<div class="crow ${diff ? "diff" : ""}"><div>${o ? esc(o) : `<span class="fact">—</span>`}${c.id === "c4" && s === "gap" ? `<div class="gap">${ic("circle-alert", "sm")}<span>${t("gapNote")}</span></div>` : ""}</div><div>${diff ? `<span class="tag out">${o ? t("changed") : t("added")}</span>` : ""}${esc(n)}</div></div>`;
    }).join("");
    return `<div class="cmpv"><div class="chd"><b>${t("v_label", { v: left })}</b><span class="fact">${W.versions.find((v) => v.v === left).when}</span></div><div class="chd"><b>${t("v_label", { v: right })}</b><span class="fact">${W.versions[0].when}</span></div>${rows}</div>`;
  }

  /* ---------- next steps ---------- */
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
  function nextStatus(n, x) {
    if (x === "stale") return `<div class="gap warn">${ic("circle-alert", "sm")}<span>${t("staleOpt")}</span><button class="btn sec sm" data-act="sim" data-n="${t("reprepare")}">${t("reprepare")}</button></div>`;
    if (x === "running") return `<div class="runl"><span class="ring running"></span><b>${t("running")}</b><span class="fact">${t("runningD")}</span></div>`;
    if (x === "done") return `<div class="rcpt">${ic("check", "sm")}<span>${n.id === "n1" ? t("doneN1") : t("done")}</span><button class="link sm" data-act="sim" data-n="${esc(L(O(n.obj)))}">${t("openIt")}</button></div>`;
    if (x === "failed") return `<div class="gap err">${ic("circle-alert", "sm")}<span>${t("failedN3")}</span><button class="btn sec sm" data-act="sim" data-n="${t("retry")}">${ic("refresh", "sm")}${t("retry")}</button></div>`;
    if (x === "revoked") return `<div class="gap warn">${ic("lock", "sm")}<span>${t("revoked")}</span><button class="btn sec sm" data-act="sim" data-n="${t("seeAuth")}">${t("seeAuth")}</button></div>`;
    if (x === "skipped") return `<div class="rcpt muted">${ic("pause", "sm")}<span>${t("skipped")}</span><button class="link sm" data-act="unskip" data-v="${n.id}">${t("undo")}</button></div>`;
    return "";
  }
  const actBtn = (n, primary) => `<button class="btn ${primary ? "primary" : "sec"} sm" data-act="do" data-v="${n.id}">${n.act === "assistant" ? ic("sparkles", "sm") : own(O(n.obj).src)}${esc(L(n.btn))}</button>`;
  function nextA() {
    return `<div class="ncards">${W.next.map((n) => { const x = nextState(n); return `<div class="ncard ${x ? "x-" + x : ""}"><div class="nh">${chip(n.obj)}</div><b>${esc(L(n.text))}</b><span class="fact">${esc(L(n.why))}</span>${x ? nextStatus(n, x) : `<div class="acts">${actBtn(n, true)}<button class="btn ghost sm" data-act="skip" data-v="${n.id}">${t("skip")}</button></div>`}</div>`; }).join("")}<div class="ncard ownstep"><input class="in" placeholder="${t("writeOwn")}"></div></div>`;
  }
  function nextC() {
    return `<div class="box flush">${W.next.map((n) => { const x = nextState(n); return `<div class="nrow ${x ? "x-" + x : ""}"><span class="ring ${x === "running" ? "running" : x === "done" ? "done" : x === "failed" || x === "revoked" ? "failed" : x === "stale" ? "stale" : ""}"></span><strong>${esc(L(n.text))}</strong>${chip(n.obj)}${x ? "" : actBtn(n, false)}${x ? `<div class="nst">${nextStatus(n, x)}</div>` : ""}</div>`; }).join("")}</div><div class="composer2"><input class="in" placeholder="${t("moreOrDiff")}"><button class="btn primary sm" data-act="sent">${ic("send", "sm")}${t("send")}</button></div>`;
  }
  const NEXT_ON = { c4: "n1", c2: "n2", c3: "n3" };
  function nextUnder(claimId) {
    const n = W.next.find((x) => x.id === NEXT_ON[claimId]); if (!n) return "";
    const x = nextState(n);
    return `<div class="nopt ${x ? "x-" + x : ""}">${x ? nextStatus(n, x) : `<label><input type="checkbox" data-act="pick" data-v="${n.id}" ${ui.picked[n.id] ? "checked" : ""}><span><b>${esc(L(n.text))}</b><span class="fact">${esc(L(n.why))}</span></span></label>`}</div>`;
  }
  function nextBBar() {
    const n = W.next.filter((x) => ui.picked[x.id] && !nextState(x)).length;
    return `<div class="nbar"><span class="fact">${t("picked", { n })}</span><input class="in" placeholder="${t("addNote")}"><button class="btn primary sm" data-act="sent" ${n ? "" : "disabled"}>${ic("sparkles", "sm")}${t("handOver")}</button></div>`;
  }
  const nextSection = () => (P.scheme.next === "A" ? nextA() : P.scheme.next === "C" ? nextC() : nextBBar());

  /* ---------- page parts ---------- */
  function paneHead(title, right, icon = "note", sub) {
    return `<header class="phd"><span class="own" style="--hue:${P.theme === "dark" ? "#aab6d6" : "#5b6a8f"}">${ic(icon, "sm")}</span><b>${esc(title)}</b><span class="fact">${esc(sub ?? L(W.project))}</span><span class="grow"></span>${right}</header>`;
  }
  function pageHead() {
    const refreshing = P.area === "home" && st() === "refreshing";
    return `<div class="bhead"><div class="bt"><h1>${t("brief")}</h1><span class="fact">${esc(L(W.project))} · ${t("asOf", { t: ui.refreshedAt || "11-04 09:00" })}</span></div><div class="bctl">${versionCtl()}<button class="btn sec sm" data-act="refresh" ${refreshing ? "disabled" : ""}>${refreshing ? `<span class="ring running"></span>${t("refreshing")}` : `${ic("refresh", "sm")}${t("refresh")}`}</button></div></div>${versionBanner()}${P.scheme.source === "C" ? coverageStrip() : ""}`;
  }
  function pulseRow(tiles) {
    return `<div class="${tiles ? "ptiles" : "prow"}">${Object.keys(W.sources).map((id) => `<div class="pt s-${srcState(id)}"><div class="pth">${ownName(id)}${light(pulseOf(id))}</div>${tiles ? `<span class="fact">${srcState(id) === "ok" || srcState(id) === "stale" ? esc(L(S(id).fact)) : t("p_" + srcState(id))}</span>` : ""}</div>`).join("")}</div>`;
  }
  function claimsList() {
    if (vst() === "conflict" || P.scheme.version !== "C" || !(viewingOld() || vst() === "delta")) {
      const old = viewingOld() && P.scheme.version !== "C";
      const b = P.scheme.next === "B" && !old;
      return `<ol class="claims">${W.claims.map((c, i) => claimHtml(c, i + 1, { old, extra: b ? nextUnder(c.id) : "" })).join("")}${ownerClaim()}</ol>${P.scheme.source === "A" ? basisLine() : ""}`;
    }
    return compareView();
  }
  const attentionRows = () => `<div class="box flush">${W.attention.map((a) => `<div class="arow"><span class="ring ${a.kind === "decide" ? "decide" : ""}"></span><strong>${esc(L(a.text))}</strong>${chip(a.obj)}<button class="btn sec sm" data-act="sim" data-n="${esc(L(O(a.obj)))}">${a.kind === "decide" ? t("decide") : t("reply")}</button></div>`).join("")}</div>`;
  const changeRows = () => `<ul class="chg">${W.changes.map((c) => `<li class="k-${c.kind}"><i>${c.kind === "add" ? "+" : c.kind === "done" ? "✓" : "↑"}</i><span>${esc(L(c.text))}</span>${chip(c.obj)}</li>`).join("")}</ul>`;
  const sec = (k, body, extra = "") => `<section class="bsec"><h3 class="sh">${t(k)}${extra}</h3>${body}</section>`;
  const nextBlock = () => (P.scheme.next === "B" && !viewingOld() ? sec("nextH", nextBBar()) : viewingOld() ? "" : sec("nextH", nextSection()));

  function layoutA() { return `${pageHead()}${sec("pulse", pulseRow(false))}${sec("now", claimsList())}${viewingOld() ? "" : sec("attention", attentionRows())}${viewingOld() ? "" : sec("changes", changeRows())}${nextBlock()}`; }
  function layoutB() {
    const tabs = [["overview", true], ["attention", !viewingOld()], ["nextH", !viewingOld()], ["changes", !viewingOld()]].filter(([, on]) => on);
    if (!tabs.find(([k]) => k === ui.tab)) ui.tab = "overview";
    const body = ui.tab === "overview" ? `${sec("now", claimsList())}${sec("pulse", pulseRow(true))}` : ui.tab === "attention" ? attentionRows() : ui.tab === "nextH" ? (P.scheme.next === "B" ? `${sec("now", claimsList())}${nextBBar()}` : nextSection()) : changeRows();
    return `${pageHead()}<div class="tabs2" role="tablist">${tabs.map(([k]) => `<button type="button" role="tab" data-act="tab" data-v="${k}" aria-selected="${ui.tab === k}">${k === "overview" ? t("overview") : t(k)}</button>`).join("")}</div><div class="tabbody">${body}</div>`;
  }
  function layoutC() {
    const cards = Object.keys(W.sources).map((id) => {
      const objs = Object.keys(W.objects).filter((o) => O(o).src === id).slice(0, 2);
      const s = srcState(id);
      return `<div class="scard s-${s}"><div class="strip" style="--hue:${P.theme === "dark" ? S(id).dhue : S(id).hue}">${ownName(id)}${light(pulseOf(id))}</div><div class="inner">${s === "fail" || s === "noauth" ? srcGap(id) : `<span>${esc(L(S(id).fact))}</span>${objs.map((o) => `<div>${chip(o)}</div>`).join("")}`}</div></div>`;
    }).join("");
    return `${pageHead()}<div class="cband">${sec("now", claimsList())}</div>${viewingOld() ? "" : `<div class="cgrid2"><div>${sec("attention", attentionRows())}</div><div>${sec("changes", changeRows())}</div></div>`}<div class="cwall">${cards}</div>${nextBlock()}`;
  }

  function basicHome() {
    const cards = W.basicPlugins.map((id) => { const objs = Object.keys(W.objects).filter((o) => O(o).src === id).slice(0, 2); return `<div class="scard"><div class="strip" style="--hue:${P.theme === "dark" ? S(id).dhue : S(id).hue}">${ownName(id)}</div><div class="inner"><span>${esc(L(S(id).fact))}</span>${objs.map((o) => `<div>${chip(o)}</div>`).join("")}<div class="acts"><button class="btn sec sm" data-act="sim" data-n="${esc(L(S(id)))}">${t("cont")}${ic("chevron-right", "sm")}</button></div></div></div>`; }).join("");
    return `${st() === "loadfail" ? `<div class="note err">${ic("circle-alert", "sm")}<span>${t("loadfailT")}</span><button class="btn sec sm" data-act="sim" data-n="${t("retry")}">${ic("refresh", "sm")}${t("retry")}</button></div>` : ""}<div class="bhead"><div class="bt"><h1>${t("basicHome")}</h1><span class="fact">${esc(L(W.project))}</span></div></div><p class="fact">${t("basicNote")}</p><div class="cwall">${cards}</div>${st() === "basic" ? `<p class="fact opt">${ic("package", "sm")}<button class="link sm" data-act="sim" data-n="Work Brief">${t("basicOpt")}</button></p>` : ""}`;
  }
  function emptyHome() {
    return `${pageHead()}<div class="blank">${ic("note")}<h3>${t("emptyT")}</h3><p>${t("emptyD")}</p><div class="acts">${["e1", "e2", "e3"].map((k, i) => `<button class="btn ${i ? "sec" : "primary"} sm" data-act="sim" data-n="${t(k)}">${t(k)}</button>`).join("")}</div></div>`;
  }

  function render() {
    document.documentElement.lang = P.lang === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.theme = P.theme;
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll("#area button").forEach((b) => { b.textContent = t("a_" + b.dataset.area); b.setAttribute("aria-pressed", P.area === b.dataset.area); });
    document.querySelectorAll("#scheme button").forEach((b) => b.setAttribute("aria-pressed", P.scheme[P.area] === b.dataset.scheme));
    document.querySelectorAll("#lang button").forEach((b) => b.setAttribute("aria-pressed", P.lang === b.dataset.lang));
    document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", P.theme === b.dataset.themeSet));
    document.getElementById("state").innerHTML = STATES[P.area].map((k) => `<option value="${k}" ${st() === k ? "selected" : ""}>${t(`st_${P.area}_${k}`)}</option>`).join("");
    const sc = P.scheme[P.area];
    if (P.area === "next" && P.scheme.home === "B" && ui.tab === "overview") ui.tab = "nextH";
    let page;
    if (isBasic()) page = basicHome();
    else if (isEmpty()) page = emptyHome();
    else page = P.scheme.home === "A" ? layoutA() : P.scheme.home === "B" ? layoutB() : layoutC();
    const rail = !isBasic() && !isEmpty() && P.scheme.source === "B";
    const side = !isBasic() && !isEmpty() && P.scheme.version === "B" && ui.side;
    document.getElementById("app").innerHTML = `<div class="schemenote"><span class="tag sim">${t("a_" + P.area)} · ${t("scheme")} ${sc}</span><b>${t(`sc_${P.area}_${sc}`)}</b><span>${t(`sd_${P.area}_${sc}`)}</span></div>
      <div class="ws ${side ? "two" : ""}"><section class="pane main">${paneHead(isBasic() ? t("basicHome") : "Work Brief", "", isBasic() ? "home" : "note")}<div class="pbody"><div class="page ${rail ? "withrail" : ""} lay-${P.scheme.home}"><div class="pmain">${page}</div>${rail ? basisRail() : ""}</div></div></section>${side ? `<aside class="pane side">${historySide()}</aside>` : ""}</div>
      <div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  }
  let timer;
  const toast = (m) => { const el = document.getElementById("toast"); if (!el) return; el.textContent = m; el.classList.add("on"); clearTimeout(timer); timer = setTimeout(() => el.classList.remove("on"), 2400); };
  function setState(v) {
    P.st[P.area] = v; ui.pop = null; ui.resolved = false; ui.res = {}; ui.view = "then"; ui.refreshedAt = null;
    if (P.area === "version") ui.side = P.scheme.version === "B" && ["old", "conflict", "gap"].includes(v);
    persist();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-area],[data-scheme],[data-lang],[data-theme-set],#reset");
    if (!b) { if (ui.pop && !e.target.closest(".pop")) { ui.pop = null; render(); } return; }
    if (b.disabled) return;
    if (b.dataset.area) { P.area = b.dataset.area; ui.pop = null; ui.side = P.area === "version" && P.scheme.version === "B" && ["old", "conflict", "gap"].includes(P.st.version); persist(); return render(); }
    if (b.dataset.scheme) { P.scheme[P.area] = b.dataset.scheme; ui.pop = null; if (P.area === "version") ui.side = b.dataset.scheme === "B" && ["old", "conflict", "gap"].includes(P.st.version); persist(); return render(); }
    if (b.dataset.lang) { P.lang = b.dataset.lang; persist(); return render(); }
    if (b.dataset.themeSet) { P.theme = b.dataset.themeSet; persist(); return render(); }
    if (b.id === "reset") { P = clone(DEF); ui = freshUi(); persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "pop": ui.pop = ui.pop === v ? null : v; break;
      case "sim": return toast(t("t_sim", { n: b.dataset.n }));
      case "grant": return toast(t("t_grant"));
      case "tab": ui.tab = v; break;
      case "hl": ui.hl = ui.hl === v ? null : v; break;
      case "view": ui.view = v; break;
      case "side": ui.side = !ui.side; break;
      case "state": P.area = "version"; setState(v); break;
      case "pickv": P.area = "version"; setState(v === "3" ? "current" : v === "1" ? "gap" : "old"); break;
      case "cmp": P.area = "version"; setState(viewingOld() ? "current" : "old"); break;
      case "resolve": ui.resolved = true; render(); return toast(t("t_resolved"));
      case "refresh": ui.refreshedAt = "11-04 " + new Date().toTimeString().slice(0, 5); render(); return toast(t("t_ref"));
      case "do": { const n = W.next.find((x) => x.id === v); ui.res[v] = n.act === "assistant" ? "running" : "done"; render(); return toast(n.act === "assistant" ? t("t_sent") : t("t_done")); }
      case "skip": ui.res[v] = "skipped"; render(); return toast(t("t_skip"));
      case "unskip": delete ui.res[v]; if (nst() === "handled") P.st.next = "normal"; break;
      case "pick": ui.picked[v] = b.checked; break;
      case "sent": render(); return toast(t("t_sent"));
      default: return;
    }
    render();
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches(".claim[role=button]")) { e.preventDefault(); e.target.click(); }
    if (e.key === "Escape" && ui.pop) { ui.pop = null; render(); }
  });
  document.addEventListener("change", (e) => { if (e.target.id === "state") { setState(e.target.value); render(); } });

  document.getElementById("icons").innerHTML = window.protoIcons;
  render();
})();
