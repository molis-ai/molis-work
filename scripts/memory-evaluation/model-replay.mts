import type { AgentManifest } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { performance } from "node:perf_hooks";
import type { AgentRecalledMemory, AgentRunHandle, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentStartAuthority, PrologueModelConfiguration, PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { MEMORY_EVALUATION_CORPUS, type MemoryEvaluationCase } from "../../tests/fixtures/memory-evaluation-corpus.js";
import { currentEvaluationSource } from "./baseline.mjs";
import { memoryEvaluationEnvironment, type EvaluationArm, assertEvaluationArm } from "./environment.mjs";
import { evaluationOwner } from "./originals.mjs";
import { missingMemoryPhases } from "./memory-phase-observation.mjs";

export const MEMORY_MODEL_CALIBRATION = {
  cases: ["coding-install", "assistant-meeting", "self-contained", "correction"],
  maxAttempts: 8,
  maxOutputTokens: 1024,
  maxTokensPerRun: 8192,
  maxRequestBytes: 12000,
  maxDurationMs: 90_000,
} as const;
const manifest: AgentManifest = { roles: [{ role_id: "reader", version: 1, name: "记忆机制校准", workspace: "none", execution: "read-only", host_tools: [], prompts: [] }], prompts: [] };
type ModelPorts = Pick<PrologueNodeAdapterOptions, "modelConfiguration" | "resolveCredential">;
type Environment = Awaited<ReturnType<typeof memoryEvaluationEnvironment>>;

/** Counts actual fetch attempts (including SDK retries); observes a request without rebuilding its prompt. */
export function observeEvaluationRequests(endpoint: string, maxAttempts: number = MEMORY_MODEL_CALIBRATION.maxAttempts,
  limits: () => { maxOutputTokens: number; maxRequestBytes: number } = () => MEMORY_MODEL_CALIBRATION) {
  const original = globalThis.fetch;
  const fixtures = new Set<string>(), fixtureRequests: Array<{ endpoint: string; bytes: number }> = [];
  const requests: Array<{ bytes: number; body: unknown; startedAt: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (fixtures.has(url)) {
      const raw = typeof init?.body === "string" ? init.body : input instanceof Request ? await input.clone().text() : "";
      fixtureRequests.push({ endpoint: url, bytes: Buffer.byteLength(raw) }); return original(input, init);
    }
    if (url !== endpoint) throw new Error("评测拒绝未声明的网络目标");
    if (requests.length >= maxAttempts) throw new Error("评测网络 attempt 预算已用尽；不再发出请求");
    const raw = typeof init?.body === "string" ? init.body : init?.body instanceof Uint8Array ? new TextDecoder().decode(init.body)
      : input instanceof Request ? await input.clone().text() : null;
    if (raw === null) throw new Error("评测无法核对请求大小；未发出");
    const bytes = Buffer.byteLength(raw);
    if (bytes > limits().maxRequestBytes) throw new Error("评测请求超过已批准字节上限；未发出");
    const body: { max_tokens?: unknown; model?: unknown } = JSON.parse(raw);
    if (typeof body.max_tokens !== "number" || body.max_tokens > limits().maxOutputTokens) throw new Error("模型请求未遵守已批准输出上限；未发出");
    requests.push({ bytes, body, startedAt: new Date().toISOString() });
    return original(input, init);
  };
  return { requests, fixtureRequests,
    registerFixture(endpoint: string) {
      const url = new URL(endpoint);
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/v1/chat/completions") throw new Error("Source setup must use the exact loopback endpoint");
      fixtures.add(endpoint); return () => { fixtures.delete(endpoint); };
    }, restore() { globalThis.fetch = original; } };
}

async function ended(env: Environment, handle: AgentRunHandle, timeoutMs: number, started: number): Promise<{ view: AgentRunView | null; error: string | null; firstVisibleResponseMs: number | null }> {
  return new Promise(resolve => {
    let unsubscribe = () => {};
    let view: AgentRunView | null = null, error: string | null = null, firstVisibleResponseMs: number | null = null;
    const finish = () => { clearTimeout(timer); queueMicrotask(() => unsubscribe()); resolve({ view, error, firstVisibleResponseMs }); };
    const timer = setTimeout(() => {
      error = "评测观察超时，已请求取消；保留最后视图及已发生用量";
      env.adapter.control(handle.ref, { kind: "cancel" }).then(finish, failure => { error += `；取消失败：${String(failure)}`; finish(); });
    }, timeoutMs);
    unsubscribe = env.adapter.observe(handle.ref, current => {
      view = current;
      if (firstVisibleResponseMs === null && current.turns.some(turn => turn.kind === "assistant" && turn.text.length > 0)) firstVisibleResponseMs = performance.now() - started;
      if (["completed", "failed", "cancelled", "stopped", "reconcile-required"].includes(current.phase)) finish();
    });
  });
}

/** Uses the exact production forRun recipe -> AgentHost -> SDK task recall and final Context path. No hand-built memory prompt. */
export async function runMemoryEvaluationTask(env: Environment, arm: EvaluationArm, item: MemoryEvaluationCase,
  observationTimeoutMs: number = MEMORY_MODEL_CALIBRATION.maxDurationMs + 5_000) {
  assertEvaluationArm(arm);
  const memoryChoice: { value: AgentRecalledMemory | null } = { value: null };
  const started = performance.now();
  let recallFailure: string | null = null, view: AgentRunView | null = null, failure: string | null = null;
  let recallLatencyMs: number | null = null, firstVisibleResponseMs: number | null = null;
  let memoryPhases = missingMemoryPhases();
  try {
    const owner = evaluationOwner(item.scene, item.project);
    const authority: AgentStartAuthority = { manifest, authorizedDirectories: [], prompts: [], memory: async task => {
      const recallStarted = performance.now();
      try {
        memoryChoice.value = await env.memory.forRun({ actor_id: owner.actor_id, project_id: item.project, consumer: item.scene === "coding" ? "agent" : "assistant", current_scene: item.scene, ...(item.scene === "coding" ? { plugin_id: owner.plugin_id } : {}), work: { work_id: item.id, title: item.purpose } }, { ...item.request, query: task });
        return memoryChoice.value;
      } catch (error) { recallFailure = error instanceof Error ? error.message : String(error); throw error; }
      finally { recallLatencyMs = performance.now() - recallStarted; }
    } };
    const session = await env.host.createSession("prologue", { ...owner, workspace: "none", role_id: "reader", title: item.id }, authority);
    const finishPhases = env.observeMemoryPhases(session);
    let handle: AgentRunHandle;
    try {
      handle = await env.host.start("prologue", { ...owner, session, workspace: "none", role_id: "reader", task: item.request.query ?? "", budget: {
        max_turns: 1, max_output_tokens: MEMORY_MODEL_CALIBRATION.maxOutputTokens, max_total_tokens: MEMORY_MODEL_CALIBRATION.maxTokensPerRun, max_duration_ms: MEMORY_MODEL_CALIBRATION.maxDurationMs,
      } }, authority);
    } finally { memoryPhases = finishPhases(); }
    const outcome = await ended(env, handle, observationTimeoutMs, started);
    view = outcome.view; failure = outcome.error; firstVisibleResponseMs = outcome.firstVisibleResponseMs;

  } catch (error) { failure = error instanceof Error ? error.message : String(error); }
  const keyFor = (id: string) => [...env.ids].find(([, ref]) => ref === id)?.[0] ?? null;
  return {
      arm, case: item.id, scene: item.scene, phase: failure ? "failed" : view?.phase ?? "failed", error: failure, stopReason: view?.stop_reason ?? null, recallFailure,
      selected: (view?.memory_recalled?.selected ?? []).map(ref => ({ seed: keyFor(ref.memory_id), ref: ref.memory_id })),
      runtimeMemoryReceipt: view?.memory_recalled ?? null,
      runtimeContextReferences: [...new Map((view?.memory_recalled?.contexts ?? []).filter(call => call.status === "response-observed" || call.status === "dispatched-or-unknown")
        .flatMap(call => call.references).map(ref => [`${ref.memory_id}@${ref.version}`, { seed: keyFor(ref.memory_id), ref: ref.memory_id, version: ref.version }])).values()],
      contextCalls: view?.memory_recalled?.contexts ?? null,
      retrievals: view?.memory_recalled?.retrievals ?? null,
      receiptId: memoryChoice.value?.receipt_id ?? null, usage: view?.usage ?? null,
      answer: view?.turns.filter(turn => turn.kind === "assistant").map(turn => turn.text).join("\n") ?? null,
      lastObservedView: view ? { phase: view.phase, usage: view.usage, startedAt: view.started_at, endedAt: view.ended_at } : null,
      backend: env.readCounts(), recipeLatencyMs: recallLatencyMs, taskRetrievalLatencyMs: memoryPhases.taskRecall.durationMs,
      openingMemoryPreparationLatencyMs: memoryPhases.openingMemoryPreparation.durationMs, memoryPhases, firstVisibleResponseMs, taskQuality: "awaiting-independent-review", memoryTokens: null,
      model: view?.frozen.model_id ?? null, durationMs: performance.now() - started,
    };
}

export async function replayMemoryModelCase(arm: EvaluationArm, item: MemoryEvaluationCase, model: ModelPorts, observationTimeoutMs?: number) {
  const env = await memoryEvaluationEnvironment(model);
  try { await env.prepare(arm, item); return await runMemoryEvaluationTask(env, arm, item, observationTimeoutMs); }
  finally { await env.close(); }
}

type CalibrationRow = (Awaited<ReturnType<typeof replayMemoryModelCase>> | { arm: EvaluationArm; case: string; phase: "not-run" | "failed"; error: string }) & { attemptRange: { startInclusive: number; endExclusive: number } };
export interface CalibrationProgress {
  attempts: number;
  requests: ReturnType<typeof observeEvaluationRequests>["requests"];
  rows: readonly CalibrationRow[];
}

/** Only the root-approved small calibration batch; failures consume attempts and are never silently rerun. */
export async function replayMemoryModelCalibration(config: PrologueModelConfiguration, resolveCredential: NonNullable<ModelPorts["resolveCredential"]>,
  onProgress?: (progress: CalibrationProgress) => Promise<void>) {
  const observer = observeEvaluationRequests(config.endpoint);
  const rows: CalibrationRow[] = [];
  try {
    for (const id of MEMORY_MODEL_CALIBRATION.cases) for (const arm of ["B0", "B2"] as const) {
      const item = MEMORY_EVALUATION_CORPUS.cases.find(row => row.id === id)!;
      const startInclusive = observer.requests.length;
      const attemptRange = () => ({ startInclusive, endExclusive: observer.requests.length });
      if (observer.requests.length >= MEMORY_MODEL_CALIBRATION.maxAttempts) rows.push({ arm, case: id, phase: "not-run", error: "网络 attempt 总预算已耗尽", attemptRange: attemptRange() });
      else {
        try { rows.push({ ...await replayMemoryModelCase(arm, item, { modelConfiguration: async () => config, resolveCredential }), attemptRange: attemptRange() }); }
        catch (error) { rows.push({ arm, case: id, phase: "failed", error: error instanceof Error ? error.message : String(error), attemptRange: attemptRange() }); }
      }
      // A failed checkpoint stops the batch before another billable request.
      await onProgress?.({ attempts: observer.requests.length, requests: observer.requests, rows });
    }
  } finally { observer.restore(); }
  return { schema: "molis-memory-model-calibration-v2", recordedAt: new Date().toISOString(), source: currentEvaluationSource(), budget: MEMORY_MODEL_CALIBRATION,
    model: config.model, endpoint: config.endpoint, attempts: observer.requests.length, requests: observer.requests, rows,
    limitations: ["四个任务成对运行仅校准真实调用与用量链，不是代表性验证集或稳定收益证据", "任务质量需独立人工核对；尚未测形成、晋升、维护和按需展开成本", "Runtime memory receipt 与实际发出的请求分别保留，未推定二者等价", "Provider用量是整次调用，不把字符或请求字节当作记忆token", "当前 B2 的工程观测不证明收益；新 SDK 旧配方归因对照尚未执行"],
  };
}
