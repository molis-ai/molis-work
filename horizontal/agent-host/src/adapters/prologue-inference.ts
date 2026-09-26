import type { ExactRef, ModelEvent, Runtime } from "@prologue/sdk";
import { PrologueInferenceError, type PrologueCredentialInput, type PrologueInferenceClient, type PrologueTextInput, type PrologueTextResult } from "../inference.js";

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
    const task = (async () => { signal.throwIfAborted(); try { return await waitForInference(operation(signal), signal); } catch (error) { signal.throwIfAborted(); throw safeError(error); } })();
    active.set(controller, task);
    void task.finally(() => active.delete(controller)).catch(() => {});
    return task;
  };
  const execute = <T>(input: PrologueCredentialInput, signal: AbortSignal, optional: boolean, operation: (ref?: ExactRef<"credential">) => Promise<T>): Promise<T> => (async () => {
    const prepared = await credential(input, signal, optional);
    const guard = async () => { signal.throwIfAborted(); await prepared.assertCurrent(); signal.throwIfAborted(); await input.beforeDispatch?.(); signal.throwIfAborted(); };
    await guard();
    return withDispatchGuard(guard, async () => { const value = await operation(prepared.ref); await guard(); return value; });
  })();
  const completeTextResult = (input: PrologueTextInput): Promise<PrologueTextResult> => bounded(input, signal => execute(input, signal, false, async credentialRef => {
    if (!credentialRef) throw new PrologueInferenceError("inference.credential_missing", "模型密钥不可用");
    const session = await runtime.sessions.create({ ephemeral: true });
    try {
      signal.throwIfAborted();
      const run = await session.startRun({ protocol: input.protocol, endpoint: input.endpoint, model: input.model,
        credentialRef, messages: [{ role: "user", text: input.prompt }], timeoutMs: input.timeout_ms,
        params: { maxOutputTokens: input.max_output_tokens }, ...(input.prompt_cache && input.prompt_cache !== "off" ? { promptCache: input.prompt_cache } : {}) });
      let value = "";
      const reportedModels = new Set<string>(), usage: unknown[] = [];
      await new Promise<void>((resolve, reject) => {
        let settled = false, detach: (() => void) | undefined;
        const finish = (error?: unknown) => { if (settled) return; settled = true; signal.removeEventListener("abort", abort); detach?.(); error ? reject(error) : resolve(); };
        const abort = () => { void run.cancel().catch(() => {}); finish(signal.reason); };
        signal.addEventListener("abort", abort, { once: true });
        detach = run.subscribe((event: ModelEvent) => {
          if (settled) return;
          if (event.type === "text-delta") value += event.text;
          if (event.type === "model-reported") reportedModels.add(event.model);
          if (event.type === "usage-recorded") usage.push(event.receipt);
          if (event.type === "completed") finish();
          else if (event.type === "failed") finish(event.error);
          else if (event.type === "cancelled") finish(signal.reason ?? new DOMException("Inference cancelled", "AbortError"));
        });
        if (settled) detach();
        if (signal.aborted) abort();
      });
      signal.throwIfAborted();
      if (!value.trim()) throw new PrologueInferenceError("inference.empty", "模型没有返回文字");
      return { value, configuredModel: input.model, reportedModels: [...reportedModels], usage };
    } finally { await session.archive(); }
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
  if (error instanceof PrologueInferenceError) return error;
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
