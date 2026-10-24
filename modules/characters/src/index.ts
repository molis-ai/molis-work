export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-characters", packagePath: "modules/characters",
  kind: "module", maturity: "partial", contract: "@molis-ai/molis-work-contracts/modules/characters",
  migrationGoals: ["goal-reorg-f2", "coding-c12"], ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["characters.query.v1", "characters.command.v1", "characters.actions.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export { CharactersService } from "./service.js";
export { CHARACTERS_HOME_STORE, CHARACTERS_STORE_BASELINE, openCharacterRuns, openCharacters } from "./open.js";
export { charactersProjectData, purgeCharactersProject } from "./project-data.js";
export { createCharactersActionHandlers } from "./action-handlers.js";
export { bindCharactersActions, characterCallGuard, type CharacterCallGuard } from "./action-bindings.js";
export { CHARACTER_ACTION_PERMISSIONS, CHARACTERS_ACTIONS, charactersActions } from "./actions.js";
export type { CharactersActionHandlers, CharactersActionPorts, CharactersActionRuntime, CharacterLaunchInput, CharacterUpdateInput } from "./action-handlers.js";
export type { CharactersAgentCatalog } from "./agent-actions.js";
export type { CharacterLaunchControl, CharactersImportPorts, CharacterTerminalAttach } from "./imports.js";
export type { CharacterNativeRun, CharacterRunRecord, CharacterRuns } from "./runs.js";
