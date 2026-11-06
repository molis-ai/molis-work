import { open } from "node:fs/promises";
import { performance } from "node:perf_hooks";

export interface EvaluationAttempt { bytes: number; body: unknown; startedAt: string; intentIndex: number; checkpointDurationMs?: number }
export interface DispatchObservation {
  beforeDispatch?(attempt: EvaluationAttempt): Promise<void>;
  signal?: AbortSignal;
}

/** The append-only journal owns dispatch intents, not outcomes or billing claims.
 * Progress snapshots own event results; they never reconstruct or overwrite these intents.
 * An intent may survive a crash before fetch; its dispatch state then remains unknown.
 * file.sync plus the SIGKILL test cover process interruption, not power-loss durability of directory entries.
 */
export async function createEvaluationAttemptJournal(path: string) {
  const file = await open(path, "wx", 0o600);
  let closed = false, failure: unknown;
  try { await file.sync(); } catch (error) { await file.close(); throw error; }
  return {
    async beforeDispatch(attempt: EvaluationAttempt) {
      if (closed || failure) throw new Error("attempt 落盘已停止/closed；不得继续派出");
      try {
        await file.writeFile(`${JSON.stringify({ state: "dispatch-intent", attempt })}\n`);
        await file.sync();
      } catch (error) { failure = error; throw error; }
    },
    async close() { if (!closed) { closed = true; await file.close(); } },
  };
}

/** Counts fetch invocations (including SDK retries); observes without rebuilding the prompt. */
export function observeEvaluationRequests(endpoint: string, maxAttempts: number = 8,
  limits: () => { maxOutputTokens: number; maxRequestBytes: number } = () => ({ maxOutputTokens: 1024, maxRequestBytes: 12000 }),
  observation: DispatchObservation = {}) {
  const original = globalThis.fetch;
  const fixtures = new Set<string>(), fixtureRequests: Array<{ endpoint: string; bytes: number }> = [];
  const requests: EvaluationAttempt[] = [];
  const cancelled = new AbortController();
  let failure: unknown, intentIndex = 0, queue: Promise<void> = Promise.resolve();
  const stop = (reason: unknown = "评测已停止") => { failure ??= reason; cancelled.abort(reason); };
  const assertActive = () => {
    if (failure) throw new Error(`评测派出已停止：${String(failure)}`);
    observation.signal?.throwIfAborted();
  };
  globalThis.fetch = async (input, init) => {
    assertActive();
    const url = input instanceof Request ? input.url : String(input);
    if (fixtures.has(url)) {
      const raw = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.clone().text() : "";
      fixtureRequests.push({ endpoint: url, bytes: Buffer.byteLength(raw) }); return original(input, init);
    }
    if (url !== endpoint) throw new Error("评测拒绝未声明的网络目标");
    const raw = typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body)
      : input instanceof Request ? await input.clone().text() : null;
    if (raw === null) throw new Error("评测无法核对请求大小；未发出");
    const bytes = Buffer.byteLength(raw);
    if (bytes > limits().maxRequestBytes) throw new Error("评测请求超过已批准字节上限；未发出");
    const body: { max_tokens?: unknown; model?: unknown } = JSON.parse(raw);
    if (typeof body.max_tokens !== "number" || body.max_tokens > limits().maxOutputTokens) throw new Error("模型请求未遵守已批准输出上限；未发出");
    // Only the bounded reservation/checkpoint is serialized. Never wait for a response in this queue.
    let send!: Promise<Response>;
    const reserved = queue.then(async () => {
      assertActive();
      if (requests.length >= maxAttempts) throw new Error("评测网络 attempt 预算已用尽；不再发出请求");
      const signal = AbortSignal.any([cancelled.signal, ...(observation.signal ? [observation.signal] : []),
        ...(init?.signal ? [init.signal] : input instanceof Request ? [input.signal] : [])]);
      signal.throwIfAborted();
      const attempt: EvaluationAttempt = { bytes, body, startedAt: new Date().toISOString(), intentIndex: intentIndex++ };
      const checkpointStarted = performance.now();
      try { await observation.beforeDispatch?.(attempt); }
      catch (error) { stop(error); throw error; }
      attempt.checkpointDurationMs = performance.now() - checkpointStarted;
      assertActive(); signal.throwIfAborted();
      requests.push(attempt);
      send = original(input, { ...init, signal });
      // Attach immediately: a fast transport failure must not become an unhandled rejection while reservation settles.
      void send.catch(() => {});
    });
    queue = reserved.catch(() => {});
    await reserved;
    return send;
  };
  return { requests, fixtureRequests,
    registerFixture(endpoint: string) {
      const url = new URL(endpoint);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/v1/chat/completions") throw new Error("Source setup must use the exact loopback endpoint");
      fixtures.add(endpoint); return () => { fixtures.delete(endpoint); };
    }, stop, restore() { stop("observer restored"); globalThis.fetch = original; } };
}
