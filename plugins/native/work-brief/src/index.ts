export { BRIEF_ARTIFACT_SCHEMA_VERSION, BRIEF_ARTIFACT_TYPE_ID, BRIEF_KIND, WORK_BRIEF_PLUGIN_ID, WORK_BRIEF_PROJECT_PLUGIN_ID } from "./identity.js";
export { workBriefManifest } from "./manifest.js";
export { createWorkBriefPlugin } from "./plugin.js";
export { createHomeWorkBriefPlugin } from "./home-plugin.js";
export { WORK_BRIEF_SLOTS, WORK_BRIEF_UI_CONTRIBUTION_ID, workBriefUiContribution } from "./ui.js";
export { workBriefActions, workBriefPersonalActions, WORK_BRIEF_READ, WORK_BRIEF_WRITE } from "./actions.js";
export type { BriefRefreshed, BriefSaved, BriefView, PersonalItem, PersonalView } from "./actions.js";
export { workBriefPresentation, workBriefPresentationActions, WORK_BRIEF_VIEW_ID } from "./presentation.js";
export { briefArtifactPreview } from "./fix.js";
export { WORK_BRIEF_DATABASE } from "./database.js";
export { BriefStore } from "./store.js";
export { workBriefErrors } from "./error.js";
export { BRIEF_LIMITS, compareBriefBodies, sourceTurn } from "./model.js";
export type { AttentionItem, BriefBody, BriefChange, BriefEdit, BriefFixed, BriefProposal, BriefRecord, BriefScope, BriefVersion, BriefVersionHead, Cite, Claim, NextMark, NextMarkState,
  NextOption, ProducedBy, ProposalConflict, SourceRow } from "./model.js";
export { WORK_BRIEF_CLIENT_FACTORY_SCRIPT } from "./client.js";
