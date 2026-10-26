export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-probe",
  packagePath: "plugins/native/probe",
  kind: "native-plugin",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: [],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: [],
} as const;

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { PROBE_PLUGIN_ID, PROBE_PROJECT_PLUGIN_ID, PROBE_VERSION, probeManifest } from "./manifest.js";
export { PROBE_ACTIONS, PROBE_KEEP_JOB, PROBE_READ, PROBE_SUBJECT_KIND, PROBE_WRITE, probeActions, type ProbeNote } from "./actions.js";
export { probeMethods } from "./methods.js";
export { createProbePlugin } from "./plugin.js";
