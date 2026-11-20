import type { MemoryPluginScene } from "@molis-ai/molis-work-contracts/services/memory";
import { builtinPluginByManifestId } from "../plugin-registry.js";

/** Read a plugin's declared memory scene from its Manifest (`memory_scene`, PEQ-09); undeclared plugins default to `"common"`. */
export function pluginMemoryScene(pluginId: string | null | undefined, explicit?: MemoryPluginScene): MemoryPluginScene {
  if (explicit) return explicit;
  return (pluginId && builtinPluginByManifestId(pluginId)?.manifest.memory_scene) || "common";
}
