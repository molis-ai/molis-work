// Sample objects for the 03 intelligent-surfaces prototype (four basic forms). All made up; nothing reads a Home.
// Each object: owner plugin, kind, state, fields by semantic role, operations (primary first), and a peek body.
window.isData = {
  owners: {
    goals: { name: "Goals", icon: "target" },
    inbox: { name: "Inbox", icon: "inbox" },
    coding: { name: "Coding", icon: "code" },
    textstat: { name: "文本统计", nameEn: "Text stats", icon: "package" },
  },
  objects: {
    goal: {
      owner: "goals", title: "发布 v2", state: "accept", time: "10 分钟前", timeEn: "10 min ago",
      who: { ai: "Coding", aiVerb: "交回", aiVerbEn: "handed back", ask: "你验收", askEn: "your review" },
      summary: "登录跳转修好了，回归用例和截图已交回，等你验收。", summaryEn: "The login redirect is fixed; regression tests and screenshots are back for your review.",
      progress: { done: 3, total: 5, label: "完成要求", labelEn: "Requirements" },
      locate: "Goals › 发布 v2 › 完成要求", locateEn: "Goals › 发布 v2 › Requirements",
      ops: [{ id: "accept", zh: "验收", en: "Review", done: "已验收「发布 v2」第 1 条", doneEn: "Accepted requirement 1 of “发布 v2”", undo: true }, { id: "continue", zh: "继续这个目标", en: "Continue this goal", done: "已打开「发布 v2」接着做", doneEn: "Opened “发布 v2” to continue" }],
      peek: { type: "reqs", items: [
        { t: "登录跳转修好并有回归用例", tEn: "Login redirect fixed, with a regression test", s: "accept", ev: "回归用例 12 条通过 · 截图 3 张", evEn: "12 regression tests pass · 3 screenshots" },
        { t: "发布说明写好并过目", tEn: "Release notes written and reviewed", s: "running", ev: "草稿在 Pages，还差两节", evEn: "Draft in Pages, two sections left" },
        { t: "上线检查单逐项打勾", tEn: "Launch checklist ticked item by item", s: "done", ev: "你 · 昨天", evEn: "You · yesterday" },
      ] },
    },
    inbox: {
      owner: "inbox", title: "手机上价格表挤成一团", titleEn: "Price table is crammed on phones", state: "decide", time: "今天 09:12", timeEn: "Today 09:12",
      who: { human: "王小姐", humanEn: "Ms. Wang", via: "邮件", viaEn: "Email" },
      judge: "要紧 · 对上「手机排版」", judgeEn: "Urgent · matches “Mobile layout”",
      summary: "截图里第三列被挤到第二行，按钮压住了价格。她问这周能不能修好。", summaryEn: "In the screenshot the third column wraps to a second line and the button covers the price. She asks if it can be fixed this week.",
      media: true, relates: "goal",
      locate: "Inbox › 今天 › 手机上价格表挤成一团", locateEn: "Inbox › Today › Price table is crammed on phones",
      ops: [{ id: "handoff", zh: "交给 Coding", en: "Hand to Coding", done: "已交给 Coding：「手机上价格表挤成一团」", doneEn: "Handed to Coding: “Price table is crammed on phones”", undo: true }, { id: "idea", zh: "记成想法", en: "Save as idea", done: "已记成想法", doneEn: "Saved as idea", undo: true }, { id: "reply", zh: "回复她", en: "Reply", consequence: "会发出一封邮件给王小姐", consequenceEn: "Sends an email to Ms. Wang", done: "已发出回复（模拟）", doneEn: "Reply sent (simulated)" }],
      peek: { type: "text", body: "你好，我们在手机上打开定价页，第三列（企业版）掉到了下一行，「开始试用」按钮压住了价格。附上截图。这周能修好吗？我们周五要给老板看。", bodyEn: "Hi, on our phones the pricing page pushes the third column (Enterprise) onto the next line and the “Start trial” button covers the price. Screenshot attached. Can it be fixed this week? We show it to our boss on Friday." },
    },
    run: {
      owner: "coding", title: "修复登录跳转", titleEn: "Fix login redirect", state: "running", time: "在跑 · 6 分钟", timeEn: "Running · 6 min",
      who: { ai: "Coding", aiVerb: "在做", aiVerbEn: "working" },
      summary: "第 3 步，共 5 步：在跑回归用例。", summaryEn: "Step 3 of 5: running regression tests.", step: { n: 3, of: 5 },
      locate: "Coding › 修复登录跳转 › 第 3 步", locateEn: "Coding › Fix login redirect › Step 3",
      ops: [{ id: "add", zh: "补充", en: "Add a note", done: "已补充给这一轮", doneEn: "Note added to this turn" }, { id: "stop", zh: "停止", en: "Stop", danger: true, consequence: "已改的文件留着，这一轮不再往下做", consequenceEn: "Edited files stay; this turn stops here", done: "已停止「修复登录跳转」", doneEn: "Stopped “Fix login redirect”" }],
      peek: { type: "diff", file: "src/auth/redirect.ts", lines: [["-", "if (next) return next;"], ["+", "if (next && isSameOrigin(next)) return next;"], [" ", "return \"/home\";"]] },
    },
    report: {
      owner: "coding", title: "首页改版：换成新的首屏", titleEn: "Homepage refresh: new hero", state: "partial", time: "昨天 18:40", timeEn: "Yesterday 18:40",
      who: { ai: "Coding", aiVerb: "交回", aiVerbEn: "handed back", ask: "你给文案", askEn: "copy from you" },
      summary: "三个页面改了两个；定价页的标题等你给文案。", summaryEn: "Two of three pages done; the pricing headline waits for your copy.", progress: { done: 2, total: 3, label: "页面", labelEn: "Pages" }, media: true,
      locate: "Coding › 首页改版 › 报告", locateEn: "Coding › Homepage refresh › Report",
      ops: [{ id: "copy", zh: "补文案", en: "Add copy", done: "已打开定价页文案", doneEn: "Opened pricing copy" }, { id: "report", zh: "看报告", en: "View report", done: "已打开报告", doneEn: "Opened report" }],
      peek: { type: "shots" },
    },
    failed: {
      owner: "coding", title: "导出 CSV", titleEn: "Export CSV", state: "failed", time: "20 分钟前", timeEn: "20 min ago",
      who: { ai: "Coding", aiVerb: "停在", aiVerbEn: "stopped at" },
      summary: "测试没过：两条用例超时（大于 30 秒）。改动没有提交。", summaryEn: "Tests failed: two cases timed out (over 30 s). Nothing was committed.",
      locate: "Coding › 导出 CSV › 测试", locateEn: "Coding › Export CSV › Tests",
      ops: [{ id: "why", zh: "看失败原因", en: "See why", done: "已打开失败的两条用例", doneEn: "Opened the two failing tests" }, { id: "rerun", zh: "重跑", en: "Run again", done: "已重跑「导出 CSV」", doneEn: "Re-running “Export CSV”" }],
      peek: { type: "text", body: "export.test.ts › 2,140 行一次导完 — 超时 31.2 s\nexport.test.ts › 带中文列名 — 超时 30.8 s", bodyEn: "export.test.ts › 2,140 rows in one go — timed out 31.2 s\nexport.test.ts › Chinese column names — timed out 30.8 s", mono: true },
    },
    stale: {
      owner: "goals", title: "旧版迁移", titleEn: "Legacy migration", state: "stale", time: "最后读到 2 小时前", timeEn: "Last read 2 h ago",
      summary: "Goals 暂时读不到，下面是 2 小时前的内容。", summaryEn: "Goals can't be read right now; this is from 2 hours ago.", progress: { done: 1, total: 4, label: "完成要求", labelEn: "Requirements" },
      locate: "Goals › 旧版迁移", locateEn: "Goals › Legacy migration", ops: [{ id: "retry", zh: "再读一次", en: "Read again", done: "Goals 仍读不到（模拟）", doneEn: "Goals still unreadable (simulated)" }],
    },
    denied: { owner: "inbox", state: "denied", title: "", locate: "" },
    deleted: { owner: "coding", state: "deleted", title: "清理旧分支", titleEn: "Clean up old branches", locate: "" },
    undeclared: {
      owner: "textstat", title: "字数统计 · 发布说明草稿", titleEn: "Word count · Release notes draft", state: "none", undeclared: true,
      locate: "文本统计 › 字数统计", locateEn: "Text stats › Word count", ops: [],
    },
  },
  stateOrder: ["running", "decide", "accept", "failed", "partial", "stale", "denied", "deleted", "undeclared"],
  stateObj: { running: "run", decide: "inbox", accept: "goal", failed: "failed", partial: "report", stale: "stale", denied: "denied", deleted: "deleted", undeclared: "undeclared" },
};
