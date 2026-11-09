import { sourceSections, messageSections } from "./sync-sections.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createSyncJsonContent, syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { feedRuleCollection } from "./replication.js";
export function syncBindings(context: PluginStartContext): PluginSyncBinding[] {
  const scope=context.sync;
  if(!scope)return [];
  const service=context.services?.sync;
  if(!service)throw new ActionError("actions.unredeemed","个人空间同步服务未提供");
  return [service.sections("source_descriptions", sourceSections), service.sections("messages", messageSections), {collection_id:"capture_rules",replica:service.collection("capture_rules",feedRuleCollection(context.project_id!)),
    content:createSyncJsonContent({spaceId:scope.spaceId,authorize:()=>scope.assertActive()}),
    locate:syncTupleLocation("feed",true,2,false)}];
}
