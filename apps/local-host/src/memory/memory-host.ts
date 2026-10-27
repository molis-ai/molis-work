import { assertCodingMemoryLearningCaller, codingMemoryLearningPayload, withCodingMemoryLearningSources } from "./memory-coding-learning.js";
import type { MemoryLearningEnqueueRequest } from "@molis-ai/molis-work-contracts/services/memory";
import type { IncomingMessage, ServerResponse } from "node:http";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import type { AgentHost, PrologueProjectDeletion } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCapability, AgentMemoryExecutionControl, AgentMemoryUseReceipt, AgentScheduledTask } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import { ActionError, type ActionCallContext, type ActionExecutionContext, type ActionHandlerBinding, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  MEMORY_PROVIDER_ID,
  MEMORY_BATCH_MAX_ITEMS,
  type MemoryBatchRequest,
  memoryActions,
  type MemoryChangeRequest,
  type MemoryCandidateDecision,
  type MemoryListRequest,
  type MemoryPageRequest,
  type MemoryPageResponse,
  type MemoryPrefsWriteRequest,
  type MemoryRecallRequest,
  type MemoryScope,
  type MemorySignalReport,
  type MemoryWriteRequest,
} from "@molis-ai/molis-work-contracts/services/memory";
import { memoryErrors, MemoryService, type MemoryCaller, type MemoryServicePorts } from "@molis-ai/molis-work-service-memory";
import { dispatchNativePluginJsonHttp } from "../native-plugin-http.js";
import { localWebActionContext } from "../local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../local-owner-permissions.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { learnFromQueuedWork } from "./memory-learning.js";
import { assistantMemorySources, type AssistantMemoryLearningRequest } from "../assistant/assistant-memory-sources.js";
import { runUpkeep, subjectTitles } from "./memory-upkeep.js";
import { controlledMemoryService, memoryCallService, memoryCaller, memoryCommandBody } from "./memory-effect.js";
import { memorySources } from "./memory-sources.js";
import { hostLog } from "../host-log.js";
import { prologueMemoryBackend } from "./memory-backend.js";
import type { MemoryRuntimePolicyOwner } from "./memory-runtime-policy.js";
import { registerMemoryProjectDeletion } from "./memory-project-deletion.js";
export { prologueMemoryBackend } from "./memory-backend.js";

/**
 * Host wiring of the platform memory (specs/archive/memory-system §5.2): Prologue Memory of this Home's one runtime as the
 * store, the ledger in `<Home>/memory`, the `system.memory` actions in the shared directory, and `/api/memory/*` for
 * the settings pages and the work panel. The memory service itself is in horizontal/memory.
 */

/** This Home's person. Agents, plugins and external clients act on their behalf, so personal memories are theirs. */
const LOCAL_PERSON = LOCAL_PERSON_ACTOR_ID;
const RUNTIME = "prologue";
const input = <T>(value: unknown) => (value ?? {}) as T;

function memoryRuntimeEffect(agentHost: AgentHost) {
  const effect = agentHost.adapter(RUNTIME).withEffect;
  if (!effect) throw memoryErrors.unavailable("当前运行时缺少最终清理控制");
  return effect;
}

interface MemoryHost {
  readonly service: MemoryService;
  readonly policy: MemoryRuntimePolicyOwner;
  withExecution(control: AgentMemoryExecutionControl, bindChangeTarget: NonNullable<MemoryServicePorts["bindChangeTarget"]>): MemoryService;
  /** The same SourcePort, restricted to the Assistant's fixed Host installation. */
  readonly checkAssistantSources: ReturnType<typeof memorySources>["check"];
  /** Who the call is for, from its trusted context: the consumer from the audience, never from input. */
  caller(context: ActionCallContext, work?: { work_id: string; title: string } | null): MemoryCaller;
  /**
   * A work's round finished: draw out what may be worth keeping, once per round (`key`), through the runtime's durable
   * queue so a restart does not lose it. Nothing runs when the round said nothing worth learning.
   */
  learnLater(request: AssistantMemoryLearningRequest): Promise<void>;
  /** Reject new business while the original runtime drains its persisted usage. */
  stopBusiness(): void;
  close(): void;
}

