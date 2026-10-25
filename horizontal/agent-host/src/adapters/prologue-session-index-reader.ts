import { createHash } from "node:crypto";
import type { ExactRef } from "@prologue/sdk";
import { agentErrors } from "../errors.js";
import type { PrologueRunTiming } from "./prologue.js";
import type { SessionIndex } from "./prologue-session-index.js";
import type { NodeHost } from "./prologue-node-kit.js";

/** Original App facts only; lifecycle is not the current SDK state or a command to replay. */
export interface PrologueSessionIndexFact {
  readonly sessionRef: ExactRef<"session">;
  readonly owner: { readonly project_id: string; readonly plugin_id: string; readonly install_id: string; readonly actor_id?: string };
  readonly lifecycle?: SessionIndex["lifecycle"];
}
export interface PrologueSessionIndexPage {
  readonly facts: readonly PrologueSessionIndexFact[];
  readonly cursor?: string;
  /** Exhausts this fixed Index kind, not the later SDK/Catalog owner-coverage join. */
  readonly exhausted: boolean;
}

type IndexStorage = Pick<NodeHost["storage"], "get" | "readSecure">;
const changed = () => agentErrors.session_busy("会话归属索引在读取期间变化，不能交付旧事实");
const damaged = () => agentErrors.session_unknown("会话归属索引损坏，不能当作空会话继续");

export function sessionIndexKind(appId: string): string {
  return `molis-agent-index-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`;
}

/** Shared online/offline read. The caller owns its admission lane and any publication barrier. */
export async function readSessionIndex(storage: IndexStorage, kind: string, id: string,
  current?: () => void): Promise<{ value: SessionIndex; version: number } | undefined> {
  current?.();
  const record = await storage.get({ kind, id });
  current?.();
  if (!record || record.tombstoned) return undefined;
  const bytes = await storage.readSecure({ kind, id });
  try {
    current?.();
    const value = decodeSessionIndex(bytes, id);
    const after = await storage.get({ kind, id });
    current?.();
    if (!after || after.version !== record.version || after.tombstoned) throw changed();
    return { value, version: record.version };
  } finally { bytes.fill(0); }
}

function decodeSessionIndex(bytes: Uint8Array, id: string): SessionIndex {
  let value: SessionIndex;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw damaged(); }
  if (!value || value.schema !== 1 || value.ref?.id !== id || value.ref?.kind !== "session" || value.ref.revision !== 1
    || typeof value.title !== "string" || !Array.isArray(value.attempts)
    || ![value.owner?.project_id, value.owner?.plugin_id, value.owner?.install_id].every(v => typeof v === "string" && v.length > 0)
    || value.owner.actor_id !== undefined && (typeof value.owner.actor_id !== "string" || !value.owner.actor_id.trim())) throw damaged();
  if (value.workspace !== undefined && value.workspace !== "required" && value.workspace !== "none" && value.workspace !== "business"
    || value.attempts.some(attempt => !attempt || !attempt.frozen || (attempt.frozen.workspace ?? "required") !== (value.workspace ?? "required")
      || (value.workspace === "none" || value.workspace === "business") && (attempt.root_ref !== undefined || attempt.frozen.directory !== undefined))) {
    throw new Error("会话工作区模式索引不一致，不能猜测执行授权");
  }
  if (value.attempts.some(attempt => attempt.timing !== undefined && !validRunTiming(attempt.timing))) {
    throw new Error("Coding 显示时间索引损坏，不能猜测历史时间");
  }
  if (value.lifecycle !== undefined && !validLifecycle(value)) throw new Error("会话原生命周期决定损坏，不能猜测完成或重做清除");
  return value;
}

