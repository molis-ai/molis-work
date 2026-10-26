import { agentErrors } from "../errors.js";
import { requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunHandle, AgentRunRef, AgentRunView, AgentRuntimeDescriptor, AgentStartExecution, AgentStartRequest } from "@molis-ai/molis-work-contracts/services/agent-host";
import { STEP_TOOLS } from "../execution-plan.js";
import { freezeRunStart, validateRunAttachments } from "./prologue-frozen.js";
import type { PrologueAdapterPorts, PrologueModelConfiguration, PrologueRuntimePort, PrologueStartInput } from "./prologue-ports.js";
import { isEnded, type PrologueRunStore, type RunRecord, type SessionRecord } from "./prologue-run-store.js";
import { runStreamState } from "./prologue-stream.js";

/** What starting a round needs from the adapter (prologue.ts). */
export interface RunStartContext {
  runtime: PrologueRuntimePort;
  ports: PrologueAdapterPorts;
  descriptor: AgentRuntimeDescriptor;
  store: PrologueRunStore;
  read(run: AgentRunRef): Promise<AgentRunView>;
}

type FrozenRole = NonNullable<AgentStartRequest["role"]>;

/**
 * What this runtime can carry for the round the Host froze: a configured model (that sees images when there are images),
 * the frozen role, a plan it can report on, children it can watch, effects it can review, and methods, MCP, compaction
 * and actions only where they are connected.
 */
async function checkRoundStartable(context: RunStartContext, request: AgentStartRequest) {
  const { runtime, descriptor } = context;
  const { textMaterials, imageMaterials } = validateRunAttachments(request, Boolean(runtime.imageAttachments));
  if (request.budget?.max_turns !== undefined && (!Number.isSafeInteger(request.budget.max_turns) || request.budget.max_turns < 1 || request.budget.max_turns > 100)) throw new Error("执行轮次预算必须为 1–100 的整数");
  const model = await context.ports.modelConfiguration(request.model_selection);
  if (model === null) {
    throw agentErrors.model_not_configured("还没有配置可用的模型");
  }
  // A model the settings mark as not seeing images never gets them: nothing is sent, and the person hears why.
  if (imageMaterials.length && model.vision === false) throw agentErrors.capability_unavailable(`模型设置里标注「${model.model}」不支持看图，图片没有发出；可以换一个支持看图的模型，或去掉图片再发`);
  const role = request.role;
  if (role === undefined) {
    throw agentErrors.role_not_frozen("宿主没有冻结角色定义，不能在没有角色 Prompt 的情况下起跑");
  }
  if (request.continue_step_board_of !== undefined) {
    // Continuing a graph is only ever the same plan, in the same session, while that graph is unfinished.
    if (!request.execution_plan) throw agentErrors.capability_unavailable("继续计划需要原确认计划");
    const earlier = await context.read({ session_id: request.session.session_id, run_id: request.continue_step_board_of });
    if (!isEnded(earlier.phase)) throw agentErrors.session_busy("被继续的那一轮还没有结束");
    if (JSON.stringify(earlier.frozen.execution_plan) !== JSON.stringify(request.execution_plan)) throw agentErrors.capability_unavailable("继续计划必须使用那一轮的同一版确认计划");
    if (!earlier.step_board || earlier.step_board.terminal) throw agentErrors.capability_unavailable("那一轮的计划图已经结束，请调整计划后重新开始");
  }
  if (request.execution_plan && (!runtime.readStepBoard || STEP_TOOLS.some(tool => !role.host_tools.includes(tool)))) {
    throw agentErrors.capability_unavailable("当前运行时或角色尚未接通计划步骤回报");
  }
  // Only Host-frozen workspace grants open the SDK write envelope for children.
  // The coordinator's Character still restricts its own tools to read/dispatch.
  if (role.subagents?.length && !runtime.subagents) throw agentErrors.capability_unavailable("当前运行时未装配子代理观察和控制");
  const mode = role.execution === "read-only" && !role.subagent_workspaces?.length ? "plan" as const : "build" as const;
  if (mode === "build" && descriptor.capabilities["text-edit"] === "unsupported") {
    throw agentErrors.capability_unavailable("这个 Runtime 尚未接通副作用审批，不能运行会写入的角色");
  }

  if ((request.skills?.length ?? 0) !== (role.skills?.length ?? 0)
    || role.skills?.some(skill => !request.skills?.some(ref => ref.skill_id === skill.skill_id && ref.version === skill.version))
    || ((role.skills?.length ?? 0) > 0 && !runtime.inlineMethods)) {
    throw agentErrors.capability_unavailable("方法未由宿主解析或当前运行时不能展开方法");
  }
  if ((request.mcp_tools?.length || request.mcp_sources?.length) && descriptor.capabilities.mcp === "unsupported") throw agentErrors.capability_unavailable("此运行时尚未接通 MCP 审查");
  if (role.compaction && !runtime.compaction) throw agentErrors.capability_unavailable("上下文整理尚未接通");
  if ((role.actions?.tools.length || role.action_gateway) && !runtime.actionTools) throw agentErrors.capability_unavailable("Action tools are not connected to this runtime");
  if (role.action_gateway && request.workspace !== "business") throw agentErrors.capability_unavailable("能力网关只用于业务会话");
  return { textMaterials, imageMaterials, model, role, mode };
}

