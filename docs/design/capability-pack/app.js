// Batch-09 prototype (piece 9-11): the capability pack catalog ("能力包", code `kit`) on the settings page.
// Spec: specs/capability-pack/spec.md. The pack lists five kinds — skills, prompts, roles, tools, MCP — with where each comes from,
// its version and upgrade difference, where it applies, whether it is on and how much it was used. Only skills can be switched here
// (batch 08's three states, its list-and-detail part and its detail block, unchanged); the other four are read here and changed on
// their owner's page. The three schemes differ only in how you reach an entry:
//   A  one catalog: the list-and-detail part with a kind filter (all kinds in one list, grouped by kind)
//   B  overview first: five kind cards that say what needs you, then one kind at a time in the list-and-detail part
//   C  by source: the list grouped by the plugin, pack, connection or server each entry comes from, with a source detail
// Every control is the board's (window.mwKit, ../kit/kit.css, ../kit/settings.css); pack.css only places them. Parts the kit has no
// renderer for (empty state, input, skeleton, toast, item rows) are written with the SDK's own markup. Nothing is written anywhere.
(() => {
  const K = window.mwKit;
  const D = window.KIT_DATA;
  const KEY = "molis-proto.capability-pack.v1";
  const DEF = { s: "A", v: "normal", l: "zh", t: "light" };
  const VIEWS = ["normal", "skill", "prompt", "role", "tool", "mcp", "gone", "partial", "fail", "empty", "many", "loading", "import", "export"];
  const esc = K.escapeHtml;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- words ---------- */
  const T = {
    zh: {
      protoTitle: "能力包目录 · 原型", scheme: "方案", sA: "A 一张目录", sB: "B 先总览", sC: "C 按来源", view: "画面", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置", rec: "推荐 A",
      v_normal: "全部（正常）", v_skill: "技能详情（08 原样）", v_prompt: "提示词详情", v_role: "角色详情", v_tool: "工具详情", v_mcp: "MCP 详情（三种「开」）", v_gone: "主人已卸载", v_partial: "一类没读到", v_fail: "整页读失败", v_empty: "新项目（有的类是空的）", v_many: "条目很多", v_loading: "正在读", v_import: "导入一个文件", v_export: "导出菜单",
      chrome: "全局设置", close: "关闭全局设置", back: "返回项目",
      g_local: "本机", g_personal: "个人", g_ai: "AI", g_tools: "工具与接入", g_system: "系统",
      n_appearance: "界面与语言", n_directories: "本机目录", n_memory: "记忆", n_sync: "同步", n_models: "模型设置", n_assistant: "助理", n_characters: "角色", n_kit: "能力包", n_runtimes: "AI 与执行工具", n_library: "能力库", n_connections: "服务连接", n_access: "对外接入", n_history: "调用记录", n_diagnostics: "诊断",
      h1: "能力包", lead: "助理和 Coding 能用的五类能力都在这里，各自从哪来、在哪生效、用了多少。技能在这里开关；其余几类在这里看，改去它自己的页面。",
      scopeLine: "这个项目：{p}　·　标「个人空间」的在每个项目里都一样",
      k_all: "全部", k_skill: "技能", k_prompt: "提示词", k_role: "角色", k_tool: "工具", k_mcp: "MCP",
      one_skill: "一套做法，告诉 AI 某类事怎么做", one_prompt: "系统和插件交给模型的说明文字", one_role: "带着做事方式和工具名单的 AI 身份", one_tool: "AI 做事时能用的基本动作", one_mcp: "外部服务交给 AI 的工具",
      kindLabel: "按类别看", stLabel: "按状态看", st_all: "全部状态", st_on: "在用", st_off: "没开", st_na: "用不了", search: "找名称、用途或来源", searchLabel: "在能力包里找",
      import: "导入", export: "导出", exportOf: "导出：选一类", summary: "共 {n} 项　·　{na} 项用不了", onlyNa: "只看用不了的", moreOf: "看全部 {n} 个{k}", noMatch: "没有符合的条目",
      listLabel: "全部条目", detailLabel: "条目详情", backAll: "全部条目",
      scope_home: "个人空间", scope_project: "这个项目",
      // states
      w_auto: "自动", w_manual: "仅手动", w_off: "关", w_naFix: "暂时用不了", w_revoked: "已撤销", w_default: "默认", w_mine: "你的版本", w_mineOld: "默认已更新", w_inUse: "在用", w_roleOff: "停用", w_writes: "会写", w_reads: "只读", w_connected: "已连接", w_broken: "断开了", w_deleted: "已删除", w_uninstalled: "已卸载", w_outbound: "对外开着",
      // detail
      d_now: "现在", d_usage: "用量", d_where: "用在哪", d_version: "版本与升级", d_declared: "声明能用的工具", d_declaredNote: "只是说明，不是授权：真正能用什么，由角色的工具名单和动作授权决定。", d_roles: "开放给这些角色",
      d_kitOuter: "能力包另记的", whereNone: "还没有地方用到它",
      u_recent: "近期 {n} 次", u_last: "最近一次 {at}{by}", u_by: " · {by}", u_none: "还没有使用记录", u_lastOnly: "只有最近一次", u_batch61: "次数随第 61 批", u_history: "卸载前近期 {n} 次",
      ur_skill: "按技能的使用记录算，只算保留下来的近期记录。", ur_prompt: "每个提示词只留最近 200 次记录，这里不是总数。", ur_role: "按角色运行记录和提示词记录算，只算近期。", ur_mcp: "按调用记录算，调用记录只保留近期。", ur_tool: "现在只能便宜地取到最近一次；精确次数随第 61 批提供。", ur_history: "名称照卸载前的样子保留。",
      // prompt
      p_default: "用的是默认版 {v}。", p_mine: "用的是你的版本，基于 {base}；默认也是 {base}。", p_mineOld: "用的是你的版本，基于 {base}；默认已更新到 {latest}。", p_noBody: "这里不显示正文。改写、对比和恢复默认都在「提示词」里，从下一轮生效。",
      p_edit: "在提示词里改", p_compare: "对比新的默认", p_ver: "默认 {v}（{src} 带来）", p_verMine: "你的版本基于 {base}；默认现在是 {latest}",
      // role
      r_active: "在这些地方生效", r_activeNone: "现在没有地方用它", r_scopeNote: "生效范围和继承由角色设置给出（第 36 批）。", r_edit: "去角色", r_view: "在 Coding 设置里看", r_ver: "{v} · {decl}", r_new: "新增于 Coding 3.2", r_off: "停用了，不会被选用。",
      // tool
      t_note: "工具不能在这里开关。谁能用它，由角色的工具名单和动作授权决定。", t_origin_system: "系统工具（Prologue SDK）", t_origin_gateway: "平台网关工具", t_origin_subagent: "子代理工具", t_origin_plan: "计划步骤工具", t_ver: "随 Prologue SDK {v}", t_added: "0.38 新增", t_rolesNone: "还没有角色开放它", t_toRoles: "去角色",
      // mcp
      m_title: "开没开：三件事，分开看", m_server: "服务器", m_serverWhat: "服务器有没有在跑、连不连得上", m_out: "给外部客户端", m_outWhat: "哪些外部 AI 工具能连它", m_tools: "工具可用", m_toolsWhat: "它的工具里，有几个登记成动作、能被调用",
      m_on: "开着", m_conn: "已连接", m_broken: "断开了", m_gone: "已删除", m_outN: "开给 {n} 个：{list}", m_outNa: "不适用：这是接进来的服务器", m_toolsN: "{total} 个里开放 {open} 个", m_toolsAll: "{total} 个都已登记", m_toolsNone: "{total} 个都用不了",
      m_toAccess: "对外接入", m_toCodingMcp: "Coding 的 MCP 设置", m_toConn: "服务连接", m_toLibrary: "能力库", m_reconnect: "重新连接", m_skill: "随它装进外部 AI 工具的", m_disc: "上次读清单的差异", m_added: "新增", m_removed: "移除",
      m_ver: "清单版本：{v}", m_noConnect: "列目录只读已存的清单，不会去连服务器。", m_withHost: "随 Molis Work 一起运行",
      // gone
      gone_t: "{owner}已在 {at} 卸载", gone_mcp_t: "{owner}已在 {at} 删除", gone_b: "这一条不再生效，也不会再被用到。下面是卸载前的用量，名称照当时。", gone_add: "重新添加{owner}", gone_export: "导出这条改写",
      // skill (08 block, as the product draws it)
      sk_for: "给谁用", sk_when: "什么时候用", sk_whenNot: "什么时候不用", sk_tools: "工具（声明，不是授权）", sk_conn: "连接器类别", sk_files: "附带文件", sk_excerpt: "正文开头", sk_noTools: "没有声明工具", sk_noFiles: "没有附带文件", sk_runs: "会运行",
      sk_how: "使用方式", sk_offD: "不使用这个技能", sk_autoD: "适用时由 AI 选择", sk_manualD: "只在你点名时使用", sk_open: "打开全文", sk_enabled: "启用记录", sk_used: "最近使用", sk_manage: "管理这个包", sk_enablePlugin: "启用插件", sk_connect: "管理连接",
      sk_why_plugin_disabled: "插件已停用，恢复后沿用当前设置。", sk_why_connection_missing: "还没有连接所需服务。", sk_change_body_changed: "2.0 起正文变了（1.4 → 2.0）", sk_change_added: "2.0 新增", sk_change_none: "装上以后没有升级过",
      sk_trust_host: "随应用提供", ap_assistant: "助理", ap_coding: "Coding", ap_both: "助理与 Coding", conn_calendar: "日历",
      // source (C)
      src_brings: "带来", src_diff: "上次升级的差异", src_manage: "在插件设置里管理", src_open: "看「{s}」带来的全部", src_count: "{n} 项", src_trust: "来源", src_detailOf: "来源详情",
      // states of the page
      fail_t: "没能读出能力包", fail_b: "宿主没有回应，什么都没改。诊断编号 K-2F91。", retry: "重试", partial_t: "MCP 这一类没读到", partial_b: "Agent Host 的 MCP 库没有回应（诊断编号 K-7Q2F）。其余四类照常列出。",
      empty_skill: "还没有技能", empty_skillB: "装一个技能包，或把本机 Agent 里已有的技能导进来。", empty_mcp: "这个项目还没有 MCP 服务器", empty_mcpB: "MCP 服务器把外部服务的工具交给 AI 用。可以在 Coding 里给这个项目加一个，或者连一个自带 MCP 的服务。", empty_inline: "还没有",
      importLocal: "从本机导入", market: "去插件市场", addInCoding: "在 Coding 里加", goConnections: "去服务连接", loading: "正在读能力包…",
      // overview (B)
      ov_attn: "{n} 项用不了", ov_attnB: "Linear 断开了；「审合同」所在的插件停用了；「排日程」还没连接日历。", ov_only: "只看这些", ov_change_skill: "就在这里开关", ov_change_prompt: "改正文去「提示词」", ov_change_role: "改去「角色」", ov_change_tool: "只看；授权在角色里", ov_change_mcp: "改去「服务连接」或 Coding",
      ov_inUse: "在用 {n}", ov_na: "{n} 个用不了", ov_mine: "你改过 {n} 个", ov_newer: "{n} 个默认已更新", ov_writes: "会写的 {n} 个", ov_recent: "最近：{name} · {at}", ov_open: "看全部{k}", ov_overview: "总览", ov_search: "在五类里一起找",
      // import / export
      im_h: "从文件导入", im_file: "{name}", im_from: "{from}", im_repick: "重新选文件", im_prompts: "提示词改写（{n}）", im_promptsLead: "逐条看过再套用。套用后从下一轮生效，随时可以在「提示词」里恢复默认。装任何包都不会改提示词，只有这里你点了才会。",
      im_ok: "基于 {base}，这里也是 {here}", im_old: "基于 {base}，这里已是 {here}：版本对不上，不套用", im_missing: "这里没有{owner}：不套用", im_apply: "套用：{n}", im_diff: "看改了什么", im_refs: "引用（{n}）", im_refsLead: "角色、工具和 MCP 只带名字和版本，不带配置、地址和凭据。",
      im_here: "这里有", im_notHere: "这里没有，用不了", im_skills: "技能包（{n}）", im_skillsGo: "去看安装确认", im_cancel: "取消", im_go: "套用 {n} 条改写", im_none: "选要套用的改写",
      ex_skill: "技能包", ex_skillD: "本机做的用这台电脑的身份签名；别人发布的原样导出", ex_prompt: "提示词改写（3 条）", ex_promptD: "存成你自己的数据文件，导回时逐条确认", ex_refs: "角色、工具和 MCP 的引用", ex_refsD: "只带名字和版本，不带配置、地址和凭据",
      t_sim: "原型：{x}", t_state: "「{n}」改成{s}", undo: "撤销", t_exported: "已导出：{x}", t_applied: "已套用 {n} 条改写，下一轮生效",
      sim_go: "去主人的页面", sim_retry: "重新读", sim_body: "在侧栏打开正文", sim_import: "打开文件选择",
      diff_insert: "新增", diff_delete: "删除", diff_same: "不变",
    },
    en: {
      protoTitle: "AI kit catalog · prototype", scheme: "Scheme", sA: "A One catalog", sB: "B Overview first", sC: "C By source", view: "Screen", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset", rec: "Recommended: A",
      v_normal: "All (normal)", v_skill: "Skill detail (08 as is)", v_prompt: "Prompt detail", v_role: "Role detail", v_tool: "Tool detail", v_mcp: "MCP detail (three “on”s)", v_gone: "Owner uninstalled", v_partial: "One kind unread", v_fail: "Page failed to read", v_empty: "New project (some kinds empty)", v_many: "Many entries", v_loading: "Loading", v_import: "Importing a file", v_export: "Export menu",
      chrome: "Settings", close: "Close settings", back: "Back to project",
      g_local: "This computer", g_personal: "Personal", g_ai: "AI", g_tools: "Tools & access", g_system: "System",
      n_appearance: "Appearance & language", n_directories: "Folders", n_memory: "Memory", n_sync: "Sync", n_models: "Models", n_assistant: "Assistant", n_characters: "Roles", n_kit: "AI kit", n_runtimes: "AI & execution tools", n_library: "Capability library", n_connections: "Service connections", n_access: "Outside access", n_history: "Call history", n_diagnostics: "Diagnostics",
      h1: "AI kit", lead: "All five kinds of things the assistant and Coding can use, with where each comes from, where it applies and how much it was used. Skills are switched here; the others are read here and changed on their own page.",
      scopeLine: "This project: {p}  ·  “Personal space” entries are the same in every project",
      k_all: "All", k_skill: "Skills", k_prompt: "Prompts", k_role: "Roles", k_tool: "Tools", k_mcp: "MCP",
      one_skill: "A way of doing something, telling AI how to handle a kind of task", one_prompt: "Instructions the system and plugins give the model", one_role: "An AI identity with a way of working and a tool list", one_tool: "The basic moves AI can make while working", one_mcp: "Tools that outside services hand to AI",
      kindLabel: "By kind", stLabel: "By state", st_all: "Any state", st_on: "In use", st_off: "Off", st_na: "Unavailable", search: "Find by name, purpose or source", searchLabel: "Search the AI kit",
      import: "Import", export: "Export", exportOf: "Export: pick a kind", summary: "{n} entries  ·  {na} unavailable", onlyNa: "Show only unavailable", moreOf: "See all {n} {k}", noMatch: "No entries match",
      listLabel: "All entries", detailLabel: "Entry detail", backAll: "All entries",
      scope_home: "Personal space", scope_project: "This project",
      w_auto: "Auto", w_manual: "Manual only", w_off: "Off", w_naFix: "Unavailable for now", w_revoked: "Revoked", w_default: "Default", w_mine: "Your version", w_mineOld: "Default updated", w_inUse: "In use", w_roleOff: "Turned off", w_writes: "Writes", w_reads: "Read only", w_connected: "Connected", w_broken: "Disconnected", w_deleted: "Deleted", w_uninstalled: "Uninstalled", w_outbound: "Open outward",
      d_now: "Now", d_usage: "Usage", d_where: "Used in", d_version: "Version and upgrades", d_declared: "Tools it declares", d_declaredNote: "A note, not a permission: what it can really use follows the role's tool list and action grants.", d_roles: "Open to these roles",
      d_kitOuter: "What the AI kit adds", whereNone: "Nothing uses it yet",
      u_recent: "{n} recent uses", u_last: "Last used {at}{by}", u_by: " · {by}", u_none: "No use recorded", u_lastOnly: "Last use only", u_batch61: "Counts come with batch 61", u_history: "{n} recent uses before it was uninstalled",
      ur_skill: "From skill use records; only the recent records kept.", ur_prompt: "Each prompt keeps its last 200 uses, so this is not a total.", ur_role: "From role runs and prompt records; recent only.", ur_mcp: "From call records, which are kept for a short time.", ur_tool: "Only the last use is cheap to read today; exact counts come with batch 61.", ur_history: "Names are kept as they were before uninstalling.",
      p_default: "Using the default, {v}.", p_mine: "Using your version, based on {base}; the default is still {base}.", p_mineOld: "Using your version, based on {base}; the default is now {latest}.", p_noBody: "The text isn't shown here. Rewriting, comparing and restoring the default happen in Prompts and apply from the next turn.",
      p_edit: "Edit in Prompts", p_compare: "Compare with new default", p_ver: "Default {v} (from {src})", p_verMine: "Your version is based on {base}; the default is now {latest}",
      r_active: "Applies in", r_activeNone: "Nothing uses it now", r_scopeNote: "Where it applies and what it inherits come from role settings (batch 36).", r_edit: "Go to Roles", r_view: "See in Coding settings", r_ver: "{v} · {decl}", r_new: "New in Coding 3.2", r_off: "Turned off; it won't be picked.",
      t_note: "Tools aren't switched here. Who can use one follows the role's tool list and action grants.", t_origin_system: "System tool (Prologue SDK)", t_origin_gateway: "Platform gateway tool", t_origin_subagent: "Sub-agent tool", t_origin_plan: "Plan step tool", t_ver: "From Prologue SDK {v}", t_added: "New in 0.38", t_rolesNone: "No role opens it yet", t_toRoles: "Go to Roles",
      m_title: "Is it on? Three separate things", m_server: "Server", m_serverWhat: "Whether the server runs and can be reached", m_out: "For outside clients", m_outWhat: "Which outside AI tools may connect to it", m_tools: "Tools available", m_toolsWhat: "How many of its tools are registered as actions and can be called",
      m_on: "On", m_conn: "Connected", m_broken: "Disconnected", m_gone: "Deleted", m_outN: "Open to {n}: {list}", m_outNa: "Doesn't apply: a server brought in", m_toolsN: "{open} of {total} open", m_toolsAll: "All {total} registered", m_toolsNone: "None of {total} usable",
      m_toAccess: "Outside access", m_toCodingMcp: "Coding MCP settings", m_toConn: "Service connections", m_toLibrary: "Capability library", m_reconnect: "Reconnect", m_skill: "Installed with it in outside AI tools", m_disc: "Changes found on the last list read", m_added: "Added", m_removed: "Removed",
      m_ver: "List version: {v}", m_noConnect: "The catalog reads the stored list; it never connects to the server.", m_withHost: "Runs with Molis Work",
      gone_t: "{owner} was uninstalled on {at}", gone_mcp_t: "{owner} was deleted on {at}", gone_b: "This no longer applies and won't be used. Below is its usage before it was removed, under the names it had then.", gone_add: "Add {owner} again", gone_export: "Export this rewrite",
      sk_for: "For", sk_when: "When to use", sk_whenNot: "When not to use", sk_tools: "Tools (declared, not granted)", sk_conn: "Connector kinds", sk_files: "Included files", sk_excerpt: "Start of the text", sk_noTools: "No tools declared", sk_noFiles: "No included files", sk_runs: "runs",
      sk_how: "How to use", sk_offD: "Don't use this skill", sk_autoD: "AI picks it when it fits", sk_manualD: "Only when you name it", sk_open: "Open full text", sk_enabled: "Enabled", sk_used: "Last used", sk_manage: "Manage this pack", sk_enablePlugin: "Turn plugin on", sk_connect: "Manage connections",
      sk_why_plugin_disabled: "The plugin is off; the setting stays and comes back with it.", sk_why_connection_missing: "The service it needs isn't connected yet.", sk_change_body_changed: "Text changed in 2.0 (1.4 → 2.0)", sk_change_added: "New in 2.0", sk_change_none: "Not upgraded since installed",
      sk_trust_host: "Built in", ap_assistant: "Assistant", ap_coding: "Coding", ap_both: "Assistant and Coding", conn_calendar: "Calendar",
      src_brings: "Brings", src_diff: "Last upgrade", src_manage: "Manage in plugin settings", src_open: "See all from “{s}”", src_count: "{n}", src_trust: "Source", src_detailOf: "Source detail",
      fail_t: "Couldn't read the AI kit", fail_b: "The host didn't answer; nothing changed. Diagnostic K-2F91.", retry: "Retry", partial_t: "MCP couldn't be read", partial_b: "Agent Host's MCP library didn't answer (diagnostic K-7Q2F). The other four kinds are listed as usual.",
      empty_skill: "No skills yet", empty_skillB: "Install a skill pack, or bring in skills your local agents already have.", empty_mcp: "No MCP servers in this project", empty_mcpB: "An MCP server hands an outside service's tools to AI. Add one for this project in Coding, or connect a service that brings its own.", empty_inline: "None yet",
      importLocal: "Import from this computer", market: "Open plugin market", addInCoding: "Add in Coding", goConnections: "Service connections", loading: "Reading the AI kit…",
      ov_attn: "{n} unavailable", ov_attnB: "Linear is disconnected; the plugin behind “Contract review” is off; “Plan the week” has no calendar connection.", ov_only: "Show only these", ov_change_skill: "Switch them right here", ov_change_prompt: "Edit text in Prompts", ov_change_role: "Change in Roles", ov_change_tool: "Read only; grants live in roles", ov_change_mcp: "Change in connections or Coding",
      ov_inUse: "{n} in use", ov_na: "{n} unavailable", ov_mine: "{n} edited by you", ov_newer: "{n} with a newer default", ov_writes: "{n} can write", ov_recent: "Latest: {name} · {at}", ov_open: "See all {k}", ov_overview: "Overview", ov_search: "Search all five kinds",
      im_h: "Import from a file", im_file: "{name}", im_from: "{from}", im_repick: "Choose another file", im_prompts: "Prompt rewrites ({n})", im_promptsLead: "Look at each before applying it. Applied rewrites take effect from the next turn, and Prompts can always restore the default. Installing a package never changes prompts; only your choice here does.",
      im_ok: "Based on {base}; here it's {here} too", im_old: "Based on {base}; here it's already {here}: versions differ, not applied", im_missing: "{owner} isn't here: not applied", im_apply: "Apply: {n}", im_diff: "What changed", im_refs: "References ({n})", im_refsLead: "Roles, tools and MCP carry only a name and version — no settings, addresses or credentials.",
      im_here: "Here", im_notHere: "Not here, unavailable", im_skills: "Skill packs ({n})", im_skillsGo: "Open install review", im_cancel: "Cancel", im_go: "Apply {n} rewrite", im_none: "Choose rewrites to apply",
      ex_skill: "Skill packs", ex_skillD: "Your own are signed as this computer; others are exported as published", ex_prompt: "Prompt rewrites (3)", ex_promptD: "Saved as your own data file; confirmed one by one when brought back", ex_refs: "Role, tool and MCP references", ex_refsD: "Names and versions only; no settings, addresses or credentials",
      t_sim: "Prototype: {x}", t_state: "“{n}” set to {s}", undo: "Undo", t_exported: "Exported: {x}", t_applied: "Applied {n} rewrite; takes effect next turn",
      sim_go: "goes to the owner's page", sim_retry: "reads again", sim_body: "opens the text in the side panel", sim_import: "opens a file picker",
      diff_insert: "Added", diff_delete: "Removed", diff_same: "Unchanged",
    },
  };

  /* ---------- state ---------- */
  const readHash = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  let P = (() => { try { return Object.assign(clone(DEF), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return clone(DEF); } })();
  const H = readHash();
  for (const k of ["s", "v", "l", "t"]) if (H[k]) P[k] = H[k];
  const shot = H.shot === "1";
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private window: memory only */ } };
  const t = (k, v) => (T[P.l][k] ?? T.zh[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const L = (o) => (o && typeof o === "object" ? o[P.l] : o) ?? "";

  // What each screen starts from: kind filter, state filter, selection, whether a narrow screen shows the detail, and the data.
  const PRESET = {
    normal: { k: "all", f: "all", sel: "sk-weekly", detail: false },
    skill: { k: "skill", f: "all", sel: "sk-weekly", detail: true },
    prompt: { k: "prompt", f: "all", sel: "pr-split", detail: true },
    role: { k: "role", f: "all", sel: "ro-research", detail: true },
    tool: { k: "tool", f: "all", sel: "tl-write_file", detail: true },
    mcp: { k: "mcp", f: "all", sel: "mc-molis", detail: true },
    gone: { k: "all", f: "na", sel: "pr-clauses", detail: true },
    partial: { k: "all", f: "all", sel: "sk-weekly", detail: false },
    fail: { k: "all", f: "all", sel: null, detail: false },
    empty: { k: "all", f: "all", sel: "pr-reply", detail: false },
    many: { k: "all", f: "all", sel: "sk-weekly", detail: false },
    loading: { k: "all", f: "all", sel: null, detail: false },
    import: { k: "all", f: "all", sel: "sk-weekly", detail: false, importing: true },
    export: { k: "all", f: "all", sel: "sk-weekly", detail: false, menu: true },
  };
  const freshUi = () => {
    const p = PRESET[P.v] || PRESET.normal;
    const skillStates = {};
    for (const e of D.entries) if (e.skill) skillStates[e.id] = e.skill.state;
    // B lands on its overview unless the screen is about one kind or one entry.
    const page = P.s === "B" && ["normal", "partial", "fail", "empty", "many", "loading", "export"].includes(P.v) ? "overview" : "kind";
    const bKind = p.k === "all" ? (p.sel ? entryById(p.sel)?.kind || "skill" : "skill") : p.k;
    return { k: P.s === "B" ? bKind : p.k, f: p.f, q: "", sel: p.sel, detail: p.detail, menu: !!p.menu, importing: !!p.importing, page, cross: P.s === "B" && p.f === "na", skillStates, open: {}, srcSel: null,
      picks: { i1: true }, last: null, anim: false };
  };
  const entryById = (id) => D.entries.find((e) => e.id === id);
  let ui = freshUi();

  /* ---------- data for the current screen ---------- */
  function entries() {
    let list = D.entries.slice();
    if (P.v === "many") list = list.concat(D.many());
    if (P.v === "empty") list = list.filter((e) => e.kind !== "skill" && e.kind !== "mcp");
    if (P.v === "partial") list = list.filter((e) => e.kind !== "mcp");
    return list;
  }
  const KINDS = ["skill", "prompt", "role", "tool", "mcp"];
  const KIND_ICON = { skill: "book", prompt: "text", role: "user", tool: "wand", mcp: "network" };
  const SRC_ICON = { system: "system", plugin: "package", pack: "package", local: "terminal", characters: "user", server: "network", connection: "link" };
  const nameOf = (e) => L(e.skill ? e.skill.name : e.name);
  const descOf = (e) => L(e.skill ? e.skill.desc : e.desc);
  const srcOf = (e) => D.sources[e.src];
  const kindWord = (k) => t("k_" + k);
  const kindWordLower = (k) => (P.l === "en" ? t("k_" + k).toLowerCase() : t("k_" + k));

  // One reading of "is it on" per kind, with the batch-08 tones: in use idle/ready, off quiet/paused, fixable hold/unavailable,
  // only-uninstall-left blocked/blocked. `group` drives the state filter.
  function stateOf(e) {
    if (e.gone) return { word: t(e.kind === "mcp" ? "w_deleted" : "w_uninstalled"), tone: "blocked", ring: "blocked", group: "na" };
    if (e.kind === "skill") {
      const u = e.skill.unavailable, st = ui.skillStates[e.id] ?? e.skill.state;
      if (u) return u.reason === "publisher_revoked" ? { word: t("w_revoked"), tone: "blocked", ring: "blocked", group: "na" } : { word: t("w_naFix"), tone: "hold", ring: "unavailable", group: "na" };
      return st === "off" ? { word: t("w_off"), tone: "quiet", ring: "paused", group: "off" } : { word: t(st === "auto" ? "w_auto" : "w_manual"), tone: "idle", ring: "ready", group: "on" };
    }
    if (e.kind === "prompt") {
      const p = e.prompt;
      if (p.mine && p.latest !== p.base) return { word: t("w_mineOld"), tone: "attention", ring: "stale", group: "on" };
      return { word: t(p.mine ? "w_mine" : "w_default"), tone: "idle", ring: "ready", group: "on" };
    }
    if (e.kind === "role") return e.off ? { word: t("w_roleOff"), tone: "quiet", ring: "paused", group: "off" } : { word: t("w_inUse"), tone: "idle", ring: "ready", group: "on" };
    if (e.kind === "tool") return { word: t(e.tool.writes ? "w_writes" : "w_reads"), tone: null, group: "on" };
    if (e.kind === "mcp") {
      if (e.mcp.server === "broken") return { word: t("w_broken"), tone: "hold", ring: "unavailable", group: "na" };
      return { word: t(e.mcp.outbound ? "w_outbound" : "w_connected"), tone: "idle", ring: "ready", group: "on" };
    }
    return { word: "", tone: "quiet", group: "on" };
  }
  const markOf = (e) => {
    const s = stateOf(e);
    // A tool has no on/off: its end says whether it can write, as a tag, so it never reads like a switch.
    if (e.kind === "tool") return K.renderBadge({ label: s.word, tone: e.tool.writes ? "warning" : "neutral" });
    return K.renderStatusMark({ label: s.word, tone: s.tone, state: s.ring });
  };

  const visible = (list) => {
    const q = ui.q.trim().toLowerCase();
    return list.filter((e) => {
      if (ui.k !== "all" && e.kind !== ui.k) return false;
      if (ui.f !== "all" && stateOf(e).group !== ui.f) return false;
      return !q || (nameOf(e) + descOf(e) + L(srcOf(e).name) + (e.code || "")).toLowerCase().includes(q);
    });
  };
  // Entries whose owner is gone sort last in their kind, so the list leads with what can be used.
  const ordered = (list) => list.slice().sort((a, b) => (a.gone ? 1 : 0) - (b.gone ? 1 : 0));

  /* ---------- small parts (SDK markup where the kit has no renderer) ---------- */
  const ic = (n) => K.icon(n);
  const btn = (label, o = {}) => K.renderButton({ label, variant: o.variant || "secondary", size: o.size || "sm", icon: o.icon, iconOnly: o.iconOnly, disabled: o.disabled, className: o.className, attrs: o.attrs });
  const act = (a, v, extra) => Object.assign({ "data-act": a }, v != null ? { "data-v": v } : {}, extra || {});
  const badge = (label, tone) => K.renderBadge({ label, tone: tone || "neutral" });
  const mark = (name) => `<span class="mw-mark" aria-hidden="true">${ic(name)}</span>`;
  const empty = (o) => `<div class="mw-empty${o.error ? " mw-empty--error" : ""}" data-slot="empty"><span class="mw-empty__mark">${ic(o.icon)}</span><h2>${esc(o.title)}</h2><p>${esc(o.body)}</p>${o.action || ""}</div>`;
  const input = (o) => `<input class="mw-input" data-slot="input" type="search" id="${o.id}" placeholder="${esc(o.placeholder)}" aria-label="${esc(o.label)}" value="${esc(o.value || "")}">`;
  const select = (id, label, opts, cur) => `<select class="mw-select" data-slot="select" id="${id}" aria-label="${esc(label)}">${opts.map(([v, w]) => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(w)}</option>`).join("")}</select>`;
  const skeleton = (cls) => `<span class="mw-skeleton ${cls || ""}" data-slot="skeleton" aria-hidden="true"></span>`;
  const sec = (title, body, cls = "") => `<section class="kp-sec ${cls}"><h4>${esc(title)}</h4>${body}</section>`;
  const counts = (list) => {
    const c = { all: 0, na: 0 };
    for (const k of KINDS) c[k] = 0;
    for (const e of list) { if (e.gone) { c.gone = (c.gone || 0) + 1; continue; } c.all += 1; c[e.kind] += 1; if (stateOf(e).group === "na") c.na += 1; }
    return c;
  };

  /* ---------- the batch-08 skill block, as the product draws it (apps/workbench/src/settings-skills.ts) ---------- */
  function skillBlock(e) {
    const s = e.skill, src = srcOf(e), st = ui.skillStates[e.id] ?? s.state, u = s.unavailable;
    const locked = u && ["plugin_disabled", "publisher_revoked", "resource_invalid"].includes(u.reason);
    const radios = `<fieldset class="mw-radio-group" data-slot="radio-group"${locked ? " disabled" : ""}><legend class="skill-sr">${esc(L(s.name))} · ${esc(t("sk_how"))}</legend>${["off", "auto", "manual"].map((v) =>
      `<label class="mw-check-row"><input type="radio" name="sk-${e.id}" value="${v}" data-skill="${e.id}"${st === v ? " checked" : ""}><span>${esc(t("w_" + v))}</span><small class="settings-muted">${esc(t("sk_" + v + "D"))}</small></label>`).join("")}</fieldset>`;
    const why = u ? `<div class="mw-alert" data-slot="alert" role="status"><p>${esc(t("sk_why_" + u.reason))}</p>${u.reason === "connection_missing" ? `<a class="mw-btn mw-btn--link" href="#" data-act="sim" data-v="go">${esc(t("sk_connect"))}</a>` : ""}</div>` : "";
    const fact = (k, v) => (v ? `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>` : "");
    const files = s.resources.map((r) => `${r.path} · ${r.bytes} B${r.role === "script" ? " · " + t("sk_runs") : ""}`).join("\n") || t("sk_noFiles");
    const facts = `<dl class="mw-facts">${fact("sk_for", t("ap_" + s.applies))}${fact("sk_when", L(s.when))}${fact("sk_whenNot", L(s.whenNot))}${fact("sk_tools", s.tools.join("、") || t("sk_noTools"))}${fact("sk_conn", (s.connectors || []).map((c) => t("conn_" + c)).join("、"))}${fact("sk_files", files)}${fact("sk_excerpt", L(s.excerpt))}</dl>`;
    const open = st !== "off" && !u ? `<button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-slot="button" data-act="sim" data-v="body"><span data-slot="button-label">${esc(t("sk_open"))}</span></button>` : "";
    const enabled = s.enabled ? `<p class="settings-muted">${esc(t("sk_enabled"))} · ${esc(s.enabled.at)} · ${esc(L(s.enabled.by))} · ${esc(t(e.scope === "home" ? "scope_home" : "scope_project"))}</p>` : "";
    const used = e.usage.last ? `<p class="mw-list-detail__used">${esc(t("sk_used"))} · ${esc(L(e.usage.last.at))}${e.usage.last.by ? " · " + esc(L(e.usage.last.by)) : ""}</p>` : "";
    const next = u?.reason === "plugin_disabled" ? t("sk_enablePlugin") : t("sk_manage");
    return `<header><h3 tabindex="-1">${esc(L(s.name))}</h3><p>${esc(L(s.desc))}</p><p class="settings-muted">${esc(L(src.name))} · ${esc(L(e.version))}${src.publisher ? " · " + esc(src.publisher) : ""}</p><p class="settings-muted">${esc(t(e.scope === "home" ? "scope_home" : "scope_project"))} · ${esc(L(src.trust))}</p></header>
      ${radios}${why}${facts}${open}${enabled}${used}<a class="mw-btn mw-btn--link" href="#" data-act="sim" data-v="go">${esc(next)}</a>`;
  }

  /* ---------- the pack's own detail parts, shared by every kind ---------- */
  function usageBlock(e) {
    const u = e.usage;
    const by = u.last?.by ? t("u_by", { by: L(u.last.by) }) : "";
    const big = u.range === "recent" || u.range === "history" ? `<span class="kp-num">${u.n}</span>` : "";
    const head = { recent: t("u_recent", { n: u.n }), history: t("u_history", { n: u.n }), last_only: t("u_lastOnly"), none: t("u_none") }[u.range];
    const last = u.last ? `<span>${esc(t("u_last", { at: L(u.last.at), by }))}</span>` : "";
    const extra = e.kind === "tool" ? `<span class="kp-later">${badge(t("u_batch61"))}</span>` : "";
    const note = u.range === "history" ? t("ur_history") : u.range === "none" && e.kind !== "tool" ? "" : t("ur_" + e.kind);
    return `<div class="kp-usage">${big}<div class="kp-usage__text"><strong>${esc(head)}</strong>${last}${extra}</div></div>${note ? `<p class="kp-note">${esc(note)}</p>` : ""}`;
  }
  const whereBlock = (e) => (e.where.length ? `<ul class="kp-places">${e.where.map((w) => `<li>${ic("target")}<span>${esc(L(w))}</span></li>`).join("")}</ul>` : `<p class="kp-note">${esc(t("whereNone"))}</p>`);
  const goBtn = (label, variant) => btn(label, { variant: variant || "secondary", icon: "arrow", attrs: act("sim", "go") });
  const statusLine = (markHtml, text, link) => `<p class="mw-status-line">${markHtml}${esc(text)}${link ? `<a class="mw-btn mw-btn--link" href="#" data-act="sim" data-v="go">${esc(link)}</a>` : ""}</p>`;

  function header(e) {
    const src = srcOf(e);
    return `<header><span class="kp-kind">${ic(KIND_ICON[e.kind])}${esc(kindWord(e.kind))}</span><h3 tabindex="-1">${esc(nameOf(e))}${e.code ? ` <code class="kp-code">${esc(e.code)}</code>` : ""}</h3><p>${esc(descOf(e))}</p>
      <p class="kp-source">${ic(SRC_ICON[src.kind] || "package")}<span>${esc(L(src.name))}</span>${e.version ? `<span class="kp-dot">·</span><span>${esc(L(e.version))}</span>` : ""}<span class="kp-dot">·</span>${badge(t(e.scope === "home" ? "scope_home" : "scope_project"), e.scope === "home" ? "info" : "neutral")}</p></header>`;
  }

  function goneBlock(e) {
    const isMcp = e.kind === "mcp";
    const title = t(isMcp ? "gone_mcp_t" : "gone_t", { owner: L(e.gone.owner), at: L(e.gone.at) });
    const actions = isMcp ? [{ label: t("addInCoding"), variant: "secondary", attrs: act("sim", "go") }]
      : [{ label: t("gone_add", { owner: L(e.gone.owner) }), variant: "secondary", attrs: act("sim", "go") }, ...(e.kind === "prompt" ? [{ label: t("gone_export"), variant: "ghost", attrs: act("sim", "go") }] : [])];
    return K.renderAlert({ title, body: t("gone_b"), tone: "warning", state: "blocked", actions, role: null });
  }

  function promptDetail(e) {
    const p = e.prompt, s = stateOf(e), src = srcOf(e);
    const line = !p.mine ? t("p_default", { v: p.latest }) : p.latest !== p.base ? t("p_mineOld", { base: p.base, latest: p.latest }) : t("p_mine", { base: p.base });
    const now = e.gone ? goneBlock(e) : `${statusLine(markOf(e), line)}<p class="kp-note">${esc(t("p_noBody"))}</p><div class="kp-actions">${p.mine && p.latest !== p.base ? goBtn(t("p_compare")) : ""}${goBtn(t("p_edit"))}</div>`;
    const ver = `<p class="kp-line">${esc(t("p_ver", { v: p.latest || p.base, src: L(src.name) }))}</p>${p.mine && p.latest && p.latest !== p.base ? `<p class="kp-line kp-line--hold">${ic("git-compare")}${esc(t("p_verMine", { base: p.base, latest: p.latest }))}</p>` : ""}`;
    return `${header(e)}${sec(t("d_now"), now, "kp-now")}${sec(t("d_usage"), usageBlock(e))}${e.gone ? "" : sec(t("d_where"), whereBlock(e))}${sec(t("d_version"), ver)}`;
  }

  function roleDetail(e) {
    const r = e.role, src = srcOf(e);
    const own = src.kind === "characters";
    const active = r.active.length ? `<ul class="kp-places">${r.active.map((w) => `<li>${ic("target")}<span>${esc(L(w))}</span></li>`).join("")}</ul>` : `<p class="kp-note">${esc(t(e.off ? "r_off" : "r_activeNone"))}</p>`;
    const now = `${statusLine(markOf(e), t("r_active"))}${active}<p class="kp-note">${esc(t("r_scopeNote"))}</p><div class="kp-actions">${goBtn(own ? t("r_edit") : t("r_view"))}</div>`;
    const tools = `<p class="kp-chips">${r.tools.map((x) => `<code>${esc(x)}</code>`).join("")}</p><p class="kp-note">${esc(t("d_declaredNote"))}</p>`;
    const ver = `<p class="kp-line">${esc(t("r_ver", { v: L(e.version), decl: L(r.declared) }))}</p>${e.isNew ? `<p class="kp-line">${badge(t("r_new"), "success")}</p>` : ""}`;
    return `${header(e)}${sec(t("d_now"), now, "kp-now")}${sec(t("d_declared"), tools)}${sec(t("d_usage"), usageBlock(e))}${sec(t("d_version"), ver)}`;
  }

  function toolDetail(e) {
    const tl = e.tool;
    const roles = tl.roles.length ? `<p class="kp-chips">${tl.roles.map((r) => badge(r === "助理" && P.l === "en" ? "Assistant" : r)).join("")}</p>` : `<p class="kp-note">${esc(t("t_rolesNone"))}</p>`;
    const now = `<p class="mw-status-line">${markOf(e)}${esc(t("t_origin_" + tl.origin))}</p><p class="kp-note">${esc(t("t_note"))}</p>`;
    const ver = `<p class="kp-line">${esc(t("t_ver", { v: e.version }))}</p>${tl.added ? `<p class="kp-line">${badge(t("t_added"), "success")}</p>` : ""}`;
    return `${header(e)}${sec(t("d_now"), now, "kp-now")}${sec(t("d_roles"), roles + `<div class="kp-actions">${goBtn(t("t_toRoles"))}</div>`)}${sec(t("d_usage"), usageBlock(e))}${sec(t("d_version"), ver)}`;
  }

  // MCP: the server running, outside clients allowed in, and its tools callable are three different "on"s; each row says which one
  // it is, its own state, and where that one is changed.
  function mcpDetail(e) {
    const m = e.mcp;
    const gone = m.server === "gone";
    const row = (what, sub, markHtml, fact, link) => `<li><span class="kp-on__what"><strong>${esc(what)}</strong><small>${esc(sub)}</small></span><span class="kp-on__state">${markHtml}${fact ? `<span class="kp-on__fact">${esc(fact)}</span>` : ""}</span>${link ? `<span class="kp-on__go">${btn(link, { variant: "ghost", icon: "arrow", attrs: act("sim", "go") })}</span>` : ""}</li>`;
    const serverMark = gone ? K.renderStatusMark({ label: t("m_gone"), tone: "blocked", state: "blocked" })
      : m.server === "broken" ? K.renderStatusMark({ label: t("m_broken"), tone: "hold", state: "unavailable" })
        : K.renderStatusMark({ label: t(m.outbound ? "m_on" : "m_conn"), tone: "idle", state: "ready" });
    const serverLink = gone || m.outbound ? null : e.src === "connections" ? (m.server === "broken" ? t("m_reconnect") : t("m_toConn")) : t("m_toCodingMcp");
    const outMark = m.outbound ? K.renderStatusMark({ label: t("m_outN", { n: m.clients.length, list: m.clients.join("、") }), tone: "idle", state: "ready" }) : K.renderStatusMark({ label: t("m_outNa"), tone: "quiet", state: "idle" });
    const toolsWord = m.tools.open === 0 ? t("m_toolsNone", { total: m.tools.total }) : m.tools.open === m.tools.total ? t("m_toolsAll", { total: m.tools.total }) : t("m_toolsN", { total: m.tools.total, open: m.tools.open });
    const toolsMark = K.renderStatusMark({ label: toolsWord, tone: m.tools.open === 0 ? (gone ? "blocked" : "hold") : "idle", state: m.tools.open === 0 ? (gone ? "blocked" : "unavailable") : "ready" });
    const ons = `<ul class="kp-ons">${row(t("m_server"), t("m_serverWhat"), serverMark, m.outbound ? t("m_withHost") : "", serverLink)}${row(t("m_out"), t("m_outWhat"), outMark, "", m.outbound ? t("m_toAccess") : null)}${row(t("m_tools"), t("m_toolsWhat"), toolsMark, "", gone ? null : t("m_toLibrary"))}</ul>`;
    const now = gone ? goneBlock(e) + ons : ons + `<p class="kp-note">${esc(t("m_noConnect"))}</p>`;
    const disc = m.discovered ? `<p class="kp-line">${esc(t("m_disc"))}</p><ul class="kp-diff">${m.discovered.added.map((x) => `<li>${badge(t("m_added"), "success")}<code>${esc(x)}</code></li>`).join("")}${m.discovered.removed.map((x) => `<li>${badge(t("m_removed"), "danger")}<code>${esc(x)}</code></li>`).join("")}</ul>` : "";
    const skill = m.skill ? `<p class="kp-line">${ic("book")}${esc(t("m_skill"))}：${esc(L(m.skill))}</p>` : "";
    const ver = `<p class="kp-line">${esc(t("m_ver", { v: L(e.version) }))}</p>${disc}${skill}`;
    return `${header(e)}${sec(t("m_title"), now, "kp-now")}${sec(t("d_usage"), usageBlock(e))}${e.where.length ? sec(t("d_where"), whereBlock(e)) : ""}${sec(t("d_version"), ver)}`;
  }

  function skillDetail(e) {
    // The batch-08 block exactly; the pack's own fields sit outside it, under a hairline.
    const s = e.skill, ch = s.change ? t("sk_change_" + s.change) : t("sk_change_none");
    const outer = `<section class="kp-outer" aria-label="${esc(t("d_kitOuter"))}"><h4>${esc(t("d_kitOuter"))}</h4>${usageBlock(e)}<p class="kp-line">${ic("history")}${esc(ch)}</p>${e.where.length ? whereBlock(e) : ""}</section>`;
    return skillBlock(e) + outer;
  }

  function detail(e) {
    if (!e) return "";
    const back = `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm mw-list-detail__back" data-slot="button" data-act="unsel">${ic("chevron-left")}<span data-slot="button-label">${esc(t("backAll"))}</span></button>`;
    const body = { skill: skillDetail, prompt: promptDetail, role: roleDetail, tool: toolDetail, mcp: mcpDetail }[e.kind](e);
    return `<section class="mw-list-detail__detail kp-detail${ui.anim ? " is-entering" : ""}" aria-label="${esc(t("detailLabel"))}"${e.skill && e.skill.unavailable ? " data-off" : ""}>${back}${body}</section>`;
  }

  /* ---------- list rows ---------- */
  function pickRow(e) {
    const src = srcOf(e);
    const sub = `${L(src.name)}${e.scope === "home" ? " · " + t("scope_home") : ""}`;
    return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick" aria-current="${e.id === ui.sel ? "true" : "false"}" data-act="sel" data-v="${e.id}">${mark(KIND_ICON[e.kind])}<span><strong>${esc(nameOf(e))}</strong><small title="${esc(sub)}">${esc(sub)}</small></span><span class="mw-item__end">${markOf(e)}</span></button></li>`;
  }

  /* ---------- toolbar, export menu, import panel ---------- */
  function exportMenu() {
    if (!ui.menu) return "";
    const items = K.renderMenuGroup({ label: t("exportOf"), items: [
      K.renderMenuItem({ label: t("ex_skill"), description: t("ex_skillD"), iconName: "book", attrs: act("export", "skill") }),
      K.renderMenuItem({ label: t("ex_prompt"), description: t("ex_promptD"), iconName: "text", attrs: act("export", "prompt") }),
      K.renderMenuItem({ label: t("ex_refs"), description: t("ex_refsD"), iconName: "link", attrs: act("export", "refs") }),
    ] });
    return K.renderPopover({ body: K.renderMenu({ items, labelledBy: "kpExport" }), className: "kp-menu", preview: true });
  }
  function ioButtons() {
    return `<span class="kp-io">${btn(t("import"), { icon: "upload", attrs: act("import") })}<span class="kp-export">${btn(t("export"), { icon: "download", attrs: Object.assign(act("menu"), { id: "kpExport", "aria-haspopup": "menu", "aria-expanded": ui.menu ? "true" : "false" }) })}${exportMenu()}</span></span>`;
  }
  function kindFilter(list, withAll = true) {
    const c = counts(list);
    const err = P.v === "partial";
    const items = (withAll ? ["all"] : []).concat(KINDS).map((k) => ({ value: k, label: `${t("k_" + k)} ${k === "mcp" && err ? "—" : c[k]}`, current: ui.k === k, attrs: act("kind", k) }));
    const seg = K.renderToggleGroup({ label: t("kindLabel"), items, className: "kp-kinds" });
    const sel = select("kpKindSel", t("kindLabel"), items.map((i) => [i.value, i.label]), ui.k);
    return `<span class="kp-kinds-wrap">${seg}<span class="kp-kinds-narrow">${sel}</span></span>`;
  }
  function stateFilter() {
    return select("kpState", t("stLabel"), [["all", t("st_all")], ["on", t("st_on")], ["off", t("st_off")], ["na", t("st_na")]], ui.f);
  }
  function searchBox(placeholder) {
    return `<span class="kp-search">${ic("search")}${input({ id: "kpQ", placeholder: placeholder || t("search"), label: t("searchLabel"), value: ui.q })}</span>`;
  }
  function summaryLine(list) {
    const c = counts(list);
    return `<p class="kp-summary" role="status">${esc(t("summary", { n: c.all, na: c.na }))}${c.na && ui.f !== "na" ? `<button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-slot="button" data-act="only-na"><span data-slot="button-label">${esc(t("onlyNa"))}</span></button>` : ""}</p>`;
  }

  function importPanel() {
    const f = D.importFile;
    const words = Object.fromEntries(["insert", "delete", "same"].map((k) => [k, t("diff_" + k)]));
    const diff = (x) => K.renderDiff({ view: K.compareChange("import", { before: { workspace_id: "w", workspace_name: "", path: "", source_plugin_id: "", content_version: 1 }, after: { workspace_id: "w", workspace_name: "", path: "", source_plugin_id: "", content_version: 2 } }, { before: x.before, after: x.after }), primitives: { escape: esc, text: (k, v = {}) => String(words[k] || k || "").replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ""), icon: K.icon }, labels: Object.fromEntries(["insert", "delete", "same", "reveal", "identical", "coarse", "partial", "mismatch", "created", "removed"].map((k) => [k, k])), sides: false });
    const prow = (x) => {
      const status = x.missing ? badge(t("im_missing", { owner: L(x.owner) }), "warning") : x.ok ? badge(t("im_ok", { base: x.base, here: x.here }), "success") : badge(t("im_old", { base: x.base, here: x.here }), "warning");
      const pick = x.ok ? `<label class="mw-check-row kp-apply"><input type="checkbox" data-pick="${x.id}"${ui.picks[x.id] ? " checked" : ""}><span>${esc(t("im_apply", { n: L(x.name) }))}</span></label>` : "";
      const more = x.ok ? `<details class="mw-collapsible kp-fold" data-slot="collapsible"><summary>${esc(t("im_diff"))}</summary><div class="mw-collapsible__body">${diff(x)}</div></details>` : "";
      return `<li class="kp-card${x.ok ? "" : " is-muted"}"><div class="kp-card__head">${mark("text")}<span class="kp-card__text"><strong>${esc(L(x.name))}</strong><small>${esc(L(x.owner))}</small></span></div><div class="kp-card__meta">${status}</div>${pick}${more}</li>`;
    };
    const rrow = (x) => `<li class="kp-ref">${mark(KIND_ICON[x.kind])}<span class="kp-ref__name">${esc(L(x.name))}</span>${x.here ? K.renderStatusMark({ label: t("im_here"), tone: "idle", state: "ready" }) : `<span class="mw-status-line">${K.renderStatusMark({ label: t("im_notHere"), tone: "hold", state: "unavailable" })}<a class="mw-btn mw-btn--link" href="#" data-act="sim" data-v="go">${esc(L(x.fix))}</a></span>`}</li>`;
    const n = Object.values(ui.picks).filter(Boolean).length;
    return `<section class="kp-import" aria-labelledby="kpImH"><header class="kp-import__head"><h2 id="kpImH">${esc(t("im_h"))}</h2>
        <div class="kp-file">${ic("file")}<span><strong>${esc(f.name)}</strong><small>${esc(L(f.from))}</small></span>${btn(t("im_repick"), { variant: "ghost", attrs: act("sim", "import") })}</div></header>
      ${sec(t("im_prompts", { n: f.prompts.length }), `<p class="kp-note">${esc(t("im_promptsLead"))}</p><ul class="kp-cards">${f.prompts.map(prow).join("")}</ul>`)}
      ${sec(t("im_refs", { n: f.refs.length }), `<p class="kp-note">${esc(t("im_refsLead"))}</p><ul class="kp-refs">${f.refs.map(rrow).join("")}</ul>`)}
      ${sec(t("im_skills", { n: f.skills.packs }), `<p class="kp-line">${esc(L(f.skills.note))}</p><div class="kp-actions">${btn(t("im_skillsGo"), { icon: "arrow", attrs: act("sim", "go") })}</div>`)}
      <footer class="kp-import__foot">${btn(t("im_cancel"), { variant: "ghost", size: "md", attrs: act("import-cancel") })}${btn(n ? t("im_go", { n }) : t("im_none"), { variant: "primary", size: "md", disabled: !n, attrs: act("import-apply") })}</footer></section>`;
  }

  /* ---------- the list-and-detail body for a set of entries ---------- */
  function listDetail(listHtml, sel) {
    return `<div class="mw-list-detail kp-ld"${ui.detail && sel ? " data-detail" : ""}><div class="mw-list-detail__body"><section class="mw-list-detail__list" aria-label="${esc(t("listLabel"))}">${listHtml}</section>${sel ? detail(sel) : `<section class="mw-list-detail__detail kp-detail" aria-label="${esc(t("detailLabel"))}"></section>`}</div></div>`;
  }
  const pickFirst = (rows) => {
    if (!rows.length) return null;
    if (!rows.some((e) => e.id === ui.sel)) ui.sel = rows[0].id;
    return entryById(ui.sel) || D.many().find((e) => e.id === ui.sel) || rows[0];
  };
  const findEntry = (list, id) => list.find((e) => e.id === id);

  function loadingBody() {
    const rows = Array.from({ length: 7 }, () => `<li class="mw-item mw-item--pick kp-skrow">${skeleton("kp-sk-mark")}${skeleton("kp-sk-line")}</li>`).join("");
    return `<p class="kp-summary">${esc(t("loading"))}</p>${listDetail(`<ul class="mw-items">${rows}</ul>`, null)}`;
  }
  const failBody = () => empty({ error: true, icon: "alert", title: t("fail_t"), body: t("fail_b"), action: `<div class="kp-actions kp-actions--center">${btn(t("retry"), { icon: "refresh", attrs: act("sim", "retry") })}</div>` });
  const partialAlert = () => K.renderAlert({ title: t("partial_t"), body: t("partial_b"), tone: "warning", state: "failed", actions: [{ label: t("retry"), icon: "refresh", attrs: act("sim", "retry") }], role: null, className: "kp-partial" });
  const kindEmpty = (k) => k === "mcp"
    ? empty({ icon: "network", title: t("empty_mcp"), body: t("empty_mcpB"), action: `<div class="kp-actions kp-actions--center">${btn(t("addInCoding"), { attrs: act("sim", "go") })}${btn(t("goConnections"), { attrs: act("sim", "go") })}</div>` })
    : empty({ icon: "book", title: t("empty_skill"), body: t("empty_skillB"), action: `<div class="kp-actions kp-actions--center">${btn(t("importLocal"), { icon: "download", attrs: act("sim", "import") })}${btn(t("market"), { variant: "primary", attrs: act("sim", "go") })}</div>` });

  /* ---------- scheme A: one catalog, grouped by kind ---------- */
  function schemeA() {
    const all = entries();
    const toolbar = `<div class="kp-toolbar">${kindFilter(all)}<span class="kp-spacer"></span>${ioButtons()}</div><div class="kp-toolbar kp-toolbar--2">${searchBox()}${stateFilter()}</div>`;
    if (P.v === "fail") return `${toolbar}${failBody()}`;
    if (P.v === "loading") return `${toolbar}${loadingBody()}`;
    // Importing takes the page's one focus: the list steps aside until it is applied or cancelled.
    if (ui.importing) return importPanel();
    const rows = ordered(visible(all));
    if (ui.k !== "all" && !rows.length && !ui.q && ui.f === "all") return `${toolbar}${summaryLine(all)}${kindEmpty(ui.k)}`;
    const sel = pickFirst(rows) ? findEntry(all, ui.sel) : null;
    let list;
    if (ui.k === "all" && !ui.q) {
      // Grouped by kind; each group shows its first few, with a way into the whole kind, so five kinds fit in one look.
      const cap = 4;
      list = KINDS.map((k) => {
        const of = rows.filter((e) => e.kind === k);
        const head = `<h4 class="kp-group"><span>${esc(kindWord(k))}</span><span class="kp-group__n">${P.v === "partial" && k === "mcp" ? "—" : of.filter((e) => !e.gone).length}</span></h4>`;
        if (P.v === "partial" && k === "mcp") return head + partialAlert();
        if (!of.length) return ui.f === "all" ? `${head}<p class="kp-inline-empty">${esc(t("empty_inline"))}<button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-slot="button" data-act="kind" data-v="${k}"><span data-slot="button-label">${esc(k === "mcp" ? t("addInCoding") : t("importLocal"))}</span></button></p>` : "";
        const shown = of.length > cap + 1 ? of.slice(0, cap) : of;
        if (sel && sel.kind === k && !shown.includes(sel)) shown[shown.length - 1] = sel;
        const more = of.length > shown.length ? `<li class="kp-more">${btn(t("moreOf", { n: of.length, k: kindWordLower(k) }), { variant: "ghost", attrs: act("kind", k) })}</li>` : "";
        return `${head}<ul class="mw-items">${shown.map(pickRow).join("")}${more}</ul>`;
      }).join("");
    } else list = rows.length ? `<ul class="mw-items">${rows.map(pickRow).join("")}</ul>` : `<p class="kp-inline-empty">${esc(t("noMatch"))}</p>`;
    return `${toolbar}${summaryLine(all)}${listDetail(list, sel)}`;
  }

  /* ---------- scheme B: overview cards, then one kind at a time ---------- */
  function schemeB() {
    const all = entries();
    if (P.v === "fail") return `<div class="kp-toolbar">${searchBox(t("ov_search"))}<span class="kp-spacer"></span>${ioButtons()}</div>${failBody()}`;
    if (ui.page === "overview" && !ui.q) {
      const c = counts(all);
      const attn = c.na && P.v !== "loading" ? K.renderAlert({ title: t("ov_attn", { n: c.na }), body: t("ov_attnB"), tone: "warning", state: "unavailable", actions: [{ label: t("ov_only"), variant: "secondary", attrs: act("only-na") }], role: null, className: "kp-attn" }) : "";
      const card = (k) => {
        const of = all.filter((e) => e.kind === k && !e.gone);
        const failed = P.v === "partial" && k === "mcp";
        let stats = [];
        if (k === "skill") stats = [K.renderStatusMark({ label: t("ov_inUse", { n: of.filter((e) => stateOf(e).group === "on").length }), tone: "idle", state: "ready" }), of.some((e) => stateOf(e).group === "na") ? K.renderStatusMark({ label: t("ov_na", { n: of.filter((e) => stateOf(e).group === "na").length }), tone: "hold", state: "unavailable" }) : ""];
        if (k === "prompt") stats = [badge(t("ov_mine", { n: of.filter((e) => e.prompt.mine).length })), of.some((e) => stateOf(e).tone === "attention") ? K.renderStatusMark({ label: t("ov_newer", { n: of.filter((e) => stateOf(e).tone === "attention").length }), tone: "attention", state: "stale" }) : ""];
        if (k === "role") stats = [K.renderStatusMark({ label: t("ov_inUse", { n: of.filter((e) => !e.off).length }), tone: "idle", state: "ready" })];
        if (k === "tool") stats = [badge(t("ov_writes", { n: of.filter((e) => e.tool.writes).length }), "warning")];
        if (k === "mcp") stats = [K.renderStatusMark({ label: t("ov_inUse", { n: of.filter((e) => stateOf(e).group === "on").length }), tone: "idle", state: "ready" }), of.some((e) => stateOf(e).group === "na") ? K.renderStatusMark({ label: t("ov_na", { n: of.filter((e) => stateOf(e).group === "na").length }), tone: "hold", state: "unavailable" }) : ""];
        const recent = of.filter((e) => e.usage.last).sort((a, b) => (b.usage.n || 0) - (a.usage.n || 0))[0];
        const body = P.v === "loading" ? `${skeleton("kp-sk-line")}${skeleton("kp-sk-line kp-sk-short")}`
          : failed ? `<p class="mw-status-line">${K.renderStatusMark({ label: t("partial_t"), tone: "blocked", state: "failed" })}</p>`
            : !of.length ? `<p class="kp-card__line">${esc(t("empty_inline"))}</p>`
              : `<p class="kp-card__stats">${stats.join("")}</p>${recent ? `<p class="kp-card__line">${esc(t("ov_recent", { name: nameOf(recent), at: L(recent.usage.last.at) }))}</p>` : ""}`;
        const n = failed ? "—" : P.v === "loading" ? "" : of.length;
        return `<li><button type="button" class="kp-kindcard" data-act="open-kind" data-v="${k}" aria-label="${esc(t("ov_open", { k: kindWordLower(k) }))}"><span class="kp-kindcard__head">${mark(KIND_ICON[k])}<span class="kp-kindcard__name"><strong>${esc(kindWord(k))}</strong><small>${esc(t("one_" + k))}</small></span><span class="kp-kindcard__n">${n}</span></span>${body}<span class="kp-kindcard__foot">${esc(t("ov_change_" + k))}${ic("chevron-right")}</span></button></li>`;
      };
      return `<div class="kp-toolbar">${searchBox(t("ov_search"))}<span class="kp-spacer"></span>${ioButtons()}</div>${attn}<ul class="kp-kindcards">${KINDS.map(card).join("")}</ul>`;
    }
    // One kind (or a search across all of them): tabs over the batch-08 list and detail.
    const tabs = K.renderTabs({ label: t("kindLabel"), className: "kp-tabs", tabs: [{ id: "overview", label: t("ov_overview"), selected: false, attrs: act("overview") }, ...KINDS.map((k) => ({ id: k, label: `${kindWord(k)} ${P.v === "partial" && k === "mcp" ? "—" : counts(all)[k]}`, selected: ui.k === k && !ui.q && !ui.cross, attrs: act("kind", k) }))] });
    const toolbar = `${tabs}<div class="kp-toolbar">${searchBox()}${stateFilter()}<span class="kp-spacer"></span>${ioButtons()}</div>`;
    if (ui.importing) return importPanel();
    const saveK = ui.k;
    if (ui.q || ui.cross) ui.k = "all";
    const rows = ordered(visible(all));
    ui.k = saveK;
    if (!rows.length && !ui.q && ui.f === "all") return `${toolbar}${P.v === "partial" && ui.k === "mcp" ? partialAlert() : kindEmpty(ui.k)}`;
    const sel = pickFirst(rows) ? findEntry(all, ui.sel) : null;
    const list = rows.length ? `<ul class="mw-items">${rows.map(pickRow).join("")}</ul>` : `<p class="kp-inline-empty">${esc(t("noMatch"))}</p>`;
    return `${toolbar}${listDetail(list, sel)}`;
  }

  /* ---------- scheme C: grouped by where entries come from ---------- */
  function sourceDetail(id, all) {
    const s = D.sources[id];
    const of = all.filter((e) => e.src === id);
    const brings = KINDS.filter((k) => of.some((e) => e.kind === k)).map((k) => `<li>${mark(KIND_ICON[k])}<span>${esc(kindWord(k))}</span><span class="kp-group__n">${of.filter((e) => e.kind === k).length}</span></li>`).join("");
    const back = `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm mw-list-detail__back" data-slot="button" data-act="unsel">${ic("chevron-left")}<span data-slot="button-label">${esc(t("backAll"))}</span></button>`;
    const state = s.gone ? K.renderStatusMark({ label: t("w_uninstalled"), tone: "blocked", state: "blocked" }) : s.disabled ? K.renderStatusMark({ label: t("w_roleOff"), tone: "quiet", state: "paused" }) : "";
    return `<section class="mw-list-detail__detail kp-detail${ui.anim ? " is-entering" : ""}" aria-label="${esc(t("src_detailOf"))}">${back}<header><span class="kp-kind">${ic(SRC_ICON[s.kind] || "package")}${esc(t("src_trust"))}</span><h3 tabindex="-1">${esc(L(s.name))}</h3>
      <p class="kp-source">${s.version ? `<span>${esc(L(s.version))}</span><span class="kp-dot">·</span>` : ""}${s.publisher ? `<span>${esc(s.publisher)}</span><span class="kp-dot">·</span>` : ""}<span>${esc(L(s.trust))}</span>${state}</p></header>
      ${sec(t("src_brings"), `<ul class="kp-brings">${brings}</ul>`)}
      ${s.diff ? sec(t("src_diff"), `<p class="kp-line">${ic("history")}${esc(L(s.diff))}</p>`) : ""}
      ${s.manage ? `<div class="kp-actions">${goBtn(t("src_manage"))}</div>` : ""}</section>`;
  }
  function schemeC() {
    const all = entries();
    const toolbar = `<div class="kp-toolbar">${kindFilter(all)}<span class="kp-spacer"></span>${ioButtons()}</div><div class="kp-toolbar kp-toolbar--2">${searchBox()}${stateFilter()}</div>`;
    if (P.v === "fail") return `${toolbar}${failBody()}`;
    if (P.v === "loading") return `${toolbar}${loadingBody()}`;
    if (ui.importing) return importPanel();
    const rows = ordered(visible(all));
    if (ui.k !== "all" && !rows.length && !ui.q && ui.f === "all") return `${toolbar}${summaryLine(all)}${kindEmpty(ui.k)}`;
    const ids = [...new Set(rows.map((e) => e.src))];
    if (P.v === "partial" && (ui.k === "all" || ui.k === "mcp")) ids.push("__mcp_failed");
    if (!ui.srcSel) pickFirst(rows);
    // Every source is open unless the list is long; a long list opens only the source holding the selection.
    const many = rows.length > 40;
    const sel = ui.srcSel ? null : findEntry(all, ui.sel);
    const list = ids.map((id) => {
      if (id === "__mcp_failed") return `<div class="kp-src">${partialAlert()}</div>`;
      const s = D.sources[id], of = rows.filter((e) => e.src === id);
      const open = ui.open[id] ?? (!many || (sel && sel.src === id));
      const kinds = KINDS.filter((k) => of.some((e) => e.kind === k)).map((k) => `${of.filter((e) => e.kind === k).length} ${kindWordLower(k)}`).join(" · ");
      const head = `<div class="kp-src__head"><button type="button" class="kp-src__toggle" aria-expanded="${open ? "true" : "false"}" data-act="src-toggle" data-v="${id}" aria-label="${esc(L(s.name))}">${ic(open ? "chevron-down" : "chevron-right")}</button><button type="button" class="kp-src__pick" aria-current="${ui.srcSel === id ? "true" : "false"}" data-act="src-sel" data-v="${id}">${mark(SRC_ICON[s.kind] || "package")}<span><strong>${esc(L(s.name))}</strong><small>${esc((s.version ? L(s.version) + " · " : "") + kinds)}</small></span>${s.gone ? K.renderStatusMark({ label: t("w_uninstalled"), tone: "blocked", state: "blocked" }) : s.disabled ? K.renderStatusMark({ label: t("w_roleOff"), tone: "quiet", state: "paused" }) : ""}</button></div>`;
      return `<div class="kp-src">${head}${open ? `<ul class="mw-items">${of.map(pickRow).join("")}</ul>` : ""}</div>`;
    }).join("") || `<p class="kp-inline-empty">${esc(t("noMatch"))}</p>`;
    const right = ui.srcSel ? sourceDetail(ui.srcSel, all) : sel ? detail(sel) : "";
    const body = `<div class="mw-list-detail kp-ld"${ui.detail && (sel || ui.srcSel) ? " data-detail" : ""}><div class="mw-list-detail__body"><section class="mw-list-detail__list" aria-label="${esc(t("listLabel"))}">${list}</section>${right}</div></div>`;
    return `${toolbar}${summaryLine(all)}${body}`;
  }

  /* ---------- page ---------- */
  function nav() {
    const groups = [["g_local", ["appearance:sun", "directories:folder"]], ["g_personal", ["memory:bookmark", "sync:network"]], ["g_ai", ["models:key", "assistant:message", "characters:user", "kit:package"]],
      ["g_tools", ["runtimes:terminal", "library:book", "connections:link", "access:shield", "history:workflow"]], ["g_system", ["diagnostics:bug"]]];
    return `<nav class="settings-navigation settings-navigation--codex" aria-label="${esc(t("chrome"))}"><a class="settings-nav-back" href="#" data-act="sim" data-v="go">${ic("arrow")} ${esc(t("back"))}</a><div class="settings-nav-body">${groups.map(([g, items]) => `<div class="settings-nav-group-label">${esc(t(g))}</div>${items.map((x) => { const [id, i] = x.split(":"); return `<a href="#"${id === "kit" ? ' aria-current="page"' : ""} data-act="${id === "kit" ? "home" : "sim"}" data-v="go">${ic(i)}${esc(t("n_" + id))}</a>`; }).join("")}`).join("")}</div></nav>`;
  }
  function page() {
    const body = P.s === "B" ? schemeB() : P.s === "C" ? schemeC() : schemeA();
    return `<header class="project-preferences-chrome"><span>${esc(t("chrome"))}</span><a href="#" aria-label="${esc(t("close"))}" data-act="sim" data-v="go">${ic("x")}</a></header>
      <main class="settings-shell">${nav()}<div class="settings-content"><section class="settings-document kit-settings kp-scheme-${P.s}" aria-labelledby="kpH">
        <header class="settings-page-heading"><h1 id="kpH">${esc(t("h1"))}</h1><p>${esc(t("lead"))}</p></header>
        <p class="kp-scope">${ic("folder")}<span>${esc(t("scopeLine", { p: L(D.project) }))}</span></p>${body}</section></div></main>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const strip = document.getElementById("strip");
    if (shot) { strip.hidden = true; return; }
    const tg = (label, key, values) => K.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    strip.innerHTML = `<b>${esc(t("protoTitle"))}</b>${badge(t("rec"), "success")}
      <span class="proto-field">${esc(t("scheme"))}${tg(t("scheme"), "s", [["A", t("sA")], ["B", t("sB")], ["C", t("sC")]])}</span>
      <label class="proto-field">${esc(t("view"))}<select class="mw-select" data-slot="select" id="pView">${VIEWS.map((v) => `<option value="${v}"${P.v === v ? " selected" : ""}>${esc(t("v_" + v))}</option>`).join("")}</select></label>
      <span class="proto-field">${esc(t("lang"))}${tg(t("lang"), "l", [["zh", "中文"], ["en", "English"]])}</span>
      <span class="proto-field">${esc(t("theme"))}${tg(t("theme"), "t", [["light", t("light")], ["dark", t("dark")]])}</span>
      ${btn(t("reset"), { variant: "ghost", icon: "undo", attrs: { id: "reset" } })}`;
  }
  function render() {
    const root = document.documentElement;
    root.lang = P.l === "zh" ? "zh-CN" : "en";
    root.dataset.theme = P.t;
    root.dataset.resolvedTheme = P.t;
    try { localStorage.setItem("molis-work:theme", P.t); } catch { /* no storage */ }
    document.body.className = "settings-page project-preferences-page global-preferences-page" + (shot ? " kp-shot" : " kp-proto");
    renderStrip();
    const qFocus = document.activeElement?.id === "kpQ" ? document.activeElement.selectionStart : null;
    const was = document.activeElement?.closest?.("[data-act]");
    const back = was ? `[data-act="${was.dataset.act}"]${was.dataset.v ? `[data-v="${was.dataset.v}"]` : ""}` : null;
    document.getElementById("app").innerHTML = page();
    ui.anim = false;
    if (qFocus != null) { const q = document.getElementById("kpQ"); q?.focus(); q?.setSelectionRange(qFocus, qFocus); }
    else if (back) {
      const same = document.querySelector(`#app ${back}`);
      if (same && same.offsetParent) same.focus();
      else if (was.dataset.act === "sel" || was.dataset.act === "src-sel") document.querySelector("#app .kp-detail h3")?.focus();
    }
  }
  let timer;
  function toast(message, tone, action) {
    const box = document.getElementById("toasts");
    const state = tone === "success" ? ' data-mw-state="done"' : "";
    const a = action ? `<button type="button" class="mw-toast__action" data-act="${action.act}">${esc(action.label)}</button>` : "";
    box.innerHTML = `<div class="mw-toast" data-slot="toast" role="status"${state}><span>${esc(message)}</span>${a}</div>`;
    clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 4200);
  }
  const reset = () => { ui = freshUi(); persist(); render(); };

  document.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act],[data-set],#reset");
    if (!b || b.disabled) { if (ui.menu && !ev.target.closest(".kp-export")) { ui.menu = false; render(); } return; }
    if (b.tagName === "A") ev.preventDefault();
    if (b.id === "reset") { P = clone(DEF); return reset(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; if (b.dataset.set === "s") ui = freshUi(); persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    if (a !== "menu" && a !== "export") ui.menu = false;
    switch (a) {
      case "kind": ui.k = v; ui.page = "kind"; ui.q = ""; ui.cross = false; ui.srcSel = null; ui.detail = false; break;
      case "open-kind": ui.k = v; ui.page = "kind"; ui.detail = false; ui.anim = true; break;
      case "overview": ui.page = "overview"; ui.q = ""; ui.cross = false; ui.f = "all"; break;
      case "only-na": ui.f = "na"; if (P.s === "B") { ui.page = "kind"; ui.cross = true; } break;
      case "sel": ui.sel = v; ui.srcSel = null; ui.detail = true; ui.anim = true; break;
      case "src-sel": ui.srcSel = v; ui.detail = true; ui.anim = true; break;
      case "src-toggle": ui.open[v] = !(b.getAttribute("aria-expanded") === "true"); break;
      case "unsel": ui.detail = false; break;
      case "menu": ui.menu = !ui.menu; break;
      case "export": ui.menu = false; render(); return toast(t("t_exported", { x: b.querySelector("[data-slot=menu-item-label] span")?.textContent || "" }), "success");
      case "import": ui.importing = true; break;
      case "import-cancel": ui.importing = false; break;
      case "import-apply": { const n = Object.values(ui.picks).filter(Boolean).length; ui.importing = false; render(); return toast(t("t_applied", { n }), "success"); }
      case "undo-skill": if (ui.last) { ui.skillStates[ui.last.id] = ui.last.prev; ui.last = null; document.getElementById("toasts").innerHTML = ""; } break;
      case "home": break;
      case "sim": return toast(t("t_sim", { x: t("sim_" + (v || "go")) }));
      default: return;
    }
    render();
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.id === "pView") { P.v = el.value; persist(); return reset(); }
    if (el.id === "kpState") { ui.f = el.value; return render(); }
    if (el.id === "kpKindSel") { ui.k = el.value; ui.detail = false; return render(); }
    if (el.dataset.pick) { ui.picks[el.dataset.pick] = el.checked; return render(); }
    if (el.dataset.skill) {
      // A skill's state applies at once (batch 08), with undo in the toast.
      const id = el.dataset.skill, prev = ui.skillStates[id];
      ui.skillStates[id] = el.value; ui.last = { id, prev };
      render();
      return toast(t("t_state", { n: nameOf(entryById(id)), s: t("w_" + el.value) }), "success", { label: t("undo"), act: "undo-skill" });
    }
  });
  document.addEventListener("input", (ev) => { if (ev.target.id === "kpQ") { ui.q = ev.target.value; if (P.s === "B" && ui.q) ui.page = "kind"; render(); } });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && ui.menu) { ui.menu = false; render(); document.getElementById("kpExport")?.focus(); } });

  render();
})();
