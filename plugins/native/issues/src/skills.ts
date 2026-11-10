import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import type { PluginMethodDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const methodBody = (id: string) => readLocalizedMarkdown(new URL("../methods/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));



/**
 * How the Assistant records and manages a person's Issues in a conversation. Only Issue's own rules are here, from the
 * same lines as the page's naming instruction (ISSUE-52, ISSUE-53); the page names its captures itself and never asks the
 * Assistant. Which tool reaches an action, and what happens when one is refused, is the gateway's to say.
 */
export const issuesSkills: readonly PluginMethodDefinition[] = [{
  skill_id: "issues-capture", version: /* @version method.issues-capture */ 2, name: "记录与管理个人问题",
  summary: "把用户在开发中遇到的问题记进个人 Issue：起标题、判类型、保存；也能查看、修改或删除。",
  // `applies_to` is "assistant": it records through the business tools, which Coding's roles do not have.
  // Method tools are a declaration (contracts SKILL_TOOLS); the Assistant's gateway also offers change-reversible.
  tools: ["suggest-action", "ask-user", "find-capabilities", "read-capability", "change-capability"],
  description: "用户在对话里说“记个 issue”“把这个问题记下来”，或要查看、修改、删除自己记过的个人问题时用；只记用户自己提出的问题，不分析原因，不给解决办法。",
  when_to_use: "用户明确要把一个问题记下来留存；用户要看、改或删已记的个人问题。",
  when_not_to_use: "用户要的是排查原因、修复问题或写解决方案；用户只是在描述问题而没有要记录的意思；要建团队共享的工单或任务。",
  applies_to: "assistant",
  ...methodBody("issues-capture"),
}];
