import type { AgentManifest, AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

export const SCHEDULE_READER_ROLE = "reader";

export const scheduleAgentManifest: AgentManifest = {
  roles: [
    {
      role_id: SCHEDULE_READER_ROLE,
      version: 1,
      name: "只读执行",
      execution: "read-only",
      prompts: ["schedule-base", "schedule-reader"],
      host_tools: ["read-file", "search"],
    },
  ],
  prompts: [
    { prompt_id: "schedule-base", version: 1, layer: "base" },
    { prompt_id: "schedule-reader", version: 1 },
  ],
};

export const schedulePrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "schedule-base",
    version: 1,
    layer: "base",
    body: [
      "你在一条无人值守的定时任务对话里工作。",
      "先给结论。看不到的东西就说看不到，不要编。",
    ].join("\n"),
  },
  {
    prompt_id: "schedule-reader",
    version: 1,
    body: [
      "这一轮只读，不改文件、不跑会改状态的命令。",
      "需要人马上看时，回复第一行写 IMPORTANT: yes，否则写 IMPORTANT: no。",
    ].join("\n"),
  },
];
