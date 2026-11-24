import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "schedule.tasks.list": { title_text: { key: "schedule.actions.tasks-list.title" }, description_text: { key: "schedule.actions.tasks-list.description" } },
  "schedule.reminders.list": { title_text: { key: "schedule.actions.reminders-list.title" }, description_text: { key: "schedule.actions.reminders-list.description" } },
  "schedule.tasks.readiness": { title_text: { key: "schedule.actions.tasks-readiness.title" }, description_text: { key: "schedule.actions.tasks-readiness.description" } },
  "schedule.tasks.create": { title_text: { key: "schedule.actions.tasks-create.title" }, description_text: { key: "schedule.actions.tasks-create.description" } },
  "schedule.tasks.update": { title_text: { key: "schedule.actions.tasks-update.title" }, description_text: { key: "schedule.actions.tasks-update.description" } },
  "schedule.tasks.archive": { title_text: { key: "schedule.actions.tasks-archive.title" }, description_text: { key: "schedule.actions.tasks-archive.description" } },
  "schedule.tasks.enabled": { title_text: { key: "schedule.actions.tasks-enabled.title" }, description_text: { key: "schedule.actions.tasks-enabled.description" } },
  "schedule.tasks.open": { title_text: { key: "schedule.actions.tasks-open.title" }, description_text: { key: "schedule.actions.tasks-open.description" } },
  "schedule.jobs.enabled": { title_text: { key: "schedule.actions.jobs-enabled.title" }, description_text: { key: "schedule.actions.jobs-enabled.description" } },
  "schedule.reminders.recover": { title_text: { key: "schedule.actions.reminders-recover.title" }, description_text: { key: "schedule.actions.reminders-recover.description" } },
  "schedule.operations.recover": { title_text: { key: "schedule.actions.operations-recover.title" }, description_text: { key: "schedule.actions.operations-recover.description" } },
  "schedule.search.entries": { title_text: { key: "schedule.actions.search-entries.title" }, description_text: { key: "schedule.actions.search-entries.description" } },
  "schedule.subject.read": { title_text: { key: "schedule.actions.subject-read.title" }, description_text: { key: "schedule.actions.subject-read.description" } },
  "reminders.add": { title_text: { key: "schedule.actions.reminders-add.title" }, description_text: { key: "schedule.actions.reminders-add.description" } },
  "reminders.cancel": { title_text: { key: "schedule.actions.reminders-cancel.title" }, description_text: { key: "schedule.actions.reminders-cancel.description" } },
  "schedules.add": { title_text: { key: "schedule.actions.schedules-add.title" }, description_text: { key: "schedule.actions.schedules-add.description" } },
  "schedules.cancel": { title_text: { key: "schedule.actions.schedules-cancel.title" }, description_text: { key: "schedule.actions.schedules-cancel.description" } },
  "schedule.task.wakeup": { title_text: { key: "schedule.actions.task-wakeup.title" }, description_text: { key: "schedule.actions.task-wakeup.description" } },
  "schedule.reminder.wakeup": { title_text: { key: "schedule.actions.reminder-wakeup.title" }, description_text: { key: "schedule.actions.reminder-wakeup.description" } },
  "schedule.operation.wakeup": { title_text: { key: "schedule.actions.operation-wakeup.title" }, description_text: { key: "schedule.actions.operation-wakeup.description" } },
  "schedule.runs.overview": { title_text: { key: "schedule.actions.runs-overview.title" }, description_text: { key: "schedule.actions.runs-overview.description" } },
  "schedule.runs.decide": { title_text: { key: "schedule.actions.runs-decide.title" }, description_text: { key: "schedule.actions.runs-decide.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
