import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { homeSqlitePath, openHomeSqliteDatabase, openMemoryLedger } from "@molis-ai/molis-work-storage";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentMemoryCandidateEntry, AgentMemoryCapability, AgentMemoryEntry } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError, type ActionCallContext, type ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  MEMORY_PROVIDER_ID,
  memoryActions,
  type MemoryChangeRequest,
  type MemoryConsumer,
  type MemoryListRequest,
  type MemoryPrefs,
  type MemoryRecallRequest,
  type MemoryScope,
  type MemorySignalReport,
  type MemoryWriteRequest,
} from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryError, MemoryService, type LegacyMemoryState, type MemoryBackendPort, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { dispatchNativePluginJsonHttp } from "../native-plugin-http.js";
import { localWebActionContext } from "../local-web-actions.js";
import { LOCAL_OWNER_PERMISSIONS } from "../local-owner-permissions.js";
import type { MolisWorkLocalHost } from "../project-host.js";
import { ASSISTANT_STORE_NAME, AssistantStore } from "../assistant/assistant-store.js";
import { learnFromWork, type MemoryLearningRequest } from "./memory-learning.js";
import { runUpkeep, subjectTitles } from "./memory-upkeep.js";

/**
 * Host wiring of the platform memory (specs/archive/memory-system §5.2): Prologue Memory of this Home's one runtime as the
 * store, the ledger in `<Home>/memory`, the `system.memory` actions in the shared directory, and `/api/memory/*` for
 * the settings pages and the work panel. The memory service itself is in horizontal/memory.
 */

/** This Home's person. Agents, plugins and external clients act on their behalf, so personal memories are theirs. */
export const LOCAL_PERSON = "web-user";
const RUNTIME = "prologue";

export interface MemoryHost {
  readonly service: MemoryService;
  /** Who the call is for, from its trusted context: the consumer from the audience, never from input. */
  caller(context: ActionCallContext, work?: { work_id: string; title: string } | null): MemoryCaller;
  /**
   * A work's round finished: draw out what may be worth keeping, once per round (`key`), through the runtime's durable
   * queue so a restart does not lose it. Nothing runs when the round said nothing worth learning.
   */
  learnLater(request: MemoryLearningRequest & { key: string; session_id: string | null }): Promise<void>;
  close(): void;
}

const hosts = new WeakMap<MolisWorkLocalHost, { home: string; host: MemoryHost }>();

export function memoryHostFor(localHost: MolisWorkLocalHost): MemoryHost | undefined {
  return hosts.get(localHost)?.host;
}

export interface MemoryHostPorts {
  localHost: MolisWorkLocalHost;
  homeDirectory: string;
  agentHost: AgentHost;
  /** Starts the runtime when needed; memory lives in it. */
  ready(): Promise<void>;
  /** Settles once the runtime started because something needed it (never starts it). */
  started?(): Promise<void>;
  /** Project ids in this Home, for upkeep over every project's memories. */
  projects?(): Promise<string[]>;
  projectTitle?(projectId: string): Promise<string | null>;
}

/**
 * The memories an Agent run is given, for Agent work (Coding, plugin Agents, scheduled runs): the platform recall with
 * this Home's person and the run's project, under the Agent consumer's switch. Null when there is no memory host yet.
 */
export async function memoryForAgentRun(localHost: MolisWorkLocalHost, input: { project_id: string | null; task: string; used_for: string; plugin_id?: string;
  character?: { artifact_id: string; title: string } }) {
  const host = memoryHostFor(localHost);
  if (!host) return null;
  return host.service.forRun({ actor_id: LOCAL_PERSON, project_id: input.project_id, consumer: "agent", ...(input.character ? { character: { id: input.character.artifact_id, title: input.character.title } } : {}) },
    { query: input.task.slice(0, 2000), used_for: input.used_for.slice(0, 80), ...(input.plugin_id ? { situation: { plugin_id: input.plugin_id } } : {}), limit: 12 });
}

