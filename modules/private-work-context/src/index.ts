export * from "@molis-ai/molis-work-contracts/modules/private-work-context";
export { findSessionForHostSignals } from "./session-host-signals.js";
export { createSessionContentStore, type SessionContentStore } from "./content-store.js";
export {
  createRuntimeContextBindingTables,
  createRuntimeContextSetupRequestTable,
  createRuntimeContextSuggestionRejectionTable,
  type RuntimeContextSetupRequestRecord,
} from "./context-bindings.js";

export {
  MolisWorkSessionRegistry,
  type MolisWorkSessionRegistryOptions,
} from "./session-registry.js";
export {
  SESSION_REGISTRY_OWNER,
} from "./session-schema.js";
export { purgeSessionsProject, sessionsProjectData, type SessionLedgerFactory } from "./project-data.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-private-work-context",
  packagePath: "modules/private-work-context",
  kind: "module",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/modules/private-work-context",
  migrationGoals: ["goal-reorg-f2","goal-reorg-wk1"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "private-session-registry",
    "encrypted-content-store",
    "session-events",
    "session-handoff-facts",
    "panel-and-binding-sessions",
    "runtime-context-bindings",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { RuntimeProjectResolution, boundResolution } from "./project-resolution.js";

export { createRuntimeProjectBindingValidation, type RuntimeProjectBindingValidation } from "./project-binding-validation.js";

export { RuntimeProjectBindingCommands, type RuntimeProjectBindingPorts } from "./project-binding-commands.js";

export { createRuntimeProjectSetup, type RuntimeProjectSetupPorts } from "./project-setup.js";
export { createRuntimeContextModule, type RuntimeContextModuleOptions } from "./runtime-context-module.js";
export { type SessionReplicationSupport, type SessionReplicaJournal, type SessionReplicaOwner } from "./session-replication-journal.js";
export { sessionSyncReferenceDeclaration } from "./session-reference-scope.js";
export { hasSessionSyncProtectedData } from "./session-database.js";
export { withWorkSessionReplica, type WorkSessionReplicationOptions } from "./session-sync.js";
