// Made-up sample data for the batch-08 prototype. Field names follow the contract draft
// (specs/skill-packs/contract-design.md §5–§8: SkillInstallPreview, SkillCatalogEntry, SkillUnavailableReason).
window.SKILL_DATA = {
  project: { zh: "Atlas 改版", en: "Atlas redesign" },
  // The package being installed in the "install preview" area (new install, or upgrade 1.4 → 2.0).
  install: {
    pack: "writing",
    from: "1.4",
    signer: "acme-content-01",
    publisher: { zh: "Acme 内容", en: "Acme Content" },
    // The upgrade view adds `change` and the current `state` (kept as is) to these; a removed skill is listed only in the upgrade.
    upgrade: { weekly: { change: "body_changed", kept: "auto" }, release: { change: "resources_changed", kept: "manual" }, compete: { change: "added" } },
    removed: { id: "oldweekly", name: { zh: "旧版周报模板", en: "Old weekly template" }, applies: "assistant" },
    // plugin.declaration_invalid → problems: [{ skill_id?, path?, reason }], listed as they come.
    bad: [
      { skill_id: "meeting-notes", path: "skills/meeting-notes/SKILL.md", reason: { zh: "包里找不到", en: "missing from the package" } },
      { skill_id: "compete", path: "skills/compete/../../secrets.txt", reason: { zh: "路径指到包外面", en: "path points outside the package" } },
    ],
  },
  packs: [
    {
      id: "writing", title: { zh: "写作方法", en: "Writing methods" }, version: "2.0", trust: "pinned", scope: "project",
      publisher: { zh: "Acme 内容", en: "Acme Content" },
      skills: [
        {
          id: "weekly", name: { zh: "写周度复盘", en: "Weekly review" }, applies: "both", invocable: true, arg: { zh: "<周期，可选>", en: "<period, optional>" },
          desc: { zh: "把一周里各插件的结果汇成一份复盘：做成了什么、卡在哪、下周先做什么。", en: "Pulls the week's results from every plugin into one review: what got done, what's stuck, what comes first next week." },
          when: { zh: "一周结束，要跨插件综合结果时。", en: "At the end of a week, when results from several plugins need pulling together." },
          whenNot: { zh: "只要当天待办或单条状态时。", en: "When you only need today's to-dos or a single status." },
          tools: ["read-file", "search"], connectors: [],
          resources: [{ path: "references/template.md", role: "reference", bytes: 4200 }, { path: "references/examples.md", role: "reference", bytes: 11800 }],
          excerpt: { zh: "先列这一周关掉的 Goal 和待办，按插件分组；再写卡住的事，每条写清卡在谁、要什么才能动；最后给下周三件最先做的事……", en: "Start with the Goals and to-dos closed this week, grouped by plugin; then what's stuck, each with who it waits on and what would unblock it; finish with the three things to do first next week…" },
          state: "auto", lastUsed: { at: "11-03 18:20", by: "assistant" },
        },
        {
          id: "release", name: { zh: "写发布说明", en: "Release notes" }, applies: "coding", invocable: true, arg: { zh: "<版本号>", en: "<version>" },
          desc: { zh: "按合入的改动写面向用户的发布说明，分新功能、改进和修复。", en: "Writes user-facing release notes from merged changes: new, improved, fixed." },
          when: { zh: "要发版、要给用户讲这次改了什么时。", en: "Before a release, when users need to hear what changed." },
          whenNot: { zh: "写内部提交说明时。", en: "For internal commit messages." },
          tools: ["read-file", "git-log"], connectors: [],
          resources: [{ path: "references/tone.md", role: "reference", bytes: 2600 }],
          excerpt: { zh: "只写用户能感觉到的变化。每条一句话，先说用户现在能做什么，再说在哪里……", en: "Only write changes users can feel. One sentence each: first what they can do now, then where…" },
          state: "manual", lastUsed: { at: "11-02 10:05", by: "coding" },
        },
        {
          id: "meeting", name: { zh: "整理会议纪要", en: "Meeting notes" }, applies: "assistant", invocable: true,
          desc: { zh: "从日程和录音文字里整理会议纪要：结论、待办、谁负责。", en: "Turns calendar entries and transcripts into notes: decisions, to-dos, owners." },
          when: { zh: "开完会、手上有录音文字或笔记时。", en: "After a meeting, with a transcript or notes at hand." },
          whenNot: { zh: "没有会议材料时。", en: "When there's no meeting material." },
          tools: ["read-file"], connectors: ["calendar"],
          resources: [],
          excerpt: { zh: "先从 ~~calendar 取会议的标题、时间和参会人，再读文字稿，只记结论和待办……", en: "Take the title, time and attendees from ~~calendar, then read the transcript; record only decisions and to-dos…" },
          state: "auto", unavailable: { reason: "connection_missing", detail: "calendar" },
        },
        {
          id: "compete", name: { zh: "做竞品对比", en: "Competitor comparison" }, applies: "both", invocable: true,
          desc: { zh: "按同一张表比较几家产品的功能和价格，附来源。", en: "Compares products' features and prices in one table, with sources." },
          when: { zh: "要做选型或写竞品分析时。", en: "When choosing a vendor or writing a competitor analysis." },
          whenNot: { zh: "只问一家产品的情况时。", en: "When asking about a single product." },
          tools: ["read-file", "web-fetch"], connectors: [],
          resources: [{ path: "scripts/table.py", role: "script", bytes: 3100 }, { path: "assets/table.csv", role: "asset", bytes: 900 }],
          excerpt: { zh: "先定比较的维度，每一格都要有来源；表格用 scripts/table.py 生成……", en: "Fix the dimensions first; every cell needs a source. Build the table with scripts/table.py…" },
          state: "off",
        },
      ],
    },
    {
      id: "design", title: { zh: "设计与无障碍", en: "Design and accessibility" }, version: "1.0", trust: "host", scope: "project",
      publisher: { zh: "Molis Work", en: "Molis Work" },
      skills: [
        {
          id: "a11y", name: { zh: "无障碍走查", en: "Accessibility check" }, applies: "both", invocable: true,
          desc: { zh: "按 WCAG 2.1 AA 查一个页面：对比度、键盘、读屏、触控大小。", en: "Checks a page against WCAG 2.1 AA: contrast, keyboard, screen reader, touch size." },
          when: { zh: "页面要交付或改了交互时。", en: "Before a page ships, or after its interaction changed." },
          whenNot: { zh: "纯文字内容的修改。", en: "For text-only edits." },
          tools: ["read-file", "browser"], connectors: [],
          resources: [{ path: "references/checklist.md", role: "reference", bytes: 6400 }],
          excerpt: { zh: "逐条过检查表：先用键盘从头走一遍，再看每个控件有没有名字……", en: "Go through the checklist: first walk the page by keyboard, then check every control has a name…" },
          state: "auto", lastUsed: { at: "11-04 09:40", by: "coding" },
        },
        {
          id: "review", name: { zh: "设计评审", en: "Design review" }, applies: "assistant", invocable: true,
          desc: { zh: "从层级、一致性、可用性三方面给一份评审意见。", en: "Reviews a design for hierarchy, consistency and usability." },
          when: { zh: "拿到稿子或截图、要意见时。", en: "When you have a mock or screenshot and want feedback." },
          whenNot: { zh: "要直接改代码时。", en: "When you want code changed directly." },
          tools: ["read-file"], connectors: [],
          resources: [],
          excerpt: { zh: "先说最影响使用的三处，再说一致性……", en: "Lead with the three things that most affect use, then consistency…" },
          state: "auto",
        },
      ],
    },
    {
      id: "local", title: { zh: "从 Claude Code 导入", en: "Imported from Claude Code" }, version: "3", trust: "home_local", scope: "home",
      publisher: { zh: "这台电脑", en: "This computer" },
      skills: [
        {
          id: "commit", name: { zh: "提交说明写法", en: "Commit message style" }, applies: "coding", invocable: true,
          desc: { zh: "按团队的格式写提交说明：一句标题，空一行，写为什么改。", en: "Writes commit messages in the team format: one-line title, blank line, why." },
          when: { zh: "要提交代码时。", en: "When committing code." }, whenNot: { zh: "写发布说明时。", en: "For release notes." },
          tools: ["git-log"], connectors: [], resources: [],
          excerpt: { zh: "标题不超过 60 个字，用动词开头……", en: "Title under 60 characters, starting with a verb…" },
          state: "manual",
        },
        {
          id: "pdf", name: { zh: "PDF 工具", en: "PDF tools" }, applies: "both", invocable: true,
          desc: { zh: "合并、拆分 PDF，抽取表格。", en: "Merges and splits PDFs, extracts tables." },
          when: { zh: "要处理 PDF 文件时。", en: "When working with PDF files." }, whenNot: { zh: "只读 PDF 里的文字时。", en: "When you only need the text." },
          tools: ["bash"], connectors: [],
          resources: [{ path: "scripts/merge.sh", role: "script", bytes: 1800 }],
          excerpt: { zh: "用 qpdf 合并……", en: "Merge with qpdf…" },
          state: "off", unavailable: { reason: "native_only", detail: { zh: "要在本机直接跑命令", en: "needs to run commands on this computer" } },
        },
      ],
    },
    {
      id: "legal", title: { zh: "法务审阅", en: "Legal review" }, version: "0.9", trust: "pinned", scope: "project",
      publisher: { zh: "Lexa", en: "Lexa" },
      skills: [
        {
          id: "contract", name: { zh: "合同要点", en: "Contract essentials" }, applies: "assistant", invocable: true,
          desc: { zh: "列出合同里的付款、违约、期限和退出条款。", en: "Lists payment, breach, term and exit clauses in a contract." },
          when: { zh: "收到合同要先看要点时。", en: "When a contract arrives and you want the essentials first." }, whenNot: { zh: "要法律意见时。", en: "When you need legal advice." },
          tools: ["read-file"], connectors: [], resources: [],
          excerpt: { zh: "按四类条款各列一段……", en: "One paragraph for each of the four kinds of clause…" },
          state: "auto", unavailable: { reason: "plugin_disabled" },
        },
      ],
    },
  ],
  // Candidates found by the import scan (contract §6: skills.import.preview@1).
  importFrom: [
    { id: "claude", label: "Claude Code", path: "~/.claude/skills" },
    { id: "codex", label: "Codex", path: "~/.codex/skills" },
    { id: "project", label: { zh: "项目目录", en: "Project folder" }, path: "atlas/skills" },
  ],
  candidates: [
    { id: "commit", name: "commit-style", desc: { zh: "提交说明写法", en: "Commit message style" }, files: 1, bytes: 2100, compat: "portable", conflict: "commit" },
    { id: "review-pr", name: "review-pr", desc: { zh: "按清单审一个 PR", en: "Reviews a PR against a checklist" }, files: 3, bytes: 14200, compat: "portable" },
    { id: "pdf", name: "pdf-tools", desc: { zh: "合并、拆分 PDF，抽取表格", en: "Merges and splits PDFs, extracts tables" }, files: 4, bytes: 9800, compat: "native", why: { zh: "要在本机直接跑命令", en: "needs to run commands on this computer" }, scripts: true },
  ],
};
