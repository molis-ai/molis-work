export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-module-characters", packagePath: "modules/characters",
  kind: "module", maturity: "partial", contract: "@molis-ai/molis-work-contracts/modules/characters",
  migrationGoals: ["goal-reorg-f2", "coding-c12"], ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["characters.query.v1", "characters.command.v1"],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;
export { CharactersService } from "./service.js";
export { CHARACTERS_STORE_BASELINE, openCharacters } from "./open.js";
