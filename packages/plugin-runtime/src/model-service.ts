import { ActionError, defineErrorCodes, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { isInstructedPrompt, type InstructedPrompt, type InstructionPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { PLUGIN_MODEL_LIMITS, pluginErrors, type PluginManifest, type PluginModelClient, type PluginModelAvailability, type PluginModelRequest, type PluginModelResult, type PluginModelSelection, type PluginModelImage, type PluginModelChoice, type PluginModelFailure } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginAction, holdPluginResult, inPluginInstance, type PluginInstance } from "./action-scope.js";

/** Sending a request to the model: the action declares it, the installation holds it. */
const MODEL_INVOKE = "model:invoke";
/** Reading the list of models and whether one can be reached, and nothing more: no request goes out under it. */
const MODEL_READ = "model:read";

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
  /** A timeout, a token count or an output kind outside what the service allows. */
  model_limit_exceeded: "invalid",
  /** An explicit selection must name both an existing provider and a model, never a partial default. */
  model_selection_invalid: "invalid",
  /** The model answered, but not with JSON, though JSON was asked for. */
  model_output_invalid: "upstream",
  model_failed: "upstream",
});

/** What the Host hands the model for one call: everything the plugin may not decide is settled here already. */
export interface PluginModelDispatch {
  readonly images?: readonly PluginModelImage[];
  /** Copied before the first wait; the caller cannot change this request's target while authority is checked. */
  readonly selection?: PluginModelSelection;
  /** The running action's signal joined with the call's own; it always exists. */
  readonly signal: AbortSignal;
  /** Asked again just before the model is reached: the plugin is running, holds the grant, and the call is not over. */
  readonly beforeDispatch: () => Promise<void>;
  /** Only text deltas; the Runtime checks the original call's current authority before handing each one to the plugin. */
  readonly onText?: (delta: string) => void;
  readonly system?: InstructionPrompt;
  readonly timeout_ms: number;
  readonly max_output_tokens: number;
}

/** The Host's side of the service: the model itself. The Runtime decides whether a call may be made; the port makes it. */
export interface PluginModelPort {
  choices(): readonly PluginModelChoice[];
  availability(selection?: PluginModelSelection): PluginModelAvailability;
  /** `owner` is the plugin whose instructions are being sent; the port resolves them to the person's version. */
  complete(owner: string, prompt: InstructedPrompt, dispatch: PluginModelDispatch): Promise<Pick<PluginModelResult, "text" | "usage" | "execution" | "validateResult">>;
  /** The Host's JSON decoder, so the plugin and every other caller of the model read an answer the same way. */
  decodeJson(text: string): { ok: true; value: unknown } | { ok: false };
}

/** What the executor says of the running instance: whether it is still the one that runs, and what it holds. */
export interface PluginModelGate extends PluginInstance {
  /** Throws once the instance is stopped, disabled, uninstalled or replaced. */
  assertActive(): void;
  /** Throws when the installation does not hold the permission (now, not as it was at start). */
  requireGrant(permission: string): void;
}

/**
 * `services.model` for one installation. The executor builds it only for a Manifest that declares `model:read` or `model:invoke`,
 * a definition the Host runs itself, and a platform that reaches a Home.
 *
 * `choices()` and `availability()` need either of the two, declared and held now: a plugin that only lists and picks models
 * declares the read-only `model:read`, not the permission that sends requests. `complete()` needs `model:invoke` alone, and every
 * call passes these gates before the port is asked: the code is inside an action of this installation, that action declares
 * `model:invoke` and is concurrent, the instance is running with the grant, the call's `beforeEffect()` agrees, the prompt is
 * the plugin's own instruction, the limits hold. After the model answered the same authority is asked again, and only then is
 * the answer handed over.
 */
