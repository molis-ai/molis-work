import { ActionError, defineErrorCodes, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { isInstructedPrompt, type InstructedPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { PLUGIN_MODEL_LIMITS, type PluginManifest, type PluginModelClient, type PluginModelRequest, type PluginModelResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginAction } from "./action-scope.js";

const MODEL_INVOKE = "model:invoke";

/** The model service's own codes, every one `plugin.<reason>`: a refusal is the caller's mistake or the plugin's lifetime, never a retry. */
export const pluginModelErrors = defineErrorCodes("plugin", {
  /** The call is not inside an action of this plugin: `start`, a route, a timer, another plugin's action. */
  model_action_required: "forbidden",
  /** The running action's declaration does not name `model:invoke`. */
  model_permission_undeclared: "forbidden",
  /** The running action is serial: waiting for a model would hold the queue every other operation waits in. */
  model_action_not_concurrent: "forbidden",
  /** The prompt or system is not an instruction this plugin registered. */
  model_instruction_refused: "invalid",
  /** A timeout or a token count outside what the service allows. */
  model_limit_exceeded: "invalid",
  /** The model answered, but not with JSON, though JSON was asked for. */
  model_output_invalid: "upstream",
});

/** What the Host hands the model for one call: everything the plugin may not decide is settled here already. */
export interface PluginModelDispatch {
  /** The running action's signal joined with the call's own; it always exists. */
  readonly signal: AbortSignal;
  /** Asked again just before the model is reached: the plugin is running, holds the grant, and the call is not over. */
  readonly beforeDispatch: () => Promise<void>;
  readonly system?: InstructionPrompt;
  readonly timeout_ms: number;
  readonly max_output_tokens: number;
}

/** The Host's side of the service: the model itself. The Runtime decides whether a call may be made; the port makes it. */
export interface PluginModelPort {
  availability(): ActionAvailability;
  /** `owner` is the plugin whose instructions are being sent; the port resolves them to the person's version. */
  complete(owner: string, prompt: InstructedPrompt, dispatch: PluginModelDispatch): Promise<{ text: string; usage?: PluginModelResult["usage"] }>;
  /** The Host's JSON decoder, so the plugin and every other caller of the model read an answer the same way. */
  decodeJson(text: string): { ok: true; value: unknown } | { ok: false };
}

/** What the executor says of the running instance: whether it is still the one that runs, and what it holds. */
export interface PluginModelGate {
  readonly install_id: string;
  /** Throws once the instance is stopped, disabled, uninstalled or replaced. */
  assertActive(): void;
  /** Throws when the installation does not hold the permission (now, not as it was at start). */
  requireGrant(permission: string): void;
}

/**
 * `services.model` for one installation. The executor builds it only for a Manifest that declares `model:invoke`, a definition
 * the Host runs itself, and a platform that reaches a Home; every call then passes these gates before the port is asked:
 * the code is inside an action of this installation, that action declares `model:invoke` and is concurrent, the instance is
 * running with the grant, the call's `beforeEffect()` agrees, the prompt is the plugin's own instruction, the limits hold.
 * After the model answered the same authority is asked again, and only then is the answer handed over.
 */
export function createPluginModelClient(manifest: PluginManifest, port: PluginModelPort, gate: PluginModelGate): PluginModelClient {
  const authority = async (caller: { beforeEffect(): Promise<void> }) => {
    gate.assertActive(); gate.requireGrant(MODEL_INVOKE);
    await caller.beforeEffect();
    gate.assertActive(); gate.requireGrant(MODEL_INVOKE);
  };
  return Object.freeze({
    availability(): ActionAvailability {
      try { gate.assertActive(); } catch { return { available: false, code: "actions.provider_stopped", reason: "此插件实例已停止" }; }
      try { gate.requireGrant(MODEL_INVOKE); } catch { return { available: false, code: "actions.plugin_permission", reason: "插件缺少模型调用授权" }; }
      return port.availability();
    },
    async complete(prompt: InstructedPrompt, request: PluginModelRequest = {}): Promise<PluginModelResult> {
      const scope = currentPluginAction();
      if (!scope || scope.install_id !== gate.install_id) throw pluginModelErrors.model_action_required("模型只能在本插件自己的动作里调用，不能在启动、路由、定时器或别的插件的动作里调用");
      const { definition, caller } = scope;
      if (!definition.action.permissions.includes(MODEL_INVOKE)) throw pluginModelErrors.model_permission_undeclared(`动作 ${definition.capability_id} 没有声明 ${MODEL_INVOKE}`);
      if (definition.action.scheduling !== "concurrent") throw pluginModelErrors.model_action_not_concurrent(`动作 ${definition.capability_id} 要等模型，必须声明 scheduling: "concurrent"`);
      if (!caller.permissions.includes(MODEL_INVOKE)) throw new ActionError("actions.forbidden", "这次调用没有模型调用权限");
      await authority(caller);
      const checked = checkRequest(manifest.plugin_id, prompt, request);
      const dispatch: PluginModelDispatch = { signal: AbortSignal.any([caller.signal, request.signal].filter(item => item !== undefined)),
        beforeDispatch: () => authority(caller), timeout_ms: checked.timeout_ms, max_output_tokens: checked.max_output_tokens,
        ...(request.system ? { system: request.system } : {}) };
      const answer = await port.complete(manifest.plugin_id, prompt, dispatch);
      await authority(caller);
      if (checked.output === "text") return { text: answer.text, ...(answer.usage ? { usage: answer.usage } : {}) };
      const decoded = port.decodeJson(answer.text);
      if (!decoded.ok) throw pluginModelErrors.model_output_invalid("模型没有返回有效的 JSON，结果未交给插件");
      return { text: answer.text, value: decoded.value, ...(answer.usage ? { usage: answer.usage } : {}) };
    },
  });
}

/** The call's request before anything is sent: whose instructions, and how much. A mistake is refused here, never clamped. */
function checkRequest(pluginId: string, prompt: InstructedPrompt, request: PluginModelRequest) {
  if (!isInstructedPrompt(prompt)) throw pluginModelErrors.model_instruction_refused("模型只收登记过的指令：用 instructed(指令, 数据) 组织，不能直接给一段文字");
  const own = (instruction: InstructionPrompt) => instruction.owner_id === pluginId;
  if (!own(prompt.instruction)) throw pluginModelErrors.model_instruction_refused(`指令 ${prompt.instruction.prompt_id} 不属于本插件，只能发送自己登记的指令`);
  if (request.system !== undefined && !own(request.system)) throw pluginModelErrors.model_instruction_refused(`system 指令 ${request.system.prompt_id} 不属于本插件，只能发送自己登记的指令`);
  const output = request.output ?? "text";
  if (output !== "text" && output !== "json") throw pluginModelErrors.model_limit_exceeded(`output 只能是 "text" 或 "json"`);
  const timeout_ms = request.timeout_ms ?? PLUGIN_MODEL_LIMITS.default_timeout_ms;
  const max_output_tokens = request.max_output_tokens ?? PLUGIN_MODEL_LIMITS.default_output_tokens;
  if (!Number.isSafeInteger(timeout_ms) || timeout_ms < 1 || timeout_ms > PLUGIN_MODEL_LIMITS.max_timeout_ms) {
    throw pluginModelErrors.model_limit_exceeded(`timeout_ms 要是 1 到 ${PLUGIN_MODEL_LIMITS.max_timeout_ms} 之间的整数`);
  }
  if (!Number.isSafeInteger(max_output_tokens) || max_output_tokens < 1 || max_output_tokens > PLUGIN_MODEL_LIMITS.max_output_tokens) {
    throw pluginModelErrors.model_limit_exceeded(`max_output_tokens 要是 1 到 ${PLUGIN_MODEL_LIMITS.max_output_tokens} 之间的整数`);
  }
  return { output, timeout_ms, max_output_tokens } as const;
}
