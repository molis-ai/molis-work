import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

/** Plugin code receives no Host-issued identity and can edit its view without changing the Runtime's original controls. */
export function pluginCallbackContext<C extends ActionCallContext>(caller: C): C {
  const view = dropIssuedIdentity({ ...caller, permissions: [...caller.permissions],
    ...(caller.allowed_capability_ids ? { allowed_capability_ids: [...caller.allowed_capability_ids] } : {}),
    ...(caller.allowed_actions ? { allowed_actions: caller.allowed_actions.map(reference => ({ ...reference })) } : {}),
    ...(caller.page_context ? { page_context: { ...caller.page_context } } : {}),
    ...(caller.user_action ? { user_action: { ...caller.user_action } } : {}),
    ...(caller.scene_binding ? { scene_binding: { ...caller.scene_binding } } : {}),
    ...(caller.assistant_reply ? { assistant_reply: structuredClone(caller.assistant_reply) } : {}),
    ...(caller.original_input ? { original_input: structuredClone(caller.original_input) } : {}),
  });
  if (caller.signal) followSignal(view, caller.signal);
  return view;
}

/**
 * The view's own signal, which follows the Runtime's: made the first time it is read, and the plugin may set it like any field.
 * Each one stays a dependant of the long-lived signal it follows until it is collected, and Node walks all of them as each is
 * (a directory pass hands one to every action's availability check), so a callback that never reads it costs nothing.
 */
function followSignal(view: ActionCallContext, source: AbortSignal): void {
  let own: { readonly signal: AbortSignal | undefined } | undefined;
  Object.defineProperty(view, "signal", { configurable: true, enumerable: true,
    get: () => (own ??= { signal: AbortSignal.any([source]) }).signal, set: (signal?: AbortSignal) => { own = { signal }; } });
}

/**
 * The caller an availability check runs its scope with: only what the Host issues is taken off. Plugin code never sees this one
 * (`pluginActionAvailability` and a scene's own check hand it a `pluginCallbackContext` of its own), and every row of a directory
 * passes here, so nothing else is copied.
 */
export function withoutIssuedIdentity<C extends ActionCallContext>(caller: C): C {
  return dropIssuedIdentity({ ...caller });
}

function dropIssuedIdentity<C extends ActionCallContext>(view: C): C {
  Reflect.deleteProperty(view, "host_plugin");
  Reflect.deleteProperty(view, "stage_scene_metadata");
  // The Host's own list of projects the person may reach (PG-014) is set by `pluginActionProvider` after this; what a caller carried in is not.
  Reflect.deleteProperty(view, "readable_project_ids");
  // Likewise the calling plugin's name: `pluginActionProvider` sets it from the issued caller after this, never from what the call carried.
  Reflect.deleteProperty(view, "calling_plugin_id");
  return view;
}
