import { createIssueSyncContent } from "./sync-content.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PartitionSyncContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { issuesCollection } from "./replication.js";
export function syncBindings(context: PartitionSyncContext): PluginSyncBinding[] {
  const scope=context.sync;
  if(!scope)return [];
  const service=context.services?.sync;
  if(!service)throw new ActionError("actions.unredeemed","个人空间同步服务未提供");
  return [{collection_id:"issues",replica:service.collection("issues",issuesCollection),
    content:createIssueSyncContent({spaceId:scope.spaceId,authorize:()=>scope.assertActive()}),
    locate:syncTupleLocation("issues",false,1,false)}];
}
