import { shippedParts } from "./plugin-registry.js";

/**
 * The local Web owner already has access to shipped native content stations and scene-hosting plugins, derived from the same
 * generated registrations Runtime uses (PEQ-09, PG-031); no plugin package import or plugin id list. This is not a plugin-grant mechanism.
 */
export const NATIVE_CONTENT_PERMISSIONS = [...new Set(shippedParts().flatMap(({ manifest }) => {
  const actions = manifest.actions ?? [];
  const scenes = manifest.action_scenes ?? [];
  return [
    ...actions.filter(definition => definition.action.workflow_content).flatMap(definition => definition.action.permissions),
    ...(scenes.length > 0 ? [...actions.flatMap(definition => definition.action.permissions), ...scenes.flatMap(scene => scene.permissions)] : []),
  ];
}))];
