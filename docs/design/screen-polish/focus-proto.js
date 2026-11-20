/* 「输入框是切换专注的把手」的可点原型。只为看动线和细则；数据是假的，不是产品代码。 */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const I = (n, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const G = (g) => (g === "done" ? I("check", "xs dg done") : `<i class="dg ${g}"></i>`);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const PROJECT = "目录交互验证";
  const KIND = { doc: ["file", "文稿"], code: ["code", "Coding 会话"], task: ["sparkles", "助理在办"], cal: ["calendar", "日程"], todo: ["list", "待办"] };
  const mk = () => ({
    a: { nm: "发布 v2.3", ev: [
      { id: "y1", nm: "定稿公告", g: "you", kind: "doc", w: "等你定", ask: { q: "标题用「更快的发布」还是「v2.3 来了」？", acts: ["用第一个", "用第二个"] } },
      { id: "y2", nm: "核对定价页截图", g: "you", kind: "doc", w: "等你看", ask: { q: "新截图里的价格还是旧的，要我重截吗？", acts: ["重截", "不用，就这样"] } },
      { id: "r1", nm: "生成更新日志", g: "run", kind: "task", w: "第 2 步" },
      { id: "r2", nm: "修登录回归", g: "run", kind: "code", w: "在跑" },
      { id: "n1", nm: "发布评审", g: "next", kind: "cal", w: "15:00" },
      { id: "n2", nm: "推送公告", g: "next", kind: "todo", w: "评审后" },
      { id: "d1", nm: "起草发布说明", g: "done", kind: "doc", w: "11:20" },
      { id: "d2", nm: "跑回归测试", g: "done", kind: "code", w: "13:05" },
      { id: "d3", nm: "冻结代码", g: "done", kind: "todo", w: "昨天" },
      { id: "d4", nm: "通知销售", g: "done", kind: "todo", w: "昨天" },
    ] },
    b: { nm: "定价页改版", ev: [
      { id: "y3", nm: "确认三档价格", g: "you", kind: "doc", w: "等你定", ask: { q: "中间一档定 ¥199 还是 ¥229？", acts: ["¥199", "¥229"] } },
      { id: "r3", nm: "改写定价页文案", g: "run", kind: "task", w: "第 1 步" },
      { id: "d5", nm: "收集竞品价格", g: "done", kind: "doc", w: "周一" },
    ] },
    c: { nm: "用户访谈整理", ev: [
      { id: "n3", nm: "整理访谈纪要", g: "next", kind: "doc", w: "停在第 3 段" },
      { id: "d6", nm: "约访 6 位用户", g: "done", kind: "todo", w: "上周" },
    ] },
  });
  let T, S, tick = 0, sendSeq = 0, swap = true;
  const fresh = () => { T = mk(); S = { topic: "a", ev: null, prev: null, recent: [], sw: false, q: "", idx: 0, hold: "", drafts: {}, last: {}, logs: {}, note: null, dlg: false, chips: [], pm: false, way: "作为补充", scene: 0, side: S ? S.side : "none", pulse: false }; };
  const RANK = { you: 0, run: 1, next: 2, done: 3 };
  const list = (k) => T[k].ev.slice().sort((x, y) => RANK[x.g] - RANK[y.g]);
  const find = (id) => { for (const k of Object.keys(T)) { const e = T[k].ev.find((x) => x.id === id); if (e) return { k, e }; } return null; };
  const cur = () => (S.ev ? find(S.ev).e : null);
  const fkey = () => S.ev || S.topic || "project";
  const waitIn = (k) => T[k].ev.filter((e) => e.g === "you");
  const log = (key) => (S.logs[key] ||= [{ t: key.length > 1 && find(key) ? `这是「${find(key).e.nm}」的对话。` : "有什么要办的，直接说。" }]);
  const SCENE = () => (cur() && cur().kind === "code" ? ["执行", "只讨论", "先出计划"] : ["助理", "只讨论", "交给 Coding"]);

  /* —— 窗口骨架：顶部借用静态样稿；输入框只建一次 —— */
  const win = $("#win");
  win.innerHTML = `${window.spParts.top}<div class="sp-stage" id="stage"></div>
    <div class="pb" id="pb">
      <div class="pb-w l" id="wl"></div>
      <div class="pb-mid"><div class="pu" id="unit">
        <div class="fs" id="sw" hidden></div>
        <div class="pd" id="dlg" hidden></div>
        <div class="fu-top" id="strip"></div>
        <div class="dc" id="card"><div id="rowa"></div>
          <div class="pc">
            <span class="dc-k" data-act="plus" role="button" title="带上东西" id="plus">${I("plus", "s")}</span>
            <textarea id="in" rows="1" autocomplete="off" aria-label="输入"></textarea>
            <span class="pc-chips only-open" id="chips"></span><span class="grow only-open"></span>
            <span class="dc-who way only-open" data-act="way" role="button" id="way" hidden></span>
            <span class="dc-who only-open" data-act="scene" role="button" id="scene"></span>
            <span class="fk" id="keys" hidden>↑↓ 选　↵ 切换　Esc 回到输入</span>
            <span class="dc-k" data-act="mic" role="button" title="语音" id="mic">${I("mic", "s")}</span>
            <span class="dc-k send dim" data-act="send" role="button" id="send" aria-label="发送">${I("send", "s")}</span>
          </div>
          <div class="pm" id="pm" hidden></div>
        </div>
      </div></div>
      <div class="pb-w r"><span class="grow"></span><span class="dt"><span class="dt-k" title="后台任务" id="tasks"></span><span class="dt-k" data-act="dlg" role="button" title="展开对话" id="exp">${I("chevron-up", "s")}</span></span></div>
    </div>`;
  const inp = $("#in");
  const say = (a, b) => { $("#step").textContent = a; $("#say").textContent = b; };

  /* —— 主区：跟着焦点换 —— */
  const P = (h1, sub, body) => `<div class="sp-sheet"><div class="sp-main"><div class="sp-mainhd"><h1>${h1}</h1><span class="sub">${sub}</span></div><div class="pp">${body}</div></div></div>`;
  const sk = (ws) => ws.map((w) => `<i class="sk" style="width:${w}%"></i>`).join("");
  const prow = (k, e) => `<div class="pp-r" data-act="go" data-id="${e.id}" role="button">${G(e.g)}<span class="nm">${e.nm}</span><small>${KIND[e.kind][1]}</small><span class="grow"></span><small class="${e.g}">${e.w}</small></div>`;
  const page = () => {
    const e = cur();
    if (!S.topic) return P(PROJECT, "项目的第一页", `<h3>手头的事项</h3>${Object.keys(T).map((k) => `<div class="pp-r" data-act="topic" data-k="${k}" role="button">${I("folder", "s")}<span class="nm">${T[k].nm}</span><span class="grow"></span><small class="${waitIn(k).length ? "you" : ""}">${waitIn(k).length ? `${waitIn(k).length} 件等你` : `${T[k].ev.length} 件东西`}</small></div>`).join("")}`);
    if (!e) {
      const grp = (g, t) => { const xs = T[S.topic].ev.filter((x) => x.g === g); return xs.length ? `<h3>${t}<em>${xs.length}</em></h3>${xs.map((x) => prow(S.topic, x)).join("")}` : ""; };
      return P(T[S.topic].nm, `事项 · ${T[S.topic].ev.length} 件东西`, `${grp("you", "等你")}${grp("run", "在办")}${grp("next", "接下来")}${grp("done", "办完")}`);
    }
    const sub = `${KIND[e.kind][1]} · ${T[S.topic].nm}`;
    if (e.kind === "code") return P(e.nm, sub, `<div class="pp-me">登录页在 Safari 里点「记住我」会掉登录，先定位再修。</div><p>定位到了：刷新令牌写回时用了旧的过期时间。现在在跑受影响的 12 条用例。</p><pre>pnpm test auth/refresh.test.ts\n  ✓ 9 通过　· 3 还在跑</pre>${sk([62, 48])}`);
    if (e.kind === "task") return P(e.nm, sub, `<div class="pp-steps"><span>${G("done")}读提交记录（46 条）</span><span>${G(e.g === "done" ? "done" : "run")}归类成新功能、改进、修复</span><span>${G(e.g === "done" ? "done" : "next")}写成对用户说的话</span><span>${G(e.g === "done" ? "done" : "next")}和发布说明对一遍</span></div>${sk([70, 54, 61])}`);
    if (e.kind === "cal") return P(e.nm, sub, `<div class="pp-card"><b>今天 ${e.w}–15:30</b><span>4 人 · 线上会议室</span></div><p>议程：回归结果、已知问题、是否按时发布。</p>${sk([52, 40])}`);
    if (e.kind === "todo") return P(e.nm, sub, `<div class="pp-card"><b>${e.g === "done" ? "已勾掉" : "还没做"}</b><span>${e.w}</span></div>${sk([58, 44])}`);
    return P(e.nm, sub, `<h2>${e.nm}</h2><p>${e.id === "y1" ? "v2.3 把发布说明的生成从十几分钟缩到两分钟以内，目录和版本号不用再手工对。" : "这一页是这件事的文稿，助理和你都在这里改。"}</p>${sk([92, 86, 64, 0, 88, 73])}`);
  };

  /* —— 焦点签、等你 N、两边 —— */
  const strip = () => {
    const e = cur(), k = S.topic;
    const tp = k ? `<span class="seg" data-act="${e ? "up" : "sw"}" role="button" title="${e ? "回到这件事项" : "切换"}"><b class="cut">${T[k].nm}</b></span>` : `<span class="seg" data-act="sw" role="button">${I("folder", "xs")}<b class="cut">${PROJECT}</b></span>`;
    const here = k ? waitIn(k).filter((x) => x.id !== S.ev).length : 0;
    const else_ = Object.keys(T).filter((x) => x !== k).reduce((n, x) => n + waitIn(x).length, 0);
    const chip = here ? `<span class="fn${S.pulse ? " pulse" : ""}" data-act="nextwait" role="button" title="到下一件等你的">${G("you")}${e && e.g === "you" ? "还有" : "等你"} ${here}${I("chevron-right", "xs")}</span>` : else_ ? `<span class="fn soft" data-act="sw" role="button" title="别的事项里等你的">${G("you")}别处等你 ${else_}${I("chevron-right", "xs")}</span>` : "";
    $("#strip").innerHTML = `<span class="fl${S.sw ? " open" : ""}">${tp}${e ? `${I("chevron-right", "xs sep")}<span class="seg" data-act="sw" role="button">${G(e.g)}<span class="nm cut">${e.nm}</span></span>` : ""}<span class="seg chev" data-act="sw" role="button" title="切换（⌘J）">${I("chevron-down", "xs")}</span></span><span class="grow"></span>${chip}`;
    S.pulse = false;
    $("#wl").innerHTML = S.side === "recent" ? S.recent.map((r) => { if (r.id) { const f = find(r.id); return `<span class="dv ${f.e.g}" data-act="go" data-id="${r.id}" role="button">${G(f.e.g)}<span class="nm cut">${f.e.nm}</span></span>`; } return `<span class="dv" data-act="topic" data-k="${r.k || ""}" role="button">${I("folder", "xs")}<span class="nm cut">${r.k ? T[r.k].nm : PROJECT}</span></span>`; }).join("") : "";
    const run = Object.keys(T).reduce((n, x) => n + T[x].ev.filter((v) => v.g === "run").length, 0);
    $("#tasks").innerHTML = `${I("activity", "s")}<em>${run}</em>`;
  };

  /* —— 接续行：一次一件 —— */
  const btn = (t, a, pri, extra = "") => `<span class="dc-act${pri ? " pri" : ""}" data-act="${a}" ${extra} role="button">${esc(t)}</span>`;
  const K = (n, a, t) => `<span class="dc-k sm" data-act="${a}" role="button" title="${t}">${I(n, "s")}</span>`;
  const rowa = () => {
    const e = cur(), n = S.note, last = S.last[fkey()];
    let h = "";
    if (n && n.kind === "sending") h = `${G("run")}<span class="say cut">发送中…</span>`;
    else if (n && n.kind === "fail") h = `${I("circle-alert", "s t-r")}<span class="say ink cut">没发出去，网络断了。你的字还在。</span>${btn("再试一次", "retry", 1)}`;
    else if (n && n.kind === "back") h = `${I("check", "s t-g")}<span class="say ink cut">模型已连接。</span>${btn("回到「修登录回归」接着做", "go", 1, `data-id="r2"`)}${K("x", "dismiss", "不用了")}`;
    else if (n && n.kind === "done") h = `${G("done")}<span class="say cut">${n.text}</span>${n.next ? btn(`下一件等你的：${n.next.nm}`, "go", 1, `data-id="${n.next.id}"`) : ""}${btn(`回到「${T[S.topic].nm}」`, "up", !n.next)}`;
    else if (e && e.ask) h = `${G(e.g)}<span class="say ink cut">${e.ask.q}</span>${e.ask.acts.map((a, i) => btn(a, "act", i === 0, `data-i="${i}"`)).join("")}${K("chevron-up", "dlg", "展开对话")}`;
    else if (last) h = `${I("sparkles", "s t-b")}<span class="say ink cut">${esc(last)}</span>${K("chevron-up", "dlg", "展开对话")}${K("x", "dismiss", "收起这一行")}`;
    $("#rowa").innerHTML = h && !S.dlg ? `<div class="dc-a">${h}</div>` : "";
  };

  /* —— 切换器：清单从输入框向上长；输入框这时是筛选框 —— */
  let items = [];
  const swList = () => {
    const q = S.q.trim(); items = []; let h = "";
    const evRow = (k, e, pre) => { const i = items.push({ k, id: e.id }) - 1; return `<div class="dl-r${i === S.idx ? " on" : ""}" data-act="pick" data-i="${i}" role="button">${G(e.g)}<span class="nm cut">${pre ? `<small class="pre">${T[k].nm} ›</small> ` : ""}${e.nm}</span>${S.drafts[e.id] ? `<small class="dr">有草稿</small>` : ""}<small class="${e.g}">${e.w}</small></div>`; };
    const tpRow = (k) => { const i = items.push({ k, id: null }) - 1; const w = waitIn(k).length; return `<div class="dl-r${i === S.idx ? " on" : ""}" data-act="pick" data-i="${i}" role="button">${I("folder", "xs")}<span class="nm cut">${T[k].nm}</span>${S.drafts[k] ? `<small class="dr">有草稿</small>` : ""}<small class="${w ? "you" : ""}">${w ? `${w} 件等你` : `${T[k].ev.filter((x) => x.g !== "done").length} 件在手上`}</small></div>`; };
    if (q) {
      const hit = (s) => s.toLowerCase().includes(q.toLowerCase());
      const rows = []; Object.keys(T).forEach((k) => { if (hit(T[k].nm)) rows.push(tpRow(k)); list(k).forEach((e) => { if (hit(e.nm) && e.id !== S.ev) rows.push(evRow(k, e, k !== S.topic)); }); });
      h = rows.length ? `<div class="dl-g">找到 ${rows.length} 件</div>${rows.join("")}` : `<div class="dl-g">没有叫这个名字的。回车会把它建成一件新事项。</div>`;
    } else {
      const p = S.prev;
      if (p && (p.k !== S.topic || p.id !== S.ev)) h += `<div class="dl-g">刚才</div>${p.id ? evRow(p.k, find(p.id).e, p.k !== S.topic) : p.k ? tpRow(p.k) : ""}`;
      if (S.topic) {
        const live = list(S.topic).filter((e) => e.g !== "done" && e.id !== S.ev && !(p && p.id === e.id));
        const done = T[S.topic].ev.filter((e) => e.g === "done").length;
        h += `<div class="dl-g">「${T[S.topic].nm}」里</div>${live.map((e) => evRow(S.topic, e)).join("")}${done ? `<div class="dl-g fold">${I("chevron-right", "xs")}办完 <em>${done}</em></div>` : ""}<div class="dl-sep"></div>`;
      }
      const others = Object.keys(T).filter((k) => k !== S.topic && !(p && !p.id && p.k === k));
      h += `<div class="dl-g">${S.topic ? "别的事项" : "事项"}</div>${others.map(tpRow).join("")}`;
    }
    if (S.idx >= items.length) S.idx = Math.max(0, items.length - 1);
    $("#sw").innerHTML = `${h}<div class="dl-sep"></div><div class="fs-foot"><span data-act="new" role="button">${I("plus", "xs")}新建事项</span>${S.topic ? `<span data-act="none" role="button">不选事项</span>` : ""}<span data-act="tidy" role="button">整理主线</span><span class="grow"></span><span class="fk">⌘J 切换　⌘] 下一件等你的</span></div>`;
  };

  /* —— 展开成对话框：还是这一组，向上长 —— */
  const dlg = () => {
    const e = cur();
    const title = e ? `${G(e.g)}<b>${e.nm}</b><span class="say">${e.w}</span>` : `<b>${S.topic ? T[S.topic].nm : PROJECT}</b><span class="say">和助理的对话</span>`;
    const quick = e && e.ask ? `<div class="dd-q">${e.ask.acts.map((a, i) => btn(a, "act", i === 0, `data-i="${i}"`)).join("")}</div>` : "";
    $("#dlg").innerHTML = `<div class="dc-a big">${title}<span class="grow"></span>${K("more", "more", "详情、停下、放到别的事项")}${K("chevron-down", "dlg", "收起")}</div><div class="dd">${log(fkey()).map((m) => `<div class="${m.me ? "dd-me" : "dd-it"}">${esc(m.t)}</div>`).join("")}${e && e.ask ? `<div class="dd-it">${e.ask.q}</div>` : ""}${quick}</div>`;
  };

  const PLUS = [["paperclip", "文件或图片…", "定价页-新版.png"], ["eye", "正在看的这一页", null], ["bookmark", "Shelf 里的", "发布清单"], ["folder", "项目资料", "品牌用语"]];
  const card = () => {
    const e = cur(), has = inp.value.trim().length > 0, open = !S.sw && (has || S.chips.length > 0);
    $("#card").classList.toggle("open", open); $("#card").classList.toggle("find", S.sw);
    inp.placeholder = S.sw ? "切到哪件事？输入名字筛选" : e && e.ask ? "回它一句" : e && e.g === "run" ? "补充一句，它会在这一步之后读到" : S.last[fkey()] ? "接着说" : "说一句，或输入 / 开始一件事";
    inp.style.height = "auto"; inp.style.height = `${open ? Math.min(132, Math.max(52, inp.scrollHeight)) : 32}px`;
    $("#plus").innerHTML = I(S.sw ? "search" : "plus", "s"); $("#keys").hidden = !S.sw; $("#mic").hidden = S.sw;
    const stop = !S.sw && !has && e && e.g === "run";
    const s = $("#send"); s.hidden = S.sw; s.className = `dc-k send${stop ? " stop" : has ? "" : " dim"}`; s.innerHTML = stop ? `<i class="sq"></i>` : I("send", "s"); s.title = stop ? "停下" : "发送（回车）";
    $("#chips").innerHTML = S.chips.map((c, i) => `<span class="dc-chip">${I(c[0], "xs")}<span class="cut">${c[1]}</span><span data-act="unchip" data-i="${i}" role="button">${I("x", "xs x")}</span></span>`).join("");
    const w = $("#way"); w.hidden = !(e && e.g === "run" && has); w.innerHTML = `${S.way}${I("chevron-down", "xs")}`;
    $("#scene").innerHTML = `${SCENE()[S.scene % 3]}${I("chevron-down", "xs")}`;
    const pm = $("#pm"); pm.hidden = !S.pm;
    if (S.pm) pm.innerHTML = `<div class="dl-g">带上</div>${PLUS.map((p, i) => `<div class="dl-r" data-act="chip" data-i="${i}" role="button">${I(p[0], "xs")}<span class="nm">${p[1]}</span></div>`).join("")}`;
  };

  const render = () => {
    if (swap) { const st = $("#stage"); st.innerHTML = page(); st.classList.remove("swap"); void st.offsetWidth; st.classList.add("swap"); swap = false; }
    strip(); rowa();
    $("#sw").hidden = !S.sw; if (S.sw) swList();
    $("#dlg").hidden = !S.dlg || S.sw; if (S.dlg) dlg();
    $("#unit").classList.toggle("dlg", S.dlg && !S.sw);
    $("#exp").innerHTML = I(S.dlg ? "chevron-down" : "chevron-up", "s");
    card();
  };

  /* —— 动作 —— */
  const setFocus = (k, id) => {
    if (k === S.topic && id === S.ev) { closeSw(); return; }
    const from = { k: S.topic, id: S.ev };
    S.drafts[fkey()] = S.sw ? S.hold : inp.value;
    S.prev = from;
    S.recent = [from, ...S.recent].filter((r, i, a) => !(r.k === k && r.id === id) && a.findIndex((x) => x.k === r.k && x.id === r.id) === i).slice(0, 2);
    S.topic = k; S.ev = id; S.sw = false; S.note = null; S.chips = []; S.pm = false; S.scene = 0;
    inp.value = S.drafts[fkey()] || ""; swap = true; render(); inp.focus();
  };
  const openSw = () => { if (S.sw) return; S.hold = inp.value; inp.value = ""; S.sw = true; S.q = ""; S.idx = 0; S.pm = false; render(); inp.focus(); };
  function closeSw() { if (!S.sw) return; S.sw = false; inp.value = S.hold || ""; render(); inp.focus(); }
  const pick = (i) => { const it = items[i]; if (it) { setFocus(it.k, it.id); say("切过去了", `主区换成了「${it.id ? find(it.id).e.nm : T[it.k].nm}」，焦点签跟着换。刚才那一处的草稿留在那一处。`); } };
  const nextWait = () => {
    if (!S.topic) return openSw();
    const ws = waitIn(S.topic); if (!ws.length) return openSw();
    const i = ws.findIndex((e) => e.id === S.ev); const e = ws[(i + 1) % ws.length];
    setFocus(S.topic, e.id); say("下一件等你的", `到了「${e.nm}」。它问的话在输入框第一行。`);
  };
  const doAct = (i) => {
    const e = cur(); if (!e || !e.ask) return; const a = e.ask.acts[i];
    log(e.id).push({ t: e.ask.q }, { me: 1, t: a });
    if (e.ask.step) { e.ask = null; if (i === 0) { e.g = "run"; e.w = "第 3 步"; S.last[e.id] = "好，接着做第 3 步。"; } else { e.g = "next"; e.w = "停着"; S.last[e.id] = "停在第 2 步，等你说了再接着做。"; } S.note = null; swap = true; render(); say("接续", "它照你点的往下走。"); return; }
    e.ask = null; e.g = "done"; e.w = "刚刚";
    const nx = waitIn(S.topic)[0] || null;
    S.note = { kind: "done", text: `${e.nm}办好了。`, next: nx }; swap = true; render();
    say("办完一件", nx ? `接续行给出下一件等你的「${nx.nm}」，点一下就过去。` : "这件事项里没有等你的了，可以回到事项。");
  };
  const send = () => {
    const t = inp.value.trim(); if (!t || S.sw) return;
    const key = fkey(), e = cur(), way = S.way;
    log(key).push({ me: 1, t }); inp.value = ""; S.drafts[key] = ""; S.chips = []; S.pm = false;
    const wasAsk = e && e.ask; if (wasAsk) { e.ask = null; e.g = "run"; e.w = "在办"; swap = true; }
    S.note = { kind: "sending" }; render(); const sq = ++sendSeq;
    setTimeout(() => {
      const r = wasAsk ? "好，按你说的改。" : e && e.g === "run" ? `收到，${way === "打断并改向" ? "现在就改方向" : way === "下一轮再做" ? "排到下一轮" : "这一步之后读到"}。` : "已开始：先看一遍现有内容，再给你一版。";
      log(key).push({ t: r }); S.last[key] = r;
      if (sq === sendSeq && fkey() === key) { S.note = null; render(); }
    }, 700);
    say("发出去了", "接续行先是「发送中」，然后是它回的第一句。要细看点右边的展开。");
  };
  const stopRun = () => { const e = cur(); if (!e || e.g !== "run") return; e.g = "next"; e.w = "停下了"; S.last[e.id] = "停下了。说一句就接着做。"; swap = true; render(); say("停下", "没打字时发送键就是停下。"); };

  const GO = {
    reset: () => { tick++; fresh(); inp.value = ""; swap = true; render(); say("平常", "专注在事项「发布 v2.3」上。输入框里只有 ＋、字、语音、发送。"); },
    ask: () => { const e = find("r1").e; if (e.g !== "run") return GO.reset(); e.g = "you"; e.w = "等你定"; e.ask = { q: "内部重构的 9 条要不要写进日志？", acts: ["不写", "写成附录"] }; S.pulse = true; swap = true; render(); say("助理问你", S.ev === "r1" ? "你正专注在它上面，问的话直接出现在第一行。" : "你不在它上面：只有「等你」的数字加一，闪一下，不打断你正在做的。"); },
    step: () => { const e = find("r1").e; e.g = "you"; e.w = "等你定"; e.ask = { q: "第 2 步做完了。接着做下一步？", acts: ["接着做", "先停"], step: 1 }; S.pulse = true; swap = true; render(); say("做完一步", "交办时开了「每步先问我」：它停下来问你，算一件等你的。"); },
    back: () => { S.note = { kind: "back" }; render(); say("从设置回来", "连好模型回到工作台，接续行问要不要回到原来那一步。"); },
    fail: () => { S.note = { kind: "fail" }; render(); say("没发出去", "失败也在这一行。字留在框里，不清空。"); },
  };
  const story = () => {
    const tk = ++tick; let at = 0;
    const st = (ms, fn) => { at += ms; setTimeout(() => { if (tk === tick) fn(); }, at); };
    fresh(); inp.value = ""; swap = true; render(); say("1 · 平常", "专注在事项「发布 v2.3」上。");
    st(1500, () => { openSw(); say("2 · 切换", "点焦点签或按 ⌘J：清单从输入框向上长，输入框变成筛选框。"); });
    st(1700, () => { inp.value = "定稿"; S.q = "定稿"; render(); say("3 · 打两个字", "清单只剩对得上的。"); });
    st(1500, () => { pick(0); say("4 · 回车", "焦点到了「定稿公告」：主区换成它的文稿，它问的话在第一行。"); });
    st(2000, () => { doAct(0); });
    st(2000, () => { const n = S.note && S.note.next; if (n) { setFocus(S.topic, n.id); say("6 · 接着下一件", `点了接续行里的「${n.nm}」，焦点直接过去。`); } });
    st(2000, () => { setFocus(S.topic, null); say("7 · 回到事项", "点焦点签左边的事项名，回到这件事项。"); });
    st(1600, () => { inp.value = "把发布说明里「已知问题」那一段改短一点，语气别太硬"; S.chips = [["paperclip", "定价页-新版.png"]]; render(); say("8 · 打字", "卡向上长，字占满一行；带上的东西和选项在最后一行。"); });
    st(2200, () => { send(); say("9 · 回车发送", "接续行先是「发送中」，然后是它回的第一句。"); });
    st(1900, () => { S.dlg = true; render(); say("10 · 展开", "还是这一组向上长成对话框。换一件事仍然用焦点签。"); });
    st(2400, () => { S.dlg = false; render(); say("演示完了", "可以自己点：焦点签、等你、主区里的行、＋，或者按 ⌘J、⌘]。"); });
  };

  /* —— 事件 —— */
  win.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]"); if (!el) { if (S.pm && !ev.target.closest("#pm")) { S.pm = false; render(); } return; }
    const a = el.dataset.act, d = el.dataset;
    if (a === "sw") (S.sw ? closeSw() : (openSw(), say("切换器", "先是刚才那一件，再是这件事项里的（等你的在前），再是别的事项。打字筛选，上下选，回车切换，Esc 回去。")));
    else if (a === "up") { setFocus(S.topic, null); say("回到事项", "焦点回到这件事项，主区是它的第一页。"); }
    else if (a === "pick") pick(Number(d.i));
    else if (a === "go") { const f = find(d.id); setFocus(f.k, f.e.id); say("切过去了", `焦点到了「${f.e.nm}」。`); }
    else if (a === "topic") { setFocus(d.k || null, null); say("换事项", "主区、焦点签一起换；真产品里标签、右侧和助理的范围也跟着换。"); }
    else if (a === "none") { setFocus(null, null); say("不选事项", "回到整个项目，和今天一样。"); }
    else if (a === "nextwait") nextWait();
    else if (a === "act") doAct(Number(d.i));
    else if (a === "dlg") { S.dlg = !S.dlg; render(); say(S.dlg ? "展开对话" : "收起", S.dlg ? "对话框是这一组向上长出来的；头部只有名字、「⋯」、收起。" : "收回到一行。"); }
    else if (a === "dismiss") { S.note = null; delete S.last[fkey()]; render(); }
    else if (a === "retry") { S.note = null; S.last[fkey()] = "发出去了。"; render(); }
    else if (a === "send") ($("#send").classList.contains("stop") ? stopRun() : send());
    else if (a === "plus") { if (S.sw) return; S.pm = !S.pm; render(); say("＋", "带上东西只有这一扇门；选了以后是最后一行的一枚片。"); }
    else if (a === "chip") { const p = PLUS[Number(d.i)]; S.chips.push([p[0], p[2] || `正在看：${cur() ? cur().nm : S.topic ? T[S.topic].nm : PROJECT}`]); S.pm = false; render(); inp.focus(); }
    else if (a === "unchip") { S.chips.splice(Number(d.i), 1); render(); }
    else if (a === "scene") { S.scene++; render(); say("场景选项", "这个对象自己的选项收成一个词；原型里点一下换下一个，真产品是一个小菜单。"); }
    else if (a === "way") { const ws = ["作为补充", "打断并改向", "下一轮再做"]; S.way = ws[(ws.indexOf(S.way) + 1) % 3]; render(); }
    else if (a === "mic") say("语音", "位置在发送键左边，一直在。原型里没接。");
    else if (a === "new" || a === "tidy" || a === "more") say(el.textContent.trim() || "⋯", "原型里没做这一页。");
  });
  inp.addEventListener("input", () => { if (S.sw) { S.q = inp.value; S.idx = 0; swList(); } else card(); });
  inp.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (S.sw) {
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); S.idx = (S.idx + (ev.key === "ArrowDown" ? 1 : items.length - 1)) % Math.max(1, items.length); swList(); }
      else if (ev.key === "Enter") { ev.preventDefault(); pick(S.idx); }
      else if (ev.key === "Escape") { ev.preventDefault(); closeSw(); }
    } else if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); send(); }
    else if (ev.key === "Escape") { if (S.pm) S.pm = false; else if (S.dlg) S.dlg = false; else return; render(); }
  });
  document.addEventListener("keydown", (ev) => {
    if (!(ev.metaKey || ev.ctrlKey)) return;
    if (ev.key.toLowerCase() === "j") { ev.preventDefault(); S.sw ? closeSw() : openSw(); }
    else if (ev.key === "]") { ev.preventDefault(); nextWait(); }
  });
  $("#ctrls").addEventListener("click", (ev) => { const b = ev.target.closest("[data-go]"); if (!b) return; b.dataset.go === "story" ? story() : (tick++, GO[b.dataset.go]()); });
  const group = (sel, fn) => $(sel).addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (!b) return; $(sel).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); fn(b.value); });
  const fit = () => document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / 1440)));
  const setW = (v) => { win.style.width = `${v}px`; $("#pb").style.setProperty("--mid", `${Number(v) >= 1180 ? 640 : 560}px`); };
  group("#width", (v) => { setW(v); render(); });
  group("#side", (v) => { S.side = v; render(); say("两边", v === "recent" ? "输入框左边放最近切过的两件，一点切回。先切两次才会有东西。" : "两边是空的。"); });
  fresh(); render(); fit(); window.addEventListener("resize", fit);

  // ?do=sw,type:定稿,pick:0,act:0,dlg,ask… 供截图用
  const q = new URLSearchParams(location.search);
  if (q.get("width")) { setW(q.get("width")); $("#width").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.value === q.get("width")))); }
  if (q.get("side")) S.side = q.get("side");
  (q.get("do") || "").split(",").filter(Boolean).forEach((c) => {
    const [n, v] = c.split(":");
    if (n === "sw") openSw(); else if (n === "type") { inp.value = v; if (S.sw) S.q = v; } else if (n === "pick") pick(Number(v)); else if (n === "go") { const f = find(v); setFocus(f.k, f.e.id); }
    else if (n === "topic") setFocus(v === "none" ? null : v, null); else if (n === "act") doAct(Number(v)); else if (n === "dlg") S.dlg = true; else if (n === "plus") S.pm = true; else if (n === "chip") S.chips.push(["paperclip", "定价页-新版.png"]); else if (GO[n]) GO[n]();
    render();
  });
})();
