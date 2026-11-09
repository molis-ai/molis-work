import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentManifest, AgentPromptText } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


export const SCHEDULE_READER_ROLE = "reader";
/**
 * A task the person let read business data (a task grant subject with categories, specs/proactive-assistant/schedule-task-reads.md
 * §3.6): no directory, only the read-only actions the catalog gives this one task. Which role a round runs is decided when it is
 * due, from the platform's grants; the task itself stores no kind.
 */
export const SCHEDULE_BRIEF_ROLE = "brief";


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
    { prompt_id: "schedule-base", version: /* @version prompt.schedule-base */ 2, layer: "base" },
    { prompt_id: "schedule-reader", version: /* @version prompt.schedule-reader */ 2 },
    { prompt_id: "schedule-brief", version: /* @version prompt.schedule-brief */ 2 },
  ],
};

export const schedulePrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "schedule-base",
    version: /* @version prompt.schedule-base */ 2,
    layer: "base",
    ...promptBody("schedule-base"),
  },
  {
    prompt_id: "schedule-reader",
    version: /* @version prompt.schedule-reader */ 2,
    ...promptBody("schedule-reader"),
  },
  {
    prompt_id: "schedule-brief",
    version: /* @version prompt.schedule-brief */ 2,
    ...promptBody("schedule-brief"),
  },
];
