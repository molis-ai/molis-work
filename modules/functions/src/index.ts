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

export { FunctionsError, assertFunctionKey, assertOptionKey, isPinnedJevModel, suggestFunctionKey } from "./keys.js";
export { hashChoiceConfig, hashFunctionConfig } from "./hash.js";
export { openFunctionsStore, FunctionsStore, assertReadyToPublish, assertReadyToEvaluate } from "./store.js";
export { createFunctionsService, FunctionsService } from "./service.js";
export type { FunctionsSecretPort, TypeSafeProvider, TypeSafeEvaluateResult } from "./service.js";
export { createHttpTypeSafeProvider, readAnswer, readChoiceAnswer, TYPESAFE_SYSTEMONE_URL } from "./provider.js";
export { seedBuiltinFunctions } from "./builtin.js";
