import { isDeepStrictEqual } from "node:util";
import type { Runtime } from "@prologue/sdk";
import type { AgentSessionDecision, AgentSessionLifecycle, AgentSessionLifecycleReceipt, AgentSessionLifecycleView, AgentSessionOwner, AgentSessionPurgePreview, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { agentErrors } from "../errors.js";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";
import type { PrologueEffects } from "./prologue-effects.js";
import { unclaimedWork } from "./prologue-recovery.js";

interface LifecycleDeps {
  runtime: Runtime;
  index: SessionIndexStore;
  effects: PrologueEffects;
  checkpointBusy(session: AgentSessionRef): boolean;
  backgroundBusy(sessionId: string): Promise<boolean>;
  cleanup(sessionId: string, owner: AgentSessionOwner, purge: boolean, runIds: readonly string[]): Promise<void>;
}

const conflict = () => agentErrors.session_busy("会话或原决定已变化，请核对当前状态；不会重放旧决定");
const sameOwner = (a: AgentSessionOwner, b: AgentSessionOwner) => ["project_id", "plugin_id", "install_id", "actor_id"].every(key => a[key as keyof AgentSessionOwner] === b[key as keyof AgentSessionOwner]);

/** Session lifecycle is SDK-owned; the App index only binds its original decision and cleanup phases. */
export function createSessionLifecycle(deps: LifecycleDeps): AgentSessionLifecycle {
  const owned = (index: SessionIndex, session: AgentSessionRef, owner: AgentSessionOwner) => {
    if (session.runtime_id !== "prologue" || index.ref.id !== session.session_id || !sameOwner(index.owner, owner)
      || !Object.values(owner).every(value => typeof value === "string" && value.length)) throw agentErrors.session_unknown("当前身份不能管理这条会话");
  };
  const quiet = async (index: SessionIndex, session: AgentSessionRef) => {
    if (deps.checkpointBusy(session)) throw conflict();
    const opened = await deps.runtime.sessions.open(index.ref);
    if (!opened) throw agentErrors.session_unknown("原会话不可读，不能推断已经结束");
    const report = opened.state === "active" ? await deps.runtime.sessions.inspectRecovery(index.ref) : undefined;
    const open = await deps.runtime.listOpenWork();
    // Admission excludes a live prepared start. A historical intent remains intact when the complete SDK ledger
    // proves it made no unclaimed work, using the same evidence as history/recovery.
    const terminal = await opened.terminalRuns();
    if (report?.runs.length || open.unavailable.length || unclaimedWork(index, terminal, open) || open.items.some(item => item.origin.session === session.session_id)
      || deps.runtime.subagents.list().some(child => child.parentSession.id === session.session_id && !["completed", "failed", "cancelled"].includes(child.state))
      || await deps.backgroundBusy(session.session_id)) throw agentErrors.session_busy("会话仍有进行中、暂停或待核对工作，请先通过原入口处理");
  };
  const canonical = async (index: SessionIndex) => {
    const session = await deps.runtime.sessions.open(index.ref);
    if (!session) throw agentErrors.session_unknown("SDK 会话不可读取，缺失不能证明原决定已完成");
    const preview = await session.previewPurge();
    if (session.state !== "active" && session.state !== "archived") throw conflict();
    return { session, preview, state: session.state };
  };
  const request = (session: AgentSessionRef, owner: AgentSessionOwner) => ({ session: structuredClone(session), owner: structuredClone(owner) });
  const validate = (decision: AgentSessionDecision) => {
    if (typeof decision.operation_id !== "string" || !decision.operation_id.trim() || decision.operation_id.length > 200
      || !Number.isSafeInteger(decision.expected_version) || decision.expected_version < 1 || !["active", "archived"].includes(decision.expected_state)) throw conflict();
  };
  const change = async (sessionInput: AgentSessionRef, ownerInput: AgentSessionOwner, decisionInput: AgentSessionDecision,
    action: "archive" | "unarchive" | "purge", submitted?: AgentSessionPurgePreview): Promise<AgentSessionLifecycleReceipt> => {
    const { session, owner } = request(sessionInput, ownerInput), decision = structuredClone(decisionInput), preview = submitted && structuredClone(submitted);
    validate(decision);
    const mutation = { action, operation_id: decision.operation_id };
    return deps.index.lifecycle(session.session_id, (index, save) => deps.effects.admit(() => deps.index.assertLifecycle(session.session_id, mutation), async () => {
      owned(index, session, owner); await deps.effects.beforeEffect(); deps.effects.assertCurrent();
      let held = index.lifecycle;
      const same = held?.action === action && isDeepStrictEqual(held.decision, decision)
        && (action !== "purge" || held.preview !== undefined && preview?.session.session_id === session.session_id && preview.session.runtime_id === session.runtime_id
          && preview.version === held.preview?.atVersion && preview.state === decision.expected_state && preview.runs === held.preview.runs
          && preview.resources === held.preview.resources && preview.destroys_key === held.preview.destroysKey);
      if (held && (held.phase !== "complete" || held.decision.operation_id === decision.operation_id || held.action === "purge")) {
        if (!same) throw conflict();
        if (held.phase === "complete") {
          if (!held.receipt) throw conflict();
          if (action !== "purge") { const now = await canonical(index); if (now.state !== held.receipt.state || now.preview.atVersion !== held.receipt.version) throw conflict(); }
          deps.effects.assertCurrent(); return structuredClone(held.receipt);
        }
      } else {
        await quiet(index, session);
        const now = await canonical(index);
        if (now.state !== decision.expected_state || now.preview.atVersion !== decision.expected_version) throw conflict();
        if (action === "purge" && (!preview || !isDeepStrictEqual(preview, { session, version: now.preview.atVersion, state: now.state,
          runs: now.preview.runs, resources: now.preview.resources, destroys_key: now.preview.destroysKey }))) throw conflict();
        if (action !== "purge" && now.state === (action === "archive" ? "archived" : "active")) throw conflict();
        held = { action, decision, phase: "prepared", ...(action === "purge" ? { preview: now.preview } : {}) };
        index.lifecycle = held; await save(index);
      }
      if (!held) throw conflict();
      if (held.phase === "prepared") {
        // The start admission is closed for this whole decision. A retry resumes only its persisted original.
        await deps.cleanup(session.session_id, owner, action === "purge", index.attempts.flatMap(attempt => attempt.run_id ? [attempt.run_id] : []));
        if (action === "purge") {
          if (!held.preview) throw conflict();
          const receipt = await deps.runtime.sessions.purge(held.preview);
          held.receipt = { scope: "agent-host-session", session, operation_id: decision.operation_id, action, state: receipt.state, version: receipt.version };
        } else {
          const now = await canonical(index), target = action === "archive" ? "archived" : "active";
          if (now.preview.atVersion === decision.expected_version && now.state === decision.expected_state) {
            if (action === "archive") await now.session.archive(); else await now.session.restore();
          } else if (now.state !== target || now.preview.atVersion !== decision.expected_version + 1) throw conflict();
          const after = await canonical(index);
          if (after.state !== target || after.preview.atVersion !== decision.expected_version + 1) throw conflict();
          held.receipt = { scope: "agent-host-session", session, operation_id: decision.operation_id, action, state: target, version: after.preview.atVersion };
        }
        held.phase = "sdk-complete"; await save(index);
      }
      if (!held.receipt) throw conflict();
      if (action === "purge") {
        // One overwrite removes original inputs, frozen intent, reviews, rewinds and every other body-bearing field.
        index = { schema: 1, ref: index.ref, owner: index.owner, title: "", attempts: [], lifecycle: held };
      }
      held.phase = "complete"; await save(index);
      deps.effects.assertCurrent(); return structuredClone(held.receipt);
    }), mutation);
  };
  return {
    async read(sessionInput, ownerInput) {
      const { session, owner } = request(sessionInput, ownerInput);
      // The SDK state and revision must be read under the same admission as lifecycle commands.
      // This callback never saves: pending decisions remain inspectable without resuming them.
      return deps.index.lifecycle<AgentSessionLifecycleView>(session.session_id, async index => {
        const current = deps.index.capture(session.session_id, true);
        owned(index, session, owner);
        const held = index.lifecycle, operation = held && structuredClone({ action: held.action, decision: held.decision,
          completed: held.phase === "complete",
          ...(held.action === "purge" && held.preview ? { preview: { session, version: held.preview.atVersion, state: held.decision.expected_state,
            runs: held.preview.runs, resources: held.preview.resources, destroys_key: held.preview.destroysKey } } : {}),
          ...(held.phase === "complete" && held.receipt ? { receipt: held.receipt } : {}),
        });
        current();
        if (held?.receipt?.state === "purged") return { session, state: "purged", version: held.receipt.version, ...(operation ? { operation } : {}) };
        const opened = await deps.runtime.sessions.open(index.ref);
        current();
        if (!opened) return { session, state: "unknown", version: null, ...(operation ? { operation } : {}) };
        const preview = await opened.previewPurge();
        current();
        return { session, state: opened.state === "archived" ? "archived" : "active", version: preview.atVersion, ...(operation ? { operation } : {}) };
      });
    },
    async previewPurge(sessionInput, ownerInput) {
      const { session, owner } = request(sessionInput, ownerInput);
      deps.index.assertIdle(session.session_id);
      const current = deps.index.capture(session.session_id), index = await deps.index.read(session.session_id);
      if (!index) throw agentErrors.session_unknown("找不到原会话归属");
      owned(index, session, owner);
      if (index.lifecycle && (index.lifecycle.phase !== "complete" || index.lifecycle.action === "purge")) throw conflict();
      await quiet(index, session); const now = await canonical(index);
      current(); deps.index.assertIdle(session.session_id);
      return { session, version: now.preview.atVersion, state: now.state, runs: now.preview.runs, resources: now.preview.resources, destroys_key: now.preview.destroysKey };
    },
    archive: (session, decision, owner) => change(session, owner, decision, "archive"),
    unarchive: (session, decision, owner) => change(session, owner, decision, "unarchive"),
    purge: (session, decision, preview, owner) => change(session, owner, decision, "purge", preview),
  };
}
