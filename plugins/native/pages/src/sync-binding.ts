import { createPagesSyncContent } from "./sync-content.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { pagesCollection } from "./replication.js";
export function syncBindings(context: PluginStartContext): PluginSyncBinding[] {
  const scope=context.sync;
  if(!scope)return [];
  const service=context.services?.sync;
  if(!service)throw new ActionError("actions.unredeemed","个人空间同步服务未提供");
  return [{collection_id:"documents",replica:service.collection("documents",pagesCollection),
    content:createPagesSyncContent({spaceId:scope.spaceId,authorize:()=>scope.assertActive()}),
    locate:syncTupleLocation("pages",true,2,true)}];
}
