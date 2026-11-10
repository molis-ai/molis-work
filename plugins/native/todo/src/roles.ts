import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { BUSINESS_HOST_TOOLS, type AgentManifest, type AgentPromptText, type PluginMethodDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

const methodBody = (id: string) => readLocalizedMarkdown(new URL("../methods/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));
const promptBody = (id: string) => readLocalizedMarkdown(new URL("../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


export const TODO_ORGANIZER_ROLE = "organizer";

/**
 * 待办整理师: an optional specialist the Assistant can hand organizing to, or the person can pick. A business role: no
 * directory, only the unified actions it is given; every write still goes through the person's review.
 */
export const todoAgentManifest: AgentManifest = {
  roles: [
    // 3: `BUSINESS_HOST_TOOLS` added board-wait (#661) and acknowledge-inputs (#713); a round's frozen record names the version.
    { role_id: TODO_ORGANIZER_ROLE, version: /* @version role.organizer */ 1, name: "待办整理师", execution: "operate", workspace: "business",
      prompts: ["todo-organizer"], host_tools: [...BUSINESS_HOST_TOOLS] },
  ],
  prompts: [{ prompt_id: "todo-organizer", version: /* @version prompt.todo-organizer */ 2 }],
};

export const todoPrompts: readonly AgentPromptText[] = [
  {
    prompt_id: "todo-organizer",
    version: /* @version prompt.todo-organizer */ 2,
    ...promptBody("todo-organizer"),
  },
];

/**
 * Methods Todo offers to other Agents (the Assistant, 待办整理师 as a Character) for business work. Each is declared in
 * the Manifest's `methods` with the same id, version, name, summary, tools, description, when_to_use, when_not_to_use and
 * applies_to; the Host registers the body from here. `applies_to` is "assistant" because both methods work through the business
 * tools (read-capability, change-capability), which Coding's roles do not have and a method's tools never widen.
 */
export const todoSkills: readonly PluginMethodDefinition[] = [
  {
    skill_id: "todo-organize", version: /* @version method.todo-organize */ 2, name: "整理待办",
    summary: "从用户给的材料里找出要用户推进的事，与已有待办比对，存成等用户确认的整理结果；也用于“看看有没有遗漏的待办”（读最近新来的材料，不只看已有待办）和“这封邮件影响哪些安排”。",
    tools: ["find-capabilities", "read-capability", "change-capability", "ask-user"],
    description: "用户要从邮件、文件、会议记录、网页或当前页面里找出该做的事，或问“最近有没有遗漏的待办”“这封邮件会影响哪些安排”时用；结果先交给用户确认，不直接加进待办。",
    when_to_use: "手上有一份或一批材料，要从里面整理出待办；想查最近新来的材料里有没有漏掉的事；想知道一封邮件会改动哪些已有安排。",
    when_not_to_use: "要推进、跟进或起草某一件已经在待办里的事（用“推进待办”）；只是想新记一条待办、看待办列表或改某条待办的状态。",
    applies_to: "assistant",
    ...methodBody("todo-organize"),
  },
  {
    skill_id: "todo-advance", version: /* @version method.todo-advance */ 2, name: "推进待办",
    summary: "用户让你推进、跟进或帮忙做一件待办时用：弄清下一步和卡在哪里，能做的先做成草稿（会自动显示在这件待办上）；状态只提议、不擅改。",
    tools: ["find-capabilities", "read-capability", "change-capability", "ask-user"],
    description: "用户说“帮我推进这件事”“跟进一下”“这件怎么办”，或把一件待办交给助理处理时用；先弄清下一步和卡点，能做的先做成草稿，状态只提议、不擅自改。",
    when_to_use: "已经有一件具体的待办，用户想让助理帮着往前推：起草邮件或消息、整理要问的问题、写一页说明、安排时间或提醒。",
    when_not_to_use: "要从一批材料里找出新的待办（用“整理待办”）；只想看待办列表或直接改状态。",
    applies_to: "assistant",
    ...methodBody("todo-advance"),
  },
];
