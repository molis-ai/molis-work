/* 底栏和输入框 · 三个方向的并排对比稿。全是静态画面，只为挑骨架；不是产品代码。 */
(() => {
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const I = (n, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const $ = (s) => document.querySelector(s);

  /* —— 线上的东西 —— */
  const EV = {
    p1: { g: "done", nm: "冻结代码", t: "昨天" },
    p2: { g: "done", nm: "起草发布说明", t: "11:20" },
    p3: { g: "done", nm: "跑回归测试", t: "13:05" },
    p4: { g: "done", nm: "核对定价页", t: "13:40" },
    r1: { g: "run", nm: "生成更新日志", w: "第 2 步" },
    y1: { g: "you", nm: "定稿公告", w: "等你定" },
    n1: { g: "next", nm: "发布评审", t: "15:00" },
    n2: { g: "next", nm: "推送公告", t: "评审后" },
    n3: { g: "next", nm: "回访 3 位客户", t: "明天" },
  };
  const G = (g) => (g === "done" ? I("check", "xs dg done") : `<i class="dg ${g}"></i>`);
  const ev = (id, o = {}) => {
    const e = EV[id];
    const tail = o.bare ? "" : e.w ? `<small>${e.w}</small>` : e.t && !o.notime ? `<small>${e.t}</small>` : "";
    return `<span class="dv ${e.g}${o.on ? " on" : ""}">${G(e.g)}<span class="nm cut">${e.nm}</span>${tail}</span>`;
  };
  const head = `<span class="dh">发布 v2.3${I("chevron-down", "xs")}</span>`;
  const tail = `<span class="dt"><span class="dt-k" title="后台任务">${I("activity", "s")}<em>2</em></span><span class="dt-k" title="展开对话">${I("chevron-up", "s")}</span></span>`;
  const num = (t) => `<span class="dn">${t}</span>`;

  /* —— 输入框：一张卡，最多三行 —— */
  const K = (n, c = "", t = "") => `<span class="dc-k ${c}"${t ? ` title="${t}"` : ""}>${I(n, "s")}</span>`;
  const rowA = {
    you: `<div class="dc-a">${G("you")}<b>定稿公告</b><span class="say cut">标题用「更快的发布」还是「v2.3 来了」？</span><span class="dc-act pri">用第一个</span><span class="dc-act">用第二个</span>${K("chevron-up", "sm", "展开")}${K("x", "sm", "不看了")}</div>`,
    run: `<div class="dc-a">${G("run")}<b>生成更新日志</b><span class="say cut">第 2 步，共 4 步 · 正在比对提交记录</span>${K("chevron-up", "sm", "展开")}${K("x", "sm", "不看了")}</div>`,
    reply: `<div class="dc-a">${I("sparkles", "s t-b")}<span class="say ink cut">已开始：先跑回归测试，再出更新日志，大约 6 分钟。</span>${K("chevron-up", "sm", "展开")}</div>`,
  };
  const chip = (icon, t) => `<span class="dc-chip">${I(icon, "xs")}<span class="cut">${t}</span>${I("x", "xs x")}</span>`;
  const who = (t) => `<span class="dc-who">${t}${I("chevron-down", "xs")}</span>`;
  const cap = (o = {}) => {
    const a = o.a ? rowA[o.a] : "";
    if (!o.text) {
      return `<div class="dc${a ? " has-a" : ""}">${a}<div class="dc-row">${K("plus", "", "带上东西")}<span class="dc-ph">${o.ph || "对助理说一句，或输入 / 开始一件事"}</span>${o.stop ? `<span class="dc-k send stop" title="停下"><i class="sq"></i></span>` : K("send", "send dim", "发送")}</div></div>`;
    }
    return `<div class="dc open${a ? " has-a" : ""}">${a}<div class="dc-text${o.mark ? " mark" : ""}">${o.text}<i class="caret"></i></div><div class="dc-foot">${K("plus", "", "带上东西")}${(o.chips || []).join("")}<span class="grow"></span>${o.way ? `<span class="dc-who way">${o.way}${I("chevron-down", "xs")}</span>` : ""}${who(o.who || "助理")}${K("send", "send", "发送")}</div></div>`;
  };
  const SAY = "把发布说明里「已知问题」那一段改短一点，语气别太硬，另外把定价页的截图换成新版";

  /* —— 清单：事项的全部事件，加换一件事 —— */
  const lrow = (id, o = {}) => { const e = EV[id]; return `<div class="dl-r${o.on ? " on" : ""}">${G(e.g)}<span class="nm cut">${e.nm}</span><small class="${e.g}">${e.w || e.t || ""}</small></div>`; };
  const list = `<div class="dl">
    <div class="dl-h"><b>发布 v2.3</b><span class="grow"></span>${K("more", "sm")}</div>
    <div class="dl-g">等你 <em>1</em></div>${lrow("y1")}
    <div class="dl-g">在办 <em>1</em></div>${lrow("r1")}
    <div class="dl-g">接下来 <em>3</em></div>${lrow("n1")}${lrow("n2")}${lrow("n3")}
    <div class="dl-g fold">${I("chevron-right", "xs")}办完 <em>4</em></div>
    <div class="dl-sep"></div>
    <div class="dl-g">换一件事</div>
    <div class="dl-r topic"><span class="nm cut">定价页改版</span><small class="you">1 件等你</small></div>
    <div class="dl-r topic"><span class="nm cut">用户访谈整理</span><small>都办完了</small></div>
    <div class="dl-r topic new">${I("plus", "xs")}<span class="nm">开始一件新的事</span></div>
  </div>`;

  /* —— 展开成对话框：还是这张卡，向上长 —— */
  const dlg = `<div class="dc dlg">
    <div class="dc-a big">${G("run")}<b>生成更新日志</b><span class="say">第 2 步，共 4 步</span><span class="grow"></span>${K("more", "sm", "详情、停下、放到别的事项")}${K("chevron-down", "sm", "收起")}</div>
    <div class="dd">
      <div class="dd-me">出一份 v2.3 的更新日志，按「新功能、改进、修复」分三段。</div>
      <div class="dd-it">好，分四步做：读提交记录、归类、写成对用户说的话、对一遍发布说明。现在在第 2 步。</div>
      <div class="dd-it">第 1 步读完了，一共 46 条提交，其中 9 条是内部重构，不会写进日志。</div>
      <div class="dd-file">${I("file", "s")}<span>提交清单（46 条）</span><small>刚刚</small></div>
      <div class="dd-q"><span class="dc-act">重构的也列一下</span><span class="dc-act">先给我看草稿</span></div>
    </div>
    <div class="dc-row line">${K("plus")}<span class="dc-ph">接着说，它会当作补充</span><span class="dc-k send stop" title="停下"><i class="sq"></i></span></div>
  </div>`;

  /* —— 三个方向的底栏 —— */
  const sheet = `<div class="d-sheet"><i style="width:34%"></i><i style="width:58%"></i><i style="width:47%"></i></div>`;
  const bars = {
    // 乙：线穿过输入框，只留要紧的
    b: (s) => {
      const eng = s === "type" || s === "focus" || s === "dlg";
      const live = `${ev("r1", { bare: eng, on: s === "dlg" })}${ev("y1", { bare: eng, on: s === "focus" })}`;
      const c = s === "type" ? cap({ text: SAY, chips: [chip("paperclip", "定价页-新版.png")] }) : s === "focus" ? cap({ a: "you", ph: "回它一句，或者直接点上面的按钮" }) : s === "dlg" ? dlg : cap();
      return `<div class="db b${s === "type" ? " dim" : ""}" style="--mid:${eng ? 640 : 480}px"><div class="dw l">${head}${num("办完 4")}${live}</div><div class="dmid">${c}</div><div class="dw r">${ev("n1")}${num("之后 2")}${tail}</div>${s === "list" ? list : ""}</div>`;
    },
    // 乙在窄窗口：两翼放不下名字，退成数字
    bn: () => `<div class="db b" style="--mid:440px"><div class="dw l">${head}<span class="ds">${G("you")}1 等你<i class="dot"></i>${G("run")}1 在办</span></div><div class="dmid">${cap({ ph: "对助理说一句" })}</div><div class="dw r">${ev("n1")}${tail}</div></div>`,
    // 甲：线在窗口底边，占一整行；输入框在它上面
    a: (s) => {
      const eng = s !== "rest";
      const c = s === "type" ? cap({ text: SAY, chips: [chip("paperclip", "定价页-新版.png")] }) : s === "focus" ? cap({ a: "you", ph: "回它一句，或者直接点上面的按钮" }) : cap();
      return `<div class="db a" style="--mid:${eng ? 640 : 480}px"><div class="da-top"><span></span><div class="dmid">${c}</div><span></span></div><div class="da-line">${head}<div class="seg past">${num("更早 1")}${ev("p2", { notime: 1 })}${ev("p3", { notime: 1 })}${ev("p4", { notime: 1 })}${ev("r1")}${ev("y1", { on: s === "focus" })}</div><span class="now">现在</span><div class="seg next">${ev("n1")}${ev("n2")}${ev("n3")}</div>${tail}</div></div>`;
    },
    // 丙：没有线，只有输入框和两句话
    c: (s) => {
      const eng = s === "type";
      const c = s === "type" ? cap({ text: SAY, chips: [chip("paperclip", "定价页-新版.png")] }) : s === "quiet" ? cap() : cap({ a: "you", ph: "回它一句，或者直接点上面的按钮" });
      const sum = s === "quiet" ? `<span class="ds">${G("run")}1 件在办</span>` : `<span class="ds">${G("you")}1 件等你<i class="dot"></i>${G("run")}1 件在办</span>`;
      return `<div class="db c" style="--mid:${eng || s !== "quiet" ? 640 : 480}px"><div class="dw l plain">${head}${sum}<span class="grow"></span></div><div class="dmid">${c}</div><div class="dw r plain"><span class="ds mute">下一件 15:00 发布评审</span>${tail}</div>${s === "list" ? list : ""}</div>`;
    },
  };
  const win = (dir, s, h, w = 1440) => `<div class="d-win sp-ui" style="height:${h}px;width:${w}px;--bar:${dir === "a" ? 90 : 64}px">${sheet}${bars[dir](s)}</div>`;
  const fr = (t, note, html) => `<div class="d-fr"><h4>${t}<small>${note}</small></h4>${html}</div>`;

  /* —— 输入框自己的几个样子（小幅） —— */
  const tile = (t, note, html, h = 190) => `<div class="d-fr"><h4>${t}<small>${note}</small></h4><div class="d-tile sp-ui" style="height:${h}px">${html}</div></div>`;
  const old = `<div class="old">
    <div class="old-strip"><span class="lab">这次发送带上的</span><span class="dc-chip">${I("eye", "xs")}<span class="cut">正在看：定价页 v3</span>${I("x", "xs x")}</span><span class="grow"></span><span class="dc-k sm">${I("inbox", "s")}</span></div>
    <div class="old-box">${K("plus")}<span class="old-tag">发给：本项目 · 助理${I("x", "xs x")}</span><span class="old-in mark">${SAY}<i class="caret"></i></span><span class="old-more">更多${I("chevron-down", "xs")}</span>${K("send", "send")}</div>
    <div class="old-hint">回车已改为换行。要发送请按 ⌘↵<u>知道了</u></div>
  </div>`;

  const rules = (arr) => `<div class="ln-rules">${arr.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("")}</div>`;
  const table = (hd, rows, cls = "") => `<table class="ln-count ${cls}"><thead><tr>${hd.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  $("#dirs").innerHTML = `
  <section class="d-sec" id="top">
    <h2>底栏和输入框一起重做：先挑骨架</h2>
    <p>前五版都是在同一副骨架上加东西，所以越改越杂。这一页不做细节，只回答两件事：输入框里的选项怎样不占打字的地方；线上常年摆多少东西。输入框只有一个提案，三个方向共用。线有三个方向，差别在常年摆多少、和输入框是不是同一行。下面四条在三个方向里都一样。</p>
    ${rules([
      ["事项是线，事件是线上的点", "事项名在最左，线从它身上出来。换一件事项，整条线一起换。点事项名看到的就是这条线的全部事件。"],
      ["状态四个，各一个记号", `<span class="lg sp-ui">${G("next")}接下来　${G("run")}在办　${G("you")}等你　${G("done")}办完</span>没跑通也算「等你」，记号是红的。办完交回的不另算一种，直接进办完。`],
      ["离输入框越近，越是现在", "左边紧挨着的是等你的，再是在办的，再远是办完的。右边是接下来的。一件事只往左走。"],
      ["点一件事，它不动", "线上那一件描上边，它的内容出现在输入框的第一行。没有页签，没有飞过来的动画，也没有悬停小卡。"],
    ])}
  </section>

  <section class="d-sec" id="now">
    <h2>现在挤在哪</h2>
    <p>同一句话，左边是照现在的产品画的示意（不是实测尺寸），右边是这一版。虚线框是能打字的地方。现在的输入框把「带上的、发给谁、更多」和字排在同一行，字只剩中间一条。</p>
    <div class="d-fit"><div class="d-two">
      ${tile("现在（示意）", "选项和字抢同一行，框外上下还各有一行", old, 230)}
      ${tile("这一版", "字独占一行；带上什么、交给谁在最后一行", cap({ text: SAY, mark: 1, chips: [chip("eye", "正在看：定价页 v3")] }), 230)}
    </div></div>
  </section>

  <section class="d-sec" id="cap">
    <h2>输入框：一张卡，最多三行，每行只管一件事</h2>
    <p>第一行说「关于什么」，没有就没有这一行。中间一行只放字。最后一行说「带上什么、交给谁」，只在打字时出现。不打字时只有三样：＋、一句话、发送；交给谁就写在那句话里。</p>
    <div class="d-fit"><div class="d-two">
      ${tile("静止", "＋、一句话、发送。「对助理说」就是原来那枚「发给」的片", cap(), 130)}
      ${tile("正在打字", "卡变宽、向上长；最后一行出现", cap({ text: SAY, chips: [chip("paperclip", "定价页-新版.png")] }), 190)}
      ${tile("在 Coding 的一个会话里打字", "正在看的东西是一枚片，和附件一个长相；交给谁默认是这个会话", cap({ text: "登录页的回归先别修，等评审完再说", chips: [chip("code", "正在看：修登录回归")], who: "这个会话" }), 190)}
      ${tile("刚发出", "它回的第一句话就在第一行；要细看点右边展开", cap({ a: "reply", ph: "接着说" }), 150)}
      ${tile("点了线上「等你」的一件", "第一行是那件事：一句话，最多两个按钮；回一句也行", cap({ a: "you", ph: "回它一句，或者直接点上面的按钮" }), 150)}
      ${tile("点了在办的一件，又打了字", "只在这时多出一个词：这句话怎么送达（补充、打断并改向、下一轮再做）", cap({ a: "run", text: "顺便把内部重构那 9 条也列一个附录", way: "作为补充" }), 230)}
    </div></div>
    <h3 class="ln-h3">原来的每样东西去了哪</h3>
    ${table(["原来在输入框里或旁边的", "去了哪", "什么时候看得见"], [
      ["「发给：本项目 · 助理」的片", "不打字时是那句占位的话；打字时是最后一行右边的「助理 ⌄」", "一直，但不占打字的地方"],
      ["当前事项", "线最左的事项名。说的话默认进这件事", "一直"],
      ["正在看的插件对象（框上「这次发送带上的」一行）", "最后一行左边的一枚片，和附件一个长相，点 × 不带", "打字时"],
      ["「更多」里的三个选择（谁来做、方式、角色）", "并进「助理 ⌄」一个菜单", "点开时"],
      ["状态行（发送中、没发出、待确认、回车提示）", "卡的第一行。回车提示没有了，回车就是发送", "有事时"],
      ["下一步、提醒、铃", "线上的「等你」", "有事时"],
      ["补充、打断并改向、下一轮再做，暂停，停止", "发送键左边一个词，默认「作为补充」。没打字时发送键就是停下", "它在办、你又打了字时"],
      ["对话框头部的六个键、左边的详情栏", "头部只有名字、「⋯」、收起。换一件事点线上的事件，线就是页签", "展开时"],
    ], "map")}
  </section>

  <section class="d-sec" id="b">
    <h2>乙 · 线穿过输入框，只留要紧的 <em class="rec">我推荐</em></h2>
    <p>一行，64 高。左边紧挨输入框的是在办和等你的，点名；办完的只是一个数字。右边只点名下一件，其余是数字。数字和事项名点开都是同一张清单。</p>
    <div class="d-fit">
      ${fr("静止", "常年在屏上的名字最多四个：在办、等你、下一件，加事项名", win("b", "rest", 150))}
      ${fr("正在打字", "卡变宽、向上长；两翼让出地方并变淡，只留记号和名字", win("b", "type", 210))}
      ${fr("点了「定稿公告」", "它在线上描边、位置不动；内容到了输入框第一行", win("b", "focus", 170))}
      ${fr("展开成对话框", "还是这张卡向上长。没有页签：换一件事点线上的事件。头部只有名字、「⋯」、收起", win("b", "dlg", 500))}
      ${fr("窗口窄到 1024", "两翼放不下名字，自动退成数字（就是丙的样子）", win("bn", "rest", 150, 1024))}
    </div>
  </section>

  <section class="d-sec" id="a">
    <h2>甲 · 线在窗口底边，占一整行</h2>
    <p>两行，90 高。线是窗口最下面一整行，办完的、在办的、等你的、接下来的都点名；输入框在它上面，两边是空的。打字时线不动。</p>
    <div class="d-fit">
      ${fr("静止", "一整行能点名九件左右；再多的收成「更早 N」", win("a", "rest", 176))}
      ${fr("正在打字", "卡向上长，线不受影响", win("a", "type", 236))}
      ${fr("点了「定稿公告」", "它在线上描边；内容到了输入框第一行", win("a", "focus", 196))}
    </div>
  </section>

  <section class="d-sec" id="c">
    <h2>丙 · 没有线，只有输入框和两句话</h2>
    <p>一行，64 高。左边是事项名和两个数字，右边是下一件。等你的事不用找，它自己出现在输入框的第一行。别的都在清单里。</p>
    <div class="d-fit">
      ${fr("静止，有一件等你", "等你的那件自己到了输入框第一行；同时有几件就一件一件来", win("c", "rest", 170))}
      ${fr("静止，没有等你的", "框上什么都没有", win("c", "quiet", 150))}
      ${fr("正在打字", "两边没有要让的东西", win("c", "type", 210))}
    </div>
  </section>

  <section class="d-sec" id="list">
    <h2>清单：三个方向共用</h2>
    <p>点事项名或任何一个数字，打开的都是这一张：这件事项的全部事件按四个状态分组，下面是换一件事。事项和事件的关系在这里是「标题和它下面的行」。</p>
    <div class="d-fit">
      ${fr("乙里点开", "点一行，等于点线上那一件", win("b", "list", 560))}
    </div>
  </section>

  <section class="d-sec" id="pick">
    <h2>三个方向放在一起</h2>
    ${table(["", "甲 · 线在底边", "乙 · 线穿过输入框", "丙 · 只有输入框"], [
      ["常年在屏上的", "事项，办完三件，在办，等你，接下来三件", "事项，在办，等你，下一件；其余是数字", "事项，两个数字，下一件；等你的自己到框上"],
      ["底部高度", "90（两行）", "64（一行）", "64（一行）"],
      ["打字时", "线不动", "两翼让出地方、变淡", "没有要让的"],
      ["窄窗口", "办完和接下来先收成数字", "退成丙", "不变"],
      ["事项和事件", "一整条都看得见", "看得见现在这一段，其余点开", "点开清单才看得见"],
      ["代价", "最高也最满；线和输入框是分开的两样", "办完的不点名，要看得点开", "线没有了；在办的不点名"],
    ], "cmp")}
    <p class="d-ask">我推荐乙：屏上常年只有现在要管的几件，底部只占一行，窄窗口有明确的退路。请你挑一个方向（也可以说「乙的线，加上丙那样等你的事自己上来」这种混搭），我再往下做细和做可点的。你说的「其他的一些问题」，也请直接列出来，我一起收进去。</p>
  </section>`;

  const fit = () => document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / 1440)));
  fit(); window.addEventListener("resize", fit);
  const setTheme = (theme) => { document.documentElement.dataset.resolvedTheme = theme; document.documentElement.dataset.theme = theme; $("#theme").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === theme))); };
  $("#theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setTheme(b.value); });
  const q = new URLSearchParams(location.search);
  setTheme(q.get("theme") || "light");
  if (q.get("only")) { document.querySelectorAll(".d-sec").forEach((s) => { if (s.id !== q.get("only")) s.hidden = true; }); }
})();
