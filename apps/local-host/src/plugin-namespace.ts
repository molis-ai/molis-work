import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ownsEventType } from "@molis-ai/molis-work-contracts/platform/plugin-events";

/**
 * A plugin's names in the project's shared tables (the event type and object type of a journal event, the operation of an idempotency
 * record, the key of a ledger edge) are `<plugin_id>.…`: the namespace the event bus already gives it (`ownsEventType`). The id is the
 * installation's own, taken from its Manifest when the service is built and never from an input, so one plugin cannot write, claim
 * or read a name that belongs to another (S-63, S-64). Known gap (BL-506): two plugin ids that are dotted prefixes of each other
 * (`io.molis.work.a`, `io.molis.work.a.b`) share a namespace, as they do on the event bus; none of the installed ids is such a pair.
 */
export function assertOwnName(pluginId: string, what: string, name: string): void {
  if (!ownsEventType(pluginId, name)) throw pluginErrors.storage_denied(`${what}必须在插件自己的命名空间 ${pluginId}. 之下`);
}

export const ownsName = (pluginId: string, name: string): boolean => ownsEventType(pluginId, name);