const hosts = new WeakMap<MolisWorkLocalHost, { home: string; host: MemoryHost; settleUses(receipt: AgentMemoryUseReceipt): void }>();

export function memoryHostFor(localHost: MolisWorkLocalHost): MemoryHost | undefined {
  return hosts.get(localHost)?.host;
}

/** Only the Runtime's persisted session owner may report usage; deleted projects stay forgotten. */
export async function recordMemoryUsage(localHost: MolisWorkLocalHost, receipt: AgentMemoryUseReceipt): Promise<void> {
  const held = hosts.get(localHost);
  if (!held) throw memoryErrors.unavailable("记忆使用记录暂不可保存");
  const { host } = held;
  if (receipt.owner.actor_id !== LOCAL_PERSON) throw memoryErrors.forbidden("记忆回执不属于当前使用者");
  const personal = receipt.owner.project_id === ASSISTANT_PERSONAL_OWNER && receipt.owner.plugin_id === ASSISTANT_PLUGIN_ID
    && receipt.owner.install_id === ASSISTANT_INSTALL_ID;
  if (!personal) {
    const exists = await host.policy.projectExists(receipt.owner.project_id);
    if (exists === false) return;
    if (exists !== true) throw memoryErrors.unavailable("记忆回执所属项目暂不可核实");
  }
  if (hosts.get(localHost) !== held) throw memoryErrors.unavailable("原记忆使用记录已关闭");
  held.settleUses(receipt);
}

interface MemoryHostPorts {
  localHost: MolisWorkLocalHost;
  homeDirectory: string;
  agentHost: AgentHost;
  projectDeletion?(): PrologueProjectDeletion;
  /** Starts the runtime when needed; memory lives in it. */
  ready(): Promise<void>;
  /** Settles once the runtime started because something needed it (never starts it). */
  started?(): Promise<void>;
  /**
   * Whether this process runs the Home's Agent runtime: the Web server and the embedded MCP take the Agent service as their
   * own (they pass the catalog owner), a Host that only forwards actions to the resident Host (the stdio MCP's) does not.
   * Only an executor, or a Host whose runtime has already started, starts the runtime to clear a deleted project's memory;
   * elsewhere that step waits for the executor.
   */
  executes(): boolean;
  /** Project ids in this Home, for upkeep over every project's memories. */
  projects?(): Promise<string[]>;
  /** Whether the project is still in this Home's catalog; null when this process has no catalog to ask. */
  projectExists?(projectId: string): Promise<boolean | null>;
  projectTitle?(projectId: string): Promise<string | null>;
}

