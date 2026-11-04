// 21 · Work records prototype — all sample data. Nothing here reads a Home, a database or a disk.
window.protoData = {
  // Blocks, options and states the review strip switches between.
  blocks: [
    { id: "scope", name: ["记了什么", "What's recorded"], options: [
      { id: "A", name: ["A 分类清单", "A Category list"], rec: true },
      { id: "B", name: ["B 用一件事举例", "B One real piece of work"] },
      { id: "C", name: ["C 底栏常驻标记", "C Always-on marker"] },
    ], states: [
      { id: "normal", name: ["正常：记录中", "Normal: recording"] },
      { id: "first", name: ["首次接入：在读现有资料", "First connect: reading what exists"] },
      { id: "paused", name: ["已暂停记录", "Recording paused"] },
      { id: "useoff", name: ["评测用途已关", "Evaluation use off"] },
    ] },
    { id: "clean", name: ["保留与清理", "Keep & clean up"], options: [
      { id: "A", name: ["A 期限加手动清理", "A Period + manual clean-up"], rec: true },
      { id: "B", name: ["B 时间轴", "B Timeline"] },
    ], states: [
      { id: "normal", name: ["正常：长期保留（默认）", "Normal: keep (default)"] },
      { id: "short", name: ["选的期限短于报告与比较", "Period shorter than reports"] },
      { id: "dialog", name: ["手动清理：看影响", "Manual: review impact"] },
      { id: "running", name: ["清理中", "Cleaning up"] },
      { id: "partial", name: ["清理有一处没成", "One part failed"] },
      { id: "after", name: ["清理之后：显示缺口", "After: gap shown"] },
    ] },
    { id: "space", name: ["占用", "Space"], options: [
      { id: "A", name: ["A 数字加分类条", "A Number + category bar"], rec: true },
      { id: "B", name: ["B 增长趋势", "B Growth trend"] },
      { id: "C", name: ["C 存储总览一行", "C One row in Storage"] },
    ], states: [
      { id: "normal", name: ["正常：没设提醒线", "Normal: no reminder"] },
      { id: "near", name: ["接近提醒线", "Near the reminder"] },
      { id: "over", name: ["超过提醒线", "Past the reminder"] },
      { id: "disk", name: ["磁盘不足：有记录没保存", "Disk full: some not saved"] },
      { id: "counting", name: ["正在计算", "Counting"] },
    ] },
    { id: "gaps", name: ["覆盖与缺口", "Coverage & gaps"], options: [
      { id: "A", name: ["A 覆盖表", "A Coverage grid"] },
      { id: "B", name: ["B 先列缺口", "B Gaps first"], rec: true },
      { id: "C", name: ["C 时间线", "C Timeline"] },
    ], states: [
      { id: "normal", name: ["正常：只有未接入与不适用", "Normal: only not-connected / n/a"] },
      { id: "issues", name: ["有缺口：写入失败、断线、截断", "Gaps: write failure, offline, truncated"] },
      { id: "cleared", name: ["清理后：早期记录已清除", "After clean-up: early records cleared"] },
    ] },
  ],

  // Kinds of records — one colour each, same in every block.
  kinds: [
    { id: "ops", hue: "blue", icon: "edit", name: ["你的操作", "Your actions"],
      rec: ["打开、编辑、保存、采用、拒绝、撤销了哪个对象", "Which object you opened, edited, saved, adopted, rejected or undid"],
      not: ["没发出的草稿、输入法里的字、别的应用", "Unsent drafts, keystrokes, other apps"] },
    { id: "ai", hue: "violet", icon: "sparkles", name: ["AI 做的事", "What AI did"],
      rec: ["请求、用到的资料与版本、生效的 Skill 版本、模型给出的回答、工具调用与结果、用量", "Request, materials and versions used, active Skill version, model output, tool calls and results, usage"],
      not: ["模型没给出的内部思考；密钥只记是哪一把", "Hidden model reasoning; keys are recorded by name only"] },
    { id: "content", hue: "green", icon: "history", name: ["内容的变化", "Content changes"],
      rec: ["谁改了什么、改前改后各是哪个版本", "Who changed what, and which version before and after"],
      not: ["不另存一份正文；正文留在各插件自己的历史里", "No second copy of the text; it stays in each plugin's history"] },
    { id: "bg", hue: "amber", icon: "workflow", name: ["工作流与后台任务", "Workflows & background"],
      rec: ["定时任务、工作流、后台任务的每一步、暂停、失败与恢复", "Each step, pause, failure and recovery of schedules, workflows and background tasks"],
      not: ["没获准的来源", "Sources you have not allowed"] },
    { id: "shown", hue: "teal", icon: "eye", name: ["呈现与反馈", "What was shown & your response"],
      rec: ["给你看了哪些建议与候选、你选了哪个、移走或纠正了什么", "Suggestions and candidates shown, what you picked, moved away or corrected"],
      not: ["你有没有读懂——系统不猜", "Whether you understood — never guessed"] },
  ],

  uses: [
    { id: "look", name: ["本机回看与审计", "Look back & audit on this Mac"], on: true, fixed: true },
    { id: "assist", name: ["主动助理使用", "Proactive assistant"], on: true },
    { id: "eval", name: ["效果评测", "Effect evaluation"], on: true },
    { id: "export", name: ["导出", "Export"], on: false },
    { id: "upload", name: ["上传到别处", "Upload elsewhere"], on: false, na: true },
  ],

  // One real-looking piece of work for scope option B.
  example: {
    title: ["昨天 16:20 · 改写第三期周报", "Yesterday 16:20 · Rewrote issue 3 of the weekly"],
    steps: [
      { kind: "ops", t: "16:20", text: ["打开 Pages「AI 产品周报 · 第三期」", "Opened Pages “AI product weekly · issue 3”"] },
      { kind: "ai", t: "16:21", text: ["让助理改写第二节，用了 3 份资料、「周报写作」Skill v4", "Asked the assistant to rewrite section 2 with 3 materials and Skill “Weekly writing” v4"] },
      { kind: "shown", t: "16:22", text: ["助理给出 2 个改法，你选了第 1 个", "The assistant offered 2 rewrites; you picked the first"] },
      { kind: "content", t: "16:24", text: ["第二节从 v7 变成 v8（你又改了两句）", "Section 2 went from v7 to v8 (you changed two sentences)"] },
      { kind: "bg", t: "18:00", text: ["定时任务「周五发布」把 v8 发到团队频道", "Schedule “Friday publish” sent v8 to the team channel"] },
    ],
    skipped: [
      ["输入框里写了又删掉的一段话", "A paragraph you typed and deleted in the composer"],
      ["你在浏览器里另开的网页", "Web pages you opened in your browser"],
    ],
  },

  // Space by kind (GB).
  space: { total: 1.84, reminder: null, nearReminder: 2, overTotal: 2.41, free: 0.6, byKind: { ops: 0.12, ai: 0.96, content: 0.18, bg: 0.21, shown: 0.07, files: 0.30 } },
  trend: [0.62, 0.66, 0.7, 0.71, 0.8, 0.86, 0.9, 0.95, 1.02, 1.08, 1.1, 1.18, 1.24, 1.3, 1.33, 1.38, 1.45, 1.5, 1.52, 1.58, 1.62, 1.66, 1.7, 1.74, 1.76, 1.79, 1.8, 1.82, 1.83, 1.84],
  otherStorage: [
    { name: ["项目资料与索引", "Project materials & index"], gb: 3.2 },
    { name: ["成果库", "Library"], gb: 0.9 },
    { name: ["模型与缓存", "Models & cache"], gb: 6.4 },
  ],
  byProject: [
    { name: "AI 产品观察", gb: 1.02 }, { name: "官网改版", gb: 0.51 }, { name: "产品研究", gb: 0.31 },
  ],

  periods: [
    { id: "keep", name: ["一直保留（默认）", "Keep (default)"] },
    { id: "365", name: ["一年", "1 year"] },
    { id: "180", name: ["半年", "6 months"] },
    { id: "90", name: ["90 天", "90 days"] },
    { id: "30", name: ["30 天", "30 days"] },
    { id: "manual", name: ["不自动清理，我自己清", "Never automatically — I clean up myself"] },
  ],
  // What depends on how far back records go.
  needs: [
    { id: "weekly", days: 7, name: ["周报的依据", "Weekly report evidence"] },
    { id: "compare", days: 60, name: ["跨两个月的比较", "Two-month comparison"] },
    { id: "eval", days: 120, name: ["评测样本的原始记录", "Raw records behind evaluation samples"] },
  ],

  // Coverage: sources × kinds. Status codes match `statuses`.
  sources: [
    { id: "web", name: ["工作台（网页与桌面）", "Workbench (web & desktop)"], kind: "entry" },
    { id: "assistant", name: ["助理", "Assistant"], kind: "entry" },
    { id: "mcp", name: ["外部 Agent（MCP）", "External agents (MCP)"], kind: "entry" },
    { id: "cli", name: ["命令行", "Command line"], kind: "entry" },
    { id: "pages", name: ["Pages", "Pages"], kind: "plugin" },
    { id: "goals", name: ["Goals", "Goals"], kind: "plugin" },
    { id: "feed", name: ["Feed", "Feed"], kind: "plugin" },
    { id: "coding", name: ["Coding", "Coding"], kind: "plugin" },
    { id: "sched", name: ["定时任务与工作流", "Schedules & workflows"], kind: "bg" },
  ],
  statuses: {
    ok: { name: ["完整", "Complete"], tone: "ok" },
    none: { name: ["未接入", "Not connected"], tone: "mute" },
    na: { name: ["不适用", "Not applicable"], tone: "na" },
    rule: { name: ["按规则不记", "Not recorded by rule"], tone: "na" },
    off: { name: ["暂不可用", "Unavailable"], tone: "warn" },
    lost: { name: ["丢失", "Lost"], tone: "err" },
    cut: { name: ["截断", "Truncated"], tone: "warn" },
    masked: { name: ["已脱敏", "Redacted"], tone: "info" },
    cleared: { name: ["到期清除", "Cleared by retention"], tone: "info" },
  },
  // grid[source][kind]
  grid: {
    web: { ops: "ok", ai: "na", content: "ok", bg: "na", shown: "ok" },
    assistant: { ops: "ok", ai: "ok", content: "ok", bg: "ok", shown: "ok" },
    mcp: { ops: "na", ai: "ok", content: "ok", bg: "na", shown: "na" },
    cli: { ops: "none", ai: "none", content: "none", bg: "na", shown: "na" },
    pages: { ops: "ok", ai: "ok", content: "ok", bg: "na", shown: "ok" },
    goals: { ops: "ok", ai: "ok", content: "ok", bg: "na", shown: "ok" },
    feed: { ops: "ok", ai: "ok", content: "ok", bg: "ok", shown: "ok" },
    coding: { ops: "ok", ai: "ok", content: "ok", bg: "ok", shown: "ok" },
    sched: { ops: "na", ai: "ok", content: "ok", bg: "ok", shown: "na" },
  },
  // Gaps per state; each has a source, kind, status, span, cause and what it affects.
  gapSets: {
    normal: [
      { src: "cli", kind: "*", st: "none", span: ["一直", "Always"], cause: ["命令行还没接上记录", "The command line is not connected yet"], affects: ["命令行里做的事不会出现在回看与评测里", "Work done from the command line is missing from look-back and evaluation"] },
    ],
    issues: [
      { src: "assistant", kind: "ai", st: "lost", span: ["11-03 14:02 – 14:40", "Nov 3 14:02 – 14:40"], cause: ["磁盘满，37 条没能保存", "Disk was full; 37 records were not saved"], affects: ["这段时间的助理工作，结果已照常生效，但过程查不到", "Assistant work in this window took effect, but its steps can't be looked up"], act: ["看占用", "See space"] },
      { src: "feed", kind: "content", st: "off", span: ["11-01 起", "Since Nov 1"], cause: ["订阅源连接断开", "Feed source disconnected"], affects: ["新文章没读到；重新连上后补读的内容会标成「补回」", "New articles not read; anything re-read after reconnecting is marked “backfilled”"], act: ["重新连接", "Reconnect"] },
      { src: "coding", kind: "ai", st: "cut", span: ["11-02 一次会话", "One session on Nov 2"], cause: ["一次工具输出超过 2 MB，只留了前 2 MB", "One tool output was over 2 MB; the first 2 MB were kept"], affects: ["这次的完整输出无法重看", "That full output can't be reviewed"] },
      { src: "mcp", kind: "ai", st: "masked", span: ["3 次调用", "3 calls"], cause: ["参数里有密钥，已换成钥匙名", "Arguments contained keys; replaced by key names"], affects: ["不影响回看", "No effect on look-back"] },
      { src: "cli", kind: "*", st: "none", span: ["一直", "Always"], cause: ["命令行还没接上记录", "The command line is not connected yet"], affects: ["命令行里做的事不会出现在回看与评测里", "Work done from the command line is missing from look-back and evaluation"] },
    ],
    cleared: [
      { src: "*", kind: "*", st: "cleared", span: ["8 月 4 日以前", "Before Aug 4"], cause: ["你在 11-03 清理了 90 天以前的记录", "You cleared records older than 90 days on Nov 3"], affects: ["8 月的周报依据与评测样本的原始记录已不在；原文与已存的简报还在", "August report evidence and raw evaluation records are gone; the originals and saved briefs remain"] },
      { src: "cli", kind: "*", st: "none", span: ["一直", "Always"], cause: ["命令行还没接上记录", "The command line is not connected yet"], affects: ["命令行里做的事不会出现在回看与评测里", "Work done from the command line is missing from look-back and evaluation"] },
    ],
  },
};
