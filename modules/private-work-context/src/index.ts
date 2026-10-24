export * from "@molis-ai/molis-work-contracts/modules/private-work-context";
export {
  createRuntimeContextBindingTables,
  createRuntimeContextSetupRequestTable,
  createRuntimeContextSuggestionRejectionTable,
  type RuntimeContextSetupRequestRecord,
} from "./context-bindings.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-private-work-context",
  packagePath: "modules/private-work-context",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/private-work-context",
  migrationGoals: ["goal-reorg-f2","goal-reorg-wk1"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "runtime-context-bindings",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { RuntimeProjectResolution, boundResolution } from "./project-resolution.js";

export { createRuntimeProjectBindingValidation, type RuntimeProjectBindingValidation } from "./project-binding-validation.js";

export { RuntimeProjectBindingCommands, type RuntimeProjectBindingPorts } from "./project-binding-commands.js";

export { createRuntimeProjectSetup, type RuntimeProjectSetupPorts } from "./project-setup.js";
export { createRuntimeContextModule, type RuntimeContextModuleOptions } from "./runtime-context-module.js";
