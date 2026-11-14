import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import { ActionError, requireSynchronous, type ActionCallContext, type ActionExecutionContext, type ActionUserAction, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { runningHandlerContext } from "./action-settlement.js";

interface Authority {
  readonly actor_id: string;
  readonly project_id: string;
  readonly entry: ActionUserAction;
  readonly action: ExactActionReference;
  readonly input: unknown;
  attachExecution?(execution: ActionExecutionContext): void;
  beforeEffect?(): Promise<void>;
  assertCurrent(): void;
}

interface DecisionDispatch {
  readonly authority: Authority;
  readonly entryHandler: object | undefined;
  used: boolean;
  submitted: boolean;
}
const pending = new AsyncLocalStorage<DecisionDispatch>();
const executing = new WeakMap<ActionExecutionContext, DecisionDispatch>();
const refused = () => new ActionError("actions.forbidden", "这项操作需要在本人决定入口批准原请求");

function freezeInput(value: unknown): unknown {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freezeInput(child);
  }
  return value;
}

/**
 * The Host calls this only from the protected decision service around one exact dispatch. The ordinary call context carries audit data.
 * The authority is held here, is consumed by the first matching dispatch, and is never passed to a handler or exposed to a plugin.
 */
export async function withTrustedDecision<T>(authority: Authority, dispatch: (submitted: () => boolean) => Promise<T>): Promise<T> {
  if (pending.getStore()) throw refused();
  const { entry, actor_id, project_id } = authority;
  if (!actor_id || !project_id || (entry.source !== "web" && entry.source !== "management")) throw refused();
  requireSynchronous(authority.assertCurrent());
  const claim = { authority: { ...authority, action: { ...authority.action }, input: structuredClone(authority.input) },
    entryHandler: runningHandlerContext(), used: false, submitted: false };
  try { return await pending.run(claim, dispatch, () => claim.submitted); }
  finally { claim.used = true; }
}

export function consumeTrustedDecision(context: ActionCallContext, originalAction: ExactActionReference, input: unknown) {
  const held = pending.getStore();
  const authority = held?.authority;
  if (!held || held.used || !authority || runningHandlerContext() !== held.entryHandler || context.host_plugin || context.delegated_by
    || context.actor_kind !== "user" || context.audience !== "user" || context.scene_binding
    || context.actor_id !== authority.actor_id || context.project_id !== authority.project_id || context.user_action !== authority.entry
    || originalAction.capability_id !== authority.action.capability_id || originalAction.version !== authority.action.version
    || originalAction.provider_id !== authority.action.provider_id || !isDeepStrictEqual(input, authority.input)) throw refused();
  held.used = true;
  const check = () => { requireSynchronous(authority.assertCurrent()); };
  check();
  return { input: freezeInput(structuredClone(authority.input)), check, beforeEffect: authority.beforeEffect,
    attach(execution: ActionExecutionContext) {
      executing.set(execution, held);
      requireSynchronous(authority.attachExecution?.(execution));
    } };
}

export function markTrustedDecisionSubmitted(execution: ActionExecutionContext): void {
  const current = executing.get(execution);
  if (!current || current.submitted) throw refused();
  current.submitted = true;
}

export function trustedDecisionSubmitted(execution: ActionExecutionContext): boolean {
  return executing.get(execution)?.submitted === true;
}

/** Only the original SQL writer's definitive refusal can clear a submission. */
export function markTrustedDecisionRolledBack(execution: ActionExecutionContext): void {
  const current = executing.get(execution);
  if (current) current.submitted = false;
}