/** What the runtime is asked to run: exactly the Host's frozen role, materials and selections, with the round's provenance. */
function startInput(request: AgentStartRequest, role: FrozenRole, model: PrologueModelConfiguration, mode: "plan" | "build",
  materials: Pick<PrologueStartInput, "text_materials" | "image_materials">, provenance: PrologueStartInput["provenance"],
  execution: AgentStartExecution | undefined): PrologueStartInput {
  return {
    beforeStart: execution?.beforeStart,
    assertBeforeStart: execution?.assertBeforeStart,
    beforeDispatch: execution?.beforeDispatch,
    provenance,
    session_id: request.session.session_id,
    ...(request.workspace === "none" ? { workspace: "none" } : request.workspace === "business" ? { workspace: "business" } : { root_path: request.directory.canonical_path }),
    model,
    character: {
      id: role.role_id,
      version: role.version,
      name: role.role_id,
      instructions: role.prompts.map((prompt) => prompt.body).join("\n\n"),
      tools: [...role.host_tools],
    },
    ...(role.compaction ? { compaction: { prompt: role.compaction.prompt.body, above_tokens: role.compaction.above_tokens } } : {}), ...(role.ending_review ? { ending_review: { prompt: role.ending_review.prompt.body } } : {}),
    task: request.task,
    ...(role.memory ? { memory: structuredClone(role.memory) } : {}),
    ...(role.subagents ? { subagents: structuredClone(role.subagents) } : {}),
    ...(role.subagent_workspaces ? { subagent_workspaces: structuredClone(role.subagent_workspaces) } : {}),
    text_materials: materials.text_materials,
    ...(materials.image_materials?.length ? { image_materials: materials.image_materials } : {}),
    skills: role.skills ?? [],
    mcp_tools: request.mcp_tools ?? [],
    mcp_sources: request.mcp_sources ?? [],
    ...(role.actions ? { actions: role.actions } : {}),
    ...(role.action_gateway ? { action_gateway: role.action_gateway } : {}),
    mode,
    ...(request.history === "digest" ? { history: "digest" as const } : {}),
    ...(request.queued_work_id ? { queued_work_id: request.queued_work_id } : {}), ...(request.queued ? { queued: request.queued } : {}),
    ...(request.session_title ? { session_title: request.session_title.slice(0, 120) } : {}),
    ...(request.browser === false ? { browser: false as const } : {}),
  };
}

/** Start one round of a session already checked as idle: the runtime runs it, and the store follows it from its first event. */
export async function startPrologueRun(context: RunStartContext, request: AgentStartRequest, session: SessionRecord, execution?: AgentStartExecution): Promise<AgentRunHandle> {
  const { runtime, store } = context;
  if ((request.original_input || request.continued_from) && !runtime.sessions.originalInput) throw agentErrors.capability_unavailable("当前运行时没有初始原件读取能力");
  const original = await runtime.sessions.originalInput?.(request.session.session_id, request);
  const { textMaterials, imageMaterials, model, role, mode } = await checkRoundStartable(context, request);
  const at = store.now().toISOString();
  const frozen = { ...freezeRunStart({ request, role, model, textMaterials, imageMaterials, defaultWindow: runtime.defaultContextWindowTokens, callId: execution?.call_id }),
    ...(original ? { original_input: original.ref } : {}), ...(request.continued_from ? { continued_from: request.continued_from } : {}) };

  await execution?.beforeStart?.();
  requireSynchronous(execution?.assertBeforeStart?.(), "最终授权检查必须同步完成");
  const started = await runtime.startAgentRun({ ...startInput(request, role, model, mode, { text_materials: textMaterials, image_materials: imageMaterials },
    { frozen, started_at: at }, execution), ...(original ? { original_input: original } : {}) });

  const state = runStreamState(model.protocol.startsWith("openai"), started);
  const ref: AgentRunRef = {
    run_id: started.run.ref.id,
    session_id: request.session.session_id,
  };
  const view: AgentRunView = {
    ref,
    ...(original ? { original_input: original } : {}),
    phase: "starting",
    frozen,
    turns: [{ turn_id: "user-1", kind: "user", text: request.task, at, sequence: 0 }],
    activity: [],
    usage: state.usage,
    awaiting_input: [],
    started_at: at,
    ended_at: null,
  };
  state.turns.push(view.turns[0]!);

  const record: RunRecord = {
    view,
    state,
    control: started.control,
    model,
    ...(role.memory ? { memory_context: { consumer: role.memory.consumer,
      ...(role.memory.usage ? { usage: structuredClone(role.memory.usage) } : {}) } } : {}),
    unsubscribe: () => {},
    listeners: new Set(),
  };
  store.rememberRun(session, record);
  store.follow(record, request.task, started.run, context.ports);
  store.publish(ref.run_id);
  return { ref, frozen };
}
