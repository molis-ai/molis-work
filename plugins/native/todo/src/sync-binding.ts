import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PartitionSyncContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { todoCollection } from "./replication.js";
export function syncBindings(context: PartitionSyncContext): PluginSyncBinding[] {
  const scope=context.sync;
  if(!scope)return [];
  const service=context.services?.sync;
  if(!service)throw new ActionError("actions.unredeemed","个人空间同步服务未提供");
  return [{collection_id:"todo_items",replica:service.collection("todo_items",todoCollection(context.project_id!)),
    content:createSyncJsonContent({spaceId:scope.spaceId,authorize:()=>scope.assertActive()}),
    locate:syncTupleLocation("todo",true,2,false)}];
}
