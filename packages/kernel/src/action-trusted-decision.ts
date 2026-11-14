import { AsyncLocalStorage } from "node:async_hooks";
import { isDeepStrictEqual } from "node:util";
import { ActionError, requireSynchronous, type ActionCallContext, type ActionUserAction, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { runningHandlerContext } from "./action-settlement.js";

interface Authority {
  readonly actor_id: string;
  readonly project_id: string;
  readonly entry: ActionUserAction;
  readonly action: ExactActionReference;
  readonly input: unknown;
  assertCurrent(): void;
}

const pending = new AsyncLocalStorage<{ readonly authority: Authority; readonly entryHandler: object | undefined; used: boolean }>();
const refused = () => new ActionError("actions.forbidden", "这项操作需要在本人决定入口批准原请求");

/**
 * The Host calls this only from the protected decision service around one exact dispatch. The ordinary call context carries audit data.
 * The authority is held here, is consumed by the first matching dispatch, and is never passed to a handler or exposed to a plugin.
 */
export async function withTrustedDecision<T>(authority: Authority, dispatch: () => Promise<T>): Promise<T> {
  if (pending.getStore()) throw refused();
  const { entry, actor_id, project_id } = authority;
  if (!actor_id || !project_id || (entry.source !== "web" && entry.source !== "management")) throw refused();
  requireSynchronous(authority.assertCurrent());
  const claim = { authority: { ...authority, action: { ...authority.action }, input: structuredClone(authority.input) },
    entryHandler: runningHandlerContext(), used: false };
  try { return await pending.run(claim, dispatch); }
  finally { claim.used = true; }
}

export function consumeTrustedDecision(context: ActionCallContext, originalAction: ExactActionReference, input: unknown): () => void {
  const held = pending.getStore();
  const authority = held?.authority;
  if (!held || held.used || !authority || runningHandlerContext() !== held.entryHandler || context.host_plugin || context.delegated_by
    || context.actor_kind !== "user" || context.audience !== "user"
    || context.actor_id !== authority.actor_id || context.project_id !== authority.project_id || context.user_action !== authority.entry
    || originalAction.capability_id !== authority.action.capability_id || originalAction.version !== authority.action.version
    || originalAction.provider_id !== authority.action.provider_id || !isDeepStrictEqual(input, authority.input)) throw refused();
  held.used = true;
  const check = () => { requireSynchronous(authority.assertCurrent()); };
  check();
  return check;
}
