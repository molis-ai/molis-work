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
      sA_rec: "A 对话框（分组卡片、就地确认）", sB_rec: "B 项目设置里一页（列表＋详情）", sC_rec: "C 到达页「三件事」＋全部建议",
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
      pv_note: "原型：{x}",
    },
    en: {
      title: "Batch 61 specimens · service differences, default search, suggestions", blk: "Block", b_diff: "① Service differences", b_search: "② Default web search", b_rec: "③ Suggestions & adopting", sch: "Option", st: "State", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", mark: "Mark new board parts", reset: "Reset", pending: "Your pick",
      st_normal: "Normal", st_filter: "Filtered by use", st_gaps: "Little works (gaps)", st_blocked: "Needs admin approval", st_partial: "Part not read", st_builtin: "Built-in source", st_connected: "Your connected service", st_broken: "Default source failing", st_only: "Only the built-in", st_switched: "Default just changed",
      st_scanning: "Reading the project", st_confirm: "Confirm before adopting", st_adopted: "Adopted, in effect", st_failed: "Adopting failed", st_empty: "Nothing to add", st_noworkspace: "Project has no folder",
      sA_diff: "A Uses in the row; open for can / can't", sB_diff: "B By service / by use table", sC_diff: "C Compare only when choosing",
      sA_search: "A A section atop Service connections", sB_search: "B Its own settings page", sC_search: "C “Make default” in the service row",
      sA_rec: "A Dialog (grouped cards, confirm in place)", sB_rec: "B Project settings page (list + detail)", sC_rec: "C “Three things” on arrival + all",
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
      adopt: {}, prefs: [], saved: false };
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

  /* ---------- ③ suggestions and adopting ---------- */
  const visibleRecs = () => D.rec.filter((r) => !ui.prefs.includes(r.id));
  const adoptLabel = (r) => t("adopt_" + r.next);
  function recDetail(r) {
    const st = ui.adopt[r.id];
    if (st === "done") return `<div class="b61-done">${K.renderAlert({ tone: "success", title: t("adoptedT", { t: L(r.title) }), body: t("adoptedB"), actions: [{ label: t("seeIt"), variant: "secondary", size: "sm" }, { label: t("undo"), variant: "ghost", size: "sm", attrs: { "data-act": "undo", "data-v": r.id } }] })}</div>`;
    const meta = `<dl class="mw-facts b61-facts b61-facts--row"><dt>${esc(t("effect"))}</dt><dd>${esc(L(r.effect))}</dd><dt>${esc(t("needs"))}</dt><dd>${esc(L(r.needs))}</dd><dt>${esc(t("risk"))}</dt><dd>${esc(L(r.risk))}</dd></dl>`;
    const ev = `<p class="b61-evidence"><span>${esc(t("evidence"))}</span>${r.evidence.map((p) => `<code>${esc(p)}</code>`).join("")}</p>`;
    let foot;
    if (st === "confirm") {
      foot = `<div class="b61-confirm" role="group" aria-labelledby="cf-${r.id}"><h4 id="cf-${r.id}">${esc(t("confirmT", { t: L(r.title) }))}</h4><article class="mw-card connection-facts" data-slot="card"><div class="mw-card__panel">${[["src", r.pack ? r.pack.split(" · ")[0] : ""], ["ver", r.pack || ""], ["tools", t("toolsV")]].map(([k, v]) => `<div class="settings-setting-row"><span class="setting-copy"><strong>${esc(t(k))}</strong></span><span class="setting-value">${esc(v)}</span></div>`).join("")}</div></article>${K.renderRadioGroup({ legend: t("how"), name: "how-" + r.id, items: [{ value: "auto", label: t("auto"), checked: true }, { value: "manual", label: t("manual") }] })}<div class="settings-connector-actions">${btn(t("confirmBtn"), { variant: "primary", attrs: { "data-act": "confirm", "data-v": r.id } })}${btn(t("cancel"), { variant: "ghost", attrs: { "data-act": "cancel", "data-v": r.id } })}</div></div>`;
    } else if (st === "failed") {
      foot = K.renderAlert({ tone: "warning", title: t("failedT"), body: t("failedB"), actions: [{ label: t("keep"), variant: "secondary", size: "sm" }, { label: t("connect"), variant: "ghost", size: "sm" }] });
    } else {
      const menu = { id: "nm-" + r.id, label: t("notThis"), icon: "more", items: ["ignore", "already", "never"].map((k) => K.renderMenuItem({ label: t(k), attrs: { "data-act": "pref", "data-v": r.id } })).join("") };
      foot = K.renderNowBlock({ status: "", actions: btn(adoptLabel(r), { variant: "primary", icon: r.next === "connection" ? "link" : "check", attrs: { "data-act": "adopt", "data-v": r.id } }), menu, className: "b61-now" });
    }
    return `<p class="b61-why">${esc(L(r.why))}</p>${ev}${meta}${foot}`;
  }
  function recCard(r) {
    return `<article class="mw-card b61-rec${ui.adopt[r.id] === "done" ? " is-done" : ""}" aria-labelledby="rc-${r.id}"><header><h4 id="rc-${r.id}">${esc(L(r.title))}</h4>${badge(t("conf_" + r.conf), r.conf === "high" ? "success" : "neutral")}</header>${recDetail(r)}</article>`;
  }
  function scanSummary() {
    const found = `<p class="b61-chips"><span>${esc(t("found"))}</span>${D.scan.found.map((f) => badge(L(f))).join("")}</p>`;
    const have = `<p class="b61-chips b61-chips--muted"><span>${esc(t("have"))}</span>${D.scan.have.map((f) => `<code>${esc(L(f))}</code>`).join("")}</p>`;
    const gaps = P.st === "partial" ? K.renderAlert({ tone: "warning", title: t("gapsT"), body: t("gapsB"), actions: [{ label: P.l === "zh" ? "给权限" : "Allow folder", variant: "secondary", size: "sm" }] }) : "";
    return `<div class="b61-scan">${found}${have}${gaps}</div>`;
  }
  function recGroups(cards = true) {
    const cats = ["skills", "connections", "roles", "hooks", "commands"];
    return cats.map((c) => {
      const rows = visibleRecs().filter((r) => r.cat === c);
      const body = rows.length ? rows.map(cards ? recCard : (r) => r).join("") : `<p class="b61-nosource">${ic("info")}<span>${esc(L(D.noSource[c] || { zh: "", en: "" }))}</span></p>`;
      return `<section class="b61-cat"><h3>${esc(t("cat_" + c))}${rows.length ? ` <span class="b61-count">${rows.length}</span>` : ""}</h3>${body}</section>`;
    }).join("") + (ui.prefs.length ? `<details class="mw-collapsible b61-prefs" data-slot="collapsible"><summary>${esc(t("hidden", { n: ui.prefs.length }))}</summary><div class="mw-collapsible__body">${ui.prefs.map((id) => `<p class="b61-prefline"><span>${esc(L(D.rec.find((r) => r.id === id).title))}</span>${btn(t("showAgain"), { variant: "ghost", attrs: { "data-act": "unpref", "data-v": id } })}</p>`).join("")}</div></details>` : "");
  }
  function recStateBody() {
    if (P.st === "scanning") return `<div class="b61-scanning" role="status">${K.renderStatusMark({ label: t("scanning"), tone: "progress", state: "running" })}<p class="b61-lead">${esc(t("scanStep"))}</p>${K.renderSkeleton ? K.renderSkeleton({ lines: 4 }) : ""}</div>`;
    if (P.st === "empty") return K.renderEmpty({ icon: "check", title: t("emptyT"), body: t("emptyB"), action: `<div class="settings-connector-actions">${btn(t("again"), { attrs: { "data-act": "sim" } })}</div>` });
    if (P.st === "noworkspace") return K.renderEmpty({ icon: "folder", title: t("noWsT"), body: t("noWsB"), action: `<div class="settings-connector-actions">${btn(t("chooseFolder"), { variant: "primary", attrs: { "data-act": "sim" } })}</div>` });
    return null;
  }
  const projectBackdrop = (inner) => `<div class="b61-project"><header class="b61-project__bar"><strong>${esc(L(D.project))}</strong><span>${esc(t("projHome"))}</span></header><div class="b61-project__paper">${inner}</div></div>`;
  function recDialog() {
    const special = recStateBody();
    const body = special ?? `${scanSummary()}${recGroups()}`;
    const footer = special ? btn(t("done"), { variant: "primary", attrs: { "data-act": "sim" } }) : `${ui.saved ? K.renderStatusMark({ label: t("saved"), tone: "done", icon: "check" }) : btn(t("save"), { variant: "secondary", icon: "save", attrs: { "data-act": "save" } })}${btn(t("done"), { variant: "primary", attrs: { "data-act": "sim" } })}`;
    return `<div class="b61-cover"><dialog open class="mw-dialog mw-dialog--form b61-dialog" aria-labelledby="rdT"><form method="dialog" class="mw-form mw-dialog__shell"><header class="mw-form__header"><div><h2 id="rdT">${esc(t("recTitle", { p: L(D.project) }))}</h2><p>${esc(t("recLead"))}</p></div>${btn(t("cancel"), { variant: "ghost", icon: "x", iconOnly: true, className: "mw-dialog__close", attrs: { "data-act": "sim" } })}</header><div class="mw-form__body">${body}</div><footer class="mw-form__footer">${footer}</footer></form></dialog></div>`;
  }
  function recPage() {
    if (P.s === "A") return projectBackdrop(`<p class="b61-lead">${esc(P.l === "zh" ? "（项目首页，被对话框盖住）" : "(Project home, under the dialog)")}</p>`) + recDialog();
    if (P.s === "B") {
      const special = recStateBody();
      if (special) return frame("kit", t("h_rec"), t("lead_rec"), special);
      const list = `<section class="mw-list-detail__list b61-reclist" aria-label="${esc(t("h_rec"))}">${["skills", "connections", "roles", "hooks", "commands"].map((c) => { const rows = visibleRecs().filter((r) => r.cat === c); return `<div class="b61-listgroup"><h3>${esc(t("cat_" + c))}</h3>${rows.length ? `<ul class="mw-items">${rows.map((r) => K.renderPickRow({ glyph: r.next === "connection" ? "link" : r.next === "role" ? "user" : "sparkles", name: L(r.title), sub: L(r.why), end: ui.adopt[r.id] === "done" ? K.renderStatusMark({ label: P.l === "zh" ? "已启用" : "On", tone: "done", icon: "check" }) : badge(t("conf_" + r.conf), r.conf === "high" ? "success" : "neutral"), current: ui.recOpen === r.id, attrs: { "data-act": "recopen", "data-v": r.id } })).join("")}</ul>` : `<p class="b61-nosource">${esc(L(D.noSource[c]))}</p>`}</div>`; }).join("")}</section>`;
      const r = D.rec.find((x) => x.id === ui.recOpen) || visibleRecs()[0];
      const detail = `<section class="mw-list-detail__detail b61-recdetail" aria-labelledby="rc-${r.id}"><h2 id="rc-${r.id}" class="b61-h2">${esc(L(r.title))} ${badge(t("conf_" + r.conf), r.conf === "high" ? "success" : "neutral")}</h2>${recDetail(r)}</section>`;
      return frame("kit", t("h_rec"), t("lead_rec"), `${scanSummary()}<div class="mw-list-detail b61-ld" data-detail><div class="mw-list-detail__body">${list}${detail}</div></div><div class="settings-connector-actions">${ui.saved ? K.renderStatusMark({ label: t("saved"), tone: "done", icon: "check" }) : btn(t("save"), { icon: "save", attrs: { "data-act": "save" } })}</div>`);
    }
    // C: three things inline on arrival; the rest behind "see all"
    const special = recStateBody();
    const top = visibleRecs().slice(0, 3);
    const rows = top.map((r) => {
      const st = ui.adopt[r.id];
      const end = st === "done" ? `${K.renderStatusMark({ label: P.l === "zh" ? "已启用" : "On", tone: "done", icon: "check" })}${btn(t("undo"), { variant: "ghost", attrs: { "data-act": "undo", "data-v": r.id } })}` : btn(adoptLabel(r), { variant: st ? "secondary" : "primary", attrs: { "data-act": "adopt", "data-v": r.id } });
      const open = st === "confirm" || st === "failed" ? `<div class="b61-inline">${recDetail(r)}</div>` : "";
      return `<li class="mw-item mw-item--stack b61-three"><span class="mw-mark" aria-hidden="true">${ic(r.next === "connection" ? "link" : r.next === "role" ? "user" : "sparkles")}</span><span><strong>${esc(L(r.title))}</strong><small>${esc(L(r.why))} · <code>${esc(r.evidence[0])}</code></small>${open}</span><span class="mw-item__end">${end}</span></li>`;
    }).join("");
    const card = special ? `<section class="mw-card b61-threecard">${special}</section>` : `<section class="mw-card b61-threecard" aria-labelledby="thT"><header><h2 id="thT">${ic("sparkles")} ${esc(t("threeT", { n: top.length }))}</h2><p>${esc(D.scan.read[P.l])}</p></header>${P.st === "partial" ? K.renderAlert({ tone: "warning", title: t("gapsT"), body: t("gapsB") }) : ""}<ul class="mw-items b61-items">${rows}</ul><div class="settings-connector-actions">${btn(t("seeAll", { n: visibleRecs().length }), { variant: "ghost", icon: "chevron-right", attrs: { "data-act": "seeall" } })}</div></section>`;
    return projectBackdrop(isNew(card, P.l === "zh" ? "到达页上的建议卡（到达页已有卡片，这里是新的一张）" : "Suggestion card on arrival (new card)")) + (ui.all ? recDialog() : "");
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
      case "seeall": ui.all = true; break;
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