/** A single bounded page. Never skip a listed row, and never return a partial page after a failed read. */
export async function inspectSessionIndexPage(storage: Pick<NodeHost["storage"], "get" | "list" | "readSecure">, kind: string,
  input: { readonly limit?: number; readonly cursor?: string }, current: () => void): Promise<PrologueSessionIndexPage> {
  current();
  if (input.limit !== undefined && (!Number.isSafeInteger(input.limit) || input.limit < 1))
    throw agentErrors.capability_unavailable("索引页长必须为正整数");
  const page = await storage.list({ kind, ...input });
  current();
  const facts: PrologueSessionIndexFact[] = [];
  for (const record of page.records) {
    if (record.tombstoned) throw agentErrors.session_unknown("归属索引已成墓碑，不能证明源事实完整");
    const saved = await readSessionIndex(storage, kind, record.id, current);
    current();
    if (!saved) throw agentErrors.session_unknown("归属索引在枚举时消失");
    if (saved.version !== record.version) throw changed();
    facts.push(projectSessionIndex(saved.value));
  }
  // A later row's asynchronous read must not let an earlier row's stale fact escape.
  for (const record of page.records) {
    const after = await storage.get({ kind, id: record.id });
    current();
    if (!after || after.tombstoned || after.version !== record.version) throw changed();
  }
  current();
  return { facts, ...(page.cursor === undefined ? {} : { cursor: page.cursor }), exhausted: page.cursor === undefined };
}

function projectSessionIndex(value: SessionIndex): PrologueSessionIndexFact {
  const { owner, ref, lifecycle } = value;
  const result: PrologueSessionIndexFact = { sessionRef: { kind: ref.kind, id: ref.id, revision: ref.revision },
    owner: { project_id: owner.project_id, plugin_id: owner.plugin_id, install_id: owner.install_id,
      ...(owner.actor_id === undefined ? {} : { actor_id: owner.actor_id }) } };
  if (!lifecycle) return result;
  const { decision, preview, receipt } = lifecycle;
  return { ...result, lifecycle: { action: lifecycle.action, phase: lifecycle.phase,
    decision: { operation_id: decision.operation_id, expected_version: decision.expected_version, expected_state: decision.expected_state },
    ...(preview === undefined ? {} : { preview: { sessionRef: { kind: preview.sessionRef.kind, id: preview.sessionRef.id, revision: preview.sessionRef.revision },
      atVersion: preview.atVersion, runs: preview.runs, resources: preview.resources, destroysKey: preview.destroysKey } }),
    ...(receipt === undefined ? {} : { receipt: { scope: receipt.scope, session: { runtime_id: receipt.session.runtime_id, session_id: receipt.session.session_id },
      operation_id: receipt.operation_id, action: receipt.action, state: receipt.state, version: receipt.version } }) } };
}

function validLifecycle(index: SessionIndex): boolean {
  const held = index.lifecycle!;
  if (!held || !["archive", "unarchive", "purge"].includes(held.action) || !["prepared", "sdk-complete", "complete"].includes(held.phase)) return false;
  const decision = held.decision, preview = held.preview, receipt = held.receipt;
  if (!decision || typeof decision.operation_id !== "string" || !decision.operation_id.trim() || decision.operation_id.length > 200
    || !Number.isSafeInteger(decision.expected_version) || decision.expected_version < 1 || !["active", "archived"].includes(decision.expected_state)) return false;
  if (held.action === "purge" ? !preview || preview.sessionRef?.kind !== "session" || preview.sessionRef.id !== index.ref.id
    || preview.sessionRef.revision !== index.ref.revision || preview.atVersion !== decision.expected_version || preview.destroysKey !== true
    || ![preview.runs, preview.resources].every(value => Number.isSafeInteger(value) && value >= 0) : preview !== undefined) return false;
  if (held.phase === "prepared") return receipt === undefined;
  return receipt?.scope === "agent-host-session" && receipt.session.runtime_id === "prologue" && receipt.session.session_id === index.ref.id
    && receipt.operation_id === decision.operation_id && receipt.action === held.action
    && receipt.state === (held.action === "purge" ? "purged" : held.action === "archive" ? "archived" : "active")
    && receipt.version === decision.expected_version + (held.action === "purge" ? 2 : 1);
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
