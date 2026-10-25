import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

/** Plugin code receives no Host-issued identity and can edit its view without changing the Runtime's original controls. */
export function pluginCallbackContext<C extends ActionCallContext>(caller: C): C {
  const view = { ...caller, permissions: [...caller.permissions],
    ...(caller.allowed_capability_ids ? { allowed_capability_ids: [...caller.allowed_capability_ids] } : {}),
    ...(caller.allowed_actions ? { allowed_actions: caller.allowed_actions.map(reference => ({ ...reference })) } : {}),
    ...(caller.signal ? { signal: AbortSignal.any([caller.signal]) } : {}),
    ...(caller.page_context ? { page_context: { ...caller.page_context } } : {}),
    ...(caller.user_action ? { user_action: { ...caller.user_action } } : {}),
    ...(caller.scene_binding ? { scene_binding: { ...caller.scene_binding } } : {}),
    ...(caller.assistant_reply ? { assistant_reply: structuredClone(caller.assistant_reply) } : {}),
    ...(caller.original_input ? { original_input: structuredClone(caller.original_input) } : {}),
  };
  Reflect.deleteProperty(view, "host_plugin");
  // The Host's own list of projects the person may reach (PG-014) is set by `pluginActionProvider` after this; what a caller carried in is not.
  Reflect.deleteProperty(view, "readable_project_ids");
  return view;
}
