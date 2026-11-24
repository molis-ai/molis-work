import readNativeMarkdown from "./native-markdown.js";
import type {
  AgentManifest,
  AgentPromptText,
} from "@molis-ai/molis-work-contracts/platform/plugin-agent";

import { codingSkills } from "./skills.js";

const promptBody = (id: string) => readNativeMarkdown("prompts", id, ["en"]);


/**
 * Coding's roles and the prompts behind them.
 *
 * Roles are declared here and frozen by the Host before a Run starts; an
 * adapter never reads this file and never invents a role. The user-facing
 * wording is 讨论 / 规划 / 执行 — these internal ids are not shown.
 */

export const CODING_READER_ROLE = "reader";
export const CODING_PLANNER_ROLE = "planner";
export const CODING_REVIEWER_ROLE = "reviewer";
export const CODING_WRITER_ROLE = "writer";
export const CODING_BUILDER_ROLE = "builder";
export const CODING_COORDINATOR_ROLE = "coordinator";
export const CODING_WRITERS_ROLE = "writers";

/** Every role this Plugin offers. The user picks one per session. */
export const CODING_ROLE_IDS = [
  CODING_READER_ROLE,
  CODING_PLANNER_ROLE,
  CODING_REVIEWER_ROLE,
  CODING_WRITER_ROLE,
  CODING_BUILDER_ROLE,
  CODING_COORDINATOR_ROLE,
  CODING_WRITERS_ROLE,
] as const;

export type CodingRoleId = (typeof CODING_ROLE_IDS)[number];

export const codingAgentManifest: AgentManifest = {
  characters: { selection: "optional-role", scope: "owner", role_ids: ["reader", "planner", "reviewer", "writer", "builder"] },
  // A named child role brings the tools it declares, as far as its parent holds them (the user's "just give the tools"):
  // a parent that leaves one out of its dispatch list no longer fails the dispatch, and a child never exceeds its parent.
  subagents: { parent_role_ids: ["coordinator", "writers"], roles: [
    { role_id: "coding-reader", version: /* @version role.coding-reader */ 3, name: "代码调查", parent_role_ids: ["coordinator"], execution: "read-only", host_tools: ["ask-user", "read-file", "list", "search"] },
    // The independent reviewer may run checks such as tests in the main workspace; each command is a Host review and it has no file-writing tool.
    // It may read and wait on a background command its parent started (a long test run, say), without asking again and again.
    { role_id: "coding-reviewer", version: /* @version role.coding-reviewer */ 3, name: "独立评审", parent_role_ids: ["coordinator"], execution: "workspace-write", host_tools: ["ask-user", "read-file", "list", "search", "run-command", "command-output", "await-commands"] },
    { role_id: "coding-builder", version: /* @version role.coding-builder */ 3, name: "独立实现", parent_role_ids: ["writers"], execution: "workspace-write", host_tools: ["ask-user", "read-file", "list", "search", "write", "edit-file", "run-command"] },
  ] },
  mcp: true,
  compaction: { prompt_id: "coding-compaction", above_tokens: 12_000, window_ratio: 0.4 },
  // A writable round that called no tool has its last words checked against the round's facts (D1②): the person's
  // 2026-09-28 decision to continue an ending that only announces covers Coding too.
  ending_review: { prompt_id: "coding-ending-review" },
  skills: codingSkills.map(({ body: _body, body_by_locale: _localizedBodies, ...declaration }) => declaration),
  // acknowledge-inputs: every role the person talks to may say how it handles a supplement; the runtime keeps that as the AI's
  // claim on its own input ledger and shows the round each supplement's id only when it lists the tool (receipts 3e-0b).
  roles: [
    {
      role_id: CODING_PLANNER_ROLE, version: /* @version role.planner */ 2, name: "规划者", execution: "read-only",
      prompts: ["coding-base", "coding-planner"],
      host_tools: ["context-remaining", "find-tools", "list-mcp-resources", "read-mcp-resource", "ask-user", "acknowledge-inputs", "read-file", "list", "search", "find-symbol"],
    },
    {
      role_id: CODING_READER_ROLE,
      version: /* @version role.coding.main-reader */ 2,
      name: "阅读者",
      execution: "read-only",
      prompts: ["coding-base", "coding-reader"],
      // find-symbol: the official coding pack's symbol lookup, answered by the Host's language servers when the person configured one.
      host_tools: ["context-remaining", "find-tools", "list-mcp-resources", "read-mcp-resource", "ask-user", "acknowledge-inputs", "read-file", "list", "search", "find-symbol"],
    },
    {
      role_id: CODING_REVIEWER_ROLE,
      version: /* @version role.reviewer */ 2,
      name: "评审者",
      // Reviewing is reading with a different question in mind, so it stays
      // read-only: a reviewer that could edit would be fixing, not reviewing.
      execution: "read-only",
      prompts: ["coding-base", "coding-reviewer"],
      host_tools: ["context-remaining", "find-tools", "list-mcp-resources", "read-mcp-resource", "ask-user", "acknowledge-inputs", "read-file", "list", "search", "find-symbol"],
    },
    {
      role_id: CODING_COORDINATOR_ROLE,
      version: /* @version role.coordinator */ 2,
      name: "协作",
      // It holds run-command only so its independent reviewer can be given it: a subagent gets no tool its parent lacks.
      execution: "workspace-write",
      prompts: ["coding-base", "coding-coordinator"],
      // session-send: it may ask another session of the project, or answer one (they are neighbours on the project's board), without a review each time (the person's decision).
      // Background commands: started and stopped under review like any command; reading and waiting on them are reads.
      // board-read / board-report: held so its children can report the steps handed to them (a child never holds a tool its parent lacks).
      // find-symbol: the official coding pack's symbol lookup, for inspecting the main workspace before dispatching.
      host_tools: ["suggest-action", "context-remaining", "find-tools", "ask-user", "acknowledge-inputs", "read-file", "list", "search", "find-symbol", "run-command", "start-command", "command-output", "command-stop", "await-commands", "dispatch-subagent", "await-subagents", "steer-subagent", "board-read", "board-report", "session-send"],
    },
    {
      role_id: CODING_WRITERS_ROLE,
      version: /* @version role.writers */ 2,
      name: "并行写入",
      // Parallel writers work in their own worktrees; the parent itself only
      // reads and reports; integration is a separate reviewed Host operation.
      execution: "read-only",
      subagent_workspaces: "required",
      prompts: ["coding-base", "coding-writers"],
      host_tools: ["context-remaining", "ask-user", "acknowledge-inputs", "read-file", "list", "search", "find-symbol", "dispatch-subagent", "await-subagents", "steer-subagent", "board-read", "board-report", "session-send"],
    },
    {
      role_id: CODING_BUILDER_ROLE,
      version: /* @version role.builder */ 2,
      name: "构建者",
      // Edits and runs commands. Needs a Runtime that supports both under Host
      // approval, so it stays unavailable until one does.
      execution: "workspace-write",
      prompts: ["coding-base", "coding-builder", "coding-background"],
      // board-wait: the step waits on something outside (a result file, a read-only query's state) with the round over; a wait is a read.
      host_tools: ["suggest-action", "context-remaining", "find-tools", "list-mcp-resources", "read-mcp-resource", "ask-user", "acknowledge-inputs", "read-file", "list", "search", "find-symbol", "write", "edit-file", "run-command", "start-command", "command-output", "command-stop", "await-commands", "board-read", "board-report", "board-wait", "session-send"],
    },
    {
      role_id: CODING_WRITER_ROLE,
      version: /* @version role.writer */ 2,
      name: "改写者",
      // File-only work does not request command permission.
      execution: "text-edit",
      prompts: ["coding-base", "coding-writer"],
      host_tools: ["context-remaining", "find-tools", "list-mcp-resources", "read-mcp-resource", "ask-user", "acknowledge-inputs", "read-file", "list", "search", "find-symbol", "write", "edit-file", "session-send"],
    },
  ],
  prompts: [
    { prompt_id: "coding-planner", version: /* @version prompt.coding-planner */ 4 },
    { prompt_id: "coding-compaction", version: /* @version prompt.coding-compaction */ 2 },
    { prompt_id: "coding-ending-review", version: /* @version prompt.coding-ending-review */ 3 },
    // The product's own constraints, shared by every role. Its own layer so a
    // role's wording cannot quietly replace it.
    { prompt_id: "coding-base", version: /* @version prompt.coding-base */ 2, layer: "base" },
    { prompt_id: "coding-reader", version: /* @version prompt.coding-reader */ 3 },
    { prompt_id: "coding-writer", version: /* @version prompt.coding-writer */ 2 },
    { prompt_id: "coding-reviewer", version: /* @version prompt.coding-reviewer */ 3 },
    { prompt_id: "coding-builder", version: /* @version prompt.coding-builder */ 3 },
    { prompt_id: "coding-background", version: /* @version prompt.coding-background */ 2 },
    { prompt_id: "coding-coordinator", version: /* @version prompt.coding-coordinator */ 2 },
    { prompt_id: "coding-writers", version: /* @version prompt.coding-writers */ 2 },
  ],
};

