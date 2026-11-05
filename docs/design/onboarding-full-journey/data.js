// 04 · Onboarding full journey — sample data only. Nothing here reads a real folder, calls a model or touches a Home.
// Every text is [zh, en].
window.protoData = {
  scenarios: [
    ["first", ["首次使用（还没有项目）", "First use (no project yet)"]],
    ["newproj", ["新建项目（已有个人设置）", "New project (personal settings exist)"]],
    ["addscene", ["给已有项目加一套做法", "Add a way of working to a project"]],
    ["fromhelp", ["从 Coding 的缺项进入，再回去", "From a gap in Coding, and back"]],
  ],
  faults: [
    ["none", ["正常", "Normal"]],
    ["scanning", ["大文件夹还在清点", "Large folder still being listed"]],
    ["fail_auth", ["整理失败：密钥被拒", "Summary failed: key refused"]],
    ["fail_limit", ["整理失败：额度或限流", "Summary failed: quota or rate limit"]],
    ["fail_timeout", ["整理失败：超时", "Summary failed: timed out"]],
    ["missing_dep", ["方案缺一个插件", "Plan is missing a plugin"]],
    ["adopt_partial", ["采用时一项没成", "One adoption item failed"]],
    ["resume", ["关掉后重新打开", "Closed and reopened"]],
  ],
  steps: {
    goal: ["目的", "Goal"], materials: ["材料", "Materials"], model: ["模型", "Model"], read: ["读取与整理", "Read and sum up"],
    ask: ["补几件事", "A few questions"], plan: ["看方案", "Review the plan"], adopt: ["采用", "Adopt"], work: ["第一件事", "First piece of work"],
    workdir: ["工作目录", "Working folder"], back: ["回到 Coding", "Back to Coding"],
  },
  goalSuggestions: [
    ["每周跟踪 AI 产品，形成一份观察", "Track AI products weekly and write an observation"],
    ["把手上的客户访谈整理成需求", "Turn my customer interviews into requirements"],
    ["接着做官网改版", "Carry on with the website redesign"],
  ],
  // Locations. n = how many items a row stands for. kind: text | image | unreadable | longpdf | rest
  locations: [
    { id: "docs", name: ["产品观察", "产品观察"], path: "~/Documents/产品观察", total: 46, ignored: 1, children: [
      { id: "opml", name: "订阅源.opml", kind: "text", size: "6 KB", pick: true },
      { id: "obs10", name: "2026-10 观察.md", kind: "text", size: "18 KB", pick: true, dupOf: "dl-obs10" },
      { id: "obs1027", name: "2026-10-27 观察.md", kind: "text", size: "9 KB", pick: true },
      { id: "xlsx", name: "竞品表.xlsx", kind: "text", size: "42 KB", pick: true },
      { id: "shots", name: "截图", kind: "image", n: 12, folder: true, pick: true },
      { id: "key", name: "旧版发布会.key", kind: "unreadable", size: "31 MB", pick: true },
      { id: "notes", name: "笔记", kind: "text", n: 28, folder: true, pick: true },
    ] },
    { id: "dl", name: ["下载", "Downloads"], path: "~/Downloads", total: 1286, ignored: 0, scanFound: 812, children: [
      { id: "gartner", name: "Gartner AI Agents 2026.pdf", kind: "longpdf", size: "1.1 MB", pages: 88, pick: true, heavy: true },
      { id: "dl-li", name: "访谈纪要-李.docx", kind: "text", size: "64 KB", pick: true },
      { id: "dl-obs10", name: "2026-10 观察.md", kind: "text", size: "18 KB", pick: true },
      { id: "devday", name: "DevDay 笔记.pdf", kind: "text", size: "380 KB", pick: true },
      { id: "dl-five", name: ["另外 5 份你挑的", "5 more you picked"], kind: "text", n: 5, pick: true },
      { id: "dl-rest", name: ["其余没勾的", "The rest, not ticked"], kind: "rest", n: 1277, pick: false },
    ] },
    { id: "desk", name: ["会议纪要", "会议纪要"], path: "~/Desktop/会议纪要", total: 31, ignored: 0, children: [
      { id: "w1021", name: "周会 10-21.md", kind: "text", size: "7 KB", pick: true },
      { id: "w1028", name: "周会 10-28.md", kind: "text", size: "8 KB", pick: true },
      { id: "desk-li", name: "访谈纪要-李.docx", kind: "text", size: "64 KB", pick: true, dupOf: "dl-li" },
      { id: "desk-rest", name: ["其余 28 份", "28 more"], kind: "text", n: 28, folder: true, pick: true },
    ] },
  ],
  members: [
    { id: "pa", av: ["助", "PA"], hue: "blue", name: ["个人助理", "Personal assistant"], role: ["接待和接续，跨项目同一个；在这个项目里只读这个项目的资料", "Greets and follows up — the same one across projects; here it only reads this project's materials"], existing: true },
    { id: "res", av: ["研", "R"], hue: "green", name: ["研究员", "Researcher"], role: ["读订阅源和材料，记下本周变化", "Reads feeds and materials, notes this week's changes"], skill: ["产品变化跟踪", "Product change tracking"], can: ["读网页、读订阅源", "Read web pages and feeds"], out: ["变化清单（交给编辑）", "Change list (to the editor)"] },
    { id: "ed", av: ["编", "E"], hue: "orange", name: ["编辑", "Editor"], role: ["把变化写成一篇观察", "Writes the changes up as an observation"], skill: ["周报写作", "Weekly write-up"], can: ["写 Pages 文档", "Write Pages documents"], out: ["Pages 文档", "Pages document"] },
  ],
};
