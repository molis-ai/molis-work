import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginMethodDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const methodBody = (id: string) => readLocalizedMarkdown(new URL("../methods/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


/**
 * Methods Pages offers to other Agents (the Assistant, a Character) for business work. Each is declared in the
 * Manifest's `methods` with the same id, version, name, summary, tools, description, when_to_use, when_not_to_use and applies_to;
 * the Host registers the body from here. `applies_to` is "assistant": it works through the business tools Coding's roles lack.
 */
export const pagesSkills: readonly PluginMethodDefinition[] = [
  {
    skill_id: "meeting-notes",
    version: /* @version method.meeting-notes */ 2,
    name: "会议纪要整理",
    summary: "把一段会议记录或一篇会议文档整理成结论、待办（谁、做什么、何时）和待定问题，每条注明依据；用户要时写成 Pages 文档。",
    tools: ["find-capabilities", "read-capability", "change-capability"],
    description: "用户给了一段会议记录或一篇会议文档，要整理成一份能照着执行的纪要时用：结论、待办（谁、做什么、何时）和待定问题，每条注明原文依据；用户要时再写成文档。",
    when_to_use: "手上有会议的原始记录、转写或笔记，要整理成结论、待办和待定问题。",
    when_not_to_use: "要把会议里的待办直接加进待办列表（用“整理待办”）；要写的不是会议纪要，或只想总结一篇普通文章。",
    applies_to: "assistant",
    ...methodBody("meeting-notes"),
  },
];
