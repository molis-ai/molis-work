// Example data for the capability pack ("能力包", code `kit`) catalog prototype — invented, read from no Home.
// Shape follows specs/capability-pack/spec.md §4: every entry has a kind, where it comes from, a version, a state that is the owner's
// (never the pack's own), what usage can be read and its range, and where it is used. A skill entry carries the batch-08
// `SkillCatalogEntry` fields as they are (the `skill` object), with the pack's usage count outside it.
window.KIT_DATA = (() => {
  const z = (zh, en) => ({ zh, en });
  const project = z("季度发布", "Quarterly launch");

  // Where entries come from (scheme C groups by these; every scheme names them in the detail).
  const sources = {
    system: { kind: "system", name: z("系统 · Agent Host", "System · Agent Host"), version: "Prologue SDK 0.38.2", trust: z("随应用提供", "Built in"), manage: null,
      diff: z("上次换包 0.37 → 0.38：新增 2 个系统工具（list_dir、fetch_url），没有移除", "Last SDK change 0.37 → 0.38: 2 system tools added (list_dir, fetch_url), none removed") },
    assistant: { kind: "plugin", name: z("助理", "Assistant"), version: "v12", trust: z("随应用提供", "Built in"), manage: "assistant" },
    goals: { kind: "plugin", name: z("Goals 插件", "Goals plugin"), version: "4.2.0", trust: z("随应用提供", "Built in"), manage: "plugins",
      diff: z("4.1 → 4.2：提示词「拆分子目标」默认更新到 v4", "4.1 → 4.2: prompt “Split into sub-goals” default updated to v4") },
    coding: { kind: "plugin", name: z("Coding 插件", "Coding plugin"), version: "3.2.0", trust: z("随应用提供", "Built in"), manage: "plugins",
      diff: z("3.1 → 3.2：新增子代理「测试员」", "3.1 → 3.2: sub-agent “Tester” added") },
    feed: { kind: "plugin", name: z("Feed 插件", "Feed plugin"), version: "2.0.1", trust: z("随应用提供", "Built in"), manage: "plugins" },
    writing: { kind: "pack", name: z("写作工具", "Writing kit"), version: "2.0.0", publisher: "acme.writing", trust: z("已信任发布者", "Pinned publisher"), manage: "plugins",
      diff: z("1.4 → 2.0：「写周度复盘」正文变了，新增「会议纪要」，移除「旧版周报」", "1.4 → 2.0: “Weekly review” text changed, “Meeting notes” added, “Old weekly report” removed") },
    legal: { kind: "pack", name: z("法务审阅", "Legal review"), version: "1.3.0", publisher: "acme.legal", trust: z("已信任发布者", "Pinned publisher"), manage: "plugins", disabled: true },
    local: { kind: "local", name: z("本机导入 · Claude Code", "Imported · Claude Code"), version: z("11-02 的拷贝", "copy of Nov 2"), trust: z("这台电脑", "This computer"), manage: "plugins" },
    characters: { kind: "characters", name: z("你的角色", "Your roles"), version: null, trust: z("你自己写的", "Written by you"), manage: "characters" },
    projectMcp: { kind: "server", name: z("这个项目的 MCP 服务器", "This project's MCP servers"), version: null, trust: z("你加的", "Added by you"), manage: "coding-mcp" },
    connections: { kind: "connection", name: z("服务连接", "Service connections"), version: null, trust: z("你连的", "Connected by you"), manage: "connections" },
    molis: { kind: "server", name: z("Molis Work（对外）", "Molis Work (outbound)"), version: "MCP 1.6", trust: z("随应用提供", "Built in"), manage: "access" },
    contracts: { kind: "plugin", name: z("合同助手", "Contract helper"), version: "0.9.0", trust: z("已卸载", "Uninstalled"), manage: "plugins", gone: true },
  };

  const by = { assistant: z("助理", "the assistant"), coding: z("Coding", "Coding") };
  const entries = [
    // ---------- skills: the batch-08 entry, unchanged, plus the pack's usage count outside it ----------
    { id: "sk-weekly", kind: "skill", src: "writing", scope: "project", version: "2.0.0",
      usage: { range: "recent", n: 6, last: { at: z("今天 10:12", "today 10:12"), by: by.assistant } },
      where: [z("助理：每周五的复盘", "Assistant: Friday review")],
      skill: { name: z("写周度复盘", "Weekly review"), desc: z("把一周的进展、卡点和下周要做的写成一页复盘。", "Turns a week's progress, blockers and next steps into a one-page review."),
        applies: "both", state: "auto", when: z("每周五，或你说「写复盘」时。", "On Fridays, or when you ask for a review."), whenNot: z("单个任务的总结；对外汇报。", "Summaries of a single task; reports for outside readers."),
        tools: ["read_file", "goals.list@1"], resources: [{ path: "templates/review.md", role: "asset", bytes: 2100 }],
        excerpt: z("先列本周完成的 Goal，每条一句结果……", "Start with the Goals finished this week, one line of outcome each…"),
        enabled: { at: "2026-11-02", by: z("你", "you") }, change: "body_changed" } },
    { id: "sk-notes", kind: "skill", src: "writing", scope: "project", version: "2.0.0",
      usage: { range: "none" }, where: [],
      skill: { name: z("会议纪要", "Meeting notes"), desc: z("把会议记录整理成决定、待办和未决问题。", "Turns meeting notes into decisions, to-dos and open questions."),
        applies: "assistant", state: "manual", when: z("你贴来一段会议记录时。", "When you paste meeting notes."), whenNot: z("聊天记录；访谈。", "Chat logs; interviews."),
        tools: [], resources: [], excerpt: z("先找出会上定下的事……", "First find what was decided…"), change: "added" } },
    { id: "sk-contract", kind: "skill", src: "legal", scope: "home", version: "1.3.0",
      usage: { range: "recent", n: 2, last: { at: z("11-03 15:40", "Nov 3 15:40"), by: by.assistant } }, where: [],
      skill: { name: z("审合同", "Contract review"), desc: z("逐条核对合同里的付款、责任和终止条款。", "Checks payment, liability and termination clauses one by one."),
        applies: "assistant", state: "auto", unavailable: { reason: "plugin_disabled" }, when: z("你给一份合同并要求审阅时。", "When you hand over a contract to review."), whenNot: z("起草合同。", "Drafting contracts."),
        tools: ["read_file"], resources: [{ path: "checklists/clauses.md", role: "reference", bytes: 5400 }], excerpt: z("先确认合同双方和生效日期……", "First confirm the parties and the effective date…") } },
    { id: "sk-schedule", kind: "skill", src: "writing", scope: "project", version: "2.0.0",
      usage: { range: "none" }, where: [],
      skill: { name: z("排日程", "Plan the week"), desc: z("按优先级把这周的 Goal 排进日历空档。", "Fits this week's Goals into free calendar slots by priority."),
        applies: "assistant", state: "auto", connectors: ["calendar"], unavailable: { reason: "connection_missing", detail: "calendar" },
        when: z("周一早上，或你说「排一下这周」时。", "Monday mornings, or when you ask to plan the week."), whenNot: z("别人的日历。", "Other people's calendars."),
        tools: ["calendar.events.list@1"], resources: [], excerpt: z("先读这周已有的日程……", "First read what is already on the calendar…") } },
    { id: "sk-commit", kind: "skill", src: "local", scope: "home", version: z("11-02 的拷贝", "copy of Nov 2"),
      usage: { range: "recent", n: 14, last: { at: z("今天 09:41", "today 09:41"), by: by.coding } }, where: [z("Coding：本轮方法", "Coding: this turn's methods")],
      skill: { name: z("提交说明", "Commit message"), desc: z("按仓库的约定写提交说明。", "Writes commit messages the way the repository expects."),
        applies: "coding", state: "auto", when: z("Coding 准备提交时。", "When Coding is about to commit."), whenNot: z("合并请求的说明。", "Pull request descriptions."),
        tools: ["run_command"], resources: [{ path: "scripts/scope.sh", role: "script", bytes: 900 }], excerpt: z("第一行写清改了什么……", "The first line says what changed…") } },
    { id: "sk-review", kind: "skill", src: "local", scope: "home", version: z("11-02 的拷贝", "copy of Nov 2"),
      usage: { range: "recent", n: 3, last: { at: z("昨天 17:05", "yesterday 17:05"), by: by.coding } }, where: [],
      skill: { name: z("审合并请求", "Review a pull request"), desc: z("按清单看一遍改动，列出要改的和可以不改的。", "Goes through a change with a checklist and lists what must and may change."),
        applies: "coding", state: "manual", when: z("你点名 /审合并请求 时。", "When you name it with /."), whenNot: z("自己刚写的改动。", "A change you just wrote."),
        tools: ["read_file", "run_command"], resources: [], excerpt: z("先读描述，再看测试……", "Read the description first, then the tests…") } },

    // ---------- prompts: name, owner, version, where it is called; never the text (§4.2) ----------
    { id: "pr-reply", kind: "prompt", src: "assistant", scope: "home", version: "v12", name: z("回复的基本要求", "How to reply"), desc: z("助理每次回复前读的说明：语气、长度、什么时候先问。", "What the assistant reads before every reply: tone, length, when to ask first."),
      prompt: { mine: false, base: null, latest: "v12" }, usage: { range: "recent", n: 48, last: { at: z("今天 10:20", "today 10:20"), by: by.assistant } },
      where: [z("助理的每一轮", "Every assistant turn")] },
    { id: "pr-split", kind: "prompt", src: "goals", scope: "project", version: "v4", name: z("拆分子目标", "Split into sub-goals"), desc: z("把一个 Goal 拆成可以各自完成的子目标。", "Breaks a Goal into sub-goals that can each be finished."),
      prompt: { mine: true, base: "v3", latest: "v4" }, usage: { range: "recent", n: 9, last: { at: z("昨天 18:40", "yesterday 18:40"), by: by.assistant } },
      where: [z("Goals：新建 Goal 时的「帮我拆」", "Goals: “Help me split” when creating a Goal"), z("助理：规划", "Assistant: planning")] },
    { id: "pr-digest", kind: "prompt", src: "feed", scope: "project", version: "v2", name: z("消息摘要", "Message digest"), desc: z("把一条消息压成一句话摘要。", "Shortens a message to a one-line digest."),
      prompt: { mine: true, base: "v2", latest: "v2" }, usage: { range: "recent", n: 31, last: { at: z("今天 08:02", "today 08:02"), by: z("Feed", "Feed") } },
      where: [z("Feed：拉取新消息后", "Feed: after new messages arrive")] },
    { id: "pr-plan", kind: "prompt", src: "coding", scope: "project", version: "v7", name: z("计划步骤", "Plan the steps"), desc: z("Coding 开工前先写出要做的几步。", "Coding writes out its steps before starting."),
      prompt: { mine: false, base: null, latest: "v7" }, usage: { range: "recent", n: 22, last: { at: z("今天 09:30", "today 09:30"), by: by.coding } },
      where: [z("Coding：每个任务开始时", "Coding: at the start of every task")] },
    { id: "pr-clauses", kind: "prompt", src: "contracts", scope: "project", version: "v2", name: z("条款核对", "Clause check"), desc: z("合同助手核对条款时用的说明。", "What Contract helper used to check clauses."),
      prompt: { mine: true, base: "v2", latest: null }, gone: { owner: z("合同助手", "Contract helper"), at: z("11-05", "Nov 5") },
      usage: { range: "history", n: 5, last: { at: z("11-04 11:20", "Nov 4 11:20"), by: by.assistant } }, where: [] },

    // ---------- roles: declaration and source; scope and inheritance come from batch 36's read ----------
    { id: "ro-research", kind: "role", src: "characters", scope: "home", version: z("修订 5", "revision 5"), name: z("研究员", "Researcher"), desc: z("先查资料再下结论，每个结论写出处。", "Looks things up before concluding; every conclusion cites a source."),
      role: { declared: z("你写的角色", "A role you wrote"), active: [z("「季度发布」的项目默认", "Project default in “Quarterly launch”"), z("你的默认", "Your default")], tools: ["read_file", "web_search", "fetch_url"] },
      usage: { range: "recent", n: 3, last: { at: z("今天 08:55", "today 08:55"), by: by.assistant } }, where: [z("助理：「季度发布」里的新任务", "Assistant: new tasks in “Quarterly launch”")] },
    { id: "ro-editor", kind: "role", src: "characters", scope: "home", version: z("修订 2", "revision 2"), name: z("审稿人", "Editor"), desc: z("只挑问题不改原文，按轻重排。", "Points out problems without rewriting, ordered by weight."),
      role: { declared: z("你写的角色", "A role you wrote"), active: [], tools: ["read_file"] }, off: true,
      usage: { range: "none" }, where: [] },
    { id: "ro-impl", kind: "role", src: "coding", scope: "project", version: "v3", name: z("实现者", "Implementer"), desc: z("Coding 写代码时的身份：先复现，改完跑相关检查。", "Coding's identity when writing code: reproduce first, run the checks after."),
      role: { declared: z("Coding 插件声明", "Declared by the Coding plugin"), active: [z("Coding 的每个任务", "Every Coding task")], tools: ["read_file", "write_file", "run_command", "delegate"] },
      usage: { range: "recent", n: 22, last: { at: z("今天 09:30", "today 09:30"), by: by.coding } }, where: [z("Coding：默认角色", "Coding: default role")] },
    { id: "ro-tester", kind: "role", src: "coding", scope: "project", version: "v1", name: z("测试员", "Tester"), desc: z("实现者交出去的子代理：只跑测试、报结果。", "A sub-agent the implementer hands off to: runs tests, reports back."),
      role: { declared: z("Coding 插件声明的子代理", "Sub-agent declared by Coding"), active: [z("实现者交给它时", "When the implementer hands off")], tools: ["read_file", "run_command"] },
      usage: { range: "recent", n: 4, last: { at: z("今天 09:36", "today 09:36"), by: by.coding } }, where: [], isNew: true },

    // ---------- tools: what exists and what it does; never a switch (authorization stays in roles and action grants) ----------
    ...[
      ["read_file", z("读文件", "Read a file"), z("读输入或输出目录里的一个文件。", "Reads one file in an input or output folder."), false, "system", 4, z("今天 09:58", "today 09:58")],
      ["write_file", z("写文件", "Write a file"), z("在输出目录里新建或改写一个文件。", "Creates or rewrites a file in the output folder."), true, "system", 2, z("今天 09:40", "today 09:40")],
      ["run_command", z("运行命令", "Run a command"), z("在输出目录里运行一条终端命令。", "Runs a terminal command in the output folder."), true, "system", 2, z("今天 09:41", "today 09:41")],
      ["web_search", z("联网搜索", "Search the web"), z("用搜索引擎找资料，返回链接和摘要。", "Searches the web and returns links with snippets."), false, "system", 1, z("今天 08:56", "today 08:56")],
      ["fetch_url", z("读网页", "Read a web page"), z("读一个网页的正文。", "Reads the text of one web page."), false, "system", 1, null],
      ["list_dir", z("列目录", "List a folder"), z("列出一个目录里的文件。", "Lists the files in a folder."), false, "system", 3, z("今天 09:57", "today 09:57")],
      ["call_action", z("调用动作", "Call an action"), z("经平台网关调用一个已授权的动作。", "Calls an allowed action through the platform gateway."), true, "gateway", 2, z("今天 10:12", "today 10:12")],
      ["change-reversible", z("可撤回的修改", "Reversible change"), z("提出一处能撤回的修改，由你确认后生效。", "Proposes a change you can undo; applies once you confirm."), true, "gateway", 1, null],
      ["delegate", z("交给子代理", "Hand off to a sub-agent"), z("把一段活交给声明过的子代理。", "Hands part of the work to a declared sub-agent."), false, "subagent", 1, z("今天 09:36", "today 09:36")],
      ["plan_step", z("计划步骤", "Plan step"), z("记下或更新这一轮要做的几步。", "Records or updates this turn's steps."), false, "plan", 2, z("今天 09:30", "today 09:30")],
    ].map(([id, name, desc, writes, origin, roles, last]) => ({
      id: "tl-" + id, kind: "tool", src: "system", scope: "home", version: "0.38.2", code: id, name, desc,
      tool: { writes, origin, roles: ["研究员", "实现者", "测试员", "助理"].slice(0, roles), added: id === "list_dir" || id === "fetch_url" },
      usage: last ? { range: "last_only", last: { at: last } } : { range: "none" }, where: [],
    })),

    // ---------- MCP: three different "on"s, each said separately (§4.3) ----------
    { id: "mc-molis", kind: "mcp", src: "molis", scope: "home", version: "MCP 1.6", name: z("Molis Work MCP", "Molis Work MCP"), desc: z("把你允许的动作开给外部 AI 工具用。", "Opens the actions you allow to outside AI tools."),
      mcp: { outbound: true, server: "on", clients: ["Claude Code", "Codex"], tools: { total: 28, open: 19 }, skill: z("装进 Claude Code 的 goal-advance 技能 · v4", "goal-advance skill installed in Claude Code · v4") },
      usage: { range: "recent", n: 57, last: { at: z("今天 10:05", "today 10:05"), by: z("Claude Code", "Claude Code") } }, where: [z("Claude Code：推进 Goal", "Claude Code: advancing Goals"), z("Codex：读 Goal", "Codex: reading Goals")] },
    { id: "mc-github", kind: "mcp", src: "projectMcp", scope: "project", version: z("清单 11-07", "list of Nov 7"), name: z("GitHub", "GitHub"), desc: z("读写仓库、议题和合并请求。", "Reads and writes repositories, issues and pull requests."),
      mcp: { outbound: false, server: "on", tools: { total: 14, open: 14 }, discovered: { added: ["create_issue", "list_labels"], removed: ["delete_repo"] } },
      usage: { range: "recent", n: 11, last: { at: z("今天 09:45", "today 09:45"), by: by.coding } }, where: [z("Coding：实现者", "Coding: implementer")] },
    { id: "mc-linear", kind: "mcp", src: "connections", scope: "home", version: z("清单 11-01", "list of Nov 1"), name: z("Linear", "Linear"), desc: z("服务连接带的 MCP：议题与周期。", "MCP from a service connection: issues and cycles."),
      mcp: { outbound: false, server: "broken", tools: { total: 9, open: 0 } },
      usage: { range: "recent", n: 2, last: { at: z("11-06 14:10", "Nov 6 14:10"), by: by.assistant } }, where: [] },
    { id: "mc-figma", kind: "mcp", src: "projectMcp", scope: "project", version: z("清单 10-28", "list of Oct 28"), name: z("Figma", "Figma"), desc: z("读设计稿的图层与标注。", "Reads layers and notes from design files."),
      mcp: { outbound: false, server: "gone", tools: { total: 6, open: 0 } }, gone: { owner: z("Figma 服务器", "the Figma server"), at: z("11-04", "Nov 4") },
      usage: { range: "history", n: 7, last: { at: z("11-03 16:22", "Nov 3 16:22"), by: by.coding } }, where: [] },
  ];

  // The many-entries state: the same kinds, many more of each (names are plain counters, the shape is what matters).
  const many = () => {
    const extra = [];
    const kinds = { skill: 42, prompt: 59, role: 14, tool: 27, mcp: 6 };
    for (const [kind, n] of Object.entries(kinds)) for (let i = 1; i <= n; i += 1) {
      const name = { skill: z("技能 " + i, "Skill " + i), prompt: z("提示词 " + i, "Prompt " + i), role: z("角色 " + i, "Role " + i), tool: z("工具 " + i, "Tool " + i), mcp: z("服务器 " + i, "Server " + i) }[kind];
      const src = { skill: i % 3 ? "writing" : "local", prompt: ["goals", "feed", "coding", "assistant"][i % 4], role: i % 2 ? "characters" : "coding", tool: "system", mcp: "projectMcp" }[kind];
      const base = { id: kind + "-x" + i, kind, src, scope: i % 4 ? "project" : "home", version: "v" + (1 + (i % 5)), name, desc: z("示例条目，用来看条目很多时的样子。", "A sample entry, to see the page with many entries."),
        usage: i % 3 ? { range: "recent", n: i % 17, last: { at: z("11-0" + (1 + (i % 7)), "Nov " + (1 + (i % 7))), by: by.assistant } } : { range: "none" }, where: [] };
      if (kind === "skill") Object.assign(base, { skill: { name, desc: base.desc, applies: "both", state: ["auto", "off", "manual"][i % 3], when: z("示例。", "Sample."), whenNot: z("示例。", "Sample."), tools: [], resources: [], excerpt: z("示例。", "Sample.") } });
      if (kind === "prompt") Object.assign(base, { prompt: { mine: i % 5 === 0, base: "v1", latest: "v" + (1 + (i % 5)) } });
      if (kind === "role") Object.assign(base, { role: { declared: z("示例", "Sample"), active: [], tools: [] } });
      if (kind === "tool") Object.assign(base, { code: "tool_" + i, tool: { writes: i % 4 === 0, origin: "system", roles: [] }, usage: { range: "none" } });
      if (kind === "mcp") Object.assign(base, { mcp: { outbound: false, server: "on", tools: { total: 5 + i, open: 5 + i } } });
      extra.push(base);
    }
    return extra;
  };

  // A file picked for import (§5): prompt rewrites are confirmed one by one; references only say whether they exist here.
  const importFile = {
    name: "molis-kit-2026-11-08.json",
    from: z("另一台电脑上的 Molis Work · 11-08 导出", "Molis Work on another computer · exported Nov 8"),
    prompts: [
      { id: "i1", owner: z("Goals 插件", "Goals plugin"), name: z("拆分子目标", "Split into sub-goals"), base: "v4", here: "v4", ok: true,
        before: "把 Goal 拆成三到五个子目标。\n每个子目标写一句可检查的结果。", after: "把 Goal 拆成三到五个子目标。\n每个子目标写一句可检查的结果，并标出谁来做。" },
      { id: "i2", owner: z("Feed 插件", "Feed plugin"), name: z("消息摘要", "Message digest"), base: "v1", here: "v2", ok: false },
      { id: "i3", owner: z("合同助手", "Contract helper"), name: z("条款核对", "Clause check"), base: "v2", here: null, ok: false, missing: true },
    ],
    refs: [
      { kind: "role", name: z("研究员 · 修订 5", "Researcher · revision 5"), here: true },
      { kind: "mcp", name: z("GitHub", "GitHub"), here: true },
      { kind: "mcp", name: z("Notion（需要 Notion 连接）", "Notion (needs a Notion connection)"), here: false, fix: z("去连接", "Connect") },
      { kind: "tool", name: z("call_action", "call_action"), here: true },
    ],
    skills: { packs: 2, note: z("2 个技能包走插件的安装确认（照第 08 批）", "2 skill packs go through the plugin install review (as in batch 08)") },
  };

  return { project, sources, entries, many, importFile };
})();