export function createPluginModelClient(manifest: PluginManifest, port: PluginModelPort, gate: PluginModelGate): PluginModelClient {
  const authority = async (caller: { beforeEffect(): Promise<void> }) => {
    gate.assertActive(); gate.requireGrant(MODEL_INVOKE);
    await caller.beforeEffect();
    gate.assertActive(); gate.requireGrant(MODEL_INVOKE);
  };
  const declared = new Set(manifest.permissions.map(item => item.permission));
  /** Either permission that lets the plugin read the list, if the Manifest declares it and the installation holds it now. */
  const requireRead = () => {
    let refusal: unknown;
    for (const permission of [MODEL_READ, MODEL_INVOKE]) {
      if (!declared.has(permission)) continue;
      try { gate.requireGrant(permission); return; } catch (error) { refusal = error; }
    }
    throw refusal ?? pluginErrors.grant_denied(`Plugin 没有 ${MODEL_READ} 或 ${MODEL_INVOKE} grant`);
  };
  return Object.freeze({
    choices(): readonly PluginModelChoice[] {
      gate.assertActive(); requireRead();
      const scope = currentPluginAction();
      if (scope && !inPluginInstance(scope, gate)) throw pluginModelErrors.model_action_required("不能读取另一插件的模型服务");
      scope?.caller.signal?.throwIfAborted();
      return port.choices().map(row => ({ ...row }));
    },
    availability(selection?: PluginModelSelection): PluginModelAvailability {
      try { gate.assertActive(); } catch { return { available: false, code: "actions.provider_stopped", reason: "此插件实例已停止" }; }
      try { requireRead(); } catch { return { available: false, code: "actions.plugin_permission", reason: "插件缺少模型授权" }; }
      return port.availability(selectedModel(selection));
    },
    async complete(prompt: InstructedPrompt, request: PluginModelRequest = {}): Promise<PluginModelResult> {
      const scope = currentPluginAction();
      if (!scope || !inPluginInstance(scope, gate)) throw pluginModelErrors.model_action_required("模型只能在本插件自己的动作里调用，不能在启动、路由、定时器或别的插件的动作里调用");
      const { definition, caller } = scope;
      if (!definition.action.permissions.includes(MODEL_INVOKE)) throw pluginModelErrors.model_permission_undeclared(`动作 ${definition.capability_id} 没有声明 ${MODEL_INVOKE}`);
      if (definition.action.scheduling !== "concurrent") throw pluginModelErrors.model_action_not_concurrent(`动作 ${definition.capability_id} 要等模型，必须声明 scheduling: "concurrent"`);
      if (!caller.permissions.includes(MODEL_INVOKE)) throw new ActionError("actions.forbidden", "这次调用没有模型调用权限");
      const selection = selectedModel(request.selection);
      const images = copiedImages(request.images);
      const checked = checkRequest(manifest.plugin_id, prompt, request);
      const signal = AbortSignal.any([caller.signal, request.signal].filter(item => item !== undefined)), onText = request.onText;
      const validateAuthority = (activeCaller = caller) => {
        if (activeCaller === caller) signal.throwIfAborted();
        else { activeCaller.signal?.throwIfAborted(); request.signal?.throwIfAborted(); }
        gate.assertActive(); gate.requireGrant(MODEL_INVOKE);
        if (!activeCaller.permissions.includes(MODEL_INVOKE)) throw new ActionError("actions.forbidden", "这次调用没有模型调用权限");
        requireSynchronous(activeCaller.assert_authority_current?.(), "最终模型授权检查必须同步完成");
      };
      const validateCall = () => {
        if (currentPluginAction() !== scope) throw pluginModelErrors.model_action_required("结果只能由原模型调用提交");
        validateAuthority();
      };
      const guarded = (validateHost: () => void) => () => { validateCall(); validateHost(); };
      // The platform checks the answer again itself before the call commits anything (PG-047): from inside the call's own checks,
      // which a nested dispatch may run in another scope, so the scope identity is the plugin's own call's to check.
      const hold = (validateHost: () => void) => holdPluginResult(scope, () => {
        // A background continuation carries this invocation's checked record and its retained caller, not the finished handler's lifetime.
        const active = currentPluginAction();
        validateAuthority(scope.checked && active?.checked === scope.checked && inPluginInstance(active, gate) ? active.caller : caller);
        validateHost();
      });
      await authority(caller);
      validateCall();
      let receiving = true;
      const dispatch: PluginModelDispatch = { signal, ...(images ? { images } : {}), ...(selection ? { selection } : {}),
        beforeDispatch: () => authority(caller), timeout_ms: checked.timeout_ms, max_output_tokens: checked.max_output_tokens,
        ...(onText ? { onText: (delta: string) => {
          if (!receiving) throw new ActionError("actions.expired", "这次模型请求已结束，不能继续发送文字");
          signal.throwIfAborted();
          gate.assertActive(); gate.requireGrant(MODEL_INVOKE);
          requireSynchronous(caller.assert_authority_current?.(), "模型进度授权检查必须同步完成");
          onText(delta);
        } } : {}),
        ...(request.system ? { system: request.system } : {}) };
      let answer: Awaited<ReturnType<PluginModelPort["complete"]>>;
      try { answer = await port.complete(manifest.plugin_id, prompt, dispatch); }
      catch (error) {
        receiving = false;
        // The Host already rejected this binding. Do not replace that terminal refusal with
        // a fresh availability error, or expose it as a failure the plugin may record.
        if (error instanceof ActionError && error.code === "actions.configuration_changed") throw error;
        await authority(caller);
        validateCall();
        const failure: PluginModelFailure = error instanceof ActionError ? error : pluginModelErrors.model_failed("模型请求失败，请重试");
        const source = error instanceof Error ? error as PluginModelFailure : undefined;
        const validateResult = guarded(source?.validateResult ?? (() => {}));
        validateResult();
        hold(source?.validateResult ?? (() => {}));
        if (source?.execution) Object.defineProperty(failure, "execution", { value: structuredClone(source.execution), configurable: true });
        throw Object.defineProperty(failure, "validateResult", { value: validateResult, configurable: true });
      } finally { receiving = false; }
      signal.throwIfAborted();
      await authority(caller);
      const validateResult = guarded(answer.validateResult);
      validateResult();
      hold(answer.validateResult);
      const result = { text: answer.text, ...(answer.usage ? { usage: answer.usage } : {}),
        ...(answer.execution ? { execution: structuredClone(answer.execution) } : {}), validateResult };
      if (checked.output === "text") return result;
      const decoded = port.decodeJson(answer.text);
      if (!decoded.ok) throw Object.assign(pluginModelErrors.model_output_invalid("模型没有返回有效的 JSON，结果未交给插件"),
        { ...(result.execution ? { execution: result.execution } : {}), validateResult });
      return { ...result, value: decoded.value };
    },
  });
}

