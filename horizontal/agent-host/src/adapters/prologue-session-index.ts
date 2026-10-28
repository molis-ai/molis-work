import { AsyncLocalStorage } from "node:async_hooks";
import type { ExactRef, PurgePreview } from "@prologue/sdk";
import type { AgentReviewReceipt, AgentRunRef, AgentWriteCheckNote, AgentSessionDecision, AgentSessionLifecycleReceipt, AgentSessionOwner } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { PrologueRestoredSession, PrologueRunTiming, PrologueStartInput } from "./prologue.js";
import type { PrologueRewindIntent } from "./prologue-checkpoints.js";
import type { PrologueSubagentRoot } from "./prologue-subagents.js";
import type { NodeHost } from "./prologue-node-kit.js";
import { readSessionIndex, sessionIndexKind } from "./prologue-session-index-reader.js";

/**
 * Each session's Host record beside the SDK's ledger: who owns it, its workspace mode, and the frozen intent of every
 * start (with display times). App provenance is encrypted in the existing Host store; model events and conversation stay
 * solely in Prologue's session ledger.
 */
export interface SessionIndex {
  schema: 1;
  /** Original Host decision only. Canonical lifecycle state and revision remain SDK-owned. */
  lifecycle?: { action: "archive" | "unarchive" | "purge"; decision: AgentSessionDecision;
    phase: "prepared" | "sdk-complete" | "complete"; preview?: PurgePreview; receipt?: AgentSessionLifecycleReceipt };
  /** Missing on historical rooted sessions. Never infer none from an absent directory. */
  workspace?: "required" | "none" | "business";
  parent_run?: AgentRunRef;
  /** The work graph this session works on (an Assistant Work's, or the one a part of it was handed out on): its rounds stand there. */
  work_graph?: string;
  ref: ExactRef<"session">;
  title: string;
  owner: PrologueRestoredSession["owner"];
  /** Frozen intent and display times only; streamed output stays in the SDK ledger. */
  attempts: Array<PrologueStartInput["provenance"] & { action_tool_scope?: string; refused?: { code: string; at: string }; step_board?: ExactRef<"task-board">; step_prefix?: string; task: string; subagent_errors?: Record<string, string>; subagent_roots?: PrologueSubagentRoot[]; subagent_roles?: Array<[string, NonNullable<PrologueStartInput["subagents"]>[number]]>; run_id?: string; stop_intent?: "stopped" | "cancelled"; stop_reason?: string; root_ref?: ExactRef<"authorized-root">; timing?: PrologueRunTiming; desktop_target?: string;
    /** The first occurrence owns text; later attempts refer to that immutable input in this same Session. */
    original_input?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentOriginalInput;
    original_input_ref?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentOriginalInputRef;
    /** Trusted applicability facts for this attempt; body-free and never inferred from the model's query. */
    memory_context?: { class_restrictions?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryClassPolicy; consumer: string; current_scene: string; facts?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory["facts"]; usage?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory["usage"] };
    /** The round's after-write checks, by the SDK's key for each: which checker answered (prologue-after-write.ts). */
    write_checks?: Record<string, AgentWriteCheckNote> }>;
  rewinds?: PrologueRewindIntent[];
  review_decisions?: Record<string, Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note"> & { requested_at?: string; expires_at?: string | null }>;
}

type LifecycleMutation = { action: "archive" | "unarchive" | "purge"; operation_id: string };
type ProjectPurge = <T>(id: string, operation_id: string, work: () => Promise<T>) => Promise<T>;
interface ProjectHold { include(ids: readonly string[]): void; purge: ProjectPurge }

export interface SessionIndexStore {
  save(value: SessionIndex): Promise<void>;
  read(id: string): Promise<SessionIndex | undefined>;
  /** Changes the latest index under the session's own queue. */
  update(id: string, change: (index: SessionIndex) => void): Promise<void>;
  /** Synchronous publication fence for reads/observers across awaits. */
  capture(id: string, lifecycle?: boolean): () => void;
  assertIdle(id: string): void;
  assertAdmission(id: string): void;
  assertLifecycle(id: string, mutation: LifecycleMutation): void;
  /** Includes preparation, so a lifecycle command cannot pass between claim and actual SDK start. */
  starting<T>(id: string, work: (current: () => void) => Promise<T>): Promise<T>;
  creating<T>(projectId: string, work: (current: () => void) => Promise<T>): Promise<T>;
  holdProject<T>(projectId: string, associated: readonly string[], work: (hold: ProjectHold) => Promise<T>): Promise<T>;
  /** Same exact purge permission as the project hold; it never grants another Session or operation. */
  holdSession<T>(id: string, operationId: string, work: () => Promise<T>): Promise<T>;
  /** Original prepared decision proof only. The Memory owner must still authorize its exact scope and effect. */
  inspectPurge(id: string, operationId: string, owner: AgentSessionOwner): Promise<{ session_ref: ExactRef<"session">; current(): void }>;
  enumerate(): Promise<SessionIndex[]>;
  /** Same per-Session write lane; pending decisions are readable only by their lifecycle owner. */
  lifecycle<T>(id: string, work: (index: SessionIndex, save: (value: SessionIndex) => Promise<void>) => Promise<T>, mutation?: LifecycleMutation): Promise<T>;
  inspect(id: string): Promise<SessionIndex | undefined>;
}

