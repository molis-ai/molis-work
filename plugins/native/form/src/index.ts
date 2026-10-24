export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-form",
  packagePath: "plugins/native/form",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["form.ui-contribution.v1", "form.http-routes.v1"],
} as const;

export { FORM_UI_CONTRIBUTION_ID, formUiContribution, formUiDescriptor, renderFormWorkbench } from "./ui.js";
export type { FormUiModel, FormUiPrimitives, FormUiSurface } from "./ui.js";
export { FORM_STYLES } from "./styles.js";
export { FORM_EN } from "./en.js";
export { FORM_MESSAGES } from "./messages.js";
export { FORM_INSTRUCTIONS } from "./prompts.js";
export { FORM_CLIENT_FACTORY_SCRIPT } from "./client.js";
export { createFormPlugin } from "./plugin.js";
export { promoteForm } from "./promote.js";
export type { FormLineHeadPort, FormPublishArtifactPort, FormReadArtifactPort, FormPublicationSnapshot } from "./promote.js";
export { FORM_PLUGIN_ID, FORM_PROJECT_PLUGIN_ID, formManifest } from "./manifest.js";
export { openFormStore, ownFormStores, FormStore, FORM_HOME_STORE, FORM_DATABASE } from "./store.js";
export type { FormSql, FormSqlValue, FormStores } from "./store.js";
export { purgeFormProject, formProjectData } from "./project-data.js";
export { formErrors } from "./error.js";

export { formActions, FORM_ACTION_PERMISSIONS, createFormActionHandlers } from "./actions.js";
export type { FormActionPorts } from "./actions.js";
export { formContentActions, formMarkdown, questionsFromText, createFormContentHandlers } from "./content-actions.js";
export { formFillPageHtml, formResultsCsv, FORM_ANSWER_FORMAT } from "./fillpage.js";
