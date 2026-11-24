import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { BUSINESS_HOST_TOOLS, BUSINESS_SUBAGENT_HOST_TOOLS, type AgentManifest, type AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const setupChecker = /* @version checker.molis.connector-setup "molis.connector-setup@{version}" */ "molis.connector-setup@1";
const readyChecker = /* @version checker.molis.connection-ready "molis.connection-ready@{version}" */ "molis.connection-ready@1";
const promptBody = (id: string) => readLocalizedMarkdown(new URL("../../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8")
  .replaceAll("{{connector_setup_checker}}", setupChecker).replaceAll("{{connection_ready_checker}}", readyChecker));


export const ASSISTANT_ROLE_ID = "assistant";
/** A work another work delegated: it runs on the same base, with what being a part of another work means. */
export const ASSISTANT_DELEGATED_ROLE_ID = "assistant-delegated";
/** The Assistant in the standing main conversation of a scope. */
export const ASSISTANT_MAIN_ROLE_ID = "assistant-main";
/** A round in a main conversation that only reports a task no conversation started (`reports_to: "assistant"`): it reads, nothing else. */
export const ASSISTANT_REPORT_ROLE_ID = "assistant-report";

export const ASSISTANT_PROMPTS: AgentPromptText[] = [
  { prompt_id: "assistant-thread", version: /* @version prompt.assistant-thread */ 2, layer: "base", ...promptBody("assistant-thread") },
  { prompt_id: "assistant-base", version: /* @version prompt.assistant-base */ 5, layer: "base", ...promptBody("assistant-base") },
  { prompt_id: "assistant-work", version: /* @version prompt.assistant-work */ 4, layer: "role", ...promptBody("assistant-work") },
  { prompt_id: "assistant-delegated", version: /* @version prompt.assistant-delegated */ 2, layer: "role", ...promptBody("assistant-delegated") },
  { prompt_id: "assistant-main", version: /* @version prompt.assistant-main */ 1, layer: "role", ...promptBody("assistant-main") },
  { prompt_id: "assistant-compaction", version: /* @version prompt.assistant-compaction */ 2, ...promptBody("assistant-compaction") },
  { prompt_id: "assistant-ending-review", version: /* @version prompt.assistant-ending-review */ 3, ...promptBody("assistant-ending-review") },
];

/**
 * One business role. It runs with no directory; its real work is the unified actions the Host gives it for the
 * work's scope, queries directly and commands under the effect policy.
 */
export const ASSISTANT_AGENT: AgentManifest = {
  prompts: [{ prompt_id: "assistant-thread", version: /* @version prompt.assistant-thread */ 2, layer: "base" }, { prompt_id: "assistant-base", version: /* @version prompt.assistant-base */ 5, layer: "base" }, { prompt_id: "assistant-work", version: /* @version prompt.assistant-work */ 4, layer: "role" }, { prompt_id: "assistant-delegated", version: /* @version prompt.assistant-delegated */ 2, layer: "role" }, { prompt_id: "assistant-main", version: /* @version prompt.assistant-main */ 1, layer: "role" }, { prompt_id: "assistant-compaction", version: /* @version prompt.assistant-compaction */ 2 }, { prompt_id: "assistant-ending-review", version: /* @version prompt.assistant-ending-review */ 3 }],
  // A long work keeps what it needs when its history grows past the window: the runtime picks passages, it never rewrites them.
  // The runtime counts the whole context, this round's lookups and readings included: at 16,000 almost every first round
  // (25–33k with its capability lookups) paid for a compaction it did not need.
  compaction: { prompt_id: "assistant-compaction", above_tokens: 48_000 },
  ending_review: { prompt_id: "assistant-ending-review" },
  // A round freezes the current role and tools together; the unified origin starts their current declarations at version 1.
  roles: [{ role_id: "thread-reply", version: /* @version role.thread-reply */ 1, name: "评论中的个人助理", workspace: "business", execution: "read-only", prompts: ["assistant-thread"], host_tools: [] }, {
    role_id: ASSISTANT_ROLE_ID, version: /* @version role.assistant */ 1, name: "个人工作助理", workspace: "business", execution: "operate",
    prompts: ["assistant-base", "assistant-work"], host_tools: [...BUSINESS_HOST_TOOLS, ...BUSINESS_SUBAGENT_HOST_TOOLS],
  }, {
    // The standing conversation of a scope (specs/work-line §3.2): the same role, with how a main conversation answers first,
    // puts long work in the background, says where it went and takes results back. Which work is one is the Host's record.
    role_id: ASSISTANT_MAIN_ROLE_ID, version: /* @version role.assistant-main */ 1, name: "主对话里的个人助理", workspace: "business", execution: "operate",
    prompts: ["assistant-base", "assistant-work", "assistant-main"], host_tools: [...BUSINESS_HOST_TOOLS, ...BUSINESS_SUBAGENT_HOST_TOOLS],
  }, {
    // A report of a task no conversation started (specs/work-line contract-design §9): read-only execution (queries only,
    // a browser only looked at), no host tools, and only the base prompt (no delegate/memory/main-work tool hints).
    role_id: ASSISTANT_REPORT_ROLE_ID, version: /* @version role.assistant-report */ 2, name: "主对话里的汇报", workspace: "business", execution: "read-only",
    prompts: ["assistant-base"], host_tools: [],
  }, {
    // Delegating one level deep, and keeping or forgetting on the person's words, are the Host's checks on the work itself
    // (`assistant-delegation.ts`, `assistant-memory-tools.ts`); this role carries only what being delegated means for the reply.
    role_id: ASSISTANT_DELEGATED_ROLE_ID, version: /* @version role.assistant-delegated */ 1, name: "委派的子任务", workspace: "business", execution: "operate",
    prompts: ["assistant-base", "assistant-delegated"], host_tools: [...BUSINESS_HOST_TOOLS],
  }],
  subagents: { parent_role_ids: [ASSISTANT_ROLE_ID, ASSISTANT_MAIN_ROLE_ID], roles: [
    { role_id: ASSISTANT_DELEGATED_ROLE_ID, version: /* @version prompt.assistant-delegated */ 2, name: "委派的子任务", execution: "operate", host_tools: [...BUSINESS_HOST_TOOLS] },
  ] },
  // The Host freezes the chosen Character version in the work's own scope.
  characters: { selection: "optional-role", scope: "owner", role_ids: [ASSISTANT_ROLE_ID, ASSISTANT_MAIN_ROLE_ID, ASSISTANT_DELEGATED_ROLE_ID] },
};