export function createSessionIndexStore(host: { storage: Pick<NodeHost["storage"], "get" | "list" | "readSecure" | "commit"> }, appId: string, projectDeletionPending?: (projectId: string, sessionId?: string) => boolean, sessionLive?: (id: string) => boolean): SessionIndexStore {
  const indexKind = sessionIndexKind(appId);
  const versions = new Map<string, number>();
  const indexUpdates = new Map<string, Promise<void>>();
  const gates = new Map<string, { generation: number; busy: boolean; starting: number; unavailable: boolean }>();
  const gate = (id: string) => { let value = gates.get(id); if (!value) { value = { generation: 0, busy: false, starting: 0, unavailable: false }; gates.set(id, value); } return value; };
  const admission = projectAdmission(projectDeletionPending, id => !!(gate(id).starting || gate(id).busy || sessionLive?.(id)));
  const unavailable = () => agentErrors.session_busy("会话生命周期已变化或原决定未完成，不能读取或写回旧内容");
  const capture = (id: string, lifecycle = false) => {
    const held = gate(id), generation = held.generation;
    const check = () => { if (!lifecycle && held.unavailable || generation !== held.generation) throw unavailable(); };
    check(); return check;
  };
  const write = async (value: SessionIndex, lifecycle = false): Promise<void> => {
    const held = gate(value.ref.id);
    if (lifecycle) { held.generation++; held.unavailable = true; }
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    try {
      const record = await host.storage.commit({ kind: indexKind, id: value.ref.id,
        expectedVersion: versions.get(value.ref.id) ?? 0, metadata: { schema: 1 }, secureBody: bytes });
      versions.set(value.ref.id, record.version); admission.remember(value.ref.id, value.owner.project_id);
      gate(value.ref.id).unavailable = Boolean(value.lifecycle && (value.lifecycle.phase !== "complete" || value.lifecycle.action === "purge"));
    } finally { bytes.fill(0); }
  };
  const inspect = async (id: string): Promise<SessionIndex | undefined> => {
    const read = await readSessionIndex(host.storage, indexKind, id);
    if (!read) return undefined;
    const { value, version } = read;
    versions.set(id, version); admission.remember(id, value.owner.project_id);
    gate(id).unavailable = Boolean(value.lifecycle && (value.lifecycle.phase !== "complete" || value.lifecycle.action === "purge"));
    return value;
  };
  const serialize = async <T>(id: string, work: () => Promise<T>): Promise<T> => {
    const previous = indexUpdates.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    const tail = next.then(() => undefined, () => undefined);
    indexUpdates.set(id, tail);
    try { return await next; }
    finally { if (indexUpdates.get(id) === tail) indexUpdates.delete(id); }
  };
  const read = async (id: string) => {
    const current = capture(id);
    return serialize(id, async () => { current(); const value = await inspect(id); current(); return value; });
  };
  const save = async (value: SessionIndex) => {
    const snapshot = structuredClone(value), current = capture(value.ref.id);
    await serialize(snapshot.ref.id, async () => {
      current();
      if (await inspect(snapshot.ref.id)) throw agentErrors.session_busy("已存在的会话索引不能被旧快照覆盖");
      current(); await write(snapshot);
    });
  };
  // Start and control may overlap at a terminal boundary. Always update the
  // latest index under the same session queue; an old control closure must not
  // replace later attempts with the snapshot it captured when its run started.
  const update = async (id: string, change: (index: SessionIndex) => void): Promise<void> => {
    const current = capture(id);
    await serialize(id, async () => {
      current();
      const index = await inspect(id);
      if (!index) throw new Error("Coding 会话归属索引不可用，不能改变执行记录");
      current();
      change(index);
      await write(index);
    });
  };
  return { save, read, update, inspect, capture,
    assertAdmission: admission.check,
    assertLifecycle: admission.lifecycle,
    creating: admission.creating,
    holdProject: admission.hold,
    holdSession: admission.holdSession,
    async inspectPurge(id, operationId, owner) {
      const current = capture(id, true), saved = await inspect(id);
      current();
      if (!saved || saved.lifecycle?.action !== "purge" || saved.lifecycle.phase !== "prepared"
        || saved.lifecycle.decision.operation_id !== operationId
        || !["project_id", "plugin_id", "install_id", "actor_id"].every(key => {
          const field = key as keyof AgentSessionOwner;
          return typeof owner[field] === "string" && !!owner[field] && owner[field] === saved.owner[field];
        })) throw agentErrors.session_unknown("原清除决定与当前会话主人不一致");
      const allowed = () => { current(); admission.lifecycle(id, { action: "purge", operation_id: operationId }); };
      allowed(); return { session_ref: structuredClone(saved.ref), current: allowed };
    },
    async enumerate() {
      const result: SessionIndex[] = []; let cursor: string | undefined;
      do {
        const page = await host.storage.list({ kind: indexKind, ...(cursor ? { cursor } : {}) });
        for (const record of page.records) {
          if (record.tombstoned) throw agentErrors.session_unknown("归属索引已成墓碑，不能证明项目清理集合完整");
          const saved = await inspect(record.id);
          if (!saved) throw agentErrors.session_unknown("归属索引在枚举时消失");
          result.push(saved);
        }
        cursor = page.cursor;
      } while (cursor);
      return result;
    },
    assertIdle(id) { const held = gate(id); if (held.busy || held.starting) throw agentErrors.session_busy("会话正在准备执行或处理原决定，不能取得静止预览"); },
    async starting(id, work) {
      const current = capture(id), held = gate(id); held.starting++;
      try {
        if (held.busy) throw unavailable();
        const saved = await read(id);
        if (!saved) throw agentErrors.session_unknown("找不到原会话归属");
        const admitted = () => { current(); admission.check(id); };
        admitted(); return await work(admitted);
      }
      finally { held.starting--; }
    },
    async lifecycle(id, work, mutation) {
      const held = gate(id);
      if (held.busy || held.starting) throw agentErrors.session_busy("会话正在提交任务或处理生命周期，请完成原操作后重试");
      held.busy = true;
      try { return await serialize(id, async () => {
        const index = await inspect(id);
        if (!index) throw agentErrors.session_unknown("找不到原会话归属，缺失不能证明清除完成");
        if (mutation) admission.lifecycle(id, mutation);
        return work(index, value => write(value, true));
      }); }
      finally { held.busy = false; }
    },
  };
}

