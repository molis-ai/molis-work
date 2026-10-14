import { AGENT_REASONING_EFFORTS, type AgentImageMaterial, type AgentRunView, type AgentStartRequest, type AgentTextMaterial } from "@molis-ai/molis-work-contracts/services/agent-host";
import { promptLayerOf } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { PrologueAdapterError, type PrologueModelConfiguration } from "./prologue.js";

/**
 * What a Run is frozen with at its start: the role, its prompts and tools, the model and how it is asked, its materials,
 * plan, budget and workspace. Recorded once and shown as history; nothing here is looked up again later.
 */
export function freezeRunStart(input: { request: AgentStartRequest; role: NonNullable<AgentStartRequest["role"]>; model: PrologueModelConfiguration;
  textMaterials: readonly AgentTextMaterial[]; imageMaterials: readonly AgentImageMaterial[]; defaultWindow: number | undefined; callId?: string }): AgentRunView["frozen"] {
  const { request, role, model, textMaterials, imageMaterials, defaultWindow, callId } = input;
  // An effort goes out only to a model the person marked as taking one: otherwise the request is refused before it is sent.
  if (request.reasoning_effort !== undefined && !AGENT_REASONING_EFFORTS.includes(request.reasoning_effort)) throw new Error("思考力度只能是快速、平衡或深入");
  if (request.reasoning_effort !== undefined && model.reasoning_effort !== true) {
    throw new PrologueAdapterError("agent.capability_unavailable", `模型设置里没有标注「${model.model}」可调思考力度；没有发出。可以在模型设置里确认后再选，或不选力度直接发送`);
  }
  return {
    ...(role.subagent_workspaces ? { subagent_workspaces: structuredClone(role.subagent_workspaces) } : {}),
    ...(role.character ? { character: structuredClone(role.character) } : {}),
    ...(role.character_skill_ids === undefined ? {} : { character_skill_ids: [...role.character_skill_ids] }),
    role_id: role.role_id,
    role_version: role.version,
    execution: role.execution,
    ...(callId ? { call_id: callId } : {}),
    model_id: model.model,
    ...(role.compaction ? { compaction: { prompt_id: role.compaction.prompt.prompt_id, version: role.compaction.prompt.version, above_tokens: role.compaction.above_tokens } } : {}),
    prompts: role.prompts.map((prompt) => ({
      prompt_id: prompt.prompt_id,
      version: prompt.version,
      layer: promptLayerOf(prompt),
      ...(prompt.user_revision !== undefined ? { user_revision: prompt.user_revision } : {}),
    })),
    skills: (role.skills ?? []).map(({ body: _body, ...definition }) => ({ ...definition, tools: [...definition.tools] })),
    ...(request.action_tools === undefined ? {} : { action_tools: structuredClone(request.action_tools) }),
    ...(role.action_gateway ? { action_gateway: true as const } : {}),
    mcp_tools: request.mcp_tools ?? [],
    mcp_sources: request.mcp_sources ?? [],
    host_tools: [...role.host_tools],
    text_materials: textMaterials.map((material) => ({
      material_id: material.material_id,
      title: material.title,
      source_artifact_id: material.source_artifact_id,
      source_version: material.source_version,
    })),
    ...(imageMaterials.length ? { image_materials: imageMaterials.map(({ material_id, title, media_type }) => ({ material_id, title, media_type })) } : {}),
    ...(request.execution_plan ? { execution_plan: request.execution_plan } : {}),
    ...(request.continue_step_board_of ? { continues_step_board_of: request.continue_step_board_of } : {}),
    ...(request.history === "digest" ? { history: "digest" as const } : {}),
    ...(model.thinking ? { thinking: model.thinking } : {}),
    ...(request.reasoning_effort ? { reasoning_effort: request.reasoning_effort } : {}),
    ...(defaultWindow ? { model_context: {
      window_tokens: Math.min(model.context_tokens ?? defaultWindow, defaultWindow),
      prompt_includes_cache: model.protocol.startsWith("openai"),
    } } : {}),
    budget: request.execution_plan ? { ...request.budget, max_turns: request.budget?.max_turns ?? 8 + request.execution_plan.steps.length * 3 } : request.budget ?? null,
    ...(request.workspace === "none" ? { workspace: "none" } : request.workspace === "business" ? { workspace: "business" } : { directory: structuredClone(request.directory) }),
  };
}
