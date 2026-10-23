import { performance } from "node:perf_hooks";
import { MEMORY_EVALUATION_CORPUS, type MemoryEvaluationCase } from "../../tests/fixtures/memory-evaluation-corpus.js";
import { currentEvaluationSource } from "./baseline.mjs";
import { memoryEvaluationEnvironment, type EvaluationArm } from "./environment.mjs";
import { evaluationPerson } from "./originals.mjs";
export { memoryEvaluationEnvironment, type EvaluationArm } from "./environment.mjs";

export function scoreSelection(item: MemoryEvaluationCase, selected: readonly { seed: string | null; text: string }[]) {
  const keys = new Set(selected.map(row => row.seed));
  const relevant = selected.filter(row => row.seed !== null && item.allowed.includes(row.seed));
  return {
    required: item.required.length,
    requiredFound: item.required.filter(key => keys.has(key)).length,
    missing: item.required.filter(key => !keys.has(key)),
    selected: selected.length,
    relevant: relevant.length,
    irrelevant: selected.filter(row => row.seed === null || !item.allowed.includes(row.seed)).map(row => row.seed ?? "unmapped"),
    forbiddenTextFound: (item.forbiddenText ?? []).filter(text => selected.some(row => row.text.includes(text))),
    precision: selected.length ? relevant.length / selected.length : null,
    recall: item.required.length ? item.required.filter(key => keys.has(key)).length / item.required.length : null,
  };
}

/** MEM-36: retain every failed case; selection is not final injection or model use. */
export async function replayMemoryEvaluationCase(arm: EvaluationArm, item: MemoryEvaluationCase) {
  const env = await memoryEvaluationEnvironment();
  try {
    await env.prepare(arm, item);
    const caller = { ...evaluationPerson(item.project, item.scene), work: { work_id: item.id, title: item.purpose } };
    const started = performance.now();
    const result = await env.memory.recall(caller, item.request);
    const latencyMs = performance.now() - started;
    const selected = result.items.map(entry => ({ seed: [...env.ids].find(([, id]) => id === entry.memory_id)?.[0] ?? null, ref: entry.memory_id, version: entry.version, text: entry.text, origin: entry.origin }));
    return {
      arm, case: item.id, scene: item.scene, status: "observed" as const, method: result.method, state: result.state, receiptId: result.receipt_id,
      prefsBefore: env.prefsBefore, selected, omitted: result.omitted, score: scoreSelection(item, selected),
      observations: { backendListCalls: env.readCounts().calls, backendEntriesReturned: env.readCounts().entries, underlyingStorageScans: null, recallLatencyMs: latencyMs, selectedBodyCharacters: selected.reduce((sum, row) => sum + row.text.length, 0), expectedAutomaticSkip: item.skipExpected ?? false },
      finalContext: null, usage: null, taskQuality: null,
    };
  } finally { await env.close(); }
}

export async function replayMemoryEvaluation() {
  const rows: Array<Awaited<ReturnType<typeof replayMemoryEvaluationCase>> | { arm: EvaluationArm; case: string; scene: string; status: "failed"; error: string }> = [];
  for (const item of MEMORY_EVALUATION_CORPUS.cases) for (const arm of ["B0", "B2"] as const) {
    try { rows.push(await replayMemoryEvaluationCase(arm, item)); }
    catch (error) { rows.push({ arm, case: item.id, scene: item.scene, status: "failed", error: error instanceof Error ? error.message : String(error) }); }
  }
  return {
    schema: "molis-memory-evaluation-v2", recordedAt: new Date().toISOString(), source: currentEvaluationSource(),
    corpus: { version: MEMORY_EVALUATION_CORPUS.version, status: MEMORY_EVALUATION_CORPUS.status, clock: MEMORY_EVALUATION_CORPUS.clock, sources: MEMORY_EVALUATION_CORPUS.seeds.map(seed => seed.source) },
    evidence: "deterministic-production-memory-seam", modelCalls: 0,
    limitations: [...MEMORY_EVALUATION_CORPUS.limitations, "只测记忆选择；未走最终 Agent Context，不将 selected 当 injected", "未测提炼或真实模型，全部 token/全生命周期成本保持 unknown", "backend 返回量不等于底层扫描量；时延仅为本机机制观察", "这是现役 Service 显式读取，不等于新 task 召回；新 SDK 旧配方归因对照未执行，不宣称收益"],
    rows,
  };
}