/** The original runtime queue owns learning and upkeep; both stop with ordinary Memory business. */
function memoryBackgroundWork(input: {
  ports: MemoryHostPorts; service: MemoryService; servicePorts: MemoryServicePorts;
  store(): Promise<AgentMemoryCapability>; businessAlive(): boolean; assertBusiness(): void;
}) {
  const { ports, service, servicePorts, store, businessAlive, assertBusiness } = input;
  const { ledger, backend } = servicePorts;
  // Drawing out memories, and daily upkeep: tasks of the runtime's own durable queue (one runner for each kind).
  const LEARN_KIND = "memory.learn", UPKEEP_KIND = "memory.upkeep";
  let queueAttached = false;
  const person: MemoryCaller = { actor_id: LOCAL_PERSON, project_id: null, consumer: "ui", person: true };
  const upkeepNow = async (current = service) => {
    assertBusiness();
    const projects = await ports.projects?.().catch(() => []) ?? [];
    assertBusiness();
    return runUpkeep(current, { homeDirectory: ports.homeDirectory, localHost: ports.localHost, caller: person, projects });
  };
  /** The runtime's queue hangs tasks on a session: upkeep has its own, made once and kept in the ledger. */
  const upkeepSession = async (): Promise<string> => {
    assertBusiness();
    const saved = ledger.marker(LOCAL_PERSON, "upkeep-session")?.body as { session_id?: string } | undefined;
    if (saved?.session_id) return saved.session_id;
    const session = await ports.agentHost.adapter(RUNTIME).createSession({ project_id: MEMORY_PROVIDER_ID, plugin_id: MEMORY_PROVIDER_ID, install_id: MEMORY_PROVIDER_ID,
      actor_id: LOCAL_PERSON, workspace: "none", role_id: "memory-upkeep", title: "记忆整理" });
    assertBusiness();
    ledger.setMarker(LOCAL_PERSON, "upkeep-session", { session_id: session.session_id }, new Date().toISOString());
    return session.session_id;
  };
  /** Next upkeep: at four in the morning local time (today's when that has not passed and today's has not run yet). */
  const scheduleUpkeep = async (after: Date) => {
    assertBusiness();
    const schedule = ports.agentHost.adapter(RUNTIME).schedule;
    if (!schedule) return;
    const due = new Date(after); due.setHours(4, 0, 0, 0);
    if (due.getTime() <= after.getTime()) due.setDate(due.getDate() + 1);
    const last = service.lastUpkeep(LOCAL_PERSON);
    // Missed while Molis Work was not running (more than a day ago): done soon after start instead.
    const when = !last || Date.now() - Date.parse(last.at) > 26 * 3_600_000 ? new Date(Date.now() + 60_000) : due;
    const key = `memory-upkeep:${when.toISOString().slice(0, 10)}`;
    if (schedule.find(key)) return;
    const session_id = await upkeepSession();
    assertBusiness();
    await schedule.enqueue({ key, session_id, kind: UPKEEP_KIND, payload: {}, due_at: when.toISOString(), max_attempts: 2 });
  };
  const runLearning = async (task: Pick<AgentScheduledTask, "key" | "session_id" | "payload">) => {
    try {
      assertBusiness();
      const outcome = await learnFromQueuedWork(ports.homeDirectory, task, { localHost: ports.localHost, adapter: ports.agentHost.adapter(RUNTIME), service,
        ports: { backend, ledger, ...(ports.projectTitle ? { projectTitle: ports.projectTitle } : {}) }, backend: control => prologueMemoryBackend(store, control),
        alive: businessAlive, ...(ports.projectExists ? { projectExists: ports.projectExists } : {}) });
      logMemoryLearning(outcome);
    } catch (error) {
      // A failure can follow an earlier completed proposal; the same queue key remains the retry identity.
      hostLog.warn("memory", "learning_failed", error);
      throw error;
    }
  };
  const attachQueue = () => {
    if (queueAttached || !businessAlive()) return;
    const schedule = ports.agentHost.adapter(RUNTIME).schedule;
    if (!schedule) return;
    schedule.handle(LEARN_KIND, runLearning);
    schedule.handle(UPKEEP_KIND, async () => { await upkeepNow(); await scheduleUpkeep(new Date()); });
    queueAttached = true;
    void scheduleUpkeep(new Date()).catch(error => hostLog.warn("memory", "upkeep_not_queued", error));
  };
  void ports.started?.().then(attachQueue).catch(() => undefined);
  return { upkeepNow,
    enqueueLearning: async (context: ActionExecutionContext, request: MemoryLearningEnqueueRequest): Promise<{ status: "queued" | "existing" | "skipped" }> => {
      assertBusiness(); await ports.ready(); await context.beforeEffect(); assertBusiness();
      const adapter = ports.agentHost.adapter(RUNTIME), schedule = adapter.schedule;
      if (!schedule) throw memoryErrors.unavailable("自动形成持久队列不可用");
      assertCodingMemoryLearningCaller(context);
      if (!context.project_id) throw memoryErrors.forbidden("自动形成缺少原项目");
      const payload = await codingMemoryLearningPayload(ports.localHost, context, request);
      const task = { session_id: request.session_id, payload: { ...payload } };
      const result = await withCodingMemoryLearningSources(ports.localHost, adapter, task, businessAlive, async sources => {
        const key = sources.key;
        if (schedule.find(key)) return { status: "existing" as const };
        const learning = await sources.request();
        if (!service.worthLearning(learning.caller, [sources.triggerText])
          || !service.worthLearning(learning.caller, learning.said)) return { status: "skipped" as const };
        await context.beforeEffect();
        if (!await sources.current()) throw memoryErrors.forbidden("原来源在排队前已失效");
        sources.assertCurrent(); attachQueue();
        // Same key is immutable even for cancelled, failed and unknown outcomes.
        if (schedule.find(key)) return { status: "existing" as const };
        await schedule.enqueue({ ...task, key, kind: LEARN_KIND, due_at: new Date().toISOString(), max_attempts: 2 }, {
          ...(context.signal ? { signal: context.signal } : {}),
          beforeEffect: async () => { await context.beforeEffect(); if (!await sources.current()) throw memoryErrors.forbidden("原来源已失效"); },
          assert_current: () => { context.assert_authority_current?.(); sources.assertCurrent(); },
        });
        return { status: "queued" as const };
      });
      return result ?? { status: "skipped" };
    },
    learnLater: async (request: AssistantMemoryLearningRequest) => {
      assertBusiness();
      await ports.ready();
      assertBusiness();
      const key = `memory-learn:${request.work_id}:${request.run_id}`, payload = { ...request };
      const task = { key, session_id: request.session_id, payload }, sources = await assistantMemorySources(ports.homeDirectory, ports.agentHost.adapter(RUNTIME), task);
      assertBusiness();
      if (!sources || !service.worthLearning(sources.request.caller, sources.request.said)) { hostLog.debug("memory", "learning_skipped", { key }); return; }
      attachQueue();
      const schedule = ports.agentHost.adapter(RUNTIME).schedule;
      if (!schedule) { void runLearning(task).catch(error => hostLog.warn("memory", "learning_failed", error)); return; }
      const queued = await schedule.enqueue({ ...task, kind: LEARN_KIND, due_at: new Date().toISOString(), max_attempts: 2 });
      hostLog.debug("memory", "learning_queued", { key: queued.key, state: queued.state, due_at: queued.due_at });
    },
  };
}

