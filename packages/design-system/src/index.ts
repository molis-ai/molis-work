export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-design-system",
  packagePath: "packages/design-system",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/ui",
  migrationGoals: ["goal-reorg-f2","goal-reorg-ap3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [
    "design-system.theme.v1",
    "design-system.tokens.v1",
    "design-system.accessibility.v1",
  ],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export {
  MOLIS_WORK_DENSITY_STORAGE_KEY,
  MOLIS_WORK_TERMINAL_THEME_STORAGE_KEY,
  MOLIS_WORK_THEME_STORAGE_KEY,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  VISUAL_FOUNDATION_STYLES,
  type MolisWorkDensity,
  type MolisWorkTerminalTheme,
  type MolisWorkTheme,
} from "./visual-foundation.js";

export { ONBOARDING_STYLES } from "./onboarding-styles.js";

export { icon, renderIconSprite, type MolisWorkIcon } from "./icons.js";
