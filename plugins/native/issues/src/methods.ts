import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

export const issuesMethods: readonly AgentSkillDefinition[] = [{
  skill_id: "issues-capture", version: 1, name: "记录与管理个人问题",
  summary: "在个人 Home 中录入、查看、修改或删除 Issue，保留原话和来源。",
  tools: ["find-capabilities", "read-capability", "change-capability", "ask-user"],
  body: [
    "只记录用户主动提出的问题。先发现当前可用的 issues.* 能力，缺权限或插件未运行时如实说明。",
    "标题和类型（Bug、体验问题、功能需求）必须由用户确认；缺信息时合并提问，尽量两轮内澄清。不要擅选类型。",
    "description 保留原话、追问答复及其顺序，不自动润色、分析、归因或给解决办法。补充信息放 supplement。",
    "用 issues.create 经平台确认卡写入。时间、提交人和入口由 Host 记录，不从正文编造页面、身份或环境。",
    "只在用户明确要求时修改或删除。先 issues.read，带该记录的 expected_version 调 issues.update/delete；未要求修改的字段不传。",
    "冲突时保留拟改内容，重新读取后请用户核对。拒绝、取消或结果未知时不自动重试；先查询核实是否已有记录。",
    "三个入口与项目切换都操作同一 Home 中的个人数据；这不是团队共享池。",
  ].join("\n"),
}];
