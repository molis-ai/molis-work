import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const methodBody = (id: string) => readLocalizedMarkdown(new URL("../methods/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


/**
 * Methods Pages offers to other Agents (the Assistant, a Character) for business work. Each is declared in the
 * Manifest's `methods` with the same id, version, name, summary and tools; the Host registers the body from here.
 */
export const pagesSkills: readonly AgentSkillDefinition[] = [
  {
    skill_id: "meeting-notes",
    version: /* @version method.meeting-notes */ 2,
    name: "会议纪要整理",
    summary: "把一段会议记录或一篇会议文档整理成结论、待办（谁、做什么、何时）和待定问题，每条注明依据；用户要时写成 Pages 文档。",
    tools: ["find-capabilities", "read-capability", "change-capability"],
    ...methodBody("meeting-notes"),
  },
];
