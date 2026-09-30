import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

/**
 * Methods Pages offers to other Agents (the Assistant, a Character) for business work. Each is declared in the
 * Manifest's `methods` with the same id, version, name, summary and tools; the Host registers the body from here.
 */
export const pagesMethods: readonly AgentSkillDefinition[] = [
  {
    skill_id: "meeting-notes",
    version: 1,
    name: "会议纪要整理",
    summary: "把一段会议记录或一篇会议文档整理成结论、待办（谁、做什么、何时）和待定问题，每条注明依据；需要写成文档时先请用户确认。",
    tools: ["find-capabilities", "read-capability", "change-capability"],
    body: [
      "适用：用户给了会议记录（原文、附件，或指向一篇 Pages 文档），要一份能照着执行的纪要。",
      "1. 先读原文。给的是文档就用 read-capability 读它的正文，不要凭标题或摘要推测内容。",
      "2. 分三部分整理：",
      "   - 结论：已经定下的事，一句话一条。",
      "   - 待办：谁、做什么、截止时间；原文没说的写“未指定”，不要替用户补。",
      "   - 待定问题：还没定的事，以及需要谁来拍板。",
      "3. 每条结论和待办后面用括号注明原文依据（关键词或时间点），方便用户核对。",
      "4. 最后用一句话说明原文缺了哪些信息（例如负责人、日期）。",
      "5. 用户要写成 Pages 文档时，先说明拟写入的标题与正文，经 change-capability 请用户确认后再写；不要覆盖已有文档，除非用户明确要求。",
    ].join("\n"),
  },
];