/** Registered once per Local Host, next to the Agent service that owns the runtime. */
export function registerMemoryHost(ports: MemoryHostPorts): MemoryHost {
  const existing = hosts.get(ports.localHost);
  if (existing && existing.home === ports.homeDirectory) return existing.host;
  const ledger = openMemoryLedger({ homeDirectory: ports.homeDirectory });
  const store = async (): Promise<AgentMemoryCapability> => {
    await ports.ready();
    const memory = ports.agentHost.adapter(RUNTIME).memory;
    if (!memory) throw new MemoryError("memory.off", "当前运行时没有记忆能力");
    return memory;
  };
  const service = new MemoryService({ backend: prologueMemoryBackend(store), ledger, ...(ports.projectTitle ? { projectTitle: ports.projectTitle } : {}) });
  // The Assistant's first version kept switches, a switched-off list and candidates in its own library: moved once.
  let migrated = false;
  const migrate = () => {
    if (migrated) return;
    migrated = true;
    const legacy = readAssistantMemory(ports.homeDirectory, LOCAL_PERSON);
    if (legacy) service.migrateLegacy(LOCAL_PERSON, legacy);
  };
  const guarded = <T>(work: () => T): T => { migrate(); return work(); };
  const caller = (context: ActionCallContext, work?: { work_id: string; title: string } | null): MemoryCaller => {
    const consumer: MemoryConsumer = context.audience === "plugin" ? "plugin" : context.audience === "mcp" ? "mcp" : context.audience === "user" ? "ui" : "agent";
    return { actor_id: LOCAL_PERSON, project_id: context.project_id, consumer, plugin_id: context.host_plugin?.plugin_id ?? null, work: work ?? null,
      person: context.audience === "user" && context.actor_kind !== "runtime" };
  };
  const input = <T>(value: unknown) => (value ?? {}) as T;
  const bindings: ActionHandlerBinding[] = [
    { ...memoryActions.recall, handle: (context, value) => guarded(() => service.recall(caller(context), input<MemoryRecallRequest>(value))) },
    { ...memoryActions.list, handle: (context, value) => guarded(() => service.list(caller(context), input<MemoryListRequest>(value))) },
    { ...memoryActions.write, handle: async (context, value) => { migrate(); await context.beforeEffect(); return service.write(caller(context), input<MemoryWriteRequest>(value)); } },
    { ...memoryActions.change, handle: async (context, value) => { migrate(); await context.beforeEffect(); return service.change(caller(context), input<MemoryChangeRequest>(value)); } },
    { ...memoryActions.history, handle: (context, value) => guarded(() => service.history(caller(context), String(input<{ memory_id: string }>(value).memory_id))) },
    { ...memoryActions.candidates, handle: async (context, value) => { migrate(); return { candidates: await service.candidates(caller(context), input(value)) }; } },
    { ...memoryActions.accept, handle: async (context, value) => { migrate(); await context.beforeEffect(); const request = input<{ candidate_id: string; text?: string }>(value);
      return service.accept(caller(context), request.candidate_id, request.text !== undefined ? { text: request.text } : {}); } },
    { ...memoryActions.discard, handle: async (context, value) => { migrate(); await context.beforeEffect(); return service.discard(caller(context), input<{ candidate_id: string }>(value).candidate_id); } },
    { ...memoryActions.changes, handle: (context, value) => guarded(() => ({ changes: service.changes(caller(context), input(value)) })) },
    { ...memoryActions.undo, handle: async (context, value) => { migrate(); await context.beforeEffect(); return service.undo(caller(context), input<{ change_id: string }>(value).change_id); } },
    { ...memoryActions.prefs, handle: (context, value) => guarded(() => service.prefs(caller(context), input<{ scope?: MemoryScope }>(value).scope)) },
    { ...memoryActions.savePrefs, handle: async (context, value) => { migrate(); await context.beforeEffect(); const request = input<{ scope?: MemoryScope; prefs: Partial<MemoryPrefs> }>(value);
      return service.savePrefs(caller(context), request.scope, request.prefs); } },
    { ...memoryActions.signal, handle: async (context, value) => { migrate(); await context.beforeEffect(); return service.signal(caller(context), input<MemorySignalReport>(value)); } },
    { ...memoryActions.pairs, handle: async (context, value) => { migrate(); return { pairs: await service.pairs(caller(context), input(value)) }; } },
    { ...memoryActions.resolvePair, handle: async (context, value) => { migrate(); await context.beforeEffect(); const request = input<{ pair_id: string; keep: "a" | "b" | "both" }>(value);
      return service.resolvePair(caller(context), request.pair_id, request.keep); } },
    { ...memoryActions.upkeep, handle: async context => { if (context.audience !== "user") throw new ActionError("memory.forbidden", "只有本人能立即整理"); await context.beforeEffect(); return upkeepNow(); } },
    { ...memoryActions.preview, handle: async (context, value) => { migrate(); return service.previewScope(caller(context), input<{ scope: MemoryScope }>(value).scope); } },
    { ...memoryActions.clear, handle: async (context, value) => { migrate(); await context.beforeEffect(); const request = input<{ scope: MemoryScope; fingerprint: string }>(value);
      return service.clearScope(caller(context), request.scope, request.fingerprint); } },
    { ...memoryActions.export, handle: async (context, value) => { migrate(); return { package: await service.exportScope(caller(context), input<{ scope: MemoryScope }>(value).scope) }; } },
    { ...memoryActions.import, handle: async (context, value) => { migrate(); await context.beforeEffect(); const request = input<{ scope: MemoryScope; package: unknown }>(value);
      return service.importScope(caller(context), request.scope, request.package); } },
  ];
  // The service's own errors reach every caller as the directory's errors, with the same code and words.
  const handlers: ActionHandlerBinding[] = bindings.map(binding => ({ ...binding, handle: async (context, value) => {
    try { return await binding.handle(context, value); } catch (error) { throw asActionError(error); }
  } }));
  const dispose = ports.localHost.actionRegistry().registerProvider({ provider: { provider_id: MEMORY_PROVIDER_ID, title: "记忆", kind: "system" },
    definitions: Object.values(memoryActions), handlers });
  // Drawing out memories, and daily upkeep: tasks of the runtime's own durable queue (one runner for each kind).
  const LEARN_KIND = "memory.learn", UPKEEP_KIND = "memory.upkeep";
  let queueAttached = false;
  const person: MemoryCaller = { actor_id: LOCAL_PERSON, project_id: null, consumer: "ui", person: true };
  const upkeepNow = async () => { migrate(); return runUpkeep(service, { homeDirectory: ports.homeDirectory, localHost: ports.localHost, caller: person, projects: await ports.projects?.().catch(() => []) ?? [] }); };
  /** The runtime's queue hangs tasks on a session: upkeep has its own, made once and kept in the ledger. */
  const upkeepSession = async (): Promise<string> => {
    const saved = ledger.migration(LOCAL_PERSON, "upkeep-session")?.body as { session_id?: string } | undefined;
    if (saved?.session_id) return saved.session_id;
    const session = await ports.agentHost.adapter(RUNTIME).createSession({ board_id: MEMORY_PROVIDER_ID, plugin_id: MEMORY_PROVIDER_ID, install_id: MEMORY_PROVIDER_ID,
      actor_id: LOCAL_PERSON, workspace: "none", role_id: "memory-upkeep", title: "记忆整理" });
    ledger.markMigration(LOCAL_PERSON, "upkeep-session", { session_id: session.session_id }, new Date().toISOString());
    return session.session_id;
  };
  /** Next upkeep: at four in the morning local time (today's when that has not passed and today's has not run yet). */
  const scheduleUpkeep = async (after: Date) => {
    const schedule = ports.agentHost.adapter(RUNTIME).schedule;
    if (!schedule) return;
    const due = new Date(after); due.setHours(4, 0, 0, 0);
    if (due.getTime() <= after.getTime()) due.setDate(due.getDate() + 1);
    const last = service.lastUpkeep(LOCAL_PERSON);
    // Missed while Molis Work was not running (more than a day ago): done soon after start instead.
    const when = !last || Date.now() - Date.parse(last.at) > 26 * 3_600_000 ? new Date(Date.now() + 60_000) : due;
    const key = `memory-upkeep:${when.toISOString().slice(0, 10)}`;
    if (schedule.find(key)) return;
    await schedule.enqueue({ key, session_id: await upkeepSession(), kind: UPKEEP_KIND, payload: {}, due_at: when.toISOString(), max_attempts: 2 });
  };
  const runLearning = async (request: MemoryLearningRequest) => {
    migrate();
    try {
      const outcome = await learnFromWork(service, ports.homeDirectory, request);
      if (process.env.MOLIS_WORK_MEMORY_DEBUG) console.warn("[memory] learn", JSON.stringify(outcome));
    } catch (error) {
      // Nothing was written (the gate commits only whole proposals); the queue may try once more.
      console.warn("[memory] 提炼没有完成", error instanceof Error ? error.message : String(error));
      throw error;
    }
  };
  const attachQueue = () => {
    if (queueAttached) return;
    const schedule = ports.agentHost.adapter(RUNTIME).schedule;
    if (!schedule) return;
    schedule.handle(LEARN_KIND, async task => { await runLearning(task.payload as unknown as MemoryLearningRequest); });
    schedule.handle(UPKEEP_KIND, async () => { await upkeepNow(); await scheduleUpkeep(new Date()); });
    queueAttached = true;
    void scheduleUpkeep(new Date()).catch(error => console.warn("[memory] 没有排上整理", error));
  };
  void ports.started?.().then(attachQueue).catch(() => undefined);
  const host: MemoryHost = {
    get service() { migrate(); return service; },
    caller,
    learnLater: async request => {
      const said = request.said.map(text => text.trim()).filter(Boolean).slice(-6);
      if (!service.worthLearning(request.caller, said)) { if (process.env.MOLIS_WORK_MEMORY_DEBUG) console.warn("[memory] learn skipped", request.key); return; }
      await ports.ready();
      attachQueue();
      const schedule = ports.agentHost.adapter(RUNTIME).schedule;
      const payload = { caller: request.caller, said } as unknown as Record<string, unknown>;
      // Without the durable queue (or a session to hang it on) it runs now; a failure leaves nothing half written.
      if (!schedule || !request.session_id) { void runLearning({ caller: request.caller, said }).catch(error => console.warn("[memory] 提炼没有完成", error)); return; }
      const queued = await schedule.enqueue({ key: `memory-learn:${request.key}`, session_id: request.session_id, kind: LEARN_KIND, payload, due_at: new Date().toISOString(), max_attempts: 2 });
      if (process.env.MOLIS_WORK_MEMORY_DEBUG) console.warn("[memory] learn queued", queued.key, queued.state, queued.due_at);
    },
    close: () => { dispose(); ledger.close(); hosts.delete(ports.localHost); },
  };
  hosts.set(ports.localHost, { home: ports.homeDirectory, host });
  return host;
}

