import { ActionError, type ActionCallContext, type ActionClient, type ActionReference, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { assertPluginConsentActionEntry } from "./installed-plugin-consent-actions.js";

/** Resolve the provider from this caller's real project directory, then pin that exact owner for the invocation. */
export async function pluginActionProvider(client: ActionClient, caller: ActionCallContext, reference: ActionReference): Promise<string> {
  return (await pluginActionView(client, caller, reference)).provider.provider_id;
}

/** The one view of `reference` this caller's directory shows: what `pluginActionProvider` pins, with the action it pins. */
export async function pluginActionView(client: ActionClient, caller: ActionCallContext, reference: ActionReference): Promise<ActionView> {
  caller.signal?.throwIfAborted();
  assertPluginConsentActionEntry(caller, reference);
  const matches = (await client.discover(caller)).filter(view => view.capability_id === reference.capability_id && view.version === reference.version
    && (!reference.provider_id || view.provider.provider_id === reference.provider_id));
  caller.signal?.throwIfAborted();
  if (!matches.length) throw new ActionError("actions.dependency_missing", "声明消费的动作或版本未在当前项目登记");
  if (matches.length !== 1) throw new ActionError("actions.provider_ambiguous", "声明消费的动作在当前项目没有唯一提供方");
  return matches[0]!;
}
