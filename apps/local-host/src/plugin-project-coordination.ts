import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * Whether a Manifest declares what only a project's plugin platform serves: ports, events, and 成果 or process items it pins. Their
 * wiring, journals and event queues live in a project's database and under its supervisor, so a Home instance is given none of them;
 * a plugin that needs them runs as a dual-instance plugin and its project half gets them (specs/archive/dual-instance-plugins, PG-025).
 * Reading what it consumes is not among them: a Home instance reads the 成果 of the project each call is for (`homePluginArtifactsFor`, 44B).
 */
export function declaresProjectHalf(manifest: PluginManifest): boolean {
  return Boolean(manifest.ports?.inputs.length || manifest.ports?.outputs.length || manifest.events?.publishes.length || manifest.events?.subscribes.length
    || manifest.artifacts.produces.length || manifest.process_items?.produces.length);
}

/**
 * The same, and what it consumes as well: what a sandboxed package in the Home is refused, as the sandbox does not carry a Home
 * instance's per-call reads of a project's 成果 yet.
 */
export function declaresProjectCoordination(manifest: PluginManifest): boolean {
  return declaresProjectHalf(manifest) || Boolean(manifest.artifacts.consumes.length || manifest.process_items?.consumes.length);
}
