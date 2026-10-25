import { isDeepStrictEqual } from "node:util";
import type { Runtime } from "@prologue/sdk";
import type { AgentSessionDecision, AgentSessionLifecycle, AgentSessionLifecycleReceipt, AgentSessionLifecycleView, AgentSessionOwner, AgentSessionPurgePreparation, AgentSessionPurgePreview, AgentSessionRef } from "@molis-ai/molis-work-contracts/services/agent-host";
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
const owned = (index: SessionIndex, session: AgentSessionRef, owner: AgentSessionOwner) => {
  if (session.runtime_id !== "prologue" || index.ref.id !== session.session_id || !sameOwner(index.owner, owner)
    || !Object.values(owner).every(value => typeof value === "string" && value.length)) throw agentErrors.session_unknown("当前身份不能管理这条会话");
};
const validate = (decision: AgentSessionDecision) => {
  if (typeof decision.operation_id !== "string" || !decision.operation_id.trim() || decision.operation_id.length > 200
    || !Number.isSafeInteger(decision.expected_version) || decision.expected_version < 1 || !["active", "archived"].includes(decision.expected_state)) throw conflict();
};

/** Session lifecycle is SDK-owned; the App index only binds its original decision and cleanup phases. */
export function createSessionLifecycle(deps: LifecycleDeps): AgentSessionLifecycle {
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
  const change = async (sessionInput: AgentSessionRef, ownerInput: AgentSessionOwner, decisionInput: AgentSessionDecision,
    action: "archive" | "unarchive" | "purge", submitted?: AgentSessionPurgePreview, prepareOnly = false): Promise<AgentSessionLifecycleReceipt | AgentSessionPurgePreparation> => {
    const { session, owner } = request(sessionInput, ownerInput), decision = structuredClone(decisionInput), preview = submitted && structuredClone(submitted);
    validate(decision);
    const mutation = { action, operation_id: decision.operation_id };
    const execute = () => deps.index.lifecycle(session.session_id, (index, save) => deps.effects.admit(() => deps.index.assertLifecycle(session.session_id, mutation), async () => {
      owned(index, session, owner); await deps.effects.beforeEffect(); deps.effects.assertCurrent();
      let held = index.lifecycle;
      const same = held?.action === action && isDeepStrictEqual(held.decision, decision)
        && (action !== "purge" || held.preview !== undefined && preview?.session.session_id === session.session_id && preview.session.runtime_id === session.runtime_id
          && preview.version === held.preview?.atVersion && preview.state === decision.expected_state && preview.runs === held.preview.runs
          && preview.resources === held.preview.resources && preview.destroys_key === held.preview.destroysKey);
      if (held && (held.phase !== "complete" || held.decision.operation_id === decision.operation_id || held.action === "purge")) {
        if (!same) throw conflict();
        if (held.phase === "complete") {
          if (prepareOnly) throw conflict();
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
      if (prepareOnly) {
        if (held.phase !== "prepared" || !preview) throw conflict();
        deps.effects.assertCurrent();
        return { session, session_ref: { kind: "session" as const, id: index.ref.id, revision: 1 as const }, decision, preview };
      }
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
    return action === "purge" ? deps.index.holdSession(session.session_id, decision.operation_id, execute) : execute();
  };
  const complete = async (...args: Parameters<typeof change>): Promise<AgentSessionLifecycleReceipt> => {
    const result = await change(...args);
    if (!("scope" in result)) throw conflict();
    return result;
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
    async preparePurge(session, decision, preview, owner) {
      const result = await change(session, owner, decision, "purge", preview, true);
      if (!("session_ref" in result)) throw conflict();
      return result;
    },
    purgeWaits: (...args) => purgeWaitPage(deps, ...args),
    archive: (session, decision, owner) => complete(session, owner, decision, "archive"),
    unarchive: (session, decision, owner) => complete(session, owner, decision, "unarchive"),
    purge: (session, decision, preview, owner) => complete(session, owner, decision, "purge", preview),
  };
}

/** The prepared Session's historical wait inventory is independent of its current collaboration view. */
async function purgeWaitPage(deps: LifecycleDeps, ...input: Parameters<AgentSessionLifecycle["purgeWaits"]>) {
  const [session, decision, page, owner] = structuredClone(input);
  validate(decision);
  if (!Number.isInteger(page.limit) || page.limit < 1 || page.limit > 200) throw conflict();
  return deps.index.holdSession(session.session_id, decision.operation_id, () => deps.index.lifecycle(session.session_id, async index => {
    owned(index, session, owner);
    if (index.lifecycle?.action !== "purge" || index.lifecycle.phase !== "prepared" || !isDeepStrictEqual(index.lifecycle.decision, decision)) throw conflict();
    const captured = deps.index.capture(session.session_id, true);
    const current = () => { captured(); deps.index.assertLifecycle(session.session_id, { action: "purge", operation_id: decision.operation_id }); };
    await deps.effects.beforeEffect(); deps.effects.assertCurrent(); current();
    let after: string | undefined;
    if (page.cursor !== undefined) {
      if (typeof page.cursor !== "string" || !page.cursor || page.cursor.length > 4096) throw conflict();
      try {
        const value = JSON.parse(Buffer.from(page.cursor, "base64url").toString("utf8"));
        if (!isDeepStrictEqual(Object.keys(value).sort(), ["after", "decision", "session"]) || !isDeepStrictEqual(value.session, session)
          || !isDeepStrictEqual(value.decision, decision) || typeof value.after !== "string" || !value.after) throw conflict();
        after = value.after;
      } catch { throw conflict(); }
    }
    const all = deps.runtime.waits.list({ session: index.ref.id }).map(wait => wait.ref.id).sort();
    if (after !== undefined && !all.includes(after)) throw conflict();
    const start = after === undefined ? 0 : all.indexOf(after) + 1, wait_ids = all.slice(start, start + page.limit), exhausted = start + wait_ids.length === all.length;
    deps.effects.assertCurrent(); current();
    return { session, operation_id: decision.operation_id, wait_ids, exhausted,
      ...(!exhausted ? { cursor: Buffer.from(JSON.stringify({ session, decision, after: wait_ids.at(-1) })).toString("base64url") } : {}) };
  }, { action: "purge", operation_id: decision.operation_id }));
}
