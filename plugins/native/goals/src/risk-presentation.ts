import type { RiskRecord } from "@molis-ai/molis-work-contracts/modules/goals";

export const RISK_STATE_LABELS: Record<RiskRecord["state"], string> = {
  open: "待处理",
  triggered: "已发生",
  resolved: "已解决",
  accepted: "已接受",
  expired: "已过期",
};

export const RISK_TREATMENT_LABELS: Record<RiskRecord["treatment"], string> = {
  accept: "接受",
  mitigate: "缓解",
  avoid: "规避",
  defer: "延后",
};

export const RISK_BLOCKING_LABELS: Record<RiskRecord["blocking_mode"], string> = {
  none: "不阻塞",
  claim: "阻止领取",
  completion: "阻止完成",
  invalidate_on_trigger: "触发后失效",
};

export function goalRiskStateEffect(
  L: (text: string) => string,
  blockingMode: RiskRecord["blocking_mode"],
  state: RiskRecord["state"],
): string {
  const recorded = blockingMode === "claim"
    ? L("当时记录为阻止领取")
    : blockingMode === "completion"
      ? L("当时记录为阻止完成")
      : blockingMode === "invalidate_on_trigger"
        ? state === "triggered"
          ? L("当时记录为触发后使 Goal 失效，且已标记为已发生")
          : L("当时记录为触发后使 Goal 失效")
        : L("当时记录为持续观察，不直接阻塞领取或完成");
  const status = state === "open" || state === "triggered"
    ? L("历史状态仍为开放或已发生")
    : L("历史状态已结束");
  return `${status}；${recorded}。${L("这是历史事实。当前可以记录事实、查看要求，或阅读原始历史。")}`;
}
