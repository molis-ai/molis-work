// 22 · External sessions prototype: sample data only. Nothing here reads a tool, a Home or the disk.
// Text is [zh, en]. Tool names, paths and session IDs are illustrative.
window.protoData = {
  // The three areas the user decides on. Each area has 2-3 options and its own normal and failure states.
  blocks: [
    {
      id: "discover", name: ["发现会话", "Discovery"],
      options: [
        { id: "A", name: ["A 按工具分组", "A Grouped by tool"] },
        { id: "B", name: ["B 按时间排，来源条看状态", "B By time, with a source strip"], rec: true },
        { id: "C", name: ["C 先看来源总览", "C Sources overview first"] },
      ],
      states: [
        { id: "reading", name: ["正在读（先出一部分）", "Reading (partial results)"] },
        { id: "done", name: ["全部读完", "All read"] },
        { id: "mixed", name: ["有来源没读成", "Some sources failed"] },
        { id: "empty", name: ["读完了，范围内没有会话", "Read, no sessions in scope"] },
        { id: "first", name: ["还没允许读", "Not allowed yet"] },
        { id: "narrowed", name: ["收窄了范围", "Scope narrowed"] },
      ],
    },
    {
      id: "owner", name: ["归属建议", "Project suggestions"],
      options: [
        { id: "A", name: ["A 在会话里就地确认", "A Confirm in place"] },
        { id: "B", name: ["B 待归类集中处理", "B One “To sort” list"], rec: true },
        { id: "C", name: ["C 按建议的项目成组", "C Grouped by suggested project"] },
      ],
      states: [
        { id: "pending", name: ["有建议待确认", "Suggestions waiting"] },
        { id: "arriving", name: ["卡片先到，建议随后到", "Cards first, suggestions follow"] },
        { id: "failed", name: ["建议没生成（模型不可用）", "No suggestion (model unavailable)"] },
        { id: "changed", name: ["你改选后来了新建议", "Late suggestion after you changed it"] },
        { id: "done", name: ["都处理完了", "All sorted"] },
      ],
    },
    {
      id: "history", name: ["查看历史", "History"],
      options: [
        { id: "A", name: ["A 原文对话", "A Conversation as written"], rec: true },
        { id: "B", name: ["B 左边提问目录，右边原文", "B Prompt outline + conversation"] },
        { id: "C", name: ["C 要点在上，原文在下", "C Key points above the conversation"] },
      ],
      states: [
        { id: "normal", name: ["正常", "Normal"] },
        { id: "long", name: ["长历史在读更早的", "Long history, loading earlier"] },
        { id: "search", name: ["会话里搜索", "Search in session"] },
        { id: "failed", name: ["读到一半断了", "Read stopped halfway"] },
        { id: "version", name: ["这一版读不了", "This version can't be read"] },
        { id: "revoked", name: ["已停止读取这个工具", "Reading stopped for this tool"] },
        { id: "gap", name: ["这个工具暂不支持读取", "Tool not supported yet"] },
      ],
    },
    {
      id: "permit", name: ["项目 AI 读取", "Project AI reading"],
      options: [
        { id: "A", name: ["A Sheet 分两页，全部项目一张表", "A Two-page Sheet, every project in one list"], rec: true },
        { id: "B", name: ["B Sheet 顶上是当前项目，其他只看", "B Current project on top, others view-only"] },
        { id: "C", name: ["C 项目总览放进主区", "C Project overview in the main area"] },
      ],
      states: [
        { id: "agent", name: ["第一次碰到：AI 要读被挡", "First meeting: AI is stopped"] },
        { id: "scene", name: ["第一次碰到：场景未就绪", "First meeting: scene not ready"] },
        { id: "scene-tools", name: ["场景未就绪：还没允许工具", "Scene not ready: no tool allowed"] },
        { id: "none", name: ["没有项目", "No projects"] },
        { id: "one", name: ["一个项目", "One project"] },
        { id: "many", name: ["很多项目（28 个）", "Many projects (28)"] },
        { id: "tooloff", name: ["开着，但工具没允许", "On, but no tool allowed"] },
        { id: "team", name: ["团队项目暂不开放", "Team projects not open yet"] },
        { id: "fail", name: ["切换失败，就地重试", "Switch failed, retry in place"] },
      ],
    },
  ],

  projects: [
    { id: "molis", name: ["Molis Work", "Molis Work"], dir: "~/code/goalboard" },
    { id: "site", name: ["官网改版", "Website redesign"], dir: "~/code/site" },
  ],

  // Project AI reading. n = sessions filed under the project; gap = some come from a tool that isn't allowed;
  // reported = some only have a tool's word for it, so AI can't read them until you confirm.
  permitProjects: [
    { id: "molis", name: ["Molis Work", "Molis Work"], dir: "~/code/goalboard", n: 34 },
    { id: "site", name: ["官网改版", "Website redesign"], dir: "~/code/site", n: 17, gap: { tool: "codex", n: 6 } },
    { id: "billing", name: ["账单对账", "Billing reconciliation"], dir: "~/code/billing", n: 12, reported: 3 },
    { id: "notes", name: ["读书笔记", "Reading notes"], dir: "~/Documents/notes", n: 0 },
    { id: "clinic", name: ["诊所预约系统", "Clinic booking"], dir: "~/code/clinic", n: 21, team: true },
    { id: "ops", name: ["运营周报", "Ops weekly"], dir: "~/Documents/ops", n: 8, team: true },
    { id: "dash", name: ["数据看板", "Data dashboard"], dir: "~/code/dash", n: 9 },
    { id: "mobile", name: ["移动端重构", "Mobile rewrite"], dir: "~/code/mobile", n: 26 },
    { id: "contracts", name: ["合同模板库", "Contract templates"], dir: "~/Documents/contracts", n: 3 },
    { id: "support", name: ["客服知识库", "Support knowledge base"], dir: "~/code/support-kb", n: 14 },
    { id: "hiring", name: ["招聘流程", "Hiring process"], dir: "~/Documents/hiring", n: 2 },
    { id: "q4", name: ["季度规划", "Quarterly plan"], dir: "~/Documents/q4", n: 5 },
    { id: "brand", name: ["品牌手册", "Brand book"], dir: "~/Documents/brand", n: 1 },
    { id: "pay", name: ["支付网关迁移", "Payment gateway migration"], dir: "~/code/pay-gw", n: 31 },
    { id: "release", name: ["发布说明自动化", "Release notes automation"], dir: "~/code/release-bot", n: 7 },
    { id: "interview", name: ["用户访谈整理", "User interview notes"], dir: "~/Documents/interviews", n: 4 },
    { id: "ds2", name: ["设计系统 2.0", "Design system 2.0"], dir: "~/code/ui-kit", n: 19 },
    { id: "internal", name: ["内部工具集", "Internal tools"], dir: "~/code/tools", n: 11 },
    { id: "compete", name: ["竞品跟踪", "Competitor tracking"], dir: "~/Documents/research", n: 6 },
    { id: "finance", name: ["财务模型", "Financial model"], dir: "~/Documents/finance", n: 0 },
    { id: "landing", name: ["活动落地页", "Campaign landing pages"], dir: "~/code/landing", n: 8 },
    { id: "market", name: ["插件市场", "Plugin marketplace"], dir: "~/code/market", n: 15 },
    { id: "audit", name: ["2026 下半年安全审计及供应商问卷回复", "Second-half 2026 security audit and vendor questionnaire replies"], dir: "~/Documents/security/audit-2026-h2", n: 10 },
    { id: "docs", name: ["文档站", "Docs site"], dir: "~/code/docs", n: 13 },
    { id: "mail", name: ["邮件营销", "Email marketing"], dir: "~/code/mailers", n: 2 },
    { id: "trip", name: ["旅行计划", "Trip planning"], dir: "~/Documents/trip", n: 1 },
    { id: "home", name: ["家庭账本", "Household ledger"], dir: "~/Documents/ledger", n: 0 },
    { id: "paper", name: ["论文修订", "Paper revisions"], dir: "~/Documents/paper", n: 3 },
  ],
  // Which projects each state shows, and which start switched on. Off is the default everywhere else.
  permitSets: {
    base: { ids: ["molis", "site", "billing", "notes"], on: [] },
    one: { ids: ["molis"], on: [] },
    tooloff: { ids: ["molis", "site", "billing"], on: ["molis"] },
    team: { ids: ["clinic", "ops", "molis", "site"], on: [] },
    fail: { ids: ["molis", "site", "billing"], on: ["site"] },
    many: { ids: null, on: ["site", "billing", "ds2"] },
    none: { ids: [], on: [] },
  },
  recentForScene: ["s1", "s2", "s9"],

  // kind → icon on the board's Mark: cli=terminal, cloud=cloud, ide=code
  tools: [
    { id: "claude", name: "Claude Code", kind: "cli", where: ["本机 · ~/.claude", "This Mac · ~/.claude"], resume: "terminal", ver: "2.4.1" },
    { id: "codex", name: "Codex", kind: "cli", where: ["本机 · ~/.codex", "This Mac · ~/.codex"], resume: "terminal", ver: "0.58" },
    { id: "qwen", name: "Qwen Code", kind: "cli", where: ["本机 · ~/.qwen", "This Mac · ~/.qwen"], resume: "tool", ver: "0.9.0" },
    { id: "kimi", name: "Kimi Code", kind: "cli", where: ["本机 · ~/.kimi-code", "This Mac · ~/.kimi-code"], resume: "terminal", ver: "1.3" },
    { id: "gemini", name: "Gemini CLI", kind: "cli", where: ["本机 · ~/.gemini", "This Mac · ~/.gemini"], resume: "terminal", ver: "0.9.2" },
    { id: "copilot", name: "Copilot CLI", kind: "cli", where: ["本机", "This Mac"], resume: "terminal", ver: "1.0" },
    { id: "amp", name: "Amp", kind: "cloud", where: ["云端账号", "Cloud account"], resume: "tool" },
    { id: "cursor", name: ["Cursor 编辑器", "Cursor editor"], kind: "ide", where: ["本机应用", "Desktop app"], resume: "tool", gap: true },
    { id: "windsurf", name: "Windsurf", kind: "ide", where: ["本机应用", "Desktop app"], resume: "tool", gap: true },
  ],

  // Source status per discovery state: [code, found, estimate]. Codes: ok reading queued login version failed gap none off
  sourceStates: {
    reading: { claude: ["ok", 42], codex: ["reading", 18, 60], kimi: ["ok", 6], qwen: ["queued"], gemini: ["queued"], copilot: ["queued"], amp: ["queued"], cursor: ["gap"], windsurf: ["gap"] },
    done: { claude: ["ok", 42], codex: ["ok", 57], kimi: ["ok", 6], qwen: ["ok", 11], gemini: ["ok", 9], copilot: ["ok", 3], amp: ["ok", 4], cursor: ["gap"], windsurf: ["gap"] },
    mixed: { claude: ["ok", 42], codex: ["ok", 57], kimi: ["ok", 6], qwen: ["ok", 11], gemini: ["version"], copilot: ["failed"], amp: ["login"], cursor: ["gap"], windsurf: ["gap"] },
    empty: { claude: ["none"], codex: ["none"], kimi: ["none"], qwen: ["off"], gemini: ["off"], copilot: ["off"], amp: ["off"], cursor: ["gap"], windsurf: ["gap"] },
    first: { claude: ["off"], codex: ["off"], kimi: ["off"], qwen: ["off"], gemini: ["off"], copilot: ["off"], amp: ["off"], cursor: ["gap"], windsurf: ["gap"] },
    narrowed: { claude: ["ok", 12], codex: ["ok", 20], kimi: ["off"], qwen: ["ok", 3], gemini: ["off"], copilot: ["off"], amp: ["off"], cursor: ["gap"], windsurf: ["gap"] },
  },

  // how: dir = the folder is linked to exactly one project; manual = you picked it; none = to sort
  sessions: [
    { id: "s1", tool: "claude", title: ["统一输入的回执放进气泡里", "Move input receipts into the bubble"], dir: "~/code/goalboard", when: ["今天 14:20", "Today 14:20"], turns: 86, project: "molis", how: "dir", native: "8c41f0e2-…-7d1a", running: true },
    { id: "s2", tool: "codex", title: ["修 e2e 里 Goal Frame 分屏超时", "Fix the Goal Frame split e2e timeout"], dir: "~/code/goalboard", when: ["今天 11:05", "Today 11:05"], turns: 42, project: "molis", how: "dir", native: "rollout-2026-11-04T11-05" },
    { id: "s4", tool: "claude", title: ["组件库按钮的按压回弹", "Button press spring in the UI kit"], dir: "~/code/ui-kit", when: ["昨天 22:40", "Yesterday 22:40"], turns: 23, project: null, how: "none", native: "f02b9a71-…-11ce" },
    { id: "s3", tool: "qwen", title: ["官网首页首屏改版", "Website hero redesign"], dir: "~/code/site", when: ["昨天 16:12", "Yesterday 16:12"], turns: 31, project: "site", how: "dir", native: "q-7f3e21" },
    { id: "s9", tool: "codex", title: ["修 e2e 超时：改用等待事件", "E2E timeout: wait on the event"], dir: "~/code/goalboard", when: ["昨天 10:30", "Yesterday 10:30"], turns: 12, project: "molis", how: "dir", native: "rollout-2026-11-03T10-30", forkOf: "s2" },
    { id: "s5", tool: "kimi", title: ["整理竞品定价表", "Sort out the competitor pricing table"], dir: "~/Documents/research", when: ["11 月 2 日", "Nov 2"], turns: 18, project: null, how: "none", native: "k-20261102-0931" },
    { id: "s8", tool: "qwen", title: ["修复部署脚本的路径", "Fix paths in the deploy script"], dir: "~/code/site", when: ["11 月 1 日", "Nov 1"], turns: 9, project: "molis", how: "manual", native: "q-6a90bc" },
    { id: "s6", tool: "codex", title: ["试一下 SQLite 升级链", "Try out the SQLite upgrade chain"], dir: "~/tmp/sqlite-test", when: ["10 月 30 日", "Oct 30"], turns: 14, project: null, how: "none", native: "rollout-2026-10-30T20-14" },
    { id: "s7", tool: "claude", title: ["写本周周报", "Write this week's report"], dir: "~", when: ["10 月 30 日", "Oct 30"], turns: 7, project: null, how: "none", native: "0d7e55aa-…-c093" },
    { id: "s10", tool: "gemini", title: ["给首页插图配色", "Colour the home page illustration"], dir: "~/code/site", when: ["10 月 28 日", "Oct 28"], turns: 15, project: "site", how: "dir", native: "chat-3" },
    { id: "s11", tool: "amp", title: ["梳理插件签名流程", "Map out plugin signing"], dir: ["云端线程", "Cloud thread"], when: ["10 月 27 日", "Oct 27"], turns: 26, project: null, how: "none", native: "T-1c0f…" },
  ],

  // Suggestions for sessions without a clear folder link. kind: suggest | none (AI found no fit)
  suggestions: {
    s4: { kind: "suggest", to: "molis",
      reason: ["这个目录同时连着 Molis Work 和官网改版。对话里三次提到 Molis Work 的组件板，官网改版没有出现。", "This folder is linked to both Molis Work and Website redesign. The conversation mentions Molis Work's component board three times; Website redesign never comes up."],
      evidence: [["目录 ~/code/ui-kit 连着 2 个项目", "Folder ~/code/ui-kit is linked to 2 projects"], ["提到「组件板 /__ui/catalog」3 次", "Mentions “component board /__ui/catalog” 3 times"]] },
    s5: { kind: "suggest", to: "site",
      reason: ["讨论的是官网定价页要放的三档价格。这个目录没有连着任何项目。", "It discusses the three price tiers for the website pricing page. The folder isn't linked to any project."],
      evidence: [["目录 ~/Documents/research 没有连着项目", "Folder ~/Documents/research isn't linked to a project"], ["提到「定价页」「官网」各 4 次", "Mentions “pricing page” and “website” 4 times each"]] },
    s6: { kind: "none", to: null,
      reason: ["像是一次性的试验，和两个项目的内容都对不上。", "Looks like a one-off experiment; it doesn't match either project."],
      evidence: [["目录 ~/tmp/sqlite-test 没有连着项目", "Folder ~/tmp/sqlite-test isn't linked to a project"]] },
    s7: { kind: "suggest", to: "molis",
      reason: ["周报里列的五件事有四件是 Molis Work 的进展。", "Four of the five items in the report are Molis Work progress."],
      evidence: [["目录是主文件夹 ~，不算项目关系", "The folder is your home folder ~, which isn't a project link"]] },
    s11: { kind: "suggest", to: "molis",
      reason: ["线程讨论的是 Molis Work 插件的发布者签名。", "The thread is about publisher signatures for Molis Work plugins."],
      evidence: [["云端线程没有目录", "Cloud threads have no folder"]] },
  },

  // The full conversation for s1 (Claude Code). who: you | ai | tool | note
  transcript: [
    { who: "note", text: ["会话开始 · 11 月 4 日 13:02 · ~/code/goalboard", "Session started · Nov 4, 13:02 · ~/code/goalboard"] },
    { who: "you", t: "13:02", text: ["统一输入的回执现在在气泡外面，看着跟消息脱节。能不能放进气泡里？深浅色都要看。", "Input receipts sit outside the bubble and feel detached from the message. Can they go inside the bubble? Check both light and dark."] },
    { who: "ai", t: "13:03", text: ["先看现在回执是怎么画的。", "Let me look at how receipts are drawn now."] },
    { who: "tool", t: "13:03", tool: ["读取文件", "Read file"], detail: "apps/workbench/src/assistant-island.ts", result: ["读了 412 行", "412 lines read"] },
    { who: "tool", t: "13:04", tool: ["搜索", "Search"], detail: "mw-receipt", result: ["8 处，3 个文件", "8 matches in 3 files"] },
    { who: "ai", t: "13:05", text: ["回执现在是消息后面单独的一块。我把它挪进气泡底部，用一条细分隔线和正文分开，按钮缩成文字链接，免得气泡里出现第二个主按钮。", "The receipt is a separate block after the message. I'll move it to the bottom of the bubble, split from the text by a hairline, and turn its buttons into text links so the bubble doesn't get a second primary button."] },
    { who: "tool", t: "13:09", tool: ["修改文件", "Edit file"], detail: "packages/design-system/src/receipts.ts", result: ["+38 −21", "+38 −21"] },
    { who: "you", t: "13:20", text: ["深色下分隔线太淡了，几乎看不见。", "In dark mode the hairline is too faint, almost invisible."] },
    { who: "ai", t: "13:21", text: ["改用 --line-strong，深色下对比够了，浅色看起来不变。", "Switched to --line-strong: enough contrast in dark, unchanged in light."] },
    { who: "tool", t: "13:24", tool: ["运行命令", "Run command"], detail: "node scripts/run-tests.mjs tests/input-receipts.test.ts", result: ["14 项通过", "14 passed"] },
    { who: "ai", t: "13:25", text: ["改完了：回执在气泡里，浅深色都截了图放在 .impeccable/qa/review/receipts/。", "Done: the receipt sits in the bubble; light and dark screenshots are in .impeccable/qa/review/receipts/."] },
    { who: "you", t: "14:18", text: ["窄屏下按钮折行了，看下 390 宽。", "Buttons wrap on narrow screens; check 390 wide."] },
    { who: "ai", t: "14:20", text: ["正在看 390 宽……", "Looking at 390 wide…"], live: true },
  ],
  searchTerm: ["深色", "dark"],
  outline: [
    { at: 1, text: ["回执放进气泡里", "Receipts into the bubble"], t: "13:02" },
    { at: 7, text: ["深色下分隔线太淡", "Hairline too faint in dark"], t: "13:20" },
    { at: 11, text: ["窄屏下按钮折行", "Buttons wrap when narrow"], t: "14:18" },
  ],
  keyPoints: [
    { id: "decided", name: ["定下的", "Decided"], items: [[["回执放进气泡底部，按钮改成文字链接", "Receipts go at the bottom of the bubble; buttons become text links"], 5], [["分隔线用 --line-strong", "Hairline uses --line-strong"], 8]] },
    { id: "made", name: ["做出来的", "Made"], items: [[["receipts.ts 改了 +38 −21，14 项测试通过", "receipts.ts changed +38 −21; 14 tests pass"], 9], [["浅深色截图在 .impeccable/qa/review/receipts/", "Light and dark screenshots in .impeccable/qa/review/receipts/"], 10]] },
    { id: "open", name: ["还没完的", "Still open"], items: [[["390 宽下按钮折行，还在看", "Buttons wrap at 390 wide; still in progress"], 11]] },
  ],
};
