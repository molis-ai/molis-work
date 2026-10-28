import { createFileSecretStore, resolveMolisWorkHome, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { modelRequestShape, type ModelApiFormat, type ModelPromptCacheMode } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { resolvePrologueInference } from "./prologue-inference-host.js";
import { prologueProtocolFor, inferenceServiceUnavailableReason, isDispatchRefusal, PrologueInferenceError, type PrologueTextResult, type PrologueInputImage, type PrologueTextProgress, type PrologueStructuredRequest } from "@molis-ai/molis-work-service-agent-host";
import { ActionError, type ActionAvailability } from "@molis-ai/molis-work-contracts/platform/actions";
import { MINIMAX_ANTHROPIC_BASE_URL } from "./model-provider-templates.js";
import { configuredTextModelSnapshot, openConfiguredModels, selectConfiguredTextModel, validateTextModelUrl, type TextModelSelection } from "./configured-models.js";
import { L } from "./web-locale.js";
import { rememberInDirectoryPass } from "@molis-ai/molis-work-kernel";

export interface HostTextRequestOptions {
  signal?: AbortSignal;
  beforeDispatch?(): void | Promise<void>;
  /** Read-only final denial after all SDK preparation awaits; must complete synchronously without changing source or authority. */
  assertCurrent?(): void;
  /** Recheck an issued result; defaults to beforeDispatch. Hard cancellation and credential checks still apply. */
  afterResult?(): void | Promise<void>;
  system?: string;
  /** Trusted Host sources, accepted only by a configured model declaring vision. */
  images?: readonly PrologueInputImage[];
  structured?: PrologueStructuredRequest;
  onProgress?(event: PrologueTextProgress): void;
  timeoutMs?: number;
  maxOutputTokens?: number;
}
export type HostCompleteText = (prompt: string, options?: HostTextRequestOptions) => Promise<string>;
export type HostTextGenerationResult = PrologueTextResult & { validateResult(): void };
export type HostTextGenerationFailure = Error & { execution?: PrologueInferenceError["execution"]; validateResult?: () => void };
export type HostTextGeneration = (prompt: string, options?: HostTextRequestOptions) => Promise<HostTextGenerationResult>;
export interface HostTextOptions { homeDirectory?: string; selection?: TextModelSelection; resolveInference?: typeof resolvePrologueInference; env?: NodeJS.ProcessEnv }
interface TextConfiguration { base_url: string; api_format: ModelApiFormat; model_id: string; prompt_cache?: ModelPromptCacheMode }
const unavailable = () => new ActionError("actions.connection_required", "所选文字模型或连接已不可用，请检查模型设置和服务连接");

// No text model yet: what is missing and where the person adds one, by the name the settings page shows (settings-sections.ts).
// The only place that names it; the person, the panel and the model all read this reason (handbook 13.4).
const TEXT_MODEL_MISSING = "请先在「模型设置」里连接文字模型";
const TEXT_MODEL_MISSING_FOR = "请先在「模型设置」里连接文字模型，再{purpose}";

/** Why the work cannot start without a text model, in the person's language; `purpose` is what it was for, already translated. */
export function textModelMissing(purpose?: string): string {
  return purpose ? L(TEXT_MODEL_MISSING_FOR, { purpose }) : L(TEXT_MODEL_MISSING);
}

/** The same, thrown when the work starts anyway (the model went away after the action was offered). */
export function textModelRequired(purpose?: string): ActionError {
  return new ActionError("actions.connection_required", textModelMissing(purpose));
}

/**
 * Whether an action that needs the text model can run now. No model is `actions.connection_required` with the reason above,
 * so the person knows where to set one up. Model settings that cannot be read are another fact, with the failure's own code
 * (`actions.configuration_unavailable` when it has none), so nobody is sent to set up a model they already have.
 */
export function textModelAvailability(model: () => unknown, purpose?: string): ActionAvailability {
  try { return model() ? { available: true } : { available: false, code: "actions.connection_required", reason: textModelMissing(purpose) }; }
  catch (error) { return { available: false, code: error instanceof ActionError ? error.code : "actions.configuration_unavailable", reason: "文字模型的设置读不了，请检查模型设置" }; }
}

/** Discovery uses metadata; a returned completion rechecks its fixed selection before every request. */
export function hostCompleteText(options: HostTextOptions = {}): HostCompleteText | undefined {
  const generate = hostTextGeneration(options);
  return generate && (async (prompt, request) => (await generate(prompt, request)).value);
}

/**
 * The same guarded model binding, with the complete execution receipt for consumers that need it. Asked by the availability checks
 * of one action directory, it reads the model settings once for each Home and selection; a call outside a directory reads afresh.
 */
export function hostTextGeneration(options: HostTextOptions = {}): HostTextGeneration | undefined {
  if (options.env !== undefined || options.resolveInference) return readHostTextGeneration(options);
  const home = options.homeDirectory ?? resolveMolisWorkHome();
  return rememberInDirectoryPass(hostTextGeneration, JSON.stringify([home, options.selection ?? null]), () => readHostTextGeneration({ ...options, homeDirectory: home }));
}

function readHostTextGeneration(options: HostTextOptions): HostTextGeneration | undefined {
  const home = options.homeDirectory ?? resolveMolisWorkHome();
  if (options.env === undefined) {
    const opened = openConfiguredModels(home);
    if (opened) try {
      const selected = selectConfiguredTextModel(home, opened.store, options.selection);
      if (selected) {
        const selection = { provider_id: selected.provider.provider_id, model_id: selected.model.model_id };
        const current = () => configuredTextModelSnapshot(home, selection);
        return async (prompt, request) => {
          validatePrompt(prompt); request?.signal?.throwIfAborted();
          const before = current();
          if (!before) throw unavailable();
          assertVisionInput(request, before.model.vision === true);
          const config = { ...before.provider, model_id: before.model.model_id };
          const apiKey = runWithMolisWorkHome(home, () => createFileSecretStore().get(before.provider.credential_ref))?.trim();
          if (!apiKey) throw unavailable();
          if (JSON.stringify(current()) !== JSON.stringify(before)) throw unavailable();
          return guardedGeneration(() => completeTextRequest(config, before.provider.credential_ref, () => {
            if (JSON.stringify(current()) !== JSON.stringify(before)) throw unavailable();
            return apiKey;
          }, prompt, home, request, options.resolveInference,
          () => JSON.stringify(current()) !== JSON.stringify(before)), () => JSON.stringify(current()) !== JSON.stringify(before));
        };
      }
      // A disabled/invalid saved provider must not silently activate an environment credential.
      if (options.selection || opened.store.list().length) return undefined;
    } finally { opened.storage.close(); }
    if (options.selection) return undefined;
  }
  const env = options.env ?? process.env;
  const environmentState = () => {
    if (options.env === undefined) {
      const catalog = openConfiguredModels(home);
      try { if (catalog?.store.list().length) return undefined; }
      finally { catalog?.storage.close(); }
    }
    return environmentModel(env);
  };
  const initial = environmentState();
  if (!initial) return undefined;
  const { config } = initial;
  return async (prompt, request) => {
    validatePrompt(prompt); request?.signal?.throwIfAborted();
    assertVisionInput(request, false);
    const before = environmentState();
    if (!before || JSON.stringify(before.config) !== JSON.stringify(config)) throw unavailable();
    return guardedGeneration(() => completeTextRequest(config, ENVIRONMENT_CREDENTIAL, () => {
      if (JSON.stringify(environmentState()) !== JSON.stringify(before)) throw unavailable();
      return before.key;
    }, prompt, home, request, options.resolveInference,
    () => JSON.stringify(environmentState()) !== JSON.stringify(before)), () => JSON.stringify(environmentState()) !== JSON.stringify(before));
  };
}

/** This closure retains the dispatched snapshot, including for failures with execution facts. */
async function guardedGeneration(run: () => Promise<PrologueTextResult>, changed: () => boolean): Promise<HostTextGenerationResult> {
  const validateResult = () => {
    if (changed()) throw new ActionError("actions.configuration_changed", "生成期间模型或连接已变化，结果未提交，请重试");
  };
  try {
    const result = await run();
    validateResult();
    return Object.defineProperty({ ...result }, "validateResult", { value: validateResult }) as HostTextGenerationResult;
  } catch (error) {
    // Dispatch already classified terminal refusals; they carry no recordable result.
    if (error instanceof ActionError) throw error;
    validateResult();
    if (error instanceof Error) Object.defineProperty(error, "validateResult", { value: validateResult, configurable: true });
    throw error;
  }
}

/** Names the environment key to the model runtime; it is not a stored credential. */
const ENVIRONMENT_CREDENTIAL = "environment:text-model";

/**
 * Development and tests only (repository-anti-corruption §1, 2026-10-04): an explicit environment key configures a text model
 * when no catalog provider exists; stored credentials outside the catalog are never read. `MINIMAX_API_KEY` names MiniMax;
 * `MOLIS_WORK_TEXT_API_KEY` names no provider, so it configures nothing without its own base URL and model.
 */
function environmentModel(env: NodeJS.ProcessEnv): { config: TextConfiguration; key: string } | undefined {
  const generic = env.MOLIS_WORK_TEXT_API_KEY?.trim(); const key = generic || env.MINIMAX_API_KEY?.trim();
  const base_url = env.MOLIS_WORK_TEXT_BASE_URL?.trim() || (generic ? "" : MINIMAX_ANTHROPIC_BASE_URL);
  const model_id = env.MOLIS_WORK_TEXT_MODEL?.trim() || (generic ? "" : "MiniMax-M3");
  if (!key || !base_url || !model_id) return undefined;
  const api_format = (env.MOLIS_WORK_TEXT_API_FORMAT?.trim() || "anthropic-messages") as ModelApiFormat;
  if (!["anthropic-messages", "openai-chat-completions"].includes(api_format)) throw new Error("模型接口格式无效");
  return { config: { base_url: validateTextModelUrl(base_url), api_format, model_id }, key };
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
  const checkAuthority = async (check = beforeDispatch) => {
    boundedSignal.throwIfAborted();
    try { await check?.(); }
    catch (cause) { authorityFailure = { cause }; throw cause; }
    boundedSignal.throwIfAborted();
  };
  const checkResultAuthority = () => checkAuthority(request.afterResult ?? beforeDispatch);
  const assertAuthority = () => {
    boundedSignal.throwIfAborted();
    try { credential(); return request.assertCurrent?.(); }
    catch (cause) { authorityFailure = { cause }; throw cause; }
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
        assertCurrent: assertAuthority,
        afterResult: checkResultAuthority,
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
      await checkResultAuthority();
      return completed;
    })(), boundedSignal);
  } catch (error) {
    signal?.throwIfAborted();
    if (dispatched && changed?.()) throw new ActionError("actions.configuration_changed", "生成期间模型或连接已变化，结果未提交，请重试");
    if (error instanceof ActionError) throw error;
    if (isDispatchRefusal(error)) throw new Error(`${error.message}；没有发给模型，材料已保留`);
    if (authorityFailure) throw authorityFailure.cause;
    const unavailable = inferenceServiceUnavailableReason(error);
    if (unavailable) throw new ActionError("actions.service_unavailable", `${unavailable}；材料已保留`);
    const status = typeof error === "object" && error !== null && "status" in error ? error.status : undefined;
    const message = typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599
      ? `模型返回 ${status}，请检查模型配置后重试` : "模型请求失败或超时，材料已保留，可重试";
    if (error instanceof PrologueInferenceError && error.code.startsWith("agent.inference.image_")) throw error;
    if (error instanceof PrologueInferenceError) throw new PrologueInferenceError(error.code,
      error.code === "MODEL_STRUCTURED_INVALID" ? "模型返回的结构不符合要求，材料已保留" : message, error.status, error.execution);
    throw new Error(message);
  }
  signal?.throwIfAborted();
  if (typeof result.value !== "string" || !result.value.trim()) throw Object.assign(new Error("模型没有返回正文，材料已保留，可重试"), { execution: { run_ref: result.run_ref, state: result.state, configuredModel: result.configuredModel, reportedModels: result.reportedModels, usage: result.usage } });
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
