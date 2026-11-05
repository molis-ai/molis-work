// 03 · 连续对话与后台任务定样 — a scripted, clickable slice. Nothing calls a model or a Home; every task state is simulated.
(() => {
  document.getElementById("icons").innerHTML = window.protoIcons;
  const T = {
    zh: {
      protoTitle: "原型 · 模拟数据", scheme: "方案", fault: "情况", lang: "语言", theme: "外观", light: "浅", dark: "深", reset: "重置", step: "剧本",
      f_none: "正常", f_queue: "排队（同时只跑 1 项）", f_fail: "第一项失败", f_offline: "断线后恢复",
      steps: ["开始：还没交办", "① 连续交办两项", "② 问另一个问题", "③ 查看并补充第一项", "④ 第二项要你定", "⑤ 第一项完成", "⑥ 回到主对话"],
      prev: "上一步", next: "下一步",
      assistant: "助理", doc: "发布说明草稿", sendTo: "发给：", toAssistant: "助理", send: "发送", stopReply: "停止这次回复", replyStopped: "这次回复停了；后台的任务没有停。",
      u1: "把定价页改成三档，再把发布说明草稿写完。", u2: "对了，上周的访谈里有人提过价格吗？", supp: "企业版价格先写「联系我们」。",
      a1a: "好，两件：", a1b: "交给 Coding，已经开始；", a1c: "我来写，", a1run: "也开始了。", a1queue: "在排队，等上一件做完再开始（现在同时只跑 1 项）。", a1d: "有要你定的我会在这里问，你可以接着说别的。",
      a2: "提过两次：访谈 02 说「专业版有点贵」，访谈 03 问有没有年付。都在项目资料「用户访谈」里。", a2note: "这句我直接答了，没有开新任务。",
      suppNote: (n) => `你给「${n}」补了一句`, rcptGot: "已收到 · 下一步开始时用上", rcptUsed: "已用上",
      decQ: "要不要写一节「旧版迁移」？", decWhy: "旧版用户大约 30 家；写的话多一节，晚 10 分钟左右。", decYes: "写一节", decNo: "不写", decLater: "先放着", decBind: (n) => `只作用于「${n}」`, decAnswered: (a) => `你选了「${a}」`,
      a5: (n) => `「${n}」做完了：`, a5fail: (n) => `「${n}」没做完：`, a5wait: (n) => `「${n}」还在等你定。`,
      resTitle: "定价页改成三档", resSum: "三档并排，企业版写「联系我们」；1440、1024、390 三种宽度都截了图。", accept: "验收", again: "再改改", retry: "重试这一步", seeWhy: "看哪里没过",
      failSum: "截图核对没过：390 宽度下第三档还是掉到下一行。改动没有提交，前两步的结果留着。",
      tasks: "任务", running: "进行中", queued: "排队", waitYou: "等你", doneN: "完成", noTasks: "没有任务", now: "现在", earlier: "做完的",
      st_queued: "已接单 · 排队", st_running: "在做", st_wait: "等你决定", st_done: "完成 · 等你验收", st_failed: "失败", st_pausing: "正在暂停", st_paused: "已暂停", st_stopping: "正在停止", st_stopped: "已停止", st_unknown: "断线 · 待核对",
      t1: "定价页改成三档", t2: "写完发布说明", t1x: "定价页三档并排，三种宽度都不掉行", t2x: "发布说明六节写完，能拿去过目",
      s11: "读现有定价页", s12: "改成三档布局", s13: "三种宽度截图核对", s14: "交回给你",
      s21: "列提纲", s22: "写前三节", s23: "写第 4 节", s24: "通读一遍",
      scope: "范围", expect: "要做成", who: "谁在做", src: "来自", status: "状态", nowDoing: "正在做", waitFor: "在等", result: "成果", yourAdds: "你的补充", used: "用量",
      scopeV: "项目「网站改版」", queueWhy: "本机同时只跑 1 项（设置里可改）；前面是「定价页改成三档」", unknownWhy: "最后更新 09:41；重连后先核对，不会重复派出",
      add: "补充", addPh: "补一句要求，下一步开始时用上", pause: "暂停", resume: "继续", stop: "停止", takeover: "在 Coding 里接手", talkTo: "对这项任务说", back: "主对话", newMsgs: (n) => `${n} 条新`,
      stopNote: "已写的三节留在文稿里", pausedNote: "停在这一步之后，点继续接着做",
      offline: "和本机服务断开了，任务状态暂时读不到（最后更新 09:41）。", reconnect: "重连", reconciled: "重连了：核对过，定价页还在跑，没有重复派出。",
      sim: "模拟", free: "（原型只演示剧本里的几句；这句没有处理。）", toTask: (n) => `对「${n}」说`, gotIt: "收到，记到这项任务上了。", stepsLeft: (a, b) => `第 ${a} 步，共 ${b} 步`,
      ai: "AI",
    },
    en: {
      protoTitle: "Prototype · sample data", scheme: "Option", fault: "Situation", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset", step: "Script",
      f_none: "Normal", f_queue: "Queued (one at a time)", f_fail: "First task fails", f_offline: "Disconnect and recover",
      steps: ["Start: nothing handed off", "① Hand off two tasks", "② Ask something else", "③ Open and add to task 1", "④ Task 2 needs you", "⑤ Task 1 finishes", "⑥ Back to the conversation"],
      prev: "Back", next: "Next",
      assistant: "Assistant", doc: "Release notes draft", sendTo: "To: ", toAssistant: "Assistant", send: "Send", stopReply: "Stop this reply", replyStopped: "This reply stopped; background tasks did not.",
      u1: "Make the pricing page three tiers, and finish the release notes draft.", u2: "By the way, did anyone mention pricing in last week's interviews?", supp: "For Enterprise, write “Contact us” for now.",
      a1a: "Sure, two things: ", a1b: " goes to Coding and has started; ", a1c: " I'll write — ", a1run: "started too.", a1queue: "it's queued until the first is done (one at a time right now).", a1d: " I'll ask here if you need to decide anything; keep talking about other things.",
      a2: "Twice: interview 02 said “Pro is a bit pricey”, and interview 03 asked about yearly billing. Both are in Materials › User interviews.", a2note: "I answered this directly; no new task.",
      suppNote: (n) => `You added a line to “${n}”`, rcptGot: "Received · used when the next step starts", rcptUsed: "Used",
      decQ: "Add a “Legacy migration” section?", decWhy: "About 30 legacy customers; it adds a section and about 10 more minutes.", decYes: "Add it", decNo: "Skip it", decLater: "Later", decBind: (n) => `Only for “${n}”`, decAnswered: (a) => `You chose “${a}”`,
      a5: (n) => `“${n}” is done:`, a5fail: (n) => `“${n}” didn't finish:`, a5wait: (n) => `“${n}” is still waiting for you.`,
      resTitle: "Pricing page in three tiers", resSum: "Three tiers side by side, Enterprise says “Contact us”; screenshots at 1440, 1024 and 390.", accept: "Review", again: "Revise", retry: "Retry this step", seeWhy: "See what failed",
      failSum: "Screenshot check failed: at 390 the third tier still wraps. Nothing committed; the first two steps are kept.",
      tasks: "Tasks", running: "Running", queued: "Queued", waitYou: "Need you", doneN: "Done", noTasks: "No tasks", now: "Now", earlier: "Finished",
      st_queued: "Taken · queued", st_running: "Working", st_wait: "Needs your decision", st_done: "Done · needs review", st_failed: "Failed", st_pausing: "Pausing", st_paused: "Paused", st_stopping: "Stopping", st_stopped: "Stopped", st_unknown: "Disconnected · to check",
      t1: "Pricing page in three tiers", t2: "Finish the release notes", t1x: "Three tiers side by side, no wrapping at any width", t2x: "All six sections written, ready for review",
      s11: "Read the current pricing page", s12: "Lay out three tiers", s13: "Check screenshots at three widths", s14: "Hand back to you",
      s21: "Outline", s22: "Write sections 1–3", s23: "Write section 4", s24: "Read through",
      scope: "Scope", expect: "Outcome", who: "Doing it", src: "From", status: "Status", nowDoing: "Now", waitFor: "Waiting for", result: "Result", yourAdds: "Your additions", used: "Usage",
      scopeV: "Project “网站改版”", queueWhy: "One task at a time on this machine (change in Settings); “Pricing page in three tiers” is ahead", unknownWhy: "Last update 09:41; checked first after reconnecting, never sent twice",
      add: "Add", addPh: "Add a requirement; used when the next step starts", pause: "Pause", resume: "Resume", stop: "Stop", takeover: "Take over in Coding", talkTo: "Talk to this task", back: "Conversation", newMsgs: (n) => `${n} new`,
      stopNote: "The three written sections stay in the document", pausedNote: "Stopped after this step; Resume to continue",
      offline: "Lost the connection to the local service; task states can't be read right now (last update 09:41).", reconnect: "Reconnect", reconciled: "Reconnected and checked: pricing is still running, nothing was sent twice.",
      sim: "Simulated", free: "(The prototype only plays the scripted lines; this one wasn't handled.)", toTask: (n) => `To “${n}”`, gotIt: "Got it, added to this task.", stepsLeft: (a, b) => `Step ${a} of ${b}`,
      ai: "AI",
    },
  };
  const KEY = "molis-proto.assistant-background-tasks.v1";
  const fresh = () => ({ scheme: "A", lang: "zh", theme: "light", step: 0, fault: "none", view: "chat", open: false, decision: null, t1ctl: null, t2ctl: null, offline: true, target: null, seenAt: 0, showDoc: false, expanded: null, accepted: false });
  let S = load(), typing = false, typingT = null;
  function load() { try { return { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return fresh(); } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage may be unavailable */ } }
  const t = (k, ...a) => { const v = T[S.lang][k]; return typeof v === "function" ? v(...a) : v ?? k; };
  const ic = (n, c = "") => `<svg class="i ${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const OWN = { coding: { name: "Coding", icon: "code" }, pages: { name: "Pages", icon: "note" } };
  const offlineNow = () => S.fault === "offline" && S.offline && S.step >= 2;

  // ---------- task facts (derived from the script step and the user's controls) ----------
  function tasks() {
    if (S.step < 1) return [];
    const st = S.step, q = S.fault === "queue";
    const t1 = { id: "t1", owner: "coding", title: t("t1"), expect: t("t1x"), steps: [t("s11"), t("s12"), t("s13"), t("s14")], src: t("u1"), adds: S.step >= 3 ? [t("supp")] : [], used: "≈ 0.4 M tokens" };
    t1.cur = st <= 1 ? 0 : st <= 3 ? 1 : 2;
    t1.state = "running";
    if (st >= 5) { if (S.fault === "fail") { t1.state = "failed"; t1.cur = 2; } else { t1.state = "done"; t1.cur = 4; } }
    if (S.t1ctl && t1.state === "running") t1.state = S.t1ctl;
    const t2 = { id: "t2", owner: "pages", title: t("t2"), expect: t("t2x"), steps: [t("s21"), t("s22"), t("s23"), t("s24")], src: t("u1"), adds: [], used: "≈ 0.1 M tokens" };
    if (q && st < 5) { t2.state = "queued"; t2.cur = 0; }
    else { t2.cur = st <= 1 ? 0 : st <= 3 ? 1 : 2; t2.state = st >= 4 && !S.decision ? "wait" : "running"; if (q && st >= 5) t2.state = S.decision ? "running" : "wait"; }
    if (S.t2ctl && !["queued"].includes(t2.state)) t2.state = S.t2ctl;
    const list = [t1, t2];
    if (offlineNow()) list.forEach((x) => { if (["running", "queued", "pausing", "stopping"].includes(x.state)) { x.was = x.state; x.state = "unknown"; } });
    return list;
  }
  const task = (id) => tasks().find((x) => x.id === id);
  const ring = (s) => ({ queued: "none", running: "running", wait: "accept", done: "done", failed: "failed", pausing: "running", paused: "stale", stopping: "running", stopped: "stale", unknown: "stale" })[s];
  const stLabel = (x) => t("st_" + x.state);
  function stepLine(x) {
    if (x.state === "queued") return t("queueWhy");
    if (x.state === "unknown") return t("unknownWhy");
    if (x.state === "wait") return t("decQ");
    if (x.state === "done") return t("resSum");
    if (x.state === "failed") return t("failSum");
    if (x.state === "stopped") return t("stopNote");
    if (x.state === "paused") return t("pausedNote");
    return `${t("stepsLeft", x.cur + 1, x.steps.length)} · ${x.steps[x.cur]}`;
  }
  const counts = () => { const l = tasks(); return { run: l.filter((x) => ["running", "pausing", "stopping", "unknown"].includes(x.state)).length, q: l.filter((x) => x.state === "queued").length, you: l.filter((x) => ["wait", "done", "failed"].includes(x.state) && !(x.id === "t1" && S.accepted)).length }; };
  const ownTile = (x) => `<span class="own" style="--hue:var(--h-${x.owner === "coding" ? "coding" : "goals"})">${ic(OWN[x.owner].icon)}</span>`;
  const chip = (x) => `<button class="chip" data-act="task" data-id="${x.id}" aria-label="${esc(OWN[x.owner].name)} · ${esc(x.title)} · ${esc(stLabel(x))}">${ownTile(x)}<span class="nm">${esc(x.title)}</span><span class="sd ${ring(x.state) === "accept" ? "accept" : ring(x.state)}"></span></button>`;
  function trow(x) {
    const unread = ["done", "failed", "wait"].includes(x.state) && S.view !== "task:" + x.id;
    return `<button class="trow" data-act="task" data-id="${x.id}" aria-current="${S.view === "task:" + x.id}"><span class="ring ${ring(x.state)}"></span><span class="tx"><strong>${esc(x.title)}</strong><span class="fact">${esc(stLabel(x))} · ${esc(stepLine(x))}</span></span>${unread ? `<span class="unread" aria-label="unread"></span>` : ""}${ownTile(x)}</button>`;
  }
  function listHtml() {
    const l = tasks(); if (!l.length) return `<div class="empty" style="padding:16px"><p class="fact">${t("noTasks")}</p></div>`;
    const done = l.filter((x) => (x.state === "done" && S.accepted) || x.state === "stopped"), now = l.filter((x) => !done.includes(x));
    return `${now.length ? `<div class="lh">${t("now")}</div>${now.map(trow).join("")}` : ""}${done.length ? `<div class="lh">${t("earlier")}</div>${done.map(trow).join("")}` : ""}`;
  }
  function detailHtml(x) {
    const steps = x.steps.map((s, i) => `<div class="st ${i < x.cur ? "" : i === x.cur && !["done"].includes(x.state) ? "cur" : "todo"}"><span class="ring ${i < x.cur || x.state === "done" ? "done" : i === x.cur ? ring(x.state) : "none"}"></span>${esc(s)}</div>`).join("");
    const running = ["running", "wait"].includes(x.state);
    const ctl = [];
    if (x.state === "wait") ctl.push(decisionHtml(true));
    if (running) ctl.push(`<div class="inrow"><textarea id="addtxt" rows="1" placeholder="${t("addPh")}" aria-label="${t("add")}">${S.step === 2 && x.id === "t1" ? esc(t("supp")) : ""}</textarea><button class="btn sec" data-act="add" data-id="${x.id}">${t("add")}</button></div>`);
    const btns = [];
    if (x.state === "running") btns.push(`<button class="btn sm sec" data-act="pause" data-id="${x.id}">${t("pause")}</button>`);
    if (x.state === "paused") btns.push(`<button class="btn sm primary" data-act="resume" data-id="${x.id}">${t("resume")}</button>`);
    if (["running", "wait", "paused", "queued"].includes(x.state)) btns.push(`<button class="btn sm danger" data-act="stop" data-id="${x.id}">${t("stop")}</button>`);
    if (x.owner === "coding" && x.state !== "stopped") btns.push(`<button class="btn sm sec" data-act="sim" data-label="${t("takeover")}">${t("takeover")}</button>`);
    if (running && S.scheme !== "C") btns.push(`<button class="btn sm ghost" data-act="talk" data-id="${x.id}">${ic("review", "sm")}${t("talkTo")}</button>`);
    if (x.state === "done" && !S.accepted) btns.unshift(`<button class="btn sm primary" data-act="accept">${t("accept")}</button><button class="btn sm sec" data-act="sim" data-label="${t("again")}">${t("again")}</button>`);
    if (x.state === "failed") btns.unshift(`<button class="btn sm primary" data-act="sim" data-label="${t("retry")}">${t("retry")}</button><button class="btn sm sec" data-act="sim" data-label="${t("seeWhy")}">${t("seeWhy")}</button>`);
    return `<div style="display:flex;gap:8px;align-items:center"><span class="ring ${ring(x.state)}"></span><h3>${esc(x.title)}</h3></div>
      <dl class="kv"><dt>${t("status")}</dt><dd><span class="stag ${ring(x.state) === "accept" ? "accept" : ring(x.state) === "failed" ? "failed" : ring(x.state) === "running" ? "running" : ""}">${esc(stLabel(x))}</span></dd><dt>${["queued", "unknown", "wait"].includes(x.state) ? t("waitFor") : t("nowDoing")}</dt><dd>${esc(stepLine(x))}</dd><dt>${t("expect")}</dt><dd>${esc(x.expect)}</dd><dt>${t("scope")}</dt><dd>${t("scopeV")}</dd><dt>${t("who")}</dt><dd style="display:flex;gap:6px;align-items:center"><span class="who ai">AI</span>${esc(OWN[x.owner].name)}</dd><dt>${t("src")}</dt><dd class="fact">“${esc(x.src)}”</dd>${x.adds.length ? `<dt>${t("yourAdds")}</dt><dd>${x.adds.map((a) => `“${esc(a)}” <span class="rcpt ${S.step >= 4 ? "" : "pending"}">${ic(S.step >= 4 ? "check" : "clock", "sm")}${S.step >= 4 ? t("rcptUsed") : t("rcptGot")}</span>`).join("<br>")}</dd>` : ""}<dt>${t("used")}</dt><dd class="fact">${x.used} <span class="tag sim">${t("sim")}</span></dd></dl>
      <div class="steps">${steps}</div>${x.state === "done" ? resultCard(x, true) : ""}${ctl.join("")}<div class="ctrls">${btns.join("")}</div>`;
  }
  function decisionHtml(inDetail) {
    const a = S.decision;
    const opts = [["yes", t("decYes")], ["no", t("decNo")], ["later", t("decLater")]];
    return `<div class="decide${a ? " answered" : ""}"><div class="q">${a ? "" : ic("question", "sm") + " "}${t("decQ")}</div>${a ? `<div class="mini">${ic("check", "sm")}${esc(t("decAnswered", opts.find((o) => o[0] === a)[1]))}<span style="flex:1"></span><button class="link" data-act="undo-dec">${S.lang === "zh" ? "改" : "Change"}</button></div>` : `<div class="fact">${t("decWhy")}</div><div class="opts">${opts.map((o, i) => `<button class="btn sm ${i === 0 ? "primary" : "sec"}" data-act="decide" data-v="${o[0]}">${esc(o[1])}</button>`).join("")}</div>`}<div class="bind">${ic("pin", "sm")}${esc(t("decBind", t("t2")))}${inDetail ? "" : ""}</div></div>`;
  }
  function resultCard(x, compact) {
    const ok = x.state === "done";
    if (ok && S.accepted) return `<div class="receipt">${ic("check", "sm")}<span>${S.lang === "zh" ? "已验收「定价页改成三档」" : "Accepted “Pricing page in three tiers”"}</span></div>`;
    return `<div class="card2" style="--hue:var(--h-coding);max-width:none"><div class="strip2">${ownTile(x)}<span>Coding</span><span class="fact">· 09:52</span><span style="flex:1"></span><span class="stag ${ok ? "accept" : "failed"}">${esc(stLabel(x))}</span></div><div class="inner"><div class="hd"><span class="tt">${esc(t("resTitle"))}</span></div><p class="sum">${esc(ok ? t("resSum") : t("failSum"))}</p>${ok && !compact ? `<div class="shots"><span class="thumb">1440</span><span class="thumb">1024</span><span class="thumb">390</span></div>` : ""}<div class="ft">${ok ? `<button class="btn sm primary" data-act="accept">${t("accept")}</button><button class="btn sm sec" data-act="sim" data-label="${t("again")}">${t("again")}</button>` : `<button class="btn sm primary" data-act="sim" data-label="${t("retry")}">${t("retry")}</button><button class="btn sm sec" data-act="sim" data-label="${t("seeWhy")}">${t("seeWhy")}</button>`}${compact ? "" : `<button class="btn sm ghost" data-act="task" data-id="t1">${S.lang === "zh" ? "看过程" : "See steps"}</button>`}</div></div></div>`;
  }
  // in-conversation live card (option C)
  function tcard(x) {
    const open = S.expanded === x.id;
    return `<div class="tcard" id="card-${x.id}" style="--hue:var(--h-${x.owner === "coding" ? "coding" : "goals"})"><div class="strip2">${ownTile(x)}<span>${esc(OWN[x.owner].name)}</span><span style="flex:1"></span><span class="stag ${ring(x.state) === "accept" ? "accept" : ring(x.state) === "failed" ? "failed" : ring(x.state) === "running" ? "running" : ""}">${esc(stLabel(x))}</span></div><div class="inner">${open ? detailHtml(x) : `<div class="hd"><span class="ring ${ring(x.state)}"></span><span class="tt">${esc(x.title)}</span></div><div class="fact">${esc(stepLine(x))}</div><div class="ft"><button class="btn sm sec" data-act="expand" data-id="${x.id}">${S.lang === "zh" ? "展开" : "Expand"}</button></div>`}${open ? `<div class="ft"><button class="btn sm ghost" data-act="expand" data-id="${x.id}">${S.lang === "zh" ? "收起" : "Collapse"}</button></div>` : ""}</div></div>`;
  }

  // ---------- conversation ----------
  function messages() {
    const out = [], l = tasks(), [t1, t2] = l;
    const me = (txt, k) => out.push({ k, html: `<div class="m2 me"><div class="bub">${esc(txt)}<div class="meta" style="justify-content:flex-end">${ic("check", "sm")}${S.lang === "zh" ? "已送达" : "Delivered"}</div></div></div>` });
    const ai = (html, k) => out.push({ k, html: `<div class="m2${k > S.seenAt && S.view !== "chat" ? " new" : ""}"><span class="av ai">AI</span><div class="body">${html}</div></div>` });
    if (S.step >= 1) { me(t("u1"), 1); ai(`<div>${t("a1a")}${chip(t1)}${t("a1b")}${chip(t2)}${t("a1c")}${S.fault === "queue" ? t("a1queue") : t("a1run")}${t("a1d")}</div>${S.scheme === "C" ? l.map(tcard).join("") : ""}`, 1); }
    if (S.step >= 2) { me(t("u2"), 2); ai(`<div>${t("a2")}</div><div class="fact">${ic("info", "sm")} ${t("a2note")}</div>`, 2); }
    if (S.step >= 3) out.push({ k: 3, html: `<div class="mini" style="justify-content:center">${ic("plus", "sm")}${esc(t("suppNote", t("t1")))} · <span class="rcpt ${S.step >= 4 ? "" : "pending"}">${S.step >= 4 ? t("rcptUsed") : t("rcptGot")}</span></div>` });
    if (S.step >= 4 && t2.state !== "stopped") ai(`<div>${chip(t2)} ${S.lang === "zh" ? "写到第 4 节，要你定一件事：" : "reached section 4 and needs one decision:"}</div>${decisionHtml(false)}`, 4);
    if (S.step >= 5) ai(`<div>${t1.state === "failed" ? t("a5fail", t1.title) : t("a5", t1.title)}</div>${resultCard(t1, false)}${t2.state === "wait" ? `<div class="fact">${esc(t("a5wait", t2.title))}</div>` : ""}`, 5);
    return out;
  }
  function convHtml() {
    const msgs = messages().map((m) => m.html).join("");
    const empty = !msgs ? `<div class="empty" style="padding:24px"><p class="fact">${S.lang === "zh" ? "交代一件事，或者问点什么。" : "Hand off something, or ask a question."}</p></div>` : "";
    return `<div class="conv" id="conv">${empty}${msgs}${typing ? `<div class="m2"><span class="av ai">AI</span><div class="body"><span class="typing"><i></i><i></i><i></i></span></div></div>` : ""}</div>`;
  }
  function scriptedLine() { return S.step === 0 ? t("u1") : S.step === 1 ? t("u2") : ""; }
  function composer() {
    const tgt = S.target ? task(S.target) : null;
    const chipsC = S.scheme === "C" && tasks().length ? `<div class="runrow">${tasks().map((x) => `<button class="rchip" data-act="jump" data-id="${x.id}"><span class="ring ${ring(x.state)}"></span>${esc(x.title)}<span class="fact">${esc(stLabel(x))}</span></button>`).join("")}</div>` : "";
    return `${chipsC}<div class="comp"><div class="target">${t("sendTo")}<span class="to">${tgt ? ownTile(tgt) + esc(t("toTask", tgt.title)) + `<button data-act="untalk" aria-label="${t("back")}">${ic("x", "sm")}</button>` : `<span class="av ai" style="width:16px;height:16px;font-size:9px;border-radius:4px">AI</span>${t("toAssistant")}`}</span></div><div class="inrow"><textarea id="msg" rows="1" aria-label="${t("send")}">${esc(scriptedLine())}</textarea>${typing ? `<button class="btn sec" data-act="stopreply">${t("stopReply")}</button>` : ""}<button class="btn primary icon" data-act="send" aria-label="${t("send")}">${ic("send", "sm")}</button></div></div>`;
  }
  function summaryBtn() {
    const c = counts();
    return `${ic("list", "sm")}<span class="cnt"><b>${t("tasks")}</b></span>${c.run ? `<span class="cnt"><span class="ring running"></span>${t("running")} ${c.run}</span>` : ""}${c.q ? `<span class="cnt"><span class="ring none"></span>${t("queued")} ${c.q}</span>` : ""}${c.you ? `<span class="cnt you"><span class="ring accept"></span>${t("waitYou")} ${c.you}</span>` : ""}`;
  }
  function chatPane() {
    const inTask = S.view.startsWith("task:") && S.scheme === "A" ? task(S.view.slice(5)) : null;
    const newN = messages().filter((m) => m.k > S.seenAt && m.html.includes("m2 new")).length;
    const banner = S.fault === "offline" && S.step >= 2 ? (S.offline ? `<div class="banner2" role="status">${ic("alert", "sm")}<span class="grow">${t("offline")}</span><button class="btn sm sec" data-act="reconnect">${t("reconnect")}</button></div>` : "") : "";
    const head = `<div class="ph2">${ic("sparkles", "sm")}${t("assistant")}<span class="grow"></span><span class="seg side-tabs"><button data-act="mdoc" aria-pressed="${S.showDoc}">${S.lang === "zh" ? "文稿" : "Doc"}</button><button data-act="mchat" aria-pressed="${!S.showDoc}">${t("assistant")}</button></span><span class="tag sim">${t("sim")}</span></div>`;
    const strip = S.scheme === "A" && tasks().length ? `<div class="tstrip"><button data-act="list" aria-expanded="${S.open}">${summaryBtn()}<span style="flex:1"></span>${ic(S.open ? "chevron-down" : "chevron-right", "sm")}</button></div>` : "";
    if (inTask) return `${head}${banner}<div class="backbar"><button class="btn sm ghost" data-act="back">${ic("chevron-left", "sm")}${t("back")}</button>${newN ? `<span class="newcount">${t("newMsgs", newN)}</span>` : ""}<span style="flex:1"></span>${ownTile(inTask)}</div><div class="tdet">${detailHtml(inTask)}</div>${composer()}`;
    return `${head}${banner}${strip}${convHtml()}${S.scheme === "A" && S.open ? `<div class="tlist" role="listbox">${listHtml()}</div>` : ""}${composer()}`;
  }
  function island() {
    if (S.scheme !== "B" || !S.open) return "";
    const x = S.view.startsWith("task:") ? task(S.view.slice(5)) : null;
    const newN = messages().filter((m) => m.k > S.seenAt).length && x ? messages().filter((m) => m.k > S.seenAt).length : 0;
    return `<div class="island" role="dialog" aria-label="${t("tasks")}"><div class="ih">${x ? `<button class="btn icon sm ghost" data-act="tolist" aria-label="${t("tasks")}">${ic("chevron-left", "sm")}</button>` : ""}<span>${x ? esc(x.title) : t("tasks")}</span><span style="flex:1"></span>${newN ? `<span class="fact">${t("back")} · ${t("newMsgs", newN)}</span>` : ""}<button class="btn icon sm ghost" data-act="close-island" aria-label="close">${ic("x", "sm")}</button></div><div class="ib">${x ? `<div class="tdet" style="padding:6px 8px">${detailHtml(x)}</div>` : listHtml()}</div></div>`;
  }

  function render(keepScroll = true) {
    const conv = document.getElementById("conv"), st = conv ? conv.scrollTop : 0, atBottom = conv ? conv.scrollHeight - conv.scrollTop - conv.clientHeight < 40 : true;
    const draft = document.getElementById("msg"), dv = draft && draft.dataset.dirty ? draft.value : null;
    document.documentElement.lang = S.lang === "zh" ? "zh-CN" : "en"; document.documentElement.dataset.theme = S.theme;
    document.querySelectorAll("[data-t]").forEach((n) => (n.textContent = t(n.dataset.t)));
    for (const b of document.querySelectorAll("#scheme button")) b.setAttribute("aria-pressed", b.dataset.scheme === S.scheme);
    for (const b of document.querySelectorAll("#lang button")) b.setAttribute("aria-pressed", b.dataset.lang === S.lang);
    for (const b of document.querySelectorAll("#theme button")) b.setAttribute("aria-pressed", b.dataset.themeSet === S.theme);
    document.getElementById("fault").innerHTML = ["none", "queue", "fail", "offline"].map((v) => `<option value="${v}"${v === S.fault ? " selected" : ""}>${t("f_" + v)}</option>`).join("");
    document.getElementById("stepcap").textContent = `${S.step}/6 · ${t("steps")[S.step]}`;
    const c = counts();
    document.getElementById("app").innerHTML = `<div class="work${S.showDoc ? " show-doc" : ""} s-B"><section class="pane2 docpane"><div class="ph2">${ic("note", "sm")}${t("doc")}<span class="grow"></span><span class="tag sim">${t("sim")}</span></div><div class="doc"><h1>${t("doc")}</h1><div class="line" style="width:88%"></div><div class="line" style="width:72%"></div><div class="line" style="width:80%"></div><div class="line" style="width:60%"></div></div></section><section class="pane2 chat s-B">${chatPane()}</section></div>
      <div class="bar3"><button class="btn sm sec">${ic("note", "sm")}Pages</button><span class="grow"></span>${S.scheme === "B" && tasks().length ? `<button class="tbtn" data-act="list" aria-expanded="${S.open}">${summaryBtn()}</button>` : ""}<span class="mono">网</span></div>${island()}`;
    const nc = document.getElementById("conv");
    if (nc) nc.scrollTop = keepScroll && !atBottom ? st : nc.scrollHeight; // updates never pull a reader who scrolled up
    if (dv !== null) { const d = document.getElementById("msg"); d.value = dv; d.dataset.dirty = "1"; }
    save();
  }

  // ---------- actions ----------
  let toastT;
  function toast(msg) { document.querySelector(".toast")?.remove(); const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); el.textContent = msg; document.body.appendChild(el); clearTimeout(toastT); toastT = setTimeout(() => el.remove(), 3500); }
  function goStep(n) {
    n = Math.max(0, Math.min(6, n));
    if (n < S.step) { S = { ...fresh(), scheme: S.scheme, lang: S.lang, theme: S.theme, fault: S.fault }; }
    while (S.step < n) {
      S.step++;
      if (S.step === 3) { if (S.scheme === "C") S.expanded = "t1"; else { S.view = "task:t1"; if (S.scheme === "B") S.open = true; } S.seenAt = 2; }
      if (S.step === 6) { S.view = "chat"; S.seenAt = 5; S.expanded = null; if (S.scheme === "B") S.open = false; }
    }
    render(false);
  }
  function reply(next) {
    typing = true; render(false);
    typingT = setTimeout(() => { typing = false; next(); }, 900);
  }
  document.addEventListener("input", (e) => { if (e.target.id === "msg") e.target.dataset.dirty = "1"; });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-scheme],[data-lang],[data-theme-set]");
    if (!b) return;
    if (b.dataset.scheme) { S.scheme = b.dataset.scheme; S.open = false; S.expanded = null; if (S.view !== "chat" && S.scheme === "C") { S.expanded = S.view.slice(5); S.view = "chat"; } return render(); }
    if (b.dataset.lang) { S.lang = b.dataset.lang; return render(); }
    if (b.dataset.themeSet) { S.theme = b.dataset.themeSet; return render(); }
    const { act, id } = b.dataset;
    switch (act) {
      case "send": {
        const v = document.getElementById("msg").value.trim(); if (!v || typing) return;
        if (S.target) { toast(t("gotIt")); task(S.target)?.adds.push(v); document.getElementById("msg").value = ""; return; }
        if (v === scriptedLine()) return reply(() => goStep(S.step + 1));
        toast(t("free")); document.getElementById("msg").value = ""; return;
      }
      case "stopreply": clearTimeout(typingT); typing = false; render(); return toast(t("replyStopped"));
      case "list": S.open = !S.open; if (S.scheme === "B" && S.open) S.view = "chat"; return render();
      case "task":
        if (S.scheme === "C") { S.expanded = id; render(); document.getElementById("card-" + id)?.scrollIntoView({ block: "nearest", behavior: "smooth" }); return; }
        S.view = "task:" + id; if (S.scheme === "A") { S.open = false; S.seenAt = Math.max(S.seenAt, S.step); } else S.open = true; return render();
      case "jump": S.expanded = id; render(); { const c = document.getElementById("card-" + id); c?.scrollIntoView({ block: "nearest", behavior: "smooth" }); c?.classList.add("flash"); setTimeout(() => c?.classList.remove("flash"), 900); } return;
      case "expand": S.expanded = S.expanded === id ? null : id; return render();
      case "back": S.view = "chat"; S.seenAt = S.step; return render(false);
      case "tolist": S.view = "chat"; return render();
      case "close-island": S.open = false; S.view = "chat"; return render();
      case "add": { const v = document.getElementById("addtxt").value.trim(); if (!v) return; if (S.step === 2 && id === "t1") return goStep(3); toast(t("gotIt")); return; }
      case "talk": S.target = id; return render();
      case "untalk": S.target = null; return render();
      case "decide": S.decision = b.dataset.v; return render();
      case "undo-dec": S.decision = null; return render();
      case "accept": S.accepted = true; return render();
      case "pause": { const k = id + "ctl"; S[k] = "pausing"; render(); setTimeout(() => { S[k] = "paused"; render(); }, 1200); return; }
      case "resume": S[id + "ctl"] = null; return render();
      case "stop": { const k = id + "ctl"; S[k] = "stopping"; render(); setTimeout(() => { S[k] = "stopped"; render(); }, 1400); return; }
      case "reconnect": S.offline = false; render(); return toast(t("reconciled"));
      case "sim": return toast(`「${b.dataset.label}」（${t("sim")}）`);
      case "mdoc": S.showDoc = true; return render();
      case "mchat": S.showDoc = false; return render();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && S.open) { S.open = false; render(); document.querySelector('[data-act="list"]')?.focus(); }
    if (e.key === "Enter" && !e.shiftKey && e.target.id === "msg" && !e.isComposing) { e.preventDefault(); document.querySelector('[data-act="send"]').click(); }
  });
  document.getElementById("prev").addEventListener("click", () => goStep(S.step - 1));
  document.getElementById("next").addEventListener("click", () => goStep(S.step + 1));
  document.getElementById("fault").addEventListener("change", (e) => { S.fault = e.target.value; S.offline = true; render(); });
  document.getElementById("reset").addEventListener("click", () => { S = { ...fresh(), lang: S.lang, theme: S.theme, scheme: S.scheme }; render(false); });
  render(false);
})();
