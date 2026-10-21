import { referencesAction, type ActionReference, type ActionUsage } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { parseCharacterContent, type CharactersQuery } from "@molis-ai/molis-work-contracts/modules/characters";

/** Where an action sits in this person's Character scopes: their drafts and the latest publication per Character in the project. */
export function characterActionUsages(drafts: CharactersQuery, publications: readonly ArtifactVersionRecord[], action: ActionReference): ActionUsage[] {
  const usages: ActionUsage[] = [];
  for (const draft of drafts.list()) {
    if (draft.state === "tombstoned" || !draft.action_tools?.some(ref => referencesAction(ref, action))) continue;
    usages.push({ usage_id: `draft:${draft.character_id}`, title: `角色「${draft.title}」`, detail: "内置 Agent 按这个角色运行时可以调用", enabled: draft.state === "active" });
  }
  // The latest publication per Character is what a run started from the project would use.
  const latest = new Map<string, ArtifactVersionRecord>();
  for (const record of publications) if (record.lifecycle_state === "active" && (latest.get(record.artifact_id)?.version ?? 0) < record.version) latest.set(record.artifact_id, record);
  for (const record of latest.values()) {
    const content = parseCharacterContent(record.payload);
    if (!content.action_tools?.some(ref => referencesAction(ref, action))) continue;
    usages.push({ usage_id: `publication:${record.artifact_id}`, title: `角色「${content.title}」v${record.version}（已发布）`, detail: "从项目运行这个发布版本时可以调用",
      enabled: record.availability === "available" && drafts.get(content.character_id)?.state === "active" });
  }
  return usages;
}
