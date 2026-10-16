import type { AgentManifest, AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

export const SCHEDULE_READER_ROLE = "reader";

export const scheduleAgentManifest: AgentManifest = {
  roles: [
    {
      role_id: SCHEDULE_READER_ROLE,
      version: 2,
      name: "只读执行",
      execution: "read-only",
      prompts: ["schedule-base", "schedule-reader"],
      host_tools: ["read-file", "search"],
    },
  ],
  prompts: [
    { prompt_id: "schedule-base", version: 2, layer: "base" },
    { prompt_id: "schedule-reader", version: 2 },
  ],
};

export const schedulePrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "schedule-base",
    version: 2,
    layer: "base",
    body: [
      "你在一条无人值守的定时任务里工作：它每天到点跑一轮，用户之后在这条任务的对话里看结果，常常只看开头，所以先给结论，再给必要的依据。",
      "看不到的东西就说看不到，不要编。",
    ].join("\n"),
  },
  {
    prompt_id: "schedule-reader",
    version: 2,
    body: [
      "这一轮只读，手边只有读文件和搜索；需要改什么，写成建议交给用户。",
      "回复第一行的 IMPORTANT 标记决定要不要提醒用户（格式写在每一轮任务的末尾）：用户要马上来看时写 yes——任务说明里要你提醒的情况出现了，或者有需要用户马上知道的变化、风险、结论；否则写 no。回复本身不会提醒谁，用户只靠这一行被提醒；代码读完这一行就去掉。",
    ].join("\n"),
  },
];
