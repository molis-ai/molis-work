import { ActionError, requireSynchronous, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { snapshotHostUserAction } from "./plugin-consent-settings-entry.js";
import type { RuntimeEntry } from "./local-host-project-line.js";

const immutableRefLists = new WeakSet<readonly unknown[]>();

function snapshotRefs<T extends object>(items: readonly T[]): readonly T[] {
  if (immutableRefLists.has(items)) return items;
  const frozen = Object.freeze(items.map(item => Object.freeze({ ...item })));
  immutableRefLists.add(frozen);
  return frozen;
}

export function snapshotCaller(caller: ActionCallContext): ActionCallContext {
  return { ...caller, permissions: Object.isFrozen(caller.permissions) ? caller.permissions : Object.freeze([...caller.permissions]),
    ...(caller.page_context ? { page_context: { ...caller.page_context } } : {}),
    ...(caller.user_action ? { user_action: snapshotHostUserAction(caller.user_action) } : {}),
    ...(caller.allowed_capability_ids ? { allowed_capability_ids: Object.isFrozen(caller.allowed_capability_ids) ? caller.allowed_capability_ids : Object.freeze([...caller.allowed_capability_ids]) } : {}),
    ...(caller.allowed_actions ? { allowed_actions: snapshotRefs(caller.allowed_actions) } : {}),
  };
}

/** Long calls outside the project queue are cancelled before close waits for their cleanup. */
export function callSignal(definition: { action?: { scheduling?: string } }, entry: () => Pick<RuntimeEntry<unknown>, "observing"> | undefined, signal: AbortSignal | undefined): { signal?: AbortSignal } {
  const closing = definition.action?.scheduling === "concurrent" ? entry()?.observing.signal : undefined;
  if (!closing) return signal ? { signal } : {};
  return { signal: signal ? AbortSignal.any([signal, closing]) : closing };
}

/** A scene keeps the Host's real closing fence across its asynchronous owner checks. */
export function hostAuthorityContext(caller: ActionCallContext, current: () => boolean): ActionCallContext {
  const assertActive = () => {
    if (!current()) throw new ActionError("actions.host_closed", "能力所在运行环境已关闭");
    caller.signal?.throwIfAborted();
  };
  return { ...caller, assert_authority_current: (reference, requiredPermissions) => {
    assertActive();
    requireSynchronous(caller.assert_authority_current?.(reference, requiredPermissions), "最终授权检查必须同步完成");
    assertActive();
  } };
}
