import { createImagesSyncContent } from "./sync-files.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PartitionSyncContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { syncTupleLocation } from "@molis-ai/molis-work-plugin-sdk";
import { imagesCollection } from "./replication.js";
export function syncBindings(context: PartitionSyncContext): PluginSyncBinding[] {
  const scope=context.sync ?? context.copy;
  if(!scope)return [];
  const service=context.services?.sync;
  if(!service)throw new ActionError("actions.unredeemed","个人空间同步服务未提供");
  const files=context.services?.ownerFiles;
  if(!files)throw new ActionError("actions.unredeemed","图片文件服务未提供");
  // A partition instance always has its partition; an instance without one has nothing of its own to replicate.
  if(!context.project_id)throw new ActionError("actions.unredeemed","图片同步缺少所在分区");
  const definition=imagesCollection(files,context.project_id);
  const content=createImagesSyncContent({spaceId:scope.spaceId,authorize:()=>scope.assertActive()},files);
  return [{collection_id:"saved_images",replica:service.collection("saved_images",definition),
    content,
    copy:direction=>({...service.collectionCopy("saved_images",definition,direction),prepare:asset=>content.prepare(asset.key,asset.value)}),
    locate:syncTupleLocation("images",true,2,false)}];
}
