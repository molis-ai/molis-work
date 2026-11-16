// 逐屏打磨第一轮的高保真样稿：二十二张静态图。只拼版面，不是产品代码。
(() => {
  document.getElementById("icons").innerHTML = window.mwKitSprite;
  const ic = (n, c = "") => `<svg class="${c}" aria-hidden="true"><use href="#icon-${n}"></use></svg>`;
  const ib = (n, c = "") => `<span class="sp-ib ${c}">${ic(n)}</span>`;
  const btn = (label, v = "secondary", icon = "") => `<span class="mw-btn mw-btn--${v} mw-btn--sm" data-slot="button">${icon ? ic(icon, "s") : ""}<span data-slot="button-label">${label}</span></span>`;
  const sw = (on) => `<label class="mw-switch"><input type="checkbox"${on ? " checked" : ""}><span class="mw-switch__track"></span></label>`;

  // 顶部栏：托盘（当前那片带名字）｜页签（只放对象）｜＋ …… 一个侧边开关、布局、项目
  const PINS = [["home", "项目首页"], ["target", "Goals"], ["inbox", "Inbox"], ["rss", "Feed"]];
  // 页签：[名字, 状态, 插件图形, 是否新的一组]；状态 true 是当前，"soft" 是没焦点那一栏的当前；{ chip: [图形, 数] } 是收起的一组
  const tabsHtml = (tabs) => tabs.map((t) => t.chip ? `<span class="sp-tabchip">${ic(t.chip[0], "s")}${t.chip[1]}</span>`
    : `${t[3] ? `<span class="sp-gap"></span>` : ""}<span class="sp-tab${t[1] === true ? " cur" : t[1] === "soft" ? " soft" : ""}">${t[2] ? ic(t[2], "s") : ""}<span class="cut">${t[0]}</span><span class="x">${ic("x", "xs")}</span></span>`).join("");
  const tray = ({ cur, extra, closable = false, other = "" }) => `<span class="sp-tray">${PINS.map(([icon, name]) => name === cur ? `<span class="sp-pin cur">${ic(icon)}${name}</span>` : `<span class="sp-pin${name === other ? " other" : ""}" title="${name}">${ic(icon)}</span>`).join("")}${extra ? `<span class="sp-pin cur">${ic(extra[0])}${extra[1]}${closable ? `<span class="x">${ic("x", "xs")}</span>` : ""}</span>` : ""}</span>`;
  const tools = (side = false) => `<span class="sp-side${side ? " on" : ""}">${ic("note")}项目资料${ic("chevron-down", "xs")}</span>${ib("columns")}<span class="sp-mono">目</span>`;
  const top = ({ cur, extra, tabs = [], plus = false, side = false, closable = false, more = 0 }) => `<div class="sp-top">${ib("chevron-left")}${ib("chevron-right", "dim")}
      ${tray({ cur, extra, closable })}<span class="sp-sepv"></span>${tabsHtml(tabs)}${more ? `<span class="sp-tabchip">+${more}</span>` : ""}${ib("plus", plus ? "on" : "")}
      <span class="grow"></span>${tools(side)}</div>`;
  const topSplit = ({ cur, extra, other, left, right }) => `<div class="sp-top split"><div>${ib("chevron-left")}${ib("chevron-right", "dim")}${tray({ cur, extra, other })}<span class="sp-sepv"></span>${tabsHtml(left)}${ib("plus")}</div>
      <div>${tabsHtml(right)}${ib("plus")}<span class="grow"></span>${tools()}</div></div>`;

  // 事项线：线头｜做过的和在办的｜输入框（位置和宽度不变）｜接下来
  const ev = (cls, icon, name, fact = "", tail = "") => `<span class="sp-ev ${cls}">${ic(icon, "s")}<span class="cut">${name}</span>${fact ? `<small>${fact}</small>` : ""}${tail}</span>`;
  const DONE = `<span class="tail" style="display:grid">${ic("check", "s")}</span>`;
  const MORE = (n) => `<span class="sp-ev more">+${n}</span>`;
  const line = ({ to = ["sparkles", "助理"], toX = false, mode = "", text = "", ph = "说点什么，或输入 / 找动作…", open = false }) => `<div class="sp-line">
    <div class="sp-wing"><span class="sp-head">${ic("folder", "s")}目录交互验证<span class="n">1</span><span class="ch" style="display:grid">${ic("chevron-down", "xs")}</span></span>
      <span class="sp-seg long"></span>${MORE(4)}<span class="sp-seg"></span>${ev("wait", "code", "发布说明按版本分节", "等你")}</div>
    <div class="sp-cap"><span class="b">${ic("plus")}</span><span class="sp-to">${ic(to[0], "s")}<span class="cut">${to[1]}</span>${ic(toX ? "x" : "chevron-down", "xs")}</span>${mode ? `<span class="sp-mode">${mode}${ic("chevron-down", "xs")}</span>` : ""}
      ${text ? `<span class="tx cut">${text}<i class="sp-caret"></i></span>` : `<span class="ph cut">${ph}</span>`}<span class="b ${text ? "go" : "rest"}">${ic("send")}</span></div>
    <div class="sp-wing">${ev("", "check", "给王总回电话", "今天")}<span class="sp-seg"></span>${open ? `${ev("", "check", "发布前检查链接", "今天")}<span class="sp-seg"></span>${MORE(1)}` : `${MORE(2)}<span class="grow"></span><span class="sp-tasks" title="后台任务">${ic("activity")}2</span>${ib("chevron-up")}`}</div></div>`;

  const win = (topHtml, stage, lineHtml, over = "") => `<div class="sp-fit"><div class="sp-win">${topHtml}<div class="sp-stage">${stage}</div>${lineHtml}${over}</div></div>`;

  // Coding：目录列 + 一轮结束的对话
  const srow = (name, tail, cur = false) => `<div class="sp-row${cur ? " cur" : ""}"><span class="cut grow">${name}</span>${tail}</div>`;
  const codingMain = (lead = "") => `    <div class="sp-main">
      <div class="sp-mainhd">${lead}<div class="grow"><h1 class="cut">formatNotes 空列表处理</h1><div class="sub">${ic("git-branch", "xs")}release-notes · main</div></div>
        <div class="mw-toggle-group" data-slot="toggle-group" data-seg-thumb role="group"><button type="button" class="mw-toggle" aria-pressed="true">对话</button><button type="button" class="mw-toggle" aria-pressed="false">任务图</button></div>
        ${ib("more")}<span class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button"><span data-slot="button-label">结果与审查</span><span class="sp-count">2</span></span></div>
      <div class="sp-scroll"><div class="sp-col">
        <div class="sp-me">formatNotes 在提交列表为空时会输出只有标题的段落，改成返回空字符串，并补上测试。</div>
        <div class="sp-fold">${ic("check", "s ok")}<span class="grow cut">准备就绪 · 仓库 release-notes · 依赖已装 · 2 份参考材料</span>${ic("chevron-right", "xs")}</div>
        <p>已经改好。空列表现在直接返回空字符串，其余行为不变；补了两条测试，都通过。</p>
        <pre class="sp-code"><span> export function formatNotes(commits: readonly Commit[]): string {</span><span class="plus">+  if (commits.length === 0) return "";</span><span>   return commits.map(commit =&gt; \`- \${commit.subject}\`).join("\\n");</span><span> }</span></pre>
        <div class="sp-files">
          <div class="sp-file"><span class="sp-kind">TS</span><span class="grow cut">src/release.ts</span><span class="sp-add">+2</span><span class="sp-del">−0</span></div>
          <div class="sp-file"><span class="sp-kind">TS</span><span class="grow cut">tests/release.test.ts</span><span class="sp-add">+14</span><span class="sp-del">−0</span></div>
        </div>
        <div class="sp-fold">${ic("list", "s")}<span class="grow cut">读了 3 个文件，改了 2 个，跑了 1 次测试</span>${ic("chevron-right", "xs")}</div>
        <div class="sp-end">${ic("status-done")}<b>本轮结束</b><span class="grow cut">42 秒 · 改了 2 个文件 +16 −0 · 测试 2 条通过</span>${btn("执行报告", "ghost")}${btn("看改动", "primary")}</div>
      </div></div>
    </div>`;
  const coding = `<div class="sp-sheet">
    <div class="sp-dir">
      <div class="sp-dirhd"><span class="grow">会话</span>${ib("search")}${ib("plus")}</div>
      <div class="sp-dirtabs"><span class="named">${ic("message", "s")}会话</span>${ib("folder")}${ib("git-compare")}${ib("flask")}</div>
      <div class="sp-glabel">发布 v2.3</div>
      ${srow("formatNotes 空列表处理", `<span class="sp-dot g"></span>`, true)}
      ${srow("发布说明按版本分节", `<span class="sp-you">等你</span>`)}
      ${srow("补 release.ts 的边界测试", `<small>第 2 步</small><span class="sp-dot b"></span>`)}
      <div class="sp-glabel">未关联 Goal</div>
      ${srow("清理旧的发布脚本", `<span class="sp-dot"></span>`)}
      ${srow("升级 tsx 到 4.x", `<span class="sp-dot"></span>`)}
      ${srow("CHANGELOG 链接检查", `<span class="sp-dot"></span>`)}
      <span class="grow"></span>
      <div class="sp-row" style="color:var(--muted);font-size:12px">${ic("archive", "s")}<span class="grow">已归档</span><small>12</small>${ic("chevron-right", "xs")}</div>
    </div>
    ${codingMain()}</div>`;

  // 首页：只作对话框和浮层的底
  const hrow = (name, fact, tail = "") => `<div class="sp-hrow"><b class="cut">${name}</b><span class="grow cut">${fact}</span>${tail}</div>`;
  const home = `<div class="sp-sheet"><div class="sp-home"><div class="in">
    <div class="place">项目首页</div><h1>目录交互验证</h1>
    <h2>该你了</h2>${hrow("发布说明按版本分节", "Coding 给了两个方案，等你选", `<span class="sp-you">等你</span>`)}
    <h2>接着做</h2>${hrow("补 release.ts 的边界测试", "Coding · 第 2 步，共 4 步")}${hrow("发布 v2.3", "Goals · 5 项里完成 3 项")}
    <h2>接下来</h2>${hrow("给王总回电话", "待办 · 今天")}${hrow("发布前检查链接", "待办 · 今天")}${hrow("准备周会材料", "待办 · 明天")}
    <h2>各处动态</h2>${hrow("Inbox", "3 封新邮件，1 封提到你")}${hrow("Feed", "订阅源更新 12 条")}${hrow("讨论", "「定价页文案」有 2 条新回复")}${hrow("Pages", "「v2.3 发布说明」昨天改过")}
  </div></div></div>`;

  // 对话框头：页签在左，右边三个键
  const dhead = (tabs, tasksOn = false) => `<div class="sp-dlghd">${tabs.map(([icon, name, on, x]) => `<span class="sp-dtab${on ? " cur" : ""}">${ic(icon, "s")}${name}${x ? `<span class="x" style="display:grid">${ic("x", "xs")}</span>` : ""}</span>`).join("")}${ib("plus")}<span class="grow"></span>
    <span class="sp-tasks${tasksOn ? " on" : ""}">${ic("activity")}2</span>${ib("more")}${ib("chevron-down")}</div>`;

  const dialog = `<div class="sp-dlg" style="width:680px">${dhead([["sparkles", "主对话", true], ["check", "给王总回电话", false, true]])}
    <div class="sp-dbody"><div class="sp-talk">
      <div class="sp-me">看一下发布说明现在是怎么写的，有什么问题</div>
      <p>我读了 <code>src/release.ts</code> 和它的测试，结论如下。</p>
      <h3>现状</h3>
      <ul><li>发布说明写进 <code>CHANGELOG.md</code>，没有按版本分节。</li><li><code>formatNotes()</code> 没有处理空提交列表，会输出一个只有标题的段落。</li></ul>
      <h3>建议的改法</h3>
      <ol><li>给 <code>formatNotes()</code> 加一个空列表分支，直接返回空字符串。</li><li>按 <code>## vX.Y.Z</code> 分节写入，旧内容保留在下面。</li></ol>
      <pre class="sp-code"><span>export function formatNotes(commits: readonly Commit[]): string {</span><span class="plus">  if (commits.length === 0) return "";</span><span>  return commits.map(commit =&gt; \`- \${commit.subject}\`).join("\\n");</span><span>}</span></pre>
      <p>要我直接改并补上测试吗？</p>
      <div class="sp-chips"><span class="sp-chip">直接改，并补上测试</span><span class="sp-chip">只改，不补测试</span><span class="sp-chip">${ic("code", "s")}交给 Coding 开一个会话</span></div>
    </div></div></div>`;

  const task = (name, fact, o = {}) => `<div class="sp-task${o.done ? " done" : ""}"><div class="t"><span class="cut grow">${name}</span>${o.btn ?? ""}</div><div class="f${o.you ? " you" : ""}">${fact}</div>${o.pct ? `<div class="sp-bar"><i style="width:${o.pct}%"></i></div>` : ""}</div>`;
  const eventDialog = `<div class="sp-dlg" style="width:720px">${dhead([["sparkles", "主对话", false], ["check", "给王总回电话", true, true]], true)}
    <div class="sp-dbody"><div class="sp-talk">
      <div class="sp-evcard">
        <div class="src"><span class="sp-own">${ic("check", "s")}</span>待办<span class="mw-badge mw-badge--neutral" data-slot="badge">计划今天</span><span class="grow"></span>${ib("pin")}</div>
        <h3>给王总回电话</h3>
        <p>问预算</p>
        <div class="sp-facts"><span>${ic("calendar", "s")}今天 · 11 月 15 日</span><span>${ic("folder", "s")}目录交互验证</span></div>
        <div class="sp-acts">${btn("勾掉", "primary", "check")}${btn("改到明天")}<span class="grow"></span>${btn("打开待办", "ghost", "external")}</div>
      </div>
      <p class="sp-hint">关于这件事，可以直接在下面说。</p>
      <div class="sp-chips"><span class="sp-chip">帮我列三个要问的预算问题</span><span class="sp-chip">把通话要点记进这条待办</span></div>
    </div>
    <div class="sp-drawer"><h4>后台任务<span class="sp-count">2</span></h4>
      ${task("查竞品定价", "等你选范围", { you: true, btn: btn("去选") })}
      ${task("整理访谈纪要", "第 3 步，共 5 步 · 正在归类", { pct: 60 })}
      ${task("生成周报草稿", "已完成 · 14:02", { done: true })}
    </div></div></div>`;

  // 起始页与侧边菜单
  const prow = (icon, name) => `<div class="sp-prow">${ic(icon)}<span>${name}</span></div>`;
  const start = `<div class="sp-pop" style="left:258px;width:560px">
    <div class="sp-search">${ic("search")}找插件或动作…<kbd>⌘K</kbd></div>
    <div class="sp-plabel">最近</div>
    <div class="sp-recent"><span>${ic("code", "s")}Coding</span><span>${ic("check", "s")}待办</span><span>${ic("file", "s")}Pages</span><span>${ic("message", "s")}讨论</span></div>
    <div class="sp-plabel">做事</div>
    <div class="sp-grid"><div class="sp-prow sel">${ic("code")}<span><b style="font-weight:500">Coding</b><span class="d" style="display:block">和 Agent 一起写代码，改动先给你看。</span></span><span class="k">${ic("pin", "s")}留用　↵ 打开</span></div>
      ${prow("check", "待办")}${prow("file", "Pages")}${prow("workflow", "工作流")}${prow("presentation", "演示")}</div>
    <div class="sp-plabel">收和看</div>
    <div class="sp-grid">${prow("library", "Shelf")}${prow("idea", "灵光")}${prow("globe", "浏览器")}${prow("database", "知识库")}</div>
    <div class="sp-plabel">一起</div>
    <div class="sp-grid">${prow("message", "讨论")}${prow("circle-alert", "Issue")}${prow("shield", "风险")}${prow("calendar", "日程")}</div>
    <div class="sp-pfoot"><span>↑↓ 选择　↵ 打开　⌘↵ 在右侧打开</span><span>插件市场 ›</span></div></div>`;
  const SIDE = [["library", "Shelf"], ["idea", "灵光"], ["note", "项目资料", true], ["globe", "浏览器"], ["frame", "电脑"], ["message", "讨论"], ["circle-alert", "Issue"], ["shield", "风险"]];
  const sideMenu = `<div class="sp-pop" style="right:56px;width:208px;padding:6px">${SIDE.map(([icon, name, on]) => `<div class="sp-prow">${ic(icon)}<span>${name}</span>${on ? `<i class="tick">${ic("check", "s")}</i>` : ""}</div>`).join("")}
    <div class="sp-pfoot" style="margin-top:4px"><span>收起侧边</span><span>⌘\\</span></div></div>`;

  // 设置页
  const CATS = [["本机", [["sun", "界面与语言"], ["folder", "本机目录"]]], ["个人", [["bookmark", "记忆"], ["database", "工作记录"], ["network", "同步"]]], ["AI", [["key", "模型设置"], ["message", "助理"], ["user", "角色"], ["sparkles", "能力包"]]],
    ["工具与接入", [["terminal", "AI 与执行工具"], ["book", "能力库"], ["link", "服务连接"], ["shield", "对外接入"], ["history", "调用记录"]]], ["系统", [["refresh", "更新"], ["activity", "诊断"]]], ["插件", [["code", "Coding"], ["library", "Shelf"]]]];
  const cats = (cur) => `<div class="sp-cats"><div class="hd">${ic("settings")}设置<span class="grow"></span>${ib("search")}</div>${CATS.map(([g, rows]) => `<div class="sp-glabel">${g}</div>${rows.map(([icon, name]) => `<div class="sp-row${name === cur ? " cur" : ""}">${ic(icon, "s")}<span class="cut grow">${name}</span></div>`).join("")}`).join("")}</div>`;
  const set = (name, desc, control) => `<div class="sp-set"><div class="l"><b>${name}</b><span>${desc}</span></div>${control}</div>`;
  const sel = (label) => `<span class="sp-sel">${label}${ic("chevron-down", "s")}</span>`;
  const QUIET = [["Coding", 1], ["Pages", 1], ["讨论", 1], ["Goals"], ["Inbox"], ["Feed"], ["待办"], ["Shelf"], ["灵光"], ["Issue"], ["风险"], ["浏览器"], ["工作流"], ["演示"]];
  const settingsAssistant = `<div class="sp-sheet">${cats("助理")}<div class="sp-doc"><div class="in">
    <h1>助理</h1><p class="lead">助理什么时候提醒你、怎么回应。在所有项目里生效。</p>
    <h2>提醒</h2>
    ${set("有事等你时提醒", "任务要你决定或确认时，在事项线上提醒一次。", sw(true))}
    ${set("任务办完时提醒", "放到后台的任务结束后告诉你结果。", sw(true))}
    <div class="sp-set" style="border-bottom-color:transparent"><div class="l"><b>不提醒的地方</b><span>在这些插件里专心做事时不打断，等你的事仍会记在线头的计数里。</span></div><span class="sp-sel">3 处${ic("chevron-up", "s")}</span></div>
    <div class="sp-open">${QUIET.map(([name, on]) => `<span class="sp-choice${on ? " on" : ""}">${on ? ic("check", "xs") : ""}${name}</span>`).join("")}</div>
    <h2>回应</h2>
    ${set("回复语言", "不选时跟界面语言走。", sel("跟随界面"))}
    ${set("动手前先问我", "助理改文件、发消息之前停下来等你同意。", sw(false))}
    ${set("带上我正在看的内容", "发话时把当前页面作为上下文附上，发出前可以去掉。", sw(true))}
    <h2>默认</h2>
    ${set("新工作交给谁", "没有指定收件人时由谁来办。", sel("助理"))}
    ${set("本会话记忆", "这次对话里助理记下的事。", btn("查看"))}
  </div></div></div>`;
  const obj = (icon, name, sub, st, open = false) => `<div class="sp-obj${open ? " open" : ""}"><span class="tile">${ic(icon)}</span><div class="l"><b>${name}</b><span class="cut">${sub}</span></div>${st}<span class="ch">${ic(open ? "chevron-up" : "chevron-right", "s")}</span></div>`;
  const ok = `<span class="st"><span class="sp-dot g"></span>可用</span>`;
  const q = (k, v, a = "") => `<div class="sp-q"><dt>${k}</dt><dd class="cut">${v}</dd>${a}</div>`;
  const settingsRuntimes = `<div class="sp-sheet">${cats("AI 与执行工具")}<div class="sp-doc"><div class="in">
    <h1>AI 与执行工具</h1><p class="lead">装在这台电脑上、可以替你动手的命令行工具。Coding 和助理按这里的结果选用。</p>
    <h2>已接入</h2>
    ${obj("terminal", "Claude Code", "2.4.1 · Coding、助理在用", ok, true)}
    <dl class="sp-qa">
      ${q("装在哪", `<code>~/.local/bin/claude</code>`, btn("更改", "ghost"))}
      ${q("连得上吗", "刚刚检查过，可用", btn("再检查", "ghost"))}
      ${q("能做什么", "读写文件、运行命令、联网")}
      ${q("谁在用", "Coding、助理")}
    </dl>
    ${obj("terminal", "Codex CLI", "0.61.0 · Coding 在用", ok)}
    ${obj("terminal", "Gemini CLI", "找到了命令，但缺少运行文件", `<span class="st bad">${ic("circle-alert", "s")}本体不完整</span>${btn("重新安装")}`)}
    <h2>可以接入</h2>
    ${obj("terminal", "OpenCode", "这台电脑上还没装", btn("查看并接入"))}
    ${obj("terminal", "Aider", "这台电脑上还没装", btn("查看并接入"))}
  </div></div></div>`;

  // 跨插件页签：页签是这一栏里留在手边的东西，来自哪个插件都行；托盘里带名字的那片跟着当前页签走
  const TABS = (curIndex) => [["formatNotes 空列表处理", false, "code"], ["发布说明按版本分节", false, "code"], ["v2.3 发布说明", false, "file", true], ["定价页文案", false, "file"], ["王总：预算确认", false, "inbox", true]].map((t, i) => i === curIndex ? [t[0], true, t[2], t[3]] : t);
  const state = (label, note, strip, width = 1440) => `<div class="sp-state"><div class="l"><b>${label}</b><span>${note}</span></div><div class="sp-stripbox" style="width:${width}px">${strip}</div></div>`;
  const states = `<div class="sp-fit"><div class="sp-ui sp-states">
    ${state("在 Coding 的一个会话里", "Coding 没留用，临时出现在托盘末尾。", top({ extra: ["code", "Coding"], tabs: TABS(0) }))}
    ${state("点了 Pages 的页签", "同一片纸换成 Pages；页签一个没动。", top({ extra: ["file", "Pages"], tabs: TABS(2) }))}
    ${state("点了 Inbox 的页签", "Inbox 是留用的，它自己那格带上名字，不再多出一片。", top({ cur: "Inbox", tabs: TABS(4) }))}
    ${state("点托盘里的 Goals", "去的是 Goals 自己的列表页，它不占页签；页签都在，没有哪个是当前。", top({ cur: "Goals", tabs: TABS(-1) }))}
    ${state("放不下时", "先各自收窄到 96px；再把别的插件的组收成「图形 + 个数」；最后才进 +N。", top({ extra: ["code", "Coding"], tabs: [["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"], ["补 release.ts 的边界测试", false, "code"], ["清理旧的发布脚本", false, "code"], { chip: ["file", 2] }, { chip: ["inbox", 1] }, { chip: ["target", 3] }], more: 4 }), 1210)}
  </div></div>`;

  // 分屏：每一栏的页签在它自己那张纸的正上方；托盘、事项线、输入框各只有一个，跟着有焦点的那一栏
  const req = (icon, tone, name, fact) => `<div class="sp-hrow">${ic(icon, tone)}<b class="cut">${name}</b><span class="grow cut">${fact}</span></div>`;
  const goal = `<div class="sp-sheet"><div class="sp-home" style="padding:28px 32px 0"><div class="in" style="width:auto">
    <div class="place">Goals</div><h1 style="font-size:20px;margin-bottom:6px">发布 v2.3</h1>
    <div class="sp-facts" style="margin-bottom:10px"><span>${ic("status-progress", "s t-b")}进行中</span><span>5 项里完成 1 项</span><span>${ic("calendar", "s")}11 月 22 日前</span></div>
    <h2>要求</h2>
    ${req("status-done", "t-g", "formatNotes 空列表处理", "已验证 · 刚刚")}
    ${req("status-needs-you", "t-a", "发布说明按版本分节", "等你确认方案")}
    ${req("status-progress", "t-b", "补 release.ts 的边界测试", "进行中 · 第 2 步，共 4 步")}
    ${req("status-todo", "t-f", "发布前检查链接", "未开始")}
    ${req("status-todo", "t-f", "更新官网定价页", "未开始")}
    <h2>最近</h2>
    ${hrow("Coding 完成了一轮", "formatNotes 空列表处理 · 改了 2 个文件")}
    ${hrow("你加了一条要求", "更新官网定价页 · 昨天")}
  </div></div></div>`;
  const split = `<div class="sp-fit"><div class="sp-win">${topSplit({ extra: ["code", "Coding"], other: "Goals", left: [["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"]], right: [["发布 v2.3", "soft", "target"], ["v2.3 发布说明", false, "file", true]] })}
    <div class="sp-stage"><div class="sp-sheet focus">${codingMain(ib("sidebar"))}</div>${goal}</div>${line({ to: ["code", "formatNotes 空列表处理"], mode: "修改", ph: "接着说，或补充要求…" })}</div></div>`;

  // 方案 B：顶部去掉托盘。左边一个位置键（当前插件，点开换插件），中间只有页签，右边一个侧边开关。
  // 纸片只有一个：在插件自己的那一页时是位置键（cur），打开了某个东西时是那个页签。
  const place = (icon, name, cls = "") => `<span class="sp-place ${cls}">${ic(icon)}<span class="cut grow">${name}</span>${ic("chevron-down", "xs")}</span>`;
  const top2 = ({ at, cls = "", tabs = [], more = 0, side = false }) => `<div class="sp-top">${ib("chevron-left")}${ib("chevron-right", "dim")}${place(at[0], at[1], cls)}<span class="sp-sepv"></span>${tabsHtml(tabs)}${more ? `<span class="sp-tabchip">+${more}</span>` : ""}${ib("plus")}<span class="grow"></span>${tools(side)}</div>`;
  const topSplit2 = ({ left, right }) => `<div class="sp-top split"><div>${ib("chevron-left")}${ib("chevron-right", "dim")}${place(left.at[0], left.at[1])}<span class="sp-sepv"></span>${tabsHtml(left.tabs)}${ib("plus")}</div>
      <div>${place(right.at[0], right.at[1], "flush")}<span class="sp-sepv"></span>${tabsHtml(right.tabs)}${ib("plus")}<span class="grow"></span>${tools()}</div></div>`;
  const KEEP = [["home", "项目首页"], ["target", "Goals"], ["inbox", "Inbox"], ["rss", "Feed"]];
  const hud = (cur) => `<div class="sp-hud">${KEEP.map(([icon, name], i) => `<span class="sp-hudt"><kbd>${i + 1}</kbd>${ic(icon, "l")}<span>${name}</span></span>`).join("")}<i></i>${[["code", "Coding"], ["file", "Pages"]].map(([icon, name]) => `<span class="sp-hudt${name === cur ? " cur" : ""}">${ic(icon, "l")}<span>${name}</span></span>`).join("")}</div>`;
  const CODING_TABS = [["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"], ["v2.3 发布说明", false, "file", true], ["定价页文案", false, "file"], ["王总：预算确认", false, "inbox", true]];
  const statesB = `<div class="sp-fit"><div class="sp-ui sp-states">
    ${state("在项目首页", "位置键是这一条上唯一的纸片：你在插件自己的那一页。", top2({ at: ["home", "项目首页"], cls: "cur", tabs: TABS(-1) }))}
    ${state("在 Coding 的一个会话里", "纸片换到页签上；位置键退成底色，写着这个页签属于 Coding。", top2({ at: ["code", "Coding"], tabs: TABS(0) }))}
    ${state("点了 Pages 的页签", "位置键宽度固定，页签一个都不动，只是字换了。", top2({ at: ["file", "Pages"], tabs: TABS(2) }))}
    ${state("放不下时", "收法不变：先收窄，再把别的插件的组收成「图形 + 个数」，最后进 +N。", top2({ at: ["code", "Coding"], tabs: [["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"], ["补 release.ts 的边界测试", false, "code"], ["清理旧的发布脚本", false, "code"], { chip: ["file", 2] }, { chip: ["inbox", 1] }, { chip: ["target", 3] }], more: 4 }), 1100)}
    ${state("分屏", "每一栏自带位置键，各说各的，不用再跟着焦点换。", topSplit2({ left: { at: ["code", "Coding"], tabs: [["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"]] }, right: { at: ["target", "Goals"], tabs: [["发布 v2.3", "soft", "target"], ["v2.3 发布说明", false, "file", true]] } }))}
    <div class="sp-state"><div class="l"><b>按住 ⌥</b><span>快切条浮出来：留用的带数字，按数字直达；后面是最近用过的。松开就收。</span></div><div class="sp-stripbox hudbox">${top2({ at: ["code", "Coding"], tabs: TABS(0) })}<div class="sp-hudwrap">${hud("Coding")}</div></div></div>
  </div></div>`;
  const prowN = (icon, name, fact) => `<div class="sp-prow">${ic(icon)}<span>${name}</span><span class="k">${fact}</span></div>`;
  const switcher = `<div class="sp-pop" style="left:84px;width:560px">
    <div class="sp-search">${ic("search")}找插件或动作…<kbd>⌘K</kbd></div>
    <div class="sp-plabel">留用</div>
    <div class="sp-keep">${KEEP.map(([icon, name], i) => `<span>${ic(icon)}<b class="cut grow">${name}</b><kbd>⌥${i + 1}</kbd></span>`).join("")}</div>
    <div class="sp-plabel">开着的</div>
    <div class="sp-grid"><div class="sp-prow sel">${ic("code")}<span><b style="font-weight:500">Coding</b><span class="d" style="display:block">你在这里 · 开着 2 个会话</span></span><span class="k">↵ 回到会话列表　${ic("pin", "s")}留用</span></div>
      ${prowN("file", "Pages", "2 篇")}${prowN("inbox", "Inbox", "1 封")}</div>
    <div class="sp-plabel">做事</div>
    <div class="sp-grid">${prow("check", "待办")}${prow("workflow", "工作流")}${prow("presentation", "演示")}${prow("calendar", "日程")}</div>
    <div class="sp-plabel">收和看</div>
    <div class="sp-grid">${prow("library", "Shelf")}${prow("idea", "灵光")}${prow("globe", "浏览器")}${prow("database", "知识库")}</div>
    <div class="sp-pfoot"><span>↑↓ 选择　↵ 打开　⌘↵ 在旁边打开</span><span>插件市场 ›</span></div></div>`;
  const splitB = `<div class="sp-fit"><div class="sp-win">${topSplit2({ left: { at: ["code", "Coding"], tabs: [["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"]] }, right: { at: ["target", "Goals"], tabs: [["发布 v2.3", "soft", "target"], ["v2.3 发布说明", false, "file", true]] } })}
    <div class="sp-stage"><div class="sp-sheet focus">${codingMain(ib("sidebar"))}</div>${goal}</div>${line({ to: ["code", "formatNotes 空列表处理"], mode: "修改", ph: "接着说，或补充要求…" })}</div></div>`;

  // 方案 C：上面只有页签，当前那个长在纸上；下面是一条真的线，事件是线上的珠子，只有例外出字。
  const earOf = (t) => t.chip ? `<span class="sp-tabchip">${ic(t.chip[0], "s")}${t.chip[1]}</span>`
    : `${t[3] ? `<span class="sp-gap"></span>` : ""}<span class="sp-ear${t[1] === true ? " cur focus" : t[1] === "soft" ? " cur" : ""}">${ic(t[2], "s")}${t[0] ? `<span class="cut">${t[0]}</span>` : ""}${t[1] ? `<span class="x">${ic("x", "xs")}</span>` : ""}</span>`;
  const ears = (tabs) => tabs.map(earOf).join("");
  const pinEar = (icon, cur = false) => `<span class="sp-ear pin${cur ? " cur focus" : ""}">${ic(icon)}</span>`;
  const leadC = (home = false, pins = "") => `${ib("chevron-left")}${ib("chevron-right", "dim")}${pinEar("home", home)}${pins}<span class="sp-sepv"></span>`;
  const toolsC = (sideOn = false) => `${ib("panel", sideOn ? "on" : "")}${ib("columns")}<span class="sp-mono">目</span>`;
  const topC = (cols, cells) => `<div class="sp-top c" style="grid-template-columns:${cols}">${cells.map((c) => `<div>${c}</div>`).join("")}</div>`;
  const oneC = (home, tabs, more = 0) => topC("minmax(0,1fr)", [`${leadC(home)}${ears(tabs)}${more ? `<span class="sp-tabchip">+${more}</span>` : ""}${ib("plus")}<span class="grow"></span>${toolsC()}`]);

  const bead = (icon, cls = "", inner = "") => `<span class="sp-bead ${cls}">${inner || ic(icon, "xs")}</span>`;
  const evc = (icon, cls, name, fact = "", extra = "") => `<span class="sp-evc ${cls}">${bead(icon, cls)}<b>${name}</b>${fact ? `<small>${fact}</small>` : ""}${extra}</span>`;
  const headC = (n, short = false) => `<span class="sp-headc">${ic("folder", "s")}${short ? "" : "目录交互验证"}${n ? `<span class="n">${n}</span>` : ""}${ic("chevron-down", "xs")}</span>`;
  const capC = ({ to = ["sparkles", "助理"], toX = false, mode = "", text = "", ph = "说点什么，或输入 / 找动作…", joined = false, above = "" } = {}) => `<div class="sp-cap${joined ? " joined" : ""}">${above}<span class="b">${ic("plus")}</span><span class="sp-to">${ic(to[0], "s")}<span class="cut">${to[1]}</span>${ic(toX ? "x" : "chevron-down", "xs")}</span>${mode ? `<span class="sp-mode">${mode}${ic("chevron-down", "xs")}</span>` : ""}
      ${text ? `<span class="tx cut">${text}<i class="sp-caret"></i></span>` : `<span class="ph cut">${ph}</span>`}<span class="b ${text ? "go" : "rest"}">${ic("send")}</span></div>`;
  const END = `${bead("", "run num", "<b>2</b>")}${ib("chevron-up")}`;
  const lineC = ({ n = 0, past, next, cap = {}, end = END, cols = "", short = false }) => `<div class="sp-line c"${cols ? ` style="grid-template-columns:${cols}"` : ""}><div class="sp-wing past">${headC(n, short)}<span class="grow"></span>${past}</div>${capC(cap)}<div class="sp-wing next">${next}<span class="grow"></span><span class="sp-endc">${end}</span></div></div>`;
  const PAST_REST = `${bead("inbox", "done a3")}${bead("check", "done a2")}${bead("file", "done a1")}${evc("code", "run", "补边界测试", "第 2 步")}`;
  const PAST_WAIT = `${bead("file", "done a1")}${bead("code", "run")}${evc("code", "wait", "发布说明按版本分节", "等你")}`;
  const NEXT = (first = evc("check", "next", "给王总回电话", "今天")) => `${first}${bead("check", "next")}<span class="sp-day">明天</span>${bead("calendar", "next")}`;
  // 输入框、一句回应、对话框是同一个东西的三种高度
  const replyBar = (html) => `<span class="sp-replybar">${ic("sparkles", "s")}${html}<span class="sp-ib">${ic("chevron-up")}</span></span>`;
  const THINKING = replyBar(`<span class="grow cut" style="color:var(--muted)">正在读 src/release.ts 和它的测试<span class="sp-dots"><i></i><i></i><i></i></span></span>`);
  const REPLIED = replyBar(`<span class="grow cut">已经改好。空列表现在直接返回空字符串，其余行为不变；补了两条测试，都通过。</span>`);
  const CODING_CAP = { to: ["code", "formatNotes 空列表处理"], mode: "修改", ph: "接着说，或补充要求…" };

  const codingC = coding.replace("release-notes · main", "Coding · release-notes · main");
  const mat = (icon, name, fact) => `<div class="sp-row">${ic(icon, "s")}<span class="cut grow">${name}</span><small>${fact}</small></div>`;
  const sideSheet = `<div class="sp-sheet" style="flex:none;width:320px"><div class="sp-dir" style="width:auto;flex:1;border:0;padding:12px 10px">
    <div class="sp-search" style="height:32px;margin-bottom:4px">${ic("search")}找资料…</div>
    <div class="sp-glabel">这个会话在用</div>${mat("note", "发布流程说明", "参考")}${mat("note", "CHANGELOG 写法约定", "参考")}
    <div class="sp-glabel">项目资料</div>${mat("note", "用户访谈纪要", "11 月 12 日")}${mat("note", "品牌用语表", "10 月")}${mat("columns", "竞品定价对比表", "10 月")}${mat("link", "官网定价页", "链接")}
  </div></div>`;
  const sideEar = `<span class="sp-ear cur">${ic("note", "s")}<span class="cut">项目资料</span>${ic("chevron-down", "xs")}</span>`;
  const heroC = `<div class="sp-fit"><div class="sp-win c">${topC("minmax(0,1fr) 320px", [`${leadC()}${ears(CODING_TABS)}${ib("plus")}`, `${sideEar}<span class="grow"></span>${toolsC(true)}`])}
    <div class="sp-stage">${codingC}${sideSheet}</div>${lineC({ n: 1, past: PAST_WAIT, next: NEXT(), cap: CODING_CAP })}</div></div>`;
  const splitC = `<div class="sp-fit"><div class="sp-win c">${topC("1fr 1fr", [`${leadC()}${ears([["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"]])}${ib("plus")}`, `${ears([["发布 v2.3", "soft", "target"], ["v2.3 发布说明", false, "file", true]])}${ib("plus")}<span class="grow"></span>${toolsC()}`])}
    <div class="sp-stage"><div class="sp-sheet">${codingMain(ib("sidebar")).replace("release-notes · main", "Coding · release-notes · main")}</div>${goal}</div>${lineC({ n: 1, past: PAST_WAIT, next: NEXT(), cap: CODING_CAP })}</div></div>`;

  const mini = (label, note, strip, sheets = `<div class="sp-sheet"></div>`, width = 1440) => `<div class="sp-state"><div class="l"><b>${label}</b><span>${note}</span></div><div class="sp-mini" style="width:${width}px">${strip}<div class="sp-stage">${sheets}</div></div></div>`;
  const statesC = `<div class="sp-fit"><div class="sp-ui sp-states">
    ${mini("在项目首页", "⌂ 是唯一固定的一格。它长在纸上，纸上第一行写着「项目首页」。", oneC(true, TABS(-1)))}
    ${mini("在 Coding 的一个会话里", "当前页签和下面的纸是同一张；别的页签只是桌面上的字。", oneC(false, TABS(0)))}
    ${mini("点了 Pages 的页签", "页签一个不动，纸换了一张。是哪个插件，看页签的图形和纸上第一行。", oneC(false, TABS(2)))}
    ${mini("想留用的，钉住", "「留用插件」不再是一个单独的概念：任何页签都能钉住，钉住的只留图形，排在最前。", topC("minmax(0,1fr)", [`${leadC(false, `${pinEar("target", true)}${pinEar("inbox")}${pinEar("code")}`)}${ears(TABS(-1).slice(2))}${ib("plus")}<span class="grow"></span>${toolsC()}`]))}
    ${mini("放不下时", "先收窄，再把别的插件的组收成「图形 + 个数」，最后进 +N。", oneC(false, [["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"], ["补 release.ts 的边界测试", false, "code"], { chip: ["file", 2] }, { chip: ["inbox", 1] }, { chip: ["target", 3] }], 4), undefined, 1000)}
    ${mini("分屏", "每张纸顶上长着它自己的页签。有焦点的那张，页签顶上一道雾蓝。", topC("1fr 1fr", [`${leadC()}${ears([["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"]])}${ib("plus")}`, `${ears([["发布 v2.3", "soft", "target"], ["v2.3 发布说明", false, "file", true]])}${ib("plus")}<span class="grow"></span>${toolsC()}`]), `<div class="sp-sheet"></div><div class="sp-sheet"></div>`)}
  </div></div>`;

  const peek = `<span class="sp-peek"><span class="src">待办 · 计划今天</span><strong>给王总回电话</strong><span class="note">问预算</span><span class="acts">${btn("勾掉", "primary", "check")}${btn("改到明天")}</span></span>`;
  const lrow = (label, note, lineHtml, cls = "", width = 1440) => `<div class="sp-state"><div class="l"><b>${label}</b><span>${note}</span></div><div class="sp-linebox ${cls}" style="width:${width}px">${lineHtml}</div></div>`;
  const statesLine = `<div class="sp-fit"><div class="sp-ui sp-states">
    ${lrow("静止", "做过的是实心珠子，越早越小越淡；在办的是一圈走着的环；接下来的是空心。每一侧只有离输入框最近的一处出字。", lineC({ past: PAST_REST, next: NEXT() }))}
    ${lrow("该你了", "等你的那一颗挪到输入框旁边，变琥珀色并出字；在办的让出字来。线头同时亮起计数。", lineC({ n: 1, past: PAST_WAIT, next: NEXT() }))}
    ${lrow("指着一颗", "90ms 后它上面浮出一张小卡：是什么、怎样了、主人给的一两个动作。不用打开对话框就能勾掉。", lineC({ n: 1, past: PAST_WAIT, next: NEXT(evc("check", "next hover", "给王总回电话", "今天", peek)) }), "tall")}
    ${lrow("对着一件事说话", "它的那颗描一圈墨色，收件人换成它；输入框有字，发送键亮起墨蓝。对话框开着时，线尾的后台任务收进对话框。", lineC({ n: 1, past: PAST_WAIT, next: NEXT(evc("check", "next sel", "给王总回电话", "今天")), cap: { to: ["check", "给王总回电话"], toX: true, text: "帮我列三个要问的预算问题" }, end: "" }))}
    ${lrow("窄窗口", "先收字，珠子还在；线头只留图形和计数。一行就够，不用折成两行。", lineC({ n: 1, short: true, past: `${bead("file", "done a1")}${bead("code", "run")}${bead("code", "wait")}`, next: `${bead("check", "next")}${bead("check", "next")}`, cols: "minmax(0,1fr) 420px minmax(0,1fr)" }), "", 820)}
  </div></div>`;

  const statesFoot = `<div class="sp-fit"><div class="sp-ui sp-states">
    ${lrow("静止", "没有贯通的线。走过的是一段实线，往左淡出，最早的事收成线上的点；将来的是一段虚线，往右淡出。两段都从输入框出发。", lineC({ past: PAST_REST, next: NEXT() }))}
    ${lrow("该你了", "等你的那一件是一枚琥珀色的片，贴着输入框；线头亮起计数。别的都让开。", lineC({ n: 1, past: PAST_WAIT, next: NEXT() }))}
    ${lrow("刚发出一句", "输入框向上长出一行：先是它正在做什么，写完变成回应的第一句。点这一行展开成对话框，回到工作面它就收回去。", lineC({ n: 1, past: PAST_WAIT, next: NEXT(), cap: { above: THINKING } }), "mid")}
    ${lrow("回应写完", "同一行换成结论的第一句，渲染过的文字，不是 Markdown 原文。", lineC({ n: 1, past: PAST_WAIT, next: NEXT(), cap: { above: REPLIED } }), "mid")}
    ${lrow("指着一件", "它上面浮出一张小卡：是什么、怎样了、一两个动作。", lineC({ n: 1, past: PAST_WAIT, next: NEXT(evc("check", "next hover", "给王总回电话", "今天", peek)) }), "tall")}
    ${lrow("窄窗口", "先收字，再减珠子；线头只留图形和计数。", lineC({ n: 1, short: true, past: `${bead("file", "done a1")}${bead("code", "run")}${bead("code", "wait")}`, next: `${bead("check", "next")}${bead("check", "next")}`, cols: "minmax(0,1fr) 420px minmax(0,1fr)" }), "", 820)}
  </div></div>`;
  const dialogC = dialog.replace('class="sp-dlg" style="width:680px"', 'class="sp-dlg joined" style="width:680px"').replace(`<span class="sp-tasks">${ic("activity")}2</span>`, `${bead("", "run num", "<b>2</b>")}`);
  const openC = `<div class="sp-fit"><div class="sp-win c">${oneC(true, TABS(-1))}<div class="sp-stage">${home}</div>${lineC({ n: 1, past: PAST_WAIT, next: NEXT(), cap: { text: "直接改，并补上测试", joined: true }, end: "" })}${dialogC}</div></div>`;

  // 底部是一张纸（用户 2026-11-15）：和工作面一样的无边框容器。
  // 内部第三版「景深」（用户 2026-11-16：要设计感，不要真的做成驾驶舱）：
  // 两边的事从输入框向外由大到小、由实到淡——卡片（两行）→ 小片（一行）→ 圆（只有图形）→ 点。
  // 左边是发生过的（实底），右边是还没发生的（虚线边）。注意力留在中间，两边在余光里。
  const card = (icon, cls, name, fact, trail = "", style = "") => `<span class="sp-card ${cls}"${style ? ` style="${style}"` : ""}><span class="m">${/next/.test(cls) ? `<i class="box">${/hover/.test(cls) ? ic("check", "xs") : ""}</i>` : ic(icon, "s")}</span><span class="t"><b class="cut">${name}</b><small class="cut">${fact}</small></span>${trail}</span>`;
  const pill = (icon, cls, name, extra = "") => `<span class="sp-pl ${cls}"><span class="m">${/next/.test(cls) ? `<i class="box"></i>` : ic(icon, "xs")}</span><span class="cut">${name}</span>${extra}</span>`;
  const orb = (icon, cls = "", extra = "") => `<span class="sp-orb ${cls}">${icon ? ic(icon, "xs") : ""}${extra}</span>`;
  const day = (t) => `<span class="sp-dy">${t}</span>`;
  const headD = (sub = "", short = false, n = 0) => short
    ? `<span class="sp-hb short">${ic("folder", "s")}${n ? `<span class="n">${n}</span>` : ""}${ic("chevron-down", "xs")}</span>`
    : `<span class="sp-hb"><span class="h1"><span class="cut">目录交互验证</span>${ic("chevron-down", "xs")}</span>${sub}</span>`;
  const capD = (o = {}) => capC(o).replace('class="sp-cap', 'class="sp-cap well');
  const footD = ({ head, past = "", next = "", cap = {}, cols = "", cls = "" }) => `<div class="sp-footwrap"><div class="sp-foot ${cls}"${cols ? ` style="grid-template-columns:${cols}"` : ""}><div class="z">${head}<span class="grow"></span>${past}</div>${capD(cap)}<div class="z">${next}<span class="grow"></span>${ib("chevron-up")}</div></div></div>`;
  const H_REST = headD(`<span class="q">今天做完 5 件</span>`);
  const H_WAIT = headD(`<span class="q a">1 件等你</span>`);
  const H_OPEN = headD(`<span class="q a on">1 件等你</span>${"__TPOP__"}`);
  const C_RUN = card("code", "run", "补边界测试", "Coding · 正在跑测试", "", "--p:38%");
  const C_WAIT = card("code", "wait", "发布说明按版本分节", "Coding · 等你确认方案");
  const C_NEXT = (cls = "", trail = "") => card("check", `next ${cls}`, "给王总回电话", "待办 · 今天 15:00", trail);
  const P_REST = `${orb("check", "s3")}${pill("sparkles", "run", "整理访谈纪要")}${C_RUN}`;
  const P_WAIT = `${pill("code", "run", "补边界测试")}${C_WAIT}`;
  const N_ALL = (first = C_NEXT(), second = pill("check", "next", "发布前检查")) => `${first}${second}${day("明天")}${orb("", "next s3")}${orb("", "next s4")}${orb("", "next s5")}`;
  const rear = (html) => `<span class="sp-rear">${ic("sparkles", "s")}${html}<span class="sp-ib">${ic("chevron-up")}</span></span>`;
  const tpop = `<span class="sp-tpop"><span class="h">这一边的全部</span>${card("code", "wait", "发布说明按版本分节", "Coding · 等你确认方案")}${card("code", "run", "补边界测试", "Coding · 正在跑测试", "", "--p:38%")}${card("sparkles", "run", "整理访谈纪要", "助理 · 正在归类", "", "--p:55%")}<span class="f">今天做完的 5 件${ic("chevron-right", "xs")}</span></span>`;
  const peekD = `<span class="sp-peek"><span class="src">待办 · 计划今天</span><strong>发布前检查</strong><span class="note">核对版本号和发布说明</span><span class="acts">${btn("勾掉", "secondary", "check")}${btn("改到明天", "ghost")}</span></span>`;
  const drow = (label, note, footHtml, cls = "", width = 1440) => `<div class="sp-state"><div class="l"><b>${label}</b><span>${note}</span></div><div class="sp-footbox ${cls}" style="width:${width}px">${footHtml}</div></div>`;
  const statesD = `<div class="sp-fit"><div class="sp-ui sp-states">
    ${drow("静止", "两边的事从输入框向外由大到小、由实到淡：卡片说全（名字，谁、怎样了），小片只说名字，再远是只有图形的圆，最后是点。左边是发生过的，右边是还没发生的。", footD({ head: H_REST, past: P_REST, next: N_ALL() }))}
    ${drow("该你了", "等你的那一件来到最里面，是琥珀色的卡；原来在里面的各退一档。整张纸上只有这一处有颜色。", footD({ head: H_WAIT, past: P_WAIT, next: N_ALL() }))}
    ${drow("打字的时候", "输入框里一有字，两边就退到余光里；等你的那张不退。停下来两秒，它们再回来。", footD({ head: H_WAIT, past: P_WAIT, next: N_ALL(), cls: "hush", cap: { text: "帮我把 v2.3 的发布说明按版本分一下节" } }))}
    ${drow("指着一件", "远处的也能直接点：指着它，它上面出一张小卡，有主人给的动作。", footD({ head: H_WAIT, past: P_WAIT, next: N_ALL(C_NEXT(), pill("check", "next hover", "发布前检查", peekD)) }), "peekh")}
    ${drow("对着一件事说话", "它的卡描一圈墨色，收件人换成它；发送键亮起墨蓝。", footD({ head: H_WAIT, past: P_WAIT, next: N_ALL(C_NEXT("sel")), cap: { to: ["check", "给王总回电话"], toX: true, text: "帮我列三个要问的预算问题" } }))}
    ${drow("回应", "回应从这张纸上长出来，在输入框的正上方，和顶部「页签连着纸」是同一种形状。点它展开成对话框。", footD({ head: H_WAIT, past: P_WAIT, next: N_ALL(), cap: { above: rear(`<span class="grow cut">已经改好。空列表现在直接返回空字符串，其余行为不变；补了两条测试，都通过。</span>`) } }), "mid")}
    ${drow("看这一边的全部", "点项目名下面那句话，展开这一边的全部：等你的、在办的、做完的。在办的就是后台任务。", footD({ head: H_OPEN.replace("__TPOP__", tpop), past: P_WAIT, next: N_ALL() }), "tall")}
    ${drow("没事的时候", "两边是空的，纸上只剩项目名和输入框。", footD({ head: headD(`<span class="q">没有在办的事</span>`) }))}
    ${drow("窄窗口", "从远处开始收：先收点和圆，再收小片，最后把卡片收成一个圆。始终一行。", footD({ head: headD("", true, 1), past: bead("code", "wait"), next: `${bead("check", "next")}${orb("", "next s4")}`, cols: "minmax(0,1fr) 380px minmax(0,1fr)" }), "", 820)}
  </div></div>`;
  const heroD = `<div class="sp-fit"><div class="sp-win c d">${topC("minmax(0,1fr) 320px", [`${leadC()}${ears(CODING_TABS)}${ib("plus")}`, `${sideEar}<span class="grow"></span>${toolsC(true)}`])}
    <div class="sp-stage">${codingC}${sideSheet}</div>${footD({ head: H_WAIT, past: P_WAIT, next: N_ALL(), cap: CODING_CAP })}</div></div>`;
  const openD = `<div class="sp-fit"><div class="sp-win c d">${oneC(true, TABS(-1))}<div class="sp-stage">${home}</div>${footD({ head: headD("", true, 1), past: `${orb("sparkles", "s3 run")}${C_WAIT}`, next: `${C_NEXT()}${orb("", "next s3")}${orb("", "next s4")}${orb("", "next s5")}`, cols: "minmax(0,1fr) 680px minmax(0,1fr)", cap: { text: "直接改，并补上测试" } })}${dialog.replace('class="sp-dlg" style="width:680px"', 'class="sp-dlg docked" style="width:680px"').replace(`<span class="sp-tasks">${ic("activity")}2</span>`, "")}</div></div>`;

  // 底栏第四版（用户 2026-11-16）：回到第 17 屏的样子（没有底部那张纸），改三样——
  // 线头是事项菜单，不是事件菜单；事件一件一个样（状态看轮廓，种类看图形，放得下就出字）；
  // 点一件事件，它移到中间，凸在输入框（对话框开着时是对话框）的上沿，接着说的话就是对它说的。
  const mk = (icon, cls = "", style = "") => `<span class="sp-m ${cls}"${style ? ` style="${style}"` : ""}>${/todo/.test(cls) ? `<i class="box"></i>` : ic(icon, "s")}</span>`;
  const e4 = (icon, cls, name, word = "", extra = "") => `<span class="sp-e ${cls}">${mk(icon, cls)}<b>${name}</b>${word ? `<small>${word}</small>` : ""}${extra}</span>`;
  const more4 = (t, warn = "") => `<span class="sp-more4">${t}${warn ? `<i>${warn}</i>` : ""}</span>`;
  const ring4 = (p = 60) => `<span class="sp-ring4" style="--p:${p}%"></span>`;
  const head4 = ({ name = "发布 v2.3", n = 0, p = 60, project = false, short = false, open = "" } = {}) => `<span class="sp-h4${open ? " open" : ""}">${project ? ic("folder", "s") : ring4(p)}${short ? "" : `<span class="cut">${name}</span>`}${n ? `<span class="n">${n}</span>` : ""}${ic("chevron-down", "xs")}${open}</span>`;
  const ear4 = (icon, cls, name, word = "", acts = "") => `<span class="sp-ear4">${mk(icon, cls)}<b>${name}</b>${word ? `<small>${word}</small>` : ""}${acts ? `<span class="acts">${acts}</span>` : ""}<span class="sp-ib">${ic("x")}</span></span>`;
  const SLOT4 = `<span class="sp-m slot"></span>`;
  const TASKS4 = `<span class="sp-m run num" style="--p:40%"><b>2</b></span>`;
  const END4 = `${TASKS4}${ib("chevron-up")}`;
  const line4 = ({ head = head4({ n: 1 }), past = "", next = "", cap = {}, end = END4, cols = "" } = {}) => `<div class="sp-line c v4"${cols ? ` style="grid-template-columns:${cols}"` : ""}><div class="sp-wing past">${head}<span class="grow"></span>${past}</div>${capC(cap)}<div class="sp-wing next">${next}<span class="grow"></span><span class="sp-endc">${end}</span></div></div>`;
  const E_WAIT = e4("code", "wait", "发布说明按版本分节", "等你");
  const E_RUN = e4("code", "run", "补边界测试", "第 2 步", "", );
  const E_NEW = e4("file", "done new", "v2.3 发布说明", "交回了");
  const E_DONE = e4("inbox", "done", "评审反馈");
  const E_FAIL = e4("sparkles", "fail", "查竞品定价", "没跑通");
  const E_TODO = (cls = "", extra = "") => e4("check", `next todo ${cls}`, "给王总回电话", "15:00", extra);
  const E_MEET = (cls = "", extra = "") => e4("calendar", `next ${cls}`, "发布评审会", "16:30", extra);
  const E_HINT = e4("sparkles", "hint", "补 release.ts 的边界测试", "建议");
  const PAST4_REST = `${more4("更早 3")}${mk("inbox", "done")}${mk("file", "done new")}${E_RUN}`;
  const PAST4_WAIT = `${mk("file", "done new")}${mk("code", "run")}${E_WAIT}`;
  const NEXT4 = (first = E_TODO(), second = E_MEET()) => `${first}${second}${more4("之后 3")}`;
  const TODO_ACTS = `${btn("勾掉", "secondary", "check")}${btn("改到明天", "ghost")}`;
  const EAR_TODO = ear4("check", "next todo", "给王总回电话", "今天 15:00", TODO_ACTS);
  const NEXT4_MOVED = `${SLOT4}${E_MEET()}${more4("之后 3")}`;
  const peek4 = `<span class="sp-peek"><span class="src">日程 · 今天 16:30，45 分钟</span><strong>发布评审会</strong><span class="note">过一遍 v2.3 的发布说明和检查表</span><span class="acts">${btn("看议程", "secondary")}${btn("让助理备材料", "ghost", "sparkles")}</span></span>`;
  // 事项菜单：从线头向上展开。最近切过的 3 件、折叠的分组、新建 / 整理主线 / 不选事项（主线 MLN-23、WLN-19）
  const wrow = (p, name, fact, n = 0, cur = false) => `<span class="r${cur ? " cur" : ""}">${ring4(p)}<span class="t"><b class="cut">${name}</b><small class="cut">${fact}</small></span>${n ? `<span class="n">${n}</span>` : ""}${cur ? ic("check", "s") : ""}</span>`;
  const wgrp = (name, count, n = 0) => `<span class="g">${ic("chevron-right", "xs")}<span class="cut grow">${name}</span>${n ? `<span class="n">${n}</span>` : ""}<small>${count} 件</small></span>`;
  const wmenu = `<span class="sp-wmenu"><span class="sp-search">${ic("search")}找事项…</span><span class="h">最近</span>${wrow(60, "发布 v2.3", "Coding 在等你确认方案", 1, true)}${wrow(35, "定价页改版", "对比表交回了，等你看", 1)}${wrow(80, "用户访谈整理", "助理正在归类 · 第 3 步")}<span class="h">全部事项</span>${wgrp("产品发布", 4, 1)}${wgrp("市场", 3, 1)}${wgrp("没分组的", 2)}<span class="sep"></span><span class="a">${ic("plus", "s")}新建事项</span><span class="a">${ic("list", "s")}整理主线</span><span class="a">${ic("folder", "s")}不选事项<small>看整个项目的线</small></span></span>`;
  const leg = (name, rule, chip, bead) => `<div class="sp-leg"><span class="k"><b>${name}</b>${rule}</span><span class="v">${chip}${bead}</span></div>`;
  const legend = `<div class="sp-legs">
    ${leg("做完", "灰底，没有边。看过的就这样", E_DONE, mk("inbox", "done"))}
    ${leg("交回了，还没看", "做完的样子加一个绿点和「交回了」", E_NEW, mk("file", "done new"))}
    ${leg("在办", "白底细边，图形外面一圈真实进度", E_RUN, mk("code", "run"))}
    ${leg("等你", "琥珀色，挪到输入框旁边", E_WAIT, mk("code", "wait"))}
    ${leg("没跑通", "白底红环，红字说怎么了", E_FAIL, mk("sparkles", "fail"))}
    ${leg("到时间的待办", "虚线边，前面是一个能直接勾的圈", E_TODO(), mk("check", "next todo"))}
    ${leg("到时间的会", "虚线边，日历图形，后面是几点", E_MEET(), mk("calendar", "next"))}
    ${leg("建议", "没有边，只是一句话：它还不是一件事", E_HINT, mk("sparkles", "hint"))}
  </div>`;
  const states4 = `<div class="sp-fit"><div class="sp-ui sp-states">
    <div class="sp-state"><div class="l"><b>事件的长相</b><span>每件事三样东西都看得出：是谁的（图形）、怎样了（轮廓加一个词）、叫什么（名字）。每格左边是出字的样子，右边是放不下名字时的样子，轮廓不变。</span></div>${legend}</div>
    ${lrow("静止", "从输入框向外，放得下就出字；放不下的留图形和轮廓，大小不变；再放不下的收成「更早 3」。左边是发生过的，右边是还没发生的。", line4({ head: head4(), past: PAST4_REST, next: NEXT4() }))}
    ${lrow("该你了", "等你的那一件挪到输入框旁边；线头的数字是这件事项里等你的件数。", line4({ past: PAST4_WAIT, next: NEXT4() }))}
    ${lrow("有一件没跑通", "红环和红字，不挪位置；指着它看原因和「再试一次」。", line4({ head: head4(), past: `${mk("file", "done new")}${E_FAIL}${mk("code", "run")}`, next: NEXT4() }))}
    ${lrow("指着一件", "90ms 后它上面出一张小卡：是什么、怎样了、主人给的一两个动作。只有图形的那些也一样。", line4({ past: PAST4_WAIT, next: NEXT4(E_TODO(), E_MEET("hover", peek4)) }), "tall")}
    ${lrow("点一件：它移到中间", "它离开原来的位置，凸在输入框的上沿，和输入框是同一张纸；原位留一个空圈。主人给的动作就在凸起上，接着说的话就是对它说的。", line4({ past: PAST4_WAIT, next: NEXT4_MOVED, cap: { above: EAR_TODO, ph: "关于这件事，说点什么…" } }), "mid")}
    ${lrow("对着它说一句", "收件人还是助理，不用再写一遍事件名；发送键亮起墨蓝。点 × 或按 Esc，它回到原位。", line4({ past: PAST4_WAIT, next: NEXT4_MOVED, cap: { above: EAR_TODO, text: "帮我列三个要问的预算问题" } }), "mid")}
    ${lrow("它回了一句", "回应那一行夹在凸起和输入框之间；点这一行展开成对话框，凸起跟着升到对话框的上沿。", line4({ past: PAST4_WAIT, next: NEXT4_MOVED, cap: { above: `${EAR_TODO}${replyBar(`<span class="grow cut">三个问题：今年的预算上限、能不能分两期、谁签字。要记进这条待办吗？</span>`)}`, ph: "关于这件事，说点什么…" } }), "mid2")}
    ${lrow("点线头：换事项", "线头是事项菜单。事项是一件要办成的事（这里是「发布 v2.3」），两翼才是它的事件。菜单向上展开：最近切过的 3 件、折叠的分组、新建、整理主线、不选事项。别的事项有事等你时，数字包含它们，列表里看得出是哪一件。", line4({ head: head4({ n: 2, open: wmenu }), past: PAST4_WAIT, next: NEXT4() }), "menu")}
    ${lrow("没选事项", "线头写项目名，线是整个项目的线。", line4({ head: head4({ project: true, name: "目录交互验证", n: 2 }), past: `${mk("code", "run")}${E_WAIT}`, next: NEXT4() }))}
    ${lrow("窄窗口", "先收字，轮廓还在；线头只留环和计数。始终一行。", line4({ head: head4({ short: true, n: 1 }), past: `${mk("code", "run")}${mk("code", "wait")}`, next: `${mk("check", "next todo")}${mk("calendar", "next")}`, cols: "minmax(0,1fr) 420px minmax(0,1fr)", end: ib("chevron-up") }), "", 820)}
  </div></div>`;

  // 定稿：顶部用方案 C（用户 2026-11-15）。底部用第四版（用户 2026-11-16 改回第 17 屏的样子，待看）。第 1–6 屏、分屏和首页按这两样重画。
  const winC = (topHtml, stage, foot, over = "") => `<div class="sp-fit"><div class="sp-win c">${topHtml}<div class="sp-stage">${stage}</div>${foot}${over}</div></div>`;
  const footF = (cap = {}, o = {}) => line4({ past: PAST4_WAIT, next: NEXT4(), cap, ...o });
  const footOpen = (cap = {}, o = {}) => line4({ past: PAST4_WAIT, next: NEXT4(), cap: { ...cap, joined: true }, end: "", ...o });
  const docked = (html) => html.replace('class="sp-dlg"', 'class="sp-dlg joined"').replace(/<span class="sp-tasks[^>]*>.*?<\/span>/, TASKS4);
  const eventC = docked(eventDialog.replace(/<div class="sp-drawer">[\s\S]*$/, "</div></div>")).replace("width:720px", "width:680px")
    .replace(dhead([["sparkles", "主对话", false], ["check", "给王总回电话", true, true]], true).replace(/<span class="sp-tasks[^>]*>.*?<\/span>/, TASKS4), dhead([["sparkles", "主对话", false]]).replace(/<span class="sp-tasks[^>]*>.*?<\/span>/, TASKS4))
    .replace('class="sp-dlg joined"', 'class="sp-dlg joined eared"').replace('<div class="sp-dlghd">', `${ear4("check", "next todo", "给王总回电话", "今天 15:00")}<div class="sp-dlghd">`);
  const F_MENU = winC(oneC(false, CODING_TABS), codingC, footF(CODING_CAP, { head: head4({ n: 2, open: wmenu }) }));
  const SET_TABS = [...TABS(-1), ["设置", true, "settings", true]];
  const startC = start.replace("留用　↵ 打开", "钉住　↵ 打开").replace('style="left:258px;width:560px"', 'style="left:-4px;top:36px;width:560px"');
  const menuC = sideMenu.replace('style="right:56px;width:208px;padding:6px"', 'style="left:18px;top:36px;width:208px;padding:6px"');
  const topStart = topC("minmax(0,1fr) 320px", [`${leadC(true)}${ears(TABS(-1).slice(0, 2))}<span class="sp-anchor">${ib("plus", "on")}${startC}</span>`, `<span class="sp-anchor">${sideEar}${menuC}</span><span class="grow"></span>${toolsC(true)}`]);
  const F_CODING = winC(oneC(false, CODING_TABS), codingC, footF(CODING_CAP));
  const F_DIALOG = winC(oneC(true, TABS(-1)), home, footOpen({ text: "直接改，并补上测试" }), docked(dialog).replace(/<span class="sp-dtab">(?:(?!<span class="sp-dtab).)*?给王总回电话.*?<\/span><\/span>/, ""));
  const F_EVENT = winC(oneC(true, TABS(-1)), home, footOpen({ ph: "关于这件事，说点什么…" }, { next: NEXT4_MOVED }), eventC);
  const F_START = winC(topStart, `${home}${sideSheet}`, footF());
  const F_SET_A = winC(oneC(false, SET_TABS), settingsAssistant, footF());
  const F_SET_R = winC(oneC(false, SET_TABS), settingsRuntimes, footF());
  const F_SPLIT = winC(topC("1fr 1fr", [`${leadC()}${ears([["formatNotes 空列表处理", true, "code"], ["发布说明按版本分节", false, "code"]])}${ib("plus")}`, `${ears([["发布 v2.3", "soft", "target"], ["v2.3 发布说明", false, "file", true]])}${ib("plus")}<span class="grow"></span>${toolsC()}`]),
    `<div class="sp-sheet">${codingMain(ib("sidebar")).replace("release-notes · main", "Coding · release-notes · main")}</div>${goal}`, footF(CODING_CAP));


  // 首页：项目的第一页（用户 2026-11-16：首页不要插件陈列）。按「项目现在怎么样」排，不按插件排；Work Brief 把同一页写成话。
  const hSt = (name, cls = "") => ic(`status-${name}`, `s ${cls}`);
  const seg5 = (n) => `<span class="sp-seg5">${[0, 1, 2, 3, 4].map((i) => `<i${i < n ? ' class="on"' : ""}></i>`).join("")}</span>`;
  const hpRow = (time, icon, name, fact, tail = "") => `<div class="sp-pr"><time>${time}</time>${ic(icon, "s")}<span class="cut"><b>${name}</b><span>${fact}</span></span>${tail}</div>`;
  const hgRow = (mark, name, tail = "", sub = false) => `<div class="sp-gr${sub ? " sub" : ""}">${mark}<span class="cut">${name}</span>${tail ? `<span class="tl">${tail}</span>` : ""}</div>`;
  const hSrc = (n, icon, name, word, cls = "") => `<div class="src"><sup>${n}</sup>${ic(icon, "s")}<b>${name}</b><span class="w ${cls}">${word}</span></div>`;
  const P_META = (right) => `<div class="meta"><span>项目首页</span><span class="grow"></span>${right}</div>`;
  const P_VER = (text = "简报 · 第 12 版") => `<span class="ver">${text}${ic("chevron-down", "xs")}</span>${ib("refresh")}${ib("more")}`;
  const P_LEDE = `<p class="lede">发布说明的改法出了两个方案，<span class="you">在等你选</span><sup>1</sup>。目录交互的三项验证过了两项，「再下一层仍能看出归属」卡在窄窗口上<sup>2</sup>。v2.3 发布说明昨天改了三处<sup>3</sup>，这周没有新的风险<sup>4</sup>。</p>`;
  const P_SINCE = `<h2>自你上次来<small>昨天 18:20 之后</small></h2>
    ${hpRow("10:12", "code", "formatNotes 空列表处理", "给了两个方案", `<span class="sp-you">等你</span>`)}
    ${hpRow("昨天", "target", "让每项工作都有可信的完成依据", "做完了", hSt("done", "t-g"))}
    ${hpRow("昨天", "target", "再下一层仍能看出归属", "卡住：窄窗口下名字被截", hSt("blocked", "t-r"))}
    ${hpRow("昨天", "file", "v2.3 发布说明", "改了 3 处")}`;
  const P_GOALS = `<h2>目标</h2>
    ${hgRow(hSt("progress", "t-b"), "<b>打开项目后三秒内认出当前目标和阻塞</b>", `${seg5(3)}<small>3 / 5</small>`)}
    ${hgRow(hSt("done", "t-g"), "让每项工作都有可信的完成依据", "", true)}
    ${hgRow(hSt("blocked", "t-r"), "再下一层仍能看出归属", `<small class="t-r">卡住</small>`, true)}
    ${hgRow(hSt("todo", "t-f"), "子 Goal 标题比父 Goal 更靠右，状态仍对齐", "", true)}
    ${hgRow(ic("pause", "s t-f"), "<b>在旧会话里自动启用 MCP</b>", `<small>已暂停</small>`)}`;
  const P_NEXT = `<h2>下一步</h2><div class="sp-nx">
    <div><b class="cut">选一个改法</b><span class="why cut">formatNotes 空列表处理 · Coding</span>${btn("看两个方案", "primary")}</div>
    <div><b class="cut">补 release.ts 的边界测试</b><span class="why cut">改法定了以后接着做</span>${btn("交给助理", "secondary", "sparkles")}</div>
    <div><b class="cut">发布前检查链接</b><span class="why cut">待办 · 今天到期</span>${btn("打开")}</div></div>`;
  const P_SRC = (extra = "") => `<div class="mg"><div class="hd">依据<small>读于 10:32</small></div>
    ${hSrc(1, "code", "Coding", "等你", "you")}${hSrc(2, "target", "Goals", "卡住了", "bad")}${hSrc(3, "file", "Pages", "有变化", "chg")}${hSrc(4, "risk", "风险", "正常")}${hSrc("", "list", "待办", "正常")}
    <div class="rest">另有 4 个没有新内容</div>${extra}<div class="all">全部插件<kbd>⌘K</kbd></div></div>`;
  const pageOf = (col, mg) => `<div class="sp-sheet"><div class="sp-pg"><div class="col">${col}</div>${mg}</div></div>`;
  const homeBrief = pageOf(`${P_META(P_VER())}<h1>目录交互验证</h1>${P_LEDE}${P_SINCE}${P_GOALS}${P_NEXT}`, P_SRC());
  const F_HOME = winC(oneC(true, TABS(-1)), homeBrief, footF());
  const P_FACTS = `<p class="facts">5 个目标里 3 个在办、1 个卡住　·　今天动过 2 个会话　·　3 件待办今天到期</p>`;
  const hrowS = (label, note, col, mg) => `<div class="sp-state"><div class="l"><b>${label}</b><span>${note}</span></div><div class="sp-pgbox">${pageOf(col, mg)}</div></div>`;
  const statesHome = `<div class="sp-fit"><div class="sp-ui sp-states">
    ${hrowS("有简报", "标题下面是助理写的几句话，每句后面的小号数字对着右边的依据。", `${P_META(P_VER())}<h1>目录交互验证</h1>${P_LEDE}${P_SINCE}`, P_SRC())}
    ${hrowS("刷新以后", "只报变化：变了的那一句洗一次雾蓝底，版本条写变了几句。没变就不出新版本。", `${P_META(P_VER("简报 · 第 13 版 · 变了 1 句"))}<h1>目录交互验证</h1>${P_LEDE.replace('发布说明的改法出了两个方案，<span class="you">在等你选</span><sup>1</sup>。', '<span class="new">发布说明的改法定了：加空列表分支，正在改<sup>1</sup>。</span>')}${P_SINCE}`, P_SRC().replace('<span class="w you">等你</span>', '<span class="w chg">有变化</span>'))}
    ${hrowS("一个来源读不到", "只有那一句换成缺口说明，别的照常；右边那一行给「再读一次」。不编，也不当成正常。", `${P_META(P_VER())}<h1>目录交互验证</h1>${P_LEDE.replace(/目录交互的三项验证.*?<sup>2<\/sup>。/, '<span class="gap">Goals 现在读不到，这一句停在昨天 21:40 的样子<sup>2</sup>。</span>')}${P_SINCE}`, P_SRC().replace('<span class="w bad">卡住了</span>', '<span class="w">读不到 · <u>再读一次</u></span>'))}
    ${hrowS("装了 Work Brief，还没写过", "事实都在，只是还没人把它写成话。一个按钮，不自动开始。", `${P_META(`${ib("more")}`)}<h1>目录交互验证</h1><div class="ask"><span>这一页还没有写成话。让助理读一遍这个项目，写成几句。</span>${btn("写一份简报", "primary", "sparkles")}</div>${P_SINCE}`, P_SRC())}
    ${hrowS("没装 Work Brief", "同一页，少了那几句话：标题下面一行数字，往下照旧。不用模型，也不假装是 AI 的结论。", `${P_META(`${ib("more")}`)}<h1>目录交互验证</h1>${P_FACTS}${P_SINCE}`, P_SRC(`<div class="add">想让这一页写成几句话？<u>添加 Work Brief</u></div>`))}
    ${hrowS("新项目", "没有内容和读不到分开说。给三个开始的地方，不要求先配模型。", `${P_META("")}<h1>目录交互验证</h1><p class="facts">这个项目里还没有东西。</p><div class="sp-nx start"><div><b>带入资料</b><span class="why">选一个文件夹，或拖文件进来</span>${btn("选文件夹", "primary", "folder")}</div><div><b>开始一件工作</b><span class="why">在下面说一句，助理接着办</span>${btn("写在下面", "secondary")}</div><div><b>添加插件</b><span class="why">按用途挑，随时能加能减</span>${btn("看看有什么")}</div></div>`, `<div class="mg"><div class="hd">依据</div><div class="rest">还没有来源</div><div class="all">全部插件<kbd>⌘K</kbd></div></div>`)}
  </div></div>`;

  const SHOTS = [
    { id: "coding", title: "1 · Coding：一轮结束", lead: "定稿的顶部和底部，加 Coding 的目标长相。这一屏唯一的墨蓝是「看改动」。",
      html: F_CODING,
      notes: ["顶部只有页签：当前会话的页签长在它那张纸上；是哪个插件，看页签的图形和纸上第一行。", "右上角只有侧边开合、布局、项目三个图形。", "目录列：名字占满，常态一个状态点，只有「等你」出字。新建收成列头的 ＋。", "准备信息收成一行，回答在前；回合结束是一句「改了什么」加主操作。", "底部（第四版，见第 23 屏）：线头是事项「发布 v2.3」；等你的那一件是琥珀色的片，挨着输入框；别的各有各的轮廓。", "输入框底排四个控件：＋、收件人、模式、发送。"] },
    { id: "dialog", title: "2 · 助理对话框", lead: "对话框压在输入框上，和它是同一张纸、同一条中轴，高度随内容。详情栏默认关。",
      html: F_DIALOG.replace(home, homeBrief.replace("mw-btn--primary", "mw-btn--secondary")),
      notes: ["头部左边是页签，右边是后台任务的环、更多、收起：对话框开着时，线尾的后台任务收进这里。", "回复里小标题 15/600，正文 13；没有「这一轮没用技能」那一行。", "回复下面给可以直接点的下一句，少打一次字。", "输入框有字时发送键是墨蓝，是这一屏唯一的墨蓝：对话框开着时，身后那一页的主按钮退成普通按钮。", "对话框开着时两边的事件流照旧，等你的那件仍贴着输入框。"] },
    { id: "event", title: "3 · 事件卡", lead: "点底部的一件待办：它离开原位移到中间，凸在对话框的上沿；事件卡三段写满，主人声明的动作就在卡上。",
      html: F_EVENT.replace(home, homeBrief.replace("mw-btn--primary", "mw-btn--secondary")),
      notes: ["事件卡：来源和状态一行；标题、备注、日期；勾掉、改期、打开。", "凸起就是这件事件的页签，和顶部「页签长在纸上」是同一种形状；原位留一个空圈，点 × 或 Esc 它回去。", "收件人还是助理，不用再写一遍事件名：接着说的话就是对这件事说的。", "对话框高度随内容，不再有大片空白。"] },
    { id: "start", title: "4 · 起始页与侧边菜单", lead: "两个浮层各自从触发它的控件下面长出。这里画在同一张图上，实际不会同时出现。",
      html: F_START.replace(home, homeBrief),
      notes: ["起始页锚在 ＋ 下面，宽 560px：先搜索，再最近，然后按用途分组。换插件走这里或 ⌘K。", "每项一行；说明只在选中的那行出现；想留在手边的，打开以后把页签钉住。", "侧边的视图名长在侧边那张纸上，点它换视图；八项都带名字，当前视图打勾。"] },
    { id: "settings-assistant", title: "5 · 设置 · 助理（设置行）", lead: "文档式：类目列 220px、行高 32px；正文列 760px，标题 24/600。22 个勾选框收成一行，就地展开。",
      html: F_SET_A,
      notes: ["设置行：左边名字加一句说明，右边一个控件，细线分隔，不套卡。", "「不提醒的地方」合成一行「3 处」，展开后是多选。", "设置是一个页签，和别的页签一样长在它那张纸上，带关闭键。", "打开设置时收件人回到助理，上一处的提示和回复都收起。"] },
    { id: "settings-runtimes", title: "6 · 设置 · AI 与执行工具（对象行）", lead: "一个工具一行，就地展开；展开后用问句行。运行时和「本机路径」不再拆成两行。",
      html: F_SET_R,
      notes: ["对象行：图形、名字、状态、展开。", "问句行：装在哪、连得上吗、能做什么、谁在用。", "红色配图形和一句话，旁边就是能做的事。", "没有看不见的禁用键：没装的也能点「查看并接入」。"] },
    { id: "tabs", title: "7 · （方案 A，留作记录）跨插件的页签", lead: "方案 A 的顶部：保留托盘。定稿用的是方案 C，各状态见第 13 屏。",
      html: states, notes: ["页签不随插件切换而消失：从 Coding 的会话点到 Pages 的文档是一步。这一条在方案 C 里不变。", "方案 A 里挪进托盘的「插件自己的那一页」，在方案 C 里是一个页签或一个钉住的图形。"] },
    { id: "split", title: "8 · 分屏", lead: "左栏有焦点（Coding 的会话），右栏是 Goals 里的一个目标。两张纸各自长着自己的页签。",
      html: F_SPLIT, notes: ["有焦点的那张，当前页签顶上一道雾蓝；没焦点的仍连着纸，没有那道线。", "底部只有一条，输入框位置不变；收件人跟着有焦点的一栏。", "窄栏里 Coding 的目录列自动收起，头部左边的键再打开。", "前进后退只有一对，作用在有焦点的一栏。"] },
    { id: "b-strip", title: "9 · 方案 B：顶部去掉插件", lead: "托盘整个拿掉。左边一个位置键写着当前插件，点开换插件；中间只有页签；右边一个侧边开关。两头各一个同样长相的键，中间是你开着的东西。",
      html: statesB, notes: ["顶部只剩三样：我在哪（位置键）、开着什么（页签）、旁边看什么（侧边开关）。四个没名字的插件图标没有了，页签多出约 100px。", "纸片只有一个：在插件自己的那一页时它是位置键，打开了某个东西时它是那个页签。", "留用的插件没丢：在位置键菜单的第一行，⌥1…⌥9 直达，按住 ⌥ 浮出快切条。", "＋ 的意思变成「在当前插件里新开一个」（新会话、新文档）；换插件归位置键。", "代价：用鼠标去一个没有页签开着的留用插件，从点一次变成点两次。"] },
    { id: "b-switch", title: "10 · 方案 B：点位置键换插件", lead: "原来的起始页搬到位置键下面。第一行是留用的，带快捷键；然后是这一栏开着东西的插件；再往下按用途分组。",
      html: win(top2({ at: ["code", "Coding"], cls: "open", tabs: CODING_TABS }), coding, line({ to: ["code", "formatNotes 空列表处理"], mode: "修改", ph: "接着说，或补充要求…" }), switcher),
      notes: ["留用的四个是大格子，一眼能点到；快捷键写在格子上，用几次就不用再打开菜单。", "「开着的」告诉你每个插件在这一栏开了几个东西；当前插件那行可以回到它的列表页，也可以留用。", "菜单从位置键长出来，左边缘和它对齐。"] },
    { id: "b-split", title: "11 · 方案 B：分屏", lead: "每一栏的顶上是它自己的位置键和页签，和下面那张纸左边缘对齐。",
      html: splitB, notes: ["两栏各自回答「我在哪」，不再有「托盘跟着焦点走」这条规则。", "有焦点的一栏当前页签是浮起的纸片；没焦点的只留纸色。", "前进后退只有一对，作用在有焦点的一栏。"] },
    { id: "c-hero", title: "12 · 方案 C：纸上的页签，一条真的线", lead: "上面是空间：开着什么。下面是时间：做过的、现在、接下来。两条都只在例外处出字。图里 Coding 开着一个会话，右边开着侧边的项目资料。",
      html: heroC, notes: ["顶部没有插件，也没有位置键。当前页签直接长在它那张纸上，「我在哪」不用读，看形状就知道。", "是哪个插件：页签上的图形，加纸上第一行（这里是「Coding · release-notes · main」）。", "侧边也是一张纸，它的视图名同样长在纸顶上，点它换视图。右上角只剩三个图形：侧边、布局、项目。", "事项线上只有输入框是一个盒子。事件是线上的珠子，等你的那颗在输入框旁边出字。", "换插件走 ＋（起始页）或 ⌘K，和现在一样，不需要新的平台合同。"] },
    { id: "c-top", title: "13 · 方案 C：顶部各状态", lead: "每一行是顶部栏加它下面那张纸的上沿。",
      html: statesC, notes: ["少了一个概念：「留用插件」并进「钉住的页签」。默认只有 ⌂ 固定，别的想留就钉。", "切换页签时没有任何东西移动或变宽，只是纸换了。", "没有当前页签的情况不存在了：插件自己的列表页也是一个页签（或一个钉住的图形）。"] },
    { id: "c-split", title: "14 · 方案 C：分屏", lead: "两张纸各自长着自己的页签。",
      html: splitC, notes: ["不需要「托盘跟着焦点走」或「每栏一个位置键」：纸和页签连在一起，天然各归各。", "有焦点的一栏，页签顶上一道雾蓝；没焦点的一栏页签仍连着纸，但没有那道线。", "事项线只有一条；收件人跟着有焦点的一栏。"] },
    { id: "c-line", title: "15 · 方案 C：事项线各状态", lead: "把线画成线。现在一条上有带框的线头、带框的胶囊、分段的细线、+N、输入框、任务图形、展开键，读起来像工具栏。改成：一条贯通的细线，线上是珠子，只有输入框是盒子。",
      html: statesLine, notes: ["珠子里是来源的图形；状态看形状：实心是做完，走着的环是在办，琥珀环是等你，空心是接下来，红环是失败。", "出字的规则只有一条：每一侧离输入框最近的那一处出字，等你的优先。其余的指一下就出。", "窗口变窄时先收字再减珠子，不会出现被切半的胶囊，也不用折行。", "线头去掉了框，只是线的起点上的一个名字。"] },
    { id: "c-foot", title: "16 · 方案 C：底部重做（各状态）", lead: "去掉那条贯通的线。时间从输入框向两边走：左边是走过的（实线，淡出），右边是将来的（虚线，淡出）。输入框、一句回应、对话框是同一个东西的三种高度。",
      html: statesFoot, notes: ["线不再从窗口一边画到另一边：它只在「现在」附近看得见，越远越淡，所以不再像一道划痕。", "实和虚本身就是意思：发生过的是实的（实线、实心珠子、有底色的片），还没发生的是虚的（虚线、空心珠子、虚线边的片）。", "出字的那一件是一枚片，不是裸字：珠子和字在同一个底色里，读起来是一件东西。", "隔天的地方有一个很小的「明天」，时间不只是先后，还看得出是哪天。", "输入框向上长一行，就是一句回应；再向上长，就是对话框。三种高度之间没有另起的浮层。"] },
    { id: "c-open", title: "17 · 方案 C：对话框展开", lead: "第四版（第 23 屏）以这一屏为底。对话框和输入框是同一张纸：对话框压在输入框上，连接处和顶部「页签连着纸」是同一种形状，只是倒过来。",
      html: openC, notes: ["上面：页签在纸的上方，连着纸。下面：输入框在对话框的下方，连着对话框。同一种语言用了两次。", "对话框开着时，线尾的后台任务收进对话框头部；两边的事件流照旧，等你的那件仍贴着输入框。", "点事件流里的一件，对话框就换到它的页签；它的那一颗描一圈墨色。"] },
    { id: "d-hero", title: "18 · （第三版，留作记录）底部是一张纸：整屏", lead: "用户 2026-11-16 改回第 17 屏的样子，现行见第 23、24 屏。桌面上有三张纸：工作面、侧边、底部。底部那张里，两边的事向输入框汇拢：越近越大、越实，越远越小、越淡。",
      html: heroD, notes: ["注意力留在中间。输入框两侧各一张卡片说全了最要紧的一件，再往外只是余光里的形状。", "左边是发生过的（实底），右边是还没发生的（虚线边）。", "整张纸上的颜色只有琥珀：等你的那张卡，和线头下面的「1 件等你」。", "没有标签、没有计数的小方块；想看全部，点项目名下面那句话。"] },
    { id: "d-foot", title: "19 · （第三版，留作记录）底部是一张纸：各状态", lead: "现行见第 23 屏。四档：卡片（两行）→ 小片（一行）→ 圆（只有图形）→ 点。每一件事随着远近换档，不换位置的规矩。",
      html: statesD, notes: ["档位就是重要程度：等你的永远在最里面，其次是在办的，做完的往外退，最后淡成点。", "打字的时候两边自己退后，只留等你的那张；这是「不打断」的那一半。", "在办的卡底边有一道很细的进度，是真实步骤，不是装饰。", "收窄时从远处开始收，所以最要紧的一件总是最后才变小。"] },
    { id: "d-open", title: "20 · （第三版，留作记录）底部是一张纸：对话框展开", lead: "现行见第 2、3 屏。对话框是从底部这张纸上长出来的一大片，底边和纸连在一起；输入框就在它正下方。",
      html: openD, notes: ["顶部：页签从工作面上长出来。底部：回应和对话框从底部那张纸上长出来。整个窗口只有「纸」和「纸上长出来的东西」两种形状。", "对话框开着时输入框放宽到和对话框一样宽（680px），两边各少一档，线头收成图形加计数。等你的那件仍挨着输入框。"] },
    { id: "home", title: "21 · 首页：项目的第一页", lead: "定稿（用户 2026-11-16）。首页不再陈列插件。它回答一个问题：这个项目现在怎么样。几句话、自你上次来变了什么、目标走到哪、下一步；插件只剩每一行前面的小图形，和右边页边上的一列依据。",
      html: F_HOME,
      notes: ["排法按工作，不按插件：没有卡片、色带和一排「打开」。没有新内容的插件不出现。", "开头几句是 Work Brief 的简报；每句后面的小号数字对着右边页边的依据，点它看是哪一条、截至何时。", "整页的颜色只有两处琥珀（等你的那半句、等你的那一行）和一个墨蓝按钮。", "右边页边就是原来的插件卡片表剩下的东西：一个来源一行，一个词说轮到谁。", "和底部的分工：底部是当前事项此刻的事件（等你、在办、接下来），跟着你到每一页；首页是整个项目的样子，要读的时候才来。", "换插件、找插件不在这里：走 ＋ 的起始页或 ⌘K。"] },
    { id: "home-brief", title: "22 · 首页和 Work Brief：同一页，写没写成话", lead: "每一行是首页的上半截。Work Brief 不是换一个首页，是把同一页的开头写成几句话；没装、没写、读不到，都还是这一页。",
      html: statesHome,
      notes: ["没有「看基础首页」这个切换了：两种首页长得一样，差别只在标题下面那一段。", "事实部分（自你上次来、目标、下一步）归平台，从各插件公开的概况读，不用模型。", "那几句话、版本、依据和修订归 Work Brief；点版本条进它自己的页看历次版本、改句子。", "要你处理的事不在首页另列一份：它在底部的事件流里，首页只在句子里点到。"] },
    { id: "e-line", title: "23 · 底栏第四版：事件各有各的样子", lead: "回到第 17 屏的样子：没有底部那张纸，输入框是这一条上唯一的盒子。改三样：线头是事项菜单；事件一件一个样；点一件事件，它移到中间，凸在输入框的上沿。",
      html: states4, notes: ["状态看轮廓，不只看颜色：灰底是做完，白底加一圈进度是在办，琥珀是等你，红环是没跑通，虚线边是到时间的，没有边的是建议。", "种类看图形：待办是一个能勾的圈，会是日历，Coding 是代码，交回的东西是文件，助理的是星。图形比第 17 屏大一号。", "出字不再是「每侧只有一处」：从输入框向外，放得下就出字，每一件都带一个状态词或时间。放不下的留图形，大小和轮廓不变，不再缩成点。", "更早的、之后的收成「更早 3」「之后 3」，点开在侧边列出。", "线头是事项：环是这件事项走到哪，数字是等你的件数，点开换事项。两翼才是事件。", "点一件事件，它移到中间，凸在输入框上沿；主人给的动作在凸起上，接着说的话就是对它说的。"] },
    { id: "e-menu", title: "24 · 底栏第四版：点线头，换事项", lead: "线头是事项菜单，向上展开。事项是一件要办成的事（这里是「发布 v2.3」）；换了事项，两翼、页签和侧边都换成那件事的。",
      html: F_MENU, notes: ["顶上是最近切过的 3 件，每行：进度环、名字、最近一次动作、等你的件数。当前这件打勾。", "下面是折叠的分组，组头带件数和等你的件数；有搜索。", "底下三项：新建事项、整理主线、不选事项（看整个项目的线）。", "别的事项有事等你时，线头的数字包含它们（这里是 2），列表里看得出是哪一件。", "列表的内容和规则照主线现行写法（最近 3 件加折叠分组），这里只定它在线头上的长相。"] },
  ];

  const only = new URLSearchParams(location.search).get("only");
  document.getElementById("app").innerHTML = SHOTS.filter((s) => !only || s.id === only).map((s) => `<section class="sp-shot" id="${s.id}"><h2>${s.title}</h2><p>${s.lead}</p>${s.html}<ol class="sp-notes">${s.notes.map((n, i) => `<li><b>${i + 1}</b><span>${n}</span></li>`).join("")}</ol></section>`).join("");
  document.getElementById("jump").innerHTML = SHOTS.map((s) => `<a href="#${s.id}">${s.title.replace(/^\d+ · /, "").replace("方案 B：", "B·")}</a>`).join("");

  const client = document.createElement("script"); client.textContent = window.mwKitClient; document.body.appendChild(client);
  const fit = () => document.documentElement.style.setProperty("--z", String(Math.min(1, (window.innerWidth - 48) / 1440)));
  fit(); window.addEventListener("resize", fit);
  const setTheme = (theme) => {
    document.documentElement.dataset.resolvedTheme = theme; document.documentElement.dataset.theme = theme;
    document.querySelectorAll("#theme button").forEach((b) => b.setAttribute("aria-pressed", String(b.value === theme)));
  };
  document.getElementById("theme").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) setTheme(b.value); });
  setTheme(new URLSearchParams(location.search).get("theme") === "dark" ? "dark" : "light");
})();
