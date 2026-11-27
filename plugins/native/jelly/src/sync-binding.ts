import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PartitionSyncContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { jellyCollection } from "./replication.js";
export function syncBindings(context: PartitionSyncContext): PluginSyncBinding[] {
  const scope = context.sync;
  if (!scope) return [];
  const service = context.services?.sync;
  if (!service) throw new ActionError("actions.unredeemed", "个人空间同步服务未提供");
  return [{ collection_id: "entries", replica: service.collection("entries", jellyCollection),
    content: createSyncJsonContent({ spaceId: scope.spaceId, authorize: () => scope.assertActive() }),
    locate: syncTupleLocation("jelly", false, undefined, false) }];
}
