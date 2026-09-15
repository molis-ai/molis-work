import type { GoalRelationRecord } from "@molis-ai/molis-work-contracts/modules/goals";

export const GOALS_RELATION_LABELS: Record<string, { out: string; in: string }> = {
  part_of: { out: "属于", in: "包含" },
  depends_on: { out: "依赖", in: "被依赖" },
  conflicts_with: { out: "冲突于", in: "冲突于" },
  mitigates: { out: "缓解", in: "由此缓解" },
  extends: { out: "扩展", in: "由此扩展" },
  replaces: { out: "替代", in: "被替代" },
  corrects: { out: "修正", in: "被修正" },
  invalidates: { out: "使其失效", in: "被其失效" },
  migrates_from: { out: "迁移自", in: "迁移到" },
};

export const GOALS_RELATION_TYPES: Array<{
  type: GoalRelationRecord["type"];
  label: string;
  description: string;
}> = [
  { type: "part_of", label: "属于 / 包含", description: "只改变 Goal Tree 层级，不要求上级先完成" },
  { type: "depends_on", label: "依赖 / 被依赖", description: "左侧 Goal 必须等待右侧 Goal 完成，才具备收尾所需输入。普通笔记和准备仍可先做。" },
  { type: "conflicts_with", label: "冲突", description: "两项工作无法同时成立，或会相互干扰" },
  { type: "mitigates", label: "缓解", description: "左侧 Goal 用来降低右侧风险或负面影响" },
  { type: "extends", label: "扩展", description: "左侧 Goal 在右侧结果上继续增加能力" },
  { type: "replaces", label: "替代", description: "左侧 Goal 将取代右侧 Goal" },
  { type: "corrects", label: "修正", description: "左侧 Goal 修正右侧的错误或偏差" },
  { type: "invalidates", label: "使其失效", description: "左侧 Goal 使右侧事实或结果不再有效" },
  { type: "migrates_from", label: "迁移自", description: "左侧 Goal 从右侧旧实现或旧结构迁移而来" },
];
