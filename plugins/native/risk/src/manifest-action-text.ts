import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "risk.list": { title_text: { key: "risk.actions.list.title" }, description_text: { key: "risk.actions.list.description" } },
  "risk.get": { title_text: { key: "risk.actions.get.title" }, description_text: { key: "risk.actions.get.description" } },
  "risk.create": { title_text: { key: "risk.actions.create.title" }, description_text: { key: "risk.actions.create.description" } },
  "risk.update": { title_text: { key: "risk.actions.update.title" }, description_text: { key: "risk.actions.update.description" } },
  "risk.status.set": { title_text: { key: "risk.actions.status-set.title" }, description_text: { key: "risk.actions.status-set.description" } },
  "risk.links.add": { title_text: { key: "risk.actions.links-add.title" }, description_text: { key: "risk.actions.links-add.description" } },
  "risk.links.remove": { title_text: { key: "risk.actions.links-remove.title" }, description_text: { key: "risk.actions.links-remove.description" } },
  "risk.notes.add": { title_text: { key: "risk.actions.notes-add.title" }, description_text: { key: "risk.actions.notes-add.description" } },
  "risk.review.get": { title_text: { key: "risk.actions.review-get.title" }, description_text: { key: "risk.actions.review-get.description" } },
  "risk.review.schedule": { title_text: { key: "risk.actions.review-schedule.title" }, description_text: { key: "risk.actions.review-schedule.description" } },
  "risk.review.enabled": { title_text: { key: "risk.actions.review-enabled.title" }, description_text: { key: "risk.actions.review-enabled.description" } },
  "risk.review.cancel": { title_text: { key: "risk.actions.review-cancel.title" }, description_text: { key: "risk.actions.review-cancel.description" } },
  "risk.presentation.values": { title_text: { key: "risk.actions.presentation-values.title" }, description_text: { key: "risk.actions.presentation-values.description" } },
  "risk.presentation.overview": { title_text: { key: "risk.actions.presentation-overview.title" }, description_text: { key: "risk.actions.presentation-overview.description" } },
  "risk.search.entries": { title_text: { key: "risk.actions.search-entries.title" }, description_text: { key: "risk.actions.search-entries.description" } },
  "risk.subject.read": { title_text: { key: "risk.actions.subject-read.title" }, description_text: { key: "risk.actions.subject-read.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
