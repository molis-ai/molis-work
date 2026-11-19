import { ActionError, bindActionHandler, defineWorkTerminalPromptAction, type ActionHandlerBinding, type WorkTerminalPromptInput, type WorkTerminalPromptView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { GoalEventStateView } from "./contract/goal-events.js";
import type { GoalRecord } from "./contract/goals.js";
import { GOALS_PLUGIN_ID } from "./identity.js";

/**
 * Goals' read-only prompt reader for the platform's object work terminal (`system.work-terminal`, PEQ-17).
 * Goals owns no terminal process, workspace path, project guidance or untrusted source text: it reports only whether
 * the Goal exists, whether it is read-only (a compound parent finished by its children), and its trusted instruction.
 */
export const goalsWorkPromptAction = defineWorkTerminalPromptAction(
  "goals.work_prompt",
  /* @version action.goals.work_prompt */ 1,
  "goal",
  "读取目标的工作终端推进指令",
  ["goals:read"],
);

/** What a Goal with event work has settled, one line each, for the work-terminal prompt. */
function goalFacts(state: GoalEventStateView): string {
  return [
    `工作状态：${state.work_status}`,
    state.agreement.outcome ? `当前约定：${state.agreement.outcome}` : "",
    state.progress_summary?.next_step ? `下一步：${state.progress_summary.next_step}` : "",
    state.pending_decisions.length ? `待决定：${state.pending_decisions.map(item => item.question).join("；")}` : "",
    state.current_decisions.length ? `已决定：${state.current_decisions.map(item => item.conclusion).join("；")}` : "",
  ].filter(Boolean).join("\n");
}

function goalInstruction(subject: string, goalId: string, onboarding: boolean): string {
  return onboarding
    ? `这是新项目的第一次 Goal 工作。请读取 ${subject}的当前状态（goal_state）。先保存能辨认的意图即可，不必先填完整树。已决定的内容不要再问。在已有授权内工作并上报事实。不要自动完成，也不要改别的 Goal。`
    : `请用 Molis Work 推进 ${subject}。先读取当前状态（约定、决定、最近结果和时效），再用 acceptance.read 读这个 Goal 的要求（主体 provider_id「${GOALS_PLUGIN_ID}」、kind「goal」、id「${goalId}」），按差距继续。交付时用 acceptance.deliveries.record 记下确切版本，再用 acceptance.reports.submit 逐项报告核对了什么；认可只有用户本人能做。已决定的内容不要再问。不要改别的 Goal。`;
}

/** Build the platform work-terminal prompt view for one Goal. */
export function goalWorkPromptView(input: {
  readonly goal_id: string;
  readonly title: string;
  readonly parent?: boolean;
  readonly onboarding?: boolean;
  readonly current_facts?: string;
}): WorkTerminalPromptView {
  const title = input.title.trim() || input.goal_id;
  if (input.parent) {
    return {
      subject: { kind: "goal", id: input.goal_id },
      title,
      read_only: true,
      read_only_reason: "这条上层 Goal 由子 Goal 共同完成，不能直接推进或打开终端。请选择一个具体的子 Goal。",
    };
  }
  const onboarding = input.onboarding === true;
  const facts = input.current_facts?.trim();
  return {
    subject: { kind: "goal", id: input.goal_id },
    title,
    read_only: false,
    instruction: goalInstruction(`Goal「${title}」（id: ${input.goal_id}）`, input.goal_id, onboarding),
    instruction_with_untrusted_source: goalInstruction(`Goal（id: ${input.goal_id}）`, input.goal_id, onboarding),
    ...(facts ? { current_facts: facts } : {}),
  };
}

export function createGoalsWorkPromptHandler(
  readGoal: (goalId: string) => { record: GoalRecord; state: GoalEventStateView | null } | null,
): ActionHandlerBinding {
  return bindActionHandler(goalsWorkPromptAction, (input: WorkTerminalPromptInput) => {
    const found = readGoal(input.subject_id);
    if (!found) throw new ActionError("actions.missing", "找不到这个 Goal");
    const parent = found.record.decomposition_state === "closed_compound" && !found.state?.owner;
    return goalWorkPromptView({
      goal_id: found.record.goal_id,
      title: found.record.title,
      parent,
      onboarding: input.onboarding === true,
      current_facts: found.state?.owner ? goalFacts(found.state) : undefined,
    });
  });
}
