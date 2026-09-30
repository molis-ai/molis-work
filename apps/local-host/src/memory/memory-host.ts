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

/**
 * Host wiring of the platform memory (specs/memory-system §5.2): Prologue Memory of this Home's one runtime as the
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
  projectTitle?(projectId: string): Promise<string | null>;
}

/**
 * The memories an Agent run is given, for Agent work (Coding, plugin Agents, scheduled runs): the platform recall with
 * this Home's person and the run's project, under the Agent consumer's switch. Null when there is no memory host yet.
 */
export async function memoryForAgentRun(localHost: MolisWorkLocalHost, input: { project_id: string | null; task: string; used_for: string; plugin_id?: string }) {
  const host = memoryHostFor(localHost);
  if (!host) return null;
  return host.service.forRun({ actor_id: LOCAL_PERSON, project_id: input.project_id, consumer: "agent" },
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
  ];
  // The service's own errors reach every caller as the directory's errors, with the same code and words.
  const handlers: ActionHandlerBinding[] = bindings.map(binding => ({ ...binding, handle: async (context, value) => {
    try { return await binding.handle(context, value); } catch (error) { throw asActionError(error); }
  } }));
  const dispose = ports.localHost.actionRegistry().registerProvider({ provider: { provider_id: MEMORY_PROVIDER_ID, title: "记忆", kind: "system" },
    definitions: [memoryActions.recall, memoryActions.list, memoryActions.write, memoryActions.change, memoryActions.history, memoryActions.candidates, memoryActions.accept,
      memoryActions.discard, memoryActions.changes, memoryActions.undo, memoryActions.prefs, memoryActions.savePrefs, memoryActions.signal], handlers });
  const host: MemoryHost = {
    get service() { migrate(); return service; },
    caller,
    close: () => { dispose(); ledger.close(); hosts.delete(ports.localHost); },
  };
  hosts.set(ports.localHost, { home: ports.homeDirectory, host });
  return host;
}

/** Prologue Memory of the runtime as the memory service's store: personal memories are its `user` scope. */
export function prologueMemoryBackend(store: () => Promise<AgentMemoryCapability>): MemoryBackendPort {
  const prologueScope = (scope: MemoryScope) => scope === "personal" ? "user" as const : "project" as const;
  const view = (entry: AgentMemoryEntry) => ({ memory_id: entry.memory_id, text: entry.text, origin: entry.origin, tags: [...entry.tags], version: entry.version,
    meta: entry.meta ?? {}, ...(entry.paused ? { paused: entry.paused } : {}), created_at_ms: entry.created_at_ms ?? 0, updated_at_ms: entry.updated_at_ms ?? 0 });
  const required = <K extends "setMeta" | "pause" | "resume">(memory: AgentMemoryCapability, name: K): NonNullable<AgentMemoryCapability[K]> => {
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
    candidates: {
      propose: async input => candidateView(await (await box(store)).propose({ scope: prologueScope(input.scope), owner: input.owner, text: input.text, origin: input.origin, tags: input.tags, meta: input.meta })),
      list: async (scope, owner) => (await (await box(store)).list(prologueScope(scope), owner)).map(candidateView),
      accept: async input => view(await (await box(store)).accept({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id, text: input.text, origin: input.origin, meta: input.meta })),
      promote: async input => view(await (await box(store)).promote({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id, policy: input.policy,
        version: input.version, origin: input.origin, meta: input.meta })),
      settleInto: async input => view(await (await box(store)).settleInto({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id, memory_id: input.memory_id, by: input.by })),
      discard: async input => { await (await box(store)).discard({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id }); },
      expire: async input => { await (await box(store)).expire({ scope: prologueScope(input.scope), owner: input.owner, candidate_id: input.candidate_id }); },
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
        const [list, prefs, candidates, changes] = await Promise.all([
          call(memoryActions.list, { scope: wanted }), call(memoryActions.prefs, { scope: wanted }),
          call(memoryActions.candidates, { scope: wanted }), call(memoryActions.changes, { scope: wanted, limit: 30 }),
        ]);
        return { status: 200, body: { scope: wanted, ...(list as object), ...(prefs as object), ...(candidates as object), ...(changes as object) } };
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
