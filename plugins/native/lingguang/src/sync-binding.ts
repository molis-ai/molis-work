import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { lingguangAggregates } from "./replication.js";

/** Business graphs belong to this plugin; the platform owns transport journals and library authority. */
export function syncBindings(context: PluginStartContext): PluginSyncBinding[] {
  const scope = context.sync ?? context.copy;
  if (!scope) return [];
  const service = context.services?.sync;
  if (!service) throw new ActionError("actions.unredeemed", "个人空间同步服务未提供");
  return [{ collection_id: "ideas", replica: service.aggregate("ideas", lingguangAggregates),
    content: createSyncJsonContent({ spaceId: scope.spaceId, authorize: () => scope.assertActive() }),
    locate: syncTupleLocation("lingguang", true, 2, false),
    copy: direction => service.copy("ideas", lingguangAggregates, direction),
  }];
}
