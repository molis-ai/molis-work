import { collectRun, type ExactRef, type Runtime } from "@prologue/sdk";
import { withInferenceImages } from "./prologue-inference-materials.js";
import { PrologueInferenceError, isDispatchRefusal, markDispatchRefusal, type PrologueCredentialInput, type PrologueInferenceClient, type PrologueTextInput, type PrologueTextResult } from "../inference.js";

/** Borrows the owning Runtime; never constructs a Host or a second model execution path. */
export function createPrologueInference(runtime: Runtime,
  credential: (input: PrologueCredentialInput, signal: AbortSignal, optional?: boolean) => Promise<{ ref?: ExactRef<"credential">; assertCurrent(): Promise<void> }>,
  withDispatchGuard: <T>(guard: () => Promise<void>, operation: () => Promise<T>) => Promise<T>,
): PrologueInferenceClient & { close(): Promise<void> } {
  const active = new Map<AbortController, Promise<unknown>>();
  let closed = false;
  const bounded = <T>(input: { signal?: AbortSignal; timeout_ms: number }, operation: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    if (closed) return Promise.reject(new PrologueInferenceError("inference.closed", "推理服务已关闭"));
    if (!Number.isFinite(input.timeout_ms) || input.timeout_ms <= 0) return Promise.reject(new PrologueInferenceError("inference.invalid_timeout", "推理时限无效"));
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(input.timeout_ms), ...(input.signal ? [input.signal] : [])]);
    const task = (async () => { signal.throwIfAborted(); try { return await operation(signal); } catch (error) { signal.throwIfAborted(); throw safeError(error); } })();
    active.set(controller, task);
    void task.finally(() => active.delete(controller)).catch(() => {});
    return waitForInference(task, signal);
  };
  const execute = <T>(input: PrologueCredentialInput, signal: AbortSignal, optional: boolean, operation: (ref: ExactRef<"credential"> | undefined, check: () => Promise<void>) => Promise<T>): Promise<T> => (async () => {
    const prepared = await waitForInference(credential(input, signal, optional), signal);
    let refused: Error | undefined;
    const guard = async () => {
      try { signal.throwIfAborted(); await waitForInference(prepared.assertCurrent(), signal); signal.throwIfAborted(); await waitForInference(Promise.resolve(input.beforeDispatch?.()), signal); signal.throwIfAborted(); }
      catch (error) { if (!signal.aborted && error instanceof Error) refused = markDispatchRefusal(error); throw error; }
    };
    try {
      await guard();
      return await withDispatchGuard(guard, async () => { const value = await operation(prepared.ref, guard); await guard(); return value; });
    } catch (error) { throw refused ?? error; }
  })();
  const completeTextResult = (input: PrologueTextInput): Promise<PrologueTextResult> => bounded(input, signal => execute(input, signal, false, async (credentialRef, check) => {
    if (!credentialRef) throw new PrologueInferenceError("inference.credential_missing", "模型密钥不可用");
    return withInferenceImages(runtime, input.images, check, async attachments => {
      const session = await runtime.sessions.create({ ephemeral: true });
      try {
        signal.throwIfAborted();
        const run = await session.startRun({ protocol: input.protocol, endpoint: input.endpoint, model: input.model,
          credentialRef, ...(attachments ? { attachments } : {}), messages: [...(input.system ? [{ role: "system" as const, text: input.system }] : []), { role: "user", text: input.prompt }], timeoutMs: input.timeout_ms,
          params: { maxOutputTokens: input.max_output_tokens, ...(input.structured ? { structured: input.structured } : {}) },
          ...(input.prompt_cache && input.prompt_cache !== "off" ? { promptCache: input.prompt_cache } : {}) });
        try { input.onProgress?.({ type: "started", run_ref: run.ref }); }
        catch (error) { await run.cancel(); throw error; }
        const result = await collectRun(run, { signal, maxTextChars: 180_000, maxEvents: 100_000, onEvent: event => {
          if (event.type === "text-delta" || event.type === "model-reported" || event.type === "usage-recorded") input.onProgress?.(event);
        } });
        const execution = { run_ref: result.ref, state: result.state, configuredModel: input.model, reportedModels: result.reportedModels, usage: result.usage };
        if (result.state !== "completed") {
          const error = result.terminal.type === "failed" ? safeError(result.terminal.error) : undefined;
          throw new PrologueInferenceError(error instanceof PrologueInferenceError ? error.code : `inference.${result.state}`, "模型未完成，原材料已保留",
            error instanceof PrologueInferenceError ? error.status : undefined, execution);
        }
        signal.throwIfAborted();
        if (!result.text.trim()) throw new PrologueInferenceError("inference.empty", "模型没有返回文字", undefined, execution);
        return { ...execution, state: "completed", value: result.text,
          ...(input.structured && input.structured.mode !== "none" ? { structured: JSON.parse(result.text) as unknown } : {}),
        };
      } finally { await session.archive(); }
    });
  }));
  return {
    completeTextResult,
    async completeText(input) { return (await completeTextResult(input)).value; },
    generateImages: input => bounded(input, signal => execute(input, signal, true, async credentialRef => {
      const receipt = await runtime.images.generate({ protocol: input.protocol, endpoint: input.endpoint, model: input.model,
        credentialRef, ...(credentialRef ? {} : { auth: "none" as const }), prompt: input.prompt,
        ...(input.size ? { size: input.size as `${number}x${number}` } : {}),
        ...(input.aspect_ratio ? { aspectRatio: input.aspect_ratio as `${number}:${number}` } : {}), timeoutMs: input.timeout_ms, signal });
      const images: { bytes: Uint8Array; mime?: string }[] = [];
      try {
        for (const ref of receipt.images) {
          signal.throwIfAborted();
          const resource = runtime.resources.inspect(ref);
          if (!resource || resource.byteLength > 20 * 1024 * 1024) throw new PrologueInferenceError("inference.image_invalid", "图片资源不可读取或超出大小限制");
          const bytes = new Uint8Array(resource.byteLength);
          for (let offset = 0; offset < bytes.length;) {
            const chunk = await runtime.resources.readChunk(ref, offset, Math.min(64 * 1024, bytes.length - offset));
            signal.throwIfAborted();
            if (chunk.offset !== offset || !chunk.bytes.length || offset + chunk.bytes.length > bytes.length) throw new PrologueInferenceError("inference.image_invalid", "图片资源不完整");
            bytes.set(chunk.bytes, offset); offset += chunk.bytes.length;
          }
          images.push({ bytes });
        }
        return images;
      } finally { for (const ref of receipt.images) await runtime.resources.revoke(ref); }
    })),
    evaluateTypeSafe: input => bounded(input, signal => execute(input, signal, false, async credentialRef => {
      if (!credentialRef) throw new PrologueInferenceError("inference.credential_missing", "判断服务密钥不可用");
      return runtime.typesafe.evaluate({ protocol: "typesafe", endpoint: input.endpoint, model: input.model, credentialRef,
        state: input.state, questions: input.questions, timeoutMs: input.timeout_ms, signal });
    })),
    async close() { closed = true; for (const controller of active.keys()) controller.abort(); await Promise.allSettled([...active.values()]); },
  };
}
function safeError(error: unknown): Error {
  if (error instanceof PrologueInferenceError || isDispatchRefusal(error)) return error;
  const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "inference.failed";
  const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number" && Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : undefined;
  return new PrologueInferenceError(code, "模型请求失败，原材料已保留", status);
}

function waitForInference<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) { void work.catch(() => {}); return Promise.reject(signal.reason); }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
