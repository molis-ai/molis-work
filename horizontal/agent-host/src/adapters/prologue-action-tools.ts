import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_TOOL_LIMITS, type ScenarioPack, type ToolRunner } from "@prologue/sdk";
import { ActionError, actionEffect, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentFrozenRole, AgentRunOffer } from "@molis-ai/molis-work-contracts/services/agent-host";
import { GATEWAY_TOOLS, normalizedInput, offerWords } from "./prologue-action-gateway.js";

export const agentActionToolName = (ref: ExactActionReference, scope: string) => "molis-action-" + scope + "-" + createHash("sha256")
  .update(JSON.stringify([ref.capability_id, ref.version, ref.provider_id])).digest("hex").slice(0, 24);
/** A run's action tools by the name the model calls them: the naming above, for the actions it froze under its scope. */
export const actionToolRefs = (refs: readonly ExactActionReference[], scope: string): ReadonlyMap<string, ExactActionReference> =>
  new Map(refs.map(ref => [agentActionToolName(ref, scope), { capability_id: ref.capability_id, version: ref.version, provider_id: ref.provider_id }]));

/** The host tool a role grants to suggest: its tool is the round's own (below), not a Prologue system tool. */
export const SUGGEST_HOST_TOOL = GATEWAY_TOOLS.suggest;
/**
 * The name of a round's own suggest tool, one per pack: it records, runs nothing, and is let through without a review
 * (prologue-taskboard.ts), so it must never share the `molis-action-` prefix every action asks under.
 */
export const SUGGEST_TOOL_PREFIX = "molis-suggest-";
/** Below the SDK's tool observation limit (64 KiB), so a recorded suggestion is never truncated. */
const SUGGEST_RESULT_BYTES = 32 * 1024;

/**
 * SDK session-scoped callbacks; declarations are a projection of the authorized action directory. With `suggest`, one
 * more tool offers the person one of these same actions as a button: only an action frozen here, checked as it is now.
 */
export function prologueActionTools(actions: AgentFrozenRole["actions"], timeoutMs = DEFAULT_TOOL_LIMITS.maxTimeoutMs, runSignal?: AbortSignal, suggest = false) {
  const tools = [...(actions?.tools ?? [])].sort((a, b) => JSON.stringify([a.capability_id, a.version, a.provider.provider_id])
    .localeCompare(JSON.stringify([b.capability_id, b.version, b.provider.provider_id])));
  // A pack owns its tool names in the SDK's shared catalog. Overlapping choices
  // need distinct names, while reordering or rebinding the same choice reuses it.
  const scope = createHash("sha256").update(JSON.stringify({ timeoutMs, tools: tools.map(view => ({
    capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id, operation: view.operation, action: view.action,
  })) })).digest("hex").slice(0, 24);
  const executors: Record<string, ToolRunner> = {};
  const contributions = tools.map(view => {
    const reference = { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id };
    const name = agentActionToolName(reference, scope);
    const wrapped = view.action.input_schema.type !== "object";
    executors[name] = async call => {
      const abort = new AbortController();
      const stop = () => abort.abort(new ActionError("actions.cancelled", "Agent action cancelled"));
      const unsubscribe = call.abort?.subscribe(stop);
      call.signal?.addEventListener("abort", stop, { once: true });
      runSignal?.addEventListener("abort", stop, { once: true });
      if (runSignal?.aborted || call.signal?.aborted || call.abort?.requested()) stop();
      try {
        abort.signal.throwIfAborted();
        await currentAction(actions!, view);
        abort.signal.throwIfAborted();
        const result = await actions!.client.invoke(reference, wrapped ? call.args.input : call.args, abort.signal);
        abort.signal.throwIfAborted();
        return JSON.stringify(result) ?? "null";
      } finally { unsubscribe?.(); call.signal?.removeEventListener("abort", stop); runSignal?.removeEventListener("abort", stop); }
    };
    // Provider and effect lead the description: the name is a hash, and deferred tools are found by searching this text.
    const effect = actionEffect(view.action, view.capability_id);
    const label = `${view.provider.title} · ${effect === "read" ? "读取" : effect === "irreversible" ? "不可撤回" : "修改"} · ${view.action.title}`;
    return { executor: name, registration: { name, version: String(view.version), description: label + "\n" + view.action.description,
      // A copy: the directory's declarations are frozen, and the runtime owns what it is handed.
      parameters: wrapped ? { type: "object", properties: { input: structuredClone(view.action.input_schema) }, required: ["input"], additionalProperties: false } : structuredClone(view.action.input_schema),
      // A read only when both say so: the runtime may start a read before the model has finished speaking.
      effectKind: view.operation === "query" && effect === "read" ? "safe-read" as const : "mutate-external" as const,
      gate: "broker" as const, timeoutMs: Math.min(timeoutMs, view.action.execution?.timeout_ms ?? timeoutMs), idempotency: "none" as const } };
  });
  if (suggest && tools.length) contributions.push(suggestTool(actions!, new Map(contributions.map((row, index) => [row.registration.name, tools[index]!])), scope, executors, runSignal));
  const names = contributions.map(item => item.registration.name);
  const pack: ScenarioPack = { id: "molis-actions-" + scope,
    version: "1.0.0", source: { kind: "app-embedded" }, needs: { hostCapabilities: [], executors: names },
    permissions: { tools: names, network: [], paths: [] }, memory: { scope: "session", write: "deny" },
    roster: [{ role: "action-user", skills: [], writes: contributions.some(row => row.registration.effectKind !== "safe-read") }],
    planning: { plannedBy: "action-user", planFirst: false }, config: {}, tools: contributions };
  return { pack, executors, names, scope };
}

