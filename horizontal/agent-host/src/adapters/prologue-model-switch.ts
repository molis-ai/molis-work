import { isTerminalAgentPhase, type AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { PrologueAdapterError, type PrologueAdapterPorts, type PrologueControlPort, type PrologueModelConfiguration } from "./prologue.js";

/**
 * Switch a live Run's later model calls to another configured model (the runtime takes it at its next model boundary).
 * The Run keeps its history, tools, permissions and budget; what it was started with — its window, images, thinking,
 * reasoning effort and prompt cache — the new model has to carry, or nothing changes and the person hears why. Context
 * tidying keeps the start model. `requested` hears the model asked for before the runtime is told (its switch event may
 * come at once), and hears `undefined` when the runtime refuses it.
 */
export async function switchRunModel(input: {
  record: { view: AgentRunView; control: PrologueControlPort; model?: PrologueModelConfiguration };
  selection: { provider_id: string; model_id: string };
  configure: PrologueAdapterPorts["modelConfiguration"];
  defaultWindow: number | undefined;
  requested(model: string | undefined): void;
}): Promise<void> {
  const { view, control, model: start } = input.record;
  const refuse = (why: string): never => { throw new PrologueAdapterError("agent.capability_unavailable", `${why}；本轮没有换模型，仍用原模型继续`); };
  if (isTerminalAgentPhase(view.phase) || view.phase === "reconcile-required") refuse("这一轮已经结束，换模型请在下一轮选择");
  if (!control.switchModel || !start) refuse("这个运行时不能在一轮中途换模型");
  const next = await input.configure({ provider_id: input.selection.provider_id, model_id: input.selection.model_id });
  if (!next) refuse("所选模型不可用，请在模型设置中检查配置");
  const frozen = view.frozen;
  if (frozen.image_materials?.length && next!.vision === false) refuse(`模型设置里标注「${next!.model}」不支持看图，而这一轮带着图片`);
  const window = frozen.model_context?.window_tokens;
  if (window !== undefined && input.defaultWindow !== undefined && Math.min(next!.context_tokens ?? input.defaultWindow, input.defaultWindow) < window) {
    refuse(`「${next!.model}」的上下文窗口比这一轮整理上下文所按的窗口小，换过去可能放不下`);
  }
  if (frozen.thinking && next!.protocol !== "anthropic-compatible") refuse(`这一轮开着思考，「${next!.model}」的接口格式没有思考档`);
  if (frozen.reasoning_effort && next!.reasoning_effort !== true) refuse(`这一轮选了思考力度，模型设置里没有标注「${next!.model}」可调思考力度`);
  if (start!.prompt_cache && start!.prompt_cache !== "off" && next!.protocol !== start!.protocol) refuse("这一轮开着提示缓存，只能换同一种接口格式的模型");
  input.requested(next!.model);
  try { await control.switchModel!({ protocol: next!.protocol, endpoint: next!.endpoint, model: next!.model, credential_ref: next!.credential_ref }); }
  catch (error) { input.requested(undefined); throw error; }
}
