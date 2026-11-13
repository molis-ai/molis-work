import type { AgentRoundSkill, AgentRunRef, AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ObservationDetail, ObservationEvidenceInput, ObservationFactInput, ObservationOutcome, ObservationRecorder } from "@molis-ai/molis-work-contracts/services/observation";
import { MOLIS_ACTION_TOOL_PREFIX } from "./prologue-action-tools.js";
import type { PrologueModelConfiguration } from "./prologue-ports.js";
import type { PrologueEvent } from "./prologue-stream.js";
import type { PrologueUsageReceipt } from "../inference.js";

const text = (role: string, body: string, media_type = "text/plain"): ObservationEvidenceInput => ({ role, ref: { kind: "content", media_type, text: body } });
const kept = (role: string): ObservationEvidenceInput => ({ role, ref: { kind: "missing", reason: "by_rule" } });
const count = (value: { source: string; tokens: number | undefined }) => value.source === "unknown" || value.tokens === undefined ? undefined : value.tokens;

function usageDetail(receipt: PrologueUsageReceipt): ObservationDetail {
  const detail: Record<string, number | string> = {};
  for (const [key, value] of [["input_tokens", receipt.input], ["output_tokens", receipt.output], ["cache_read_tokens", receipt.cacheRead], ["cache_write_tokens", receipt.cacheWrite]] as const) {
    const tokens = count(value);
    if (tokens !== undefined) detail[key] = tokens;
  }
  if (receipt.cost.source !== "unknown" && receipt.cost.amount !== undefined && receipt.cost.currency) { detail.cost = receipt.cost.amount; detail.currency = receipt.cost.currency; }
  return detail;
}

/**
 * What one Agent round did, as work records (specs/observation-collection/contract-design.md §4, design §4「各类 AI」): the start with the
 * versions in force and the task, the prompt and Skill bodies it was sent, messages the person added while it ran, each model reply (its text and any reasoning the model
 * reported, folded per model call), the tools it used, usage with its model, compaction, memory recall, guardrails, waits and the end.
 * An action tool's input and result are the action exit's record of the same call; here it is only linked, never stored twice. The full
 * request as assembled for the model is not in the runtime's event stream, so the coverage register lists it as unavailable.
 */
/** What the round was sent at its start, as the Host froze it: the task, each prompt body and each Skill's body. */
export interface RunObservationStart {
  readonly task: string;
  readonly prompts: readonly { readonly prompt_id: string; readonly body: string }[];
  readonly skills: readonly AgentRoundSkill[];
}

