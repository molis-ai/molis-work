import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { settleCall, type CallContext, type CallDescription, type CallSettled } from "@molis-ai/molis-work-kernel";

/** What a settlement needs of a typed capability; deliberately not a `HostCapabilityDefinition`, which only the registry takes. */
interface TypedReference {
  readonly capability_id: string;
  readonly version: number;
  readonly operation: string;
}

/** The typed definition may carry more than its identity (a scheduling hint, the provider it was registered under); a settlement does not. */
const identityOf = (reference: TypedReference) => ({ capability_id: reference.capability_id, version: reference.version });

/** A typed capability has no action, so it has no title or provider of its own: it is named by its id and attributed to the Host. */
const describeTyped = (reference: TypedReference): CallDescription =>
  ({ ...identityOf(reference), operation: reference.operation, provider_id: undefined, title: reference.capability_id, provider_title: "Molis Work", path: "typed" });

/**
 * A call through the Host's typed port to an entry that has no action never passes the action service, so it is settled
 * here, once, like any other.
 */
export function settleTyped<T>(settled: CallSettled | undefined, caller: CallContext, reference: TypedReference, run: () => Promise<T>): Promise<T> {
  const invoke = async () => {
    try { return await run(); }
    catch (error) {
      if (error instanceof ActionError && error.code === "kernel.capability_missing") {
        throw new ActionError("actions.dependency_missing", error.message, { cause: error });
      }
      throw error;
    }
  };
  return settleCall(settled, caller, () => describeTyped(reference), invoke);
}