/**
 * The memories an Agent run is given, for Agent work (Coding, plugin Agents, scheduled runs): the platform recall with
 * this Home's person and the run's project, under the Agent consumer's switch. Null when there is no memory host yet.
 */
export async function memoryForAgentRun(localHost: MolisWorkLocalHost, input: { project_id: string | null; task: string; used_for: string; plugin_id?: string;
  character?: { artifact_id: string; title: string } }): ReturnType<MemoryService["forRun"]> {
  const host = memoryHostFor(localHost);
  if (!host) return null;
  return host.service.forRun({ actor_id: LOCAL_PERSON, project_id: input.project_id, consumer: "agent", ...(input.plugin_id ? { plugin_id: input.plugin_id } : {}), ...(input.character ? { character: { id: input.character.artifact_id, title: input.character.title } } : {}) },
    { query: input.task.slice(0, 2000), used_for: input.used_for.slice(0, 80), ...(input.plugin_id ? { situation: { plugin_id: input.plugin_id } } : {}), limit: 12 });
}

/** Registered once per Local Host, next to the Agent service that owns the runtime. */
/** A learning pass, for `MOLIS_WORK_DEBUG=memory`: whether it ran and how many memories it kept, never what they say. */
export function logMemoryLearning(outcome: { ran: boolean; learned: readonly unknown[] }): void {
  hostLog.debug("memory", "learned", { ran: outcome.ran, learned: outcome.learned.length });
}

