import type { ActionReference, ActionSceneBinding, ActionSceneConfigureOptions, ActionSceneTarget, ActionSceneUsage, ActionSceneView } from "./actions.js";

/** The Manifest permission that gives a plugin `services.scenes`. Declared and granted like any other; never implied by who published the plugin. */
export const PLUGIN_SCENES_PERMISSION = "scenes:use";

/**
 * The consumption scenes the plugin itself declares (`action_scenes` in its Manifest), as the plugin's own running action sees them:
 * the kernel's scene client with the caller left out. Every method works on the scenes this Manifest declares and refuses any other
 * (`plugin.scene_not_declared`); the caller is the one of the action that is running, never one the plugin passes, and the kernel's
 * checks of the function, the scene, the audience and the permissions apply as they do for any caller (docs/system/SECURITY-INVARIANTS.md S-89).
 */
export interface PluginSceneClient {
  /** The scenes this plugin declares, with how the given judgment fits each. */
  discoverScenes(judgment?: ActionReference): Promise<readonly ActionSceneView[]>;
  /** The bindings of this plugin's scenes, with whether each is available now. */
  usages(judgment?: ActionReference): Promise<readonly ActionSceneUsage[]>;
  /** The places this plugin's scenes are configured. With `scene`, only that scene (which must be declared). */
  targets(judgment?: ActionReference, scene?: Pick<ActionSceneTarget, "scene_id" | "scene_version" | "provider_id">): Promise<readonly ActionSceneTarget[]>;
  /** Saves a binding of one of this plugin's scenes. Not from a query action. */
  bind(binding: ActionSceneBinding, options?: ActionSceneConfigureOptions): Promise<void>;
  /** Runs one binding of one of this plugin's scenes. Only from a concurrent action, which waits for the judgment; not from a query action. */
  runScene(scene: { scene_id: string; version: number }, bindingId: string, event: unknown): Promise<unknown>;
}
