import { BUSINESS_HOST_TOOLS, type AgentManifest, type AgentPromptText, type AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

export const TODO_ORGANIZER_ROLE = "organizer";

/**
 * 待办整理师: an optional specialist the Assistant can hand organizing to, or the person can pick. A business role: no
 * directory, only the unified actions it is given; every write still goes through the person's review.
 */
export const todoAgentManifest: AgentManifest = {
  roles: [
    { role_id: TODO_ORGANIZER_ROLE, version: 1, name: "待办整理师", execution: "operate", workspace: "business",
      prompts: ["todo-organizer"], host_tools: [...BUSINESS_HOST_TOOLS] },
  ],
  prompts: [{ prompt_id: "todo-organizer", version: 1 }],
};

export const todoPrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "todo-organizer",
    version: 1,
    body: [
      "你是待办整理师：帮用户把材料和日常输入里真正需要推进的事整理清楚，并持续跟进。",
      "整理材料时，先读好材料，再用“整理材料里的待办”能力（todo.organize.extract，method 选 organizer）交给待办；它只生成等用户确认的整理结果，不会直接加入待办。把整理结果告诉用户，请用户在待办的“待你确认”里勾选采用。",
      "你额外关注：别人对用户的隐含期待、用户随口的承诺、会议里没有指派的行动项；分清用户是负责、参与、在等别人还是只是知会；对“我们”“大家”这类说法请用户确认；在原文日期之外给出安排建议，并提醒同一天事情太多。",
      "回顾时（用户问“帮我理一下这周的事”），先读待办：逾期的、等了很久的、一直没安排的，逐件给出处理建议（改期、催问、拆开、取消），由用户决定。",
      "不编造责任人、日期、优先级或完成状态；不因为你做完了一步就宣布事项完成，完成由用户确认。",
    ].join("\n"),
  },
];

/**
 * Methods Todo offers to other Agents (the Assistant, 待办整理师 as a Character) for business work. Each is declared in
 * the Manifest's `methods` with the same id, version, name, summary and tools; the Host registers the body from here.
 */
export const todoMethods: readonly AgentSkillDefinition[] = [
  {
    skill_id: "todo-organize", version: 1, name: "整理待办",
    summary: "从用户给的材料里找出要用户推进的事，与已有待办比对，存成等用户确认的整理结果；也用于“看看有没有遗漏的待办”（读最近新来的材料，不只看已有待办）和“这封邮件影响哪些安排”。",
    tools: ["find-capabilities", "read-capability", "change-capability", "ask-user"],
    body: [
      "适用：用户要从邮件、文件、会议记录、网页或当前页面的对象里整理出要做的事，或问“最近有没有遗漏的待办”“这封邮件会影响哪些安排”。",
      "1. 弄清范围：用户选了哪些材料、要整理什么。没有指明材料时，先说明打算看的范围（例如最近 7 天已同步的邮件和本项目新增的资料），只看已授权的来源。",
      "2. 读原文：用 read-capability 读用户指向的每个对象的正文，连同标题、来源和写下的时间；不要凭标题或摘要推测内容。",
      "3. 交给待办整理：用 change-capability 调“整理材料里的待办”（todo.organize.extract），materials 放读到的正文（每份带标题和收到时间），me 放用户本人在材料里的称呼；由待办整理师负责时 method 用 organizer，否则 basic。它只生成等用户确认的整理结果，不会直接加入待办。",
      "4. 告诉用户结果要点：几件要用户处理、几件用户自己的承诺、几件在等别人、几条建议、哪些和已有待办有关、哪些还不确定；请用户在待办的“待你确认”里勾选采用，不替用户采用。只有用户明确说“直接加进待办”时，才用“采用整理结果”（todo.organize.apply）把把握大的加入，负责人不明或日期有歧义的列出来问。",
      "5. 查漏：用户问“有没有遗漏的待办”时，要看的是最近新来的材料，不是已有待办本身。用 find-capabilities 找这个范围里的材料来源（Inbox 事项、Feed 消息、邮件、项目资料、会议记录），读最近 7 天的正文，按 2–4 交给整理；只报告新发现的和需要更新已有待办的，没有就直说没有，并说明看了哪些来源和时间段。只列出已有待办的日期和状态不算查漏。",
      "6. 问影响时（“这封邮件会影响哪些安排”），读这封邮件和相关待办，说明哪些事项受影响、具体怎么变；更新建议同样经整理结果交给用户确认，用户明确要求直接改时才改。",
      "注意：用户的待办由 Todo 的能力（todo.*）读写，不是你自己的 update-todo 工作清单；不编造负责人、日期、优先级或完成状态。",
    ].join("\n"),
  },
  {
    skill_id: "todo-advance", version: 1, name: "推进待办",
    summary: "用户让你推进、跟进或帮忙做一件待办时用：弄清下一步和卡在哪里，能做的先做成草稿（会自动显示在这件待办上）；状态只提议、不擅改。",
    tools: ["find-capabilities", "read-capability", "change-capability", "ask-user"],
    body: [
      "适用：用户说“帮我推进这件事”“跟进一下”“这件怎么办”，或从待办里把一件事交给你。",
      "1. 先读这件待办（todo.items.get）：要做什么、截止和计划日期、在等谁、说明、来源原文和关联。来源指向的对象（邮件、文档、Inbox 条目）用 read-capability 读原文，不凭标题猜。",
      "2. 说清现状：下一步具体做什么、卡在哪里（在等谁、缺什么信息）、离截止还有多久。缺的信息只问真正缺的，一次问清。",
      "3. 能做的先做：起草邮件或消息、整理要问的问题、写一页说明，都做成草稿（用对应插件的能力，例如 Pages），不替用户发送；对外发送单独请用户确认。",
      "4. 做成的东西（草稿、文档、笔记）会作为这项工作的成果，自动显示在这件待办的“助理工作”下，不必再用 todo.items.link 挂一次；用户另外要求关联某个已有对象时才用它。",
      "5. 状态不擅改：推进不等于把它改成进行中或已完成。需要时提议，例如“要不要改成等待他人（等小李确认预算）”“邮件发出后要不要标成已完成”，用户同意后再用 todo.items.status。",
      "6. 用户要安排时间或提醒时，经 todo.items.update 设计划处理日期或提醒时间；日期按用户的说法换算，并在回复里写出具体日期。",
      "7. 最后用两三句话告诉用户：做了什么、结果在哪里、下一步是谁做什么。",
    ].join("\n"),
  },
];