/** The existing project hold and exact purge permission share one owner; permissions never escape their callback. */
function projectAdmission(pending: ((project: string, session?: string) => boolean) | undefined, busy: (id: string) => boolean) {
  const projects = new Map<string, string>(), creating = new Map<string, number>();
  const heldProjects = new Set<string>(), heldSessions = new Set<string>();
  const purges = new AsyncLocalStorage<{ id: string; operation_id: string; current(): void }>();
  const denied = () => agentErrors.session_busy("项目正在清理，不能开始新工作或改变原会话决定");
  const open = (project: string | undefined, id?: string) => {
    if (!project) throw agentErrors.session_unknown("找不到原会话归属");
    if (heldProjects.has(project) || pending?.(project, id) || id && heldSessions.has(id)) throw denied();
  };
  return {
    remember: (id: string, project: string) => { projects.set(id, project); },
    check: (id: string) => open(projects.get(id), id),
    lifecycle(id: string, mutation: LifecycleMutation) {
      const original = purges.getStore();
      if (mutation.action === "purge" && original?.id === id && original.operation_id === mutation.operation_id) { original.current(); return; }
      open(projects.get(id), id);
    },
    async creating<T>(project: string, work: (current: () => void) => Promise<T>) {
      const current = () => open(project); current();
      creating.set(project, (creating.get(project) ?? 0) + 1);
      try { return await work(current); }
      finally { const left = creating.get(project)! - 1; if (left) creating.set(project, left); else creating.delete(project); }
    },
    async holdSession<T>(id: string, operation_id: string, work: () => Promise<T>) {
      const original = purges.getStore();
      // Only the enclosing hold's exact grant can be reused, never just its project or owner.
      if (original?.id === id && original.operation_id === operation_id) { original.current(); return work(); }
      if (heldSessions.has(id) || busy(id)) throw denied();
      const project = projects.get(id);
      if (project) open(project, id);
      heldSessions.add(id);
      let active = true;
      const current = () => {
        const owner = projects.get(id);
        if (!active || !heldSessions.has(id) || owner && (heldProjects.has(owner) || pending?.(owner, id))) throw denied();
      };
      try { return await purges.run({ id, operation_id, current }, work); }
      finally { active = false; heldSessions.delete(id); }
    },
    async hold<T>(project: string, associated: readonly string[], work: (hold: ProjectHold) => Promise<T>) {
      if (heldProjects.has(project) || creating.get(project) || associated.some(id => heldSessions.has(id))
        || [...projects].some(([id, owner]) => (owner === project || associated.includes(id)) && busy(id))) throw denied();
      const sessions = new Set(associated);
      heldProjects.add(project); for (const id of sessions) heldSessions.add(id);
      let active = true;
      const include = (ids: readonly string[]) => {
        if (!active || ids.some(id => !sessions.has(id) && (heldSessions.has(id) || busy(id)))) throw denied();
        for (const id of ids) { sessions.add(id); heldSessions.add(id); }
      };
      const purge: ProjectPurge = (id, operation_id, run) => {
        const current = () => { if (!active || !sessions.has(id)) throw denied(); };
        current(); return purges.run({ id, operation_id, current }, run);
      };
      try { return await work({ include, purge }); }
      finally { active = false; heldProjects.delete(project); for (const id of sessions) heldSessions.delete(id); }
    },
  };
}
