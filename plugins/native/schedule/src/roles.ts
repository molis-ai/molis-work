import type { AgentManifest, AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

export const SCHEDULE_READER_ROLE = "reader";
/**
 * A task the person let read business data (a task grant subject with categories, specs/proactive-assistant/schedule-task-reads.md
 * §3.6): no directory, only the read-only actions the catalog gives this one task. Which role a round runs is decided when it is
 * due, from the platform's grants; the task itself stores no kind.
 */
export const SCHEDULE_BRIEF_ROLE = "brief";

/** When to answer yes, and what the first line is for: the same words in both roles, so the parser reads the same mark. */
const IMPORTANT_MARK = "回复第一行的 IMPORTANT 标记决定要不要提醒用户（格式写在每一轮任务的末尾）：用户要马上来看时写 yes——任务说明里要你提醒的情况出现了，或者有需要用户马上知道的变化、风险、结论；否则写 no。回复本身不会提醒谁，用户只靠这一行被提醒；代码读完这一行就去掉。";

export const scheduleAgentManifest: AgentManifest = {
  roles: [
    {
      role_id: SCHEDULE_READER_ROLE,
      version: /* @version role.schedule.reader */ 1,
      name: "只读执行",
      execution: "read-only",
      prompts: ["schedule-base", "schedule-reader"],
      host_tools: ["read-file", "search"],
    },
    {
      role_id: SCHEDULE_BRIEF_ROLE,
      version: /* @version role.brief */ 1,
      name: "读数据执行",
      execution: "read-only",
      workspace: "business",
      prompts: ["schedule-base", "schedule-brief"],
      host_tools: [],
    },
  ],
  prompts: [
    { prompt_id: "schedule-base", version: /* @version prompt.schedule-base */ 1, layer: "base" },
    { prompt_id: "schedule-reader", version: /* @version prompt.schedule-reader */ 1 },
    { prompt_id: "schedule-brief", version: /* @version prompt.schedule-brief */ 1 },
  ],
};

export const schedulePrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "schedule-base",
    version: /* @version prompt.schedule-base */ 1,
    layer: "base",
    body: [
      "你在一条无人值守的定时任务里工作：它每天到点跑一轮，用户之后在这条任务的对话里看结果，常常只看开头，所以先给结论，再给必要的依据。",
      "看不到的东西就说看不到，不要编。",
    ].join("\n"),
  },
  {
    prompt_id: "schedule-reader",
    version: /* @version prompt.schedule-reader */ 1,
    body: [
      "这一轮只读，手边只有读文件和搜索；需要改什么，写成建议交给用户。",
      IMPORTANT_MARK,
    ].join("\n"),
  },
  {
    prompt_id: "schedule-brief",
    version: /* @version prompt.schedule-brief */ 1,
    body: [
      "这一轮只读，没有项目文件：手边只有用户允许这条任务读的那几类数据。先在能力目录里查能读什么，再用查到的只读能力去读；需要改什么，写成建议交给用户。",
      "任务说明要的某一类在目录里找不到、或者读的时候被拒绝，就在回复里直接说这一类读不到，不拿别的内容代替，也不猜。",
      "正文最后一行写出依据：读了哪几类、各多少条。",
      IMPORTANT_MARK,
    ].join("\n"),
  },
];