/** The current view of a frozen action, or why it may not be used now: gone, not for agents, switched off, or changed since the round froze it. */
async function currentAction(actions: NonNullable<AgentFrozenRole["actions"]>, view: ActionView): Promise<ActionView> {
  const current = (await actions.client.discover()).find(row => row.capability_id === view.capability_id && row.version === view.version && row.provider.provider_id === view.provider.provider_id);
  if (!current || !current.action.audiences.includes("agent")) throw new ActionError("actions.missing", "The original Agent action is no longer accessible");
  if (!current.availability.available) throw new ActionError(current.availability.code, current.availability.reason);
  if (!isDeepStrictEqual(current.action, view.action) || current.operation !== view.operation) throw new ActionError("actions.definition_changed", "The action contract changed; start a new run with its current version");
  return current;
}

/** The round's suggest tool: names one of its own action tools, records the suggestion in its result, runs nothing. */
function suggestTool(actions: NonNullable<AgentFrozenRole["actions"]>, byName: ReadonlyMap<string, ActionView>, scope: string,
  executors: Record<string, ToolRunner>, runSignal?: AbortSignal) {
  const name = SUGGEST_TOOL_PREFIX + scope;
  executors[name] = async call => {
    if (runSignal?.aborted || call.signal?.aborted || call.abort?.requested()) throw new ActionError("actions.cancelled", "Agent action cancelled");
    const args = (call.args ?? {}) as Record<string, unknown>;
    const view = typeof args.action === "string" ? byName.get(args.action) : undefined;
    // Exactly the actions this round was given: a suggestion cannot reach for anything else (specs/ai-interaction-experience D25).
    if (!view) throw new ActionError("actions.forbidden", "Only one of this round's own action tools can be suggested; nothing was suggested.");
    const current = await currentAction(actions, view);
    const reference = { capability_id: current.capability_id, version: current.version, provider_id: current.provider.provider_id };
    const input = normalizedInput(current, args.input);
    await actions.client.check?.(reference, input);
    if (runSignal?.aborted || call.signal?.aborted) throw new ActionError("actions.cancelled", "Agent action cancelled");
    const offer: AgentRunOffer = { offer_id: randomUUID(), offered_at: new Date().toISOString(), ...offerWords(args), reference, input };
    const result = JSON.stringify({ offered: offer.offer_id, offer, note: "Shown to the person as a button; nothing has run. Do not run the same action for this unless they ask you to." });
    // The record travels in this result (prologue-stream.ts reads it back): one the SDK would cut short is refused, never told "shown".
    if (Buffer.byteLength(result) > SUGGEST_RESULT_BYTES) throw new ActionError("actions.input_too_large", `The suggestion is over ${SUGGEST_RESULT_BYTES / 1024} KiB; nothing was suggested.`);
    return result;
  };
  return { executor: name, registration: { name, version: "1",
    description: "Offer the person one of this round's action tools as a button, with its prepared input, when you suggest something they may want done but have not asked you to do. Nothing runs until they click it.",
    parameters: { type: "object", additionalProperties: false, required: ["action", "title", "summary", "input"], properties: {
      action: { type: "string", enum: [...byName.keys()], description: "The name of the action tool to offer." },
      title: { type: "string", description: "The button's words, verb first, at most 40 characters." },
      summary: { type: "string", description: "What clicking does in the person's words: which object, which key values." },
      input: { type: ["object", "array", "string", "number", "boolean", "null"], description: "The full prepared input, exactly as that action tool takes it." },
      editable: { type: "array", items: { type: "string" }, description: "Top-level input fields the person may adjust before running it." },
      missing: { type: "array", items: { type: "object", properties: { field: { type: "string" }, question: { type: "string" } }, required: ["field", "question"] }, description: "Required fields you could not fill, each with the question to ask." },
    } },
    effectKind: "mutate-external" as const, gate: "broker" as const, timeoutMs: 15_000, idempotency: "none" as const } };
}
