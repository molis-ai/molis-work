import type {
  AgentManifest,
  AgentPromptText,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";

/**
 * Coding's roles and the prompts behind them.
 *
 * Roles are declared here and frozen by the Host before a Run starts; an
 * adapter never reads this file and never invents a role. The user-facing
 * wording is 讨论 / 规划 / 执行 — these internal ids are not shown.
 */

export const CODING_READER_ROLE = "reader";
export const CODING_WRITER_ROLE = "writer";

export const codingAgentManifest: AgentManifest = {
  roles: [
    {
      role_id: CODING_READER_ROLE,
      version: 1,
      name: "阅读者",
      execution: "read-only",
      prompts: ["coding-base", "coding-reader"],
      host_tools: ["read-file", "search"],
    },
    {
      role_id: CODING_WRITER_ROLE,
      version: 1,
      name: "改写者",
      // Edits files, does not run commands. `workspace-write` would also demand
      // `command`, which no Runtime supports honestly today.
      execution: "text-edit",
      prompts: ["coding-base", "coding-writer"],
      host_tools: ["read-file", "search", "edit-file"],
    },
  ],
  prompts: [
    { prompt_id: "coding-base", version: 1 },
    { prompt_id: "coding-reader", version: 1 },
    { prompt_id: "coding-writer", version: 1 },
  ],
};

/** The prompt bodies this package ships. The Host composes a role from these. */
export const codingPrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "coding-base",
    version: 1,
    body: [
      "你在一个已经授权的工作区里工作，只能读这个目录里的文件。",
      "回答要具体到文件和行，不要泛泛而谈。看不到的东西就说看不到，不要猜测文件内容。",
      "用户看到的是结论，不是你的推理过程：先说发现了什么，再说建议怎么改。",
    ].join("\n"),
  },
  {
    prompt_id: "coding-reader",
    version: 1,
    body: [
      "这一轮你只读不改。给出的是建议，不是已经发生的改动。",
      "不要说「我已经修好了」——你没有写入权限，这么说是不准确的。",
    ].join("\n"),
  },
  {
    prompt_id: "coding-writer",
    version: 1,
    body: [
      "这一轮你可以改文件，但每一处写入都要经用户批准才会真的落盘。",
      "批准之前不要把改动说成已完成。一次只提一组相关的改动，便于用户逐条看。",
    ].join("\n"),
  },
];
