import { referencesAction, type ActionReference, type ActionUsage } from "@molis-ai/molis-work-contracts/platform/actions";
import type { CharactersService } from "./service.js";

/**
 * Where an action sits in this person's roles (role-service-design §3): the current version of each original, and the current
 * version of each member of this project, which may have its own capabilities. A role turned off still lists, marked not enabled.
 */
export function characterActionUsages(drafts: CharactersService, projectId: string, action: ActionReference): ActionUsage[] {
  const catalog = drafts.roles.catalog(projectId, drafts.list()), usages: ActionUsage[] = [];
  for (const entry of catalog.originals) {
    if (!entry.action_tools?.some(ref => referencesAction(ref, action))) continue;
    usages.push({ usage_id: `original:${entry.ref.character_id}`, title: `角色「${entry.title}」`, detail: "按这个角色做任务时可以调用", enabled: entry.availability.available });
  }
  for (const entry of catalog.members) {
    if (!entry.action_tools?.some(ref => referencesAction(ref, action))) continue;
    usages.push({ usage_id: `member:${entry.role.current.member_id}`, title: `角色「${entry.title}」（本项目）`, detail: "在本项目里按这个角色做任务时可以调用",
      enabled: entry.availability.available });
  }
  return usages;
}
