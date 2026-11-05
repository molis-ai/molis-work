// 13 · service & model connections — sample data only. Nothing here signs in, stores a key, calls a model or touches a Home.
// Every text is [zh, en].
window.protoData = {
  blocks: [
    ["direct", ["① 直接连接", "① Direct connect"]],
    ["advanced", ["② 高级配置", "② Advanced setup"]],
    ["return", ["③ 连好回到原处", "③ Back to where you were"]],
  ],
  plans: {
    direct: [
      ["A", ["A 按用途分组，就地展开", "A Grouped by use, expands in place"]],
      ["B", ["B 左边列表，右边详情", "B List on the left, detail on the right"]],
      ["C", ["C 服务卡片，连接时弹出", "C Service cards, a dialog to connect"]],
    ],
    advanced: [
      ["A", ["A 详情底部收起的「高级」", "A Collapsed “Advanced” at the bottom"]],
      ["B", ["B 详情里的「高级」页签", "B An “Advanced” tab in the detail"]],
      ["C", ["C 单独的「自定义连接」", "C A separate “Custom connection”"]],
    ],
    return: [
      ["A", ["A 在原处就地连", "A Connect right where you are"]],
      ["B", ["B 去连接页，带一条「回去」", "B Go to Connections, with a way back"]],
      ["C", ["C 盖在原处的侧板", "C A side sheet over where you are"]],
    ],
  },
  faults: [
    ["none", ["正常", "Normal"]],
    ["cancel", ["取消登录", "Sign-in cancelled"]],
    ["expired", ["登录失效", "Sign-in expired"]],
    ["switch", ["换账号", "Switch account"]],
    ["ratelimit", ["服务限流", "Rate limited"]],
    ["keyrej", ["密钥被拒", "Key refused"]],
  ],
  origins: [
    ["assistant", ["助理：看今天的 GitHub 通知", "Assistant: today’s GitHub notifications"]],
    ["feed", ["Feed：加 GitHub 通知来源", "Feed: add GitHub notifications"]],
    ["coding", ["Coding：推送要多一项权限", "Coding: pushing needs one more permission"]],
    ["images", ["Images：生成封面要图像模型", "Images: a cover needs an image model"]],
  ],
  // Groups are plain headings, as on the real 服务连接 page: plugins and services carry no identity colour (DESIGN.md).
  groups: [
    { id: "models", name: ["模型", "Models"] },
    { id: "code", name: ["代码与项目", "Code and projects"] },
    { id: "mail", name: ["邮件与日程", "Mail and calendar"] },
    { id: "docs", name: ["文档与笔记", "Docs and notes"] },
    { id: "chat", name: ["消息", "Messages"] },
  ],
  // way: browser = sign in in the browser; key = one key field; later = no default path yet (shown honestly).
  services: [
    { id: "minimax", group: "models", icon: "sparkles", name: ["MiniMax", "MiniMax"], way: "key",
      use: ["写作、整理、对话用的文字模型", "Text model for writing, summaries and chat"],
      can: [["对话和写作", "Chat and writing"], ["整理材料", "Summarise materials"], ["Coding 里写代码", "Write code in Coding"]],
      keyWhere: ["在 MiniMax 开放平台 › 接口密钥 里新建", "Create one under MiniMax platform › API keys"] },
    { id: "image", group: "models", icon: "image", name: ["图像模型（通义万相）", "Image model (Wanxiang)"], way: "key",
      use: ["生成和修改图片", "Make and edit images"],
      can: [["生成图片：1024×1024、1280×720", "Generate: 1024×1024, 1280×720"], ["按图修改", "Edit from an image"]],
      keyWhere: ["在阿里云百炼 › API-KEY 里新建", "Create one under Alibaba Model Studio › API-KEY"] },
    { id: "github", group: "code", name: ["GitHub", "GitHub"], way: "browser",
      use: ["通知、仓库和 PR", "Notifications, repositories and PRs"],
      can: [["读通知", "Read notifications"], ["看仓库和 PR", "See repositories and PRs"]],
      not: [["推送、评论、开 PR", "Push, comment, open PRs"], ["要用时再单独允许", "Allowed separately when needed"]] },
    { id: "linear", group: "code", name: ["Linear", "Linear"], way: "browser",
      use: ["任务和项目进度", "Issues and project progress"], can: [["读任务和项目", "Read issues and projects"]] },
    { id: "gmail", group: "mail", name: ["Gmail", "Gmail"], way: "later",
      use: ["读邮件、整理要回的", "Read mail and list what needs a reply"],
      later: ["还不能一键连接：Google 还在审核 Molis Work 的应用。可以先用自己的 Google 应用连接（高级）。", "Not one-click yet: Google is still reviewing the Molis Work app. You can use your own Google app (Advanced) meanwhile."] },
    { id: "notion", group: "docs", name: ["Notion", "Notion"], way: "browser",
      use: ["页面和数据库", "Pages and databases"], can: [["读你挑的页面", "Read the pages you pick"], ["在你挑的页面里写", "Write in the pages you pick"]] },
    { id: "feishu", group: "docs", name: ["飞书", "Feishu"], way: "later",
      use: ["文档、知识库和日程", "Docs, wiki and calendar"],
      later: ["只能连你自己企业的飞书：要管理员在飞书后台批准一次。", "Only your own company’s Feishu: an admin approves it once in the Feishu console."] },
    { id: "slack", group: "chat", name: ["Slack", "Slack"], way: "browser",
      use: ["频道和私信", "Channels and DMs"], can: [["看频道列表和成员", "See channels and members"]],
      not: [["读历史消息很慢", "Reading history is slow"], ["Slack 限制每分钟 1 次", "Slack allows 1 call a minute"]] },
  ],
  accounts: { github: ["yijunw0212", "molis-bot"], minimax: ["••••7f3a"] },
  usesOf: {
    github: [["inbox", ["Feed · GitHub 通知", "Feed · GitHub notifications"]], ["code", ["Coding · molis-work 仓库", "Coding · molis-work repo"]], ["sparkles", ["助理", "Assistant"]]],
    minimax: [["sparkles", ["助理", "Assistant"]], ["code", ["Coding", "Coding"]], ["wand", ["Alchemist", "Alchemist"]]],
  },
};