/** Prologue Memory of the runtime as the memory service's store: personal memories are its `user` scope. */
export function prologueMemoryBackend(store: () => Promise<AgentMemoryCapability>): MemoryBackendPort {
  const prologueScope = (scope: MemoryScope) => scope === "personal" ? "user" as const : scope === "character" ? "character" as const : "project" as const;
  const view = (entry: AgentMemoryEntry) => ({ memory_id: entry.memory_id, text: entry.text, origin: entry.origin, tags: [...entry.tags], version: entry.version,
    meta: entry.meta ?? {}, ...(entry.paused ? { paused: entry.paused } : {}), created_at_ms: entry.created_at_ms ?? 0, updated_at_ms: entry.updated_at_ms ?? 0 });
  const required = <K extends "setMeta" | "pause" | "resume" | "previewScope" | "clearScope">(memory: AgentMemoryCapability, name: K): NonNullable<AgentMemoryCapability[K]> => {
    const method = memory[name];
    if (!method) throw new MemoryError("memory.off", "当前运行时的记忆不支持结构化信息与暂停");
    return method.bind(memory) as NonNullable<AgentMemoryCapability[K]>;
  };
  return {
    list: async (scope, owner) => (await (await store()).list(prologueScope(scope), owner)).map(view),
    write: async input => view(await (await store()).write({ scope: prologueScope(input.scope), owner: input.owner, text: input.text, origin: input.origin, tags: input.tags, meta: input.meta })),
    update: async input => view(await (await store()).update({ scope: prologueScope(input.scope), owner: input.owner, memory_id: input.memory_id, text: input.text })),
    setMeta: async input => view(await required(await store(), "setMeta")({ scope: prologueScope(input.scope), owner: input.owner, memory_id: input.memory_id, meta: input.meta })),
    pause: async input => view(await required(await store(), "pause")({ scope: prologueScope(input.scope), owner: input.owner, memory_id: input.memory_id, reason: input.reason })),
    resume: async input => view(await required(await store(), "resume")({ scope: prologueScope(input.scope), owner: input.owner, memory_id: input.memory_id })),
    remove: async input => { await (await store()).remove({ scope: prologueScope(input.scope), owner: input.owner, memory_id: input.memory_id }); },
    screen: async text => { const memory = await store(); if (!memory.screen) throw new MemoryError("memory.off", "当前运行时不能筛查"); return memory.screen(text); },
    previewScope: async (scope, owner) => required(await store(), "previewScope")(prologueScope(scope), owner),
    clearScope: async input => required(await store(), "clearScope")({ scope: prologueScope(input.scope), owner: input.owner, fingerprint: input.fingerprint }),
    candidates: {
      propose: async input => candidateView(await (await box(store)).propose({ scope: prologueScope(input.scope), owner: input.owner, text: input.text, origin: input.origin, tags: input.tags, meta: input.meta })),
      list: async (scope, owner) => (await (await box(store)).list(prologueScope(scope), owner)).map(candidateView),
      accept: async input => view(await (await box(store)).accept({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id, text: input.text, origin: input.origin, meta: input.meta })),
      promote: async input => view(await (await box(store)).promote({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id, policy: input.policy,
        version: input.version, origin: input.origin, meta: input.meta })),
      settleInto: async input => view(await (await box(store)).settleInto({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id, memory_id: input.memory_id, by: input.by })),
      discard: async input => { await (await box(store)).discard({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id }); },
      expire: async input => { await (await box(store)).expire({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id }); },
      purge: async input => { await (await box(store)).purge({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id }); },
    },
  };
}

