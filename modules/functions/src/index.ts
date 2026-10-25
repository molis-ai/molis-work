export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-functions",
  packagePath: "modules/functions",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/functions",
  migrationGoals: [],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["functions.query.v1", "functions.command.v1", "functions.evaluate"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { functionsErrors, assertFunctionKey, assertOptionKey, isPinnedJevModel, suggestFunctionKey } from "./keys.js";
export { hashChoiceConfig, hashFunctionConfig } from "./hash.js";
export { FUNCTIONS_STORE_BASELINE, FUNCTIONS_HOME_STORE } from "./store-schema.js";
export { assertReadyToPublish, assertReadyToEvaluate } from "./record-rules.js";
export type { RecordJudgmentInput } from "./judgments.js";
export type { DeclaredRuleSubject, DeclaredSceneRule, ForgottenDeclaredRules } from "./declared-rules.js";
export { purgeFunctionsProject, functionsProjectData } from "./project-data.js";
export { admitDeclaredRulesIn, forgetDeclaredRulesIn } from "./declared-rules-home.js";
export { createFunctionsService, FunctionsService } from "./service.js";
export type { FunctionsServiceOptions, TypeSafeProvider, TypeSafeEvaluateResult } from "./service.js";
export { createTypeSafeProvider, type TypeSafeExecution, readAnswer, TYPESAFE_SYSTEMONE_URL } from "./provider.js";

export { FUNCTIONS_PROVIDER_ID, functionsActions, publishedFunctionAction, publishedFunctionReference, publishedFunctionKey, functionsActionProvider, publishedFunctionProvider } from "./actions.js";
export type { FunctionsActionPorts } from "./actions.js";
export { functionAuthoringActions, functionContextActions } from "./authoring-actions.js";
