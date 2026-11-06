import { createImagesSyncContent } from "./sync-files.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginStartContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { imagesCollection } from "./replication.js";
export function syncBindings(context: PluginStartContext): PluginSyncBinding[] {
  const scope=context.sync ?? context.copy;
  if(!scope)return [];
  const service=context.services?.sync;
  if(!service)throw new ActionError("actions.unredeemed","个人空间同步服务未提供");
  const files=context.services?.ownerFiles;
  if(!files)throw new ActionError("actions.unredeemed","图片文件服务未提供");
  const definition=imagesCollection(files);
  const content=createImagesSyncContent({spaceId:scope.spaceId,authorize:()=>scope.assertActive()},files);
  return [{collection_id:"saved_images",replica:service.collection("saved_images",definition),
    content,
    copy:direction=>({...service.collectionCopy("saved_images",definition,direction),prepare:asset=>content.prepare(asset.key,asset.value)}),
    locate:syncTupleLocation("images",true,2,false)}];
}
