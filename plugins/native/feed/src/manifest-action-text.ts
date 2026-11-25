import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";

const ACTION_TEXT: Readonly<Record<string, { readonly title_text: TextRef; readonly description_text: TextRef }>> = {
  "feed.artifacts.preview": { title_text: { key: "feed.actions.artifacts-preview.title" }, description_text: { key: "feed.actions.artifacts-preview.description" } },
  "feed.content.list": { title_text: { key: "feed.actions.content-list.title" }, description_text: { key: "feed.actions.content-list.description" } },
  "feed.content.read": { title_text: { key: "feed.actions.content-read.title" }, description_text: { key: "feed.actions.content-read.description" } },
  "feed.content.receive": { title_text: { key: "feed.actions.content-receive.title" }, description_text: { key: "feed.actions.content-receive.description" } },
  "feed.stage.read": { title_text: { key: "feed.actions.stage-read.title" }, description_text: { key: "feed.actions.stage-read.description" } },
  "feed.items.reader": { title_text: { key: "feed.actions.items-reader.title" }, description_text: { key: "feed.actions.items-reader.description" } },
  "feed.goals.context": { title_text: { key: "feed.actions.goals-context.title" }, description_text: { key: "feed.actions.goals-context.description" } },
  "feed.snapshot": { title_text: { key: "feed.actions.snapshot.title" }, description_text: { key: "feed.actions.snapshot.description" } },
  "feed.items.get": { title_text: { key: "feed.actions.items-get.title" }, description_text: { key: "feed.actions.items-get.description" } },
  "feed.connections.status": { title_text: { key: "feed.actions.connections-status.title" }, description_text: { key: "feed.actions.connections-status.description" } },
  "feed.rules.recommendations": { title_text: { key: "feed.actions.rules-recommendations.title" }, description_text: { key: "feed.actions.rules-recommendations.description" } },
  "feed.rules.judgments": { title_text: { key: "feed.actions.rules-judgments.title" }, description_text: { key: "feed.actions.rules-judgments.description" } },
  "feed.rules.preview-judgment": { title_text: { key: "feed.actions.rules-preview-judgment.title" }, description_text: { key: "feed.actions.rules-preview-judgment.description" } },
  "feed.rules.list": { title_text: { key: "feed.actions.rules-list.title" }, description_text: { key: "feed.actions.rules-list.description" } },
  "feed.rules.create": { title_text: { key: "feed.actions.rules-create.title" }, description_text: { key: "feed.actions.rules-create.description" } },
  "feed.rules.update": { title_text: { key: "feed.actions.rules-update.title" }, description_text: { key: "feed.actions.rules-update.description" } },
  "feed.rules.delete": { title_text: { key: "feed.actions.rules-delete.title" }, description_text: { key: "feed.actions.rules-delete.description" } },
  "feed.rules.evaluate": { title_text: { key: "feed.actions.rules-evaluate.title" }, description_text: { key: "feed.actions.rules-evaluate.description" } },
  "feed.rules.preview": { title_text: { key: "feed.actions.rules-preview.title" }, description_text: { key: "feed.actions.rules-preview.description" } },
  "feed.items.offers": { title_text: { key: "feed.actions.items-offers.title" }, description_text: { key: "feed.actions.items-offers.description" } },
  "feed.items.read": { title_text: { key: "feed.actions.items-read.title" }, description_text: { key: "feed.actions.items-read.description" } },
  "feed.items.inbox": { title_text: { key: "feed.actions.items-inbox.title" }, description_text: { key: "feed.actions.items-inbox.description" } },
  "feed.items.disposition": { title_text: { key: "feed.actions.items-disposition.title" }, description_text: { key: "feed.actions.items-disposition.description" } },
  "feed.items.restore": { title_text: { key: "feed.actions.items-restore.title" }, description_text: { key: "feed.actions.items-restore.description" } },
  "feed.items.promote": { title_text: { key: "feed.actions.items-promote.title" }, description_text: { key: "feed.actions.items-promote.description" } },
  "feed.sources.register": { title_text: { key: "feed.actions.sources-register.title" }, description_text: { key: "feed.actions.sources-register.description" } },
  "feed.sources.add_account": { title_text: { key: "feed.actions.sources-add-account.title" }, description_text: { key: "feed.actions.sources-add-account.description" } },
  "feed.sources.update": { title_text: { key: "feed.actions.sources-update.title" }, description_text: { key: "feed.actions.sources-update.description" } },
  "feed.sources.delete": { title_text: { key: "feed.actions.sources-delete.title" }, description_text: { key: "feed.actions.sources-delete.description" } },
  "feed.sources.schedule": { title_text: { key: "feed.actions.sources-schedule.title" }, description_text: { key: "feed.actions.sources-schedule.description" } },
  "feed.sources.enabled": { title_text: { key: "feed.actions.sources-enabled.title" }, description_text: { key: "feed.actions.sources-enabled.description" } },
  "feed.sources.disconnect": { title_text: { key: "feed.actions.sources-disconnect.title" }, description_text: { key: "feed.actions.sources-disconnect.description" } },
  "feed.sources.sync": { title_text: { key: "feed.actions.sources-sync.title" }, description_text: { key: "feed.actions.sources-sync.description" } },
  "feed.sources.tick": { title_text: { key: "feed.actions.sources-tick.title" }, description_text: { key: "feed.actions.sources-tick.description" } },
  "feed.items.admission": { title_text: { key: "feed.actions.items-admission.title" }, description_text: { key: "feed.actions.items-admission.description" } },
  "feed.items.material": { title_text: { key: "feed.actions.items-material.title" }, description_text: { key: "feed.actions.items-material.description" } },
  "feed.items.content": { title_text: { key: "feed.actions.items-content.title" }, description_text: { key: "feed.actions.items-content.description" } },
  "feed.briefs.read": { title_text: { key: "feed.actions.briefs-read.title" }, description_text: { key: "feed.actions.briefs-read.description" } },
  "feed.items.admit": { title_text: { key: "feed.actions.items-admit.title" }, description_text: { key: "feed.actions.items-admit.description" } },
  "feed.notifications.receive": { title_text: { key: "feed.actions.notifications-receive.title" }, description_text: { key: "feed.actions.notifications-receive.description" } },
  "feed.subject.read": { title_text: { key: "feed.actions.subject-read.title" }, description_text: { key: "feed.actions.subject-read.description" } },
  "feed.source.subject.read": { title_text: { key: "feed.actions.source-subject-read.title" }, description_text: { key: "feed.actions.source-subject-read.description" } },
  "feed.search.entries": { title_text: { key: "feed.actions.search-entries.title" }, description_text: { key: "feed.actions.search-entries.description" } },
  "feed.events": { title_text: { key: "feed.actions.events.title" }, description_text: { key: "feed.actions.events.description" } },
  "feed.runs.overview": { title_text: { key: "feed.actions.runs-overview.title" }, description_text: { key: "feed.actions.runs-overview.description" } },
  "feed.runs.decide": { title_text: { key: "feed.actions.runs-decide.title" }, description_text: { key: "feed.actions.runs-decide.description" } },
  "feed.sources.wake": { title_text: { key: "feed.actions.sources-wake.title" }, description_text: { key: "feed.actions.sources-wake.description" } },
  "feed.demo.seed": { title_text: { key: "feed.actions.demo-seed.title" }, description_text: { key: "feed.actions.demo-seed.description" } },
  "feed.information.plan": { title_text: { key: "feed.actions.information-plan.title" }, description_text: { key: "feed.actions.information-plan.description" } },
  "feed.presentation.values": { title_text: { key: "feed.actions.presentation-values.title" }, description_text: { key: "feed.actions.presentation-values.description" } },
  "feed.presentation.overview": { title_text: { key: "feed.actions.presentation-overview.title" }, description_text: { key: "feed.actions.presentation-overview.description" } },
  "feed.content.hold": { title_text: { key: "feed.actions.content-hold.title" }, description_text: { key: "feed.actions.content-hold.description" } },
  "feed.content.release": { title_text: { key: "feed.actions.content-release.title" }, description_text: { key: "feed.actions.content-release.description" } },
  "feed.content.reclaim": { title_text: { key: "feed.actions.content-reclaim.title" }, description_text: { key: "feed.actions.content-reclaim.description" } },
};

export function localizeManifestActions(definitions: readonly ActionDefinition[]): ActionDefinition[] {
  return definitions.map((definition) => {
    const text = ACTION_TEXT[definition.capability_id];
    if (!text) return definition;
    return { ...definition, action: { ...definition.action, ...text } };
  });
}
