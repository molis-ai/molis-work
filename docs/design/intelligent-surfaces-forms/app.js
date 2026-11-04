// 03 · 智能呈现四种基础形态定样 — standalone prototype on sample data (data.js). Nothing calls a model or a Home.
(() => {
  const D = window.isData;
  document.getElementById("icons").innerHTML = window.protoIcons;
  const T = {
    zh: {
      protoTitle: "原型 · 模拟数据", scheme: "方案", pos: "位置", fault: "异常", lang: "语言", theme: "外观", light: "浅", dark: "深", reset: "重置",
      p_spec: "标本：形态 × 状态", p_plugin: "插件内：Inbox", p_chat: "对话", p_im: "项目讨论", p_wait: "等你",
      f_none: "正常", f_unreadable: "Goals 读不到", f_revoked: "Inbox 撤权", f_deleted: "Coding 一轮被删",
      s_running: "进行中", s_decide: "要你决定", s_accept: "要你验收", s_failed: "失败", s_partial: "部分完成", s_stale: "过期", s_denied: "无权查看", s_deleted: "已删除", s_none: "", s_undeclared: "没有声明",
      colState: "状态", colChip: "名字片", colRow: "行", colCard: "卡片",
      noAccess: "没有权限查看", noAccessBody: (o) => `这是 ${o} 里的一条，你没有查看权限。`, deletedBody: (n) => `「${n}」已删除。`, fallbackNote: "这个插件没有声明别处的样子：只显示图标、名字、所属插件和打开。",
      open: "打开", openAt: "打开到准确位置", putIn: "放进…", handTo: "交给…", more: "更多", close: "关闭", undo: "撤销", peek: "速览", sim: "模拟",
      opened: (l) => `打开到 ${l}（模拟）`, simAct: (a) => `「${a}」（模拟）`, working: "正在做…",
      moreItems: ["在侧栏速览", "复制引用", "放进当前文稿", "放进 Shelf", "交给助理", "挂到 Goal", "提醒我"],
      why: "放在这里：", whyGoal: "回答里交回了它，要你验收", whyInbox: "对上了你正在做的「发布 v2」", whyReport: "小林贴了它的链接", whyFailed: "Coding 接了你在讨论里的 @",
      inboxTitle: "Inbox", today: "今天", mountReq: "对上哪条要求（Goals 放在这里的名字片）", mountWho: "交给了谁", mountWhoEmpty: "交给某个插件以后，它接的那一轮出现在这里。", mountOnly: "Inbox 只在这两处接受别人的东西",
      chatQ: "登录跳转那件事怎么样了？顺便看看今天进来的反馈。", chatA1: "在跑，到第 3 步了；", chatA2: "的第 1 条已经交回，等你验收：", chatA3: "今天进来一条要紧的，对上了手机排版：", chatA4: "另外有一轮没过测试：", chatA5: "顺手统计了一下发布说明：", chatA5b: "，2,140 字。", you: "你", assistant: "助理",
      imTitle: "# 发布 v2", imMember: "以成员小周的身份看", im1: "首页改版的报告出来了，大家看看：", im2: "这一轮导出也挂了，", im2b: "一起看了吧", im3: "这条客户反馈要不要先处理？",
      waitTitle: (n) => `等你 ${n}`, waitNote: "这里不放卡片：按梯度降为行，一句话加一个主操作；点进去到对应的卡。", lin: "小林", zhou: "小周",
      degrade: "卡片 → 行",
    },
    en: {
      protoTitle: "Prototype · sample data", scheme: "Option", pos: "Place", fault: "Failure", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      p_spec: "Specimens: form × state", p_plugin: "In a plugin: Inbox", p_chat: "Conversation", p_im: "Project discussion", p_wait: "Waiting on you",
      f_none: "Normal", f_unreadable: "Goals unreadable", f_revoked: "Inbox access revoked", f_deleted: "Coding turn deleted",
      s_running: "In progress", s_decide: "Needs your decision", s_accept: "Needs your review", s_failed: "Failed", s_partial: "Partly done", s_stale: "Out of date", s_denied: "No access", s_deleted: "Deleted", s_none: "", s_undeclared: "Not declared",
      colState: "State", colChip: "Name chip", colRow: "Row", colCard: "Card",
      noAccess: "No access", noAccessBody: (o) => `This is an item in ${o}; you don't have access to it.`, deletedBody: (n) => `“${n}” was deleted.`, fallbackNote: "This plugin hasn't declared how it looks elsewhere: only icon, name, owner and Open.",
      open: "Open", openAt: "Open at the exact spot", putIn: "Put in…", handTo: "Hand to…", more: "More", close: "Close", undo: "Undo", peek: "Peek", sim: "Simulated",
      opened: (l) => `Opened ${l} (simulated)`, simAct: (a) => `“${a}” (simulated)`, working: "Working…",
      moreItems: ["Peek in side pane", "Copy reference", "Put in current document", "Put on Shelf", "Hand to the Assistant", "Attach to a Goal", "Remind me"],
      why: "Here because: ", whyGoal: "the answer handed it back for your review", whyInbox: "it matches “发布 v2”, which you're working on", whyReport: "Lin pasted its link", whyFailed: "Coding took your @ in the discussion",
      inboxTitle: "Inbox", today: "Today", mountReq: "Matches requirement (name chips placed by Goals)", mountWho: "Handed to", mountWhoEmpty: "Once handed to a plugin, the turn it takes shows here.", mountOnly: "Inbox accepts others' things only in these two spots",
      chatQ: "How's the login redirect going? And check today's incoming feedback.", chatA1: "is running, at step 3; ", chatA2: "has requirement 1 back for your review:", chatA3: "One urgent item came in today, matching mobile layout:", chatA4: "And one turn failed its tests:", chatA5: "I also counted the release notes:", chatA5b: ", 2,140 words.", you: "You", assistant: "Assistant",
      imTitle: "# 发布 v2", imMember: "View as member Zhou", im1: "The homepage refresh report is out, take a look:", im2: "The export turn broke too, ", im2b: "please look at it together", im3: "Should we handle this customer feedback first?",
      waitTitle: (n) => `Waiting on you ${n}`, waitNote: "No cards here: they step down to rows — one sentence plus one main action; opening goes to the matching card.", lin: "Lin", zhou: "Zhou",
      degrade: "Card → row",
    },
  };
  const KEY = "molis-proto.intelligent-surfaces-forms.v1";
  const fresh = () => ({ scheme: "B", lang: "zh", theme: "light", pos: "spec", fault: "none", done: {}, sel: "inbox", member: false });
  let S = load();
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const t = (k, ...a) => { const v = T[S.lang][k]; return typeof v === "function" ? v(...a) : v ?? k; };
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const L = (o, k) => (o ? (S.lang === "en" && o[k + "En"] != null ? o[k + "En"] : o[k]) : "");
  const extra = {
    run2: { owner: "coding", title: "修手机上的价格表", titleEn: "Fix the pricing table on phones", state: "running", time: "刚接 · 第 1 步", timeEn: "Just taken · step 1", who: { ai: "Coding", aiVerb: "在做", aiVerbEn: "working" }, summary: "从 Inbox 接来：先在 390 宽度复现。", summaryEn: "Taken from Inbox: reproducing at 390 wide first.", locate: "Coding › 修手机上的价格表", locateEn: "Coding › Fix the pricing table on phones", ops: [], peek: { type: "text", body: "第 1 步：在 390 宽度打开定价页，复现第三列掉行。", bodyEn: "Step 1: open the pricing page at 390 wide and reproduce the third column wrapping." } },
    inbox2: { owner: "inbox", title: "发票抬头写错了", titleEn: "Wrong name on the invoice", state: "none", time: "今天 08:40", timeEn: "Today 08:40", who: { human: "财务", humanEn: "Finance", via: "邮件", viaEn: "Email" }, judge: "可以不回", judgeEn: "No reply needed", summary: "已经自动转给财务。", summaryEn: "Forwarded to finance automatically.", locate: "Inbox › 今天", locateEn: "Inbox › Today", ops: [{ id: "noreply", zh: "不用回", en: "No reply", done: "已标成不用回", doneEn: "Marked no reply", undo: true }] },
    inbox3: { owner: "inbox", title: "播客邀请：聊聊本地优先", titleEn: "Podcast invite: local-first", state: "none", time: "昨天", timeEn: "Yesterday", who: { human: "陈先生", humanEn: "Mr. Chen", via: "邮件", viaEn: "Email" }, judge: "想法", judgeEn: "Idea", summary: "下个月录，问你有没有空。", summaryEn: "Recording next month, asks if you are free.", locate: "Inbox › 昨天", locateEn: "Inbox › Yesterday", ops: [{ id: "idea", zh: "记成想法", en: "Save as idea", done: "已记成想法", doneEn: "Saved as idea", undo: true }] },
  };
  function obj(id) {
    const base = D.objects[id] || extra[id]; if (!base) return null;
    if (S.pos !== "spec") {
      if (S.fault === "unreadable" && id === "goal") return { ...base, state: "stale", time: "最后读到 2 小时前", timeEn: "Last read 2 h ago", ops: D.objects.stale.ops, summary: D.objects.stale.summary, summaryEn: D.objects.stale.summaryEn, was: base.state };
      if (S.fault === "revoked" && base.owner === "inbox") return { owner: "inbox", state: "denied", title: "" };
      if (S.fault === "deleted" && id === "run") return { ...base, state: "deleted" };
      if (S.member && S.pos === "im" && id === "inbox") return { owner: "inbox", state: "denied", title: "" };
    }
    return base;
  }
  const own = (o) => D.owners[o.owner];
  const ownName = (o) => L(own(o), "name");
  const hue = (o) => `style="--hue:var(--h-${o.owner})"`;
  const stLabel = (o) => (o.undeclared ? t("s_undeclared") : t("s_" + o.state));
  const attention = (s) => ["running", "decide", "accept", "failed", "partial", "stale"].includes(s);
  const ownTile = (o, lg = "") => `<span class="own ${lg}" ${hue(o)}>${ic(own(o).icon)}</span>`;
  const whoHtml = (o) => {
    const w = o.who; if (!w) return "";
    if (w.ai) return `<span class="who ai" aria-hidden="true">AI</span><span>${esc(w.ai)} ${esc(L(w, "aiVerb"))}${w.ask ? ` · ${S.lang === "zh" ? "要" : "needs "}${esc(L(w, "ask")).replace(/^你/, S.lang === "zh" ? "你" : "")}` : ""}</span>`;
    return `<span class="who hu" aria-hidden="true">${esc(L(w, "human")).slice(0, 1)}</span><span>${esc(L(w, "human"))} · ${esc(L(w, "via"))}</span>`;
  };

  // ---------- name chip ----------
  function chip(id) {
    const o = obj(id); if (!o) return "";
    if (o.state === "denied") return `<span class="chip gone" aria-label="${t("noAccess")}">${ic("lock", "sm")}<span class="nm">${t("noAccess")}</span></span>`;
    if (o.state === "deleted") return `<span class="chip gone deleted" title="${t("s_deleted")}" aria-label="${esc(L(o, "title"))} · ${t("s_deleted")}">${ic(own(o).icon, "sm")}<span class="nm">${esc(L(o, "title"))}</span></span>`;
    const label = `${ownName(o)} · ${L(o, "title")}${stLabel(o) ? " · " + stLabel(o) : ""}`;
    let inner;
    if (o.undeclared) inner = `${ic(own(o).icon, "sm")}<span class="nm">${esc(L(o, "title"))}</span>`;
    else if (S.scheme === "A") inner = `<span class="ring ${o.state}"></span><span class="nm">${esc(L(o, "title"))}</span>`;
    else if (S.scheme === "B") inner = `${ownTile(o)}<span class="nm">${esc(L(o, "title"))}</span>${attention(o.state) ? `<span class="sd ${o.state}"></span>` : ""}`;
    else inner = `<span class="nm">${esc(L(o, "title"))}</span>${attention(o.state) ? `<span class="sd ${o.state}" style="width:6px;height:6px;border-radius:50%"></span>` : ""}`;
    return `<button type="button" class="chip${o.state === "stale" ? " gone" : ""}" data-act="chip" data-id="${id}" aria-label="${esc(label)}">${inner}</button>`;
  }

  // ---------- operations ----------
  function opBtn(id, op, i, size = "sm") {
    const cls = op.danger ? "danger" : i === 0 ? "primary" : "sec";
    return `<button type="button" class="btn ${size} ${cls}" data-act="op" data-id="${id}" data-op="${op.id}">${esc(op[S.lang])}</button>${op.consequence ? `<span class="cons">${ic("info", "sm")}${esc(L(op, "consequence"))}</span>` : ""}`;
  }
  const moreBtn = (id) => `<button type="button" class="btn icon sm ghost" data-act="more" data-id="${id}" aria-label="${t("more")}">${ic("more", "sm")}</button>`;
  function receipt(id) {
    const o = obj(id), op = (o.ops || []).find((x) => x.id === S.done[id]);
    return `<div class="receipt" role="status">${ic("check", "sm")}<span>${esc(L(op, "done"))}</span><span style="flex:1"></span>${op.undo ? `<button class="link" data-act="undo" data-id="${id}">${t("undo")}</button>` : ""}</div>`;
  }

  // ---------- row ----------
  function row(id, opts = {}) {
    const o = obj(id); if (!o) return "";
    const sel = opts.selectable ? ` role="option" aria-selected="${S.sel === id}" data-act="select" data-id="${id}" tabindex="0"` : "";
    if (o.state === "denied") return `<div class="row2 gone"${sel}>${ic("lock")}<span class="tx"><strong>${t("noAccess")}</strong><span class="m"><span>${esc(t("noAccessBody", ownName(o)))}</span></span></span></div>`;
    if (o.state === "deleted") return `<div class="row2 gone">${ic(own(o).icon)}<span class="tx"><strong>${esc(L(o, "title"))}</strong><span class="m"><span>${esc(ownName(o))} · ${t("s_deleted")}</span></span></span></div>`;
    if (S.done[id] && !opts.keep) return receipt(id);
    if (o.undeclared) return `<div class="row2">${ownTile(o)}<span class="tx"><strong>${esc(L(o, "title"))}</strong><span class="m"><span>${esc(ownName(o))}</span></span></span><span class="rt"><button class="btn sm sec" data-act="open" data-id="${id}">${t("open")}</button></span></div>`;
    const tag = attention(o.state) && o.state !== "running" ? `<span class="stag ${o.state}">${stLabel(o)}</span>` : "";
    const judge = o.judge ? `<span class="judge">${esc(L(o, "judge"))}</span>` : "";
    const prim = (o.ops || [])[0];
    const title = `<strong><button class="link" style="color:inherit;font-weight:inherit;max-width:100%;overflow:hidden;text-overflow:ellipsis" data-act="peek" data-id="${id}">${esc(L(o, "title"))}</button></strong>`;
    let lead = "", meta;
    if (S.scheme === "A") { lead = `<span class="ring ${o.state}"></span>`; meta = `<span>${esc(ownName(o))}</span>·<span>${esc(L(o, "time"))}</span>${o.who ? "·" + whoHtml(o) : ""}`; }
    else if (S.scheme === "B") { lead = ownTile(o, "lg"); meta = `<span>${esc(L(o, "time"))}</span>${o.who ? "·" + whoHtml(o) : ""}`; }
    if (S.scheme === "C") {
      return `<div class="row2"${sel}><span class="tx">${title}<span class="snip">${esc(L(o, "summary"))}</span></span><span class="rt">${judge}${tag}<span class="fact">${esc(L(o, "time"))}</span>${prim ? opBtn(id, prim, 0) : ""}${moreBtn(id)}</span></div>`;
    }
    return `<div class="row2"${sel}>${lead}<span class="tx">${title}<span class="m">${meta}</span></span><span class="rt">${judge}${tag}${prim && !opts.noOp ? opBtn(id, prim, 0) : ""}${moreBtn(id)}</span></div>`;
  }

  // ---------- card ----------
  function bodyBits(o) {
    let b = "";
    if (o.progress) b += `<div class="prog ${o.state}"><span>${esc(L(o.progress, "label"))} ${o.progress.done}/${o.progress.total}</span><span class="bar"><i style="width:${(o.progress.done / o.progress.total) * 100}%"></i></span></div>`;
    if (o.step) b += `<div class="prog"><span>${S.lang === "zh" ? `第 ${o.step.n} 步，共 ${o.step.of} 步` : `Step ${o.step.n} of ${o.step.of}`}</span><span class="bar"><i style="width:${(o.step.n / o.step.of) * 100}%"></i></span></div>`;
    return b;
  }
  function card(id, opts = {}) {
    const o = obj(id); if (!o) return "";
    const why = opts.why ? `<div class="why">${ic("info", "sm")}${t("why")}${esc(t(opts.why))}</div>` : "";
    if (o.state === "denied") return `<div class="card2 gone"><div class="hd">${ic("lock")}<span class="tt">${t("noAccess")}</span></div><p class="sum fact" style="margin:0">${esc(t("noAccessBody", ownName(o)))}</p></div>`;
    if (o.state === "deleted") return `<div class="card2 gone"><div class="hd">${ic(own(o).icon)}<span class="tt" style="color:var(--faint);font-weight:500">${esc(t("deletedBody", L(o, "title")))}</span><span class="stag">${t("s_deleted")}</span></div></div>`;
    if (S.done[id]) return receipt(id);
    if (o.undeclared) return `<div class="card2"><div class="hd">${ownTile(o)}<span class="tt">${esc(L(o, "title"))}</span><button class="btn sm sec" data-act="open" data-id="${id}">${t("open")}</button></div><div class="sub">${esc(ownName(o))} · <span class="tag sim">${t("s_undeclared")}</span></div><p class="fact" style="margin:0">${t("fallbackNote")}</p></div>`;
    const tag = attention(o.state) ? `<span class="stag ${o.state}">${stLabel(o)}</span>` : "";
    const ops = (o.ops || []).map((op, i) => opBtn(id, op, i)).join("") + moreBtn(id);
    const thumb = o.media ? `<span class="thumb${S.scheme === "C" ? " wide" : ""}">${S.lang === "zh" ? "截图" : "Screenshot"}</span>` : "";
    const judge = o.judge ? `<span class="judge">${esc(L(o, "judge"))}</span>` : "";
    const sum = `<p class="sum">${esc(L(o, "summary"))}</p>`;
    if (S.scheme === "A") return `<div class="card2"><div class="hd"><span class="ring ${o.state}"></span><span class="tt"><button class="link" style="color:inherit;font-weight:inherit" data-act="peek" data-id="${id}">${esc(L(o, "title"))}</button></span>${tag}</div><div class="sub">${ic(own(o).icon, "sm")}<span>${esc(ownName(o))}</span>·<span>${esc(L(o, "time"))}</span>${o.who ? "·" + whoHtml(o) : ""}</div>${judge ? `<div>${judge}</div>` : ""}<div class="body"><div>${sum}${bodyBits(o)}</div>${thumb}</div><div class="ft">${ops}</div>${why}</div>`;
    if (S.scheme === "B") return `<div class="card2" ${hue(o)}><div class="strip2">${ownTile(o)}<span>${esc(ownName(o))}</span><span class="fact">· ${esc(L(o, "time"))}</span><span style="flex:1"></span>${tag}</div><div class="inner"><div class="hd"><span class="tt"><button class="link" style="color:inherit;font-weight:inherit" data-act="peek" data-id="${id}">${esc(L(o, "title"))}</button></span></div>${o.who ? `<div class="sub">${whoHtml(o)}</div>` : ""}${judge ? `<div>${judge}</div>` : ""}<div class="body"><div>${sum}${bodyBits(o)}</div>${thumb}</div><div class="ft">${ops}</div>${why}</div></div>`;
    return `<div class="card2">${thumb ? `<div class="lead">${thumb}</div>` : ""}<div class="inner"><div class="tt2"><button class="link" style="color:inherit;font-weight:inherit;text-align:left" data-act="peek" data-id="${id}">${esc(L(o, "title"))}</button></div>${judge ? `<div>${judge}</div>` : ""}${sum}${bodyBits(o)}<div class="ft">${ops}</div>${why}</div><div class="foot"><span class="grow"><span class="ring ${o.state}"></span><span>${stLabel(o)}</span>·${ic(own(o).icon, "sm")}<span>${esc(ownName(o))}</span>·<span>${esc(L(o, "time"))}</span></span>${o.who ? `<span class="grow" style="flex:none;max-width:45%">${whoHtml(o)}</span>` : ""}</div></div>`;
  }

  // ---------- peek ----------
  function peekBody(o) {
    const p = o.peek || {};
    if (o.state === "stale") return `<p class="fact">${esc(L(o, "summary"))}</p>${bodyBits(o)}`;
    if (p.type === "reqs") return p.items.map((r) => `<div class="req"><span class="ring ${r.s}"></span><div><strong style="font-weight:500">${esc(L(r, "t"))}</strong><span class="fact">${esc(L(r, "ev"))}</span></div></div>`).join("");
    if (p.type === "text") return `<p class="quote${p.mono ? " mono" : ""}">${esc(L(p, "body"))}</p>${o.media ? `<div class="thumb" style="width:100%;height:110px;margin-top:8px">${S.lang === "zh" ? "截图" : "Screenshot"}</div>` : ""}`;
    if (p.type === "diff") return `<div class="diff"><div class="fn">${esc(p.file)}</div>${p.lines.map(([k, l]) => `<div class="l ${k === "+" ? "add" : k === "-" ? "del" : ""}">${esc(k + " " + l)}</div>`).join("")}</div>`;
    if (p.type === "shots") return `<div class="shots"><span class="thumb">${S.lang === "zh" ? "首页" : "Home"}</span><span class="thumb">${S.lang === "zh" ? "功能页" : "Features"}</span><span class="thumb" style="border-style:dashed">${S.lang === "zh" ? "定价页 · 未改" : "Pricing · not yet"}</span></div><p class="fact">${esc(L(o, "summary"))}</p>`;
    return `<p class="fact">${esc(L(o, "summary") || t("fallbackNote"))}</p>`;
  }
  function peekHtml(id) {
    const o = obj(id);
    const lead = S.scheme === "B" || o.undeclared ? ownTile(o) : S.scheme === "A" ? `<span class="ring ${o.state}"></span>` : "";
    const tag = attention(o.state) ? `<span class="stag ${o.state}">${stLabel(o)}</span>` : "";
    return `<div class="ph">${lead}<strong>${esc(L(o, "title"))}</strong>${tag}${S.scheme === "C" ? `<button class="btn icon sm ghost" data-act="peek-close" aria-label="${t("close")}">${ic("x", "sm")}</button>` : ""}</div>
      <div class="loc">${ic(own(o).icon, "sm")}${esc(L(o, "locate"))}</div><div class="pb">${o.undeclared ? `<p class="fact">${t("fallbackNote")}</p>` : peekBody(o)}</div>
      <div class="pf"><button class="btn sm primary" data-act="open" data-id="${id}">${ic("external", "sm")}${t("openAt")}</button>${o.undeclared ? "" : `<button class="btn sm sec" data-act="sim" data-label="${t("putIn")}">${t("putIn")}</button><button class="btn sm sec" data-act="sim" data-label="${t("handTo")}">${t("handTo")}</button>`}</div>`;
  }
  let pop = null, hoverT = null, leaveT = null;
  function closePop(restore) { clearTimeout(hoverT); if (!pop) return; const b = pop.back; pop.el.remove(); pop = null; if (restore && b && document.contains(b)) b.focus(); }
  function openPeek(anchor, id, viaHover) {
    const o = obj(id); if (!o || o.state === "denied" || o.state === "deleted") return;
    if (pop && pop.id === id && pop.kind === "peek") return;
    closePop(false);
    const el = document.createElement("div"); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", `${t("peek")} · ${L(o, "title")}`);
    if (S.scheme === "C" && innerWidth > 760) { el.className = "sidepk pk"; el.innerHTML = peekHtml(id); document.querySelector(".frame").appendChild(el); }
    else { el.className = "pop pk"; el.innerHTML = peekHtml(id); document.body.appendChild(el); if (innerWidth > 760) place(el, anchor); }
    pop = { el, back: anchor, id, kind: "peek", hover: viaHover };
    if (!viaHover) el.querySelector("button")?.focus();
  }
  function place(el, anchor) {
    const r = anchor.getBoundingClientRect(); let left = r.left, top = r.bottom + 6;
    left = Math.min(Math.max(8, left), innerWidth - el.offsetWidth - 8);
    if (top + el.offsetHeight > innerHeight - 8) top = Math.max(48, r.top - el.offsetHeight - 6);
    el.style.left = left + "px"; el.style.top = top + "px";
  }
  function openMore(anchor, id) {
    closePop(false);
    const el = document.createElement("div"); el.className = "pop"; el.setAttribute("role", "menu");
    el.innerHTML = `<div class="cap">${esc(L(obj(id), "title"))}</div><button class="mi" role="menuitem" data-act="open" data-id="${id}">${ic("external", "sm")}<span>${t("openAt")}</span></button>` + t("moreItems").map((m) => `<button class="mi" role="menuitem" data-act="sim" data-label="${esc(m)}">${ic("dot", "sm")}<span>${esc(m)}</span></button>`).join("");
    document.body.appendChild(el); pop = { el, back: anchor, id, kind: "menu" };
    const r = anchor.getBoundingClientRect(); el.style.left = Math.max(8, Math.min(r.right - el.offsetWidth, innerWidth - el.offsetWidth - 8)) + "px"; el.style.top = (r.bottom + el.offsetHeight + 8 > innerHeight ? r.top - el.offsetHeight - 6 : r.bottom + 6) + "px"; el.querySelector("button").focus();
  }

  // ---------- places ----------
  const ids = (list) => list.filter((id) => obj(id));
  function specView() {
    const head = `<div class="h">${t("colState")}</div><div class="h">${t("colChip")}</div><div class="h">${t("colRow")}</div><div class="h cardcol">${t("colCard")}</div>`;
    const cells = D.stateOrder.map((st) => { const id = D.stateObj[st], o = obj(id); return `<div class="c lab"><span>${t("s_" + st)}</span><span class="fact">${esc(ownName(o))}</span></div><div class="c chipcol">${chip(id)}</div><div class="c rowcol">${row(id, { keep: true })}</div><div class="c cardcol">${card(id)}</div>`; }).join("");
    return `<div class="fhead">${t("p_spec")}<span class="tag sim simnote">${t("sim")}</span></div><div class="spec">${head}${cells}</div>`;
  }
  function pluginView() {
    const list = ["inbox", "inbox2", "inbox3"], sel = obj(S.sel) ? S.sel : "inbox", o = obj(sel);
    let det;
    if (o.state === "denied") det = card(sel);
    else det = `<div style="display:flex;gap:8px;align-items:center">${o.judge ? `<span class="judge">${esc(L(o, "judge"))}</span>` : ""}${attention(o.state) ? `<span class="stag ${o.state}">${stLabel(o)}</span>` : ""}</div><h2>${esc(L(o, "title"))}</h2><div class="fact" style="display:flex;gap:6px;align-items:center">${whoHtml(o)}·<span>${esc(L(o, "time"))}</span></div>${o.peek ? `<div class="pk">${peekBody(o)}</div>` : `<p>${esc(L(o, "summary"))}</p>`}
      <div class="ft" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${S.done[sel] ? receipt(sel) : (o.ops || []).map((op, i) => opBtn(sel, op, i, "")).join("")}</div>
      ${sel === "inbox" ? `<div class="mount"><div class="mh">${ic("target", "sm")}${t("mountReq")}</div><div>${chip("goal")}</div></div><div class="mount"><div class="mh">${ic("code", "sm")}${t("mountWho")}</div>${S.done.inbox === "handoff" ? `<div>${chip("run2")}</div>` : `<div class="fact">${t("mountWhoEmpty")}</div>`}</div><div class="fact">${ic("info", "sm")} ${t("mountOnly")}</div>` : ""}`;
    return `<div class="fhead">${ic("inbox", "sm")}${t("inboxTitle")}<span class="tag sim simnote">${t("sim")}</span></div><div class="two"><div class="lst" role="listbox" aria-label="${t("inboxTitle")}"><div class="lsth">${t("today")}</div>${list.map((id) => row(id, { selectable: true, keep: true, noOp: true })).join("")}</div><div class="det">${det}</div></div>`;
  }
  function msg(who, name, time, body, me) {
    const av = who === "ai" ? `<span class="av ai">AI</span>` : `<span class="av">${esc(name.slice(0, 1))}</span>`;
    if (me) return `<div class="msg me"><div class="bub">${body}</div></div>`;
    return `<div class="msg">${av}<div class="mb"><div class="mn">${esc(name)}<span class="fact">${esc(time)}</span></div>${body}</div></div>`;
  }
  function chatView() {
    const a = `<div class="txt">${chip("run")} ${t("chatA1")}${chip("goal")} ${t("chatA2")}</div>${card("goal", { why: "whyGoal" })}<div class="txt">${t("chatA3")}</div>${card("inbox", { why: "whyInbox" })}<div class="txt">${t("chatA4")}</div>${row("failed")}<div class="txt">${t("chatA5")} ${chip("undeclared")}${t("chatA5b")}</div>`;
    return `<div class="fhead">${ic("sparkles", "sm")}${t("assistant")}<span class="tag sim simnote">${t("sim")}</span></div><div class="thread">${msg("h", t("you"), "", esc(t("chatQ")), true)}${msg("ai", t("assistant"), "09:30", a)}</div>`;
  }
  function imView() {
    const body = msg("h", t("lin"), "09:02", `<div class="txt">${t("im1")}</div>${card("report", { why: "whyReport" })}`) + msg("h", t("you"), "09:10", `<div class="txt">${t("im2")}<strong>@Coding</strong> ${t("im2b")}</div>${card("failed", { why: "whyFailed" })}`) + msg("h", t("zhou"), "09:21", `<div class="txt">${t("im3")}</div>${card("inbox")}`);
    return `<div class="fhead">${ic("review", "sm")}${t("imTitle")}<span class="simnote" style="display:flex;gap:8px;align-items:center"><label class="fact" style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-act="member" ${S.member ? "checked" : ""}>${t("imMember")}</label><span class="tag sim">${t("sim")}</span></span></div><div class="thread">${body}</div>`;
  }
  function waitView() {
    const list = ids(["goal", "inbox", "report", "failed"]).filter((id) => attention(obj(id).state) || obj(id).state === "denied");
    return `<div class="fhead">${ic("waiting", "sm")}${t("waitTitle", list.filter((id) => !S.done[id]).length)}<span class="tag sim simnote">${t("sim")}</span></div><div class="wait"><div class="bar2">${ic("info", "sm")}<span>${t("waitNote")}</span><span style="flex:1"></span><span class="degrade">${ic("rows", "sm")}${t("degrade")}</span></div>${list.map((id) => row(id)).join("")}</div>`;
  }

  function render() {
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en"; document.documentElement.dataset.theme = S.theme;
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = t(n.dataset.t)));
    for (const b of document.querySelectorAll("#scheme button")) b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme);
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    document.getElementById("pos").innerHTML = ["spec", "plugin", "chat", "im", "wait"].map((v) => `<option value="${v}"${v === S.pos ? " selected" : ""}>${t("p_" + v)}</option>`).join("");
    const f = document.getElementById("fault"); f.innerHTML = ["none", "unreadable", "revoked", "deleted"].map((v) => `<option value="${v}"${v === S.fault ? " selected" : ""}>${t("f_" + v)}</option>`).join(""); f.disabled = S.pos === "spec";
    const v = { spec: specView, plugin: pluginView, chat: chatView, im: imView, wait: waitView }[S.pos]();
    document.getElementById("app").className = "stage s-" + S.scheme;
    document.getElementById("app").innerHTML = `<div class="frame">${v}</div>`;
    save();
  }

  // ---------- events ----------
  let toastT;
  function toast(msg) { document.querySelector(".toast")?.remove(); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3500); }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set]");
    if (pop && !e.target.closest(".pop,.sidepk") && !(b && b === pop.back)) closePop(false);
    if (!b) return;
    if (b.dataset.scheme) { S.scheme = b.dataset.scheme; closePop(false); return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; closePop(false); return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    const { act, id } = b.dataset;
    switch (act) {
      case "chip": case "open": { const o = obj(id); closePop(false); return toast(t("opened", L(o, "locate"))); }
      case "peek": e.preventDefault(); return pop && pop.id === id ? closePop(true) : openPeek(b, id, false);
      case "peek-close": return closePop(true);
      case "more": e.stopPropagation(); return pop && pop.kind === "menu" && pop.id === id ? closePop(true) : openMore(b, id);
      case "sim": closePop(true); return toast(t("simAct", b.dataset.label));
      case "select": S.sel = id; return render();
      case "member": S.member = b.checked; return render();
      case "op": {
        if (b.classList.contains("busy")) return; // a second click while running does nothing (IUI-08)
        const op = (obj(id).ops || []).find((x) => x.id === b.dataset.op);
        b.classList.add("busy"); b.textContent = t("working");
        setTimeout(() => { if (["accept", "handoff", "idea", "noreply", "reply", "stop"].includes(op.id)) S.done[id] = op.id; render(); toast(L(op, "done")); }, 650);
        return;
      }
      case "undo": delete S.done[id]; return render();
    }
  });
  document.addEventListener("mouseover", (e) => {
    const c = e.target.closest('[data-act="chip"]');
    if (c) { clearTimeout(leaveT); clearTimeout(hoverT); hoverT = setTimeout(() => openPeek(c, c.dataset.id, true), 380); return; }
    if (pop && pop.hover && !e.target.closest(".pk")) { clearTimeout(hoverT); clearTimeout(leaveT); leaveT = setTimeout(() => { if (pop && pop.hover) closePop(false); }, 260); }
    else if (e.target.closest(".pk")) clearTimeout(leaveT);
  });
  document.addEventListener("focusin", (e) => { const c = e.target.closest('[data-act="chip"]'); if (c && e.target.matches(":focus-visible")) { clearTimeout(hoverT); hoverT = setTimeout(() => openPeek(c, c.dataset.id, true), 300); } });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && pop) { closePop(true); e.preventDefault(); return; }
    if (pop && pop.kind === "menu" && (e.key === "ArrowDown" || e.key === "ArrowUp")) { const its = [...pop.el.querySelectorAll(".mi")]; const i = its.indexOf(document.activeElement); its[(i + (e.key === "ArrowDown" ? 1 : -1) + its.length) % its.length].focus(); e.preventDefault(); }
    if (e.key === " " && e.target.closest('[data-act="chip"]') && pop && pop.hover) { pop.hover = false; pop.el.querySelector("button")?.focus(); e.preventDefault(); }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches('[data-act="select"]')) { S.sel = e.target.dataset.id; render(); document.querySelector(`[data-act="select"][data-id="${S.sel}"]`)?.focus(); e.preventDefault(); }
  });
  document.getElementById("pos").addEventListener("change", (e) => { S.pos = e.target.value; closePop(false); render(); });
  document.getElementById("fault").addEventListener("change", (e) => { S.fault = e.target.value; closePop(false); render(); });
  document.getElementById("reset").addEventListener("click", () => { const keep = { lang: S.lang, theme: S.theme, scheme: S.scheme, pos: S.pos }; S = { ...fresh(), ...keep }; closePop(false); render(); });
  render();
})();
