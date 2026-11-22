/* 底栏第十二版的可点原型：对话分栏。左边是一叠「该你」的卡，中间是输入框，右边一条线上是办完、在办、接下来；事项是输入框上沿的标签；对话打开时左边多一栏放待确认、信息卡、总结和上下文。数据是假的，不是产品代码。 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const I = (n, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const G = (g) => (g === "done" ? I("check", "xs dg done") : `<i class="dg ${g}"></i>`);
  const Ge = (e) => (e.bad ? `<i class="dg bad"></i>` : e.wait ? `<i class="dg wait"></i>` : e.sug ? `<i class="dg sug"></i>` : G(e.g));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const PROJECT = "目录交互验证";
  const KIND = { doc: "文稿", code: "Coding 会话", task: "助理在办", cal: "日程", todo: "待办" };
  const mk = () => ({
    a: { nm: "发布 v2.3", grp: "现在", ev: [
      { id: "y1", nm: "定稿公告", g: "you", kind: "doc", w: "等你定", sum: "公告正文写好了，只差标题。", ask: { q: "标题用「更快的发布」还是「v2.3 来了」？", acts: ["用第一个", "用第二个"] } },
      { id: "y2", nm: "换定价页截图", g: "you", kind: "doc", w: "等你批", sum: "新截图换上去了，但里面的价格还是旧的。", ask: { q: "把定价页的截图换成新价格的，会改 3 处。", acts: ["同意", "改一下", "拒绝"], items: ["首屏的价格卡", "三档对比表", "页脚的小字"], why: "现在的截图里价格还是旧的" } },
      { id: "r1", nm: "生成更新日志", g: "run", kind: "task", w: "第 2 步", sum: "读完了 46 条提交，其中 9 条是内部重构，不会写进日志。", quick: ["重构的也列一下", "先给我看草稿"] },
      { id: "r2", nm: "修登录回归", g: "run", kind: "code", w: "在跑", sum: "定位到了：刷新令牌写回时用了旧的过期时间。12 条受影响的用例里 9 条已通过。", subs: [{ id: "sa", nm: "查受影响的用例", g: "done", w: "12 条" }, { id: "sb", nm: "写修复", g: "run", w: "改到第 2 个文件" }] },
      { id: "q1", nm: "生成发布截图", g: "run", wait: 1, kind: "task", w: "排队", sum: "排在「修登录回归」之后：两件要用同一个浏览器。" },
      { id: "n1", nm: "发布评审", g: "next", kind: "cal", w: "15:00", sum: "今天 15:00–15:30，4 人，线上会议室。", quick: ["让助理备材料"] },
      { id: "n2", nm: "推送公告", g: "next", kind: "todo", w: "评审后", sum: "评审通过以后发。" },
      { id: "s1", nm: "给销售一页说明", g: "next", sug: 1, kind: "doc", w: "助理提的", sum: "发布说明里有三处销售会被问到。要不要单独出一页？" },
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
  const fresh = () => { T = mk(); S = { topic: "a", ev: null, open: false, threads: {}, notes: {}, drafts: {}, spawn: {}, chips: [], look: false, pm: false, wm: false, tm: null, rp: null, all: false, sub: null, subT: {}, pick: false, hint: "", dot: null, opened: {}, dk: false, sb: false, pin: null, sidePane: null, max: false, rpAuto: false, w: S ? S.w : 1440, way: "作为补充", scene: 0, flip: 0, pulse: null, marks: S ? S.marks : false, narrow: S ? S.narrow : false }; };
  const find = (id) => { for (const k of Object.keys(T)) { const e = T[k].ev.find((x) => x.id === id); if (e) return { k, e }; } return null; };
  const cur = () => (S.ev ? find(S.ev).e : null);
  const fkey = () => S.ev || S.topic || "project";
  const of = (k, g) => (k ? [k] : Object.keys(T)).flatMap((x) => T[x].ev.filter((e) => e.g === g));
  const pageName = () => (cur() ? cur().nm : S.topic ? T[S.topic].nm : PROJECT);
  const thread = (key) => (S.threads[key] ||= find(key) ? [{ t: find(key).e.sum }] : [{ t: T[key] ? `「${T[key].nm}」里的事都在这儿说。要办新的，直接说一句。` : "有什么要办的，直接说。" }]);
  const WHO = () => (cur() && cur().kind === "code" ? ["执行", "只讨论", "先出计划"] : ["助理", "只讨论", "交给 Coding"]);

  /* —— 窗口骨架：顶部借用静态样稿。底部：左边一叠该你的卡，中间输入框（上沿是事项标签），右边一条线 —— */
  const win = $("#win");
  win.innerHTML = `${window.spParts.top}<div class="sp-stage" id="stage"></div>
    <div class="lb" id="lb">
      <div class="lb-s l" id="left"></div>
      <div class="lb-m"><div class="lu" id="unit">
        <div class="lx" id="tabs0"></div>
        <div class="lv" id="conv" hidden><div class="lx" id="tabs"></div><div class="lz" id="side"></div><div class="lv-x" id="keys"></div><div class="lv-b" id="body"></div></div>
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
      <div class="rp" id="rp" hidden></div>
      <div class="dkp" id="dkp" hidden></div>
    </div>`;
  const inp = $("#in");
  const say = (a, b) => { $("#step").textContent = a; $("#say").textContent = b; };

  /* —— 主区：跟着焦点换 —— */
  const P = (h1, sub, body) => `<div class="sp-sheet"><div class="sp-main"><div class="sp-mainhd"><h1>${h1}</h1><span class="sub">${sub}</span></div><div class="pp">${body}</div></div></div>`;
  const sk = (ws) => ws.map((w) => `<i class="sk" style="width:${w}%"></i>`).join("");
  const prow = (e) => `<div class="pp-r" data-act="go" data-id="${e.id}" role="button">${Ge(e)}<span class="nm">${e.nm}</span><small>${e.sug ? "建议" : KIND[e.kind]}</small><span class="grow"></span><small class="${e.bad ? "bad" : e.g}">${e.w}</small></div>`;
  const page = () => {
    const e = cur();
    if (!S.topic) return P(PROJECT, "项目的第一页", `<h3>手头的事项</h3>${Object.keys(T).map((k) => `<div class="pp-r" data-act="topic" data-k="${k}" role="button">${I("folder", "s")}<span class="nm">${T[k].nm}</span><span class="grow"></span><small class="${of(k, "you").length ? "you" : ""}">${of(k, "you").length ? `${of(k, "you").length} 件等你` : `${T[k].ev.length} 件东西`}</small></div>`).join("")}`);
    if (!e) { const grp = (g, t) => { const xs = of(S.topic, g); return xs.length ? `<h3>${t}<em>${xs.length}</em></h3>${xs.map(prow).join("")}` : ""; }; return P(T[S.topic].nm, `事项 · ${T[S.topic].ev.length} 件东西`, `${grp("you", "该你了")}${grp("run", "在办")}${grp("next", "接下来")}${grp("done", "办完")}`); }
    const sub = `${KIND[e.kind]} · ${T[S.topic].nm}`;
    if (e.kind === "code") return P(e.nm, sub, `<div class="pp-me">登录页在 Safari 里点「记住我」会掉登录，先定位再修。</div><p>${e.sum}</p><pre>pnpm test auth/refresh.test.ts\n  ✓ 9 通过　· 3 还在跑</pre>${sk([62, 48])}`);
    if (e.kind === "task") return P(e.nm, sub, `<div class="pp-steps"><span>${G("done")}第 1 步</span><span>${G(e.g === "done" ? "done" : "run")}第 2 步</span><span>${G(e.g === "done" ? "done" : "next")}第 3 步</span><span>${G(e.g === "done" ? "done" : "next")}第 4 步</span></div><p>${e.sum}</p>${sk([70, 54])}`);
    if (e.kind === "cal" || e.kind === "todo") return P(e.nm, sub, `<div class="pp-card"><b>${e.w}</b><span>${e.sum}</span></div>${sk([52, 40])}`);
    const fb = `<span class="fb"><span data-act="stub" role="button">${I("wand", "xs")}改写</span><span data-act="fbtodo" role="button">${I("check", "xs")}记成待办</span><span data-act="stub" role="button">更多${I("chevron-down", "xs")}</span><i></i><span class="ai" data-act="fbai" role="button">${I("sparkles", "xs")}助理</span></span>`;
    return P(e.nm, sub, `<h2>${e.nm}</h2><p>${e.sum}</p><p class="pk-p">这一版把中间一档的价格调了，<span class="pk${S.pick ? " on" : ""}" data-act="pick" role="button" title="选中这一句">销售要在周五前同步到新价格</span>，旧的报价单到月底作废。${S.pick ? fb : ""}</p>${sk([92, 86, 64, 0, 88, 73])}`);
  };


  const need = (el, gap, slack) => [...el.children].filter((c) => !c.classList.contains("grow")).reduce((w, c) => w + c.offsetWidth + gap, slack);
  // 事项环：一件事一段。办完的实色，在办的浅色，该你了的琥珀色，接下来的灰
  const ring = (xs) => { const n = xs.length || 1, r = 13, C = 2 * Math.PI * r, gap = n > 1 ? 2.6 : 0, len = C / n - gap, order = ["done", "run", "you", "next"].flatMap((g) => xs.filter((e) => e.g === g)); return `<svg class="rg" viewBox="0 0 32 32" aria-hidden="true"><g transform="rotate(-90 16 16)">${order.map((e, i) => `<circle class="${e.g}" cx="16" cy="16" r="${r}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-i * C / n).toFixed(2)}"/>`).join("")}</g></svg>`; };

  /* —— 推进线：一件事只按「右 → 左」走。位置只看它办到哪了，不因为被点过而多出来或挪地方 —— */
  const prog = (e) => e.p || (e.kind === "code" ? [9, 12] : [Math.max(0, (parseInt((e.w.match(/\d+/) || ["1"])[0], 10) || 1) - 1), 4]);
  const bar = (e) => { const [d, n] = prog(e); return n <= 6 ? `<span class="kbar">${Array.from({ length: n }, (_, i) => `<i class="${i < d ? "on" : i === d ? "now" : ""}"></i>`).join("")}</span>` : `<span class="kbar long"><i style="width:${Math.round((d / n) * 100)}%"></i></span>`; };
  // 右边一条线上的三站：办完、在办、接下来。每站两行小字：叫什么、几件（点它看这一站的全部），点名一件（点它专注到那件）
  const NONE = { done: "还没有", run: "没有在办的", next: "没有排着的" };
  const byNew = (a, b) => (b.at || 0) - (a.at || 0);
  const grp = (k, g) => (g === "done" ? of(k, g).slice().sort(byNew) : of(k, g));
  const stn = (g, cap, xs, pre) => { const e = xs.find((x) => x.id === S.ev) || xs[0], n = xs.length;
    return `<span class="rc ${g}${e ? "" : " none"}${e && e.id === S.ev ? " on" : ""}${e && S.pulse === e.id ? " pulse" : ""}"${e ? ` data-k="${e.id}"` : ""}><span class="cp${S.rp === g ? " on" : ""}"${n ? ` data-act="st" data-g="${g}" role="button" title="这一站的 ${n} 件"` : ""}>${G(g)}${cap}${n ? `<em>${n}</em>` : ""}${g === "run" && e && !e.wait ? bar(e) : ""}</span><span class="tx"${e ? ` data-act="go" data-id="${e.id}" role="button" title="${KIND[e.kind]} · ${e.w}"` : ""}><span class="nm cut">${e ? pre(e) + e.nm : NONE[g]}</span>${e ? `<small>${e.w}</small>` : ""}</span></span>`; };
  // 左边：该你了的，是一叠卡。最上面一张就是下一件，能直接在卡上定；定了它飞走，下面一张上来。专注着的那件不在这一叠里（它在对话左栏）
  const deckList = () => { const xs = of(S.topic, "you").filter((e) => e.id !== S.ev && e.ask), n = xs.length; return n ? xs.map((_, i) => xs[(i + S.flip) % n]) : xs; };
  const sides = () => {
    const k = S.topic, pre = (e) => (k ? "" : `${T[find(e.id).k].nm} › `), xs = deckList(), e = xs[0];
    const acts = e && (e.ask.items ? `<span class="dc-act pri" data-act="ans" data-id="${e.id}" data-i="0" role="button">${esc(e.ask.acts[0])}</span><span class="dc-act" data-act="go" data-id="${e.id}" role="button">看 ${e.ask.items.length} 处</span>` : e.ask.acts.slice(0, 2).map((x, i) => `<span class="dc-act${i === 0 ? " pri" : ""}" data-act="ans" data-id="${e.id}" data-i="${i}" role="button">${esc(x)}</span>`).join(""));
    const dkHtml = e ? `<div class="dk${e.bad ? " bad" : ""}${S.pulse === e.id ? " pulse" : ""}" data-k="${e.id}">${xs.length > 2 ? `<i class="dk-p p2"></i>` : ""}${xs.length > 1 ? `<i class="dk-p" data-act="flip" role="button" title="先看下一张"></i>` : ""}<div class="dk-c" data-act="go" data-id="${e.id}" role="button" title="打开这件事"><div class="dk-h">${Ge(e)}<b class="cut">${pre(e)}${e.nm}</b><span class="grow"></span>${xs.length > 1 ? `<span class="dk-n" data-act="flip" role="button" title="先看下一张">${e.bad ? "没办成" : "该你"} · 还有 ${xs.length - 1} 件${I("chevron-right", "xs")}</span>` : `<span class="dk-n">${e.bad ? "" : "该你 · "}${e.w}</span>`}</div><div class="dk-q cut">${e.ask.q}</div><div class="dk-a">${acts}<span class="grow"></span><span class="dk-o">打开${I("chevron-right", "xs")}</span></div></div></div>` : `<div class="dk0">${I("check", "s")}<span><b>${cur() && cur().ask ? "别的没有等你的" : "没有等你的"}</b><small>要你定的时候，卡会出现在这里</small></span></div>`;
    $("#left").innerHTML = dkHtml; const dp = $("#dkp"); dp.hidden = !(S.dk && S.w < 960 && e); dp.innerHTML = dp.hidden ? "" : dkHtml;
    $("#right").innerHTML = `<i class="rl f"></i>${stn("done", "办完", grp(k, "done"), pre)}<i class="rl"></i>${stn("run", "在办", of(k, "run"), pre)}<i class="rl d"></i>${stn("next", "接下来", of(k, "next"), pre)}<i class="rl d t"></i>`;
  };
  // 输入框上沿的标签：只有事项和事件。当前事项是一个组，它开着的事件对话排在组里面（包含关系）；别的事项是收起的一枚。项目不在这里（换项目在窗口右上角）
  const tabs = () => {
    const k = S.topic, e = cur(), others = Object.keys(T).filter((x) => x !== k && T[x].grp === "现在");
    const op = ((k && S.opened[k]) || []).map((id) => find(id)).filter(Boolean).map((f) => f.e), max = S.w >= 1920 ? 3 : S.w >= 1180 ? 2 : 1, two = S.w < 960, one = S.w <= 540, dl = deckList();
    let show = op.slice(-max); if (e && !show.includes(e)) show = [...show.slice(1), e]; if (S.w <= 540) show = e ? [e] : [];
    const rest = op.length - show.length, nw = S.dot && !S.open ? `<i class="nw" title="有新回复"></i>` : "";
    const et = (x) => `<span class="tg-e${x.id === S.ev ? " on" : ""}" data-act="go" data-id="${x.id}" role="button" title="「${T[k].nm}」里的一件：${x.nm}">${Ge(x)}<span class="cut">${x.nm}</span><span class="tg-x" data-act="xtab" data-id="${x.id}" role="button" title="关掉这个对话（这件事还在线上）">${I("x", "xs")}</span></span>`;
    const group = `<span class="tg"><span class="tg-h${e ? "" : " on"}" data-act="tab" data-k="${k || ""}" role="button" title="${k ? (e ? "回到整件事项的对话" : "这件事项的对话") : "没放进事项的话都在这儿"}">${k ? `<span class="mini">${ring(T[k].ev)}</span>` : I("inbox", "xs")}<span class="cut">${k ? T[k].nm : "不选事项"}</span>${nw}</span>${show.length ? I("chevron-right", "xs sep") : ""}${show.map(et).join("")}${rest > 0 ? `<span class="tg-m" data-act="om" role="button" title="这件事项里还开着 ${rest} 个对话">+${rest}</span>` : ""}</span>`;
    const tab = (x) => { const c = of(x, "you").length; return `<span class="lx-t" data-act="tab" data-k="${x}" role="button" title="换到「${T[x].nm}」"><span class="mini">${ring(T[x].ev)}</span><span class="cut">${T[x].nm}</span>${c ? `<em>${c}</em>` : ""}</span>`; };
    const tc = (g, t) => `<span class="tc${S.rp === g ? " on" : ""}" data-act="st" data-g="${g}" role="button" title="${t}">${G(g)}${one ? "" : t + " "}${of(k, g).length}</span>`;
    const cnt = two ? `<span class="grow"></span><span class="tc you${dl.length ? "" : " none"}${S.dk ? " on" : ""}" data-act="deck" role="button" title="该你的">${dl.length ? Ge(dl[0]) : G("done")}${one ? "" : "该你 "}${dl.length}</span>${one ? tc("run", "在办") : tc("done", "办完") + tc("run", "在办") + tc("next", "接下来")}` : "";
    return `${group}${one ? "" : others.map(tab).join("")}<span class="lx-m" data-act="tm" role="button" title="全部事项">${I("chevron-down", "xs")}</span>${cnt}`;
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
    const tm = $("#tm"); tm.hidden = !S.tm; tm.classList.remove("r");
    if (S.tm === "t") { const row = (x) => { const c = of(x, "you").length; return `<div class="dl-r${x === S.topic ? " on" : ""}" data-act="tab" data-k="${x}" role="button"><span class="mini">${ring(T[x].ev)}</span><span class="nm cut">${T[x].nm}</span><small class="${c ? "you" : ""}">${c ? `${c} 件等你` : of(x, "run").length ? `${of(x, "run").length} 件在办` : `${T[x].ev.length} 件事`}</small></div>`; }; tm.innerHTML = ["现在", "接下来"].map((g) => `<div class="dl-g">${g}</div>${Object.keys(T).filter((x) => T[x].grp === g).map(row).join("")}`).join("") + `<div class="dl-sep"></div><div class="fs-foot"><span data-act="tab" data-k="" role="button">${I("inbox", "xs")}不选事项</span><span data-act="stub" role="button">${I("plus", "xs")}新建事项</span><span data-act="stub" role="button">整理主线</span></div>`; }
    if (S.tm === "o") { const k = S.topic; tm.innerHTML = `<div class="dl-g">「${T[k].nm}」里开着的对话</div>${(S.opened[k] || []).map((id) => find(id)).filter(Boolean).map(({ e: x }) => `<div class="dl-r${x.id === S.ev ? " on" : ""}" data-act="go" data-id="${x.id}" role="button">${Ge(x)}<span class="nm cut">${x.nm}</span><small>${x.w}</small></div>`).join("")}`; }
  };

  // 主区右边的侧边栏：这件事项的东西、停在这里的卡、停过来的任务栏。它是主区的一部分，底栏不跟着它挪
  const KI = { doc: "file", code: "code", task: "sparkles", cal: "calendar", todo: "check" };
  const sideSheet = () => { const k = S.topic, xs = k ? T[k].ev : [], pin = S.pin && find(S.pin), g = S.sidePane, cap = { done: "办完", run: "在办", next: "接下来" }[g];
    return `<div class="sp-sheet sd"><div class="sd-h"><b>${k ? `「${T[k].nm}」的东西` : "侧边"}</b><span class="grow"></span>${[["bookmark", "Shelf"], ["idea", "灵光"], ["file", "文件"], ["message", "讨论"]].map(([n, t]) => `<span class="sd-i" data-act="stub" role="button" title="${t}">${I(n, "s")}</span>`).join("")}<span class="sd-i" data-act="sb" role="button" title="收起侧边">${I("x", "s")}</span></div><div class="sd-b">${pin ? `<div class="sd-p" data-act="go" data-id="${pin.e.id}" role="button"><div class="sd-ph">${I("pin", "xs")}停在这里<span class="grow"></span><span class="sd-x" data-act="unpin" role="button" title="拿走">${I("x", "xs")}</span></div><div class="zi">${Ge(pin.e)}<b class="cut">${pin.e.nm}</b></div><div class="zr"><small>${KIND[pin.e.kind]}</small><small class="${pin.e.bad ? "bad" : pin.e.g}">${pin.e.w}</small>${pin.e.g === "run" && !pin.e.wait ? bar(pin.e) : ""}</div></div>` : ""}${g ? `<div class="sd-p"><div class="sd-ph">${I("pin", "xs")}${cap} ${grp(k, g).length}<span class="grow"></span><span class="sd-x" data-act="unpane" role="button" title="拿走">${I("x", "xs")}</span></div>${grp(k, g).map((x) => `<div class="sd-r" data-act="go" data-id="${x.id}" role="button">${Ge(x)}<span class="nm cut">${x.nm}</span><small>${x.w}</small></div>`).join("")}</div>` : ""}<div class="sd-g">这件事项里的东西</div>${xs.filter((x) => !x.sug).map((x) => `<div class="sd-r${x.id === S.ev ? " on" : ""}" data-act="go" data-id="${x.id}" role="button">${I(KI[x.kind], "s")}<span class="nm cut">${x.nm}</span><small>${KIND[x.kind]}</small></div>`).join("")}</div></div>`; };

  // 右边向上长的任务栏：这一站的全部。在办的每件写真实步骤，能展开它派出去的子任务；点一个子任务，在这里和它说（它有自己的输入框，底部输入框不动）
  const rpane = () => {
    const el = $("#rp"), g = S.rp; el.hidden = !g; if (!g) return;
    if (S.sub) { const [pid, sid] = S.sub, p = find(pid).e, u = p.subs.find((x) => x.id === sid), th = (S.subT[sid] ||= [{ t: u.g === "done" ? `查完了：${u.w}受影响，都在 auth/ 下面。` : "在改 auth/refresh.ts：写回令牌时改用新的过期时间。" }]);
      el.innerHTML = `<div class="rp-h"><span class="rp-b" data-act="subback" role="button" title="回到这一站">${I("chevron-left", "xs")}<span class="cut">${p.nm}</span></span>${I("chevron-right", "xs sep")}<b class="cut">${u.nm}</b><span class="grow"></span><span class="lk" data-act="st" data-g="${g}" role="button" title="收起">${I("x", "xs")}</span></div><div class="rp-t"><div class="rp-st">${G(u.g)}${u.g === "done" ? "办完" : "在办"} · ${u.w}</div>${th.map((m) => `<div class="${m.me ? "dd-me" : "dd-it"}">${esc(m.t)}</div>`).join("")}</div><div class="rp-i"><input id="subin" placeholder="对「${u.nm}」说一句" autocomplete="off" aria-label="对子任务说"><span class="dc-k send dim" data-act="subsend" role="button" title="发给这件子任务">${I("send", "s")}</span></div><div class="rp-f">这句话只给这件子任务。底部的输入框还是对着「${pageName()}」。</div>`; return; }
    const k = S.all ? null : S.topic, cap = { done: "办完", run: "在办", next: "接下来" }[g], xs = grp(k, g), pre = (e) => (k ? "" : `${T[find(e.id).k].nm} › `);
    const row = (e) => `<div class="rp-r${e.id === S.ev ? " on" : ""}" data-act="go" data-id="${e.id}" role="button">${Ge(e)}<span class="rp-n"><b class="cut">${pre(e)}${e.nm}</b><small class="cut">${e.wait ? e.sum : e.sug ? `建议 · ${e.w}` : g === "done" ? `${e.w} · ${e.sum}` : `${e.w} · ${KIND[e.kind]}`}</small></span>${g === "run" && !e.wait ? bar(e) : ""}</div>${(e.subs || []).map((u) => `<div class="rp-r sub" data-act="sub" data-p="${e.id}" data-id="${u.id}" role="button">${G(u.g)}<b class="cut">${u.nm}</b><span class="grow"></span><small>${u.w}</small>${I("chevron-right", "xs")}</div>`).join("")}`;
    el.innerHTML = `<div class="rp-h">${G(g)}<b>${cap}</b><em>${xs.length}</em><span class="grow"></span>${S.topic ? `<span class="rp-s"><span class="${S.all ? "" : "on"}" data-act="rpall" data-v="" role="button">这件事项</span><span class="${S.all ? "on" : ""}" data-act="rpall" data-v="1" role="button">全部 ${of(null, g).length}</span></span>` : ""}<span class="lk" data-act="rppin" role="button" title="停到侧边">${I("pin", "xs")}</span></div><div class="rp-l">${xs.length ? xs.map(row).join("") : `<div class="rp-0">${NONE[g]}</div>`}</div><div class="rp-f">${g === "done" ? "更早的 14 件" : g === "run" ? "后台在办的都在这里。看别的事项的不会换事项，点一件才专注到它。" : "虚线的是建议，不算等你的。"}</div>`;
  };

  /* —— 向上长的那张纸，从上到下：这件事现在怎样、说过的话、该你做的 —— */
  const btn = (t, a, pri, extra = "") => `<span class="dc-act${pri ? " pri" : ""}" data-act="${a}" ${extra} role="button">${esc(t)}</span>`;
  const steps = (e) => (e.kind === "task" && e.g !== "done" ? `<div class="ls"><span>${G("done")}读</span><span>${G("run")}归类</span><span>${G("next")}写</span><span>${G("next")}对一遍</span></div>` : "");
  // 对话分两栏。右栏只有说过的话，和输入框一样宽；左栏从上到下：该你做的、这件事现在怎样、到现在为止、上下文
  const zc = (t, body, cls = "") => `<div class="zc${cls}"><div class="zc-h">${t}</div>${body}</div>`;
  const zk = (a, b) => `<div class="zk"><span>${a}</span><b class="cut">${b}</b></div>`;
  const conv = () => {
    const e = cur(), key = fkey(), n = S.notes[key], k = S.topic;
    $("#tabs").innerHTML = tabs();
    $("#keys").innerHTML = `<span class="lk" data-act="max" role="button" title="${S.max ? "还原" : "最大化：三块顶到页签下面"}">${I(S.max ? "minus" : "maximize", "s")}</span><span class="lk" data-act="more" role="button" title="详情、历史">${I("more", "s")}</span><span class="lk" data-act="toggle" role="button" title="收起">${I("chevron-down", "s")}</span>`;
    S.dot = null;
    $("#body").innerHTML = thread(key).map((m) => (m.r ? `<div class="dd-r">${I("check", "xs")}${esc(m.r)}${m.fix ? `<span data-act="stub" role="button">改</span>` : ""}</div>` : `<div class="${m.me ? "dd-me" : "dd-it"}">${esc(m.t)}</div>${m.rc ? `<div class="dd-rc">${I("check", "xs")}${esc(m.rc)}</div>` : ""}`)).join("") + (e && e.ask ? `<div class="dd-it">${e.ask.q}</div>` : "");
    let t = "", q = "", a = "";
    if (n && n.kind === "sending") { t = "发送中"; q = `<p>${G("run")} 正在发出去…</p>`; }
    else if (n && n.kind === "fail") { t = "没发出去"; q = "<p>网络断了。你的字还在输入框里。</p>"; a = btn("再试一次", "retry", 1); }
    else if (n && n.kind === "back") { t = "接着做"; q = "<p>模型已连接。</p>"; a = `${btn("回到「修登录回归」接着做", "go", 1, `data-id="r2"`)}${btn("不用了", "dismiss")}`; }
    else if (n && n.kind === "done") { t = "下一步"; q = "<p>这件办完了。</p>"; a = `${n.next ? btn(`下一件该你的：${n.next.nm}`, "go", 1, `data-id="${n.next.id}"`) : ""}${btn(`回到「${T[k].nm}」`, "tab", !n.next, `data-k="${k}"`)}`; }
    else if (e && e.ask) { t = e.bad ? "没办成" : e.ask.items ? "等你批" : "等你定"; q = `<p>${e.ask.q}</p>${e.ask.items ? `<ul class="zl">${e.ask.items.map((x) => `<li>${I("edit", "xs")}${x}</li>`).join("")}</ul><small class="zw">为什么问：${e.ask.why}</small>` : ""}`; a = e.ask.acts.map((x, i) => btn(x, "act", i === 0, `data-i="${i}"`)).join(""); }
    else if (e && e.sug) { t = "助理的建议"; a = `${btn("开始办", "sug", 1, `data-i="0"`)}${btn("不用了", "sug", 0, `data-i="1"`)}`; }
    else if (e && e.g === "done") { t = "办完了"; a = `${btn("打开结果", "stub", 1)}${btn("再改改", "again")}${e.undo ? btn("撤销", "undo") : ""}`; }
    else if (e && e.quick) { t = "可以直接说"; a = e.quick.map((x) => btn(x, "quick", 0, `data-t="${esc(x)}"`)).join(""); }
    const ask = t ? zc(t, `${q}${a ? `<div class="zc-a">${a}</div>` : ""}`, t === "可以直接说" || t === "办完了" || t === "助理的建议" ? " quick" : e && e.bad && e.ask ? " bad" : " ask") : "";
    const sp = (S.spawn[key] || []).map((id) => { const f = find(id); return f ? `<div class="lv-k" data-act="go" data-id="${id}" role="button">${G(f.e.g)}<b class="cut">${f.e.nm}</b><span class="grow"></span><small class="${f.e.g}">${f.e.w}</small></div>` : ""; }).join("");
    const cnt = (g, w) => `<span>${G(g)}${w} ${of(k, g).length}</span>`;
    const info = e ? zc(`这件事现在怎样<span class="zc-p" data-act="pin" role="button" title="停到侧边">${I("pin", "xs")}</span>`, `<div class="zi">${Ge(e)}<b class="cut">${e.nm}</b></div><div class="zr"><small>${e.sug ? "建议" : KIND[e.kind]}</small><small class="${e.bad ? "bad" : e.g}">${e.w}</small>${e.g === "run" && !e.wait ? bar(e) : ""}</div>${e.wait || e.bad ? "" : steps(e)}${e.subs ? `<div class="zs"><div class="lv-k" data-act="st" data-g="run" data-keep="1" role="button">${G("run")}<b>派出去 ${e.subs.length} 件子任务</b><span class="grow"></span>${I("chevron-right", "xs")}</div></div>` : ""}`) : zc(k ? "这件事项现在怎样" : "项目现在怎样", `<div class="zn">${cnt("you", "该你")}${cnt("run", "在办")}${cnt("next", "接下来")}${cnt("done", "办完")}</div>${sp ? `<div class="zs"><small>从这里交办出去的</small>${sp}</div>` : ""}`);
    const sum = zc("到现在为止", `<p>${e ? e.sum : k ? `一共 ${T[k].ev.length} 件事，办完 ${of(k, "done").length} 件。${of(k, "you").length ? `有 ${of(k, "you").length} 件等你定，定了才能往下走。` : "现在没有等你的。"}` : "各件事项里的事都在这儿。"}</p>`, " sum");
    const carry = [S.look ? `正在看：${pageName()}` : "", ...S.chips.map((c) => c[1])].filter(Boolean);
    const ctx = zc("上下文", `${zk("谁来办", WHO()[S.scene % 3])}${zk("方式", e && e.kind === "code" ? "先出计划，再动手" : "每步做完告诉我")}${zk("这句话带着", carry.length ? carry.join("、") : "没有")}${zk("放在", k ? T[k].nm : PROJECT)}`, " ctx");
    $("#side").innerHTML = ask + info + sum + ctx;
    const b = $("#body"); b.scrollTop = b.scrollHeight;
  };

  // 输入框：上面一行只有字，下面一行是带着什么、给谁、语音、发送。两行一直都在，所以点进去、打字都不挪位置；字多到换行才向上长
  const card = () => {
    const e = cur(), has = inp.value.trim().length > 0;
    $("#lb").classList.toggle("typing", has);
    inp.placeholder = S.hint ? S.hint : e ? (e.ask ? `回「${e.nm}」一句，或点上面的选项` : e.g === "run" ? `给「${e.nm}」补充一句，它会在这一步之后读到` : `对「${e.nm}」说一句`) : S.topic ? `对「${T[S.topic].nm}」说一句，或输入 / 开始一件事` : "说一句，或输入 / 开始一件事";
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
    if (!S.open) { if (S.max && S.rpAuto) S.rp = null; S.max = false; S.rpAuto = false; }
    if (swap) { const st = $("#stage"); st.innerHTML = page() + (S.sb ? sideSheet() : ""); st.classList.remove("swap", "turn"); void st.offsetWidth; st.classList.add(sheet ? "turn" : "swap"); swap = false; }
    $("#unit").classList.toggle("open", S.open); win.classList.toggle("marks", S.marks);
    win.classList.toggle("mx", S.max); $("#lb").classList.toggle("dlg", S.open); win.classList.toggle("sbon", S.sb); $("#lb").style.setProperty("--mxh", `${$("#stage").clientHeight - 2}px`);
    sides(); { const L = $("#lb"), dk = $("#left .dk,#left .dk0"), R = $("#right"); L.style.setProperty("--side", `${dk.offsetWidth + 14}px`); L.style.setProperty("--rside", `${R.clientWidth - 8}px`); L.style.setProperty("--rr", `${L.clientWidth - R.offsetLeft - R.offsetWidth}px`); }
    $("#tabs0").hidden = S.open; if (!S.open) $("#tabs0").innerHTML = tabs();
    $("#conv").hidden = !S.open; if (S.open) conv();
    foot(); card(); rpane(); $("#lb").classList.toggle("sidepri", S.open && !!$("#side .zc-a .dc-act.pri"));
    if (!first) win.querySelectorAll(".lb-s [data-k]").forEach((el, i) => { const w = was[el.dataset.k], now = el.closest("#left") ? "l" : "r", tgt = el.classList.contains("dk") ? el.querySelector(".dk-c") : el;
      if (sheet) tgt.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: i * 24, easing: EASE, fill: "backwards" });
      else if (w === "l" && now === "r") tgt.animate([{ opacity: 0.2, transform: "translateX(-80px)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: EASE });
      else if (!w || now === "l" && w !== "l") tgt.animate([{ opacity: 0.4, transform: "translateY(-7px) scale(.965)" }, { opacity: 1, transform: "none" }], { duration: 300, easing: EASE }); });
    first = false; S.pulse = null;
    win.querySelectorAll(".mk-l").forEach((x) => x.remove());
    if (S.marks) [["#left", "1 · 该你的：一叠卡，能直接在卡上定", "top:22px;left:0"], [S.open ? "#tabs" : "#tabs0", "2 · 标签：事项包着它的事件", "top:-12px;left:20px"], ["#card", "3 · 字", "top:-9px;right:16px"], ["#card", "4 · 带着", "bottom:-9px;left:14px"], ["#card", "5 · 给谁", "bottom:-9px;right:70px"], ["#right", "6 · 办完的、在办的、接下来的", "top:22px;left:14px"], ["#side", "7 · 左栏：该你做的、信息卡、总结、上下文", "top:-9px;left:12px"], ["#body", "8 · 右栏：只有说过的话", "top:8px;left:16px"], ["#rp", "9 · 任务栏：这一站的全部", "top:-9px;left:12px"]].forEach(([sel, t, pos]) => { const el = $(sel); if (el && el.offsetParent && (el.children.length || sel === "#card")) el.insertAdjacentHTML("beforeend", `<span class="mk-l" style="${pos}">${t}</span>`); });
  };

  /* —— 动作 —— */
  const shut = () => { S.pm = false; S.wm = false; S.tm = null; S.dk = false; };
  const setFocus = (k, id, open) => {
    S.drafts[fkey()] = inp.value;
    const same = k === S.topic && id === S.ev; if (id) { const o = (S.opened[k] ||= []); if (!o.includes(id)) o.push(id); }
    S.topic = k; S.ev = id; S.open = open === undefined ? S.open : open; shut(); S.chips = []; S.look = false; S.scene = 0; S.flip = 0; S.hint = ""; S.pick = false; S.sub = null;
    inp.value = S.drafts[fkey()] || ""; if (!same) swap = true; render();
  };
  // 定一件事：可以在对话左栏里定，也可以直接在左边那张卡上定（onCard）
  const answer = (id, i, onCard) => {
    const f = find(id); if (!f || !f.e.ask) return; const e = f.e, a = e.ask.acts[i], th = thread(id), here = id === S.ev;
    if (e.ask.items && i === 1) { if (!here) setFocus(f.k, id, true); S.hint = "说说怎么改，回车发给它"; render(); inp.focus(); say("改一下", "不用另开窗口：光标进输入框，提示语写着这句话是干什么的。说完回车，它按你说的重做。"); return; }
    const apply = () => {
      th.push({ t: e.ask.q }, { me: 1, t: a });
      if (e.ask.step || e.ask.retry) { const re = e.ask.retry; e.ask = null; e.bad = 0; if (i === 0) { e.g = "run"; e.w = re ? "再试第 2 步" : "第 3 步"; th.push({ t: re ? "再试一次：换了一条线路连仓库。" : "好，接着做第 3 步。" }); } else { e.g = "next"; e.w = re ? "放下了" : "停着"; th.push({ t: "停在第 2 步。说一句就接着做。" }); } if (here) S.notes[id] = null; S.flip = 0; S.pulse = id; swap = true; render(); say("接续", i === 0 ? "它回去接着办：卡走了，右边「在办」那一站是它，进度往前走了一格。" : "它停下来，排到接下来。"); return; }
      const no = e.ask.items && i === 2, todo = e.ask.todo && i === 0; if (e.ask.todo && i === 1) { T[f.k].ev.splice(T[f.k].ev.indexOf(e), 1); S.flip = 0; render(); say("不用了", "卡走了，什么都没记。"); return; }
      e.ask = null; e.g = "done"; e.w = no ? "没采纳" : todo ? "刚刚 · 能撤销" : "刚刚"; e.undo = todo ? 1 : 0; e.at = ++doneSeq; th.push({ t: no ? "好，不换。截图保持原样。" : `好，按「${a}」办了。` }); S.flip = 0; S.pulse = id;
      const nx = of(S.topic, "you")[0] || null; if (here) S.notes[id] = { kind: "done", next: nx }; swap = true; render();
      say(onCard ? "在卡上定了" : "办完一件", onCard ? (nx ? `没有离开手上的事。这张卡飞走，下面一张「${nx.nm}」上来；右边「办完」多了一件。` : "这张卡飞走，这件事项里没有等你的了；右边「办完」多了一件。") : nx ? `它到了右边「办完」那一站。对话左栏最上面给出下一件该你的「${nx.nm}」。` : "它到了右边「办完」那一站。这件事项里没有等你的了。");
    };
    const el = onCard && (S.w < 960 ? $("#dkp .dk-c") : $("#left .dk-c"));
    if (el) { let ran = false; const once = () => { if (!ran) { ran = true; apply(); } }; el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translate(40px,-26px) rotate(4deg)" }], { duration: 260, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards" }).onfinish = once; setTimeout(once, 420); } else apply();
  };
  const doAct = (i) => answer(S.ev, i, false);
  const send = (text) => {
    const t = (text || inp.value).trim(); if (!t) return;
    const key = fkey(), e = cur(), way = S.way, th = thread(key), who = WHO()[S.scene % 3], alt = S.scene % 3 > 0, carry = [S.look ? pageName() : "", ...S.chips.map((c) => c[1])].filter(Boolean);
    const mine = { me: 1, t: carry.length ? `${t}（带着：${carry.join("、")}）` : t }; th.push(mine); S.hint = ""; if (!text) { inp.value = ""; S.drafts[key] = ""; } S.chips = []; S.look = false; shut(); S.open = true; S.scene = 0;
    const wasAsk = e && e.ask; if (wasAsk) { e.ask = null; e.g = "run"; e.w = "在办"; swap = true; }
    S.notes[key] = { kind: "sending" }; render(); const sq = ++sendSeq;
    setTimeout(() => {
      mine.rc = e && e.g === "run" && !wasAsk ? `已送达 · ${way === "打断并改向" ? "现在就读" : way === "下一轮再做" ? "排到下一轮" : "排在这一步之后"}` : "已送达 · 读到了";
      if (wasAsk) th.push({ t: "好，按你说的改。" });
      else if (e) th.push({ t: e.g === "run" ? `收到，${way === "打断并改向" ? "现在就改方向" : way === "下一轮再做" ? "排到下一轮" : "这一步之后读到"}。` : "好，记下了。" });
      else if (S.topic === key && who === "只讨论") th.push({ t: "可以。先说说给销售看的重点是哪三处，我再帮你排顺序。" });
      else if (S.topic === key) { const id = `x${++newSeq}`; const at = T[key].ev.findIndex((x) => x.g !== "you"); T[key].ev.splice(at < 0 ? T[key].ev.length : at, 0, { id, nm: t.replace(/[，。,.！!？?].*$/, "").slice(0, 12), g: "run", kind: alt ? "code" : "task", w: "第 1 步", sum: "刚开始办。" }); (S.spawn[key] ||= []).push(id); th.push({ t: `好，这件我${alt ? "交给 Coding" : ""}去办，办完告诉你。` }, { r: `放进「${T[key].nm}」· 在办`, fix: 1 }); S.pulse = id; fly($("#send"), $("#right")); }
      else th.push({ t: "好。要我放进哪件事项里办？" });
      if (sq === sendSeq) S.notes[key] = null; render();
    }, 700);
    say("发出去了", e ? "对话从输入框向上长，回复在右栏。" : "对话从输入框向上长：右栏是说过的话，和输入框一样宽；左栏的信息卡里多了交办出去的那件。一个点从发送键飞到右边，它排进「在办」。");
  };
  const stopRun = () => { const e = cur(); if (!e || e.g !== "run") return; e.g = "next"; e.w = "停下了"; thread(e.id).push({ t: "停下了。说一句就接着做。" }); swap = true; render(); say("停下", "没打字时发送键就是停下。它从在办变成接下来。"); };
  const nextWait = () => { const ws = of(S.topic, "you"); if (!ws.length) return say("没有等你的", "这件事项里没有该你了的。"); const i = ws.findIndex((e) => e.id === S.ev), e = ws[(i + 1) % ws.length]; setFocus(find(e.id).k, e.id, true); say("下一件该你的", `到了「${e.nm}」。`); };

  const REST = "左边是一叠该你的卡，中间是输入框，上沿的标签是事项，右边一条线上是办完的、在办的、接下来的。";
  const GO = {
    reset: () => { tick++; fresh(); inp.value = ""; swap = true; render(); say("平常", REST); },
    ask: () => { const e = find("r1").e; if (e.g !== "run") return GO.reset(); e.g = "you"; e.w = "等你定"; e.ask = { q: "内部重构的 9 条要不要写进日志？", acts: ["不写", "写成附录"] }; S.pulse = "r1"; swap = true; render(); say("助理问你", "「生成更新日志」从右边的「在办」到了左边那叠卡里（「还有」的数字加一）。不打断你正在做的，对话不会自己长出来。"); },
    step: () => { const e = find("r1").e; e.g = "you"; e.w = "问你"; e.ask = { q: "第 2 步做完了。接着做下一步？", acts: ["接着做", "先停"], step: 1 }; S.pulse = "r1"; S.flip = Math.max(0, deckList().findIndex((x) => x.id === "r1")); swap = true; render(); say("做完一步", "交办时开了「每步先问我」：它变成一张卡，「接着做」就在卡上。"); },
    back: () => { S.notes[fkey()] = { kind: "back" }; S.open = true; render(); say("从设置回来", "接着做哪一步，在对话左栏最上面，和选择项同一个地方。"); },
    bad: () => { const e = find("r1").e; if (e.g !== "run") return GO.reset(); e.g = "you"; e.bad = 1; e.w = "第 2 步没成"; e.ask = { q: "读提交记录时断了：仓库连不上。", acts: ["再试一次", "先放下"], retry: 1 }; S.pulse = "r1"; S.flip = Math.max(0, deckList().findIndex((x) => x.id === "r1")); swap = true; render(); say("办到一半没成", "它从「在办」到了左边那叠卡里，是红点，不是琥珀：琥珀只表示等你定，红表示出了错。卡上直接「再试一次」或「先放下」。"); },
    float: () => { setFocus("a", "d1", false); S.pick = true; swap = true; render(); say("从页面上拿一段", "选中一句，浮条贴着它。点「✦ 助理」：这一句成了输入框左下的一枚小片，光标进输入框，对话不自己打开（不盖住你正指着的地方）。点「记成待办」：一张待确认的卡到左边那叠最上面，在卡上确认。"); },
    tasks: () => { S.rp = "run"; S.sub = null; render(); say("任务栏", "点右边的「在办 3」，这一站向上长出任务栏：每件写着真实的步骤，排队的写排在谁后面。「修登录回归」派出去两件子任务，点一件就在这里和它说。它和对话各开各的。"); },
    reply: () => { const k = fkey(); thread(k).push({ t: "更新日志的草稿好了，一共 37 条，按功能、修复、其他分了三组。" }); S.open = false; S.dot = k; render(); say("回复到了，对话关着", "不弹出来盖住主区：亮着的事项标签上多一个点。点标签看。"); },
    side: () => { S.sb = !S.sb; swap = true; render(); say(S.sb ? "侧边栏开了" : "侧边栏收了", S.sb ? "侧边栏是主区的一部分：主区让出宽度，底栏不动，输入框还在窗口正中。里面是这件事项的东西；从信息卡或任务栏点图钉，卡和清单会停到这里。" : "主区回到整宽，底栏没动。"); },
    max: () => { if (!S.ev) setFocus("a", "r2", true); S.open = true; S.max = !S.max; if (S.max && !S.rp) { S.rp = "run"; S.rpAuto = true; } else if (!S.max && S.rpAuto) { S.rp = null; S.rpAuto = false; } render(); say(S.max ? "最大化" : "还原", S.max ? "三块一起顶到页签下面，占满工作面：左栏、对话、任务栏。对话还是和输入框一样宽，输入框没动。" : "回到原来的大小，主区和侧边栏原样回来。"); },
    fail: () => { S.notes[fkey()] = { kind: "fail" }; S.open = true; render(); say("没发出去", "失败也在对话左栏最上面。字留在框里。"); },
  };
  const story = () => {
    const tk = ++tick; let at = 0;
    const st = (ms, fn) => { at += ms; setTimeout(() => { if (tk === tick) fn(); }, at); };
    GO.reset(); tick = tk; say("1 · 平常", REST);
    st(2400, () => { answer("y1", 0, true); });
    st(3000, () => { setFocus("a", "y2", true); say("3 · 想看清楚再定", "点卡片本身。对话向上长，分两栏：右栏只有说过的话，和输入框一样宽；左栏从上到下是等你定、这件事现在怎样、到现在为止、上下文。"); });
    st(3200, () => doAct(1));
    st(2600, () => { setFocus("a", null, false); say("5 · 回到事项", "点亮着的事项标签。对话收起，主区回到这件事项的第一页。"); });
    st(2000, () => { inp.value = "出一份给销售的一页说明"; S.look = true; S.chips.push(["paperclip", "定价页-新版.png"]); render(); say("6 · 打字、带上东西", "输入框没动：字在上面一行，带着什么和给谁在下面一行，这两行一直都在。"); });
    st(2800, () => { send(); });
    st(3200, () => { GO.ask(); });
    st(2800, () => { setFocus("b", null, false); say("9 · 换事项", "点另一枚事项标签「定价页改版」：左边的卡、右边的线一起换成它的。"); });
    st(2800, () => { setFocus("a", null, false); say("演示完了", "可以自己点：左边的卡和卡上的按钮、事项标签、右边线上的站、输入框下面那一行、主区里的行。"); });
  };

  /* —— 事件 —— */
  win.addEventListener("click", (ev) => {
    const sbtn = ev.target.closest(".sp-ib"); if (sbtn && sbtn.querySelector('use[href="#icon-panel"]')) { S.sb = !S.sb; swap = true; render(); say(S.sb ? "侧边栏开了" : "侧边栏收了", S.sb ? "侧边栏是主区的一部分：主区让出宽度，底栏不动，输入框还在窗口正中。" : "主区回到整宽，底栏没动。"); return; }
    const el = ev.target.closest("[data-act]");
    if (!el) { if (ev.target.closest("#stage") && !ev.target.closest(".sd") && (S.open || S.tm || S.pm || S.wm || S.rp || S.dk)) { S.open = false; S.rp = null; S.sub = null; shut(); render(); say("收起", "点主区，对话和任务栏都收起。"); } return; }
    const a = el.dataset.act, d = el.dataset;
    if (a === "tab") { const k = d.k || null; if (k === S.topic && !S.ev) { S.open = !S.open; shut(); render(); say(S.open ? "展开对话" : "收起", S.open ? "这件事项的对话。" : "收回。"); } else { const same = k === S.topic; setFocus(k, null, same ? S.open : false); say(k ? T[k].nm : "整个项目", same ? "回到这件事项：话是对整件事项说的，主区是它的第一页。" : k ? "左边的卡、右边的线一起换成它的。主区是它的第一页。真产品里顶部页签、右侧和助理的范围也跟着换。" : "回到整个项目：卡和线上是各件事项里的事。"); } }
    else if (a === "go") { const f = find(d.id); setFocus(f.k, f.e.id, true); say(f.e.nm, f.e.ask ? "对话分两栏：它问的话和选择项在左栏最上面，右栏只有说过的话。回一句也行。" : f.e.g === "run" ? "它在办：进度和步骤在左栏的信息卡里。没打字时发送键是停下；说一句就是补充。" : f.e.g === "done" ? "办完的也能点开：结果在左栏，记录在右栏。" : "这件事现在怎样在左栏，记录在右栏。"); }
    else if (a === "topic") { setFocus(d.k, null, false); say("换事项", "整张纸一起换。"); }
    else if (a === "deck") { const on = S.dk; shut(); S.dk = !on && deckList().length > 0; render(); say("该你的", S.dk ? "窄窗口里卡叠收成标签行右端的「该你 N」。点它，最上面那张卡向上弹出来，照样能在卡上答。" : deckList().length ? "收回。" : "没有等你的。"); }
    else if (a === "xtab") { const k = S.topic, o = S.opened[k] || [], i = o.indexOf(d.id); if (i >= 0) o.splice(i, 1); if (d.id === S.ev) setFocus(k, null, S.open); else render(); say("关掉一个对话", "只是把这个对话的标签关掉。这件事还在线上，在办的照样办。"); }
    else if (a === "om") { const on = S.tm === "o"; shut(); S.tm = on ? null : "o"; render(); say("开着的对话", "这件事项里你打开过、还没关的对话。"); }
    else if (a === "sb") { S.sb = !S.sb; swap = true; render(); say(S.sb ? "侧边栏开了" : "侧边栏收了", S.sb ? "侧边栏是主区的一部分：主区让出宽度，底栏不动，输入框还在窗口正中。里面是这件事项的东西；换事项它跟着换。" : "主区回到整宽，底栏没动。"); }
    else if (a === "pin") { S.pin = S.ev; S.sb = true; swap = true; render(); say("停到侧边", "这件事的卡停在侧边栏最上面。对话收起以后它还在，状态跟着变。"); }
    else if (a === "unpin") { S.pin = null; swap = true; render(); }
    else if (a === "rppin") { S.sidePane = S.rp; S.sb = true; S.rp = null; S.rpAuto = false; swap = true; render(); say("任务栏停到侧边", "这一站的清单停进侧边栏，一直看得见；点右边的站还能再临时打开。"); }
    else if (a === "unpane") { S.sidePane = null; swap = true; render(); }
    else if (a === "max") { S.max = !S.max; if (S.max && !S.rp) { S.rp = "run"; S.rpAuto = true; } else if (!S.max && S.rpAuto) { S.rp = null; S.rpAuto = false; } render(); say(S.max ? "最大化" : "还原", S.max ? "三块一起顶到页签下面，占满工作面：左栏、对话、任务栏。对话还是和输入框一样宽，输入框没动。主区和侧边栏让出来，还原以后原样回来。" : "回到原来的大小，主区和侧边栏原样回来。"); }
    else if (a === "tm") { const on = S.tm === "t"; shut(); S.tm = on ? null : "t"; render(); say("换事项", "每件事项前面是它的环：办完的实色，在办的浅色，等你的琥珀色。看这张清单不会换事项，点了才换。"); }
    else if (a === "st") { const on = S.rp === d.g && !d.keep; shut(); S.rp = on ? null : d.g; S.sub = null; S.all = false; render(); say(on ? "收起任务栏" : { run: "在办的全部", done: "办完的全部", next: "接下来的全部" }[d.g], on ? "收回。" : d.g === "run" ? "任务栏从这一站向上长：每件写真实步骤，排队的写排在谁后面，子任务缩进在下面。" : d.g === "done" ? "最近的在最上面。" : "排着的和建议。虚线的是建议，不算等你的。"); }
    else if (a === "rpall") { S.all = !!d.v; render(); say(S.all ? "全部事项" : "这件事项", S.all ? "看别的事项在办的，不会换事项。" : "只看这件事项的。"); }
    else if (a === "sub") { S.sub = [d.p, d.id]; render(); const si = $("#subin"); if (si) si.focus(); say("和子任务说", "在任务栏里换成它的对话，带它自己的输入框（第 58 批已定样）。底部的输入框不动，还是对着原来那件。"); }
    else if (a === "subback") { S.sub = null; render(); }
    else if (a === "subsend") { const si = $("#subin"), v = si.value.trim(); if (!v) return; const th = S.subT[S.sub[1]]; th.push({ me: 1, t: v }, { t: "收到，这一步之后读到。" }); render(); $("#subin").focus(); }
    else if (a === "pick") { S.pick = !S.pick; swap = true; render(); say(S.pick ? "选中了一句" : "不选了", S.pick ? "浮条贴着选中的地方：改写、记成待办、更多、✦ 助理。" : "浮条收起。"); }
    else if (a === "fbai") { S.chips.unshift(["text", "选中的一句 · 起草发布说明"]); fly(el, $("#carry")); S.pick = false; swap = true; render(); inp.focus(); say("✦ 助理", "选中的那一句成了输入框左下的一枚小片，光标进了输入框。对话没有自己打开。接着打字、回车。"); }
    else if (a === "fbtodo") { const id = `t${++newSeq}`; T.a.ev.unshift({ id, nm: "记成待办", g: "you", kind: "todo", w: "等你确认", sum: "从「起草发布说明」里选的一句。", ask: { q: "待办：给销售同步新价格 · 周五前", acts: ["记成待办", "不用了"], todo: 1 } }); S.flip = 0; S.pulse = id; S.pick = false; fly(el, $("#left")); swap = true; render(); say("记成待办", "要确认的写动作不弹窗：一张卡到左边那叠最上面，标题、截止都写在卡上。在卡上点「记成待办」就建了，它到右边「办完」，能撤销。"); }
    else if (a === "sug") { const e = cur(); if (Number(d.i) === 0) { e.sug = 0; e.g = "run"; e.w = "第 1 步"; S.pulse = e.id; thread(e.id).push({ me: 1, t: "开始办" }, { t: "好，先列出销售会被问到的三处。" }); swap = true; render(); say("开始办", "建议变成在办的一件：它从「接下来」到了「在办」。"); } else { const k = S.topic; T[k].ev.splice(T[k].ev.indexOf(e), 1); setFocus(k, null, false); say("不用了", "它从线上拿掉。同一件事上不再提同类的建议。"); } }
    else if (a === "again") { S.hint = "说说哪里要改，它接着这一版改"; render(); inp.focus(); say("再改改", "光标进输入框。说完回车，它在这件事里接着做，不另开一件。"); }
    else if (a === "undo") { const e = cur(), k = S.topic; T[k].ev.splice(T[k].ev.indexOf(e), 1); setFocus(k, null, false); say("撤销了", "待办删掉，线上也没有了。"); }
    else if (a === "toggle") { S.open = !S.open; shut(); render(); say(S.open ? "展开对话" : "收起", S.open ? "对话从输入框向上长：右栏和输入框一样宽，左栏是信息。" : "收回。"); }
    else if (a === "act") doAct(Number(d.i));
    else if (a === "ans") answer(d.id, Number(d.i), true);
    else if (a === "flip") { S.flip += 1; render(); say("先看下一张", "这张压到最下面，没有定。"); }
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
  $("#lb").addEventListener("mousedown", (ev) => { if (ev.target !== inp && ev.target.id !== "subin") ev.preventDefault(); });
  $("#lb").addEventListener("keydown", (ev) => { if (ev.target.id === "subin" && ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); $("#rp [data-act=subsend]").click(); } }); // 点底部别处不让输入框丢焦点
  inp.addEventListener("input", card);
  inp.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); }
    else if (ev.key === "Escape") { if (S.pm || S.wm || S.tm) shut(); else if (S.max) { S.max = false; if (S.rpAuto) { S.rp = null; S.rpAuto = false; } } else if (S.rp) { S.rp = null; S.sub = null; } else if (S.open) S.open = false; else return; render(); }
  });
  document.addEventListener("keydown", (ev) => { if ((ev.metaKey || ev.ctrlKey) && ev.key === "]") { ev.preventDefault(); nextWait(); } });
  $("#ctrls").addEventListener("click", (ev) => { const b = ev.target.closest("[data-go]"); if (!b) return; b.dataset.go === "story" ? story() : (tick++, GO[b.dataset.go]()); });
  const group = (sel, fn) => $(sel).addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; $(sel).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fn(b.value); });
  const fit = () => document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / Math.max(1440, S.w))));
  const setW = (v) => { win.style.width = `${v}px`; const q = $("#lb"), w = Number(v); S.w = w; fit(); S.narrow = w < 1180; q.classList.toggle("nar", S.narrow); q.classList.toggle("mid", w < 1440); q.classList.toggle("two", w < 960); q.classList.toggle("one", w <= 540); q.style.setProperty("--mid", `${w >= 1920 ? 720 : w >= 1440 ? 660 : w >= 1180 ? 560 : w >= 960 ? 470 : w > 540 ? w - 36 : w - 20}px`); q.style.setProperty("--over", w >= 1440 ? "72px" : w >= 1180 ? "52px" : "40px"); };
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
    if (n === "go") { const f = find(v); setFocus(f.k, f.e.id, true); } else if (n === "topic") setFocus(v === "none" ? null : v, null, false); else if (n === "act") doAct(Number(v)); else if (n === "type") inp.value = v.replace(/\\n/g, "\n"); else if (n === "look") S.look = true; else if (n === "open") S.open = true; else if (n === "tm") S.tm = "t"; else if (n === "deck") S.dk = true; else if (n === "sb") { S.sb = true; swap = true; } else if (n === "pin") { S.pin = S.ev; S.sb = true; swap = true; } else if (n === "max") { S.max = true; if (!S.rp) { S.rp = "run"; S.rpAuto = true; } } else if (n === "rp") { S.rp = v || "run"; } else if (n === "sub") { S.rp = "run"; S.sub = ["r2", "sb"]; } else if (n === "plus") S.pm = true; else if (n === "wm") S.wm = true; else if (n === "who") S.scene = Number(v); else if (n === "chip") { const p = PLUS[S.chips.length % 3]; S.chips.push([p[0], p[2]]); } else if (n === "send") send(); else if (n === "fbai") { S.chips.unshift(["text", "选中的一句 · 起草发布说明"]); S.pick = false; swap = true; } else if (n === "fbtodo") { $("#stage [data-act=fbtodo]").click(); } else if (n === "ans") answer(deckList()[0].id, Number(v || 0), false); else if (n === "flip") S.flip += 1; else if (GO[n]) GO[n]();
    render();
  });
})();
