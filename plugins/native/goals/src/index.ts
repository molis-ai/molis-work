export * from "./decision-view.js";
export * from "./decision-groups.js";
export * from "./decision-results.js";
export * from "./decision-results-ui.js";
export * from "./proposal-styles.js";
export * from "./proposal-en.js";
export * from "./proposal-client.js";
export * from "./proposal-ui.js";
export * from "./proposal-ui-model.js";
export * from "./board-entry-capabilities.js";
export * from "./board-import-contract.js";
export * from "./entry-composition-capabilities.js";
export * from "./goals-entry-capabilities.js";
export * from "./goal-event-application.js";
export * from "./goal-event-entry-capabilities.js";
export * from "./proposal-capabilities.js";
export * from "./goal-entry-contract.js";
export * from "./goal-tree-query.js";
export * from "./goal-tree-submission.js";
export * from "./goal-tree-fact-materializer.js";
export * from "./goal-tree-materialization-conflicts.js";
export * from "./goal-tree-materialization.js";
export * from "./goal-tree-check.js";
export * from "./proposal-normalizer.js";
export * from "./proposal-item-validation.js";
export * from "./goal-tree-inputs.js";
export * from "./goal-tree-materialization-order.js";
export * from "./goal-tree-contract.js";
export * from "./policy-ui.js";
export * from "./policy-ui-model.js";
export { GOALS_POLICY_EN } from "./policy-en.js";
export * from "./safety-ui.js";
export * from "./safety-ui-model.js";
export * from "./risk-presentation.js";
export * from "./tree-order.js";
export { GOALS_SAFETY_EN } from "./safety-en.js";
export * from "./policy-client.js";
export * from "./relation-ui.js";
export * from "./relation-ui-model.js";
export * from "./relation-presentation.js";
export * from "./relation-client.js";
export { GOALS_RELATION_EN } from "./relation-en.js";
export * from "./tree-ui.js";
export * from "./tree-ui-model.js";
export * from "./collection-model.js";
export * from "./tree-presentation.js";
export { GOALS_TREE_EN } from "./tree-en.js";
export * from "./tree-client.js";
export * from "./momentum-model.js";
export { buildGoalMomentumView } from "./momentum-view.js";
export * from "./momentum-ui-model.js";
export * from "./momentum-ui.js";
export { GOALS_WORKSPACE_EN } from "./workspace-en.js";
export { GOALS_MOMENTUM_EN } from "./momentum-en.js";
export * from "./momentum-client.js";
export * from "./document-ui-model.js";
export * from "./document-ui.js";
export { GOALS_EVENT_DOCUMENT_STYLES } from "./event-document-styles.js";
export { GOALS_EVENT_DOCUMENT_CLIENT_FACTORY_SCRIPT } from "./event-document-client.js";
export { createGoalEventDocumentView, attachEventDocument, eventDirectoryPresentation, listGoalDocumentHistory, findHistoryIndexItem } from "./event-document-model.js";
export { mergeGoalHistoryItems, pageHistoryItems, mapLegacyHistoryItems, mapJournalHistoryItems, isNewWorkJournalType, mixedPageIsStable } from "./event-history-map.js";
export { renderHistoryItemBody, renderWorkEventBody, formatEventTime } from "./event-history-body.js";
export * from "./context-ui-model.js";
export * from "./context-ui.js";
export * from "./planning-ui-model.js";
export * from "./planning-ui.js";
export * from "./planning-client.js";
export * from "./planning-styles.js";
export * from "./planning-en.js";
export * from "./planning-routes.js";
export { PROJECT_RULES_CLIENT_SCRIPT } from "./project-policy-client.js";
export { PROJECT_RULES_SETTINGS_STYLES } from "./project-policy-styles.js";
export * from "./goal-state-copy.js";
export * from "./goal-state-explanation.js";
export * from "./action-presentation.js";
export * from "./status-ui.js";
export * from "./factors-ui.js";
export * from "./status-en.js";
export * from "./dialogs-ui.js";
export * from "./dialogs-client.js";
export * from "./dialogs-en.js";
export * from "./document-routes.js";
export * from "./document-client.js";
export * from "./refresh-client.js";
export * from "./panels-client.js";
export * from "./navigation-client.js";
export * from "./navigation-model.js";
export * from "./work-tabs-client.js";
export { GOALS_CONTEXT_EN } from "./context-en.js";
export { GOALS_DOCUMENT_EN } from "./document-en.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-goals",
  packagePath: "plugins/native/goals",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2","goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8","goal-reorg-gw4","goal-reorg-gw5","goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["goals.event-application.v1", "goals.policy-ui.v1", "goals.safety-ui.v1", "goals.relation-ui.v1", "goals.tree-ui.v1", "goals.momentum-ui.v1", "goals.document-ui.v1", "goals.context-ui.v1", "goals.planning-ui.v1", "goals.status-ui.v1", "goals.factors-ui.v1", "goals.dialogs-ui.v1", "goals.document-routes.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export { GoalTreeDecisionNormalizer, type NormalizedGoalTreeProposalDecision } from "./goal-tree-decision-inputs.js";
export { GoalTreeDecisionFollowup } from "./goal-tree-decision-followup.js";
export { GoalTreeDecisionApplication } from "./goal-tree-decision.js";
export { GoalTreeWebDecisionInput } from "./goal-tree-web-decision-input.js";
export { explainGoalDecision, type HumanDecisionKind, type DecisionCopy } from "./decision-copy.js";
export { createGoalsDecisionPresentation, type GoalsDecisionPresentationPrimitives, type DecisionEventKind } from "./decision-common-ui.js";

export { GoalReadApplication, projectGoalLifecycle } from "./goal-query-application.js";
export { GoalDecisionAttentionSync } from "./goal-decision-attention.js";

export { readMolisWorkSnapshot, type MolisWorkSnapshotPorts } from "./board-snapshot-query.js";

export { MolisWorkV1Error } from "./errors.js";

export { TRASH_GOAL_STYLES } from "./trash-document-styles.js";

export { GOALS_PRESENTATION_STATES, type GoalsDocumentView, type GoalsCoverageItem, type GoalsInputBinding } from "./document-view.js";

export { countGoalDecisions } from "./decision-groups.js";

export { buildGoalsDocumentCollection } from "./document-collection.js";
export type { GoalsDocumentReadPorts } from "./document-read-ports.js";
export * from "./board-v3-import.js";
export { handleGoalsWebHttp } from "./http/index.js";
export { handleGoalEventDecisionHttp } from "./http/event-decisions.js";
export type { GoalsHttpContext } from "./http/types.js";
