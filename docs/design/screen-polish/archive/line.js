// 底栏第五版的可点原型。只演示编排和动效，数据是写死的，不是产品代码。
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const ic = (n, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const btn = (id, label, v = "secondary") => `<span class="mw-btn mw-btn--${v} mw-btn--sm" data-slot="button" role="button" data-do="${id}"><span data-slot="button-label">${label}</span></span>`;
  const QUINT = "cubic-bezier(.22,1,.36,1)";
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PROJECT = "目录交互验证";

  // 数据：三件事项，各有自己的事件。stage：past 办完 · run 在办 · you 该你了 · next 接下来
  let clock = 0, T, S, gen = 0;
  const ev = (id, name, icon, owner, stage, o = {}) => ({ id, name, icon, owner, stage, at: ++clock, ...o });
  const OPEN = [["open", "打开"]];
  const seed = () => {
    clock = 0;
    T = {
      a: { name: "发布 v2.3", events: [
        ev("a-p1", "发布检查表", "list", "待办", "past", { line: "周一 · 12 项都过了", acts: OPEN }),
        ev("a-p2", "版本号确认", "check", "待办", "past", { line: "周一 · 定为 2.3.0", acts: OPEN }),
        ev("a-p3", "更新日志草稿", "file", "Pages", "past", { line: "周二 · 第一稿，420 字", acts: OPEN }),
        ev("a-p4", "评审反馈", "inbox", "Inbox", "past", { line: "昨天 · 王总回了三条意见", acts: OPEN }),
        ev("a-p5", "v2.3 发布说明", "file", "Pages", "past", { line: "昨天 · 改了 3 处", acts: OPEN }),
        ev("a-r1", "补边界测试", "code", "Coding", "run", { word: "第 2 步", p: 45, line: "第 2 步：给 release.test.ts 补空列表和单条两条用例。", acts: [["open", "看过程"]], result: "办完了：补了 2 条用例，都通过。" }),
        ev("a-y1", "发布说明按版本分节", "code", "Coding", "you", { tone: "amber", word: "等你定", line: "两个改法：按版本分节，或按类型分节。选一个。", acts: [["agree", "用方案一", "primary"], ["open", "看方案"]], result: "办完了：发布说明已按版本分节，改了 1 个文件。" }),
        ev("a-n1", "给王总回电话", "circle", "待办", "next", { time: "15:00", line: "今天 15:00 · 问预算", acts: [["tick", "勾掉", "primary"], ["tomorrow", "改到明天"]] }),
        ev("a-n2", "发布评审会", "calendar", "日程", "next", { time: "16:30", line: "今天 16:30，45 分钟 · 过一遍发布说明和检查表", acts: [["prep", "让助理备材料", "primary"], ["open", "看议程"]] }),
        ev("a-n3", "发布前检查链接", "circle", "待办", "next", { time: "明天", line: "明天 · 发布页和文档里的链接", acts: [["tick", "勾掉", "primary"], ["open", "打开"]] }),
        ev("a-n4", "更新官网版本号", "circle", "待办", "next", { time: "明天", line: "明天 · 首页和下载页", acts: [["tick", "勾掉", "primary"], ["open", "打开"]] }),
        ev("a-n5", "回顾会", "calendar", "日程", "next", { time: "周五", line: "周五 14:00，30 分钟", acts: [["open", "看议程"]] }),
        ev("a-s1", "把评审结论发到群里", "sparkles", "助理", "next", { sug: true, time: "建议", line: "来自评审反馈：三条意见都处理完了，可以同步给大家。", acts: [["start", "开始办", "primary"], ["later", "以后再说"]] }),
      ] },
      b: { name: "定价页改版", events: [
        ev("b-p1", "定价页文案", "file", "Pages", "past", { line: "上周 · 第二稿", acts: OPEN }),
        ev("b-y1", "竞品定价对比", "sparkles", "助理", "you", { tone: "green", word: "交回了", line: "办完了：三家竞品的定价表，差异标出来了。", acts: [["accept", "收下", "primary"], ["open", "看对比表"]] }),
        ev("b-n1", "定价评审", "calendar", "日程", "next", { time: "明天 10:00", line: "明天 10:00，1 小时", acts: [["prep", "让助理备材料", "primary"], ["open", "看议程"]] }),
      ] },
      c: { name: "用户访谈整理", events: [
        ev("c-p1", "访谈提纲", "file", "Pages", "past", { line: "上周 · 8 个问题", acts: OPEN }),
        ev("c-p2", "录音转写", "file", "Pages", "past", { line: "周一 · 6 段录音", acts: OPEN }),
        ev("c-r1", "归类访谈记录", "sparkles", "助理", "run", { word: "第 3 步", p: 70, line: "第 3 步：把 42 条摘录归到 5 个主题下。", acts: [["open", "看过程"]], result: "办完了：42 条摘录归成 5 个主题。" }),
        ev("c-s1", "写访谈小结", "sparkles", "助理", "next", { sug: true, time: "建议", line: "归类快好了，可以先起一个小结的提纲。", acts: [["start", "开始办", "primary"], ["later", "以后再说"]] }),
      ] },
    };
    S = { topic: "a", focus: null, body: "none", reply: null, ph: null, menu: false, head: S ? S.head : "mid", pulse: null,
      chips: [], to: "助理", way: 0, pmenu: null, more: false, quick: ["直接改，并补上测试", "只改，不补测试"],
      log: [["me", "看一下发布说明现在是怎么写的，有什么问题"], ["it", `<h4>现状</h4><ul><li>发布说明写进 <code>CHANGELOG.md</code>，没有按版本分节。</li><li><code>formatNotes()</code> 遇到空列表会输出只有标题的段落。</li></ul><h4>建议的改法</h4><ul><li>空列表直接返回空字符串。</li><li>按版本分节写入，旧内容留在下面。</li></ul>要我直接改并补上测试吗？<span class="placed">读了 2 个文件 · 用了技能「读代码」</span>`]] };
  };

  const topics = () => Object.keys(T);
  const all = () => topics().flatMap((k) => T[k].events.map((e) => (e.topic = k, e)));
  const list = () => (S.topic ? T[S.topic].events.map((e) => (e.topic = S.topic, e)) : all()).filter((e) => !e.gone);
  const find = (id) => all().find((e) => e.id === id);
  const cur = () => (S.focus ? find(S.focus) : null);
  const live = (e) => e.stage === "run" || e.stage === "you";
  const rank = (e) => (e.stage === "you" ? (e.tone === "green" ? 1 : 0) : 2);
  const elsewhere = () => topics().filter((k) => k !== S.topic && T[k].events.some((e) => e.stage === "you" && !e.gone)).length;

  // 窗口骨架：顶部和首页借用静态样稿的部件；输入框只建一次，不随状态重画
  const win = $("#win");
  win.innerHTML = `${window.spParts.top}<div class="sp-stage" id="stage">${window.spParts.home}</div>
    <div class="ln" id="ln">
      <div class="ln-wing past" id="wl"></div>
      <div class="ln-mid"><div class="ln-unit" id="unit"><div class="ln-hd" id="hd"></div><div class="ln-body" id="body" hidden></div>
        <div class="sp-cap ln-cap" id="cap"><div class="ln-chips" id="chips" hidden></div>
          <div class="ln-row"><span class="b" data-act="plus" role="button" title="带上东西、换个对象、换种方式">${ic("plus")}</span>
            <textarea class="ln-in" id="in" rows="1" autocomplete="off" aria-label="对助理说"></textarea><span class="b rest" id="send" role="button" aria-label="发送">${ic("send")}</span></div></div>
        <div class="ln-pmenu" id="pmenu" hidden></div></div></div>
      <div class="ln-wing next" id="wr"></div>
      <div class="ln-menu" id="menu" hidden></div>
    </div>`;
  const ln = $("#ln"), wl = $("#wl"), wr = $("#wr"), hd = $("#hd"), body = $("#body"), unit = $("#unit"), input = $("#in"), send = $("#send"), menu = $("#menu"), cap = $("#cap"), chipsEl = $("#chips"), pmenu = $("#pmenu");

  // 各部分怎么画
  const tail = (e) => e.stage === "run" ? `<span class="ln-st run"><i class="mk run" style="--p:${e.p || 30}%"></i>${e.word}</span>`
    : e.stage === "you" ? `<span class="ln-st ${e.tone}">${e.tone === "green" ? ic("check", "xs") : `<i class="mk ${e.tone}"></i>`}${e.word}</span>`
    : e.stage === "next" && e.time ? `<span class="ln-st">${e.time}</span>` : "";
  const item = (e, ghost) => `<span class="ln-it ${e.stage}${e.sug ? " sug" : ""}${ghost ? " ghost" : ""}" data-k="${ghost ? "ghost" : "ev"}-${e.id}" data-ev="${e.id}" title="${e.owner} · ${e.name}">${ic(e.icon, "s")}${S.topic ? "" : `<i class="pre">${T[e.topic].name} ›</i>`}<span class="cut nm">${e.name}</span>${e.stage === "next" && e.time ? `<small>${e.time}</small>` : ""}</span>`;
  const tab = (e) => `<span class="ln-tab ev${e.stage === "run" ? " is-run" : e.tone === "green" ? " is-green" : ""}${e.id === S.focus ? " on" : e.stage === "you" && e.tone !== "green" ? ` ${e.tone}` : ""}" data-k="ev-${e.id}" data-ev="${e.id}" title="${e.owner} · ${e.name}">${ic(e.icon, "s")}<span class="cut">${e.name}</span>${tail(e)}${e.id === S.focus ? `<span class="x" data-act="x" title="放回去（Esc）">${ic("x", "xs")}</span>` : ""}</span>`;
  const topicInner = () => `${S.topic ? "" : ic("folder", "s")}<span class="cut">${S.topic ? T[S.topic].name : PROJECT}</span>${S.topic && elsewhere() ? `<i class="n" title="别的事项里有 ${elsewhere()} 件在等你">${elsewhere()}</i>` : ""}${ic("chevron-down", "xs")}`;
  const acts = (e) => `<span class="acts">${(e.acts || []).map(([id, label, v]) => btn(id, label, v)).join("")}</span>`;
  const state = (e) => ({ past: "办完了", run: `在办 · ${e.word}`, you: e.word, next: e.sug ? "建议" : `接下来 · ${e.time}` })[e.stage];
  const bodyHtml = () => {
    const e = cur();
    if (S.body === "one") return e
      ? `${ic(e.icon, "s")}<span class="src">${e.owner}</span><span class="tx">${e.reply || e.line}</span>${acts(e)}`
      : `${ic("sparkles", "s acc")}<span class="tx">${S.reply.text}</span>${S.reply.place ? `<span class="place">${S.reply.place}<u>改</u></span>` : ""}`;
    return e
      ? `<div class="ln-card"><div class="top">${ic(e.icon, "s")}${e.owner} · ${state(e)}<span class="grow"></span>${T[e.topic].name}</div><h3>${e.name}</h3><p>${e.line}</p>${acts(e)}</div>
         <div class="ln-chat">${e.reply ? `<p>${e.reply}</p>` : `<p class="hint">关于这件事，可以直接在下面说。</p>`}</div>`
      : `<div class="ln-chat">${S.log.slice(-4).map(([who, text, tags]) => `<div class="${who}">${text}${tags && tags.length ? `<span class="tags">${tags.map((t) => `<i>${t}</i>`).join("")}</span>` : ""}</div>`).join("")}${S.quick.length ? `<div class="ln-quick">${S.quick.map((q) => `<span class="ln-q" data-quick="${q}">${q}</span>`).join("")}</div>` : ""}</div>`;
  };
  const mini = (k) => { // 一件事项那条线的缩影：办完的点 · 在办和该你的 · 「现在」· 接下来的圈
    const es = T[k].events.filter((e) => !e.gone), n = (s) => es.filter((e) => e.stage === s);
    return `<span class="ml">${n("past").slice(-5).map(() => "<i></i>").join("")}${es.filter(live).sort((x, y) => rank(y) - rank(x)).map((e) => `<i class="${e.stage === "run" ? "run" : e.tone}"></i>`).join("")}<i class="now"></i>${n("next").slice(0, 5).map(() => `<i class="nx"></i>`).join("")}</span>`;
  };
  const brief = (k) => {
    const es = T[k].events.filter((e) => !e.gone), you = es.filter((e) => e.stage === "you").length, run = es.filter((e) => e.stage === "run").length, nx = es.find((e) => e.stage === "next" && !e.sug);
    return [you ? `${you} 件等你` : "", run ? `${run} 件在办` : "", nx ? `下一件 ${nx.time} ${nx.name}` : ""].filter(Boolean).join(" · ") || "没有在办的事";
  };
  const menuHtml = () => `<div class="find">${ic("search", "s")}找事项…</div><div class="h">最近</div>
    ${topics().map((k) => `<div class="r${k === S.topic ? " cur" : ""}" data-topic="${k}"><b class="cut">${T[k].name}</b>${mini(k)}<small class="cut">${brief(k)}</small></div>`).join("")}
    <div class="h">全部事项</div>
    <div class="g">${ic("chevron-right", "xs")}产品发布<small>4 件</small></div><div class="g">${ic("chevron-right", "xs")}市场<small>3 件</small></div><div class="g">${ic("chevron-right", "xs")}没分组的<small>2 件</small></div>
    <div class="sep"></div>
    <div class="a">${ic("plus", "s")}新建事项</div><div class="a">${ic("tune", "s")}整理主线</div><div class="a" data-topic="">${ic("folder", "s")}不选事项（看整个项目）</div>`;

  // 输入框：只问一句话。别的都有默认值，只有一扇门（＋）；选了的才作为小片出现在这句话上面
  const PICK = {
    bring: [["file", "paperclip", "文件或图片…", "发布说明.md"], ["ctx", "eye", "正在看的这一页", "项目首页"], ["shelf", "bookmark", "Shelf 里的", "竞品截图"], ["idea", "idea", "灵光", "定价的想法"], ["lib", "library", "项目资料", "定价策略"]],
    to: [["助理", "sparkles", "默认"], ["Coding", "code", "执行方"], ["产品经理", "user", "Character"], ["文案", "user", "Character"]],
    way: [["talk", "message", "只讨论，不动手", "只讨论"], ["skill", "wand", "用一个技能…", "技能 · 写发布说明"], ["tool", "zap", "用一个能力…", "能力 · 查日程"]],
    act: [["总结这一页", "list"], ["下一步可以做什么", "idea"], ["新建待办", "check"], ["开一个 Coding 会话", "code"]],
  };
  const row = (kind, id, icon, label, note = "", on = false) => `<div class="i" data-pick="${kind}:${id}">${ic(icon, "s")}${label}${on ? ic("check", "s ok") : note ? `<small>${note}</small>` : ""}</div>`;
  const sect = { bring: () => `<div class="h">带上</div>${PICK.bring.map(([id, icon, label]) => row("bring", id, icon, label, "", S.chips.some((c) => c.k === id))).join("")}`,
    to: () => `<div class="h">发给</div>${PICK.to.map(([name, icon, note]) => row("to", name, icon, name, note, S.to === name)).join("")}`,
    way: () => `<div class="h">方式</div>${PICK.way.map(([id, icon, label]) => row("way", id, icon, label, "", S.chips.some((c) => c.k === id))).join("")}`,
    act: () => `<div class="h">这样开始</div>${PICK.act.map(([name, icon]) => row("act", name, icon, name)).join("")}` };
  const pmenuHtml = () => `${(S.pmenu === "at" ? ["to", "bring"] : S.pmenu === "slash" ? ["act", "way"] : ["bring", "to", "way"]).map((k) => sect[k]()).join("")}<div class="foot">打字时：<kbd>@</kbd> 引用或换人　<kbd>/</kbd> 找动作</div>`;
  const grow = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 132)}px`; };
  const pick = (kind, id) => {
    if (S.pmenu !== "all") { input.value = input.value.replace(/[@/]$/, ""); }
    if (kind === "to") S.to = id;
    else if (kind === "act") { input.value = `${id}：`; }
    else { const [, icon, , label] = PICK[kind].find((x) => x[0] === id), at = S.chips.findIndex((c) => c.k === id); if (at >= 0) S.chips.splice(at, 1); else S.chips.push({ k: id, icon, label }); }
    S.pmenu = null; input.dispatchEvent(new Event("input")); input.focus();
  };
  const WAYS = ["作为补充", "打断并改向", "下一轮再做"];
  const busy = () => { const f = cur(); return Boolean(f && f.stage === "run"); };
  const chipsHtml = () => `${busy() && input.value.trim() ? `<span class="ln-chip way" data-chip="way" title="它还在办这一轮，这句话怎么送达">${ic("timer", "s")}${WAYS[S.way]}${ic("chevron-down", "xs")}</span>` : ""}${S.to !== "助理" ? `<span class="ln-chip to" data-chip="to">${ic("user", "s")}发给 ${S.to}<span class="x">${ic("x", "xs")}</span></span>` : ""}${S.chips.map((c) => `<span class="ln-chip" data-chip="${c.k}">${ic(c.icon, "s")}${c.label}<span class="x">${ic("x", "xs")}</span></span>`).join("")}`;
  const hint = (f) => S.ph || (f ? (f.stage === "you" && f.tone === "amber" ? "回答它，或说怎么改…" : `关于「${f.name}」，说点什么…`) : S.to !== "助理" ? `对${S.to}说点什么…` : S.body === "full" ? "接着说…" : S.topic ? `在「${T[S.topic].name}」里交办一件事，或问一句…` : "交办一件事，或问一句…");

  // 放不下时从远处收：两翼最多各四件，其余记数
  const fitWing = (wing, word, farFirst) => {
    const items = [...wing.querySelectorAll(".ln-it")], more = wing.querySelector(".ln-more");
    const need = () => [...wing.children].filter((c) => !c.hidden).reduce((w, c) => w + c.offsetWidth + 10, -10);
    let hiddenCount = 0; more.hidden = true;
    for (const it of farFirst(items)) {
      const shown = items.length - hiddenCount;
      if (shown <= 4 && need() <= wing.clientWidth - 10) break;
      it.hidden = true; hiddenCount += 1; more.hidden = false; more.textContent = `${word} ${hiddenCount}`;
    }
  };

  // 一种动法：同一件东西换了位置，就从原来的位置走过去；新出现的上浮淡入
  const zoom = () => win.getBoundingClientRect().width / win.offsetWidth || 1;
  const snap = () => { const m = new Map(); ln.querySelectorAll("[data-k]").forEach((el) => { if (!el.hidden) m.set(el.dataset.k, el.getBoundingClientRect()); }); return m; };
  const play = (before) => {
    if (reduce) return;
    const z = zoom();
    ln.querySelectorAll("[data-k]").forEach((el) => {
      if (el.hidden) return;
      const now = el.getBoundingClientRect(), was = before.get(el.dataset.k);
      if (!was) { el.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: getComputedStyle(el).opacity, transform: "none" }], { duration: 250, easing: QUINT }); return; }
      const dx = (was.left - now.left) / z, dy = (was.top - now.top) / z;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      el.style.zIndex = "8";
      el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: Math.hypot(dx, dy) > 160 ? 420 : 250, easing: QUINT }).onfinish = () => { el.style.zIndex = ""; };
    });
  };

  let bodyWas = "none";
  const render = () => {
    const before = snap();
    const es = list(), f = cur();
    const past = es.filter((e) => e.stage === "past").sort((x, y) => x.at - y.at);
    const next = es.filter((e) => e.stage === "next").sort((x, y) => (x.sug ? 1 : 0) - (y.sug ? 1 : 0) || x.at - y.at);
    const lives = es.filter(live).sort((x, y) => rank(x) - rank(y) || x.at - y.at);
    const shown = lives.slice(0, 3); if (f && live(f) && !shown.includes(f)) shown[2] = f;
    const headLeft = S.head === "left";
    wl.innerHTML = `${headLeft ? `<span class="ln-head${S.menu ? " open" : ""}" data-k="topic" data-act="menu">${topicInner()}</span>` : ""}<span class="ln-more" hidden></span>${past.map((e) => item(e, e.id === S.focus)).join("")}`;
    wr.innerHTML = `${next.map((e) => item(e, e.id === S.focus)).join("")}<span class="ln-more" hidden></span><span class="ln-ctl" data-k="ctl"><span class="ln-tasks" title="后台任务：${lives.filter((e) => e.stage === "run").length} 件在办"><i class="mk run" style="--p:40%"></i>${all().filter((e) => e.stage === "run" && !e.gone).length}</span><span class="ex" data-act="expand" title="${S.body === "full" ? "收起" : "展开对话"}">${ic(S.body === "full" ? "chevron-down" : "chevron-up", "s")}</span></span>`;
    hd.innerHTML = `${headLeft ? "" : `<span class="ln-tab topic${f ? "" : " on"}" data-k="topic" data-act="menu">${topicInner()}</span>${shown.length || (f && !live(f)) ? `<span class="ln-sep"></span>` : ""}`}
      ${shown.map(tab).join("")}${lives.length > shown.length ? `<span class="ln-plus" title="还有 ${lives.length - shown.length} 件在进行">+${lives.length - shown.length}</span>` : ""}${f && !live(f) ? tab(f) : ""}${S.body === "full" ? `<span class="ln-dots" data-act="more" title="更多">${ic("more", "s")}${S.more ? `<span class="ln-pmenu more"><span class="i">${ic("maximize", "s")}在主区展开</span><span class="i">${ic("history", "s")}全部对话</span><span class="i">${ic("info", "s")}详情<small>谁在办、工作环境、上下文</small></span><span class="i">${ic("question", "s")}每步先问我<small>关</small></span></span>` : ""}</span>` : ""}`;

    if (S.body === "one" && !f && !S.reply) S.body = "none";
    body.hidden = S.body === "none"; body.className = `ln-body ${S.body}${bodyWas === "none" && S.body !== "none" ? " in" : ""}`;
    if (S.body !== "none") body.innerHTML = bodyHtml();
    bodyWas = S.body;
    unit.classList.toggle("up", S.body !== "none");
    ln.style.setProperty("--mid", S.body === "full" ? "680px" : "540px");
    input.placeholder = hint(f);
    const chips = chipsHtml(); chipsEl.hidden = !chips; chipsEl.innerHTML = chips;
    const stop = busy() && !input.value.trim(); send.className = `b ${stop ? "stop" : input.value.trim() ? "go" : "rest"}`; send.title = stop ? "停止这一轮" : "发送"; send.innerHTML = stop ? `<i class="sq"></i>` : ic("send");
    pmenu.hidden = !S.pmenu; if (S.pmenu) { pmenu.innerHTML = pmenuHtml(); pmenu.style.bottom = `${cap.offsetHeight + 8}px`; }
    // 页签挤的时候按轻重收：先收在办的那个词，再把在办的、交回的收成只剩图形和记号；该你定的名字最后才截
    hd.classList.toggle("focus", Boolean(f)); hd.classList.remove("tight");
    const cramped = () => [...hd.querySelectorAll(".ln-tab.ev:not(.mini) .cut")].some((c) => c.scrollWidth > c.clientWidth + 1);
    if (cramped()) hd.classList.add("tight");
    for (const t of [...[...hd.querySelectorAll(".ln-tab.ev.is-run:not(.on)")].reverse(), ...[...hd.querySelectorAll(".ln-tab.ev.is-green:not(.on)")].reverse()]) { if (!cramped()) break; t.classList.add("mini"); }
    fitWing(wl, "更早", (items) => items); fitWing(wr, "之后", (items) => items.slice().reverse());
    menu.hidden = !S.menu;
    if (S.menu) {
      menu.innerHTML = menuHtml();
      const a = ln.querySelector('[data-k="topic"]').getBoundingClientRect(), r = ln.getBoundingClientRect(), z = zoom();
      menu.style.left = `${Math.max(8, (a.left - r.left) / z - 6)}px`; menu.style.bottom = `${(r.bottom - a.top) / z + 8}px`;
    }
    play(before);
    if (S.pulse) { const el = ln.querySelector(`[data-k="ev-${S.pulse}"]`); if (el) { el.classList.add("ask"); setTimeout(() => el.classList.remove("ask"), 700); } S.pulse = null; }
  };

  // 一件事的一生：接下来 → 在办 ⇄ 该你了 → 办完
  const later = (ms, fn) => { const g = gen; setTimeout(() => { if (g === gen) { fn(); render(); } }, ms); };
  const toPast = (e, line) => { if (e.icon === "circle") e.icon = "check"; e.stage = "past"; e.at = ++clock; e.tone = ""; e.word = ""; e.reply = null; e.line = line || e.line; e.acts = OPEN; };
  const toRun = (e, word, line) => { e.stage = "run"; e.tone = ""; e.word = word; e.p = 20; e.reply = null; if (line) e.line = line; e.acts = [["open", "看过程"]]; };
  const giveBack = (e) => { if (e.gone || e.stage !== "run") return; e.stage = "you"; e.tone = "green"; e.word = "交回了"; e.line = e.result || `办完了：${e.name}。`; e.acts = [["accept", "收下", "primary"], ["open", "看结果"]]; };
  const toAsk = (e) => { e.stage = "you"; e.tone = "amber"; e.word = "等你定"; e.line = "跑测试要装一个新依赖 fast-check，装吗？"; e.acts = [["agree", "装", "primary"], ["no", "不装"]]; S.pulse = e.id; };
  const toFail = (e) => { e.stage = "you"; e.tone = "red"; e.word = "没跑通"; e.line = "没跑通：测试环境连不上，停在第 2 步。"; e.acts = [["retry", "再试一次", "primary"], ["open", "看过程"]]; S.pulse = e.id; };
  const toDue = (e) => { e.stage = "you"; e.tone = "amber"; e.word = "到点了"; e.line = `现在 ${e.time} · ${e.line.split(" · ").pop()}`; S.pulse = e.id; };
  const work = (e, total = 5200) => { // e.held：演示脚本自己掌握节奏时，不让它自己往下走
    later(total * 0.35, () => { if (e.stage === "run" && !e.held) { e.word = "第 1 步"; e.p = 40; } }); later(total * 0.7, () => { if (e.stage === "run" && !e.held) { e.word = "第 2 步"; e.p = 75; } }); later(total, () => { if (!e.held) giveBack(e); });
  };
  const spawn = (name, line) => { const e = ev(`n-${++clock}`, name, "sparkles", "助理", "run", { word: "接单了", p: 12, line: line || "刚接单，在看要做什么。", acts: [["open", "看过程"]], result: `办完了：${name}。结果在这里，看一眼。` }); T[S.topic || "a"].events.push(e); work(e); return e; };
  const unfocus = () => { const e = cur(); if (e && e.stage === "you" && e.tone === "green") toPast(e, "刚看过"); S.focus = null; S.ph = null; if (S.body !== "full") S.body = "none"; };
  const select = (id) => { S.menu = false; S.ph = null; if (S.focus && S.focus !== id) unfocus(); S.focus = id; if (S.body === "none") S.body = "one"; };
  const firstOf = (test) => list().find(test) || all().find((e) => !e.gone && test(e));
  const doAct = (id) => {
    const e = cur(); if (!e) return;
    if (id === "open") S.body = "full";
    else if (id === "agree") { toRun(e, "接着办", "收到，接着办。"); unfocus(); work(e, 4200); }
    else if (id === "retry") { toRun(e, "再试一次", "再试一次。"); unfocus(); work(e, 4200); }
    else if (id === "no") { toRun(e, "接着办", "收到，不装，换个办法接着办。"); unfocus(); work(e, 4200); }
    else if (id === "tick") { toPast(e, "刚勾掉"); S.focus = null; S.body = "none"; }
    else if (id === "tomorrow") { e.stage = "next"; e.tone = ""; e.word = ""; e.time = "明天"; e.at = ++clock; e.line = "明天 · 问预算"; S.focus = null; S.body = "none"; }
    else if (id === "accept") { toPast(e, "刚收下"); S.focus = null; S.body = "none"; }
    else if (id === "later") { e.gone = true; S.focus = null; S.body = "none"; }
    else if (id === "start") { input.value = e.name; input.dispatchEvent(new Event("input")); input.focus(); }
    else if (id === "prep") { spawn(`备「${e.name}」的材料`, `为「${e.name}」备材料。`); e.reply = "接单了：发布说明和检查表各备一份，办完交回这里。"; }
  };
  const say = () => {
    const text = input.value.trim(); if (!text) return;
    const tags = [...(S.to !== "助理" ? [`发给 ${S.to}`] : []), ...S.chips.map((c) => c.label)], who = S.to;
    input.value = ""; S.ph = null; S.chips = []; S.to = "助理"; S.pmenu = null; S.quick = []; grow();
    const e = cur();
    if (e) { e.reply = e.stage === "run" ? ["收到，作为补充，这一轮接着办。", "停下了，按你说的改向。", "记下了，这一轮办完再做。"][S.way] : `收到，补充给「${e.name}」。`; S.way = 0; if (e.stage === "you" && e.tone !== "green") { toRun(e, "接着办"); e.reply = "收到，按你说的改，接着办。"; work(e, 4200); } }
    else { const name = text.length > 12 ? `${text.slice(0, 12)}…` : text; spawn(name); S.log.push(["me", text, tags], ["it", `${who === "助理" ? "接单了，这就去办。" : `${who}接单了。`}<span class="placed">新事件：${name} <u>改</u></span>`]); S.reply = { text: who === "助理" ? "接单了，这就去办。" : `${who}接单了。`, place: `新事件：${name}` }; if (S.body === "none") S.body = "one"; }
  };
  const GO = {
    ask: () => { const e = firstOf((x) => x.stage === "run"); if (e) toAsk(e); },
    back: () => { const e = firstOf((x) => x.stage === "run"); if (e) giveBack(e); },
    fail: () => { const e = firstOf((x) => x.stage === "run"); if (e) toFail(e); },
    due: () => { const e = firstOf((x) => x.stage === "next" && !x.sug && /\d:\d\d/.test(x.time || "")); if (e) toDue(e); },
    reset: () => { gen += 1; seed(); input.value = ""; grow(); note("现在", "静止的样子。中间是事项「发布 v2.3」和输入框；左边是这件事里办完的，右边是接下来的。"); },
  };

  // 演示一遍
  const note = (step, text) => { $("#step").textContent = step; $("#say").textContent = text; };
  const wait = (ms, g) => new Promise((ok) => setTimeout(() => ok(g === gen), ms));
  const type = async (text, g) => { for (const ch of text) { input.value += ch; input.dispatchEvent(new Event("input")); if (!(await wait(45, g))) return false; } return true; };
  const story = async () => {
    GO.reset(); render(); const g = gen; let n = 0;
    const step = (text) => note(`第 ${++n} / 9 步`, text);
    step("静止。左边是这件事里办完的，右边是接下来的；输入框上面第一个页签是事项，后面是它正在进行的事件。"); if (!(await wait(3400, g))) return;
    step("交办一件事：说完就清空，新事件从输入框上面升起来，在办。"); if (!(await type("查一下三家竞品的定价", g))) return; if (!(await wait(500, g))) return; say(); const born = T.a.events[T.a.events.length - 1]; born.held = true; render(); if (!(await wait(3200, g))) return;
    step("它办到一半要你定：变成琥珀色，排到最前，只闪一次。"); const asked = find("a-r1"); toAsk(asked); render(); if (!(await wait(3000, g))) return;
    step("点它：下面出一行，写着它问什么、能点什么。这时打字就是对它说。"); select(asked.id); render(); if (!(await wait(3400, g))) return;
    step("点「装」：它回到在办，中间收回去。"); doAct("agree"); asked.held = true; render(); if (!(await wait(2600, g))) return;
    step("办完交回：绿勾。点开看一眼、收下，它走到左边，成为办完的。"); born.held = false; giveBack(born); render(); if (!(await wait(2200, g))) return; select(born.id); render(); if (!(await wait(2600, g))) return; doAct("accept"); render(); if (!(await wait(2600, g))) return;
    step("15:00 到了：右边那件待办走到中间，「到点了」。"); GO.due(); render(); if (!(await wait(2800, g))) return;
    step("点它、勾掉：它走到左边。一件事只按「右 → 中 → 左」走。"); select("a-n1"); render(); if (!(await wait(2200, g))) return; doAct("tick"); render(); if (!(await wait(2600, g))) return;
    step("点事项名换一件事项：整条线换成那件事的。菜单里每一行是那件事项的一条缩影。"); S.menu = true; render(); if (!(await wait(3200, g))) return; S.menu = false; S.topic = "b"; S.focus = null; S.body = "none"; render(); if (!(await wait(2800, g))) return;
    note("演示完", "接着可以自己点。「重置」回到开头。");
  };

  // 点和键盘
  win.addEventListener("click", (event) => {
    const t = event.target, hit = (s) => t.closest(s);
    if (hit("#in")) return;
    const hadMenu = S.pmenu || S.more; if (!hit('[data-act="plus"]') && !hit("[data-pick]")) S.pmenu = null; if (!hit('[data-act="more"]')) S.more = false;
    if (hit("[data-pick]")) { const [kind, id] = hit("[data-pick]").dataset.pick.split(":"); pick(kind, id); }
    else if (hit('[data-act="plus"]')) { S.pmenu = S.pmenu ? null : "all"; S.menu = false; }
    else if (hit('[data-act="more"]')) S.more = !S.more;
    else if (hit("[data-chip]")) { const k = hit("[data-chip]").dataset.chip; if (k === "way") S.way = (S.way + 1) % 3; else if (k === "to") S.to = "助理"; else S.chips = S.chips.filter((c) => c.k !== k); }
    else if (hit("[data-quick]")) { input.value = hit("[data-quick]").dataset.quick; say(); }
    else if (hit("[data-do]")) doAct(hit("[data-do]").dataset.do);
    else if (hit("[data-topic]")) { const k = hit("[data-topic]").dataset.topic; if (S.focus) unfocus(); S.topic = k || null; S.menu = false; S.body = "none"; S.reply = null; }
    else if (hit('[data-act="x"]')) unfocus();
    else if (hit('[data-act="expand"]')) { S.menu = false; S.body = S.body === "full" ? (S.focus || S.reply ? "one" : "none") : "full"; }
    else if (hit('[data-act="menu"]')) { if (S.focus && S.head === "mid" && !t.closest("svg")) unfocus(); else S.menu = !S.menu; }
    else if (hit("#send")) { if (send.classList.contains("stop")) { const e = cur(); e.held = true; toPast(e, "你停止了这一轮"); S.focus = null; S.body = "none"; } else say(); }
    else if (hit("[data-ev]")) select(hit("[data-ev]").dataset.ev);
    else if (hit("#menu")) return;
    else if (hit("#stage") || hit(".sp-top")) { S.menu = false; if (hadMenu) { /* 先只关菜单 */ } else if (S.body !== "none") S.body = "none"; }
    else if (!hadMenu) return;
    render();
  });
  input.addEventListener("input", () => {
    grow();
    const v = input.value, hadText = send.classList.contains("go"); want = v === "/" ? "slash" : /(^|\s)@$/.test(v) ? "at" : S.pmenu === "all" ? "all" : null;
    if (want !== S.pmenu || hadText !== Boolean(v.trim())) { S.pmenu = want; render(); } else if (S.pmenu) pmenu.style.bottom = `${cap.offsetHeight + 8}px`;
  });
  input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); say(); render(); } });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (S.pmenu || S.more) { S.pmenu = null; S.more = false; } else if (S.menu) S.menu = false; else if (S.body === "full") S.body = S.focus || S.reply ? "one" : "none"; else if (S.focus) unfocus(); else S.body = "none";
    render();
  });

  // 原型控制：演示、触发、事项位置、宽度、主题
  $("#ctrls").addEventListener("click", (event) => { const b = event.target.closest("[data-go]"); if (!b) return; if (b.dataset.go === "story") { story(); return; } GO[b.dataset.go](); render(); });
  const group = (id, apply) => $(id).addEventListener("click", (event) => { const b = event.target.closest("button"); if (!b) return; $(id).querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); apply(b.value); });
  const fit = () => { const w = win.offsetWidth; document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / w))); $("#shot").style.width = `calc(${w}px * var(--z,1))`; };
  group("#headpos", (v) => { S.head = v; S.menu = false; render(); });
  group("#width", (v) => { win.style.width = `${v}px`; fit(); render(); });
  const setTheme = (theme) => { document.documentElement.dataset.resolvedTheme = theme; document.documentElement.dataset.theme = theme; $("#theme").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === theme))); };
  group("#theme", setTheme);
  const q = new URLSearchParams(location.search);
  setTheme(q.get("theme") === "dark" ? "dark" : "light");
  window.addEventListener("resize", () => { fit(); render(); });

  seed(); if (q.get("head") === "left") { S.head = "left"; $("#headpos").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === "left"))); }
  if (q.get("width")) win.style.width = `${Number(q.get("width"))}px`;
  fit(); render();
  // 给截图用：?do=ask,select:a-r1 这样的一串，按顺序执行
  (q.get("do") || "").split(",").filter(Boolean).forEach((cmd) => { const [name, arg] = cmd.split(":"); if (name === "select") select(arg); else if (name === "act") doAct(arg); else if (name === "menu") S.menu = true; else if (name === "topic") S.topic = arg || null; else if (name === "full") S.body = "full"; else if (name === "say") { input.value = arg; say(); } else if (name === "plus") S.pmenu = arg || "all"; else if (name === "pick") { S.pmenu = "all"; pick(...arg.split("~")); } else if (name === "type") { input.value = arg.replace(/~/g, "\n"); input.dispatchEvent(new Event("input")); } else if (name === "more") S.more = true; else if (GO[name]) GO[name](); render(); });
})();
