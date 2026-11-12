import { readFileSync } from "node:fs";
import { readLocalizedMarkdown } from "@molis-ai/molis-work-plugin-sdk";
import { defineInstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";

const promptBody = (id: string) => readLocalizedMarkdown(new URL("../../prompts/", import.meta.url), id, ["en"], file => readFileSync(file, "utf8"));


/** Prompts the Host itself sends outside any Plugin manifest. A leaf module: the register and the callers both import it. */
/** Project onboarding reads imported materials in parts and proposes a project to continue from. */
export const ONBOARDING_OWNER = "system:onboarding";

export const ONBOARDING_NOTES = defineInstructionPrompt({
  owner_id: ONBOARDING_OWNER, prompt_id: "onboarding.notes", version: /* @version prompt.onboarding.notes */ 2, title: "分批读材料",
  purpose: "导入的材料较多时，逐批提取与工作有关的主题、日期、进展、待办、冲突和缺失信息", used_by: ["项目上手"],
  ...promptBody("onboarding.notes"),
});

export const ONBOARDING_PROPOSAL = defineInstructionPrompt({
  owner_id: ONBOARDING_OWNER, prompt_id: "onboarding.proposal", version: /* @version prompt.onboarding.proposal */ 2, title: "项目建议",
  purpose: "把已有材料整理成一个能继续工作的项目建议：背景、进展、下一步与待确认事项", used_by: ["项目上手"],
  ...promptBody("onboarding.proposal"),
});

/** The information helper proposes one confirmable action over Feed and Inbox. */
export const INFORMATION_PLANNER = defineInstructionPrompt({
  owner_id: "system:information", prompt_id: "information.plan", version: /* @version prompt.information.plan */ 2, title: "信息处理方案",
  purpose: "根据用户请求，为 Feed 来源起草筛选规则，或为 Inbox 条目填写写作要求；只提出一个待确认的动作", used_by: ["信息助手"],
  ...promptBody("information.plan"),
});

/** The platform memory draws out, when a work ends, what may be worth keeping (specs/archive/memory-system §6.1). It only proposes. */
const MEMORY_OWNER = "system:memory";
export const MEMORY_EXTRACT = defineInstructionPrompt({
  owner_id: MEMORY_OWNER, prompt_id: "memory.extract", version: /* @version prompt.memory.extract */ 3, title: "从工作里提炼记忆",
  purpose: "一项工作结束时，从用户本人的话里找出值得长期记住的偏好、项目约定和经验，只提议，由写入门决定记不记", used_by: ["平台记忆"],
  ...promptBody("memory.extract"),
});

/** Upkeep asks for possible duplicates and contradictions among one scope's memories; the person decides each pair. */
export const MEMORY_TIDY = defineInstructionPrompt({
  owner_id: MEMORY_OWNER, prompt_id: "memory.tidy", version: /* @version prompt.memory.tidy */ 2, title: "整理记忆：找重复与冲突",
  purpose: "定期整理时，在同一范围的记忆里找出意思相同或互相矛盾的两两一对，交给用户选择保留哪条", used_by: ["平台记忆"],
  ...promptBody("memory.tidy"),
});

/**
 * The two questions the selection bar puts to the judgment service (Jev) when something is selected: what the person most likely wants
 * to do next, and whether the Assistant should take part. The default text is the kernel's (`DEFAULT_JUDGMENT_WORDING`, which the
 * evaluation of 2026-09-30 settled); the person edits it here. The program keeps the opening, the hint for what the person is doing, the
 * option keys, the five forms of the Assistant and the declaration that the material is not instruction.
 */
const CONTEXTUAL_OWNER = "system:contextual";
export const CONTEXTUAL_NEXT = defineInstructionPrompt({
  owner_id: CONTEXTUAL_OWNER, prompt_id: "contextual.next", version: /* @version prompt.contextual.next */ 2, title: "选区推荐：下一步",
  purpose: "选中内容后，请判断服务选出用户此刻最可能要做的一件事。程序会在最前面加上“用户在文档里选中了……想对它做一件事。”，并在第一段与第二段之间的空行处，按选中的范围或正在做的事加一句提示；没有空行时，提示放在最后",
  used_by: ["选区旁推荐"],
  ...promptBody("contextual.next"),
});
export const CONTEXTUAL_SURFACE = defineInstructionPrompt({
  owner_id: CONTEXTUAL_OWNER, prompt_id: "contextual.surface", version: /* @version prompt.contextual.surface */ 2, title: "选区推荐：助手要不要出面",
  purpose: "选中内容后，请判断服务决定助手是否以及以什么形式参与（不打扰、建议、选项、预览、比较）；这五种形式的说明由程序给出，不在这里改",
  used_by: ["选区旁推荐"],
  ...promptBody("contextual.surface"),
});

/**
 * What the drafting model is told when the person sends what they have in hand to a creation entry (quick-create §5): the entry's input
 * is the form, the passage is the material, and the answer is the text and date fields. The data after it is always material, never
 * instruction; the person edits only the words here, not that boundary.
 */
export const CONTEXTUAL_DRAFT = defineInstructionPrompt({
  owner_id: CONTEXTUAL_OWNER, prompt_id: "contextual.draft", version: /* @version prompt.contextual.draft */ 2, title: "放进去处：起草",
  purpose: "把选中的内容或用户写的一句话放进某个去处（待办、灵光…）时，请模型把它整理成新记录的文字和日期字段；只填材料里有的，拿不准的留空",
  used_by: ["放进去处", "一句话新建"],
  ...promptBody("contextual.draft"),
});

/** Project knowledge writes a card and section notes for each piece, for finding it later (specs/project-knowledge §5). */
const KNOWLEDGE_OWNER = "system:knowledge";
export const KNOWLEDGE_ORGANIZE = defineInstructionPrompt({
  owner_id: KNOWLEDGE_OWNER, prompt_id: "knowledge.organize", version: /* @version prompt.knowledge.organize */ 2, title: "整理项目资料卡片",
  purpose: "一份资料进入项目或内容变了时，写一张用来查找它的卡片：简洁的标题、一两句简介、关键词，长文档再给每节一句摘要", used_by: ["项目资料"],
  ...promptBody("knowledge.organize"),
});

/** Project knowledge picks the sections likely to answer an agent's question from section trees, without the text (§6.4). */
export const KNOWLEDGE_LOCATE = defineInstructionPrompt({
  owner_id: KNOWLEDGE_OWNER, prompt_id: "knowledge.locate", version: /* @version prompt.knowledge.locate */ 2, title: "按问题选资料分节",
  purpose: "Agent 带着一个问题和几份资料来问先读哪几节时，看这几份资料的分节树（标题、层级、整理时写的每节一句摘要），挑出最可能写着答案的几节", used_by: ["项目资料"],
  ...promptBody("knowledge.locate"),
});
