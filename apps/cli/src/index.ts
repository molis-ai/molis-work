export { createCliGoalTreeHandlers } from "./goal-tree-commands.js";

export {
  DEFAULT_CLI_DATABASE,
  cliFlagValue,
  readCliJsonPayload,
  printCliJson,
  cliGoalUrl,
  printV1Help,
} from "./protocol.js";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-app-cli",
  packagePath: "apps/cli",
  kind: "app",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/app-host",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-dv1", "goal-reorg-gw4", "goal-reorg-ex4"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { dispatchCliProjectCommand } from "./command-dispatch.js";
export { dispatchCli } from "./dispatch.js";
export type { CliCommandPorts } from "./dispatch.js";
