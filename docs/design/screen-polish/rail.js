/* 底栏第十一版的可点原型：事项的推进线。底部一整块 dock 就是这件事项：最左是事项，往右是办完的，中间是输入框，再往右是现在的（该你的、在办的）和接下来的。数据是假的，不是产品代码。 */
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
      { id: "d1", at: 2, nm: "起草发布说明", g: "done", kind: "doc", w: "11:20", sum: "已经写好。" },
      { id: "d2", at: 3, nm: "跑回归测试", g: "done", kind: "code", w: "13:05", sum: "全部通过。" },
      { id: "d3", at: 1, nm: "冻结代码", g: "done", kind: "todo", w: "昨天", sum: "已勾掉。" },
    ] },
    b: { nm: "定价页改版", grp: "现在", ev: [
      { id: "y3", nm: "确认三档价格", g: "you", kind: "doc", w: "等你定", sum: "三档的功能表排好了，中间一档的价格没定。", ask: { q: "中间一档定 ¥199 还是 ¥229？", acts: ["¥199", "¥229"] } },
      { id: "r3", nm: "改写定价页文案", g: "run", kind: "task", w: "第 1 步", sum: "在读现在的文案。" },
      { id: "d5", at: 1, nm: "收集竞品价格", g: "done", kind: "doc", w: "周一", sum: "收了 6 家。" },
    ] },
    c: { nm: "用户访谈整理", grp: "接下来", ev: [
      { id: "n3", nm: "整理访谈纪要", g: "next", kind: "doc", w: "停在第 3 段", sum: "6 份纪要整理了 2 份。", quick: ["接着整理第 3 段"] },
      { id: "d6", at: 1, nm: "约访 6 位用户", g: "done", kind: "todo", w: "上周", sum: "都约好了。" },
    ] },
  });
  let T, S, tick = 0, sendSeq = 0, newSeq = 0, doneSeq = 10, swap = true;
  const fresh = () => { T = mk(); S = { topic: "a", ev: null, open: false, threads: {}, notes: {}, drafts: {}, spawn: {}, chips: [], look: false, pm: false, wm: false, tm: null, way: "作为补充", scene: 0, flip: 0, pulse: null, marks: S ? S.marks : false, narrow: S ? S.narrow : false }; };
  const find = (id) => { for (const k of Object.keys(T)) { const e = T[k].ev.find((x) => x.id === id); if (e) return { k, e }; } return null; };
  const cur = () => (S.ev ? find(S.ev).e : null);
  const fkey = () => S.ev || S.topic || "project";
  const of = (k, g) => (k ? [k] : Object.keys(T)).flatMap((x) => T[x].ev.filter((e) => e.g === g));
  const pageName = () => (cur() ? cur().nm : S.topic ? T[S.topic].nm : PROJECT);
  const thread = (key) => (S.threads[key] ||= find(key) ? [{ t: find(key).e.sum }] : [{ t: T[key] ? `「${T[key].nm}」里的事都在这儿说。要办新的，直接说一句。` : "有什么要办的，直接说。" }]);
  const WHO = () => (cur() && cur().kind === "code" ? ["执行", "只讨论", "先出计划"] : ["助理", "只讨论", "交给 Coding"]);

  /* —— 窗口骨架：顶部借用静态样稿。底部一整块 dock：左边事项和办完的，中间输入框，右边现在的和接下来的 —— */
  const win = $("#win");
  win.innerHTML = `${window.spParts.top}<div class="sp-stage" id="stage"></div>
    <div class="lb" id="lb">
      <div class="lb-s l" id="left"></div>
      <div class="lb-m"><div class="lu" id="unit">
        <div class="lv" id="conv" hidden><div class="lx" id="tabs"></div><div class="lv-h" id="head"></div><div class="lv-top" id="top"></div><div class="lv-b" id="body"></div><div class="la" id="ans"></div></div>
        <div class="lt" id="card">
          <i class="lg" data-act="toggle" role="button" title="展开对话"></i>
          <textarea id="in" rows="1" autocomplete="off" aria-label="输入"></textarea>
          <div class="lf"><span class="lf-l" id="carry"></span><span class="lf-r" id="to"></span>
            <span class="dc-k" data-act="mic" role="button" title="语音">${I("mic", "s")}</span>
            <span class="dc-k send dim" data-act="send" role="button" id="send" aria-label="发送">${I("send", "s")}</span>
          </div>
        </div>
        <div class="pm" id="pm" hidden></div><div class="pm r" id="wm" hidden></div>
      </div></div>
      <div class="lb-s r" id="right"></div>
      <div class="lm" id="tm" hidden></div>
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


  const need = (el, gap, slack) => [...el.children].filter((c) => !c.classList.contains("grow")).reduce((w, c) => w + c.offsetWidth + gap, slack);
  // 事项环：一件事一段。办完的实色，在办的浅色，该你了的琥珀色，接下来的灰
  const ring = (xs) => { const n = xs.length || 1, r = 13, C = 2 * Math.PI * r, gap = n > 1 ? 2.6 : 0, len = C / n - gap, order = ["done", "run", "you", "next"].flatMap((g) => xs.filter((e) => e.g === g)); return `<svg class="rg" viewBox="0 0 32 32" aria-hidden="true"><g transform="rotate(-90 16 16)">${order.map((e, i) => `<circle class="${e.g}" cx="16" cy="16" r="${r}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-i * C / n).toFixed(2)}"/>`).join("")}</g></svg>`; };

  /* —— 推进线：一件事只按「右 → 左」走。位置只看它办到哪了，不因为被点过而多出来或挪地方 —— */
  const prog = (e) => e.p || (e.kind === "code" ? [9, 12] : [Math.max(0, (parseInt((e.w.match(/\d+/) || ["1"])[0], 10) || 1) - 1), 4]);
  const bar = (e) => { const [d, n] = prog(e); return n <= 6 ? `<span class="kbar">${Array.from({ length: n }, (_, i) => `<i class="${i < d ? "on" : i === d ? "now" : ""}"></i>`).join("")}</span>` : `<span class="kbar long"><i style="width:${Math.round((d / n) * 100)}%"></i></span>`; };
  // 一站：这一组叫什么、有几件，下面点名一件（专注的那件在这一组里就是它，否则是第一件）。整站是一个按钮
  const NONE = { done: "还没有", you: "没有等你的", run: "没有在办的", next: "没有排着的" };
  const byNew = (a, b) => (b.at || 0) - (a.at || 0);
  const grp = (k, g) => (g === "done" ? of(k, g).slice().sort(byNew) : of(k, g));
  const stn = (g, cap, xs, pre) => { const e = xs.find((x) => x.id === S.ev) || xs[0], n = xs.length;
    return `<span class="rc ${g}${e ? "" : " none"}${e && e.id === S.ev ? " on" : ""}${e && S.pulse === e.id ? " pulse" : ""}"${e ? ` data-k="${e.id}" data-act="go" data-id="${e.id}" role="button" title="${KIND[e.kind]} · ${e.w}${n > 1 ? `；这一站共 ${n} 件` : ""}"` : ""}><span class="cp">${G(g)}${cap}${n ? `<em>${n}</em>` : ""}${g === "run" && e ? bar(e) : ""}</span><span class="tx"><span class="nm cut">${e ? pre(e) + e.nm : NONE[g]}</span>${e ? `<small>${e.w}</small>` : ""}</span></span>`; };
  // 两边：事项是线的起点，后面的站都挂在这条线上。实线是走过的，点线是还没到的
  const sides = () => {
    const k = S.topic, pre = (e) => (k ? "" : `${T[find(e.id).k].nm} › `), all = k ? T[k].ev : Object.keys(T).flatMap((x) => T[x].ev), done = grp(k, "done");
    $("#left").innerHTML = `<span class="rh${S.ev ? "" : " on"}" data-act="tab" data-k="${k || ""}" role="button" title="${k ? "对整件事项说" : "对整个项目说"}">${k ? ring(all) : I("folder", "s")}<span class="tx"><small>${k ? "事项" : "项目"} · 办完 ${done.length} / ${all.length}</small><b class="cut">${k ? T[k].nm : PROJECT}</b></span><span class="rh-v" data-act="tm" role="button" title="换一件事项">${I("chevron-down", "xs")}</span></span><i class="rl"></i>${stn("done", "办完", done, pre)}<i class="rl f"></i>`;
    $("#right").innerHTML = `<i class="rl f"></i>${stn("you", "该你", of(k, "you"), pre)}<i class="rl"></i>${stn("run", "在办", of(k, "run"), pre)}<i class="rl d"></i>${stn("next", "接下来", of(k, "next"), pre)}<i class="rl d t"></i>`;
  };
  // 对话顶部的标签：第一枚是事项，后面是你所在这一站里的几件
  const tabs = () => {
    const e = cur(), k = S.topic;
    const first = `<span class="lx-t top${e ? "" : " on"}" data-act="tab" data-k="${k || ""}" role="button" title="${k ? "整件事项的对话" : "整个项目的对话"}">${k ? `<span class="mini">${ring(T[k].ev)}</span>` : I("folder", "xs")}<span class="cut">${k ? T[k].nm : PROJECT}</span></span>`;
    if (!e) return first;
    const xs = grp(k, e.g), max = 4, at = xs.findIndex((x) => x.id === e.id), shown = xs.slice(0, max); if (at >= max) shown[max - 1] = e;
    return `${first}<i class="lx-s"></i>${shown.map((x) => `<span class="lx-t ${x.g}${x.id === e.id ? " on" : ""}" data-act="go" data-id="${x.id}" role="button" title="${KIND[x.kind]} · ${x.w}">${G(x.g)}<span class="cut">${x.nm}</span></span>`).join("")}${xs.length > max ? `<span class="lx-m" data-act="${e.g === "done" ? "dm" : "lm"}" role="button" title="这一站的全部">+${xs.length - max}</span>` : ""}`;
  };

  /* —— 输入框下面一行：左边带着什么，右边给谁。一直是这一行，不因为点进去或打字多出来 —— */
  const PLUS = [["paperclip", "文件或图片…", "定价页-新版.png"], ["bookmark", "Shelf 里的", "发布清单"], ["folder", "项目资料", "品牌用语"]];
  const WAY = { 作为补充: "补充", 打断并改向: "打断", 下一轮再做: "下一轮" };
  const foot = () => {
    const e = cur(), L = $("#carry"), alt = S.scene % 3 > 0, ic = e && e.kind === "code" ? "code" : alt ? "user" : "sparkles";
    const look = `<span class="k-look${S.look ? " on" : ""}" data-act="look" role="button" title="${S.look ? "这句话会带上正在看的这一页；点一下不带" : "点一下，这句话带上正在看的这一页"}">${I("eye", "xs")}<span class="cut">正在看：${pageName()}</span>${S.look ? I("check", "xs ok") : ""}</span>`;
    const lh = (n) => `<span class="dc-k sm" data-act="plus" role="button" title="带上文件、Shelf 里的、项目资料">${I("plus", "s")}</span>${look}${S.chips.slice(0, n).map((c, i) => `<span class="dc-chip">${I(c[0], "xs")}<span class="cut">${c[1]}</span><span data-act="unchip" data-i="${i}" role="button">${I("x", "xs x")}</span></span>`).join("")}${S.chips.length > n ? `<span class="dc-chip more" data-act="plus" role="button" title="这句话带着的东西">${I("paperclip", "xs")}${n ? "+" : ""}${S.chips.length - n}</span>` : ""}`;
    let n = S.chips.length; L.innerHTML = lh(n); while (n > 0 && need(L, 6, 4) > L.clientWidth) L.innerHTML = lh(--n);
    $("#to").innerHTML = `<span class="k-who${alt ? " alt" : ""}" data-act="wm" role="button" title="这句话给谁办"><small>给</small>${I(ic, "xs")}<b>${WHO()[S.scene % 3]}</b>${I("chevron-down", "xs")}</span>${e && e.g === "run" ? `<span class="k-way" data-act="way" role="button" title="它正在办：这句话怎么送达">${WAY[S.way]}${I("chevron-down", "xs")}</span>` : ""}`;
    const pm = $("#pm"); pm.hidden = !S.pm; if (S.pm) pm.innerHTML = `${S.chips.length ? `<div class="dl-g">这句话带着</div>${S.chips.map((c, i) => `<div class="dl-r">${I(c[0], "xs")}<span class="nm cut">${c[1]}</span><span data-act="unchip" data-i="${i}" role="button" title="拿掉">${I("x", "xs x")}</span></div>`).join("")}<div class="dl-sep"></div>` : ""}<div class="dl-g">带上</div>${PLUS.map((p, i) => `<div class="dl-r" data-act="chip" data-i="${i}" role="button">${I(p[0], "xs")}<span class="nm">${p[1]}</span></div>`).join("")}`;
    const wm = $("#wm"); wm.hidden = !S.wm; if (S.wm) wm.innerHTML = `<div class="dl-g">这句话给谁办</div>${WHO().map((t, i) => `<div class="dl-r" data-act="who" data-i="${i}" role="button">${I(e && e.kind === "code" ? "code" : i ? "user" : "sparkles", "xs")}<span class="nm">${t}</span>${i === S.scene % 3 ? I("check", "xs ok") : ""}</div>`).join("")}`;
    const tm = $("#tm"); tm.hidden = !S.tm; tm.classList.toggle("r", S.tm === "e");
    if (S.tm === "t") { const row = (x) => { const c = of(x, "you").length; return `<div class="dl-r${x === S.topic ? " on" : ""}" data-act="tab" data-k="${x}" role="button"><span class="mini">${ring(T[x].ev)}</span><span class="nm cut">${T[x].nm}</span><small class="${c ? "you" : ""}">${c ? `${c} 件等你` : of(x, "run").length ? `${of(x, "run").length} 件在办` : `${T[x].ev.length} 件事`}</small></div>`; }; tm.innerHTML = ["现在", "接下来"].map((g) => `<div class="dl-g">${g}</div>${Object.keys(T).filter((x) => T[x].grp === g).map(row).join("")}`).join("") + `<div class="dl-sep"></div><div class="fs-foot"><span data-act="tab" data-k="" role="button">${I("folder", "xs")}整个项目</span><span data-act="stub" role="button">${I("plus", "xs")}新建事项</span><span data-act="stub" role="button">整理主线</span></div>`; }
    if (S.tm === "e") { const k = S.topic, grp = (g, t) => { const xs = of(k, g); return xs.length ? `<div class="dl-g">${t}</div>${xs.map((x) => `<div class="dl-r${x.id === S.ev ? " on" : ""}" data-act="go" data-id="${x.id}" role="button">${G(x.g)}<span class="nm cut">${k ? "" : `${T[find(x.id).k].nm} › `}${x.nm}</span><small class="${x.g}">${x.w}</small></div>`).join("")}` : ""; }; tm.innerHTML = `${grp("you", "该你了")}${grp("run", "在办")}${k ? grp("next", "接下来") : ""}<div class="dl-sep"></div><div class="fs-foot"><span>办完的在输入框左边</span></div>`; }
    if (S.tm === "d") { const k = S.topic, xs = of(k, "done").slice().sort((a, b) => (b.at || 0) - (a.at || 0)); tm.innerHTML = `<div class="dl-g">办完的</div>${xs.map((x) => `<div class="dl-r${x.id === S.ev ? " on" : ""}" data-act="go" data-id="${x.id}" role="button">${G("done")}<span class="nm cut">${k ? "" : `${T[find(x.id).k].nm} › `}${x.nm}</span><small>${x.w}</small></div>`).join("")}`; }
  };

  /* —— 向上长的那张纸，从上到下：这件事现在怎样、说过的话、该你做的 —— */
  const btn = (t, a, pri, extra = "") => `<span class="dc-act${pri ? " pri" : ""}" data-act="${a}" ${extra} role="button">${esc(t)}</span>`;
  const steps = (e) => (e.kind === "task" && e.g !== "done" ? `<div class="ls"><span>${G("done")}读</span><span>${G("run")}归类</span><span>${G("next")}写</span><span>${G("next")}对一遍</span></div>` : "");
  const conv = () => {
    const e = cur(), key = fkey(), n = S.notes[key], keys = `<span class="lk" data-act="more" role="button" title="详情、历史">${I("more", "s")}</span><span class="lk" data-act="toggle" role="button" title="收起">${I("chevron-down", "s")}</span>`;
    $("#tabs").innerHTML = tabs();
    $("#head").innerHTML = e ? `${G(e.g)}<small class="${e.g}">${e.w}</small><small>${KIND[e.kind]}</small><span class="grow"></span>${keys}` : `<small>${S.topic ? "这件事项的对话：交办新的事、问整件事项的事" : "整个项目的对话"}</small><span class="grow"></span>${keys}`;
    $("#top").innerHTML = e ? steps(e) : (S.spawn[key] || []).map((id) => { const f = find(id); return f ? `<div class="lv-k" data-act="go" data-id="${id}" role="button">${G(f.e.g)}<b class="cut">${f.e.nm}</b><small>${KIND[f.e.kind]}</small><span class="grow"></span><small class="${f.e.g}">${f.e.w}</small>${I("chevron-right", "xs")}</div>` : ""; }).join("");
    $("#body").innerHTML = thread(key).map((m) => (m.r ? `<div class="dd-r">${I("check", "xs")}${esc(m.r)}</div>` : `<div class="${m.me ? "dd-me" : "dd-it"}">${esc(m.t)}</div>`)).join("") + (e && e.ask ? `<div class="dd-it">${e.ask.q}</div>` : "");
    let a = "";
    if (n && n.kind === "sending") a = `<span class="la-t">${G("run")}发送中…</span>`;
    else if (n && n.kind === "fail") a = `<span class="la-t">${I("circle-alert", "s t-r")}没发出去，网络断了。你的字还在。</span>${btn("再试一次", "retry", 1)}`;
    else if (n && n.kind === "back") a = `<span class="la-t">${I("check", "s t-g")}模型已连接。</span>${btn("回到「修登录回归」接着做", "go", 1, `data-id="r2"`)}${btn("不用了", "dismiss")}`;
    else if (n && n.kind === "done") a = `${n.next ? btn(`下一件该你的：${n.next.nm}`, "go", 1, `data-id="${n.next.id}"`) : ""}${btn(`回到「${T[S.topic].nm}」`, "tab", !n.next, `data-k="${S.topic}"`)}`;
    else if (e && e.ask) a = e.ask.acts.map((x, i) => btn(x, "act", i === 0, `data-i="${i}"`)).join("");
    else if (e && e.quick && e.g !== "done") a = e.quick.map((x) => btn(x, "quick", 0, `data-t="${esc(x)}"`)).join("");
    $("#ans").innerHTML = a;
    const b = $("#body"); b.scrollTop = b.scrollHeight;
  };

  // 输入框：上面一行只有字，下面一行是带着什么、给谁、语音、发送。两行一直都在，所以点进去、打字都不挪位置；字多到换行才向上长
  const card = () => {
    const e = cur(), has = inp.value.trim().length > 0;
    inp.placeholder = e ? (e.ask ? `回「${e.nm}」一句，或点上面的选项` : e.g === "run" ? `给「${e.nm}」补充一句，它会在这一步之后读到` : `对「${e.nm}」说一句`) : S.topic ? `对「${T[S.topic].nm}」说一句，或输入 / 开始一件事` : "说一句，或输入 / 开始一件事";
    inp.style.height = "22px"; const h = Math.min(132, Math.max(22, inp.scrollHeight)); inp.style.height = `${h}px`; $("#card").classList.toggle("tall", h > 22);
    const stop = !has && e && e.g === "run";
    const s = $("#send"); s.className = `dc-k send${stop ? " stop" : has ? "" : " dim"}`; s.innerHTML = stop ? `<i class="sq"></i>` : I("send", "s"); s.title = stop ? "停下" : "发送（回车）";
  };

  const EASE = "cubic-bezier(.22,1,.36,1)";
  // 交办出去的一件事，从发送键飞到输入框右边
  const fly = (a, b) => { if (!a || !b) return; const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), d = document.createElement("i"); d.className = "kfly"; document.body.appendChild(d); const x0 = ra.left + ra.width / 2, y0 = ra.top + ra.height / 2, x1 = rb.left + 14, y1 = rb.top + rb.height / 2; d.animate([{ transform: `translate(${x0}px,${y0}px) scale(1)`, opacity: 1 }, { transform: `translate(${(x0 + x1) / 2}px,${Math.min(y0, y1) - 46}px) scale(1.25)`, opacity: 1, offset: 0.5 }, { transform: `translate(${x1}px,${y1}px) scale(.5)`, opacity: 0.3 }], { duration: 640, easing: "ease-in-out" }).onfinish = () => d.remove(); };
  let lastTopic, first = true;
  const render = () => {
    const was = {}; win.querySelectorAll(".lb-s [data-k]").forEach((el) => { was[el.dataset.k] = el.closest("#left") ? "l" : "r"; });
    const sheet = lastTopic !== undefined && lastTopic !== S.topic; lastTopic = S.topic;
    if (swap) { const st = $("#stage"); st.innerHTML = page(); st.classList.remove("swap", "turn"); void st.offsetWidth; st.classList.add(sheet ? "turn" : "swap"); swap = false; }
    $("#unit").classList.toggle("open", S.open); win.classList.toggle("marks", S.marks);
    $("#conv").hidden = !S.open; if (S.open) conv();
    sides(); foot(); card();
    if (!first) win.querySelectorAll(".lb-s [data-k]").forEach((el, i) => { const w = was[el.dataset.k], now = el.closest("#left") ? "l" : "r";
      if (sheet) el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: i * 24, easing: EASE, fill: "backwards" });
      else if (w === "r" && now === "l") el.animate([{ opacity: 0.2, transform: "translateX(90px)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: EASE });
      else if (!w) el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 280, easing: EASE }); });
    first = false; S.pulse = null;
    win.querySelectorAll(".mk-l").forEach((x) => x.remove());
    if (S.marks) [["#left", "1 · 事项　2 · 办完的", "top:-4px;left:0"], ["#card", "3 · 字", "top:-9px;right:16px"], ["#card", "4 · 带着", "bottom:-9px;left:14px"], ["#card", "5 · 给谁", "bottom:-9px;right:70px"], ["#right", "6 · 该你的、在办的、接下来的", "top:-4px;left:10px"], ["#tabs", "10 · 标签：事项，和这一站里的几件", "top:-12px;left:20px"], ["#head", "7 · 这件事现在怎样（任务卡）", "top:-9px;right:84px"], ["#body", "8 · 说过的话", "top:6px;right:14px"], ["#ans", "9 · 该你做的：选择项、接续", "top:-8px;right:14px"]].forEach(([sel, t, pos]) => { const el = $(sel); if (el && el.offsetParent && (el.children.length || sel === "#card")) el.insertAdjacentHTML("beforeend", `<span class="mk-l" style="${pos}">${t}</span>`); });
  };

  /* —— 动作 —— */
  const shut = () => { S.pm = false; S.wm = false; S.tm = null; };
  const setFocus = (k, id, open) => {
    S.drafts[fkey()] = inp.value;
    const same = k === S.topic && id === S.ev;
    S.topic = k; S.ev = id; S.open = open === undefined ? S.open : open; shut(); S.chips = []; S.look = false; S.scene = 0; S.flip = 0;
    inp.value = S.drafts[fkey()] || ""; if (!same) swap = true; render();
  };
  // 定一件事：选择项在对话最下面。定了以后它从输入框右边走到左边
  const answer = (id, i) => {
    const f = find(id); if (!f || !f.e.ask) return; const e = f.e, a = e.ask.acts[i], th = thread(id), here = id === S.ev;
    th.push({ t: e.ask.q }, { me: 1, t: a });
    if (e.ask.step) { e.ask = null; if (i === 0) { e.g = "run"; e.w = "第 3 步"; th.push({ t: "好，接着做第 3 步。" }); } else { e.g = "next"; e.w = "停着"; th.push({ t: "停在第 2 步。说一句就接着做。" }); } if (here) S.notes[id] = null; swap = true; render(); say("接续", i === 0 ? "它回去接着办：在右边从「等你定」变回在办，进度往前走了一格。" : "它停下来，排到接下来。"); return; }
    e.ask = null; e.g = "done"; e.w = "刚刚"; e.at = ++doneSeq; th.push({ t: `好，按「${a}」办了。` });
    const nx = of(S.topic, "you")[0] || null; if (here) S.notes[id] = { kind: "done", next: nx }; S.pulse = id; swap = true; render();
    say("办完一件", nx ? `它从输入框右边走到左边，事项的环多了一段实色。对话最下面给出下一件该你的「${nx.nm}」，它也是右边第一件。` : "它从输入框右边走到左边。这件事项里没有等你的了。");
  };
  const doAct = (i) => answer(S.ev, i);
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
      else if (S.topic === key) { const id = `x${++newSeq}`; const at = T[key].ev.findIndex((x) => x.g !== "you"); T[key].ev.splice(at < 0 ? T[key].ev.length : at, 0, { id, nm: t.replace(/[，。,.！!？?].*$/, "").slice(0, 12), g: "run", kind: alt ? "code" : "task", w: "第 1 步", sum: "刚开始办。" }); (S.spawn[key] ||= []).push(id); th.push({ r: `交给${alt ? " Coding " : "助理"}去办了` }); S.pulse = id; fly($("#send"), $("#right")); }
      else th.push({ t: "好。要我放进哪件事项里办？" });
      if (sq === sendSeq) S.notes[key] = null; render();
    }, 700);
    say("发出去了", e ? "对话从输入框向上长，回复在里面。" : "对话从输入框向上长，和输入框一样宽。交办出去的事是对话最上面的一行；一个点从发送键飞到右边，它排进「在办」。");
  };
  const stopRun = () => { const e = cur(); if (!e || e.g !== "run") return; e.g = "next"; e.w = "停下了"; thread(e.id).push({ t: "停下了。说一句就接着做。" }); swap = true; render(); say("停下", "没打字时发送键就是停下。它从在办变成接下来。"); };
  const nextWait = () => { const ws = of(S.topic, "you"); if (!ws.length) return say("没有等你的", "这件事项里没有该你了的。"); const i = ws.findIndex((e) => e.id === S.ev), e = ws[(i + 1) % ws.length]; setFocus(find(e.id).k, e.id, true); say("下一件该你的", `到了「${e.nm}」。`); };

  const REST = "底部是事项「发布 v2.3」的一条线：最左是事项，线上依次是办完的、输入框、该你的、在办的、接下来的。";
  const GO = {
    reset: () => { tick++; fresh(); inp.value = ""; swap = true; render(); say("平常", REST); },
    ask: () => { const e = find("r1").e; if (e.g !== "run") return GO.reset(); e.g = "you"; e.w = "等你定"; e.ask = { q: "内部重构的 9 条要不要写进日志？", acts: ["不写", "写成附录"] }; S.pulse = "r1"; swap = true; render(); say("助理问你", "「生成更新日志」从在办变成等你定，往输入框这边挪了一格，闪一下。不打断你正在做的，对话不会自己长出来。"); },
    step: () => { const e = find("r1").e; e.g = "you"; e.w = "问你"; e.ask = { q: "第 2 步做完了。接着做下一步？", acts: ["接着做", "先停"], step: 1 }; S.pulse = "r1"; swap = true; render(); say("做完一步", "交办时开了「每步先问我」：它变成等你定。点它，「接着做」在对话最下面。"); },
    back: () => { S.notes[fkey()] = { kind: "back" }; S.open = true; render(); say("从设置回来", "接着做哪一步，在对话最下面，和选择项同一个地方。"); },
    fail: () => { S.notes[fkey()] = { kind: "fail" }; S.open = true; render(); say("没发出去", "失败也在对话最下面。字留在框里。"); },
  };
  const story = () => {
    const tk = ++tick; let at = 0;
    const st = (ms, fn) => { at += ms; setTimeout(() => { if (tk === tick) fn(); }, at); };
    GO.reset(); tick = tk; say("1 · 平常", REST);
    st(2400, () => { setFocus("a", "y1", true); say("2 · 点右边第一件", "输入框右边第一站就是下一件该你的。点它：这一站亮起来，对话从输入框向上长；对话顶部的标签是事项，和「该你」这一站里的两件。"); });
    st(2800, () => doAct(0));
    st(2800, () => { setFocus("a", "y2", true); say("4 · 下一件该你的", "对话最下面给出的就是它。"); });
    st(2400, () => doAct(1));
    st(2400, () => { setFocus("a", null, false); say("6 · 回到事项", "点最左的事项。对话收起，主区回到这件事项的第一页。"); });
    st(2000, () => { inp.value = "出一份给销售的一页说明"; S.look = true; S.chips.push(["paperclip", "定价页-新版.png"]); render(); say("7 · 打字、带上东西", "输入框没动：字在上面一行，带着什么和给谁在下面一行，这两行一直都在。"); });
    st(2800, () => { send(); });
    st(3000, () => { GO.ask(); });
    st(2800, () => { setFocus("b", null, false); say("10 · 换事项", "点事项名旁边的箭头，换成「定价页改版」：整条线换成它的。"); });
    st(2800, () => { setFocus("a", null, false); say("演示完了", "可以自己点：线上的任何一件、最左的事项和它旁边的箭头、输入框下面那一行、主区里的行。"); });
  };

  /* —— 事件 —— */
  win.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el) { if (ev.target.closest("#stage") && (S.open || S.tm || S.pm || S.wm)) { S.open = false; shut(); render(); say("收起", "点主区，对话收起。"); } return; }
    const a = el.dataset.act, d = el.dataset;
    if (a === "tab") { const k = d.k || null; if (k === S.topic && !S.ev) { S.open = !S.open; shut(); render(); say(S.open ? "展开对话" : "收起", S.open ? "这件事项的对话。" : "收回。"); } else { const same = k === S.topic; setFocus(k, null, same ? S.open : false); say(k ? T[k].nm : "整个项目", same ? "回到这件事项：话是对整件事项说的，主区是它的第一页。" : k ? "整条线换成它的：办完的、该你的、在办的、接下来的。主区是它的第一页。真产品里顶部页签、右侧和助理的范围也跟着换。" : "回到整个项目：线上是各件事项里的事。"); } }
    else if (a === "go") { const f = find(d.id); setFocus(f.k, f.e.id, true); say(f.e.nm, f.e.ask ? "它在线上原位亮起来。它问的话在对话里，选择项在最下面。回一句也行。" : f.e.g === "run" ? "它在办。没打字时发送键是停下；说一句就是补充，输入框右下可以改成打断或下一轮。" : f.e.g === "done" ? "办完的也能点开：结果和记录都在对话里。" : "这件事现在怎样在对话最上面，记录在中间。"); }
    else if (a === "topic") { setFocus(d.k, null, false); say("换事项", "整张纸一起换。"); }
    else if (a === "tm" || a === "lm" || a === "dm") { const v = a === "tm" ? "t" : a === "lm" ? "e" : "d"; const on = S.tm === v; shut(); S.tm = on ? null : v; render(); say(a === "tm" ? "换事项" : a === "lm" ? "还没办完的" : "办完的", a === "tm" ? "每件事项前面是它的环：办完的实色，在办的浅色，等你的琥珀色。" : a === "lm" ? "线上放不下的在这里，顺序和线上一样：该你了、在办、接下来。" : "线上放不下的更早的几件。"); }
    else if (a === "toggle") { S.open = !S.open; shut(); render(); say(S.open ? "展开对话" : "收起", S.open ? "对话从输入框向上长，和输入框一样宽。" : "收回。"); }
    else if (a === "act") doAct(Number(d.i));
    else if (a === "quick") send(d.t);
    else if (a === "dismiss") { S.notes[fkey()] = null; render(); }
    else if (a === "retry") { S.notes[fkey()] = null; thread(fkey()).push({ t: "发出去了。" }); render(); }
    else if (a === "send") ($("#send").classList.contains("stop") ? stopRun() : send());
    else if (a === "plus") { const on = S.pm; shut(); S.pm = !on; render(); say("＋", "带上文件、Shelf 里的、项目资料。选了以后排在「正在看」的右边，字那一行不动。"); }
    else if (a === "chip") { const p = PLUS[Number(d.i)]; S.chips.push([p[0], p[2]]); shut(); render(); inp.focus(); say("带上了", "排在「正在看」的右边。点 × 拿掉，发出去就清空。"); }
    else if (a === "unchip") { S.chips.splice(Number(d.i), 1); render(); }
    else if (a === "look") { S.look = !S.look; shut(); render(); say("正在看", S.look ? "点亮了：这句话会带上正在看的这一页。再点一下不带。" : "不带了。它一直在这个位置，虚线表示这次不带。"); }
    else if (a === "wm") { const on = S.wm; shut(); S.wm = !on; render(); say("给谁", "这句话给谁办，一直写在输入框右下。换了以后只管这一句，发出去回到默认。"); }
    else if (a === "who") { S.scene = Number(d.i); shut(); render(); say("给谁", S.scene ? `这一句给「${WHO()[S.scene % 3]}」。` : "回到默认。"); }
    else if (a === "way") { const ws = ["作为补充", "打断并改向", "下一轮再做"]; S.way = ws[(ws.indexOf(S.way) + 1) % 3]; render(); say("怎么送达", `它正在办，这句话${S.way}。只在它在办的时候出现，位置在「给」的右边。`); }
    else if (a === "mic") say("语音", "位置在发送键左边。原型里没接。");
    else say(el.textContent.trim() || "⋯", "原型里没做这一页。");
  });
  $("#lb").addEventListener("mousedown", (ev) => { if (ev.target !== inp) ev.preventDefault(); }); // 点底部别处不让输入框丢焦点
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
  const setW = (v) => { win.style.width = `${v}px`; const q = $("#lb"), w = Number(v); S.narrow = w < 1180; q.classList.toggle("nar", S.narrow); q.classList.toggle("mid", w < 1440); q.style.setProperty("--mid", `${w >= 1440 ? 660 : w >= 1180 ? 560 : 470}px`); q.style.setProperty("--over", w >= 1440 ? "72px" : w >= 1180 ? "52px" : "40px"); };
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
    if (n === "go") { const f = find(v); setFocus(f.k, f.e.id, true); } else if (n === "topic") setFocus(v === "none" ? null : v, null, false); else if (n === "act") doAct(Number(v)); else if (n === "type") inp.value = v.replace(/\\n/g, "\n"); else if (n === "look") S.look = true; else if (n === "open") S.open = true; else if (n === "tm") S.tm = "t"; else if (n === "em") S.tm = "e"; else if (n === "plus") S.pm = true; else if (n === "wm") S.wm = true; else if (n === "who") S.scene = Number(v); else if (n === "chip") { const p = PLUS[S.chips.length % 3]; S.chips.push([p[0], p[2]]); } else if (n === "send") send(); else if (n === "dm") S.tm = "d"; else if (GO[n]) GO[n]();
    render();
  });
})();
