import type { MolisWorkSessionRecord, SessionTimelineEvent, SessionHandoffGoalContext } from "./types.js";

const MAX_CONTEXT_EVENTS = 8;
const MAX_CONTEXT_EVENT_CHARS = 700;

export function buildSessionHandoffPackage(input: {
  source_session: MolisWorkSessionRecord;
  project_name: string;
  goal_contract: SessionHandoffGoalContext;
  timeline: readonly SessionTimelineEvent[];
}): string {
  const { goal, event_work: eventWork, event_facts: eventFacts } = input.goal_contract;
  const historicalRuns = input.goal_contract.runs
    .map((run) => `${run.run_id} · ${run.state} · ${run.role} · ${run.actor_id} · ${run.started_at}`);
  const historicalEvidence = input.goal_contract.evidence
    .map((item) => `${item.result} · ${item.kind}: ${item.locator}`);
  const outputRefs = input.goal_contract.runs
    .flatMap((run) => run.output_refs)
    .filter((item, index, items) => item && items.indexOf(item) === index);
  const historicalRisks = input.goal_contract.risks
    .map((risk) => `${risk.description}；状态：${risk.state}；处理：${risk.treatment_plan}`);
  const timeline = minimalSessionContext(input.timeline);
  const resumeRequired = eventFacts?.resume_required === true;
  const currentStatus = eventFacts?.work_status
    ?? (goal.trashed_at ? "trashed" : goal.archived_at ? "archived" : "open");
  const nextStep = resumeRequired
    ? "已结束的 Goal 需要显式继续：调用 molis_work_v1_event_resume 并说明原因，不能按普通差距自动恢复。"
    : eventFacts?.next_step || "按当前约定继续记录。";
  const eventSection = eventWork && eventFacts
    ? [
        "## 当前事件工作",
        "",
        `- 协议：事件记录，不要领取角色或开始 Run`,
        `- 工作状态：${eventFacts.work_status}`,
        `- 当前约定：${eventFacts.outcome || "无"}`,
        `- 下一步：${nextStep}`,
        `- 继续边界：${resumeRequired ? "必须显式继续，调用 molis_work_v1_event_resume 并说明原因" : "可按当前约定继续"}`,
        ...(eventFacts.closure_reason ? [`- 收尾原因：${eventFacts.closure_reason}`] : []),
        `- 摘要是否过时：${eventFacts.stale_summary ? "是" : "否"}`,
        "",
        listSection("当前要求", eventFacts.requirements ?? []),
        listSection("待决定（不要重复已决定内容）", eventFacts.pending_decisions ?? []),
        listSection("当前有效决定", eventFacts.current_decisions ?? []),
        listSection("未满足要求", eventFacts.gaps ?? []),
      ]
    : [];
  const historicalAcceptance = goal.acceptance_criteria.flatMap((criterion) => [
    `- ${criterion.statement}`,
    `  - 通过条件：${criterion.pass_condition}`,
    `  - 判定方式：${criterion.decision_method}`,
  ]);
  const lines = [
    `# Handoff：${goal.title}`,
    "",
    "> 这是一个新的 Runtime Session。请依据下列 Molis Work 事实继续工作，不要假装继承来源 Runtime 的内存或未记录推理。",
    "",
    "## 来源",
    "",
    `- Project：${input.project_name}（${input.source_session.project_id ?? "未关联"}）`,
    `- 来源 Session：${input.source_session.session_id}`,
    `- 来源 Runtime：${input.source_session.runtime_id}`,
    `- 来源原生 Session：${input.source_session.native_runtime_session_id ?? "无"}`,
    `- 工作目录：${input.source_session.workspace_path ?? "未关联"}`,
    "",
    "## 当前 Goal",
    "",
    `- Goal ID：${goal.goal_id}`,
    `- 目标结果：${goal.outcome}`,
    `- 为什么：${goal.why}`,
    `- 业务逻辑：${goal.business_logic}`,
    `- 当前工作状态：${currentStatus}`,
    `- 下一动作：${nextStep}`,
    "",
    ...eventSection,
    listSection("范围内", goal.in_scope),
    listSection("范围外", goal.out_of_scope),
    listSection("约束", goal.constraints),
    listSection("所需输入", goal.required_inputs),
    listSection("承诺输出", goal.promised_outputs),
    "## 历史记录（只读）",
    "",
    "## 历史验收标准",
    "",
    ...(historicalAcceptance.length > 0 ? historicalAcceptance : ["- 无"]),
    "",
    listSection("历史 Run", historicalRuns),
    listSection("历史 Evidence", historicalEvidence),
    listSection("产物与输出引用", outputRefs),
    listSection("历史 Risk", historicalRisks),
    "## 最近 Session 上下文",
    "",
    ...(timeline.length > 0
      ? timeline.flatMap((event) => [
          `### ${event.label} · ${event.occurred_at}`,
          "",
          event.content,
          "",
        ])
      : ["没有可安全带入的逐轮上下文；请以当前事件约定和引用为准。", ""]),
    "## 继续执行",
    "",
    resumeRequired
      ? "这条 Goal 已经完成或取消。继续前必须显式继续：调用 molis_work_v1_event_resume 并说明原因。不要当作普通未完成工作继续，也不要领取角色或开始 Run。"
      : eventWork
        ? "先读取当前 goal_state，再从当前约定、要求和待决定继续。已决定的内容不要再问。不要领取角色或开始 Run。重要事实写回同一个 Goal。"
        : "先核对当前仓库与 Molis Work 状态，再按当前 Goal 事实继续。重要决定仍写回同一个 Goal；不要创建第二套 Goal 状态。",
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function minimalSessionContext(events: readonly SessionTimelineEvent[]): SessionTimelineEvent[] {
  const selected = events.filter((event) =>
    event.kind === "user_message"
    || event.kind === "runtime_message"
    || event.kind === "artifact"
    || event.kind === "status");
  return selected.slice(-MAX_CONTEXT_EVENTS).map((event) => ({
    ...event,
    content: clipText(event.content, MAX_CONTEXT_EVENT_CHARS),
  }));
}

function listSection(title: string, values: readonly string[]): string {
  return [`## ${title}`, "", ...(values.length > 0 ? values.map((value) => `- ${value}`) : ["- 无"]), ""].join("\n");
}

function clipText(value: string, limit: number): string {
  const text = value.trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}