export function registerMemoryHost(ports: MemoryHostPorts): MemoryHost {
  const existing = hosts.get(ports.localHost);
  if (existing && existing.home === ports.homeDirectory) return existing.host;
  let stopped = false, closed = false;
  const businessAlive = () => !stopped && !closed && ports.localHost.lifecycle() === "running";
  const assertBusiness = () => { if (!businessAlive()) throw memoryErrors.unavailable("原记忆服务已关闭"); };
  const ledger = openMemoryLedger({ homeDirectory: ports.homeDirectory });
  const store = async (): Promise<AgentMemoryCapability> => {
    assertBusiness();
    await ports.ready();
    assertBusiness();
    const memory = ports.agentHost.adapter(RUNTIME).memory;
    if (!memory) throw memoryErrors.off("当前运行时没有记忆能力");
    return memory;
  };
  const backend = prologueMemoryBackend(store);
  const servicePorts = { backend, ledger, managementBatchMaxItems: MEMORY_BATCH_MAX_ITEMS, ...(ports.projectTitle ? { projectTitle: ports.projectTitle } : {}) };
  const projection = new MemoryService(servicePorts);
  const service = controlledMemoryService(servicePorts, control => prologueMemoryBackend(store, control),
    { beforeEffect: async () => assertBusiness(), assert_current: assertBusiness });
  const forCall = (context: ActionExecutionContext) => memoryCallService(context, servicePorts,
    control => prologueMemoryBackend(store, control), businessAlive);
  const caller = memoryCaller;
  const { upkeepNow, learnLater, enqueueLearning } = memoryBackgroundWork({ ports, service, servicePorts, store, businessAlive, assertBusiness });
  // Internal Agent identity follows memoryCaller; external MCP runtime Sessions keep their granted non-Run reads.
  const read = async (context: ActionExecutionContext, request: { list: MemoryListRequest } | { recall: MemoryRecallRequest }) => {
    if (context.actor_id.startsWith("agent:")) {
      if (!context.runtime_memory_read) throw memoryErrors.unavailable("这一轮没有记忆展开控制");
      await context.beforeEffect();
      return forCall(context).expand(memoryCaller(context), request, context.runtime_memory_read);
    }
    const service = forCall(context), identity = memoryCaller(context);
    return "recall" in request
      ? service.recall(identity, request.recall, { beforeEffect: () => context.beforeEffect(), readMode: context.memory_read_mode ?? "task" })
      : service.list(identity, request.list);
  };
  const bindings: ActionHandlerBinding[] = [
    { ...memoryActions.learningEnqueue, handle: (context, value) => enqueueLearning(context, input<MemoryLearningEnqueueRequest>(value)) },
    { ...memoryActions.recall, handle: (context, value) => read(context, { recall: input<MemoryRecallRequest>(value) }) }, // concurrent: its receipts (最近用于) are its only effect, written after the call's own check
    { ...memoryActions.page, handle: (context, value) => forCall(context).page(memoryCaller(context), input<MemoryPageRequest>(value)) },
    { ...memoryActions.list, handle: (context, value) => read(context, { list: input<MemoryListRequest>(value) }) },
    { ...memoryActions.write, handle: async (context, value) => { await context.beforeEffect(); return forCall(context).write(memoryCaller(context), input<MemoryWriteRequest>(value)); } },
    { ...memoryActions.batchPreview, handle: (context, value) => forCall(context).batches.preview(memoryCaller(context), input<MemoryBatchRequest>(value)) },
    { ...memoryActions.batchApply, handle: (context, value) => forCall(context).batches.apply(memoryCaller(context), input<{ preview_id: string }>(value).preview_id) },
    { ...memoryActions.change, handle: async (context, value) => { await context.beforeEffect(); return forCall(context).change(memoryCaller(context), input<MemoryChangeRequest>(value)); } },
    { ...memoryActions.history, handle: (context, value) => forCall(context).history(memoryCaller(context), String(input<{ memory_id: string }>(value).memory_id)) },
    { ...memoryActions.candidates, handle: async (context, value) => { return { candidates: await forCall(context).candidates(memoryCaller(context), input(value)) }; } },
    { ...memoryActions.accept, handle: async (context, value) => { await context.beforeEffect(); const request = input<MemoryCandidateDecision>(value);
      return forCall(context).accept(memoryCaller(context), request.candidate_id, request); } },
    { ...memoryActions.discard, handle: async (context, value) => { await context.beforeEffect(); const request = input<MemoryCandidateDecision>(value);
      return forCall(context).discard(memoryCaller(context), request.candidate_id, request.expected_version); } },
    { ...memoryActions.changes, handle: (context, value) => ({ changes: forCall(context).changes(memoryCaller(context), input(value)) }) },
    { ...memoryActions.undo, handle: async (context, value) => { await context.beforeEffect(); return forCall(context).undo(memoryCaller(context), input<{ change_id: string }>(value).change_id); } },
    { ...memoryActions.prefs, handle: (context, value) => forCall(context).prefs(memoryCaller(context), input<{ scope?: MemoryScope }>(value).scope) },
    { ...memoryActions.savePrefs, handle: async (context, value) => { await context.beforeEffect(); const request = input<MemoryPrefsWriteRequest>(value);
      return forCall(context).savePrefs(memoryCaller(context), request.scope, request.preset ?? request.prefs); } },
    { ...memoryActions.signal, handle: async (context, value) => { await context.beforeEffect(); return forCall(context).signal(memoryCaller(context), input<MemorySignalReport>(value)); } },
    { ...memoryActions.pairs, handle: async (context, value) => { return { pairs: await forCall(context).pairs(memoryCaller(context), input(value)) }; } },
    { ...memoryActions.resolvePair, handle: async (context, value) => { await context.beforeEffect(); const request = input<{ pair_id: string; keep: "a" | "b" | "both" }>(value);
      return forCall(context).resolvePair(memoryCaller(context), request.pair_id, request.keep); } },
    { ...memoryActions.upkeep, handle: async context => { if (context.audience !== "user") throw memoryErrors.forbidden("只有本人能立即整理"); await context.beforeEffect(); return upkeepNow(forCall(context)); } },
    { ...memoryActions.preview, handle: async (context, value) => { return forCall(context).previewScope(memoryCaller(context), input<{ scope: MemoryScope }>(value).scope); } },
    { ...memoryActions.clear, handle: async (context, value) => { await context.beforeEffect(); const request = input<{ scope: MemoryScope; fingerprint: string }>(value);
      return forCall(context).clearScope(memoryCaller(context), request.scope, request.fingerprint); } },
    { ...memoryActions.export, handle: async (context, value) => { return { package: await forCall(context).exportScope(memoryCaller(context), input<{ scope: MemoryScope }>(value).scope) }; } },
    { ...memoryActions.import, handle: async (context, value) => { await context.beforeEffect(); const request = input<{ scope: MemoryScope; package: unknown }>(value);
      return forCall(context).importScope(memoryCaller(context), request.scope, request.package); } },
  ];
  const dispose = ports.localHost.actionRegistry().registerProvider({ provider: { provider_id: MEMORY_PROVIDER_ID, title: "记忆", kind: "system" },
    definitions: Object.values(memoryActions), handlers: bindings });
  const deletion = registerMemoryProjectDeletion({ ...ports, backend, ledger, alive: businessAlive,
    withEffect: (control, work) => memoryRuntimeEffect(ports.agentHost)(control, work), controlledBackend: control => prologueMemoryBackend(store, control) });
  const host: MemoryHost = {
    service,
    withExecution: (control, bindChangeTarget) => controlledMemoryService({ ...servicePorts, bindChangeTarget },
      current => prologueMemoryBackend(store, current), {
        beforeEffect: () => control.beforeEffect(),
        assert_current: () => { assertBusiness(); control.assert_current(); },
      }),
    checkAssistantSources: (caller, request) => assistantSources.check(caller, request),
    policy: {
      alive: businessAlive,
      prefsFor: (scope, projectId) => service.prefsFor(LOCAL_PERSON, scope, projectId),
      owners: projectId => ledger.owners(projectId),
      candidateOwners: projectId => ledger.candidateOwners(projectId),
      projectExists: projectId => ports.projectExists?.(projectId) ?? Promise.resolve(null),
      ...deletion,
    },
    caller,
    learnLater,
    stopBusiness: () => { stopped = true; dispose(); },
    close: () => {
      host.stopBusiness();
      if (closed) return;
      ledger.close();
      closed = true;
      hosts.delete(ports.localHost);
    },
  };
  const assistantSources = memorySources(ports.homeDirectory, () => !businessAlive() ? undefined : {
    adapter: ports.agentHost.adapter(RUNTIME), policy: host.policy,
    sourceAllowed: (actor, scope, owner, refs) => service.sourceAllowed(actor, scope, owner, refs),
    sessionAllowed: async owner => owner.actor_id === LOCAL_PERSON && owner.plugin_id === ASSISTANT_PLUGIN_ID && owner.install_id === ASSISTANT_INSTALL_ID,
  });
  hosts.set(ports.localHost, { home: ports.homeDirectory, host, settleUses: receipt => {
    if (closed) throw memoryErrors.unavailable("原记忆使用记录已关闭");
    projection.settleUses(receipt);
  } });
  return host;
}

