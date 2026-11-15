export { WORK_BRIEF_PLUGIN_ID } from "./identity.js";
export { createWorkBriefPlugin } from "./plugin.js";
export { createHomeWorkBriefPlugin } from "./home-plugin.js";
export { workBriefActions, workBriefPersonalActions, WORK_BRIEF_WRITE } from "./actions.js";
export type { BriefRefreshed, BriefSaved, BriefView, PersonalView } from "./actions.js";
export { workBriefPresentationActions, WORK_BRIEF_VIEW_ID } from "./presentation.js";
export type { BriefVersion, Cite, Claim, SourceRow } from "./model.js";
