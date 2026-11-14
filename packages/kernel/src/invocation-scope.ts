import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

/**
 * One action call, so that a call made by a running handler can name the call it was made in (specs/observation-collection/contract-design.md
 * §3, §7). Set by the dispatcher alone; closed when the call settles, so a timer or stream the call left behind is no longer inside it.
 */
interface InvocationScope { readonly id: string; open: boolean }
const invocations = new AsyncLocalStorage<InvocationScope>();

/** The action call whose handler is running here, while it is still pending. */
export function currentInvocationId(): string | undefined {
  const scope = invocations.getStore();
  return scope?.open ? scope.id : undefined;
}

/** Number a call and run it as the running invocation; the scope closes when `run` settles. */
export async function withInvocation<T>(run: (id: string) => Promise<T> | T): Promise<T> {
  const scope: InvocationScope = { id: randomUUID(), open: true };
  try { return await invocations.run(scope, () => run(scope.id)); }
  finally { scope.open = false; }
}

export function withInvocationSync<T>(run: (id: string) => T): T {
  const scope: InvocationScope = { id: randomUUID(), open: true };
  try { return invocations.run(scope, () => run(scope.id)); }
  finally { scope.open = false; }
}
