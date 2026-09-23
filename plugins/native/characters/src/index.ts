export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-characters", packagePath: "plugins/native/characters", kind: "native-plugin", maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin", migrationGoals: ["goal-reorg-f2", "coding-c12"], ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["characters.ui-contribution.v1", "characters.http-routes.v1"],
} as const;
export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export { createCharactersPlugin } from "./plugin.js";
export type { CharactersPluginPorts } from "./plugin.js";
export type { CharactersImportPorts, CharacterNativeRun } from "./imports.js";
export { charactersManifest, CHARACTERS_PROJECT_PLUGIN_ID } from "./manifest.js";
export { charactersUiContribution, CHARACTERS_UI_CONTRIBUTION_ID, renderCharacters } from "./ui.js";
export type { CharactersUiModel } from "./ui.js";
export { CHARACTERS_STYLES } from "./styles.js";
export { CHARACTERS_CLIENT_FACTORY_SCRIPT } from "./client.js";