const box = async (store: () => Promise<AgentMemoryCapability>) => {
  const candidates = (await store()).candidates;
  if (!candidates) throw new MemoryError("memory.off", "当前运行时没有记忆候选箱");
  return candidates;
};
const candidateView = (item: AgentMemoryCandidateEntry) => ({ candidate_id: item.candidate_id, text: item.text, state: item.state, ...(item.memory_id ? { memory_id: item.memory_id } : {}) });

/** The first version's state in the Assistant's library, when there is one. Never creates that library. */
function readAssistantMemory(homeDirectory: string, actorId: string): LegacyMemoryState | null {
  if (!existsSync(homeSqlitePath(homeDirectory, ASSISTANT_STORE_NAME))) return null;
  const db = openHomeSqliteDatabase(homeDirectory, ASSISTANT_STORE_NAME);
  try {
    const legacy = new AssistantStore(db).legacyMemory(actorId);
    return {
      prefs: legacy.prefs,
      disabled: legacy.disabled,
      candidates: legacy.candidates.map(candidate => ({ candidate_id: candidate.candidate_id, work_id: candidate.work_id, work_title: candidate.work_title, scope: candidate.scope,
        ...(candidate.project_id ? { project_id: candidate.project_id } : {}), text: candidate.text, why: candidate.why, applies: candidate.applies, state: candidate.state,
        created_at: candidate.created_at, ...(candidate.memory_id ? { memory_id: candidate.memory_id } : {}) })),
    };
  } finally { db.close(); }
}

