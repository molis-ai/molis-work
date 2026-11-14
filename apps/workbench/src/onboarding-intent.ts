export const ONBOARDING_INTENT_FRAMES = [
  {
    id: "open",
    label: "我想",
    method_pack_id: null,
    placeholder: "例如：把这个想法做成一个真的能用的产品",
  },
  {
    id: "build_change",
    label: "我想做成",
    method_pack_id: "work-build-change",
    placeholder: "例如：一个每周都愿意打开的产品",
  },
  {
    id: "design_plan",
    label: "我想设计",
    method_pack_id: "work-design-plan",
    placeholder: "例如：一套更自然的首次使用体验",
  },
  {
    id: "diagnose_fix",
    label: "我想解决",
    method_pack_id: "work-diagnose-fix",
    placeholder: "例如：新用户不知道下一步做什么的问题",
  },
  {
    id: "analyze_decide",
    label: "我想想清楚",
    method_pack_id: "work-analyze-decide",
    placeholder: "例如：这个产品应该先服务谁",
  },
  {
    id: "migrate_refactor",
    label: "我想改造",
    method_pack_id: "work-migrate-refactor",
    placeholder: "例如：现在混乱的项目结构",
  },
  {
    id: "operate_process",
    label: "我想让",
    method_pack_id: "work-operate-process",
    placeholder: "例如：团队每周稳定推进一个真实目标",
  },
  {
    id: "content_communication",
    label: "我想讲清楚",
    method_pack_id: "work-content-communication",
    placeholder: "例如：这个产品为什么值得使用",
  },
] as const;

export type OnboardingIntentFrame = (typeof ONBOARDING_INTENT_FRAMES)[number]["id"];

export function onboardingIntentFrame(value: unknown): OnboardingIntentFrame | null {
  return typeof value === "string"
    && ONBOARDING_INTENT_FRAMES.some((frame) => frame.id === value)
    ? value as OnboardingIntentFrame
    : null;
}

export function onboardingIntentFrameDefinition(intentFrame: OnboardingIntentFrame) {
  return ONBOARDING_INTENT_FRAMES.find((frame) => frame.id === intentFrame)!;
}

export function onboardingPlanningHint(intentFrame: OnboardingIntentFrame): string {
  const frame = onboardingIntentFrameDefinition(intentFrame);
  return frame.method_pack_id
    ? `用户选择「${frame.label}」作为这次工作的起点；优先检查 ${frame.method_pack_id}，但这只是规划线索，不锁定最终方法。Runtime 仍需结合项目要求和实际内容补充所有相关方法。`
    : "用户没有预设这次工作的类型；Runtime 应根据实际内容识别相关工作类型，并结合项目要求选用合适的拆解方法。";
}
