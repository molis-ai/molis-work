import { actionViewFor, type ActionCallContext, type ActionClient, type ActionReference, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

export { actionViewFor };

/** A test double of `ActionClient` written with `discover` and `invoke` only: `discoverOne` reads its own `discover`. */
export function fakeActionClient(client: Omit<ActionClient, "discoverOne"> & Partial<Pick<ActionClient, "discoverOne">>): ActionClient {
  return { ...client, discoverOne: client.discoverOne
    ?? (async (caller: ActionCallContext, reference: ActionReference) => actionViewFor(await client.discover(caller), reference)) };
}

/** A test double of `BoundActionClient` written with `discover` and `invoke` only: `discoverOne` reads its own `discover`. */
export function fakeBoundActionClient(client: Omit<BoundActionClient, "discoverOne"> & Partial<Pick<BoundActionClient, "discoverOne">>): BoundActionClient {
  return { ...client, discoverOne: client.discoverOne ?? (async reference => actionViewFor(await client.discover(), reference)) };
}
