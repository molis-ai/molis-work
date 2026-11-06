import type { PluginStartContext, PluginSyncBinding } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalSections } from "./sync-sections.js";
export function syncBindings(context: PluginStartContext): PluginSyncBinding[] {
  if (!context.sync) return [];
  if (!context.services?.sync) throw new ActionError("actions.unredeemed", "个人空间同步服务未提供");
  const database=context.services.project_database;
  if(!database||!context.project_id)throw new ActionError("actions.unredeemed","目标引用检查需要当前项目库");
  return [{...context.services.sync.sections("project_goals", goalSections),hasReference(projectId,assetId,version){
    context.sync!.assertActive();
    if(projectId!==context.project_id||version!==undefined)return false;
    return database.get("SELECT goal_id FROM goals WHERE project_id=? AND goal_id=?",[projectId,assetId])!==null;
  }}];
}
