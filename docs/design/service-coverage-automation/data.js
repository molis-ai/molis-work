// Batch-61 prototype data. Services, uses and limits follow the current declarations on main (catalog connectors, GitHub, Gmail,
// AnySearch) as listed in specs/assistant-service-connections/coverage.md; nothing here is fetched or written.
window.B61_DATA = (() => {
  const w = (zh, en) => ({ zh, en });
  // What a connection can be used for: each is derived from a declaration, never from a list of service names.
  const uses = {
    feed: { icon: "rss", name: w("Feed 来源", "Feed source"), from: w("插件声明了来源（integration source）", "a plugin declares a source integration") },
    import: { icon: "file", name: w("导入文档", "Import documents"), from: w("插件声明了文档导入", "a plugin declares a document import") },
    assistant: { icon: "sparkles", name: w("助理可读", "Assistant can read"), from: w("登记成「读取记录」动作，助理按授权调用", "registered as a record-read action the assistant calls with its grant") },
    search: { icon: "search", name: w("网页搜索", "Web search"), from: w("插件声明了网页搜索", "a plugin declares web search") },
    category: { icon: "tag", name: w("技能里的类别", "Skill category"), from: w("服务声明了类别，技能里的 ~~类别 对上它", "the service declares a category that a skill's ~~placeholder resolves to") },
  };
  const S = (id, name, group, state, account, can, cannot, extra = {}) => ({ id, name, group, state, account, can, cannot, ...extra });
  const services = [
    S("github", "GitHub", "code", "connected", "yijun-w", [
      { use: "feed", text: w("未读通知做成 Feed 条目", "Unread notifications as Feed items") },
      { use: "assistant", text: w("读当前账号、通知", "Read the account and notifications") },
      { use: "category", text: w("代码托管 · 项目跟踪（Issue）", "Code hosting · project tracker (issues)"), cat: "project-tracker" },
    ], [
      { text: w("评论、开 PR", "Comment, open pull requests"), why: w("在 Coding 里按本次任务的授权做；这里不单独开放", "Done from Coding under the task's grant; not offered here on its own"), path: w("去 Coding", "Open Coding") },
    ]),
    S("linear", "Linear", "code", "available", null, [
      { use: "feed", text: w("分配给你的 Issue", "Issues assigned to you") },
      { use: "assistant", text: w("读账号、Issue 列表", "Read the account and issue list") },
      { use: "category", text: w("项目跟踪", "Project tracker"), cat: "project-tracker" },
    ], [
      { text: w("建 Issue、改状态", "Create issues, change status"), why: w("还没有写入的适配", "No write adapter yet"), path: w("第 62 批", "Batch 62") },
    ]),
    S("gmail", "Gmail", "mail", "connected", "yijun@…", [
      { use: "feed", text: w("指定时间范围的邮件", "Mail from a chosen time range") },
      { use: "assistant", text: w("读邮件列表", "Read the mail list") },
      { use: "category", text: w("邮件", "Email"), cat: "email" },
    ], [
      { text: w("发送邮件", "Send mail"), why: w("没有发送的实现", "No sending is implemented"), path: w("记进缺口清单", "In the gap list") },
    ]),
    S("google-calendar", "Google Calendar", "mail", "available", null, [
      { use: "assistant", text: w("主日历身份、事件列表", "Main calendar and its events") },
      { use: "category", text: w("日历", "Calendar"), cat: "calendar" },
    ], [
      { text: w("建日程", "Create events"), why: w("还没有写入的适配", "No write adapter yet"), path: w("第 62 批", "Batch 62") },
      { text: w("做 Feed 来源", "Use as a Feed source"), why: w("没有声明来源", "No source is declared"), path: null },
    ]),
    S("notion", "Notion", "files", "connected", "Molis 团队", [
      { use: "feed", text: w("页面更新（本批新加：Feed 能从这里加来源）", "Page updates (new: Feed can add it as a source)"), fresh: true },
      { use: "import", text: w("导入页面正文", "Import page text") },
      { use: "assistant", text: w("读账号、搜页面", "Read the account, search pages") },
      { use: "category", text: w("文档", "Documents"), cat: "docs" },
    ], []),
    S("slack", "Slack", "chat", "available", null, [
      { use: "feed", text: w("频道列表", "Channel list") },
      { use: "assistant", text: w("读账号、频道", "Read the account and channels") },
      { use: "category", text: w("聊天", "Chat"), cat: "chat" },
    ], [
      { text: w("读频道消息、发消息", "Read channel messages, post"), why: w("现有适配只读到频道列表", "The adapter only reads the channel list"), path: w("可走 Slack 的 MCP", "Use Slack's MCP") },
    ]),
    S("figma", "Figma", "design", "available", null, [
      { use: "assistant", text: w("经 MCP 读设计内容（以实际发现的工具为准）", "Design content through MCP (tools as discovered)") },
    ], [
      { text: w("做 Feed 来源、导入", "Feed source, import"), why: w("接口只给身份", "Its API only gives the identity"), path: w("用 MCP", "Use MCP") },
    ]),
    S("feishu", "飞书", "chat", "blocked", null, [
      { use: "import", text: w("导入文档、知识库", "Import docs and wiki") },
      { use: "assistant", text: w("读账号、聊天列表", "Read the account and chats") },
    ], [], { blocked: w("要企业管理员批准应用，批准后回到这里接着连", "Needs your workspace admin to approve the app; come back here after") }),
    S("linkedin", "LinkedIn", "social", "available", null, [], [
      { text: w("读动态、发帖", "Read the feed, post"), why: w("只开放会员资料", "Only the member profile is open"), path: null },
    ], { onlyIdentity: true }),
    S("brave", "Brave Search", "search", "connected", w("密钥 …4f2a", "Key …4f2a"), [
      { use: "search", text: w("网页搜索（带网页出处）", "Web search with page sources") },
    ], [], { fresh: true }),
  ];
  const groups = [
    ["code", w("代码与项目", "Code and projects")], ["mail", w("邮件与日程", "Mail and calendar")], ["files", w("文档与笔记", "Docs and notes")],
    ["chat", w("消息", "Messages")], ["design", w("设计", "Design")], ["social", w("社交", "Social")], ["search", w("搜索", "Search")],
  ];
  const categories = { "project-tracker": w("项目跟踪", "Project tracker"), email: w("邮件", "Email"), calendar: w("日历", "Calendar"), docs: w("文档", "Documents"), chat: w("聊天", "Chat") };

  const search = {
    sources: [
      { id: "anysearch", name: w("AnySearch（内置）", "AnySearch (built in)"), note: w("免账号，Molis Work 自带", "No account; comes with Molis Work"), state: "ok" },
      { id: "brave", name: "Brave Search", account: w("密钥 …4f2a", "Key …4f2a"), note: w("你连上的服务；按它的额度计费", "Your connection; billed by its plan"), state: "ok" },
      { id: "tavily", name: "Tavily", note: w("能搜索，还没连上", "Can search; not connected"), state: "none" },
    ],
    users: w("助理、Coding、Feed 的网页查询、Alchemist 研究", "Assistant, Coding, Feed web queries, Alchemist research"),
  };

  const project = w("molis-site", "molis-site");
  const scan = {
    read: w("读了 2 个文件夹里的 9 个文件，只读，没改任何东西", "Read 9 files in 2 folders. Read only, nothing changed"),
    found: [w("TypeScript", "TypeScript"), w("React", "React"), w("Vitest", "Vitest"), w("ESLint", "ESLint"), w("GitHub Actions", "GitHub Actions"), w("Notion SDK", "Notion SDK")],
    have: [w(".claude/skills/review（评审）", ".claude/skills/review (review)"), w("AGENTS.md", "AGENTS.md")],
  };
  const rec = [
    { id: "skill-test", cat: "skills", title: w("测试与质量", "Testing and quality"), pack: "Engineering · 2.1 · Adeptify",
      why: w("项目用 Vitest 和 ESLint，改代码后最值得先跑测试和检查", "The project uses Vitest and ESLint, so checks after edits pay off first"),
      evidence: ["vitest.config.ts", "eslint.config.js", "package.json"], effect: w("适用的对话里自动用：写完代码先跑测试、修 lint", "Used in matching conversations: run tests and fix lint after edits"),
      needs: w("工程技能包 2.1（已装）", "Engineering pack 2.1 (installed)"), risk: w("会用模型额度；不含脚本", "Uses model quota; no scripts"), conf: "high", next: "skill" },
    { id: "skill-ui", cat: "skills", title: w("前端界面检查", "Front-end UI check"), pack: "Design · 1.4 · Adeptify",
      why: w("项目是 React + Vite 的前端", "This is a React + Vite front end"), evidence: ["package.json"], effect: w("检查对比度、键盘、窄屏", "Checks contrast, keyboard, narrow screens"),
      needs: w("设计技能包 1.4（已装）", "Design pack 1.4 (installed)"), risk: w("会用模型额度；不含脚本", "Uses model quota; no scripts"), conf: "medium", next: "skill" },
    { id: "conn-github", cat: "connections", title: w("连接 GitHub", "Connect GitHub"), why: w("有 GitHub Actions 和 Octokit，读 CI 与 Issue 更快", "GitHub Actions and Octokit are here; reading CI and issues gets faster"),
      evidence: [".github/workflows", "package.json"], effect: w("助理能读通知和 Issue；Feed 能加未读通知", "The assistant can read notifications and issues; Feed can add them"),
      needs: w("你能授权的 GitHub 账号", "A GitHub account you can authorize"), risk: w("只读；按 GitHub 的权限", "Read only; GitHub's permissions apply"), conf: "high", next: "connection" },
    { id: "conn-notion", cat: "connections", title: w("连接 Notion", "Connect Notion"), why: w("代码里用了 Notion SDK", "The code uses the Notion SDK"), evidence: ["package.json"],
      effect: w("导入页面正文、加 Feed 来源", "Import page text, add a Feed source"), needs: w("Notion 工作区权限", "Notion workspace access"), risk: w("只读你授权的页面", "Reads only pages you share"), conf: "medium", next: "connection" },
    { id: "role-review", cat: "roles", title: w("代码评审员", "Code reviewer"), pack: "Engineering · 2.1 · Adeptify",
      why: w("有 CI 和测试，适合交给评审角色看改动", "With CI and tests, a review role can check changes"), evidence: [".github/workflows", "tests/"],
      effect: w("在需要时把改动交给它看一遍", "Hands a change to it when a review helps"), needs: w("工程技能包 2.1", "Engineering pack 2.1"), risk: w("会用模型额度；工具仍按本轮授权", "Uses model quota; tools keep this round's grant"), conf: "medium", next: "role" },
  ];
  const noSource = {
    hooks: w("平台还没有可装的 Hooks（Coding 的 Hooks 在第 65 批做）。项目里已有的 .claude/hooks 不会被改。", "The platform has no installable hooks yet (Coding hooks arrive in batch 65). Existing .claude/hooks stay as they are."),
    commands: w("还没有可装的命令。可点名的技能已经能用 / 调用。", "No installable commands yet. Skills you can name already work with /."),
  };
  return { uses, services, groups, categories, search, project, scan, rec, noSource, w };
})();
