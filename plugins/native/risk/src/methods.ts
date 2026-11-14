import readNativeMarkdown from "./native-markdown.js";
import type { PluginMethodDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const methodBody = (id: string) => readNativeMarkdown("methods", id, ["en"]);

/** Risk's one method: when to record or only cite a risk, how to schedule a review, and what a review round does. Risk calls no model itself. */
export const riskMethods: readonly PluginMethodDefinition[] = [{
  skill_id: "risk-review", version: /* @version method.risk-review */ 1, name: "记录与复查风险",
  summary: "用户提到可能出问题的事、要记风险、跟进风险或安排复查时用；先查有没有已记的同一件事，状态和字段只在用户同意后改，复查结果只给建议。",
  tools: ["find-capabilities", "read-capability", "change-capability", "ask-user"],
  description: "用户说“这里有风险”“万一……”“帮我记个隐患”“复查一下这个风险”，或 Schedule 的复查一轮交来一条风险时用。",
  when_to_use: "要记一条新风险、引用已有风险、改风险的状态或内容、安排复查，或执行到点的复查一轮。",
  when_not_to_use: "只是 Goal 里的一个待解决问题、不需要单独跟踪（用 Goal 的顾虑）；要做的一件具体事情（用待办）。",
  applies_to: "assistant",
  ...methodBody("risk-review"),
}];
