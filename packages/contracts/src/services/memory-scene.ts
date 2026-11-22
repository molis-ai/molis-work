import { isPluginSceneName, SCENE_NAME_PATTERN } from "../platform/plugin-agent.js";

/**
 * A memory scene: the Assistant's `assistant`, the shared `common`, or a scene a plugin declares on its Manifest (`memory_scene`,
 * PEQ-09, BL-b44-coding-scene-enum). The platform names no plugin's scene.
 */
export type MemoryScene = string;
/** What a plugin may declare on its Manifest (`memory_scene`): its own scene name, or `common` for none of its own. */
export type MemoryPluginScene = string;
export const isMemoryScene = (value: unknown): value is MemoryScene => value === "assistant" || value === "common" || isPluginSceneName(value);
export const isMemoryPluginScene = (value: unknown): value is MemoryPluginScene => value === "common" || isPluginSceneName(value);
/** A memory scene as a schema. */
export const MEMORY_SCENE_SCHEMA = { anyOf: [{ enum: ["assistant", "common"] }, { type: "string", pattern: SCENE_NAME_PATTERN, not: { enum: ["agent", "both"] } }] } as const;
/** The scene of a business session whose memory is managed: the Assistant's, or a plugin's own (never `common`). */
export const MEMORY_SESSION_SCENE_SCHEMA = { anyOf: [{ const: "assistant" }, { type: "string", pattern: SCENE_NAME_PATTERN, not: { enum: ["common", "agent", "both"] } }] } as const;
export const isMemorySessionScene = (value: unknown): value is MemoryScene => value === "assistant" || isPluginSceneName(value);

/** Typed action-role protocol for reading a plugin session's runtime binding (`memory-session-binding`, PEQ-09). */
export const MEMORY_SESSION_BINDING_INPUT_TYPE = /* @version type.molis.memory.session-binding.request "molis.memory.session-binding.v{version}.request" */ "molis.memory.session-binding.v1.request";
export const MEMORY_SESSION_BINDING_OUTPUT_TYPE = /* @version type.molis.memory.session-binding.result "molis.memory.session-binding.v{version}.result" */ "molis.memory.session-binding.v1.result";

export function isMemorySessionBindingAction(view: {
  readonly operation: string;
  readonly action: { readonly input_type?: string; readonly output_type?: string };
}): boolean {
  return view.operation === "query"
    && view.action.input_type === MEMORY_SESSION_BINDING_INPUT_TYPE
    && view.action.output_type === MEMORY_SESSION_BINDING_OUTPUT_TYPE;
}

/** Resolve a memory caller's scene from explicit context only, never by hardcoding a plugin id (PEQ-09). */
export function memorySceneOfCaller(caller: { readonly current_scene?: string; readonly consumer?: string }): string {
  return caller.current_scene ?? (caller.consumer === "assistant" ? "assistant" : "common");
}
