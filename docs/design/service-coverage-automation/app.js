// Batch-61 prototype: ① what each service can and cannot do (service differences), ② the default web-search source, ③ project
// automation suggestions and adopting one. Specs: specs/assistant-service-connections/spec.md (§3.3, §8.1, §8.2, §12, ASC-38～55),
// specs/automation-recommender/spec.md (AUT-01～08). Every control is the component board's (window.mwKit, ../kit/kit.css,
// ../kit/settings.css); proto.css only places them. Standalone review prototype: nothing is fetched or written.
(() => {
  const K = window.mwKit, D = window.B61_DATA;
  const KEY = "molis-proto.b61.v1";
  const DEF = { b: "diff", s: "A", st: "normal", l: "zh", t: "light", mark: true };
  const STATES = {
    diff: ["normal", "filter", "gaps", "blocked", "partial"],
    search: ["builtin", "connected", "broken", "only", "switched"],
    rec: ["normal", "scanning", "confirm", "adopted", "failed", "partial", "empty", "noworkspace"],
  };
  const shot = new URLSearchParams(location.search).has("shot");
  const esc = K.escapeHtml, clone = (x) => JSON.parse(JSON.stringify(x));
  const T = {
    zh: {
      title: "第 61 批定样 · 服务差异、默认搜索、推荐及采用", blk: "块", b_diff: "① 服务差异", b_search: "② 默认网页搜索", b_rec: "③ 推荐及采用", sch: "方案", st: "状态", lang: "语言", theme: "主题", light: "浅色", dark: "深色", mark: "标出组件板新增", reset: "重来", pending: "待你选",
      st_normal: "正常", st_filter: "按用途筛", st_gaps: "能做的少（看缺口）", st_blocked: "要管理员批准", st_partial: "一部分没读到", st_builtin: "用内置来源", st_connected: "用你连的服务", st_broken: "默认来源失效", st_only: "只有内置来源", st_switched: "刚换了默认",
      st_scanning: "正在读项目", st_confirm: "采用前确认", st_adopted: "采用后·已生效", st_failed: "采用没成", st_empty: "没什么可加的", st_noworkspace: "项目没有文件夹",
      sA_diff: "A 行里写用途，展开分「能做／还做不了」", sB_diff: "B 「按服务／按用途」对照表", sC_diff: "C 只在挑选时对比",
      sA_search: "A 服务连接页顶上一节", sB_search: "B 设置里单独一页", sC_search: "C 在服务行里「设为默认」",
      sA_rec: "A 发现可优化的就说，一张卡里勾选（已选）", sB_rec: "B 一次问一条", sC_rec: "C 做相关的事时顺带提",
      chrome: "全局设置", close: "关闭全局设置", back: "返回项目",
      g_local: "本机", g_personal: "个人", g_ai: "AI", g_tools: "工具与接入", g_system: "系统",
      n_appearance: "界面与语言", n_directories: "本机目录", n_memory: "记忆", n_sync: "同步", n_models: "模型设置", n_assistant: "助理", n_characters: "角色", n_kit: "能力包", n_runtimes: "AI 与执行工具", n_library: "能力库", n_connections: "服务连接", n_search: "网页搜索", n_access: "对外接入", n_history: "调用记录", n_diagnostics: "诊断",
      h_conn: "服务连接", lead_conn: "连上你用的服务，Molis Work 里的助理、Feed、Coding 都能用同一个账号。每个服务写清现在能做什么、还做不了什么。",
      find: "找服务", f_all: "全部", byService: "按服务", byUse: "按用途", useFilter: "按用途看",
      c_connected: "已连上", c_available: "能连", c_blocked: "要先批准", c_only: "只有身份",
      usedIn: "能用在：{u}", nothingYet: "现在只能读账号身份", canNow: "现在能做", cannot: "还做不了", why: "原因", path: "能走的路", none: "—",
      acct: "账号", reach: "连得上吗", reachOk: "连得上 · 2 分钟前查过", connect: "连接", connectMore: "看其他连接方式", fresh: "本批新加",
      blockedT: "要先由管理员批准", blockedAct: "怎样请管理员批准", partialT: "有一个插件的服务没读到", partialB: "「企业微信」的插件这会儿没回应，它的服务先不列出；其余照常。诊断编号 C-4K2P。", retry: "重试",
      matrixLead: "勾的是现在就能用的；空的是这个服务做不到；「要先连」是连上就能用。", needConnect: "要先连", can: "能", legend: "说明",
      pickT: "技能「周报整理」要一个「项目跟踪」服务", pickB: "这几个服务都算「项目跟踪」，能做的不一样。选一个，只在这次工作里用；以后可以换。", pickUse: "这次用它", picked: "这次用 {s}", pickNeedConn: "连接并用它",
      p_github: "能读 Issue、通知；不能建 Issue", p_linear: "能读分配给你的 Issue；不能改状态", p_jira: "能读分配给你的事项；要填站点地址",
      h_search: "网页搜索", lead_search: "助理、Coding、Feed 的网页查询都从这里选的来源搜。只换以后的搜索，正在跑的那次照旧。",
      defaultIs: "默认来源", whoUses: "谁在用", changeTo: "改用这个", setDefault: "设为默认搜索", isDefault: "默认搜索", connectSearch: "连接一个能搜索的服务",
      lastUse: "最近一次：{s} · 3 分钟前 · 助理", nowUses: "网页搜索现在用：{s}", change: "改",
      brokenT: "默认来源 Brave Search 的密钥被拒了", brokenB: "网页搜索先停下，不会悄悄换成别的来源。换一把密钥，或改用别的来源。", replaceKey: "换密钥", useBuiltin: "改用 AnySearch",
      onlyHint: "连上 Brave Search、Tavily 这类能搜索的服务后，可以在这里选它。", switchedToast: "以后的搜索走 Brave Search；正在跑的那次照旧用 AnySearch。",
      billing: "按它的额度计费",
      recTitle: "{p} 的自动化建议", recLead: "只读看了一遍项目，挑出最值得加的。采用前会再给你看来源和权限；不会自动装。",
      found: "认出的", have: "已经有，不重复推荐", gapsT: "有一部分没读到", gapsB: "「docs」文件夹没有读的权限，那里的配置没算进来。给了权限后再看一次。",
      cat_hooks: "Hooks", cat_skills: "技能", cat_connections: "服务连接", cat_roles: "角色", cat_commands: "命令",
      conf_high: "把握大", conf_medium: "有一定把握", evidence: "依据", effect: "加了以后", needs: "需要", risk: "代价",
      adopt_skill: "启用", adopt_connection: "连接", adopt_role: "启用角色", notThis: "不要这条", ignore: "这次忽略", already: "我已经有了", never: "以后别再提",
      confirmT: "启用「{t}」", src: "来源", ver: "版本与发布者", tools: "会用到的工具", toolsV: "读文件、跑测试命令（仍按本轮授权）", how: "怎么用", auto: "适用时由 AI 选用", manual: "只在我点名时用",
      confirmBtn: "确认启用", cancel: "取消",
      adoptedT: "已启用「{t}」", adoptedB: "下一轮对话起生效。在「能力包」里能看到它、随时关掉。", undo: "撤销", seeIt: "在能力包里看",
      failedT: "Notion 没连上", failedB: "Notion 要工作区管理员同意这个应用。这条建议先留着，同意后回来点「连接」接着走。", keep: "留着这条",
      save: "保存为文稿", done: "完成", saved: "已存成 Pages 文稿",
      scanning: "正在只读看项目里的文件…", scanStep: "读了 1 个文件夹，正在看第 2 个",
      emptyT: "没有要新加的", emptyB: "这个项目常用的测试、检查和服务都已经有了。以后项目变了可以再看一次。", again: "再看一次",
      noWsT: "这个项目还没有文件夹", noWsB: "建议要读项目里的文件才给得出来。给项目选一个文件夹后再看。", chooseFolder: "选择文件夹",
      hidden: "已收起的建议（{n}）", showAgain: "再显示",
      threeT: "这个项目值得加的 {n} 件事", seeAll: "看全部 {n} 条建议", projHome: "项目首页", openAll: "全部建议",
      h_rec: "自动化建议", lead_rec: "按项目文件给出的建议。只读，采用时再确认。",
      assistant: "助理", assistOff: "主动建议的设置", composer: "问助理，或让它做点事", homeNote: "（项目首页；助理在右边，窄屏时盖满）",
      earlier_me: "今天先把发布清单过一遍", earlier_ai: "好，清单在 Pages 里，我按上周的顺序过了一遍，两处待你确认。",
      quietNote: "这种情况助理不主动说话；下面是你主动问时它怎么答。", ask_what: "这个项目还能加点什么自动化？",
      kicker_rec: "项目建议", kicker_one: "项目建议 · {i}/{n}", a_intro: "刚注意到 molis-site 加了 Playwright 和 GitHub Actions，我只读看了一遍：有 3 样已经装好、值得开的东西。不会自动开，你勾好再定：",
      b_intro: "我只读看了一遍 molis-site，有 3 样值得开。一样一样问你：", bundleTitle: "给 molis-site 加 {n} 样", bundleAbout: "依据都是项目里的文件；开之前再给你看来源和权限。",
      waitYou: "等你定", reading: "正在读", doneBadge: "已生效", partDone: "部分没成", scanTitle: "看看这个项目能加什么", stop: "停下",
      adoptPicked: "开启所选（{n}）", later: "以后再说", previewT: "开启前确认", previewNote: "技能下一轮对话起生效；GitHub 要你在浏览器里登录一次。", confirmBtn: "确认开启", back2: "改选",
      cf_conn: "去 GitHub 登录授权（只读）", cf_role: "需要时交给它评审",
      res_title: "已开启 {n} 样", res_body: "技能和角色下一轮对话起生效；在「能力包」里能看到、随时关掉。", res_title_partial: "开了 {n} 样，Notion 没连上", res_partial: "Notion 要工作区管理员同意这个应用；同意后在这里点「重试」接着连。其余已生效。",
      conn_kicker: "服务连接", conn_title: "连接 GitHub", conn_body: "在浏览器里登录并同意只读权限，回来后自动接着用。", conn_go: "去登录", waiting: "等你登录",
      ask_skill: "要开「{t}」吗？", ask_connection: "要{t}吗？", ask_role: "要启用「{t}」吗？", oneNote: "不开也没关系，问完就不再提。", notNow: "这次不要", allAsked: "就这些了。想再看可以问我「这个项目还能加什么」。", ans_on: "已开启",
      c_ask: "帮我看看为什么 CI 挂了", c_reply: "挂在 tests/home.test.ts：上次改了首页标题，快照没更新。我已经更新快照并在本地跑过，CI 下一次会过。", c_scan: "顺便只读看了一下项目…",
      nextSteps: "下一步", c_step1: "开「测试与质量」，以后改完先跑测试", c_step2: "连接 GitHub，直接读 CI 日志", c_more: "看这个项目全部 {n} 条建议", forProject: "加到",
      allowFolder: "给权限", gapsB: "「docs」文件夹没有读的权限，那里的配置没算进来。", failedB: "Notion 要工作区管理员同意这个应用。建议留着，同意后点重试。",
      pv_note: "原型：{x}",
    },
    en: {
      title: "Batch 61 specimens · service differences, default search, suggestions", blk: "Block", b_diff: "① Service differences", b_search: "② Default web search", b_rec: "③ Suggestions & adopting", sch: "Option", st: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", mark: "Mark new board parts", reset: "Reset", pending: "Your pick",
      st_normal: "Normal", st_filter: "Filtered by use", st_gaps: "Little works (gaps)", st_blocked: "Needs admin approval", st_partial: "Part not read", st_builtin: "Built-in source", st_connected: "Your connected service", st_broken: "Default source failing", st_only: "Only the built-in", st_switched: "Default just changed",
      st_scanning: "Reading the project", st_confirm: "Confirm before adopting", st_adopted: "Adopted, in effect", st_failed: "Adopting failed", st_empty: "Nothing to add", st_noworkspace: "Project has no folder",
      sA_diff: "A Uses in the row; open for can / can't", sB_diff: "B By service / by use table", sC_diff: "C Compare only when choosing",
      sA_search: "A A section atop Service connections", sB_search: "B Its own settings page", sC_search: "C “Make default” in the service row",
      sA_rec: "A Speak up when something can improve, pick in one card (chosen)", sB_rec: "B Ask one at a time", sC_rec: "C Bring it up when relevant",
      chrome: "Settings", close: "Close settings", back: "Back to project",
      g_local: "This computer", g_personal: "Personal", g_ai: "AI", g_tools: "Tools and access", g_system: "System",
      n_appearance: "Appearance", n_directories: "Local folders", n_memory: "Memory", n_sync: "Sync", n_models: "Models", n_assistant: "Assistant", n_characters: "Roles", n_kit: "AI kits", n_runtimes: "AI and tools", n_library: "Library", n_connections: "Service connections", n_search: "Web search", n_access: "External access", n_history: "Call history", n_diagnostics: "Diagnostics",
      h_conn: "Service connections", lead_conn: "Connect the services you use; the assistant, Feed and Coding share the same account. Each service says what it can and can't do today.",
      find: "Find a service", f_all: "All", byService: "By service", byUse: "By use", useFilter: "View by use",
      c_connected: "Connected", c_available: "Can connect", c_blocked: "Needs approval", c_only: "Identity only",
      usedIn: "Used for: {u}", nothingYet: "Only the account identity for now", canNow: "Works now", cannot: "Not yet", why: "Why", path: "What you can do", none: "—",
      acct: "Account", reach: "Reachable", reachOk: "Reachable · checked 2 min ago", connect: "Connect", connectMore: "Other ways to connect", fresh: "New",
      blockedT: "An admin has to approve it first", blockedAct: "How to ask your admin", partialT: "One plugin's services couldn't be read", partialB: "The WeCom plugin isn't answering, so its service is left out for now; the rest is as usual. Diagnostic C-4K2P.", retry: "Retry",
      matrixLead: "A tick works now; blank means this service can't; “Connect first” works once connected.", needConnect: "Connect first", can: "Yes", legend: "Key",
      pickT: "The “Weekly digest” skill needs a project tracker", pickB: "These services all count as a project tracker but can do different things. Pick one for this work only; you can change it later.", pickUse: "Use it this time", picked: "Using {s} this time", pickNeedConn: "Connect and use",
      p_github: "Reads issues and notifications; can't create issues", p_linear: "Reads issues assigned to you; can't change status", p_jira: "Reads items assigned to you; needs the site address",
      h_search: "Web search", lead_search: "The assistant, Coding and Feed web queries all search with the source chosen here. Only later searches change; one already running keeps its source.",
      defaultIs: "Default source", whoUses: "Used by", changeTo: "Use this", setDefault: "Make default search", isDefault: "Default search", connectSearch: "Connect a service that can search",
      lastUse: "Last: {s} · 3 min ago · Assistant", nowUses: "Web search uses: {s}", change: "Change",
      brokenT: "The default source, Brave Search, rejected its key", brokenB: "Web search stops here; it won't quietly switch to another source. Replace the key or choose another source.", replaceKey: "Replace key", useBuiltin: "Use AnySearch",
      onlyHint: "Connect a search service such as Brave Search or Tavily to choose it here.", switchedToast: "Later searches use Brave Search; the one already running keeps AnySearch.",
      billing: "billed by its plan",
      recTitle: "Suggestions for {p}", recLead: "Read the project once, read only, and picked what is most worth adding. You see the source and permissions again before adopting; nothing installs itself.",
      found: "Found", have: "Already there, not suggested again", gapsT: "Part of it couldn't be read", gapsB: "There's no permission for the “docs” folder, so its settings aren't counted. Look again once it's allowed.",
      cat_hooks: "Hooks", cat_skills: "Skills", cat_connections: "Service connections", cat_roles: "Roles", cat_commands: "Commands",
      conf_high: "Confident", conf_medium: "Fairly sure", evidence: "Based on", effect: "Once added", needs: "Needs", risk: "Cost",
      adopt_skill: "Turn on", adopt_connection: "Connect", adopt_role: "Turn on role", notThis: "Not this", ignore: "Ignore for now", already: "I already have it", never: "Don't suggest again",
      confirmT: "Turn on “{t}”", src: "Source", ver: "Version and publisher", tools: "Tools it uses", toolsV: "Read files, run test commands (this round's grant still applies)", how: "How to use it", auto: "AI picks it when it fits", manual: "Only when I name it",
      confirmBtn: "Turn on", cancel: "Cancel",
      adoptedT: "“{t}” is on", adoptedB: "From the next conversation. It's listed under AI kits, where you can turn it off any time.", undo: "Undo", seeIt: "See it in AI kits",
      failedT: "Notion didn't connect", failedB: "Notion needs a workspace admin to allow this app. The suggestion stays; come back and press Connect once it's allowed.", keep: "Keep it",
      save: "Save as document", done: "Done", saved: "Saved as a Pages document",
      scanning: "Reading the project's files, read only…", scanStep: "Read 1 folder, looking at the 2nd",
      emptyT: "Nothing new to add", emptyB: "The tests, checks and services this project uses are already there. Look again when the project changes.", again: "Look again",
      noWsT: "This project has no folder yet", noWsB: "Suggestions come from the project's files. Choose a folder for the project, then look again.", chooseFolder: "Choose folder",
      hidden: "Hidden suggestions ({n})", showAgain: "Show again",
      threeT: "{n} things worth adding to this project", seeAll: "See all {n} suggestions", projHome: "Project home", openAll: "All suggestions",
      h_rec: "Automation suggestions", lead_rec: "Suggestions from the project's files. Read only; you confirm when adopting.",
      assistant: "Assistant", assistOff: "Suggestion settings", composer: "Ask the assistant or give it a task", homeNote: "(Project home; the assistant is on the right, full screen when narrow)",
      earlier_me: "Let's go through the release checklist first", earlier_ai: "Done. The checklist is in Pages; I went through it in last week's order and two items need you.",
      quietNote: "In this case the assistant doesn't speak up; below is its answer when you ask.", ask_what: "What else could this project automate?",
      kicker_rec: "Project suggestion", kicker_one: "Project suggestion · {i}/{n}", a_intro: "I noticed molis-site now has Playwright and GitHub Actions, so I read it again, read only. Three things already installed are worth turning on. Nothing turns on by itself; tick what you want:",
      b_intro: "I read molis-site once, read only. Three things are worth turning on. One at a time:", bundleTitle: "Add {n} things to molis-site", bundleAbout: "Each is based on files in the project; you see the source and permissions before anything turns on.",
      waitYou: "Your call", reading: "Reading", doneBadge: "In effect", partDone: "Partly failed", scanTitle: "What this project could add", stop: "Stop",
      adoptPicked: "Turn on selected ({n})", later: "Later", previewT: "Before turning on", previewNote: "Skills apply from the next conversation; GitHub needs one sign-in in your browser.", confirmBtn: "Turn on", back2: "Change picks",
      cf_conn: "Sign in to GitHub and allow read access", cf_role: "Reviews when needed",
      res_title: "{n} things are on", res_body: "Skills and roles apply from the next conversation; they're under AI kits, where you can turn them off.", res_title_partial: "{n} on; Notion didn't connect", res_partial: "Notion needs a workspace admin to allow this app; press Retry here once allowed. The rest is in effect.",
      conn_kicker: "Service connection", conn_title: "Connect GitHub", conn_body: "Sign in and allow read access in your browser; it carries on when you're back.", conn_go: "Sign in", waiting: "Waiting for sign-in",
      ask_skill: "Turn on “{t}”?", ask_connection: "{t}?", ask_role: "Turn on “{t}”?", oneNote: "No is fine; once asked, it isn't raised again.", notNow: "Not this time", allAsked: "That's all. Ask me “what else could this project add” any time.", ans_on: "On",
      c_ask: "Why did CI fail?", c_reply: "It failed in tests/home.test.ts: the home title changed last time and the snapshot wasn't updated. I updated it and ran it locally; the next CI run will pass.", c_scan: "Also reading the project, read only…",
      nextSteps: "Next steps", c_step1: "Turn on “Testing and quality” to run tests after edits", c_step2: "Connect GitHub to read CI logs directly", c_more: "See all {n} suggestions for this project", forProject: "Add to",
      allowFolder: "Allow folder", gapsB: "There's no permission for the “docs” folder, so its settings aren't counted.", failedB: "Notion needs a workspace admin to allow this app. The suggestion stays; press Retry once allowed.",
      pv_note: "Prototype: {x}",
    },
  };
  let P = (() => { try { return Object.assign(clone(DEF), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return clone(DEF); } })();
  const qs = new URLSearchParams(location.search);
  for (const k of ["b", "s", "st", "l", "t"]) if (qs.get(k)) P[k] = qs.get(k);
  if (!STATES[P.b].includes(P.st)) P.st = STATES[P.b][0];
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private window */ } };
  const t = (k, v) => (T[P.l][k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const L = (o) => (o && typeof o === "object" ? o[P.l] : o) ?? "";
  const ic = (n) => K.icon(n);
  const btn = (label, o = {}) => K.renderButton({ label, variant: o.variant || "secondary", size: o.size || "sm", icon: o.icon, iconOnly: o.iconOnly, className: o.className, attrs: o.attrs });
  const badge = (label, tone = "neutral") => K.renderBadge({ label, tone });
  const isNew = (html, what) => P.mark ? `<div class="b61-new" data-new="${esc(what)}">${html}</div>` : html;
  const sep = () => (P.l === "zh" ? "、" : ", ");

  /* ---------- transient state ---------- */
  let ui;
  const fresh = () => {
    ui = { open: { diff: P.st === "gaps" ? "google-calendar" : P.st === "blocked" ? "feishu" : "github" }, filter: P.st === "filter" ? "assistant" : "all", view: P.s === "B" ? "use" : "service",
      def: ["connected", "broken", "switched"].includes(P.st) ? "brave" : "anysearch", picked: null, recOpen: "skill-test",
      adopt: {}, prefs: [], saved: false, unpicked: [], stage: P.st === "confirm" ? "confirm" : P.st === "adopted" ? "done" : P.st === "failed" ? "failed" : "pick", step: P.st === "adopted" ? 1 : 0, answers: [], ctx: ["confirm", "adopted", "failed"].includes(P.st) ? (P.st === "failed" ? "conn-github" : "skill-test") : null };
    if (P.st === "confirm") ui.adopt["skill-test"] = "confirm";
    if (P.st === "adopted") ui.adopt["skill-test"] = "done";
    if (P.st === "failed") { ui.adopt["conn-notion"] = "failed"; ui.recOpen = "conn-notion"; }
  };
  fresh();
  const toast = (msg) => {
    const box = document.getElementById("toasts");
    box.innerHTML = K.renderToast ? K.renderToast({ message: msg, tone: "success" }) : `<div class="mw-toast">${esc(msg)}</div>`;
    clearTimeout(toast.at); toast.at = setTimeout(() => { box.innerHTML = ""; }, 3200);
  };

  /* ---------- settings frame ---------- */
  function nav(current) {
    const tools = ["runtimes:terminal", "library:book", "connections:link", ...(P.b === "search" && P.s === "B" ? ["search:search"] : []), "access:shield", "history:workflow"];
    const groups = [["g_local", ["appearance:sun", "directories:folder"]], ["g_personal", ["memory:bookmark", "sync:network"]], ["g_ai", ["models:key", "assistant:message", "characters:user", "kit:package"]], ["g_tools", tools], ["g_system", ["diagnostics:bug"]]];
    return `<nav class="settings-navigation settings-navigation--codex" aria-label="${esc(t("chrome"))}"><a class="settings-nav-back" href="#" data-act="sim">${ic("arrow")} ${esc(t("back"))}</a><div class="settings-nav-body">${groups.map(([g, items]) => `<div class="settings-nav-group-label">${esc(t(g))}</div>${items.map((x) => { const [id, i] = x.split(":"); return `<a href="#"${id === current ? ' aria-current="page"' : ""} data-act="sim">${ic(i)}${esc(t("n_" + id))}</a>`; }).join("")}`).join("")}</div></nav>`;
  }
  const frame = (current, h, lead, body) => `<header class="project-preferences-chrome"><span>${esc(t("chrome"))}</span><a href="#" aria-label="${esc(t("close"))}" data-act="sim">${ic("x")}</a></header>
    <main class="settings-shell">${nav(current)}<div class="settings-content"><section class="settings-document b61-doc" aria-labelledby="b61H">
      <header class="settings-heading"><div class="settings-heading-title"><h1 id="b61H">${esc(h)}</h1></div><p>${esc(lead)}</p></header>
      <div class="settings-body">${body}</div></section></div></main>`;

  /* ---------- ① service differences ---------- */
  const svc = (id) => D.services.find((s) => s.id === id);
  const useName = (u) => L(D.uses[u].name);
  const usesOf = (s) => [...new Set(s.can.map((c) => c.use))];
  const mark = (s) => `<span class="settings-connector-mark settings-connector-mark--fallback" aria-hidden="true">${esc(s.name.slice(0, 1))}</span>`;
  const stateOf = (s) => {
    const map = { connected: ["c_connected", "done", "connected"], available: ["c_available", "quiet", null], blocked: ["c_blocked", "hold", "paused"] };
    const [k, tone, ring] = s.onlyIdentity ? ["c_only", "quiet", null] : map[s.state];
    return K.renderStatusMark({ label: t(k), tone, state: ring || undefined, plain: !ring });
  };
  const caption = (s) => (usesOf(s).length ? t("usedIn", { u: usesOf(s).map(useName).join(" · ") }) : t("nothingYet"));
  function canList(s) {
    const can = s.can.map((c) => `<li class="mw-item mw-item--stack b61-can"><span class="mw-mark" aria-hidden="true">${ic(D.uses[c.use].icon)}</span><span><strong>${esc(L(c.text))}</strong><small>${esc(useName(c.use))}${c.cat ? " · ~~" + esc(L(D.categories[c.cat])) : ""}</small></span><span class="mw-item__end">${c.fresh ? badge(t("fresh"), "info") : ""}</span></li>`).join("");
    const cannot = s.cannot.map((c) => `<li class="mw-item mw-item--stack b61-cannot"><span class="mw-mark" aria-hidden="true">${ic("minus")}</span><span><strong>${esc(L(c.text))}</strong><small>${esc(t("why"))}：${esc(L(c.why))}${c.path ? " · " + esc(t("path")) + "：" + esc(L(c.path)) : ""}</small></span></li>`).join("");
    return `<div class="b61-lists">${s.can.length ? `<section><h4>${ic("check")}${esc(t("canNow"))}</h4><ul class="mw-items b61-items">${can}</ul></section>` : ""}${s.cannot.length ? `<section><h4>${ic("minus")}${esc(t("cannot"))}</h4><ul class="mw-items b61-items b61-items--muted">${cannot}</ul></section>` : ""}</div>`;
  }
  function account(s) {
    if (s.state === "blocked") return K.renderAlert({ tone: "warning", title: t("blockedT"), body: L(s.blocked), actions: [{ label: t("blockedAct"), variant: "secondary", size: "sm" }] });
    if (s.state !== "connected") return `<div class="settings-connector-actions">${btn(t("connect"), { variant: "primary", icon: "link", attrs: { "data-act": "sim" } })}${btn(t("connectMore"), { variant: "ghost", attrs: { "data-act": "sim" } })}</div>`;
    return `<article class="mw-card connection-facts" data-slot="card"><div class="mw-card__panel"><div class="settings-setting-row"><span class="setting-copy"><strong>${esc(t("acct"))}</strong></span><span class="setting-value"><strong>${esc(L(s.account))}</strong></span></div><div class="settings-setting-row"><span class="setting-copy"><strong>${esc(t("reach"))}</strong></span><span class="setting-value">${K.renderStatusMark({ label: t("reachOk"), tone: "done", state: "connected" })}</span></div></div></article>`;
  }
  function row(s, withLists = true) {
    const open = ui.open.diff === s.id;
    const body = `<div class="settings-connector-panel">${account(s)}${withLists ? canList(s) : ""}</div>`;
    return `<div class="settings-connection-item" id="svc-${s.id}" data-connection-item data-open="${open}">
      <div class="settings-connection-row">${mark(s)}<div class="settings-connection-row__identity"><strong id="svc-${s.id}-name">${esc(s.name)}</strong><small>${esc(caption(s))}</small></div>${stateOf(s)}${btn(s.name, { variant: "ghost", icon: "chevron-down", iconOnly: true, className: "settings-connection-item__toggle", attrs: { "data-act": "open", "data-v": s.id, "aria-expanded": String(open) } })}</div>
      <div class="settings-connection-item__fold" role="region" aria-labelledby="svc-${s.id}-name"><div class="settings-connection-item__clip"><div class="settings-connection-item__body settings-connector-flow">${open ? body : ""}</div></div></div></div>`;
  }
  const visible = () => D.services.filter((s) => ui.filter === "all" || usesOf(s).includes(ui.filter)).filter((s) => P.b !== "diff" || s.id !== "brave" || ui.filter === "search" || ui.filter === "all");
  function serviceList(withLists = true) {
    return D.groups.map(([g, name]) => {
      const rows = visible().filter((s) => s.group === g);
      return rows.length ? `<section class="settings-connector-subgroup"><h3>${esc(L(name))}</h3>${rows.map((s) => row(s, withLists)).join("")}</section>` : "";
    }).join("");
  }
  const filters = () => isNew(`<div class="b61-filters">${K.renderToggleGroup({ label: t("useFilter"), items: [["all", t("f_all")], ...Object.keys(D.uses).map((u) => [u, useName(u)])].map(([v, label]) => ({ value: v, label, current: ui.filter === v, attrs: { "data-act": "filter", "data-v": v } })) })}</div>`, P.l === "zh" ? "用途筛选（切换组的新用法：组件板只有两三项的切换组，这里是一排可横向滚的用途）" : "Use filter (a wider toggle group that scrolls sideways)");
  const searchBox = () => `<label class="settings-connector-search"><span class="mw-sr-only">${esc(t("find"))}</span>${K.renderInput({ placeholder: t("find"), type: "search" })}</label>`;
  const partial = () => (P.st === "partial" ? K.renderAlert({ tone: "warning", title: t("partialT"), body: t("partialB"), actions: [{ label: t("retry"), variant: "secondary", size: "sm" }] }) : "");
  function matrix() {
    const uses = Object.keys(D.uses);
    const cell = (s, u) => {
      if (!usesOf(s).includes(u)) return `<td class="b61-cell b61-cell--no"><span class="mw-sr-only">${esc(t("none"))}</span><span aria-hidden="true">·</span></td>`;
      const live = s.state === "connected";
      return `<td class="b61-cell">${K.renderStatusMark({ label: live ? t("can") : t("needConnect"), tone: live ? "done" : "quiet", icon: live ? "check" : "link", plain: !live })}</td>`;
    };
    const table = `<div class="b61-matrix" role="region" aria-label="${esc(t("byUse"))}" tabindex="0"><table class="mw-table"><thead><tr><th scope="col">${esc(t("n_connections"))}</th>${uses.map((u) => `<th scope="col">${ic(D.uses[u].icon)} ${esc(useName(u))}</th>`).join("")}</tr></thead><tbody>${visible().map((s) => `<tr><th scope="row">${mark(s)}<span>${esc(s.name)}</span></th>${uses.map((u) => cell(s, u)).join("")}</tr>`).join("")}</tbody></table></div>`;
    const stacked = `<div class="b61-matrix-narrow">${uses.map((u) => { const rows = visible().filter((s) => usesOf(s).includes(u)); return `<section class="settings-connector-subgroup"><h3>${ic(D.uses[u].icon)} ${esc(useName(u))}</h3><ul class="mw-items b61-items">${rows.map((s) => `<li class="mw-item">${mark(s)}<span><strong>${esc(s.name)}</strong></span><span class="mw-item__end">${s.state === "connected" ? K.renderStatusMark({ label: t("can"), tone: "done", icon: "check" }) : K.renderStatusMark({ label: t("needConnect"), tone: "quiet", icon: "link", plain: true })}</span></li>`).join("")}</ul></section>`; }).join("")}</div>`;
    return `<p class="b61-lead">${esc(t("matrixLead"))}</p>${isNew(table, P.l === "zh" ? "按用途的对照表（组件板有 mw-table，这里的格子用状态标记、首列带服务标识）" : "Use matrix (mw-table with status marks)")}${stacked}`;
  }
  function picker() {
    const cands = [["github", "p_github", "connected"], ["linear", "p_linear", "available"], ["jira", "p_jira", "available"]];
    const rows = cands.map(([id, k, st]) => {
      const name = id === "jira" ? "Jira" : svc(id).name, chosen = ui.picked === id;
      return `<li class="mw-item mw-item--stack b61-pick${chosen ? " is-picked" : ""}"><span class="settings-connector-mark settings-connector-mark--fallback" aria-hidden="true">${esc(name[0])}</span><span><strong>${esc(name)} ${st === "connected" ? K.renderStatusMark({ label: t("c_connected"), tone: "done", state: "connected" }) : ""}</strong><small>${esc(t(k))}</small></span><span class="mw-item__end">${chosen ? K.renderStatusMark({ label: t("picked", { s: name }), tone: "done", icon: "check" }) : btn(st === "connected" ? t("pickUse") : t("pickNeedConn"), { variant: st === "connected" ? "primary" : "secondary", attrs: { "data-act": "pick", "data-v": id } })}</span></li>`;
    }).join("");
    return isNew(`<section class="mw-card b61-picker" aria-labelledby="pkT"><h3 id="pkT">${ic("tag")} ${esc(t("pickT"))}</h3><p>${esc(t("pickB"))}</p><ul class="mw-items b61-items">${rows}</ul></section>`, P.l === "zh" ? "原处的同类对比卡（第 13 批「原处的连接卡」加一列候选）" : "In-place compare card (13's connection card with candidates)");
  }
  function diffPage() {
    let body;
    if (P.s === "A") body = `<div class="b61-tools">${searchBox()}</div>${filters()}${partial()}<div class="settings-connection-list">${serviceList()}</div>`;
    else if (P.s === "B") body = `<div class="b61-tools">${searchBox()}${K.renderToggleGroup({ label: t("useFilter"), items: [["service", t("byService")], ["use", t("byUse")]].map(([v, label]) => ({ value: v, label, current: ui.view === v, attrs: { "data-act": "view", "data-v": v } })) })}</div>${partial()}${ui.view === "use" ? matrix() : `<div class="settings-connection-list">${serviceList()}</div>`}`;
    else body = `${picker()}<div class="b61-tools">${searchBox()}</div>${partial()}<div class="settings-connection-list">${serviceList(false)}</div>`;
    return frame("connections", t("h_conn"), t("lead_conn"), body);
  }

  /* ---------- ② default web search ---------- */
  const sources = () => (P.st === "only" ? D.search.sources.filter((s) => s.id === "anysearch") : D.search.sources);
  const srcName = (id) => L(D.search.sources.find((s) => s.id === id).name);
  const broken = () => P.st === "broken" && ui.def === "brave";
  function sourceRows(compact) {
    return `<ul class="mw-items b61-items b61-sources" role="radiogroup" aria-label="${esc(t("defaultIs"))}">${sources().map((s) => {
      const on = ui.def === s.id, can = s.state === "ok";
      const state = on ? (broken() ? K.renderStatusMark({ label: P.l === "zh" ? "密钥被拒" : "Key rejected", tone: "blocked", icon: "circle-alert" }) : K.renderStatusMark({ label: t("isDefault"), tone: "done", icon: "check" }))
        : can ? btn(t("changeTo"), { attrs: { "data-act": "def", "data-v": s.id } }) : btn(t("connect"), { variant: "ghost", icon: "link", attrs: { "data-act": "sim" } });
      return `<li class="mw-item mw-item--stack${on ? " is-picked" : ""}" role="radio" aria-checked="${on}"><span class="mw-mark" aria-hidden="true">${ic(s.id === "anysearch" ? "globe" : "search")}</span><span><strong>${esc(L(s.name))}${s.account ? ` · <span class="b61-muted">${esc(L(s.account))}</span>` : ""}</strong>${compact ? "" : `<small>${esc(L(s.note))}</small>`}</span><span class="mw-item__end">${state}</span></li>`;
    }).join("")}</ul>${P.st === "only" ? `<p class="b61-lead">${esc(t("onlyHint"))}</p>` : ""}`;
  }
  const brokenAlert = () => (broken() ? K.renderAlert({ tone: "danger", role: "alert", title: t("brokenT"), body: t("brokenB"), actions: [{ label: t("replaceKey"), variant: "primary", size: "sm" }, { label: t("useBuiltin"), variant: "secondary", size: "sm", attrs: { "data-act": "def", "data-v": "anysearch" } }] }) : "");
  const facts = () => `<dl class="mw-facts b61-facts"><dt>${esc(t("whoUses"))}</dt><dd>${esc(L(D.search.users))}</dd><dt>${esc(P.l === "zh" ? "最近一次" : "Last search")}</dt><dd>${esc(t("lastUse", { s: srcName(ui.def) }))}</dd></dl>`;
  function searchPage() {
    if (P.s === "A") {
      const sec = `<section class="mw-card b61-search" aria-labelledby="wsT"><header class="b61-search__head"><h2 id="wsT">${ic("search")} ${esc(t("h_search"))}</h2><p>${esc(t("lead_search"))}</p></header>${brokenAlert()}${sourceRows(false)}${facts()}<div class="settings-connector-actions">${btn(t("connectSearch"), { variant: "ghost", icon: "plus", attrs: { "data-act": "sim" } })}</div></section>`;
      return frame("connections", t("h_conn"), t("lead_conn"), `${sec}<div class="settings-connection-list">${serviceList()}</div>`);
    }
    if (P.s === "B") return frame("search", t("h_search"), t("lead_search"), `${brokenAlert()}<section class="settings-section"><h2 class="b61-h2">${esc(t("defaultIs"))}</h2>${sourceRows(false)}</section>${facts()}<div class="settings-connector-actions">${btn(t("connectSearch"), { variant: "ghost", icon: "plus", attrs: { "data-act": "sim" } })}</div>`);
    ui.open.diff = ui.open.diff === "github" ? "brave" : ui.open.diff;
    const line = `<p class="b61-nowline">${ic("search")}<span>${esc(t("nowUses", { s: srcName(ui.def) }))}</span>${btn(t("change"), { variant: "link", attrs: { "data-act": "open", "data-v": "brave" } })}</p>`;
    return frame("connections", t("h_conn"), t("lead_conn"), `${line}${brokenAlert()}<div class="settings-connection-list">${serviceList()}</div>`);
  }

  /* ---------- ③ suggestions, reached by the assistant (round 2, user 2026-11-18: "通过个人助理对话主动式触达") ---------- */
  // Interaction cards are drawn the way design-system interaction.ts draws them (renderInteractionOperation / Question / NextSteps);
  // the kit has their styles (.mw-ix-*) but not the functions, so the three helpers below copy their markup.
  const R = (a) => K.renderButton({ label: a.label, variant: a.variant || "secondary", size: a.size, icon: a.icon, iconOnly: a.iconOnly, attrs: a.attrs });
  const actRow = (list, end) => (list && list.length ? `<div class="mw-ix-actions${end ? " mw-ix-actions--end" : ""}">${list.map(R).join("")}</div>` : "");
  const dl = (rows) => rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  const ixHead = (id, kicker, title, glyph, badgeHtml = "", about = "") => `<header class="mw-ix-head"><div class="mw-ix-heading"><span class="mw-ix-kicker">${ic(glyph)}<span>${esc(kicker)}</span></span><h3 id="${id}-title">${esc(title)}</h3>${about ? `<p class="mw-ix-about">${esc(about)}</p>` : ""}</div>${badgeHtml || '<span class="mw-ix-badge"></span>'}</header>`;
  const ixBadge = (label, tone) => `<span class="mw-ix-badge" data-tone="${tone}">${K.renderStateRing({ state: { quiet: "idle", waiting: "answer", progress: "doing", done: "done", failed: "failed" }[tone] })}${esc(label)}</span>`;
  const evid = (label, rows) => `<details class="mw-ix-evidence"><summary>${esc(label)}</summary><dl>${dl(rows)}</dl></details>`;
  const option = (r, picked) => `<button type="button" class="mw-ix-option" aria-pressed="${picked}" data-act="toggle" data-v="${r.id}"><span class="mw-ix-option__top"><span class="mw-ix-option__title">${ic(r.next === "connection" ? "link" : r.next === "role" ? "user" : "sparkles")} ${esc(L(r.title))}</span>${r.conf === "high" ? `<span class="mw-ix-tag">${esc(t("conf_high"))}</span>` : ""}<span class="mw-ix-option__check" aria-hidden="true">${ic("check")}</span></span><span class="mw-ix-option__desc">${esc(L(r.why))} · ${r.evidence.map((p) => esc(p)).join(" ")}</span></button>`;
  const top3 = () => D.rec.filter((r) => ["skill-test", "conn-github", "role-review"].includes(r.id));
  const me = (txt) => `<div class="b61-msg b61-msg--me"><p class="b61-bubble">${esc(txt)}</p></div>`;
  const ai = (html) => `<div class="b61-msg"><span class="b61-av" aria-hidden="true">${ic("sparkles")}</span><div class="b61-msgbody">${html}</div></div>`;
  const say = (txt) => `<p class="b61-say">${esc(txt)}</p>`;
  const evRows = (list) => list.map((r) => [L(r.title), r.evidence.join("、") + " · " + L(r.why)]);
  const quiet = () => `<p class="b61-quiet">${ic("info")}<span>${esc(t("quietNote"))}</span></p>`;
  function confirmRows(list) {
    return list.map((r) => [L(r.title), r.next === "connection" ? t("cf_conn") : r.next === "role" ? `${r.pack} · ${t("cf_role")}` : `${r.pack} · ${t("auto")}`]);
  }
  function resultCard(list, failed) {
    const ok = list.filter((r) => !(failed && r.next === "connection"));
    const body = failed ? t("res_partial") : t("res_body");
    const conn = list.find((r) => r.next === "connection");
    const connCard = conn && !failed ? `<article class="mw-ix-card mw-ix-operation b61-conncard" aria-labelledby="cc-title">${ixHead("cc", t("conn_kicker"), t("conn_title"), "link", ixBadge(t("waiting"), "waiting"))}<p class="mw-ix-impact">${ic("info")}<span>${esc(t("conn_body"))}</span></p>${actRow([{ label: t("conn_go"), variant: "primary", icon: "external", attrs: { "data-act": "sim" } }, { label: t("cancel"), variant: "ghost", attrs: { "data-act": "sim" } }])}</article>` : "";
    return `<section class="mw-ix-result" tabindex="-1"><span class="mw-ix-result__mark">${K.renderStateRing({ state: failed ? "failed" : "done" })}</span><div class="mw-ix-result__body"><h4>${esc(t(failed ? "res_title_partial" : "res_title", { n: ok.length }))}</h4><p>${esc(body)}</p>${actRow([{ label: t("undo"), variant: "secondary", icon: "undo", attrs: { "data-act": "undoall" } }, { label: t("seeIt"), variant: "ghost", attrs: { "data-act": "sim" } }])}</div></section>${connCard}`;
  }
  function bundleCard() {
    // A: one message on arrival, one operation card holding the picks.
    const list = top3(), picked = list.filter((r) => !ui.unpicked.includes(r.id));
    const kicker = t("kicker_rec");
    if (P.st === "scanning") return `<article class="mw-ix-card mw-ix-operation" aria-labelledby="bd-title">${ixHead("bd", kicker, t("scanTitle"), "sparkles", ixBadge(t("reading"), "progress"))}<p class="mw-ix-status" role="status"><span class="mw-spinner" aria-hidden="true"></span>${esc(t("scanStep"))}</p>${actRow([{ label: t("stop"), variant: "ghost", attrs: { "data-act": "sim" } }])}</article>`;
    const banner = P.st === "partial" ? `<div class="mw-ix-banner" data-tone="waiting"><p>${esc(t("gapsB"))}</p>${actRow([{ label: t("allowFolder"), attrs: { "data-act": "sim" } }])}</div>` : "";
    if (ui.stage === "done" || ui.stage === "failed") return `<article class="mw-ix-card mw-ix-operation" aria-labelledby="bd-title">${ixHead("bd", kicker, t("bundleTitle", { n: picked.length }), "sparkles", ixBadge(ui.stage === "failed" ? t("partDone") : t("doneBadge"), ui.stage === "failed" ? "failed" : "done"))}${resultCard(picked, ui.stage === "failed")}</article>`;
    const preview = ui.stage === "confirm" ? `<section class="mw-ix-preview" tabindex="-1" aria-labelledby="bd-preview"><h4 id="bd-preview">${esc(t("previewT"))}</h4><dl>${dl(confirmRows(picked))}</dl><p class="mw-ix-hint">${esc(t("previewNote"))}</p>${actRow([{ label: t("confirmBtn"), variant: "primary", attrs: { "data-act": "confirmall" } }, { label: t("back2"), variant: "ghost", attrs: { "data-act": "backpick" } }], true)}</section>` : "";
    const pick = ui.stage === "confirm" ? "" : `<div class="mw-ix-options" role="group" aria-labelledby="bd-title">${list.map((r) => option(r, !ui.unpicked.includes(r.id))).join("")}</div>${actRow([{ label: t("adoptPicked", { n: picked.length }), variant: "primary", attrs: { "data-act": "reviewpick", disabled: !picked.length || undefined } }, { label: t("later"), variant: "ghost", attrs: { "data-act": "sim" } }])}`;
    return `<article class="mw-ix-card mw-ix-operation" aria-labelledby="bd-title">${ixHead("bd", kicker, t("bundleTitle", { n: list.length }), "sparkles", ixBadge(t("waitYou"), "waiting"), t("bundleAbout"))}${banner}${pick}${preview}${evid(t("evidence"), evRows(list))}</article>`;
  }
  function oneByOne() {
    // B: one question card at a time; answered cards fold to a line.
    const list = top3();
    const done = list.slice(0, ui.step).map((r, i) => `<div class="mw-ix-card mw-ix-question b61-answered"><div class="mw-ix-answered"><dl>${dl([[L(r.title), ui.answers[i] || t("ans_on")]])}</dl>${actRow([{ label: t("undo"), variant: "ghost", attrs: { "data-act": "sim" } }])}</div></div>`).join("");
    if (P.st === "scanning") return bundleCard();
    if (ui.step >= list.length) return `${done}${say(t("allAsked"))}`;
    const r = list[ui.step];
    const failedHere = P.st === "failed" && r.next === "connection";
    const banner = P.st === "partial" && ui.step === 0 ? `<div class="mw-ix-banner" data-tone="waiting"><p>${esc(t("gapsB"))}</p></div>` : failedHere ? `<div class="mw-ix-banner" data-tone="failed"><p>${esc(t("failedB"))}</p>${actRow([{ label: t("retry"), attrs: { "data-act": "sim" } }])}</div>` : "";
    const how = r.next === "skill" ? `<fieldset class="mw-ix-fields"><legend class="mw-sr-only">${esc(t("how"))}</legend><div class="mw-ix-row"><span class="mw-ix-label" id="q-how-label">${esc(t("how"))}</span><div class="mw-choice-group mw-ix-choices" role="radiogroup" aria-labelledby="q-how-label">${[["auto", true], ["manual", false]].map(([k, on]) => `<button type="button" class="mw-choice" role="radio" aria-checked="${on}"><span class="mw-choice__check" aria-hidden="true">${ic("check")}</span><span class="mw-choice__label">${esc(t(k))}</span></button>`).join("")}</div></div></fieldset>` : "";
    const facts = `<dl class="b61-ixfacts">${dl([[t("src"), r.pack || t("cf_conn")], [t("effect"), L(r.effect)], [t("risk"), L(r.risk)]])}</dl>`;
    return `${done}<article class="mw-ix-card mw-ix-question" aria-labelledby="q-title">${ixHead("q", t("kicker_one", { i: ui.step + 1, n: list.length }), t("ask_" + r.next, { t: L(r.title) }), "sparkles", ixBadge(t("waitYou"), "waiting"), L(r.why))}${banner}<form class="mw-ix-form" novalidate>${facts}${how}<footer class="mw-ix-foot"><p class="mw-ix-note">${esc(t("oneNote"))}</p>${actRow([{ label: t("adopt_" + r.next), variant: "primary", attrs: { "data-act": "answer", "data-v": "on" } }, { label: t("notNow"), attrs: { "data-act": "answer", "data-v": "skip" } }, { label: t("never"), variant: "ghost", attrs: { "data-act": "answer", "data-v": "never" } }])}</footer></form>${evid(t("evidence"), evRows([r]))}</article>`;
  }
  function inContext() {
    // C: nothing on arrival; when a request touches it, the reply ends with next steps; picking one opens its confirm card.
    const first = me(t("c_ask"));
    const reply = say(t("c_reply"));
    if (P.st === "scanning") return first + ai(reply + `<p class="mw-ix-status" role="status"><span class="mw-spinner" aria-hidden="true"></span>${esc(t("c_scan"))}</p>`);
    const steps = `<div class="mw-ix-steps" role="group" aria-label="${esc(t("nextSteps"))}"><button type="button" class="mw-ix-step" data-act="ctx" data-v="skill-test"><span class="mw-ix-step__glyph" aria-hidden="true">${ic("arrow")}</span><span>${esc(t("c_step1"))}</span></button><button type="button" class="mw-ix-step" data-secondary data-act="ctx" data-v="conn-github"><span class="mw-ix-step__glyph" aria-hidden="true">${ic("arrow")}</span><span>${esc(t("c_step2"))}</span></button></div>`;
    let card = "";
    const r = D.rec.find((x) => x.id === ui.ctx);
    if (r && ui.stage === "confirm") card = `<article class="mw-ix-card mw-ix-operation" aria-labelledby="cx-title">${ixHead("cx", t("kicker_rec"), t("ask_" + r.next, { t: L(r.title) }), "sparkles", ixBadge(t("waitYou"), "waiting"), L(r.why))}<p class="mw-ix-target">${ic("target")}<span>${esc(t("forProject"))}</span><strong>${esc(L(D.project))}</strong><span class="mw-ix-version">${esc(r.pack || "")}</span></p>${P.st === "partial" ? `<div class="mw-ix-banner" data-tone="waiting"><p>${esc(t("gapsB"))}</p></div>` : ""}<section class="mw-ix-preview" aria-labelledby="cx-preview"><h4 id="cx-preview">${esc(t("previewT"))}</h4><dl>${dl(confirmRows([r]))}</dl>${actRow([{ label: t("confirmBtn"), variant: "primary", attrs: { "data-act": "confirmctx" } }, { label: t("cancel"), variant: "ghost", attrs: { "data-act": "cancelctx" } }], true)}</section>${evid(t("evidence"), evRows([r]))}</article>`;
    if (r && (ui.stage === "done" || ui.stage === "failed")) card = `<article class="mw-ix-card mw-ix-operation" aria-labelledby="cx-title">${ixHead("cx", t("kicker_rec"), L(r.title), "sparkles", ixBadge(ui.stage === "failed" ? t("partDone") : t("doneBadge"), ui.stage === "failed" ? "failed" : "done"))}${resultCard([r], ui.stage === "failed")}</article>`;
    const more = `<p class="b61-more">${K.renderButton({ label: t("c_more", { n: D.rec.length }), variant: "link", attrs: { "data-act": "sim" } })}</p>`;
    return first + ai(reply + steps + card + more);
  }
  function emptyThread() {
    const asked = me(t("ask_what"));
    const answer = P.st === "empty" ? say(t("emptyB")) : `${say(t("noWsB"))}${actRow([{ label: t("chooseFolder"), variant: "primary", attrs: { "data-act": "sim" } }])}`;
    return quiet() + asked + ai(answer);
  }
  function recPage() {
    const earlier = me(t("earlier_me")) + ai(say(t("earlier_ai")));
    let thread;
    if (P.st === "empty" || P.st === "noworkspace") thread = earlier + emptyThread();
    else if (P.s === "A") thread = earlier + ai(say(t("a_intro")) + bundleCard());
    else if (P.s === "B") thread = earlier + ai(say(t("b_intro")) + oneByOne());
    else thread = earlier + inContext();
    const dot = P.s !== "C" && !["empty", "noworkspace"].includes(P.st);
    const pane = `<aside class="b61-assist" aria-label="${esc(t("assistant"))}"><header class="b61-assist__head">${ic("sparkles")}<strong>${esc(t("assistant"))}</strong><span>${esc(L(D.project))}</span>${K.renderButton({ label: t("assistOff"), variant: "ghost", icon: "settings", iconOnly: true, attrs: { "data-act": "sim" } })}</header><div class="b61-thread">${thread}</div><footer class="b61-compose">${K.renderInput({ placeholder: t("composer") })}</footer></aside>`;
    const home = `<div class="b61-project"><header class="b61-project__bar"><strong>${esc(L(D.project))}</strong><span>${esc(t("projHome"))}</span><span class="b61-dock">${ic("sparkles")}${esc(t("assistant"))}${dot ? '<span class="b61-dot" aria-label="1"></span>' : ""}</span></header><div class="b61-project__paper"><p class="b61-lead">${esc(t("homeNote"))}</p></div></div>`;
    return `<div class="b61-work">${home}${pane}</div>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function strip() {
    const el = document.getElementById("strip");
    if (shot) { el.hidden = true; return; }
    const tg = (label, key, values) => K.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    el.innerHTML = `<b>${esc(t("title"))}</b>${badge(t("pending"), "warning")}
      <span class="b61-field">${esc(t("blk"))}${tg(t("blk"), "b", [["diff", t("b_diff")], ["search", t("b_search")], ["rec", t("b_rec")]])}</span>
      <span class="b61-field">${esc(t("sch"))}${tg(t("sch"), "s", ["A", "B", "C"].map((s) => [s, s]))}<small>${esc(t("s" + P.s + "_" + P.b))}</small></span>
      <label class="b61-field">${esc(t("st"))}<select class="mw-select" data-slot="select" id="pSt">${STATES[P.b].map((s) => `<option value="${s}"${P.st === s ? " selected" : ""}>${esc(t("st_" + s))}</option>`).join("")}</select></label>
      <span class="b61-field">${esc(t("lang"))}${tg(t("lang"), "l", [["zh", "中文"], ["en", "English"]])}</span>
      <span class="b61-field">${esc(t("theme"))}${tg(t("theme"), "t", [["light", t("light")], ["dark", t("dark")]])}</span>
      <label class="b61-field"><input type="checkbox" id="pMark"${P.mark ? " checked" : ""}> ${esc(t("mark"))}</label>
      ${btn(t("reset"), { variant: "ghost", icon: "undo", attrs: { id: "pReset" } })}`;
  }
  function render() {
    const root = document.documentElement;
    root.lang = P.l === "zh" ? "zh-CN" : "en";
    root.dataset.theme = P.t; root.dataset.resolvedTheme = P.t;
    try { localStorage.setItem("molis-work:theme", P.t); } catch { /* no storage */ }
    document.body.className = "settings-page project-preferences-page global-preferences-page b61 " + (shot ? "b61-shot" : "b61-proto") + (P.mark ? " b61-marked" : "");
    document.title = t("title");
    strip();
    const page = P.b === "diff" ? diffPage() : P.b === "search" ? searchPage() : recPage();
    document.getElementById("app").innerHTML = page;
    for (const m of document.querySelectorAll(".mw-anchored-menu")) m.addEventListener("click", () => { try { m.hidePopover(); } catch { /* closed */ } });
  }
  document.addEventListener("click", (e) => {
    const set = e.target.closest("[data-set]");
    if (set) { P[set.dataset.set] = set.dataset.v; if (set.dataset.set === "b" || set.dataset.set === "s") { if (!STATES[P.b].includes(P.st)) P.st = STATES[P.b][0]; } persist(); fresh(); render(); return; }
    if (e.target.closest("#pReset")) { P = clone(DEF); persist(); fresh(); render(); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    e.preventDefault();
    const v = a.dataset.v;
    switch (a.dataset.act) {
      case "open": ui.open.diff = ui.open.diff === v ? null : v; break;
      case "filter": ui.filter = v; break;
      case "view": ui.view = v; break;
      case "pick": ui.picked = v; toast(t("picked", { s: v === "jira" ? "Jira" : svc(v).name })); break;
      case "def": ui.def = v; if (P.st === "broken") P.st = "connected"; toast(v === "brave" ? t("switchedToast") : t("nowUses", { s: srcName(v) })); break;
      case "adopt": ui.adopt[v] = D.rec.find((r) => r.id === v).next === "connection" ? (v === "conn-notion" ? "failed" : "done") : "confirm"; ui.recOpen = v; break;
      case "confirm": ui.adopt[v] = "done"; toast(t("adoptedT", { t: L(D.rec.find((r) => r.id === v).title) })); break;
      case "cancel": case "undo": delete ui.adopt[v]; break;
      case "pref": ui.prefs.push(v); break;
      case "unpref": ui.prefs = ui.prefs.filter((x) => x !== v); break;
      case "recopen": ui.recOpen = v; break;
      case "save": ui.saved = true; toast(t("saved")); break;
      case "toggle": ui.unpicked = ui.unpicked.includes(v) ? ui.unpicked.filter((x) => x !== v) : [...ui.unpicked, v]; break;
      case "reviewpick": ui.stage = "confirm"; break;
      case "backpick": ui.stage = "pick"; break;
      case "confirmall": ui.stage = "done"; toast(t("res_title", { n: top3().filter((r) => !ui.unpicked.includes(r.id)).length })); break;
      case "undoall": ui.stage = "pick"; toast(t("undo")); break;
      case "answer": ui.answers[ui.step] = v === "on" ? t("ans_on") : v === "skip" ? t("notNow") : t("never"); ui.step += 1; break;
      case "ctx": ui.ctx = v; ui.stage = "confirm"; break;
      case "confirmctx": ui.stage = "done"; break;
      case "cancelctx": ui.ctx = null; ui.stage = "pick"; break;
      default: toast(t("pv_note", { x: a.textContent.trim() || a.getAttribute("aria-label") || "" })); return;
    }
    render();
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "pSt") { P.st = e.target.value; persist(); fresh(); render(); }
    if (e.target.id === "pMark") { P.mark = e.target.checked; persist(); render(); }
  });
  render();
})();
