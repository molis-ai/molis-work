import { isDeepStrictEqual } from "node:util";
import type { PurgePreview, SessionPurgeReceipt } from "@prologue/sdk";
import type { AgentSessionDecision, AgentSessionLifecycleReceipt, AgentSessionOwner, AgentSessionPurgePreparation, AgentSessionPurgePreview, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { SessionIndex } from "./prologue-session-index.js";

export interface PrologueSessionPurgeTarget {
  readonly session: AgentSessionRef;
  readonly owner: AgentSessionOwner;
  readonly decision: AgentSessionDecision;
  readonly preview: AgentSessionPurgePreview;
}

export const sessionConflict = () => agentErrors.session_busy("会话或原决定已变化，请核对当前状态；不会重放旧决定");
export function assertSessionOwner(index: SessionIndex, session: AgentSessionRef, owner: AgentSessionOwner): void {
  const keys = ["project_id", "plugin_id", "install_id", "actor_id"] as const;
  if (session.runtime_id !== "prologue" || index.ref.id !== session.session_id
    || !keys.every(key => typeof owner[key] === "string" && owner[key].trim() && index.owner[key] === owner[key]))
    throw agentErrors.session_unknown("当前身份不能管理这条会话");
}
export function validateSessionDecision(decision: AgentSessionDecision): void {
  if (typeof decision.operation_id !== "string" || !decision.operation_id.trim() || decision.operation_id.length > 200
    || !Number.isSafeInteger(decision.expected_version) || decision.expected_version < 1 || !["active", "archived"].includes(decision.expected_state)) throw sessionConflict();
}
export function sessionPurgePreview(target: PrologueSessionPurgeTarget): PurgePreview {
  const { session, decision, preview } = target;
  validateSessionDecision(decision);
  if (session.runtime_id !== "prologue" || typeof session.session_id !== "string" || !session.session_id
    || !isDeepStrictEqual(preview.session, session) || preview.version !== decision.expected_version || preview.state !== decision.expected_state
    || preview.destroys_key !== true || ![preview.runs, preview.resources].every(n => Number.isSafeInteger(n) && n >= 0)) throw sessionConflict();
  return { sessionRef: { kind: "session", id: session.session_id, revision: 1 }, atVersion: preview.version,
    runs: preview.runs, resources: preview.resources, destroysKey: preview.destroys_key };
}

/** Matches the original persisted tuple before any external work or retry. */
export function originalSessionPurge(index: SessionIndex, target: PrologueSessionPurgeTarget): SessionIndex["lifecycle"] {
  assertSessionOwner(index, target.session, target.owner);
  const preview = sessionPurgePreview(target), held = index.lifecycle;
  if (!held || held.phase === "complete" && held.action !== "purge" && held.decision.operation_id !== target.decision.operation_id) return undefined;
  if (held.action !== "purge" || !isDeepStrictEqual(held.decision, target.decision) || !isDeepStrictEqual(held.preview, preview)) throw sessionConflict();
  return held;
}

interface SessionPurgeExecution {
  /** Actual online quiet/canonical check, or the cold SDK canonical inspection. */
  preview(index: SessionIndex): Promise<{ preview: PurgePreview; state: "active" | "archived" }>;
  /** Online live cleanup plus Runtime purge, or the fixed SDK maintenance purge. */
  purge(index: SessionIndex, preview: PurgePreview): Promise<SessionPurgeReceipt>;
  current(): void;
}

/** Shared original decision and durable phases; caller owns the existing exact hold and Index lane. */
export async function purgeIndexedSession(index: SessionIndex, save: (value: SessionIndex) => Promise<void>,
  target: PrologueSessionPurgeTarget, execution: SessionPurgeExecution, prepareOnly = false): Promise<AgentSessionLifecycleReceipt | AgentSessionPurgePreparation> {
  execution.current();
  const preview = sessionPurgePreview(target);
  let held = originalSessionPurge(index, target);
  if (held?.phase === "complete") {
    if (prepareOnly || !held.receipt) throw sessionConflict();
    execution.current(); return { scope: "agent-host-session", session: { runtime_id: "prologue", session_id: index.ref.id },
      operation_id: target.decision.operation_id, action: "purge", state: "purged", version: held.receipt.version };
  }
  if (!held) {
    const now = await execution.preview(index);
    execution.current();
    if (now.state !== target.decision.expected_state || !isDeepStrictEqual(now.preview, preview)) throw sessionConflict();
    held = { action: "purge", decision: structuredClone(target.decision), phase: "prepared", preview };
    index.lifecycle = held; await save(index); execution.current();
  }
  if (prepareOnly) {
    if (held.phase !== "prepared") throw sessionConflict();
    execution.current();
    return { session: structuredClone(target.session), session_ref: { kind: "session", id: index.ref.id, revision: 1 }, decision: structuredClone(target.decision), preview: structuredClone(target.preview) };
  }
  if (held.phase === "prepared") {
    const receipt = await execution.purge(index, preview);
    execution.current();
    held.receipt = { scope: "agent-host-session", session: structuredClone(target.session), operation_id: target.decision.operation_id,
      action: "purge", state: receipt.state, version: receipt.version };
    held.phase = "sdk-complete"; await save(index); execution.current();
  }
  if (!held.receipt) throw sessionConflict();
  // Only declared stable facts survive. Unknown nested properties may also contain old body text.
  const { owner, decision } = target, receipt = held.receipt;
  const minimal: SessionIndex = { schema: 1, ref: { kind: "session", id: index.ref.id, revision: 1 },
    owner: { project_id: owner.project_id, plugin_id: owner.plugin_id, install_id: owner.install_id, actor_id: owner.actor_id }, title: "", attempts: [],
    lifecycle: { action: "purge", phase: "complete", decision: { operation_id: decision.operation_id, expected_version: decision.expected_version, expected_state: decision.expected_state },
      preview, receipt: { scope: "agent-host-session", session: { runtime_id: "prologue", session_id: index.ref.id },
        operation_id: decision.operation_id, action: "purge", state: "purged", version: receipt.version } } };
  execution.current(); await save(minimal); execution.current();
  return structuredClone(minimal.lifecycle!.receipt!);
}
