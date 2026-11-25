import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "workflows.list": { title_text: { key: "workflows.actions.list.title" }, description_text: { key: "workflows.actions.list.description" } },
  "workflows.get": { title_text: { key: "workflows.actions.get.title" }, description_text: { key: "workflows.actions.get.description" } },
  "workflows.create": { title_text: { key: "workflows.actions.create.title" }, description_text: { key: "workflows.actions.create.description" } },
  "workflows.update": { title_text: { key: "workflows.actions.update.title" }, description_text: { key: "workflows.actions.update.description" } },
  "workflows.delete": { title_text: { key: "workflows.actions.delete.title" }, description_text: { key: "workflows.actions.delete.description" } },
  "workflows.stations.items": { title_text: { key: "workflows.actions.stations-items.title" }, description_text: { key: "workflows.actions.stations-items.description" } },
  "workflows.instances.start": { title_text: { key: "workflows.actions.instances-start.title" }, description_text: { key: "workflows.actions.instances-start.description" } },
  "workflows.instances.get": { title_text: { key: "workflows.actions.instances-get.title" }, description_text: { key: "workflows.actions.instances-get.description" } },
  "workflows.instances.preview": { title_text: { key: "workflows.actions.instances-preview.title" }, description_text: { key: "workflows.actions.instances-preview.description" } },
  "workflows.instances.continue": { title_text: { key: "workflows.actions.instances-continue.title" }, description_text: { key: "workflows.actions.instances-continue.description" } },
  "workflows.steps.actions": { title_text: { key: "workflows.actions.steps-actions.title" }, description_text: { key: "workflows.actions.steps-actions.description" } },
  "workflows.judgments.list": { title_text: { key: "workflows.actions.judgments-list.title" }, description_text: { key: "workflows.actions.judgments-list.description" } },
  "workflows.usages": { title_text: { key: "workflows.actions.usages.title" }, description_text: { key: "workflows.actions.usages.description" } },
  "workflows.instances.stop": { title_text: { key: "workflows.actions.instances-stop.title" }, description_text: { key: "workflows.actions.instances-stop.description" } },
  "workflows.search.entries": { title_text: { key: "workflows.actions.search-entries.title" }, description_text: { key: "workflows.actions.search-entries.description" } },
  "workflows.subject.read": { title_text: { key: "workflows.actions.subject-read.title" }, description_text: { key: "workflows.actions.subject-read.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
