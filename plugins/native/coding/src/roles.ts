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
export const CODING_REVIEWER_ROLE = "reviewer";
export const CODING_WRITER_ROLE = "writer";
export const CODING_BUILDER_ROLE = "builder";
export const CODING_COORDINATOR_ROLE = "coordinator";
export const CODING_WRITERS_ROLE = "writers";

/** Every role this Plugin offers. The user picks one per session. */
export const CODING_ROLE_IDS = [
  CODING_READER_ROLE,
  CODING_REVIEWER_ROLE,
  CODING_WRITER_ROLE,
  CODING_BUILDER_ROLE,
  CODING_COORDINATOR_ROLE,
  CODING_WRITERS_ROLE,
] as const;

export type CodingRoleId = (typeof CODING_ROLE_IDS)[number];

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
      role_id: CODING_REVIEWER_ROLE,
      version: 1,
      name: "评审者",
      // Reviewing is reading with a different question in mind, so it stays
      // read-only: a reviewer that could edit would be fixing, not reviewing.
      execution: "read-only",
      prompts: ["coding-base", "coding-reviewer"],
      host_tools: ["read-file", "search"],
    },
    {
      role_id: CODING_COORDINATOR_ROLE,
      version: 1,
      name: "协调者",
      // A read-only parent that dispatches children, each into its own
      // directory. The Host enforces that; a writable parent could not.
      execution: "read-only",
      subagent_workspaces: "required",
      prompts: ["coding-base", "coding-coordinator"],
      host_tools: ["read-file", "search"],
    },
    {
      role_id: CODING_WRITERS_ROLE,
      version: 1,
      name: "并行写入",
      // Parallel writers work in their own worktrees; the parent itself only
      // reads and then integrates what the user picked.
      execution: "read-only",
      subagent_workspaces: "required",
      prompts: ["coding-base", "coding-writers"],
      host_tools: ["read-file", "search"],
    },
    {
      role_id: CODING_BUILDER_ROLE,
      version: 1,
      name: "构建者",
      // Edits and runs commands. Needs a Runtime that supports both under Host
      // approval, so it stays unavailable until one does.
      execution: "workspace-write",
      prompts: ["coding-base", "coding-builder"],
      host_tools: ["read-file", "search", "edit-file", "run-command"],
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
    // The product's own constraints, shared by every role. Its own layer so a
    // role's wording cannot quietly replace it.
    { prompt_id: "coding-base", version: 1, layer: "base" },
    { prompt_id: "coding-reader", version: 1 },
    { prompt_id: "coding-writer", version: 1 },
    { prompt_id: "coding-reviewer", version: 1 },
    { prompt_id: "coding-builder", version: 1 },
    { prompt_id: "coding-coordinator", version: 1 },
    { prompt_id: "coding-writers", version: 1 },
  ],
};

/** The prompt bodies this package ships. The Host composes a role from these. */
export const codingPrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "coding-base",
    version: 1,
    layer: "base",
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
  {
    prompt_id: "coding-reviewer",
    version: 1,
    body: [
      "这一轮你在评审，不在修。指出问题、给出依据，不要顺手改掉。",
      "说清每条意见针对哪个文件哪一段，以及不改会怎样。",
    ].join("\n"),
  },
  {
    prompt_id: "coding-builder",
    version: 1,
    body: [
      "这一轮你可以改文件、也可以跑命令，但每一处写入和每一条命令都要经用户批准。",
      "批准之前不要把改动或命令结果说成已经发生。",
    ].join("\n"),
  },
  {
    prompt_id: "coding-coordinator",
    version: 1,
    body: [
      "这一轮你自己不改文件，只拆任务、派给子代理、再汇总。",
      "每个子任务要能独立验收：说清做完之后怎么判断它做对了。",
      "子代理的结论不等于验收通过，最终由用户判断。",
    ].join("\n"),
  },
  {
    prompt_id: "coding-writers",
    version: 1,
    body: [
      "这一轮有多个写入者各自在独立工作树里改同一件事的不同部分。",
      "你负责分派与汇总，自己不直接改主工作区。",
      "汇总时说清每个写入者改了什么、彼此有没有冲突。",
    ].join("\n"),
  },
];
