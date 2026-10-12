/** Words the preview shows for the SDK's closed sets. The SDK says `not-adopted`; the person reads 暂不采纳. */
export const TREATMENT_LABEL: Readonly<Record<string, string>> = {
  "apply-now": "立即影响当前这一步",
  "later-step": "留到后面某一步",
  "new-task": "作为新任务（提议，待你确认）",
  "needs-clarification": "需要你澄清",
  "not-adopted": "暂不采纳 · 待你决定",
  answered: "已在回复里回答",
  noted: "记下，不改变执行",
  merged: "与另一条一起处理",
};
export const TREATMENT_SHORT: Readonly<Record<string, string>> = {
  "apply-now": "立即处理",
  "later-step": "留到后面",
  "new-task": "新任务提议",
  "needs-clarification": "需要澄清",
  "not-adopted": "暂不采纳",
  answered: "已回答",
  noted: "已记下",
  merged: "合并处理",
};
export const KIND_LABEL: Readonly<Record<string, string>> = {
  supplement: "补充", correction: "纠正", constraint: "约束", request: "新需求", question: "提问",
};
export const IMPACT_LABEL: Readonly<Record<string, string>> = {
  objective: "目标", scope: "范围", priority: "优先级", approach: "实现方案", acceptance: "验收条件", outputs: "已有成果", constraint: "约束",
};
export const SOURCE_LABEL: Readonly<Record<string, string>> = { person: "你", app: "应用", peer: "同伴会话" };

/** HH:MM in UTC. The recordings put their clock on 2026-10-12 14:00 UTC, so "14:02" is two minutes in. */
export function clock(atMs: number): string {
  const date = new Date(atMs);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

/** Where the words in the composer go while a question waits. The mark itself is the design system's (`renderInteractionComposerTarget`). */
export const COMPOSER_TARGET = { thisRun: "补充这一轮" } as const;