/** Only names cross this boundary. The Host resolves them against its current model directory. */
function selectedModel(selection: PluginModelSelection | undefined): PluginModelSelection | undefined {
  if (selection === undefined) return undefined;
  if (!selection || typeof selection !== "object" || Array.isArray(selection)
    || typeof selection.provider_id !== "string" || !selection.provider_id.trim()
    || typeof selection.model_id !== "string" || !selection.model_id.trim()) {
    throw pluginModelErrors.model_selection_invalid("模型选择必须同时提供供应商 ID 和模型 ID");
  }
  return { provider_id: selection.provider_id, model_id: selection.model_id };
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

/** Freeze the original input before any authority wait; labels never become paths. */
function copiedImages(images: readonly PluginModelImage[] | undefined): readonly PluginModelImage[] | undefined {
  if (images === undefined) return undefined;
  if (!Array.isArray(images) || images.length > 50) throw pluginModelErrors.model_limit_exceeded("每次最多发送 50 张图片");
  let total = 0;
  return images.map(image => {
    if (!image || !(image.bytes instanceof Uint8Array) || !image.bytes.byteLength || image.bytes.byteLength > 32 * 1024 * 1024
      || (image.label !== undefined && typeof image.label !== "string")) throw pluginModelErrors.model_limit_exceeded("图片必须提供有效字节和可选名称，单张最多 32 MiB");
    total += image.bytes.byteLength;
    if (total > 128 * 1024 * 1024) throw pluginModelErrors.model_limit_exceeded("图片总大小最多 128 MiB");
    return { bytes: new Uint8Array(image.bytes), ...(image.label === undefined ? {} : { label: image.label }) };
  });
}
