// 37-1 · 生成页面运行、采用与恢复 — sample data. Every pair is [中文, English]. Nothing here is read from a Home.
window.protoData = {
  plans: [
    ["A", "A 首页里直接是草稿（没选）", "A Draft in place (not chosen)"],
    ["B", "B 现在和草稿并排（已选）", "B Side by side (chosen)"],
    ["C", "C 引导框架里做完再回来（没选）", "C Guided frame (not chosen)"],
  ],
  stages: [
    ["live", "在用第 2 版", "Version 2 in use"],
    ["gen", "助理在做第 3 版", "Assistant making version 3"],
    ["draft", "看草稿", "Looking at the draft"],
    ["adopt", "采用", "Adopting"],
    ["done", "已换成第 3 版", "Version 3 in use"],
    ["versions", "版本与恢复", "Versions and restore"],
  ],
  faults: [
    ["none", "正常", "Normal"],
    ["checkfail", "草稿没通过检查", "Draft fails a check"],
    ["depoff", "Coding 已停用", "Coding is turned off"],
    ["conflict", "和你改过的地方冲突", "Clashes with your edits"],
    ["adoptfail", "采用时一步没成", "One adoption step fails"],
    ["actionfail", "页面里的操作没成", "An action on the page fails"],
    ["revoked", "页面的许可被收回", "Page permission withdrawn"],
    ["loadfail", "新版本打不开", "New version will not load"],
    ["allfail", "生成的页面都打不开", "No generated page loads"],
    ["restart", "重启后草稿还在", "Draft kept over a restart"],
    ["switch", "切到另一个项目", "Switched to another project"],
  ],
  project: ["发布 2.3", "Release 2.3"],
  otherProject: ["官网改版", "Website refresh"],
  page: ["发布检查台", "Release check board"],
  ask: ["加一栏 PR 状态，能按负责人筛，再能和上周比一比", "Add a PR status column, a filter by owner, and a comparison with last week"],
  versions: [
    { id: "v3", name: ["第 3 版", "Version 3"], when: ["今天 14:20", "Today 14:20"], why: ["你说：加一栏 PR 状态，能按负责人筛，再能和上周比", "You asked: add PR status, filter by owner, compare with last week"] },
    { id: "v2", name: ["第 2 版", "Version 2"], when: ["11 月 2 日", "2 Nov"], why: ["你说：卡住的放最前面", "You asked: put stuck items first"], edits: 2 },
    { id: "v1", name: ["第 1 版", "Version 1"], when: ["10 月 30 日", "30 Oct"], why: ["建项目时生成", "Made when the project was set up"] },
  ],
  people: [["all", "所有人", "Everyone"], ["me", "我", "Me"], ["lin", "小林", "Lin"], ["zhou", "阿周", "Zhou"]],
  rows: [
    { id: "r1", title: ["写升级说明", "Write the upgrade notes"], who: "lin", state: "progress", stateLabel: ["进行中", "In progress"], pr: ["#412 等评审", "#412 awaiting review"], prTone: "hold", due: ["11-06", "6 Nov"] },
    { id: "r2", title: ["修好导出卡住", "Fix the stuck export"], who: "zhou", state: "blocked", stateLabel: ["卡住了", "Stuck"], pr: ["#409 检查没过", "#409 checks failing"], prTone: "blocked", due: ["11-05", "5 Nov"] },
    { id: "r3", title: ["更新定价页", "Update the pricing page"], who: "me", state: "progress", stateLabel: ["进行中", "In progress"], pr: ["还没有", "None yet"], prTone: "idle", due: ["11-07", "7 Nov"] },
    { id: "r4", title: ["回归测试", "Regression pass"], who: "lin", state: "idle", stateLabel: ["没开始", "Not started"], pr: ["—", "—"], prTone: "idle", due: ["11-08", "8 Nov"] },
    { id: "r5", title: ["合并翻译", "Merge translations"], who: "me", state: "done", stateLabel: ["完成了", "Done"], pr: ["#405 已合并", "#405 merged"], prTone: "done", due: ["11-03", "3 Nov"], hiddenByYou: true },
  ],
  sampleRows: [
    { id: "s1", title: ["示例事项一", "Sample item one"], who: "me", state: "progress", stateLabel: ["进行中", "In progress"], pr: ["#101 等评审", "#101 awaiting review"], prTone: "hold", due: ["01-02", "2 Jan"] },
    { id: "s2", title: ["示例事项二", "Sample item two"], who: "lin", state: "blocked", stateLabel: ["卡住了", "Stuck"], pr: ["#102 检查没过", "#102 checks failing"], prTone: "blocked", due: ["01-03", "3 Jan"] },
    { id: "s3", title: ["示例事项三", "Sample item three"], who: "zhou", state: "idle", stateLabel: ["没开始", "Not started"], pr: ["—", "—"], prTone: "idle", due: ["01-04", "4 Jan"] },
  ],
  compare: [
    [["完成", "Done"], 3, 5],
    [["卡住", "Stuck"], 1, 0],
    [["新加", "Added"], 2, 1],
  ],
  // What the user changed on version 2 by hand. Regenerating keeps these unless they clash.
  edits: [
    ["把「负责人」一栏改叫「谁在做」", "Renamed the “Owner” column to “Who’s on it”"],
    ["隐藏了已完成的事项", "Hid finished items"],
  ],
  // Checks the platform runs on every draft before it can be adopted.
  checks: [
    { id: "actions", ok: ["只用公开的操作：读待办、读 Coding 的 PR、给待办「标完成」", "Uses public actions only: read to-dos, read Coding PRs, mark a to-do done"], bad: ["「PR 状态」一栏想直接读 Coding 的数据，没走公开的操作，已拦下", "The PR status column tried to read Coding’s data directly instead of through a public action; blocked"] },
    { id: "sandbox", ok: ["在隔离里运行：不碰密钥、别的数据和本机文件", "Runs isolated: no keys, no other data, no files on this Mac"] },
    { id: "project", ok: ["只用「发布 2.3」的内容", "Uses Release 2.3 content only"] },
    { id: "quality", ok: ["打开不到 1 秒；中英文、窄屏都排得下", "Opens in under a second; fits in Chinese, English and narrow windows"] },
  ],
  // What adopting does, in the words the dialog / review step uses.
  changes: [
    { kind: "change", icon: "home", text: ["项目首页换成「发布检查台」第 3 版；第 2 版留作上一版", "The project home becomes Release check board version 3; version 2 stays as the previous one"], scope: ["这个项目", "This project"] },
    { kind: "grant", icon: "shield", text: ["让这个页面读 Coding 的 PR 状态", "Let this page read PR status from Coding"], scope: ["这个项目", "This project"], why: ["你刚才要了这一栏", "You just asked for this column"] },
    { kind: "reuse", icon: "check", text: ["给待办「标完成」：第 2 版已经允许，沿用", "Mark a to-do done: already allowed for version 2, kept"], scope: ["这个项目", "This project"] },
    { kind: "keep", icon: "edit", text: ["你改过的 2 处照旧保留", "Your 2 edits stay as they are"], scope: ["", ""] },
  ],
  notDone: ["不会改任何待办或 PR；不会用到别的项目；别的窗口跟着换", "Changes no to-do or PR; touches no other project; other windows follow"],
  steps: [
    ["保存第 3 版", "Save version 3"],
    ["记下读 PR 的许可", "Record the PR permission"],
    ["换到项目首页", "Switch the project home"],
    ["打开看一眼，确认能用", "Open it once to confirm it works"],
  ],
  plugins: [
    { id: "goals", name: ["待办", "To-dos"], icon: "target", line: ["4 件在做，1 件卡住", "4 in progress, 1 stuck"] },
    { id: "coding", name: ["Coding", "Coding"], icon: "code", line: ["2 个 PR 等你看", "2 PRs waiting for you"] },
    { id: "inbox", name: ["Inbox", "Inbox"], icon: "inbox", line: ["1 条要回复", "1 to reply to"] },
    { id: "pages", name: ["Pages", "Pages"], icon: "note", line: ["发布说明，昨天改过", "Release notes, edited yesterday"] },
  ],
};
