// Sample data for the 03 mainline-switch prototype. All made up; nothing reads a real Home.
window.mlData = {
  project: "网站改版",
  groups: [
    { id: "now", name: "现在", nameEn: "Now" },
    { id: "next", name: "接下来", nameEn: "Next" },
    { id: "wait", name: "等别人", nameEn: "Waiting on others" },
  ],
  items: [
    {
      id: "release", name: "发布 v2", group: "now", pinned: true, source: "Goal", status: "progress", waiting: 2, running: false,
      last: "10 分钟前 · 验收卡补了依据", lastEn: "10 min ago · evidence added to the acceptance card",
      tabs: [{ id: "goal", kind: "goal", title: "发布 v2", owner: "Goals" }, { id: "notes", kind: "doc", title: "发布说明草稿", owner: "Pages" }],
      things: [
        { kind: "goal", title: "发布 v2", owner: "Goals", rel: "source" },
        { kind: "doc", title: "发布说明草稿", owner: "Pages", rel: "put" },
        { kind: "doc", title: "上线检查单", owner: "Pages", rel: "goal-material" },
        { kind: "coding", title: "修复登录跳转", owner: "Coding", rel: "plugin", running: true },
        { kind: "talk", title: "发布时间讨论", owner: "讨论", ownerEn: "Discussion", rel: "put" },
        { kind: "file", title: "旧版迁移说明.md", owner: "已不在", rel: "put", gone: "missing" },
        { kind: "doc", title: "", owner: "Pages", rel: "goal-material", gone: "denied" },
      ],
    },
    {
      id: "hero", name: "首页改版：换成新的首屏", group: "now", pinned: false, source: "Coding", status: "progress", waiting: 0, running: true,
      last: "正在改 Hero.tsx", lastEn: "Editing Hero.tsx",
      tabs: [{ id: "session", kind: "coding", title: "首页改版：换成新的首屏", owner: "Coding" }],
      things: [
        { kind: "coding", title: "首页改版：换成新的首屏", owner: "Coding", rel: "source", running: true },
        { kind: "file", title: "品牌指南 2026.pdf", owner: "项目资料", ownerEn: "Materials", rel: "put" },
        { kind: "note", title: "首屏文案三版", owner: "Shelf", rel: "put" },
      ],
    },
    {
      id: "pricing", name: "定价页文案", group: "next", pinned: false, source: null, status: null, waiting: 0, running: false,
      last: "昨天 · 放进了 2 份资料", lastEn: "Yesterday · 2 materials added",
      tabs: [{ id: "draft", kind: "doc", title: "定价页文案", owner: "Pages" }],
      things: [{ kind: "doc", title: "定价页文案", owner: "Pages", rel: "put" }, { kind: "file", title: "竞品调研.pdf", owner: "项目资料", ownerEn: "Materials", rel: "put" }],
    },
    {
      id: "interviews", name: "整理三份用户访谈", group: "next", pinned: false, source: "待办", sourceEn: "To-do", status: "waiting", waiting: 1, running: false,
      last: "2 天前 · 助理问你要访谈 03", lastEn: "2 days ago · the Assistant asked for interview 03",
      tabs: [{ id: "todo", kind: "todo", title: "整理三份用户访谈", owner: "待办", ownerEn: "To-do" }],
      things: [{ kind: "todo", title: "整理三份用户访谈", owner: "待办", ownerEn: "To-do", rel: "source" }, { kind: "file", title: "用户访谈 01.docx", owner: "项目资料", ownerEn: "Materials", rel: "put" }],
    },
    {
      id: "legal", name: "法务审条款", group: "wait", pinned: false, source: null, status: "waiting", waiting: 0, running: false,
      last: "周一 · 已发给法务", lastEn: "Monday · sent to legal",
      tabs: [{ id: "terms", kind: "doc", title: "服务条款 v2", owner: "Pages" }],
      things: [{ kind: "doc", title: "服务条款 v2", owner: "Pages", rel: "put" }],
    },
    {
      id: "brand", name: "品牌升级", group: "now", done: true, pinned: false, source: "Goal", status: "done", waiting: 0, running: false,
      last: "10-30 完成", lastEn: "Done 10-30",
      tabs: [{ id: "g2", kind: "goal", title: "品牌升级", owner: "Goals" }],
      things: [{ kind: "goal", title: "品牌升级", owner: "Goals", rel: "source" }],
    },
  ],
  recent: ["release", "hero", "pricing"],
};
