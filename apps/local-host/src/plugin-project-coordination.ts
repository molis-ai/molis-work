import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Whether a Manifest declares what only a project's plugin platform serves: ports, events, 成果 and process items. Their wiring,
 * journals and event queues live in a project's database and under its supervisor, so a Home instance is given none of them;
 * a plugin that needs them runs as a dual-instance plugin and its project half gets them (specs/dual-instance-plugins, PG-025).
 */
export function declaresProjectCoordination(manifest: PluginManifest): boolean {
  return Boolean(manifest.ports?.inputs.length || manifest.ports?.outputs.length || manifest.events?.publishes.length || manifest.events?.subscribes.length
    || manifest.artifacts.produces.length || manifest.artifacts.consumes.length || manifest.process_items?.produces.length || manifest.process_items?.consumes.length);
}