export function observeRun(recorder: ObservationRecorder, ref: AgentRunRef, frozen: AgentRunView["frozen"], start: RunObservationStart, model: PrologueModelConfiguration | undefined): (event: PrologueEvent) => void {
  const work = { run_id: ref.run_id }, subjects = [{ kind: "agent_session", id: ref.session_id }];
  const conditions = {
    prompts: frozen.prompts.map(prompt => ({ key: prompt.prompt_id, version: prompt.user_revision === undefined ? prompt.version : `${prompt.version}+${prompt.user_revision}` })),
    skills: frozen.skills.map(skill => ({ id: skill.ref.skill_id, version: skill.ref.version })),
    model: { provider: model?.protocol ?? "unknown", model_id: frozen.model_id },
  };
  // The recorder only queues, but a fault in it must never reach the round it describes.
  const put = (input: ObservationFactInput) => { try { recorder.record(input); } catch { /* counted by nobody: the round goes on unrecorded */ } };
  const record = (fact: string, outcome: ObservationOutcome, more: Omit<ObservationFactInput, "fact" | "outcome" | "work" | "subjects"> = {}) => put({ fact, outcome, work, subjects, ...more });
  const tools = new Map<string, { name: string; input?: Record<string, unknown> }>();
  let reply = "", reasoning = "";
  const flushReply = () => {
    if (!reply && !reasoning) return;
    record("agent.reply", "succeeded", { evidence: [...(reply ? [text("reply", reply)] : []), ...(reasoning ? [text("reasoning", reasoning)] : [])] });
    reply = ""; reasoning = "";
  };
  const end = (outcome: ObservationOutcome, detail: ObservationDetail = {}) => { flushReply(); record("agent.run", outcome, { stage: "ended", detail }); };

  record("agent.run", "succeeded", { stage: "started", conditions, evidence: [text("task", start.task)],
    detail: { role_id: frozen.role_id, role_version: frozen.role_version, execution: frozen.execution, ...(frozen.history ? { history: frozen.history } : {}) } });
  // The bodies in force are kept here because their owners keep only the current one (D1): what the model was told, not what it says now.
  if (start.prompts.length) record("agent.instructions", "succeeded", { conditions: { prompts: conditions.prompts }, evidence: start.prompts.map(prompt => text(`prompt:${prompt.prompt_id}`, prompt.body)) });
  for (const skill of start.skills) put({ fact: "agent.skill", outcome: "succeeded", stage: "effective", work,
    subjects: [...subjects, { kind: "skill", id: skill.ref.skill_id, version: skill.ref.version }], detail: { origin: skill.origin, named: skill.named }, evidence: [text("body", skill.body)] });
  return event => {
    // The union ends in an open shape for frames this projection does not read, so fields are read by name as the stream defines them.
    const e: Record<string, unknown> = event;
    switch (event.type) {
      case "text-delta": reply += String(e.text ?? ""); return;
      case "reasoning-delta": reasoning += String(e.text ?? ""); return;
      case "prompt": flushReply(); record("agent.prompt", "succeeded", { stage: String(e.role), evidence: [text(e.role === "system" ? "system_prompt" : "message", String(e.text ?? ""))],
        ...(e.source ? { detail: { source: String(e.source) } } : {}) }); return;
      case "tool-call": { flushReply(); const call = e.call as { id: string; name: string; input?: Record<string, unknown> }; tools.set(call.id, call); return; }
      case "tool-result": {
        const call = tools.get(String(e.callId)), name = String(e.name), action = name.startsWith(MOLIS_ACTION_TOOL_PREFIX);
        tools.delete(String(e.callId));
        record("agent.tool", e.outcome === "failed" ? "failed" : "succeeded", { stage: name, detail: { tool_call_id: String(e.callId), ...(e.errorCode ? { code: String(e.errorCode) } : {}) },
          evidence: action ? [kept("input"), kept("result")] : [text("input", JSON.stringify(call?.input ?? {}), "application/json"), text("result", String(e.text ?? ""))] });
        return;
      }
      case "usage-recorded": case "compaction-usage-recorded": flushReply();
        record("agent.usage", "succeeded", { stage: event.type === "usage-recorded" ? "model" : "compaction", conditions: { model: conditions.model }, detail: usageDetail(e.receipt as PrologueUsageReceipt) }); return;
      case "compacted": record("agent.compaction", "succeeded", { detail: e.replaced === undefined ? {} : { replaced: Number(e.replaced) } }); return;
      case "compaction-failed": record("agent.compaction", "failed", { detail: e.why ? { why: String(e.why) } : {} }); return;
      case "compaction-cancelled": record("agent.compaction", "cancelled"); return;
      case "compaction-skipped": record("agent.compaction", "no_action"); return;
      case "memory-recalled": {
        const injected = (e.injected ?? []) as ReadonlyArray<{ id: string; version: number }>, retrieval = e.retrieval as { outcome: string } | undefined;
        put({ fact: "agent.memory", outcome: retrieval && retrieval.outcome !== "ready" && retrieval.outcome !== "none" ? retrieval.outcome === "cancelled" ? "cancelled" : "failed" : "succeeded",
          stage: "recalled", work, subjects: [...subjects, ...injected.map(item => ({ kind: "memory", id: item.id, version: item.version }))],
          detail: { injected: injected.length, omitted: ((e.omitted ?? []) as unknown[]).length, unavailable: ((e.unavailable ?? []) as unknown[]).length, ...(retrieval ? { retrieval: retrieval.outcome } : {}) } });
        return;
      }
      case "tripped": record("agent.guard", e.failed ? "failed" : "refused", { stage: String(e.stage), detail: { rail: String(e.rail), why: String(e.why) } }); return;
      case "circuit-tripped": record("agent.guard", "refused", { stage: "circuit", detail: { ...(e.reason ? { reason: String(e.reason) } : {}), ...(e.count === undefined ? {} : { count: Number(e.count) }) } }); return;
      case "awaiting-approval": flushReply(); record("agent.waiting", "waiting", { stage: "approval", detail: { why: String(e.why) } }); return;
      case "awaiting-input": flushReply(); record("agent.waiting", "waiting", { stage: "input", detail: { kind: String(e.kind), why: String(e.why) } }); return;
      case "retry-waiting": record("agent.retry", "waiting", { detail: { reason: String(e.reason), attempt: Number(e.attempt), wait_ms: Number(e.waitMs) } }); return;
      case "model-switched": { const to = e.to as { protocol: string; model: string };
        record("agent.model", "succeeded", { stage: "switched", conditions: { model: { provider: to.protocol, model_id: to.model } } }); return; }
      case "turn-changes": { const changes = (e.changes ?? []) as ReadonlyArray<{ path: string; digest: string; checkpointId: string }>;
        record("agent.changes", "succeeded", { detail: { files: changes.length },
          evidence: changes.map(change => ({ role: change.path, ref: { kind: "owner", owner: "agent-runtime", id: change.checkpointId, version: change.digest } })) }); return; }
      case "completed": end("succeeded"); return;
      case "failed": { const error = e.error as { code: string } | undefined; end("failed", error ? { code: error.code } : {}); return; }
      case "cancelled": end("cancelled"); return;
      default: return;
    }
  };
}
