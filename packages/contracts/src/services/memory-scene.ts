/** Scenes a plugin may declare on its Manifest (`memory_scene`, PEQ-09). */
export type MemoryPluginScene = "coding" | "common";

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
