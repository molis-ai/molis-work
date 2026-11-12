import type { ActionCallContext, ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
export { goalAction } from "./contract/goal-actions.js";

/** Trusted transport identity; business inputs cannot replace it. An unknown kind stays unknown rather than inferred. */
export function goalActor(caller: ActionCallContext) {
  return { actor_id: caller.audit_actor_id ?? caller.actor_id,
    actor_kind: caller.actor_kind === undefined ? (caller.audience === "user" ? "user" as const : "runtime" as const) : caller.actor_kind ?? undefined };
}

/**
 * The plugin that owns each source Goals' public contract names (`source_kind: "feed"`, an input's `feed_item`): the only one whose delegated
 * call can speak for the person about it.
 */
/**
 * The one action whose delegated call Goals takes as the person's for a source (BL-803): Feed's own promotion, as the dispatcher pinned it.
 * A source names its owner's exact action, so any other Feed action handing in, another version or another provider is not the person.
 */
const PERSON_SOURCE_ACTIONS: Readonly<Record<string, { readonly capability_id: string; readonly version: number; readonly provider_id: string }>> = {
  feed: { capability_id: "feed.items.promote", version: /* @version action.feed.items.promote */ 1, provider_id: "io.molis.work.feed" },
  feed_item: { capability_id: "feed.items.promote", version: /* @version action.feed.items.promote */ 1, provider_id: "io.molis.work.feed" },
};

/**
 * Whether the person asked about `source`: their own call, or the call the source owner's exact promotion action made through its action
 * directory (S-43), when the Runtime saw that action entered as the person's own call (user decision 2026-10-10: the person's promotion is
 * confirmed). Read only from what the Host sets on the nested caller (`delegated_by`, `delegated_audience`, `delegated_action`, BL-803),
 * never from input or the delegating plugin's word. Another action of the same plugin, that action called from inside another of its
 * actions, any other plugin handing in (Workflows' step, a third party's action), a delegation that names no source or no action, a chain
 * of delegations, a plugin's own call (a timer, `start`), a scene's judgment, an assistant, Agent, workflow or MCP client is not the person.
 */
export function personAsked(caller: ActionCallContext, source?: string): boolean {
  if (caller.audience === "user") return true;
  const expected = source === undefined ? undefined : PERSON_SOURCE_ACTIONS[source], ran = caller.delegated_action;
  return expected !== undefined && ran !== undefined && caller.audience === "workflow" && caller.delegated_by === expected.provider_id
    && caller.delegated_audience === "user" && caller.scene_binding === undefined && ran.direct_person_entry === true
    && ran.capability_id === expected.capability_id && ran.version === expected.version && ran.provider_id === expected.provider_id;
}

export const ATTENTION_WRITE_PERMISSION = "attention:write";
export const CONTEXT_LEDGER_WRITE_PERMISSION = "context-ledger:write";
export const ARTIFACTS_READ_PERMISSION = "artifacts:read";

/**
 * An action that writes through a platform service (Attention, the Context Ledger) or reads another plugin's action as its caller: the
 * platform lets it only from a concurrent action that declares the permission, so the caller's grants are asked, not the plugin's.
 */
export function usingServices<Input, Output>(definition: ActionDefinition<Input, Output>, permissions: readonly string[]): ActionDefinition<Input, Output> {
  return { ...definition, action: { ...definition.action, scheduling: "concurrent", permissions: [...new Set([...definition.action.permissions, ...permissions])] } };
}
