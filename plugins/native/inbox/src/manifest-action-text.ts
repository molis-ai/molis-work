import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "inbox.stage.read": { title_text: { key: "inbox.actions.stage-read.title" }, description_text: { key: "inbox.actions.stage-read.description" } },
  "inbox.actions.prepare": { title_text: { key: "inbox.actions.actions-prepare.title" }, description_text: { key: "inbox.actions.actions-prepare.description" } },
  "inbox.list": { title_text: { key: "inbox.actions.list.title" }, description_text: { key: "inbox.actions.list.description" } },
  "inbox.entry.status": { title_text: { key: "inbox.actions.entry-status.title" }, description_text: { key: "inbox.actions.entry-status.description" } },
  "inbox.pages.results": { title_text: { key: "inbox.actions.pages-results.title" }, description_text: { key: "inbox.actions.pages-results.description" } },
  "inbox.pages.generate": { title_text: { key: "inbox.actions.pages-generate.title" }, description_text: { key: "inbox.actions.pages-generate.description" } },
  "inbox.judgment.read": { title_text: { key: "inbox.actions.judgment-read.title" }, description_text: { key: "inbox.actions.judgment-read.description" } },
  "inbox.judgment.recommendations": { title_text: { key: "inbox.actions.judgment-recommendations.title" }, description_text: { key: "inbox.actions.judgment-recommendations.description" } },
  "inbox.judgment.write": { title_text: { key: "inbox.actions.judgment-write.title" }, description_text: { key: "inbox.actions.judgment-write.description" } },
  "inbox.judgment.evaluate": { title_text: { key: "inbox.actions.judgment-evaluate.title" }, description_text: { key: "inbox.actions.judgment-evaluate.description" } },
  "inbox.presentation.values": { title_text: { key: "inbox.actions.presentation-values.title" }, description_text: { key: "inbox.actions.presentation-values.description" } },
  "inbox.presentation.overview": { title_text: { key: "inbox.actions.presentation-overview.title" }, description_text: { key: "inbox.actions.presentation-overview.description" } },
  "inbox.content.list": { title_text: { key: "inbox.actions.content-list.title" }, description_text: { key: "inbox.actions.content-list.description" } },
  "inbox.content.read": { title_text: { key: "inbox.actions.content-read.title" }, description_text: { key: "inbox.actions.content-read.description" } },
  "inbox.content.receive": { title_text: { key: "inbox.actions.content-receive.title" }, description_text: { key: "inbox.actions.content-receive.description" } },
  "inbox.subject.read": { title_text: { key: "inbox.actions.subject-read.title" }, description_text: { key: "inbox.actions.subject-read.description" } },
  "inbox.search.entries": { title_text: { key: "inbox.actions.search-entries.title" }, description_text: { key: "inbox.actions.search-entries.description" } },
  "inbox.events": { title_text: { key: "inbox.actions.events.title" }, description_text: { key: "inbox.actions.events.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