export function asActionError(error: unknown): unknown {
  if (error instanceof MemoryError) return new ActionError(error.code === "memory.not_found" ? "memory.not_found" : error.code, error.message);
  return error;
}

/**
 * `/api/memory/*` for the settings pages and the work panel: each call is the shared directory's `memory.*` action,
 * invoked with the local person's own context in this page's scope (the project page reaches that project's memories).
 */
export async function handleMemoryHttp(request: IncomingMessage, response: ServerResponse, url: URL,
  ports: { localHost: MolisWorkLocalHost; projectRef?: LocalHostProjectReference }): Promise<boolean> {
  return dispatchNativePluginJsonHttp(request, response, url, { prefix: "/api/memory", maxBodyBytes: 400_000,
    async handle({ method, pathname, body }) {
      if (!memoryHostFor(ports.localHost)) return { status: 503, body: { error: "记忆服务还没有就绪，请稍后再试", code: "memory.unavailable" } };
      const parts = pathname.slice("/api/memory/".length).split("/").map(decodeURIComponent);
      const client = ports.projectRef ? ports.localHost.actionClient(ports.projectRef) : ports.localHost.homeActionClient();
      const context = await localWebActionContext(ports.localHost, ports.projectRef, LOCAL_OWNER_PERMISSIONS);
      const call = (definition: { capability_id: string; version: number }, input: unknown) =>
        client.invoke(context, { capability_id: definition.capability_id, version: definition.version, provider_id: MEMORY_PROVIDER_ID }, input);
      const scope = (value: unknown): MemoryScope | undefined => value === "project" || value === "personal" ? value : undefined;
      // One read for a settings page: the scope's memories, switches, candidates and recent changes.
      if (method === "GET" && parts.length === 1 && parts[0] === "overview") {
        const wanted = scope(url.searchParams.get("scope")) ?? (ports.projectRef ? "project" : "personal");
        // A project's page also holds its Characters' memories, so it lists everything the person has there and shows those.
        const [list, prefs, candidates, changes, pairs] = await Promise.all([
          call(memoryActions.list, wanted === "project" ? {} : { scope: wanted }), call(memoryActions.prefs, { scope: wanted }),
          call(memoryActions.candidates, { scope: wanted }), call(memoryActions.changes, { scope: wanted, limit: 30 }), call(memoryActions.pairs, { scope: wanted }),
        ]);
        // Goals a memory is limited to, by name (read through the Goals plugin's own reader), so the page never shows bare ids.
        const goalIds = ((list as { items?: Array<{ applies?: { goal_ids?: string[] } }> }).items ?? []).flatMap(item => item.applies?.goal_ids ?? []);
        const goals = await subjectTitles(ports.localHost, ports.projectRef, "goal", goalIds).catch(() => ({}));
        return { status: 200, body: { scope: wanted, ...(list as object), ...(prefs as object), ...(candidates as object), ...(changes as object), ...(pairs as object),
          labels: { goals }, last_upkeep: memoryHostFor(ports.localHost)?.service.lastUpkeep(LOCAL_PERSON) ?? null } };
      }
      if (method === "GET" && parts.length === 3 && parts[0] === "items" && parts[2] === "history") return { status: 200, body: await call(memoryActions.history, { memory_id: parts[1] }) };
      if (method !== "POST") return null;
      if (parts.length === 1 && parts[0] === "items") return { status: 200, body: await call(memoryActions.write, body) };
      if (parts.length === 1 && parts[0] === "change") return { status: 200, body: await call(memoryActions.change, body) };
      if (parts.length === 1 && parts[0] === "prefs") return { status: 200, body: await call(memoryActions.savePrefs, body) };
      if (parts.length === 3 && parts[0] === "candidates" && parts[2] === "accept") return { status: 200, body: await call(memoryActions.accept, { candidate_id: parts[1], ...(typeof body.text === "string" && body.text.trim() ? { text: body.text } : {}) }) };
      if (parts.length === 3 && parts[0] === "candidates" && parts[2] === "discard") return { status: 200, body: await call(memoryActions.discard, { candidate_id: parts[1] }) };
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
    mapError(error) {
      const code = error instanceof ActionError || error instanceof MemoryError ? error.code : "memory.failed";
      const status = code === "memory.not_found" ? 404 : code === "memory.forbidden" || code === "memory.scope" || code === "actions.permission_denied" ? 403
        : code === "memory.failed" ? 500 : 400;
      return { status, body: { error: error instanceof Error ? error.message : "记忆暂时无法完成", code } };
    },
  });
}
