import type { ActionCallContext, ActionReference, ActionView, BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

type DiscoveringClient = {
  discover(caller: ActionCallContext): readonly ActionView[] | Promise<readonly ActionView[]>;
  discoverOne?(caller: ActionCallContext, reference: ActionReference): ActionView | undefined | Promise<ActionView | undefined>;
};

const same = (view: ActionView, reference: ActionReference) => view.capability_id === reference.capability_id && view.version === reference.version
  && (!reference.provider_id || view.provider.provider_id === reference.provider_id);

/**
 * The caller's view of one action named with its provider (batch 103-2, N42): looked up alone instead of listing the whole directory to
 * find it. Without a provider, or on a client that cannot look one up, the directory is listed as before.
 */
export async function exactActionView(client: DiscoveringClient, caller: ActionCallContext, reference: ActionReference): Promise<ActionView | undefined> {
  if (reference.provider_id && client.discoverOne) {
    const view = await client.discoverOne(caller, reference);
    return view && same(view, reference) ? view : undefined;
  }
  return (await client.discover(caller)).find(view => same(view, reference));
}

/** `exactActionView` for a client already bound to its caller. */
export async function exactBoundActionView(client: Pick<BoundActionClient, "discover"> & Partial<Pick<BoundActionClient, "discoverOne">>, reference: ActionReference): Promise<ActionView | undefined> {
  if (reference.provider_id && client.discoverOne) {
    const view = await client.discoverOne(reference);
    return view && same(view, reference) ? view : undefined;
  }
  return (await client.discover()).find(view => same(view, reference));
}
