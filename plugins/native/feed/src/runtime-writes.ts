import type { ActionDefinition, ActionExecutionContext, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginProjectDatabase } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { FeedRuntimePorts } from "./runtime-ports.js";

/**
 * How a Runtime Feed writes (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §11). Feed's application writes
 * synchronously through ports, and the platform's write transaction is synchronous too, so the two meet in one place: the ports are bound
 * to a transaction for the length of a synchronous body, and a write made at any other time fails with `actions.execution_failed` instead
 * of landing anywhere. Every write is therefore a commit that opens after `beforeEffect()` has been awaited and re-asks the grants and the
 * original caller before it commits.
 */
export interface FeedWriter {
  /**
   * One commit: `body` runs inside the plugin's write transaction with the ports bound to it, so rows, Inbox entries, ledger edges and
   * journal events are all committed or none. For a handler that has to wait (for a model, another plugin, a decryption) before it
   * writes: do the waiting first, then commit what was decided. The journal's actor is the original caller's.
   */
  commit<T>(caller: ActionExecutionContext, body: () => T): Promise<T>;
  /**
   * The handlers of the commands among `definitions`, each run so that its synchronous part is one commit. What the handler does after
   * its first `await` is outside the commit and cannot write (it fails loudly): that is a judgment started after the write, not a
   * second write. A handler that throws before its first `await` rolls everything it wrote back. Queries are returned as they are,
   * and they read through the read-only client.
   */
  writing(definitions: readonly ActionDefinition[], bindings: readonly ActionHandlerBinding[]): ActionHandlerBinding[];
}

const isThenable = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";

export function createFeedWriter(database: PluginProjectDatabase, ports: Pick<FeedRuntimePorts, "within">): FeedWriter {
  const commit = <T>(caller: ActionExecutionContext, body: () => T): Promise<T> =>
    database.transaction(() => caller.beforeEffect(), transaction => ports.within(transaction, caller.audit_actor_id ?? caller.actor_id, body));
  const writing = (definitions: readonly ActionDefinition[], bindings: readonly ActionHandlerBinding[]): ActionHandlerBinding[] => {
    const commands = new Set(definitions.filter(definition => definition.operation === "command").map(definition => `${definition.capability_id}@${definition.version}`));
    return bindings.map(binding => {
      if (!commands.has(`${binding.capability_id}@${binding.version}`)) return { ...binding };
      return { ...binding, handle: async (caller: ActionExecutionContext, input: unknown) => {
        let started: unknown;
        // The handler is not awaited inside the transaction (which must finish without waiting); its result is, once the commit is done.
        await commit(caller, () => {
          started = binding.handle(caller, input);
          // Nothing may reject unobserved if the commit fails after the handler has started its asynchronous part.
          if (isThenable(started)) started.then(undefined, () => {});
        });
        return await started;
      } };
    });
  };
  return { commit, writing };
}
