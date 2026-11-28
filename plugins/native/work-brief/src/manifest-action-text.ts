import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "work-brief.briefs.list": { title_text: { key: "work-brief.actions.briefs-list.title" }, description_text: { key: "work-brief.actions.briefs-list.description" } },
  "work-brief.briefs.get": { title_text: { key: "work-brief.actions.briefs-get.title" }, description_text: { key: "work-brief.actions.briefs-get.description" } },
  "work-brief.briefs.save": { title_text: { key: "work-brief.actions.briefs-save.title" }, description_text: { key: "work-brief.actions.briefs-save.description" } },
  "work-brief.briefs.refresh": { title_text: { key: "work-brief.actions.briefs-refresh.title" }, description_text: { key: "work-brief.actions.briefs-refresh.description" } },
  "work-brief.briefs.edit": { title_text: { key: "work-brief.actions.briefs-edit.title" }, description_text: { key: "work-brief.actions.briefs-edit.description" } },
  "work-brief.proposals.resolve": { title_text: { key: "work-brief.actions.proposals-resolve.title" }, description_text: { key: "work-brief.actions.proposals-resolve.description" } },
  "work-brief.versions.fix": { title_text: { key: "work-brief.actions.versions-fix.title" }, description_text: { key: "work-brief.actions.versions-fix.description" } },
  "work-brief.next.run": { title_text: { key: "work-brief.actions.next-run.title" }, description_text: { key: "work-brief.actions.next-run.description" } },
  "work-brief.next.set": { title_text: { key: "work-brief.actions.next-set.title" }, description_text: { key: "work-brief.actions.next-set.description" } },
  "work-brief.presentation.values": { title_text: { key: "work-brief.actions.presentation-values.title" }, description_text: { key: "work-brief.actions.presentation-values.description" } },
  "work-brief.presentation.overview": { title_text: { key: "work-brief.actions.presentation-overview.title" }, description_text: { key: "work-brief.actions.presentation-overview.description" } },
  "work-brief.search.entries": { title_text: { key: "work-brief.actions.search-entries.title" }, description_text: { key: "work-brief.actions.search-entries.description" } },
  "work-brief.subject.read": { title_text: { key: "work-brief.actions.subject-read.title" }, description_text: { key: "work-brief.actions.subject-read.description" } },
  "work-brief.artifacts.preview": { title_text: { key: "work-brief.actions.artifacts-preview.title" }, description_text: { key: "work-brief.actions.artifacts-preview.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
