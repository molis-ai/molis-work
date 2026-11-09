import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const methodBody = (id: string) => readLocalizedMarkdown(new URL("../methods/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));



/**
 * How the Assistant records and manages a person's Issues in a conversation. Only Issue's own rules are here, from the
 * same lines as the page's naming instruction (ISSUE-52, ISSUE-53); the page names its captures itself and never asks the
 * Assistant. Which tool reaches an action, and what happens when one is refused, is the gateway's to say.
 */
export const issuesSkills: readonly AgentSkillDefinition[] = [{
  skill_id: "issues-capture", version: /* @version method.issues-capture */ 2, name: "记录与管理个人问题",
  summary: "把用户在开发中遇到的问题记进个人 Issue：起标题、判类型、保存；也能查看、修改或删除。",
  // Method tools are a declaration (contracts SKILL_TOOLS); the Assistant's gateway also offers change-reversible.
  tools: ["suggest-action", "ask-user", "find-capabilities", "read-capability", "change-capability"],
  ...methodBody("issues-capture"),
}];
