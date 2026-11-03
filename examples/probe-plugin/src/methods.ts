import type { AgentSkillDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-agent";

/** One method, so that registering and withdrawing methods is part of the lifecycle the probe walks. */
export const probeMethods: readonly AgentSkillDefinition[] = [{
  skill_id: "probe-notes", version: 1, name: "读探针的笔记", summary: "只为测试：先找到探针的笔记动作，再读出当前的笔记。",
  tools: ["find-capabilities", "read-capability"], body: "找到 probe.notes.list，读出当前项目的探针笔记，原样告诉用户。",
}];
