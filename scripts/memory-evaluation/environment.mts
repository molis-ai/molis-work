import { ASSISTANT_PLUGIN_ID, ASSISTANT_INSTALL_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mock } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION, type MemoryBackendPort } from "@molis-ai/molis-work-service-memory";
import { memoryRuntimePolicy, memoryExtractor, prologueMemoryBackend, type HostTextGeneration, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import { MEMORY_EVALUATION_CORPUS, type MemoryEvaluationSeed, type MemoryEvaluationCase } from "../../tests/fixtures/memory-evaluation-corpus.js";
import { EVALUATION_ACTOR, evaluationPerson, evaluationOriginals, type EvaluationOriginal } from "./originals.mjs";
import { memoryPhaseObservation } from "./memory-phase-observation.mjs";

export type EvaluationArm = "B0" | "B2";
export function assertEvaluationArm(arm: string): asserts arm is EvaluationArm {
  if (arm !== "B0" && arm !== "B2") throw new Error("当前工具只执行 B0/B2；B1 必须使用冻结工具 5e47ed2bc 与 f6b2ff4 生产基线");
}
type ModelPorts = Pick<PrologueNodeAdapterOptions, "modelConfiguration" | "resolveCredential">;
let clockHeld = false;
export type ReadObservation = ({ method: "list"; scope: string; owner: string } | { method: "listScopes"; scopes: readonly { scope: string; owner: string }[] })
  & { status: "completed" | "failed"; entries: number | null; error: string | null };

/** Instrument every immutable bound facade, never the unused bare capability. */
function observeBackend(backend: MemoryBackendPort, observations: ReadObservation[], beforeList?: () => void): MemoryBackendPort {
  const listScopes = backend.listScopes;
  return { ...backend, withCaller: caller => observeBackend(backend.withCaller(caller), observations, beforeList),
    ...(listScopes ? { async listScopes({ scopes, signal }: Parameters<NonNullable<MemoryBackendPort["listScopes"]>>[0]) {
      const fixed = scopes.map(({ scope, owner }) => ({ scope, owner }));
      const row: ReadObservation = { method: "listScopes", scopes: fixed, status: "failed", entries: null, error: null }; observations.push(row);
      try {
        beforeList?.();
        const entries = await listScopes.call(backend, { scopes: fixed, ...(signal ? { signal } : {}) });
        row.entries = entries.length; row.status = "completed"; return entries;
      } catch (error) { row.error = error instanceof Error ? error.message : String(error); throw error; }
    } } : {}),
    async list(scope, owner) {
      const row: ReadObservation = { method: "list", scope, owner, status: "failed", entries: null, error: null }; observations.push(row);
      try { beforeList?.(); const entries = await backend.list(scope, owner); row.entries = entries.length; row.status = "completed"; return entries; }
      catch (error) { row.error = error instanceof Error ? error.message : String(error); throw error; }
    } };
}

/** Evaluation-owned classification of declared prior history; never derived from required/allowed answer labels. */
function seedScene(seed: MemoryEvaluationSeed): "coding" | "assistant" {
  return seed.project !== null || seed.source.id.startsWith("u-coding") ? "coding" : "assistant";
}

/** One isolated Home and one trusted logical clock; native timers/performance and measured durations remain real. */
export async function memoryEvaluationEnvironment(model?: ModelPorts, options: {
  seeds?: readonly MemoryEvaluationSeed[]; homeDirectory?: string; clock?: string;
  registerFixture?: (endpoint: string) => () => void;
} = {}) {
  if (clockHeld) throw new Error("评测时钟按独立进程隔离；不能在同一进程并发两个 Home");
  let clock = options.clock ?? MEMORY_EVALUATION_CORPUS.clock, alive = false, setup = false;
  if (!Number.isFinite(Date.parse(clock))) throw new Error("Invalid evaluation clock");
  const home = options.homeDirectory ?? await mkdtemp(join(tmpdir(), "molis-memory-evaluation-"));
  const setClock = (value: string) => { if (!Number.isFinite(Date.parse(value))) throw new Error("Invalid evaluation clock"); clock = value; mock.timers.setTime(Date.parse(value)); };
  mock.timers.enable({ apis: ["Date"], now: Date.parse(clock) }); clockHeld = true;
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined, ledger: ReturnType<typeof openMemoryLedger> | undefined;
  let originals: Awaited<ReturnType<typeof evaluationOriginals>> | undefined, memory: MemoryService;
  let generation: HostTextGeneration | undefined, listFault: (() => void) | undefined;
  const observations: ReadObservation[] = [], reads = { calls: 0, entries: 0 };
  const memoryPhases = memoryPhaseObservation();
  let closed = false;
  const close = async (removeHome = true) => {
    if (closed) return; closed = true; memoryPhases.clear();
    try { await adapter?.close(); }
    finally { alive = false; try { try { ledger?.close(); } finally { await originals?.close(); } }
      finally { mock.timers.reset(); clockHeld = false; if (removeHome) await rm(home, { recursive: true, force: true }); } }
  };
  try {
    ledger = openMemoryLedger({ homeDirectory: home });
    // Exact old six-field effective choices, with new enabled/task_recall explicitly enabled. Not reviewed defaults.
    for (const [key, scope] of [["personal", "personal"], ["project-default", "project"]] as const)
      if (!ledger.prefs(EVALUATION_ACTOR, key)) ledger.savePrefs(EVALUATION_ACTOR, key, defaultPrefs(scope, "assisted"));
    const policy: MemoryRuntimePolicyOwner = { alive: () => alive,
      prefsFor: (scope, id) => memory.prefsFor(EVALUATION_ACTOR, scope, id), owners: id => ledger!.owners(id), candidateOwners: id => ledger!.candidateOwners(id),
      projectExists: async id => ["project-a", "project-b"].includes(id), deletingProject: () => undefined };
    originals = await evaluationOriginals(home, () => adapter && alive ? { adapter, policy,
      sessionAllowed: async owner => owner.actor_id === EVALUATION_ACTOR && (owner.plugin_id === "io.molis.work.coding"
        ? owner.install_id === "evaluation-coding-install" : owner.plugin_id === ASSISTANT_PLUGIN_ID && owner.install_id === ASSISTANT_INSTALL_ID),
      sourceAllowed: (actor, scope, owner, refs) => memory.sourceAllowed(actor, scope, owner, refs) } : undefined, () => clock, options.registerFixture);
    const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
      memory: { ...memoryRuntimePolicy(() => policy, memoryExtractor(home, () => generation)), sources: originals.sources,
        promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION,
          decide: (caller, request) => memory.promotion.decide(caller, request), undo: {
            prepare: (caller, request) => memory.promotion.undo.prepare(caller, request), record: (caller, request) => memory.promotion.undo.record(caller, request) } } },
      audit: memoryPhases.audit,
      memoryUsage: receipt => memory.settleUses(receipt),
      modelConfiguration: async (...args) => setup ? originals!.model : await model?.modelConfiguration(...args) ?? null,
      resolveCredential: ref => setup ? "source-setup-only" : model?.resolveCredential?.(ref) ?? null });
    host.register(adapter);
    const backend = observeBackend(prologueMemoryBackend(async () => adapter!.memory!), observations, () => listFault?.());
    memory = new MemoryService({ backend, ledger, timeZone: "Asia/Tokyo", now: () => new Date(clock), projectTitle: async id => id }); alive = true;
    const ids = new Map<string, string>(), savedClock = clock;
    for (const seed of options.seeds ?? MEMORY_EVALUATION_CORPUS.seeds) {
      if (seed.request.expires_at && Date.parse(seed.request.expires_at) <= Date.parse(clock)) setClock(new Date(Date.parse(seed.request.expires_at) - 86_400_000).toISOString());
      const result = await memory.write(evaluationPerson(seed.project, seedScene(seed)), seed.request);
      if (!result.memory) throw new Error(`合成材料未成功保存：${seed.id} (${result.outcome})`);
      ids.set(seed.id, result.memory.memory_id); setClock(savedClock);
    }
    const prefsBefore = memory.prefs(evaluationPerson(null), "personal").prefs;
    return { home, memory, ids, reads, observations, prefsBefore, host, adapter, setClock, close,
      observeMemoryPhases: memoryPhases.bind,
      sourceSetup: originals.observation,
      setGeneration(value: HostTextGeneration | undefined) { generation = value; },
      failLists(value?: () => void) { listFault = value; },
      resetReads() { observations.length = 0; reads.calls = 0; reads.entries = 0; },
      readCounts() { reads.calls = observations.length; reads.entries = observations.reduce((sum, row) => sum + (row.entries ?? 0), 0); return { ...reads }; },
      async original(text: string, scene: "coding" | "assistant", project: string | null, previous?: EvaluationOriginal) {
        setup = true;
        try {
          const original = previous ?? await originals!.create(adapter!, memory, text, scene, project);
          const target = project ? { scope: "project" as const, owner: project } : { scope: "user" as const, owner: EVALUATION_ACTOR };
          const sources = await originals!.sources.resolve(original.caller, { app_id: "io.molis.work", target, refs: [original.ref] });
          return { original, sources };
        } finally { setup = false; }
      },
      inspectLedger() {
        const candidates = ledger!.candidates(EVALUATION_ACTOR), changes = ledger!.changes(EVALUATION_ACTOR, 100);
        const refs = new Set([...ids.values(), ...changes.flatMap(change => change.memory_id ? [change.memory_id] : [])]);
        return { candidates, changes, revisions: [...refs].map(memoryId => ({ memoryId, revisions: ledger!.revisions(memoryId) })) };
      },
      async prepare(arm: EvaluationArm, item?: MemoryEvaluationCase) {
        assertEvaluationArm(arm);
        if (item?.mutation) {
          const id = ids.get(item.mutation.seed); if (!id) throw new Error(`未知材料：${item.mutation.seed}`);
          const caller = evaluationPerson(item.project, item.scene), current = (await memory.list(caller)).items.find(row => row.memory_id === id);
          if (!current) throw new Error("Mutation target is missing");
          await memory.change(caller, { memory_id: id, expected_version: current.version, action: item.mutation.action, ...(item.mutation.text ? { text: item.mutation.text } : {}) });
        }
        if (arm === "B0") for (const project of [null, "project-a", "project-b"]) memory.savePrefs(evaluationPerson(project), project ? "project" : "personal", {
          task_recall: false, form: false, auto: false, learn_from_work: false, learn_from_ui: false,
          consumers: { assistant: false, agent: false, ui: false, plugin: false, mcp: false } });
        observations.length = 0;
      },
    };
  } catch (error) { await close(options.homeDirectory === undefined); throw error; }
}
