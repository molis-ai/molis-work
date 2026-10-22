import { performance } from "node:perf_hooks";
import { hostTextGeneration, type HostTextGeneration } from "@molis-ai/molis-work-app-local-host";
import { PrologueInferenceError, type PrologueExecutionReceipt, type PrologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { learnFromWork } from "../../apps/local-host/dist/memory/memory-learning.js";
import { MEMORY_EVALUATION_SEQUENCES, MEMORY_SEQUENCE_PROTOCOL, type MemoryEvaluationSequence } from "../../tests/fixtures/memory-evaluation-sequences.js";
import { MEMORY_BASELINE } from "./baseline.mjs";
import { memoryEvaluationEnvironment, type EvaluationArm } from "./replay.mjs";
import { observeEvaluationRequests, runMemoryEvaluationTask } from "./model-replay.mjs";
import { observeEmittedMemory } from "./request-observation.mjs";

type SequenceEnvironment = Awaited<ReturnType<typeof memoryEvaluationEnvironment>>;
const person = (project: string | null) => ({ actor_id: "synthetic-person", project_id: project, consumer: "ui" as const, person: true });
const failureText = (error: unknown) => error instanceof Error ? error.message : String(error);

async function formation(env: SequenceEnvironment, sequence: MemoryEvaluationSequence, index: number, repeat: number, modelEnv: NodeJS.ProcessEnv) {
  const event = sequence.sources[index]!;
  const executions: PrologueExecutionReceipt[] = [];
  const outputs: Array<{ value: string; structured: unknown }> = [];
  const actualGenerate = hostTextGeneration({ homeDirectory: env.home, env: modelEnv, resolveInference: async () => env.adapter.inference });
  const generate: HostTextGeneration | undefined = actualGenerate && (async (prompt, options) => {
    try {
      const result = await actualGenerate(prompt, options);
      const { run_ref, state: phase, configuredModel, reportedModels, usage } = result;
      executions.push({ run_ref, state: phase, configuredModel, reportedModels, usage });
      outputs.push({ value: result.value, structured: result.structured ?? null });
      return result;
    } catch (error) {
      if (error instanceof PrologueInferenceError && error.execution) executions.push(error.execution);
      throw error;
    }
  });
  let error: string | null = null, outcome: Awaited<ReturnType<typeof learnFromWork>> | null = null;
  try {
    outcome = await learnFromWork(env.memory, env.home, {
      caller: { actor_id: "synthetic-person", project_id: event.project, consumer: sequence.tasks[index]!.scene === "coding" ? "agent" : "assistant",
        work: { work_id: `${sequence.id}/${repeat}/source${event.sameWorkAsFirst ? 1 : index + 1}`, title: `${sequence.id} 来源${event.sameWorkAsFirst ? 1 : index + 1}` } },
      said: [event.text],
    }, generate);
  } catch (failure) { error = failureText(failure); }
  return { outcome, executions, outputs, error, source: event, formationQuality: "awaiting-independent-review" };
}

export async function replayMemorySequences(config: PrologueModelConfiguration, credential: string,
  onProgress: (report: SequenceProgress) => Promise<void>, sequences: readonly MemoryEvaluationSequence[] = MEMORY_EVALUATION_SEQUENCES,
  repeats: number = MEMORY_SEQUENCE_PROTOCOL.repeats) {
  let currentKind: "source" | "task" = "task";
  const observer = observeEvaluationRequests(config.endpoint, MEMORY_SEQUENCE_PROTOCOL.budget.maxNetworkAttempts, () => ({
    maxOutputTokens: currentKind === "source" ? MEMORY_SEQUENCE_PROTOCOL.budget.formation.maxOutputTokens : MEMORY_SEQUENCE_PROTOCOL.budget.task.maxOutputTokens,
    maxRequestBytes: MEMORY_SEQUENCE_PROTOCOL.budget.maxRequestBytes,
  }));
  const rows: SequenceRow[] = [];
  const model = { modelConfiguration: async () => config, resolveCredential: () => credential };
  // The same existing Host environment binding as production; only this synthetic Home and this approved provider.
  const modelEnv = { MOLIS_WORK_TEXT_API_KEY: credential, MOLIS_WORK_TEXT_BASE_URL: config.endpoint.replace(/\/v1\/messages$/, ""), MOLIS_WORK_TEXT_MODEL: config.model, MOLIS_WORK_TEXT_API_FORMAT: "anthropic-messages" };
  const checkpoint = async () => onProgress({ attempts: observer.requests.length, requests: observer.requests, rows });
  try {
    for (const [sequenceIndex, sequence] of sequences.entries()) for (let repeat = 0; repeat < repeats; repeat++) {
      const arms: readonly EvaluationArm[] = (sequenceIndex + repeat) % 2 === 0 ? ["B0", "B1"] : ["B1", "B0"];
      for (const arm of arms) {
        let env = await memoryEvaluationEnvironment(model, { seeds: sequence.seeds, clock: MEMORY_SEQUENCE_PROTOCOL.clock });
        let clock: string = MEMORY_SEQUENCE_PROTOCOL.clock;
        try {
          await env.prepare(arm);
          for (let index = 0; index < 2; index++) {
            const source = sequence.sources[index]!;
            for (const kind of ["source", "task"] as const) {
              currentKind = kind;
              const startInclusive = observer.requests.length, started = performance.now();
              const identity = { sequence: sequence.id, layer: sequence.layer, split: sequence.split, repeat, arm, event: `${kind}${index + 1}`, window: index === 0 ? "cold" : "steady" };
              if (startInclusive >= MEMORY_SEQUENCE_PROTOCOL.budget.maxNetworkAttempts) {
                rows.push({ ...identity, status: "not-run", error: "全批网络 attempt 预算耗尽", attemptRange: { startInclusive, endExclusive: startInclusive }, observation: null });
                await checkpoint(); continue;
              }
              try {
                if (kind === "source" && source.before) {
                  if (source.before.change) {
                    const change = source.before.change, id = env.ids.get(change.seed);
                    if (!id) throw new Error(`未找到已批准历史记忆 ${change.seed}`);
                    await env.memory.change(person(source.project), { memory_id: id, action: change.action, ...(change.text ? { text: change.text } : {}) });
                  }
                  if (source.before.clock) { clock = source.before.clock; env.setClock(clock); }
                  if (source.before.disableAssistant) for (const project of [null, "project-a", "project-b"]) {
                    const caller = person(project), scope = project ? "project" : "personal";
                    env.memory.savePrefs(caller, scope, { consumers: { ...env.memory.prefs(caller, scope).prefs.consumers, assistant: false } });
                  }
                  if (source.before.restart) {
                    const homeDirectory = env.home, ids = new Map(env.ids);
                    await env.close(false);
                    env = await memoryEvaluationEnvironment(model, { homeDirectory, seeds: [], clock });
                    for (const [key, value] of ids) env.ids.set(key, value);
                  }
                }
                env.reads.calls = 0; env.reads.entries = 0;
                if (kind === "source") {
                  const observation = await formation(env, sequence, index, repeat, modelEnv);
                  const durationMs = performance.now() - started, reads = { ...env.reads };
                  rows.push({ ...identity, status: observation.error ? "failed" : "observed", error: observation.error,
                    attemptRange: { startInclusive, endExclusive: observer.requests.length }, durationMs, observation: { ...observation, backend: reads,
                      ledgerProjection: env.inspectLedger() } });
                } else {
                  const observation = await runMemoryEvaluationTask(env, arm, sequence.tasks[index]!);
                  const requests = observer.requests.slice(startInclusive);
                  rows.push({ ...identity, status: observation.phase === "completed" ? "observed" : "failed", error: observation.error,
                    attemptRange: { startInclusive, endExclusive: observer.requests.length }, durationMs: performance.now() - started,
                    observation: { ...observation, labels: sequence.tasks[index], finalMemory: observeEmittedMemory(requests, observation.runtimePackedInjected),
                      ledgerProjection: env.inspectLedger() } });
                }
              } catch (error) {
                rows.push({ ...identity, status: "failed", error: failureText(error), durationMs: performance.now() - started,
                  attemptRange: { startInclusive, endExclusive: observer.requests.length }, observation: null });
              }
              await checkpoint();
            }
          }
        } finally { await env.close(); }
      }
    }
  } finally { observer.restore(); }
  return { schema: "molis-memory-sequence-baseline-v1", recordedAt: new Date().toISOString(), baseline: MEMORY_BASELINE,
    protocol: MEMORY_SEQUENCE_PROTOCOL, sequences, model: config.model, endpoint: config.endpoint,
    attempts: observer.requests.length, requests: observer.requests, rows,
    evidence: "production-memory-service-host-sdk-with-real-provider-when-not-fixture", quality: "awaiting-independent-review" };
}

export interface SequenceRow {
  sequence: string; layer: string; split: string; repeat: number; arm: EvaluationArm; event: string; window: string;
  status: "observed" | "failed" | "not-run"; error: string | null; attemptRange: { startInclusive: number; endExclusive: number };
  durationMs?: number; observation: unknown;
}
export interface SequenceProgress {
  attempts: number; requests: ReturnType<typeof observeEvaluationRequests>["requests"]; rows: readonly SequenceRow[];
}
