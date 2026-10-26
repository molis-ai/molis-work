import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { ISSUE_ASK, ISSUE_TITLE_RULES, ISSUE_TOO_LITTLE, ISSUE_TYPE_RULES } from "./prompts.js";

const bullets = (lines: readonly string[]) => lines.map(line => "- " + line);

/**
 * How the Assistant records and manages a person's Issues in a conversation. Only Issue's own rules are here, from the
 * same lines as the page's naming instruction (ISSUE-52, ISSUE-53); the page names its captures itself and never asks the
 * Assistant. Which tool reaches an action, and what happens when one is refused, is the gateway's to say.
 */
export const issuesSkills: readonly AgentSkillDefinition[] = [{
  skill_id: "issues-capture", version: 11, name: "记录与管理个人问题",
  summary: "把用户在开发中遇到的问题记进个人 Issue：起标题、判类型、保存；也能查看、修改或删除。",
  // Method tools are a declaration (contracts METHOD_TOOLS); the Assistant's gateway also offers change-reversible.
  tools: ["suggest-action", "ask-user", "find-capabilities", "read-capability", "change-capability"],
  body: [
    "Issue 只记录用户自己提出的问题，原话由用户决定；你负责起标题、判类型，不分析原因，不给解决办法。",
    "",
    "【记录】",
    "- 用户让你记一个问题时用 issues.create：description 照抄用户原话（有追问答复就按顺序接在后面），标题和类型按下面的规则。不编造截图、页面或环境。",
    "- 新记录可以撤销，用户不用再确认一次。",
    "- 记好后只回一句：已记录「标题」（类型）。不复述描述；没有记成就不要说已记录。",
    "",
    "【依据不足】",
    ...bullets(ISSUE_TOO_LITTLE),
    `- 依据不足时不要记录，也不要先试着记录，只问一句：${ISSUE_ASK}不写内部编号。`,
    "",
    "【标题】",
    ...bullets(ISSUE_TITLE_RULES),
    "",
    "【类型】",
    ...bullets(ISSUE_TYPE_RULES),
    "",
    "【查看、修改与删除】",
    "- 查看用 issues.list 和 issues.read。列表只有 image_count，详情才有图片。",
    "- 只在用户明确要求时修改或删除：先 issues.read 拿到 version，再带 expected_version 调 issues.update 或 issues.delete；没要求改的字段不传，images 不传表示保留，传空数组表示全部移除。",
    "- 冲突、拒绝、取消或结果未知时不自动重试：先读回核实，再告诉用户实际情况。",
    "- 所有入口和项目共用同一份个人 Issue，这不是团队共享池。",
  ].join("\n"),
}];
