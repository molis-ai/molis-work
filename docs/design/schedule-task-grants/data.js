// Made-up data for the batch-18 prototype. Nothing here reads a Home.
// A "category" is one provider plugin in the catalog with read-only (query) actions visible to agents in this project;
// the host builds the list from the catalog, so the names below are only examples (plan §3.2).
window.GRANT_DATA = {
  task: {
    id: "t-brief",
    title: { zh: "每日简报", en: "Daily brief" },
    time: "08:00",
    instructions: {
      zh: "每天 8 点，列出跟进日已到的在等事项，以及今天的日程和卡住的目标。",
      en: "Every day at 8, list waiting items whose follow-up date has come, today's schedule and any stuck goals.",
    },
  },
  categories: [
    { id: "todo", icon: "check", hue: "green", name: { zh: "待办", en: "To-dos" }, includes: { zh: "待办事项、截止与计划日期", en: "To-dos, due and planned dates" },
      caps: { zh: ["列出待办", "读一条待办"], en: ["List to-dos", "Read a to-do"] } },
    { id: "inbox", icon: "inbox", hue: "blue", name: { zh: "Inbox", en: "Inbox" }, includes: { zh: "收到的消息与待处理项", en: "Incoming messages and open items" },
      caps: { zh: ["列出待处理", "读一条消息"], en: ["List open items", "Read a message"] } },
    { id: "jelly", icon: "calendar", hue: "orange", name: { zh: "Jelly", en: "Jelly" }, includes: { zh: "日历与笔记（日程）", en: "Calendar and notes (schedule)" },
      caps: { zh: ["查日历", "查笔记"], en: ["Search calendar", "Search notes"] }, newCap: { zh: "读笔记全文", en: "Read a full note" } },
    { id: "schedule", icon: "timer", hue: "cyan", name: { zh: "Schedule", en: "Schedule" }, includes: { zh: "提醒（日程）", en: "Reminders (schedule)" },
      caps: { zh: ["列出提醒"], en: ["List reminders"] } },
    { id: "goals", icon: "target", hue: "mint", name: { zh: "Goals", en: "Goals" }, includes: { zh: "目标、要求与进展", en: "Goals, requirements and progress" },
      caps: { zh: ["列出目标", "读一个目标"], en: ["List goals", "Read a goal"] } },
    { id: "knowledge", icon: "library", hue: "", platform: true, name: { zh: "项目资料", en: "Project knowledge" }, includes: { zh: "项目里的文件与资料", en: "Files and notes in this project" },
      caps: { zh: ["搜索项目资料", "读一份资料"], en: ["Search project knowledge", "Read a document"] } },
  ],
  // What the task has today in the "normal" state.
  granted: ["todo", "jelly", "schedule", "goals"],
  others: [
    { id: "t-week", title: { zh: "周报草稿", en: "Weekly report draft" }, time: "17:30", day: { zh: "每周五", en: "Fridays" }, kind: "files", enabled: true, next: "11-07 17:30" },
    { id: "t-inbox", title: { zh: "Inbox 晨间整理", en: "Morning Inbox tidy" }, time: "07:45", kind: "data", enabled: false, next: "" },
  ],
  run: {
    when: "11-04 08:00",
    zh: "今天要处理的：\n· 在等：设计评审回复（跟进日 11-03，已过）\n· 日程：10:00 Atlas 周会，15:30 供应商电话\n· 卡住的目标：数据同步迁到 v3 接口（要求 2 没有进展 5 天）",
    en: "For today:\n· Waiting: design review reply (follow-up 11-03, overdue)\n· Schedule: 10:00 Atlas weekly, 15:30 vendor call\n· Stuck goal: Move data sync to the v3 API (requirement 2 idle for 5 days)",
    basis: { zh: "依据：待办 6 条、日历 2 项、提醒 1 条、Goals 3 个", en: "Based on: 6 to-dos, 2 calendar events, 1 reminder, 3 goals" },
    basisAfter: { zh: "依据：日历 3 项、提醒 1 条、Goals 3 个；待办没有授权", en: "Based on: 3 calendar events, 1 reminder, 3 goals; To-dos not allowed" },
    revokedNote: { zh: "没有授权读待办，这次没有列出待办里的事项。", en: "No permission to read To-dos, so this run lists nothing from To-dos." },
  },
};
