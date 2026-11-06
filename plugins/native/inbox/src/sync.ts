import type { PluginStartContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SyncSectionsDefinition } from "@molis-ai/molis-work-contracts/platform/plugin-sync";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
export const attentionSections: SyncSectionsDefinition = {kind:"project_attention",business:[],platform:["attention"],journal:false};
export function syncBindings(context:PluginStartContext):PluginSyncBinding[]{
 if(!context.sync)return [];
 if(!context.services?.sync)throw new ActionError("actions.unredeemed","个人空间同步服务未提供");
 return [context.services.sync.sections("attention",attentionSections)];
}
