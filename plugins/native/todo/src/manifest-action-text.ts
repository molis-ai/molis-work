import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "todo.items.list": { title_text: { key: "todo.actions.items-list.title" }, description_text: { key: "todo.actions.items-list.description" } },
  "todo.items.get": { title_text: { key: "todo.actions.items-get.title" }, description_text: { key: "todo.actions.items-get.description" } },
  "todo.items.create": { title_text: { key: "todo.actions.items-create.title" }, description_text: { key: "todo.actions.items-create.description" } },
  "todo.items.update": { title_text: { key: "todo.actions.items-update.title" }, description_text: { key: "todo.actions.items-update.description" } },
  "todo.items.status": { title_text: { key: "todo.actions.items-status.title" }, description_text: { key: "todo.actions.items-status.description" } },
  "todo.items.archive": { title_text: { key: "todo.actions.items-archive.title" }, description_text: { key: "todo.actions.items-archive.description" } },
  "todo.items.delete": { title_text: { key: "todo.actions.items-delete.title" }, description_text: { key: "todo.actions.items-delete.description" } },
  "todo.items.batch": { title_text: { key: "todo.actions.items-batch.title" }, description_text: { key: "todo.actions.items-batch.description" } },
  "todo.changes.revert": { title_text: { key: "todo.actions.changes-revert.title" }, description_text: { key: "todo.actions.changes-revert.description" } },
  "todo.items.link": { title_text: { key: "todo.actions.items-link.title" }, description_text: { key: "todo.actions.items-link.description" } },
  "todo.reminders.due": { title_text: { key: "todo.actions.reminders-due.title" }, description_text: { key: "todo.actions.reminders-due.description" } },
  "todo.reminders.acknowledge": { title_text: { key: "todo.actions.reminders-acknowledge.title" }, description_text: { key: "todo.actions.reminders-acknowledge.description" } },
  "todo.placement.export": { title_text: { key: "todo.actions.placement-export.title" }, description_text: { key: "todo.actions.placement-export.description" } },
  "todo.placement.put": { title_text: { key: "todo.actions.placement-put.title" }, description_text: { key: "todo.actions.placement-put.description" } },
  "todo.placement.remove": { title_text: { key: "todo.actions.placement-remove.title" }, description_text: { key: "todo.actions.placement-remove.description" } },
  "todo.events": { title_text: { key: "todo.actions.events.title" }, description_text: { key: "todo.actions.events.description" } },
  "todo.search.entries": { title_text: { key: "todo.actions.search-entries.title" }, description_text: { key: "todo.actions.search-entries.description" } },
  "todo.item.subject.read": { title_text: { key: "todo.actions.item-subject-read.title" }, description_text: { key: "todo.actions.item-subject-read.description" } },
  "todo.composer.pick": { title_text: { key: "todo.actions.composer-pick.title" }, description_text: { key: "todo.actions.composer-pick.description" } },
  "todo.fragment.offers": { title_text: { key: "todo.actions.fragment-offers.title" }, description_text: { key: "todo.actions.fragment-offers.description" } },
  "todo.organize.extract": { title_text: { key: "todo.actions.organize-extract.title" }, description_text: { key: "todo.actions.organize-extract.description" } },
  "todo.organize.list": { title_text: { key: "todo.actions.organize-list.title" }, description_text: { key: "todo.actions.organize-list.description" } },
  "todo.organize.get": { title_text: { key: "todo.actions.organize-get.title" }, description_text: { key: "todo.actions.organize-get.description" } },
  "todo.organize.apply": { title_text: { key: "todo.actions.organize-apply.title" }, description_text: { key: "todo.actions.organize-apply.description" } },
  "todo.organize.close": { title_text: { key: "todo.actions.organize-close.title" }, description_text: { key: "todo.actions.organize-close.description" } },
  "todo.batch.subject.read": { title_text: { key: "todo.actions.batch-subject-read.title" }, description_text: { key: "todo.actions.batch-subject-read.description" } },
  "todo.onboarding.draft": { title_text: { key: "todo.actions.onboarding-draft.title" }, description_text: { key: "todo.actions.onboarding-draft.description" } },
  "todo.onboarding.get": { title_text: { key: "todo.actions.onboarding-get.title" }, description_text: { key: "todo.actions.onboarding-get.description" } },
  "todo.onboarding.keep": { title_text: { key: "todo.actions.onboarding-keep.title" }, description_text: { key: "todo.actions.onboarding-keep.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
