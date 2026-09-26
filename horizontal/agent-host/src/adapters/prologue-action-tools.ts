import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { DEFAULT_TOOL_LIMITS, type ScenarioPack, type ToolRunner } from "@prologue/sdk";
import { ActionError, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentFrozenRole } from "@molis-ai/molis-work-contracts/services/agent-host";

export const agentActionToolName = (ref: ExactActionReference, scope: string) => "molis-action-" + scope + "-" + createHash("sha256")
  .update(JSON.stringify([ref.capability_id, ref.version, ref.provider_id])).digest("hex").slice(0, 24);

/** SDK session-scoped callbacks; declarations are a projection of the authorized action directory. */
export function prologueActionTools(actions: AgentFrozenRole["actions"], timeoutMs = DEFAULT_TOOL_LIMITS.maxTimeoutMs, runSignal?: AbortSignal) {
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
        const current = (await actions!.client.discover()).find(row => row.capability_id === reference.capability_id
          && row.version === reference.version && row.provider.provider_id === reference.provider_id);
        if (!current || !current.action.audiences.includes("agent")) throw new ActionError("actions.missing", "The original Agent action is no longer accessible");
        if (!current.availability.available) throw new ActionError(current.availability.code, current.availability.reason);
        if (!isDeepStrictEqual(current.action, view.action) || current.operation !== view.operation) throw new ActionError("actions.definition_changed", "The action contract changed; start a new run with its current version");
        abort.signal.throwIfAborted();
        const result = await actions!.client.invoke(reference, wrapped ? call.args.input : call.args, abort.signal);
        abort.signal.throwIfAborted();
        return JSON.stringify(result) ?? "null";
      } finally { unsubscribe?.(); call.signal?.removeEventListener("abort", stop); runSignal?.removeEventListener("abort", stop); }
    };
    return { executor: name, registration: { name, version: String(view.version), description: view.action.title + "\n" + view.action.description,
      parameters: wrapped ? { type: "object", properties: { input: view.action.input_schema }, required: ["input"], additionalProperties: false } : view.action.input_schema,
      effectKind: view.operation === "query" ? "safe-read" as const : "mutate-external" as const,
      gate: "broker" as const, timeoutMs, idempotency: "none" as const } };
  });
  const names = contributions.map(item => item.registration.name);
  const pack: ScenarioPack = { id: "molis-actions-" + scope,
    version: "1.0.0", source: { kind: "app-embedded" }, needs: { hostCapabilities: [], executors: names },
    permissions: { tools: names, network: [], paths: [] }, memory: { scope: "session", write: "deny" },
    roster: [{ role: "action-user", skills: [], writes: contributions.some(row => row.registration.effectKind !== "safe-read") }],
    planning: { plannedBy: "action-user", planFirst: false }, config: {}, tools: contributions };
  return { pack, executors, names, scope };
}