/**
 * `/api/memory/*` for the settings pages and the work panel: each call is the shared directory's `memory.*` action,
 * invoked with the local person's own context in this page's scope (the project page reaches that project's memories).
 */
export async function handleMemoryHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: { localHost: MolisWorkLocalHost; projectRef?: LocalHostProjectReference }): Promise<boolean> {
  const abort = new AbortController();
  const disconnected = () => { if (!response.writableEnded) abort.abort(new ActionError("actions.cancelled", "调用已取消")); };
  request.once("aborted", disconnected); response.once("close", disconnected);
  try { return await dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/memory", maxBodyBytes: 400_000,
    async handle({ method, pathname, body: rawBody }) {
      if (!memoryHostFor(ports.localHost)) return { status: 503, body: { error: "记忆服务还没有就绪，请稍后再试", code: "memory.unavailable" } };
      const parts = pathname.slice("/api/memory/".length).split("/").map(decodeURIComponent);
      const client = ports.projectRef ? ports.localHost.actionClient(ports.projectRef) : ports.localHost.homeActionClient();
      const { body, operation_id } = memoryCommandBody(rawBody);
      const context = { ...await localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS, abort.signal),
        ...(method === "POST" && operation_id ? { memory_operation_id: operation_id } : {}),
        ...(method === "POST" && parts.length === 1 && parts[0] === "recall" ? { memory_read_mode: "explicit" as const } : {}) };
      const call = (definition: { capability_id: string; version: number }, input: unknown) =>
        client.invoke(context, { capability_id: definition.capability_id, version: definition.version, provider_id: MEMORY_PROVIDER_ID }, input);
      const scope = (value: unknown): MemoryScope | undefined => value === "project" || value === "personal" ? value : undefined;
      const pageLabels = async (page: MemoryPageResponse) => ({ goals: await subjectTitles(ports.localHost, ports.projectRef, "goal",
        page.items.flatMap(item => item.applies.goal_ids ?? [])).catch(() => ({})) });
      if (method === "GET" && parts.length === 1 && parts[0] === "page") {
        const encoded = url.searchParams.get("input") ?? "{}";
        if (encoded.length > 70000) throw memoryErrors.invalid("管理页查询超出限额");
        let input: unknown;
        try { input = JSON.parse(encoded); } catch { throw memoryErrors.invalid("管理页查询不是有效 JSON"); }
        const page = await call(memoryActions.page, input) as MemoryPageResponse;
        return { status: 200, body: { ...page, labels: await pageLabels(page) } };
      }
      // Side sections retain their contracts; formal memories use the same bounded page as subsequent requests.
      if (method === "GET" && parts.length === 1 && parts[0] === "overview") {
        const wanted = scope(url.searchParams.get("scope")) ?? (ports.projectRef ? "project" : "personal");
        const [page, prefs, candidates, changes] = await Promise.all([
          call(memoryActions.page, { scope: wanted }), call(memoryActions.prefs, { scope: wanted }),
          call(memoryActions.candidates, { scope: wanted }).catch(error => {
            if (abort.signal.aborted) throw error;
            // The failed Action keeps its diagnostic; null means unread, never an empty candidate list.
            return { candidates: null };
          }), call(memoryActions.changes, { scope: wanted, limit: 30 }),
        ]);
        return { status: 200, body: { scope: wanted, ...(page as object), ...(prefs as object), ...(candidates as object), ...(changes as object), pairs: null,
          labels: await pageLabels(page as MemoryPageResponse), last_upkeep: memoryHostFor(ports.localHost)?.service.lastUpkeep(LOCAL_PERSON) ?? null } };
      }
      if (method === "GET" && parts.length === 1 && parts[0] === "pairs") return { status: 200,
        body: await call(memoryActions.pairs, { scope: url.searchParams.get("scope") ?? (ports.projectRef ? "project" : "personal") }) };
      if (method === "GET" && parts.length === 3 && parts[0] === "items" && parts[2] === "history") return { status: 200, body: await call(memoryActions.history, { memory_id: parts[1] }) };
      if (method !== "POST") return null;
      if (parts.length === 1 && parts[0] === "recall") return { status: 200, body: await call(memoryActions.recall, body) };
      if (parts.length === 1 && parts[0] === "items") return { status: 200, body: await call(memoryActions.write, body) };
      if (parts.length === 2 && parts[0] === "batch" && parts[1] === "preview") return { status: 200, body: await call(memoryActions.batchPreview, body) };
      if (parts.length === 2 && parts[0] === "batch" && parts[1] === "apply") return { status: 200, body: await call(memoryActions.batchApply, body) };
      if (parts.length === 1 && parts[0] === "change") return { status: 200, body: await call(memoryActions.change, body) };
      if (parts.length === 1 && parts[0] === "prefs") return { status: 200, body: await call(memoryActions.savePrefs, body) };
      if (parts.length === 3 && parts[0] === "candidates" && parts[2] === "accept") return { status: 200, body: await call(memoryActions.accept, { candidate_id: parts[1], expected_version: body.expected_version,
        ...(typeof body.text === "string" && body.text.trim() ? { text: body.text } : {}), ...(body.formal === undefined ? {} : { formal: body.formal }) }) };
      if (parts.length === 3 && parts[0] === "candidates" && parts[2] === "discard") return { status: 200, body: await call(memoryActions.discard, { candidate_id: parts[1], expected_version: body.expected_version }) };
      if (parts.length === 3 && parts[0] === "changes" && parts[2] === "undo") return { status: 200, body: await call(memoryActions.undo, { change_id: parts[1] }) };
      if (parts.length === 1 && parts[0] === "signals") return { status: 200, body: await call(memoryActions.signal, body) };
      if (parts.length === 1 && parts[0] === "preview") return { status: 200, body: await call(memoryActions.preview, body) };
      if (parts.length === 3 && parts[0] === "pairs" && parts[2] === "resolve") return { status: 200, body: await call(memoryActions.resolvePair, { pair_id: parts[1], keep: body.keep }) };
      if (parts.length === 1 && parts[0] === "upkeep") return { status: 200, body: await call(memoryActions.upkeep, {}) };
      if (parts.length === 1 && parts[0] === "clear") return { status: 200, body: await call(memoryActions.clear, body) };
      if (parts.length === 1 && parts[0] === "export") return { status: 200, body: await call(memoryActions.export, body) };
      if (parts.length === 1 && parts[0] === "import") return { status: 200, body: await call(memoryActions.import, body) };
      return null;
    },
  }); } finally { request.off("aborted", disconnected); response.off("close", disconnected); }
}
