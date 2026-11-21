/* 底栏第八版的可点原型：输入框那一行分三格（带着、字、给），上面一排标签是事项和亮着那件里的事，纸向上长。数据是假的，不是产品代码。 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const I = (n, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const G = (g) => (g === "done" ? I("check", "xs dg done") : `<i class="dg ${g}"></i>`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const PROJECT = "目录交互验证";
  const KIND = { doc: "文稿", code: "Coding 会话", task: "助理在办", cal: "日程", todo: "待办" };
  const mk = () => ({
    a: { nm: "发布 v2.3", grp: "现在", ev: [
      { id: "y1", nm: "定稿公告", g: "you", kind: "doc", w: "等你定", sum: "公告正文写好了，只差标题。", ask: { q: "标题用「更快的发布」还是「v2.3 来了」？", acts: ["用第一个", "用第二个"] } },
      { id: "y2", nm: "核对定价页截图", g: "you", kind: "doc", w: "等你看", sum: "新截图换上去了，但里面的价格还是旧的。", ask: { q: "要我按新价格重截一张吗？", acts: ["重截", "不用，就这样"] } },
      { id: "r1", nm: "生成更新日志", g: "run", kind: "task", w: "第 2 步", sum: "读完了 46 条提交，其中 9 条是内部重构，不会写进日志。", quick: ["重构的也列一下", "先给我看草稿"] },
      { id: "r2", nm: "修登录回归", g: "run", kind: "code", w: "在跑", sum: "定位到了：刷新令牌写回时用了旧的过期时间。12 条受影响的用例里 9 条已通过。" },
      { id: "n1", nm: "发布评审", g: "next", kind: "cal", w: "15:00", sum: "今天 15:00–15:30，4 人，线上会议室。", quick: ["让助理备材料"] },
      { id: "n2", nm: "推送公告", g: "next", kind: "todo", w: "评审后", sum: "评审通过以后发。" },
      { id: "d1", nm: "起草发布说明", g: "done", kind: "doc", w: "11:20", sum: "已经写好。" },
      { id: "d2", nm: "跑回归测试", g: "done", kind: "code", w: "13:05", sum: "全部通过。" },
      { id: "d3", nm: "冻结代码", g: "done", kind: "todo", w: "昨天", sum: "已勾掉。" },
    ] },
    b: { nm: "定价页改版", grp: "现在", ev: [
      { id: "y3", nm: "确认三档价格", g: "you", kind: "doc", w: "等你定", sum: "三档的功能表排好了，中间一档的价格没定。", ask: { q: "中间一档定 ¥199 还是 ¥229？", acts: ["¥199", "¥229"] } },
      { id: "r3", nm: "改写定价页文案", g: "run", kind: "task", w: "第 1 步", sum: "在读现在的文案。" },
      { id: "d5", nm: "收集竞品价格", g: "done", kind: "doc", w: "周一", sum: "收了 6 家。" },
    ] },
    c: { nm: "用户访谈整理", grp: "接下来", ev: [
      { id: "n3", nm: "整理访谈纪要", g: "next", kind: "doc", w: "停在第 3 段", sum: "6 份纪要整理了 2 份。", quick: ["接着整理第 3 段"] },
      { id: "d6", nm: "约访 6 位用户", g: "done", kind: "todo", w: "上周", sum: "都约好了。" },
    ] },
  });
  let T, S, tick = 0, sendSeq = 0, newSeq = 0, swap = true;
  const fresh = () => { T = mk(); S = { topic: "a", ev: null, open: false, threads: {}, notes: {}, drafts: {}, spawn: {}, chips: [], look: false, pm: false, wm: false, tm: null, way: "作为补充", scene: 0, pulse: null, marks: S ? S.marks : false }; };
  const find = (id) => { for (const k of Object.keys(T)) { const e = T[k].ev.find((x) => x.id === id); if (e) return { k, e }; } return null; };
  const cur = () => (S.ev ? find(S.ev).e : null);
  const fkey = () => S.ev || S.topic || "project";
  const of = (k, g) => (k ? [k] : Object.keys(T)).flatMap((x) => T[x].ev.filter((e) => e.g === g));
  const pageName = () => (cur() ? cur().nm : S.topic ? T[S.topic].nm : PROJECT);
  const thread = (key) => (S.threads[key] ||= find(key) ? [{ t: find(key).e.sum }] : [{ t: T[key] ? `「${T[key].nm}」里的事都在这儿说。要办新的，直接说一句。` : "有什么要办的，直接说。" }]);
  const WHO = () => (cur() && cur().kind === "code" ? ["执行", "只讨论", "先出计划"] : ["助理", "只讨论", "交给 Coding"]);

  /* —— 窗口骨架：顶部借用静态样稿；输入框只建一次。底部一行三格：带着、字、给 —— */
  const win = $("#win");
  win.innerHTML = `${window.spParts.top}<div class="sp-stage" id="stage"></div>
    <div class="qb" id="qb">
      <div class="qw l" id="fl"><div class="fz" id="wl"></div><div class="pm" id="pm" hidden></div></div>
      <div class="qm"><div class="qu" id="unit">
        <div class="qs" id="paper"><i class="qp" id="plate"></i>
          <div class="qv" id="conv" hidden><div class="qv-top" id="top"></div><div class="qv-b" id="body"></div><div class="qa" id="ans"></div></div>
          <div class="qc" id="card"><div class="pc">
            <textarea id="in" rows="1" autocomplete="off" aria-label="输入"></textarea>
            <span class="dc-k" data-act="mic" role="button" title="语音">${I("mic", "s")}</span>
            <span class="dc-k send dim" data-act="send" role="button" id="send" aria-label="发送">${I("send", "s")}</span>
          </div></div>
        </div>
        <div class="qt" id="tabs"></div>
        <div class="tm" id="tm" hidden></div>
      </div></div>
      <div class="qw r" id="fr"><div class="fz" id="wr"></div><div class="pm" id="wm" hidden></div></div>
    </div>`;
  const inp = $("#in");
  const say = (a, b) => { $("#step").textContent = a; $("#say").textContent = b; };

  /* —— 主区：跟着焦点换 —— */
  const P = (h1, sub, body) => `<div class="sp-sheet"><div class="sp-main"><div class="sp-mainhd"><h1>${h1}</h1><span class="sub">${sub}</span></div><div class="pp">${body}</div></div></div>`;
  const sk = (ws) => ws.map((w) => `<i class="sk" style="width:${w}%"></i>`).join("");
  const prow = (e) => `<div class="pp-r" data-act="go" data-id="${e.id}" role="button">${G(e.g)}<span class="nm">${e.nm}</span><small>${KIND[e.kind]}</small><span class="grow"></span><small class="${e.g}">${e.w}</small></div>`;
  const page = () => {
    const e = cur();
    if (!S.topic) return P(PROJECT, "项目的第一页", `<h3>手头的事项</h3>${Object.keys(T).map((k) => `<div class="pp-r" data-act="topic" data-k="${k}" role="button">${I("folder", "s")}<span class="nm">${T[k].nm}</span><span class="grow"></span><small class="${of(k, "you").length ? "you" : ""}">${of(k, "you").length ? `${of(k, "you").length} 件等你` : `${T[k].ev.length} 件东西`}</small></div>`).join("")}`);
    if (!e) { const grp = (g, t) => { const xs = of(S.topic, g); return xs.length ? `<h3>${t}<em>${xs.length}</em></h3>${xs.map(prow).join("")}` : ""; }; return P(T[S.topic].nm, `事项 · ${T[S.topic].ev.length} 件东西`, `${grp("you", "该你了")}${grp("run", "在办")}${grp("next", "接下来")}${grp("done", "办完")}`); }
    const sub = `${KIND[e.kind]} · ${T[S.topic].nm}`;
    if (e.kind === "code") return P(e.nm, sub, `<div class="pp-me">登录页在 Safari 里点「记住我」会掉登录，先定位再修。</div><p>${e.sum}</p><pre>pnpm test auth/refresh.test.ts\n  ✓ 9 通过　· 3 还在跑</pre>${sk([62, 48])}`);
    if (e.kind === "task") return P(e.nm, sub, `<div class="pp-steps"><span>${G("done")}第 1 步</span><span>${G(e.g === "done" ? "done" : "run")}第 2 步</span><span>${G(e.g === "done" ? "done" : "next")}第 3 步</span><span>${G(e.g === "done" ? "done" : "next")}第 4 步</span></div><p>${e.sum}</p>${sk([70, 54])}`);
    if (e.kind === "cal" || e.kind === "todo") return P(e.nm, sub, `<div class="pp-card"><b>${e.w}</b><span>${e.sum}</span></div>${sk([52, 40])}`);
    return P(e.nm, sub, `<h2>${e.nm}</h2><p>${e.sum}</p>${sk([92, 86, 64, 0, 88, 73])}`);
  };

  /* —— 上面一排标签：事项；亮着的那件后面排着它里面的事，该你了的在最前 —— */
  const need = (el, gap, slack) => [...el.children].filter((c) => !c.classList.contains("grow")).reduce((w, c) => w + c.offsetWidth + gap, slack);
  const evs = (k) => { const xs = k ? [...of(k, "you"), ...of(k, "run"), ...of(k, "next")] : [...of(null, "you"), ...of(null, "run")]; const e = cur(); if (e && !xs.includes(e) && (!k || find(e.id).k === k)) xs.unshift(e); return xs; };
  const etab = (e, pre) => `<span class="g-ev ${e.g}${e.id === S.ev ? " on" : ""}${S.pulse === e.id ? " pulse" : ""}" data-k="${e.id}" data-act="go" data-id="${e.id}" role="button" title="${KIND[e.kind]} · ${e.w}">${G(e.g)}<span class="cut">${pre}${e.nm}</span></span>`;
  const tabs = () => {
    const k = S.topic, all = evs(k), others = Object.keys(T).filter((x) => x !== k && T[x].grp === "现在"), el = $("#tabs");
    const html = (n, m) => {
      let shown = all.slice(0, n); const fi = all.findIndex((e) => e.id === S.ev);
      if (fi >= n) shown = [...all.slice(0, Math.max(0, n - 1)), all[fi]]; // 正专注的那一件总在
      const rest = all.filter((e) => !shown.includes(e)), ry = rest.some((e) => e.g === "you");
      const hid = others.slice(m), hy = hid.reduce((s, x) => s + of(x, "you").length, 0);
      return `${k ? `<span class="q-tab home" data-act="tab" data-k="" role="button" title="${PROJECT}（不选事项）">${I("folder", "s")}</span>` : ""}<span class="q-tab on grp"><span class="g-nm" data-act="tab" data-k="${k || ""}" role="button" title="${k ? "这件事项" : "整个项目"}">${k ? "" : I("folder", "s")}<span class="cut">${k ? T[k].nm : PROJECT}</span></span>${all.length ? `<i class="g-vr"></i>` : ""}${shown.map((e) => etab(e, k ? "" : `${T[find(e.id).k].nm} › `)).join("")}${rest.length ? `<span class="g-more${ry ? " you" : ""}" data-act="em" role="button" title="这里面其余的事">+${rest.length}</span>` : ""}</span>${others.slice(0, m).map((x) => { const n = of(x, "you").length; return `<span class="q-tab" data-act="tab" data-k="${x}" role="button"><span class="cut">${T[x].nm}</span>${n ? `<em class="n">${n}</em>` : ""}</span>`; }).join("")}<span class="q-k tmk" data-act="tm" role="button" title="全部事项">${hy ? `<em class="n">${hy}</em>` : ""}${I("chevron-down", "xs")}</span><span class="grow"></span>${S.open ? `<span class="q-k" data-act="more" role="button" title="详情、历史">${I("more", "s")}</span>` : ""}<span class="q-k" data-act="toggle" role="button" title="${S.open ? "收起" : "展开对话"}">${I(S.open ? "chevron-down" : "chevron-up", "s")}</span>`;
    };
    // 放得下几件就点名几件；放不下先收事件（留两件），再收别的事项，最后只留正专注的
    let n = Math.min(all.length, 5), m = others.length; el.innerHTML = html(n, m);
    const over = () => need(el, 2, 40) > el.clientWidth;
    while (over() && n > 2) el.innerHTML = html(--n, m);
    while (over() && m > 0) el.innerHTML = html(n, --m);
    while (over() && n > 0) el.innerHTML = html(--n, m);
    const tm = $("#tm"); tm.hidden = !S.tm;
    if (S.tm === "t") { const row = (x) => { const c = of(x, "you").length; return `<div class="dl-r${x === S.topic ? " on" : ""}" data-act="tab" data-k="${x}" role="button">${I("folder", "xs")}<span class="nm cut">${T[x].nm}</span><small class="${c ? "you" : ""}">${c ? `${c} 件等你` : `${of(x, "run").length} 件在办`}</small></div>`; }; tm.innerHTML = ["现在", "接下来"].map((g) => `<div class="dl-g">${g}</div>${Object.keys(T).filter((x) => T[x].grp === g).map(row).join("")}`).join("") + `<div class="dl-sep"></div><div class="fs-foot"><span data-act="stub" role="button">${I("plus", "xs")}新建事项</span><span data-act="stub" role="button">整理主线</span></div>`; }
    if (S.tm === "e") { const grp = (g, t) => { const xs = of(k, g); return xs.length ? `<div class="dl-g">${t}</div>${xs.map((e) => `<div class="dl-r${e.id === S.ev ? " on" : ""}" data-act="go" data-id="${e.id}" role="button">${G(e.g)}<span class="nm cut">${k ? "" : `${T[find(e.id).k].nm} › `}${e.nm}</span><small class="${e.g}">${e.w}</small></div>`).join("")}` : ""; }; tm.innerHTML = `${grp("you", "该你了")}${grp("run", "在办")}${k ? grp("next", "接下来") : ""}<div class="dl-sep"></div><div class="fs-foot"><span>办完的在事项的第一页里</span></div>`; }
  };
  const plate = () => { const on = $("#tabs .q-tab.on"), over = S.open ? parseFloat(getComputedStyle($("#qb")).getPropertyValue("--over")) || 0 : 0; const p = $("#plate"); p.style.left = `${on.offsetLeft - over}px`; p.style.width = `${on.offsetWidth}px`; };

  /* —— 输入框左右两格：左边是这句话带着什么，右边是给谁。都在输入框外面，同一行，位置不变 —— */
  const PLUS = [["paperclip", "文件或图片…", "定价页-新版.png"], ["bookmark", "Shelf 里的", "发布清单"], ["folder", "项目资料", "品牌用语"]];
  const WAY = { 作为补充: "补充", 打断并改向: "打断", 下一轮再做: "下一轮" };
  const flanks = () => {
    const e = cur(), L = $("#wl"), alt = S.scene % 3 > 0;
    const look = `<span class="f-look${S.look ? " on" : ""}" data-act="look" role="button" title="${S.look ? "这句话会带上正在看的这一页；点一下不带" : "点一下，这句话带上正在看的这一页"}">${I("eye", "xs")}<span class="cut">正在看：${pageName()}</span>${S.look ? I("check", "xs ok") : ""}</span>`;
    const lh = (n) => `${S.chips.length > n ? `<span class="dc-chip more" data-act="plus" role="button" title="这句话带着的东西">${I("paperclip", "xs")}${n ? "+" : ""}${S.chips.length - n}</span>` : ""}${S.chips.slice(0, n).reverse().map((c, j) => `<span class="dc-chip">${I(c[0], "xs")}<span class="cut">${c[1]}</span><span data-act="unchip" data-i="${n - 1 - j}" role="button">${I("x", "xs x")}</span></span>`).join("")}${look}<span class="dc-k" data-act="plus" role="button" title="带上文件、Shelf 里的、项目资料">${I("plus", "s")}</span>`;
    let n = S.chips.length; L.innerHTML = lh(n); while (n > 0 && need(L, 6, 4) > L.clientWidth) L.innerHTML = lh(--n);
    $("#wr").innerHTML = `<span class="f-who${alt ? " alt" : ""}" data-act="wm" role="button" title="这句话给谁办"><small>给</small>${I(e && e.kind === "code" ? "code" : alt ? "user" : "sparkles", "xs")}<b>${WHO()[S.scene % 3]}</b>${I("chevron-down", "xs")}</span>${e && e.g === "run" ? `<span class="f-way" data-act="way" role="button" title="它正在办：这句话怎么送达">${WAY[S.way]}${I("chevron-down", "xs")}</span>` : ""}<span class="grow"></span><span class="dt"><span class="dt-k" data-act="tasks" role="button" title="后台任务">${I("activity", "s")}<em>${of(null, "run").length}</em></span></span>`;
    const pm = $("#pm"); pm.hidden = !S.pm; if (S.pm) pm.innerHTML = `${S.chips.length ? `<div class="dl-g">这句话带着</div>${S.chips.map((c, i) => `<div class="dl-r">${I(c[0], "xs")}<span class="nm cut">${c[1]}</span><span data-act="unchip" data-i="${i}" role="button" title="拿掉">${I("x", "xs x")}</span></div>`).join("")}<div class="dl-sep"></div>` : ""}<div class="dl-g">带上</div>${PLUS.map((p, i) => `<div class="dl-r" data-act="chip" data-i="${i}" role="button">${I(p[0], "xs")}<span class="nm">${p[1]}</span></div>`).join("")}`;
    const wm = $("#wm"); wm.hidden = !S.wm; if (S.wm) wm.innerHTML = `<div class="dl-g">这句话给谁办</div>${WHO().map((t, i) => `<div class="dl-r" data-act="who" data-i="${i}" role="button">${I(e && e.kind === "code" ? "code" : i ? "user" : "sparkles", "xs")}<span class="nm">${t}</span>${i === S.scene % 3 ? I("check", "xs ok") : ""}</div>`).join("")}`;
  };

  /* —— 向上长的那张纸，从上到下三段：任务卡、说过的话、该你做的 —— */
  const btn = (t, a, pri, extra = "") => `<span class="dc-act${pri ? " pri" : ""}" data-act="${a}" ${extra} role="button">${esc(t)}</span>`;
  const kcard = (id) => { const f = find(id); if (!f) return ""; const e = f.e, here = id === S.ev; return `<div class="qk${here ? " here" : ""}" ${here ? "" : `data-act="go" data-id="${id}" role="button"`}><div class="qk-h">${G(e.g)}<b>${e.nm}</b><small>${KIND[e.kind]}</small><span class="grow"></span><small class="${e.g}">${e.w}</small>${here ? "" : I("chevron-right", "xs")}</div>${e.kind === "task" && e.g !== "done" ? `<div class="qk-s"><span>${G("done")}读</span><span>${G("run")}归类</span><span>${G("next")}写</span><span>${G("next")}对一遍</span></div>` : ""}</div>`; };
  const conv = () => {
    const e = cur(), key = fkey(), n = S.notes[key];
    $("#top").innerHTML = e ? kcard(e.id) : (S.spawn[key] || []).map(kcard).join("");
    $("#body").innerHTML = thread(key).map((m) => (m.r ? `<div class="dd-r">${I("check", "xs")}${esc(m.r)}</div>` : `<div class="${m.me ? "dd-me" : "dd-it"}">${esc(m.t)}</div>`)).join("") + (e && e.ask ? `<div class="dd-it">${e.ask.q}</div>` : "");
    let a = "";
    if (n && n.kind === "sending") a = `<span class="qa-t">${G("run")}发送中…</span>`;
    else if (n && n.kind === "fail") a = `<span class="qa-t">${I("circle-alert", "s t-r")}没发出去，网络断了。你的字还在。</span>${btn("再试一次", "retry", 1)}`;
    else if (n && n.kind === "back") a = `<span class="qa-t">${I("check", "s t-g")}模型已连接。</span>${btn("回到「修登录回归」接着做", "go", 1, `data-id="r2"`)}${btn("不用了", "dismiss")}`;
    else if (n && n.kind === "done") a = `${n.next ? btn(`下一件该你的：${n.next.nm}`, "go", 1, `data-id="${n.next.id}"`) : ""}${btn(`回到「${T[S.topic].nm}」`, "tab", !n.next, `data-k="${S.topic}"`)}`;
    else if (e && e.ask) a = e.ask.acts.map((x, i) => btn(x, "act", i === 0, `data-i="${i}"`)).join("");
    else if (e && e.quick && e.g !== "done") a = e.quick.map((x) => btn(x, "quick", 0, `data-t="${esc(x)}"`)).join("");
    $("#ans").innerHTML = a;
    const b = $("#body"); b.scrollTop = b.scrollHeight;
  };

  // 输入框里只有字、语音、发送。点进去、打字都不挪位置；字多到换行才向上长
  const card = () => {
    const e = cur(), has = inp.value.trim().length > 0;
    inp.placeholder = e && e.ask ? "回它一句，或点上面的选项" : e && e.g === "run" ? "补充一句，它会在这一步之后读到" : "说一句，或输入 / 开始一件事";
    inp.style.height = "26px"; inp.style.height = `${Math.min(132, Math.max(26, inp.scrollHeight))}px`;
    const stop = !has && e && e.g === "run";
    const s = $("#send"); s.className = `dc-k send${stop ? " stop" : has ? "" : " dim"}`; s.innerHTML = stop ? `<i class="sq"></i>` : I("send", "s"); s.title = stop ? "停下" : "发送（回车）";
  };

  /* 一件事在标签里换位置时沿着那一排走过去（只有这一种位移） */
  const z = () => Number(getComputedStyle(document.documentElement).getPropertyValue("--z")) || 1;
  const snap = () => { const m = {}; win.querySelectorAll("#tabs [data-k]").forEach((el) => { m[el.dataset.k] = el.getBoundingClientRect(); }); return m; };
  const play = (before, moved) => win.querySelectorAll("#tabs [data-k]").forEach((el) => { const b = before[el.dataset.k]; if (!b) { el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 250, easing: "cubic-bezier(.22,1,.36,1)" }); return; } if (!moved) return; const a = el.getBoundingClientRect(), dx = (b.left - a.left) / z(); if (Math.abs(dx) > 2) el.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" }); });

  let lastKey = null;
  const render = () => {
    const before = snap(), same = lastKey === `${S.topic}|${S.open}`; lastKey = `${S.topic}|${S.open}`;
    if (swap) { const st = $("#stage"); st.innerHTML = page(); st.classList.remove("swap"); void st.offsetWidth; st.classList.add("swap"); swap = false; }
    $("#unit").classList.toggle("open", S.open); win.classList.toggle("marks", S.marks);
    $("#conv").hidden = !S.open; if (S.open) conv();
    tabs(); flanks(); card(); plate(); play(same ? before : {}, same); S.pulse = null;
    win.querySelectorAll(".mk-l").forEach((x) => x.remove());
    if (S.marks) [["#tabs", "1 · 标签：事项，和亮着那件里的事", "top:-20px;left:22px"], ["#fl", "2 · 带着：＋、正在看、附件", "top:-20px;right:0"], ["#fr", "3 · 给：谁来办、怎么送达", "top:-20px;left:0"], ["#top", "4 · 任务卡", "top:8px;right:14px"], ["#body", "5 · 说过的话", "top:4px;right:14px"], ["#ans", "6 · 该你做的：选择项、接续", "top:-6px;right:14px"], ["#card", "7 · 字", "top:10px;right:84px"]].forEach(([sel, t, pos]) => { const el = $(sel); if (el && el.offsetParent && (el.children.length || sel === "#card")) el.insertAdjacentHTML("beforeend", `<span class="mk-l" style="${pos}">${t}</span>`); });
  };

  /* —— 动作 —— */
  const shut = () => { S.pm = false; S.wm = false; S.tm = null; };
  const setFocus = (k, id, open) => {
    S.drafts[fkey()] = inp.value;
    const same = k === S.topic && id === S.ev;
    S.topic = k; S.ev = id; S.open = open === undefined ? S.open : open; shut(); S.chips = []; S.look = false; S.scene = 0;
    inp.value = S.drafts[fkey()] || ""; if (!same) swap = true; render();
  };
  const doAct = (i) => {
    const e = cur(); if (!e || !e.ask) return; const a = e.ask.acts[i], th = thread(e.id);
    th.push({ t: e.ask.q }, { me: 1, t: a });
    if (e.ask.step) { e.ask = null; if (i === 0) { e.g = "run"; e.w = "第 3 步"; th.push({ t: "好，接着做第 3 步。" }); } else { e.g = "next"; e.w = "停着"; th.push({ t: "停在第 2 步。说一句就接着做。" }); } S.notes[e.id] = null; swap = true; render(); say("接续", i === 0 ? "它回去接着办，在标签里退到在办的那一段。" : "它停下来，在标签里排到接下来。"); return; }
    e.ask = null; e.g = "done"; e.w = "刚刚"; th.push({ t: `好，按「${a}」办了。` });
    const nx = of(S.topic, "you")[0] || null; S.notes[e.id] = { kind: "done", next: nx }; swap = true; render();
    say("办完一件", nx ? `纸的最下面给出下一件该你的「${nx.nm}」，点一下就过去。办完的这件，离开以后就不在标签里了。` : "这件事项里没有等你的了。");
  };
  const send = (text) => {
    const t = (text || inp.value).trim(); if (!t) return;
    const key = fkey(), e = cur(), way = S.way, th = thread(key), who = WHO()[S.scene % 3], alt = S.scene % 3 > 0, carry = [S.look ? pageName() : "", ...S.chips.map((c) => c[1])].filter(Boolean);
    th.push({ me: 1, t: carry.length ? `${t}（带着：${carry.join("、")}）` : t }); if (!text) { inp.value = ""; S.drafts[key] = ""; } S.chips = []; S.look = false; shut(); S.open = true; S.scene = 0;
    const wasAsk = e && e.ask; if (wasAsk) { e.ask = null; e.g = "run"; e.w = "在办"; swap = true; }
    S.notes[key] = { kind: "sending" }; render(); const sq = ++sendSeq;
    setTimeout(() => {
      if (wasAsk) th.push({ t: "好，按你说的改。" });
      else if (e) th.push({ t: e.g === "run" ? `收到，${way === "打断并改向" ? "现在就改方向" : way === "下一轮再做" ? "排到下一轮" : "这一步之后读到"}。` : "好，记下了。" });
      else if (S.topic === key && who === "只讨论") th.push({ t: "可以。先说说给销售看的重点是哪三处，我再帮你排顺序。" });
      else if (S.topic === key) { const id = `x${++newSeq}`; const at = T[key].ev.findIndex((x) => x.g !== "you"); T[key].ev.splice(at < 0 ? T[key].ev.length : at, 0, { id, nm: t.replace(/[，。,.！!？?].*$/, "").slice(0, 12), g: "run", kind: alt ? "code" : "task", w: "第 1 步", sum: "刚开始办。" }); (S.spawn[key] ||= []).push(id); th.push({ r: `交给${alt ? " Coding " : "助理"}去办了` }); S.pulse = id; }
      else th.push({ t: "好。要我放进哪件事项里办？" });
      if (sq === sendSeq) S.notes[key] = null; render();
    }, 700);
    say("发出去了", e ? "纸向上长出来，回复在里面。" : "纸向上长出来。交办出去的事变成一张任务卡，钉在纸的最上面；它同时出现在标签里，闪一下。");
  };
  const stopRun = () => { const e = cur(); if (!e || e.g !== "run") return; e.g = "next"; e.w = "停下了"; thread(e.id).push({ t: "停下了。说一句就接着做。" }); swap = true; render(); say("停下", "没打字时发送键就是停下。它从在办变成接下来。"); };
  const nextWait = () => { const ws = of(S.topic, "you"); if (!ws.length) return say("没有等你的", "这件事项里没有该你了的。"); const i = ws.findIndex((e) => e.id === S.ev), e = ws[(i + 1) % ws.length]; setFocus(find(e.id).k, e.id, true); say("下一件该你的", `到了「${e.nm}」。`); };

  const GO = {
    reset: () => { tick++; fresh(); inp.value = ""; swap = true; render(); say("平常", "输入框这一行分三格：左边是带着什么，中间只有字，右边是给谁。上面一排标签：亮着的是事项「发布 v2.3」，后面排着它里面的事，该你了的在最前。"); },
    ask: () => { const e = find("r1").e; if (e.g !== "run") return GO.reset(); e.g = "you"; e.w = "等你定"; e.ask = { q: "内部重构的 9 条要不要写进日志？", acts: ["不写", "写成附录"] }; S.pulse = "r1"; swap = true; render(); say("助理问你", "「生成更新日志」在标签里走到该你了的那一段，闪一下。不打断你正在做的，纸不会自己长出来。"); },
    step: () => { const e = find("r1").e; e.g = "you"; e.w = "问你"; e.ask = { q: "第 2 步做完了。接着做下一步？", acts: ["接着做", "先停"], step: 1 }; S.pulse = "r1"; swap = true; render(); say("做完一步", "交办时开了「每步先问我」：它在标签里变成该你了。点它，选择项在纸的最下面。"); },
    back: () => { S.notes[fkey()] = { kind: "back" }; S.open = true; render(); say("从设置回来", "接着做哪一步，在纸的最下面，和选择项同一个地方。"); },
    fail: () => { S.notes[fkey()] = { kind: "fail" }; S.open = true; render(); say("没发出去", "失败也在纸的最下面。字留在框里。"); },
  };
  const story = () => {
    const tk = ++tick; let at = 0;
    const st = (ms, fn) => { at += ms; setTimeout(() => { if (tk === tick) fn(); }, at); };
    GO.reset(); tick = tk; say("1 · 平常", "一行三格：带着什么、字、给谁。上面一排是事项，亮着的那件后面是它里面的事。");
    st(2000, () => { setFocus("a", "y1", true); say("2 · 点标签里第一件该你的", "纸向上长：最上面是它的卡，中间是它说的话，最下面是选择项，紧挨输入框。主区换成它的文稿。"); });
    st(2600, () => doAct(0));
    st(2400, () => { const n = S.notes[fkey()]; if (n && n.next) { setFocus("a", n.next.id, true); say("4 · 接着下一件", "点「下一件该你的」，直接过去。也可以按 ⌘]。"); } });
    st(2400, () => doAct(1));
    st(2200, () => { setFocus("a", null, false); say("6 · 回到事项", "点标签里的事项名。纸收起，输入框上面只剩一排标签。"); });
    st(1800, () => { inp.value = "出一份给销售的一页说明"; S.look = true; S.chips.push(["paperclip", "定价页-新版.png"]); render(); say("7 · 打字、带上东西", "输入框没动。带上的东西在左边那一格：正在看的这一页点亮了，附件排在它左边。"); });
    st(2600, () => { send(); });
    st(2600, () => { GO.ask(); });
    st(2600, () => { setFocus("b", null, false); say("10 · 换事项", "点「定价页改版」：标签里换成它里面的事，主区一起换。"); });
    st(2400, () => { setFocus("a", null, false); say("演示完了", "可以自己点：标签里的事项和事、左边的 ＋ 和「正在看」、右边的「给」、主区里的行、输入框。"); });
  };

  /* —— 事件 —— */
  win.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) { if (ev.target.closest("#stage") && (S.open || S.tm || S.pm || S.wm)) { S.open = false; shut(); render(); say("收起", "点主区，纸收起。输入框上面只剩标签。"); } return; }
    const a = el.dataset.act, d = el.dataset;
    if (a === "tab") { const k = d.k || null; if (k === S.topic && !S.ev) { S.open = !S.open; shut(); render(); say(S.open ? "展开对话" : "收起", S.open ? "这件事项的主对话。" : "收回。"); } else { setFocus(k, null, k === S.topic ? S.open : false); say(k ? (T[k].nm) : "不选事项", k ? "标签里排的是这件事项里的事，主区是它的第一页。真产品里顶部页签、右侧和助理的范围也跟着换。" : "回到整个项目：标签里排的是各件事项里该你的和在办的。"); } }
    else if (a === "go") { const f = find(d.id); setFocus(f.k, f.e.id, true); say(f.e.nm, f.e.ask ? "它问的话在纸里，选择项在最下面。回一句也行。" : f.e.g === "run" ? "它在办。没打字时发送键是停下；说一句就是补充，右边那一格可以改成打断或下一轮。" : "它的卡在纸的最上面，记录在中间。"); }
    else if (a === "topic") { setFocus(d.k, null, false); say("换事项", "标签、主区一起换。"); }
    else if (a === "tm" || a === "em") { const v = a === "tm" ? "t" : "e"; const on = S.tm === v; shut(); S.tm = on ? null : v; render(); say(a === "tm" ? "全部事项" : "其余的事", a === "tm" ? "标签上只放「现在」这一组；别的在这里。" : "放不下的事收在这里，按该你了、在办、接下来分。"); }
    else if (a === "toggle") { S.open = !S.open; shut(); render(); say(S.open ? "展开对话" : "收起", S.open ? "纸向上长，和输入框是同一张。" : "收回，底部还是 68 高。"); }
    else if (a === "act") doAct(Number(d.i));
    else if (a === "quick") send(d.t);
    else if (a === "dismiss") { S.notes[fkey()] = null; render(); }
    else if (a === "retry") { S.notes[fkey()] = null; thread(fkey()).push({ t: "发出去了。" }); render(); }
    else if (a === "send") ($("#send").classList.contains("stop") ? stopRun() : send());
    else if (a === "plus") { const on = S.pm; shut(); S.pm = !on; render(); say("＋", "带上文件、Shelf 里的、项目资料。选了以后是左边这一格里的一枚片，输入框不动。"); }
    else if (a === "chip") { const p = PLUS[Number(d.i)]; S.chips.push([p[0], p[2]]); shut(); render(); inp.focus(); say("带上了", "排在「正在看」的左边。点 × 拿掉，发出去就清空。"); }
    else if (a === "unchip") { S.chips.splice(Number(d.i), 1); render(); }
    else if (a === "look") { S.look = !S.look; shut(); render(); say("正在看", S.look ? "点亮了：这句话会带上正在看的这一页。再点一下不带。" : "不带了。它一直在这个位置，虚线表示这次不带。"); }
    else if (a === "wm") { const on = S.wm; shut(); S.wm = !on; render(); say("给谁", "这句话给谁办，一直写在输入框右边。换了以后只管这一句，发出去回到默认。"); }
    else if (a === "who") { S.scene = Number(d.i); shut(); render(); say("给谁", S.scene ? `这一句给「${WHO()[S.scene % 3]}」。` : "回到默认。"); }
    else if (a === "way") { const ws = ["作为补充", "打断并改向", "下一轮再做"]; S.way = ws[(ws.indexOf(S.way) + 1) % 3]; render(); say("怎么送达", `它正在办，这句话${S.way}。只在它在办的时候出现，位置在「给」的右边。`); }
    else if (a === "mic") say("语音", "位置在发送键左边。原型里没接。");
    else if (a === "tasks") say("后台任务", "原型里没做这个面板。");
    else say(el.textContent.trim() || "⋯", "原型里没做这一页。");
  });
  $("#qb").addEventListener("mousedown", (ev) => { if (ev.target !== inp) ev.preventDefault(); }); // 点底部别处不让输入框丢焦点
  inp.addEventListener("input", card);
  inp.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); }
    else if (ev.key === "Escape") { if (S.pm || S.wm || S.tm) shut(); else if (S.open) S.open = false; else return; render(); }
  });
  document.addEventListener("keydown", (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === "]") { ev.preventDefault(); nextWait(); } });
  $("#ctrls").addEventListener("click", (ev) => { const b = ev.target.closest("[data-go]"); if (!b) return; b.dataset.go === "story" ? story() : (tick++, GO[b.dataset.go]()); });
  const group = (sel, fn) => $(sel).addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; $(sel).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fn(b.value); });
  const fit = () => document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / 1440)));
  const setW = (v) => { win.style.width = `${v}px`; const q = $("#qb"), w = Number(v); q.style.setProperty("--mid", `${w >= 1440 ? 680 : w >= 1180 ? 600 : 540}px`); q.style.setProperty("--over", w >= 1440 ? "80px" : w >= 1180 ? "56px" : "40px"); };
  group("#width", (v) => { setW(v); render(); });
  win.addEventListener("transitionend", (ev) => { if (ev.target === win && ev.propertyName === "width") render(); });
  group("#marks", (v) => { S.marks = v === "on"; render(); });
  const setTheme = (theme) => { document.documentElement.dataset.resolvedTheme = theme; document.documentElement.dataset.theme = theme; $("#theme").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === theme))); };
  group("#theme", setTheme);
  fresh(); setW(1440); fit(); window.addEventListener("resize", fit);

  // ?theme=dark&width=1024&marks=on&do=go:y1,act:0,type:字,look,chip,send,ask… 供截图用
  const q = new URLSearchParams(location.search);
  setTheme(q.get("theme") || "light");
  if (q.get("width")) { setW(q.get("width")); $("#width").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.value === q.get("width")))); }
  if (q.get("marks")) { S.marks = true; $("#marks").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.value === "on"))); }
  render();
  (q.get("do") || "").split(",").filter(Boolean).forEach((c) => {
    const [n, v] = c.split(":");
    if (n === "go") { const f = find(v); setFocus(f.k, f.e.id, true); } else if (n === "topic") setFocus(v === "none" ? null : v, null, false); else if (n === "act") doAct(Number(v)); else if (n === "type") inp.value = v; else if (n === "look") S.look = true; else if (n === "open") S.open = true; else if (n === "tm") S.tm = "t"; else if (n === "em") S.tm = "e"; else if (n === "plus") S.pm = true; else if (n === "wm") S.wm = true; else if (n === "who") S.scene = Number(v); else if (n === "chip") S.chips.push(PLUS[S.chips.length % 3][0] === "paperclip" ? ["paperclip", "定价页-新版.png"] : [PLUS[S.chips.length % 3][0], PLUS[S.chips.length % 3][2]]); else if (n === "send") send(); else if (GO[n]) GO[n]();
    render();
  });
})();
