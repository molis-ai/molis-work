import type { PrologueEffects } from "./prologue-effects.js";
import { AGENT_INPUT_KEY_PATTERN, type AgentInputsPort } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { projectInputReceipts, type Session, type ExactRef, type Runtime } from "@prologue/sdk";
import type { AgentOriginalInput, AgentOriginalInputDraft, AgentOriginalInputRef, AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { AgentInputOriginal, AgentInputRef } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { SessionIndex, SessionIndexStore } from "./prologue-session-index.js";
import { agentErrors } from "../errors.js";

const invalid = () => agentErrors.capability_unavailable("原始输入身份或正文不一致，不能重建本人来源");
function validate(input: AgentOriginalInputDraft): void {
  if (!input || !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(input.input_id) || typeof input.text !== "string"
    || !input.text.trim() || input.text.length > 100_000 || !["person", "host"].includes(input.written_by)
    || typeof input.occurred_at !== "string" || !Number.isFinite(Date.parse(input.occurred_at))) throw invalid();
}

/** Only the first attempt owns the raw text. References never fall back to an assembled task or a later clock. */
export function originalInputOf(index: SessionIndex, reference: AgentOriginalInputRef | undefined): AgentOriginalInput | undefined {
  if (!reference) return undefined;
  if (reference.session_id !== index.ref.id || reference.version !== 1) throw invalid();
  const stored = index.attempts.find(attempt => attempt.original_input?.ref.input_id === reference.input_id)?.original_input;
  if (!stored || stored.ref.session_id !== reference.session_id || stored.ref.version !== reference.version) throw invalid();
  validate({ ...stored, input_id: stored.ref.input_id });
  return structuredClone(stored);
}

/** The first original owns text/time; its latest accepted direct attempt is only a current-status locator. */
export async function readOriginalInput(store: SessionIndexStore, reference: AgentOriginalInputRef): Promise<{
  original: AgentOriginalInput; accepted_run: AgentRunRef;
} | undefined> {
  const ref = { ...reference };
  if (ref.version !== 1 || typeof ref.session_id !== "string" || typeof ref.input_id !== "string") return undefined;
  const index = await store.read(ref.session_id);
  if (!index) return undefined;
  for (let position = index.attempts.length - 1; position >= 0; position--) {
    const attempt = index.attempts[position]!, linked = attempt.original_input?.ref ?? attempt.original_input_ref;
    if (!attempt.run_id || attempt.refused || attempt.frozen.continued_from
      || linked?.session_id !== ref.session_id || linked.input_id !== ref.input_id || linked.version !== ref.version) continue;
    const original = originalInputOf(index, ref);
    return original ? { original, accepted_run: { session_id: ref.session_id, run_id: attempt.run_id } } : undefined;
  }
  return undefined;
}

/** An exact InputBook location; only its owning Run supplies the receipt/body. */
export type SupplementaryLocation = { state: "withdrawn" }
  | { state: "queued"; input: Extract<AgentInputOriginal, { state: "queued" }>["input"] }
  | { state: "run"; run: AgentRunRef };

/** No history scan: an unsettled direct input can only be found in the single current live Run. */
export async function readSupplementaryInput(reference: AgentInputRef, owner: {
  locate(ref: AgentInputRef): Promise<SupplementaryLocation | undefined>;
  latest(sessionId: string): Promise<AgentRunRef | undefined>;
  read(run: AgentRunRef): Promise<AgentRunView>;
}): Promise<AgentInputOriginal | undefined> {
  const ref = { ...reference };
  if (!ref.session_id || !ref.input_id) return undefined;
  const location = await owner.locate(ref);
  if (location?.state === "withdrawn") return { state: "withdrawn", ref };
  if (location?.state === "queued") return { state: "queued", ref, input: structuredClone(location.input) };
  const run = location?.run ?? await owner.latest(ref.session_id);
  if (!run || run.session_id !== ref.session_id) return undefined;
  const view = await owner.read(run);
  if (!location && !["running", "awaiting-input", "awaiting-review", "compacting"].includes(view.phase)) return undefined;
  const input = view.turns.find(turn => turn.steer?.id === ref.input_id);
  if (!input?.steer) return undefined;
  if (input.steer.state === "withdrawn") return { state: "withdrawn", ref };
  const current = await owner.locate(ref);
  if (current?.state === "withdrawn") return { state: "withdrawn", ref };
  if (current?.state === "queued") return { state: "queued", ref, input: structuredClone(current.input) };
  if (current?.state === "run" && (current.run.session_id !== ref.session_id || current.run.run_id !== run.run_id)
    || location?.state === "run" && !current) return undefined;
  return { state: "run", ref, run: { ...run }, text: input.text, receipt: structuredClone(input.steer) };
}

/** Resolves one start's original in the Session owner before execution; this read does not create a source. */
export async function resolveOriginalInput(store: SessionIndexStore, sessionId: string,
  input: { original_input?: AgentOriginalInputDraft; continued_from?: AgentRunRef }): Promise<AgentOriginalInput | undefined> {
  if (input.original_input && input.continued_from) throw invalid();
  if (!input.original_input && !input.continued_from) return undefined;
  const index = await store.read(sessionId);
  if (!index) throw agentErrors.session_unknown("原输入所属会话不可读取");
  if (input.continued_from) {
    if (input.continued_from.session_id !== sessionId) throw invalid();
    const attempt = index.attempts.find(attempt => attempt.run_id === input.continued_from!.run_id);
    if (!attempt) throw agentErrors.run_unknown("继续的执行不属于当前会话");
    return originalInputOf(index, attempt.original_input?.ref ?? attempt.original_input_ref);
  }
  const draft = input.original_input!; validate(draft);
  const stored = index.attempts.find(attempt => attempt.original_input?.ref.input_id === draft.input_id)?.original_input;
  if (stored) {
    if (stored.text !== draft.text || stored.written_by !== draft.written_by) throw invalid();
    return originalInputOf(index, stored.ref);
  }
  return { ref: { session_id: sessionId, input_id: draft.input_id, version: 1 }, text: draft.text,
    written_by: draft.written_by, occurred_at: draft.occurred_at };
}

/** The existing attempt CAS is the only durable owner; repeated uses retain the exact first record. */
export function recordOriginalInput(index: SessionIndex, attempt: SessionIndex["attempts"][number], input: AgentOriginalInput | undefined): void {
  if (!input) return;
  if (input.ref.session_id !== index.ref.id || input.ref.version !== 1) throw invalid();
  validate({ ...input, input_id: input.ref.input_id });
  const held = index.attempts.find(item => item.original_input?.ref.input_id === input.ref.input_id)?.original_input;
  if (held && (held.text !== input.text || held.written_by !== input.written_by || held.occurred_at !== input.occurred_at)) throw invalid();
  if (held) attempt.original_input_ref = structuredClone(held.ref);
  else attempt.original_input = structuredClone(input);
}

/** Input lookup and opened conversations read the SDK ledger, including a live attempt's committed progress. */
export async function originalRunEvents(session: Session, run: ExactRef<"run">) {
  if ((await session.terminalRuns()).some(one => one.id === run.id)) return session.replay(run);
  try { return await session.readRunProgress(run); }
  catch (error) {
    if ((error as { code?: string })?.code !== "RUN_NOT_REPLAYABLE") throw error;
    return session.replay(run);
  }
}

/** The Session input book owns settled keys; a live Run's durable receipt has not reached that book yet. */
export async function originalInputIdByKey(index: SessionIndex, session: Session, key: string): Promise<string | undefined> {
  const known = (await session.knownInputKeys()).get(key)?.inputId;
  if (known) return known;
  for (const attempt of [...index.attempts].reverse()) {
    if (!attempt.run_id || attempt.refused) continue;
    const events = await originalRunEvents(session, { kind: "run", id: attempt.run_id, revision: 1 });
    const receipt = projectInputReceipts(events).find(one => one.key === key);
    if (receipt) return receipt.steerId;
  }
  return undefined;
}

/** No new queue: the existing Delivery envelope and receiving Session own this accepted Host notification. */
export function sessionNotifier(runtime: Runtime, index: SessionIndexStore, effects: PrologueEffects): NonNullable<AgentInputsPort["notify"]> {
  return (submitted, control) => {
    const input = structuredClone(submitted), owner = { actor_id: control.actor_id, plugin_id: control.plugin_id, install_id: control.install_id, project_id: control.project_id };
    if (!new RegExp(AGENT_INPUT_KEY_PATTERN).test(input.key) || !input.text?.trim() || input.text.length > 24_000) throw agentErrors.input_not_origin("会话通知的键或正文无效");
    return effects.call(control, async () => {
      await effects.beforeEffect(); effects.assertCurrent();
      const [from, to] = await Promise.all([index.read(input.from_session_id), index.read(input.to_session_id)]);
      for (const saved of [from, to]) {
        if (!saved || Object.entries(owner).some(([key, value]) => saved.owner[key as keyof typeof owner] !== value)) throw agentErrors.input_not_origin("通知两端不属于当前调用者的同一安装与项目");
      }
      const [source, target] = await Promise.all([runtime.sessions.open(from!.ref), runtime.sessions.open(to!.ref)]);
      if (source?.state !== "active" || target?.state !== "active") throw agentErrors.input_not_origin("通知的原会话已不可用");
      const now = (await runtime.readClock()).wallTimeMs;
      await effects.beforeEffect(); effects.assertCurrent();
      const envelope = runtime.delivery.receiveInjection({ from: from!.ref, to: to!.ref, body: input.text, idempotencyKey: input.key }, now);
      await runtime.delivery.flush();
      await effects.beforeEffect(); effects.assertCurrent();
      await runtime.acceptInjection({ envelope: envelope.ref, accepted: true });
      await runtime.delivery.flush();
      return { notification_id: envelope.ref.id };
    });
  };
}
