import { createHash } from "node:crypto";
import type { ExactRef } from "@prologue/sdk";
import type { AgentReviewReceipt, AgentRunRef, AgentWriteCheckNote } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { PrologueRestoredSession, PrologueRunTiming, PrologueStartInput } from "./prologue.js";
import type { PrologueRewindIntent } from "./prologue-checkpoints.js";
import type { PrologueSubagentRoot } from "./prologue-subagents.js";
import type { NodeHost } from "./prologue-node-kit.js";

/**
 * Each session's Host record beside the SDK's ledger: who owns it, its workspace mode, and the frozen intent of every
 * start (with display times). App provenance is encrypted in the existing Host store; model events and conversation stay
 * solely in Prologue's session ledger.
 */
export interface SessionIndex {
  schema: 1;
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
    memory_context?: { consumer: string; current_scene: string; facts?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory["facts"]; usage?: import("@molis-ai/molis-work-contracts/services/agent-host").AgentRecalledMemory["usage"] };
    /** The round's after-write checks, by the SDK's key for each: which checker answered (prologue-after-write.ts). */
    write_checks?: Record<string, AgentWriteCheckNote> }>;
  rewinds?: PrologueRewindIntent[];
  review_decisions?: Record<string, Pick<AgentReviewReceipt, "status" | "decided_by" | "decided_at" | "note"> & { requested_at?: string; expires_at?: string | null }>;
}

export interface SessionIndexStore {
  save(value: SessionIndex): Promise<void>;
  read(id: string): Promise<SessionIndex | undefined>;
  /** Changes the latest index under the session's own queue. */
  update(id: string, change: (index: SessionIndex) => void): Promise<void>;
}

export function createSessionIndexStore(host: NodeHost, appId: string): SessionIndexStore {
  const indexKind = `molis-agent-index-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`;
  const indexes = new Map<string, { value: SessionIndex; version: number }>();
  const indexUpdates = new Map<string, Promise<void>>();
  const save = async (value: SessionIndex): Promise<void> => {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    try {
      const record = await host.storage.commit({ kind: indexKind, id: value.ref.id,
        expectedVersion: indexes.get(value.ref.id)?.version ?? 0, metadata: { schema: 1 }, secureBody: bytes });
      indexes.set(value.ref.id, { value: structuredClone(value), version: record.version });
    } finally { bytes.fill(0); }
  };
  const read = async (id: string): Promise<SessionIndex | undefined> => {
    const held = indexes.get(id);
    if (held) return structuredClone(held.value);
    const record = await host.storage.get({ kind: indexKind, id });
    if (!record || record.tombstoned) return undefined;
    const bytes = await host.storage.readSecure({ kind: indexKind, id });
    try {
      const value: SessionIndex = JSON.parse(new TextDecoder().decode(bytes));
      if (value.schema !== 1 || value.ref?.id !== id || value.ref?.kind !== "session"
        || typeof value.title !== "string" || !Array.isArray(value.attempts)
        || ![value.owner?.project_id, value.owner?.plugin_id, value.owner?.install_id].every(v => typeof v === "string" && v.length > 0)) {
        throw new Error("Coding 会话归属索引损坏，不能当作空会话继续");
      }
      if (value.workspace !== undefined && value.workspace !== "required" && value.workspace !== "none" && value.workspace !== "business"
        || value.attempts.some(attempt => (attempt.frozen.workspace ?? "required") !== (value.workspace ?? "required")
          || (value.workspace === "none" || value.workspace === "business") && (attempt.root_ref !== undefined || attempt.frozen.directory !== undefined))) {
        throw new Error("会话工作区模式索引不一致，不能猜测执行授权");
      }
      if (value.attempts.some(attempt => attempt.timing !== undefined && !validRunTiming(attempt.timing))) {
        throw new Error("Coding 显示时间索引损坏，不能猜测历史时间");
      }
      indexes.set(id, { value, version: record.version });
      return structuredClone(value);
    } finally { bytes.fill(0); }
  };
  // Start and control may overlap at a terminal boundary. Always update the
  // latest index under the same session queue; an old control closure must not
  // replace later attempts with the snapshot it captured when its run started.
  const update = async (id: string, change: (index: SessionIndex) => void): Promise<void> => {
    const previous = indexUpdates.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      const index = await read(id);
      if (!index) throw new Error("Coding 会话归属索引不可用，不能改变执行记录");
      change(index);
      await save(index);
    });
    indexUpdates.set(id, next);
    try { await next; }
    finally { if (indexUpdates.get(id) === next) indexUpdates.delete(id); }
  };
  return { save, read, update };
}

function validRunTiming(value: unknown): value is PrologueRunTiming {
  if (!value || typeof value !== "object") return false;
  const timing = value as PrologueRunTiming;
  const at = (value: unknown) => value === null || typeof value === "string" && Number.isFinite(Date.parse(value));
  const rows = (value: unknown, key: "turn_id" | "call_id") => {
    if (!Array.isArray(value)) return false;
    const ids = new Set<string>();
    return value.every(item => {
      if (!item || typeof item[key] !== "string" || !item[key] || ids.has(item[key]) || !at(item.at)) return false;
      ids.add(item[key]); return true;
    });
  };
  return at(timing.ended_at) && rows(timing.turns, "turn_id") && rows(timing.activity, "call_id");
}
