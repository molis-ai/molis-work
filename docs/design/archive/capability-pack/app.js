// Batch-09 prototype (piece 9-11): AI kits ("能力包", code `kit`) on the settings page. Spec: specs/capability-pack/spec.md.
// Decided by the user on 2026-11-09: scheme A, the pack list beside one pack's detail. A capability pack holds its skills, MCP
// servers and tools, and the roles that go with it; each role carries its own prompts, and prompts with no role of their own sit
// under the personal assistant. An item opens in place, under a way back to its pack. Packs have no switch of their own; only
// skills are switched here (batch 08's three states and detail block, unchanged), the rest is read here and changed on its owner's
// page. Every control is the board's (window.mwKit, ../kit/kit.css, ../kit/settings.css); pack.css only places them. Nothing is written.
(() => {
  const K = window.mwKit;
  const D = window.KIT_DATA;
  const KEY = "molis-proto.capability-pack.v3";
  const DEF = { v: "normal", l: "zh", t: "light" };
  const VIEWS = ["normal", "pack", "role", "prompt", "skill", "mcp", "tool", "disabled", "gone", "partial", "fail", "empty", "many", "loading", "import", "export"];
  const esc = K.escapeHtml;
  const clone = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- words ---------- */
  const T = {
    zh: {
      protoTitle: "能力包目录 · 原型", view: "画面", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置", 
      v_normal: "全部（正常）", v_skill: "技能详情（08 原样）", v_prompt: "提示词详情", v_role: "角色详情", v_tool: "工具详情", v_mcp: "MCP 详情（三种「开」）", v_gone: "主人已卸载", v_partial: "一类没读到", v_fail: "整页读失败", v_empty: "新项目（有的类是空的）", v_many: "条目很多", v_loading: "正在读", v_import: "导入一个文件", v_export: "导出菜单",
      chrome: "全局设置", close: "关闭全局设置", back: "返回项目",
      g_local: "本机", g_personal: "个人", g_ai: "AI", g_tools: "工具与接入", g_system: "系统",
      n_appearance: "界面与语言", n_directories: "本机目录", n_memory: "记忆", n_sync: "同步", n_models: "模型设置", n_assistant: "助理", n_characters: "角色", n_kit: "能力包", n_runtimes: "AI 与执行工具", n_library: "能力库", n_connections: "服务连接", n_access: "对外接入", n_history: "调用记录", n_diagnostics: "诊断",
      h1: "能力包", lead: "助理和 Coding 能用的五类能力都在这里，各自从哪来、在哪生效、用了多少。技能在这里开关；其余几类在这里看，改去它自己的页面。",
      scopeLine: "这个项目：{p}　·　标「个人空间」的在每个项目里都一样",
      k_skill: "技能", k_prompt: "提示词", k_role: "角色", k_tool: "工具", k_mcp: "MCP",
      stLabel: "按状态看", st_all: "全部状态", st_on: "在用", st_off: "没开", st_na: "用不了", 
      import: "导入", export: "导出", 
      detailLabel: "条目详情", 
      scope_home: "个人空间", scope_project: "这个项目",
      // states
      w_auto: "自动", w_manual: "仅手动", w_off: "关", w_naFix: "暂时用不了", w_revoked: "已撤销", w_default: "默认", w_mine: "你的版本", w_mineOld: "默认已更新", w_inUse: "在用", w_roleOff: "停用", w_writes: "会写", w_reads: "只读", w_connected: "已连接", w_broken: "断开了", w_deleted: "已删除", w_uninstalled: "已卸载", w_outbound: "对外开着",
      // detail
      d_now: "现在", d_usage: "用量", d_where: "用在哪", d_version: "版本与升级", d_declared: "声明能用的工具", d_declaredNote: "只是说明，不是授权：真正能用什么，由角色的工具名单和动作授权决定。", d_roles: "开放给这些角色",
      d_kitOuter: "能力包另记的", whereNone: "还没有地方用到它",
      u_recent: "近期 {n} 次", u_last: "最近一次 {at}{by}", u_by: " · {by}", u_none: "还没有使用记录", u_lastOnly: "只有最近一次", u_history: "卸载前近期 {n} 次",
      ur_skill: "按技能的使用记录算，只算保留下来的近期记录。", ur_prompt: "每个提示词只留最近 200 次记录，这里不是总数。", ur_role: "按角色运行记录和提示词记录算，只算近期。", ur_mcp: "按调用记录算，调用记录只保留近期。", ur_tool: "工具只记最近一次是什么时候。", ur_history: "名称照卸载前的样子保留。",
      // prompt
      p_default: "用的是默认版 {v}。", p_mine: "用的是你的版本，基于 {base}；默认也是 {base}。", p_mineOld: "用的是你的版本，基于 {base}；默认已更新到 {latest}。", p_noBody: "这里不显示正文。改写、对比和恢复默认都在「提示词」里，从下一轮生效。",
      p_edit: "在提示词里改", p_compare: "对比新的默认", p_ver: "默认 {v}（{src} 带来）", p_verMine: "你的版本基于 {base}；默认现在是 {latest}",
      // role
      r_active: "在这些地方生效", r_activeNone: "现在没有地方用它", r_scopeNote: "生效范围以后在角色设置里给出。", r_edit: "去角色", r_view: "在 Coding 设置里看", r_ver: "{v} · {decl}", r_new: "新增于 Coding 3.2", r_off: "停用了，不会被选用。",
      // tool
      t_note: "工具不能在这里开关。谁能用它，由角色的工具名单和动作授权决定。", t_origin_system: "Molis Work 自带的工具", t_origin_gateway: "Molis Work 自带的工具：经平台调用动作", t_origin_subagent: "Molis Work 自带的工具：交给子代理", t_origin_plan: "Molis Work 自带的工具：记下这一轮的步骤", t_ver: "随 Molis Work 一起更新", t_added: "最近一次更新新增", t_rolesNone: "还没有角色开放它", t_toRoles: "去角色",
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
      // states of the page
      fail_t: "没能读出能力包", fail_b: "宿主没有回应，什么都没改。诊断编号 K-2F91。", retry: "重试", partial_t: "MCP 这一类没读到", partial_b: "MCP 服务器的清单没有读到（诊断编号 K-7Q2F）。包里其余的照常列出。",
      importLocal: "从本机导入", market: "去插件市场", loading: "正在读能力包…",
      // overview (B)
      
      // import / export
      im_h: "从文件导入", im_file: "{name}", im_from: "{from}", im_repick: "重新选文件", im_prompts: "提示词改写（{n}）", im_promptsLead: "逐条看过再套用。套用后从下一轮生效，随时可以在「提示词」里恢复默认。装任何包都不会改提示词，只有这里你点了才会。",
      im_ok: "基于 {base}，这里也是 {here}", im_old: "基于 {base}，这里已是 {here}：版本对不上，不套用", im_missing: "这里没有{owner}：不套用", im_apply: "套用：{n}", im_diff: "看改了什么", im_refs: "引用（{n}）", im_refsLead: "角色、工具和 MCP 只带名字和版本，不带配置、地址和凭据。",
      im_here: "这里有", im_notHere: "这里没有，用不了", im_skills: "内容包（{n}）", im_skillsGo: "去看安装确认", im_cancel: "取消", im_go: "套用 {n} 条改写", im_none: "选要套用的改写",
      ex_refs: "角色、工具和 MCP 的引用", ex_refsD: "只带名字和版本，不带配置、地址和凭据",
      t_sim: "原型：{x}", t_state: "「{n}」改成{s}", undo: "撤销", t_exported: "已导出：{x}", t_applied: "已套用 {n} 条改写，下一轮生效",
      sim_go: "去主人的页面", sim_retry: "重新读", sim_body: "在侧栏打开正文", sim_import: "打开文件选择",
      diff_insert: "新增", diff_delete: "删除", diff_same: "不变",
    },
    en: {
      protoTitle: "AI kit catalog · prototype", view: "Screen", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset", 
      v_normal: "All (normal)", v_skill: "Skill detail (08 as is)", v_prompt: "Prompt detail", v_role: "Role detail", v_tool: "Tool detail", v_mcp: "MCP detail (three “on”s)", v_gone: "Owner uninstalled", v_partial: "One kind unread", v_fail: "Page failed to read", v_empty: "New project (some kinds empty)", v_many: "Many entries", v_loading: "Loading", v_import: "Importing a file", v_export: "Export menu",
      chrome: "Settings", close: "Close settings", back: "Back to project",
      g_local: "This computer", g_personal: "Personal", g_ai: "AI", g_tools: "Tools & access", g_system: "System",
      n_appearance: "Appearance & language", n_directories: "Folders", n_memory: "Memory", n_sync: "Sync", n_models: "Models", n_assistant: "Assistant", n_characters: "Roles", n_kit: "AI kit", n_runtimes: "AI & execution tools", n_library: "Capability library", n_connections: "Service connections", n_access: "Outside access", n_history: "Call history", n_diagnostics: "Diagnostics",
      h1: "AI kit", lead: "All five kinds of things the assistant and Coding can use, with where each comes from, where it applies and how much it was used. Skills are switched here; the others are read here and changed on their own page.",
      scopeLine: "This project: {p}  ·  “Personal space” entries are the same in every project",
      k_skill: "Skills", k_prompt: "Prompts", k_role: "Roles", k_tool: "Tools", k_mcp: "MCP",
      stLabel: "By state", st_all: "Any state", st_on: "In use", st_off: "Off", st_na: "Unavailable", 
      import: "Import", export: "Export", 
      detailLabel: "Entry detail", 
      scope_home: "Personal space", scope_project: "This project",
      w_auto: "Auto", w_manual: "Manual only", w_off: "Off", w_naFix: "Unavailable for now", w_revoked: "Revoked", w_default: "Default", w_mine: "Your version", w_mineOld: "Default updated", w_inUse: "In use", w_roleOff: "Turned off", w_writes: "Writes", w_reads: "Read only", w_connected: "Connected", w_broken: "Disconnected", w_deleted: "Deleted", w_uninstalled: "Uninstalled", w_outbound: "Open outward",
      d_now: "Now", d_usage: "Usage", d_where: "Used in", d_version: "Version and upgrades", d_declared: "Tools it declares", d_declaredNote: "A note, not a permission: what it can really use follows the role's tool list and action grants.", d_roles: "Open to these roles",
      d_kitOuter: "What the AI kit adds", whereNone: "Nothing uses it yet",
      u_recent: "{n} recent uses", u_last: "Last used {at}{by}", u_by: " · {by}", u_none: "No use recorded", u_lastOnly: "Last use only", u_history: "{n} recent uses before it was uninstalled",
      ur_skill: "From skill use records; only the recent records kept.", ur_prompt: "Each prompt keeps its last 200 uses, so this is not a total.", ur_role: "From role runs and prompt records; recent only.", ur_mcp: "From call records, which are kept for a short time.", ur_tool: "For tools, only the time of the last use is kept.", ur_history: "Names are kept as they were before uninstalling.",
      p_default: "Using the default, {v}.", p_mine: "Using your version, based on {base}; the default is still {base}.", p_mineOld: "Using your version, based on {base}; the default is now {latest}.", p_noBody: "The text isn't shown here. Rewriting, comparing and restoring the default happen in Prompts and apply from the next turn.",
      p_edit: "Edit in Prompts", p_compare: "Compare with new default", p_ver: "Default {v} (from {src})", p_verMine: "Your version is based on {base}; the default is now {latest}",
      r_active: "Applies in", r_activeNone: "Nothing uses it now", r_scopeNote: "Where it applies will be given in role settings.", r_edit: "Go to Roles", r_view: "See in Coding settings", r_ver: "{v} · {decl}", r_new: "New in Coding 3.2", r_off: "Turned off; it won't be picked.",
      t_note: "Tools aren't switched here. Who can use one follows the role's tool list and action grants.", t_origin_system: "A tool built into Molis Work", t_origin_gateway: "Built into Molis Work: calls actions through the platform", t_origin_subagent: "Built into Molis Work: hands off to a sub-agent", t_origin_plan: "Built into Molis Work: records this turn's steps", t_ver: "Updated with Molis Work", t_added: "New in the latest update", t_rolesNone: "No role opens it yet", t_toRoles: "Go to Roles",
      m_title: "Is it on? Three separate things", m_server: "Server", m_serverWhat: "Whether the server runs and can be reached", m_out: "For outside clients", m_outWhat: "Which outside AI tools may connect to it", m_tools: "Tools available", m_toolsWhat: "How many of its tools are registered as actions and can be called",
      m_on: "On", m_conn: "Connected", m_broken: "Disconnected", m_gone: "Deleted", m_outN: "Open to {n}: {list}", m_outNa: "Doesn't apply: a server brought in", m_toolsN: "{open} of {total} open", m_toolsAll: "All {total} registered", m_toolsNone: "None of {total} usable",
      m_toAccess: "Outside access", m_toCodingMcp: "Coding MCP settings", m_toConn: "Service connections", m_toLibrary: "Capability library", m_reconnect: "Reconnect", m_skill: "Installed with it in outside AI tools", m_disc: "Changes found on the last list read", m_added: "Added", m_removed: "Removed",
      m_ver: "List version: {v}", m_noConnect: "The catalog reads the stored list; it never connects to the server.", m_withHost: "Runs with Molis Work",
      gone_t: "{owner} was uninstalled on {at}", gone_mcp_t: "{owner} was deleted on {at}", gone_b: "This no longer applies and won't be used. Below is its usage before it was removed, under the names it had then.", gone_add: "Add {owner} again", gone_export: "Export this rewrite",
      sk_for: "For", sk_when: "When to use", sk_whenNot: "When not to use", sk_tools: "Tools (declared, not granted)", sk_conn: "Connector kinds", sk_files: "Included files", sk_excerpt: "Start of the text", sk_noTools: "No tools declared", sk_noFiles: "No included files", sk_runs: "runs",
      sk_how: "How to use", sk_offD: "Don't use this skill", sk_autoD: "AI picks it when it fits", sk_manualD: "Only when you name it", sk_open: "Open full text", sk_enabled: "Enabled", sk_used: "Last used", sk_manage: "Manage this pack", sk_enablePlugin: "Turn plugin on", sk_connect: "Manage connections",
      sk_why_plugin_disabled: "The plugin is off; the setting stays and comes back with it.", sk_why_connection_missing: "The service it needs isn't connected yet.", sk_change_body_changed: "Text changed in 2.0 (1.4 → 2.0)", sk_change_added: "New in 2.0", sk_change_none: "Not upgraded since installed",
      sk_trust_host: "Built in", ap_assistant: "Assistant", ap_coding: "Coding", ap_both: "Assistant and Coding", conn_calendar: "Calendar",
      fail_t: "Couldn't read the AI kit", fail_b: "The host didn't answer; nothing changed. Diagnostic K-2F91.", retry: "Retry", partial_t: "MCP couldn't be read", partial_b: "The list of MCP servers couldn't be read (diagnostic K-7Q2F). Everything else in the kit is listed as usual.",
      importLocal: "Import from this computer", market: "Open plugin market", loading: "Reading the AI kit…",
      
      im_h: "Import from a file", im_file: "{name}", im_from: "{from}", im_repick: "Choose another file", im_prompts: "Prompt rewrites ({n})", im_promptsLead: "Look at each before applying it. Applied rewrites take effect from the next turn, and Prompts can always restore the default. Installing a package never changes prompts; only your choice here does.",
      im_ok: "Based on {base}; here it's {here} too", im_old: "Based on {base}; here it's already {here}: versions differ, not applied", im_missing: "{owner} isn't here: not applied", im_apply: "Apply: {n}", im_diff: "What changed", im_refs: "References ({n})", im_refsLead: "Roles, tools and MCP carry only a name and version — no settings, addresses or credentials.",
      im_here: "Here", im_notHere: "Not here, unavailable", im_skills: "Content package ({n})", im_skillsGo: "Open install review", im_cancel: "Cancel", im_go: "Apply {n} rewrite", im_none: "Choose rewrites to apply",
      ex_refs: "Role, tool and MCP references", ex_refsD: "Names and versions only; no settings, addresses or credentials",
      t_sim: "Prototype: {x}", t_state: "“{n}” set to {s}", undo: "Undo", t_exported: "Exported: {x}", t_applied: "Applied {n} rewrite; takes effect next turn",
      sim_go: "goes to the owner's page", sim_retry: "reads again", sim_body: "opens the text in the side panel", sim_import: "opens a file picker",
      diff_insert: "Added", diff_delete: "Removed", diff_same: "Unchanged",
    },
  };
  // The pack model (user, 2026-11-09): a capability pack holds its skills, MCP servers and tools, and the roles that go with it;
  // each role carries its own prompts. The page opens on a list of packs.
  Object.assign(T.zh, {
    protoTitle: "能力包 · 原型", decided: "已定：A 列表＋包详情", 
    v_normal: "能力包列表", v_pack: "一个包（Coding 开发）", v_role: "角色和它的提示词", v_prompt: "提示词详情", v_skill: "技能详情（08 原样）", v_mcp: "MCP 详情（三种「开」）", v_tool: "工具详情",
    v_disabled: "插件停用了", v_gone: "包已卸载", v_partial: "MCP 没读到", v_fail: "整页读失败", v_empty: "只有自带的包", v_many: "包很多", v_loading: "正在读", v_import: "导入一个能力包", v_export: "导出这个包",
    lead: "一个能力包把做一类事要用的放在一起：技能、MCP、工具，以及搭配的角色和角色的提示词。技能在这里开关；其余的在这里看，改去它自己的页面。",
    pk_kind: "能力包", pk_search: "找能力包，或包里的技能、角色、提示词", pk_searchLabel: "找能力包", pk_summary: "{n} 个能力包　·　{na} 个有要处理的", pk_onlyNa: "只看这些", pk_match: "包含：{x}", pk_noMatch: "没有符合的能力包",
    st_all: "全部", st_on: "在用", st_na: "有要处理的", st_off: "停用或已卸载",
    c_role: "{n} 角色", c_skill: "{n} 技能", c_mcp: "{n} MCP", c_tool: "{n} 工具", c_prompt: "{n} 提示词",
    s_roles: "角色和它的提示词", s_skills: "技能", s_mcp: "MCP", s_tools: "工具", s_upgrade: "上次升级",
    none_roles: "没有搭配角色：包里的技能给哪个角色都能用。", none_skills: "这个包没有技能。", none_mcp: "这个包没有 MCP 服务器。", none_tools: "没有声明要用的工具。",
    tools_note: "工具是系统的，几个包可以声明同一个。谁真正能用，由角色的工具名单决定，不在这里开关。",
    r_prompts: "它的提示词", r_noPrompts: "没有自己的提示词", r_where: "生效：{x}", r_whereNone: "现在没有地方用它",
    pk_unknown: "没读全", pk_unknownB: "MCP 这一类没读到，说不准包里有没有用不了的东西", pk_on: "在用", pk_na: "{n} 项要处理", pk_off: "已停用", pk_gone: "已卸载",
    pk_onB: "包里的东西都能用。", pk_naB: "{x}", pk_offB: "插件停用了：包里的技能、角色和提示词都不会被用到。启用后照原来的设置。", pk_goneB: "{owner}已在 {at} 卸载，包里的东西不再列出。重新添加后，你改过的提示词照原样回来。",
    pk_export: "导出这个包", pk_manage: "在插件设置里管理", pk_enable: "启用插件", pk_readd: "重新添加{owner}", 
    addInCoding: "在 Coding 里加",
    ref_line: "Molis Work 自带的个人助理，这里只是引用", pk_manageAssistant: "在助理设置里管理", pk_manageChars: "在角色里管理",
    tools_noteB: "全部 Agent 工具都放在这里。插件的包里列的，是它的角色用得到的那几个。",
    ex_wholeAppD: "你的提示词改写，加上角色、工具和 MCP 的引用；插件本身不随文件走", ex_refsOnlyD: "你的角色只导出引用：名字和版本，不带写法",
    loose_line: "没有归属角色，默认归个人助理", loose_in: "没有归属角色，默认归「{r}」", exportOf: "导出「{p}」",
    crumb_all: "全部能力包", crumb_up: "回到「{p}」", in_packs: "在这些能力包里", in_role: "属于角色「{r}」",
    ex_whole: "整个包", ex_wholeD: "内容包原样带签名，加上你的提示词改写和引用；导回时各部分走各自的路", ex_prompts: "只导出你的提示词改写", ex_promptsD: "存成你自己的数据文件，导回时逐条确认",
    im_h: "导入一个能力包", im_pack: "文件里是能力包「{p}」",
    empty_t: "还没有装别的能力包", empty_b: "下面是 Molis Work 自带的。可以装一个能力包，或者把本机 Agent 里已有的技能导进来。",
    loading: "正在读能力包…",
  });
  Object.assign(T.en, {
    protoTitle: "AI kits · prototype", decided: "Decided: A list + kit detail", 
    v_normal: "Kit list", v_pack: "One kit (Coding)", v_role: "A role and its prompts", v_prompt: "Prompt detail", v_skill: "Skill detail (08 as is)", v_mcp: "MCP detail (three “on”s)", v_tool: "Tool detail",
    v_disabled: "Plugin turned off", v_gone: "Kit uninstalled", v_partial: "MCP unread", v_fail: "Page failed to read", v_empty: "Built-in kits only", v_many: "Many kits", v_loading: "Loading", v_import: "Importing a kit", v_export: "Export this kit",
    h1: "AI kits", n_kit: "AI kits",
    lead: "An AI kit keeps what one kind of work needs together: skills, MCP servers and tools, plus the roles that go with them and each role's prompts. Skills are switched here; the rest is read here and changed on its own page.",
    pk_kind: "AI kit", pk_search: "Find a kit, or a skill, role or prompt in one", pk_searchLabel: "Find a kit", pk_summary: "{n} kits  ·  {na} need a look", pk_onlyNa: "Show only these", pk_match: "Has: {x}", pk_noMatch: "No kits match",
    st_all: "All", st_on: "In use", st_na: "Needs a look", st_off: "Off or uninstalled",
    c_role: "{n} roles", c_skill: "{n} skills", c_mcp: "{n} MCP", c_tool: "{n} tools", c_prompt: "{n} prompts",
    c1_role: "1 role", c1_skill: "1 skill", c1_mcp: "1 MCP", c1_tool: "1 tool", c1_prompt: "1 prompt",
    s_roles: "Roles and their prompts", s_skills: "Skills", s_mcp: "MCP", s_tools: "Tools", s_upgrade: "Last upgrade",
    none_roles: "No roles with it: its skills work with any role.", none_skills: "This kit has no skills.", none_mcp: "This kit has no MCP servers.", none_tools: "No tools declared.",
    tools_note: "Tools belong to the system and several kits can declare the same one. Who can really use a tool follows the role's tool list; it isn't switched here.",
    r_prompts: "Its prompts", r_noPrompts: "No prompts of its own", r_where: "Applies in: {x}", r_whereNone: "Nothing uses it now",
    pk_unknown: "Not fully read", pk_unknownB: "Its MCP couldn't be read, so it isn't certain everything in it works", pk_on: "In use", pk_na: "{n} need a look", pk_off: "Turned off", pk_gone: "Uninstalled",
    pk_onB: "Everything in it can be used.", pk_naB: "{x}", pk_offB: "The plugin is off: its skills, roles and prompts won't be used. Turning it on keeps the settings it had.", pk_goneB: "{owner} was uninstalled on {at}, so what it held is no longer listed. Add it again and your prompt edits come back as they were.",
    pk_export: "Export this kit", pk_manage: "Manage in plugin settings", pk_enable: "Turn plugin on", pk_readd: "Add {owner} again", 
    addInCoding: "Add in Coding",
    ref_line: "The personal assistant built into Molis Work; only referenced here", pk_manageAssistant: "Manage in assistant settings", pk_manageChars: "Manage in Roles",
    tools_noteB: "Every Agent tool lives here. A plugin's kit lists the ones its roles use.",
    ex_wholeAppD: "Your prompt rewrites, plus role, tool and MCP references; the plugin itself doesn't travel in the file", ex_refsOnlyD: "Your roles export as references only: names and versions, not what they say",
    loose_line: "No role of its own; under the personal assistant", loose_in: "No role of its own; it sits under “{r}”", exportOf: "Export “{p}”",
    crumb_all: "All kits", crumb_up: "Back to “{p}”", in_packs: "In these kits", in_role: "Belongs to the role “{r}”",
    ex_whole: "The whole kit", ex_wholeD: "The content package as signed, plus your prompt rewrites and references; each part goes back its own way", ex_prompts: "Only your prompt rewrites", ex_promptsD: "Saved as your own data file; confirmed one by one when brought back",
    im_h: "Import an AI kit", im_pack: "The file holds the kit “{p}”",
    empty_t: "No other kits yet", empty_b: "Below is what comes with Molis Work. Install a kit, or bring in skills your local agents already have.",
    loading: "Reading AI kits…",
  });

  // Review round 3 (2026-11-09): user words only — no batch numbers, no SDK names; tools are Molis Work's own.
  Object.assign(T.zh, {
    ver_n: "第 {n} 版",
    pk_goneRow: "{at} 卸载", pk_noMatchT: "没有符合的能力包", pk_noMatchB: "换个词，或者清除搜索看全部。", clear_q: "清除搜索", clear_k: "看全部类别",
    kLabel: "按类别看", k_all: "全部类别", pk_summaryK: "{n} 个能力包里有{k}",
    im_done_t: "导入完成", im_done_b: "{n} 条提示词改写已套用，从下一轮生效。内容包「{p}」在插件的安装确认里等你看过再装。", im_done_b0: "没有套用提示词改写。内容包「{p}」在插件的安装确认里等你看过再装。", im_finish: "完成", im_review: "去看安装确认",
  });
  Object.assign(T.en, {
    ver_n: "Version {n}",
    pk_goneRow: "Uninstalled {at}", pk_noMatchT: "No kits match", pk_noMatchB: "Try another word, or clear the search to see them all.", clear_q: "Clear search", clear_k: "Show all kinds",
    kLabel: "By kind", k_all: "All kinds", pk_summaryK: "{n} kits have {k}",
    im_done_t: "Import finished", im_done_b: "{n} prompt rewrite(s) applied; they take effect next turn. The content package “{p}” waits in the plugin install review for you to look at before it's installed.", im_done_b0: "No prompt rewrites applied. The content package “{p}” waits in the plugin install review for you to look at before it's installed.", im_finish: "Done", im_review: "Open install review",
  });

  /* ---------- state ---------- */
  const readHash = () => Object.fromEntries(new URLSearchParams(location.hash.slice(1)));
  let P = (() => { try { return Object.assign(clone(DEF), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return clone(DEF); } })();
  const H = readHash();
  for (const k of ["v", "l", "t"]) if (H[k]) P[k] = H[k];
  if (!VIEWS.includes(P.v)) P.v = "normal";
  const shot = H.shot === "1";
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* private window: memory only */ } };
  const t = (k, v) => (T[P.l][k] ?? T.zh[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const en = () => P.l === "en";
  const gap = () => (en() ? " " : "　"), list = () => (en() ? ", " : "、"), semi = () => (en() ? "; " : "；"), colon = () => (en() ? ": " : "："), paren = (n) => (en() ? ` (${n})` : `（${n}）`);
  const L = (o) => (o && typeof o === "object" ? o[P.l] : o) ?? "";

  // What each screen starts from: the pack, the item opened inside it (null = the pack itself), and whether a narrow screen shows
  // the right side.
  const PRESET = {
    normal: { pack: "pk-writing", item: null, detail: false },
    pack: { pack: "pk-coding", item: null, detail: true },
    role: { pack: "pk-coding", item: "ro-impl", detail: true },
    prompt: { pack: "pk-goals", item: "pr-split", detail: true },
    skill: { pack: "pk-writing", item: "sk-weekly", detail: true },
    mcp: { pack: "pk-builtin", item: "mc-molis", detail: true },
    tool: { pack: "pk-coding", item: "tl-run_command", detail: true },
    disabled: { pack: "pk-legal", item: null, detail: true },
    gone: { pack: "pk-contracts", item: null, detail: true },
    partial: { pack: "pk-coding", item: null, detail: true },
    fail: { pack: null, item: null, detail: false },
    empty: { pack: "pk-builtin", item: null, detail: false },
    many: { pack: "pk-writing", item: null, detail: false },
    loading: { pack: null, item: null, detail: false },
    import: { pack: "pk-writing", item: null, detail: false, importing: true },
    export: { pack: "pk-writing", item: null, detail: true, menu: true },
  };
  const entryById = (id) => D.entries.find((e) => e.id === id);
  const freshUi = () => {
    const p = PRESET[P.v] || PRESET.normal;
    const skillStates = {};
    for (const e of D.entries) if (e.skill) skillStates[e.id] = e.skill.state;
    return { pack: p.pack, item: p.item, detail: p.detail, menu: !!p.menu, importing: !!p.importing,
      q: "", f: P.v === "gone" ? "off" : "all", k: "all", back: null, done: null, skillStates, picks: { i1: true }, last: null, anim: false };
  };
  let ui = freshUi();

  /* ---------- data for the current screen ---------- */
  const entries = () => (P.v === "partial" ? D.entries.filter((e) => e.kind !== "mcp") : D.entries.slice());
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

  /* ---------- the batch-08 skill block, as the product draws it (apps/workbench/src/settings-skills.ts) ---------- */
  function skillBlock(e) {
    const s = e.skill, src = srcOf(e), st = ui.skillStates[e.id] ?? s.state, u = s.unavailable;
    const locked = u && ["plugin_disabled", "publisher_revoked", "resource_invalid"].includes(u.reason);
    const radios = `<fieldset class="mw-radio-group" data-slot="radio-group"${locked ? " disabled" : ""}><legend class="skill-sr">${esc(L(s.name))} · ${esc(t("sk_how"))}</legend>${["off", "auto", "manual"].map((v) =>
      `<label class="mw-check-row"><input type="radio" name="sk-${e.id}" value="${v}" data-skill="${e.id}"${st === v ? " checked" : ""}><span>${esc(t("w_" + v))}</span><small class="settings-muted">${esc(t("sk_" + v + "D"))}</small></label>`).join("")}</fieldset>`;
    const why = u ? `<div class="mw-alert" data-slot="alert" role="status"><p>${esc(t("sk_why_" + u.reason))}</p>${u.reason === "connection_missing" ? `<a class="mw-btn mw-btn--link" href="#" data-act="sim" data-v="go">${esc(t("sk_connect"))}</a>` : ""}</div>` : "";
    const fact = (k, v) => (v ? `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>` : "");
    const files = s.resources.map((r) => `${r.path} · ${r.bytes} B${r.role === "script" ? " · " + t("sk_runs") : ""}`).join("\n") || t("sk_noFiles");
    const facts = `<dl class="mw-facts">${fact("sk_for", t("ap_" + s.applies))}${fact("sk_when", L(s.when))}${fact("sk_whenNot", L(s.whenNot))}${fact("sk_tools", s.tools.join(list()) || t("sk_noTools"))}${fact("sk_conn", (s.connectors || []).map((c) => t("conn_" + c)).join(list()))}${fact("sk_files", files)}${fact("sk_excerpt", L(s.excerpt))}</dl>`;
    const open = st !== "off" && !u ? `<button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-slot="button" data-act="sim" data-v="body"><span data-slot="button-label">${esc(t("sk_open"))}</span></button>` : "";
    const enabled = s.enabled ? `<p class="settings-muted">${esc(t("sk_enabled"))} · ${esc(s.enabled.at)} · ${esc(L(s.enabled.by))} · ${esc(t(e.scope === "home" ? "scope_home" : "scope_project"))}</p>` : "";
    const used = e.usage.last ? `<p class="mw-list-detail__used">${esc(t("sk_used"))} · ${esc(L(e.usage.last.at))}${e.usage.last.by ? " · " + esc(L(e.usage.last.by)) : ""}</p>` : "";
    const next = u?.reason === "plugin_disabled" ? t("sk_enablePlugin") : t("sk_manage");
    return `<header><h3 tabindex="-1">${esc(L(s.name))}</h3><p>${esc(L(s.desc))}</p><p class="settings-muted">${esc(L(src.name))} · ${esc(L(e.version))}${src.publisher ? " · " + esc(src.publisher) : ""}</p><p class="settings-muted">${esc(t(e.scope === "home" ? "scope_home" : "scope_project"))} · ${esc(L(src.trust))}</p></header>
      ${radios}${why}${facts}${open}${enabled}${used}<a class="mw-btn mw-btn--link" href="#" data-act="sim" data-v="go">${esc(next)}</a>`;
  }

  /* ---------- the pack's own detail parts, shared by every kind ---------- */
  function usageBlock(e, o = {}) {
    const u = o.noLast ? Object.assign({}, e.usage, { last: null }) : e.usage;
    const by = u.last?.by ? t("u_by", { by: L(u.last.by) }) : "";
    const big = u.range === "recent" || u.range === "history" ? `<span class="kp-num">${u.n}</span>` : "";
    if (u.range === "not_counted") return "";
    const head = { recent: t("u_recent", { n: u.n }), history: t("u_history", { n: u.n }), last_only: t("u_lastOnly"), none: t("u_none") }[u.range];
    const last = u.last ? `<span>${esc(t("u_last", { at: L(u.last.at), by }))}</span>` : "";
    const note = u.range === "history" ? t("ur_history") : u.range === "none" && e.kind !== "tool" ? "" : t("ur_" + e.kind);
    return `<div class="kp-usage">${big}<div class="kp-usage__text"><strong>${esc(head)}</strong>${last}</div></div>${note ? `<p class="kp-note">${esc(note)}</p>` : ""}`;
  }
  const whereBlock = (e) => (e.where.length ? `<ul class="kp-places">${e.where.map((w) => `<li>${ic("target")}<span>${esc(L(w))}</span></li>`).join("")}</ul>` : `<p class="kp-note">${esc(t("whereNone"))}</p>`);
  const goBtn = (label, variant) => btn(label, { variant: variant || "secondary", icon: "arrow", attrs: act("sim", "go") });
  const statusLine = (markHtml, text, link) => `<p class="mw-status-line">${markHtml}${esc(text)}${link ? `<a class="mw-btn mw-btn--link" href="#" data-act="sim" data-v="go">${esc(link)}</a>` : ""}</p>`;

  const verWord = (e) => { const v = L(e.version), m = e.kind === "prompt" && /^v(\d+)$/.exec(v); return m ? t("ver_n", { n: m[1] }) : v; };
  function header(e) {
    const src = srcOf(e);
    return `<header><span class="kp-kind">${ic(KIND_ICON[e.kind])}${esc(kindWord(e.kind))}</span><h3 tabindex="-1">${esc(nameOf(e))}${e.code ? ` <code class="kp-code">${esc(e.code)}</code>` : ""}</h3><p>${esc(descOf(e))}</p>
      <p class="kp-source">${ic(SRC_ICON[src.kind] || "package")}<span>${esc(L(src.name))}</span>${e.version && e.kind !== "tool" ? `<span class="kp-dot">·</span><span>${esc(verWord(e))}</span>` : ""}<span class="kp-dot">·</span>${badge(t(e.scope === "home" ? "scope_home" : "scope_project"), e.scope === "home" ? "info" : "neutral")}</p></header>`;
  }

  function goneBlock(e) {
    const isMcp = e.kind === "mcp";
    const title = t(isMcp ? "gone_mcp_t" : "gone_t", { owner: L(e.gone.owner), at: L(e.gone.at) });
    const actions = isMcp ? [{ label: t("addInCoding"), variant: "secondary", attrs: act("sim", "go") }]
      : [{ label: t("gone_add", { owner: L(e.gone.owner) }), variant: "secondary", attrs: act("sim", "go") }, ...(e.kind === "prompt" ? [{ label: t("gone_export"), variant: "ghost", attrs: act("sim", "go") }] : [])];
    return K.renderAlert({ title, body: t("gone_b"), tone: "warning", state: "blocked", actions, role: null });
  }

  function promptDetail(e, pk) {
    const p = e.prompt, src = srcOf(e);
    const owner = pk ? roleOfPrompt(pk, e.id) : null;
    const ownerLine = owner ? t(isLoose(pk, e.id) ? "loose_in" : "in_role", { r: nameOf(entryById(owner.id)) }) : "";
    const line = !p.mine ? t("p_default", { v: p.latest }) : p.latest !== p.base ? t("p_mineOld", { base: p.base, latest: p.latest }) : t("p_mine", { base: p.base });
    const now = e.gone ? goneBlock(e) : `${owner ? `<p class="kp-line">${ic("user")}${esc(ownerLine)}</p>` : ""}${statusLine(markOf(e), line)}<p class="kp-note">${esc(t("p_noBody"))}</p><div class="kp-actions">${p.mine && p.latest !== p.base ? goBtn(t("p_compare")) : ""}${goBtn(t("p_edit"))}</div>`;
    const ver = `<p class="kp-line">${esc(t("p_ver", { v: p.latest || p.base, src: L(src.name) }))}</p>`;
    return `${header(e)}${sec(t("d_now"), now, "kp-now")}${sec(t("d_usage"), usageBlock(e))}${e.gone ? "" : sec(t("d_where"), whereBlock(e))}${sec(t("d_version"), ver)}`;
  }

  function roleDetail(e, p) {
    const r = e.role, src = srcOf(e);
    const mine = p ? (p.roles.find((x) => x.id === e.id)?.prompts || []).map(entryById).filter(Boolean) : [];
    const prompts = mine.length ? `<ul class="mw-items">${mine.map((x) => itemRow(x, "", p)).join("")}</ul>` : `<p class="kp-note">${esc(t("r_noPrompts"))}</p>`;
    const own = src.kind === "characters";
    const active = r.active.length ? `<ul class="kp-places">${r.active.map((w) => `<li>${ic("target")}<span>${esc(L(w))}</span></li>`).join("")}</ul>` : `<p class="kp-note">${esc(t(e.off ? "r_off" : "r_activeNone"))}</p>`;
    const now = e.gone ? goneBlock(e) : `${statusLine(markOf(e), t("r_active"))}${active}<p class="kp-note">${esc(t("r_scopeNote"))}</p><div class="kp-actions">${goBtn(own ? t("r_edit") : t("r_view"))}</div>`;
    const tools = `<p class="kp-chips">${r.tools.map((x) => entryById("tl-" + x)).filter(Boolean).map((x) => `<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="item" data-v="${x.id}">${ic(KIND_ICON.tool)}<span data-slot="button-label">${esc(nameOf(x))}</span></button>`).join("")}</p><p class="kp-note">${esc(t("d_declaredNote"))}</p>`;
    const ver = `<p class="kp-line">${esc(t("r_ver", { v: L(e.version), decl: L(r.declared) }))}</p>${e.isNew ? `<p class="kp-line">${badge(t("r_new"), "success")}</p>` : ""}`;
    return `${header(e)}${sec(t("d_now"), now, "kp-now")}${sec(t("r_prompts") + gap() + mine.length, prompts)}${sec(t("d_declared"), tools)}${sec(t("d_usage"), usageBlock(e))}${sec(t("d_version"), ver)}`;
  }

  function toolDetail(e) {
    const tl = e.tool;
    const roles = tl.roles.length ? `<p class="kp-chips">${tl.roles.map((r) => badge(nameOf(entryById(r)))).join("")}</p>` : `<p class="kp-note">${esc(t("t_rolesNone"))}</p>`;
    const now = `<p class="mw-status-line">${markOf(e)}${esc(t("t_origin_" + tl.origin))}</p><p class="kp-note">${esc(t("t_note"))}</p>`;
    const ver = `<p class="kp-line">${esc(t("t_ver", { v: e.version }))}</p>${tl.added ? `<p class="kp-line">${badge(t("t_added"), "success")}</p>` : ""}`;
    const inPacks = packsWith(e.id);
    const packsHtml = `<p class="kp-chips">${inPacks.map((x) => `<button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-slot="button" data-act="pack" data-v="${x.id}">${ic("package")}<span data-slot="button-label">${esc(L(x.name))}</span></button>`).join("")}</p>`;
    return `${header(e)}${sec(t("d_now"), now, "kp-now")}${sec(t("in_packs") + gap() + inPacks.length, packsHtml)}${sec(t("d_roles"), roles + `<div class="kp-actions">${goBtn(t("t_toRoles"))}</div>`)}${e.usage.range === "not_counted" ? "" : sec(t("d_usage"), usageBlock(e))}${sec(t("d_version"), ver)}`;
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
    const outMark = m.outbound ? K.renderStatusMark({ label: t("m_outN", { n: m.clients.length, list: m.clients.join(list()) }), tone: "idle", state: "ready" }) : K.renderStatusMark({ label: t("m_outNa"), tone: "quiet", state: "idle" });
    const toolsWord = m.tools.open === 0 ? t("m_toolsNone", { total: m.tools.total }) : m.tools.open === m.tools.total ? t("m_toolsAll", { total: m.tools.total }) : t("m_toolsN", { total: m.tools.total, open: m.tools.open });
    const toolsMark = K.renderStatusMark({ label: toolsWord, tone: m.tools.open === 0 ? (gone ? "blocked" : "hold") : "idle", state: m.tools.open === 0 ? (gone ? "blocked" : "unavailable") : "ready" });
    const ons = `<ul class="kp-ons">${row(t("m_server"), t("m_serverWhat"), serverMark, m.outbound ? t("m_withHost") : "", serverLink)}${row(t("m_out"), t("m_outWhat"), outMark, "", m.outbound ? t("m_toAccess") : null)}${row(t("m_tools"), t("m_toolsWhat"), toolsMark, "", gone ? null : t("m_toLibrary"))}</ul>`;
    const now = gone ? goneBlock(e) + ons : ons + `<p class="kp-note">${esc(t("m_noConnect"))}</p>`;
    const disc = m.discovered ? `<p class="kp-line">${esc(t("m_disc"))}</p><ul class="kp-diff">${m.discovered.added.map((x) => `<li>${badge(t("m_added"), "success")}<code>${esc(x)}</code></li>`).join("")}${m.discovered.removed.map((x) => `<li>${badge(t("m_removed"), "danger")}<code>${esc(x)}</code></li>`).join("")}</ul>` : "";
    const skill = m.skill ? `<p class="kp-line">${ic("book")}${esc(t("m_skill"))}${colon()}${esc(L(m.skill))}</p>` : "";
    const ver = `<p class="kp-line">${esc(t("m_ver", { v: L(e.version) }))}</p>${disc}${skill}`;
    return `${header(e)}${sec(t("m_title"), now, "kp-now")}${sec(t("d_usage"), usageBlock(e))}${e.where.length ? sec(t("d_where"), whereBlock(e)) : ""}${sec(t("d_version"), ver)}`;
  }

  function skillDetail(e) {
    // The batch-08 block exactly; the pack's own fields sit outside it, under a hairline.
    const s = e.skill, ch = s.change ? t("sk_change_" + s.change) : t("sk_change_none");
    const outer = `<section class="kp-outer" aria-label="${esc(t("d_kitOuter"))}"><h4>${esc(t("d_kitOuter"))}</h4>${usageBlock(e, { noLast: true })}<p class="kp-line">${ic("history")}${esc(ch)}</p>${e.where.length ? whereBlock(e) : ""}</section>`;
    return skillBlock(e) + outer;
  }

  /* ---------- packs ---------- */
  function packs() {
    let list = D.packs.slice();
    if (P.v === "many") list = list.concat(D.manyPacks());
    if (P.v === "empty") list = list.filter((p) => p.kind === "builtin");
    return list;
  }
  const packById = (id) => packs().find((p) => p.id === id) || D.packs.find((p) => p.id === id);
  const mcpUnread = (p) => P.v === "partial" && p.id === "pk-coding";
  // Everything a pack holds, in reading order: each role then its prompts, skills, MCP servers, tools.
  function itemsOf(p) {
    const out = [];
    for (const r of p.roles) { out.push(entryById(r.id)); for (const x of r.prompts) out.push(entryById(x)); }
    for (const x of p.skills) out.push(entryById(x));
    if (!mcpUnread(p)) for (const x of p.mcp) out.push(entryById(x));
    for (const x of p.tools) out.push(entryById(x));
    return out.filter(Boolean);
  }
  const roleOfPrompt = (p, id) => p.roles.find((r) => r.prompts.includes(id));
  const isLoose = (p, id) => !!p && p.roles.some((r) => r.ref && r.prompts.includes(id));
  const packsWith = (id) => packs().filter((p) => !p.sample && (p.skills.includes(id) || p.mcp.includes(id) || p.tools.includes(id) || p.roles.some((r) => r.id === id || r.prompts.includes(id))));
  // A pack's state is read from what it holds and from its plugin; it has no switch of its own (spec §4.3: no new switches).
  function packState(p) {
    const s = D.sources[p.src];
    if (s.gone) return { word: t("pk_gone"), tone: "quiet", ring: "paused", group: "off" };
    if (s.disabled) return { word: t("pk_off"), tone: "quiet", ring: "paused", group: "off" };
    const na = itemsOf(p).filter((e) => e.kind !== "tool" && !e.gone && stateOf(e).group === "na");
    const newer = itemsOf(p).filter((e) => e.kind === "prompt" && stateOf(e).tone === "attention");
    // A reporter whose entries could be in this pack failed: the contract's `unknown` — never "in use" (contract §4.4).
    if (mcpUnread(p)) return { word: t("pk_unknown"), tone: "hold", ring: "unavailable", group: "na", na, newer };
    if (na.length) return { word: t("pk_na", { n: na.length }), tone: "hold", ring: "unavailable", group: "na", na, newer };
    return { word: t("pk_on"), tone: "idle", ring: "ready", group: "on", na, newer };
  }
  const packMark = (p) => { const s = packState(p); return K.renderStatusMark({ label: s.word, tone: s.tone, state: s.ring }); };
  const cnt = (k, n) => (n === 1 && T[P.l]["c1_" + k] ? t("c1_" + k) : t("c_" + k, { n }));
  const kindCount = (p, k) => ({ role: p.roles.filter((r) => !r.ref).length, prompt: p.roles.reduce((n, r) => n + r.prompts.length, 0), skill: p.skills.length, mcp: p.mcp.length, tool: p.tools.length })[k];
  // With MCP unread the count is "—", in the row as in the section (contract: `unknown`).
  const countsOf = (p) => ["role", "prompt", "skill", "mcp", "tool"].filter((k) => ui.k === "all" || ui.k === k).map((k) => [k, k === "mcp" && mcpUnread(p) ? "—" : kindCount(p, k)]).filter(([, n]) => n);
  const hasKind = (p) => ui.k === "all" || kindCount(p, ui.k) > 0;
  const packCounts = (p) => countsOf(p).map(([k, n]) => cnt(k, n)).join(" · ");
  // What a pack holds as small icon-and-number chips: fits a narrow row where the words would be cut.
  const packChips = (p) => `<span class="kp-counts" aria-label="${esc(packCounts(p))}">${countsOf(p).map(([k, n]) => `<span class="kp-count" title="${esc(cnt(k, n))}">${ic(KIND_ICON[k])}${n}</span>`).join("")}</span>`;
  const packSrcLine = (p) => { const s = D.sources[p.src]; return [s.publisher || L(s.name), s.version ? L(s.version) : ""].filter(Boolean).join(" · "); };
  function packMatch(p) {
    const q = ui.q.trim().toLowerCase();
    if (!q) return { ok: true };
    if ((L(p.name) + L(p.desc) + packSrcLine(p)).toLowerCase().includes(q)) return { ok: true };
    const hit = itemsOf(p).filter((e) => ui.k === "all" || e.kind === ui.k).find((e) => (nameOf(e) + descOf(e) + (e.code || "")).toLowerCase().includes(q));
    return hit ? { ok: true, hit } : { ok: false };
  }
  const visiblePacks = () => packs().filter((p) => hasKind(p) && packMatch(p).ok && (ui.f === "all" || packState(p).group === ui.f))
    .sort((a, b) => (D.sources[a.src].gone ? 1 : 0) - (D.sources[b.src].gone ? 1 : 0));

  /* ---------- one item's detail, under a way back to its pack ---------- */
  function crumbs(p, e) {
    const r = e.kind === "prompt" ? roleOfPrompt(p, e.id) : null;
    const trail = [L(p.name), r ? nameOf(entryById(r.id)) : null, nameOf(e)].filter(Boolean).map(esc).join(`<span class="kp-dot">/</span>`);
    return `<nav class="kp-crumbs" aria-label="${esc(t("pk_kind"))}"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-slot="button" data-act="up">${ic("chevron-left")}<span data-slot="button-label">${esc(t("crumb_up", { p: L(p.name) }))}</span></button><span class="kp-crumbs__trail">${trail}</span></nav>`;
  }
  function itemDetail(p, e) {
    const body = { skill: skillDetail, prompt: promptDetail, role: roleDetail, tool: toolDetail, mcp: mcpDetail }[e.kind](e, p);
    return `<section class="mw-list-detail__detail kp-detail${ui.anim ? " is-entering" : ""}" aria-label="${esc(t("detailLabel"))}">${crumbs(p, e)}${body}</section>`;
  }

  /* ---------- rows ---------- */
  function itemRow(e, cls = "", p = null) {
    const sub = e.kind === "mcp" ? mcpLine(e) : e.kind === "prompt" ? (isLoose(p, e.id) ? `${L(srcOf(e).name)} · ${t("loose_line")}` : promptLine(e)) : descOf(e);
    return `<li class="mw-item mw-item--pick ${cls}"><button type="button" class="mw-item__pick" aria-current="${e.id === ui.item ? "true" : "false"}" data-act="item" data-v="${e.id}">${mark(KIND_ICON[e.kind])}<span><strong>${esc(nameOf(e))}${e.code ? ` <code class="kp-code">${esc(e.code)}</code>` : ""}</strong><small title="${esc(sub)}">${esc(sub)}</small></span><span class="mw-item__end">${markOf(e)}</span></button></li>`;
  }
  const promptLine = (e) => (e.gone ? L(e.gone.owner) : e.prompt.mine ? t("p_verMine", { base: e.prompt.base, latest: e.prompt.latest }).split(/[;；]/)[0] : t("p_ver", { v: e.prompt.latest, src: L(srcOf(e).name) }));
  function mcpLine(e) {
    const m = e.mcp;
    const tools = m.tools.open === m.tools.total ? t("m_toolsAll", { total: m.tools.total }) : t("m_toolsN", { total: m.tools.total, open: m.tools.open });
    return [m.outbound ? t("m_outN", { n: m.clients.length, list: m.clients.join(list()) }) : L(srcOf(e).name), tools].join(" · ");
  }
  // A role and, under it, its own prompts: the pack's most particular pairing, so it reads as one card.
  function roleCard(p, r) {
    const e = entryById(r.id);
    const prompts = r.prompts.map(entryById).filter(Boolean);
    const where = r.ref ? t("ref_line") : e.role.active.length ? t("r_where", { x: e.role.active.map(L).join(list()) }) : t(e.off ? "r_off" : "r_whereNone");
    return `<li class="kp-role"><button type="button" class="kp-role__head" aria-current="${e.id === ui.item ? "true" : "false"}" data-act="item" data-v="${e.id}">${mark("user")}<span class="kp-role__text"><strong>${esc(nameOf(e))}</strong><small>${esc(descOf(e))}</small><small class="kp-role__where">${esc(where)}</small></span><span class="mw-item__end">${markOf(e)}</span></button>
      <div class="kp-role__prompts"><span class="kp-role__label">${esc(t("r_prompts"))}</span>${prompts.length ? `<ul class="mw-items">${prompts.map((x) => itemRow(x, "kp-prompt", p)).join("")}</ul>` : `<p class="kp-inline-empty">${esc(t("r_noPrompts"))}</p>`}</div></li>`;
  }
  function toolGrid(list) {
    return `<ul class="kp-toolgrid">${list.map((e) => `<li><button type="button" class="kp-tool" aria-current="${e.id === ui.item ? "true" : "false"}" data-act="item" data-v="${e.id}"><span class="kp-tool__name"><strong>${esc(nameOf(e))}</strong><code>${esc(e.code)}</code></span>${markOf(e)}</button></li>`).join("")}</ul>`;
  }

  /* ---------- a pack: its state, what to do, and what it holds ---------- */
  function packNow(p) {
    const s = packState(p), src = D.sources[p.src];
    let body, actions;
    if (src.gone) {
      body = t("pk_goneB", { owner: L(src.name), at: L(src.gone.at) });
      actions = [btn(t("pk_readd", { owner: L(src.name) }), { icon: "arrow", attrs: act("sim", "go") })];
    } else if (src.disabled) {
      body = t("pk_offB");
      actions = [btn(t("pk_enable"), { variant: "primary", attrs: act("sim", "go") })];
    } else {
      const parts = (s.na || []).map((e) => `${nameOf(e)}${colon()}${stateOf(e).word}`);
      if (mcpUnread(p)) parts.unshift(t("pk_unknownB"));
      body = parts.length ? parts.join(semi()) : t("pk_onB");
      actions = [];
    }
    const exportBtn = src.gone ? "" : `<span class="kp-export">${btn(t("pk_export"), { icon: "download", attrs: Object.assign(act("menu"), { id: "kpExport", "aria-haspopup": "menu", "aria-expanded": ui.menu ? "true" : "false" }) })}${exportMenu(p)}</span>`;
    const manageWord = { plugins: "pk_manage", assistant: "pk_manageAssistant", characters: "pk_manageChars" }[src.manage];
    const manage = src.gone || src.disabled || !manageWord ? "" : btn(t(manageWord), { variant: "ghost", icon: "arrow", attrs: act("sim", "go") });
    return `<div class="kp-now kp-packnow"><p class="mw-status-line">${packMark(p)}<span>${esc(body)}</span></p><div class="kp-actions">${actions.join("")}${manage}${exportBtn}</div></div>`;
  }
  function packHeader(p, tag = "h3") {
    const s = D.sources[p.src];
    return `<header class="kp-packhead"><span class="kp-kind">${ic("package")}${esc(t("pk_kind"))}</span><${tag} tabindex="-1">${esc(L(p.name))}</${tag}><p>${esc(L(p.desc))}</p>
      <p class="kp-source">${ic(SRC_ICON[s.kind] || "package")}${L(s.name) === L(p.name) ? "" : `<span>${esc(L(s.name))}</span><span class="kp-dot">·</span>`}${s.version ? `<span>${esc(L(s.version))}</span><span class="kp-dot">·</span>` : ""}${s.publisher ? `<span>${esc(s.publisher)}</span><span class="kp-dot">·</span>` : ""}<span>${esc(L(s.trust))}</span></p></header>`;
  }
  function packContents(p) {
    const cards = p.roles.filter((r) => (ui.k === "role" ? !r.ref : ui.k === "prompt" ? r.prompts.length : true));
    const roles = cards.length ? `<ul class="kp-roles">${cards.map((r) => roleCard(p, r)).join("")}</ul>` : `<p class="kp-inline-empty">${esc(t("none_roles"))}</p>`;
    const skills = p.skills.length ? `<ul class="mw-items">${p.skills.map(entryById).map((e) => itemRow(e)).join("")}</ul>` : `<p class="kp-inline-empty">${esc(t("none_skills"))}</p>`;
    const mcp = mcpUnread(p) ? partialAlert() : p.mcp.length ? `<ul class="mw-items">${p.mcp.map(entryById).map((e) => itemRow(e)).join("")}</ul>` : `<p class="kp-inline-empty">${esc(t("none_mcp"))}</p>`;
    const tools = p.tools.length ? `${toolGrid(p.tools.map(entryById))}<p class="kp-note">${esc(t(p.kind === "builtin" ? "tools_noteB" : "tools_note"))}</p>` : `<p class="kp-inline-empty">${esc(t("none_tools"))}</p>`;
    const diff = D.sources[p.src].diff;
    const show = (k) => ui.k === "all" || ui.k === k || (k === "role" && ui.k === "prompt");
    return `${show("role") ? sec(t("s_roles") + gap() + cards.length, roles) : ""}${show("skill") ? sec(t("s_skills") + gap() + p.skills.length, skills) : ""}${show("mcp") ? sec(t("s_mcp") + gap() + (mcpUnread(p) ? "—" : p.mcp.length), mcp) : ""}${show("tool") ? sec(t("s_tools") + gap() + p.tools.length, tools) : ""}${diff && ui.k === "all" ? sec(t("s_upgrade"), `<p class="kp-line">${ic("history")}${esc(L(diff))}</p>`) : ""}`;
  }
  function packDetail(p) {
    const back = `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm mw-list-detail__back" data-slot="button" data-act="unsel">${ic("chevron-left")}<span data-slot="button-label">${esc(t("crumb_all"))}</span></button>`;
    return `<section class="mw-list-detail__detail kp-detail kp-pack${ui.anim ? " is-entering" : ""}" aria-label="${esc(t("pk_kind"))}">${back}${packHeader(p)}${packNow(p)}${D.sources[p.src].gone ? "" : packContents(p)}</section>`;
  }

  /* ---------- toolbar, export menu, import panel ---------- */
  function exportMenu(p) {
    if (!ui.menu) return "";
    const mine = itemsOf(p).filter((e) => e.kind === "prompt" && e.prompt.mine).length;
    // Only a batch-08 content package travels as a package; your own roles travel as references only (contract §4.9).
    const list = p.kind === "characters" ? [K.renderMenuItem({ label: t("ex_refs"), description: t("ex_refsOnlyD"), iconName: "link", attrs: act("export", "refs") })] : [
      K.renderMenuItem({ label: t("ex_whole"), description: t(p.content ? "ex_wholeD" : "ex_wholeAppD"), iconName: "package", attrs: act("export", "whole") }),
      ...(mine ? [K.renderMenuItem({ label: t("ex_prompts") + paren(mine), description: t("ex_promptsD"), iconName: "text", attrs: act("export", "prompt") })] : []),
      K.renderMenuItem({ label: t("ex_refs"), description: t("ex_refsD"), iconName: "link", attrs: act("export", "refs") }),
    ];
    const items = K.renderMenuGroup({ label: t("exportOf", { p: L(p.name) }), items: list.join("") });
    // One surface (the board's mw-menu, no popover frame around it), in the top layer so no scrolling box clips it.
    return K.renderMenu({ items, labelledBy: "kpExport", className: "kp-menu" }).replace('data-slot="menu"', 'data-slot="menu" id="kpMenu" popover="manual"');
  }
  const importBtn = () => btn(t("import"), { icon: "upload", attrs: act("import") });
  function searchBox() {
    return `<span class="kp-search">${ic("search")}${input({ id: "kpQ", placeholder: t("pk_search"), label: t("pk_searchLabel"), value: ui.q })}</span>`;
  }
  const kindFilter = () => select("kpKind", t("kLabel"), [["all", t("k_all")], ...KINDS.map((k) => [k, kindWord(k)])], ui.k);
  const stateFilter = () => select("kpState", t("stLabel"), [["all", t("st_all")], ["on", t("st_on")], ["na", t("st_na")], ["off", t("st_off")]], ui.f);
  function summaryLine() {
    const all = packs(), na = all.filter((p) => packState(p).group === "na").length;
    const head = ui.k === "all" ? t("pk_summary", { n: all.length, na }) : t("pk_summaryK", { n: all.filter(hasKind).length, k: (!en() && /^[A-Za-z]/.test(kindWord(ui.k)) ? " " : "") + kindWordLower(ui.k) });
    return `<p class="kp-summary" role="status">${esc(head)}${na && ui.f !== "na" ? `<button type="button" class="mw-btn mw-btn--link mw-btn--sm" data-slot="button" data-act="only-na"><span data-slot="button-label">${esc(t("pk_onlyNa"))}</span></button>` : ""}</p>`;
  }
  const toolbar = () => `<div class="kp-toolbar">${searchBox()}${kindFilter()}${stateFilter()}<span class="kp-spacer"></span><span class="kp-io">${importBtn()}</span></div>`;

  function importPanel() {
    const f = D.importFile;
    if (ui.done != null) {
      const body = t(ui.done ? "im_done_b" : "im_done_b0", { n: ui.done, p: L(f.pack) });
      return `<section class="kp-import" aria-labelledby="kpImH"><header class="kp-import__head"><h2 id="kpImH" tabindex="-1">${esc(t("im_done_t"))}</h2></header>
        ${K.renderAlert({ title: t("im_done_t"), body, tone: "success", state: "done", actions: [{ label: t("im_review"), variant: "secondary", icon: "arrow", attrs: act("sim", "go") }], role: "status" })}
        <footer class="kp-import__foot">${btn(t("im_finish"), { variant: "primary", size: "md", attrs: act("import-finish") })}</footer></section>`;
    }
    const words = Object.fromEntries(["insert", "delete", "same"].map((k) => [k, t("diff_" + k)]));
    const diff = (x) => K.renderDiff({ view: K.compareChange("import", { before: { workspace_id: "w", workspace_name: "", path: "", source_plugin_id: "", content_version: 1 }, after: { workspace_id: "w", workspace_name: "", path: "", source_plugin_id: "", content_version: 2 } }, { before: x.before, after: x.after }), primitives: { escape: esc, text: (k, v = {}) => String(words[k] || k || "").replace(/\{(\w+)\}/g, (_, n) => v[n] ?? ""), icon: K.icon }, labels: Object.fromEntries(["insert", "delete", "same", "reveal", "identical", "coarse", "partial", "mismatch", "created", "removed"].map((k) => [k, k])), sides: false });
    const prow = (x) => {
      const status = x.missing ? badge(t("im_missing", { owner: L(x.owner) }), "warning") : x.ok ? badge(t("im_ok", { base: x.base, here: x.here }), "success") : badge(t("im_old", { base: x.base, here: x.here }), "warning");
      const pick = x.ok ? `<label class="mw-check-row kp-apply"><input type="checkbox" data-pick="${x.id}"${ui.picks[x.id] ? " checked" : ""}><span>${esc(t("im_apply", { n: L(x.name) }))}</span></label>` : "";
      const more = x.ok ? `<details class="mw-collapsible kp-fold" data-slot="collapsible"><summary>${esc(t("im_diff"))}</summary><div class="mw-collapsible__body">${diff(x)}</div></details>` : "";
      return `<li class="kp-card${x.ok ? "" : " is-muted"}"><div class="kp-card__head">${mark("text")}<span class="kp-card__text"><strong>${esc(L(x.name))}</strong><small>${esc(L(x.owner))}</small></span></div><div class="kp-card__meta">${status}</div>${pick}${more}</li>`;
    };
    const rrow = (x) => `<li class="kp-ref">${mark(KIND_ICON[x.kind])}<span class="kp-ref__name">${esc(L(x.name))}</span>${x.here ? `<span class="kp-ref__state">${K.renderStatusMark({ label: t("im_here"), tone: "idle", state: "ready" })}</span>` : `<span class="kp-ref__state">${K.renderStatusMark({ label: t("im_notHere"), tone: "hold", state: "unavailable" })}${btn(L(x.fix), { variant: "secondary", attrs: act("sim", "go") })}</span>`}</li>`;
    const n = Object.values(ui.picks).filter(Boolean).length;
    return `<section class="kp-import" aria-labelledby="kpImH"><header class="kp-import__head"><h2 id="kpImH">${esc(t("im_h"))}</h2>
        <div class="kp-file">${ic("package")}<span><strong>${esc(t("im_pack", { p: L(f.pack) }))}</strong><small>${esc(L(f.name))} · ${esc(L(f.from))}</small></span>${btn(t("im_repick"), { variant: "ghost", attrs: act("sim", "import") })}</div></header>
      ${sec(t("im_refs", { n: f.refs.length }), `<p class="kp-note">${esc(t("im_refsLead"))}</p><ul class="kp-refs">${f.refs.map(rrow).join("")}</ul>`)}
      ${sec(t("im_prompts", { n: f.prompts.length }), `<p class="kp-note">${esc(t("im_promptsLead"))}</p><ul class="kp-cards">${f.prompts.map(prow).join("")}</ul>`)}
      ${f.skills.packs ? sec(t("im_skills", { n: f.skills.packs }), `<p class="kp-line">${esc(L(f.skills.note))}</p><div class="kp-actions">${btn(t("im_skillsGo"), { icon: "arrow", attrs: act("sim", "go") })}</div>`) : ""}
      <footer class="kp-import__foot">${btn(t("im_cancel"), { variant: "ghost", size: "md", attrs: act("import-cancel") })}${btn(n ? t("im_go", { n }) : t("im_none"), { variant: "primary", size: "md", disabled: !n, attrs: act("import-apply") })}</footer></section>`;
  }

  function loadingBody() {
    const rows = Array.from({ length: 6 }, () => `<li class="mw-item mw-item--pick kp-skrow">${skeleton("kp-sk-mark")}${skeleton("kp-sk-line")}</li>`).join("");
    return `<p class="kp-summary">${esc(t("loading"))}</p><div class="mw-list-detail kp-ld"><div class="mw-list-detail__body"><section class="mw-list-detail__list" aria-label="${esc(t("pk_kind"))}"><ul class="mw-items">${rows}</ul></section><section class="mw-list-detail__detail kp-detail"></section></div></div>`;
  }
  const failBody = () => empty({ error: true, icon: "alert", title: t("fail_t"), body: t("fail_b"), action: `<div class="kp-actions kp-actions--center">${btn(t("retry"), { icon: "refresh", attrs: act("sim", "retry") })}</div>` });
  const partialAlert = () => K.renderAlert({ title: t("partial_t"), body: t("partial_b"), tone: "warning", state: "failed", actions: [{ label: t("retry"), icon: "refresh", attrs: act("sim", "retry") }], role: null, className: "kp-partial" });
  const emptyNote = () => (P.v === "empty" ? K.renderAlert({ title: t("empty_t"), body: t("empty_b"), tone: "info", state: "idle", actions: [{ label: t("importLocal"), variant: "secondary", icon: "download", attrs: act("sim", "import") }, { label: t("market"), variant: "primary", attrs: act("sim", "go") }], role: null, className: "kp-emptynote" }) : "");

  /* ---------- the page: the pack list beside one pack; an item opens in its place ---------- */
  function packRow(p) {
    const m = packMatch(p);
    const sub = m.hit ? `<small>${esc(t("pk_match", { x: nameOf(m.hit) }))}</small>` : countsOf(p).length ? packChips(p) : `<small>${esc(D.sources[p.src].gone ? t("pk_goneRow", { at: L(D.sources[p.src].gone.at) }) : packSrcLine(p))}</small>`;
    return `<li class="mw-item mw-item--pick"><button type="button" class="mw-item__pick" aria-current="${p.id === ui.pack ? "true" : "false"}" data-act="pack" data-v="${p.id}" title="${esc(packSrcLine(p))}">${mark("package")}<span><strong>${esc(L(p.name))}</strong>${sub}</span><span class="mw-item__end">${packMark(p)}</span></button></li>`;
  }
  function catalog() {
    if (P.v === "fail") return `${toolbar()}${failBody()}`;
    if (P.v === "loading") return `${toolbar()}${loadingBody()}`;
    if (ui.importing) return importPanel();
    const rows = visiblePacks();
    if (rows.length && !rows.some((p) => p.id === ui.pack)) { ui.pack = rows[0].id; ui.item = null; }
    const p = rows.length ? packById(ui.pack) : null;
    const e = p && ui.item ? entryById(ui.item) : null;
    const clear = ui.q ? btn(t("clear_q"), { variant: "secondary", icon: "x", attrs: act("clear-q") }) : ui.k !== "all" ? btn(t("clear_k"), { variant: "secondary", attrs: act("clear-k") }) : "";
    const list = rows.length ? `<ul class="mw-items">${rows.map(packRow).join("")}</ul>` : `<p class="kp-inline-empty">${esc(t("pk_noMatch"))}${clear}</p>`;
    const right = p ? (e ? itemDetail(p, e) : packDetail(p)) : `<section class="mw-list-detail__detail kp-detail">${empty({ icon: "search", title: t("pk_noMatchT"), body: t("pk_noMatchB"), action: clear ? `<div class="kp-actions kp-actions--center">${clear}</div>` : "" })}</section>`;
    return `${toolbar()}${summaryLine()}${emptyNote()}<div class="mw-list-detail kp-ld kp-ld--packs" data-sticky-detail${ui.detail && p ? " data-detail" : ""}><div class="mw-list-detail__body"><section class="mw-list-detail__list" aria-label="${esc(t("pk_kind"))}">${list}</section>${right}</div></div>`;
  }

  /* ---------- page ---------- */
  function nav() {
    const groups = [["g_local", ["appearance:sun", "directories:folder"]], ["g_personal", ["memory:bookmark", "sync:network"]], ["g_ai", ["models:key", "assistant:message", "characters:user", "kit:package"]],
      ["g_tools", ["runtimes:terminal", "library:book", "connections:link", "access:shield", "history:workflow"]], ["g_system", ["diagnostics:bug"]]];
    return `<nav class="settings-navigation settings-navigation--codex" aria-label="${esc(t("chrome"))}"><a class="settings-nav-back" href="#" data-act="sim" data-v="go">${ic("arrow")} ${esc(t("back"))}</a><div class="settings-nav-body">${groups.map(([g, items]) => `<div class="settings-nav-group-label">${esc(t(g))}</div>${items.map((x) => { const [id, i] = x.split(":"); return `<a href="#"${id === "kit" ? ' aria-current="page"' : ""} data-act="${id === "kit" ? "home" : "sim"}" data-v="go">${ic(i)}${esc(t("n_" + id))}</a>`; }).join("")}`).join("")}</div></nav>`;
  }
  function page() {
    const body = catalog();
    return `<header class="project-preferences-chrome"><span>${esc(t("chrome"))}</span><a href="#" aria-label="${esc(t("close"))}" data-act="sim" data-v="go">${ic("x")}</a></header>
      <main class="settings-shell">${nav()}<div class="settings-content"><section class="settings-document kit-settings" aria-labelledby="kpH">
        <header class="settings-page-heading"><h1 id="kpH">${esc(t("h1"))}</h1><p>${esc(t("lead"))}</p></header>
        <p class="kp-scope">${ic("folder")}<span>${esc(t("scopeLine", { p: L(D.project) }))}</span></p>${body}</section></div></main>`;
  }

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const strip = document.getElementById("strip");
    if (shot) { strip.hidden = true; return; }
    const tg = (label, key, values) => K.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    strip.innerHTML = `<b>${esc(t("protoTitle"))}</b>${badge(t("decided"), "success")}
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
    viewHeight();
    const menu = document.getElementById("kpMenu");
    if (menu) { try { menu.showPopover(); } catch { /* no popover API: stays in place */ } placeMenu(); }
    if (qFocus != null) { const q = document.getElementById("kpQ"); q?.focus(); q?.setSelectionRange(qFocus, qFocus); }
    else if (was?.dataset.act === "up" && ui.back) {
      const row = document.querySelector(`#app .kp-detail [data-act="item"][data-v="${ui.back}"]`);
      ui.back = null;
      if (row) row.focus(); else document.querySelector("#app .kp-detail h3")?.focus();
    }
    else if (back) {
      const same = document.querySelector(`#app ${back}`);
      if (same && same.offsetParent) same.focus();
      else if (["item", "pack", "up"].includes(was.dataset.act)) document.querySelector("#app .kp-detail h3")?.focus();
    }
  }
  // [kit 缺] The settings shell gives no height for its scrolling area; the sticky detail needs one. The prototype measures it.
  function viewHeight() {
    const sc = document.querySelector(".settings-content");
    if (sc) sc.style.setProperty("--settings-view-h", sc.clientHeight + "px");
  }
  // The menu opens from the button's lower edge, never over the button, and stays inside the window.
  let placing = false;
  function placeMenu() {
    const menu = document.getElementById("kpMenu"), b = document.getElementById("kpExport");
    if (!menu || !b) return;
    menu.style.maxHeight = "";
    let r = b.getBoundingClientRect();
    const w = menu.offsetWidth, h = menu.offsetHeight;
    // Not enough room under the button: bring the button up first (the page and the detail scroll), so the menu still opens downward.
    const sc = document.querySelector(".settings-content");
    const need = r.bottom + 6 + h - (innerHeight - 8);
    if (need > 0 && sc && !placing) {
      // Scroll the page only as far as needed, and never past the button reaching the top of the scrolling area.
      placing = true; sc.scrollTop += Math.min(need, Math.max(0, r.top - sc.getBoundingClientRect().top - 8)); placing = false;
      r = b.getBoundingClientRect();
    }
    menu.style.left = Math.max(16, Math.min(r.left, innerWidth - w - 16)) + "px";
    menu.style.top = r.bottom + 6 + "px";
    menu.style.maxHeight = Math.max(160, innerHeight - r.bottom - 14) + "px";
  }
  addEventListener("resize", () => { viewHeight(); placeMenu(); });
  document.addEventListener("scroll", placeMenu, true);
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
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; persist(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    if (a !== "menu" && a !== "export") ui.menu = false;
    switch (a) {
      case "pack": ui.pack = v; ui.item = null; ui.detail = true; ui.anim = true; break;
      case "item": ui.item = v; ui.detail = true; ui.anim = true; break;
      case "up": ui.back = ui.item; ui.item = null; ui.anim = true; break;
      case "unsel": ui.detail = false; break;
      case "only-na": ui.f = "na"; break;
      case "clear-q": ui.q = ""; break;
      case "clear-k": ui.k = "all"; break;
      case "menu": ui.menu = !ui.menu; break;
      case "export": ui.menu = false; render(); return toast(t("t_exported", { x: b.querySelector("[data-slot=menu-item-label] span")?.textContent || b.textContent.trim().split("\n")[0] }), "success");
      case "import": ui.importing = true; break;
      case "import-cancel": ui.importing = false; break;
      case "import-apply": ui.done = Object.values(ui.picks).filter(Boolean).length; render(); document.getElementById("kpImH")?.focus(); return;
      case "import-finish": ui.importing = false; ui.done = null; break;
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
    if (el.id === "kpKind") { ui.k = el.value; ui.item = null; return render(); }
    if (el.dataset.pick) { ui.picks[el.dataset.pick] = el.checked; return render(); }
    if (el.dataset.skill) {
      // A skill's state applies at once (batch 08), with undo in the toast.
      const id = el.dataset.skill, prev = ui.skillStates[id];
      ui.skillStates[id] = el.value; ui.last = { id, prev };
      render();
      return toast(t("t_state", { n: nameOf(entryById(id)), s: t("w_" + el.value) }), "success", { label: t("undo"), act: "undo-skill" });
    }
  });
  document.addEventListener("input", (ev) => { if (ev.target.id === "kpQ") { ui.q = ev.target.value; render(); } });
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && ui.menu) { ui.menu = false; render(); document.getElementById("kpExport")?.focus(); } });

  render();
})();
