import { performance } from "node:perf_hooks";
import { hostTextGeneration, type HostTextGeneration } from "@molis-ai/molis-work-app-local-host";
import { PrologueInferenceError, type PrologueExecutionReceipt, type PrologueModelConfiguration } from "@molis-ai/molis-work-service-agent-host";
import { evaluationPerson, type EvaluationOriginal } from "./originals.mjs";
import { MEMORY_EVALUATION_SEQUENCES, MEMORY_SEQUENCE_PROTOCOL, type MemoryEvaluationSequence } from "../../tests/fixtures/memory-evaluation-sequences.js";
import { currentEvaluationSource } from "./baseline.mjs";
import { memoryEvaluationEnvironment, type EvaluationArm } from "./replay.mjs";
import { observeEvaluationRequests, runMemoryEvaluationTask } from "./model-replay.mjs";
import { observeEmittedMemory } from "./request-observation.mjs";

type SequenceEnvironment = Awaited<ReturnType<typeof memoryEvaluationEnvironment>>;
const person = evaluationPerson;
const failureText = (error: unknown) => error instanceof Error ? error.message : String(error);

export async function observeMemoryFormation(env: SequenceEnvironment, sequence: MemoryEvaluationSequence, index: number, repeat: number, modelEnv: NodeJS.ProcessEnv, previous?: EvaluationOriginal) {
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
  let error: string | null = null, outcome: Awaited<ReturnType<SequenceEnvironment["memory"]["learnFromWork"]>> | null = null;
  let original = previous;
  const setupBefore = env.sourceSetup();
  env.setGeneration(generate);
  try {
    const resolved = await env.original(event.text, sequence.tasks[index]!.scene, event.project, previous);
    original = resolved.original;
    outcome = await env.memory.learnFromWork({ ...original.caller,
      operation_id: `evaluation:${sequence.id}:${repeat}:source${event.sameWorkAsFirst ? 1 : index + 1}`,
      work: { work_id: `${sequence.id}/${repeat}/source${event.sameWorkAsFirst ? 1 : index + 1}`, title: `${sequence.id} 来源${event.sameWorkAsFirst ? 1 : index + 1}` },
    }, { said: [event.text], sources: resolved.sources });
    if (!["completed", "skipped"].includes(outcome.formation.outcome) || outcome.recording_error)
      error = outcome.recording_error?.code ?? `SDK memory formation ${outcome.formation.outcome}${outcome.formation.code ? ` (${outcome.formation.code})` : ""}`;
  } catch (failure) { error = failureText(failure); }
  const setupAfter = env.sourceSetup();
  return { outcome, executions, outputs, error, original, fixtureSetup: { calls: setupAfter.calls - setupBefore.calls, requestBytes: setupAfter.requestBytes - setupBefore.requestBytes, paidCalls: 0 }, source: event, formationQuality: "awaiting-independent-review" };
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
  const checkpoint = async () => onProgress({ attempts: observer.requests.length, requests: observer.requests, fixtureRequests: observer.fixtureRequests, rows });
  try {
    for (const [sequenceIndex, sequence] of sequences.entries()) for (let repeat = 0; repeat < repeats; repeat++) {
      const arms: readonly EvaluationArm[] = (sequenceIndex + repeat) % 2 === 0 ? ["B0", "B2"] : ["B2", "B0"];
      for (const arm of arms) {
        let env: SequenceEnvironment | undefined, initializationError: string | undefined;
        let firstOriginal: EvaluationOriginal | undefined;
        let clock: string = MEMORY_SEQUENCE_PROTOCOL.clock;
        try {
          try {
            env = await memoryEvaluationEnvironment(model, { seeds: sequence.seeds, clock: MEMORY_SEQUENCE_PROTOCOL.clock, registerFixture: observer.registerFixture });
            await env.prepare(arm);
          } catch (error) { initializationError = failureText(error); }
          for (let index = 0; index < 2; index++) {
            const source = sequence.sources[index]!;
            for (const kind of ["source", "task"] as const) {
              currentKind = kind;
              const startInclusive = observer.requests.length, started = performance.now();
              const identity = { sequence: sequence.id, layer: sequence.layer, split: sequence.split, repeat, arm, event: `${kind}${index + 1}`, window: index === 0 ? "cold" : "steady" };
              if (!env || initializationError) {
                rows.push({ ...identity, status: kind === "source" && index === 0 ? "failed" : "not-run", error: `Environment initialization failed: ${initializationError}`,
                  attemptRange: { startInclusive, endExclusive: startInclusive }, observation: null });
                await checkpoint(); continue;
              }
              if (startInclusive >= MEMORY_SEQUENCE_PROTOCOL.budget.maxNetworkAttempts) {
                rows.push({ ...identity, status: "not-run", error: "全批网络 attempt 预算耗尽", attemptRange: { startInclusive, endExclusive: startInclusive }, observation: null });
                await checkpoint(); continue;
              }
              try {
                if (kind === "source" && source.before) {
                  if (source.before.change) {
                    const change = source.before.change, id = env.ids.get(change.seed);
                    if (!id) throw new Error(`未找到已批准历史记忆 ${change.seed}`);
                    const caller = person(source.project, sequence.tasks[index]!.scene), current = (await env.memory.list(caller)).items.find(item => item.memory_id === id);
                    if (!current) throw new Error("Original change target is missing");
                    await env.memory.change(caller, { memory_id: id, expected_version: current.version, action: change.action, ...(change.text ? { text: change.text } : {}) });
                  }
                  if (source.before.clock) { clock = source.before.clock; env.setClock(clock); }
                  if (source.before.disableAssistant) for (const project of [null, "project-a", "project-b"]) {
                    const caller = person(project), scope = project ? "project" : "personal";
                    env.memory.savePrefs(caller, scope, { consumers: { ...env.memory.prefs(caller, scope).prefs.consumers, assistant: false } });
                  }
                  if (source.before.restart) {
                    const homeDirectory = env.home, ids = new Map(env.ids);
                    await env.close(false);
                    env = await memoryEvaluationEnvironment(model, { homeDirectory, seeds: [], clock, registerFixture: observer.registerFixture });
                    for (const [key, value] of ids) env.ids.set(key, value);
                  }
                }
                env.resetReads();
                if (kind === "source") {
                  const observation = await observeMemoryFormation(env, sequence, index, repeat, modelEnv, source.sameWorkAsFirst ? firstOriginal : undefined);
                  if (index === 0) firstOriginal = observation.original;
                  const durationMs = performance.now() - started, reads = env.readCounts();
                  rows.push({ ...identity, status: observation.error ? "failed" : "observed", error: observation.error,
                    attemptRange: { startInclusive, endExclusive: observer.requests.length }, durationMs, observation: { ...observation, backend: reads,
                      ledgerProjection: env.inspectLedger() } });
                } else {
                  const observation = await runMemoryEvaluationTask(env, arm, sequence.tasks[index]!);
                  const requests = observer.requests.slice(startInclusive);
                  rows.push({ ...identity, status: observation.phase === "completed" ? "observed" : "failed", error: observation.error,
                    attemptRange: { startInclusive, endExclusive: observer.requests.length }, durationMs: performance.now() - started,
                    observation: { ...observation, labels: sequence.tasks[index], finalMemory: observeEmittedMemory(requests, observation.contextCalls),
                      ledgerProjection: env.inspectLedger() } });
                }
              } catch (error) {
                rows.push({ ...identity, status: "failed", error: failureText(error), durationMs: performance.now() - started,
                  attemptRange: { startInclusive, endExclusive: observer.requests.length }, observation: null });
              }
              await checkpoint();
            }
          }
        } finally { await env?.close(); }
      }
    }
  } finally { observer.restore(); }
  return { schema: "molis-memory-sequence-b2-v2", recordedAt: new Date().toISOString(), source: currentEvaluationSource(),
    protocol: MEMORY_SEQUENCE_PROTOCOL, sequences, model: config.model, endpoint: config.endpoint,
    attempts: observer.requests.length, requests: observer.requests, fixtureRequests: observer.fixtureRequests, rows,
    evidence: "production-memory-service-host-sdk-with-real-provider-when-not-fixture", quality: "awaiting-independent-review",
    limitations: ["Frozen corpus, labels, pairing and evaluated attempt limits are unchanged; current arms are B0/B2, never relabelled B1",
      "B2 aligns the App and NodeHost Date clock; historical B1 used wall time in the SDK. TTL outcomes are not a clock-equivalent comparison",
      "Source setup uses actual Session/Run owners with a separate scripted loopback model. fixtureRequests are setup cost, not evaluated Provider attempts or free production formation",
      "recipeLatencyMs measures recipe construction; SDK taskRecall and openingMemoryPreparation are nested monotonic intervals, never added. Missing/invalid/not-run remain null; historical B1 lacks these phases and the explicit-recall 5 ms metric is unchanged",
      "Final emitted memory content and SDK per-call references are observed separately. They do not prove model use, quality or token savings",
      "SDK-upgrade attribution control and independent quality review remain unperformed"] };
}

export interface SequenceRow {
  sequence: string; layer: string; split: string; repeat: number; arm: EvaluationArm; event: string; window: string;
  status: "observed" | "failed" | "not-run"; error: string | null; attemptRange: { startInclusive: number; endExclusive: number };
  durationMs?: number; observation: unknown;
}
export interface SequenceProgress {
  attempts: number; requests: ReturnType<typeof observeEvaluationRequests>["requests"];
  fixtureRequests: ReturnType<typeof observeEvaluationRequests>["fixtureRequests"]; rows: readonly SequenceRow[];
}
