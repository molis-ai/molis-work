/* 底栏第七版的可点原型：上面一排是事项，左右两边是这件事项里的事件，中间是对话。数据是假的，不是产品代码。 */
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
  const fresh = () => { T = mk(); S = { topic: "a", ev: null, open: false, threads: {}, notes: {}, drafts: {}, chips: [], look: false, pm: false, tm: false, way: "作为补充", scene: 0, pulse: null, marks: S ? S.marks : false }; };
  const find = (id) => { for (const k of Object.keys(T)) { const e = T[k].ev.find((x) => x.id === id); if (e) return { k, e }; } return null; };
  const cur = () => (S.ev ? find(S.ev).e : null);
  const fkey = () => S.ev || S.topic || "project";
  const of = (k, g) => (k ? [k] : Object.keys(T)).flatMap((x) => T[x].ev.filter((e) => e.g === g));
  const pageName = () => (cur() ? cur().nm : S.topic ? T[S.topic].nm : PROJECT);
  const thread = (key) => (S.threads[key] ||= find(key) ? [{ card: key }, { t: find(key).e.sum }] : [{ t: T[key] ? `「${T[key].nm}」里的事都在这儿说。要办新的，直接说一句。` : "有什么要办的，直接说。" }]);
  const WHO = () => (cur() && cur().kind === "code" ? ["执行", "只讨论", "先出计划"] : ["助理", "只讨论", "交给 Coding"]);

  /* —— 窗口骨架：顶部借用静态样稿；输入框只建一次 —— */
  const win = $("#win");
  win.innerHTML = `${window.spParts.top}<div class="sp-stage" id="stage"></div>
    <div class="qb" id="qb">
      <div class="qw l" id="wl"></div>
      <div class="qm"><div class="qu" id="unit">
        <div class="qs" id="paper"><i class="qp" id="plate"></i>
          <div class="qv" id="conv" hidden><div class="qv-b" id="body"></div><div class="qa" id="ans"></div></div>
          <div class="qc" id="card"><div class="qchips" id="chips" hidden></div><div class="pc">
            <span class="dc-k" data-act="plus" role="button" title="带上东西、换谁来办">${I("plus", "s")}</span>
            <textarea id="in" rows="1" autocomplete="off" aria-label="输入"></textarea>
            <span class="dc-k" data-act="mic" role="button" title="语音">${I("mic", "s")}</span>
            <span class="q-way" data-act="way" role="button" id="way" hidden></span>
            <span class="dc-k send dim" data-act="send" role="button" id="send" aria-label="发送">${I("send", "s")}</span>
          </div></div>
        </div>
        <div class="qt" id="tabs"></div>
        <div class="tm" id="tm" hidden></div>
        <div class="pm" id="pm" hidden></div>
      </div></div>
      <div class="qw r" id="wr"></div>
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

  /* —— 上面一排：事项。亮着的那一枚和下面是同一张纸 —— */
  const tabs = () => {
    const e = cur();
    const tab = (k) => { const on = k === S.topic, n = of(k, "you").length; return `<span class="q-tab${on ? " on" : ""}" data-act="tab" data-k="${k}" role="button"><span class="cut">${T[k].nm}</span>${!on && n ? `<em class="n">${n}</em>` : ""}${on && e ? `${I("chevron-right", "xs sep")}<span class="sub">${G(e.g)}<span class="cut">${e.nm}</span></span><span class="x" data-act="up" role="button" title="回到这件事项">${I("x", "xs")}</span>` : ""}</span>`; };
    const now = Object.keys(T).filter((k) => T[k].grp === "现在" || k === S.topic);
    $("#tabs").innerHTML = `<span class="q-tab home${S.topic ? "" : " on"}" data-act="tab" data-k="" role="button" title="${PROJECT}（不选事项）">${I("folder", "s")}${S.topic ? "" : `<span class="cut">${PROJECT}</span>`}</span>${now.map(tab).join("")}<span class="q-k" data-act="tm" role="button" title="全部事项">${I("chevron-down", "xs")}</span><span class="grow"></span>${S.open ? `<span class="q-k" data-act="more" role="button" title="详情、历史">${I("more", "s")}</span>` : ""}<span class="q-k" data-act="toggle" role="button" title="${S.open ? "收起" : "展开对话"}">${I(S.open ? "chevron-down" : "chevron-up", "s")}</span>`;
    const tm = $("#tm"); tm.hidden = !S.tm;
    if (S.tm) { const row = (k) => { const n = of(k, "you").length; return `<div class="dl-r${k === S.topic ? " on" : ""}" data-act="tab" data-k="${k}" role="button">${I("folder", "xs")}<span class="nm cut">${T[k].nm}</span><small class="${n ? "you" : ""}">${n ? `${n} 件等你` : `${of(k, "run").length} 件在办`}</small></div>`; }; tm.innerHTML = ["现在", "接下来"].map((g) => `<div class="dl-g">${g}</div>${Object.keys(T).filter((k) => T[k].grp === g).map(row).join("")}`).join("") + `<div class="dl-sep"></div><div class="fs-foot"><span data-act="stub" role="button">${I("plus", "xs")}新建事项</span><span data-act="stub" role="button">整理主线</span></div>`; }
  };
  const plate = () => { const on = $("#tabs .q-tab.on"), over = S.open ? parseFloat(getComputedStyle($("#qb")).getPropertyValue("--over")) || 0 : 0; const p = $("#plate"); p.style.left = `${on.offsetLeft - over}px`; p.style.width = `${on.offsetWidth}px`; };

  /* —— 左右两边：这件事项里的事件。左边该你了，右边它在办的和接下来的 —— */
  const pill = (e, pre) => `<span class="dv ${e.g}${e.id === S.ev ? " on" : ""}${S.pulse === e.id ? " pulse" : ""}" data-k="${e.id}" data-act="go" data-id="${e.id}" role="button">${G(e.g)}<span class="nm">${pre ? `${pre} › ` : ""}${e.nm}</span><small>${e.w}</small></span>`;
  // 放得下几件就点名几件（每边最多三件），放不下的收成数字；正专注的那一件总在
  const need = (el) => [...el.children].filter((c) => !c.classList.contains("grow")).reduce((w, c) => w + c.offsetWidth + 4, 24);
  const fill = (el, xs, html) => { let n = Math.min(3, xs.length); el.innerHTML = html(n); while (n > 1 && need(el) > el.clientWidth) { n -= 1; el.innerHTML = html(n); } };
  const wings = () => {
    const k = S.topic, pre = (e) => (k ? "" : T[find(e.id).k].nm);
    const pin = (xs) => { const i = xs.findIndex((e) => e.id === S.ev); return i > 0 ? [xs[i], ...xs.filter((e) => e.id !== S.ev)] : xs; };
    const L = pin(of(k, "you")), R = [...pin(of(k, "run")), ...of(k, "next")], run = of(k, "run").length;
    fill($("#wl"), L, (n) => `${L.length > n ? `<span class="dn" data-act="tm" role="button">还有 ${L.length - n}</span>` : ""}${L.slice(0, n).reverse().map((e) => pill(e, pre(e))).join("")}`);
    fill($("#wr"), R, (n) => { const shown = R.slice(0, n), sr = shown.filter((e) => e.g === "run"), sn = shown.filter((e) => e.g === "next"); return `${sr.map((e) => pill(e, pre(e))).join("")}${run > sr.length ? `<span class="dn">在办还有 ${run - sr.length}</span>` : ""}${sn.length ? `${sr.length ? `<span class="q-vr"></span>` : ""}${sn.map((e) => pill(e, pre(e))).join("")}` : ""}<span class="grow"></span><span class="dt"><span class="dt-k" data-act="tasks" role="button" title="后台任务">${I("activity", "s")}<em>${of(null, "run").length}</em></span></span>`; });
    S.pulse = null;
  };

  /* —— 中间向上长的对话区：回复、任务反馈的卡片；最下面是答复位（选择项、接续） —— */
  const btn = (t, a, pri, extra = "") => `<span class="dc-act${pri ? " pri" : ""}" data-act="${a}" ${extra} role="button">${esc(t)}</span>`;
  const kcard = (id) => { const f = find(id); if (!f) return ""; const e = f.e, here = id === S.ev; return `<div class="qk${here ? " here" : ""}" ${here ? "" : `data-act="go" data-id="${id}" role="button"`}><div class="qk-h">${G(e.g)}<b>${e.nm}</b><small>${KIND[e.kind]}</small><span class="grow"></span><small class="${e.g}">${e.w}</small>${here ? "" : I("chevron-right", "xs")}</div>${e.kind === "task" && e.g !== "done" ? `<div class="qk-s"><span>${G("done")}读</span><span>${G("run")}归类</span><span>${G("next")}写</span><span>${G("next")}对一遍</span></div>` : ""}</div>`; };
  const conv = () => {
    const e = cur(), key = fkey(), n = S.notes[key];
    $("#body").innerHTML = thread(key).map((m) => (m.card ? kcard(m.card) : `<div class="${m.me ? "dd-me" : "dd-it"}">${esc(m.t)}</div>`)).join("") + (e && e.ask ? `<div class="dd-it">${e.ask.q}</div>` : "");
    let a = "";
    if (n && n.kind === "sending") a = `<span class="qa-t">${G("run")}发送中…</span>`;
    else if (n && n.kind === "fail") a = `<span class="qa-t">${I("circle-alert", "s t-r")}没发出去，网络断了。你的字还在。</span>${btn("再试一次", "retry", 1)}`;
    else if (n && n.kind === "back") a = `<span class="qa-t">${I("check", "s t-g")}模型已连接。</span>${btn("回到「修登录回归」接着做", "go", 1, `data-id="r2"`)}${btn("不用了", "dismiss")}`;
    else if (n && n.kind === "done") a = `${n.next ? btn(`下一件该你的：${n.next.nm}`, "go", 1, `data-id="${n.next.id}"`) : ""}${btn(`回到「${T[S.topic].nm}」`, "up", !n.next)}`;
    else if (e && e.ask) a = e.ask.acts.map((x, i) => btn(x, "act", i === 0, `data-i="${i}"`)).join("");
    else if (e && e.quick && e.g !== "done") a = e.quick.map((x) => btn(x, "quick", 0, `data-t="${esc(x)}"`)).join("");
    $("#ans").innerHTML = a;
    const b = $("#body"); b.scrollTop = b.scrollHeight;
  };

  const PLUS = [["paperclip", "文件或图片…", "定价页-新版.png"], ["bookmark", "Shelf 里的", "发布清单"], ["folder", "项目资料", "品牌用语"]];
  const WAY = { 作为补充: "补充", 打断并改向: "改向", 下一轮再做: "下一轮" };
  // 点进去、打字，输入框都不挪位置：字那一行永远在最下面，多了才向上长；带上的、换了谁来办是卡里字上面的一排片
  const card = () => {
    const e = cur(), has = inp.value.trim().length > 0, who = WHO()[S.scene % 3];
    inp.placeholder = e && e.ask ? "回它一句，或点上面的选项" : e && e.g === "run" ? "补充一句，它会在这一步之后读到" : "说一句，或输入 / 开始一件事";
    inp.style.height = "26px"; inp.style.height = `${Math.min(132, Math.max(26, inp.scrollHeight))}px`;
    const stop = !has && e && e.g === "run";
    const s = $("#send"); s.className = `dc-k send${stop ? " stop" : has ? "" : " dim"}`; s.innerHTML = stop ? `<i class="sq"></i>` : I("send", "s"); s.title = stop ? "停下" : "发送（回车）";
    const x = (a, extra = "") => `<span data-act="${a}" ${extra} role="button">${I("x", "xs x")}</span>`;
    const chips = [S.look ? `<span class="dc-chip">${I("eye", "xs")}<span class="cut">正在看：${pageName()}</span>${x("look")}</span>` : "", ...S.chips.map((c, i) => `<span class="dc-chip">${I(c[0], "xs")}<span class="cut">${c[1]}</span>${x("unchip", `data-i="${i}"`)}</span>`), S.scene % 3 ? `<span class="dc-chip who">${I("user", "xs")}<span class="cut">${who}</span>${x("who", `data-i="0"`)}</span>` : ""].filter(Boolean);
    const c = $("#chips"); c.hidden = !chips.length; c.innerHTML = chips.join("");
    const w = $("#way"); w.hidden = !(e && e.g === "run" && has); w.innerHTML = `${WAY[S.way]}${I("chevron-down", "xs")}`; w.title = `这句话怎么送达：${S.way}`;
    const pm = $("#pm"); pm.hidden = !S.pm; pm.style.bottom = `${$("#card").offsetHeight + (S.open ? 8 : 30)}px`; // 没开对话时开在标签那一排上面
    if (S.pm) pm.innerHTML = `<div class="dl-g">带上</div><div class="dl-r" data-act="look" role="button">${I("eye", "xs")}<span class="nm cut">正在看的这一页</span>${S.look ? I("check", "xs") : ""}</div>${PLUS.map((p, i) => `<div class="dl-r" data-act="chip" data-i="${i}" role="button">${I(p[0], "xs")}<span class="nm">${p[1]}</span></div>`).join("")}<div class="dl-sep"></div><div class="dl-g">谁来办</div>${WHO().map((t, i) => `<div class="dl-r" data-act="who" data-i="${i}" role="button">${I(i ? "user" : "sparkles", "xs")}<span class="nm">${t}</span>${i === S.scene % 3 ? I("check", "xs") : ""}</div>`).join("")}`;
  };

  /* 事件在两翼之间换位置时沿着底栏走过去（只有这一种位移） */
  const z = () => Number(getComputedStyle(document.documentElement).getPropertyValue("--z")) || 1;
  const snap = () => { const m = {}; win.querySelectorAll(".qw [data-k]").forEach((el) => { m[el.dataset.k] = el.getBoundingClientRect(); }); return m; };
  const play = (before) => win.querySelectorAll(".qw [data-k]").forEach((el) => { const b = before[el.dataset.k]; if (!b) { el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 250, easing: "cubic-bezier(.22,1,.36,1)" }); return; } const a = el.getBoundingClientRect(), dx = (b.left - a.left) / z(); if (Math.abs(dx) > 2) el.animate([{ transform: `translateX(${dx}px)` }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.22,1,.36,1)" }); });

  const render = () => {
    const before = snap();
    if (swap) { const st = $("#stage"); st.innerHTML = page(); st.classList.remove("swap"); void st.offsetWidth; st.classList.add("swap"); swap = false; }
    $("#unit").classList.toggle("open", S.open); win.classList.toggle("marks", S.marks);
    $("#conv").hidden = !S.open; if (S.open) conv();
    tabs(); wings(); card(); plate(); play(before);
    win.querySelectorAll(".mk-l").forEach((x) => x.remove());
    if (S.marks) [["#tabs", "1 · 标签：在哪件事里、发给谁", "top:-20px;left:22px"], ["#wl", "2 · 该你了", "top:-20px;right:0"], ["#wr", "3 · 它在办的、接下来的", "top:-20px;left:0"], ["#body", "4 · 回复和卡片", "top:10px;right:14px"], ["#ans", "5 · 答复位：选择项、接续", "top:-6px;right:14px"], ["#card", "6 · 字；带了东西、换了谁来办，上面多一排片", "top:-10px;right:18px"]].forEach(([sel, t, pos]) => { const el = $(sel); if (el && el.offsetParent) el.insertAdjacentHTML("beforeend", `<span class="mk-l" style="${pos}">${t}</span>`); });
  };

  /* —— 动作 —— */
  const setFocus = (k, id, open) => {
    S.drafts[fkey()] = inp.value;
    const same = k === S.topic && id === S.ev;
    S.topic = k; S.ev = id; S.open = open === undefined ? S.open : open; S.pm = false; S.tm = false; S.chips = []; S.look = false; S.scene = 0;
    inp.value = S.drafts[fkey()] || ""; if (!same) swap = true; render();
  };
  const doAct = (i) => {
    const e = cur(); if (!e || !e.ask) return; const a = e.ask.acts[i], th = thread(e.id);
    th.push({ t: e.ask.q }, { me: 1, t: a });
    if (e.ask.step) { e.ask = null; if (i === 0) { e.g = "run"; e.w = "第 3 步"; th.push({ t: "好，接着做第 3 步。" }); } else { e.g = "next"; e.w = "停着"; th.push({ t: "停在第 2 步。说一句就接着做。" }); } S.notes[e.id] = null; swap = true; render(); say("接续", i === 0 ? "它回到右边继续办。" : "它停下来，排到接下来里。"); return; }
    e.ask = null; e.g = "done"; e.w = "刚刚"; th.push({ t: `好，按「${a}」办了。` });
    const nx = of(S.topic, "you")[0] || null; S.notes[e.id] = { kind: "done", next: nx }; swap = true; render();
    say("办完一件", nx ? `它从左边消失。答复位给出下一件该你的「${nx.nm}」，左边也只剩它。` : "左边空了：这件事项里没有等你的了。");
  };
  const send = (text) => {
    const t = (text || inp.value).trim(); if (!t) return;
    const key = fkey(), e = cur(), way = S.way, th = thread(key);
    th.push({ me: 1, t: S.look ? `${t}（带上：${pageName()}）` : t }); if (!text) { inp.value = ""; S.drafts[key] = ""; } S.chips = []; S.look = false; S.pm = false; S.open = true;
    const wasAsk = e && e.ask; if (wasAsk) { e.ask = null; e.g = "run"; e.w = "在办"; swap = true; }
    S.notes[key] = { kind: "sending" }; render(); const sq = ++sendSeq;
    setTimeout(() => {
      if (wasAsk) th.push({ t: "好，按你说的改。" });
      else if (e) th.push({ t: e.g === "run" ? `收到，${way === "打断并改向" ? "现在就改方向" : way === "下一轮再做" ? "排到下一轮" : "这一步之后读到"}。` : "好，记下了。" });
      else if (S.topic === key) { const id = `x${++newSeq}`; T[key].ev.push({ id, nm: t.replace(/[，。,.！!？?].*$/, "").slice(0, 10), g: "run", kind: "task", w: "第 1 步", sum: "刚开始办。" }); th.push({ t: "好，交给后台去办了。办的过程在右边，办完或者要你定的时候会到左边。" }, { card: id }); S.pulse = id; }
      else th.push({ t: "好。要我放进哪件事项里办？" });
      if (sq === sendSeq) S.notes[key] = null; render();
    }, 700);
    say("发出去了", e ? "对话区长出来，回复在里面。" : "对话区长出来：一句回复，加一张任务卡。这件新的事同时出现在右边「它在办的」里。");
  };
  const stopRun = () => { const e = cur(); if (!e || e.g !== "run") return; e.g = "next"; e.w = "停下了"; thread(e.id).push({ t: "停下了。说一句就接着做。" }); swap = true; render(); say("停下", "没打字时发送键就是停下。它从在办变成接下来。"); };
  const nextWait = () => { const ws = of(S.topic, "you"); if (!ws.length) return say("没有等你的", "左边是空的。"); const i = ws.findIndex((e) => e.id === S.ev), e = ws[(i + 1) % ws.length]; setFocus(find(e.id).k, e.id, true); say("下一件该你的", `到了「${e.nm}」。`); };

  const GO = {
    reset: () => { tick++; fresh(); inp.value = ""; swap = true; render(); say("平常", "上面一排是事项，亮着的是「发布 v2.3」。左边两件该你了，右边是它在办的和接下来的。输入框里只有 ＋、字、语音、发送。"); },
    ask: () => { const e = find("r1").e; if (e.g !== "run") return GO.reset(); e.g = "you"; e.w = "等你定"; e.ask = { q: "内部重构的 9 条要不要写进日志？", acts: ["不写", "写成附录"] }; S.pulse = "r1"; swap = true; render(); say("助理问你", "「生成更新日志」从右边走到左边，闪一下。不打断你正在做的，也不在输入框上面多出一行。"); },
    step: () => { const e = find("r1").e; e.g = "you"; e.w = "问你"; e.ask = { q: "第 2 步做完了。接着做下一步？", acts: ["接着做", "先停"], step: 1 }; S.pulse = "r1"; swap = true; render(); say("做完一步", "交办时开了「每步先问我」：它到左边等你。点它，选择项在对话区最下面。"); },
    back: () => { S.notes[fkey()] = { kind: "back" }; S.open = true; render(); say("从设置回来", "接着做哪一步，在答复位，和选择项同一个地方。"); },
    fail: () => { S.notes[fkey()] = { kind: "fail" }; S.open = true; render(); say("没发出去", "失败也在答复位。字留在框里。"); },
  };
  const story = () => {
    const tk = ++tick; let at = 0;
    const st = (ms, fn) => { at += ms; setTimeout(() => { if (tk === tick) fn(); }, at); };
    fresh(); inp.value = ""; swap = true; render(); say("1 · 平常", "左边该你了，右边它在办的。上面一排是事项。");
    st(1800, () => { setFocus("a", "y1", true); say("2 · 点左边第一件", "对话区向上长：它的卡片、它问的话；选择项在最下面，紧挨输入框。主区换成它的文稿，标签上多了「› 定稿公告」。"); });
    st(2600, () => doAct(0));
    st(2400, () => { const n = S.notes[fkey()]; if (n && n.next) { setFocus("a", n.next.id, true); say("4 · 接着下一件", "点答复位里的「下一件该你的」，直接过去。"); } });
    st(2400, () => doAct(1));
    st(2200, () => { setFocus("a", null, false); say("6 · 回到事项", "点标签上的 ×。对话区收起，输入框上面只剩一排标签。"); });
    st(1800, () => { inp.value = "出一份给销售的一页说明"; S.look = true; render(); say("7 · 打字", "点进去、打字，输入框都不挪位置。带上了正在看的这一页，卡里字的上面才多一排片。"); });
    st(2600, () => { send(); });
    st(2600, () => { GO.ask(); });
    st(2600, () => { setFocus("b", null, false); say("10 · 换事项", "点上面的「定价页改版」：两边、主区一起换成那件事项的。"); });
    st(2400, () => { setFocus("a", null, false); say("演示完了", "可以自己点：两边的事件、上面的事项、主区里的行、输入框。"); });
  };

  /* —— 事件 —— */
  win.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) { if (ev.target.closest("#stage") && (S.open || S.tm || S.pm)) { S.open = false; S.tm = false; S.pm = false; render(); say("收起", "点主区，对话区收起。输入框上面只剩标签。"); } return; }
    const a = el.dataset.act, d = el.dataset;
    if (a === "tab") { const k = d.k || null; if (k === S.topic && !S.ev) { S.open = !S.open; S.tm = false; render(); say(S.open ? "展开对话" : "收起", S.open ? "这件事项的主对话。" : "收回。"); } else { setFocus(k, null, k === S.topic ? S.open : false); say(k ? "换事项" : "不选事项", k ? `两边换成「${T[k].nm}」里的事件，主区是它的第一页。真产品里标签页、右侧和助理的范围也跟着换。` : "回到整个项目：两边列的是各件事项里该你的和在办的。"); } }
    else if (a === "up") { ev.stopPropagation(); setFocus(S.topic, null, false); say("回到事项", "事件从标签上拿掉，对话区收起。"); }
    else if (a === "go") { const f = find(d.id); setFocus(f.k, f.e.id, true); say(f.e.nm, f.e.ask ? "它问的话在对话区，选择项在最下面。回一句也行。" : f.e.g === "run" ? "它在办。没打字时发送键是停下；说一句就是补充。" : "它的卡片和记录在对话区。"); }
    else if (a === "topic") { setFocus(d.k, null, false); say("换事项", "两边、主区一起换。"); }
    else if (a === "tm") { S.tm = !S.tm; render(); say("全部事项", "标签上只放「现在」这一组；别的在这里。"); }
    else if (a === "toggle") { S.open = !S.open; render(); say(S.open ? "展开对话" : "收起", S.open ? "对话区向上长，和输入框是同一张纸。" : "收回，底部还是 68 高。"); }
    else if (a === "act") doAct(Number(d.i));
    else if (a === "quick") send(d.t);
    else if (a === "dismiss") { S.notes[fkey()] = null; render(); }
    else if (a === "retry") { S.notes[fkey()] = null; thread(fkey()).push({ t: "发出去了。" }); render(); }
    else if (a === "send") ($("#send").classList.contains("stop") ? stopRun() : send());
    else if (a === "plus") { S.pm = !S.pm; render(); say("＋", "带上东西、换谁来办都从这里进。选了以后是卡里字上面的一枚片，字那一行不动。"); }
    else if (a === "chip") { const p = PLUS[Number(d.i)]; S.chips.push([p[0], p[2]]); S.pm = false; render(); inp.focus(); }
    else if (a === "unchip") { S.chips.splice(Number(d.i), 1); render(); }
    else if (a === "look") { S.look = !S.look; S.pm = false; render(); say("正在看", S.look ? "这次发送会带上正在看的这一页。它是卡里字上面的一枚片，点 × 不带。" : "不带了。"); }
    else if (a === "who") { S.scene = Number(d.i); S.pm = false; render(); say("谁来办", S.scene ? "换了以后是一枚片，发出去就清掉。默认的助理不显示。" : "回到默认。"); }
    else if (a === "way") { const ws = ["作为补充", "打断并改向", "下一轮再做"]; S.way = ws[(ws.indexOf(S.way) + 1) % 3]; render(); }
    else if (a === "mic") say("语音", "位置在发送键左边。原型里没接。");
    else if (a === "tasks") say("后台任务", "原型里没做这个面板。");
    else say(el.textContent.trim() || "⋯", "原型里没做这一页。");
  });
  $("#card").addEventListener("mousedown", (ev) => { if (ev.target !== inp) ev.preventDefault(); });
  $("#pm").addEventListener("mousedown", (ev) => ev.preventDefault());
  inp.addEventListener("input", card);
  inp.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); }
    else if (ev.key === "Escape") { if (S.pm) S.pm = false; else if (S.tm) S.tm = false; else if (S.open) S.open = false; else return; render(); }
  });
  document.addEventListener("keydown", (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === "]") { ev.preventDefault(); nextWait(); } });
  $("#ctrls").addEventListener("click", (ev) => { const b = ev.target.closest("[data-go]"); if (!b) return; b.dataset.go === "story" ? story() : (tick++, GO[b.dataset.go]()); });
  const group = (sel, fn) => $(sel).addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; $(sel).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fn(b.value); });
  const fit = () => document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / 1440)));
  const setW = (v) => { win.style.width = `${v}px`; const q = $("#qb"); q.style.setProperty("--mid", `${Number(v) >= 1180 ? 560 : 500}px`); q.style.setProperty("--over", Number(v) >= 1180 ? "80px" : "48px"); };
  group("#width", (v) => { setW(v); render(); });
  win.addEventListener("transitionend", (ev) => { if (ev.target === win && ev.propertyName === "width") render(); });
  group("#marks", (v) => { S.marks = v === "on"; render(); });
  const setTheme = (theme) => { document.documentElement.dataset.resolvedTheme = theme; document.documentElement.dataset.theme = theme; $("#theme").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === theme))); };
  group("#theme", setTheme);
  fresh(); setW(1440); fit(); window.addEventListener("resize", fit);

  // ?theme=dark&width=1024&marks=on&do=go:y1,act:0,type:字,send,ask… 供截图用
  const q = new URLSearchParams(location.search);
  setTheme(q.get("theme") || "light");
  if (q.get("width")) { setW(q.get("width")); $("#width").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.value === q.get("width")))); }
  if (q.get("marks")) { S.marks = true; $("#marks").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.value === "on"))); }
  render();
  (q.get("do") || "").split(",").filter(Boolean).forEach((c) => {
    const [n, v] = c.split(":");
    if (n === "go") { const f = find(v); setFocus(f.k, f.e.id, true); } else if (n === "topic") setFocus(v === "none" ? null : v, null, false); else if (n === "act") doAct(Number(v)); else if (n === "type") inp.value = v; else if (n === "look") S.look = true; else if (n === "open") S.open = true; else if (n === "tm") S.tm = true; else if (n === "plus") S.pm = true; else if (n === "chip") S.chips.push(["paperclip", "定价页-新版.png"]); else if (n === "send") send(); else if (GO[n]) GO[n]();
    render();
  });
})();
