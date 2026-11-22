// Batch-42 prototype: generating a skill from a real conversation, trying it on a known answer, comparing, adopting and restoring;
// customizing a general skill as your own (specs/skill-packs SKP-11, specs/proactive-assistant §5.9 / §6, BL-166).
// Fixed already (not asked again): the Skills catalog is batch 08's list + detail with three states; your own skills live in
// "My skills", signed on this computer (batch 41); writing starts from one sentence the assistant drafts (41, option B); a skill
// grants no permission; a round in progress keeps the version it started with.
// New and shared by all three options: a change is a DRAFT until you adopt it (nothing the AI uses changes before that); a draft
// keeps itself (no "unsaved changes" bar); a try-out is model-only with no tools, so it cannot change or send anything; a draft
// made from a conversation carries that conversation as a known-answer case and is replayed before it can be adopted.
// The three options differ in WHERE the improve loop (edit -> replay -> compare -> adopt) happens:
//   A  one column in the skill's detail, with tabs Edit / Try / Compare
//   B  edit on the left, try and compare on the right (tabs only on narrow screens)
//   C  in the assistant conversation: draft, replay and changes are cards; settings keep history and restore
// Every control is a component-board part from window.MW. Standalone review prototype: nothing is written anywhere.
(() => {
  const M = window.MW;
  const KEY = "molis-proto.skill-improvement.v1";
  const DEF = { opt: "B", flow: "gen", st: "normal", lang: "zh", theme: "light" };
  const LIMIT = { name: 80, desc: 1024, lines: 500, chars: 20000 };
  const T = {
    zh: {
      protoTitle: "技能的生成、试用与采用 · 原型", tbd: "待定", opt: "方案", optA: "A 详情里分页", optB: "B 左边改、右边试", optC: "C 在对话里改",
      flow: "看哪一段", f_gen: "从对话生成", f_trial: "试用", f_compare: "比较", f_adopt: "采用", f_restore: "恢复", f_custom: "改通用技能",
      state: "状态", st_normal: "正常", st_diff: "有出入／有新版", st_fail: "出错", lang: "语言", theme: "主题", light: "浅色", dark: "深色", reset: "重置",
      settings: "设置", tabPlugins: "插件", tabSkills: "技能", scopeLine: "项目：官网改版", lead: "技能是 AI 做某类事的固定做法。改动先是草稿，你采用了才生效。",
      newBtn: "新建技能", importBtn: "从本机导入", mine: "我的技能", mineMeta: "你写的 · 只在这台电脑", sys: "随系统自带", inst: "已安装",
      sOff: "关", sAuto: "自动", sManual: "仅手动", draftBadge: "草稿", howUse: "怎么用它", expOff: "关：AI 不用，你也不能点名", expAuto: "自动：AI 按任务自己选", expManual: "仅手动：只在你用 / 点名时用",
      ver: "第 {v} 版", w_assistant: "助理", w_coding: "Coding", w_both: "助理和 Coding", edit: "修改", copyMine: "改一份我的", back: "返回", backSkills: "技能",
      roT: "这个技能不是你写的，不能直接改。", roD: "可以改一份放进「我的技能」，原来那个不受影响。",
      // conversation
      chatTitle: "助理", me1: "把这周合进去的改动整理成发版说明，给客户看的那种。", ai1: "整理好了，按新功能、改进、修复分了三组（共 9 条）。",
      me2: "别写内部编号；要用户动手的改动单列在最前面。", ai2: "改好了：「导出改成按项目分文件」单列在最前，写了升级后要重新设置导出位置；去掉了编号。",
      me3: "可以。以后发版都这样做，存成技能吧。", ai3: "我把刚才的做法起草成了一个技能，还没生效。用你改定的这份发版说明回放了一遍。",
      ai3none: "这段对话里我只看到一次性的改写，看不出下次还能照着做的步骤，所以没有起草技能。你可以说说这类事一般怎么做，我再起草。",
      ai3improve: "按你刚才的两条意见，起草了「写发版说明」的改进版，现在生效的还是第 2 版。",
      rcSummary: "起草了技能「{n}」", rcText: "固定步骤 {s} · 可变参数 {p} · 要问你的 {q} · 还没生效", rcOpen: "打开草稿",
      rcImprove: "起草了「{n}」的改进（基于第 {v} 版）", rcImproveText: "改了 2 处 · 用你那次的结果回放：草稿一致，第 {v} 版有 1 处不同",
      composerPh: "告诉助理怎么改，例如：破坏性变更放最前", send: "发送", editInSettings: "在设置里改",
      // draft workspace
      draftOf: "「{n}」的草稿", draftNew: "新技能的草稿", basedOn: "基于第 {v} 版", fromChat: "从对话生成", fromRestore: "从第 {v} 版恢复", fromCustom: "基于「{n}」第 {v} 版 · {pack}",
      notLive: "草稿还没生效：AI 现在用的仍是{cur}。", notLiveNew: "草稿还没生效：采用之前 AI 用不到它。", curV: "第 {v} 版", saved: "草稿已存 · {at}", atNow: "刚刚",
      tEdit: "修改", tTry: "试用", tCompare: "比较",
      l_name: "名称", l_desc: "什么时候用它", h_desc: "AI 靠这段话决定要不要选它。", l_not: "什么时候不用（可选）", l_for: "给谁用", l_body: "怎么做", h_body: "写给 AI 的做法。固定步骤、可变参数和要问你的地方分开写。",
      count: "{l} / {ml} 行 · {c} / {mc} 字",
      askEdit: "告诉助理怎么改", askEditPh: "例如：不写内部编号；要用户动手的改动放最前", askEditGo: "改草稿", askEditBusy: "正在改…", askEdited: "助理改了 {n} 处", seeChange: "看改动",
      parts: "从对话里提取的", p_steps: "固定步骤 {n}", p_params: "可变参数 {n}", p_asks: "要问你的 {n}",
      ph: "换成你用的", phLead: "通用写法里的这些地方，换成你团队用的工具或叫法：", phInput: "例如：{x}", phLeft: "还有 {n} 处没换",
      // try
      cases: "已知答案", caseFromChat: "来自那次对话", caseMine: "你改定的结果", caseName: "0.9 版发版说明", caseInput: "要做的：把这周合进去的 9 个改动整理成给客户看的发版说明",
      addCase: "加一个已知答案", tryFree: "用一段材料试", tryLead: "回放只让模型读做法和材料、写出结果，不调任何工具：改不了项目里的东西，也不会发出去。",
      run: "回放", rerun: "再回放一次", running: "正在回放…", runCost: "{n} 次模型调用 · 用设置里的模型", runCostNew: "{n} 次模型调用 · 用设置里的模型",
      col_cur: "现在的第 {v} 版", col_draft: "草稿", row_assistant: "在助理里", row_coding: "在 Coding 里",
      v_match: "和你的结果一致", v_differs: "{n} 处不同", v_unknown: "判断不了", v_none: "还没回放", seeResult: "看结果",
      diffs: "不同的地方", d_number: "写了内部编号 #2078", d_order: "要用户动手的改动没有单列在最前",
      notRun: "这份草稿带着你那次的结果，回放一遍再采用。", staleRun: "草稿改过了，上次回放的是改之前的。",
      noModel: "还没有能用的文字模型，回放不了。", noModelGo: "去设置模型", keepDraft: "草稿还在，什么都没丢。",
      // compare
      cmpHow: "比较做法", cmpOut: "比较结果", cmpPick: "对照", cmpCurDraft: "第 {v} 版 → 草稿", cmpVerDraft: "第 {v} 版 → 草稿", cmpMineNew: "你的版本 → 原来的新版",
      cmpOutWhat: "{who}的回放 → 你的结果", cmpNoOld: "新技能还没有旧版本可比。看回放结果和你那次的差别：", same: "没有变化",
      stale: "草稿是在第 2 版上改的，现在已经是第 3 版了（{at}在另一处采用）。", staleWhat: "下面先对照第 3 版。采用会存成第 4 版，第 3 版的改动不会丢。",
      // adopt
      adoptNew: "采用为新技能", adoptVer: "采用为第 {v} 版", discard: "放弃草稿", adoptGate: "先回放",
      confirmT: "回放还有 {n} 处和你的结果不同：{d}。", confirmGo: "仍然采用", confirmBack: "回去改",
      adoptFail: "没能采用", adoptFailD: "草稿还在，现在生效的仍是第 {v} 版，什么都没变。", retry: "重试",
      replaceOrig: "采用后，原来的「{n}」改成关（你的版本代替它）",
      t_adoptNew: "「{n}」加进了我的技能，现在是关着的", turnAuto: "设成自动", t_adoptVer: "「{n}」现在是第 {v} 版，下一次用到时生效", t_discard: "放弃了草稿", undo: "撤销", t_back: "草稿回来了",
      t_restored: "「{n}」现在是第 {v} 版，做法同第 {r} 版", t_undoRestore: "回到了原来的做法（存为第 {v} 版）",
      // history
      history: "版本", h_live: "现在生效", h_at: "{at}采用", h_by_chat: "来自对话草稿", h_by_edit: "你改的", h_by_new: "你写的", h_by_restore: "恢复自第 {v} 版",
      h_cmp: "对比", h_restore: "恢复这一版", restoreFail: "没能恢复", restoreFailD: "草稿还在，现在生效的仍是第 {v} 版。",
      used: "用过", used_line: "采用后：助理用过 {a} 次，Coding 用过 {c} 次", used_none: "采用后还没被用过",
      // upstream
      upT: "原来的「{n}」有第 {v} 版了。", upD: "你的版本照旧在用，不会被换掉。", upSee: "看差在哪", upTake: "带进草稿", upLater: "先不管", t_upLater: "知道了，下次有新版再提醒",
      // samples
      relName: "写发版说明", relDesc: "要把一段时间合入的改动整理成给客户看的发版说明时用；你说「出发版说明」「写 release notes」时。", relNot: "内部周报；只要提交记录的时候。",
      notesName: "客户周会纪要", planName: "分析与决策", planMine: "分析与决策（我的）", uxName: "界面文字", planPack: "规划与拆解",
      planDesc: "从问题、证据和备选方案走到可追溯的决定。", phDocs: "~~文档库", phTracker: "~~项目管理工具", exDocs: "Notion", exTracker: "Linear",
      atDay: "3 天前", atWeek: "上周", atMinutes: "10 分钟前", t_sim: "原型：{x}", sim_settings: "打开模型设置", sim_import: "打开「从本机导入」", sim_case: "加已知答案：贴入要做的事和你认可的结果", sim_free: "选一段项目里的材料试用",
    },
    en: {
      protoTitle: "Generating, trying and adopting skills · prototype", tbd: "To decide", opt: "Option", optA: "A Tabs in the detail", optB: "B Edit left, try right", optC: "C Improve in the conversation",
      flow: "Show", f_gen: "From a conversation", f_trial: "Try", f_compare: "Compare", f_adopt: "Adopt", f_restore: "Restore", f_custom: "Customize a general skill",
      state: "State", st_normal: "Normal", st_diff: "Differs / newer version", st_fail: "Error", lang: "Language", theme: "Theme", light: "Light", dark: "Dark", reset: "Reset",
      settings: "Settings", tabPlugins: "Plugins", tabSkills: "Skills", scopeLine: "Project: Website redesign", lead: "A skill is a fixed way for AI to do one kind of work. A change stays a draft until you adopt it.",
      newBtn: "New skill", importBtn: "Import from this computer", mine: "My skills", mineMeta: "Written by you · this computer only", sys: "Comes with the system", inst: "Installed",
      sOff: "Off", sAuto: "Auto", sManual: "Manual only", draftBadge: "Draft", howUse: "How to use it", expOff: "Off: AI doesn't use it and you can't name it", expAuto: "Auto: AI picks it when a task fits", expManual: "Manual only: used only when you name it with /",
      ver: "Version {v}", w_assistant: "Assistant", w_coding: "Coding", w_both: "Assistant and Coding", edit: "Edit", copyMine: "Make my own copy", back: "Back", backSkills: "Skills",
      roT: "You didn't write this skill, so it can't be edited directly.", roD: "Make a copy under My skills; the original stays as it is.",
      chatTitle: "Assistant", me1: "Turn this week's merged changes into release notes for customers.", ai1: "Done: three groups — new, improved, fixed (9 items).",
      me2: "No internal numbers; put changes users must act on first, on their own.", ai2: "Updated: “Exports are now one file per project” leads, with what to reset after upgrading; numbers removed.",
      me3: "Good. Do releases like this from now on — save it as a skill.", ai3: "I drafted a skill from what we just did; it isn't in use yet. I replayed it on the release notes you settled on.",
      ai3none: "This conversation only had a one-off rewrite; I can't see steps you'd repeat next time, so I didn't draft a skill. Tell me how this kind of work usually goes and I'll draft one.",
      ai3improve: "From your two comments I drafted an improvement of “Write release notes”; version 2 is still the one in use.",
      rcSummary: "Drafted the skill “{n}”", rcText: "{s} fixed steps · {p} parameters · {q} place to ask you · not in use yet", rcOpen: "Open the draft",
      rcImprove: "Drafted an improvement of “{n}” (from version {v})", rcImproveText: "2 changes · replayed on your result: the draft matches, version {v} differs in 1 place",
      composerPh: "Tell the assistant what to change, e.g. breaking changes first", send: "Send", editInSettings: "Edit in Settings",
      draftOf: "Draft of “{n}”", draftNew: "Draft of a new skill", basedOn: "From version {v}", fromChat: "From a conversation", fromRestore: "Restoring version {v}", fromCustom: "From “{n}” version {v} · {pack}",
      notLive: "Not in use yet: AI still uses {cur}.", notLiveNew: "Not in use yet: AI can't use it until you adopt it.", curV: "version {v}", saved: "Draft kept · {at}", atNow: "just now",
      tEdit: "Edit", tTry: "Try", tCompare: "Compare",
      l_name: "Name", l_desc: "When to use it", h_desc: "AI decides from this whether to pick it.", l_not: "When not to use it (optional)", l_for: "For", l_body: "How to do it", h_body: "The method, written for AI. Keep fixed steps, parameters and the places to ask you apart.",
      count: "{l} / {ml} lines · {c} / {mc} characters",
      askEdit: "Tell the assistant what to change", askEditPh: "e.g. no internal numbers; changes users must act on go first", askEditGo: "Change the draft", askEditBusy: "Changing…", askEdited: "The assistant changed {n} places", seeChange: "See the changes",
      parts: "Taken from the conversation", p_steps: "{n} fixed steps", p_params: "{n} parameters", p_asks: "{n} place to ask you",
      ph: "Use your own names", phLead: "These spots in the general method stand for a tool; put the one your team uses:", phInput: "e.g. {x}", phLeft: "{n} left to fill",
      cases: "Known answers", caseFromChat: "From that conversation", caseMine: "The result you settled on", caseName: "Release notes 0.9", caseInput: "The task: turn this week's 9 merged changes into release notes for customers",
      addCase: "Add a known answer", tryFree: "Try on some material", tryLead: "A replay only lets the model read the method and the material and write a result. No tools are called: nothing in the project can change and nothing is sent.",
      run: "Replay", rerun: "Replay again", running: "Replaying…", runCost: "{n} model calls · the model in Settings", runCostNew: "{n} model calls · the model in Settings",
      col_cur: "Version {v} now", col_draft: "Draft", row_assistant: "In the assistant", row_coding: "In Coding",
      v_match: "Matches your result", v_differs: "{n} differences", v_unknown: "Can't tell", v_none: "Not replayed", seeResult: "See the result",
      diffs: "Where it differs", d_number: "It wrote the internal number #2078", d_order: "Changes users must act on aren't first",
      notRun: "This draft carries your result from that conversation; replay it once before adopting.", staleRun: "The draft changed since the last replay.",
      noModel: "No text model is set up, so it can't replay.", noModelGo: "Set up a model", keepDraft: "The draft is still here; nothing was lost.",
      cmpHow: "Compare the method", cmpOut: "Compare results", cmpPick: "Compare", cmpCurDraft: "Version {v} → draft", cmpVerDraft: "Version {v} → draft", cmpMineNew: "Your version → the original's new one",
      cmpOutWhat: "{who} replay → your result", cmpNoOld: "A new skill has no earlier version. Here is how the replay differs from yours:", same: "No change",
      stale: "The draft was made on version 2; version 3 is now in use (adopted elsewhere {at}).", staleWhat: "Compared with version 3 below. Adopting saves version 4; version 3's changes aren't lost.",
      adoptNew: "Adopt as a new skill", adoptVer: "Adopt as version {v}", discard: "Discard draft", adoptGate: "Replay first",
      confirmT: "The replay still differs from your result in {n} place: {d}.", confirmGo: "Adopt anyway", confirmBack: "Keep editing",
      adoptFail: "Couldn't adopt", adoptFailD: "The draft is still here and version {v} is still in use; nothing changed.", retry: "Retry",
      replaceOrig: "After adopting, turn the original “{n}” off (yours takes its place)",
      t_adoptNew: "“{n}” is in My skills and still off", turnAuto: "Set to auto", t_adoptVer: "“{n}” is now version {v}; it applies the next time it's used", t_discard: "Draft discarded", undo: "Undo", t_back: "The draft is back",
      t_restored: "“{n}” is now version {v}, with version {r}'s method", t_undoRestore: "Back to the previous method (saved as version {v})",
      history: "Versions", h_live: "In use", h_at: "adopted {at}", h_by_chat: "from a conversation draft", h_by_edit: "your edit", h_by_new: "written by you", h_by_restore: "restored from version {v}",
      h_cmp: "Compare", h_restore: "Restore this one", restoreFail: "Couldn't restore", restoreFailD: "The draft is still here; version {v} is still in use.",
      used: "Used", used_line: "Since adopting: the assistant used it {a} times, Coding {c} times", used_none: "Not used since adopting",
      upT: "The original “{n}” has a version {v}.", upD: "Yours stays in use; it won't be replaced.", upSee: "See what differs", upTake: "Bring into a draft", upLater: "Not now", t_upLater: "OK — you'll hear again when there's another version",
      relName: "Write release notes", relDesc: "Use when a stretch of merged changes needs to become customer-facing release notes; when you say “release notes”.", relNot: "Internal weekly reviews; when you only want the commit list.",
      notesName: "Client weekly notes", planName: "Analyze and decide", planMine: "Analyze and decide (mine)", uxName: "UX copy", planPack: "Planning and breakdown",
      planDesc: "Turn questions, evidence and alternatives into a traceable decision.", phDocs: "~~document library", phTracker: "~~project tracker", exDocs: "Notion", exTracker: "Linear",
      atDay: "3 days ago", atWeek: "last week", atMinutes: "10 minutes ago", t_sim: "Prototype: {x}", sim_settings: "opens model settings", sim_import: "opens Import from this computer", sim_case: "add a known answer: paste the task and the result you accept", sim_free: "pick some project material to try on",
    },
  };
  const B = (zh, en) => ({ zh, en });
  const BODY = {
    v1: B("# 写发版说明\n\n1. 读这段时间合入的改动。\n2. 每条写清改了什么。\n3. 按新功能、改进、修复分组。",
      "# Write release notes\n\n1. Read the changes merged in this stretch.\n2. Say what each one changed.\n3. Group them: new, improved, fixed."),
    v2: B("# 写发版说明\n\n## 先弄清\n- 版本号或时间范围：没说就问。\n- 读者：默认给客户。\n\n## 步骤\n1. 读这段时间合入的改动。\n2. 每条先写用户能感到的变化，再写一句为什么。\n3. 按新功能、改进、修复分组。\n\n## 不确定时\n- 看不懂的改动标出来，不编。",
      "# Write release notes\n\n## Find out first\n- Version or time range: ask if not given.\n- Readers: customers unless told otherwise.\n\n## Steps\n1. Read the changes merged in this stretch.\n2. For each, say what users will notice, then one line on why.\n3. Group them: new, improved, fixed.\n\n## When unsure\n- Mark changes you can't follow; don't make things up."),
    v3: B("# 写发版说明\n\n## 先弄清\n- 版本号或时间范围：没说就问。\n- 读者：默认给客户。\n\n## 步骤\n1. 读这段时间合入的改动。\n2. 要用户动手的改动单列在最前，写清要做什么。\n3. 其余每条先写用户能感到的变化，再写一句为什么。\n4. 按新功能、改进、修复分组。\n5. 不写内部编号、分支名和人名。\n\n## 要问你的\n- 有改动要不要暂不对外说：拿不准就列出来问你。\n\n## 不确定时\n- 看不懂的改动标出来，不编。",
      "# Write release notes\n\n## Find out first\n- Version or time range: ask if not given.\n- Readers: customers unless told otherwise.\n\n## Steps\n1. Read the changes merged in this stretch.\n2. Put changes users must act on first, on their own, with what to do.\n3. For the rest, say what users will notice, then one line on why.\n4. Group them: new, improved, fixed.\n5. No internal numbers, branch names or people's names.\n\n## Ask the person\n- Whether a change should stay unannounced: list the doubtful ones and ask.\n\n## When unsure\n- Mark changes you can't follow; don't make things up."),
    plan: B("# 分析与决策\n\n## 规划路径\n1. 明确决策问题和成功标准\n2. 到 ~~文档库 里找相关的旧决定\n3. 形成可比较的方案\n4. 把决定和理由记进 ~~项目管理工具，设复审日期",
      "# Analyze and decide\n\n## Planning path\n1. Define the decision and success criteria\n2. Look for earlier decisions in ~~document library\n3. Develop comparable choices\n4. Record the decision and reasons in ~~project tracker, with a review date"),
    plan2: B("# 分析与决策\n\n## 规划路径\n1. 明确决策问题和成功标准\n2. 到 ~~文档库 里找相关的旧决定\n3. 列出每个方案的代价和风险\n4. 形成可比较的方案\n5. 把决定和理由记进 ~~项目管理工具，设复审日期",
      "# Analyze and decide\n\n## Planning path\n1. Define the decision and success criteria\n2. Look for earlier decisions in ~~document library\n3. List each choice's cost and risk\n4. Develop comparable choices\n5. Record the decision and reasons in ~~project tracker, with a review date"),
  };
  const OUT = {
    expected: B("## 需要你处理\n- 导出改成按项目分文件：升级后请重新设置导出位置。\n\n## 新功能\n- 能在设置里写自己的技能，说一句话就能起草。\n- 搜索能按时间范围筛选。\n\n## 改进\n- 打开大项目快了一倍。",
      "## Action needed\n- Exports are now one file per project: set the export location again after upgrading.\n\n## New\n- Write your own skills in Settings; one sentence drafts one.\n- Filter search by time range.\n\n## Improved\n- Large projects open twice as fast."),
    v2: B("## 新功能\n- 能在设置里写自己的技能（#2078）。\n- 搜索能按时间范围筛选。\n\n## 改进\n- 打开大项目快了一倍。\n- 导出改成按项目分文件。",
      "## New\n- Write your own skills in Settings (#2078).\n- Filter search by time range.\n\n## Improved\n- Large projects open twice as fast.\n- Exports are now one file per project."),
    draftOff: B("## 需要你处理\n- 导出改成按项目分文件：升级后请重新设置导出位置。\n\n## 新功能\n- 能在设置里写自己的技能（#2078），说一句话就能起草。\n- 搜索能按时间范围筛选。\n\n## 改进\n- 打开大项目快了一倍。",
      "## Action needed\n- Exports are now one file per project: set the export location again after upgrading.\n\n## New\n- Write your own skills in Settings (#2078); one sentence drafts one.\n- Filter search by time range.\n\n## Improved\n- Large projects open twice as fast."),
  };
  const seed = () => ({
    skills: [
      { id: "rel", pack: "mine", v: 2, state: "auto", applies: "both", name: "relName", desc: "relDesc", not: "relNot", body: "v2",
        versions: [{ v: 2, at: "atDay", by: "h_by_chat" }, { v: 1, at: "atWeek", by: "h_by_new" }], uses: { a: 4, c: 1 } },
      { id: "notes", pack: "mine", v: 2, state: "auto", applies: "assistant", name: "notesName", desc: "relDesc", body: "v1", versions: [{ v: 2, at: "atWeek", by: "h_by_edit" }, { v: 1, at: "atWeek", by: "h_by_new" }], uses: { a: 2, c: 0 } },
      { id: "plan", pack: "plan", v: 1, state: "auto", applies: "assistant", name: "planName", desc: "planDesc", body: "plan", versions: [{ v: 1, at: "atWeek", by: "sys" }] },
      { id: "ux", pack: "design", v: 1, state: "off", applies: "both", name: "uxName", desc: "planDesc", body: "plan", versions: [{ v: 1, at: "atWeek", by: "inst" }] },
    ],
  });
  const clone = (x) => JSON.parse(JSON.stringify(x));
  let P = clone(DEF), D = seed();
  try { Object.assign(P, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* A private window keeps nothing; the prototype starts from its defaults. */ }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch { /* Same: nothing kept. */ } };

  const t = (k, v) => (T[P.lang][k] ?? k).replace(/\{(\w+)\}/g, (_, n) => (v && v[n] != null ? v[n] : ""));
  const L = (o) => (o && typeof o === "object" ? o[P.lang] : o) ?? "";
  const esc = M.escapeHtml;
  const act = (a, v) => Object.assign({ "data-act": a }, v != null ? { "data-v": v } : {});
  const btn = (label, o = {}) => M.renderButton({ label, variant: o.variant || "secondary", size: o.size, icon: o.icon, disabled: o.disabled, attrs: o.attrs });
  const mark = (name) => `<span class="mw-mark sk-mark" aria-hidden="true">${M.icon(name)}</span>`;
  const WORD = { off: "sOff", auto: "sAuto", manual: "sManual" };
  const stateMark = (st) => M.renderStatusMark({ label: t(WORD[st]), tone: st === "off" ? "quiet" : "idle", state: st === "off" ? "paused" : "ready" });
  const find = (id) => D.skills.find((s) => s.id === id);
  const body = (key) => L(BODY[key]);
  const lines = (s) => (s ? s.split("\n").length : 0);

  /* ---------- a line comparison, as the platform's compareTexts gives it ---------- */
  function diffRows(a, b) {
    const x = a.split("\n"), y = b.split("\n"), n = x.length, m = y.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const rows = []; let i = 0, j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && x[i] === y[j]) { rows.push({ kind: "equal", b: i + 1, a: j + 1, text: x[i] }); i++; j++; }
      else if (i < n && (j >= m || dp[i + 1][j] >= dp[i][j + 1])) { rows.push({ kind: "delete", b: i + 1, text: x[i] }); i++; }
      else { rows.push({ kind: "insert", a: j + 1, text: y[j] }); j++; }
    }
    return rows;
  }
  const changes = (a, b) => diffRows(a, b).filter((r) => r.kind !== "equal").length;
  // The markup of the SDK's renderDiff (unified rows): the product draws it with that function.
  function diffView(a, b) {
    const rows = diffRows(a, b), digits = String(Math.max(lines(a), lines(b))).length;
    if (!rows.some((r) => r.kind !== "equal")) return `<p class="im-same">${M.icon("check")}${esc(t("same"))}</p>`;
    const sign = (k) => `<span class="mw-diff-sign">${k === "insert" ? "+" : k === "delete" ? "−" : " "}</span>`;
    return `<section class="mw-diff im-diff" data-phase="ready" data-mode="unified"><ol class="mw-diff-rows" style="--diff-digits:${digits}">${rows.map((r) =>
      `<li data-kind="${r.kind}"><span class="mw-diff-before">${r.b ?? ""}</span><span class="mw-diff-after">${r.a ?? ""}</span><code>${sign(r.kind)}${esc(r.text)}</code></li>`).join("")}</ol></section>`;
  }

  /* ---------- per-flow starting point ---------- */
  // ui.view: "chat" | "detail" | "draft". ui.draft is the one draft open; ui.tab is the draft's tab (A / narrow B).
  function freshUi() {
    const u = { view: "detail", sel: "rel", tab: "edit", side: "try", draft: null, runs: null, running: false, confirm: false, fail: false, cmp: "how", asked: null, upLater: false, anim: false, last: null };
    const f = P.flow;
    if (f === "gen") { u.view = "chat"; u.draft = genDraft(); }
    if (f === "trial" || f === "compare" || f === "adopt") {
      u.view = P.opt === "C" ? "chat" : "draft"; u.draft = improveDraft();
      u.tab = f === "compare" ? "compare" : "try"; u.side = f === "compare" ? "compare" : "try";
      if (f !== "trial" || P.st !== "fail") u.runs = runsFor(u.draft);
    }
    if (f === "restore") { const s = find("rel"); s.v = 3; s.body = "v3"; s.versions.unshift({ v: 3, at: "atNow", by: "h_by_chat" }); u.view = "detail"; }
    if (f === "custom") {
      if (P.st === "diff") { D.skills.splice(1, 0, { id: "mine-plan", pack: "mine", v: 1, state: "auto", applies: "assistant", name: "planMine", desc: "planDesc", body: "planMine", base: { id: "plan", v: 1 },
        versions: [{ v: 1, at: "atWeek", by: "h_by_edit" }], uses: { a: 3, c: 0 } }); find("plan").v = 2; find("plan").state = "off"; u.sel = "mine-plan"; }
      else u.sel = "plan";
    }
    return u;
  }
  BODY.planMine = B(BODY.plan.zh.replace("~~文档库", "Notion").replace("~~项目管理工具", "Linear").replace("# 分析与决策", "# 分析与决策（我的）"),
    BODY.plan.en.replace("~~document library", "Notion").replace("~~project tracker", "Linear").replace("# Analyze and decide", "# Analyze and decide (mine)"));
  function genDraft() {
    return { skill: null, base: null, from: "chat", name: t("relName"), desc: t("relDesc"), not: t("relNot"), applies: "both", body: body("v3"), rev: 1, ranRev: null, hasCase: true };
  }
  function improveDraft() {
    const s = find("rel");
    return { skill: "rel", base: s.v, from: "chat", name: t(s.name), desc: t(s.desc), not: t(s.not), applies: s.applies, body: body("v3"), rev: 1, ranRev: null, hasCase: true };
  }
  function restoreDraft(v) {
    const s = find("rel");
    return { skill: "rel", base: s.v, from: "restore", restoring: v, name: t(s.name), desc: t(s.desc), not: t(s.not), applies: s.applies, body: body("v" + v), rev: 1, ranRev: null, hasCase: false };
  }
  function customDraft(fromNew) {
    const s = find("plan");
    return { skill: null, base: null, from: "custom", custom: { id: "plan", v: s.v }, name: t("planMine"), desc: t(s.desc), not: "", applies: s.applies,
      body: fromNew ? body("plan2").replace("# 分析与决策", "# 分析与决策（我的）").replace("# Analyze and decide", "# Analyze and decide (mine)") : body("plan").replace("# 分析与决策", "# 分析与决策（我的）").replace("# Analyze and decide", "# Analyze and decide (mine)"),
      fills: { docs: "", tracker: "" }, replaceOrig: true, rev: 1, ranRev: null, hasCase: false };
  }
  // A replay's verdicts: the draft matches (or, in "differs", still has one difference); the version in use has two.
  function runsFor(d) {
    const differs = P.st === "diff";
    const draft = differs ? { verdict: "differs", diffs: ["d_number"], out: "draftOff" } : { verdict: "match", diffs: [], out: "expected" };
    const cur = d.skill ? { verdict: "differs", diffs: ["d_number", "d_order"], out: "v2" } : null;
    d.ranRev = d.rev;
    return { assistant: { cur, draft }, coding: { cur: cur && { ...cur, diffs: ["d_number"] }, draft: { ...draft } } };
  }
  let ui = freshUi();

  /* ---------- conversation ---------- */
  const me = (k) => `<div class="sel-me"><div class="bub">${esc(t(k))}</div></div>`;
  const ai = (k) => `<div class="sel-reply"><p>${esc(t(k))}</p></div>`;
  function receipt() {
    // The platform's action-result receipt (ActionResultView): summary, text, one link. Drawn by the assistant for any action.
    const d = ui.draft, improve = !!d.skill;
    const title = improve ? t("rcImprove", { n: d.name, v: d.base }) : t("rcSummary", { n: d.name });
    const text = improve ? t("rcImproveText", { v: d.base }) : t("rcText", { s: 5, p: 2, q: 1 });
    return `<div class="im-receipt">${mark("sparkles")}<div class="im-receipt__text"><strong>${esc(title)}</strong><small>${esc(text)}</small></div>${btn(t("rcOpen"), { size: "sm", icon: "arrow", attrs: act("open-draft") })}</div>`;
  }
  // C: the draft lives in the conversation as a card; replay, changes and adoption happen on it.
  function draftCard() {
    const d = ui.draft, r = ui.runs, improve = !!d.skill;
    const head = `<header class="im-card__head">${mark("sparkles")}<div class="im-card__title"><strong>${esc(improve ? t("draftOf", { n: d.name }) : t("draftNew"))}</strong><small>${esc(improve ? t("notLive", { cur: t("curV", { v: d.base }) }) : t("notLiveNew"))}</small></div>${M.renderBadge({ label: t("draftBadge"), tone: "info" })}</header>`;
    const parts = improve ? "" : partsLine();
    const full = `<details class="mw-collapsible im-card__more" data-slot="collapsible"><summary>${esc(improve ? t("cmpHow") + " · " + t("cmpCurDraft", { v: d.base }) : t("l_body"))}</summary><div class="mw-collapsible__body">${improve ? diffView(body("v" + d.base), d.body) : `<pre class="im-pre">${esc(d.body)}</pre>`}</div></details>`;
    const shown = r && ui.out ? (() => { const [e, c] = ui.out.split(":"), cell = r[e][c];
      return `<p class="im-cmp-what">${esc(t("cmpOutWhat", { who: (c === "cur" ? t("col_cur", { v: d.base }) : t("col_draft")) + " · " + t("row_" + e) }))}</p>${diffView(L(OUT[cell.out]), L(OUT.expected))}`; })() : "";
    const results = r ? trialGrid() + shown : `<p class="im-note">${M.icon("info")}${esc(t("notRun"))}</p>`;
    const more = `<div class="sk-actions sk-actions--start">${btn(t("editInSettings"), { size: "sm", variant: "ghost", icon: "edit", attrs: act("edit-in-settings") })}</div>`;
    return `<div class="im-card">${head}${parts}${full}${results}${more}${adoptBar(true)}</div>`;
  }
  function chat() {
    const d = ui.draft;
    const gen = P.flow === "gen";
    const none = gen && P.st === "fail";
    const lastAi = none ? ai("ai3none") : `<div class="sel-reply"><p>${esc(t(gen ? "ai3" : "ai3improve"))}</p>${P.opt === "C" ? draftCard() : receipt()}</div>`;
    const thread = `${me("me1")}${ai("ai1")}${me("me2")}${ai("ai2")}${me("me3")}${d || none ? lastAi : ""}`;
    const composer = `<div class="sel-composer"><div class="sel-inrow">${M.renderTextarea({ placeholder: t("composerPh"), rows: 1, attrs: { "aria-label": t("composerPh"), id: "im-chat" } })}${btn(t("send"), { variant: "primary", icon: "send", attrs: act(P.opt === "C" && d ? "ask-edit-chat" : "sim", "send") })}</div></div>`;
    return `<section class="proto-sheet sel-sheet im-chat"><header class="sel-head">${esc(t("chatTitle"))}<small>${esc(t("scopeLine"))}</small></header><div class="sel-thread">${thread}</div>${composer}</section>`;
  }

  /* ---------- draft workspace ---------- */
  const partsLine = () => `<p class="im-parts"><span>${esc(t("parts"))}</span>${M.renderBadge({ label: t("p_steps", { n: 5 }), tone: "neutral" })}${M.renderBadge({ label: t("p_params", { n: 2 }), tone: "neutral" })}${M.renderBadge({ label: t("p_asks", { n: 1 }), tone: "neutral" })}</p>`;
  function draftHead() {
    const d = ui.draft;
    const origin = d.from === "chat" ? t("fromChat") : d.from === "restore" ? t("fromRestore", { v: d.restoring }) : d.from === "custom" ? t("fromCustom", { n: t("planName"), v: d.custom.v, pack: t("sys") }) : t("h_by_edit");
    const title = d.skill ? t("draftOf", { n: t(find(d.skill).name) }) : d.from === "custom" ? t("draftOf", { n: d.name }) : t("draftNew");
    const live = d.skill ? t("notLive", { cur: t("curV", { v: find(d.skill).v }) }) : t("notLiveNew");
    const back = `<button type="button" class="mw-btn mw-btn--ghost mw-btn--sm im-back" data-act="close-draft">${M.icon("chevron-left")}<span data-slot="button-label">${esc(t("backSkills"))}</span></button>`;
    return `<header class="im-head">${back}<div class="im-head__row"><h3 tabindex="-1">${esc(title)}</h3>${M.renderBadge({ label: t("draftBadge"), tone: "info" })}${d.base ? M.renderBadge({ label: t("basedOn", { v: d.base }), tone: "neutral" }) : ""}</div>
      <p class="im-live">${M.icon("shield")}<span>${esc(live)}</span><span class="im-dot">·</span><span>${esc(origin)}</span><span class="im-dot">·</span><span class="sk-muted sk-small">${esc(t("saved", { at: t("atNow") }))}</span></p></header>`;
  }
  function editor() {
    const d = ui.draft;
    const fld = (key, label, control, hint) => `<div class="au-field"><label for="im-${key}">${esc(label)}</label>${control}${hint ? `<small>${esc(hint)}</small>` : ""}</div>`;
    const whom = `<div class="au-field"><span class="au-label">${esc(t("l_for"))}</span>${M.renderToggleGroup({ label: t("l_for"), items: ["assistant", "coding", "both"].map((v) => ({ value: v, label: t("w_" + v), current: d.applies === v, attrs: act("applies", v) })) })}</div>`;
    const ask = `<div class="im-ask"><label for="im-ask">${M.icon("sparkles")}${esc(t("askEdit"))}</label><div class="im-ask__row"><input class="mw-input" data-slot="input" id="im-ask" placeholder="${esc(t("askEditPh"))}"${ui.asked === "busy" ? " disabled" : ""}>${ui.asked === "busy" ? M.renderStatusMark({ label: t("askEditBusy"), tone: "progress", state: "running" }) : btn(t("askEditGo"), { size: "sm", attrs: act("ask-edit") })}</div>
      ${typeof ui.asked === "number" ? `<p class="im-asked">${M.renderBadge({ label: t("askEdited", { n: ui.asked }), tone: "info" })}${btn(t("seeChange"), { size: "sm", variant: "link", attrs: act("tab", "compare") })}</p>` : ""}</div>`;
    const ph = d.from === "custom" ? placeholders() : "";
    const parts = d.from === "chat" && !d.skill ? partsLine() : "";
    const count = `<div class="au-count"><span>${esc(t("h_body"))}</span><span id="im-count">${esc(t("count", { l: lines(d.body), ml: LIMIT.lines, c: d.body.length, mc: LIMIT.chars }))}</span></div>`;
    return `<div class="im-editor">${ask}${parts}${ph}${fld("name", t("l_name"), `<input class="mw-input" data-slot="input" id="im-name" data-f="name" value="${esc(d.name)}">`)}
      ${fld("desc", t("l_desc"), `<textarea class="mw-textarea" data-slot="textarea" id="im-desc" data-f="desc" rows="3">${esc(d.desc)}</textarea>`, t("h_desc"))}
      ${fld("not", t("l_not"), `<textarea class="mw-textarea" data-slot="textarea" id="im-not" data-f="not" rows="2">${esc(d.not)}</textarea>`)}${whom}
      <div class="au-field"><label for="im-body">${esc(t("l_body"))}</label><textarea class="mw-textarea au-body" data-slot="textarea" id="im-body" data-f="body" rows="16">${esc(d.body)}</textarea>${count}</div></div>`;
  }
  function placeholders() {
    const d = ui.draft, left = ["docs", "tracker"].filter((k) => !d.fills[k].trim()).length;
    const row = (k, label, ex) => `<li><code>${esc(t(label))}</code>${M.icon("arrow")}<input class="mw-input" data-slot="input" data-fill="${k}" value="${esc(d.fills[k])}" placeholder="${esc(t("phInput", { x: t(ex) }))}" aria-label="${esc(t(label))}"></li>`;
    return `<section class="im-ph"><h4>${esc(t("ph"))}${left ? M.renderBadge({ label: t("phLeft", { n: left }), tone: P.st === "fail" ? "warning" : "neutral" }) : ""}</h4><p class="sk-muted sk-small">${esc(t("phLead"))}</p><ul>${row("docs", "phDocs", "exDocs")}${row("tracker", "phTracker", "exTracker")}</ul>
      ${M.renderCheckbox({ label: t("replaceOrig", { n: t("planName") }), checked: d.replaceOrig, attrs: { "data-act": "replace-orig" } })}</section>`;
  }
  const VERDICT = { match: { tone: "done", state: "done" }, differs: { tone: "attention", state: "verify" }, unknown: { tone: "quiet", state: "paused" } };
  const verdictMark = (cell) => !cell ? M.renderStatusMark({ label: t("v_none"), tone: "quiet", state: "idle" })
    : M.renderStatusMark({ label: cell.verdict === "match" ? t("v_match") : cell.verdict === "differs" ? t("v_differs", { n: cell.diffs.length }) : t("v_unknown"), ...VERDICT[cell.verdict] });
  function trialGrid() {
    const d = ui.draft, r = ui.runs, cols = d.skill ? ["cur", "draft"] : ["draft"];
    const entries = d.applies === "both" ? ["assistant", "coding"] : [d.applies];
    const stale = d.ranRev !== d.rev ? `<p class="im-note">${M.icon("refresh")}${esc(t("staleRun"))}</p>` : "";
    const head = `<div class="im-grid__row im-grid__head"><span></span>${cols.map((c) => `<span>${esc(c === "cur" ? t("col_cur", { v: d.base }) : t("col_draft"))}</span>`).join("")}</div>`;
    const rows = entries.map((e) => `<div class="im-grid__row"><span class="im-grid__entry">${M.icon(e === "coding" ? "code" : "message")}${esc(t("row_" + e))}</span>${cols.map((c) => {
      const cell = r[e][c];
      const list = cell && cell.diffs.length ? `<ul class="im-diffs">${cell.diffs.map((k) => `<li>${esc(t(k))}</li>`).join("")}</ul>` : "";
      return `<div class="im-cell" data-verdict="${cell ? cell.verdict : "none"}"><span class="im-cell__col">${esc(c === "cur" ? t("col_cur", { v: d.base }) : t("col_draft"))}</span>${verdictMark(cell)}${list}${cell ? btn(t("seeResult"), { size: "sm", variant: "link", attrs: act("see-out", e + ":" + c) }) : ""}</div>`;
    }).join("")}</div>`).join("");
    return `<div class="im-grid" style="--im-cols:${cols.length}">${stale}${head}${rows}</div>`;
  }
  function tryPanel() {
    const d = ui.draft, entries = d.applies === "both" ? 2 : 1, calls = entries * (d.skill ? 2 : 1) + 1;
    const caseCard = d.hasCase ? `<li class="im-case">${mark("completed")}<div class="im-case__text"><strong>${esc(t("caseName"))}</strong><small>${esc(t("caseFromChat"))} · ${esc(t("caseMine"))}</small><small class="im-case__in">${esc(t("caseInput"))}</small></div></li>` : "";
    const cases = `<section class="im-sec"><h4>${esc(t("cases"))}</h4>${caseCard ? `<ul class="im-cases">${caseCard}</ul>` : ""}<div class="sk-actions sk-actions--start">${btn(t("addCase"), { size: "sm", icon: "plus", attrs: act("sim", "case") })}${btn(t("tryFree"), { size: "sm", variant: "ghost", icon: "file", attrs: act("sim", "free") })}</div></section>`;
    const noModel = P.flow === "trial" && P.st === "fail";
    const runRow = noModel ? `<div class="mw-alert mw-alert--warning" data-slot="alert" role="alert"><strong>${esc(t("noModel"))}</strong><p>${esc(t("keepDraft"))}</p><div class="sk-alert-actions">${btn(t("noModelGo"), { size: "sm", attrs: act("sim", "settings") })}</div></div>`
      : `<div class="im-run">${ui.running ? M.renderStatusMark({ label: t("running"), tone: "progress", state: "running" }) : btn(ui.runs ? t("rerun") : t("run"), { variant: ui.runs && d.ranRev === d.rev ? "secondary" : "primary", icon: "play", attrs: act("run") })}<span class="sk-muted sk-small">${esc(t("runCost", { n: calls }))}</span></div>`;
    return `<div class="im-try"><p class="im-lead">${M.icon("shield")}<span>${esc(t("tryLead"))}</span></p>${cases}${runRow}${ui.runs ? trialGrid() : ""}</div>`;
  }
  function comparePanel() {
    const d = ui.draft;
    const seg = M.renderToggleGroup({ label: t("cmpPick"), items: [["how", t("cmpHow")], ["out", t("cmpOut")]].map(([v, label]) => ({ value: v, label, current: ui.cmp === v, attrs: act("cmp", v) })) });
    const stale = P.flow === "compare" && P.st === "fail" && d.skill ? `<div class="mw-alert mw-alert--warning" data-slot="alert" role="status"><strong>${esc(t("stale", { at: t("atMinutes") }))}</strong><p>${esc(t("staleWhat"))}</p></div>` : "";
    if (ui.cmp === "out") {
      const which = ui.out || "assistant:draft", [e, c] = which.split(":"), cell = ui.runs?.[e]?.[c];
      if (!cell) return `<div class="im-compare">${seg}${tryPanelHint()}</div>`;
      return `<div class="im-compare">${seg}<p class="im-cmp-what">${esc(t("cmpOutWhat", { who: (c === "cur" ? t("col_cur", { v: d.base }) : t("col_draft")) + " · " + t("row_" + e) }))}</p>${diffView(L(OUT[cell.out]), L(OUT.expected))}</div>`;
    }
    if (d.from === "custom") return `<div class="im-compare">${seg}<p class="im-cmp-what">${esc(t("cmpVerDraft", { v: d.custom.v }) + " · " + t("planName"))}</p>${diffView(body(d.custom.v === 2 ? "plan2" : "plan"), d.body)}</div>`;
    if (!d.skill) return `<div class="im-compare">${seg}<p class="im-cmp-what">${esc(t("cmpNoOld"))}</p>${ui.runs ? diffView(L(OUT[ui.runs.assistant.draft.out]), L(OUT.expected)) : tryPanelHint()}</div>`;
    const base = stale ? "v3" : "v" + find(d.skill).v;
    return `<div class="im-compare">${stale}${seg}<p class="im-cmp-what">${esc(t("cmpCurDraft", { v: base.slice(1) }))}</p>${diffView(body(base), d.body)}</div>`;
  }
  const tryPanelHint = () => `<p class="im-note">${M.icon("info")}${esc(t("notRun"))}</p>`;
  function adoptBar(inCard) {
    const d = ui.draft, s = d.skill && find(d.skill);
    const next = s ? s.v + 1 : 1;
    const label = d.from === "restore" ? t("adoptVer", { v: next }) : s ? t("adoptVer", { v: next }) : t("adoptNew");
    const needsRun = d.hasCase && d.ranRev !== d.rev;
    const fail = ui.fail ? `<div class="mw-alert mw-alert--danger" data-slot="alert" role="alert"><strong>${esc(t(d.from === "restore" ? "restoreFail" : "adoptFail"))}</strong><p>${esc(t(d.from === "restore" ? "restoreFailD" : "adoptFailD", { v: s ? s.v : 0 }))}</p><div class="sk-alert-actions">${btn(t("retry"), { size: "sm", attrs: act("adopt-retry") })}</div></div>` : "";
    const confirm = ui.confirm ? `<div class="im-confirm" role="alertdialog" aria-label="${esc(t("adoptVer", { v: next }))}"><span class="grow">${esc(t("confirmT", { n: 1, d: t("d_number") }))}</span>${btn(t("confirmGo"), { size: "sm", variant: "primary", attrs: act("adopt-anyway") })}${btn(t("confirmBack"), { size: "sm", variant: "ghost", attrs: act(inCard ? "confirm-back" : "tab", "edit") })}</div>` : "";
    const gate = needsRun ? `<span class="grow im-gate">${M.icon("info")}${esc(t("notRun"))}</span>` : `<span class="grow sk-muted sk-small">${esc(t("saved", { at: t("atNow") }))}</span>`;
    const primary = needsRun ? btn(t("adoptGate"), { variant: "primary", icon: "play", attrs: act("run") }) : btn(label, { variant: "primary", icon: "check", attrs: act("adopt") });
    return `${fail}${confirm}<div class="im-bar${inCard ? " im-bar--card" : ""}">${primary}${btn(t("discard"), { variant: "ghost", attrs: act("discard") })}${gate}</div>`;
  }
  function draftWork() {
    const d = ui.draft;
    if (P.opt !== "B") {
      const tabs = M.renderTabs({ label: t("draftOf", { n: d.name }), className: "im-tabs", tabs: ["edit", "try", "compare"].map((k) => ({ id: "im-" + k, label: t("t" + k[0].toUpperCase() + k.slice(1)), selected: ui.tab === k, attrs: act("tab", k) })) });
      const panel = ui.tab === "edit" ? editor() : ui.tab === "try" ? tryPanel() : comparePanel();
      return `<div class="sk-split__detail im-work im-work--a${ui.anim ? " sk-enter" : ""}">${draftHead()}${tabs}<div class="im-panel">${panel}</div>${adoptBar(false)}</div>`;
    }
    // B: editor and the side panel at once; below 1100px the side panel stacks as tabs (as A).
    const sideTabs = M.renderTabs({ label: t("tTry"), className: "im-tabs", tabs: ["try", "compare"].map((k) => ({ id: "im-s-" + k, label: t("t" + k[0].toUpperCase() + k.slice(1)), selected: ui.side === k, attrs: act("side", k) })) });
    const narrowTabs = M.renderTabs({ label: t("draftOf", { n: d.name }), className: "im-tabs im-tabs--narrow", tabs: ["edit", "try", "compare"].map((k) => ({ id: "im-n-" + k, label: t("t" + k[0].toUpperCase() + k.slice(1)), selected: ui.tab === k, attrs: act("tab", k) })) });
    return `<div class="im-work im-work--b${ui.anim ? " sk-enter" : ""}" data-tab="${ui.tab}">${draftHead()}${narrowTabs}<div class="im-cols"><div class="im-col im-col--edit">${editor()}</div>
      <aside class="im-col im-col--side" data-side="${ui.side}">${sideTabs}<div class="im-panel im-panel--try">${tryPanel()}</div><div class="im-panel im-panel--compare">${comparePanel()}</div></aside></div>${adoptBar(false)}</div>`;
  }

  /* ---------- catalog and detail ---------- */
  const packTitle = (s) => s.pack === "mine" ? t("mine") : s.pack === "plan" ? t("planPack") : t("uxName");
  function list() {
    const draftFor = (s) => ui.draft && (ui.draft.skill === s.id);
    const row = (s) => `<li class="mw-item sk-pick-item"><button type="button" class="sk-pick"${ui.view !== "chat" && s.id === ui.sel && !(ui.draft && !ui.draft.skill && ui.view === "draft") ? ' aria-current="true"' : ""} data-act="sel" data-v="${s.id}">${mark("book")}<span class="sk-pick__text"><strong>${esc(t(s.name))}</strong><small>${esc(packTitle(s))}</small></span><span class="sk-pick__end">${draftFor(s) ? M.renderBadge({ label: t("draftBadge"), tone: "info" }) : ""}${stateMark(s.state)}</span></button></li>`;
    const newDraft = ui.draft && !ui.draft.skill ? `<li class="mw-item sk-pick-item"><button type="button" class="sk-pick"${ui.view === "draft" ? ' aria-current="true"' : ""} data-act="open-draft">${mark("sparkles")}<span class="sk-pick__text"><strong>${esc(ui.draft.name)}</strong><small>${esc(t("mine"))}</small></span><span class="sk-pick__end">${M.renderBadge({ label: t("draftBadge"), tone: "info" })}</span></button></li>` : "";
    return `<div class="sk-split__list"><div class="au-new">${btn(t("newBtn"), { variant: "primary", icon: "plus", attrs: act("sim", "new") })}${btn(t("importBtn"), { icon: "download", attrs: act("sim", "import") })}</div>
      <ul class="mw-items sk-items">${newDraft}${D.skills.map(row).join("")}</ul></div>`;
  }
  function history(s) {
    const rows = s.versions.map((v, i) => {
      const live = v.v === s.v, by = v.by === "sys" ? t("sys") : v.by === "inst" ? t("inst") : t(v.by, { v: v.from });
      const acts = s.pack === "mine" && !live ? `${btn(t("h_cmp"), { size: "sm", variant: "ghost", attrs: act("h-cmp", v.v) })}${btn(t("h_restore"), { size: "sm", icon: "undo", attrs: act("h-restore", v.v) })}` : "";
      return `<li class="mw-item im-ver"${live ? " data-live" : ""}>${mark(live ? "completed" : "history")}<span class="sk-pick__text"><strong>${esc(t("ver", { v: v.v }))}${live ? " · " + esc(t("h_live")) : ""}</strong><small>${esc(t("h_at", { at: t(v.at) }))} · ${esc(by)}</small></span><span class="mw-item__end">${acts}</span></li>`;
    }).join("");
    return `<section class="im-sec"><h4>${esc(t("history"))}</h4><ul class="mw-items sk-items im-vers">${rows}</ul></section>`;
  }
  function upstream(s) {
    if (!s.base || ui.upLater) return "";
    const orig = find(s.base.id);
    if (orig.v === s.base.v) return "";
    return `<div class="mw-alert mw-alert--info" data-slot="alert" role="status"><strong>${esc(t("upT", { n: t(orig.name), v: orig.v }))}</strong><p>${esc(t("upD"))}</p><div class="sk-alert-actions">${btn(t("upSee"), { size: "sm", attrs: act("up-see") })}${btn(t("upTake"), { size: "sm", attrs: act("up-take") })}${btn(t("upLater"), { size: "sm", variant: "ghost", attrs: act("up-later") })}</div></div>`;
  }
  function detail() {
    const s = find(ui.sel), mine = s.pack === "mine";
    const radios = M.renderRadioGroup({ legend: t("howUse"), name: "im-how", className: "sk-how", items: ["off", "auto", "manual"].map((v) => ({ value: v, label: t(v === "off" ? "expOff" : v === "auto" ? "expAuto" : "expManual"), checked: s.state === v })) });
    const hasDraft = ui.draft && ui.draft.skill === s.id;
    const draftBand = hasDraft ? `<div class="im-band">${mark("sparkles")}<span class="grow"><strong>${esc(t("draftBadge"))}</strong> · ${esc(t("notLive", { cur: t("curV", { v: s.v }) }))}</span>${btn(t("rcOpen"), { size: "sm", attrs: act("open-draft") })}</div>` : "";
    const top = mine ? `<div class="sk-actions sk-actions--start">${btn(t("edit"), { variant: hasDraft ? "secondary" : "primary", icon: "edit", attrs: act("edit", s.id) })}</div>`
      : `<div class="au-readonly"><span class="grow"><strong>${esc(t("roT"))}</strong> ${esc(t("roD"))}</span>${btn(t("copyMine"), { icon: "copy", attrs: act("copy", s.id) })}</div>`;
    const used = s.uses ? `<p class="im-used">${M.icon("activity")}${esc(s.uses.a + s.uses.c ? t("used_line", s.uses) : t("used_none"))}</p>` : "";
    return `<div class="sk-split__detail${ui.anim ? " sk-enter" : ""}"><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm sk-back" data-act="unsel">${M.icon("chevron-left")}<span data-slot="button-label">${esc(t("back"))}</span></button>
      <header><h3 tabindex="-1">${esc(t(s.name))}</h3><p class="sk-lead">${esc(t(s.desc))}</p><span class="sk-tags">${M.renderBadge({ label: t("w_" + s.applies), tone: "neutral" })}${M.renderBadge({ label: t("ver", { v: s.v }), tone: "neutral" })}</span></header>
      ${upstream(s)}${draftBand}${top}<div class="sk-how-wrap">${radios}</div>${used}${M.renderPreviewCard({ title: t("l_body"), body: body(s.body), className: "sk-preview" })}${history(s)}</div>`;
  }
  function settings() {
    const tabs = M.renderTabs({ label: t("settings"), className: "sk-tabs", tabs: [{ id: "plugins", label: t("tabPlugins"), selected: false, attrs: act("sim", "plugins") }, { id: "skills", label: t("tabSkills"), selected: true }] });
    const inDraft = ui.view === "draft";
    const right = inDraft ? draftWork() : detail();
    const focus = inDraft && P.opt === "B";
    return `<div class="proto-sheet sk-sheet im-sheet${focus ? " im-sheet--wide" : ""}"><header class="sk-sheet__head"><h1>${esc(t("settings"))}</h1><span class="sk-muted">${esc(t("scopeLine"))}</span></header>${tabs}
      <div class="sk-body sk-body--wide"><header class="sk-cat__head"><h2>${esc(t("tabSkills"))}</h2><p class="sk-lead">${esc(t("lead"))}</p></header>
      <div class="sk-split${focus ? " im-split--focus" : ""}" data-detail>${focus ? "" : list()}${right}</div></div></div>`;
  }
  const page = () => (ui.view === "chat" ? chat() : settings());

  /* ---------- prototype strip (not product) ---------- */
  function renderStrip() {
    const tg = (label, key, values) => M.renderToggleGroup({ label, items: values.map(([v, text]) => ({ value: v, label: text, current: P[key] === v, attrs: { "data-set": key, "data-v": v } })) });
    const sel = (id, key, values) => `<select class="mw-select" data-slot="select" id="${id}">${values.map(([v, text]) => `<option value="${v}"${P[key] === v ? " selected" : ""}>${esc(text)}</option>`).join("")}</select>`;
    document.getElementById("strip").innerHTML = `<b>${esc(t("protoTitle"))}</b>${M.renderBadge({ label: t("tbd"), tone: "warning" })}
      <span class="proto-field">${esc(t("opt"))}${tg(t("opt"), "opt", [["A", t("optA")], ["B", t("optB")], ["C", t("optC")]])}</span>
      <label>${esc(t("flow"))}${sel("flow", "flow", ["gen", "trial", "compare", "adopt", "restore", "custom"].map((k) => [k, t("f_" + k)]))}</label>
      <label>${esc(t("state"))}${sel("state", "st", ["normal", "diff", "fail"].map((k) => [k, t("st_" + k)]))}</label>
      <span class="proto-field">${esc(t("lang"))}${tg(t("lang"), "lang", [["zh", "中文"], ["en", "English"]])}</span>
      <span class="proto-field">${esc(t("theme"))}${tg(t("theme"), "theme", [["light", t("light")], ["dark", t("dark")]])}</span>
      ${btn(t("reset"), { variant: "ghost", icon: "undo", attrs: { id: "reset" } })}`;
  }
  function render(focus) {
    const root = document.documentElement;
    root.lang = P.lang === "zh" ? "zh-CN" : "en"; root.dataset.theme = P.theme; root.dataset.resolvedTheme = P.theme;
    renderStrip();
    const active = document.activeElement, id = active?.id, at = active?.selectionStart;
    document.getElementById("app").innerHTML = page();
    ui.anim = false;
    const target = focus ? document.querySelector(focus) : id ? document.getElementById(id) : null;
    if (target) { target.focus(); if (!focus && at != null && target.setSelectionRange) target.setSelectionRange(at, at); }
  }
  let timer;
  const toast = (message, tone, action) => {
    const box = document.getElementById("toasts");
    box.innerHTML = M.renderToast({ message, tone, action });
    clearTimeout(timer); timer = setTimeout(() => { box.innerHTML = ""; }, 5200);
  };
  const restart = () => { D = seed(); ui = freshUi(); render(); };

  function runReplay() {
    if (P.flow === "trial" && P.st === "fail") return;
    ui.running = true; render();
    setTimeout(() => { ui.running = false; ui.runs = runsFor(ui.draft); ui.anim = true; render(); }, 900);
  }
  function adopt(force) {
    const d = ui.draft;
    if (d.hasCase && d.ranRev !== d.rev) return runReplay();
    if (!force && ui.runs && ui.runs.assistant.draft.verdict === "differs") { ui.confirm = true; return render(".im-confirm .mw-btn"); }
    if ((P.flow === "adopt" || P.flow === "restore") && P.st === "fail" && !ui.fail) { ui.fail = true; ui.confirm = false; return render(".mw-alert--danger strong"); }
    ui.fail = false; ui.confirm = false;
    if (d.skill) {
      const s = find(d.skill), prev = { v: s.v, body: s.body };
      s.v += 1; s.body = d.from === "restore" ? "v" + d.restoring : "v3";
      s.versions.unshift({ v: s.v, at: "atNow", by: d.from === "restore" ? "h_by_restore" : "h_by_chat", from: d.restoring });
      ui.view = "detail"; ui.sel = s.id; ui.draft = null; ui.runs = null; ui.anim = true; render(".sk-split__detail h3");
      if (d.from === "restore") { ui.last = { id: s.id, prev }; return toast(t("t_restored", { n: t(s.name), v: s.v, r: d.restoring }), "success", { label: t("undo"), attrs: act("undo-restore") }); }
      return toast(t("t_adoptVer", { n: t(s.name), v: s.v }), "success");
    }
    const id = "new-" + Date.now(), custom = d.from === "custom";
    BODY[id] = B(d.body, d.body);
    D.skills.unshift({ id, pack: "mine", v: 1, state: "off", applies: d.applies, name: d.name, desc: d.desc, body: id, versions: [{ v: 1, at: "atNow", by: custom ? "h_by_edit" : "h_by_chat" }], uses: { a: 0, c: 0 },
      ...(custom ? { base: { id: d.custom.id, v: d.custom.v } } : {}) });
    T.zh[d.name] = d.name; T.en[d.name] = d.name; T.zh[d.desc] = d.desc; T.en[d.desc] = d.desc;
    if (custom && d.replaceOrig) find(d.custom.id).state = "off";
    ui.view = "detail"; ui.sel = id; ui.draft = null; ui.runs = null; ui.anim = true; render(".sk-split__detail h3");
    toast(t("t_adoptNew", { n: d.name }), "success", { label: t("turnAuto"), attrs: act("turn-auto", id) });
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act],[data-set],#reset");
    if (!b || b.disabled) return;
    if (b.id === "reset") { P = clone(DEF); persist(); return restart(); }
    if (b.dataset.set) { P[b.dataset.set] = b.dataset.v; persist(); if (b.dataset.set === "opt") return restart(); return render(); }
    const a = b.dataset.act, v = b.dataset.v;
    switch (a) {
      case "open-draft": ui.view = P.opt === "C" && ui.draft.from === "chat" ? "chat" : "draft"; ui.tab = ui.draft.hasCase && !ui.runs ? "try" : "edit"; ui.side = "try"; ui.anim = true; return render(ui.view === "chat" ? ".im-card" : ".im-head h3");
      case "edit-in-settings": ui.view = "draft"; ui.tab = "edit"; ui.anim = true; return render(".im-head h3");
      case "close-draft": ui.view = "detail"; if (!ui.draft.skill) ui.sel = "rel"; ui.anim = true; return render(".sk-split__detail h3");
      case "sel": ui.view = "detail"; ui.sel = v; ui.anim = true; return render(".sk-split__detail h3");
      case "unsel": return render();
      case "edit": if (!ui.draft || ui.draft.skill !== v) { ui.draft = improveDraft(); ui.draft.from = "edit"; ui.draft.hasCase = false; ui.draft.body = body(find(v).body); ui.runs = null; }
        ui.view = P.opt === "C" ? "draft" : "draft"; ui.tab = "edit"; ui.anim = true; return render(".im-head h3");
      case "copy": ui.draft = customDraft(false); ui.runs = null; ui.view = "draft"; ui.tab = "edit"; ui.anim = true; return render(".im-head h3");
      case "tab": ui.tab = v; if (v === "try" || v === "compare") ui.side = v; ui.confirm = false; ui.anim = true; return render();
      case "side": ui.side = v; ui.tab = v; return render();
      case "cmp": ui.cmp = v; return render();
      case "see-out": ui.out = v; if (ui.view === "chat") return render(); ui.cmp = "out"; ui.tab = "compare"; ui.side = "compare"; return render(".im-compare");
      case "applies": ui.draft.applies = v; ui.draft.rev++; return render();
      case "run": return runReplay();
      case "adopt": return adopt(false);
      case "adopt-anyway": return adopt(true);
      case "adopt-retry": if (P.st === "fail") { P.st = "normal"; persist(); } ui.fail = false; return adopt(true);
      case "confirm-back": ui.confirm = false; return render();
      case "discard": { const kept = { draft: ui.draft, runs: ui.runs, view: ui.view }; ui.last = kept; const s = ui.draft.skill; ui.draft = null; ui.runs = null; ui.confirm = false; ui.view = ui.view === "chat" ? "chat" : "detail"; if (s) ui.sel = s; ui.anim = true; render();
        return toast(t("t_discard"), "success", { label: t("undo"), attrs: act("undo-discard") }); }
      case "undo-discard": if (ui.last?.draft) { ui.draft = ui.last.draft; ui.runs = ui.last.runs; ui.view = ui.last.view; ui.last = null; render(); toast(t("t_back"), "success"); } return;
      case "undo-restore": if (ui.last?.prev) { const s = find(ui.last.id); s.v += 1; s.body = ui.last.prev.body; s.versions.unshift({ v: s.v, at: "atNow", by: "h_by_restore", from: ui.last.prev.v }); ui.last = null; render(); toast(t("t_undoRestore", { v: s.v }), "success"); } return;
      case "h-cmp": case "h-restore": ui.draft = restoreDraft(Number(v)); ui.runs = null; ui.view = "draft"; ui.tab = "compare"; ui.side = "compare"; ui.cmp = "how"; ui.anim = true; return render(".im-head h3");
      case "ask-edit": case "ask-edit-chat": {
        const input = document.getElementById(a === "ask-edit" ? "im-ask" : "im-chat"); if (input && !input.value.trim()) input.value = t("askEditPh");
        ui.asked = "busy"; render();
        return void setTimeout(() => { const d = ui.draft; const before = d.body; d.body = body("v3"); d.rev++; ui.asked = Math.max(1, changes(before, d.body) || 2); ui.anim = true; render(); }, 800);
      }
      case "replace-orig": ui.draft.replaceOrig = !ui.draft.replaceOrig; return render();
      case "up-see": { const s = find(ui.sel); ui.draft = customDraft(true); ui.draft.skill = null; ui.draft.custom = { id: s.base.id, v: find(s.base.id).v }; ui.draft.body = body("planMine"); ui.view = "draft"; ui.tab = "compare"; ui.side = "compare"; ui.cmp = "how"; ui.anim = true; return render(".im-head h3"); }
      case "up-take": ui.draft = customDraft(true); ui.draft.custom = { id: "plan", v: 2 }; ui.draft.fills = { docs: "Notion", tracker: "Linear" }; ui.view = "draft"; ui.tab = "compare"; ui.side = "compare"; ui.cmp = "how"; ui.anim = true; return render(".im-head h3");
      case "up-later": ui.upLater = true; render(); return toast(t("t_upLater"));
      case "turn-auto": { const s = find(v); if (s) { s.state = "auto"; render(); toast(t("t_state", { n: t(s.name), s: t("sAuto") }), "success"); } return; }
      case "sim": return toast(t("t_sim", { x: t("sim_" + v) || v }));
      default:
    }
  });
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "flow") { P.flow = el.value; persist(); return restart(); }
    if (el.id === "state") { P.st = el.value; persist(); return restart(); }
    if (el.name === "im-how") { const s = find(ui.sel); s.state = el.value; render(); toast(t("t_state", { n: t(s.name), s: t(WORD[s.state]) }), "success"); }
  });
  // Typing changes the draft (kept as it is typed) without re-rendering, so the caret never jumps; a fill replaces its placeholder in the body.
  document.addEventListener("input", (e) => {
    const k = e.target.dataset?.f, fill = e.target.dataset?.fill, d = ui.draft;
    if (!d) return;
    if (k) { d[k] = e.target.value; d.rev++; const c = document.getElementById("im-count"); if (c && k === "body") c.textContent = t("count", { l: lines(d.body), ml: LIMIT.lines, c: d.body.length, mc: LIMIT.chars }); }
    if (fill) {
      const token = t(fill === "docs" ? "phDocs" : "phTracker"), prev = d.fills[fill] || token, next = e.target.value || token;
      d.fills[fill] = e.target.value; d.body = d.body.split(prev).join(next); d.rev++;
      const area = document.getElementById("im-body"); if (area) area.value = d.body;
    }
  });
  T.zh.t_state = "「{n}」改成{s}"; T.en.t_state = "“{n}” set to {s}";

  render();
})();
