/* 输入框是切换专注的把手：静态画面，只为对一遍理解和骨架；不是产品代码。 */
(() => {
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const I = (n, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const $ = (s) => document.querySelector(s);
  const G = (g) => (g === "done" ? I("check", "xs dg done") : `<i class="dg ${g}"></i>`);
  const K = (n, c = "", t = "") => `<span class="dc-k ${c}"${t ? ` title="${t}"` : ""}>${I(n, "s")}</span>`;
  const act = (t, pri) => `<span class="dc-act${pri ? " pri" : ""}">${t}</span>`;
  const chip = (icon, t) => `<span class="dc-chip">${I(icon, "xs")}<span class="cut">${t}</span>${I("x", "xs x")}</span>`;

  /* 焦点签：输入框上沿的一枚签，写着现在专注在哪 */
  const fl = (topic, e) => `<span class="fl"><b>${topic}</b>${e ? `${I("chevron-right", "xs sep")}${G(e.g)}<span class="nm cut">${e.nm}</span>` : ""}${I("chevron-down", "xs")}</span>`;
  const wait = (n, t = "等你") => (n ? `<span class="fn">${G("you")}${t} ${n}${I("chevron-right", "xs")}</span>` : "");
  const strip = (o) => `<div class="fu-top">${fl(o.topic || "发布 v2.3", o.e)}<span class="grow"></span>${wait(o.wait, o.waitWord)}</div>`;

  /* 接续行：输入框里最上面的一行，只在有下一步时出现 */
  const A = {
    you: `<div class="dc-a">${G("you")}<span class="say ink cut">标题用「更快的发布」还是「v2.3 来了」？</span>${act("用第一个", 1)}${act("用第二个")}${K("chevron-up", "sm", "展开对话")}</div>`,
    done: `<div class="dc-a">${G("done")}<span class="say cut">定稿公告办好了。</span>${act("下一件等你的：核对定价页截图", 1)}${act("回到「发布 v2.3」")}</div>`,
    step: `<div class="dc-a">${G("run")}<span class="say ink cut">第 2 步做完了。接着做下一步？</span>${act("接着做", 1)}${act("先停")}${K("chevron-up", "sm", "展开对话")}</div>`,
    back: `<div class="dc-a">${I("check", "s t-g")}<span class="say ink cut">模型已连接。</span>${act("回到「修登录回归」接着做", 1)}${K("x", "sm", "不用了")}</div>`,
    reply: `<div class="dc-a">${I("sparkles", "s t-b")}<span class="say ink cut">已开始：先跑回归测试，再出更新日志，大约 6 分钟。</span>${K("chevron-up", "sm", "展开对话")}</div>`,
    recent: `<div class="dc-a">${I("history", "s")}<span class="say cut">上次停在「整理访谈纪要」第 3 段。</span>${act("继续", 1)}${K("x", "sm", "不用了")}</div>`,
    fail: `<div class="dc-a">${I("circle-alert", "s t-r")}<span class="say ink cut">没发出去，网络断了。</span>${act("再试一次", 1)}</div>`,
  };
  const cap = (o = {}) => {
    const a = o.a ? A[o.a] : "";
    const foot = o.text ? `<div class="dc-foot">${K("plus", "", "带上东西")}${(o.chips || []).join("")}<span class="grow"></span>${o.way ? `<span class="dc-who way">${o.way}${I("chevron-down", "xs")}</span>` : ""}${o.scene ? `<span class="dc-who">${o.scene}${I("chevron-down", "xs")}</span>` : ""}${K("mic", "", "语音")}${K("send", "send", "发送")}</div>` : "";
    const body = o.text ? `<div class="dc-text">${o.text}<i class="caret"></i></div>${foot}` : o.find !== undefined ? `<div class="dc-row">${K("search")}<span class="dc-ph${o.find ? " ink" : ""}">${o.find || "切到哪件事？输入名字筛选"}${o.find ? `<i class="caret"></i>` : ""}</span><span class="fk">↑↓ 选　↵ 切换　Esc 回到输入</span></div>` : `<div class="dc-row">${K("plus", "", "带上东西")}<span class="dc-ph">${o.ph || "说一句，或输入 / 开始一件事"}</span>${K("mic", "", "语音")}${o.stop ? `<span class="dc-k send stop" title="停下"><i class="sq"></i></span>` : K("send", "send dim", "发送")}</div>`;
    return `<div class="fu">${o.nostrip ? "" : strip(o)}${o.above || ""}<div class="dc${o.text ? " open" : ""}${a ? " has-a" : ""}">${a}${body}</div></div>`;
  };

  /* 切换器：从输入框向上展开；这时输入框是筛选框 */
  const row = (g, nm, w, o = {}) => `<div class="dl-r${o.on ? " on" : ""}">${g ? G(g) : I(o.icon || "folder", "xs")}<span class="nm cut">${nm}</span><small class="${o.cls || ""}">${w}</small></div>`;
  const sw = `<div class="fs">
    <div class="dl-g">这件事项里</div>
    ${row("you", "定稿公告", "等你定", { on: 1, cls: "you" })}${row("you", "核对定价页截图", "等你看", { cls: "you" })}${row("run", "生成更新日志", "第 2 步")}${row("run", "修登录回归", "Coding · 在跑")}${row("next", "发布评审", "15:00")}
    <div class="dl-g fold">${I("chevron-right", "xs")}办完 <em>4</em></div>
    <div class="dl-sep"></div>
    <div class="dl-g">别的事项</div>
    ${row("", "定价页改版", "1 件等你", { cls: "you" })}${row("", "用户访谈整理", "上次停在第 3 段")}
    <div class="dl-sep"></div>
    <div class="fs-foot"><span>${I("plus", "xs")}新建事项</span><span>不选事项</span><span>整理主线</span><span class="grow"></span><span class="fk">快捷键（示意）：⌘J 打开　⌘] 下一件等你的</span></div>
  </div>`;

  /* 一幅：窗口最下面一截，纸上写着主区现在是什么 */
  const sheet = (t, sub) => `<div class="d-sheet fx"><b>${t}</b><small>${sub}</small><i style="width:34%"></i><i style="width:58%"></i><i style="width:47%"></i></div>`;
  const tail = `<span class="dt"><span class="dt-k" title="后台任务">${I("activity", "s")}<em>2</em></span><span class="dt-k" title="展开对话">${I("chevron-up", "s")}</span></span>`;
  const near = (g, nm) => `<span class="dv ${g}">${G(g)}<span class="nm cut">${nm}</span></span>`;
  const win = (o) => `<div class="d-win sp-ui" style="height:${o.h}px;--bar:${o.bar || 88}px">${sheet(o.page, o.sub)}<div class="db fx" style="--mid:${o.mid || 560}px"><div class="dw l plain">${o.left || ""}</div><div class="dmid">${o.cap}</div><div class="dw r plain">${o.right || ""}${tail}</div></div></div>`;
  const fr = (t, note, html) => `<div class="d-fr"><h4>${t}<small>${note}</small></h4>${html}</div>`;
  const tile = (t, note, html, h = 150) => `<div class="d-fr"><h4>${t}<small>${note}</small></h4><div class="d-tile sp-ui" style="height:${h}px">${html}</div></div>`;
  const rules = (arr) => `<div class="ln-rules">${arr.map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join("")}</div>`;
  const table = (hd, rows, cls = "") => `<table class="ln-count ${cls}"><thead><tr>${hd.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

  const E = { you: { g: "you", nm: "定稿公告" }, run: { g: "run", nm: "生成更新日志" }, code: { g: "run", nm: "修登录回归" }, done: { g: "done", nm: "定稿公告" } };

  $("#frames").innerHTML = `
  <section class="d-sec" id="top">
    <h2>骨架（用户 2026-11-16 认可，下面是静态的逐幅说明）</h2>
    <p>底部不必是一条事件流。底部居中的输入框是「我现在专注在哪件事」的把手：在它上面一下就能换事项、换事件，换了以后主区、标签、右侧和助理的范围跟着换，人就在那件事里处理和工作。输入框里面只打字；发给谁、带上什么、接着做什么这些都要有位置，但都不和字抢同一行。下面四条是这一稿的骨架。</p>
    ${rules([
      ["焦点签：我在哪", "输入框上沿左边的一枚签，写着「事项 › 事件」。它就是发给谁、说的是哪件事。没选事件时只有事项名，没选事项时是项目名。"],
      ["输入框就是切换器", "点焦点签或按快捷键，清单从输入框向上展开，输入框这时是筛选框：打两个字、上下选、回车就切过去。不另开一个弹窗。"],
      ["接续行：接着做什么", "输入框里最上面的一行，只在有下一步时出现。它问你的话、它的回应、办完以后的下一件、从设置回来接着做，都在这一行，一次一件。"],
      ["两边不放事件流", "右上角「等你 N」一点就到下一件等你的。两边只剩后台任务和展开对话。办完的、接下来的都在清单里。"],
    ])}
  </section>

  <section class="d-sec" id="rest">
    <h2>平常：专注在一件事项上</h2>
    <p>焦点签写着事项名。输入框里只有 ＋、字、语音、发送。说的话默认进这件事项，由助理接。</p>
    <div class="d-fit">
      ${fr("平常", "底部一共这几样：焦点签、等你 2、输入框、后台任务、展开", win({ h: 230, page: "发布 v2.3", sub: "事项的第一页", cap: cap({ wait: 2 }) }))}
    </div>
  </section>

  <section class="d-sec" id="switch">
    <h2>切换：点焦点签，或按快捷键</h2>
    <p>清单从输入框向上长出来，和输入框一样宽。先列这件事项里的事件（等你的在最前，然后在办的、接下来的），再列别的事项。输入框这时是筛选框。回车切过去，Esc 回到刚才打了一半的字。</p>
    <div class="d-fit">
      ${fr("切换器开着", "清单内容照主线 §4.1 的列表菜单；这里把事项里的事件也放进了同一张", win({ h: 600, page: "发布 v2.3", sub: "事项的第一页", cap: cap({ wait: 2, find: "", above: sw }) }))}
    </div>
  </section>

  <section class="d-sec" id="work">
    <h2>专注处理：切到一件事件</h2>
    <p>主区换成这件事的对象页，焦点签多出「› 事件名」，输入框说的话就是对它说的。它要你定的那一句在接续行，可以直接点，也可以回一句。</p>
    <div class="d-fit">
      ${fr("切到了「定稿公告」（等你定）", "主区打开了它的文稿；接续行是它问的话和两个按钮", win({ h: 270, bar: 128, page: "定稿公告", sub: "文稿 · 发布 v2.3", cap: cap({ e: E.you, wait: 1, waitWord: "还有", a: "you", ph: "回它一句" }) }))}
      ${fr("切到了一个在跑的 Coding 会话", "同一个输入框，发给这个会话；没打字时发送键是停下", win({ h: 230, page: "修登录回归", sub: "Coding 会话 · 发布 v2.3", cap: cap({ e: E.code, wait: 2, ph: "补充一句，它会在这一步之后读到", stop: 1 }) }))}
    </div>
  </section>

  <section class="d-sec" id="next">
    <h2>接续：办完一件，接着哪一件</h2>
    <p>接续行一次只说一件事。办完以后它给出下一件等你的，点一下焦点就过去了，不用回清单里找。</p>
    <div class="d-fit">
      ${fr("定完了", "接续行给出下一件；点了以后焦点签、主区一起换过去", win({ h: 270, bar: 128, page: "定稿公告", sub: "文稿 · 发布 v2.3", cap: cap({ e: E.done, wait: 1, waitWord: "还有", a: "done" }) }))}
      <div class="d-two">
        ${tile("它做完一步，问要不要接着做", "交办时开了「每步先问我」", cap({ nostrip: 1, a: "step", ph: "或者说怎么改" }))}
        ${tile("从设置回来", "草稿与返回的「接着做」", cap({ nostrip: 1, a: "back" }))}
        ${tile("刚发出", "它回的第一句；细看点右边展开对话", cap({ nostrip: 1, a: "reply", ph: "接着说" }))}
        ${tile("空白的新对话", "「继续最近的工作」", cap({ nostrip: 1, a: "recent" }))}
      </div>
    </div>
  </section>

  <section class="d-sec" id="type">
    <h2>打字：字占满一行，别的在最后一行</h2>
    <p>开始打字，卡向上长。最后一行左边是这次带上的（手上的东西、落点、材料），右边是这个对象自己的选项收成的一个词、语音、发送。它在办而你又打了字，才多一个「作为补充 ⌄」。</p>
    <div class="d-fit">
      ${fr("在 Coding 会话里打字", "场景选项（任务方式、模型）收成一个词，点开才展开", win({ h: 300, bar: 150, mid: 640, page: "修登录回归", sub: "Coding 会话 · 发布 v2.3", cap: cap({ e: E.code, text: "登录页的回归先别修，等评审完再说；先把失败的三条用例列出来", chips: [chip("code", "选中的 12 行 · auth.ts"), chip("paperclip", "材料 2")], way: "作为补充", scene: "只讨论" }) }))}
    </div>
  </section>

  <section class="d-sec" id="map">
    <h2>原始方案里输入框周围的每种交互，放在哪</h2>
    ${table(["交互", "出处", "这一稿放在哪"], [
      ["发给谁、这句话属于哪件事", "统一输入 §10.2「发给」；主线 §4.3「在：发布 v2」", "焦点签。不再有框里的「发给」片"],
      ["切换事项、切换事件", "主线 §4.1 切换器；事项线 §4.4 点事件", "焦点签点开，输入框变筛选框；「等你 N」一点到下一件"],
      ["它问你、等你确认、选项、打开结果、再试一次", "情境动线 §21.2 第 2 条「下一步」", "接续行"],
      ["接着做下一步？", "事项线「每步先问我」（2026-11-15）", "接续行"],
      ["从设置或连接回来，接着做那一步", "草稿与返回「接着做」", "接续行"],
      ["继续最近的工作、从这一页开始", "情境动线 §21.2 第 3 条", "接续行，只在空白的新对话里"],
      ["发送中、没发出、待确认", "统一输入 §4", "接续行"],
      ["这次带上的：手上的东西、落点、材料、下一轮带上", "情境动线 §21.2 第 1 条；统一输入 §10.2", "最后一行左边的片，打字时出现"],
      ["场景选项：任务方式、模型、角色", "统一输入 §10.2「场景控件」", "最后一行右边的一个词，点开才展开"],
      ["补充、打断并改向、下一轮再做；暂停、停下", "输入回执 §4.1", "它在办又打了字时，最后一行多一个词；没打字时发送键是停下"],
      ["语音", "统一输入 §6", "发送键左边，一直在"],
      ["每条输入的回执", "输入回执 §4.2", "在对话里，不占输入框（照原方案）"],
      ["后台任务、展开对话", "事项线 §4.5", "底部最右"],
    ], "map")}
  </section>

  <section class="d-sec" id="ask">
    <h2>我先按这些做了，你可以改</h2>
    ${table(["细则", "这一稿的做法", "别的做法"], [
      ["切到一件事件时主区", "跟着打开它的对象页", "只在对话框里开成标签（事项线 §4.4 现行）"],
      ["输入框宽度", "不随打字变：跟前台页面的对话栏同宽（统一输入 §10.2），1180 以上 640，以下 560", "打字时变宽"],
      ["两边", "空着；原型右上角可以切到「最近切过的两件」对比", "常年放最近切过的"],
      ["草稿", "跟着焦点走：切走留在原处，切回来还在；清单里有草稿的那一行会标出来", "全局一份"],
      ["「等你 N」数什么", "只数这件事项里的；这里没有而别处有时写「别处等你 N」，点它打开清单，不替你换事项", "数整个项目的，点了直接跳过去"],
      ["别处来了等你的事", "数字加一、闪一下，不动你的焦点和输入框", "接续行里插一句"],
      ["底部高度", "88（焦点签 26、输入框 44、上下边）", "焦点签放到输入框左边、保持 68"],
      ["快捷键", "⌘J 打开切换器，⌘] 到下一件等你的（示意，没定）", ""],
    ], "map")}
  </section>`;

  const fit = () => document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / 1440)));
  fit(); window.addEventListener("resize", fit);
  const setTheme = (theme) => { document.documentElement.dataset.resolvedTheme = theme; document.documentElement.dataset.theme = theme; $("#theme").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === theme))); };
  $("#theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setTheme(b.value); });
  const q = new URLSearchParams(location.search);
  setTheme(q.get("theme") || "light");
  if (q.get("only")) { const ids = q.get("only").split(","); document.querySelectorAll(".d-sec").forEach((s) => { if (!ids.includes(s.id)) s.hidden = true; }); }
})();
