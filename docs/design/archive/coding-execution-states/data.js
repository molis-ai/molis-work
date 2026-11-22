// 12 · Coding 执行定样 — sample data only. Nothing here reads a folder, runs a command or calls a model.
// Every user-facing string is a [中文, English] pair.
window.protoData = {
  blocks: [
    { id: "dir", name: ["目录", "Folders"] },
    { id: "rules", name: ["规则和模式", "Rules and modes"] },
    { id: "recover", name: ["恢复", "Recovery"] },
    { id: "steps", name: ["计划卡与任务板", "Plan card and TaskBoard"] },
  ],
  // 2026-11-04 用户选定（记在 specs/coding-harness-optimization/spec.md §11）。
  decided: { dir: "C", rules: "A", recover: "A", steps: "A" },
  schemes: {
    dir: {
      A: ["顶部位置条（沿用 03）", "Location bar on top (as in 03)"],
      B: ["输入框上的位置签", "Location chips on the composer"],
      C: ["文件区抬头", "Files column header"],
    },
    rules: {
      A: ["只读时常显一行提示", "Always-on read-only line"],
      B: ["发送时才确认", "Confirm at send"],
      C: ["Coding 判断后自动切换", "Coding switches the mode itself"],
    },
    recover: {
      A: ["行内标记 + 本轮结尾的恢复块", "Row marks + one recovery block at the end"],
      B: ["出问题的那一行就地展开", "The affected row expands in place"],
      C: ["底部结果条", "Result bar above the composer"],
    },
    steps: {
      A: ["序号与状态分开", "Number and status side by side"],
      B: ["序号藏进状态圆点", "Number inside the status dot"],
      C: ["只在抬头说第几步", "Header says which step"],
    },
  },
  states: {
    dir: [
      ["normal", "正常：本轮在项目输出里做", "Normal: this round works in the project output"],
      ["browsing", "临时查看另一个文件夹", "Viewing another folder for a moment"],
      ["frozen", "运行中改了项目输出", "Output changed while a round runs"],
      ["worktree", "本轮在临时副本里做", "This round works in a temporary copy"],
      ["missing", "输出文件夹不见了", "The output folder is gone"],
      ["none", "项目还没设输出", "The project has no output yet"],
    ],
    rules: [
      ["normal", "正常：修改模式，规则已生效", "Normal: Edit mode, rules in effect"],
      ["readonly", "讨论模式（只读）下写了开发请求", "A development request typed in Discuss (read-only)"],
      ["review", "评审完想直接改", "After a review, wanting to change things"],
      ["changed", "规则文件在运行中改了", "A rules file changed during the round"],
      ["untrusted", "项目没被信任，规则没加载", "Project not trusted, rules not loaded"],
    ],
    recover: [
      ["failed", "命令失败（退出 1）", "Command failed (exit 1)"],
      ["unknown", "命令结果未知（没有退出码）", "Result unknown (no exit code)"],
      ["cancelled", "命令被你取消", "You cancelled the command"],
      ["timeout", "命令超时", "Command timed out"],
      ["signal", "命令被系统结束", "Command ended by a signal"],
      ["interrupted", "重启后接着这一轮", "Picking up after a restart"],
      ["waiting", "后面的命令在等前一步", "Later commands waiting for the previous step"],
    ],
    steps: [
      ["normal", "正常：第 3 步进行中", "Normal: step 3 running"],
      ["nested", "第 3 步拆了小步", "Step 3 split into sub-steps"],
      ["unknown", "第 3 步的命令结果未知", "Step 3's command result is unknown"],
      ["failed", "第 3 步失败", "Step 3 failed"],
      ["revised", "计划改过：中间插了一步", "Plan revised: a step inserted"],
    ],
  },
  folders: [
    { id: "website", name: "website", path: "~/code/website", roles: ["input", "output"] },
    { id: "brand", name: "brand-assets", path: "~/Design/brand-assets", roles: ["input"] },
    { id: "interviews", name: "访谈记录", path: "~/Documents/访谈记录", roles: ["input"] },
  ],
  tree: {
    website: [["folder-open", "src", 0], ["folder-open", "components", 1], ["file", "Hero.tsx", 2, "M"], ["file", "Nav.tsx", 2], ["file", "app.tsx", 1, "M"], ["file", "AGENTS.md", 0], ["file", "package.json", 0], ["file", "README.md", 0]],
    brand: [["file", "品牌指南 2026.pdf", 0], ["file", "配色说明.md", 0], ["folder", "logo", 0]],
    "website-v2": [["folder", "src", 0], ["file", "package.json", 0]],
  },
  steps: [
    { id: "s1", name: ["读品牌指南和现有首屏", "Read the brand guide and the current hero"] },
    { id: "s2", name: ["定首屏结构：一句主张 + 一个主按钮", "Settle the hero: one claim + one primary button"] },
    { id: "s3", name: ["改 Hero.tsx 和样式", "Change Hero.tsx and styles"], subs: [["改结构和文案", "Structure and copy"], ["主色只用在按钮上", "Brand colour on the button only"]] },
    { id: "s4", name: ["跑测试和构建", "Run tests and build"] },
    { id: "s5", name: ["打开首页看一眼", "Open the home page and look"] },
  ],
  inserted: { id: "sx", name: ["先补一张移动端草图", "Sketch the mobile layout first"] },
};
