import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { createProbePlugin, PROBE_PROJECT_PLUGIN_ID, probeManifest } from "./index.js";

/**
 * The probe's catalog entry, read by `node scripts/generate-plugin-registry.mjs` once its test copies the package into
 * plugins/native/probe in a copy of the repository. It ships in no build.
 */
export const registration: PluginRegistration = {
  project_plugin_id: PROBE_PROJECT_PLUGIN_ID, catalog_order: 900,
  manifest: probeManifest,
  project_runtime: { create: createProbePlugin, package_name: "@molis-ai/molis-work-plugin-probe", factory_export: "createProbePlugin" },
  workbench: { order: 900, contributions: [] },
};
