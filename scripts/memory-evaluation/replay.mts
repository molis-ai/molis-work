import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { MEMORY_EVALUATION_CORPUS, type MemoryEvaluationCase, type MemoryEvaluationSeed } from "../../tests/fixtures/memory-evaluation-corpus.js";
import { MEMORY_BASELINE } from "./baseline.mjs";

export type EvaluationArm = "B0" | "B1";
const person = (project: string | null): MemoryCaller => ({ actor_id: "synthetic-person", project_id: project, consumer: "ui", person: true });

/** No model or policy substitute: this opens the production SDK-backed MemoryService in a new disposable Home. */
export async function memoryEvaluationEnvironment(model?: Pick<PrologueNodeAdapterOptions, "modelConfiguration" | "resolveCredential">,
  options: { seeds?: readonly MemoryEvaluationSeed[]; homeDirectory?: string; clock?: string } = {}) {
  const home = options.homeDirectory ?? await mkdtemp(join(tmpdir(), "molis-memory-evaluation-"));
  let clock = options.clock ?? MEMORY_EVALUATION_CORPUS.clock;
  const queue = new AgentReviewQueue();
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  let ledger: ReturnType<typeof openMemoryLedger> | undefined;
  try {
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.memory-evaluation", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
      modelConfiguration: async () => null, resolveCredential: () => null, ...model });
    const host = new AgentHost({ reviews: queue });
    host.register(adapter);
    ledger = openMemoryLedger({ homeDirectory: home });
    const backend = prologueMemoryBackend(async () => host.adapter("prologue").memory!);
    const reads = { calls: 0, entries: 0 };
    const observed = { ...backend, async list(...args: Parameters<typeof backend.list>) { reads.calls += 1; const entries = await backend.list(...args); reads.entries += entries.length; return entries; } };
    const memory = new MemoryService({ backend: observed, ledger, timeZone: "Asia/Tokyo", now: () => new Date(clock), projectTitle: async id => id });
    const ids = new Map<string, string>();
    for (const seed of options.seeds ?? MEMORY_EVALUATION_CORPUS.seeds) {
      const result = await memory.write(person(seed.project), seed.request);
      if (!result.memory) throw new Error(`合成材料未成功保存：${seed.id} (${result.outcome})`);
      ids.set(seed.id, result.memory.memory_id);
    }
    const prefsBefore = memory.prefs(person(null), "personal").prefs;
    return { home, memory, ids, reads, prefsBefore, host, adapter,
      inspectLedger() {
        const candidates = ledger!.candidates("synthetic-person"), changes = ledger!.changes("synthetic-person", 100);
        const refs = new Set([...ids.values(), ...changes.flatMap(change => change.memory_id ? [change.memory_id] : [])]);
        return { candidates, changes, revisions: [...refs].map(memoryId => ({ memoryId, revisions: ledger!.revisions(memoryId) })) };
      },
      setClock(value: string) { clock = value; },
      async prepare(arm: EvaluationArm, item?: MemoryEvaluationCase) {
        if (item?.mutation) {
          const id = ids.get(item.mutation.seed);
          if (!id) throw new Error(`未知材料：${item.mutation.seed}`);
          await memory.change(person(item.project), { memory_id: id, action: item.mutation.action, ...(item.mutation.text ? { text: item.mutation.text } : {}) });
        }
        if (arm === "B0") for (const project of [null, "project-a", "project-b"]) memory.savePrefs(person(project), project ? "project" : "personal", {
          form: false, auto: false, learn_from_work: false, learn_from_ui: false,
          consumers: { assistant: false, agent: false, ui: false, plugin: false, mcp: false },
        });
        reads.calls = 0; reads.entries = 0;
      },
      async close(removeHome = true) { ledger?.close(); await adapter?.close(); if (removeHome) await rm(home, { recursive: true, force: true }); } };
  } catch (error) {
    ledger?.close(); await adapter?.close(); await rm(home, { recursive: true, force: true }); throw error;
  }
}

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
    const caller: MemoryCaller = { actor_id: "synthetic-person", project_id: item.project, consumer: item.scene === "coding" ? "agent" : "assistant", work: { work_id: item.id, title: item.purpose } };
    const started = performance.now();
    const result = await env.memory.recall(caller, item.request);
    const latencyMs = performance.now() - started;
    const selected = result.items.map(entry => ({ seed: [...env.ids].find(([, id]) => id === entry.memory_id)?.[0] ?? null, ref: entry.memory_id, version: entry.version, text: entry.text, origin: entry.origin }));
    return {
      arm, case: item.id, scene: item.scene, status: "observed" as const, method: result.method, state: result.state, receiptId: result.receipt_id,
      prefsBefore: env.prefsBefore, selected, omitted: result.omitted, score: scoreSelection(item, selected),
      observations: { backendListCalls: env.reads.calls, backendEntriesReturned: env.reads.entries, underlyingStorageScans: null, recallLatencyMs: latencyMs, selectedBodyCharacters: selected.reduce((sum, row) => sum + row.text.length, 0), expectedAutomaticSkip: item.skipExpected ?? false },
      finalContext: null, usage: null, taskQuality: null,
    };
  } finally { await env.close(); }
}

export async function replayMemoryEvaluation() {
  const rows: Array<Awaited<ReturnType<typeof replayMemoryEvaluationCase>> | { arm: EvaluationArm; case: string; scene: string; status: "failed"; error: string }> = [];
  for (const item of MEMORY_EVALUATION_CORPUS.cases) for (const arm of ["B0", "B1"] as const) {
    try { rows.push(await replayMemoryEvaluationCase(arm, item)); }
    catch (error) { rows.push({ arm, case: item.id, scene: item.scene, status: "failed", error: error instanceof Error ? error.message : String(error) }); }
  }
  return {
    schema: "molis-memory-evaluation-v1", recordedAt: new Date().toISOString(), baseline: MEMORY_BASELINE,
    corpus: { version: MEMORY_EVALUATION_CORPUS.version, status: MEMORY_EVALUATION_CORPUS.status, clock: MEMORY_EVALUATION_CORPUS.clock, sources: MEMORY_EVALUATION_CORPUS.seeds.map(seed => seed.source) },
    evidence: "deterministic-production-memory-seam", modelCalls: 0,
    limitations: [...MEMORY_EVALUATION_CORPUS.limitations, "只测记忆选择；未走最终 Agent Context，不将 selected 当 injected", "未测提炼或真实模型，全部 token/全生命周期成本保持 unknown", "backend 返回量不等于底层扫描量；时延仅为本机机制观察", "B2 与新 SDK 旧配方升级对照尚未执行；不得宣称收益"],
    rows,
  };
}
