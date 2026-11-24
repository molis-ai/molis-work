import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "issues.prepare": { title_text: { key: "issues.actions.prepare.title" }, description_text: { key: "issues.actions.prepare.description" } },
  "issues.cancel_capture": { title_text: { key: "issues.actions.cancel-capture.title" }, description_text: { key: "issues.actions.cancel-capture.description" } },
  "issues.name_draft": { title_text: { key: "issues.actions.name-draft.title" }, description_text: { key: "issues.actions.name-draft.description" } },
  "issues.suggest_name": { title_text: { key: "issues.actions.suggest-name.title" }, description_text: { key: "issues.actions.suggest-name.description" } },
  "issues.capture": { title_text: { key: "issues.actions.capture.title" }, description_text: { key: "issues.actions.capture.description" } },
  "issues.discard": { title_text: { key: "issues.actions.discard.title" }, description_text: { key: "issues.actions.discard.description" } },
  "issues.list": { title_text: { key: "issues.actions.list.title" }, description_text: { key: "issues.actions.list.description" } },
  "issues.read": { title_text: { key: "issues.actions.read.title" }, description_text: { key: "issues.actions.read.description" } },
  "issues.create": { title_text: { key: "issues.actions.create.title" }, description_text: { key: "issues.actions.create.description" } },
  "issues.update": { title_text: { key: "issues.actions.update.title" }, description_text: { key: "issues.actions.update.description" } },
  "issues.delete": { title_text: { key: "issues.actions.delete.title" }, description_text: { key: "issues.actions.delete.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
