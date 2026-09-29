import { createFileSecretStore, peekSealedEntry, resolveMolisWorkHome, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { modelRequestShape, type ModelApiFormat, type ModelPromptCacheMode } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { resolvePrologueInference } from "./prologue-inference-host.js";
import { prologueProtocolFor, inferenceServiceUnavailableReason, isDispatchRefusal, PrologueInferenceError, type PrologueTextResult, type PrologueInputImage, type PrologueTextProgress, type PrologueStructuredRequest } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { openConfiguredModels, selectConfiguredTextModel, modelCredentialMetadata, validateTextModelUrl, type TextModelSelection } from "./configured-models.js";

export interface HostTextRequestOptions {
  signal?: AbortSignal;
  beforeDispatch?(): void | Promise<void>;
  system?: string;
  /** Trusted Host sources, accepted only by a configured model declaring vision. */
  images?: readonly PrologueInputImage[];
  structured?: PrologueStructuredRequest;
  onProgress?(event: PrologueTextProgress): void;
  timeoutMs?: number;
  maxOutputTokens?: number;
}
export type HostCompleteText = (prompt: string, options?: HostTextRequestOptions) => Promise<string>;
export type HostTextGeneration = (prompt: string, options?: HostTextRequestOptions) => Promise<PrologueTextResult>;
export interface HostTextOptions { homeDirectory?: string; selection?: TextModelSelection; resolveInference?: typeof resolvePrologueInference; env?: NodeJS.ProcessEnv }
interface TextConfiguration { base_url: string; api_format: ModelApiFormat; model_id: string; prompt_cache?: ModelPromptCacheMode }
const unavailable = () => new ActionError("actions.connection_required", "所选文字模型或连接已不可用，请检查模型设置和服务连接");

/** Discovery uses metadata; a returned completion rechecks its fixed selection before every request. */
export function hostCompleteText(options: HostTextOptions = {}): HostCompleteText | undefined {
  const generate = hostTextGeneration(options);
  return generate && (async (prompt, request) => (await generate(prompt, request)).value);
}

/** The same guarded model binding, with the complete execution receipt for consumers that need it. */
export function hostTextGeneration(options: HostTextOptions = {}): HostTextGeneration | undefined {
  const home = options.homeDirectory ?? resolveMolisWorkHome();
  if (options.env === undefined) {
    const opened = openConfiguredModels(home);
    if (opened) try {
      const selected = selectConfiguredTextModel(home, opened.store, options.selection);
      if (selected) {
        const selection = { provider_id: selected.provider.provider_id, model_id: selected.model.model_id };
        const current = () => {
          const catalog = openConfiguredModels(home);
          try {
            const selected = catalog && selectConfiguredTextModel(home, catalog.store, selection);
            return selected && { ...selected, credential_snapshot: runWithMolisWorkHome(home, () => peekSealedEntry(selected.provider.credential_ref)) };
          }
          finally { catalog?.storage.close(); }
        };
        return async (prompt, request) => {
          validatePrompt(prompt); request?.signal?.throwIfAborted();
          const before = current();
          if (!before) throw unavailable();
          assertVisionInput(request, before.model.vision === true);
          const config = { ...before.provider, model_id: before.model.model_id };
          const apiKey = runWithMolisWorkHome(home, () => createFileSecretStore().get(before.provider.credential_ref))?.trim();
          if (!apiKey) throw unavailable();
          if (JSON.stringify(current()) !== JSON.stringify(before)) throw unavailable();
          const result = await completeTextRequest(config, before.provider.credential_ref, () => {
            if (JSON.stringify(current()) !== JSON.stringify(before)) throw unavailable();
            return apiKey;
          }, prompt, home, request, options.resolveInference,
          () => JSON.stringify(current()) !== JSON.stringify(before));
          if (JSON.stringify(current()) !== JSON.stringify(before)) throw new ActionError("actions.configuration_changed", "生成期间模型或连接已变化，结果未提交，请重试");
          return result;
        };
      }
      // A disabled/invalid saved provider must not silently activate an environment credential.
      if (options.selection || opened.store.list().length) return undefined;
    } finally { opened.storage.close(); }
    if (options.selection) return undefined;
  }
  // Compatibility for installations that have not configured catalog providers yet.
  const env = options.env ?? process.env;
  const environmentKey = env.MOLIS_WORK_TEXT_API_KEY?.trim() || env.MINIMAX_API_KEY?.trim();
  const legacyRef = "model:text:api_key";
  if (!environmentKey && (options.env || !runWithMolisWorkHome(home, () => peekSealedEntry(legacyRef)))) return undefined;
  const config: TextConfiguration = { base_url: validateTextModelUrl(env.MOLIS_WORK_TEXT_BASE_URL?.trim() || "https://api.minimaxi.com/anthropic"),
    api_format: (env.MOLIS_WORK_TEXT_API_FORMAT?.trim() || "anthropic-messages") as ModelApiFormat, model_id: env.MOLIS_WORK_TEXT_MODEL?.trim() || "MiniMax-M3" };
  if (!["anthropic-messages", "openai-chat-completions"].includes(config.api_format)) throw new Error("模型接口格式无效");
  const legacyState = () => {
    if (options.env === undefined) {
      const catalog = openConfiguredModels(home);
      try { if (catalog?.store.list().length) return undefined; }
      finally { catalog?.storage.close(); }
    }
    const key = env.MOLIS_WORK_TEXT_API_KEY?.trim() || env.MINIMAX_API_KEY?.trim();
    const credential = key ? { available: true, revision: null } : modelCredentialMetadata(home, { credential_ref: legacyRef, base_url: config.base_url });
    if (!credential.available) return undefined;
    return { config: { ...config,
      base_url: validateTextModelUrl(env.MOLIS_WORK_TEXT_BASE_URL?.trim() || "https://api.minimaxi.com/anthropic"),
      api_format: env.MOLIS_WORK_TEXT_API_FORMAT?.trim() || "anthropic-messages", model_id: env.MOLIS_WORK_TEXT_MODEL?.trim() || "MiniMax-M3" },
      environmentKey: key, revision: credential.revision,
      credential_snapshot: key ? undefined : runWithMolisWorkHome(home, () => peekSealedEntry(legacyRef)) };
  };
  if (!legacyState()) return undefined;
  return async (prompt, request) => {
    validatePrompt(prompt); request?.signal?.throwIfAborted();
    assertVisionInput(request, false);
    const before = legacyState();
    if (!before || JSON.stringify(before.config) !== JSON.stringify(config)) throw unavailable();
    const key = before.environmentKey || (options.env ? undefined : runWithMolisWorkHome(home, () => createFileSecretStore().get(legacyRef))?.trim());
    if (!key) throw unavailable();
    const result = await completeTextRequest(config, legacyRef, () => {
      if (JSON.stringify(legacyState()) !== JSON.stringify(before)) throw unavailable();
      return key;
    }, prompt, home, request, options.resolveInference,
    () => JSON.stringify(legacyState()) !== JSON.stringify(before));
    if (JSON.stringify(legacyState()) !== JSON.stringify(before)) throw new ActionError("actions.configuration_changed", "生成期间模型或连接已变化，结果未提交，请重试");
    return result;
  };
}

function assertVisionInput(request: HostTextRequestOptions | undefined, vision: boolean): void {
  if (request?.images?.length && !vision) throw new ActionError("actions.connection_required", "请在模型设置中选择已声明支持图片的模型，原图未发送");
}

function validatePrompt(prompt: string): void {
  if (!prompt.trim() || prompt.length > 180_000) throw new Error("写作输入为空或过长，请减少材料后重试");
}

async function completeTextRequest(config: TextConfiguration, credentialRef: string, credential: () => string, prompt: string,
  home: string, request: HostTextRequestOptions = {}, resolveInference: typeof resolvePrologueInference = resolvePrologueInference,
  changed?: () => boolean): Promise<PrologueTextResult> {
  const { signal, beforeDispatch } = request;
  const timeoutMs = request.timeoutMs ?? 120_000, maxOutputTokens = request.maxOutputTokens ?? 5000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647 || !Number.isSafeInteger(maxOutputTokens) || maxOutputTokens <= 0) throw new Error("模型调用限制无效");
  if (request.system !== undefined && request.system.length > 64_000) throw new Error("模型指令过长");
  signal?.throwIfAborted();
  // Before dispatch a revoked source keeps its own reason; once sent, a failure after a change is that change.
  let dispatched = false;
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
  let authorityFailure: { cause: unknown } | undefined;
  const checkAuthority = async () => {
    boundedSignal.throwIfAborted();
    try { await beforeDispatch?.(); }
    catch (cause) { authorityFailure = { cause }; throw cause; }
    boundedSignal.throwIfAborted();
  };
  let result: PrologueTextResult;
  try {
    result = await waitForText((async () => {
      const inference = await resolveInference(home);
      boundedSignal.throwIfAborted();
      await checkAuthority();
      credential();
      dispatched = true;
      const completed = await inference.completeTextResult({
        beforeDispatch: checkAuthority,
        protocol: prologueProtocolFor(config.api_format), endpoint: modelRequestShape(config, "").url,
        model: config.model_id, credential_ref: credentialRef,
        resolveCredential: (ref: string) => { boundedSignal.throwIfAborted(); return ref === credentialRef ? credential() : null; },
        prompt, signal: boundedSignal, max_output_tokens: maxOutputTokens, timeout_ms: timeoutMs,
        ...(request.system === undefined ? {} : { system: request.system }),
        ...(request.images === undefined ? {} : { images: request.images }),
        ...(request.structured === undefined ? {} : { structured: request.structured }),
        ...(request.onProgress === undefined ? {} : { onProgress: request.onProgress }),
        ...(config.prompt_cache === undefined || config.prompt_cache === "off" ? {} : { prompt_cache: config.prompt_cache }),
      });
      boundedSignal.throwIfAborted();
      await checkAuthority();
      return completed;
    })(), boundedSignal);
  } catch (error) {
    signal?.throwIfAborted();
    if (dispatched && changed?.()) throw new ActionError("actions.configuration_changed", "生成期间模型或连接已变化，结果未提交，请重试");
    if (error instanceof ActionError) throw error;
    if (isDispatchRefusal(error)) throw new Error(`${error.message}；没有发给模型，材料已保留`);
    if (authorityFailure && error === authorityFailure.cause) throw error;
    const unavailable = inferenceServiceUnavailableReason(error);
    if (unavailable) throw new ActionError("actions.service_unavailable", `${unavailable}；材料已保留`);
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    const message = typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
      ? `模型返回 ${status}，请检查模型配置后重试` : "模型请求失败或超时，材料已保留，可重试";
    if (error instanceof PrologueInferenceError && error.code.startsWith("inference.image_")) throw error;
    if (error instanceof PrologueInferenceError) throw new PrologueInferenceError(error.code,
      error.code === "MODEL_STRUCTURED_INVALID" ? "模型返回的结构不符合要求，材料已保留" : message, error.status, error.execution);
    throw new Error(message);
  }
  signal?.throwIfAborted();
  if (typeof result.value !== "string" || !result.value.trim()) throw new Error("模型没有返回正文，材料已保留，可重试");
  return { ...result, value: result.value.trim() };
}

/** Cancellation also covers lazy Runtime startup; it never dispatches a model after an aborted wait. */
function waitForText<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
    if (signal.aborted) abort();
  });
}