/** The prompt bodies this package ships. The Host composes a role from these. */
export const codingPrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "coding-planner", version: /* @version prompt.coding-planner */ 4,
    ...promptBody("coding-planner"),
  },
  {
    prompt_id: "coding-compaction", version: /* @version prompt.coding-compaction */ 2,
    ...promptBody("coding-compaction"),
  },
  {
    prompt_id: "coding-ending-review", version: /* @version prompt.coding-ending-review */ 3,
    ...promptBody("coding-ending-review"),
  },
  {
    prompt_id: "coding-base",
    version: /* @version prompt.coding-base */ 2,
    layer: "base",
    ...promptBody("coding-base"),
  },
  {
    prompt_id: "coding-reader",
    version: /* @version prompt.coding-reader */ 3,
    ...promptBody("coding-reader"),
  },
  {
    prompt_id: "coding-writer",
    version: /* @version prompt.coding-writer */ 2,
    ...promptBody("coding-writer"),
  },
  {
    prompt_id: "coding-reviewer",
    version: /* @version prompt.coding-reviewer */ 3,
    ...promptBody("coding-reviewer"),
  },
  {
    prompt_id: "coding-builder",
    version: /* @version prompt.coding-builder */ 3,
    ...promptBody("coding-builder"),
  },
  {
    // Only for a role that holds the background command tools; the builder prompt is shared with a child that does not.
    prompt_id: "coding-background",
    version: /* @version prompt.coding-background */ 2,
    ...promptBody("coding-background"),
  },
  {
    prompt_id: "coding-coordinator", version: /* @version prompt.coding-coordinator */ 2,
    ...promptBody("coding-coordinator"),
  },
  {
    prompt_id: "coding-writers",
    version: /* @version prompt.coding-writers */ 2,
    ...promptBody("coding-writers"),
  },
];
